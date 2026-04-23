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
  pistol:  { ammoMax: 15, reloadTime: 1.2, fireRate: 0.28, damage: 30,  speed: 22, range: 22, pellets: 1, spread: 0    },
  shotgun: { ammoMax:  6, reloadTime: 1.8, fireRate: 0.75, damage: 18,  speed: 16, range: 10, pellets: 5, spread: 0.20 },
  rifle:   { ammoMax: 30, reloadTime: 2.5, fireRate: 0.09, damage: 22,  speed: 28, range: 30, pellets: 1, spread: 0    },
  sniper:  { ammoMax:  5, reloadTime: 3.2, fireRate: 1.6,  damage: 150, speed: 40, range: 50, pellets: 1, spread: 0    },
};

export const WEAPON_PICKUPS = [];
export const WEAPON_PICKUP_RADIUS = 1.3;
export const WEAPON_RESPAWN_TIME  = 25;

// Which weapon each special drops on death (guaranteed drop, no chance roll)
export const SPECIAL_WEAPON_DROPS = {
  smoker: 'rifle',
  spitter: 'shotgun',
  jumper:  'sniper',
  tank:    'shotgun',
};

// ── Enemy types ───────────────────────────────────────────────────────────────
export const ENEMY_TYPES = {
  walker:    { speed: 2.8, hp: 100,  damage: 8,  atkRange: 1.1, atkCd: 0.9, scale: 1.0,  ranged: false },
  runner:    { speed: 6.5, hp: 50,   damage: 5,  atkRange: 1.0, atkCd: 0.6, scale: 0.75, ranged: false },
  spitter:   { speed: 1.6, hp: 80,   damage: 0,  atkRange: 9.0, atkCd: 1.5, scale: 1.0,  ranged: true  },
  tank:      { speed: 1.4, hp: 380,  damage: 28, atkRange: 1.4, atkCd: 1.6, scale: 1.6,  ranged: false },
  jumper:    { speed: 5.0, hp: 70,   damage: 10, atkRange: 1.0, atkCd: 0.8, scale: 0.9,  ranged: false, isJumper: true },
  smoker:    { speed: 1.2, hp: 90,   damage: 0,  atkRange: 14,  atkCd: 6.0, scale: 1.0,  ranged: false, isSmoker: true },
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
export const DASH_CD         = 1.5;
export const DASH_DISTANCE   = 4.5;
export const DASH_IFRAME     = 0.22;

// ── Grenades ──────────────────────────────────────────────────────────────────
export const GRENADE_MAX         = 2;
export const BEACON_MAX          = 1;
export const GRENADE_STARTING    = 0;
export const BEACON_STARTING     = 0;
export const GRENADE_DAMAGE        = 80;
export const GRENADE_RADIUS        = 4.2;
export const GRENADE_FUSE          = 2.2;
export const GRENADE_SPEED         = 10;
export const GRENADE_THROW_RANGE   = 16;
export const GRENADE_LAND_FUSE     = 0.8;
export const GRENADE_DROP_CHANCE   = 0.15;
export const GRENADE_PICKUP_RADIUS = 1.2;

// ── Beacon grenade ────────────────────────────────────────────────────────────
export const BEACON_DURATION       = 4.0;
export const BEACON_ATTRACT_RADIUS = 22;

// ── Reconnect ────────────────────────────────────────────────────────────────
export const RECONNECT_TIMEOUT       = 30;
export const LOBBY_RECONNECT_TIMEOUT = 12;

// ── Knocked down / revive ─────────────────────────────────────────────────────
export const DOWNED_HP_DRAIN = 4;
export const DOWNED_MAX_HP   = 50;
export const REVIVE_RANGE    = 2.0;
export const REVIVE_TIME     = 3.0;

// ── Tank charge ───────────────────────────────────────────────────────────────
export const TANK_CHARGE_CD       = 7.0;
export const TANK_CHARGE_SPEED    = 14;
export const TANK_CHARGE_DURATION = 0.65;
export const TANK_CHARGE_DAMAGE   = 40;

// ── Acid puddle ───────────────────────────────────────────────────────────────
export const ACID_PUDDLE_DURATION = 6.0;
export const ACID_PUDDLE_RADIUS   = 4.8;
export const ACID_PUDDLE_DRAIN    = 6;

// ── Jumper (pins player) ──────────────────────────────────────────────────────
export const JUMPER_PIN_DAMAGE   = 4;
export const JUMPER_RESCUE_RANGE = 2.0;

// ── Smoker tongue ─────────────────────────────────────────────────────────────
export const TONGUE_SPEED      = 7;
export const TONGUE_RANGE      = 14;
export const TONGUE_HP         = 40;
export const TONGUE_PULL_SPEED   = 1.8;
export const TONGUE_REACH_DAMAGE = 8;

// ── Enemy drops ───────────────────────────────────────────────────────────────
export const DROP_HP_CHANCE        = 0.12;
export const DROP_EXPLOSIVE_CHANCE = 0.07;
export const DROP_BEACON_CHANCE    = 0.04;
export const DROP_WEAPON_CHANCE    = 0.08;
export const DROP_LIFETIME         = 15;

// ── Spawn ghost phase ─────────────────────────────────────────────────────────
export const SPAWN_GHOST_TIME = 3.0;

// ── Perks ─────────────────────────────────────────────────────────────────────
export const PERK_WAVE_INTERVAL = 5;
export const PERK_SELECT_TIME   = 25;
export const PERKS = {
  hp_boost:      { name: '+25 Max HP',    desc: 'Max HP +25, instantly healed' },
  fast_reload:   { name: 'Fast Reload',   desc: 'Reload 40% faster' },
  extra_grenade: { name: 'More Grenades', desc: '+1 explosive grenade capacity' },
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

// Special infected — guaranteed spawns: wave N spawns N specials (capped)
export const SPECIAL_TYPES     = ['tank', 'spitter', 'jumper', 'smoker'];
export const MAX_SPECIALS_PER_WAVE = 8;

// Wave compositions — weighted probability per type
export const WAVE_COMPOSITIONS = [
  { walker: 10 },
  { walker: 8,  runner: 2 },
  { walker: 6,  runner: 4 },
  { walker: 5,  runner: 3, jumper: 2 },
  { walker: 4,  runner: 4, jumper: 1, spitter: 1 },
  { walker: 3,  runner: 4, jumper: 2, spitter: 1, tank: 1 },
  { walker: 2,  runner: 3, jumper: 2, spitter: 2, smoker: 1, tank: 1 },
  { walker: 2,  runner: 3, jumper: 2, spitter: 2, smoker: 2, tank: 1 },
];

export const ACID_SPEED  = 7;
export const ACID_RANGE  = 11;
export const ACID_DAMAGE = 20;

// ── Legacy aliases ─────────────────────────────────────────────────────────────
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
export const WAVE_SAFE_DELAY = 10;

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

// ── City missions ─────────────────────────────────────────────────────────────
export const CITY_FUEL_POSITIONS    = [
  { id: 'fuel0', x:  8,  z:  14 },
  { id: 'fuel1', x: -12, z: -10 },
];
export const CITY_REPAIR_KIT_POS    = { id: 'rkit', x: 0, z: 13 };
export const CITY_MISSION_CAR       = { x: 8.5, z: 6.5 };
export const MISSION_PICKUP_RADIUS  = 1.8;
export const MISSION_DELIVER_RADIUS = 2.5;
export const MISSION_REPAIR_TIME    = 8.0;
export const MISSION_DEFEND_COUNT   = 20;
