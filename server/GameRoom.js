import {
  TICK_RATE, MAX_PLAYERS, PLAYER_SPEED, PLAYER_MAX_HP,
  MAP_HALF, SAFE_ZONE, SAFE_ZONE_RADIUS,
  WAVE_BASE, WAVE_SCALE, NEXT_WAVE_DELAY, MAX_ENEMIES, SPAWN_POINTS,
  WEAPONS, WEAPON_PICKUPS, WEAPON_PICKUP_RADIUS, WEAPON_RESPAWN_TIME,
  ENEMY_TYPES, WAVE_COMPOSITIONS,
  ACID_SPEED, ACID_RANGE, ACID_DAMAGE,
  MAPS,
} from '../shared/constants.js';

const DT = 1 / TICK_RATE;

function _weightedRandom(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [type, w] of Object.entries(weights)) { r -= w; if (r <= 0) return type; }
  return Object.keys(weights)[0];
}

export class GameRoom {
  constructor(roomId, io) {
    this.id          = roomId;
    this.io          = io;
    this.players     = new Map();
    this.enemies     = [];
    this.bullets     = [];
    this.acidBlobs   = [];
    this.wave        = 1;
    this.tick        = 0;
    this.mapId       = MAPS[Math.floor(Math.random() * MAPS.length)];
    this.gameStarted = false;
    this._readySet   = new Set();
    this._nextEnemyId  = 1;
    this._nextBulletId = 1;
    this._nextBlobId   = 1;
    this._waveTimer    = -1;
    this._kills        = new Map();
    this._gameStartTime = 0;
    // Weapon pickups state
    this._pickups = WEAPON_PICKUPS.map(p => ({ ...p, respawnTimer: 0 }));
    this._interval = setInterval(() => this._tick(), 1000 / TICK_RATE);
    console.log(`[Room ${roomId}] created — map: ${this.mapId}`);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  addPlayer(socket, name, slotIndex) {
    socket.join(this.id);
    const start = _randomSpawn();
    const pistol = WEAPONS.pistol;
    this.players.set(socket.id, {
      id: socket.id, name, slot: slotIndex,
      x: start.x, z: start.z, angle: 0,
      hp: PLAYER_MAX_HP, ammo: pistol.ammoMax,
      alive: true, reloading: false,
      weapon: 'pistol', ready: false,
      _reloadTimer: 0, _shootCd: 0, _input: {},
    });
    socket.emit('joined', { playerId: socket.id, slot: slotIndex, roomId: this.id });
    this._broadcastLobby();
    console.log(`[Room ${this.id}] +player ${name} (${socket.id.slice(0,6)})`);
  }

  removePlayer(socketId) {
    this._readySet.delete(socketId);
    this.players.delete(socketId);
    if (this.players.size === 0) {
      clearInterval(this._interval);
      return;
    }
    if (this.gameStarted) {
      this.io.to(this.id).emit('playerLeft', { playerId: socketId });
    } else {
      this._broadcastLobby();
      this._checkAllReady();
    }
  }

  handleInput(socketId, input) {
    const p = this.players.get(socketId);
    if (p && this.gameStarted) p._input = input;
  }

  setReady(socketId, isReady) {
    const p = this.players.get(socketId);
    if (!p || this.gameStarted) return;
    p.ready = isReady;
    if (isReady) this._readySet.add(socketId);
    else         this._readySet.delete(socketId);
    this._broadcastLobby();
    this._checkAllReady();
  }

  get size() { return this.players.size; }

  // ── Lobby ───────────────────────────────────────────────────────────────────

  _broadcastLobby() {
    const players = [...this.players.values()].map(p => ({ id: p.id, name: p.name, slot: p.slot, ready: p.ready }));
    this.io.to(this.id).emit('lobbyState', { players, readyCount: this._readySet.size, totalCount: this.players.size });
  }

  _checkAllReady() {
    if (this.players.size === 0) return;
    if ([...this.players.values()].every(p => p.ready)) this._startGame();
  }

  _startGame() {
    if (this.gameStarted) return;
    this.wave       = 1;
    this.enemies    = [];
    this.bullets    = [];
    this.acidBlobs  = [];
    this._waveTimer = -1;
    this._kills.clear();
    this._pickups.forEach(p => { p.respawnTimer = 0; });
    this.players.forEach(p => {
      const s = _randomSpawn();
      Object.assign(p, {
        x: s.x, z: s.z, hp: PLAYER_MAX_HP,
        ammo: WEAPONS.pistol.ammoMax, alive: true,
        reloading: false, weapon: 'pistol',
        _reloadTimer: 0, _shootCd: 0, _input: {},
      });
    });
    this.gameStarted    = true;
    this._gameStartTime = Date.now();
    this._spawnWave(this.wave);
    this.io.to(this.id).emit('gameStart', { wave: this.wave, mapId: this.mapId });
    console.log(`[Room ${this.id}] START wave ${this.wave} map ${this.mapId}`);
  }

  // ── Tick ────────────────────────────────────────────────────────────────────

  _tick() {
    if (!this.gameStarted) return;
    this.tick++;
    this._updatePlayers();
    this._updateBullets();
    this._updateEnemies();
    this._updateAcidBlobs();
    this._updatePickups();
    this._checkWave();
    this._broadcastGame();
  }

  _updatePlayers() {
    this.players.forEach(p => {
      if (!p.alive) return;
      const w = WEAPONS[p.weapon];

      if (p.reloading) {
        p._reloadTimer -= DT;
        if (p._reloadTimer <= 0) { p.ammo = w.ammoMax; p.reloading = false; }
      }

      const { w: fw, a, s, d, mouseAngle, shoot, reload } = p._input;
      let dx = 0, dz = 0;
      if (fw) dz -= 1; if (s) dz += 1;
      if (a)  dx -= 1; if (d) dx += 1;
      if (dx !== 0 || dz !== 0) {
        const len = Math.sqrt(dx*dx + dz*dz);
        p.x = Math.max(-MAP_HALF, Math.min(MAP_HALF, p.x + (dx/len) * PLAYER_SPEED * DT));
        p.z = Math.max(-MAP_HALF, Math.min(MAP_HALF, p.z + (dz/len) * PLAYER_SPEED * DT));
      }

      if (mouseAngle !== undefined) p.angle = mouseAngle;
      if (reload && !p.reloading && p.ammo < w.ammoMax) { p.reloading = true; p._reloadTimer = w.reloadTime; }

      p._shootCd -= DT;
      if (shoot && p.ammo > 0 && !p.reloading && p._shootCd <= 0) {
        p._shootCd = w.fireRate;
        p.ammo--;
        for (let i = 0; i < w.pellets; i++) {
          const sp = (Math.random() - 0.5) * w.spread;
          this.bullets.push({
            id: this._nextBulletId++,
            x: p.x, z: p.z,
            dx: Math.sin(p.angle + sp), dz: Math.cos(p.angle + sp),
            dist: 0, owner: p.id,
            damage: w.damage, range: w.range, speed: w.speed,
          });
        }
        if (p.ammo === 0) { p.reloading = true; p._reloadTimer = w.reloadTime; }
      }

      const sdx = p.x - SAFE_ZONE.x, sdz = p.z - SAFE_ZONE.z;
      if (Math.sqrt(sdx*sdx + sdz*sdz) < SAFE_ZONE_RADIUS) {
        this.io.to(this.id).emit('playerWon', { playerId: p.id, name: p.name });
      }
    });
  }

  _updateBullets() {
    for (const b of this.bullets) {
      b.x += b.dx * b.speed * DT;
      b.z += b.dz * b.speed * DT;
      b.dist += b.speed * DT;
    }
    for (const b of this.bullets) {
      if (b.dist >= b.range) continue;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = b.x - e.x, dz = b.z - e.z;
        if (dx*dx + dz*dz < 0.36) {
          e.hp -= b.damage;
          b.dist = b.range;
          if (e.hp <= 0) {
            e.dead = true;
            this._kills.set(b.owner, (this._kills.get(b.owner) ?? 0) + 1);
          }
          break;
        }
      }
    }
    this.bullets = this.bullets.filter(b => b.dist < b.range);
    this.enemies = this.enemies.filter(e => !e.dead);
  }

  _updateEnemies() {
    const alive = [...this.players.values()].filter(p => p.alive);
    if (alive.length === 0) return;
    for (const e of this.enemies) {
      const stats = ENEMY_TYPES[e.type] ?? ENEMY_TYPES.walker;
      let nearest = alive[0], minD2 = Infinity;
      for (const p of alive) {
        const d2 = (p.x-e.x)**2 + (p.z-e.z)**2;
        if (d2 < minD2) { minD2 = d2; nearest = p; }
      }
      const dist = Math.sqrt(minD2);
      const dx = nearest.x - e.x, dz = nearest.z - e.z;
      if (dist > 0.05) e.angle = Math.atan2(dx, dz);

      if (stats.ranged) {
        // Spitter: keep distance, fire when in range
        if (dist > stats.atkRange * 0.6) {
          e.x += (dx/dist) * stats.speed * DT;
          e.z += (dz/dist) * stats.speed * DT;
        }
        e._atkCd = (e._atkCd ?? 0) - DT;
        if (dist <= stats.atkRange && e._atkCd <= 0) {
          e._atkCd = stats.atkCd;
          this.acidBlobs.push({
            id: this._nextBlobId++, x: e.x, z: e.z,
            dx: dx/dist, dz: dz/dist, dist: 0,
          });
        }
      } else {
        if (dist > stats.atkRange) {
          e.x += (dx/dist) * stats.speed * DT;
          e.z += (dz/dist) * stats.speed * DT;
        }
        if (dist < stats.atkRange) {
          e._atkCd = (e._atkCd ?? 0) - DT;
          if (e._atkCd <= 0) {
            nearest.hp = Math.max(0, nearest.hp - stats.damage);
            e._atkCd = stats.atkCd;
            if (nearest.hp === 0) {
              nearest.alive = false;
              this.io.to(this.id).emit('playerDied', { playerId: nearest.id });
              this._checkAllDead();
            }
          }
        }
      }
    }
  }

  _updateAcidBlobs() {
    for (const b of this.acidBlobs) {
      b.x += b.dx * ACID_SPEED * DT;
      b.z += b.dz * ACID_SPEED * DT;
      b.dist += ACID_SPEED * DT;
    }
    for (const b of this.acidBlobs) {
      if (b.dist >= ACID_RANGE) continue;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const dx = b.x - p.x, dz = b.z - p.z;
        if (dx*dx + dz*dz < 0.6) {
          p.hp = Math.max(0, p.hp - ACID_DAMAGE);
          b.dist = ACID_RANGE;
          if (p.hp === 0) {
            p.alive = false;
            this.io.to(this.id).emit('playerDied', { playerId: p.id });
            this._checkAllDead();
          }
          break;
        }
      }
    }
    this.acidBlobs = this.acidBlobs.filter(b => b.dist < ACID_RANGE);
  }

  _updatePickups() {
    for (const pk of this._pickups) {
      if (pk.respawnTimer > 0) { pk.respawnTimer -= DT; continue; }
      for (const p of this.players.values()) {
        if (!p.alive || p.weapon === pk.weapon) continue;
        const dx = p.x - pk.x, dz = p.z - pk.z;
        if (dx*dx + dz*dz < WEAPON_PICKUP_RADIUS * WEAPON_PICKUP_RADIUS) {
          p.weapon = pk.weapon;
          p.ammo = WEAPONS[pk.weapon].ammoMax;
          p.reloading = false;
          pk.respawnTimer = WEAPON_RESPAWN_TIME;
          this.io.to(this.id).emit('weaponPickup', { playerId: p.id, weapon: pk.weapon, pickupId: pk.id });
          break;
        }
      }
    }
  }

  _checkAllDead() {
    if ([...this.players.values()].some(p => p.alive)) return;
    const elapsed = Math.floor((Date.now() - this._gameStartTime) / 1000);
    const players = [...this.players.values()].map(p => ({
      id: p.id, name: p.name, slot: p.slot, kills: this._kills.get(p.id) ?? 0,
    }));
    this.io.to(this.id).emit('gameOver', { wave: this.wave, survivalTime: elapsed, players });
    this.gameStarted = false;
    this._readySet.clear();
    this.players.forEach(p => { p.ready = false; });
    this._broadcastLobby();
    console.log(`[Room ${this.id}] GAME OVER wave ${this.wave} ${elapsed}s`);
  }

  _checkWave() {
    if (this.enemies.length > 0 || this._waveTimer > 0) {
      if (this._waveTimer > 0) {
        this._waveTimer -= DT;
        if (this._waveTimer <= 0) {
          this.wave++;
          this._spawnWave(this.wave);
          this.io.to(this.id).emit('newWave', { wave: this.wave });
        }
      }
      return;
    }
    this._waveTimer = NEXT_WAVE_DELAY;
    this.io.to(this.id).emit('waveClear', { nextWave: this.wave + 1, delay: NEXT_WAVE_DELAY });
  }

  _spawnWave(n) {
    const count = Math.min(WAVE_BASE + (n-1) * WAVE_SCALE, MAX_ENEMIES);
    const comp  = WAVE_COMPOSITIONS[Math.min(n-1, WAVE_COMPOSITIONS.length-1)];
    for (let i = 0; i < count; i++) {
      const sp   = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
      const type = _weightedRandom(comp);
      const stats = ENEMY_TYPES[type];
      this.enemies.push({
        id: this._nextEnemyId++,
        x: sp.x + (Math.random()-0.5)*6,
        z: sp.z + (Math.random()-0.5)*6,
        angle: 0, hp: stats.hp, dead: false, type,
      });
    }
    console.log(`[Room ${this.id}] wave ${n} → ${count} enemies`);
  }

  _broadcastGame() {
    const pickupStates = this._pickups.map(p => ({ id: p.id, weapon: p.weapon, x: p.x, z: p.z, active: p.respawnTimer <= 0 }));
    this.io.to(this.id).emit('gs', {
      tick: this.tick, wave: this.wave,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, slot: p.slot,
        x: p.x, z: p.z, angle: p.angle,
        hp: p.hp, ammo: p.ammo, alive: p.alive,
        reloading: p.reloading, weapon: p.weapon,
      })),
      enemies: this.enemies.map(e => ({ id: e.id, x: e.x, z: e.z, angle: e.angle, hp: e.hp, type: e.type })),
      bullets: this.bullets.map(b => ({ id: b.id, x: b.x, z: b.z })),
      acidBlobs: this.acidBlobs.map(b => ({ id: b.id, x: b.x, z: b.z })),
      pickups: pickupStates,
    });
  }
}

function _randomSpawn() {
  return { x: (Math.random()-0.5)*4, z: (Math.random()-0.5)*4 };
}
