---
name: enemy-ai
description: Implement enemy AI systems for Four Survivors — horde walkers, specials, pathfinding on navgrid.
---

Implement server-side enemy AI in `server/systems/EnemyAISystem.js`:

**Common Walker (horde)**
- State machine: IDLE → CHASE → ATTACK → DEAD.
- CHASE: Move toward nearest player at speed 3 u/s. Use navgrid A* or simple steering if no walls.
- ATTACK: Within 1.2u of player → deal 10 dmg/sec, play hit event.
- Group behavior: walkers within 5u of each other gain +10% speed (horde momentum).

**Special — Tank**
- HP: 500, speed: 2.5 u/s, melee damage: 40/hit, cooldown 1.5s.
- Charges at target player if > 8u away (speed ×2.5 for 2s, then cooldown 5s).
- Knockback on hit: push player 3u in hit direction.

**Special — Screamer**
- HP: 80, speed: 4 u/s. Does not attack directly.
- On sight of player: emit `scream` event after 1.5s channel → spawn 5 walkers at nearest spawn point.
- Priority target for players (screamer suppression mechanic).

**Special — Spitter**
- HP: 120, speed: 2 u/s. Maintains 8u distance from players.
- Fires acid projectile every 3s: travels 12 u/s, creates acid puddle (3u radius, 5 dmg/s for 8s) on impact.

**Spawn System**
- Wave-based: wave N spawns 8 + (N×4) walkers + 1 special per 3 waves.
- Respects spawn zone positions from map definition.
- Max concurrent enemies: 40 (despawn oldest if exceeded).

**Navgrid Pathfinding**
- Load `src/maps/MapXX_navgrid.json`. Use A* with grid resolution.
- Recalculate path every 0.5s per enemy (not every tick).

Confirm enemy types to implement before writing code.
