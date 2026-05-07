import {
  TICK_RATE, MAX_PLAYERS, PLAYER_SPEED, PLAYER_MAX_HP,
  MAP_HALF, SAFE_ZONE, SAFE_ZONE_RADIUS,
  WAVE_BASE, WAVE_SCALE, NEXT_WAVE_DELAY, MAX_ENEMIES, SPAWN_POINTS, ENEMY_MIN_SPAWN_DIST,
  WEAPONS, WEAPON_PICKUPS_BY_MAP, WEAPON_PICKUP_RADIUS, WEAPON_RESPAWN_TIME, SPECIAL_WEAPON_DROPS,
  ENEMY_TYPES, WAVE_COMPOSITIONS, SPECIAL_TYPES, MAX_SPECIALS_PER_WAVE,
  ACID_SPEED, ACID_RANGE, ACID_DAMAGE,
  MAPS, WAVE_SAFE_DELAY,
  DIFFICULTIES, DIFFICULTY_SETTINGS,
  HEALTHPACK_HEAL, HEALTHPACK_PICKUP_RADIUS, HEALTHPACK_POSITIONS_BY_MAP, HEALTHPACK_RESPAWN_TIME,
  PLAYER_MAX_HEALTHPACKS,
  BOSS_SLAM_CD, BOSS_SLAM_RADIUS, BOSS_SLAM_DAMAGE,
  FINAL_BOSS_WAVE, FINAL_BOSS_SLAM_CD, FINAL_BOSS_SLAM_RADIUS, FINAL_BOSS_SLAM_DAMAGE,
  DEFAULT_APPEARANCE,
  DASH_CD, DASH_DISTANCE, DASH_IFRAME,
  GRENADE_MAX, GRENADE_STARTING, GRENADE_DAMAGE, GRENADE_RADIUS, GRENADE_FUSE, GRENADE_SPEED,
  GRENADE_THROW_RANGE, GRENADE_LAND_FUSE, GRENADE_DROP_CHANCE, GRENADE_PICKUP_RADIUS,
  RECONNECT_TIMEOUT, LOBBY_RECONNECT_TIMEOUT,
  DOWNED_HP_DRAIN, DOWNED_MAX_HP, REVIVE_RANGE, REVIVE_TIME,
  TANK_CHARGE_CD, TANK_CHARGE_SPEED, TANK_CHARGE_DURATION, TANK_CHARGE_DAMAGE,
  ACID_PUDDLE_DURATION, ACID_PUDDLE_RADIUS, ACID_PUDDLE_DRAIN,
  ACID_BLOB_PUDDLE_DURATION, ACID_BLOB_PUDDLE_RADIUS,
  PERK_WAVE_INTERVAL, PERK_SELECT_TIME, PERKS,
  JUMPER_PIN_DAMAGE, JUMPER_RESCUE_RANGE,
  DROP_LIFETIME,
  TONGUE_SPEED, TONGUE_RANGE, TONGUE_HP, TONGUE_PULL_SPEED, TONGUE_REACH_DAMAGE,
  BEACON_MAX, BEACON_STARTING, BEACON_DURATION, BEACON_ATTRACT_RADIUS,
  CITY_FUEL_POSITIONS, CITY_REPAIR_KIT_POS, CITY_MISSION_CAR,
  MISSION_PICKUP_RADIUS, MISSION_DELIVER_RADIUS, MISSION_REPAIR_TIME, MISSION_DEFEND_COUNT,
  FOREST_TRAIL_SPAWN_CENTER, FOREST_TRAIL_PLANK_POSITIONS, FOREST_TRAIL_BRIDGE_SPOT,
  FOREST_TRAIL_KEY_POS, FOREST_TRAIL_GENERATOR, FOREST_TRAIL_BRIDGE_TIME, FOREST_TRAIL_GEN_TIME,
  FOREST_TRAIL_TRIGGERS,
  FOREST_TRAIL_RIVER_Z_MIN, FOREST_TRAIL_RIVER_Z_MAX,
  FOREST_TRAIL_BRIDGE_X_MIN, FOREST_TRAIL_BRIDGE_X_MAX, WATER_SPEED_MULT,
  FOREST_TRAIL_GEN_SPAWN_INTERVAL, FOREST_TRAIL_GEN_SPAWN_COUNT,
  FOREST_TRAIL_GEN_FINISH_HORDE, FOREST_TRAIL_GEN_SPAWN_POINTS,
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
    this._mapIndex   = MAPS.indexOf('forest_trail');
    this.mapId       = 'forest_trail';
    this.gameStarted = false;
    this._readySet   = new Set();
    this._votes      = new Map();
    this._fogVotes        = new Map(); // socketId → 'yes' | 'no'
    this.fogEnabled       = false;
    this._difficultyVotes = new Map(); // socketId → 'easy' | 'normal' | 'hard'
    this.difficultySpeedMult = DIFFICULTY_SETTINGS.easy.speedMult;
    this.difficultyHpMult    = DIFFICULTY_SETTINGS.easy.hpMult;
    this.difficultyCountMult = DIFFICULTY_SETTINGS.easy.countMult;
    this._nextEnemyId  = 1;
    this._nextBulletId = 1;
    this._nextBlobId   = 1;
    this._nextGrenadeId = 1;
    this._waveTimer    = -1;
    this._waveStart    = 0;
    this._safeRoomOpen = false;
    this._completing   = false;
    this._kills        = new Map();
    this._damageDealt  = new Map();
    this._revives      = new Map();
    this._shotsFired   = new Map();
    this._shotsHit     = new Map();
    this._waveKills    = new Map();
    this._waveDamage   = new Map();
    this._gameStartTime = 0;
    this._pickups    = [];
    this._weaponDrops   = [];
    this._nextDropId    = 1;
    this._healthpacks = [];
    this._nextHpDropId = 1;
    this._grenadeProj = [];
    this._grenadePicks = [];
    this._nextGrenPickId = 1;
    this._acidPuddles = [];
    this._tongues     = [];
    this._beacons     = [];
    this._nextTongueId = 1;
    this._missionPhase   = 0;
    this._fuelDelivered  = 0;
    this._repairProgress = 0;
    this._phase1Timer    = 0;
    this._missionItems   = [];
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
      case 'extra_grenade': p.grenadeCount      = Math.min(3, p.grenadeCount + 1); break;
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
    this.io.to(this.id).emit('waveClear', { nextWave: this.wave + 1, delay: NEXT_WAVE_DELAY, players: this._buildWavePlayerStats() });
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
      weapon: 'pistol', healthpacks: 0, grenadeCount: GRENADE_STARTING, beaconCount: BEACON_STARTING,
      inSafeZone: false, ready: false, disconnected: false,
      appearance: appearance ?? { ...DEFAULT_APPEARANCE },
      carrying: null,
      _reloadTimer: 0, _shootCd: 0, _useCd: 0,
      _dashCd: 0, _dashTime: 0, _input: {},
      downed: false, downedHp: 0, _reviveProgress: 0,
      pinnedBy: null, pulledBy: null,
      _perkMaxHp: PLAYER_MAX_HP, _perkReloadMult: 1.0, _perkSpeedMult: 1.0,
      _perkDamageMult: 1.0, _perkDamageTaken: 1.0, _perkDashCdBonus: 0,
    });
    this._votes.set(socket.id, 'forest_trail');
    this._fogVotes.set(socket.id, 'no');
    this._difficultyVotes.set(socket.id, 'easy');
    socket.emit('joined', { playerId: socket.id, slot: slotIndex, roomId: this.id, token, appearance: this.players.get(socket.id).appearance });
    this._broadcastLobby();
    console.log(`[Room ${this.id}] +player ${name}`);
  }

  removePlayer(socketId) {
    const p = this.players.get(socketId);
    if (p) {
      // Hold slot: RECONNECT_TIMEOUT in-game, LOBBY_RECONNECT_TIMEOUT in lobby
      const timeout = this.gameStarted ? RECONNECT_TIMEOUT : LOBBY_RECONNECT_TIMEOUT;
      const cleanup = setTimeout(() => {
        this._disconnected.delete(p.token);
        this.players.delete(socketId);
        this._readySet.delete(socketId);
        this._votes.delete(socketId);
        this._fogVotes.delete(socketId);
        this._difficultyVotes.delete(socketId);
        if (this.players.size === 0) { clearInterval(this._interval); return; }
        if (this.gameStarted) {
          this._checkAllDead();
        } else {
          this._broadcastLobby();
          this._checkAllReady();
        }
      }, timeout * 1000);
      this._disconnected.set(p.token, { socketId, cleanup });
      p.disconnected = true;
      p._input = {};
      if (!this.gameStarted) {
        // Exclude disconnected player immediately so others can still start
        this._broadcastLobby();
        this._checkAllReady();
      }
      return;
    }
    if (this.players.size === 0) { clearInterval(this._interval); return; }
    if (this.gameStarted) {
      this.io.to(this.id).emit('playerLeft', { playerId: socketId });
    } else {
      this._broadcastLobby();
      this._checkAllReady();
    }
  }

  destroy() {
    clearInterval(this._interval);
    for (const dc of this._disconnected.values()) clearTimeout(dc.cleanup);
    this._disconnected.clear();
    this.io.to(this.id).emit('roomClosed');
    for (const socketId of this.players.keys()) {
      const s = this.io.sockets.sockets.get(socketId);
      if (s) s.leave(this.id);
    }
    this.players.clear();
  }

  permanentLeave(socketId) {
    const p = this.players.get(socketId);
    if (!p) return;
    // Cancel any pending reconnect hold
    if (p.token) {
      const dc = this._disconnected.get(p.token);
      if (dc) { clearTimeout(dc.cleanup); this._disconnected.delete(p.token); }
    }
    this._readySet.delete(socketId);
    this._votes.delete(socketId);
    this._fogVotes.delete(socketId);
    this._difficultyVotes.delete(socketId);
    this.players.delete(socketId);
    if (this.players.size === 0) { clearInterval(this._interval); return; }
    if (this.gameStarted) {
      this.io.to(this.id).emit('playerLeft', { playerId: socketId });
      this._checkAllDead();
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
    socket.emit('joined', { playerId: socket.id, slot: p.slot, roomId: this.id, token, reconnected: true, appearance: p.appearance });
    if (this.gameStarted) {
      socket.emit('gameReconnect', { wave: this.wave, mapId: this.mapId, fogEnabled: this.fogEnabled });
    } else {
      this._broadcastLobby();
      this._checkAllReady();
    }
    console.log(`[Room ${this.id}] reconnect ${p.name}`);
    return true;
  }

  handleInput(socketId, input) {
    const p = this.players.get(socketId);
    if (p && this.gameStarted && !p.disconnected) {
      const prev = p._input;
      p._input = { ...input };
      // One-shot events: preserve if the previous tick hasn't consumed them yet
      if (prev.grenadeTarget && !input.grenadeTarget) p._input.grenadeTarget = prev.grenadeTarget;
      if (prev.beacon)       p._input.beacon       = true;
      if (prev.dash)         p._input.dash         = true;
      if (prev.reload)       p._input.reload       = true;
      if (prev.useHealthpack) p._input.useHealthpack = true;
    }
  }

  forceStart(socketId) {
    const p = this.players.get(socketId);
    if (!p || p.disconnected || this.gameStarted) return;
    const active = [...this.players.values()].filter(q => !q.disconnected);
    const host = active.reduce((a, b) => (a.slot < b.slot ? a : b), active[0]);
    if (!host || host.id !== socketId) return;
    this._startGame();
  }

  setReady(socketId, isReady) {
    const p = this.players.get(socketId);
    if (!p || p.disconnected || this.gameStarted) return;
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

  setFogVote(socketId, choice) {
    if (!this.players.has(socketId) || this.gameStarted) return;
    if (choice === 'yes' || choice === 'no') this._fogVotes.set(socketId, choice);
    this._broadcastLobby();
  }

  setDifficultyVote(socketId, choice) {
    if (!this.players.has(socketId) || this.gameStarted) return;
    if (DIFFICULTIES.includes(choice)) this._difficultyVotes.set(socketId, choice);
    this._broadcastLobby();
  }

  setAppearance(socketId, appearance) {
    const p = this.players.get(socketId);
    if (p && !this.gameStarted) { p.appearance = appearance; this._broadcastLobby(); }
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
    const active  = [...this.players.values()].filter(p => !p.disconnected);
    const players = active.map(p => ({ id: p.id, name: p.name, slot: p.slot, ready: p.ready, outfit: p.appearance?.outfit ?? 0 }));
    const voteCounts = Object.fromEntries(MAPS.map(m => [m, 0]));
    for (const v of this._votes.values()) voteCounts[v] = (voteCounts[v] ?? 0) + 1;
    const fogVoteCounts = { yes: 0, no: 0 };
    for (const v of this._fogVotes.values()) fogVoteCounts[v]++;
    const difficultyVoteCounts = { easy: 0, normal: 0, hard: 0 };
    for (const v of this._difficultyVotes.values()) difficultyVoteCounts[v]++;
    const host = active.length ? active.reduce((a, b) => (a.slot < b.slot ? a : b), active[0]) : null;
    this.io.to(this.id).emit('lobbyState', {
      players, readyCount: active.filter(p => p.ready).length, totalCount: active.length, voteCounts, fogVoteCounts, difficultyVoteCounts, hostId: host?.id ?? null,
    });
  }

  _checkAllReady() {
    const active = [...this.players.values()].filter(p => !p.disconnected);
    if (active.length === 0) return;
    if (active.every(p => p.ready)) this._startGame();
  }

  // ── Game start / map transition ─────────────────────────────────────────────

  _pickMapFromVotes() {
    const counts = Object.fromEntries(MAPS.map(m => [m, 0]));
    for (const v of this._votes.values()) counts[v]++;
    const totalVotes = Object.values(counts).reduce((a, b) => a + b, 0);
    if (totalVotes === 0) return this.mapId; // preserve default
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
      const noVotes  = [...this._fogVotes.values()].filter(v => v === 'no').length;
      const yesVotes = [...this._fogVotes.values()].filter(v => v === 'yes').length;
      if (noVotes > 0 || yesVotes > 0) this.fogEnabled = noVotes < yesVotes; // preserve default if no votes
      const diffCounts = { easy: 0, normal: 0, hard: 0 };
      for (const v of this._difficultyVotes.values()) diffCounts[v]++;
      const totalDiffVotes = diffCounts.easy + diffCounts.normal + diffCounts.hard;
      if (totalDiffVotes > 0) {
        const maxVotes = Math.max(...Object.values(diffCounts));
        const winners = DIFFICULTIES.filter(d => diffCounts[d] === maxVotes);
        const chosenDiff = winners[Math.floor(Math.random() * winners.length)];
        const ds = DIFFICULTY_SETTINGS[chosenDiff];
        this.difficultySpeedMult = ds.speedMult;
        this.difficultyHpMult    = ds.hpMult;
        this.difficultyCountMult = ds.countMult;
      }
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
    this._missionPhase   = 0;
    this._fuelDelivered  = 0;
    this._repairProgress = 0;
    this._phase1Timer    = 0;
    this._genSpawnTimer  = 0;
    this._missionItems   = [];
    this._completing   = false;
    this._kills.clear();
    this._damageDealt.clear();
    this._revives.clear();
    this._shotsFired.clear();
    this._shotsHit.clear();
    this._pickups = (WEAPON_PICKUPS_BY_MAP[this.mapId] ?? []).map(p => ({ ...p, respawnTimer: 0 }));
    this._healthpacks = (HEALTHPACK_POSITIONS_BY_MAP[this.mapId] ?? []).map(h => ({ ...h, respawnTimer: 0 }));
    this._weaponDrops = [];
    this._grenadePicks = [];
    this._flowField = new FlowField(this.mapId);
    this._acidPuddles = [];
    this._perkPhase   = false;
    this._perkChoices.clear();
    this._perkOptions.clear();

    this.players.forEach(p => {
      const s = this.mapId === 'forest_trail'
        ? { x: FOREST_TRAIL_SPAWN_CENTER.x + (Math.random() - 0.5) * 4, z: FOREST_TRAIL_SPAWN_CENTER.z + (Math.random() - 0.5) * 4 }
        : _randomSpawn();
      Object.assign(p, {
        x: s.x, z: s.z, hp: PLAYER_MAX_HP,
        ammo: WEAPONS.pistol.ammoMax, alive: true,
        reloading: false, weapon: 'pistol',
        healthpacks: 0, grenadeCount: GRENADE_STARTING, beaconCount: BEACON_STARTING,
        inSafeZone: false, disconnected: false,
        _reloadTimer: 0, _shootCd: 0, _useCd: 0,
        _dashCd: 0, _dashTime: 0, _input: {},
        downed: false, downedHp: 0, _reviveProgress: 0,
        pinnedBy: null, pulledBy: null, carrying: null,
        _perkMaxHp: PLAYER_MAX_HP, _perkReloadMult: 1.0, _perkSpeedMult: 1.0,
        _perkDamageMult: 1.0, _perkDamageTaken: 1.0, _perkDashCdBonus: 0,
      });
    });

    this.gameStarted    = true;
    this._gameStartTime = Date.now();
    if (this.mapId !== 'forest_trail') this._spawnWave(this.wave);
    this.io.to(this.id).emit('gameStart', { wave: this.wave, mapId: this.mapId, isRestart, fogEnabled: this.fogEnabled });
    if (this.mapId === 'city')         this._initCityMissions();
    if (this.mapId === 'forest_trail') this._initForestTrailMissions();
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
        p.grenadeCount = GRENADE_STARTING;
      });

      this._startGame(true);
    }, 3500);
  }

  // ── Tick ────────────────────────────────────────────────────────────────────

  _tick() {
    if (!this.gameStarted || this._completing) return;
    this.tick++;

    if (this.mapId === 'city') {
      this._updateMissions();
    } else if (this.mapId === 'forest_trail') {
      this._updateForestTrailMissions();
      this._updateForestTrailTriggers();
    } else if (!this._safeRoomOpen && this._waveStart > 0 &&
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
    this._pushEnemiesFromCircles();
    this._separateCharacters();
    // Re-eject players pushed into walls by separation
    for (const p of this.players.values()) {
      if (p.disconnected || p.dead || p.downed) continue;
      if (this._blocked(p.x, p.z, PLAYER_RADIUS)) {
        const out = this._depenetrate(p.x, p.z, PLAYER_RADIUS);
        p.x = Math.max(-MAP_HALF, Math.min(MAP_HALF, out.x));
        p.z = Math.max(-MAP_HALF, Math.min(MAP_HALF, out.z));
      }
    }
    this._updateAcidBlobs();
    this._updateGrenades();
    this._updateAcidPuddles();
    this._updateTongues();
    this._updateBeacons();
    this._updatePickups();
    this._updateWeaponDrops();
    this._updateHealthpacks();
    this._updateGrenadePicks();
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

      const { w: fw, a, s, d, mouseAngle, shoot, reload, useHealthpack, dash, grenadeTarget, beacon } = p._input;

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

      // Pop player out of geometry if stuck (e.g. pushed by enemies or spawned inside)
      if (this._blocked(p.x, p.z, PLAYER_RADIUS)) {
        const out = this._depenetrate(p.x, p.z, PLAYER_RADIUS);
        p.x = Math.max(-MAP_HALF, Math.min(MAP_HALF, out.x));
        p.z = Math.max(-MAP_HALF, Math.min(MAP_HALF, out.z));
      }

      // WASD movement
      if (dx !== 0 || dz !== 0) {
        const len = Math.sqrt(dx*dx + dz*dz);
        const inWater = this.mapId === 'forest_trail'
          && p.z >= FOREST_TRAIL_RIVER_Z_MIN && p.z <= FOREST_TRAIL_RIVER_Z_MAX
          && !(p.x >= FOREST_TRAIL_BRIDGE_X_MIN && p.x <= FOREST_TRAIL_BRIDGE_X_MAX);
        const waterMult = inWater ? WATER_SPEED_MULT : 1;
        const spd = PLAYER_SPEED * p._perkSpeedMult * waterMult;
        const nx = Math.max(-MAP_HALF, Math.min(MAP_HALF, p.x + (dx/len)*spd*DT));
        const nz = Math.max(-MAP_HALF, Math.min(MAP_HALF, p.z + (dz/len)*spd*DT));
        if (!this._blocked(nx, p.z, PLAYER_RADIUS)) p.x = nx;
        if (!this._blocked(p.x, nz, PLAYER_RADIUS)) p.z = nz;
        p.inWater = inWater;
      } else {
        const inWater = this.mapId === 'forest_trail'
          && p.z >= FOREST_TRAIL_RIVER_Z_MIN && p.z <= FOREST_TRAIL_RIVER_Z_MAX
          && !(p.x >= FOREST_TRAIL_BRIDGE_X_MIN && p.x <= FOREST_TRAIL_BRIDGE_X_MAX);
        p.inWater = inWater;
      }

      // Recoil decay
      if (p._recoilVx || p._recoilVz) {
        p.x = Math.max(-MAP_HALF, Math.min(MAP_HALF, p.x + (p._recoilVx ?? 0) * DT));
        p.z = Math.max(-MAP_HALF, Math.min(MAP_HALF, p.z + (p._recoilVz ?? 0) * DT));
        p._recoilVx = (p._recoilVx ?? 0) * 0.6;
        p._recoilVz = (p._recoilVz ?? 0) * 0.6;
        if (Math.abs(p._recoilVx) < 0.01) p._recoilVx = 0;
        if (Math.abs(p._recoilVz) < 0.01) p._recoilVz = 0;
      }

      if (mouseAngle !== undefined) p.angle = mouseAngle;
      if (reload && !p.reloading && p.ammo < w.ammoMax) {
        p.reloading = true;
        const bulletsNeeded = w.ammoMax - p.ammo;
        const timeFraction = p.weapon === 'shotgun' ? bulletsNeeded / w.ammoMax : 1;
        p._reloadTimer = w.reloadTime * timeFraction * p._perkReloadMult;
      }

      // E key: weapon pickup (priority) or healthpack
      if (useHealthpack) {
        const r2 = WEAPON_PICKUP_RADIUS * WEAPON_PICKUP_RADIUS;
        const weaponPool = ['shotgun', 'ak47', 'sniper'];
        let pickedUp = false;
        for (const pk of this._pickups) {
          if (pk.respawnTimer > 0) continue;
          if (pk.weapon !== 'random' && p.weapon === pk.weapon) continue;
          const dx = p.x - pk.x, dz = p.z - pk.z;
          if (dx*dx + dz*dz < r2) {
            const granted = pk.weapon === 'random'
              ? weaponPool[Math.floor(Math.random() * weaponPool.length)]
              : pk.weapon;
            p.weapon = granted; p.ammo = WEAPONS[granted].ammoMax; p.reloading = false;
            pk.respawnTimer = WEAPON_RESPAWN_TIME;
            this.io.to(this.id).emit('weaponPickup', { playerId: p.id, weapon: granted, pickupId: pk.id });
            pickedUp = true;
            break;
          }
        }
        if (!pickedUp) {
          for (const d of this._weaponDrops) {
            if (d.lifetime <= 0 || p.weapon === d.weapon) continue;
            const dx = p.x - d.x, dz = p.z - d.z;
            if (dx*dx + dz*dz < r2) {
              p.weapon = d.weapon; p.ammo = WEAPONS[d.weapon].ammoMax; p.reloading = false;
              d.lifetime = 0;
              this.io.to(this.id).emit('weaponPickup', { playerId: p.id, weapon: d.weapon, pickupId: d.id });
              pickedUp = true;
              break;
            }
          }
        }
        if (!pickedUp && p._missionPickupCallback) {
          p._missionPickupCallback();
          p._missionPickupCallback = null;
          pickedUp = true;
        }
        if (!pickedUp) {
          const gr2 = GRENADE_PICKUP_RADIUS * GRENADE_PICKUP_RADIUS;
          for (const gp of this._grenadePicks) {
            if (gp.dead || p.grenadeCount >= GRENADE_MAX) continue;
            const dx = p.x - gp.x, dz = p.z - gp.z;
            if (dx*dx + dz*dz < gr2) {
              p.grenadeCount++;
              gp.dead = true;
              this.io.to(this.id).emit('grenadePickup', { playerId: p.id, pickupId: gp.id, count: p.grenadeCount });
              pickedUp = true;
              break;
            }
          }
        }
        if (!pickedUp) {
          const hr2 = HEALTHPACK_PICKUP_RADIUS * HEALTHPACK_PICKUP_RADIUS;
          for (const hp of this._healthpacks) {
            if (hp.respawnTimer > 0 || hp.dead || p.healthpacks >= PLAYER_MAX_HEALTHPACKS) continue;
            const dx = p.x - hp.x, dz = p.z - hp.z;
            if (dx*dx + dz*dz < hr2) {
              p.healthpacks++;
              this.io.to(this.id).emit('healthpackPickup', { playerId: p.id, pickupId: hp.id, count: p.healthpacks });
              if (hp.isDrop) { hp.dead = true; } else { hp.respawnTimer = HEALTHPACK_RESPAWN_TIME; }
              pickedUp = true;
              break;
            }
          }
        }
        if (!pickedUp && p.healthpacks > 0 && p.hp < p._perkMaxHp && p._useCd <= 0) {
          p.hp = Math.min(p._perkMaxHp, p.hp + HEALTHPACK_HEAL);
          p.healthpacks--;
          p._useCd = 0.5;
        }
      }

      // Grenade (G) — throw to target position on release
      if (grenadeTarget && p.grenadeCount > 0) {
        const tdx = grenadeTarget.x - p.x, tdz = grenadeTarget.z - p.z;
        if (tdx*tdx + tdz*tdz <= GRENADE_THROW_RANGE * GRENADE_THROW_RANGE) {
          p.grenadeCount--;
          const gId = this._nextGrenadeId++;
          this._grenadeProj.push({
            id: gId, owner: p.id,
            x: grenadeTarget.x, z: grenadeTarget.z,
            dx: 0, dz: 0,
            fuse: GRENADE_LAND_FUSE,
          });
          this.io.to(this.id).emit('grenadeThrown', { id: gId, ox: p.x, oz: p.z, tx: grenadeTarget.x, tz: grenadeTarget.z });
        }
      }

      // Beacon (F) — attract enemies
      if (beacon && p.beaconCount > 0) {
        p.beaconCount--;
        const bx = p.x + Math.sin(p.angle) * 4;
        const bz = p.z + Math.cos(p.angle) * 4;
        this._beacons.push({ x: bx, z: bz, timer: BEACON_DURATION });
        this.io.to(this.id).emit('beaconThrown', { ox: p.x, oz: p.z, tx: bx, tz: bz });
        this.io.to(this.id).emit('beaconLanded', { x: bx, z: bz, duration: BEACON_DURATION, radius: BEACON_ATTRACT_RADIUS });
      }

      // Clear consumed one-shots so next tick doesn't re-fire them
      p._input.grenadeTarget = null;
      p._input.beacon = false;
      p._input.dash = false;

      // Shoot
      p._shootCd -= DT;
      if (shoot && p.ammo > 0 && !p.reloading && p._shootCd <= 0) {
        p._shootCd = w.fireRate;
        p.ammo--;
        this._shotsFired.set(p.id, (this._shotsFired.get(p.id) ?? 0) + w.pellets);
        for (let i = 0; i < w.pellets; i++) {
          const sp = (Math.random() - 0.5) * w.spread;
          this.bullets.push({
            id: this._nextBulletId++, x: p.x, z: p.z,
            dx: Math.sin(p.angle + sp), dz: Math.cos(p.angle + sp),
            dist: 0, owner: p.id, damage: w.damage, range: w.range, speed: w.speed,
          });
        }
        if (p.ammo === 0) { p.reloading = true; p._reloadTimer = w.reloadTime * p._perkReloadMult; }
        p._recoilVx = (p._recoilVx ?? 0) - Math.sin(p.angle) * w.recoil;
        p._recoilVz = (p._recoilVz ?? 0) - Math.cos(p.angle) * w.recoil;
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
          const _prevHp = e.hp;
          e.hp -= b.damage * dmgMult;
          const dmgDone = Math.round(_prevHp - Math.max(0, e.hp));
          this._damageDealt.set(b.owner, (this._damageDealt.get(b.owner) ?? 0) + dmgDone);
          this._waveDamage.set(b.owner,  (this._waveDamage.get(b.owner)  ?? 0) + dmgDone);
          this._shotsHit.set(b.owner, (this._shotsHit.get(b.owner) ?? 0) + 1);
          b.dist = b.range;
          if (e.hp <= 0) {
            e.dead = true;
            if (e.type === 'spitter') {
              this._acidPuddles.push({ x: e.x, z: e.z, timer: ACID_PUDDLE_DURATION });
              this.io.to(this.id).emit('acidPuddle', { x: e.x, z: e.z, radius: ACID_PUDDLE_RADIUS, duration: ACID_PUDDLE_DURATION });
            }
            if (e.type === 'jumper') this._clearJumperPin(e.id);
            this._trySpecialDrop(e);
            this._tryGrenadeDrop(e);
            const n = (this._kills.get(b.owner) ?? 0) + 1;
            this._kills.set(b.owner, n);
            this._waveKills.set(b.owner, (this._waveKills.get(b.owner) ?? 0) + 1);
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
    const sm    = this.difficultySpeedMult;
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

      // Escape if pushed/spawned inside wall geometry
      if (this._blocked(e.x, e.z, er)) {
        e._stuckTick = (e._stuckTick ?? 0) + 1;
        const angle = e._stuckTick * 0.618 * Math.PI * 2; // golden-ratio spiral
        let escaped = false;
        for (let rad = 0.4; rad <= 4.0; rad += 0.4) {
          const ex = e.x + Math.cos(angle) * rad;
          const ez = e.z + Math.sin(angle) * rad;
          if (!this._blocked(ex, ez, er)) { e.x = ex; e.z = ez; escaped = true; break; }
        }
        if (!escaped) continue; // truly boxed in, skip this tick
      } else {
        e._stuckTick = 0;
      }

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
          _moveWithSlide(e, e._chargeDx * TANK_CHARGE_SPEED * sm * DT, e._chargeDz * TANK_CHARGE_SPEED * sm * DT, er, this);
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
            // Clear pinnedBy so a revived player isn't stuck immobile
            if (pp && pp.pinnedBy === e.id) {
              pp.pinnedBy = null;
              this.io.to(this.id).emit('playerUnpinned', { playerId: pp.id });
            }
            e._pinnedPlayer = null;
          } else {
            // Proximity rescue: teammate within range frees pinned player
            let rescued = false;
            for (const r of this.players.values()) {
              if (r.id === pp.id || !r.alive || r.downed || r.disconnected) continue;
              const rdx = r.x - pp.x, rdz = r.z - pp.z;
              if (rdx*rdx + rdz*rdz < JUMPER_RESCUE_RANGE * JUMPER_RESCUE_RANGE) {
                pp.pinnedBy = null; e._pinnedPlayer = null;
                this.io.to(this.id).emit('playerUnpinned', { playerId: pp.id });
                rescued = true; break;
              }
            }
            if (!rescued) {
              e.x = pp.x; e.z = pp.z;
              e._atkCd = (e._atkCd ?? 0) - DT;
              if (e._atkCd <= 0) {
                pp.hp = Math.max(0, pp.hp - JUMPER_PIN_DAMAGE * pp._perkDamageTaken);
                e._atkCd = stats.atkCd;
                if (pp.hp === 0) { pp.pinnedBy = null; e._pinnedPlayer = null; _downPlayer(pp, this); }
              }
            }
          }
          continue;
        }
        // Not pinning: charge toward nearest
        if (dist > stats.atkRange)
          _moveWithSlide(e, mvDx*stats.speed*sm*DT, mvDz*stats.speed*sm*DT, er, this);
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
          _moveWithSlide(e, mvDx*stats.speed*sm*DT, mvDz*stats.speed*sm*DT, er, this);
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
          this.io.to(this.id).emit('tongueShot', { id: this._tongues[this._tongues.length-1].id, ownerId: e.id, ox: e.x, oz: e.z, tx: nearest.x, tz: nearest.z });
        }
        continue;
      }

      if (stats.ranged) {
        if (dist > stats.atkRange * 0.6)
          _moveWithSlide(e, mvDx*stats.speed*sm*DT, mvDz*stats.speed*sm*DT, er, this);
        e._atkCd = (e._atkCd ?? 0) - DT;
        if (dist <= stats.atkRange && e._atkCd <= 0) {
          e._atkCd = stats.atkCd;
          this.acidBlobs.push({ id: this._nextBlobId++, x: e.x, z: e.z, dx: dx/dist, dz: dz/dist, dist: 0 });
        }
      } else {
        if (dist > stats.atkRange)
          _moveWithSlide(e, mvDx*stats.speed*sm*DT, mvDz*stats.speed*sm*DT, er, this);
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

  _pushEnemiesFromCircles() {
    for (const e of this.enemies) {
      if (e.dead) continue;
      _pushFromCircleColliders(e, ENEMY_RADII[e.type] ?? 0.4, this.mapId);
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
          p.hp = Math.max(0, p.hp - ACID_DAMAGE * p._perkDamageTaken); b.dist = ACID_RANGE; b.hit = true;
          if (p.hp === 0) _downPlayer(p, this);
          break;
        }
      }
    }
    // Missed blobs land and leave a small puddle for zone denial
    for (const b of this.acidBlobs) {
      if (b.dist < ACID_RANGE || b.hit) continue;
      this._acidPuddles.push({ x: b.x, z: b.z, timer: ACID_BLOB_PUDDLE_DURATION });
      this.io.to(this.id).emit('acidPuddle', { x: b.x, z: b.z, radius: ACID_BLOB_PUDDLE_RADIUS, duration: ACID_BLOB_PUDDLE_DURATION });
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
          const _prevHp = e.hp;
          e.hp -= GRENADE_DAMAGE;
          this._damageDealt.set(g.owner, (this._damageDealt.get(g.owner) ?? 0) + Math.round(_prevHp - Math.max(0, e.hp)));
          if (e.hp <= 0) { e.dead = true; toKill.push({ e, owner: g.owner }); }
        }
      }
      for (const { e, owner } of toKill) {
        if (e.type === 'spitter') {
          this._acidPuddles.push({ x: e.x, z: e.z, timer: ACID_PUDDLE_DURATION });
          this.io.to(this.id).emit('acidPuddle', { x: e.x, z: e.z, radius: ACID_PUDDLE_RADIUS, duration: ACID_PUDDLE_DURATION });
        }
        if (e.type === 'jumper') this._clearJumperPin(e.id);
        this._trySpecialDrop(e);
        this._tryGrenadeDrop(e);
        const n = (this._kills.get(owner) ?? 0) + 1;
        this._kills.set(owner, n);
        const killer = this.players.get(owner);
        if (killer) this.io.to(this.id).emit('kill', { name: killer.name, slot: killer.slot, enemyType: e.type });
      }
      this.enemies = this.enemies.filter(e => !e.dead);
    }
  }

  // ── Weapon drops (from special kills) ────────────────────────────────────────

  _trySpecialDrop(e) {
    const weapon = SPECIAL_WEAPON_DROPS[e.type];
    const isSpecial = SPECIAL_TYPES.includes(e.type);
    if (!weapon && !isSpecial) return;
    if (weapon && isSpecial) {
      if (Math.random() < 0.5) {
        this._weaponDrops.push({ id: `d${this._nextDropId++}`, weapon, x: e.x, z: e.z, lifetime: DROP_LIFETIME });
      } else {
        this._healthpacks.push({ id: `hpd${this._nextHpDropId++}`, x: e.x, z: e.z, respawnTimer: 0, isDrop: true });
      }
    } else if (weapon) {
      this._weaponDrops.push({ id: `d${this._nextDropId++}`, weapon, x: e.x, z: e.z, lifetime: DROP_LIFETIME });
    } else {
      this._healthpacks.push({ id: `hpd${this._nextHpDropId++}`, x: e.x, z: e.z, respawnTimer: 0, isDrop: true });
    }
  }

  _tryGrenadeDrop(e) {
    if (Math.random() < GRENADE_DROP_CHANCE) {
      this._grenadePicks.push({ id: `gp${this._nextGrenPickId++}`, x: e.x, z: e.z });
    }
  }

  _updateGrenadePicks() {
    this._grenadePicks = this._grenadePicks.filter(g => !g.dead);
  }

  _updateWeaponDrops() {
    for (const d of this._weaponDrops) {
      d.lifetime -= DT;
    }
    this._weaponDrops = this._weaponDrops.filter(d => d.lifetime > 0);
  }

  // ── Pickups ─────────────────────────────────────────────────────────────────

  _updatePickups() {
    for (const pk of this._pickups) {
      if (pk.respawnTimer > 0) { pk.respawnTimer -= DT; }
    }
  }

  _updateHealthpacks() {
    for (const hp of this._healthpacks) {
      if (hp.respawnTimer > 0) { hp.respawnTimer -= DT; }
    }
    this._healthpacks = this._healthpacks.filter(h => !h.dead);
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
          target.hp = Math.max(0, target.hp - TONGUE_REACH_DAMAGE * target._perkDamageTaken);
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
            this.io.to(this.id).emit('tongueRescued', { tongueId: t.id, playerId: target.id, rescuedBy: r.id });
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
    const players  = [...this.players.values()].map(p => ({
      id: p.id, name: p.name, slot: p.slot,
      kills:       this._kills.get(p.id)       ?? 0,
      damage:      this._damageDealt.get(p.id) ?? 0,
      revives:     this._revives.get(p.id)     ?? 0,
      shotsFired:  this._shotsFired.get(p.id)  ?? 0,
      shotsHit:    this._shotsHit.get(p.id)    ?? 0,
    }));
    this.io.to(this.id).emit('gameOver', { wave: this.wave, survivalTime: elapsed, players });
    this.gameStarted = false;
    this._readySet.clear();
    this.players.forEach(p => { p.ready = false; });
    this._broadcastLobby();
    console.log(`[Room ${this.id}] GAME OVER wave ${this.wave} ${elapsed}s`);
  }

  _checkWave() {
    if (this.mapId === 'forest_trail') return;
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
      const players = [...this.players.values()].map(p => ({
        id: p.id, name: p.name, slot: p.slot,
        kills:       this._kills.get(p.id)       ?? 0,
        damage:      this._damageDealt.get(p.id) ?? 0,
        revives:     this._revives.get(p.id)     ?? 0,
        shotsFired:  this._shotsFired.get(p.id)  ?? 0,
        shotsHit:    this._shotsHit.get(p.id)    ?? 0,
      }));
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
    this.io.to(this.id).emit('waveClear', { nextWave: this.wave + 1, delay: NEXT_WAVE_DELAY, players: this._buildWavePlayerStats() });
  }

  _validEnemySpawn(sp, r = 0.5) {
    const alivePlayers = [...this.players.values()].filter(p => !p.disconnected && (p.alive || p.downed));
    const minDist2 = ENEMY_MIN_SPAWN_DIST * ENEMY_MIN_SPAWN_DIST;
    for (let i = 0; i < 30; i++) {
      const x = sp.x + (Math.random() - 0.5) * 6;
      const z = sp.z + (Math.random() - 0.5) * 6;
      if (this._blocked(x, z, r)) continue;
      const tooClose = alivePlayers.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < minDist2);
      if (!tooClose) return { x, z };
    }
    return { x: sp.x, z: sp.z };
  }

  _buildWavePlayerStats() {
    return [...this.players.values()].map(p => ({
      id: p.id, name: p.name, slot: p.slot,
      waveKills:  this._waveKills.get(p.id)   ?? 0,
      waveDamage: this._waveDamage.get(p.id)  ?? 0,
      kills:      this._kills.get(p.id)        ?? 0,
      damage:     this._damageDealt.get(p.id)  ?? 0,
      revives:    this._revives.get(p.id)      ?? 0,
      shotsFired: this._shotsFired.get(p.id)   ?? 0,
      shotsHit:   this._shotsHit.get(p.id)     ?? 0,
    }));
  }

  _spawnWave(n) {
    this._waveKills  = new Map();
    this._waveDamage = new Map();
    const hm    = this.difficultyHpMult;
    const count = Math.min(Math.round((WAVE_BASE + (n-1)*WAVE_SCALE) * this.difficultyCountMult), MAX_ENEMIES);
    const comp  = WAVE_COMPOSITIONS[Math.min(n-1, WAVE_COMPOSITIONS.length-1)];
    for (let i = 0; i < count; i++) {
      const sp   = SPAWN_POINTS[Math.floor(Math.random()*SPAWN_POINTS.length)];
      const type = _weightedRandom(comp);
      const pos  = this._validEnemySpawn(sp, ENEMY_RADII[type] ?? 0.4);
      this.enemies.push({ id: this._nextEnemyId++, x: pos.x, z: pos.z, angle: 0, hp: Math.round(ENEMY_TYPES[type].hp * hm), dead: false, type, _atkCd: 0 });
    }
    const specialCount = Math.min(n, MAX_SPECIALS_PER_WAVE);
    for (let i = 0; i < specialCount; i++) {
      const sp   = SPAWN_POINTS[Math.floor(Math.random()*SPAWN_POINTS.length)];
      const type = SPECIAL_TYPES[Math.floor(Math.random()*SPECIAL_TYPES.length)];
      const pos  = this._validEnemySpawn(sp, ENEMY_RADII[type] ?? 0.4);
      this.enemies.push({ id: this._nextEnemyId++, x: pos.x, z: pos.z, angle: 0, hp: Math.round(ENEMY_TYPES[type].hp * hm), dead: false, type, _atkCd: 0 });
    }
    if (n % 5 === 0 && n < FINAL_BOSS_WAVE) {
      const sp  = SPAWN_POINTS[Math.floor(Math.random()*SPAWN_POINTS.length)];
      const pos = this._validEnemySpawn(sp, ENEMY_RADII.boss ?? 0.4);
      this.enemies.push({ id: this._nextEnemyId++, x: pos.x, z: pos.z, angle: 0, hp: Math.round(ENEMY_TYPES.boss.hp * hm), dead: false, type: 'boss', _atkCd: 0, _slamCd: BOSS_SLAM_CD });
      this.io.to(this.id).emit('bossSpawn', { wave: n, final: false });
    }
    if (n >= FINAL_BOSS_WAVE) {
      const sp  = SPAWN_POINTS[Math.floor(Math.random()*SPAWN_POINTS.length)];
      const pos = this._validEnemySpawn(sp, ENEMY_RADII.finalboss ?? 0.4);
      this.enemies.push({ id: this._nextEnemyId++, x: pos.x, z: pos.z, angle: 0, hp: Math.round(ENEMY_TYPES.finalboss.hp * hm), dead: false, type: 'finalboss', _atkCd: 0, _slamCd: FINAL_BOSS_SLAM_CD });
      this.io.to(this.id).emit('bossSpawn', { wave: n, final: true });
    }
    // Replenish beacons each wave (include downed players so they have them on revive)
    this.players.forEach(p => { if (!p.disconnected) { p.beaconCount = BEACON_MAX; } });
    this._waveStart = Date.now();
    if (this._missionPhase < 4) this._safeRoomOpen = false;
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
            this._revives.set(r.id, (this._revives.get(r.id) ?? 0) + 1);
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

  _circleSlide(ex, ez, sx, sz, r) {
    const col = MAP_COLLIDERS[this.mapId];
    if (!col) return null;
    for (const c of col.circles) {
      const dx = ex - c.x, dz = ez - c.z;
      const m = r + c.r;
      if (dx*dx + dz*dz > m * m * 2) continue;
      const d = Math.sqrt(dx*dx + dz*dz) || 0.001;
      const nx = dx / d, nz = dz / d;
      const dot = sx * nx + sz * nz;
      if (dot >= 0) continue;
      return { sx: sx - dot * nx, sz: sz - dot * nz };
    }
    return null;
  }

  _depenetrate(x, z, r) {
    const col = MAP_COLLIDERS[this.mapId];
    if (!col) return { x, z };
    for (const b of col.boxes) {
      const cx = Math.max(b.x - b.hw, Math.min(b.x + b.hw, x));
      const cz = Math.max(b.z - b.hd, Math.min(b.z + b.hd, z));
      const dx = x - cx, dz = z - cz;
      const d2 = dx*dx + dz*dz;
      if (d2 >= r*r) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        return { x: cx + (dx/d)*r*1.02, z: cz + (dz/d)*r*1.02 };
      }
      // Player center inside box — eject through nearest face
      const dL = x - (b.x - b.hw), dR = (b.x + b.hw) - x;
      const dF = z - (b.z - b.hd), dB = (b.z + b.hd) - z;
      const m = Math.min(dL, dR, dF, dB);
      if (m === dL) return { x: b.x - b.hw - r - 0.02, z };
      if (m === dR) return { x: b.x + b.hw + r + 0.02, z };
      if (m === dF) return { x, z: b.z - b.hd - r - 0.02 };
      return { x, z: b.z + b.hd + r + 0.02 };
    }
    for (const c of col.circles) {
      const dx = x - c.x, dz = z - c.z;
      const d2 = dx*dx + dz*dz;
      const m = r + c.r;
      if (d2 >= m*m) continue;
      const d = Math.sqrt(d2);
      if (d > 1e-6) return { x: c.x + (dx/d)*m*1.02, z: c.z + (dz/d)*m*1.02 };
      return { x: x + m + 0.02, z };
    }
    return { x, z };
  }

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

  // ── City missions ────────────────────────────────────────────────────────────

  _initCityMissions() {
    this._missionPhase   = 0;
    this._fuelDelivered  = 0;
    this._repairProgress = 0;
    this._phase1Timer    = 0;
    this._genSpawnTimer  = 0;
    this._missionItems   = [
      ...CITY_FUEL_POSITIONS.map(p => ({ ...p, type: 'fuel',      pickedUp: false })),
      { ...CITY_REPAIR_KIT_POS, type: 'repairKit', pickedUp: false },
    ];
    this.io.to(this.id).emit('missionUpdate', {
      phase: 0, label: 'Collect fuel canisters (0/2)',
      items: this._missionItems.filter(i => i.type === 'fuel'),
      carPos: CITY_MISSION_CAR,
    });
  }

  _visibleMissionItems() {
    if (this._missionPhase < 2)  return this._missionItems.filter(i => i.type === 'fuel'      && !i.pickedUp);
    if (this._missionPhase === 2) return this._missionItems.filter(i => i.type === 'repairKit' && !i.pickedUp);
    return [];
  }

  _dropCarrying(p) {
    if (!p.carrying) return;
    const type = p.carrying;
    p.carrying = null;
    if (this.mapId === 'city') {
      if (type === 'fuel') {
        const item = this._missionItems.find(i => i.type === 'fuel' && i.pickedUp);
        if (item) { item.pickedUp = false; item.x = p.x; item.z = p.z; this.io.to(this.id).emit('missionItemDropped', { itemId: item.id, x: item.x, z: item.z }); }
      } else if (type === 'repairKit') {
        const item = this._missionItems.find(i => i.type === 'repairKit');
        if (item) { item.pickedUp = false; item.x = p.x; item.z = p.z; this.io.to(this.id).emit('missionItemDropped', { itemId: item.id, x: item.x, z: item.z }); }
        if (this._missionPhase >= 3) {
          this._missionPhase = 2;
          this.io.to(this.id).emit('missionUpdate', { phase: 2, label: 'Repair kit dropped! Pick it back up.', items: [item], deliveryPos: CITY_MISSION_CAR });
        }
      }
    } else if (this.mapId === 'forest_trail') {
      const item = this._missionItems.find(i => i.type === type && i.pickedUp);
      if (item) {
        item.pickedUp = false; item.x = p.x; item.z = p.z;
        this.io.to(this.id).emit('missionItemDropped', { itemId: item.id, x: item.x, z: item.z });
        if (type === 'genkey' && this._missionPhase === 3) {
          this._missionPhase = 2;
          this.io.to(this.id).emit('missionUpdate', {
            phase: 2, label: 'Key dropped! Find it and start the generator.',
            items: [item], deliveryPos: FOREST_TRAIL_GENERATOR,
          });
        }
      }
    }
  }

  _spawnDefendHorde() {
    for (let i = 0; i < MISSION_DEFEND_COUNT; i++) {
      const sp   = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
      const type = Math.random() < 0.65 ? 'walker' : 'runner';
      const pos  = this._validEnemySpawn(sp, ENEMY_RADII[type] ?? 0.4);
      this.enemies.push({ id: this._nextEnemyId++, x: pos.x, z: pos.z, angle: 0, hp: ENEMY_TYPES[type].hp, dead: false, type, _atkCd: 0 });
    }
    this.io.to(this.id).emit('defendHorde');
  }

  _spawnAtPoints(spawnPoints, count) {
    const hm = this.difficultyHpMult;
    for (let i = 0; i < count; i++) {
      const sp   = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
      const type = Math.random() < 0.6 ? 'walker' : 'runner';
      const pos  = this._validEnemySpawn(sp, ENEMY_RADII[type] ?? 0.4);
      this.enemies.push({ id: this._nextEnemyId++, x: pos.x, z: pos.z, angle: 0, hp: Math.round(ENEMY_TYPES[type].hp * hm), dead: false, type, _atkCd: 0 });
    }
  }

  _updateMissions() {
    if (this._missionPhase >= 4) return;

    // Drop items if carrier is downed, dead, or disconnected
    for (const p of this.players.values()) {
      if (p.carrying && (!p.alive || p.downed || p.disconnected)) this._dropCarrying(p);
      p._missionPickupCallback = null;
    }

    const players = [...this.players.values()].filter(p => p.alive && !p.downed && !p.inSafeZone && !p.disconnected);

    if (this._missionPhase === 0) {
      for (const p of players) {
        if (p.carrying) continue;
        for (const item of this._missionItems) {
          if (item.type !== 'fuel' || item.pickedUp) continue;
          const dx = p.x - item.x, dz = p.z - item.z;
          if (dx*dx + dz*dz < MISSION_PICKUP_RADIUS * MISSION_PICKUP_RADIUS) {
            const _item = item;
            p._missionPickupCallback = () => {
              _item.pickedUp = true; p.carrying = 'fuel';
              this.io.to(this.id).emit('missionItemPickup', { itemId: _item.id, playerId: p.id });
            };
            break;
          }
        }
      }
      for (const p of players) {
        if (p.carrying !== 'fuel') continue;
        const dx = p.x - CITY_MISSION_CAR.x, dz = p.z - CITY_MISSION_CAR.z;
        if (dx*dx + dz*dz < MISSION_DELIVER_RADIUS * MISSION_DELIVER_RADIUS) {
          p.carrying = null;
          this._fuelDelivered++;
          if (this._fuelDelivered >= 2) {
            this._missionPhase = 1;
            this._phase1Timer  = 3.5;
            this.io.to(this.id).emit('missionUpdate', { phase: 1, label: 'Fuel loaded! Trying to start the engine...' });
          } else {
            this.io.to(this.id).emit('missionUpdate', {
              phase: 0, label: `Fuel delivered (${this._fuelDelivered}/2) — find more fuel!`,
              items: this._visibleMissionItems(), carPos: CITY_MISSION_CAR,
            });
          }
        }
      }
    } else if (this._missionPhase === 1) {
      this._phase1Timer -= DT;
      if (this._phase1Timer <= 0) {
        this._missionPhase = 2;
        const rkit = this._missionItems.find(i => i.type === 'repairKit');
        this.io.to(this.id).emit('missionUpdate', { phase: 2, label: 'Engine broken! Find the repair kit.', items: [rkit], carPos: CITY_MISSION_CAR });
      }
    } else if (this._missionPhase === 2) {
      const rkit = this._missionItems.find(i => i.type === 'repairKit');
      if (!rkit || rkit.pickedUp) return;
      for (const p of players) {
        if (p.carrying) continue;
        const dx = p.x - rkit.x, dz = p.z - rkit.z;
        if (dx*dx + dz*dz < MISSION_PICKUP_RADIUS * MISSION_PICKUP_RADIUS) {
          const _rkit = rkit;
          p._missionPickupCallback = () => {
            _rkit.pickedUp = true; p.carrying = 'repairKit';
            this._missionPhase = 3;
            this._spawnDefendHorde();
            this.io.to(this.id).emit('missionItemPickup', { itemId: _rkit.id, playerId: p.id });
            this.io.to(this.id).emit('missionUpdate', { phase: 3, label: 'Repair the engine! Defend the mechanic!', carPos: CITY_MISSION_CAR });
          };
          break;
        }
      }
    } else if (this._missionPhase === 3) {
      const repairer = [...this.players.values()].find(p => p.carrying === 'repairKit' && p.alive && !p.downed);
      if (!repairer) return;
      const dx = repairer.x - CITY_MISSION_CAR.x, dz = repairer.z - CITY_MISSION_CAR.z;
      if (dx*dx + dz*dz < MISSION_DELIVER_RADIUS * MISSION_DELIVER_RADIUS) {
        this._repairProgress = Math.min(1, this._repairProgress + DT / MISSION_REPAIR_TIME);
        if (this._repairProgress >= 1) {
          repairer.carrying = null;
          this._missionPhase = 4;
          this._safeRoomOpen = true;
          this.io.to(this.id).emit('missionUpdate', { phase: 4, label: 'Car repaired! Run to the safe house!' });
          this.io.to(this.id).emit('safeRoomOpen');
        }
      } else {
        this._repairProgress = Math.max(0, this._repairProgress - DT / MISSION_REPAIR_TIME * 0.5);
      }
    }
  }

  // ── Forest Trail missions ────────────────────────────────────────────────────

  _initForestTrailMissions() {
    this._missionPhase    = 0;
    this._planksDelivered = 0;
    this._bridgeProgress  = 0;
    this._genProgress     = 0;
    this._genSpawnTimer   = 0;
    this._ftTriggers      = FOREST_TRAIL_TRIGGERS.map(t => ({ ...t, triggered: false }));
    this._missionItems    = [
      ...FOREST_TRAIL_PLANK_POSITIONS.map(p => ({ ...p, type: 'plank',  pickedUp: false })),
      { ...FOREST_TRAIL_KEY_POS,           type: 'genkey', pickedUp: false },
    ];
    this.io.to(this.id).emit('missionUpdate', {
      phase: 0, label: 'Find bridge planks (0/2)',
      items: this._missionItems.filter(i => i.type === 'plank'),
      deliveryPos: FOREST_TRAIL_BRIDGE_SPOT,
    });
  }

  _visibleForestTrailItems() {
    if (this._missionPhase < 2)   return this._missionItems.filter(i => i.type === 'plank'  && !i.pickedUp);
    if (this._missionPhase === 2) return this._missionItems.filter(i => i.type === 'genkey' && !i.pickedUp);
    return [];
  }

  _ftDeliveryPos() {
    if (this._missionPhase <= 1) return FOREST_TRAIL_BRIDGE_SPOT;
    if (this._missionPhase <= 3) return FOREST_TRAIL_GENERATOR;
    return null;
  }

  _updateForestTrailMissions() {
    if (this._missionPhase >= 4) return;

    for (const p of this.players.values()) {
      if (p.carrying && (!p.alive || p.downed || p.disconnected)) this._dropCarrying(p);
      p._missionPickupCallback = null;
    }

    const players = [...this.players.values()].filter(p => p.alive && !p.downed && !p.inSafeZone && !p.disconnected);

    if (this._missionPhase === 0) {
      for (const p of players) {
        if (p.carrying) continue;
        for (const item of this._missionItems) {
          if (item.type !== 'plank' || item.pickedUp) continue;
          const dx = p.x - item.x, dz = p.z - item.z;
          if (dx*dx + dz*dz < MISSION_PICKUP_RADIUS * MISSION_PICKUP_RADIUS) {
            const _item = item;
            p._missionPickupCallback = () => {
              _item.pickedUp = true; p.carrying = 'plank';
              this.io.to(this.id).emit('missionItemPickup', { itemId: _item.id, playerId: p.id });
            };
            break;
          }
        }
      }
      for (const p of players) {
        if (p.carrying !== 'plank') continue;
        const dx = p.x - FOREST_TRAIL_BRIDGE_SPOT.x, dz = p.z - FOREST_TRAIL_BRIDGE_SPOT.z;
        if (dx*dx + dz*dz < MISSION_DELIVER_RADIUS * MISSION_DELIVER_RADIUS) {
          p.carrying = null;
          this._planksDelivered++;
          if (this._planksDelivered >= 2) {
            this._missionPhase = 1;
            this._bridgeProgress = 0;
            this._spawnDefendHorde();
            this.io.to(this.id).emit('missionUpdate', {
              phase: 1, label: 'Building bridge! Defend the site!',
              deliveryPos: FOREST_TRAIL_BRIDGE_SPOT,
            });
          } else {
            this.io.to(this.id).emit('missionUpdate', {
              phase: 0, label: `Plank delivered (${this._planksDelivered}/2) — find more!`,
              items: this._visibleForestTrailItems(), deliveryPos: FOREST_TRAIL_BRIDGE_SPOT,
            });
          }
        }
      }
    } else if (this._missionPhase === 1) {
      this._bridgeProgress = Math.min(1, this._bridgeProgress + DT / FOREST_TRAIL_BRIDGE_TIME);
      if (this._bridgeProgress >= 1) {
        this._missionPhase = 2;
        const key = this._missionItems.find(i => i.type === 'genkey');
        this.io.to(this.id).emit('missionUpdate', {
          phase: 2, label: 'Bridge fixed! Find the generator key.',
          items: [key], deliveryPos: FOREST_TRAIL_GENERATOR,
        });
      }
    } else if (this._missionPhase === 2) {
      const key = this._missionItems.find(i => i.type === 'genkey');
      if (!key || key.pickedUp) return;
      for (const p of players) {
        if (p.carrying) continue;
        const dx = p.x - key.x, dz = p.z - key.z;
        if (dx*dx + dz*dz < MISSION_PICKUP_RADIUS * MISSION_PICKUP_RADIUS) {
          const _key = key;
          p._missionPickupCallback = () => {
            _key.pickedUp = true; p.carrying = 'genkey';
            this._missionPhase = 3;
            this._spawnDefendHorde();
            this.io.to(this.id).emit('missionItemPickup', { itemId: _key.id, playerId: p.id });
            this.io.to(this.id).emit('missionUpdate', {
              phase: 3, label: 'Start the generator! Defend!',
              deliveryPos: FOREST_TRAIL_GENERATOR,
            });
          };
          break;
        }
      }
    } else if (this._missionPhase === 3) {
      const carrier = [...this.players.values()].find(p => p.carrying === 'genkey' && p.alive && !p.downed);
      if (!carrier) return;
      const dx = carrier.x - FOREST_TRAIL_GENERATOR.x, dz = carrier.z - FOREST_TRAIL_GENERATOR.z;
      if (dx*dx + dz*dz < MISSION_DELIVER_RADIUS * MISSION_DELIVER_RADIUS) {
        this._genProgress = Math.min(1, this._genProgress + DT / FOREST_TRAIL_GEN_TIME);
        this._genSpawnTimer -= DT;
        if (this._genSpawnTimer <= 0) {
          this._genSpawnTimer = FOREST_TRAIL_GEN_SPAWN_INTERVAL;
          this._spawnAtPoints(FOREST_TRAIL_GEN_SPAWN_POINTS, FOREST_TRAIL_GEN_SPAWN_COUNT);
          this.io.to(this.id).emit('defendHorde');
        }
        if (this._genProgress >= 1) {
          carrier.carrying = null;
          this._missionPhase = 4;
          this._safeRoomOpen = true;
          this._spawnAtPoints(FOREST_TRAIL_GEN_SPAWN_POINTS, FOREST_TRAIL_GEN_FINISH_HORDE);
          this.io.to(this.id).emit('missionUpdate', { phase: 4, label: 'Generator started! RUN to the safe house — do NOT fight!' });
          this.io.to(this.id).emit('safeRoomOpen');
          this.io.to(this.id).emit('defendHorde');
        }
      } else {
        this._genProgress = Math.max(0, this._genProgress - DT / FOREST_TRAIL_GEN_TIME * 0.5);
      }
    }
  }

  _updateForestTrailTriggers() {
    for (const trigger of this._ftTriggers) {
      if (trigger.triggered) continue;
      for (const p of this.players.values()) {
        if (!p.alive || p.downed || p.disconnected || p.inSafeZone) continue;
        const dx = p.x - trigger.x, dz = p.z - trigger.z;
        if (dx * dx + dz * dz < trigger.radius * trigger.radius) {
          trigger.triggered = true;
          this._spawnForestTrigger(trigger);
          break;
        }
      }
    }
  }

  _spawnForestTrigger(trigger) {
    const hm    = this.difficultyHpMult;
    const count = Math.round(trigger.count * this.difficultyCountMult);
    const comp  = WAVE_COMPOSITIONS[Math.min(trigger.compIndex, WAVE_COMPOSITIONS.length - 1)];
    for (let i = 0; i < count; i++) {
      const sp   = trigger.spawnPoints[Math.floor(Math.random() * trigger.spawnPoints.length)];
      const type = _weightedRandom(comp);
      const pos  = this._validEnemySpawn(sp, ENEMY_RADII[type] ?? 0.4);
      this.enemies.push({ id: this._nextEnemyId++, x: pos.x, z: pos.z, angle: 0, hp: Math.round(ENEMY_TYPES[type].hp * hm), dead: false, type, _atkCd: 0 });
    }
    console.log(`[Room ${this.id}] forest trigger (${trigger.x},${trigger.z}) → ${count} enemies`);
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
        carrying: p.carrying ?? null,
        inWater: p.inWater ?? false,
      })),
      enemies:    this.enemies.map(e => ({ id: e.id, x: e.x, z: e.z, angle: e.angle, hp: e.hp, type: e.type })),
      bullets:    this.bullets.map(b => ({ id: b.id, x: b.x, z: b.z, dx: b.dx, dz: b.dz })),
      acidBlobs:  this.acidBlobs.map(b => ({ id: b.id, x: b.x, z: b.z })),
      grenades:     this._grenadeProj.map(g => ({ id: g.id, x: g.x, z: g.z })),
      grenadePicks: this._grenadePicks.map(g => ({ id: g.id, x: g.x, z: g.z })),
      pickups:    [
        ...this._pickups.map(p => ({ id: p.id, weapon: p.weapon, x: p.x, z: p.z, active: p.respawnTimer <= 0 })),
        ...this._weaponDrops.map(d => ({ id: d.id, weapon: d.weapon, x: d.x, z: d.z, active: true })),
      ],
      healthpacks: this._healthpacks.map(h => ({ id: h.id, x: h.x, z: h.z, active: h.respawnTimer <= 0 })),
      acidPuddles: this._acidPuddles.map(a => ({ x: a.x, z: a.z, radius: ACID_PUDDLE_RADIUS, timer: a.timer })),
      tongues:    this._tongues.map(t => ({ id: t.id, x: t.x, z: t.z, attached: t.attached })),
      beacons:    this._beacons.map(b => ({ x: b.x, z: b.z, timer: b.timer })),
      perkPhase: this._perkPhase,
      mission: this.mapId === 'city' ? {
        phase:          this._missionPhase,
        fuelDelivered:  this._fuelDelivered,
        repairProgress: this._repairProgress,
        items:          this._visibleMissionItems(),
        deliveryPos:    CITY_MISSION_CAR,
      } : this.mapId === 'forest_trail' ? {
        phase:          this._missionPhase,
        bridgeProgress: this._bridgeProgress,
        genProgress:    this._genProgress,
        items:          this._visibleForestTrailItems(),
        deliveryPos:    this._ftDeliveryPos(),
      } : null,
    });
  }
}

// ── Module-level helpers ─────────────────────────────────────────────────────

function _downPlayer(p, room) {
  if (p.downed) return; // already downed
  if (p.carrying) room._dropCarrying(p);
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
  const movedX = !room._blocked(nx, entity.z, r);
  const movedZ = !room._blocked(entity.x, nz, r);
  if (movedX) entity.x = nx;
  if (movedZ) entity.z = nz;
  if (!movedX && !movedZ) {
    const slide = room._circleSlide(entity.x, entity.z, sx, sz, r);
    if (slide) {
      const tx = Math.max(-MAP_HALF, Math.min(MAP_HALF, entity.x + slide.sx));
      const tz = Math.max(-MAP_HALF, Math.min(MAP_HALF, entity.z + slide.sz));
      if (!room._blocked(tx, entity.z, r)) entity.x = tx;
      if (!room._blocked(entity.x, tz, r)) entity.z = tz;
    }
  }
}

// Push entity away from any circle colliders it's overlapping or touching.
function _pushFromCircleColliders(entity, er, mapId) {
  const col = MAP_COLLIDERS[mapId];
  if (!col) return;
  for (const c of col.circles) {
    const dx = entity.x - c.x, dz = entity.z - c.z;
    const dist2 = dx*dx + dz*dz;
    const minD = er + c.r;
    if (dist2 < minD * minD && dist2 > 0) {
      const dist = Math.sqrt(dist2);
      const push = minD - dist;
      entity.x += (dx / dist) * push;
      entity.z += (dz / dist) * push;
    }
  }
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
