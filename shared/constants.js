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
  walker:  { speed: 2.8, hp: 100, damage: 8,  atkRange: 1.1, atkCd: 0.9, scale: 1.0,  ranged: false },
  runner:  { speed: 6.5, hp: 50,  damage: 5,  atkRange: 1.0, atkCd: 0.6, scale: 0.75, ranged: false },
  spitter: { speed: 1.6, hp: 80,  damage: 0,  atkRange: 9.0, atkCd: 3.0, scale: 1.0,  ranged: true  },
  tank:    { speed: 1.4, hp: 380, damage: 28, atkRange: 1.4, atkCd: 1.6, scale: 1.6,  ranged: false },
};

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
