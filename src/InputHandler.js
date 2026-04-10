export class InputHandler {
  constructor() {
    this.keys = {};
    this.mouseX = window.innerWidth / 2;
    this.mouseY = window.innerHeight / 2;
    this.lmb    = false;
    this.reloadPressed  = false;
    this.usePressed     = false;
    this.dashPressed    = false;
    this.grenadePressed = false;
    this.beaconPressed  = false;

    this._kd = e => {
      this.keys[e.code] = true;
      if (e.code === 'KeyR')   this.reloadPressed  = true;
      if (e.code === 'KeyE')   this.usePressed     = true;
      if (e.code === 'Space')  { this.dashPressed    = true; e.preventDefault(); }
      if (e.code === 'KeyG')   this.grenadePressed  = true;
      if (e.code === 'KeyF')   this.beaconPressed   = true;
    };
    this._ku = e => { this.keys[e.code] = false; };
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
  consumeGrenade() { const v = this.grenadePressed; this.grenadePressed = false; return v; }
  consumeBeacon()  { const v = this.beaconPressed;  this.beaconPressed  = false; return v; }

  destroy() {
    window.removeEventListener('keydown',   this._kd);
    window.removeEventListener('keyup',     this._ku);
    window.removeEventListener('mousemove', this._mm);
    window.removeEventListener('mousedown', this._md);
    window.removeEventListener('mouseup',   this._mu);
  }
}
