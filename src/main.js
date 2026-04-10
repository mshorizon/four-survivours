import * as THREE from 'three';
import { NetworkManager } from './net/NetworkManager.js';
import { Interpolator }   from './net/Interpolator.js';
import { InputHandler }   from './InputHandler.js';
import { buildMap }       from './GameWorld.js';
import { AudioManager }   from './audio/AudioManager.js';
import { ParticleSystem } from './vfx/ParticleSystem.js';
import {
  PLAYER_COLORS, PLAYER_MAX_HP, WEAPONS, MAP_HALF, WAVE_SAFE_DELAY,
  SKIN_COLORS, OUTFIT_COLORS, HAT_TYPES, DEFAULT_APPEARANCE,
  BOSS_SLAM_RADIUS,
  GRENADE_RADIUS,
} from '../shared/constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Renderer + Scene + Camera
// ─────────────────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.BasicShadowMap;
renderer.domElement.id     = 'game-canvas';
document.body.insertBefore(renderer.domElement, document.getElementById('hud'));

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2a);

const camera     = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
const CAM_OFFSET = new THREE.Vector3(0, 18, 14);
camera.position.copy(CAM_OFFSET);
camera.lookAt(0, 0, 0);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 1.4));
const sun = new THREE.DirectionalLight(0xffeedd, 1.0);
sun.position.set(5, 20, 18); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
sun.shadow.camera.left = -35; sun.shadow.camera.right = 35;
sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -35;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0x8899cc, 0.4);
fill.position.set(-8, 10, -10);
scene.add(fill);

// ─────────────────────────────────────────────────────────────────────────────
// Audio + VFX
// ─────────────────────────────────────────────────────────────────────────────
const audio = new AudioManager();
const vfx   = new ParticleSystem(scene);

// Unlock AudioContext on first user gesture
document.addEventListener('pointerdown', () => audio.init(), { once: true });
document.addEventListener('keydown',     () => audio.init(), { once: true });

// ─────────────────────────────────────────────────────────────────────────────
// Map group — rebuilt on each game start
// ─────────────────────────────────────────────────────────────────────────────
let mapGroup   = null;
let fireLights = [];

function loadMap(mapId) {
  if (mapGroup) { scene.remove(mapGroup); mapGroup = null; }
  mapGroup = new THREE.Group();
  scene.add(mapGroup);
  const result = buildMap(mapGroup, mapId);
  fireLights = result.fireLights ?? [];
  scene.background = new THREE.Color(result.fogColor ?? 0x3a3a4e);
  scene.fog = new THREE.Fog(result.fogColor ?? 0x3a3a4e, result.fogNear ?? 35, result.fogFar ?? 90);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mesh factories
// ─────────────────────────────────────────────────────────────────────────────
function makePlayerMesh(slotColor, appearance = {}) {
  const { skin = 0, outfit = 0, hat = 'cap' } = appearance;
  const outfitCol = OUTFIT_COLORS[outfit] ?? slotColor;
  const skinCol   = SKIN_COLORS[skin]   ?? 0xf5c59a;
  const g    = new THREE.Group();
  const bMat = new THREE.MeshLambertMaterial({ color: outfitCol, emissive: outfitCol, emissiveIntensity: 0.12 });
  const sMat = new THREE.MeshLambertMaterial({ color: skinCol });
  const pMat = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.20,0.45,0.22), pMat); legL.position.set(-0.13,0.225,0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.20,0.45,0.22), pMat); legR.position.set( 0.13,0.225,0);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52,0.55,0.32), bMat); body.position.y = 0.725;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.48,0.48,0.48), sMat); head.position.y = 1.26;
  [legL,legR,body,head].forEach(m => { m.castShadow = true; g.add(m); });
  // Hat
  if (hat === 'cap') {
    const cap  = new THREE.Mesh(new THREE.BoxGeometry(0.50,0.14,0.50), bMat); cap.position.y = 1.595; g.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.62,0.06,0.32), bMat); brim.position.set(0,1.575,0.22); g.add(brim);
  } else if (hat === 'helmet') {
    const hm = new THREE.Mesh(new THREE.BoxGeometry(0.54,0.22,0.54), bMat); hm.position.y = 1.60; g.add(hm);
  } else if (hat === 'beanie') {
    const bn = new THREE.Mesh(new THREE.BoxGeometry(0.50,0.30,0.50), bMat); bn.position.y = 1.64; g.add(bn);
  }
  return g;
}

function makeBossMesh() {
  const g    = new THREE.Group();
  const bMat = new THREE.MeshLambertMaterial({ color: 0x1a1010, emissive: 0xff0000, emissiveIntensity: 0.18 });
  const eMat = new THREE.MeshLambertMaterial({ color: 0xff2200, emissive: 0xff0000, emissiveIntensity: 1.0 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.45,1.2,0.5),  bMat); legL.position.set(-0.35,0.6,0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.45,1.2,0.5),  bMat); legR.position.set( 0.35,0.6,0);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4,0.8),  bMat); body.position.y = 1.4;
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0,0.9),  bMat); head.position.y = 2.6;
  [legL,legR,body,head].forEach(m => { m.castShadow = true; g.add(m); });
  // Glowing eyes
  [-0.28, 0.28].forEach(x => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.2,0.2,0.1), eMat);
    eye.position.set(x, 2.65, 0.46); g.add(eye);
  });
  // Shoulder spikes
  [-0.9, 0.9].forEach(x => {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.2,0.9,6), bMat);
    spike.position.set(x, 2.1, 0); spike.rotation.z = x > 0 ? -0.35 : 0.35; g.add(spike);
  });
  return g;
}

const ENEMY_PALETTES = {
  walker:  [{ b:0x558844, h:0x88bb66 },{ b:0x446633, h:0x77aa55 }],
  runner:  [{ b:0x443355, h:0x776699 },{ b:0x332244, h:0x664488 }],
  spitter: [{ b:0x887722, h:0xbbaa33 },{ b:0x998833, h:0xccbb44 }],
  tank:    [{ b:0x2a2a2a, h:0x444444 },{ b:0x1a1a1a, h:0x333333 }],
};
function makeEnemyMesh(type = 'walker') {
  if (type === 'boss')      return makeBossMesh();
  if (type === 'finalboss') return makeFinalBossMesh();
  const g   = new THREE.Group();
  const pal = (ENEMY_PALETTES[type] ?? ENEMY_PALETTES.walker)[Math.floor(Math.random()*2)];
  const bMat = new THREE.MeshLambertMaterial({ color: pal.b });
  const hMat = new THREE.MeshLambertMaterial({ color: pal.h });
  const pMat = new THREE.MeshLambertMaterial({ color: 0x445533 });

  const scale = type === 'tank' ? 1.6 : type === 'runner' ? 0.75 : 1.0;

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.19,0.42,0.21), pMat); legL.position.set(-0.12,0.21,0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.19,0.42,0.21), pMat); legR.position.set( 0.12,0.21,0);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.48,0.52,0.30), bMat); body.position.y = 0.68;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44,0.44,0.44), hMat); head.position.y = 1.16;
  [legL,legR,body,head].forEach(m => { m.castShadow = true; g.add(m); });

  // Spitter: acid sac on back
  if (type === 'spitter') {
    const sacMat = new THREE.MeshLambertMaterial({ color: 0xaacc22, emissive: 0x88aa11, emissiveIntensity: 0.6 });
    const sac = new THREE.Mesh(new THREE.SphereGeometry(0.22,6,5), sacMat);
    sac.position.set(0, 0.72, -0.22); g.add(sac);
  }
  // Tank: shoulder pads
  if (type === 'tank') {
    const padMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    [-0.42, 0.42].forEach(x => {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.28,0.35), padMat);
      pad.position.set(x, 0.80, 0); g.add(pad);
    });
  }

  g.scale.setScalar(scale);
  return g;
}

const _bulletGeo = new THREE.SphereGeometry(0.09,5,5);
const _bulletMat = new THREE.MeshBasicMaterial({ color: 0xffee00 });
function makeBulletMesh() { return new THREE.Mesh(_bulletGeo, _bulletMat); }

const _acidGeo = new THREE.SphereGeometry(0.14,5,4);
const _acidMat = new THREE.MeshBasicMaterial({ color: 0x88ee22 });
function makeAcidMesh() { return new THREE.Mesh(_acidGeo, _acidMat); }

const _hpGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const _hpMat = new THREE.MeshLambertMaterial({ color: 0xff3333, emissive: 0xff1111, emissiveIntensity: 0.5 });
const _hpCrossMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8 });
function makeHealthpackMesh() {
  const g    = new THREE.Group();
  const box  = new THREE.Mesh(_hpGeo, _hpMat); g.add(box);
  const h    = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.08), _hpCrossMat); g.add(h);
  const v    = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.3), _hpCrossMat); g.add(v);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 16), glowMat);
  ring.rotation.x = -Math.PI/2; ring.position.y = -0.4; g.add(ring);
  g.position.y = 0.5;
  return g;
}

// Grenade pickup mesh
const _grenGeo = new THREE.SphereGeometry(0.16, 6, 5);
const _grenMat = new THREE.MeshLambertMaterial({ color: 0x445522, emissive: 0x88aa22, emissiveIntensity: 0.5 });
function makeGrenadeMesh() { return new THREE.Mesh(_grenGeo, _grenMat); }

function makeFinalBossMesh() {
  const g    = new THREE.Group();
  const bMat = new THREE.MeshLambertMaterial({ color: 0x0a0010, emissive: 0x8800ff, emissiveIntensity: 0.3 });
  const eMat = new THREE.MeshLambertMaterial({ color: 0xaa00ff, emissive: 0xaa00ff, emissiveIntensity: 1.2 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.55,1.4,0.6), bMat); legL.position.set(-0.42,0.7,0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.55,1.4,0.6), bMat); legR.position.set( 0.42,0.7,0);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5,1.7,1.0), bMat); body.position.y = 1.75;
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.3,1.3,1.1), bMat); head.position.y = 3.2;
  [legL,legR,body,head].forEach(m => { m.castShadow = true; g.add(m); });
  [-0.36, 0.36].forEach(x => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.28,0.1), eMat);
    eye.position.set(x, 3.28, 0.56); g.add(eye);
  });
  [-1.1, 1.1].forEach((x, i) => {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.28,1.2,6), bMat);
    spike.position.set(x, 2.7, 0); spike.rotation.z = i === 0 ? 0.4 : -0.4; g.add(spike);
  });
  const crownMat = new THREE.MeshBasicMaterial({ color: 0xaa00ff });
  for (let a = 0; a < 6; a++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12,0.5,5), crownMat);
    spike.position.set(Math.cos(a/6*Math.PI*2)*0.55, 3.85, Math.sin(a/6*Math.PI*2)*0.55); g.add(spike);
  }
  return g;
}

const PICKUP_COLORS = { shotgun: 0xff6600, rifle: 0x4488ff, pistol: 0xffdd44 };
function makePickupMesh(weapon) {
  const g    = new THREE.Group();
  const col  = PICKUP_COLORS[weapon] ?? 0xffffff;
  const mat  = new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6,0.18,0.2), mat);
  const brl  = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.06,0.5), mat);
  brl.position.set(0.2,0,0.3);
  g.add(body, brl);
  g.position.y = 0.5;
  // glow ring
  const glowMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5,0.65,16), glowMat);
  ring.rotation.x = -Math.PI/2; ring.position.y = -0.4;
  g.add(ring);
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity maps
// ─────────────────────────────────────────────────────────────────────────────
const playerMeshes    = new Map();
const enemyMeshes     = new Map();
const bulletMeshes    = new Map();
const acidMeshes      = new Map();
const pickupMeshes    = new Map();
const healthpackMeshes = new Map();
const grenadeMeshes   = new Map();

function syncPlayers(players) {
  const seen = new Set();
  for (const p of players) {
    seen.add(p.id);
    const apKey = JSON.stringify(p.appearance);
    if (!playerMeshes.has(p.id)) {
      const mesh = makePlayerMesh(PLAYER_COLORS[p.slot] ?? 0xffffff, p.appearance);
      scene.add(mesh);
      playerMeshes.set(p.id, { mesh, apKey });
    } else {
      const ent = playerMeshes.get(p.id);
      // Rebuild mesh if appearance changed
      if (p.appearance && ent.apKey !== apKey) {
        scene.remove(ent.mesh);
        const mesh = makePlayerMesh(PLAYER_COLORS[p.slot] ?? 0xffffff, p.appearance);
        scene.add(mesh);
        playerMeshes.set(p.id, { mesh, apKey });
      }
    }
    const { mesh } = playerMeshes.get(p.id);
    mesh.position.set(p.x, 0, p.z);
    mesh.rotation.y = p.angle;
    mesh.visible    = p.alive;
  }
  for (const [id, { mesh }] of playerMeshes)
    if (!seen.has(id)) { scene.remove(mesh); playerMeshes.delete(id); }
}

function syncEnemies(enemies) {
  const seen = new Set();
  for (const e of enemies) {
    seen.add(e.id);
    if (!enemyMeshes.has(e.id)) {
      const mesh = makeEnemyMesh(e.type);
      scene.add(mesh);
      enemyMeshes.set(e.id, { mesh, walk: Math.random()*Math.PI*2, dying: false });
    }
    const ent = enemyMeshes.get(e.id);
    if (ent.dying) continue;
    ent.walk += 0.13;
    ent.mesh.position.set(e.x, 0, e.z);
    ent.mesh.rotation.y = e.angle;
    ent.mesh.rotation.z = Math.sin(ent.walk) * 0.06;
  }
  for (const [id, ent] of enemyMeshes) {
    if (!seen.has(id) && !ent.dying) {
      ent.dying = true;
      ent.mesh.rotation.x = Math.PI/2; ent.mesh.position.y = -0.25;
      setTimeout(() => { scene.remove(ent.mesh); enemyMeshes.delete(id); }, 900);
    }
  }
}

function syncBullets(bullets) {
  const seen = new Set();
  for (const b of bullets) {
    seen.add(b.id);
    if (!bulletMeshes.has(b.id)) {
      const mesh = makeBulletMesh(); mesh.position.set(b.x,1.1,b.z);
      scene.add(mesh); bulletMeshes.set(b.id, mesh);
    } else { bulletMeshes.get(b.id).position.set(b.x,1.1,b.z); }
  }
  for (const [id, mesh] of bulletMeshes)
    if (!seen.has(id)) { scene.remove(mesh); bulletMeshes.delete(id); }
}

function syncAcidBlobs(blobs) {
  const seen = new Set();
  for (const b of blobs) {
    seen.add(b.id);
    if (!acidMeshes.has(b.id)) {
      const mesh = makeAcidMesh(); mesh.position.set(b.x,1.0,b.z);
      scene.add(mesh); acidMeshes.set(b.id, mesh);
    } else { acidMeshes.get(b.id).position.set(b.x,1.0,b.z); }
  }
  for (const [id, mesh] of acidMeshes)
    if (!seen.has(id)) { scene.remove(mesh); acidMeshes.delete(id); }
}

function syncHealthpacks(hpacks, now) {
  for (const h of hpacks) {
    if (!healthpackMeshes.has(h.id)) {
      const mesh = makeHealthpackMesh();
      mesh.position.set(h.x, 0, h.z);
      scene.add(mesh);
      healthpackMeshes.set(h.id, mesh);
    }
    const mesh = healthpackMeshes.get(h.id);
    mesh.visible = h.active;
    if (h.active) { mesh.rotation.y = now * 0.0015; mesh.position.y = 0.5 + Math.sin(now * 0.003) * 0.1; }
  }
}

function syncGrenades(grenades) {
  const seen = new Set();
  for (const g of grenades) {
    seen.add(g.id);
    if (!grenadeMeshes.has(g.id)) {
      const mesh = makeGrenadeMesh(); mesh.position.set(g.x, 0.8, g.z);
      scene.add(mesh); grenadeMeshes.set(g.id, mesh);
    } else { grenadeMeshes.get(g.id).position.set(g.x, 0.8, g.z); }
  }
  for (const [id, mesh] of grenadeMeshes)
    if (!seen.has(id)) { scene.remove(mesh); grenadeMeshes.delete(id); }
}

function syncPickups(pickups, now) {
  for (const pk of pickups) {
    if (!pickupMeshes.has(pk.id)) {
      const mesh = makePickupMesh(pk.weapon);
      mesh.position.set(pk.x, 0, pk.z);
      scene.add(mesh);
      pickupMeshes.set(pk.id, mesh);
    }
    const mesh = pickupMeshes.get(pk.id);
    mesh.visible = pk.active;
    if (pk.active) mesh.rotation.y = now * 0.001; // spin
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Boss slam rings (visual AOE indicator)
// ─────────────────────────────────────────────────────────────────────────────
const _slamRings = [];

// ─────────────────────────────────────────────────────────────────────────────
// State-diff tracking for audio + VFX triggers
// ─────────────────────────────────────────────────────────────────────────────
let _prevEnemyMap = new Map(); // id → {x,z,hp,type}
let _prevMyHp     = PLAYER_MAX_HP;
let _shootCdLocal = 0; // local cooldown to deduplicate muzzle flash

function applyEffects(state, dt) {
  const me = state.players?.find(p => p.id === net.playerId);

  // Muzzle flash + shoot sound — triggered locally to avoid interpolation lag
  if (me && me.alive && !me.reloading) {
    _shootCdLocal -= dt;
    const weapon = me.weapon ?? 'pistol';
    if (input.lmb && me.ammo > 0 && _shootCdLocal <= 0) {
      const fw = (WEAPONS[weapon]?.fireRate ?? 0.28);
      _shootCdLocal = fw;
      vfx.muzzleFlash(me.x, me.z, me.angle);
      audio.shoot(weapon);
    }
  }

  // Player hurt
  if (me && me.hp < _prevMyHp) {
    vfx.playerHurt(me.x, me.z);
    audio.playerHurt();
  }
  if (me) _prevMyHp = me.hp;

  // Enemy deaths + hit sparks (HP decrease)
  const curMap = new Map((state.enemies ?? []).map(e => [e.id, e]));
  for (const [id, prev] of _prevEnemyMap) {
    if (!curMap.has(id)) {
      if (prev.type === 'boss') vfx.bossDeath(prev.x, prev.z);
      else vfx.enemyDeath(prev.x, prev.z, prev.type);
      audio.enemyDeath();
    }
  }
  for (const e of (state.enemies ?? [])) {
    const prev = _prevEnemyMap.get(e.id);
    if (prev && e.hp < prev.hp) {
      vfx.hitSpark(e.x, e.z);
      audio.hit();
    }
  }
  _prevEnemyMap = curMap;

  // Acid splat when acid blobs disappear
  // (tracked implicitly via VFX; acid hit is handled by player hurt detection above)
}

// ─────────────────────────────────────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────────────────────────────────────
const input = new InputHandler();

function getMouseAngle() {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(
    (input.mouseX / innerWidth) * 2 - 1,
    -(input.mouseY / innerHeight) * 2 + 1
  ), camera);
  const plane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
  const target = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, target);
  const localPos = playerMeshes.get(net.playerId)?.mesh.position;
  if (!localPos) return 0;
  return Math.atan2(target.x - localPos.x, target.z - localPos.z);
}

// ─────────────────────────────────────────────────────────────────────────────
// Network
// ─────────────────────────────────────────────────────────────────────────────
const net    = new NetworkManager();
const interp = new Interpolator();
let   mySlot      = 0;
let   gameStarted = false;

const SERVER_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';
net.connect(SERVER_URL);

net.socket.on('gs', (state) => interp.push(state));
net.socket.on('connect',       () => { document.getElementById('lobby-status').textContent = 'Connected ✓ — click Join Game'; });
net.socket.on('connect_error', (e) => { document.getElementById('lobby-status').textContent = `Connection error: ${e.message}`; });
net.socket.on('disconnect',    () => { document.getElementById('lobby-status').textContent = 'Disconnected'; });

net.onJoined = ({ slot, roomId, token, reconnected }) => {
  mySlot = slot;
  if (token && roomId) localStorage.setItem('fsReconnect', JSON.stringify({ token, roomId }));
  if (!reconnected) {
    document.getElementById('lobby').style.display     = 'none';
    document.getElementById('room-wait').style.display = 'flex';
    document.getElementById('wait-room-code').textContent = `Room: ${roomId ?? '—'}`;
  }
};

// Auto-reconnect on connect if token stored
net.socket.on('connect', () => {
  const saved = (() => { try { return JSON.parse(localStorage.getItem('fsReconnect') ?? 'null'); } catch(_) { return null; } })();
  if (saved?.token && gameStarted === false) {
    net.tryReconnect(saved.token, saved.roomId);
  }
});

net.onRoomFull = () => { alert('Room is full (4/4). Try a different room code.'); };

net.socket.on('lobbyState', ({ players, readyCount, totalCount, voteCounts }) => {
  // Update vote counts on buttons
  if (voteCounts) {
    for (const [mapId, count] of Object.entries(voteCounts)) {
      const el = document.getElementById(`vote-count-${mapId}`);
      if (el) el.textContent = count;
    }
  }
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  for (const p of players) {
    const color = '#' + (PLAYER_COLORS[p.slot] ?? 0xffffff).toString(16).padStart(6,'0');
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `<div class="pw-avatar" style="background:${color}"></div>
      <div class="pw-name">${p.name}</div>
      <div class="pw-ready ${p.ready?'ready':'waiting'}">${p.ready?'READY':'WAITING'}</div>`;
    list.appendChild(row);
  }
  const txt = `${readyCount}/${totalCount} ready — waiting for all players...`;
  document.getElementById('wait-status').textContent    = txt;
  document.getElementById('go-wait-status').textContent = txt;
});

net.socket.on('gameStart', ({ wave, mapId }) => {
  document.getElementById('room-wait').style.display = 'none';
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('victory').style.display   = 'none';
  _isReady = false; _goReady = false; _vicReady = false;
  document.getElementById('ready-btn').textContent = 'Ready';
  document.getElementById('ready-btn').classList.remove('is-ready');
  document.getElementById('go-ready-btn').textContent = 'Play Again';
  document.getElementById('go-ready-btn').classList.remove('is-ready');
  loadMap(mapId);
  gameStarted    = true;
  _prevMyHp      = PLAYER_MAX_HP;
  _prevEnemyMap  = new Map();
  _shootCdLocal  = 0;
  audio.startAmbient?.(mapId);
  // Reset safe room UI
  const srEl = document.getElementById('safe-room-status');
  if (srEl) { srEl.classList.remove('open'); srEl.style.display = 'none'; }
  // Reset vote buttons for next lobby
  _myVote = null;
  document.querySelectorAll('.map-vote-btn').forEach(b => b.classList.remove('voted'));
  updateWaveHUD(wave);
  showMsg(`WAVE ${wave}`, '#ffdd44', 2200);
  // Clear entity maps for fresh game
  [playerMeshes, enemyMeshes, bulletMeshes, acidMeshes, pickupMeshes, healthpackMeshes].forEach(m => {
    m.forEach(v => scene.remove(v.mesh ?? v));
    m.clear();
  });
});

net.socket.on('gameOver', ({ wave, survivalTime, players }) => {
  gameStarted = false;
  document.getElementById('go-wave').textContent = wave;
  document.getElementById('go-time').textContent = _fmtTime(survivalTime);
  const list = document.getElementById('go-player-list');
  list.innerHTML = '';
  [...players].sort((a,b) => b.kills - a.kills).forEach(p => {
    const color = '#' + (PLAYER_COLORS[p.slot] ?? 0xffffff).toString(16).padStart(6,'0');
    const row = document.createElement('div');
    row.className = 'go-row';
    row.innerHTML = `<div class="go-avatar" style="background:${color}"></div>
      <div class="go-name">${p.name}</div><div class="go-kills">${p.kills} kills</div>`;
    list.appendChild(row);
  });
  document.getElementById('go-wait-status').textContent = 'Waiting for all players...';
  document.getElementById('game-over').style.display = 'flex';
});

net.onPlayerDied = ({ playerId }) => {
  if (playerId === net.playerId) { showMsg('YOU DIED', '#ff4444', 0); shakeCamera(0.5); }
};
net.onPlayerWon  = ({ name }) => { showMsg(`${name} reached the Safe House!`, '#44ff88', 4000); };
net.onNewWave    = ({ wave }) => { updateWaveHUD(wave); showMsg(`WAVE ${wave}`, '#ffdd44', 2200); audio.newWave(); };
net.onWaveClear  = ({ nextWave, delay }) => { showMsg(`WAVE CLEAR — Wave ${nextWave} in ${delay}s`, '#88ffaa', 3500); };

net.socket.on('bossSpawn', ({ wave }) => {
  showMsg(`⚠ BOSS INCOMING — WAVE ${wave}`, '#ff2200', 4000);
  audio.bossSpawn();
});

net.socket.on('bossSlam', ({ x, z, radius }) => {
  audio.bossSlam();
  showMsg('BOSS SLAM!', '#ff4400', 1200);
  // AOE ring that fades out
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.4, radius, 32),
    new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.08, z);
  scene.add(ring);
  _slamRings.push({ mesh: ring, life: 0.9, maxLife: 0.9 });
});

net.socket.on('playerSafe', ({ name }) => {
  showMsg(`${name} reached the safe room!`, '#44ff88', 2500);
});

net.socket.on('safeRoomOpen', () => {
  const el = document.getElementById('safe-room-status');
  if (el) { el.classList.add('open'); el.innerHTML = 'SAFE ROOM OPEN'; }
});

net.socket.on('mapComplete', ({ completedMap, nextMap }) => {
  showMsg(`MAP CLEAR! Loading ${nextMap}...`, '#ffdd44', 3500);
});

net.socket.on('healthpackPickup', ({ playerId }) => {
  if (playerId === net.playerId) { showMsg('+HEALTH PACK', '#ff8888', 1500); audio.pickup(); }
});

net.socket.on('weaponPickup', ({ playerId }) => {
  if (playerId === net.playerId) audio.pickup();
});

// ── Kill feed ─────────────────────────────────────────────────────────────────
const ENEMY_LABELS = { walker:'Walker', runner:'Runner', spitter:'Spitter', tank:'TANK', boss:'BOSS', finalboss:'FINAL BOSS' };
net.onKill = ({ name, slot, enemyType }) => {
  const feed = document.getElementById('kill-feed');
  if (!feed) return;
  const col = '#' + (PLAYER_COLORS[slot] ?? 0xffffff).toString(16).padStart(6,'0');
  const row = document.createElement('div');
  row.className = 'kf-row';
  row.innerHTML = `<span style="color:${col}">${name}</span> killed ${ENEMY_LABELS[enemyType] ?? enemyType}`;
  feed.appendChild(row);
  setTimeout(() => { row.style.opacity = '0'; setTimeout(() => row.remove(), 400); }, 3000);
  while (feed.children.length > 5) feed.removeChild(feed.firstChild);
};

// ── Grenade explosion ─────────────────────────────────────────────────────────
net.socket.on('grenadeExplode', ({ x, z, radius }) => {
  audio.grenadeExplode();
  shakeCamera(0.4);
  vfx.bossDeath(x, z); // reuse big explosion VFX
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.3, radius, 32),
    new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.08, z);
  scene.add(ring);
  _slamRings.push({ mesh: ring, life: 0.6, maxLife: 0.6 });
});

// ── Victory ──────────────────────────────────────────────────────────────────
net.onVictory = ({ wave, survivalTime, players }) => {
  gameStarted = false;
  document.getElementById('vic-wave').textContent = wave;
  document.getElementById('vic-time').textContent = _fmtTime(survivalTime);
  const list = document.getElementById('vic-player-list');
  list.innerHTML = '';
  [...players].sort((a,b) => b.kills - a.kills).forEach(p => {
    const color = '#' + (PLAYER_COLORS[p.slot] ?? 0xffffff).toString(16).padStart(6,'0');
    const row = document.createElement('div');
    row.className = 'go-row';
    row.innerHTML = `<div class="go-avatar" style="background:${color}"></div><div class="go-name">${p.name}</div><div class="go-kills">${p.kills} kills</div>`;
    list.appendChild(row);
  });
  document.getElementById('vic-wait-status').textContent = 'Waiting for all players...';
  document.getElementById('victory').style.display = 'flex';
  audio.victory();
};

// ── Reconnect ─────────────────────────────────────────────────────────────────
net.socket.on('reconnectFailed', () => {
  localStorage.removeItem('fsReconnect');
});

function _fmtTime(s) { const m = Math.floor(s/60); return m > 0 ? `${m}m ${s%60}s` : `${s}s`; }

// ─────────────────────────────────────────────────────────────────────────────
// Character appearance — build UI & persist to localStorage
// ─────────────────────────────────────────────────────────────────────────────
let _appearance = { ...DEFAULT_APPEARANCE };
try { Object.assign(_appearance, JSON.parse(localStorage.getItem('appearance') ?? '{}')); } catch(_) {}

function _saveAppearance() {
  localStorage.setItem('appearance', JSON.stringify(_appearance));
  if (net.connected && net.playerId) net.socket.emit('setAppearance', _appearance);
}

// Build skin swatches
const skinRow = document.getElementById('skin-swatches');
SKIN_COLORS.forEach((col, i) => {
  const sw = document.createElement('div');
  sw.className = 'swatch' + (_appearance.skin === i ? ' selected' : '');
  sw.style.background = '#' + col.toString(16).padStart(6, '0');
  sw.addEventListener('click', () => {
    _appearance.skin = i; _saveAppearance();
    skinRow.querySelectorAll('.swatch').forEach((s, j) => s.classList.toggle('selected', j === i));
  });
  skinRow.appendChild(sw);
});

// Build outfit swatches
const outfitRow = document.getElementById('outfit-swatches');
OUTFIT_COLORS.forEach((col, i) => {
  const sw = document.createElement('div');
  sw.className = 'swatch' + (_appearance.outfit === i ? ' selected' : '');
  sw.style.background = '#' + col.toString(16).padStart(6, '0');
  sw.addEventListener('click', () => {
    _appearance.outfit = i; _saveAppearance();
    outfitRow.querySelectorAll('.swatch').forEach((s, j) => s.classList.toggle('selected', j === i));
  });
  outfitRow.appendChild(sw);
});

// Build hat buttons
const hatRow = document.getElementById('hat-buttons');
HAT_TYPES.forEach(hat => {
  const btn = document.createElement('button');
  btn.className = 'hat-btn' + (_appearance.hat === hat ? ' selected' : '');
  btn.textContent = hat;
  btn.addEventListener('click', () => {
    _appearance.hat = hat; _saveAppearance();
    hatRow.querySelectorAll('.hat-btn').forEach(b => b.classList.toggle('selected', b.textContent === hat));
  });
  hatRow.appendChild(btn);
});

// ── Lobby join button ─────────────────────────────────────────────────────────
document.getElementById('join-btn').addEventListener('click', () => {
  const name   = document.getElementById('name-input').value.trim() || 'Survivor';
  const roomId = document.getElementById('room-input').value.trim() || 'default';
  const $s = document.getElementById('lobby-status');
  if (!net.connected) {
    $s.textContent = 'Waiting for server connection...';
    net.socket.once('connect', () => { $s.textContent = 'Joining room...'; net.joinRoom(roomId, name, _appearance); });
  } else { $s.textContent = 'Joining room...'; net.joinRoom(roomId, name, _appearance); }
});

// ── Ready buttons ─────────────────────────────────────────────────────────────
let _isReady = false;
document.getElementById('ready-btn').addEventListener('click', () => {
  _isReady = !_isReady; net.socket.emit('playerReady', _isReady);
  const btn = document.getElementById('ready-btn');
  btn.textContent = _isReady ? 'Cancel Ready' : 'Ready';
  btn.classList.toggle('is-ready', _isReady);
});
let _goReady = false;
document.getElementById('go-ready-btn').addEventListener('click', () => {
  _goReady = !_goReady; net.socket.emit('playerReady', _goReady);
  const btn = document.getElementById('go-ready-btn');
  btn.textContent = _goReady ? 'Cancel' : 'Play Again';
  btn.classList.toggle('is-ready', _goReady);
});

// ── Map voting buttons ────────────────────────────────────────────────────────
let _myVote = null;
document.querySelectorAll('.map-vote-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    _myVote = btn.dataset.map;
    net.socket.emit('mapVote', _myVote);
    document.querySelectorAll('.map-vote-btn').forEach(b => b.classList.remove('voted'));
    btn.classList.add('voted');
  });
});

// ── Use healthpack button ─────────────────────────────────────────────────────
document.getElementById('use-healthpack-btn').addEventListener('click', () => {
  net.socket.emit('useHealthpack');
});

// ── Victory ready button ──────────────────────────────────────────────────────
let _vicReady = false;
document.getElementById('vic-ready-btn')?.addEventListener('click', () => {
  _vicReady = !_vicReady;
  net.socket.emit('playerReady', _vicReady);
  const btn = document.getElementById('vic-ready-btn');
  btn.textContent = _vicReady ? 'Cancel' : 'Play Again';
  btn.classList.toggle('is-ready', _vicReady);
});

// ── Settings overlay ──────────────────────────────────────────────────────────
document.getElementById('settings-btn')?.addEventListener('click', () => {
  document.getElementById('settings-overlay').style.display = 'flex';
});
document.getElementById('close-settings')?.addEventListener('click', () => {
  document.getElementById('settings-overlay').style.display = 'none';
});

// ── Volume slider ─────────────────────────────────────────────────────────────
document.getElementById('volume-slider')?.addEventListener('input', (e) => {
  audio.setVolume(Number(e.target.value) / 100);
});

// ── Public room list ──────────────────────────────────────────────────────────
async function loadRooms() {
  const list = document.getElementById('room-list');
  if (!list) return;
  try {
    const data = await fetch('/api/rooms').then(r => r.json());
    if (data.length === 0) {
      list.innerHTML = '<div class="room-item" style="opacity:0.5">No active rooms</div>';
      return;
    }
    list.innerHTML = data.map(r =>
      `<div class="room-item" style="cursor:pointer" data-room="${r.id}">
         <b>${r.id}</b> — ${r.playerCount}/4 players, wave ${r.wave ?? 1}${r.gameStarted ? ' (in progress)' : ''}
       </div>`
    ).join('');
    list.querySelectorAll('.room-item[data-room]').forEach(el => {
      el.addEventListener('click', () => {
        document.getElementById('room-input').value = el.dataset.room;
      });
    });
  } catch (_) {
    list.innerHTML = '<div class="room-item" style="opacity:0.5">Could not load rooms</div>';
  }
}

document.getElementById('refresh-rooms')?.addEventListener('click', loadRooms);
// Load on page ready if section exists
if (document.getElementById('room-list')) loadRooms();

// ─────────────────────────────────────────────────────────────────────────────
// HUD
// ─────────────────────────────────────────────────────────────────────────────
const $wave  = document.getElementById('wave');
const $msg   = document.getElementById('msg');
const $reBar = document.getElementById('reload-bar');
const $reFill= document.getElementById('reload-fill');
let msgTimer = null;
const SLOT_HEX = PLAYER_COLORS.map(c => '#' + c.toString(16).padStart(6,'0'));

function showMsg(text, color = '#ffdd44', ms = 0) {
  $msg.textContent = text; $msg.style.color = color;
  clearTimeout(msgTimer);
  if (ms > 0) msgTimer = setTimeout(() => { $msg.textContent = ''; }, ms);
}
function updateWaveHUD(n) { $wave.textContent = n; }

function updateHUD(state) {
  if (!state?.players) return;
  const active = new Set();
  for (const p of state.players) {
    const s = p.slot; active.add(s);
    const card = document.getElementById(`p-card-${s}`); if (!card) continue;
    card.classList.add('active');
    card.classList.toggle('local-player', p.id === net.playerId);
    document.getElementById(`p-avatar-${s}`).style.background = SLOT_HEX[s] ?? '#fff';
    document.getElementById(`p-name-${s}`).textContent  = p.name;
    document.getElementById(`p-hp-${s}`).style.width    = (p.hp / PLAYER_MAX_HP * 100).toFixed(1) + '%';
    document.getElementById(`p-ammo-${s}`).textContent  = p.alive ? `AMMO: ${p.ammo}/${WEAPONS[p.weapon]?.ammoMax ?? '?'}` : '';
    document.getElementById(`p-weapon-${s}`).textContent = p.alive ? (p.weapon?.toUpperCase() ?? '') : '';
    document.getElementById(`p-dead-${s}`).style.display = (!p.alive && !p.disconnected) ? 'block' : 'none';
    const dcEl = document.getElementById(`p-dc-${s}`);
    if (dcEl) dcEl.style.display = p.disconnected ? 'block' : 'none';
    if (card) card.classList.toggle('is-dashing', !!p.dashing);
  }
  for (let s = 0; s < 4; s++)
    if (!active.has(s)) document.getElementById(`p-card-${s}`)?.classList.remove('active');

  const me = state.players.find(p => p.id === net.playerId);
  if (me?.reloading) { $reBar.style.display = 'block'; $reFill.style.width = '60%'; }
  else $reBar.style.display = 'none';

  // Action bar (healthpack + grenades)
  const actionBar = document.getElementById('action-bar');
  if (me && me.alive) {
    actionBar.style.display = 'flex';
    document.getElementById('hp-pack-count').textContent = me.healthpacks;
    document.getElementById('use-healthpack-btn').disabled = me.healthpacks === 0 || me.hp >= PLAYER_MAX_HP;
    document.getElementById('grenade-count').textContent = me.grenadeCount ?? 0;
  } else {
    actionBar.style.display = 'none';
  }
  // Ping
  const pingEl = document.getElementById('ping-display');
  if (pingEl) pingEl.textContent = `Ping: ${net.ping}ms`;

  // Safe room status
  const srEl = document.getElementById('safe-room-status');
  const cdEl = document.getElementById('safe-countdown');
  if (srEl && gameStarted) {
    if (state.safeRoomOpen) {
      srEl.style.display = 'block';
      srEl.classList.add('open');
      srEl.innerHTML = 'SAFE ROOM OPEN';
    } else {
      srEl.style.display = 'block';
      srEl.classList.remove('open');
      cdEl.textContent = state.safeSecondsLeft ?? WAVE_SAFE_DELAY;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimap
// ─────────────────────────────────────────────────────────────────────────────
const $mmap   = document.getElementById('minimap');
const mmCtx   = $mmap?.getContext('2d');
const MM_SIZE = 130;
const MM_HALF = MM_SIZE / 2;
const MM_SCALE = MM_SIZE / (MAP_HALF * 2);

function w2m(x, z) { // world → minimap pixel
  return [MM_HALF + x * MM_SCALE, MM_HALF + z * MM_SCALE];
}

function drawMinimap(state) {
  if (!mmCtx || !state) return;
  mmCtx.clearRect(0, 0, MM_SIZE, MM_SIZE);

  // Background
  mmCtx.fillStyle = 'rgba(0,0,0,0.75)';
  mmCtx.fillRect(0, 0, MM_SIZE, MM_SIZE);

  // Safe house (green square)
  mmCtx.fillStyle = '#22ee55';
  const [sx, sz] = w2m(0, -20);
  mmCtx.fillRect(sx - 4, sz - 3, 8, 6);

  // Enemies
  if (state.enemies) {
    const ECOL = { walker:'#ff4444', runner:'#ff8844', spitter:'#aaff22', tank:'#ff2222', boss:'#ff00aa', finalboss:'#cc00ff' };
    for (const e of state.enemies) {
      const [ex, ez] = w2m(e.x, e.z);
      mmCtx.fillStyle = ECOL[e.type] ?? '#ff4444';
      const r = e.type === 'finalboss' ? 7 : e.type === 'boss' ? 5 : e.type === 'tank' ? 3.5 : 2;
      mmCtx.beginPath(); mmCtx.arc(ex, ez, r, 0, Math.PI*2); mmCtx.fill();
    }
  }

  // Players
  if (state.players) {
    for (const p of state.players) {
      if (!p.alive) continue;
      const [px, pz] = w2m(p.x, p.z);
      const col = SLOT_HEX[p.slot] ?? '#ffffff';
      mmCtx.fillStyle = col;
      mmCtx.beginPath(); mmCtx.arc(px, pz, 3.5, 0, Math.PI*2); mmCtx.fill();
      if (p.id === net.playerId) {
        // direction arrow
        mmCtx.strokeStyle = '#ffffff'; mmCtx.lineWidth = 1.5;
        mmCtx.beginPath();
        mmCtx.moveTo(px, pz);
        mmCtx.lineTo(px + Math.sin(p.angle)*7, pz + Math.cos(p.angle)*7);
        mmCtx.stroke();
      }
    }
  }

  // Border
  mmCtx.strokeStyle = '#444'; mmCtx.lineWidth = 1;
  mmCtx.strokeRect(0.5, 0.5, MM_SIZE-1, MM_SIZE-1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Camera follow
// ─────────────────────────────────────────────────────────────────────────────
const _camTarget = new THREE.Vector3();
let _shakeAmt = 0;
let _spectating = false;
function shakeCamera(amount) { _shakeAmt = Math.max(_shakeAmt, amount); }

function followLocalPlayer(state) {
  const me = state?.players?.find(p => p.id === net.playerId);

  // Spectator: follow alive player when local player is dead
  if (!me?.alive) {
    const target = state?.players?.find(p => p.alive);
    if (target) {
      _camTarget.set(target.x + CAM_OFFSET.x, CAM_OFFSET.y, target.z + CAM_OFFSET.z);
      camera.position.lerp(_camTarget, 0.08);
      camera.lookAt(target.x, 0, target.z);
    }
    if (!_spectating) {
      _spectating = true;
      const el = document.getElementById('spectate-info');
      const nm = document.getElementById('spectate-name');
      if (el && target) { nm.textContent = target.name; el.style.display = 'block'; }
    }
    return;
  }
  if (_spectating) {
    _spectating = false;
    document.getElementById('spectate-info').style.display = 'none';
  }

  _camTarget.set(me.x + CAM_OFFSET.x, CAM_OFFSET.y, me.z + CAM_OFFSET.z);
  camera.position.lerp(_camTarget, 0.1);
  camera.lookAt(me.x, 0, me.z);
  sun.target.position.set(me.x, 0, me.z);
  sun.position.set(me.x+5, 20, me.z+18);
}

// ─────────────────────────────────────────────────────────────────────────────
// Game loop
// ─────────────────────────────────────────────────────────────────────────────
let lastInputTime = 0;
let _lastLoop     = performance.now();
const INPUT_RATE  = 1000 / 60;

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt  = Math.min((now - _lastLoop) / 1000, 0.1);
  _lastLoop = now;

  fireLights.forEach(fl => {
    fl.intensity = 2.5 + Math.sin(now * 0.008 + fl.position.x) * 0.8;
  });

  // Particle update
  vfx.update(dt);

  // Screen shake decay + apply
  if (_shakeAmt > 0.001) {
    _shakeAmt *= Math.pow(0.1, dt * 12);
    camera.position.x += (Math.random() - 0.5) * _shakeAmt;
    camera.position.y += (Math.random() - 0.5) * _shakeAmt * 0.3;
  } else {
    _shakeAmt = 0;
  }

  // Slam ring fade
  for (let i = _slamRings.length - 1; i >= 0; i--) {
    const s = _slamRings[i];
    s.life -= dt;
    s.mesh.material.opacity = Math.max(0, (s.life / s.maxLife) * 0.65);
    if (s.life <= 0) { scene.remove(s.mesh); _slamRings.splice(i, 1); }
  }

  if (gameStarted && now - lastInputTime >= INPUT_RATE && net.connected && net.playerId) {
    lastInputTime = now;
    const doReload  = input.consumeReload();
    const doDash    = input.consumeDash();
    const doGrenade = input.consumeGrenade();
    if (doReload)  audio.reload();
    if (doDash)    audio.dash();
    net.sendInput({
      w: input.isDown('KeyW') || input.isDown('ArrowUp'),
      s: input.isDown('KeyS') || input.isDown('ArrowDown'),
      a: input.isDown('KeyA') || input.isDown('ArrowLeft'),
      d: input.isDown('KeyD') || input.isDown('ArrowRight'),
    }, getMouseAngle(), input.lmb, doReload, input.consumeUse(), doDash, doGrenade);
  }

  const state = interp.get() ?? net.latestState;
  if (state && gameStarted) {
    try {
      applyEffects(state, dt);
      syncPlayers(state.players);
      syncEnemies(state.enemies);
      syncBullets(state.bullets ?? []);
      syncAcidBlobs(state.acidBlobs ?? []);
      syncPickups(state.pickups ?? [], now);
      syncHealthpacks(state.healthpacks ?? [], now);
      syncGrenades(state.grenades ?? []);
      followLocalPlayer(state);
      updateHUD(state);
      drawMinimap(state);
    } catch (err) { console.error('Render error:', err); }
  }

  renderer.render(scene, camera);
}

loop();

// ─────────────────────────────────────────────────────────────────────────────
// Dev stats
// ─────────────────────────────────────────────────────────────────────────────
if (import.meta.env.DEV) {
  const dbg = document.createElement('div');
  dbg.style.cssText = 'position:fixed;bottom:30px;right:150px;font-size:10px;color:#aaa;pointer-events:none;font-family:monospace;z-index:9999';
  document.body.appendChild(dbg);
  setInterval(() => {
    dbg.textContent = `draws:${renderer.info.render.calls} | obj:${scene.children.length} | e:${enemyMeshes.size}`;
  }, 500);
}
