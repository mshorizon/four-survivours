# Four Survivors — Claude Code Context

## What is this project?
A **low-poly, 3D, top-down view, browser-based multiplayer co-op shooter** inspired by Left 4 Dead 2.
- 4 players survive zombie/infected hordes and reach the safe house.
- Entirely browser-based — no install required.
- Low-poly flat-shaded aesthetic (no textures).

## Tech Stack
| Layer | Technology |
|---|---|
| 3D Renderer | Three.js |
| Bundler | Vite |
| Multiplayer | Socket.io v4 |
| Server | Node.js + Express |
| Physics | Cannon-es (prototype) → Rapier.js (production) |
| Language | JavaScript (no TypeScript for now) |
| Hosting target | Single VPS / Railway / Render |

## Architecture
- **Server-authoritative**: all game state lives on the server, clients render only.
- **Tick rate**: 20 Hz server loop.
- **Client**: receives snapshots, interpolates between last two states.
- **Input**: client sends `{ seq, keys, mouseAngle, shoot }` each frame.

## Available Skills (slash commands)
| Command | What it does |
|---|---|
| `/game-design` | Generate / update the full GDD |
| `/prototype` | Scaffold minimal playable single-player prototype |
| `/network-arch` | Implement Socket.io multiplayer architecture |
| `/level-design` | Generate a Three.js primitive map |
| `/enemy-ai` | Implement server-side enemy AI + A* pathfinding |
| `/perf-check` | Profile draw calls, tick time, payload size |
| `/code-review` | Security + multiplayer + perf review |

## Development Phases
1. **Prototype** — Single player, movement + shooting, one enemy type, one map.
2. **Multiplayer** — Add Socket.io, room system, server loop, client interpolation.
3. **Content** — 3 maps, 4 enemy types, weapons, HUD.
4. **Polish** — Particle effects, sounds (Web Audio API), lobby UI.
5. **Deploy** — Docker container, Nginx, domain.

## Coding Rules
- No magic numbers — use `shared/constants.js`.
- No game logic on the client.
- No new Three.js objects inside the render loop.
- Keep files < 200 lines; split into systems.
- Ask before writing multiple files at once.
