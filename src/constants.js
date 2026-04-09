// ── Player ──────────────────────────────
export const PLAYER_SPEED       = 6.5;
export const PLAYER_MAX_HP      = 100;

// ── Weapon ──────────────────────────────
export const BULLET_SPEED       = 22;
export const BULLET_RANGE       = 22;
export const FIRE_RATE          = 0.12;   // seconds between shots
export const AMMO_MAX           = 30;
export const RELOAD_TIME        = 2.0;    // seconds

// ── Enemy ────────────────────────────────
export const ENEMY_SPEED        = 2.8;
export const ENEMY_HP           = 3;
export const ENEMY_DAMAGE       = 8;      // damage per attack
export const ENEMY_ATTACK_RANGE = 1.1;
export const ENEMY_ATTACK_CD    = 0.9;   // cooldown seconds

// ── Waves ────────────────────────────────
export const WAVE_BASE_COUNT    = 8;
export const WAVE_SCALE         = 5;
export const MAX_ENEMIES        = 50;
export const NEXT_WAVE_DELAY    = 5.0;   // seconds after wave clear

// ── Map ──────────────────────────────────
export const MAP_HALF           = 24;
export const SAFE_ZONE_RADIUS   = 3.2;
