import * as THREE from 'three';
import { NetworkManager } from './net/NetworkManager.js';
import { Interpolator }   from './net/Interpolator.js';
import { InputHandler }   from './InputHandler.js';
import { buildMap }       from './GameWorld.js';
import { PLAYER_COLORS, PLAYER_MAX_HP, WEAPONS, MAP_HALF } from '../shared/constants.js';

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

// Map group — rebuilt on each game start
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
function makePlayerMesh(color) {
  const g    = new THREE.Group();
  const bMat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.15 });
  const sMat = new THREE.MeshLambertMaterial({ color: 0xf5c59a, emissive: 0xf5c59a, emissiveIntensity: 0.1 });
  const pMat = new THREE.MeshLambertMaterial({ color: 0x4466aa });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.20,0.45,0.22), pMat); legL.position.set(-0.13,0.225,0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.20,0.45,0.22), pMat); legR.position.set( 0.13,0.225,0);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52,0.55,0.32), bMat); body.position.y = 0.725;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.48,0.48,0.48), sMat); head.position.y = 1.26;
  const cap  = new THREE.Mesh(new THREE.BoxGeometry(0.50,0.14,0.50), bMat); cap.position.y  = 1.595;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.62,0.06,0.32), bMat); brim.position.set(0,1.575,0.22);
  [legL,legR,body,head,cap,brim].forEach(m => { m.castShadow = true; g.add(m); });
  return g;
}

const ENEMY_PALETTES = {
  walker:  [{ b:0x558844, h:0x88bb66 },{ b:0x446633, h:0x77aa55 }],
  runner:  [{ b:0x443355, h:0x776699 },{ b:0x332244, h:0x664488 }],
  spitter: [{ b:0x887722, h:0xbbaa33 },{ b:0x998833, h:0xccbb44 }],
  tank:    [{ b:0x2a2a2a, h:0x444444 },{ b:0x1a1a1a, h:0x333333 }],
};
function makeEnemyMesh(type = 'walker') {
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
const playerMeshes = new Map();
const enemyMeshes  = new Map();
const bulletMeshes = new Map();
const acidMeshes   = new Map();
const pickupMeshes = new Map(); // pickupId → Group

function syncPlayers(players) {
  const seen = new Set();
  for (const p of players) {
    seen.add(p.id);
    if (!playerMeshes.has(p.id)) {
      const mesh = makePlayerMesh(PLAYER_COLORS[p.slot] ?? 0xffffff);
      scene.add(mesh);
      playerMeshes.set(p.id, { mesh });
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

net.onJoined = ({ slot, roomId }) => {
  mySlot = slot;
  document.getElementById('lobby').style.display     = 'none';
  document.getElementById('room-wait').style.display = 'flex';
  document.getElementById('wait-room-code').textContent = `Room: ${roomId ?? '—'}`;
};

net.onRoomFull = () => { alert('Room is full (4/4). Try a different room code.'); };

net.socket.on('lobbyState', ({ players, readyCount, totalCount }) => {
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
  _isReady = false; _goReady = false;
  document.getElementById('ready-btn').textContent = 'Ready';
  document.getElementById('ready-btn').classList.remove('is-ready');
  document.getElementById('go-ready-btn').textContent = 'Play Again';
  document.getElementById('go-ready-btn').classList.remove('is-ready');
  loadMap(mapId);
  gameStarted = true;
  updateWaveHUD(wave);
  showMsg(`WAVE ${wave}`, '#ffdd44', 2200);
  // Clear entity maps for fresh game
  [playerMeshes, enemyMeshes, bulletMeshes, acidMeshes, pickupMeshes].forEach(m => {
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
  if (playerId === net.playerId) showMsg('YOU DIED', '#ff4444', 0);
};
net.onPlayerWon  = ({ name }) => { showMsg(`${name} reached the Safe House!`, '#44ff88', 4000); };
net.onNewWave    = ({ wave }) => { updateWaveHUD(wave); showMsg(`WAVE ${wave}`, '#ffdd44', 2200); };
net.onWaveClear  = ({ nextWave, delay }) => { showMsg(`WAVE CLEAR — Wave ${nextWave} in ${delay}s`, '#88ffaa', 3500); };

function _fmtTime(s) { const m = Math.floor(s/60); return m > 0 ? `${m}m ${s%60}s` : `${s}s`; }

// ── Lobby join button ─────────────────────────────────────────────────────────
document.getElementById('join-btn').addEventListener('click', () => {
  const name   = document.getElementById('name-input').value.trim() || 'Survivor';
  const roomId = document.getElementById('room-input').value.trim() || 'default';
  const $s = document.getElementById('lobby-status');
  if (!net.connected) {
    $s.textContent = 'Waiting for server connection...';
    net.socket.once('connect', () => { $s.textContent = 'Joining room...'; net.joinRoom(roomId, name); });
  } else { $s.textContent = 'Joining room...'; net.joinRoom(roomId, name); }
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
    document.getElementById(`p-dead-${s}`).style.display = p.alive ? 'none' : 'block';
  }
  for (let s = 0; s < 4; s++)
    if (!active.has(s)) document.getElementById(`p-card-${s}`)?.classList.remove('active');

  const me = state.players.find(p => p.id === net.playerId);
  if (me?.reloading) { $reBar.style.display = 'block'; $reFill.style.width = '60%'; }
  else $reBar.style.display = 'none';
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
    const ECOL = { walker:'#ff4444', runner:'#ff8844', spitter:'#aaff22', tank:'#ff2222' };
    for (const e of state.enemies) {
      const [ex, ez] = w2m(e.x, e.z);
      mmCtx.fillStyle = ECOL[e.type] ?? '#ff4444';
      const r = e.type === 'tank' ? 3.5 : 2;
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
function followLocalPlayer(state) {
  const me = state?.players?.find(p => p.id === net.playerId);
  if (!me) return;
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
const INPUT_RATE  = 1000 / 60;

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();

  fireLights.forEach(fl => {
    fl.intensity = 2.5 + Math.sin(now * 0.008 + fl.position.x) * 0.8;
  });

  if (gameStarted && now - lastInputTime >= INPUT_RATE && net.connected && net.playerId) {
    lastInputTime = now;
    net.sendInput({
      w: input.isDown('KeyW') || input.isDown('ArrowUp'),
      s: input.isDown('KeyS') || input.isDown('ArrowDown'),
      a: input.isDown('KeyA') || input.isDown('ArrowLeft'),
      d: input.isDown('KeyD') || input.isDown('ArrowRight'),
    }, getMouseAngle(), input.lmb, input.consumeReload());
  }

  const state = interp.get() ?? net.latestState;
  if (state && gameStarted) {
    try {
      syncPlayers(state.players);
      syncEnemies(state.enemies);
      syncBullets(state.bullets ?? []);
      syncAcidBlobs(state.acidBlobs ?? []);
      syncPickups(state.pickups ?? [], now);
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
