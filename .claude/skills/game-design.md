---
name: game-design
description: Generate or update the Game Design Document (GDD) for Four Survivors — a low-poly 3D top-view browser multiplayer co-op shooter inspired by Left 4 Dead 2.
---

Review the current state of the project (read existing GDD if present, scan src/ for implemented systems) and produce or update a structured GDD covering:

1. **Core Loop** — Survive waves/hordes, reach the safe house. 4 players co-op. Browser session-based.
2. **Player Systems** — Movement (WASD + mouse aim), shooting, health/revive, inventory (1 primary, 1 secondary, grenades).
3. **Enemy Types** — Common horde (walker), Special infected variants (tank, screamer, spitter). Define HP, speed, damage, spawn rules.
4. **Progression** — Campaign structure (3–5 maps), difficulty scaling, loot drops.
5. **Multiplayer** — Session lobby, host-joins, server-authoritative tick (20 Hz), client-side prediction.
6. **Art Direction** — Low-poly aesthetic, flat shading (no textures), palette per map (urban grey, forest green, industrial orange). Top-down camera at ~45° angle, slight perspective.
7. **Tech Stack** — Three.js renderer, Socket.io networking, Node.js server, Rapier.js physics (or Cannon.js), Vite bundler.
8. **Win/Lose Conditions** — All players dead = restart; reach safe zone = map complete.

Output as `design/GDD.md`. Ask for confirmation before writing.
