import * as THREE from 'three';
import { buildMap }               from '../src/GameWorld.js';
import { PLAYER_SPEED, MAP_HALF } from '../shared/constants.js';
import { PLAYER_RADIUS }          from '../shared/colliders.js';

const BULLET_SPEED = 22;
const BULLET_RANGE = 22;
const FIRE_RATE    = 0.28;
const CAM_OFFSET   = new THREE.Vector3(0, 18, 14);

let _active    = false;
let _renderer  = null;
let _scene     = null;
let _camera    = null;
let _animId    = null;
let _player    = null;
let _bullets   = [];
let _keys      = {};
let _lmb       = false;
let _mouseX    = 0;
let _mouseY    = 0;
let _fireTimer = 0;
let _boxes     = [];
let _circles   = [];
let _onStop    = null;
let _raycaster = null;
let _groundPl  = null;
let _muzzle    = null;
let _muzzleT   = 0;
let _walkPhase = 0;

const _hitPt = new THREE.Vector3();
const _ndc   = new THREE.Vector2();

// ── Public ────────────────────────────────────────────────────────────────────

export function start(mapId, editorState, onStop) {
  if (_active) return;
  _active = true;
  _onStop = onStop;
  _boxes   = editorState.boxes   ?? [];
  _circles = editorState.circles ?? [];

  _raycaster = new THREE.Raycaster();
  _groundPl  = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const canvas = document.getElementById('playtest-canvas');
  _renderer = new THREE.WebGLRenderer({ antialias: false, canvas });
  _renderer.setSize(window.innerWidth, window.innerHeight);
  _renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  _renderer.shadowMap.enabled = true;
  _renderer.shadowMap.type    = THREE.BasicShadowMap;

  _scene = new THREE.Scene();
  _scene.background = new THREE.Color(0x000000);

  _camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);

  _scene.add(new THREE.AmbientLight(0xffffff, 0.08));
  const sun = new THREE.DirectionalLight(0xffeedd, 0.12);
  sun.position.set(5, 20, 18);
  _scene.add(sun);

  const mapGroup = new THREE.Group();
  _scene.add(mapGroup);
  const result = buildMap(mapGroup, mapId) ?? {};
  _scene.fog = new THREE.Fog(result.fogColor ?? 0x000000, result.fogNear ?? 22, result.fogFar ?? 40);

  const spawn = editorState.playerSpawns?.[0] ?? { x: 0, z: 0 };
  _player = _makePlayer(spawn.x, spawn.z);
  _scene.add(_player.mesh);
  _scene.add(_player.spot);
  _scene.add(_player.spot.target);

  _muzzle = new THREE.PointLight(0xffee44, 0, 4);
  _scene.add(_muzzle);

  _bullets   = [];
  _keys      = {};
  _lmb       = false;
  _fireTimer = 0;
  _walkPhase = 0;

  window.addEventListener('keydown',     _onKeyDown,     { capture: true });
  window.addEventListener('keyup',       _onKeyUp,       { capture: true });
  window.addEventListener('mousemove',   _onMouseMove);
  window.addEventListener('mousedown',   _onMouseDown);
  window.addEventListener('mouseup',     _onMouseUp);
  window.addEventListener('contextmenu', _noContext,     { capture: true });
  window.addEventListener('resize',      _onResize);

  let last = performance.now();
  function loop() {
    _animId = requestAnimationFrame(loop);
    const now = performance.now();
    const dt  = Math.min((now - last) / 1000, 0.05);
    last = now;
    _tick(dt);
    _renderer.render(_scene, _camera);
  }
  loop();
}

export function stop() {
  if (!_active) return;
  _active = false;
  cancelAnimationFrame(_animId);
  _animId = null;

  window.removeEventListener('keydown',     _onKeyDown,     { capture: true });
  window.removeEventListener('keyup',       _onKeyUp,       { capture: true });
  window.removeEventListener('mousemove',   _onMouseMove);
  window.removeEventListener('mousedown',   _onMouseDown);
  window.removeEventListener('mouseup',     _onMouseUp);
  window.removeEventListener('contextmenu', _noContext,     { capture: true });
  window.removeEventListener('resize',      _onResize);

  if (_scene) {
    _scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
  }
  if (_renderer) { _renderer.dispose(); _renderer = null; }
  _scene = null; _camera = null; _player = null; _muzzle = null; _bullets = [];

  if (_onStop) _onStop();
}

export function isActive() { return _active; }

// ── Player mesh ───────────────────────────────────────────────────────────────

function _makePlayer(x, z) {
  const g    = new THREE.Group();
  const bMat = new THREE.MeshLambertMaterial({ color: 0x2255aa, emissive: 0x1122aa, emissiveIntensity: 0.15 });
  const sMat = new THREE.MeshLambertMaterial({ color: 0xf5c59a });
  const pMat = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });
  const wMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a, emissive: 0x111111, emissiveIntensity: 0.3 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.45, 0.22), pMat);
  legL.position.set(-0.13, 0.225, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.45, 0.22), pMat);
  legR.position.set(0.13, 0.225, 0);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.32), bMat);
  body.position.y = 0.725;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), sMat);
  head.position.y = 1.26;
  const cap  = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.14, 0.50), bMat);
  cap.position.y = 1.595;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.32), bMat);
  brim.position.set(0, 1.575, 0.22);
  [legL, legR, body, head, cap, brim].forEach(m => { m.castShadow = true; g.add(m); });

  const armLP = new THREE.Group();
  armLP.position.set(-0.34, 0.92, 0); armLP.rotation.x = -0.75;
  const armLM = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.40, 0.14), sMat);
  armLM.position.y = -0.20; armLM.castShadow = true;
  armLP.add(armLM); g.add(armLP);

  const armRP = new THREE.Group();
  armRP.position.set(0.34, 0.92, 0); armRP.rotation.x = -0.75;
  const armRM = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.40, 0.14), sMat);
  armRM.position.y = -0.20; armRM.castShadow = true;
  armRP.add(armRM); g.add(armRP);

  const wh = new THREE.Group();
  wh.position.set(0.08, 0.64, 0.30);
  const wb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.24), wMat);
  wb.position.z = 0.12;
  const wg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.07), wMat);
  wg.position.set(0, -0.09, 0.01);
  wh.add(wb, wg); g.add(wh);

  g.position.set(x, 0, z);

  const spot = new THREE.SpotLight(0xfff5cc, 18, 28, Math.PI / 5, 0.45, 1.8);
  spot.castShadow = false;

  return { x, z, angle: 0, mesh: g, spot, legL, legR };
}

// ── Bullets ───────────────────────────────────────────────────────────────────

const _bGeo = new THREE.SphereGeometry(0.07, 4, 4);
const _bMat = new THREE.MeshBasicMaterial({ color: 0xffee44 });

function _fireBullet() {
  const a = _player.angle;
  const mesh = new THREE.Mesh(_bGeo, _bMat);
  mesh.position.set(_player.x, 0.55, _player.z);
  _scene.add(mesh);
  _bullets.push({
    mesh, x: _player.x, z: _player.z,
    vx: Math.sin(a) * BULLET_SPEED,
    vz: -Math.cos(a) * BULLET_SPEED,
    dist: 0,
  });
  _muzzle.position.set(
    _player.x + Math.sin(a) * 0.6,
    0.7,
    _player.z - Math.cos(a) * 0.6,
  );
  _muzzle.intensity = 7;
  _muzzleT = 0.06;
}

// ── Collision ─────────────────────────────────────────────────────────────────

function _resolve(nx, nz) {
  const r = PLAYER_RADIUS;
  for (const b of _boxes) {
    const cx = Math.max(b.x - b.hw, Math.min(b.x + b.hw, nx));
    const cz = Math.max(b.z - b.hd, Math.min(b.z + b.hd, nz));
    const dx = nx - cx, dz = nz - cz;
    const d  = Math.sqrt(dx * dx + dz * dz);
    if (d < r && d > 0.0001) { nx += (dx / d) * (r - d); nz += (dz / d) * (r - d); }
  }
  for (const c of _circles) {
    const dx = nx - c.x, dz = nz - c.z;
    const d  = Math.sqrt(dx * dx + dz * dz);
    const m  = r + c.r;
    if (d < m && d > 0.0001) { nx += (dx / d) * (m - d); nz += (dz / d) * (m - d); }
  }
  const lim = MAP_HALF - r;
  return [Math.max(-lim, Math.min(lim, nx)), Math.max(-lim, Math.min(lim, nz))];
}

// ── Mouse world angle ─────────────────────────────────────────────────────────

function _aimAngle() {
  _ndc.set(
    (_mouseX / window.innerWidth)  * 2 - 1,
    -(_mouseY / window.innerHeight) * 2 + 1,
  );
  _raycaster.setFromCamera(_ndc, _camera);
  if (_raycaster.ray.intersectPlane(_groundPl, _hitPt)) {
    return Math.atan2(_hitPt.x - _player.x, -(_hitPt.z - _player.z));
  }
  return _player.angle;
}

// ── Game loop ─────────────────────────────────────────────────────────────────

function _tick(dt) {
  if (!_player) return;

  _player.angle = _aimAngle();

  let dx = 0, dz = 0;
  if (_keys['KeyW'] || _keys['ArrowUp'])    dz -= 1;
  if (_keys['KeyS'] || _keys['ArrowDown'])  dz += 1;
  if (_keys['KeyA'] || _keys['ArrowLeft'])  dx -= 1;
  if (_keys['KeyD'] || _keys['ArrowRight']) dx += 1;
  const moving = dx !== 0 || dz !== 0;

  if (moving) {
    const len = Math.sqrt(dx * dx + dz * dz);
    dx = (dx / len) * PLAYER_SPEED * dt;
    dz = (dz / len) * PLAYER_SPEED * dt;
  }

  [_player.x, _player.z] = _resolve(_player.x + dx, _player.z + dz);

  _fireTimer -= dt;
  if (_lmb && _fireTimer <= 0) {
    _fireTimer = FIRE_RATE;
    _fireBullet();
  }

  if (_muzzleT > 0) {
    _muzzleT -= dt;
    if (_muzzleT <= 0) _muzzle.intensity = 0;
  }

  for (let i = _bullets.length - 1; i >= 0; i--) {
    const b = _bullets[i];
    b.x   += b.vx * dt;
    b.z   += b.vz * dt;
    b.dist += Math.hypot(b.vx, b.vz) * dt;
    b.mesh.position.set(b.x, 0.55, b.z);
    if (b.dist >= BULLET_RANGE) {
      _scene.remove(b.mesh);
      _bullets.splice(i, 1);
    }
  }

  if (moving) {
    _walkPhase += dt * 8;
    const s = Math.sin(_walkPhase) * 0.18;
    _player.legL.rotation.x =  s;
    _player.legR.rotation.x = -s;
  } else {
    _player.legL.rotation.x *= 0.85;
    _player.legR.rotation.x *= 0.85;
  }

  _player.mesh.position.set(_player.x, 0, _player.z);
  _player.mesh.rotation.y = _player.angle;

  _camera.position.set(
    _player.x + CAM_OFFSET.x,
    CAM_OFFSET.y,
    _player.z + CAM_OFFSET.z,
  );
  _camera.lookAt(_player.x, 0, _player.z);

  _player.spot.position.set(_player.x, 1.4, _player.z);
  _player.spot.target.position.set(
    _player.x + Math.sin(_player.angle) * 10,
    0,
    _player.z - Math.cos(_player.angle) * 10,
  );
  _player.spot.target.updateMatrixWorld();
}

// ── Input ─────────────────────────────────────────────────────────────────────

function _onKeyDown(e) {
  e.stopImmediatePropagation();
  _keys[e.code] = true;
  if (e.code === 'Escape') stop();
}
function _onKeyUp(e)     { e.stopImmediatePropagation(); delete _keys[e.code]; }
function _onMouseMove(e) { _mouseX = e.clientX; _mouseY = e.clientY; }
function _onMouseDown(e) { if (e.button === 0) _lmb = true; }
function _onMouseUp(e)   { if (e.button === 0) _lmb = false; }
function _noContext(e)   { e.preventDefault(); }
function _onResize() {
  if (!_renderer || !_camera) return;
  _renderer.setSize(window.innerWidth, window.innerHeight);
  _camera.aspect = window.innerWidth / window.innerHeight;
  _camera.updateProjectionMatrix();
}
