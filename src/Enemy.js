import * as THREE from 'three';
import { ENEMY_SPEED, ENEMY_HP } from './constants.js';

const ZOMBIE_PALETTES = [
  { body: 0x558844, head: 0x88bb66 }, // green zombie
  { body: 0x667755, head: 0x99aa77 }, // olive zombie
  { body: 0x446633, head: 0x77aa55 }, // dark green
];

const _bloodGeo  = new THREE.SphereGeometry(0.08, 5, 5);
const _bloodMat  = new THREE.MeshLambertMaterial({ color: 0xcc1111 });

function makeZombieVoxel(palette) {
  const group = new THREE.Group();
  const bMat  = new THREE.MeshLambertMaterial({ color: palette.body, emissive: palette.body, emissiveIntensity: 0.1 });
  const hMat  = new THREE.MeshLambertMaterial({ color: palette.head, emissive: palette.head, emissiveIntensity: 0.1 });
  const pMat  = new THREE.MeshLambertMaterial({ color: 0x556644 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.42, 0.21), pMat);
  legL.position.set(-0.12, 0.21, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.42, 0.21), pMat);
  legR.position.set( 0.12, 0.21, 0);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.52, 0.30), bMat);
  body.position.y = 0.42 + 0.26;

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), hMat);
  head.position.y = 0.42 + 0.52 + 0.24;

  [legL, legR, body, head].forEach(m => { m.castShadow = true; group.add(m); });
  return group;
}

export class Enemy {
  constructor(scene, x, z) {
    this.hp     = ENEMY_HP;
    this.isDead = false;
    this._scene = scene;
    this._walkTime = Math.random() * Math.PI * 2; // offset for leg anim

    const palette = ZOMBIE_PALETTES[Math.floor(Math.random() * ZOMBIE_PALETTES.length)];
    this.group = makeZombieVoxel(palette);
    this.group.position.set(x, 0, z);
    scene.add(this.group);
  }

  update(dt, playerPos) {
    if (this.isDead) return 9999;

    const dx   = playerPos.x - this.group.position.x;
    const dz   = playerPos.z - this.group.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0.05) {
      this.group.rotation.y = Math.atan2(dx, dz);
    }

    if (dist > 0.9) {
      this.group.position.x += (dx / dist) * ENEMY_SPEED * dt;
      this.group.position.z += (dz / dist) * ENEMY_SPEED * dt;
      // Simple waddle animation
      this._walkTime += dt * 8;
      this.group.rotation.z = Math.sin(this._walkTime) * 0.06;
    }

    return dist;
  }

  hit(damage = 1) {
    if (this.isDead) return;
    this.hp -= damage;
    this._spawnBlood();
    if (this.hp <= 0) this._die();
  }

  _spawnBlood() {
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(_bloodGeo, _bloodMat);
      b.position.copy(this.group.position);
      b.position.y = 1.0 + Math.random() * 0.5;
      b.position.x += (Math.random() - 0.5) * 0.6;
      b.position.z += (Math.random() - 0.5) * 0.6;
      this._scene.add(b);
      setTimeout(() => this._scene.remove(b), 600);
    }
  }

  _die() {
    this.isDead = true;
    // Collapse sideways
    this.group.rotation.x = Math.PI / 2;
    this.group.position.y = -0.25;
    setTimeout(() => { this._scene.remove(this.group); }, 1200);
  }

  get position() { return this.group.position; }

  dispose() { this._scene.remove(this.group); }
}
