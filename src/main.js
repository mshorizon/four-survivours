import * as THREE from 'three';
import { NetworkManager } from './net/NetworkManager.js';
import { Interpolator }   from './net/Interpolator.js';
import { InputHandler }   from './InputHandler.js';
import { buildMap }       from './GameWorld.js';
import { AudioManager }   from './audio/AudioManager.js';
import { ParticleSystem }  from './vfx/ParticleSystem.js';
import { DamageNumbers }   from './vfx/DamageNumbers.js';
import { MobileControls }  from './MobileControls.js';
import {
  PLAYER_COLORS, PLAYER_MAX_HP, WEAPONS, MAP_HALF, WAVE_SAFE_DELAY,
  SKIN_COLORS, OUTFIT_COLORS, HAT_TYPES, DEFAULT_APPEARANCE,
  BOSS_SLAM_RADIUS, GRENADE_RADIUS, GRENADE_THROW_RANGE, GRENADE_LAND_FUSE,
  TONGUE_SPEED, TONGUE_RANGE, WEAPON_PICKUP_RADIUS, GRENADE_PICKUP_RADIUS, HEALTHPACK_PICKUP_RADIUS, MISSION_PICKUP_RADIUS,
} from '../shared/constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Renderer + Scene + Camera
// ─────────────────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFShadowMap;
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

const PLAYER_BODY_LIGHT_ENABLED = false;

// Lights — kept very dim; flashlight SpotLights per player provide main illumination
const ambient = new THREE.AmbientLight(0x000000, 0.0);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffeedd, 0.10);
sun.position.set(5, 20, 18); sun.castShadow = false;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0x8899cc, 0.04);
fill.position.set(-8, 10, -10);
scene.add(fill);

// ─────────────────────────────────────────────────────────────────────────────
// Audio + VFX
// ─────────────────────────────────────────────────────────────────────────────
const audio = new AudioManager();
const vfx     = new ParticleSystem(scene);
const dmgNums = new DamageNumbers(scene);

// Unlock AudioContext on first user gesture
document.addEventListener('pointerdown', () => audio.init(), { once: true });
document.addEventListener('keydown',     () => audio.init(), { once: true });

// ─────────────────────────────────────────────────────────────────────────────
// Map group — rebuilt on each game start
// ─────────────────────────────────────────────────────────────────────────────
let mapGroup     = null;
let fireLights   = [];
let mapOccluders = [];

function loadMap(mapId, fogEnabled = true) {
  if (mapGroup) { scene.remove(mapGroup); mapGroup = null; }
  mapGroup = new THREE.Group();
  scene.add(mapGroup);
  const result = buildMap(mapGroup, mapId);
  fireLights = result.fireLights ?? [];
  mapOccluders = [];
  mapGroup.traverse(c => { if (c.isMesh) mapOccluders.push(c); });
  scene.background = new THREE.Color(fogEnabled ? 0x000000 : 0x1a1a2e);
  // Camera sits ~22 units from player (offset 0,18,14), so fog must start beyond that.
  scene.fog = fogEnabled ? new THREE.Fog(0x000000, 24, 40) : null;
  // Without fog of war, raise ambient so SpotLights aren't the only illumination
  ambient.intensity = fogEnabled ? 0.0  : 1.8;
  sun.intensity     = fogEnabled ? 0.0  : 1.2;
  fill.intensity    = fogEnabled ? 0.0  : 0.6;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mesh factories
// ─────────────────────────────────────────────────────────────────────────────
const _wMat     = new THREE.MeshLambertMaterial({ color: 0x2a2a2a, emissive: 0x111111, emissiveIntensity: 0.3 });
const _wMat2    = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
const _laserMat = new THREE.LineBasicMaterial({ color: 0xff1111, transparent: true, opacity: 0.85 });

// World-space laser for local player — updated every frame so it hits the exact cursor pixel
const _myLaserPosArr = new Float32Array(6);
const _myLaserGeo    = new THREE.BufferGeometry();
_myLaserGeo.setAttribute('position', new THREE.BufferAttribute(_myLaserPosArr, 3));
const _myLaser     = new THREE.Line(_myLaserGeo, _laserMat);
_myLaser.visible   = false;
scene.add(_myLaser);
const _laserRay    = new THREE.Raycaster();
const _laserPlane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.64);
const _laserTarget = new THREE.Vector3();

function makeWeaponMesh(type = 'pistol') {
  const g = new THREE.Group();
  if (type === 'pistol') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.24), _wMat); b.position.z = 0.12; g.add(b);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.07), _wMat); h.position.set(0, -0.09, 0.01); g.add(h);
  } else if (type === 'shotgun') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.09, 0.46), _wMat); b.position.z = 0.23; g.add(b);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.20), _wMat); s.position.set(0, -0.06, -0.08); g.add(s);
  } else if (type === 'ak47') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.62), _wMat); b.position.z = 0.31; g.add(b);
    const bd = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.28), _wMat); bd.position.set(0, -0.02, -0.08); g.add(bd);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.06), _wMat2); m.position.set(0, -0.10, 0.08); g.add(m);
  } else if (type === 'sniper') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.86), _wMat); b.position.z = 0.43; g.add(b);
    const bd = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.26), _wMat); bd.position.set(0, -0.02, -0.07); g.add(bd);
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), _wMat); sc.rotation.x = Math.PI/2; sc.position.set(0, 0.07, 0.12); g.add(sc);
  }
  return g;
}

function makePlayerMesh(slotColor, appearance = {}) {
  const { skin = 0, outfit = 0, hat = 'cap' } = appearance;
  const outfitCol = OUTFIT_COLORS[outfit] ?? slotColor;
  const skinCol   = SKIN_COLORS[skin]   ?? 0xf5c59a;
  const g    = new THREE.Group();
  const bMat = new THREE.MeshLambertMaterial({ color: outfitCol, emissive: outfitCol, emissiveIntensity: 0.55 });
  const sMat = new THREE.MeshLambertMaterial({ color: skinCol, emissive: skinCol, emissiveIntensity: 0.45 });
  const pMat = new THREE.MeshLambertMaterial({ color: 0x2a2a3a, emissive: 0x2a2a3a, emissiveIntensity: 0.35 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.20,0.45,0.22), pMat); legL.position.set(-0.13,0.225,0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.20,0.45,0.22), pMat); legR.position.set( 0.13,0.225,0);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52,0.55,0.32), bMat); body.position.y = 0.725;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.48,0.48,0.48), sMat); head.position.y = 1.26;
  [legL,legR,body,head].forEach(m => { m.castShadow = true; m.receiveShadow = true; g.add(m); });
  // Hat
  if (hat === 'cap') {
    const cap  = new THREE.Mesh(new THREE.BoxGeometry(0.50,0.14,0.50), bMat); cap.position.y = 1.595; g.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.62,0.06,0.32), bMat); brim.position.set(0,1.575,0.22); g.add(brim);
  } else if (hat === 'helmet') {
    const hm = new THREE.Mesh(new THREE.BoxGeometry(0.54,0.22,0.54), bMat); hm.position.y = 1.60; g.add(hm);
  } else if (hat === 'beanie') {
    const bn = new THREE.Mesh(new THREE.BoxGeometry(0.50,0.30,0.50), bMat); bn.position.y = 1.64; g.add(bn);
  }
  // Arms — pivot at shoulder so rotation extends arms forward
  const armLPivot = new THREE.Group(); armLPivot.position.set(-0.34, 0.92, 0); armLPivot.rotation.x = -0.75;
  const armLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14,0.40,0.14), sMat); armLMesh.position.y = -0.20; armLMesh.castShadow = true; armLMesh.receiveShadow = true;
  armLPivot.add(armLMesh); g.add(armLPivot);
  const armRPivot = new THREE.Group(); armRPivot.position.set( 0.34, 0.92, 0); armRPivot.rotation.x = -0.75;
  const armRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14,0.40,0.14), sMat); armRMesh.position.y = -0.20; armRMesh.castShadow = true; armRMesh.receiveShadow = true;
  armRPivot.add(armRMesh); g.add(armRPivot);
  // Weapon in front where hands meet (computed from arm pivot at -0.75 rad)
  const weaponHolder = new THREE.Group();
  weaponHolder.position.set(0.08, 0.64, 0.30);
  const wMesh = makeWeaponMesh('pistol');
  weaponHolder.add(wMesh);
  g.add(weaponHolder);
  g.legL = legL; g.legR = legR;
  g.armL = armLPivot; g.armR = armRPivot;
  g.weaponHolder = weaponHolder;
  g._weaponMesh = wMesh;
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
  [legL,legR,body,head].forEach(m => { m.castShadow = true; m.receiveShadow = true; g.add(m); });
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
  spitter: [{ b:0x44bb44, h:0x88ee66 },{ b:0x33aa44, h:0x77dd55 }],
  tank:    [{ b:0x2a2a2a, h:0x444444 },{ b:0x1a1a1a, h:0x333333 }],
  smoker:  [{ b:0x5a4433, h:0x7a6655 },{ b:0x4a3322, h:0x6a5544 }],
};

function makeSmokerMesh() {
  const g    = new THREE.Group();
  const pal  = ENEMY_PALETTES.smoker[Math.floor(Math.random()*2)];
  const bMat = new THREE.MeshLambertMaterial({ color: pal.b });
  const hMat = new THREE.MeshLambertMaterial({ color: pal.h });
  const pMat = new THREE.MeshLambertMaterial({ color: 0x332211 });
  const tMat = new THREE.MeshLambertMaterial({ color: 0xaa7755, emissive: 0x883300, emissiveIntensity: 0.4 });

  // Fat legs — wide & short
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.38,0.28), pMat); legL.position.set(-0.18,0.19,0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.38,0.28), pMat); legR.position.set( 0.18,0.19,0);
  // Big gut body
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42,6,5), bMat); body.scale.set(1,0.85,0.9); body.position.y = 0.72;
  // Small head sunk into shoulders
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38,0.34,0.36), hMat); head.position.y = 1.18;
  // Tongue — thin cylinder dangling from mouth
  const tongue = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,0.30,5), tMat);
  tongue.position.set(0, 1.04, 0.20); tongue.rotation.x = 0.4;

  [legL,legR,body,head,tongue].forEach(m => { m.castShadow = true; m.receiveShadow = true; g.add(m); });
  return g;
}

function makeEnemyMesh(type = 'walker') {
  if (type === 'boss')      return makeBossMesh();
  if (type === 'finalboss') return makeFinalBossMesh();
  if (type === 'smoker')    return makeSmokerMesh();

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
  [legL,legR,body,head].forEach(m => { m.castShadow = true; m.receiveShadow = true; g.add(m); });

  // Spitter: acid sac on back
  if (type === 'spitter') {
    const sacMat = new THREE.MeshLambertMaterial({ color: 0x55ee44, emissive: 0x33cc22, emissiveIntensity: 0.8 });
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

// Body naturally long along Z — no geometry rotation needed
const _bltBodyGeo = new THREE.BoxGeometry(0.056, 0.056, 0.19);
const _bltBodyMat = new THREE.MeshBasicMaterial({ color: 0xddbb66 });
// Fire cone: tip at +Z, opens toward -Z (trails behind bullet)
const _bltFireGeo = (() => { const g = new THREE.ConeGeometry(0.056, 0.19, 5); g.rotateX(Math.PI / 2); return g; })();
const _bltFireMat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const _bltGlowGeo = (() => { const g = new THREE.ConeGeometry(0.096, 0.27, 5); g.rotateX(Math.PI / 2); return g; })();
const _bltGlowMat = new THREE.MeshBasicMaterial({ color: 0xff9900, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
const _bltFwd = new THREE.Vector3(0, 0, 1);
const _bltDir = new THREE.Vector3();
function makeBulletMesh() {
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(_bltBodyGeo, _bltBodyMat));
  const fire = new THREE.Mesh(_bltFireGeo, _bltFireMat);
  fire.position.z = -0.16;
  grp.add(fire);
  const glow = new THREE.Mesh(_bltGlowGeo, _bltGlowMat);
  glow.position.z = -0.18;
  grp.add(glow);
  return grp;
}

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
function makeGrenadePickMesh() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(_grenGeo, _grenMat));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 16),
    new THREE.MeshBasicMaterial({ color: 0x88aa22, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI/2; ring.position.y = -0.05;
  g.add(ring); return g;
}

function makeFinalBossMesh() {
  const g    = new THREE.Group();
  const bMat = new THREE.MeshLambertMaterial({ color: 0x0a0010, emissive: 0x8800ff, emissiveIntensity: 0.3 });
  const eMat = new THREE.MeshLambertMaterial({ color: 0xaa00ff, emissive: 0xaa00ff, emissiveIntensity: 1.2 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.55,1.4,0.6), bMat); legL.position.set(-0.42,0.7,0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.55,1.4,0.6), bMat); legR.position.set( 0.42,0.7,0);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5,1.7,1.0), bMat); body.position.y = 1.75;
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.3,1.3,1.1), bMat); head.position.y = 3.2;
  [legL,legR,body,head].forEach(m => { m.castShadow = true; m.receiveShadow = true; g.add(m); });
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

// ── Mission item meshes ───────────────────────────────────────────────────────
const missionItemMeshes = new Map();
let _missionCarMarker   = null;
let _missionLabel       = '';
let _missionLog         = []; // { label, done }[]

function makeFuelCanMesh() {
  const g    = new THREE.Group();
  const mat  = new THREE.MeshLambertMaterial({ color: 0xcc2200, emissive: 0xaa1100, emissiveIntensity: 0.4 });
  const dMat = new THREE.MeshLambertMaterial({ color: 0x882200, emissive: 0x440000, emissiveIntensity: 0.3 });
  const body   = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.50, 0.22), mat);
  const top    = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.18), dMat); top.position.y = 0.29;
  const spout  = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.14, 6), dMat); spout.position.set(0.1, 0.38, 0);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.05), dMat); handle.position.set(0, 0.32, -0.1);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.06, 0.24),
    new THREE.MeshLambertMaterial({ color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 0.5 }));
  stripe.position.y = 0.05;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 6),
    new THREE.MeshBasicMaterial({ color: 0xffdd00 }));
  arrow.name = 'arrow'; arrow.rotation.z = Math.PI; arrow.position.y = 1.15;
  const fuelRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 16),
    new THREE.MeshBasicMaterial({ color: 0xcc2200, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
  fuelRing.rotation.x = -Math.PI/2; fuelRing.position.y = -0.45;
  g.add(body, top, spout, handle, stripe, arrow, fuelRing);
  return g;
}

function makeRepairKitMesh() {
  const g   = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x33bb33, emissive: 0x22aa22, emissiveIntensity: 0.5 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4), mat);
  const wM  = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const hb  = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.06), wM);
  const vb  = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), wM);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 6),
    new THREE.MeshBasicMaterial({ color: 0x00ffaa }));
  arrow.name = 'arrow'; arrow.rotation.z = Math.PI; arrow.position.y = 1.0;
  const repairRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 16),
    new THREE.MeshBasicMaterial({ color: 0x33bb33, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
  repairRing.rotation.x = -Math.PI/2; repairRing.position.y = -0.45;
  g.add(box, hb, vb, arrow, repairRing); g.position.y = 0.5; return g;
}

function makePlankMesh() {
  const g   = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x8a6030, emissive: 0x5a3a10, emissiveIntensity: 0.3 });
  const plank = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.18), mat);
  plank.rotation.y = 0.3;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 6),
    new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
  arrow.name = 'arrow'; arrow.rotation.z = Math.PI; arrow.position.y = 1.0;
  const plankRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 16),
    new THREE.MeshBasicMaterial({ color: 0x8a6030, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
  plankRing.rotation.x = -Math.PI/2; plankRing.position.y = -0.45;
  g.add(plank, arrow, plankRing); g.position.y = 0.5; return g;
}

function makeGenKeyMesh() {
  const g   = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xddaa00, emissive: 0xaa7700, emissiveIntensity: 0.5 });
  const ring  = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 8, 16), mat);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.06), mat);
  shaft.position.y = -0.22;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 6),
    new THREE.MeshBasicMaterial({ color: 0x00ffdd }));
  arrow.name = 'arrow'; arrow.rotation.z = Math.PI; arrow.position.y = 1.0;
  const keyRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 16),
    new THREE.MeshBasicMaterial({ color: 0xddaa00, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
  keyRing.rotation.x = -Math.PI/2; keyRing.position.y = -0.45;
  g.add(ring, shaft, arrow, keyRing); g.position.y = 0.5; return g;
}

function makeCarMarkerMesh() {
  const g    = new THREE.Group();
  const rMat = new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.2, 32), rMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.name = 'ring';
  const aMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 8), aMat);
  cone.rotation.z = Math.PI; cone.position.y = 2.0; cone.name = 'cone';
  g.add(ring, cone); return g;
}

function syncMissionItems(mission, localCarrying, now) {
  if (!mission) {
    missionItemMeshes.forEach(m => scene.remove(m)); missionItemMeshes.clear();
    if (_missionCarMarker) { scene.remove(_missionCarMarker); _missionCarMarker = null; }
    return;
  }
  const seen = new Set();
  for (const item of (mission.items ?? [])) {
    seen.add(item.id);
    if (!missionItemMeshes.has(item.id)) {
      const mesh = item.type === 'fuel' ? makeFuelCanMesh()
        : item.type === 'plank'  ? makePlankMesh()
        : item.type === 'genkey' ? makeGenKeyMesh()
        : makeRepairKitMesh();
      mesh.position.set(item.x, 0, item.z); scene.add(mesh); missionItemMeshes.set(item.id, mesh);
    }
    const mesh = missionItemMeshes.get(item.id);
    mesh.position.y = 0.5 + Math.sin(now * 0.003) * 0.12;
    mesh.rotation.y = now * 0.0012;
    const arrow = mesh.getObjectByName('arrow');
    if (arrow) arrow.position.y = 0.95 + Math.sin(now * 0.005) * 0.2;
  }
  for (const [id, mesh] of missionItemMeshes)
    if (!seen.has(id)) { scene.remove(mesh); missionItemMeshes.delete(id); }

  const needsDeliveryMarker = !!mission.deliveryPos && mission.phase < 4;
  if (needsDeliveryMarker) {
    if (!_missionCarMarker) {
      _missionCarMarker = makeCarMarkerMesh();
      scene.add(_missionCarMarker);
    }
    _missionCarMarker.position.set(mission.deliveryPos.x, 0, mission.deliveryPos.z);
    _missionCarMarker.visible = true;
    const ring = _missionCarMarker.getObjectByName('ring');
    if (ring) ring.material.opacity = 0.35 + Math.sin(now * 0.005) * 0.25;
    const cone = _missionCarMarker.getObjectByName('cone');
    if (cone) cone.position.y = 1.8 + Math.sin(now * 0.004) * 0.3;
  } else if (_missionCarMarker) {
    _missionCarMarker.visible = false;
  }
}

const PICKUP_COLORS = { shotgun: 0xff6600, ak47: 0x4488ff, pistol: 0xffdd44 };
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
const playerLights    = new Map(); // id → { light: SpotLight, tgt: Object3D }
const playerBodyLights = new Map(); // id → { light: SpotLight, tgt: Object3D } (colored downlight above player)
const pinnedLights    = new Map(); // id → PointLight (red alarm for pinned/pulled players)
const enemyMeshes     = new Map();
const tongueMeshes    = new Map(); // tongueId → { line, ox, oz, dx, dz, dist, attached, ownerId, targetId }
const bulletMeshes    = new Map();
const acidMeshes      = new Map();
const pickupMeshes    = new Map();
const healthpackMeshes = new Map();
const grenadeMeshes   = new Map();
const grenadePickMeshes = new Map();
const grenadeArcs       = new Map();
const flyingBeacons     = [];


const _occlRay  = new THREE.Raycaster();
const _occPos   = new THREE.Vector3();
const _occTmpQ  = new THREE.Quaternion();

function _makeCapsuleGeo(w = 0.78, h = 2.05, segs = 12) {
  const r = w / 2, hy = h / 2 - r;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI * (1 - i / segs);
    pts.push(new THREE.Vector3(Math.cos(a) * r, hy + Math.sin(a) * r, 0));
  }
  for (let i = 0; i <= segs; i++) {
    const a = -(Math.PI * i / segs);
    pts.push(new THREE.Vector3(Math.cos(a) * r, -hy + Math.sin(a) * r, 0));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}
const _capsuleGeo = _makeCapsuleGeo();

function addPlayerOutline(group, slot) {
  const capsule = new THREE.LineLoop(
    _capsuleGeo,
    new THREE.LineBasicMaterial({ color: PLAYER_COLORS[slot] ?? 0xffffff, depthTest: false, depthWrite: false })
  );
  capsule.position.y = 0.9;
  capsule.visible = false;
  group.add(capsule);
  return capsule;
}

function updateOutlineOcclusion(players) {
  if (!mapOccluders.length) return;
  for (const p of players) {
    const entry = playerMeshes.get(p.id);
    if (!entry?.outline) continue;
    if (!p.alive && !p.downed) { entry.outline.visible = false; continue; }
    _occPos.set(p.x, 1.0, p.z);
    const dist = camera.position.distanceTo(_occPos);
    _occlRay.set(camera.position, _occPos.clone().sub(camera.position).normalize());
    _occlRay.far = dist - 0.5;
    entry.outline.visible = _occlRay.intersectObjects(mapOccluders, false).length > 0;
  }
}

function syncPlayers(players, dt) {
  const seen = new Set();
  for (const p of players) {
    seen.add(p.id);
    const apKey = JSON.stringify(p.appearance);
    if (!playerMeshes.has(p.id)) {
      const mesh = makePlayerMesh(PLAYER_COLORS[p.slot] ?? 0xffffff, p.appearance);
      const outline = addPlayerOutline(mesh, p.slot);
      scene.add(mesh);
      playerMeshes.set(p.id, { mesh, apKey, walkTime: 0, prevX: p.x, prevZ: p.z, weapon: 'pistol', outline });
    } else {
      const ent = playerMeshes.get(p.id);
      if (p.appearance && ent.apKey !== apKey) {
        scene.remove(ent.mesh);
        const mesh = makePlayerMesh(PLAYER_COLORS[p.slot] ?? 0xffffff, p.appearance);
        const outline = addPlayerOutline(mesh, p.slot);
        scene.add(mesh);
        playerMeshes.set(p.id, { mesh, apKey, walkTime: ent.walkTime, prevX: p.x, prevZ: p.z, weapon: ent.weapon, outline });
      }
    }
    const ent = playerMeshes.get(p.id);
    const { mesh } = ent;

    // Weapon model sync
    const weapType = p.weapon ?? 'pistol';
    if (weapType !== ent.weapon) {
      mesh.weaponHolder.remove(mesh._weaponMesh);
      const wm = makeWeaponMesh(weapType);
      mesh.weaponHolder.add(wm);
      mesh._weaponMesh = wm;
      ent.weapon = weapType;
    }

    // Walk cycle animation
    const moving = (Math.abs(p.x - ent.prevX) + Math.abs(p.z - ent.prevZ)) > 0.004;
    if (moving) ent.walkTime += dt * 9;
    else ent.walkTime *= 0.82;
    const ws = Math.sin(ent.walkTime);
    if (mesh.legL) mesh.legL.rotation.x =  ws * 0.50;
    if (mesh.legR) mesh.legR.rotation.x = -ws * 0.50;
    if (mesh.armL) mesh.armL.rotation.x = -0.75 - ws * 0.20;
    if (mesh.armR) mesh.armR.rotation.x = -0.75 + ws * 0.20;
    ent.prevX = p.x; ent.prevZ = p.z;

    const isPinned = !!(p.pinnedBy || p.pulledBy);
    mesh.position.set(p.x, isPinned ? 0.7 : 0, p.z);
    mesh.rotation.y = (p.id === net.playerId) ? getMouseAngle() : p.angle;
    mesh.rotation.x = p.downed ? Math.PI / 2 : 0;
    mesh.visible    = p.alive || p.downed;
    if (ent.outline) {
      // world quat = parent * local → set local = parent^-1 * camera so world = camera
      _occTmpQ.copy(mesh.quaternion).invert();
      ent.outline.quaternion.copy(_occTmpQ).multiply(camera.quaternion);
    }
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

const _tongueMat = new THREE.LineBasicMaterial({ color: 0xdd44ff });

function syncTongues(state, dt) {
  const enemyById  = new Map((state.enemies ?? []).map(e => [e.id, e]));
  const playerById = new Map((state.players ?? []).map(p => [p.id, p]));
  for (const [id, t] of tongueMeshes) {
    // Remove if owner smoker is gone
    if (!enemyById.has(t.ownerId)) { scene.remove(t.line); tongueMeshes.delete(id); continue; }
    const smoker = enemyById.get(t.ownerId);
    const pos = t.line.geometry.attributes.position;
    const arr = pos.array;
    let tipX, tipZ;
    if (t.attached && t.targetId) {
      const player = playerById.get(t.targetId);
      tipX = player ? player.x : smoker.x;
      tipZ = player ? player.z : smoker.z;
    } else {
      t.dist = Math.min(t.dist + TONGUE_SPEED * dt, TONGUE_RANGE);
      tipX = t.ox + t.dx * t.dist;
      tipZ = t.oz + t.dz * t.dist;
    }
    arr[0] = smoker.x; arr[1] = 0.9; arr[2] = smoker.z;
    arr[3] = tipX;     arr[4] = 0.9; arr[5] = tipZ;
    pos.needsUpdate = true;
  }
}

function syncBullets(bullets) {
  const seen = new Set();
  for (const b of bullets) {
    seen.add(b.id);
    let mesh;
    const isNew = !bulletMeshes.has(b.id);
    if (isNew) {
      mesh = makeBulletMesh();
      scene.add(mesh); bulletMeshes.set(b.id, mesh);
    } else { mesh = bulletMeshes.get(b.id); }
    // direction: prefer server dx/dz; fall back to position delta
    if (b.dx !== undefined) {
      _bltDir.set(b.dx, 0, b.dz);
      mesh.quaternion.setFromUnitVectors(_bltFwd, _bltDir);
    } else if (!isNew) {
      const ddx = b.x - mesh.userData.px, ddz = b.z - mesh.userData.pz;
      const len = Math.sqrt(ddx * ddx + ddz * ddz);
      if (len > 0.001) {
        _bltDir.set(ddx / len, 0, ddz / len);
        mesh.quaternion.setFromUnitVectors(_bltFwd, _bltDir);
      }
    }
    mesh.userData.px = b.x; mesh.userData.pz = b.z;
    mesh.position.set(b.x, 1.1, b.z);
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
  const seen = new Set();
  for (const h of hpacks) {
    seen.add(h.id);
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
  for (const [id, mesh] of healthpackMeshes)
    if (!seen.has(id)) { scene.remove(mesh); healthpackMeshes.delete(id); }
}

function syncGrenades(grenades) {
  const seen = new Set();
  for (const g of grenades) {
    seen.add(g.id);
    if (!grenadeMeshes.has(g.id)) {
      const mesh = makeGrenadeMesh();
      scene.add(mesh); grenadeMeshes.set(g.id, mesh);
    }
    const mesh = grenadeMeshes.get(g.id);
    const arc = grenadeArcs.get(g.id);
    if (arc) {
      const t = Math.min(1, (performance.now() - arc.startTime) / (GRENADE_LAND_FUSE * 1000));
      mesh.position.set(
        arc.ox + (arc.tx - arc.ox) * t,
        Math.sin(t * Math.PI) * 3.0 + 0.3,
        arc.oz + (arc.tz - arc.oz) * t
      );
      mesh.rotation.x += 0.15;
      if (t >= 1) grenadeArcs.delete(g.id);
    } else {
      mesh.position.set(g.x, 0.3, g.z);
    }
  }
  for (const [id, mesh] of grenadeMeshes)
    if (!seen.has(id)) { scene.remove(mesh); grenadeMeshes.delete(id); }
}

function syncGrenadePicks(picks, now) {
  const seen = new Set();
  for (const g of picks) {
    seen.add(g.id);
    if (!grenadePickMeshes.has(g.id)) {
      const mesh = makeGrenadePickMesh();
      scene.add(mesh);
      grenadePickMeshes.set(g.id, mesh);
    }
    const mesh = grenadePickMeshes.get(g.id);
    mesh.position.set(g.x, 0.35 + Math.sin(now * 0.003) * 0.08, g.z);
    mesh.rotation.y = now * 0.002;
  }
  for (const [id, mesh] of grenadePickMeshes)
    if (!seen.has(id)) { scene.remove(mesh); grenadePickMeshes.delete(id); }
}

function syncPlayerLights(players) {
  const seen = new Set();
  for (const p of players) {
    seen.add(p.id);
    if (!p.alive && !p.downed) {
      if (playerLights.has(p.id)) playerLights.get(p.id).light.visible = false;
      if (playerBodyLights.has(p.id)) playerBodyLights.get(p.id).light.visible = false;
      continue;
    }
    if (!playerLights.has(p.id)) {
      // r170 physical units: intensity in candela, decay=2, distance=0 → no cutoff
      const light = new THREE.SpotLight(0xfff0cc, 250, 0, Math.PI / 3.5, 0.40, 2);
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far  = 22;
      const tgt = new THREE.Object3D();
      light.target = tgt;
      scene.add(light, tgt);
      playerLights.set(p.id, { light, tgt });
    }
    const { light, tgt } = playerLights.get(p.id);
    light.visible = !p.downed;
    if (!p.downed) {
      const angle = (p.id === net.playerId) ? getMouseAngle() : p.angle;
      light.position.set(p.x + Math.sin(angle) * 0.3, 0.7, p.z + Math.cos(angle) * 0.3);
      tgt.position.set(p.x + Math.sin(angle) * 18, 0, p.z + Math.cos(angle) * 18);
      tgt.updateMatrixWorld();
    }

    // Soft body glow so players are visible inside fog
    if (!playerBodyLights.has(p.id)) {
      const light = new THREE.SpotLight(0xffffff, 900, 8, Math.PI / 22, 0.08, 2);
      light.castShadow = false;
      const tgt = new THREE.Object3D();
      light.target = tgt;
      scene.add(light, tgt);
      playerBodyLights.set(p.id, { light, tgt });
    }
    const { light: bl, tgt: blTgt } = playerBodyLights.get(p.id);
    bl.visible = PLAYER_BODY_LIGHT_ENABLED;
    bl.position.set(p.x, 5.0, p.z);
    blTgt.position.set(p.x, 0, p.z);
    blTgt.updateMatrixWorld();
  }
  for (const [id, { light, tgt }] of playerLights) {
    if (!seen.has(id)) { scene.remove(light); scene.remove(tgt); playerLights.delete(id); }
  }
  for (const [id, {light, tgt}] of playerBodyLights) {
    if (!seen.has(id)) { scene.remove(light); scene.remove(tgt); playerBodyLights.delete(id); }
  }
  // Red alarm light above pinned/pulled players
  for (const p of players) {
    if (!p.alive && !p.downed) { if (pinnedLights.has(p.id)) pinnedLights.get(p.id).visible = false; continue; }
    if (p.pinnedBy || p.pulledBy) {
      if (!pinnedLights.has(p.id)) {
        const pl = new THREE.PointLight(0xff2200, 25, 7, 2);
        scene.add(pl);
        pinnedLights.set(p.id, pl);
      }
      const pl = pinnedLights.get(p.id);
      pl.visible = true;
      pl.position.set(p.x, 4, p.z);
    } else if (pinnedLights.has(p.id)) {
      pinnedLights.get(p.id).visible = false;
    }
  }
  for (const [id, pl] of pinnedLights) {
    if (!seen.has(id)) { scene.remove(pl); pinnedLights.delete(id); }
  }
}

function syncPickups(pickups, now) {
  const seen = new Set();
  for (const pk of pickups) {
    seen.add(pk.id);
    if (!pickupMeshes.has(pk.id)) {
      const mesh = makePickupMesh(pk.weapon);
      mesh.position.set(pk.x, 0, pk.z);
      scene.add(mesh);
      pickupMeshes.set(pk.id, mesh);
    }
    const mesh = pickupMeshes.get(pk.id);
    mesh.visible = pk.active;
    if (pk.active) mesh.rotation.y = now * 0.001;
  }
  for (const [id, mesh] of pickupMeshes)
    if (!seen.has(id)) { scene.remove(mesh); pickupMeshes.delete(id); }
}

const _weaponPromptEl = document.getElementById('weapon-prompt');
const WEAPON_NAMES = { shotgun: 'Shotgun', ak47: 'AK-47', sniper: 'Sniper', pistol: 'Pistol' };
function updateInteractPrompt(state) {
  if (!_weaponPromptEl) return;
  const me = state.players?.find(p => p.id === net.playerId);
  if (!me?.alive) { _weaponPromptEl.style.display = 'none'; return; }

  const wr2 = WEAPON_PICKUP_RADIUS * WEAPON_PICKUP_RADIUS;
  for (const pk of (state.pickups ?? [])) {
    if (!pk.active) continue;
    if (pk.weapon !== 'random' && me.weapon === pk.weapon) continue;
    const dx = me.x - pk.x, dz = me.z - pk.z;
    if (dx*dx + dz*dz < wr2) {
      _weaponPromptEl.textContent = `[E] Pick up ${WEAPON_NAMES[pk.weapon] ?? pk.weapon}`;
      _weaponPromptEl.style.display = 'block';
      return;
    }
  }

  const gr2 = GRENADE_PICKUP_RADIUS * GRENADE_PICKUP_RADIUS;
  for (const gp of (state.grenadePicks ?? [])) {
    const dx = me.x - gp.x, dz = me.z - gp.z;
    if (dx*dx + dz*dz < gr2) {
      _weaponPromptEl.textContent = '[E] Pick up Grenade';
      _weaponPromptEl.style.display = 'block';
      return;
    }
  }

  const hr2 = HEALTHPACK_PICKUP_RADIUS * HEALTHPACK_PICKUP_RADIUS;
  for (const hp of (state.healthpacks ?? [])) {
    if (!hp.active) continue;
    const dx = me.x - hp.x, dz = me.z - hp.z;
    if (dx*dx + dz*dz < hr2) {
      _weaponPromptEl.textContent = '[E] Pick up Med Kit';
      _weaponPromptEl.style.display = 'block';
      return;
    }
  }

  const MISSION_ITEM_NAMES = { fuel: 'Fuel Can', repairKit: 'Repair Kit', plank: 'Wood Plank', genkey: 'Generator Key' };
  const mr2 = MISSION_PICKUP_RADIUS * MISSION_PICKUP_RADIUS;
  if (!me.carrying) {
    for (const item of (state.mission?.items ?? [])) {
      const dx = me.x - item.x, dz = me.z - item.z;
      if (dx*dx + dz*dz < mr2) {
        _weaponPromptEl.textContent = `[E] Pick up ${MISSION_ITEM_NAMES[item.type] ?? item.type}`;
        _weaponPromptEl.style.display = 'block';
        return;
      }
    }
  }

  _weaponPromptEl.style.display = 'none';
}

// ─────────────────────────────────────────────────────────────────────────────
// Boss slam rings (visual AOE indicator)
// ─────────────────────────────────────────────────────────────────────────────
const _slamRings = [];

// ─────────────────────────────────────────────────────────────────────────────
// Ping system
// ─────────────────────────────────────────────────────────────────────────────
const _pingMarkers = [];
const PING_CFG = {
  point:  { label: 'POINT',  color: 0xffdd44, hex: '#ffdd44' },
  danger: { label: 'DANGER', color: 0xff4444, hex: '#ff4444' },
  help:   { label: 'HELP',   color: 0x44ff88, hex: '#44ff88' },
};
let _pingMenuOpen = false;
let _pingSelected = null;
const $pingMenu = document.getElementById('ping-menu');

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
      vfx.muzzleFlash(me.x, me.z, me.angle, weapon);
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
      dmgNums.spawn(e.x, e.z, Math.round(prev.hp - e.hp));
    }
  }
  _prevEnemyMap = curMap;

  // Acid splat when acid blobs disappear
  // (tracked implicitly via VFX; acid hit is handled by player hurt detection above)
}

// ─────────────────────────────────────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────────────────────────────────────
const input  = new InputHandler();
const mobile = new MobileControls(input);

mobile.onPingBtn = () => {
  if (!gameStarted) return;
  const me = (interp.get() ?? net.latestState)?.players?.find(p => p.id === net.playerId);
  if (!me?.alive || me?.downed) return;
  document.getElementById('ping-mobile-modal')?.classList.add('open');
};
document.querySelectorAll('.ping-mob-btn').forEach(btn => {
  btn.addEventListener('touchstart', e => {
    e.preventDefault();
    document.getElementById('ping-mobile-modal')?.classList.remove('open');
    const type = btn.dataset.type;
    const me = (interp.get() ?? net.latestState)?.players?.find(p => p.id === net.playerId);
    const px = me ? me.x + Math.sin(me.angle) * 4 : 0;
    const pz = me ? me.z + Math.cos(me.angle) * 4 : 0;
    net.socket.emit('playerPing', { type, x: px, z: pz });
  }, { passive: false });
});

function getMouseAngle() {
  if (input.mobileAimAngle !== null) return input.mobileAimAngle;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(
    (input.mouseX / innerWidth) * 2 - 1,
    -(input.mouseY / innerHeight) * 2 + 1
  ), camera);
  const plane = new THREE.Plane(new THREE.Vector3(0,1,0), -1.1);
  const target = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, target);
  const localPos = playerMeshes.get(net.playerId)?.mesh.position;
  if (!localPos) return 0;
  return Math.atan2(target.x - localPos.x, target.z - localPos.z);
}

function getMouseWorldPos() {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(
    (input.mouseX / innerWidth) * 2 - 1,
    -(input.mouseY / innerHeight) * 2 + 1
  ), camera);
  const plane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
  const tgt = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, tgt);
  return { x: tgt.x, z: tgt.z };
}

function clampToThrowRange(playerPos, target) {
  const dx = target.x - playerPos.x, dz = target.z - playerPos.z;
  const dist = Math.sqrt(dx*dx + dz*dz);
  if (dist <= GRENADE_THROW_RANGE) return target;
  return { x: playerPos.x + dx/dist * GRENADE_THROW_RANGE, z: playerPos.z + dz/dist * GRENADE_THROW_RANGE };
}

function _pingAngDist(a, b) { let d = Math.abs(a - b); if (d > Math.PI) d = 2 * Math.PI - d; return d; }

function _openPingMenu() {
  if (!gameStarted) return;
  const me = (interp.get() ?? net.latestState)?.players?.find(p => p.id === net.playerId);
  if (!me?.alive || me?.downed) return;
  _pingMenuOpen = true;
  $pingMenu?.classList.add('open');
}

function _closePingMenu(fire) {
  _pingMenuOpen = false;
  $pingMenu?.classList.remove('open');
  document.querySelectorAll('.ping-opt').forEach(el => el.classList.remove('active'));
  if (fire && _pingSelected) {
    const pos = getMouseWorldPos();
    net.socket.emit('playerPing', { type: _pingSelected, x: pos.x, z: pos.z });
  }
  _pingSelected = null;
}

function _updatePingMenu() {
  if (!_pingMenuOpen) return;
  const cx = innerWidth / 2, cy = innerHeight / 2;
  const dx = input.mouseX - cx, dy = input.mouseY - cy;
  if (Math.hypot(dx, dy) < 24) {
    _pingSelected = null;
    document.querySelectorAll('.ping-opt').forEach(el => el.classList.remove('active'));
    return;
  }
  const angle = Math.atan2(dy, dx);
  const sectors = { point: -Math.PI / 2, danger: Math.PI / 6, help: 5 * Math.PI / 6 };
  _pingSelected = Object.keys(sectors).reduce(
    (a, b) => _pingAngDist(angle, sectors[a]) < _pingAngDist(angle, sectors[b]) ? a : b
  );
  document.querySelectorAll('.ping-opt').forEach(el => el.classList.remove('active'));
  document.getElementById(`ping-opt-${_pingSelected}`)?.classList.add('active');
}

function _spawnPingMarker(x, z, type) {
  const cfg = PING_CFG[type];
  if (!cfg) return;
  const geo = new THREE.ConeGeometry(0.22, 0.55, 4);
  geo.rotateX(Math.PI);
  const mat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 2.5, z);
  scene.add(mesh);
  _pingMarkers.push({ mesh, mat, timer: 5, maxTimer: 5, x, z, type });
}

// Grenade targeting ring (shown while holding G)
const _grenadeTargetRing = (() => {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(GRENADE_RADIUS - 0.15, GRENADE_RADIUS + 0.15, 32), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.06;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
})();

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
net.socket.on('roomClosed',    () => { _returnToLobby(); showMsg('Room closed by host', '#ff8844', 3000); });

net.onJoined = ({ slot, roomId, token, reconnected, appearance }) => {
  mySlot = slot;
  if (token && roomId) {
    const name = document.getElementById('name-input').value.trim();
    localStorage.setItem('fsReconnect', JSON.stringify({ token, roomId, name }));
  }
  if (appearance) {
    Object.assign(_appearance, appearance);
    _saveAppearance();
    outfitRow.querySelectorAll('.swatch').forEach((s, j) => s.classList.toggle('selected', j === _appearance.outfit));
  }
  if (!reconnected) {
    document.getElementById('lobby').style.display     = 'none';
    document.getElementById('room-wait').style.display = 'flex';
    document.getElementById('wait-room-code').textContent = `Room: ${roomId ?? '—'}`;
  }
  // Re-sync ready state so server stays in sync after any reconnect or auto-rejoin
  const wasReady = _isReady || _goReady || _vicReady;
  if (wasReady) net.socket.emit('playerReady', true);
};

// Auto-reconnect on connect if token stored
net.socket.on('connect', () => {
  const saved = (() => { try { return JSON.parse(localStorage.getItem('fsReconnect') ?? 'null'); } catch(_) { return null; } })();
  if (saved?.token && gameStarted === false) {
    net.tryReconnect(saved.token, saved.roomId);
  }
});

// Intentional close/refresh → permanent leave (not reconnect-eligible)
window.addEventListener('beforeunload', () => {
  localStorage.removeItem('fsReconnect');
  net.socket.emit('leaveRoom');
});

net.onRoomFull = () => { alert('Room is full (4/4). Try a different room code.'); };

net.socket.on('lobbyState', ({ players, readyCount, totalCount, voteCounts, fogVoteCounts, difficultyVoteCounts, hostId }) => {
  const forceBtn = document.getElementById('force-start-btn');
  if (forceBtn) forceBtn.style.display = (hostId && hostId === net.socket.id) ? 'block' : 'none';
  // Update vote counts on buttons
  if (voteCounts) {
    for (const [mapId, count] of Object.entries(voteCounts)) {
      const el = document.getElementById(`vote-count-${mapId}`);
      if (el) el.textContent = count;
    }
  }
  if (fogVoteCounts) {
    const yesEl = document.getElementById('fog-vote-count-yes');
    const noEl  = document.getElementById('fog-vote-count-no');
    if (yesEl) yesEl.textContent = fogVoteCounts.yes;
    if (noEl)  noEl.textContent  = fogVoteCounts.no;
  }
  if (difficultyVoteCounts) {
    for (const diff of ['easy', 'normal', 'hard']) {
      const el = document.getElementById(`difficulty-vote-count-${diff}`);
      if (el) el.textContent = difficultyVoteCounts[diff] ?? 0;
    }
  }
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  for (const p of players) {
    const color = '#' + (OUTFIT_COLORS[p.outfit] ?? PLAYER_COLORS[p.slot] ?? 0xffffff).toString(16).padStart(6,'0');
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `<div class="pw-avatar" style="background:${color}"></div>
      <div class="pw-name">${p.name}</div>
      <div class="pw-ready ${p.ready?'ready':'waiting'}">${p.ready?'READY':'WAITING'}</div>`;
    list.appendChild(row);
  }
  _updateOutfitSwatches(players);
  const txt = `${readyCount}/${totalCount} ready — waiting for all players...`;
  document.getElementById('wait-status').textContent    = txt;
  document.getElementById('go-wait-status').textContent = txt;
});

net.socket.on('gameStart', ({ wave, mapId, fogEnabled }) => {
  document.getElementById('room-wait').style.display = 'none';
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('victory').style.display   = 'none';
  document.getElementById('hud').style.display       = '';
  _isReady = false; _goReady = false; _vicReady = false;
  document.getElementById('ready-btn').textContent = 'Ready';
  document.getElementById('ready-btn').classList.remove('is-ready');
  document.getElementById('go-ready-btn').textContent = 'Play Again';
  document.getElementById('go-ready-btn').classList.remove('is-ready');
  loadMap(mapId, fogEnabled !== false);
  mobile.show();
  for (let _s = 0; _s < 4; _s++) document.getElementById(`p-usables-${_s}`)?.classList.add('visible');
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
  _myFogVote = null;
  _myDifficultyVote = null;
  document.querySelectorAll('.map-vote-btn').forEach(b => b.classList.remove('voted'));
  document.querySelectorAll('.fog-vote-btn').forEach(b => b.classList.remove('voted'));
  document.querySelectorAll('.difficulty-vote-btn').forEach(b => b.classList.remove('voted'));
  updateWaveHUD(wave);
  showMsg(`WAVE ${wave}`, '#ffdd44', 2200);
  // Clear entity maps for fresh game
  [playerMeshes, enemyMeshes, bulletMeshes, acidMeshes, pickupMeshes, healthpackMeshes].forEach(m => {
    m.forEach(v => scene.remove(v.mesh ?? v));
    m.clear();
  });
  missionItemMeshes.forEach(m => scene.remove(m)); missionItemMeshes.clear();
  if (_missionCarMarker) { scene.remove(_missionCarMarker); _missionCarMarker = null; }
  _missionLabel = '';
  _missionLog   = [];
  const _mHud = document.getElementById('mission-hud');
  if (_mHud) _mHud.style.display = 'none';
  playerLights.forEach(({ light, tgt }) => { scene.remove(light); scene.remove(tgt); });
  playerLights.clear();
  playerBodyLights.forEach(({light, tgt}) => { scene.remove(light); scene.remove(tgt); });
  playerBodyLights.clear();
  pinnedLights.forEach(pl => scene.remove(pl));
  pinnedLights.clear();
  tongueMeshes.forEach(t => scene.remove(t.line));
  tongueMeshes.clear();
  for (const pm of _pingMarkers) scene.remove(pm.mesh);
  _pingMarkers.length = 0;
});

net.socket.on('gameReconnect', ({ wave, mapId, fogEnabled }) => {
  document.getElementById('lobby').style.display     = 'none';
  document.getElementById('room-wait').style.display = 'none';
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('victory').style.display   = 'none';
  document.getElementById('hud').style.display       = '';
  loadMap(mapId, fogEnabled !== false);
  mobile.show();
  for (let _s = 0; _s < 4; _s++) document.getElementById(`p-usables-${_s}`)?.classList.add('visible');
  gameStarted   = true;
  _prevMyHp     = PLAYER_MAX_HP;
  _prevEnemyMap = new Map();
  _shootCdLocal = 0;
  audio.startAmbient?.(mapId);
  updateWaveHUD(wave);
  showMsg('Reconnected', '#44ffaa', 2500);
});

net.socket.on('gameOver', ({ wave, survivalTime, players }) => {
  _hideWaveStats();
  gameStarted = false;
  document.getElementById('go-wave').textContent = wave;
  document.getElementById('go-time').textContent = _fmtTime(survivalTime);
  const list = document.getElementById('go-player-list');
  list.innerHTML = '<div class="go-header"><div></div><div>Player</div><div class="go-hstat">Kills</div><div class="go-hstat">Dmg</div><div class="go-hstat">Rev</div><div class="go-hstat">Acc</div></div>';
  [...players].sort((a,b) => b.kills - a.kills).forEach(p => {
    const color = '#' + (PLAYER_COLORS[p.slot] ?? 0xffffff).toString(16).padStart(6,'0');
    const acc = p.shotsFired > 0 ? Math.round(p.shotsHit / p.shotsFired * 100) : 0;
    const row = document.createElement('div');
    row.className = 'go-row';
    row.innerHTML = `<div class="go-avatar" style="background:${color}"></div>
      <div class="go-name">${p.name}</div>
      <div class="go-stat">${p.kills}</div>
      <div class="go-stat">${p.damage}</div>
      <div class="go-stat">${p.revives}</div>
      <div class="go-stat">${acc}%</div>`;
    list.appendChild(row);
  });
  document.getElementById('go-wait-status').textContent = 'Waiting for all players...';
  document.getElementById('game-over').style.display = 'flex';
});

net.onPlayerDied = ({ playerId }) => {
  if (playerId === net.playerId) { showMsg('YOU DIED', '#ff4444', 0); shakeCamera(0.5); }
};
net.onPlayerWon  = ({ name }) => { showMsg(`${name} reached the Safe House!`, '#44ff88', 4000); };
net.onNewWave    = ({ wave }) => { updateWaveHUD(wave); showMsg(`WAVE ${wave}`, '#ffdd44', 2200); audio.newWave(); _hideWaveStats(); };
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

// ── Ping ─────────────────────────────────────────────────────────────────────
net.socket.on('playerPing', ({ name, slot, type, x, z }) => {
  const cfg = PING_CFG[type];
  if (!cfg) return;
  const feed = document.getElementById('kill-feed');
  if (feed) {
    const row = document.createElement('div');
    row.className = 'kf-row';
    row.style.color = cfg.hex;
    row.textContent = `${name}: ${cfg.label}`;
    feed.appendChild(row);
    setTimeout(() => { row.style.opacity = '0'; setTimeout(() => row.remove(), 400); }, 5000);
    while (feed.children.length > 5) feed.removeChild(feed.firstChild);
  }
  _spawnPingMarker(x, z, type);
});

// ── Grenade throw arcs ────────────────────────────────────────────────────────
net.socket.on('grenadeThrown', ({ id, ox, oz, tx, tz }) => {
  grenadeArcs.set(id, { ox, oz, tx, tz, startTime: performance.now() });
});

net.socket.on('beaconThrown', ({ ox, oz, tx, tz }) => {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 6, 5),
    new THREE.MeshLambertMaterial({ color: 0x44ff88, emissive: 0x22cc66, emissiveIntensity: 0.9 })
  );
  scene.add(mesh);
  flyingBeacons.push({ mesh, ox, oz, tx, tz, startTime: performance.now(), duration: 0.6 });
});

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

// ── Downed / Revive ──────────────────────────────────────────────────────────
net.socket.on('playerDowned', ({ playerId }) => {
  if (playerId === net.playerId) showMsg('YOU ARE DOWN! Teammates can revive you.', '#ff6600', 0);
  else {
    const st = interp.get() ?? net.latestState;
    const p  = st?.players?.find(q => q.id === playerId);
    if (p) showMsg(`${p.name} is DOWN!`, '#ff6600', 3000);
  }
  shakeCamera(0.25);
});

net.socket.on('playerRevived', ({ playerId, revivedBy }) => {
  const st   = interp.get() ?? net.latestState;
  const p    = st?.players?.find(q => q.id === playerId);
  const r    = st?.players?.find(q => q.id === revivedBy);
  const name = p?.name ?? 'Player';
  const rname= r?.name ?? 'teammate';
  showMsg(`${name} revived by ${rname}!`, '#44ff88', 3000);
});

// ── Tank charge ──────────────────────────────────────────────────────────────
net.socket.on('tankCharge', () => {
  showMsg('TANK CHARGING!', '#ff2200', 1500);
  shakeCamera(0.2);
});

// ── Acid puddle ──────────────────────────────────────────────────────────────
net.socket.on('acidPuddle', ({ x, z, radius, duration }) => {
  // Visual: green translucent disc
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.05, 24),
    new THREE.MeshBasicMaterial({ color: 0x44ff22, transparent: true, opacity: 0.45, depthWrite: false })
  );
  mesh.position.set(x, 0.03, z);
  scene.add(mesh);
  // Fade + remove after duration
  const startTime = performance.now();
  function fadeAcid() {
    const age = (performance.now() - startTime) / 1000;
    if (age >= duration) { scene.remove(mesh); mesh.geometry.dispose(); return; }
    mesh.material.opacity = 0.45 * (1 - age / duration);
    requestAnimationFrame(fadeAcid);
  }
  requestAnimationFrame(fadeAcid);
});

// ── Perk phase ────────────────────────────────────────────────────────────────
const $perkOverlay = document.getElementById('perk-overlay');
const $perkCards   = document.getElementById('perk-cards');
const $perkTimer   = document.getElementById('perk-timer');
let _perkTimerInterval = null;

net.socket.on('perkOffer', ({ options, timeLeft, wave }) => {
  if (!$perkOverlay || !$perkCards) return;
  $perkCards.innerHTML = '';
  for (const perk of options) {
    const btn = document.createElement('button');
    btn.className = 'perk-card';
    btn.innerHTML = `<div class="perk-name">${perk.name}</div><div class="perk-desc">${perk.desc}</div>`;
    btn.addEventListener('click', () => {
      net.socket.emit('perkChoice', perk.id);
      $perkOverlay.style.display = 'none';
      clearInterval(_perkTimerInterval);
    });
    $perkCards.appendChild(btn);
  }
  let secs = Math.ceil(timeLeft);
  if ($perkTimer) $perkTimer.textContent = secs;
  $perkOverlay.style.display = 'flex';
  clearInterval(_perkTimerInterval);
  _perkTimerInterval = setInterval(() => {
    secs--;
    if ($perkTimer) $perkTimer.textContent = secs;
    if (secs <= 0) clearInterval(_perkTimerInterval);
  }, 1000);
  showMsg(`WAVE ${wave} — CHOOSE A PERK!`, '#ffdd44', 0);
});

net.socket.on('perkApplied', ({ perk }) => {
  showMsg(`PERK: ${perk.name}`, '#aaffdd', 3000);
});

net.socket.on('perkPhaseEnd', () => {
  if ($perkOverlay) $perkOverlay.style.display = 'none';
  clearInterval(_perkTimerInterval);
  $msg.textContent = '';
});

net.socket.on('perkPhaseStart', () => {
  // Non-eligible players (spectating) just see a message
  if ($perkOverlay?.style.display !== 'flex') {
    showMsg('PERK SELECTION...', '#aaffdd', 0);
  }
});

// ── City missions ─────────────────────────────────────────────────────────────
net.socket.on('missionUpdate', ({ phase, label }) => {
  _missionLabel = label;
  // Mark previous step done, add new current step
  if (_missionLog.length > 0) _missionLog[_missionLog.length - 1].done = true;
  _missionLog.push({ label, done: false });
  if (phase === 1) showMsg('Fuel loaded! Starting engine...', '#ff8800', 3000);
  else if (phase === 2) showMsg('Engine broken! Find the repair kit.', '#ff8800', 4000);
  else if (phase === 3) showMsg('DEFEND THE MECHANIC!', '#ff2200', 4000);
  else if (phase === 4) showMsg('Car repaired! Run to the safe house!', '#44ff88', 5000);
});

net.socket.on('missionItemPickup', ({ playerId }) => {
  if (playerId === net.playerId) audio.pickup?.();
});

net.socket.on('missionItemDropped', ({ itemId, x, z }) => {
  const mesh = missionItemMeshes.get(itemId);
  if (mesh) mesh.position.set(x, 0, z);
});

net.socket.on('defendHorde', () => {
  showMsg('HORDE INCOMING! Defend the mechanic!', '#ff2200', 4000);
  shakeCamera(0.35);
  audio.newWave?.();
});

// ── Beacon ───────────────────────────────────────────────────────────────────
net.socket.on('beaconLanded', ({ x, z, duration, radius }) => {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.08, 32),
    new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.35, depthWrite: false })
  );
  mesh.position.set(x, 0.05, z);
  scene.add(mesh);
  const pulse = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.5, 12),
    new THREE.MeshBasicMaterial({ color: 0xffdd44 })
  );
  pulse.position.set(x, 0.25, z);
  scene.add(pulse);
  const start = performance.now();
  function fadeBeacon() {
    const age = (performance.now() - start) / 1000;
    if (age >= duration) { scene.remove(mesh); scene.remove(pulse); mesh.geometry.dispose(); return; }
    mesh.material.opacity = 0.35 * (1 - age / duration);
    pulse.position.y = 0.25 + Math.sin(age * 4) * 0.15;
    requestAnimationFrame(fadeBeacon);
  }
  requestAnimationFrame(fadeBeacon);
  showMsg('BEACON DEPLOYED!', '#ffdd44', 2000);
});

// ── Jumper pin ────────────────────────────────────────────────────────────────
net.socket.on('playerPinned', ({ playerId }) => {
  if (playerId === net.playerId) {
    showMsg('PINNED! Teammate must rescue you!', '#ff4400', 0);
    shakeCamera(0.3);
  } else {
    const st = interp.get() ?? net.latestState;
    const p  = st?.players?.find(q => q.id === playerId);
    if (p) showMsg(`${p.name} is PINNED!`, '#ff4400', 3000);
  }
});

net.socket.on('playerUnpinned', ({ playerId }) => {
  if (playerId === net.playerId) showMsg('RESCUED!', '#44ff88', 2000);
});

// ── Smoker tongue ─────────────────────────────────────────────────────────────
net.socket.on('tongueShot', ({ id, ownerId, ox, oz, tx, tz }) => {
  const dist = Math.sqrt((tx - ox) ** 2 + (tz - oz) ** 2);
  const dx = dist > 0 ? (tx - ox) / dist : 0;
  const dz = dist > 0 ? (tz - oz) / dist : 0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([ox, 0.9, oz, ox, 0.9, oz]), 3));
  const line = new THREE.Line(geo, _tongueMat);
  scene.add(line);
  tongueMeshes.set(id, { line, ox, oz, dx, dz, dist: 0, attached: false, ownerId, targetId: null });
});

net.socket.on('tongueAttached', ({ tongueId, playerId }) => {
  const t = tongueMeshes.get(tongueId);
  if (t) { t.attached = true; t.targetId = playerId; }
  if (playerId === net.playerId) {
    showMsg('GRABBED by smoker! Teammate must rescue!', '#aa44ff', 0);
    shakeCamera(0.25);
  }
});

net.socket.on('tongueDead', ({ tongueId }) => {
  const t = tongueMeshes.get(tongueId);
  if (t) { scene.remove(t.line); tongueMeshes.delete(tongueId); }
});

net.socket.on('tongueRescued', ({ playerId, tongueId }) => {
  if (tongueId !== undefined) {
    const t = tongueMeshes.get(tongueId);
    if (t) { scene.remove(t.line); tongueMeshes.delete(tongueId); }
  }
  if (playerId === net.playerId) showMsg('RESCUED from tongue!', '#44ff88', 2000);
});

// ── Victory ──────────────────────────────────────────────────────────────────
net.onVictory = ({ wave, survivalTime, players }) => {
  _hideWaveStats();
  gameStarted = false;
  document.getElementById('vic-wave').textContent = wave;
  document.getElementById('vic-time').textContent = _fmtTime(survivalTime);
  const list = document.getElementById('vic-player-list');
  list.innerHTML = '<div class="go-header"><div></div><div>Player</div><div class="go-hstat">Kills</div><div class="go-hstat">Dmg</div><div class="go-hstat">Rev</div><div class="go-hstat">Acc</div></div>';
  [...players].sort((a,b) => b.kills - a.kills).forEach(p => {
    const color = '#' + (PLAYER_COLORS[p.slot] ?? 0xffffff).toString(16).padStart(6,'0');
    const acc = p.shotsFired > 0 ? Math.round(p.shotsHit / p.shotsFired * 100) : 0;
    const row = document.createElement('div');
    row.className = 'go-row';
    row.innerHTML = `<div class="go-avatar" style="background:${color}"></div>
      <div class="go-name">${p.name}</div>
      <div class="go-stat">${p.kills}</div>
      <div class="go-stat">${p.damage}</div>
      <div class="go-stat">${p.revives}</div>
      <div class="go-stat">${acc}%</div>`;
    list.appendChild(row);
  });
  document.getElementById('vic-wait-status').textContent = 'Waiting for all players...';
  document.getElementById('victory').style.display = 'flex';
  audio.victory();
};

// ── Reconnect ─────────────────────────────────────────────────────────────────
net.socket.on('reconnectFailed', () => {
  const saved = (() => { try { return JSON.parse(localStorage.getItem('fsReconnect') ?? 'null'); } catch(_) { return null; } })();
  localStorage.removeItem('fsReconnect');
  // Auto-rejoin if player is stuck on the waiting screen (lobby disconnect, not in-game)
  if (document.getElementById('room-wait').style.display !== 'none' && saved?.roomId) {
    const name = saved.name || document.getElementById('name-input').value.trim() || 'Player';
    net.joinRoom(saved.roomId, name, _appearance);
  }
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

// Build outfit swatches
const outfitRow = document.getElementById('outfit-swatches');
OUTFIT_COLORS.forEach((col, i) => {
  const sw = document.createElement('div');
  sw.className = 'swatch' + (_appearance.outfit === i ? ' selected' : '');
  sw.style.background = '#' + col.toString(16).padStart(6, '0');
  sw.addEventListener('click', () => {
    if (sw.classList.contains('disabled')) return;
    _appearance.outfit = i; _saveAppearance();
    outfitRow.querySelectorAll('.swatch').forEach((s, j) => s.classList.toggle('selected', j === i));
  });
  outfitRow.appendChild(sw);
});

function _updateOutfitSwatches(players) {
  const takenByOthers = new Set(
    players.filter(p => p.id !== net.playerId).map(p => p.outfit)
  );
  outfitRow.querySelectorAll('.swatch').forEach((sw, i) => {
    sw.classList.toggle('disabled', takenByOthers.has(i) && _appearance.outfit !== i);
  });
}

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
  const name   = document.getElementById('name-input').value.trim();
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
document.getElementById('force-start-btn').addEventListener('click', () => {
  net.socket.emit('forceStart');
});
let _goReady = false;
document.getElementById('go-ready-btn').addEventListener('click', () => {
  _goReady = !_goReady; net.socket.emit('playerReady', _goReady);
  const btn = document.getElementById('go-ready-btn');
  btn.textContent = _goReady ? 'Cancel' : 'Play Again';
  btn.classList.toggle('is-ready', _goReady);
});
document.getElementById('go-exit-btn').addEventListener('click', _returnToLobby);

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

// ── Fog voting buttons ────────────────────────────────────────────────────────
let _myFogVote = null;
document.querySelectorAll('.fog-vote-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    _myFogVote = btn.dataset.fog;
    net.socket.emit('fogVote', _myFogVote);
    document.querySelectorAll('.fog-vote-btn').forEach(b => b.classList.remove('voted'));
    btn.classList.add('voted');
  });
});

// ── Difficulty voting buttons ─────────────────────────────────────────────────
let _myDifficultyVote = null;
document.querySelectorAll('.difficulty-vote-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    _myDifficultyVote = btn.dataset.diff;
    net.socket.emit('difficultyVote', _myDifficultyVote);
    document.querySelectorAll('.difficulty-vote-btn').forEach(b => b.classList.remove('voted'));
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

// ── Settings / Pause overlay ──────────────────────────────────────────────────
const _settingsOverlay = document.getElementById('settings-overlay');
const _openPause  = () => { _settingsOverlay.style.display = 'flex'; };
const _closePause = () => { _settingsOverlay.style.display = 'none'; };

document.getElementById('settings-btn')?.addEventListener('click', _openPause);
document.getElementById('close-settings')?.addEventListener('click', _closePause);

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (!gameStarted) return;
  _settingsOverlay.style.display === 'none' ? _openPause() : _closePause();
});

function _returnToLobby() {
  _closePause();
  mobile.hide();
  for (let _s = 0; _s < 4; _s++) document.getElementById(`p-usables-${_s}`)?.classList.remove('visible');
  gameStarted = false;
  localStorage.removeItem('fsReconnect');
  // Tell server to permanently remove us (skips reconnect hold)
  net.socket.emit('leaveRoom');
  net.playerId = null;
  net.slot     = null;
  // Clear all entity meshes from scene
  [playerMeshes, enemyMeshes, bulletMeshes, acidMeshes, pickupMeshes, healthpackMeshes, grenadeMeshes, grenadePickMeshes].forEach(m => {
    m.forEach(v => scene.remove(v.mesh ?? v));
    m.clear();
  });
  grenadeArcs.clear();
  for (const fb of flyingBeacons) scene.remove(fb.mesh);
  flyingBeacons.length = 0;
  _grenadeTargetRing.visible = false;
  tongueMeshes.forEach(t => scene.remove(t.line));
  tongueMeshes.clear();
  missionItemMeshes.forEach(m => scene.remove(m)); missionItemMeshes.clear();
  if (_missionCarMarker) { scene.remove(_missionCarMarker); _missionCarMarker = null; }
  playerLights.forEach(({ light, tgt }) => { scene.remove(light); scene.remove(tgt); });
  playerLights.clear();
  playerBodyLights.forEach(({light, tgt}) => { scene.remove(light); scene.remove(tgt); });
  playerBodyLights.clear();
  pinnedLights.forEach(pl => scene.remove(pl));
  pinnedLights.clear();
  for (let i = _slamRings.length - 1; i >= 0; i--) { scene.remove(_slamRings[i].mesh); }
  _slamRings.length = 0;
  for (const pm of _pingMarkers) scene.remove(pm.mesh);
  _pingMarkers.length = 0;
  _closePingMenu(false);
  // Hide all in-game screens, show lobby
  ['room-wait','game-over','victory','hud'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('lobby').style.display = 'flex';
}

document.getElementById('back-to-menu-btn')?.addEventListener('click', _returnToLobby);
document.getElementById('room-wait-back-btn')?.addEventListener('click', _returnToLobby);

document.getElementById('reset-server-btn')?.addEventListener('click', async () => {
  await fetch('/api/rooms', { method: 'DELETE' });
  _returnToLobby();
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
      `<div class="room-item" data-room="${r.id}" style="display:flex;align-items:center;gap:8px;cursor:pointer">
         <span style="flex:1"><b>${r.id}</b> — ${r.playerCount}/4 players, wave ${r.wave ?? 1}${r.gameStarted ? ' (in progress)' : ''}</span>
         <button class="room-delete-btn" data-room="${r.id}" title="Delete room" style="background:#c0392b;border:none;color:#fff;border-radius:4px;padding:2px 7px;cursor:pointer;flex-shrink:0">✕</button>
       </div>`
    ).join('');
    list.querySelectorAll('.room-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('room-delete-btn')) return;
        document.getElementById('room-input').value = el.dataset.room;
      });
    });
    list.querySelectorAll('.room-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const roomId = btn.dataset.room;
        await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE' });
        loadRooms();
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
const $wave      = document.getElementById('wave');
const $msg       = document.getElementById('msg');
const $reBar     = document.getElementById('reload-bar');
const $reFill    = document.getElementById('reload-fill');
const $objBar    = document.getElementById('obj-bar');
const $objFill   = document.getElementById('obj-fill');
const $objLabel  = document.getElementById('obj-label');
const $waterOver = document.getElementById('water-overlay');
const $vignette  = document.getElementById('damage-vignette');
const $ammoDisp  = document.getElementById('ammo-display');
const $ammoWep   = document.getElementById('ammo-weapon-name');
const $ammoCur   = document.getElementById('ammo-cur');
const $ammoRes   = document.getElementById('ammo-res');
let msgTimer = null;
const SLOT_HEX = PLAYER_COLORS.map(c => '#' + c.toString(16).padStart(6,'0'));

let _waveStatsTimer = null;
const $waveStats = document.getElementById('wave-stats');
const $wsSec     = document.getElementById('ws-sec');
const $wsPlayers = document.getElementById('ws-player-list');

function _showWaveStats(wave, delay, players) {
  if (!players?.length) return;
  $wsPlayers.innerHTML = '<div class="ws-header"><div></div><div>Player</div><div class="ws-hstat">Kills</div><div class="ws-hstat">Dmg</div><div class="ws-hstat">Total</div><div class="ws-hstat">Acc</div></div>';
  [...players].sort((a, b) => b.waveKills - a.waveKills).forEach(p => {
    const color = '#' + (PLAYER_COLORS[p.slot] ?? 0xffffff).toString(16).padStart(6, '0');
    const acc = p.shotsFired > 0 ? Math.round(p.shotsHit / p.shotsFired * 100) : 0;
    const row = document.createElement('div');
    row.className = 'ws-row';
    row.innerHTML = `<div class="ws-avatar" style="background:${color}"></div><div class="ws-name">${p.name}</div><div class="ws-stat">${p.waveKills}</div><div class="ws-stat">${p.waveDamage}</div><div class="ws-stat">${p.kills}</div><div class="ws-stat">${acc}%</div>`;
    $wsPlayers.appendChild(row);
  });
  let remaining = Math.ceil(delay);
  $wsSec.textContent = remaining;
  $waveStats.style.display = 'flex';
  clearInterval(_waveStatsTimer);
  _waveStatsTimer = setInterval(() => {
    remaining--;
    $wsSec.textContent = Math.max(0, remaining);
    if (remaining <= 0) clearInterval(_waveStatsTimer);
  }, 1000);
}

function _hideWaveStats() {
  clearInterval(_waveStatsTimer);
  if ($waveStats) $waveStats.style.display = 'none';
}

function showMsg(text, color = '#ffdd44', ms = 0) {
  if (!gameStarted) return;
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
    const avatarEl = document.getElementById(`p-avatar-${s}`);
    if (avatarEl) {
      avatarEl.style.background = SLOT_HEX[s] ?? '#fff';
      avatarEl.classList.toggle('p-av-downed', !!p.downed);
      avatarEl.classList.toggle('p-av-dead', !p.alive && !p.downed);
    }
    document.getElementById(`p-name-${s}`).textContent  = p.name;
    document.getElementById(`p-ammo-${s}`).textContent  = (p.alive && !p.downed) ? `${p.ammo} / ${WEAPONS[p.weapon]?.ammoMax ?? '?'}` : '';
    document.getElementById(`p-weapon-${s}`).textContent = p.alive ? (p.weapon?.toUpperCase() ?? '') : '';
    document.getElementById(`p-dead-${s}`).style.display = (!p.alive && !p.downed && !p.disconnected) ? 'block' : 'none';
    const downEl = document.getElementById(`p-downed-${s}`);
    if (downEl) downEl.style.display = p.downed ? 'block' : 'none';
    const revBar = document.getElementById(`p-revive-bar-${s}`);
    if (revBar) revBar.style.width = p.downed ? ((p.reviveProgress ?? 0) * 100).toFixed(1) + '%' : '0%';
    const hpBar  = document.getElementById(`p-hp-${s}`);
    if (hpBar) {
      if (p.downed) {
        hpBar.style.width = ((p.downedHp ?? 0) / 50 * 100).toFixed(1) + '%';
        hpBar.style.backgroundColor = '#ff6600';
      } else {
        const pct = p.hp / PLAYER_MAX_HP;
        hpBar.style.width = (pct * 100).toFixed(1) + '%';
        hpBar.style.backgroundColor =
          pct > 0.6 ? '#44aa44' :
          pct > 0.4 ? '#aaaa22' :
          pct > 0.2 ? '#cc6622' : '#aa2222';
      }
    }
    const dcEl = document.getElementById(`p-dc-${s}`);
    if (dcEl) dcEl.style.display = p.disconnected ? 'block' : 'none';
    if (card) card.classList.toggle('is-dashing', !!p.dashing);
    // Usable icons — active/inactive
    document.getElementById(`p-hpack-icon-${s}`)?.classList.toggle('inactive', !(p.healthpacks > 0));
    document.getElementById(`p-grenade-icon-${s}`)?.classList.toggle('inactive', !(p.grenadeCount > 0));
    document.getElementById(`p-beacon-icon-${s}`)?.classList.toggle('inactive', !(p.beaconCount > 0));
  }
  for (let s = 0; s < 4; s++)
    if (!active.has(s)) document.getElementById(`p-card-${s}`)?.classList.remove('active');

  const me = state.players.find(p => p.id === net.playerId);
  if (me?.reloading) {
    $reBar.style.display = 'block';
    const reLabel = document.getElementById('reload-label');
    if (reLabel) reLabel.textContent = 'RELOADING...';
    $reFill.style.background = '#ffcc44';
    $reFill.style.width = '60%';
  } else if (me?.weapon === 'shotgun' && _shootCdLocal > 0) {
    const fw = WEAPONS.shotgun.fireRate;
    $reBar.style.display = 'block';
    const reLabel = document.getElementById('reload-label');
    if (reLabel) reLabel.textContent = 'PUMP';
    $reFill.style.background = '#ff8844';
    $reFill.style.width = ((1 - _shootCdLocal / fw) * 100).toFixed(1) + '%';
  } else {
    $reBar.style.display = 'none';
  }

  // Objective progress bar (bridge repair / generator start)
  const mission = state.mission;
  let objProgress = null, objText = null;
  if (mission?.phase === 1 && mission.bridgeProgress != null) {
    objProgress = mission.bridgeProgress; objText = 'REPAIRING BRIDGE';
  } else if (mission?.phase === 3 && mission.genProgress != null) {
    objProgress = mission.genProgress; objText = 'STARTING GENERATOR';
  }
  if (objProgress != null && $objBar) {
    $objBar.style.display = 'block';
    if ($objLabel) $objLabel.textContent = objText;
    if ($objFill)  $objFill.style.width  = (objProgress * 100).toFixed(1) + '%';
  } else if ($objBar) {
    $objBar.style.display = 'none';
  }

  // Water overlay
  if ($waterOver) $waterOver.style.display = (me?.inWater) ? 'block' : 'none';

  // Pinned / grabbed indicator
  if (me && me.alive) {
    const pinnedEl = document.getElementById('pinned-msg');
    if (pinnedEl) pinnedEl.style.display = (me.pinnedBy || me.pulledBy) ? 'block' : 'none';
  }
  // Ping
  const pingEl = document.getElementById('ping-display');
  if (pingEl) pingEl.textContent = `Ping: ${net.ping}ms`;

  // L4D2 ammo display (bottom-right, large)
  if ($ammoDisp) {
    if (me && me.alive && !me.downed) {
      $ammoDisp.style.display = 'block';
      if ($ammoWep) $ammoWep.textContent = me.weapon?.toUpperCase() ?? '';
      if ($ammoCur) $ammoCur.textContent = me.ammo ?? 0;
      if ($ammoRes) $ammoRes.textContent = WEAPONS[me.weapon]?.ammoMax ?? 0;
    } else {
      $ammoDisp.style.display = 'none';
    }
  }

  // Damage vignette — intensifies as HP drops below 40%
  if ($vignette) {
    const hpPct = (me && me.alive) ? me.hp / PLAYER_MAX_HP : 1;
    $vignette.style.opacity = hpPct < 0.4 ? ((0.4 - hpPct) / 0.4).toFixed(2) : '0';
  }

  // Mission list in wave box
  const mlEl = document.getElementById('mission-list');
  if (mlEl && gameStarted) {
    if (_missionLog.length > 0) {
      mlEl.innerHTML = _missionLog.map(step => {
        const cls = step.done ? 'ml-step done' : 'ml-step current';
        return `<div class="${cls}">${step.label}</div>`;
      }).join('');
    } else if (state.safeRoomOpen) {
      mlEl.innerHTML = '<div class="ml-step current">SAFE ROOM OPEN</div>';
    } else if (!state.mission) {
      const secs = state.safeSecondsLeft ?? WAVE_SAFE_DELAY;
      mlEl.innerHTML = `<div class="ml-step">Safe room opens in ${secs}s</div>`;
    } else {
      mlEl.innerHTML = '';
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

  // Mission items
  if (state.mission?.items?.length) {
    for (const item of state.mission.items) {
      const [ix, iz] = w2m(item.x, item.z);
      mmCtx.fillStyle   = item.type === 'fuel' ? '#ff6600' : '#44ffaa';
      mmCtx.strokeStyle = '#ffffff';
      mmCtx.lineWidth   = 1;
      mmCtx.beginPath(); mmCtx.arc(ix, iz, 3.5, 0, Math.PI * 2);
      mmCtx.fill(); mmCtx.stroke();
    }
  }
  // Delivery destination marker
  if (state.mission?.deliveryPos && state.mission.phase < 4 && !state.safeRoomOpen) {
    const [cx, cz] = w2m(state.mission.deliveryPos.x, state.mission.deliveryPos.z);
    mmCtx.strokeStyle = '#ffdd00'; mmCtx.lineWidth = 2;
    mmCtx.beginPath(); mmCtx.arc(cx, cz, 5, 0, Math.PI * 2); mmCtx.stroke();
    mmCtx.fillStyle = 'rgba(255,220,0,0.3)';
    mmCtx.beginPath(); mmCtx.arc(cx, cz, 5, 0, Math.PI * 2); mmCtx.fill();
  }

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
      if (!p.alive && !p.downed) continue;
      const [px, pz] = w2m(p.x, p.z);
      const col = p.downed ? '#ff6600' : (SLOT_HEX[p.slot] ?? '#ffffff');
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

  // Ping markers
  for (const pm of _pingMarkers) {
    const [pmx, pmz] = w2m(pm.x, pm.z);
    const pcfg = PING_CFG[pm.type];
    if (!pcfg) continue;
    mmCtx.strokeStyle = pcfg.hex;
    mmCtx.lineWidth = 1.5;
    const blink = Math.floor(pm.timer * 4) % 2 === 0;
    if (blink) { mmCtx.beginPath(); mmCtx.arc(pmx, pmz, 4, 0, Math.PI*2); mmCtx.stroke(); }
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

  // Spectator: follow alive player when local player is truly dead (not downed)
  if (!me?.alive && !me?.downed) {
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

  _laserMat.opacity = 0.5 + Math.sin(now * 0.005) * 0.35;

  // Particle + damage number update
  vfx.update(dt);
  dmgNums.update(dt);

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

  // Flying beacon arcs
  for (let _i = flyingBeacons.length - 1; _i >= 0; _i--) {
    const fb = flyingBeacons[_i];
    const t = Math.min(1, (now - fb.startTime) / (fb.duration * 1000));
    fb.mesh.position.set(
      fb.ox + (fb.tx - fb.ox) * t,
      Math.sin(t * Math.PI) * 2.5 + 0.3,
      fb.oz + (fb.tz - fb.oz) * t
    );
    if (t >= 1) { scene.remove(fb.mesh); flyingBeacons.splice(_i, 1); }
  }

  // Ping markers — hover + fade
  for (let _pi = _pingMarkers.length - 1; _pi >= 0; _pi--) {
    const pm = _pingMarkers[_pi];
    pm.timer -= dt;
    pm.mesh.position.y = 2.5 + Math.sin(now * 0.003) * 0.22;
    pm.mat.opacity = Math.max(0, pm.timer / pm.maxTimer);
    if (pm.timer <= 0) { scene.remove(pm.mesh); _pingMarkers.splice(_pi, 1); }
  }

  // Ping radial menu — keyboard hold-to-open
  if (gameStarted) {
    if (input.pingHeld && !_pingMenuOpen) _openPingMenu();
    _updatePingMenu();
    if (!input.pingHeld && _pingMenuOpen) _closePingMenu(input.consumePingRelease());
  } else if (_pingMenuOpen) {
    _closePingMenu(false);
  }

  // Grenade targeting ring — show while G held
  {
    const state0 = interp.get() ?? net.latestState;
    const _me0 = state0?.players?.find(p => p.id === net.playerId);
    if (gameStarted && input.grenadeHeld && _me0?.alive && (_me0?.grenadeCount ?? 0) > 0) {
      const mousePos = getMouseWorldPos();
      const clamped = clampToThrowRange({ x: _me0.x, z: _me0.z }, mousePos);
      _grenadeTargetRing.position.set(clamped.x, 0.06, clamped.z);
      _grenadeTargetRing.visible = true;
    } else {
      _grenadeTargetRing.visible = false;
    }
  }

  if (gameStarted && now - lastInputTime >= INPUT_RATE && net.connected && net.playerId) {
    lastInputTime = now;
    const doReload  = input.consumeReload();
    const doDash    = input.consumeDash();
    const doBeacon  = input.consumeBeacon();
    if (doReload)  audio.reload();
    if (doDash)    audio.dash();

    let grenadeTarget = null;
    if (input.consumeGrenadeRelease()) {
      const state0 = interp.get() ?? net.latestState;
      const _me0 = state0?.players?.find(p => p.id === net.playerId);
      if (_me0 && (_me0.grenadeCount ?? 0) > 0) {
        if (input.mobileAimAngle !== null) {
          const dist = GRENADE_THROW_RANGE * 0.7;
          grenadeTarget = { x: _me0.x + Math.sin(input.mobileAimAngle) * dist, z: _me0.z + Math.cos(input.mobileAimAngle) * dist };
        } else {
          grenadeTarget = clampToThrowRange({ x: _me0.x, z: _me0.z }, getMouseWorldPos());
        }
      }
    }

    net.sendInput({
      w: input.isDown('KeyW') || input.isDown('ArrowUp'),
      s: input.isDown('KeyS') || input.isDown('ArrowDown'),
      a: input.isDown('KeyA') || input.isDown('ArrowLeft'),
      d: input.isDown('KeyD') || input.isDown('ArrowRight'),
    }, getMouseAngle(), input.lmb, doReload, input.consumeUse(), doDash, grenadeTarget, doBeacon);
  }

  const state = interp.get() ?? net.latestState;
  if (state && gameStarted) {
    try {
      applyEffects(state, dt);
      syncPlayers(state.players, dt);
      // Laser: raycast cursor to weapon-height plane so it hits exact screen pixel
      {
        const _lme = state.players?.find(p => p.id === net.playerId);
        if (_lme?.alive && input.mobileAimAngle === null) {
          _laserRay.setFromCamera(new THREE.Vector2(
            (input.mouseX / innerWidth) * 2 - 1,
            -(input.mouseY / innerHeight) * 2 + 1
          ), camera);
          _laserRay.ray.intersectPlane(_laserPlane, _laserTarget);
          const a  = getMouseAngle();
          const ox = _lme.x + Math.sin(a) * 0.30;
          const oz = _lme.z + Math.cos(a) * 0.30;
          _myLaserPosArr[0] = ox;             _myLaserPosArr[1] = 0.64; _myLaserPosArr[2] = oz;
          _myLaserPosArr[3] = _laserTarget.x; _myLaserPosArr[4] = 0.64; _myLaserPosArr[5] = _laserTarget.z;
          _myLaserGeo.attributes.position.needsUpdate = true;
          _myLaser.visible = true;
        } else {
          _myLaser.visible = false;
        }
      }
      updateOutlineOcclusion(state.players);
      syncPlayerLights(state.players);
      syncEnemies(state.enemies);
      syncTongues(state, dt);
      syncBullets(state.bullets ?? []);
      syncAcidBlobs(state.acidBlobs ?? []);
      syncPickups(state.pickups ?? [], now);
      updateInteractPrompt(state);
      syncHealthpacks(state.healthpacks ?? [], now);
      syncGrenades(state.grenades ?? []);
      syncGrenadePicks(state.grenadePicks ?? [], now);
      const _me = state.players?.find(p => p.id === net.playerId);
      syncMissionItems(state.mission ?? null, _me?.carrying ?? null, now);
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
