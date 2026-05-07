import * as THREE from 'three';

const POOL_SIZE = 300;

// Shared geometries & materials — created once, reused by all particles.
const GEO = new THREE.SphereGeometry(0.07, 4, 3);
const MATS = {
  fire:  new THREE.MeshBasicMaterial({ color: 0xff7700 }),
  spark: new THREE.MeshBasicMaterial({ color: 0xffee22 }),
  blood: new THREE.MeshBasicMaterial({ color: 0xcc1111 }),
  acid:  new THREE.MeshBasicMaterial({ color: 0x99ee22 }),
  smoke: new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0.5, depthWrite: false }),
};

export class ParticleSystem {
  constructor(scene) {
    this._scene = scene;
    this._active = [];   // [{mesh, vx,vy,vz, life, maxLife, initScale}]
    this._pool   = [];   // recycled meshes

    for (let i = 0; i < POOL_SIZE; i++) {
      const m = new THREE.Mesh(GEO, MATS.spark);
      m.visible = false;
      scene.add(m);
      this._pool.push(m);
    }
  }

  // ── Public effects ──────────────────────────────────────────────────────────

  muzzleFlash(x, z, angle, weapon = 'pistol') {
    const BARREL_TIP = { pistol: 0.54, shotgun: 0.76, ak47: 0.92, sniper: 0.88 };
    const dist = BARREL_TIP[weapon] ?? 0.54;
    const fx = Math.sin(angle), fz = Math.cos(angle);
    const mx = x + fx * dist, mz = z + fz * dist;
    const count = weapon === 'shotgun' ? 10 : weapon === 'ak47' ? 4 : 6;
    for (let i = 0; i < count; i++) {
      const sp = 5 + Math.random() * 6;
      this._spawn(mx, 1.05, mz, 'fire',
        fx * sp + (Math.random() - 0.5) * 2.5, 0.5 + Math.random() * 1.0, fz * sp + (Math.random() - 0.5) * 2.5,
        0.04 + Math.random() * 0.05, 0.3 + Math.random() * 0.5);
    }
    const smokeCount = weapon === 'shotgun' ? 3 : 1;
    for (let i = 0; i < smokeCount; i++) {
      this._spawn(mx, 1.05, mz, 'smoke',
        (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6,
        0.25 + Math.random() * 0.25, 1.0 + Math.random() * 0.5);
    }
  }

  hitSpark(x, z) { this._burst(x, 1.0, z, 'spark', 7, 4, 0.2); }

  enemyDeath(x, z, type) {
    const mat = type === 'spitter' ? 'acid' : 'blood';
    this._burst(x, 0.5, z, mat, 18, 6, 0.5);
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      this._spawn(x + (Math.random() - 0.5) * 0.4, 0.3, z + (Math.random() - 0.5) * 0.4, 'smoke',
        Math.sin(a) * 0.4, 1.5 + Math.random(), Math.cos(a) * 0.4,
        0.5 + Math.random() * 0.5, 2.0);
    }
  }

  bossDeath(x, z) {
    this._burst(x, 0.8, z, 'fire',  28, 8, 0.8);
    this._burst(x, 0.8, z, 'smoke', 12, 4, 1.0);
  }

  acidSplat(x, z) { this._burst(x, 0.8, z, 'acid', 10, 4, 0.3); }

  playerHurt(x, z) { this._burst(x, 1.0, z, 'blood', 8, 4, 0.2); }

  // ── Update — call every frame with delta-time in seconds ───────────────────

  update(dt) {
    for (let i = this._active.length - 1; i >= 0; i--) {
      const p = this._active[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this._pool.push(p.mesh);
        this._active.splice(i, 1);
        continue;
      }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy -= 9.8 * dt;
      const t = p.life / p.maxLife;
      p.mesh.scale.setScalar(Math.max(p.initScale * t, 0.02));
      if (p.mesh.material.transparent) p.mesh.material.opacity = t * 0.5;
    }
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _spawn(x, y, z, mat, vx, vy, vz, life, scale) {
    const mesh = this._pool.pop();
    if (!mesh) return;
    mesh.material  = MATS[mat] ?? MATS.spark;
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(scale);
    mesh.visible = true;
    this._active.push({ mesh, vx, vy, vz, life, maxLife: life, initScale: scale });
  }

  _burst(x, y, z, mat, count, speed, spread) {
    for (let i = 0; i < count; i++) {
      const a  = Math.random() * Math.PI * 2;
      const sv = (0.4 + Math.random() * 0.6) * speed;
      this._spawn(
        x + (Math.random() - 0.5) * spread,
        y,
        z + (Math.random() - 0.5) * spread,
        mat,
        Math.sin(a) * sv, 1.5 + Math.random() * 2.5, Math.cos(a) * sv,
        0.25 + Math.random() * 0.3,
        0.4 + Math.random() * 0.8
      );
    }
  }
}
