import * as THREE from 'three';
import {
  PLAYER_SPEED, PLAYER_MAX_HP,
  BULLET_SPEED, BULLET_RANGE, FIRE_RATE,
  AMMO_MAX, RELOAD_TIME, MAP_HALF
} from './constants.js';

function makeVoxelCharacter(bodyColor, headColor = 0xf5c59a) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor, emissive: bodyColor, emissiveIntensity: 0.8 });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xf5c59a, emissive: 0xf5c59a, emissiveIntensity: 0.7 });
  const pantMat = new THREE.MeshLambertMaterial({ color: 0x4466aa, emissive: 0x4466aa, emissiveIntensity: 0.6 });

  // Legs — pentagonal low-poly cylinders
  const legGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.45, 5);
  const legL = new THREE.Mesh(legGeo, pantMat); legL.position.set(-0.13, 0.225, 0);
  const legR = new THREE.Mesh(legGeo, pantMat); legR.position.set( 0.13, 0.225, 0);

  // Body — tapered hex cylinder (wider at shoulders)
  const bodyGeo = new THREE.CylinderGeometry(0.27, 0.22, 0.55, 6);
  const body    = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.45 + 0.275;

  // Arms — extended forward in weapon-holding pose
  const armGeo = new THREE.CylinderGeometry(0.065, 0.08, 0.40, 5);
  const armR = new THREE.Mesh(armGeo, skinMat);
  armR.position.set(0.19, 0.84, 0.10);
  armR.rotation.set(-1.10, 0, 0.26);

  const armL = new THREE.Mesh(armGeo, skinMat);
  armL.position.set(-0.13, 0.84, 0.26);
  armL.rotation.set(-1.28, 0, -0.18);

  // Weapon (AR-style rifle) — centered and extending forward
  const gunMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a, emissive: 0x0d0d0d, emissiveIntensity: 0.5 });

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.070, 0.065, 0.44), gunMat);
  receiver.position.set(0, 0.82, 0.32);

  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.032, 0.26), gunMat);
  barrel.position.set(0, 0.84, 0.60);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.050, 0.090, 0.14), gunMat);
  stock.position.set(0, 0.79, 0.07);

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.10, 0.056), gunMat);
  mag.position.set(0, 0.74, 0.27);

  // Hands on weapon
  const handGeo = new THREE.BoxGeometry(0.09, 0.10, 0.09);
  const handR = new THREE.Mesh(handGeo, skinMat); // pistol grip
  handR.position.set(0.03, 0.77, 0.21);
  const handL = new THREE.Mesh(handGeo, skinMat); // foregrip
  handL.position.set(0.03, 0.82, 0.46);

  // Head — low-poly sphere
  const headGeo = new THREE.SphereGeometry(0.25, 6, 5);
  const head    = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 0.45 + 0.55 + 0.27;

  // Cap — hex cylinder on top of head
  const capGeo = new THREE.CylinderGeometry(0.21, 0.26, 0.15, 6);
  const cap    = new THREE.Mesh(capGeo, bodyMat);
  cap.position.y = 0.45 + 0.55 + 0.27 + 0.25 + 0.075;

  // Cap brim — flat box protruding forward
  const brimGeo = new THREE.BoxGeometry(0.56, 0.05, 0.28);
  const brim    = new THREE.Mesh(brimGeo, bodyMat);
  brim.position.set(0, 0.45 + 0.55 + 0.27 + 0.18, 0.20);

  [legL, legR, body, armL, armR, head, cap, brim, receiver, barrel, stock, mag, handR, handL].forEach(m => {
    m.castShadow = true;
    group.add(m);
  });

  group.legL = legL;
  group.legR = legR;
  group.armL = armL;
  group.armR = armR;
  group.handL = handL;
  group.handR = handR;

  return group;
}

const _bulletGeo = new THREE.SphereGeometry(0.072, 5, 5);
const _bulletMat = new THREE.MeshLambertMaterial({ color: 0xffee00, emissive: 0xffaa00, emissiveIntensity: 1 });

export class Player {
  constructor(scene, bodyColor = 0x2266cc) {
    this.hp       = PLAYER_MAX_HP;
    this.maxHp    = PLAYER_MAX_HP;
    this.ammo     = AMMO_MAX;
    this.maxAmmo  = AMMO_MAX;
    this.alive    = true;
    this.bullets  = [];

    this._scene       = scene;
    this._shootTimer  = 0;
    this._reloading   = false;
    this._walkTime    = 0;
    this._recoilTimer = 0;
    this._reloadTimer = 0;
    this.onReloadProgress = null; // callback(0..1)

    this.group = makeVoxelCharacter(bodyColor);
    this.group.position.set(0, 0, 5);
    scene.add(this.group);

    // Muzzle flash light (hidden until shot)
    this._flash = new THREE.PointLight(0xff9900, 0, 2.5);
    this.group.add(this._flash);
    this._flash.position.set(0, 0.84, 0.76);
  }

  getAimDirection(camera, screenX, screenY) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
      (screenX / window.innerWidth)  * 2 - 1,
      -(screenY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const worldTarget = new THREE.Vector3();
    raycaster.ray.intersectPlane(groundPlane, worldTarget);
    return worldTarget;
  }

  update(dt, input, camera) {
    if (!this.alive) return;

    // ── Movement ──
    let dx = 0, dz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp'))    dz -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown'))  dz += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft'))  dx -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) dx += 1;
    const moving = dx !== 0 || dz !== 0;
    if (moving) {
      const len = Math.sqrt(dx * dx + dz * dz);
      this.group.position.x = Math.max(-MAP_HALF, Math.min(MAP_HALF, this.group.position.x + (dx / len) * PLAYER_SPEED * dt));
      this.group.position.z = Math.max(-MAP_HALF, Math.min(MAP_HALF, this.group.position.z + (dz / len) * PLAYER_SPEED * dt));
      this._walkTime += dt * 9;
    } else {
      this._walkTime *= 0.85;
    }
    const ws = Math.sin(this._walkTime);
    this.group.legL.rotation.x =  ws * 0.5;
    this.group.legR.rotation.x = -ws * 0.5;
    // Arms barely swing — locked forward on the weapon
    this.group.armL.rotation.x = -1.28 + ws * 0.08;
    this.group.armR.rotation.x = -1.10 + ws * 0.08;

    // ── Aim ──
    const worldTarget = this.getAimDirection(camera, input.mouseX, input.mouseY);
    const aimDx = worldTarget.x - this.group.position.x;
    const aimDz = worldTarget.z - this.group.position.z;
    this.group.rotation.y = Math.atan2(aimDx, aimDz);

    // ── Reload ──
    if (this._reloading) {
      this._reloadTimer += dt;
      if (this.onReloadProgress) this.onReloadProgress(this._reloadTimer / RELOAD_TIME);
      if (this._reloadTimer >= RELOAD_TIME) {
        this.ammo      = AMMO_MAX;
        this._reloading   = false;
        this._reloadTimer = 0;
        if (this.onReloadProgress) this.onReloadProgress(-1); // done
      }
    }

    if (input.consumeReload() && !this._reloading && this.ammo < AMMO_MAX) {
      this._reloading   = true;
      this._reloadTimer = 0;
    }

    // ── Shoot ──
    this._shootTimer -= dt;
    this._recoilTimer = Math.max(0, this._recoilTimer - dt);
    if (input.lmb && !this._reloading && this._shootTimer <= 0 && this.ammo > 0) {
      this._shootTimer = FIRE_RATE;
      this._recoilTimer = 0.12;
      this.ammo--;
      this._shoot(aimDx, aimDz);
      if (this.ammo === 0) {
        this._reloading   = true;
        this._reloadTimer = 0;
      }
    }
    // recoil: both arms kick back
    const recoilAngle = (this._recoilTimer / 0.12) * 0.7;
    this.group.armR.rotation.x -= recoilAngle;
    this.group.armL.rotation.x -= recoilAngle;

    // ── Bullet update ──
    this._flash.intensity *= 0.75; // decay flash
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.mesh.position.x += b.dx * BULLET_SPEED * dt;
      b.mesh.position.z += b.dz * BULLET_SPEED * dt;
      b.dist += BULLET_SPEED * dt;
      if (b.dist >= BULLET_RANGE || b.hit) {
        this._scene.remove(b.mesh);
        this.bullets.splice(i, 1);
      }
    }
  }

  _shoot(aimDx, aimDz) {
    const len = Math.sqrt(aimDx * aimDx + aimDz * aimDz);
    if (len < 0.01) return;
    const mesh = new THREE.Mesh(_bulletGeo, _bulletMat);
    mesh.position.copy(this.group.position);
    mesh.position.y = 1.1;
    this._scene.add(mesh);
    this.bullets.push({ mesh, dx: aimDx / len, dz: aimDz / len, dist: 0, hit: false });
    this._flash.intensity = 4;
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp === 0) this.alive = false;
  }

  get position() { return this.group.position; }
  get reloading() { return this._reloading; }
  get reloadProgress() { return this._reloadTimer / RELOAD_TIME; }

  dispose() {
    this._scene.remove(this.group);
    this.bullets.forEach(b => this._scene.remove(b.mesh));
    this.bullets = [];
  }
}
