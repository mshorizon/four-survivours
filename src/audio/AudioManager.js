// Procedural Web Audio API sounds — no external assets needed.
export class AudioManager {
  constructor() {
    this._ctx    = null;
    this._master = null;
  }

  /** Call once after a user gesture to unlock AudioContext. */
  init() {
    if (this._ctx) return;
    this._ctx    = new (window.AudioContext || window.webkitAudioContext)();
    this._master = this._ctx.createGain();
    this._master.gain.value = 0.55;
    this._master.connect(this._ctx.destination);
  }

  shoot(weapon) {
    this._fx(c => {
      const o = this._master;
      if (weapon === 'shotgun') {
        _noise(c, o, 1.1, 0, 0.22); _tone(c, o, 'sawtooth', 155, 0, 0.01, 0.18, 0.38);
      } else if (weapon === 'ak47') {
        _tone(c, o, 'sawtooth', 650, 0, 0.005, 0.06, 0.5); _noise(c, o, 0.3, 0, 0.04);
      } else { // pistol
        _tone(c, o, 'sawtooth', 500, 0, 0.008, 0.09, 0.42); _noise(c, o, 0.2, 0, 0.07);
      }
    });
  }

  reload()     { this._fx(c => { _noise(c, this._master, 0.1, 0, 0.09); _tone(c, this._master, 'sine', 340, 0.07, 0.01, 0.06, 0.28); }); }
  hit()        { this._fx(c => { _tone(c, this._master, 'square', 125, 0, 0.005, 0.07, 0.22, 55); _noise(c, this._master, 0.12, 0, 0.05); }); }
  enemyDeath() { this._fx(c => { _tone(c, this._master, 'sawtooth', 185, 0, 0.005, 0.28, 0.18, 38); _noise(c, this._master, 0.28, 0, 0.22); }); }
  playerHurt() { this._fx(c => { _tone(c, this._master, 'square', 275, 0, 0.01, 0.22, 0.3, 105); _noise(c, this._master, 0.38, 0, 0.15); }); }
  pickup()     { this._fx(c => { _tone(c, this._master, 'sine', 880, 0, 0.01, 0.1, 0.38); _tone(c, this._master, 'sine', 1320, 0.07, 0.01, 0.1, 0.38); }); }
  newWave()    { this._fx(c => { [0, 0.10, 0.22].forEach((t, i) => _tone(c, this._master, 'sine', 440 + i * 120, t, 0.01, 0.14, 0.38)); }); }
  bossSpawn()  { this._fx(c => { _tone(c, this._master, 'sawtooth', 65, 0, 0.06, 1.4, 0.07, 30); _noise(c, this._master, 0.75, 0, 0.65); }); }
  bossSlam()   { this._fx(c => { _noise(c, this._master, 1.3, 0, 0.55); _tone(c, this._master, 'sawtooth', 50, 0, 0.04, 0.55, 0.06, 25); }); }

  grenadeExplode() { this._fx(c => { _noise(c, this._master, 1.5, 0, 0.55); _tone(c, this._master, 'sawtooth', 90, 0, 0.04, 0.6, 0.08, 35); }); }
  dash()           { this._fx(c => { _noise(c, this._master, 0.25, 0, 0.12); _tone(c, this._master, 'sine', 520, 0, 0.01, 0.08, 0.25); }); }
  victory()        { this._fx(c => { [0,0.15,0.3,0.5,0.7].forEach((t,i) => _tone(c, this._master, 'sine', 440+i*110, t, 0.01, 0.22, 0.4)); }); }

  setVolume(v) {
    if (this._master) this._master.gain.value = Math.max(0, Math.min(1, v)) * 0.55;
  }

  _fx(fn) {
    if (!this._ctx) return;
    if (this._ctx.state === 'suspended') this._ctx.resume();
    fn(this._ctx);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Oscillator with attack+decay envelope, optional frequency sweep. */
function _tone(ctx, out, type, freq, delay, attack, decay, peak, endFreq) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
  if (endFreq !== undefined)
    osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), ctx.currentTime + delay + attack + decay);
  env.gain.setValueAtTime(0.001, ctx.currentTime + delay);
  env.gain.linearRampToValueAtTime(peak, ctx.currentTime + delay + attack);
  env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + attack + decay);
  osc.connect(env); env.connect(out);
  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + attack + decay + 0.05);
}

/** White-noise burst with exponential decay. */
function _noise(ctx, out, peak, delay, decay) {
  const len = Math.ceil(ctx.sampleRate * (decay + 0.05));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const env = ctx.createGain();
  env.gain.setValueAtTime(peak, ctx.currentTime + delay);
  env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + decay);
  src.connect(env); env.connect(out);
  src.start(ctx.currentTime + delay);
}
