---
name: perf-check
description: Profile and optimize Three.js rendering and server tick performance for Four Survivors.
---

Run a performance audit across client and server:

**Client (Three.js)**
1. Check draw call count — target < 50 per frame. Merge static geometry with BufferGeometryUtils.mergeGeometries() if > 100.
2. Check triangle count — target < 50k. Low-poly is intentional but verify no accidental high-poly meshes.
3. Verify shadow map resolution is 1024 (not 4096).
4. Check that enemy/projectile meshes use InstancedMesh if count > 20.
5. Confirm renderer uses `antialias: false` (low-poly aesthetic doesn't need it).
6. Add `renderer.info` log in dev mode: programs, geometries, textures.

**Server (Node.js)**
1. Measure tick execution time — warn if > 40ms (> 2× budget at 20 Hz).
2. Identify O(n²) loops in collision/AI (enemies vs players check should be < 4×100 = 400 ops max).
3. Check socket emit payload size — target < 2KB per gameState snapshot.
4. Recommend delta compression if payload > 5KB.

**Network**
1. Count events per second per client — should be ≤ 20 server→client, ≤ 60 client→server.
2. Flag any emit inside render loop (should be in input-collection only).

Output a markdown report listing: PASS/WARN/FAIL for each check, with specific file:line citations.
