const JOY_R = 58;
const THRESHOLD = 0.28;

export class MobileControls {
  constructor(input) {
    this.input   = input;
    this.enabled = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!this.enabled) return;

    this._lt = null; // { id, bx, by }
    this._rt = null;

    this._el    = document.getElementById('mobile-controls');
    this._lRing = document.getElementById('joy-left');
    this._rRing = document.getElementById('joy-right');
    this._lDot  = this._lRing.querySelector('.joy-dot');
    this._rDot  = this._rRing.querySelector('.joy-dot');

    const lz = document.getElementById('mobile-left-zone');
    const rz = document.getElementById('mobile-right-zone');

    const opt = { passive: false };
    lz.addEventListener('touchstart',  e => this._lStart(e), opt);
    lz.addEventListener('touchmove',   e => this._move(e),   opt);
    lz.addEventListener('touchend',    e => this._end(e),    opt);
    lz.addEventListener('touchcancel', e => this._end(e),    opt);

    rz.addEventListener('touchstart',  e => this._rStart(e), opt);
    rz.addEventListener('touchmove',   e => this._move(e),   opt);
    rz.addEventListener('touchend',    e => this._end(e),    opt);
    rz.addEventListener('touchcancel', e => this._end(e),    opt);

    const btnMap = {
      'mbtn-reload':  () => { input.reloadPressed  = true; },
      'mbtn-dash':    () => { input.dashPressed    = true; },
      'mbtn-grenade': () => { input.grenadeReleased = true; },
      'mbtn-use':     () => { input.usePressed     = true; },
      'mbtn-beacon':  () => { input.beaconPressed  = true; },
    };
    for (const [id, fn] of Object.entries(btnMap)) {
      document.getElementById(id)?.addEventListener('touchstart', e => {
        e.stopPropagation(); e.preventDefault(); fn();
      }, opt);
    }
  }

  show() { if (this.enabled) this._el.style.display = 'block'; }

  hide() {
    if (!this.enabled) return;
    this._el.style.display = 'none';
    this._clearLeft();
    this._clearRight();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _lStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this._lt) continue;
      this._lt = { id: t.identifier, bx: t.clientX, by: t.clientY };
      this._placeRing(this._lRing, t.clientX, t.clientY);
    }
  }

  _rStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this._rt) continue;
      this._rt = { id: t.identifier, bx: t.clientX, by: t.clientY };
      this._placeRing(this._rRing, t.clientX, t.clientY);
      this.input.lmb = true;
    }
  }

  _move(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this._lt?.id === t.identifier) this._leftMove(t);
      if (this._rt?.id === t.identifier) this._rightMove(t);
    }
  }

  _end(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this._lt?.id === t.identifier) this._clearLeft();
      if (this._rt?.id === t.identifier) this._clearRight();
    }
  }

  _leftMove(t) {
    const dx = t.clientX - this._lt.bx;
    const dy = t.clientY - this._lt.by;
    const d  = Math.hypot(dx, dy);
    const cx = d > JOY_R ? dx / d * JOY_R : dx;
    const cy = d > JOY_R ? dy / d * JOY_R : dy;
    this._moveDot(this._lDot, cx, cy);
    const nx = cx / JOY_R, ny = cy / JOY_R;
    this.input.keys['KeyW'] = ny < -THRESHOLD;
    this.input.keys['KeyS'] = ny >  THRESHOLD;
    this.input.keys['KeyA'] = nx < -THRESHOLD;
    this.input.keys['KeyD'] = nx >  THRESHOLD;
  }

  _rightMove(t) {
    const dx = t.clientX - this._rt.bx;
    const dy = t.clientY - this._rt.by;
    const d  = Math.hypot(dx, dy);
    if (d < 6) return;
    const cx = d > JOY_R ? dx / d * JOY_R : dx;
    const cy = d > JOY_R ? dy / d * JOY_R : dy;
    this._moveDot(this._rDot, cx, cy);
    // screen right=+x, screen down=+y → world +x,-z → atan2(dx,dy) maps correctly
    this.input.mobileAimAngle = Math.atan2(dx, dy);
  }

  _clearLeft() {
    this._lt = null;
    ['KeyW','KeyS','KeyA','KeyD'].forEach(k => { this.input.keys[k] = false; });
    this._lRing.style.display = 'none';
    this._moveDot(this._lDot, 0, 0);
  }

  _clearRight() {
    this._rt = null;
    this.input.lmb = false;
    this.input.mobileAimAngle = null;
    this._rRing.style.display = 'none';
    this._moveDot(this._rDot, 0, 0);
  }

  _placeRing(ring, x, y) {
    ring.style.display = 'block';
    ring.style.left    = x + 'px';
    ring.style.top     = y + 'px';
  }

  _moveDot(dot, cx, cy) {
    dot.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;
  }
}
