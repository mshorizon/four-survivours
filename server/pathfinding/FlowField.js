// Flow-field pathfinding (multi-source BFS toward all alive players).
// Enemies sample one direction lookup instead of running individual A* paths.
import { MAP_COLLIDERS } from '../../shared/colliders.js';
import { MAP_HALF } from '../../shared/constants.js';

const CELL_SIZE  = 1.5;
const GRID_SIZE  = Math.ceil((MAP_HALF * 2) / CELL_SIZE); // 32
const HALF_CELLS = GRID_SIZE / 2;                         // 16
const REFRESH    = 0.4;  // seconds between full rebuilds

// Cardinal + diagonal neighbours [ox, oz, cost]
const NEIGHBORS = [
  [1,0,1],[-1,0,1],[0,1,1],[0,-1,1],
  [1,1,1.414],[-1,1,1.414],[1,-1,1.414],[-1,-1,1.414],
];
const CARDINAL = [[1,0],[-1,0],[0,1],[0,-1]];

export class FlowField {
  constructor(mapId) {
    this.mapId   = mapId;
    // Flat array [dx0,dz0, dx1,dz1, ...] one direction per cell
    this._field  = new Float32Array(GRID_SIZE * GRID_SIZE * 2);
    this._timer  = 0;
  }

  /** Call every server tick with dt (seconds) and current players array. */
  update(dt, players) {
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = REFRESH;
    const alive = players.filter(p => p.alive && !p.inSafeZone);
    if (alive.length > 0) this._rebuild(alive);
  }

  /** Returns {dx, dz} unit direction for an entity at world-space (x, z). */
  dir(x, z) {
    const cx = Math.round(x / CELL_SIZE) + HALF_CELLS;
    const cz = Math.round(z / CELL_SIZE) + HALF_CELLS;
    const bx = Math.max(0, Math.min(GRID_SIZE - 1, cx));
    const bz = Math.max(0, Math.min(GRID_SIZE - 1, cz));
    const i  = (bz * GRID_SIZE + bx) * 2;
    return { dx: this._field[i], dz: this._field[i + 1] };
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _rebuild(players) {
    const dist  = new Float32Array(GRID_SIZE * GRID_SIZE).fill(Infinity);
    const queue = [];  // [[cx, cz], ...]

    for (const p of players) {
      const cx = Math.round(p.x / CELL_SIZE) + HALF_CELLS;
      const cz = Math.round(p.z / CELL_SIZE) + HALF_CELLS;
      if (cx < 0 || cx >= GRID_SIZE || cz < 0 || cz >= GRID_SIZE) continue;
      const i = cz * GRID_SIZE + cx;
      if (dist[i] > 0) { dist[i] = 0; queue.push([cx, cz]); }
    }

    let qi = 0;
    while (qi < queue.length) {
      const [cx, cz] = queue[qi++];
      const cd = dist[cz * GRID_SIZE + cx];
      for (const [ox, oz, cost] of NEIGHBORS) {
        const nx = cx + ox, nz = cz + oz;
        if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;
        if (this._cellBlocked(nx, nz)) continue;
        const ni = nz * GRID_SIZE + nx;
        const nd = cd + cost;
        if (nd < dist[ni]) { dist[ni] = nd; queue.push([nx, nz]); }
      }
    }

    // Direction = toward the lowest-dist cardinal neighbour
    for (let z = 0; z < GRID_SIZE; z++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const i = z * GRID_SIZE + x;
        if (dist[i] === Infinity) { this._field[i*2] = 0; this._field[i*2+1] = 0; continue; }
        let bestD = Infinity, bdx = 0, bdz = 0;
        for (const [ox, oz] of CARDINAL) {
          const nx = x + ox, nz = z + oz;
          if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;
          const d = dist[nz * GRID_SIZE + nx];
          if (d < bestD) { bestD = d; bdx = ox; bdz = oz; }
        }
        const len = Math.sqrt(bdx * bdx + bdz * bdz);
        this._field[i*2]     = len > 0 ? bdx / len : 0;
        this._field[i*2 + 1] = len > 0 ? bdz / len : 0;
      }
    }
  }

  _cellBlocked(cx, cz) {
    const wx  = (cx - HALF_CELLS) * CELL_SIZE;
    const wz  = (cz - HALF_CELLS) * CELL_SIZE;
    const r   = CELL_SIZE * 0.55;
    const col = MAP_COLLIDERS[this.mapId];
    if (!col) return false;
    for (const b of col.boxes) {
      const nx = Math.max(b.x - b.hw, Math.min(b.x + b.hw, wx));
      const nz = Math.max(b.z - b.hd, Math.min(b.z + b.hd, wz));
      const dx = wx - nx, dz = wz - nz;
      if (dx*dx + dz*dz < r*r) return true;
    }
    for (const c of col.circles) {
      const dx = wx - c.x, dz = wz - c.z;
      const m  = r + c.r;
      if (dx*dx + dz*dz < m*m) return true;
    }
    return false;
  }
}
