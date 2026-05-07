export class InputHandler {
  constructor() {
    this.keys = {};
    this.mouseX = window.innerWidth / 2;
    this.mouseY = window.innerHeight / 2;
    this.lmb    = false;
    this.mobileAimAngle = null; // set by MobileControls; overrides mouse raycasting
    this.reloadPressed   = false;
    this.usePressed      = false;
    this.dashPressed     = false;
    this.grenadeHeld     = false;
    this.grenadeReleased = false;
    this.beaconPressed   = false;
    this.pingHeld        = false;
    this._pingJustReleased = false;

    this._kd = e => {
      this.keys[e.code] = true;
      if (e.code === 'KeyR')   this.reloadPressed  = true;
      if (e.code === 'KeyE')   this.usePressed     = true;
      if (e.code === 'Space')  { this.dashPressed    = true; e.preventDefault(); }
      if (e.code === 'KeyG')   this.grenadeHeld     = true;
      if (e.code === 'KeyF')   this.beaconPressed   = true;
      if (e.code === 'KeyZ')   this.pingHeld        = true;
    };
    this._ku = e => {
      this.keys[e.code] = false;
      if (e.code === 'KeyG') { this.grenadeHeld = false; this.grenadeReleased = true; }
      if (e.code === 'KeyZ') { this.pingHeld = false; this._pingJustReleased = true; }
    };
    this._mm = e => { this.mouseX = e.clientX; this.mouseY = e.clientY; };
    this._md = e => { if (e.button === 0) this.lmb = true;  };
    this._mu = e => { if (e.button === 0) this.lmb = false; };

    window.addEventListener('keydown',   this._kd);
    window.addEventListener('keyup',     this._ku);
    window.addEventListener('mousemove', this._mm);
    window.addEventListener('mousedown', this._md);
    window.addEventListener('mouseup',   this._mu);
    document.addEventListener('contextmenu', e => e.preventDefault());
  }

  isDown(code) { return !!this.keys[code]; }

  consumeReload()  { const v = this.reloadPressed;  this.reloadPressed  = false; return v; }
  consumeUse()     { const v = this.usePressed;     this.usePressed     = false; return v; }
  consumeDash()    { const v = this.dashPressed;    this.dashPressed    = false; return v; }
  consumeGrenadeRelease() { const v = this.grenadeReleased; this.grenadeReleased = false; return v; }
  consumeBeacon()  { const v = this.beaconPressed;  this.beaconPressed  = false; return v; }
  consumePingRelease() { const v = this._pingJustReleased; this._pingJustReleased = false; return v; }

  destroy() {
    window.removeEventListener('keydown',   this._kd);
    window.removeEventListener('keyup',     this._ku);
    window.removeEventListener('mousemove', this._mm);
    window.removeEventListener('mousedown', this._md);
    window.removeEventListener('mouseup',   this._mu);
  }
}
