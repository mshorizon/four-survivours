# TODO

## Map Editor Tool

A standalone browser-based developer tool (`/editor` route or separate HTML page) for visually editing maps and their missions. Output is copy-pasteable JS code for `src/maps/*.js`, `shared/colliders.js`, and server mission data.

---

### Phase 1 — Scaffold & Viewport ✅

- [x] Create `editor/index.html` + `editor/main.js` (Vite entry, separate from game)
- [x] Add `/editor` route — available at `http://localhost:5173/editor/` during dev (Vite serves it)
- [x] Set up Canvas 2D top-down orthographic view (matches game perspective)
- [x] Render grid overlay (1-unit cells)
- [x] Pan with middle-mouse drag; zoom with scroll wheel
- [x] Show world-space coordinates on mouse hover (bottom status bar)
- [x] Load existing map for editing: dropdown to pick `city | forest | forest_trail | industrial`

---

### Phase 2 — Collider Editing ✅

- [x] Visualize existing `MAP_COLLIDERS` boxes and circles on load (semi-transparent overlays)
- [x] Tool: **Add box collider** — click-drag to define AABB, snaps to 0.5-unit grid
- [x] Tool: **Add circle collider** — click center, drag to set radius
- [x] Select / move existing colliders (drag)
- [x] Delete selected collider (Delete key or ✕ in list)
- [x] Display `{ x, z, hw, hd }` / `{ x, z, r }` values in sidebar for selected collider
- [x] Manual numeric input in sidebar to set exact values
- [x] **Export**: generate `MAP_COLLIDERS[mapId]` JS snippet → copy to clipboard

---

### Phase 3 — Visual Geometry Preview ✅

- [x] Run map build function (`buildCity` etc.) in an offscreen Three.js renderer, blit to 2D canvas as background layer
- [x] Toggle visibility via Layers tab "Map preview" checkbox
- [x] Load/refresh button in View tab
- [ ] Highlight geometry that has no matching collider (diff check)

---

### Phase 4 — Spawn & Pickup Placement ✅

- [x] Visualize `SPAWN_POINTS` as colored icons
- [x] Visualize `WEAPON_PICKUPS_BY_MAP[mapId]` — show weapon type label + icon
- [x] Add / move / delete weapon pickups; set weapon type via dropdown
- [x] Visualize `HEALTHPACK_POSITIONS_BY_MAP[mapId]`
- [x] Add / move / delete healthpack positions
- [x] **Export**: generate updated `WEAPON_PICKUPS_BY_MAP` and `HEALTHPACK_POSITIONS_BY_MAP` entries → copy to clipboard
- [ ] Drag spawn points to new positions; export updated array

---

### Phase 5 — Safe Zone & Map Boundaries ✅

- [x] Visualize `SAFE_ZONE` position + `SAFE_ZONE_RADIUS` circle
- [x] Drag safe zone to reposition via Missions tab inputs
- [x] Visualize `MAP_HALF` boundary as a square outline
- [ ] Drag safe zone position directly on canvas
- [ ] **Export**: updated constants snippet

---

### Phase 6 — Mission Editor ✅ (partial)

- [x] Mission item placement for city and forest_trail maps (draggable icons on canvas)
- [x] Mission items list in sidebar; click to select
- [x] **Export**: generate mission positions snippet → copy to clipboard
- [ ] Phase labels editing (text inputs per phase)
- [ ] Generic phase builder (add/remove phases, trigger types)
- [ ] Full server code generation for `_initXxxMissions()` / `_updateXxxMissions()`

---

### Phase 7 — Flow Field Debug View ✅

- [x] "Compute flow field" button — BFS toward configurable target (default: safe zone)
- [x] Arrows per cell showing direction; color-coded by distance (green=near, red=far)
- [x] Blocked cells overlaid in red
- [x] Alt+click on canvas to set custom flow field target
- [x] Toggle via "Flow field" layer checkbox

---

### Phase 8 — Save / Load ✅

- [x] Auto-save to `localStorage` on every state change
- [x] Restore from `localStorage` on page load
- [x] Export all maps as single JSON file (Download button)
- [x] Import JSON to restore state
- [x] "Generate all snippets" — colliders, pickups, healthpacks, missions, safe zone, spawns

---

### Nice to Have ✅ (partial)

- [x] Undo / redo (Ctrl+Z / Ctrl+Y, also buttons in I/O tab)
- [x] Snap-to-grid toggle (default on, configurable grid size)
- [ ] Copy-paste selected collider/item
- [ ] Multi-select (shift-click or rubber-band drag)
- [ ] Lock layer
