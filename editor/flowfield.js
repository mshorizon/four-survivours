import { MAP_HALF } from '../shared/constants.js';

export const CELL_SIZE  = 1.5;
export const GRID_SIZE  = Math.ceil((MAP_HALF * 2) / CELL_SIZE); // 32
export const HALF_CELLS = GRID_SIZE / 2;

const NEIGHBORS = [
  [1,0,1],[-1,0,1],[0,1,1],[0,-1,1],
  [1,1,1.414],[-1,1,1.414],[1,-1,1.414],[-1,-1,1.414],
];

export function compute(colliders, targetX, targetZ) {
  const dist  = new Float32Array(GRID_SIZE * GRID_SIZE).fill(Infinity);
  const field = new Float32Array(GRID_SIZE * GRID_SIZE * 2);

  const tcx = Math.round(targetX / CELL_SIZE) + HALF_CELLS;
  const tcz = Math.round(targetZ / CELL_SIZE) + HALF_CELLS;
  const queue = [];
  if (tcx >= 0 && tcx < GRID_SIZE && tcz >= 0 && tcz < GRID_SIZE) {
    dist[tcz * GRID_SIZE + tcx] = 0;
    queue.push([tcx, tcz]);
  }

  let qi = 0;
  while (qi < queue.length) {
    const [cx, cz] = queue[qi++];
    const cd = dist[cz * GRID_SIZE + cx];
    for (const [ox, oz, cost] of NEIGHBORS) {
      const nx = cx + ox, nz = cz + oz;
      if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;
      if (blocked(nx, nz, colliders)) continue;
      const ni = nz * GRID_SIZE + nx;
      const nd = cd + cost;
      if (nd < dist[ni]) { dist[ni] = nd; queue.push([nx, nz]); }
    }
  }

  for (let z = 0; z < GRID_SIZE; z++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const i = z * GRID_SIZE + x;
      if (dist[i] === Infinity) { field[i*2] = 0; field[i*2+1] = 0; continue; }
      let bestD = Infinity, bdx = 0, bdz = 0;
      for (const [ox, oz] of NEIGHBORS) {
        const nx = x + ox, nz = z + oz;
        if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;
        const d = dist[nz * GRID_SIZE + nx];
        if (d < bestD) { bestD = d; bdx = ox; bdz = oz; }
      }
      const len = Math.sqrt(bdx*bdx + bdz*bdz);
      field[i*2]   = len > 0 ? bdx/len : 0;
      field[i*2+1] = len > 0 ? bdz/len : 0;
    }
  }

  return { field, dist };
}

function blocked(cx, cz, col) {
  const wx = (cx - HALF_CELLS) * CELL_SIZE;
  const wz = (cz - HALF_CELLS) * CELL_SIZE;
  const r  = CELL_SIZE * 0.55;
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
