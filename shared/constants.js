// Shared between server (Node.js) and client (browser)

export const TICK_RATE          = 20;
export const MAX_PLAYERS        = 4;
export const PLAYER_SPEED       = 6.5;
export const PLAYER_MAX_HP      = 100;
export const MAP_HALF           = 24;
export const SAFE_ZONE_RADIUS   = 3.2;
export const SAFE_ZONE          = { x: 0, z: -20 };
export const WAVE_BASE          = 8;
export const WAVE_SCALE         = 5;
export const NEXT_WAVE_DELAY    = 5.0;
export const MAX_ENEMIES        = 60;

export const SPAWN_POINTS = [
  { x: -23, z:  0  }, { x:  23, z:  0  },
  { x:   0, z:  23 }, { x: -16, z:  20 },
  { x:  16, z:  20 }, { x: -20, z: -10 },
  { x:  20, z: -10 },
];

export const PLAYER_COLORS = [0x2266cc, 0xcc3322, 0x33aa44, 0xcc44aa];

// ── Weapons ───────────────────────────────────────────────────────────────────
export const WEAPONS = {
  pistol:  { ammoMax: 15, reloadTime: 1.2, fireRate: 0.28, damage: 30, speed: 22, range: 22, pellets: 1, spread: 0    },
  shotgun: { ammoMax:  6, reloadTime: 1.8, fireRate: 0.75, damage: 18, speed: 16, range: 10, pellets: 5, spread: 0.20 },
  rifle:   { ammoMax: 30, reloadTime: 2.5, fireRate: 0.09, damage: 22, speed: 28, range: 30, pellets: 1, spread: 0    },
};

export const WEAPON_PICKUPS = [
  { id: 'w0', weapon: 'shotgun', x: -8,  z: -8  },
  { id: 'w1', weapon: 'rifle',   x:  8,  z: -8  },
  { id: 'w2', weapon: 'shotgun', x: -10, z:  8  },
  { id: 'w3', weapon: 'rifle',   x:  10, z:  8  },
];
export const WEAPON_PICKUP_RADIUS = 1.3;
export const WEAPON_RESPAWN_TIME  = 25;

// ── Enemy types ───────────────────────────────────────────────────────────────
export const ENEMY_TYPES = {
  walker:  { speed: 2.8, hp: 100,  damage: 8,  atkRange: 1.1, atkCd: 0.9, scale: 1.0,  ranged: false },
  runner:  { speed: 6.5, hp: 50,   damage: 5,  atkRange: 1.0, atkCd: 0.6, scale: 0.75, ranged: false },
  spitter: { speed: 1.6, hp: 80,   damage: 0,  atkRange: 9.0, atkCd: 3.0, scale: 1.0,  ranged: true  },
  tank:    { speed: 1.4, hp: 380,  damage: 28, atkRange: 1.4, atkCd: 1.6, scale: 1.6,  ranged: false },
  boss:      { speed: 0.9, hp: 1200, damage: 40, atkRange: 1.8, atkCd: 2.2, scale: 1.0,  ranged: false },
  finalboss: { speed: 0.6, hp: 4000, damage: 55, atkRange: 2.2, atkCd: 1.4, scale: 1.0,  ranged: false },
};

// ── Boss ──────────────────────────────────────────────────────────────────────
export const BOSS_SLAM_CD     = 4.0;
export const BOSS_SLAM_RADIUS = 5.5;
export const BOSS_SLAM_DAMAGE = 35;

export const FINAL_BOSS_WAVE        = 20;
export const FINAL_BOSS_SLAM_CD     = 2.0;
export const FINAL_BOSS_SLAM_RADIUS = 7.5;
export const FINAL_BOSS_SLAM_DAMAGE = 50;

// ── Dash ──────────────────────────────────────────────────────────────────────
export const DASH_CD         = 1.5;   // cooldown in seconds
export const DASH_DISTANCE   = 4.5;   // world units per dash
export const DASH_IFRAME     = 0.22;  // invincibility window (seconds)

// ── Grenades ──────────────────────────────────────────────────────────────────
export const GRENADE_MAX    = 2;
export const GRENADE_DAMAGE = 80;
export const GRENADE_RADIUS = 4.2;
export const GRENADE_FUSE   = 2.2;   // seconds until explosion
export const GRENADE_SPEED  = 10;    // travel speed (u/s)

// ── Reconnect ────────────────────────────────────────────────────────────────
export const RECONNECT_TIMEOUT = 30; // seconds to hold a disconnected player slot

// ── Knocked down / revive ─────────────────────────────────────────────────────
export const DOWNED_HP_DRAIN = 4;    // HP/sec drain while downed
export const DOWNED_MAX_HP   = 50;   // HP pool when going downed
export const REVIVE_RANGE    = 2.0;  // world units — how close reviver must be
export const REVIVE_TIME     = 3.0;  // seconds to complete a revive

// ── Tank charge ───────────────────────────────────────────────────────────────
export const TANK_CHARGE_CD       = 7.0;  // seconds between charges
export const TANK_CHARGE_SPEED    = 14;   // units/s during charge
export const TANK_CHARGE_DURATION = 0.65; // charge lasts this long
export const TANK_CHARGE_DAMAGE   = 40;

// ── Acid puddle (spitter on-death) ───────────────────────────────────────────
export const ACID_PUDDLE_DURATION = 6.0;  // seconds before it disappears
export const ACID_PUDDLE_RADIUS   = 1.6;  // world units
export const ACID_PUDDLE_DRAIN    = 6;    // HP/sec to players standing in it

// ── Perks ─────────────────────────────────────────────────────────────────────
export const PERK_WAVE_INTERVAL = 5;   // offer perks every N waves
export const PERK_SELECT_TIME   = 25;  // seconds before auto-pick
export const PERKS = {
  hp_boost:      { name: '+25 Max HP',    desc: 'Max HP +25, instantly healed' },
  fast_reload:   { name: 'Fast Reload',   desc: 'Reload 40% faster' },
  extra_grenade: { name: 'More Grenades', desc: '+2 max grenades' },
  speed_boost:   { name: 'Speed Boost',   desc: '+15% movement speed' },
  iron_skin:     { name: 'Iron Skin',     desc: 'Take 20% less damage' },
  hunter:        { name: 'Hunter',        desc: '+20% weapon damage' },
  quick_dash:    { name: 'Quick Dash',    desc: 'Dash cooldown -0.5s' },
};

// ── Character appearance ──────────────────────────────────────────────────────
export const SKIN_COLORS   = [0xf5c59a, 0xe0ac69, 0xc68642, 0x8d5524];
export const OUTFIT_COLORS = [0x2266cc, 0xcc3322, 0x33aa44, 0xcc44aa, 0x884422, 0x226644, 0x444466, 0x888822];
export const HAT_TYPES     = ['cap', 'helmet', 'beanie', 'none'];
export const DEFAULT_APPEARANCE = { skin: 0, outfit: 0, hat: 'cap' };

// Wave compositions — weighted probability per type
export const WAVE_COMPOSITIONS = [
  { walker: 10 },
  { walker: 8,  runner: 2 },
  { walker: 6,  runner: 4 },
  { walker: 5,  runner: 4, spitter: 1 },
  { walker: 4,  runner: 4, spitter: 2 },
  { walker: 3,  runner: 4, spitter: 2, tank: 1 },
  { walker: 2,  runner: 5, spitter: 2, tank: 1 },
];

export const ACID_SPEED  = 7;
export const ACID_RANGE  = 11;
export const ACID_DAMAGE = 20;

// ── Legacy aliases (keep imports working) ─────────────────────────────────────
export const FIRE_RATE          = 0.28;
export const AMMO_MAX           = 15;
export const RELOAD_TIME        = 1.2;
export const BULLET_SPEED       = 22;
export const BULLET_RANGE       = 22;
export const BULLET_DAMAGE      = 30;
export const ENEMY_SPEED        = 2.8;
export const ENEMY_HP           = 100;
export const ENEMY_DAMAGE       = 8;
export const ENEMY_ATTACK_RANGE = 1.1;
export const ENEMY_ATTACK_CD    = 0.9;

export const MAPS = ['city', 'forest', 'industrial'];

// ── Safe room ─────────────────────────────────────────────────────────────────
export const WAVE_SAFE_DELAY = 10;   // seconds after wave start before safe room opens

// ── Health packs ──────────────────────────────────────────────────────────────
export const HEALTHPACK_HEAL            = 40;
export const HEALTHPACK_PICKUP_RADIUS   = 1.3;
export const HEALTHPACK_RESPAWN_TIME    = 20;
export const PLAYER_MAX_HEALTHPACKS     = 3;

export const HEALTHPACK_POSITIONS = [
  { id: 'hp0', x:  5,  z:  5  },
  { id: 'hp1', x: -5,  z:  5  },
  { id: 'hp2', x:  5,  z: -5  },
  { id: 'hp3', x: -5,  z: -5  },
  { id: 'hp4', x:  0,  z:  9  },
  { id: 'hp5', x:  9,  z:  0  },
  { id: 'hp6', x: -9,  z:  0  },
];
