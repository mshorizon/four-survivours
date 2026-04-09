/**
 * Buffers server snapshots and returns a lerped state
 * delayed by BUFFER_MS so we always have two frames to interpolate between.
 */
const BUFFER_MS = 80; // interpolation delay (~4 ticks at 20 Hz)

export class Interpolator {
  constructor() {
    this._buf = []; // { state, ts }
  }

  push(state) {
    this._buf.push({ state, ts: performance.now() });
    if (this._buf.length > 20) this._buf.shift();
  }

  /** Returns interpolated snapshot or latest available */
  get() {
    if (this._buf.length === 0) return null;
    if (this._buf.length === 1) return this._buf[0].state;

    const renderTs = performance.now() - BUFFER_MS;

    // Find the two snapshots that bracket renderTs
    let from = null, to = null;
    for (let i = 0; i < this._buf.length - 1; i++) {
      if (this._buf[i].ts <= renderTs && this._buf[i + 1].ts >= renderTs) {
        from = this._buf[i];
        to   = this._buf[i + 1];
        break;
      }
    }

    // Not enough buffer yet — just use latest
    if (!to) return this._buf[this._buf.length - 1].state;

    const dur = to.ts - from.ts;
    const t   = dur > 0 ? Math.min(1, (renderTs - from.ts) / dur) : 1;

    return _lerp(from.state, to.state, t);
  }
}

function _lerp(a, b, t) {
  return {
    ...b,
    players: b.players.map(bp => {
      const ap = a.players.find(p => p.id === bp.id);
      if (!ap) return bp;
      return { ...bp, x: ap.x + (bp.x - ap.x) * t, z: ap.z + (bp.z - ap.z) * t };
    }),
    enemies: b.enemies.map(be => {
      const ae = a.enemies.find(e => e.id === be.id);
      if (!ae) return be;
      return { ...be, x: ae.x + (be.x - ae.x) * t, z: ae.z + (be.z - ae.z) * t };
    }),
  };
}
