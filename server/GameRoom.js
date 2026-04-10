import {
  TICK_RATE, MAX_PLAYERS, PLAYER_SPEED, PLAYER_MAX_HP,
  MAP_HALF, SAFE_ZONE, SAFE_ZONE_RADIUS,
  WAVE_BASE, WAVE_SCALE, NEXT_WAVE_DELAY, MAX_ENEMIES, SPAWN_POINTS,
  WEAPONS, WEAPON_PICKUPS, WEAPON_PICKUP_RADIUS, WEAPON_RESPAWN_TIME,
  ENEMY_TYPES, WAVE_COMPOSITIONS,
  ACID_SPEED, ACID_RANGE, ACID_DAMAGE,
  MAPS, WAVE_SAFE_DELAY,
  HEALTHPACK_HEAL, HEALTHPACK_PICKUP_RADIUS, HEALTHPACK_RESPAWN_TIME,
  PLAYER_MAX_HEALTHPACKS, HEALTHPACK_POSITIONS,
  BOSS_SLAM_CD, BOSS_SLAM_RADIUS, BOSS_SLAM_DAMAGE,
  FINAL_BOSS_WAVE, FINAL_BOSS_SLAM_CD, FINAL_BOSS_SLAM_RADIUS, FINAL_BOSS_SLAM_DAMAGE,
  DEFAULT_APPEARANCE,
  DASH_CD, DASH_DISTANCE, DASH_IFRAME,
  GRENADE_MAX, GRENADE_DAMAGE, GRENADE_RADIUS, GRENADE_FUSE, GRENADE_SPEED,
  RECONNECT_TIMEOUT,
  DOWNED_HP_DRAIN, DOWNED_MAX_HP, REVIVE_RANGE, REVIVE_TIME,
  TANK_CHARGE_CD, TANK_CHARGE_SPEED, TANK_CHARGE_DURATION, TANK_CHARGE_DAMAGE,
  ACID_PUDDLE_DURATION, ACID_PUDDLE_RADIUS, ACID_PUDDLE_DRAIN,
  PERK_WAVE_INTERVAL, PERK_SELECT_TIME, PERKS,
  JUMPER_PIN_DAMAGE, JUMPER_RESCUE_RANGE,
  TONGUE_SPEED, TONGUE_RANGE, TONGUE_HP, TONGUE_PULL_SPEED,
  BEACON_MAX, BEACON_STARTING, BEACON_DURATION, BEACON_ATTRACT_RADIUS,
} from '../shared/constants.js';
import { MAP_COLLIDERS, PLAYER_RADIUS, ENEMY_RADII } from '../shared/colliders.js';
import { FlowField } from './pathfinding/FlowField.js';

const DT = 1 / TICK_RATE;

function _weightedRandom(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [type, w] of Object.entries(weights)) { r -= w; if (r <= 0) return type; }
  return Object.keys(weights)[0];
}

function _generateToken() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
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
    this._mapIndex   = 0;
    this.mapId       = MAPS[0];
    this.gameStarted = false;
    this._readySet   = new Set();
    this._votes      = new Map();
    this._nextEnemyId  = 1;
    this._nextBulletId = 1;
    this._nextBlobId   = 1;
    this._nextGrenadeId = 1;
    this._waveTimer    = -1;
    this._waveStart    = 0;
    this._safeRoomOpen = false;
    this._completing   = false;
    this._kills        = new Map();
    this._gameStartTime = 0;
    this._pickups    = WEAPON_PICKUPS.map(p => ({ ...p, respawnTimer: 0 }));
    this._healthpacks = HEALTHPACK_POSITIONS.map(h => ({ ...h, respawnTimer: 0 }));
    this._grenadeProj = [];
    this._acidPuddles = [];
    this._tongues     = [];
    this._beacons     = [];
    this._nextTongueId = 1;
    this._perkPhase   = false;
    this._perkTimer   = 0;
    this._perkChoices = new Map(); // socketId → perkId
    this._perkOptions = new Map(); // socketId → [perkId, ...]
    this._flowField  = null;
    this._disconnected = new Map(); // token → { socketId, cleanup }
    this._interval   = setInterval(() => this._tick(), 1000 / TICK_RATE);
    console.log(`[Room ${roomId}] created`);
  }

  // ── Perk API ────────────────────────────────────────────────────────────────

  setPerkChoice(socketId, perkId) {
    const p = this.players.get(socketId);
    if (!p || !this._perkPhase) return;
    const opts = this._perkOptions.get(socketId);
    if (!opts || !opts.includes(perkId)) return;
    if (this._perkChoices.has(socketId)) return; // already chose
    this._perkChoices.set(socketId, perkId);
    this._applyPerk(p, perkId);
    this.io.to(socketId).emit('perkApplied', { perkId, perk: PERKS[perkId] });
    this._checkPerksDone();
  }

  _applyPerk(p, perkId) {
    switch (perkId) {
      case 'hp_boost':      p._perkMaxHp       = Math.min(200, p._perkMaxHp + 25);
                            p.hp = Math.min(p._perkMaxHp, p.hp + 25); break;
      case 'fast_reload':   p._perkReloadMult  = Math.max(0.3, p._perkReloadMult * 0.6); break;
      case 'extra_grenade': p.grenadeCount      = Math.min(6, p.grenadeCount + 2); break;
      case 'speed_boost':   p._perkSpeedMult   = Math.min(2.0, p._perkSpeedMult * 1.15); break;
      case 'iron_skin':     p._perkDamageTaken = Math.max(0.3, p._perkDamageTaken * 0.8); break;
      case 'hunter':        p._perkDamageMult  = Math.min(2.0, p._perkDamageMult * 1.2); break;
      case 'quick_dash':    p._perkDashCdBonus = Math.min(1.0, p._perkDashCdBonus + 0.5); break;
    }
  }

  _enterPerkPhase() {
    this._perkPhase = true;
    this._perkTimer = PERK_SELECT_TIME;
    this._perkChoices.clear();
    this._perkOptions.clear();
    const allPerkIds = Object.keys(PERKS);
    for (const p of this.players.values()) {
      if (!p.alive || p.downed || p.disconnected) continue;
      const opts = [...allPerkIds].sort(() => Math.random() - 0.5).slice(0, 3);
      this._perkOptions.set(p.id, opts);
      const sock = this.io.sockets.sockets.get(p.id);
      if (sock) sock.emit('perkOffer', {
        options: opts.map(id => ({ id, ...PERKS[id] })),
        timeLeft: PERK_SELECT_TIME,
        wave: this.wave + 1,
      });
    }
    this.io.to(this.id).emit('perkPhaseStart', { timeLeft: PERK_SELECT_TIME });
    console.log(`[Room ${this.id}] perk phase wave ${this.wave}`);
  }

  _checkPerksDone() {
    const eligible = [...this.players.values()].filter(p => p.alive && !p.downed && !p.disconnected);
    if (eligible.length > 0 && eligible.every(p => this._perkChoices.has(p.id))) {
      this._finishPerkPhase();
    }
  }

  _finishPerkPhase() {
    this._perkPhase = false;
    this._waveTimer = NEXT_WAVE_DELAY;
    this.io.to(this.id).emit('perkPhaseEnd');
    this.io.to(this.id).emit('waveClear', { nextWave: this.wave + 1, delay: NEXT_WAVE_DELAY });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  addPlayer(socket, name, slotIndex, appearance = null) {
    socket.join(this.id);
    const start = _randomSpawn();
    const token = _generateToken();
    this.players.set(socket.id, {
      id: socket.id, name, slot: slotIndex, token,
      x: start.x, z: start.z, angle: 0,
      hp: PLAYER_MAX_HP, ammo: WEAPONS.pistol.ammoMax,
      alive: true, reloading: false,
      weapon: 'pistol', healthpacks: 0, grenadeCount: GRENADE_MAX, beaconCount: BEACON_STARTING,
      inSafeZone: false, ready: false, disconnected: false,
      appearance: appearance ?? { ...DEFAULT_APPEARANCE },
      _reloadTimer: 0, _shootCd: 0, _useCd: 0,
      _dashCd: 0, _dashTime: 0, _input: {},
      downed: false, downedHp: 0, _reviveProgress: 0,
      pinnedBy: null, pulledBy: null,
      _perkMaxHp: PLAYER_MAX_HP, _perkReloadMult: 1.0, _perkSpeedMult: 1.0,
      _perkDamageMult: 1.0, _perkDamageTaken: 1.0, _perkDashCdBonus: 0,
    });
    socket.emit('joined', { playerId: socket.id, slot: slotIndex, roomId: this.id, token });
    this._broadcastLobby();
    console.log(`[Room ${this.id}] +player ${name}`);
  }

  removePlayer(socketId) {
    const p = this.players.get(socketId);
    if (this.gameStarted && p) {
      // Hold slot for RECONNECT_TIMEOUT seconds
      const cleanup = setTimeout(() => {
        this._disconnected.delete(p.token);
        this.players.delete(socketId);
        this._checkAllDead();
      }, RECONNECT_TIMEOUT * 1000);
      this._disconnected.set(p.token, { socketId, cleanup });
      p.disconnected = true;
      p._input = {};
      return;
    }
    this._readySet.delete(socketId);
    this._votes.delete(socketId);
    this.players.delete(socketId);
    if (this.players.size === 0) { clearInterval(this._interval); return; }
    if (this.gameStarted) {
      this.io.to(this.id).emit('playerLeft', { playerId: socketId });
    } else {
      this._broadcastLobby();
      this._checkAllReady();
    }
  }

  tryReconnect(socket, token) {
    const dc = this._disconnected.get(token);
    if (!dc) return false;
    const { socketId: oldId, cleanup } = dc;
    const p = this.players.get(oldId);
    if (!p) return false;
    clearTimeout(cleanup);
    this._disconnected.delete(token);
    this.players.delete(oldId);
    p.id = socket.id;
    p.disconnected = false;
    this.players.set(socket.id, p);
    socket.join(this.id);
    socket.emit('joined', { playerId: socket.id, slot: p.slot, roomId: this.id, token, reconnected: true });
    console.log(`[Room ${this.id}] reconnect ${p.name}`);
    return true;
  }

  handleInput(socketId, input) {
    const p = this.players.get(socketId);
    if (p && this.gameStarted && !p.disconnected) p._input = input;
  }

  setReady(socketId, isReady) {
    const p = this.players.get(socketId);
    if (!p || this.gameStarted) return;
    p.ready = isReady;
    if (isReady) this._readySet.add(socketId); else this._readySet.delete(socketId);
    this._broadcastLobby();
    this._checkAllReady();
  }

  setMapVote(socketId, mapId) {
    if (!this.players.has(socketId) || this.gameStarted) return;
    if (MAPS.includes(mapId)) this._votes.set(socketId, mapId);
    this._broadcastLobby();
  }

  setAppearance(socketId, appearance) {
    const p = this.players.get(socketId);
    if (p && !this.gameStarted) p.appearance = appearance;
  }

  useHealthpack(socketId) {
    const p = this.players.get(socketId);
    if (!p || !p.alive || p.healthpacks <= 0 || p.hp >= PLAYER_MAX_HP) return;
    p.hp = Math.min(PLAYER_MAX_HP, p.hp + HEALTHPACK_HEAL);
    p.healthpacks--;
  }

  get size() { return this.players.size; }

  // ── Lobby ───────────────────────────────────────────────────────────────────

  _broadcastLobby() {
    const players = [...this.players.values()].map(p => ({ id: p.id, name: p.name, slot: p.slot, ready: p.ready }));
    const voteCounts = Object.fromEntries(MAPS.map(m => [m, 0]));
    for (const v of this._votes.values()) voteCounts[v] = (voteCounts[v] ?? 0) + 1;
    this.io.to(this.id).emit('lobbyState', {
      players, readyCount: this._readySet.size, totalCount: this.players.size, voteCounts,
    });
  }

  _checkAllReady() {
    if (this.players.size === 0) return;
    if ([...this.players.values()].every(p => p.ready)) this._startGame();
  }

  // ── Game start / map transition ─────────────────────────────────────────────

  _pickMapFromVotes() {
    const counts = Object.fromEntries(MAPS.map(m => [m, 0]));
    for (const v of this._votes.values()) counts[v]++;
    const max = Math.max(...Object.values(counts));
    const winners = MAPS.filter(m => counts[m] === max);
    return winners[Math.floor(Math.random() * winners.length)];
  }

  _startGame(isRestart = false) {
    if (this.gameStarted) return;

    if (!isRestart) {
      const chosen = this._pickMapFromVotes();
      this._mapIndex = MAPS.indexOf(chosen);
      if (this._mapIndex < 0) this._mapIndex = 0;
      this.mapId = MAPS[this._mapIndex];
    }

    this.wave       = 1;
    this.enemies    = [];
    this.bullets    = [];
    this.acidBlobs  = [];
    this._grenadeProj = [];
    this._tongues     = [];
    this._beacons     = [];
    this._waveTimer = -1;
    this._safeRoomOpen = false;
    this._completing   = false;
    this._kills.clear();
    this._pickups.forEach(p => { p.respawnTimer = 0; });
    this._healthpacks.forEach(h => { h.respawnTimer = 0; });
    this._flowField = new FlowField(this.mapId);
    this._acidPuddles = [];
    this._perkPhase   = false;
    this._perkChoices.clear();
    this._perkOptions.clear();

    this.players.forEach(p => {
      const s = _randomSpawn();
      Object.assign(p, {
        x: s.x, z: s.z, hp: PLAYER_MAX_HP,
        ammo: WEAPONS.pistol.ammoMax, alive: true,
        reloading: false, weapon: 'pistol',
        healthpacks: 0, grenadeCount: GRENADE_MAX, beaconCount: BEACON_STARTING,
        inSafeZone: false, disconnected: false,
        _reloadTimer: 0, _shootCd: 0, _useCd: 0,
        _dashCd: 0, _dashTime: 0, _input: {},
        downed: false, downedHp: 0, _reviveProgress: 0,
        pinnedBy: null, pulledBy: null,
        _perkMaxHp: PLAYER_MAX_HP, _perkReloadMult: 1.0, _perkSpeedMult: 1.0,
        _perkDamageMult: 1.0, _perkDamageTaken: 1.0, _perkDashCdBonus: 0,
      });
    });

    this.gameStarted    = true;
    this._gameStartTime = Date.now();
    this._spawnWave(this.wave);
    this.io.to(this.id).emit('gameStart', { wave: this.wave, mapId: this.mapId, isRestart });
    console.log(`[Room ${this.id}] START wave ${this.wave} map ${this.mapId}`);
  }

  _completeMap() {
    if (this._completing) return;
    this._completing = true;

    const nextIndex = (this._mapIndex + 1) % MAPS.length;
    this.io.to(this.id).emit('mapComplete', { completedMap: this.mapId, nextMap: MAPS[nextIndex] });
    console.log(`[Room ${this.id}] MAP COMPLETE → ${MAPS[nextIndex]}`);

    setTimeout(() => {
      this._mapIndex = nextIndex;
      this.mapId     = MAPS[this._mapIndex];
      this.gameStarted = false;

      this.players.forEach(p => {
        const s = _randomSpawn();
        p.inSafeZone = false;
        if (!p.alive) { p.alive = true; p.hp = PLAYER_MAX_HP; }
        p.x = s.x; p.z = s.z;
        p.grenadeCount = GRENADE_MAX;
      });

      this._startGame(true);
    }, 3500);
  }

  // ── Tick ────────────────────────────────────────────────────────────────────

  _tick() {
    if (!this.gameStarted || this._completing) return;
    this.tick++;

    if (!this._safeRoomOpen && this._waveStart > 0 &&
        Date.now() - this._waveStart >= WAVE_SAFE_DELAY * 1000) {
      this._safeRoomOpen = true;
      this.io.to(this.id).emit('safeRoomOpen');
    }

    if (this._perkPhase) {
      this._perkTimer -= DT;
      if (this._perkTimer <= 0) this._finishPerkPhase();
    }

    this._flowField?.update(DT, [...this.players.values()]);
    this._updatePlayers();
    this._updateRevive();
    this._updateBullets();
    this._updateEnemies();
    this._separateCharacters();
    this._updateAcidBlobs();
    this._updateGrenades();
    this._updateAcidPuddles();
    this._updateTongues();
    this._updateBeacons();
    this._updatePickups();
    this._updateHealthpacks();
    this._checkWave();
    this._broadcastGame();
  }

  // ── Players ─────────────────────────────────────────────────────────────────

  _updatePlayers() {
    this.players.forEach(p => {
      if (p.disconnected) return;

      // Downed — slow crawl only
      if (p.downed) {
        const { w: fw, a, s, d, mouseAngle } = p._input;
        let dx = 0, dz = 0;
        if (fw) dz -= 1; if (s) dz += 1;
        if (a)  dx -= 1; if (d) dx += 1;
        if (dx !== 0 || dz !== 0) {
          const len = Math.sqrt(dx*dx + dz*dz);
          const crawlSpeed = PLAYER_SPEED * 0.25;
          const nx = Math.max(-MAP_HALF, Math.min(MAP_HALF, p.x + (dx/len)*crawlSpeed*DT));
          const nz = Math.max(-MAP_HALF, Math.min(MAP_HALF, p.z + (dz/len)*crawlSpeed*DT));
          if (!this._blocked(nx, p.z, PLAYER_RADIUS)) p.x = nx;
          if (!this._blocked(p.x, nz, PLAYER_RADIUS)) p.z = nz;
        }
        if (mouseAngle !== undefined) p.angle = mouseAngle;
        return;
      }

      if (!p.alive || p.inSafeZone) return;
      const w = WEAPONS[p.weapon];

      // Timers
      if (p.reloading) {
        p._reloadTimer -= DT;
        if (p._reloadTimer <= 0) { p.ammo = w.ammoMax; p.reloading = false; }
      }
      p._dashCd -= DT;
      p._useCd  -= DT;

      const { w: fw, a, s, d, mouseAngle, shoot, reload, useHealthpack, dash, grenade, beacon } = p._input;

      // Pinned by jumper — can't move or shoot
      if (p.pinnedBy) {
        if (mouseAngle !== undefined) p.angle = mouseAngle;
        return;
      }
      // Pulled by smoker tongue — movement handled by _updateTongues
      if (p.pulledBy) {
        if (mouseAngle !== undefined) p.angle = mouseAngle;
        return;
      }

      let dx = 0, dz = 0;
      if (fw) dz -= 1; if (s) dz += 1;
      if (a)  dx -= 1; if (d) dx += 1;

      // Dash (Space) — instant burst in aimed direction
      const effectiveDashCd = Math.max(0.2, DASH_CD - p._perkDashCdBonus);
      if (dash && p._dashCd <= 0) {
        p._dashCd  = effectiveDashCd;
        p._dashTime = DASH_IFRAME;
        const ddx = Math.sin(p.angle) * DASH_DISTANCE;
        const ddz = Math.cos(p.angle) * DASH_DISTANCE;
        for (let step = 0; step < 8; step++) {
          const tx = Math.max(-MAP_HALF, Math.min(MAP_HALF, p.x + ddx / 8));
          const tz = Math.max(-MAP_HALF, Math.min(MAP_HALF, p.z + ddz / 8));
          if (!this._blocked(tx, p.z, PLAYER_RADIUS)) p.x = tx;
          if (!this._blocked(p.x, tz, PLAYER_RADIUS)) p.z = tz;
        }
      }
      if (p._dashTime > 0) p._dashTime -= DT;

      // WASD movement
      if (dx !== 0 || dz !== 0) {
        const len = Math.sqrt(dx*dx + dz*dz);
        const spd = PLAYER_SPEED * p._perkSpeedMult;
        const nx = Math.max(-MAP_HALF, Math.min(MAP_HALF, p.x + (dx/len)*spd*DT));
        const nz = Math.max(-MAP_HALF, Math.min(MAP_HALF, p.z + (dz/len)*spd*DT));
        if (!this._blocked(nx, p.z, PLAYER_RADIUS)) p.x = nx;
        if (!this._blocked(p.x, nz, PLAYER_RADIUS)) p.z = nz;
      }

      if (mouseAngle !== undefined) p.angle = mouseAngle;
      if (reload && !p.reloading && p.ammo < w.ammoMax) {
        p.reloading = true;
        p._reloadTimer = w.reloadTime * p._perkReloadMult;
      }

      // Use healthpack (E)
      if (useHealthpack && p.healthpacks > 0 && p.hp < p._perkMaxHp && p._useCd <= 0) {
        p.hp = Math.min(p._perkMaxHp, p.hp + HEALTHPACK_HEAL);
        p.healthpacks--;
        p._useCd = 0.5;
      }

      // Grenade (G)
      if (grenade && p.grenadeCount > 0) {
        p.grenadeCount--;
        this._grenadeProj.push({
          id: this._nextGrenadeId++, owner: p.id,
          x: p.x, z: p.z,
          dx: Math.sin(p.angle), dz: Math.cos(p.angle),
          fuse: GRENADE_FUSE,
        });
      }

      // Beacon (F) — attract enemies
      if (beacon && p.beaconCount > 0) {
        p.beaconCount--;
        const bx = p.x + Math.sin(p.angle) * 4;
        const bz = p.z + Math.cos(p.angle) * 4;
        this._beacons.push({ x: bx, z: bz, timer: BEACON_DURATION });
        this.io.to(this.id).emit('beaconLanded', { x: bx, z: bz, duration: BEACON_DURATION, radius: BEACON_ATTRACT_RADIUS });
      }

      // Shoot
      p._shootCd -= DT;
      if (shoot && p.ammo > 0 && !p.reloading && p._shootCd <= 0) {
        p._shootCd = w.fireRate;
        p.ammo--;
        for (let i = 0; i < w.pellets; i++) {
          const sp = (Math.random() - 0.5) * w.spread;
          this.bullets.push({
            id: this._nextBulletId++, x: p.x, z: p.z,
            dx: Math.sin(p.angle + sp), dz: Math.cos(p.angle + sp),
            dist: 0, owner: p.id, damage: w.damage, range: w.range, speed: w.speed,
          });
        }
        if (p.ammo === 0) { p.reloading = true; p._reloadTimer = w.reloadTime; }
      }

      // Safe zone entry
      const sdx = p.x - SAFE_ZONE.x, sdz = p.z - SAFE_ZONE.z;
      if (this._safeRoomOpen && Math.sqrt(sdx*sdx + sdz*sdz) < SAFE_ZONE_RADIUS) {
        p.inSafeZone = true;
        this.io.to(this.id).emit('playerSafe', { playerId: p.id, name: p.name });
        this._checkAllSafe();
      }
    });
  }

  // ── Bullets ─────────────────────────────────────────────────────────────────

  _updateBullets() {
    for (const b of this.bullets) {
      b.x += b.dx * b.speed * DT; b.z += b.dz * b.speed * DT; b.dist += b.speed * DT;
    }
    for (const b of this.bullets) {
      if (b.dist >= b.range) continue;
      const shooter = this.players.get(b.owner);
      const dmgMult = shooter?._perkDamageMult ?? 1.0;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = b.x - e.x, dz = b.z - e.z;
        if (dx*dx + dz*dz < 0.36) {
          e.hp -= b.damage * dmgMult; b.dist = b.range;
          if (e.hp <= 0) {
            e.dead = true;
            if (e.type === 'spitter') {
              this._acidPuddles.push({ x: e.x, z: e.z, timer: ACID_PUDDLE_DURATION });
              this.io.to(this.id).emit('acidPuddle', { x: e.x, z: e.z, radius: ACID_PUDDLE_RADIUS, duration: ACID_PUDDLE_DURATION });
            }
            if (e.type === 'jumper') this._clearJumperPin(e.id);
            const n = (this._kills.get(b.owner) ?? 0) + 1;
            this._kills.set(b.owner, n);
            const killer = this.players.get(b.owner);
            if (killer) this.io.to(this.id).emit('kill', { name: killer.name, slot: killer.slot, enemyType: e.type });
          }
          break;
        }
      }
    }
    // Bullets vs tongues
    for (const b of this.bullets) {
      if (b.dist >= b.range) continue;
      for (const t of this._tongues) {
        if (t.dead || t.attached) continue;
        const tdx = b.x - t.x, tdz = b.z - t.z;
        if (tdx*tdx + tdz*tdz < 0.25) {
          t.hp -= b.damage; b.dist = b.range;
          if (t.hp <= 0) { t.dead = true; this.io.to(this.id).emit('tongueDead', { tongueId: t.id }); }
          break;
        }
      }
    }
    this.bullets = this.bullets.filter(b => b.dist < b.range);
    this.enemies = this.enemies.filter(e => !e.dead);
  }

  // ── Enemies ─────────────────────────────────────────────────────────────────

  _updateEnemies() {
    const alive = [...this.players.values()].filter(p => p.alive && !p.downed && !p.inSafeZone && !p.disconnected);
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

      const er = ENEMY_RADII[e.type] ?? 0.4;

      // Beacon redirect: if any active beacon, move toward nearest beacon instead
      let targetX = nearest.x, targetZ = nearest.z;
      if (this._beacons.length > 0) {
        let bDist2 = Infinity, bestB = null;
        for (const b of this._beacons) {
          const bd2 = (b.x-e.x)**2 + (b.z-e.z)**2;
          if (bd2 < BEACON_ATTRACT_RADIUS * BEACON_ATTRACT_RADIUS && bd2 < bDist2) { bDist2 = bd2; bestB = b; }
        }
        if (bestB) { targetX = bestB.x; targetZ = bestB.z; }
      }
      const tdx = targetX - e.x, tdz = targetZ - e.z;
      const tdist = Math.sqrt(tdx*tdx + tdz*tdz);

      const ff = this._flowField?.dir(e.x, e.z);
      const hasFF = ff && (ff.dx !== 0 || ff.dz !== 0) && targetX === nearest.x;
      const mvDx = hasFF ? ff.dx : (tdist > 0 ? tdx / tdist : 0);
      const mvDz = hasFF ? ff.dz : (tdist > 0 ? tdz / tdist : 0);

      // Boss / Finalboss slam AOE
      if (e.type === 'boss' || e.type === 'finalboss') {
        const slamCd = e.type === 'finalboss' ? FINAL_BOSS_SLAM_CD     : BOSS_SLAM_CD;
        const slamR  = e.type === 'finalboss' ? FINAL_BOSS_SLAM_RADIUS : BOSS_SLAM_RADIUS;
        const slamD  = e.type === 'finalboss' ? FINAL_BOSS_SLAM_DAMAGE : BOSS_SLAM_DAMAGE;
        e._slamCd = (e._slamCd ?? slamCd) - DT;
        if (e._slamCd <= 0) {
          e._slamCd = slamCd;
          this.io.to(this.id).emit('bossSlam', { x: e.x, z: e.z, radius: slamR });
          for (const p of alive) {
            const pdx = p.x - e.x, pdz = p.z - e.z;
            if (pdx*pdx + pdz*pdz < slamR * slamR) {
              p.hp = Math.max(0, p.hp - slamD * p._perkDamageTaken);
              if (p.hp === 0) _downPlayer(p, this);
            }
          }
        }
      }

      // Tank charge ability
      if (e.type === 'tank') {
        e._chargeCd = (e._chargeCd ?? TANK_CHARGE_CD) - DT;
        if (e._chargeTime > 0) {
          e._chargeTime -= DT;
          _moveWithSlide(e, e._chargeDx * TANK_CHARGE_SPEED * DT, e._chargeDz * TANK_CHARGE_SPEED * DT, er, this);
          for (const p of alive) {
            const pdx = p.x - e.x, pdz = p.z - e.z;
            if (pdx*pdx + pdz*pdz < 0.9 && p._dashTime <= 0) {
              if (!e._chargeHit) e._chargeHit = new Set();
              if (!e._chargeHit.has(p.id)) {
                e._chargeHit.add(p.id);
                p.hp = Math.max(0, p.hp - TANK_CHARGE_DAMAGE * p._perkDamageTaken);
                if (p.hp === 0) _downPlayer(p, this);
              }
            }
          }
          continue;
        }
        if (e._chargeCd <= 0 && dist < 12) {
          e._chargeCd  = TANK_CHARGE_CD;
          e._chargeTime = TANK_CHARGE_DURATION;
          e._chargeDx  = dist > 0 ? dx / dist : 0;
          e._chargeDz  = dist > 0 ? dz / dist : 0;
          e._chargeHit = new Set();
          this.io.to(this.id).emit('tankCharge', { id: e.id, tx: nearest.x, tz: nearest.z });
        }
      }

      // ── Jumper: pin player ─────────────────────────────────────────────────────
      if (stats.isJumper) {
        if (e._pinnedPlayer) {
          // Stay on pinned player, deal damage
          const pp = this.players.get(e._pinnedPlayer);
          if (!pp || !pp.alive || pp.downed || pp.pinnedBy !== e.id) {
            e._pinnedPlayer = null; // target freed or died
          } else {
            e.x = pp.x; e.z = pp.z;
            e._atkCd = (e._atkCd ?? 0) - DT;
            if (e._atkCd <= 0) {
              pp.hp = Math.max(0, pp.hp - JUMPER_PIN_DAMAGE * pp._perkDamageTaken);
              e._atkCd = stats.atkCd;
              if (pp.hp === 0) { pp.pinnedBy = null; e._pinnedPlayer = null; _downPlayer(pp, this); }
            }
          }
          continue;
        }
        // Not pinning: charge toward nearest
        if (dist > stats.atkRange)
          _moveWithSlide(e, mvDx*stats.speed*DT, mvDz*stats.speed*DT, er, this);
        if (dist < stats.atkRange && nearest._dashTime <= 0 && !nearest.pinnedBy) {
          e._pinnedPlayer = nearest.id;
          nearest.pinnedBy = e.id;
          this.io.to(this.id).emit('playerPinned', { playerId: nearest.id, enemyId: e.id });
        }
        continue;
      }

      // ── Smoker: fire tongue ────────────────────────────────────────────────────
      if (stats.isSmoker) {
        if (dist > stats.atkRange * 0.7)
          _moveWithSlide(e, mvDx*stats.speed*DT, mvDz*stats.speed*DT, er, this);
        e._atkCd = (e._atkCd ?? 0) - DT;
        const alreadyPulling = this._tongues.some(t => t.owner === e.id && t.attached);
        if (!alreadyPulling && dist <= stats.atkRange && e._atkCd <= 0) {
          e._atkCd = stats.atkCd;
          this._tongues.push({
            id: this._nextTongueId++, owner: e.id,
            x: e.x, z: e.z,
            dx: dist > 0 ? dx/dist : 0, dz: dist > 0 ? dz/dist : 0,
            dist: 0, hp: TONGUE_HP, attached: false, target: null,
          });
          this.io.to(this.id).emit('tongueShot', { id: this._tongues[this._tongues.length-1].id, ox: e.x, oz: e.z, tx: nearest.x, tz: nearest.z });
        }
        continue;
      }

      if (stats.ranged) {
        if (dist > stats.atkRange * 0.6)
          _moveWithSlide(e, mvDx*stats.speed*DT, mvDz*stats.speed*DT, er, this);
        e._atkCd = (e._atkCd ?? 0) - DT;
        if (dist <= stats.atkRange && e._atkCd <= 0) {
          e._atkCd = stats.atkCd;
          this.acidBlobs.push({ id: this._nextBlobId++, x: e.x, z: e.z, dx: dx/dist, dz: dz/dist, dist: 0 });
        }
      } else {
        if (dist > stats.atkRange)
          _moveWithSlide(e, mvDx*stats.speed*DT, mvDz*stats.speed*DT, er, this);
        if (dist < stats.atkRange) {
          e._atkCd = (e._atkCd ?? 0) - DT;
          if (e._atkCd <= 0) {
            // No damage if target has dash iframe
            if (nearest._dashTime <= 0) {
              let dmg = stats.damage;
              // Runner backstab: double damage if attacking from behind
              if (e.type === 'runner' && dist > 0) {
                const pFx = Math.sin(nearest.angle), pFz = Math.cos(nearest.angle);
                const toEx = (e.x - nearest.x) / dist, toEz = (e.z - nearest.z) / dist;
                if (pFx * toEx + pFz * toEz > 0.5) dmg *= 2;
              }
              nearest.hp = Math.max(0, nearest.hp - dmg * nearest._perkDamageTaken);
              e._atkCd = stats.atkCd;
              if (nearest.hp === 0) _downPlayer(nearest, this);
            } else {
              e._atkCd = stats.atkCd * 0.3; // short cooldown when blocked by iframe
            }
          }
        }
      }
    }
  }

  // ── Acid ─────────────────────────────────────────────────────────────────────

  _updateAcidBlobs() {
    for (const b of this.acidBlobs) { b.x += b.dx*ACID_SPEED*DT; b.z += b.dz*ACID_SPEED*DT; b.dist += ACID_SPEED*DT; }
    for (const b of this.acidBlobs) {
      if (b.dist >= ACID_RANGE) continue;
      for (const p of this.players.values()) {
        if (!p.alive || p.downed || p.inSafeZone || p.disconnected || p._dashTime > 0) continue;
        const dx = b.x-p.x, dz = b.z-p.z;
        if (dx*dx+dz*dz < 0.6) {
          p.hp = Math.max(0, p.hp - ACID_DAMAGE * p._perkDamageTaken); b.dist = ACID_RANGE;
          if (p.hp === 0) _downPlayer(p, this);
          break;
        }
      }
    }
    this.acidBlobs = this.acidBlobs.filter(b => b.dist < ACID_RANGE);
  }

  // ── Grenades ────────────────────────────────────────────────────────────────

  _updateGrenades() {
    for (const g of this._grenadeProj) {
      g.x += g.dx * GRENADE_SPEED * DT;
      g.z += g.dz * GRENADE_SPEED * DT;
      g.fuse -= DT;
    }
    const exploded = this._grenadeProj.filter(g => g.fuse <= 0);
    this._grenadeProj = this._grenadeProj.filter(g => g.fuse > 0);
    for (const g of exploded) {
      this.io.to(this.id).emit('grenadeExplode', { x: g.x, z: g.z, radius: GRENADE_RADIUS });
      const toKill = [];
      for (const e of this.enemies) {
        const dx = g.x - e.x, dz = g.z - e.z;
        if (dx*dx + dz*dz < GRENADE_RADIUS * GRENADE_RADIUS) {
          e.hp -= GRENADE_DAMAGE;
          if (e.hp <= 0) { e.dead = true; toKill.push({ e, owner: g.owner }); }
        }
      }
      for (const { e, owner } of toKill) {
        if (e.type === 'spitter') {
          this._acidPuddles.push({ x: e.x, z: e.z, timer: ACID_PUDDLE_DURATION });
          this.io.to(this.id).emit('acidPuddle', { x: e.x, z: e.z, radius: ACID_PUDDLE_RADIUS, duration: ACID_PUDDLE_DURATION });
        }
        if (e.type === 'jumper') this._clearJumperPin(e.id);
        const n = (this._kills.get(owner) ?? 0) + 1;
        this._kills.set(owner, n);
        const killer = this.players.get(owner);
        if (killer) this.io.to(this.id).emit('kill', { name: killer.name, slot: killer.slot, enemyType: e.type });
      }
      this.enemies = this.enemies.filter(e => !e.dead);
    }
  }

  // ── Pickups ─────────────────────────────────────────────────────────────────

  _updatePickups() {
    for (const pk of this._pickups) {
      if (pk.respawnTimer > 0) { pk.respawnTimer -= DT; continue; }
      for (const p of this.players.values()) {
        if (!p.alive || p.inSafeZone || p.weapon === pk.weapon) continue;
        const dx = p.x-pk.x, dz = p.z-pk.z;
        if (dx*dx+dz*dz < WEAPON_PICKUP_RADIUS*WEAPON_PICKUP_RADIUS) {
          p.weapon = pk.weapon; p.ammo = WEAPONS[pk.weapon].ammoMax; p.reloading = false;
          pk.respawnTimer = WEAPON_RESPAWN_TIME;
          this.io.to(this.id).emit('weaponPickup', { playerId: p.id, weapon: pk.weapon, pickupId: pk.id });
          break;
        }
      }
    }
  }

  _updateHealthpacks() {
    for (const hp of this._healthpacks) {
      if (hp.respawnTimer > 0) { hp.respawnTimer -= DT; continue; }
      for (const p of this.players.values()) {
        if (!p.alive || p.inSafeZone || p.healthpacks >= PLAYER_MAX_HEALTHPACKS) continue;
        const dx = p.x-hp.x, dz = p.z-hp.z;
        if (dx*dx+dz*dz < HEALTHPACK_PICKUP_RADIUS*HEALTHPACK_PICKUP_RADIUS) {
          p.healthpacks++;
          hp.respawnTimer = HEALTHPACK_RESPAWN_TIME;
          this.io.to(this.id).emit('healthpackPickup', { playerId: p.id, pickupId: hp.id, count: p.healthpacks });
          break;
        }
      }
    }
  }

  // ── Tongue (smoker) ──────────────────────────────────────────────────────────

  _updateTongues() {
    for (const t of this._tongues) {
      if (t.attached) {
        // Pull target toward smoker
        const smoker = this.enemies.find(e => e.id === t.owner);
        const target = this.players.get(t.target);
        if (!smoker || smoker.dead || !target || !target.alive || target.downed) {
          if (target) { target.pulledBy = null; }
          t.dead = true; continue;
        }
        const sdx = smoker.x - target.x, sdz = smoker.z - target.z;
        const sd = Math.sqrt(sdx*sdx + sdz*sdz);
        if (sd < 1.2) {
          // Reached smoker — deal damage and release
          target.hp = Math.max(0, target.hp - 15 * target._perkDamageTaken);
          if (target.hp === 0) _downPlayer(target, this);
          target.pulledBy = null; t.dead = true;
        } else {
          target.x += (sdx/sd) * TONGUE_PULL_SPEED * DT;
          target.z += (sdz/sd) * TONGUE_PULL_SPEED * DT;
          t.x = target.x; t.z = target.z;
        }
        // Nearby teammate rescues
        for (const r of this.players.values()) {
          if (r.id === target.id || !r.alive || r.downed || r.disconnected) continue;
          const rdx = r.x - target.x, rdz = r.z - target.z;
          if (rdx*rdx + rdz*rdz < JUMPER_RESCUE_RANGE * JUMPER_RESCUE_RANGE) {
            target.pulledBy = null; t.dead = true;
            this.io.to(this.id).emit('tongueRescued', { playerId: target.id, rescuedBy: r.id });
            break;
          }
        }
      } else {
        // In flight
        t.x += t.dx * TONGUE_SPEED * DT;
        t.z += t.dz * TONGUE_SPEED * DT;
        t.dist += TONGUE_SPEED * DT;
        if (t.dist >= TONGUE_RANGE) { t.dead = true; continue; }
        // Hit a player
        for (const p of this.players.values()) {
          if (!p.alive || p.downed || p.inSafeZone || p.disconnected || p.pulledBy || p.pinnedBy) continue;
          const pdx = p.x - t.x, pdz = p.z - t.z;
          if (pdx*pdx + pdz*pdz < 0.25) {
            t.attached = true; t.target = p.id; p.pulledBy = t.id;
            this.io.to(this.id).emit('tongueAttached', { tongueId: t.id, playerId: p.id });
            break;
          }
        }
      }
    }
    this._tongues = this._tongues.filter(t => !t.dead);
  }

  // ── Beacons ───────────────────────────────────────────────────────────────────

  _updateBeacons() {
    for (const b of this._beacons) b.timer -= DT;
    this._beacons = this._beacons.filter(b => b.timer > 0);
  }

  // ── Jumper clear on enemy death ───────────────────────────────────────────────

  _clearJumperPin(enemyId) {
    for (const p of this.players.values()) {
      if (p.pinnedBy === enemyId) { p.pinnedBy = null; this.io.to(this.id).emit('playerUnpinned', { playerId: p.id }); }
    }
  }

  // ── Win / Lose checks ───────────────────────────────────────────────────────

  _checkAllSafe() {
    if (this._completing) return;
    const alivePlayers = [...this.players.values()].filter(p => p.alive && !p.disconnected);
    if (alivePlayers.length > 0 && alivePlayers.every(p => p.inSafeZone)) {
      this._completeMap();
    }
  }

  _checkAllDead() {
    if ([...this.players.values()].some(p => (p.alive || p.downed) && !p.disconnected)) return;
    const elapsed  = Math.floor((Date.now() - this._gameStartTime) / 1000);
    const players  = [...this.players.values()].map(p => ({ id: p.id, name: p.name, slot: p.slot, kills: this._kills.get(p.id) ?? 0 }));
    this.io.to(this.id).emit('gameOver', { wave: this.wave, survivalTime: elapsed, players });
    this.gameStarted = false;
    this._readySet.clear();
    this.players.forEach(p => { p.ready = false; });
    this._broadcastLobby();
    console.log(`[Room ${this.id}] GAME OVER wave ${this.wave} ${elapsed}s`);
  }

  _checkWave() {
    if (this._perkPhase) return;
    if (this.enemies.length > 0 || this._waveTimer > 0) {
      if (this._waveTimer > 0) {
        this._waveTimer -= DT;
        if (this._waveTimer <= 0) { this.wave++; this._spawnWave(this.wave); this.io.to(this.id).emit('newWave', { wave: this.wave }); }
      }
      return;
    }
    // Wave cleared
    if (this.wave >= FINAL_BOSS_WAVE) {
      const elapsed = Math.floor((Date.now() - this._gameStartTime) / 1000);
      const players = [...this.players.values()].map(p => ({ id: p.id, name: p.name, slot: p.slot, kills: this._kills.get(p.id) ?? 0 }));
      this.io.to(this.id).emit('victory', { wave: this.wave, survivalTime: elapsed, players });
      this.gameStarted = false;
      this._readySet.clear();
      this.players.forEach(p => { p.ready = false; });
      this._broadcastLobby();
      console.log(`[Room ${this.id}] VICTORY wave ${this.wave}`);
      return;
    }
    // Perk phase every N waves
    if (this.wave % PERK_WAVE_INTERVAL === 0) {
      this._enterPerkPhase();
      return;
    }
    this._waveTimer = NEXT_WAVE_DELAY;
    this.io.to(this.id).emit('waveClear', { nextWave: this.wave + 1, delay: NEXT_WAVE_DELAY });
  }

  _spawnWave(n) {
    const count = Math.min(WAVE_BASE + (n-1)*WAVE_SCALE, MAX_ENEMIES);
    const comp  = WAVE_COMPOSITIONS[Math.min(n-1, WAVE_COMPOSITIONS.length-1)];
    for (let i = 0; i < count; i++) {
      const sp   = SPAWN_POINTS[Math.floor(Math.random()*SPAWN_POINTS.length)];
      const type = _weightedRandom(comp);
      this.enemies.push({ id: this._nextEnemyId++, x: sp.x+(Math.random()-.5)*6, z: sp.z+(Math.random()-.5)*6, angle: 0, hp: ENEMY_TYPES[type].hp, dead: false, type, _atkCd: 0 });
    }
    if (n % 5 === 0 && n < FINAL_BOSS_WAVE) {
      const sp = SPAWN_POINTS[Math.floor(Math.random()*SPAWN_POINTS.length)];
      this.enemies.push({ id: this._nextEnemyId++, x: sp.x, z: sp.z, angle: 0, hp: ENEMY_TYPES.boss.hp, dead: false, type: 'boss', _atkCd: 0, _slamCd: BOSS_SLAM_CD });
      this.io.to(this.id).emit('bossSpawn', { wave: n, final: false });
    }
    if (n >= FINAL_BOSS_WAVE) {
      const sp = SPAWN_POINTS[Math.floor(Math.random()*SPAWN_POINTS.length)];
      this.enemies.push({ id: this._nextEnemyId++, x: sp.x, z: sp.z, angle: 0, hp: ENEMY_TYPES.finalboss.hp, dead: false, type: 'finalboss', _atkCd: 0, _slamCd: FINAL_BOSS_SLAM_CD });
      this.io.to(this.id).emit('bossSpawn', { wave: n, final: true });
    }
    // Replenish grenades + beacons each wave
    this.players.forEach(p => { if (p.alive) { p.grenadeCount = GRENADE_MAX; p.beaconCount = BEACON_MAX; } });
    this._waveStart    = Date.now();
    this._safeRoomOpen = false;
    console.log(`[Room ${this.id}] wave ${n} → ${this.enemies.length} enemies`);
  }

  // ── Revive ──────────────────────────────────────────────────────────────────

  _updateRevive() {
    const downed = [...this.players.values()].filter(p => p.downed && !p.disconnected);
    if (downed.length === 0) return;
    const alive = [...this.players.values()].filter(p => p.alive && !p.downed && !p.inSafeZone && !p.disconnected);

    for (const d of downed) {
      // Drain HP while down
      d.downedHp = Math.max(0, d.downedHp - DOWNED_HP_DRAIN * DT);
      if (d.downedHp <= 0) {
        d.downed = false;
        this.io.to(this.id).emit('playerDied', { playerId: d.id });
        this._checkAllDead();
        continue;
      }

      // Check for nearby reviver
      let reviving = false;
      for (const r of alive) {
        const dx = r.x - d.x, dz = r.z - d.z;
        if (dx*dx + dz*dz < REVIVE_RANGE * REVIVE_RANGE) {
          d._reviveProgress = Math.min(1, d._reviveProgress + DT / REVIVE_TIME);
          reviving = true;
          if (d._reviveProgress >= 1) {
            d.downed = false;
            d.alive  = true;
            d.hp     = Math.round(d._perkMaxHp * 0.4);
            d._reviveProgress = 0;
            this.io.to(this.id).emit('playerRevived', { playerId: d.id, hp: d.hp, revivedBy: r.id });
          }
          break;
        }
      }
      if (!reviving) {
        d._reviveProgress = Math.max(0, d._reviveProgress - DT / REVIVE_TIME);
      }
    }
  }

  // ── Acid puddles ─────────────────────────────────────────────────────────────

  _updateAcidPuddles() {
    if (this._acidPuddles.length === 0) return;
    for (const a of this._acidPuddles) {
      a.timer -= DT;
      for (const p of this.players.values()) {
        if (!p.alive || p.downed || p.inSafeZone || p.disconnected || p._dashTime > 0) continue;
        const dx = p.x - a.x, dz = p.z - a.z;
        if (dx*dx + dz*dz < ACID_PUDDLE_RADIUS * ACID_PUDDLE_RADIUS) {
          p.hp = Math.max(0, p.hp - ACID_PUDDLE_DRAIN * DT * p._perkDamageTaken);
          if (p.hp === 0) _downPlayer(p, this);
        }
      }
    }
    this._acidPuddles = this._acidPuddles.filter(a => a.timer > 0);
  }

  // ── Collision ───────────────────────────────────────────────────────────────

  _blocked(x, z, r) {
    const col = MAP_COLLIDERS[this.mapId];
    if (!col) return false;
    for (const b of col.boxes) {
      const nx = Math.max(b.x - b.hw, Math.min(b.x + b.hw, x));
      const nz = Math.max(b.z - b.hd, Math.min(b.z + b.hd, z));
      const dx = x - nx, dz = z - nz;
      if (dx*dx + dz*dz < r*r) return true;
    }
    for (const c of col.circles) {
      const dx = x - c.x, dz = z - c.z;
      const m = r + c.r;
      if (dx*dx + dz*dz < m*m) return true;
    }
    return false;
  }

  _separateCharacters() {
    const players = [...this.players.values()].filter(p => p.alive && !p.inSafeZone && !p.disconnected);

    for (let i = 0; i < players.length; i++)
      for (let j = i + 1; j < players.length; j++)
        _pushApart(players[i], players[j], PLAYER_RADIUS, PLAYER_RADIUS, 0.5, 0.5);

    for (const p of players)
      for (const e of this.enemies)
        _pushApart(p, e, PLAYER_RADIUS, ENEMY_RADII[e.type] ?? 0.4, 0.7, 0.3);

    for (let i = 0; i < this.enemies.length; i++)
      for (let j = i + 1; j < this.enemies.length; j++) {
        const ri = ENEMY_RADII[this.enemies[i].type] ?? 0.4;
        const rj = ENEMY_RADII[this.enemies[j].type] ?? 0.4;
        _pushApart(this.enemies[i], this.enemies[j], ri, rj, 0.5, 0.5);
      }
  }

  // ── Broadcast ───────────────────────────────────────────────────────────────

  _broadcastGame() {
    const safeSecondsLeft = this._safeRoomOpen ? 0
      : Math.max(0, WAVE_SAFE_DELAY - Math.floor((Date.now() - this._waveStart) / 1000));
    this.io.to(this.id).emit('gs', {
      tick: this.tick, wave: this.wave, safeRoomOpen: this._safeRoomOpen, safeSecondsLeft,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, slot: p.slot,
        x: p.x, z: p.z, angle: p.angle,
        hp: p.hp, ammo: p.ammo, alive: p.alive,
        reloading: p.reloading, weapon: p.weapon,
        healthpacks: p.healthpacks, grenadeCount: p.grenadeCount, beaconCount: p.beaconCount,
        inSafeZone: p.inSafeZone, disconnected: p.disconnected,
        dashing: p._dashTime > 0,
        appearance: p.appearance,
        downed: p.downed, downedHp: p.downedHp,
        reviveProgress: p._reviveProgress,
        pinnedBy: p.pinnedBy, pulledBy: p.pulledBy,
      })),
      enemies:    this.enemies.map(e => ({ id: e.id, x: e.x, z: e.z, angle: e.angle, hp: e.hp, type: e.type })),
      bullets:    this.bullets.map(b => ({ id: b.id, x: b.x, z: b.z })),
      acidBlobs:  this.acidBlobs.map(b => ({ id: b.id, x: b.x, z: b.z })),
      grenades:   this._grenadeProj.map(g => ({ id: g.id, x: g.x, z: g.z })),
      pickups:    this._pickups.map(p => ({ id: p.id, weapon: p.weapon, x: p.x, z: p.z, active: p.respawnTimer <= 0 })),
      healthpacks: this._healthpacks.map(h => ({ id: h.id, x: h.x, z: h.z, active: h.respawnTimer <= 0 })),
      acidPuddles: this._acidPuddles.map(a => ({ x: a.x, z: a.z, radius: ACID_PUDDLE_RADIUS, timer: a.timer })),
      tongues:    this._tongues.map(t => ({ id: t.id, x: t.x, z: t.z, attached: t.attached })),
      beacons:    this._beacons.map(b => ({ x: b.x, z: b.z, timer: b.timer })),
      perkPhase: this._perkPhase,
    });
  }
}

// ── Module-level helpers ─────────────────────────────────────────────────────

function _downPlayer(p, room) {
  if (p.downed) return; // already downed
  p.alive  = false;
  p.downed = true;
  p.downedHp = DOWNED_MAX_HP;
  p._reviveProgress = 0;
  room.io.to(room.id).emit('playerDowned', { playerId: p.id });
  room._checkAllDead();
}

function _randomSpawn() { return { x: (Math.random()-.5)*4, z: (Math.random()-.5)*4 }; }

function _moveWithSlide(entity, sx, sz, r, room) {
  const nx = Math.max(-MAP_HALF, Math.min(MAP_HALF, entity.x + sx));
  const nz = Math.max(-MAP_HALF, Math.min(MAP_HALF, entity.z + sz));
  if (!room._blocked(nx, entity.z, r)) entity.x = nx;
  if (!room._blocked(entity.x, nz, r)) entity.z = nz;
}

function _pushApart(a, b, ra, rb, ratioA, ratioB) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const dist2 = dx*dx + dz*dz;
  const minD  = ra + rb;
  if (dist2 >= minD*minD) return;
  const dist = dist2 > 0 ? Math.sqrt(dist2) : 0.001;
  const push = (minD - dist);
  const nx = dx / dist, nz = dz / dist;
  a.x -= nx * push * ratioA; a.z -= nz * push * ratioA;
  b.x += nx * push * ratioB; b.z += nz * push * ratioB;
}
