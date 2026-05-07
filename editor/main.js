import { MAP_COLLIDERS } from '../shared/colliders.js';
import {
  MAPS, MAP_HALF, SAFE_ZONE, SAFE_ZONE_RADIUS,
  SPAWN_POINTS, PLAYER_SPAWN_POINTS,
  WEAPON_PICKUPS_BY_MAP, HEALTHPACK_POSITIONS_BY_MAP,
} from '../shared/constants.js';
import * as History  from './history.js';
import * as Storage  from './storage.js';
import * as FF       from './flowfield.js';
import { getPreview }                from './preview.js';
import * as Playtest                 from './playtest.js';

// ── State ─────────────────────────────────────────────────────────────────────

let mapId = 'forest_trail';

// Deep-clone mutable working copies
let state = loadState(mapId);

function loadState(id) {
  const saved = Storage.load(id);
  if (saved) return {
    boxes:        (saved.boxes        ?? []).map(b => ({ ...b })),
    circles:      (saved.circles      ?? []).map(c => ({ ...c })),
    pickups:      (saved.pickups      ?? []).map(p => ({ ...p })),
    hpacks:       (saved.hpacks       ?? []).map(h => ({ ...h })),
    safeZone:     saved.safeZone      ?? { ...SAFE_ZONE, r: SAFE_ZONE_RADIUS },
    spawns:       (saved.spawns       ?? []).map(s => ({ ...s })),
    playerSpawns: (saved.playerSpawns ?? PLAYER_SPAWN_POINTS).map(s => ({ ...s })),
  };
  const col = MAP_COLLIDERS[id] ?? { boxes: [], circles: [] };
  return {
    boxes:        col.boxes.map(b => ({ ...b })),
    circles:      col.circles.map(c => ({ ...c })),
    pickups:      (WEAPON_PICKUPS_BY_MAP[id] ?? []).map(p => ({ ...p })),
    hpacks:       (HEALTHPACK_POSITIONS_BY_MAP[id] ?? []).map(h => ({ ...h })),
    safeZone:     { ...SAFE_ZONE, r: SAFE_ZONE_RADIUS },
    spawns:       SPAWN_POINTS.map(s => ({ ...s })),
    playerSpawns: PLAYER_SPAWN_POINTS.map(s => ({ ...s })),
  };
}

function defaultState(id) {
  const col = MAP_COLLIDERS[id] ?? { boxes: [], circles: [] };
  return {
    boxes:        col.boxes.map(b => ({ ...b })),
    circles:      col.circles.map(c => ({ ...c })),
    pickups:      (WEAPON_PICKUPS_BY_MAP[id] ?? []).map(p => ({ ...p })),
    hpacks:       (HEALTHPACK_POSITIONS_BY_MAP[id] ?? []).map(h => ({ ...h })),
    safeZone:     { ...SAFE_ZONE, r: SAFE_ZONE_RADIUS },
    spawns:       SPAWN_POINTS.map(s => ({ ...s })),
    playerSpawns: PLAYER_SPAWN_POINTS.map(s => ({ ...s })),
  };
}

function autosave() {
  Storage.save(mapId, state, missionPositions);
}

// ── Camera ────────────────────────────────────────────────────────────────────

const cam = { x: 0, z: 0, scale: 18 }; // world units → pixels

// ── Tool ─────────────────────────────────────────────────────────────────────

let activeTool = 'select';
let activeTab  = 'colliders';

// ── Element group expand state ────────────────────────────────────────────────

const groupExpanded = {
  'el-spawns': true, 'el-player-spawns': false, 'el-env': false, 'el-weapons': false,
  'el-hpacks': false, 'el-missions': false, 'el-safezone': false,
};

function setGroupExpanded(grpId, open) {
  groupExpanded[grpId] = open;
  const ul  = document.getElementById(grpId);
  const hdr = document.querySelector(`[data-grp="${grpId}"]`);
  if (ul)  ul.style.display = open ? '' : 'none';
  if (hdr) hdr.classList.toggle('grp-open', open);
}

function autoExpandIfSelected(grpId) {
  const ul = document.getElementById(grpId);
  if (ul && ul.querySelector('li.selected') && !groupExpanded[grpId])
    setGroupExpanded(grpId, true);
}

// ── Selection ─────────────────────────────────────────────────────────────────

let sel = null; // { kind: 'box'|'circle'|'pickup'|'hp', index }

// ── Drag ─────────────────────────────────────────────────────────────────────

let drag = null;
/*
  drag types:
  - { type:'pan', startMx, startMz, startCx, startCz }
  - { type:'move-sel', startWx, startWz, origX, origZ }
  - { type:'draw-box', startWx, startWz }          (while drawing)
  - { type:'draw-circle', startWx, startWz }
*/

// ── Layers ────────────────────────────────────────────────────────────────────

const layers = {
  grid: true, colliders: true, pickups: true,
  spawns: true, playerSpawns: true, safezone: true, missions: true, boundary: true,
  flowfield: false, preview: false,
};

// ── Flow field state ──────────────────────────────────────────────────────────

let ffData    = null;  // { field, dist } from FF.compute
let ffDirty   = true;  // recompute on next draw if true

// ── Map preview state ─────────────────────────────────────────────────────────

let previewImg = null; // HTMLCanvasElement from preview.js

// ── Canvas setup ─────────────────────────────────────────────────────────────

const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');

function resize() {
  const wrap = canvas.parentElement;
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  draw();
}
window.addEventListener('resize', resize);

// ── Coord transforms ──────────────────────────────────────────────────────────

function w2s(wx, wz) { // world → screen
  return [
    canvas.width  / 2 + (wx - cam.x) * cam.scale,
    canvas.height / 2 + (wz - cam.z) * cam.scale,
  ];
}
function s2w(sx, sy) { // screen → world
  return [
    (sx - canvas.width  / 2) / cam.scale + cam.x,
    (sy - canvas.height / 2) / cam.scale + cam.z,
  ];
}

// ── Snap ─────────────────────────────────────────────────────────────────────

function snapVal(v) {
  if (!document.getElementById('snap-toggle').checked) return v;
  const g = parseFloat(document.getElementById('snap-size').value);
  return Math.round(v / g) * g;
}
function snapPt(wx, wz) { return [snapVal(wx), snapVal(wz)]; }

// ── Draw ──────────────────────────────────────────────────────────────────────

const COLORS = {
  grid:        '#2a2a2a',
  boundary:    '#ff6600',
  box:         'rgba(80,160,255,0.35)',
  boxSel:      'rgba(80,220,255,0.7)',
  boxStroke:   '#4af',
  circle:      'rgba(255,180,60,0.3)',
  circSel:     'rgba(255,220,80,0.7)',
  circStroke:  '#fb3',
  pickup:      '#44ff88',
  hp:          '#ff4466',
  spawn:       '#aaaaff',
  playerSpawn: '#ffee44',
  safeZone:    'rgba(60,200,60,0.15)',
  safeStroke:  '#3c3',
  missionItem: '#ff88ff',
  gizmoX:      '#ff4444',
  gizmoZ:      '#44ff44',
};

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#181818';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (layers.preview)      drawPreview();
  if (layers.grid)         drawGrid();
  if (layers.boundary)     drawBoundary();
  if (layers.safezone)     drawSafeZone();
  if (layers.spawns)       drawSpawns();
  if (layers.playerSpawns) drawPlayerSpawns();
  if (layers.colliders)    drawColliders();
  if (layers.pickups)      drawPickups();
  if (layers.missions)     drawMissionItems();
  if (layers.flowfield)    drawFlowField();
  drawDragPreview();
  drawGizmo();
}

function drawGrid() {
  const step = 1;
  const [x0, z0] = s2w(0, 0);
  const [x1, z1] = s2w(canvas.width, canvas.height);
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;
  for (let x = Math.floor(x0); x <= Math.ceil(x1); x += step) {
    const [sx] = w2s(x, 0);
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, canvas.height); ctx.stroke();
  }
  for (let z = Math.floor(z0); z <= Math.ceil(z1); z += step) {
    const [,sy] = w2s(0, z);
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(canvas.width, sy); ctx.stroke();
  }
  // origin cross
  const [ox, oz] = w2s(0, 0);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, canvas.height); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, oz); ctx.lineTo(canvas.width, oz); ctx.stroke();
}

function drawBoundary() {
  const h = MAP_HALF;
  const [sx, sy] = w2s(-h, -h);
  const [ex, ey] = w2s( h,  h);
  ctx.strokeStyle = COLORS.boundary;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(sx, sy, ex - sx, ey - sy);
  ctx.setLineDash([]);
}

function drawSafeZone() {
  const { x, z, r } = state.safeZone;
  const [cx, cy] = w2s(x, z);
  const rs = r * cam.scale;
  ctx.fillStyle = COLORS.safeZone;
  ctx.beginPath(); ctx.arc(cx, cy, rs, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = COLORS.safeStroke;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, rs, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = COLORS.safeStroke;
  ctx.font = `${Math.max(9, cam.scale * 0.5)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('SAFE', cx, cy + 3);
}

function drawSpawns() {
  for (let i = 0; i < state.spawns.length; i++) {
    const sp = state.spawns[i];
    const isSel = sel?.kind === 'spawn' && sel.index === i;
    const [sx, sy] = w2s(sp.x, sp.z);
    ctx.fillStyle = isSel ? '#ddddff' : COLORS.spawn;
    ctx.strokeStyle = '#6666cc';
    ctx.lineWidth = isSel ? 2 : 1;
    ctx.beginPath(); ctx.arc(sx, sy, isSel ? 7 : 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#333'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
    ctx.fillText('Z', sx, sy + 3);
  }
}

function drawPlayerSpawns() {
  for (let i = 0; i < state.playerSpawns.length; i++) {
    const sp = state.playerSpawns[i];
    const isSel = sel?.kind === 'playerSpawn' && sel.index === i;
    const [sx, sy] = w2s(sp.x, sp.z);
    const s = isSel ? 8 : 6;
    ctx.fillStyle = isSel ? '#ffffff' : COLORS.playerSpawn;
    ctx.strokeStyle = '#aa8800';
    ctx.lineWidth = isSel ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(sx, sy - s); ctx.lineTo(sx + s, sy); ctx.lineTo(sx, sy + s); ctx.lineTo(sx - s, sy);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#333'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
    ctx.fillText('P', sx, sy + 3);
  }
}

function drawGizmo() {
  if (!sel) return;
  const obj = getSelObj(sel);
  if (!obj || obj.x === undefined) return;
  const [cx, cy] = w2s(obj.x, obj.z ?? 0);
  const arrowLen = Math.max(24, cam.scale * 1.4);
  const HEAD_LEN = 10, HEAD_W = 5;

  function drawArrow(ex, ey, color) {
    const dx = ex - cx, dy = ey - cy;
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len < 1) return;
    const nx = dx/len, ny = dy/len, px = -ny, py = nx;
    const bx = ex - nx*HEAD_LEN, by = ey - ny*HEAD_LEN;
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(bx + px*HEAD_W, by + py*HEAD_W);
    ctx.lineTo(bx - px*HEAD_W, by - py*HEAD_W);
    ctx.closePath(); ctx.fill();
  }

  drawArrow(cx + arrowLen, cy, COLORS.gizmoX);   // X → right
  drawArrow(cx, cy + arrowLen, COLORS.gizmoZ);   // Z → down on screen
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx*dx + dy*dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / lenSq));
  return Math.hypot(px - (ax + t*dx), py - (ay + t*dy));
}

function hitGizmo(mx, my) {
  if (!sel) return null;
  const obj = getSelObj(sel);
  if (!obj || obj.x === undefined) return null;
  const [cx, cy] = w2s(obj.x, obj.z ?? 0);
  const arrowLen = Math.max(24, cam.scale * 1.4);
  if (distToSegment(mx, my, cx, cy, cx + arrowLen, cy) < 8) return 'x';
  if (distToSegment(mx, my, cx, cy, cx, cy + arrowLen) < 8) return 'z';
  return null;
}

function drawColliders() {
  for (let i = 0; i < state.boxes.length; i++) {
    const b = state.boxes[i];
    const isSel = sel?.kind === 'box' && sel.index === i;
    const [sx, sy] = w2s(b.x - b.hw, b.z - b.hd);
    const [ex, ey] = w2s(b.x + b.hw, b.z + b.hd);
    ctx.fillStyle   = isSel ? COLORS.boxSel   : COLORS.box;
    ctx.strokeStyle = COLORS.boxStroke;
    ctx.lineWidth   = isSel ? 2 : 1;
    ctx.fillRect(sx, sy, ex - sx, ey - sy);
    ctx.strokeRect(sx, sy, ex - sx, ey - sy);
  }
  for (let i = 0; i < state.circles.length; i++) {
    const c = state.circles[i];
    const isSel = sel?.kind === 'circle' && sel.index === i;
    const [cx, cy] = w2s(c.x, c.z);
    const rs = c.r * cam.scale;
    ctx.fillStyle   = isSel ? COLORS.circSel   : COLORS.circle;
    ctx.strokeStyle = COLORS.circStroke;
    ctx.lineWidth   = isSel ? 2 : 1;
    ctx.beginPath(); ctx.arc(cx, cy, rs, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
}

function drawPickups() {
  for (let i = 0; i < state.pickups.length; i++) {
    const p = state.pickups[i];
    const isSel = sel?.kind === 'pickup' && sel.index === i;
    const [sx, sy] = w2s(p.x, p.z);
    ctx.fillStyle   = isSel ? '#88ffaa' : COLORS.pickup;
    ctx.strokeStyle = '#0a0';
    ctx.lineWidth   = isSel ? 2 : 1;
    ctx.beginPath(); ctx.arc(sx, sy, isSel ? 7 : 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(p.weapon === 'random' ? '?' : p.weapon[0].toUpperCase(), sx, sy + 3);
  }
  for (let i = 0; i < state.hpacks.length; i++) {
    const h = state.hpacks[i];
    const isSel = sel?.kind === 'hp' && sel.index === i;
    const [sx, sy] = w2s(h.x, h.z);
    ctx.fillStyle   = isSel ? '#ffaaaa' : COLORS.hp;
    ctx.strokeStyle = '#a00';
    ctx.lineWidth   = isSel ? 2 : 1;
    const s = isSel ? 7 : 5;
    ctx.fillRect(sx - s, sy - s, s * 2, s * 2);
    ctx.strokeRect(sx - s, sy - s, s * 2, s * 2);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx, sy - 3); ctx.lineTo(sx, sy + 3);
    ctx.moveTo(sx - 3, sy); ctx.lineTo(sx + 3, sy); ctx.stroke();
  }
}

// Mission items (positions pulled from known data for city/forest_trail)
const MISSION_ITEMS = {
  city: [
    { id: 'fuel_0',    label: 'Fuel',     color: '#ffaa00' },
    { id: 'fuel_1',    label: 'Fuel',     color: '#ffaa00' },
    { id: 'repairKit', label: 'RepKit',   color: '#aa88ff' },
    { id: 'generator', label: 'GenPos',   color: '#ffff44' },
    { id: 'car',       label: 'Car/Deliver', color: '#ff8844' },
  ],
  forest_trail: [
    { id: 'genkey',    label: 'GenKey',   color: '#ffff44' },
    { id: 'generator', label: 'GenPos',   color: '#ff8844' },
    { id: 'exit',      label: 'Exit',     color: '#44ffff' },
  ],
};

// Default positions for mission items (pulled from GameRoom.js constants)
const MISSION_DEFAULTS = {
  city: {
    fuel_0:    { x:  6, z:  12 },
    fuel_1:    { x: -6, z:  12 },
    repairKit: { x:  0, z:  -8 },
    generator: { x: -15, z:  5 },
    car:       { x:  0, z:  -2 },
  },
  forest_trail: {
    genkey:    { x: -13, z: -4 },
    generator: { x: -15, z: -8 },
    exit:      { x:  0, z: -20 },
  },
};

// Editable mission positions
let missionPositions = initMissionPositions(mapId);

function initMissionPositions(id) {
  const defs = MISSION_DEFAULTS[id] ?? {};
  return Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, { ...v }]));
}

function drawMissionItems() {
  const defs = MISSION_ITEMS[mapId] ?? [];
  for (const def of defs) {
    const pos = missionPositions[def.id];
    if (!pos) continue;
    const isSel = sel?.kind === 'mission' && sel.id === def.id;
    const [sx, sy] = w2s(pos.x, pos.z);
    ctx.fillStyle   = isSel ? '#ffffff' : def.color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 8); ctx.lineTo(sx + 6, sy + 4); ctx.lineTo(sx - 6, sy + 4); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#000'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
    ctx.fillText(def.label.slice(0, 3), sx, sy + 14);
  }
}

function drawDragPreview() {
  if (!drag) return;
  if (drag.type === 'draw-box') {
    const [x0, z0] = snapPt(drag.startWx, drag.startWz);
    const [x1, z1] = snapPt(drag.curWx,   drag.curWz);
    const [sx0, sy0] = w2s(Math.min(x0,x1), Math.min(z0,z1));
    const [sx1, sy1] = w2s(Math.max(x0,x1), Math.max(z0,z1));
    ctx.fillStyle   = 'rgba(80,160,255,0.25)';
    ctx.strokeStyle = '#4af';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4,3]);
    ctx.fillRect(sx0, sy0, sx1-sx0, sy1-sy0);
    ctx.strokeRect(sx0, sy0, sx1-sx0, sy1-sy0);
    ctx.setLineDash([]);
  } else if (drag.type === 'draw-circle') {
    const [cx, cy] = w2s(drag.startWx, drag.startWz);
    const dx = drag.curWx - drag.startWx, dz = drag.curWz - drag.startWz;
    const r  = Math.sqrt(dx*dx + dz*dz);
    const rs = r * cam.scale;
    ctx.fillStyle   = 'rgba(255,180,60,0.2)';
    ctx.strokeStyle = '#fb3';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4,3]);
    ctx.beginPath(); ctx.arc(cx, cy, rs, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ── Preview draw ─────────────────────────────────────────────────────────────

function drawPreview() {
  if (!previewImg) return;
  // Map preview covers world [-MAP_HALF, MAP_HALF] × [-MAP_HALF, MAP_HALF]
  const [sx, sy] = w2s(-MAP_HALF, -MAP_HALF);
  const [ex, ey] = w2s( MAP_HALF,  MAP_HALF);
  ctx.globalAlpha = 0.7;
  ctx.drawImage(previewImg, sx, sy, ex - sx, ey - sy);
  ctx.globalAlpha = 1.0;
}

// ── Flow field draw ───────────────────────────────────────────────────────────

function drawFlowField() {
  if (ffDirty) {
    const tx = parseFloat(document.getElementById('ff-tx')?.value ?? 0);
    const tz = parseFloat(document.getElementById('ff-tz')?.value ?? -20);
    ffData  = FF.compute({ boxes: state.boxes, circles: state.circles }, tx, tz);
    ffDirty = false;
  }
  if (!ffData) return;

  const { field, dist } = ffData;
  const gs = FF.GRID_SIZE, hc = FF.HALF_CELLS, cs = FF.CELL_SIZE;

  for (let z = 0; z < gs; z++) {
    for (let x = 0; x < gs; x++) {
      const wx = (x - hc) * cs;
      const wz = (z - hc) * cs;
      const [sx, sy] = w2s(wx, wz);
      const i = z * gs + x;

      if (dist[i] === Infinity) {
        // blocked cell
        ctx.fillStyle = 'rgba(255,40,40,0.25)';
        const cs2 = cs * cam.scale;
        ctx.fillRect(sx - cs2/2, sy - cs2/2, cs2, cs2);
      } else {
        // draw arrow
        const dx = field[i*2], dz = field[i*2+1];
        if (dx === 0 && dz === 0) continue;
        const len = cs * cam.scale * 0.35;
        const ex = sx + dx * len;
        const ey = sy + dz * len;
        const dist01 = Math.min(1, dist[i] / 30);
        const r = Math.round(dist01 * 200);
        const g = Math.round((1 - dist01) * 200);
        ctx.strokeStyle = `rgba(${r},${g},60,0.7)`;
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        // arrowhead
        const angle = Math.atan2(ey - sy, ex - sx);
        const ah = 3;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - ah * Math.cos(angle - 0.5), ey - ah * Math.sin(angle - 0.5));
        ctx.lineTo(ex - ah * Math.cos(angle + 0.5), ey - ah * Math.sin(angle + 0.5));
        ctx.closePath();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
      }
    }
  }
}

// ── Hit testing ───────────────────────────────────────────────────────────────

function hitTest(wx, wz) {
  // Mission items (top priority when on missions tab)
  if (activeTab === 'missions') {
    const defs = MISSION_ITEMS[mapId] ?? [];
    for (const def of [...defs].reverse()) {
      const pos = missionPositions[def.id];
      if (!pos) continue;
      const d = Math.sqrt((wx - pos.x)**2 + (wz - pos.z)**2);
      if (d < 0.6) return { kind: 'mission', id: def.id };
    }
  }
  // Pickups
  if (activeTab === 'pickups') {
    for (let i = state.pickups.length - 1; i >= 0; i--) {
      const p = state.pickups[i];
      if (Math.sqrt((wx-p.x)**2+(wz-p.z)**2) < 0.6) return { kind:'pickup', index:i };
    }
    for (let i = state.hpacks.length - 1; i >= 0; i--) {
      const h = state.hpacks[i];
      if (Math.sqrt((wx-h.x)**2+(wz-h.z)**2) < 0.6) return { kind:'hp', index:i };
    }
  }
  // Player spawns
  if (layers.playerSpawns) {
    for (let i = state.playerSpawns.length - 1; i >= 0; i--) {
      const s = state.playerSpawns[i];
      if (Math.sqrt((wx - s.x) ** 2 + (wz - s.z) ** 2) < 0.5) return { kind: 'playerSpawn', index: i };
    }
  }
  // Zombie spawns
  if (layers.spawns) {
    for (let i = state.spawns.length - 1; i >= 0; i--) {
      const s = state.spawns[i];
      if (Math.sqrt((wx - s.x) ** 2 + (wz - s.z) ** 2) < 0.5) return { kind: 'spawn', index: i };
    }
  }
  // Colliders
  for (let i = state.boxes.length - 1; i >= 0; i--) {
    const b = state.boxes[i];
    if (wx >= b.x - b.hw && wx <= b.x + b.hw && wz >= b.z - b.hd && wz <= b.z + b.hd)
      return { kind:'box', index:i };
  }
  for (let i = state.circles.length - 1; i >= 0; i--) {
    const c = state.circles[i];
    if (Math.sqrt((wx-c.x)**2+(wz-c.z)**2) < c.r) return { kind:'circle', index:i };
  }
  return null;
}

// ── Selection helpers ─────────────────────────────────────────────────────────

function setSelection(s) {
  sel = s;
  refreshPropPanel();
  refreshColliderList();
  refreshPickupList();
  draw();
}

function refreshPropPanel() {
  const noProp         = document.getElementById('no-selection');
  const boxProp        = document.getElementById('box-props');
  const circProp       = document.getElementById('circle-props');
  const spawnProp      = document.getElementById('spawn-props');
  const playerSpawnProp = document.getElementById('player-spawn-props');
  noProp.style.display        = 'block';
  boxProp.style.display       = 'none';
  circProp.style.display      = 'none';
  if (spawnProp)       spawnProp.style.display       = 'none';
  if (playerSpawnProp) playerSpawnProp.style.display = 'none';
  if (!sel) return;
  if (sel.kind === 'box') {
    const b = state.boxes[sel.index];
    if (!b) return;
    noProp.style.display   = 'none';
    boxProp.style.display  = 'block';
    document.getElementById('prop-x').value  = round2(b.x);
    document.getElementById('prop-z').value  = round2(b.z);
    document.getElementById('prop-hw').value = round2(b.hw);
    document.getElementById('prop-hd').value = round2(b.hd);
  } else if (sel.kind === 'circle') {
    const c = state.circles[sel.index];
    if (!c) return;
    noProp.style.display   = 'none';
    circProp.style.display = 'block';
    document.getElementById('prop-cx').value = round2(c.x);
    document.getElementById('prop-cz').value = round2(c.z);
    document.getElementById('prop-cr').value = round2(c.r);
  } else if (sel.kind === 'spawn') {
    const s = state.spawns[sel.index];
    if (!s || !spawnProp) return;
    noProp.style.display    = 'none';
    spawnProp.style.display = 'block';
    document.getElementById('prop-sx').value = round2(s.x);
    document.getElementById('prop-sz').value = round2(s.z);
  } else if (sel.kind === 'playerSpawn') {
    const s = state.playerSpawns[sel.index];
    if (!s || !playerSpawnProp) return;
    noProp.style.display           = 'none';
    playerSpawnProp.style.display  = 'block';
    document.getElementById('prop-psx').value = round2(s.x);
    document.getElementById('prop-psz').value = round2(s.z);
  }
}

function refreshColliderList() { refreshElementsList(); }

function refreshElementsList() {
  // --- Zombie Spawns ---
  const spawnUl = document.getElementById('el-spawns');
  if (spawnUl) {
    spawnUl.innerHTML = '';
    state.spawns.forEach((s, i) => {
      const li = document.createElement('li');
      li.classList.toggle('selected', sel?.kind === 'spawn' && sel.index === i);
      li.innerHTML = `<span>spawn ${i + 1} (${round2(s.x)}, ${round2(s.z)})</span><span class="del">✕</span>`;
      li.addEventListener('click', e => {
        if (e.target.classList.contains('del')) {
          History.push(state); state.spawns.splice(i, 1); setSelection(null); autosave();
        } else { setSelection({ kind: 'spawn', index: i }); }
      });
      spawnUl.appendChild(li);
    });
    const cnt = document.getElementById('cnt-spawns');
    if (cnt) cnt.textContent = state.spawns.length;
    autoExpandIfSelected('el-spawns');
  }

  // --- Player Spawns ---
  const playerSpawnUl = document.getElementById('el-player-spawns');
  if (playerSpawnUl) {
    playerSpawnUl.innerHTML = '';
    state.playerSpawns.forEach((s, i) => {
      const li = document.createElement('li');
      li.classList.toggle('selected', sel?.kind === 'playerSpawn' && sel.index === i);
      li.innerHTML = `<span>P${i + 1} (${round2(s.x)}, ${round2(s.z)})</span><span class="del">✕</span>`;
      li.addEventListener('click', e => {
        if (e.target.classList.contains('del')) {
          History.push(state); state.playerSpawns.splice(i, 1); setSelection(null); autosave();
        } else { setSelection({ kind: 'playerSpawn', index: i }); }
      });
      playerSpawnUl.appendChild(li);
    });
    const cnt = document.getElementById('cnt-player-spawns');
    if (cnt) cnt.textContent = state.playerSpawns.length;
    autoExpandIfSelected('el-player-spawns');
  }

  // --- Environment (boxes + circles) ---
  const envUl = document.getElementById('el-env');
  if (envUl) {
    envUl.innerHTML = '';
    state.boxes.forEach((b, i) => {
      const li = document.createElement('li');
      li.classList.toggle('selected', sel?.kind === 'box' && sel.index === i);
      li.innerHTML = `<span>□ (${round2(b.x)}, ${round2(b.z)}) ${round2(b.hw)}×${round2(b.hd)}</span><span class="del">✕</span>`;
      li.addEventListener('click', e => {
        if (e.target.classList.contains('del')) {
          History.push(state); state.boxes.splice(i, 1); setSelection(null); ffDirty = true; autosave();
        } else { setSelection({ kind: 'box', index: i }); }
      });
      envUl.appendChild(li);
    });
    state.circles.forEach((c, i) => {
      const li = document.createElement('li');
      li.classList.toggle('selected', sel?.kind === 'circle' && sel.index === i);
      li.innerHTML = `<span>○ (${round2(c.x)}, ${round2(c.z)}) r=${round2(c.r)}</span><span class="del">✕</span>`;
      li.addEventListener('click', e => {
        if (e.target.classList.contains('del')) {
          History.push(state); state.circles.splice(i, 1); setSelection(null); ffDirty = true; autosave();
        } else { setSelection({ kind: 'circle', index: i }); }
      });
      envUl.appendChild(li);
    });
    const cnt = document.getElementById('cnt-env');
    if (cnt) cnt.textContent = state.boxes.length + state.circles.length;
    autoExpandIfSelected('el-env');
  }

  // --- Weapon Pickups ---
  const weaponUl = document.getElementById('el-weapons');
  if (weaponUl) {
    weaponUl.innerHTML = '';
    state.pickups.forEach((p, i) => {
      const li = document.createElement('li');
      li.classList.toggle('selected', sel?.kind === 'pickup' && sel.index === i);
      li.innerHTML = `<span>${p.weapon} (${round2(p.x)}, ${round2(p.z)})</span><span class="del">✕</span>`;
      li.addEventListener('click', e => {
        if (e.target.classList.contains('del')) {
          History.push(state); state.pickups.splice(i, 1); setSelection(null); autosave();
        } else { setSelection({ kind: 'pickup', index: i }); }
      });
      weaponUl.appendChild(li);
    });
    const cnt = document.getElementById('cnt-weapons');
    if (cnt) cnt.textContent = state.pickups.length;
    autoExpandIfSelected('el-weapons');
  }

  // --- Health Packs ---
  const hpUl = document.getElementById('el-hpacks');
  if (hpUl) {
    hpUl.innerHTML = '';
    state.hpacks.forEach((h, i) => {
      const li = document.createElement('li');
      li.classList.toggle('selected', sel?.kind === 'hp' && sel.index === i);
      li.innerHTML = `<span>hp (${round2(h.x)}, ${round2(h.z)})</span><span class="del">✕</span>`;
      li.addEventListener('click', e => {
        if (e.target.classList.contains('del')) {
          History.push(state); state.hpacks.splice(i, 1); setSelection(null); autosave();
        } else { setSelection({ kind: 'hp', index: i }); }
      });
      hpUl.appendChild(li);
    });
    const cnt = document.getElementById('cnt-hpacks');
    if (cnt) cnt.textContent = state.hpacks.length;
    autoExpandIfSelected('el-hpacks');
  }

  // --- Mission Items ---
  const missUl = document.getElementById('el-missions');
  if (missUl) {
    missUl.innerHTML = '';
    const defs = MISSION_ITEMS[mapId] ?? [];
    for (const def of defs) {
      const pos = missionPositions[def.id];
      if (!pos) continue;
      const li = document.createElement('li');
      li.classList.toggle('selected', sel?.kind === 'mission' && sel.id === def.id);
      li.innerHTML = `<span style="color:${def.color}">${def.label}</span><span>(${round2(pos.x)}, ${round2(pos.z)})</span>`;
      li.addEventListener('click', () => setSelection({ kind: 'mission', id: def.id }));
      missUl.appendChild(li);
    }
    const cnt = document.getElementById('cnt-missions-el');
    if (cnt) cnt.textContent = defs.length;
    autoExpandIfSelected('el-missions');
  }

  // --- Safe Zone ---
  const szUl = document.getElementById('el-safezone');
  if (szUl) {
    szUl.innerHTML = '';
    const sz = state.safeZone;
    const li = document.createElement('li');
    li.innerHTML = `<span>safe (${round2(sz.x)}, ${round2(sz.z)}) r=${round2(sz.r)}</span>`;
    szUl.appendChild(li);
  }
}

function refreshPickupList() {
  const wpList = document.getElementById('weapon-pickup-list');
  const hpList = document.getElementById('hp-list');
  if (!wpList || !hpList) return;
  wpList.innerHTML = '';
  hpList.innerHTML = '';
  state.pickups.forEach((p, i) => {
    const li = document.createElement('li');
    li.classList.toggle('selected', sel?.kind === 'pickup' && sel.index === i);
    li.innerHTML = `<span>${p.weapon} (${round2(p.x)}, ${round2(p.z)})</span><span class="del">✕</span>`;
    li.addEventListener('click', e => {
      if (e.target.classList.contains('del')) { state.pickups.splice(i,1); setSelection(null); }
      else { setSelection({ kind:'pickup', index:i }); switchTab('pickups'); }
    });
    wpList.appendChild(li);
  });
  state.hpacks.forEach((h, i) => {
    const li = document.createElement('li');
    li.classList.toggle('selected', sel?.kind === 'hp' && sel.index === i);
    li.innerHTML = `<span>hp (${round2(h.x)}, ${round2(h.z)})</span><span class="del">✕</span>`;
    li.addEventListener('click', e => {
      if (e.target.classList.contains('del')) { state.hpacks.splice(i,1); setSelection(null); }
      else { setSelection({ kind:'hp', index:i }); switchTab('pickups'); }
    });
    hpList.appendChild(li);
  });
}

function refreshMissionList() {
  refreshElementsList();
  const ul = document.getElementById('mission-item-list');
  if (!ul) return;
  ul.innerHTML = '';
  const defs = MISSION_ITEMS[mapId] ?? [];
  for (const def of defs) {
    const pos = missionPositions[def.id];
    if (!pos) continue;
    const li = document.createElement('li');
    li.classList.toggle('selected', sel?.kind === 'mission' && sel.id === def.id);
    li.innerHTML = `<span style="color:${def.color}">${def.label}</span><span>(${round2(pos.x)}, ${round2(pos.z)})</span>`;
    li.addEventListener('click', () => setSelection({ kind:'mission', id: def.id }));
    ul.appendChild(li);
  }
  // Populate safe zone fields
  document.getElementById('sz-x').value = round2(state.safeZone.x);
  document.getElementById('sz-z').value = round2(state.safeZone.z);
  document.getElementById('sz-r').value = round2(state.safeZone.r);
}

function refreshPickupPropPanel() {
  const noSel = document.getElementById('no-pickup-sel');
  const props = document.getElementById('pickup-props');
  if (!sel || (sel.kind !== 'pickup' && sel.kind !== 'hp')) {
    noSel.style.display  = 'block';
    props.style.display  = 'none';
    return;
  }
  noSel.style.display = 'none';
  props.style.display = 'block';
  const obj = sel.kind === 'pickup' ? state.pickups[sel.index] : state.hpacks[sel.index];
  if (!obj) return;
  document.getElementById('pu-x').value = round2(obj.x);
  document.getElementById('pu-z').value = round2(obj.z);
  const wRow = document.getElementById('pu-weapon-row');
  const wSel = document.getElementById('pu-weapon');
  if (sel.kind === 'pickup') {
    wRow.style.display = 'flex';
    wSel.innerHTML = ['shotgun','ak47','sniper','random'].map(w => `<option${w===obj.weapon?' selected':''}>${w}</option>`).join('');
  } else {
    wRow.style.display = 'none';
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────

function switchTab(id) {
  activeTab = id;
  document.querySelectorAll('.stab').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  ['colliders','pickups','missions','layers','io'].forEach(t => {
    document.getElementById(`tab-${t}`).style.display = t === id ? '' : 'none';
  });
  if (id === 'missions') refreshMissionList();
  if (id === 'pickups')  { refreshPickupList(); refreshPickupPropPanel(); }
}

// ── Mouse events ─────────────────────────────────────────────────────────────

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('mousedown', e => {
  const [wx, wz] = s2w(e.offsetX, e.offsetY);

  if (e.button === 1) { // middle — pan
    drag = { type:'pan', startMx: e.offsetX, startMz: e.offsetY, startCx: cam.x, startCz: cam.z };
    e.preventDefault();
    return;
  }

  if (e.button === 0) {
    const tool = activeTool;

    if (tool === 'select' || tool === 'pickup-select') {
      // Check gizmo arrows first
      const axis = hitGizmo(e.offsetX, e.offsetY);
      if (axis && sel) {
        const obj = getSelObj(sel);
        if (obj) drag = { type: 'axis-move', axis, startWx: wx, startWz: wz, origX: obj.x, origZ: obj.z };
        return;
      }
      const hit = hitTest(wx, wz);
      if (hit) {
        setSelection(hit);
        // start a move drag
        const obj = getSelObj(hit);
        if (obj) drag = { type:'move-sel', startWx:wx, startWz:wz, origX: obj.x, origZ: obj.z ?? obj.z };
      } else {
        setSelection(null);
      }
    } else if (tool === 'player-spawn') {
      History.push(state);
      const [sx, sz] = snapPt(wx, wz);
      state.playerSpawns.push({ x: sx, z: sz });
      setSelection({ kind: 'playerSpawn', index: state.playerSpawns.length - 1 });
      autosave();
    } else if (tool === 'zombie-spawn') {
      History.push(state);
      const [sx, sz] = snapPt(wx, wz);
      state.spawns.push({ x: sx, z: sz });
      setSelection({ kind: 'spawn', index: state.spawns.length - 1 });
      autosave();
    } else if (tool === 'box') {
      const [sx, sz] = snapPt(wx, wz);
      drag = { type:'draw-box', startWx:sx, startWz:sz, curWx:sx, curWz:sz };
    } else if (tool === 'circle') {
      drag = { type:'draw-circle', startWx:wx, startWz:wz, curWx:wx, curWz:wz };
    } else if (tool === 'pickup-add') {
      History.push(state);
      const [sx, sz] = snapPt(wx, wz);
      const wt = document.getElementById('pickup-weapon-type').value;
      const id = `wp_${mapId[0]}${Date.now()}`;
      state.pickups.push({ id, weapon: wt, x: sx, z: sz });
      setSelection({ kind:'pickup', index: state.pickups.length - 1 });
      refreshPickupList(); autosave();
    } else if (tool === 'hp-add') {
      History.push(state);
      const [sx, sz] = snapPt(wx, wz);
      const id = `hp_${mapId[0]}${Date.now()}`;
      state.hpacks.push({ id, x: sx, z: sz });
      setSelection({ kind:'hp', index: state.hpacks.length - 1 });
      refreshPickupList(); autosave();
    } else if (e.altKey) {
      // Alt+click: set flow field target
      const [sx, sz] = [wx, wz];
      const txEl = document.getElementById('ff-tx');
      const tzEl = document.getElementById('ff-tz');
      if (txEl) txEl.value = round2(sx);
      if (tzEl) tzEl.value = round2(sz);
      ffDirty = true; draw();
    }
  }
});

canvas.addEventListener('mousemove', e => {
  const [wx, wz] = s2w(e.offsetX, e.offsetY);
  // Status bar
  document.getElementById('sb-x').textContent = wx.toFixed(2);
  document.getElementById('sb-z').textContent = wz.toFixed(2);

  if (!drag) return;

  if (drag.type === 'pan') {
    const dx = (e.offsetX - drag.startMx) / cam.scale;
    const dz = (e.offsetY - drag.startMz) / cam.scale;
    cam.x = drag.startCx - dx;
    cam.z = drag.startCz - dz;
    draw();
    return;
  }

  if (drag.type === 'draw-box' || drag.type === 'draw-circle') {
    drag.curWx = wx; drag.curWz = wz;
    draw();
    return;
  }

  if (drag.type === 'move-sel' && sel) {
    const dx = wx - drag.startWx;
    const dz = wz - drag.startWz;
    const [nx, nz] = snapPt(drag.origX + dx, drag.origZ + dz);
    const obj = getSelObj(sel);
    if (obj) { obj.x = nx; obj.z = nz; }
    refreshPropPanel();
    refreshPickupPropPanel();
    refreshMissionList();
    draw();
  }

  if (drag.type === 'axis-move' && sel) {
    const dx = wx - drag.startWx;
    const dz = wz - drag.startWz;
    const obj = getSelObj(sel);
    if (obj) {
      if (drag.axis === 'x') obj.x = snapVal(drag.origX + dx);
      else                   obj.z = snapVal(drag.origZ + dz);
    }
    refreshPropPanel();
    refreshPickupPropPanel();
    refreshMissionList();
    draw();
  }
});

canvas.addEventListener('mouseup', e => {
  if (!drag) return;
  const [wx, wz] = s2w(e.offsetX, e.offsetY);

  if (drag.type === 'draw-box' && e.button === 0) {
    const [x0, z0] = snapPt(drag.startWx, drag.startWz);
    const [x1, z1] = snapPt(wx, wz);
    const hw = Math.abs(x1 - x0) / 2;
    const hd = Math.abs(z1 - z0) / 2;
    if (hw > 0.1 && hd > 0.1) {
      History.push(state);
      state.boxes.push({ x: (x0+x1)/2, z: (z0+z1)/2, hw, hd });
      setSelection({ kind:'box', index: state.boxes.length - 1 });
      ffDirty = true; autosave();
    }
  } else if (drag.type === 'draw-circle' && e.button === 0) {
    const dx = wx - drag.startWx, dz = wz - drag.startWz;
    const r = Math.round(Math.sqrt(dx*dx + dz*dz) * 100) / 100;
    if (r > 0.1) {
      History.push(state);
      state.circles.push({ x: snapVal(drag.startWx), z: snapVal(drag.startWz), r });
      setSelection({ kind:'circle', index: state.circles.length - 1 });
      ffDirty = true; autosave();
    }
  } else if (drag.type === 'move-sel') {
    autosave();
  } else if (drag.type === 'axis-move') {
    autosave();
  }

  drag = null;
  refreshColliderList();
  draw();
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.85 : 1.18;
  const [wx, wz] = s2w(e.offsetX, e.offsetY);
  cam.scale = Math.max(4, Math.min(80, cam.scale * factor));
  // zoom toward cursor
  const [nsx, nsz] = w2s(wx, wz);
  cam.x += (nsx - e.offsetX) / cam.scale;
  cam.z += (nsz - e.offsetY) / cam.scale;
  draw();
}, { passive: false });

// ── Keyboard ─────────────────────────────────────────────────────────────────

window.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return; // don't intercept typing

  if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey) {
    if (!sel) return;
    History.push(state);
    if (sel.kind === 'box')         state.boxes.splice(sel.index, 1);
    if (sel.kind === 'circle')      state.circles.splice(sel.index, 1);
    if (sel.kind === 'pickup')      state.pickups.splice(sel.index, 1);
    if (sel.kind === 'hp')          state.hpacks.splice(sel.index, 1);
    if (sel.kind === 'spawn')       state.spawns.splice(sel.index, 1);
    if (sel.kind === 'playerSpawn') state.playerSpawns.splice(sel.index, 1);
    setSelection(null);
    refreshColliderList();
    refreshPickupList();
    autosave();
  }

  if (e.ctrlKey && e.key === 'z') {
    e.preventDefault();
    applyUndo();
  }
  if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
    e.preventDefault();
    applyRedo();
  }
});

// ── Prop panel inputs ─────────────────────────────────────────────────────────

function bindPropInput(id, fn) {
  document.getElementById(id)?.addEventListener('input', () => { fn(); draw(); });
}

bindPropInput('prop-x',  () => { if (sel?.kind==='box')    { state.boxes[sel.index].x  = numVal('prop-x');  refreshColliderList(); ffDirty=true; autosave(); }});
bindPropInput('prop-z',  () => { if (sel?.kind==='box')    { state.boxes[sel.index].z  = numVal('prop-z');  refreshColliderList(); ffDirty=true; autosave(); }});
bindPropInput('prop-hw', () => { if (sel?.kind==='box')    { state.boxes[sel.index].hw = numVal('prop-hw'); refreshColliderList(); ffDirty=true; autosave(); }});
bindPropInput('prop-hd', () => { if (sel?.kind==='box')    { state.boxes[sel.index].hd = numVal('prop-hd'); refreshColliderList(); ffDirty=true; autosave(); }});
bindPropInput('prop-cx', () => { if (sel?.kind==='circle') { state.circles[sel.index].x = numVal('prop-cx'); refreshColliderList(); ffDirty=true; autosave(); }});
bindPropInput('prop-cz', () => { if (sel?.kind==='circle') { state.circles[sel.index].z = numVal('prop-cz'); refreshColliderList(); ffDirty=true; autosave(); }});
bindPropInput('prop-cr', () => { if (sel?.kind==='circle') { state.circles[sel.index].r = numVal('prop-cr'); refreshColliderList(); ffDirty=true; autosave(); }});

bindPropInput('pu-x', () => { const o = getSelObj(sel); if(o) { o.x = numVal('pu-x'); refreshPickupList(); }});
bindPropInput('pu-z', () => { const o = getSelObj(sel); if(o) { o.z = numVal('pu-z'); refreshPickupList(); }});
document.getElementById('pu-weapon')?.addEventListener('change', e => {
  if (sel?.kind === 'pickup') state.pickups[sel.index].weapon = e.target.value;
  refreshPickupList(); draw();
});

document.getElementById('btn-delete-sel')  ?.addEventListener('click', () => { if(sel?.kind==='box')    { History.push(state); state.boxes.splice(sel.index,1);    setSelection(null); refreshColliderList(); }});
document.getElementById('btn-delete-sel-c') ?.addEventListener('click', () => { if(sel?.kind==='circle') { History.push(state); state.circles.splice(sel.index,1); setSelection(null); refreshColliderList(); }});
document.getElementById('btn-delete-spawn') ?.addEventListener('click', () => { if(sel?.kind==='spawn')  { History.push(state); state.spawns.splice(sel.index,1);  setSelection(null); refreshColliderList(); autosave(); }});

bindPropInput('prop-sx', () => { if (sel?.kind==='spawn') { state.spawns[sel.index].x = numVal('prop-sx'); refreshColliderList(); autosave(); }});
bindPropInput('prop-sz', () => { if (sel?.kind==='spawn') { state.spawns[sel.index].z = numVal('prop-sz'); refreshColliderList(); autosave(); }});

bindPropInput('prop-psx', () => { if (sel?.kind==='playerSpawn') { state.playerSpawns[sel.index].x = numVal('prop-psx'); refreshColliderList(); autosave(); }});
bindPropInput('prop-psz', () => { if (sel?.kind==='playerSpawn') { state.playerSpawns[sel.index].z = numVal('prop-psz'); refreshColliderList(); autosave(); }});
document.getElementById('btn-delete-player-spawn')?.addEventListener('click', () => { if (sel?.kind==='playerSpawn') { History.push(state); state.playerSpawns.splice(sel.index, 1); setSelection(null); refreshColliderList(); autosave(); }});

document.getElementById('btn-delete-pickup')?.addEventListener('click', () => {
  if (sel?.kind === 'pickup') state.pickups.splice(sel.index, 1);
  if (sel?.kind === 'hp')     state.hpacks.splice(sel.index, 1);
  setSelection(null); refreshPickupList();
});

document.getElementById('btn-apply-sz')?.addEventListener('click', () => {
  History.push(state);
  state.safeZone.x = numVal('sz-x');
  state.safeZone.z = numVal('sz-z');
  state.safeZone.r = numVal('sz-r');
  autosave(); draw();
});

// ── Tool buttons ─────────────────────────────────────────────────────────────

function setTool(t) {
  activeTool = t;
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active-tool', b.dataset.tool === t));
  document.getElementById('sb-mode').textContent = t.toUpperCase();
}

document.querySelectorAll('[data-tool]').forEach(b => {
  b.addEventListener('click', () => setTool(b.dataset.tool));
});

// ── Tab buttons ───────────────────────────────────────────────────────────────

document.querySelectorAll('.stab').forEach(b => {
  b.addEventListener('click', () => switchTab(b.dataset.tab));
});

// ── Layer toggles ─────────────────────────────────────────────────────────────

document.querySelectorAll('[data-layer]').forEach(cb => {
  cb.addEventListener('change', () => { layers[cb.dataset.layer] = cb.checked; draw(); });
});

// ── Map select ────────────────────────────────────────────────────────────────

document.getElementById('map-select').addEventListener('change', e => {
  mapId = e.target.value;
  state = loadState(mapId);
  missionPositions = (Storage.load(mapId)?.missionPositions) ? { ...Storage.load(mapId).missionPositions } : initMissionPositions(mapId);
  ffDirty = true; ffData = null; previewImg = null;
  History.clear();
  setSelection(null);
  refreshColliderList(); refreshPickupList(); refreshMissionList();
  draw();
});

document.getElementById('btn-reload').addEventListener('click', () => {
  state = loadState(mapId);
  missionPositions = (Storage.load(mapId)?.missionPositions) ? { ...Storage.load(mapId).missionPositions } : initMissionPositions(mapId);
  ffDirty = true; ffData = null;
  setSelection(null);
  refreshColliderList(); refreshPickupList(); refreshMissionList();
  draw();
});

document.getElementById('btn-reset-cam')?.addEventListener('click', () => {
  cam.x = 0; cam.z = 0; cam.scale = 18; draw();
});

// ── Export ────────────────────────────────────────────────────────────────────

document.getElementById('btn-export-colliders')?.addEventListener('click', () => {
  const boxes   = state.boxes.map(b   => `      { x: ${fmt(b.x)}, z: ${fmt(b.z)}, hw: ${fmt(b.hw)}, hd: ${fmt(b.hd)} },`).join('\n');
  const circles = state.circles.map(c => `      { x: ${fmt(c.x)}, z: ${fmt(c.z)}, r: ${fmt(c.r)} },`).join('\n');
  const out = `  ${mapId}: {\n    boxes: [\n${boxes}\n    ],\n    circles: [\n${circles}\n    ],\n  },`;
  document.getElementById('export-colliders').value = out;
});

document.getElementById('btn-copy-colliders')?.addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('export-colliders').value);
});

document.getElementById('btn-export-pickups')?.addEventListener('click', () => {
  const wps = state.pickups.map((p,i) => `    { id: '${p.id || `wp_${mapId[0]}${i}`}', weapon: '${p.weapon}', x: ${fmt(p.x)}, z: ${fmt(p.z)} },`).join('\n');
  const hps = state.hpacks.map((h,i)  => `    { id: '${h.id || `hp_${mapId[0]}${i}`}', x: ${fmt(h.x)}, z: ${fmt(h.z)} },`).join('\n');
  const out = `// WEAPON_PICKUPS_BY_MAP.${mapId}\n[\n${wps}\n]\n\n// HEALTHPACK_POSITIONS_BY_MAP.${mapId}\n[\n${hps}\n]`;
  document.getElementById('export-pickups').value = out;
});

document.getElementById('btn-copy-pickups')?.addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('export-pickups').value);
});

document.getElementById('btn-export-missions')?.addEventListener('click', () => {
  const lines = Object.entries(missionPositions)
    .map(([k, v]) => `  ${k}: { x: ${fmt(v.x)}, z: ${fmt(v.z)} },`)
    .join('\n');
  const sz = state.safeZone;
  const out = `// Mission positions — ${mapId}\nconst POSITIONS = {\n${lines}\n};\n\n// Safe zone\nconst SAFE_ZONE   = { x: ${fmt(sz.x)}, z: ${fmt(sz.z)} };\nconst SAFE_ZONE_R = ${fmt(sz.r)};`;
  document.getElementById('export-missions').value = out;
});

document.getElementById('btn-copy-missions')?.addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('export-missions').value);
});

// ── Undo / Redo ───────────────────────────────────────────────────────────────

function applyUndo() {
  const prev = History.undo(state);
  if (!prev) return;
  state = prev;
  ffDirty = true;
  setSelection(null);
  refreshColliderList(); refreshPickupList(); refreshMissionList();
  autosave(); draw();
}

function applyRedo() {
  const next = History.redo(state);
  if (!next) return;
  state = next;
  ffDirty = true;
  setSelection(null);
  refreshColliderList(); refreshPickupList(); refreshMissionList();
  autosave(); draw();
}

document.getElementById('btn-undo')?.addEventListener('click', applyUndo);
document.getElementById('btn-redo')?.addEventListener('click', applyRedo);

// ── I/O tab buttons ───────────────────────────────────────────────────────────

document.getElementById('btn-reset-map')?.addEventListener('click', () => {
  if (!confirm(`Reset ${mapId} to defaults? This clears all edits.`)) return;
  History.push(state);
  Storage.clearMap(mapId);
  state = defaultState(mapId);
  missionPositions = initMissionPositions(mapId);
  ffDirty = true;
  setSelection(null);
  refreshColliderList(); refreshPickupList(); refreshMissionList();
  draw();
});

document.getElementById('btn-export-json')?.addEventListener('click', () => {
  const all = Storage.exportAll();
  document.getElementById('export-json').value = JSON.stringify(all, null, 2);
});

document.getElementById('btn-copy-json')?.addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('export-json').value);
});

document.getElementById('btn-download-json')?.addEventListener('click', () => {
  const data = Storage.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'map-editor-state.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById('btn-import-json')?.addEventListener('click', () => {
  const json = document.getElementById('import-json').value.trim();
  if (!json) return;
  const data = Storage.importAll(json);
  if (!data) return;
  state = loadState(mapId);
  missionPositions = (data[mapId]?.missionPositions) ? { ...data[mapId].missionPositions } : initMissionPositions(mapId);
  ffDirty = true;
  setSelection(null);
  refreshColliderList(); refreshPickupList(); refreshMissionList();
  draw();
  alert('Imported.');
});

function generateAllSnippets() {
  const boxes   = state.boxes.map(b   => `      { x: ${fmt(b.x)}, z: ${fmt(b.z)}, hw: ${fmt(b.hw)}, hd: ${fmt(b.hd)} },`).join('\n');
  const circles = state.circles.map(c => `      { x: ${fmt(c.x)}, z: ${fmt(c.z)}, r: ${fmt(c.r)} },`).join('\n');
  const wps = state.pickups.map((p,i) => `    { id: '${p.id || `wp_${mapId[0]}${i}`}', weapon: '${p.weapon}', x: ${fmt(p.x)}, z: ${fmt(p.z)} },`).join('\n');
  const hps = state.hpacks.map((h,i)  => `    { id: '${h.id || `hp_${mapId[0]}${i}`}', x: ${fmt(h.x)}, z: ${fmt(h.z)} },`).join('\n');
  const mpos = Object.entries(missionPositions).map(([k,v]) => `  ${k}: { x: ${fmt(v.x)}, z: ${fmt(v.z)} },`).join('\n');
  const sz = state.safeZone;
  const spawns = state.spawns.map(s => `  { x: ${fmt(s.x)}, z: ${fmt(s.z)} },`).join('\n');
  const playerSpawns = state.playerSpawns.map(s => `  { x: ${fmt(s.x)}, z: ${fmt(s.z)} },`).join('\n');

  return [
    `// ── MAP_COLLIDERS.${mapId} ──`,
    `  ${mapId}: {\n    boxes: [\n${boxes}\n    ],\n    circles: [\n${circles}\n    ],\n  },`,
    `\n// ── WEAPON_PICKUPS_BY_MAP.${mapId} ──`,
    `  ${mapId}: [\n${wps}\n  ],`,
    `\n// ── HEALTHPACK_POSITIONS_BY_MAP.${mapId} ──`,
    `  ${mapId}: [\n${hps}\n  ],`,
    `\n// ── Mission positions (${mapId}) ──`,
    `const POSITIONS = {\n${mpos}\n};`,
    `\n// ── Safe zone ──`,
    `export const SAFE_ZONE        = { x: ${fmt(sz.x)}, z: ${fmt(sz.z)} };`,
    `export const SAFE_ZONE_RADIUS = ${fmt(sz.r)};`,
    `\n// ── Zombie spawn points ──`,
    `export const SPAWN_POINTS = [\n${spawns}\n];`,
    `\n// ── Player spawn points ──`,
    `export const PLAYER_SPAWN_POINTS = [\n${playerSpawns}\n];`,
  ].join('\n');
}

document.getElementById('btn-gen-all')?.addEventListener('click', () => {
  document.getElementById('export-all').value = generateAllSnippets();
});

document.getElementById('btn-copy-all')?.addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('export-all').value);
});

// ── Flow field / preview buttons ──────────────────────────────────────────────

document.getElementById('btn-compute-ff')?.addEventListener('click', () => {
  ffDirty = true;
  layers.flowfield = true;
  const cb = document.querySelector('[data-layer="flowfield"]');
  if (cb) cb.checked = true;
  draw();
});

document.getElementById('btn-load-preview')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-load-preview');
  btn.textContent = 'Loading…';
  btn.disabled = true;
  try {
    previewImg = await getPreview(mapId);
    layers.preview = true;
    const cb = document.querySelector('[data-layer="preview"]');
    if (cb) cb.checked = true;
  } catch (e) {
    alert('Preview failed: ' + e.message);
  }
  btn.textContent = 'Load / refresh preview';
  btn.disabled = false;
  draw();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSelObj(s) {
  if (!s) return null;
  if (s.kind === 'box')         return state.boxes[s.index];
  if (s.kind === 'circle')      return state.circles[s.index];
  if (s.kind === 'pickup')      return state.pickups[s.index];
  if (s.kind === 'hp')          return state.hpacks[s.index];
  if (s.kind === 'spawn')       return state.spawns[s.index];
  if (s.kind === 'playerSpawn') return state.playerSpawns[s.index];
  if (s.kind === 'mission')     return missionPositions[s.id];
  return null;
}

function numVal(id) { return parseFloat(document.getElementById(id).value) || 0; }
function round2(v)  { return Math.round(v * 100) / 100; }
function fmt(v)     { return round2(v).toFixed(2); }

// ── Group header toggles ──────────────────────────────────────────────────────

document.querySelectorAll('.elem-group-hdr').forEach(hdr => {
  hdr.addEventListener('click', () => setGroupExpanded(hdr.dataset.grp, !groupExpanded[hdr.dataset.grp]));
});

// ── Playtest ──────────────────────────────────────────────────────────────────

document.getElementById('btn-playtest')?.addEventListener('click', () => {
  document.getElementById('playtest-overlay').style.display = 'block';
  Playtest.start(mapId, state, () => {
    document.getElementById('playtest-overlay').style.display = 'none';
  });
});

document.getElementById('btn-exit-playtest')?.addEventListener('click', () => {
  Playtest.stop();
});

// ── Init ──────────────────────────────────────────────────────────────────────

resize();
refreshColliderList();
refreshPickupList();
setTool('select');
draw();
