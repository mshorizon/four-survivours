---
name: prototype
description: Scaffold a minimal playable prototype for Four Survivors — single player, one map, basic movement + shooting, no networking.
---

Build the fastest path to something playable in the browser. Steps:

1. **Scaffold** — Create `package.json` (Vite + Three.js + Cannon-es), `index.html`, `src/main.js`.
2. **Scene** — Flat low-poly ground plane (50×50), ambient + directional light, fog. Camera locked top-down ~70° pitch.
3. **Player** — Capsule mesh, WASD movement, mouse-aim rotation on XZ plane, simple raycast shooting (red sphere projectile).
4. **Enemy** — Box mesh walker: spawns at map edge, chases player, dies in 3 hits.
5. **HUD** — HTML overlay: HP bar, ammo count, kill counter.
6. **Run** — Ensure `npm run dev` starts a working Vite dev server.

Keep each file under 200 lines. No networking, no auth, no build pipeline beyond Vite. Confirm file list before writing.
