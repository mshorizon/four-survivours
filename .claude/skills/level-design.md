---
name: level-design
description: Generate a low-poly top-down level for Four Survivors using Three.js geometry — no external assets required.
---

Create a complete map using only Three.js primitives (BoxGeometry, CylinderGeometry, PlaneGeometry). No GLTF imports in early maps.

**Map Structure:**
- `src/maps/Map01_City.js` — export a `buildMap(scene)` function.
- Ground: 50×50 grey plane.
- Buildings: 8–12 BoxGeometry blocks of varying height (2–6 units), flat dark-grey material.
- Streets: lighter grey plane sections between buildings.
- Safe house: green-tinted box at one end, trigger zone (invisible BoxGeometry collider).
- Spawn zones: 4 enemy spawn points at map edges (mark with red helper spheres in dev mode).
- Navmesh hint: define walkable areas as a JSON grid `src/maps/Map01_navgrid.json` (0=wall, 1=walkable, 10×10 resolution over 50-unit map).

**Lighting:**
- AmbientLight #888888 intensity 0.4.
- DirectionalLight #ffffff intensity 0.8, position (10, 20, 10), castShadow: true.
- FogExp2: color #cccccc, density 0.015.

**Materials:** All MeshLambertMaterial (flat shading), no textures. Color palette: ground #8a8a7a, buildings #555566, safe house #446644.

Confirm map name and theme before generating.
