import * as THREE from 'three';

const POOL_SIZE  = 24;
const DURATION   = 0.75;  // seconds
const RISE_SPEED = 2.8;   // world units / sec
const SPRITE_W   = 1.6;
const SPRITE_H   = 0.8;
const CVS_W      = 128;
const CVS_H      = 64;

function damageColor(dmg) {
  if (dmg >= 60) return '#ff4400';
  if (dmg >= 25) return '#ffcc00';
  return '#ffffff';
}

export class DamageNumbers {
  constructor(scene) {
    this._scene  = scene;
    this._active = [];
    this._pool   = [];

    for (let i = 0; i < POOL_SIZE; i++) {
      const canvas  = document.createElement('canvas');
      canvas.width  = CVS_W;
      canvas.height = CVS_H;
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const spr = new THREE.Sprite(mat);
      spr.scale.set(SPRITE_W, SPRITE_H, 1);
      spr.visible = false;
      scene.add(spr);
      this._pool.push({ spr, canvas, tex });
    }
  }

  spawn(x, z, damage) {
    const entry = this._pool.pop();
    if (!entry) return;

    const { spr, canvas, tex } = entry;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CVS_W, CVS_H);
    ctx.font         = 'bold 44px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = damageColor(damage);
    ctx.strokeStyle  = 'rgba(0,0,0,0.7)';
    ctx.lineWidth    = 5;
    ctx.strokeText(String(damage), CVS_W / 2, CVS_H / 2);
    ctx.fillText(String(damage), CVS_W / 2, CVS_H / 2);
    tex.needsUpdate  = true;

    spr.position.set(x + (Math.random() - 0.5) * 0.4, 2.2, z);
    spr.material.opacity = 1;
    spr.visible = true;
    this._active.push({ spr, tex, canvas, life: DURATION });
  }

  update(dt) {
    for (let i = this._active.length - 1; i >= 0; i--) {
      const e = this._active[i];
      e.life -= dt;
      if (e.life <= 0) {
        e.spr.visible = false;
        this._pool.push({ spr: e.spr, canvas: e.canvas, tex: e.tex });
        this._active.splice(i, 1);
        continue;
      }
      e.spr.position.y += RISE_SPEED * dt;
      e.spr.material.opacity = Math.max(0, e.life / DURATION);
    }
  }
}
