// Procedural Web Audio API sounds — no external assets needed.
export class AudioManager {
  constructor() {
    this._ctx       = null;
    this._master    = null;
    this._musicEl   = null;
    this._musicGain = null;
    this._musicVol  = 0.4;
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

  startAmbient(mapId) {
    this._fadeStopAmbient();
    this._ambNodes     = [];
    this._ambTimers    = [];
    this._musicSession = (this._musicSession ?? 0) + 1;
    this._playTrack(`/music/${mapId}`, 1, [`/music/default`], mapId, this._musicSession, true);
  }

  _playTrack(dir, n, fallbacks, mapId, session, firstPlay) {
    if (this._musicSession !== session) return;

    const el = new Audio(`${dir}/${n}.mp3`);
    el.crossOrigin = 'anonymous';
    this._musicEl = el;

    const onError = () => {
      if (this._musicSession !== session) return;
      el.pause();
      if (this._musicEl === el) this._musicEl = null;
      if (n > 1) {
        this._playTrack(dir, 1, fallbacks, mapId, session, false);
      } else if (fallbacks.length) {
        this._playTrack(fallbacks[0], 1, fallbacks.slice(1), mapId, session, firstPlay);
      } else {
        this._startProceduralAmbient(mapId);
      }
    };

    el.addEventListener('error', onError, { once: true });
    el.addEventListener('ended', () => {
      if (this._musicSession !== session) return;
      this._playTrack(dir, n + 1, fallbacks, mapId, session, false);
    }, { once: true });

    if (this._ctx) {
      try {
        const node = this._ctx.createMediaElementSource(el);
        const gain = this._ctx.createGain();
        gain.gain.value = firstPlay ? 0 : this._musicVol;
        if (firstPlay) gain.gain.linearRampToValueAtTime(this._musicVol, this._ctx.currentTime + 4);
        node.connect(gain); gain.connect(this._master);
        this._musicGain = gain;
        el.play().catch(onError);
      } catch { onError(); }
    } else {
      el.volume = firstPlay ? 0 : 0.6;
      el.play().then(() => {
        if (!firstPlay || this._musicEl !== el) return;
        let vol = 0;
        const iv = setInterval(() => {
          if (this._musicEl !== el) { clearInterval(iv); return; }
          vol = Math.min(vol + 0.015, 0.6);
          el.volume = vol;
          if (vol >= 0.6) clearInterval(iv);
        }, 100);
        this._ambTimers.push(iv);
      }).catch(onError);
    }
  }

  _startProceduralAmbient(mapId) {
    this._fx(c => {

      const mg = c.createGain();
      mg.gain.setValueAtTime(0, c.currentTime);
      mg.gain.linearRampToValueAtTime(0.8, c.currentTime + 4);
      mg.connect(this._master);
      this._ambGain = mg;

      // Roots one octave higher so harmonics land in 300–800 Hz (audible on any speaker)
      const MAPS = {
        city:         { root: 146.8, ratios: [1, 1.189, 1.498, 2], lfo: 0.13, arp: [1, 1.189, 1.498, 1.587, 2],        arpMs: 450, bpm: 120 },
        industrial:   { root: 130.8, ratios: [1, 1.189, 1.498, 2], lfo: 0.09, arp: [1, 1.189, 1.335, 1.498, 2],        arpMs: 550, bpm: 100 },
        forest:       { root: 196.0, ratios: [1, 1.260, 1.498, 2], lfo: 0.20, arp: [1, 1.122, 1.260, 1.498, 1.782, 2], arpMs: 700, bpm: 0   },
        forest_trail: { root: 174.6, ratios: [1, 1.122, 1.260, 2], lfo: 0.17, arp: [1, 1.122, 1.260, 1.498, 1.782, 2], arpMs: 800, bpm: 0   },
      };
      const m = MAPS[mapId] ?? MAPS.city;
      const GAINS = [0.12, 0.08, 0.10, 0.06];

      // Sustained pad chord
      m.ratios.forEach((r, i) => {
        const osc = c.createOscillator();
        const env = c.createGain();
        osc.type = 'sine';
        osc.frequency.value = m.root * r;
        osc.detune.value = (i % 2 === 0 ? 1 : -1) * (3 + i * 2);
        env.gain.value = GAINS[i] ?? 0.05;
        osc.connect(env); env.connect(mg);
        osc.start();
        this._ambNodes.push(osc);

        // Chorus copy (+7 cents)
        const osc2 = c.createOscillator();
        const env2 = c.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = m.root * r;
        osc2.detune.value = 7;
        env2.gain.value = 0.04;
        osc2.connect(env2); env2.connect(mg);
        osc2.start();
        this._ambNodes.push(osc2);
      });

      // LFO tremolo
      const lfo = c.createOscillator();
      const lfoG = c.createGain();
      lfo.frequency.value = m.lfo;
      lfoG.gain.value = 0.04;
      lfo.connect(lfoG); lfoG.connect(mg.gain);
      lfo.start();
      this._ambNodes.push(lfo);

      // Melody arpeggio — two octaves up (390–780 Hz) so it cuts through any speaker
      const arpFreqs = m.arp.map(r => m.root * 2 * r);
      let arpIdx = 0;
      this._ambTimers.push(setInterval(() => {
        if (!this._ctx || !this._ambGain) return;
        _tone(this._ctx, this._ambGain, 'sine', arpFreqs[arpIdx], 0, 0.04, 0.5, 0.18);
        arpIdx = (arpIdx + 1) % arpFreqs.length;
      }, m.arpMs));

      // Rhythmic pulse for dark maps
      if (m.bpm > 0) {
        this._ambTimers.push(setInterval(() => {
          if (!this._ctx || !this._ambGain) return;
          _tone(this._ctx, this._ambGain, 'sine', m.root * 0.5, 0, 0.02, 0.4, 0.28);
        }, (60000 / m.bpm) * 2));
      }
    });
  }

  stopAmbient() {
    this._fadeStopAmbient();
  }

  _fadeStopAmbient() {
    (this._ambTimers ?? []).forEach(t => clearInterval(t));
    this._ambTimers    = [];
    this._musicSession = (this._musicSession ?? 0) + 1;

    if (this._musicEl) {
      const el   = this._musicEl;
      const mg   = this._musicGain ?? null;
      this._musicEl   = null;
      this._musicGain = null;
      if (mg && this._ctx) {
        mg.gain.setValueAtTime(mg.gain.value, this._ctx.currentTime);
        mg.gain.linearRampToValueAtTime(0, this._ctx.currentTime + 2);
        setTimeout(() => { el.pause(); try { mg.disconnect(); } catch {} }, 2200);
      } else {
        const iv = setInterval(() => {
          el.volume = Math.max(0, el.volume - 0.05);
          if (el.volume <= 0) { el.pause(); clearInterval(iv); }
        }, 100);
      }
    }

    const nodes = this._ambNodes ?? [];
    const gain  = this._ambGain;
    this._ambNodes = [];
    this._ambGain  = null;
    if (!gain || !this._ctx) { nodes.forEach(n => { try { n.stop(); } catch {} }); return; }
    gain.gain.setValueAtTime(gain.gain.value, this._ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this._ctx.currentTime + 2);
    setTimeout(() => {
      nodes.forEach(n => { try { n.stop(); } catch {} });
      try { gain.disconnect(); } catch {}
    }, 2200);
  }

  setVolume(v) {
    if (this._master) this._master.gain.value = Math.max(0, Math.min(1, v)) * 0.55;
  }

  setMusicVolume(v) {
    this._musicVol = Math.max(0, Math.min(1, v));
    if (this._musicGain && this._ctx) {
      this._musicGain.gain.cancelScheduledValues(this._ctx.currentTime);
      this._musicGain.gain.setValueAtTime(this._musicVol, this._ctx.currentTime);
    } else if (this._musicEl) {
      this._musicEl.volume = this._musicVol;
    }
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
