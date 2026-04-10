---
name: network-arch
description: Design and implement the multiplayer network architecture for Four Survivors using Socket.io + server-authoritative model.
---

Implement authoritative multiplayer for up to 4 players. Follow this architecture:

**Server (Node.js + Socket.io)**
- `server/index.js` — Express + Socket.io setup, room management (max 4 per room).
- `server/GameRoom.js` — Game loop at 20 Hz tick. Holds authoritative state: players[], enemies[], projectiles[].
- `server/systems/` — MovementSystem, CombatSystem, EnemyAISystem, SpawnSystem.
- Emit `gameState` snapshot every tick to all clients in room (delta compression optional v2).

**Client (Three.js + Socket.io-client)**
- `src/net/NetworkManager.js` — Connect, join/create room, send input, receive state.
- `src/net/Interpolator.js` — Buffer last 2 server snapshots, lerp entities between them.
- Client sends input packet every frame: `{ seq, dt, keys: {w,a,s,d}, mouseAngle, shoot }`.
- Server applies input, advances simulation, responds with authoritative state.

**Shared**
- `shared/constants.js` — TICK_RATE=20, MAX_PLAYERS=4, MAP_SIZE=50.
- `shared/EntitySchema.js` — Player schema, Enemy schema (id, x, z, hp, angle, type).

**Anti-cheat basics** — Server validates movement speed, ignores impossible positions.

Produce file list and confirm before writing any code.
