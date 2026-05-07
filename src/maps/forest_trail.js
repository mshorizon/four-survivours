import * as THREE from 'three';

export function buildForestTrail(scene) {
  const fireLights = [];

  const soilMat  = new THREE.MeshLambertMaterial({ color: 0x1e2a10 });
  const pathMat  = new THREE.MeshLambertMaterial({ color: 0x5a3d1a });
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x1a4a6a, transparent: true, opacity: 0.82 });
  const plankMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a2e10 });
  const leafMats = [
    new THREE.MeshLambertMaterial({ color: 0x143a0c }),
    new THREE.MeshLambertMaterial({ color: 0x1a4a12 }),
    new THREE.MeshLambertMaterial({ color: 0x102e08 }),
    new THREE.MeshLambertMaterial({ color: 0x1c4a0e }),
  ];
  const bushMat  = new THREE.MeshLambertMaterial({ color: 0x183008 });
  const rockMat  = new THREE.MeshLambertMaterial({ color: 0x58584e });
  const logMat   = new THREE.MeshLambertMaterial({ color: 0x5a3010 });
  const poleMat  = new THREE.MeshLambertMaterial({ color: 0x2a1a08 });
  const lampMat  = new THREE.MeshLambertMaterial({ color: 0xffcc66, emissive: 0xffaa00, emissiveIntensity: 0.8 });
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x2a4a18 });

  // Ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(52, 52), soilMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // Winding dirt path — angled segments between waypoints
  // With Euler XYZ: rotation.z applied first, then rotation.x; formula gives correct alignment
  function pathSeg(x1, z1, x2, z2, w = 3) {
    const dx = x2 - x1, dz = z2 - z1;
    const L = Math.sqrt(dx * dx + dz * dz);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, L), pathMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.atan2(-dx, -dz);
    m.position.set((x1 + x2) / 2, 0.01, (z1 + z2) / 2);
    m.receiveShadow = true; scene.add(m);
  }
  const waypts = [[17,17],[13,11],[9,5],[8,0],[5,-4],[2,-8],[0,-12],[0,-20]];
  for (let i = 0; i < waypts.length - 1; i++) pathSeg(...waypts[i], ...waypts[i + 1]);
  pathSeg(2, -8, -15, -8, 2.5); // side trail to generator shack

  // River
  const river = new THREE.Mesh(new THREE.PlaneGeometry(52, 3.5), waterMat);
  river.rotation.x = -Math.PI / 2; river.position.set(0, 0.04, 2.25); scene.add(river);
  const bankMat = new THREE.MeshLambertMaterial({ color: 0x3a2408 });
  [0.55, 4.0].forEach(z => {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(52, 0.9), bankMat);
    b.rotation.x = -Math.PI / 2; b.position.set(0, 0.02, z); scene.add(b);
  });

  // Wooden bridge at x≈8 crossing river (z 0.4 → 4.6)
  for (let i = 0; i < 4; i++) {
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 4.4), plankMat);
    pl.position.set(7.1 + i * 0.65, 0.2, 2.5); pl.castShadow = true; scene.add(pl);
  }
  const railMat = new THREE.MeshLambertMaterial({ color: 0x5a3520 });
  [[7.0, 2.5], [9.2, 2.5]].forEach(([rx, rz]) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 4.6), railMat);
    r.position.set(rx, 0.55, rz); scene.add(r);
  });
  const postMat = new THREE.MeshLambertMaterial({ color: 0x3a2010 });
  [[7.0,1.2],[9.2,1.2],[7.0,3.8],[9.2,3.8]].forEach(([bx, bz]) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.4, 0.18), postMat);
    p.position.set(bx, 0.1, bz); scene.add(p);
  });

  // Trees — 61 positions, avoiding the main path corridor
  const treeDef = [
    [-5,22],[-10,20],[-15,18],[-20,15],[-22,10],[-22,5],[-22,0],[-18,12],[-12,22],[-8,18],
    [22,22],[22,15],[22,8],[20,3],[22,-3],[20,12],
    [2,22],[6,20],[10,22],
    [-3,6],[-8,5],[-14,6],[-18,4],[15,5],[16,6],[20,6],
    [-5,0],[-10,-2],[-15,-3],[-20,-5],[-22,-10],[-18,-15],[-15,-18],[-20,-20],[-22,-17],
    [12,-2],[15,-5],[18,-8],[20,-12],[18,-16],[16,-18],[12,-20],
    [-8,-7],[-12,-10],[-10,-14],[-8,-17],[8,-7],[10,-10],[8,-14],[6,-18],
    [-4,-6],[4,-6],[-4,-15],[4,-15],
    [-22,20],[22,-18],[-22,-22],[10,-22],[-5,-22],[5,-22],
  ];
  treeDef.forEach(([x, z]) => {
    const h = 3.5 + Math.random() * 3.0;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, h, 7), trunkMat);
    trunk.position.set(x, h / 2, z); trunk.castShadow = true; trunk.receiveShadow = true; scene.add(trunk);
    const lMat = leafMats[Math.floor(Math.random() * leafMats.length)];
    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3 + Math.random() * 0.8, 0), lMat);
    crown.position.set(x, h + 0.7, z); crown.castShadow = true; crown.receiveShadow = true; scene.add(crown);
  });

  // Bushes
  [
    [5,16],[11,13],[16,8],[-3,15],[-8,11],
    [-6,-3],[5,-2],[10,-6],[-12,-6],[3,-12],
    [-8,-14],[6,-14],[-3,-18],[7,-9],[-14,-14],[15,-10],
  ].forEach(([x, z]) => {
    const r = 0.45 + Math.random() * 0.45;
    const b = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), bushMat);
    b.position.set(x, r * 0.45, z); b.castShadow = true; b.receiveShadow = true; scene.add(b);
  });

  // Grass tufts (clusters of thin quads)
  [[15,14],[11,9],[7,3],[4,-2],[1,-6],[-2,-10],[12,15],[18,5],[-5,10],[-10,0],[16,-3],[-3,-5]].forEach(([x, z]) => {
    for (let i = 0; i < 4; i++) {
      const gx = x + (Math.random() - 0.5) * 1.6, gz = z + (Math.random() - 0.5) * 1.6;
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28 + Math.random() * 0.18, 0.08), grassMat);
      g.position.set(gx, 0.14, gz); scene.add(g);
    }
  });

  // Boulders
  [[-7,8],[3,10],[13,3],[-13,3],[11,-4],[-11,-4],[6,-11],[-9,-11],[2,-16]].forEach(([x, z]) => {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.5, 0), rockMat);
    rock.position.set(x, 0.4, z); rock.castShadow = true; rock.receiveShadow = true; scene.add(rock);
  });

  // Fallen logs
  [{x:11,z:7,r:0.3},{x:-4,z:9,r:-0.6},{x:15,z:-6,r:0.1},{x:-9,z:-7,r:1.2},{x:3,z:-13,r:0.5}].forEach(({x, z, r}) => {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.24, 3.5, 8), logMat);
    log.position.set(x, 0.2, z); log.rotation.z = Math.PI / 2; log.rotation.y = r;
    log.castShadow = true; log.receiveShadow = true; scene.add(log);
  });

  // Iron lanterns along main path + side trail
  [[15,17],[11,5],[4,-3],[2,-13],[-8,-9]].forEach(([x, z]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 3.0, 6), poleMat);
    pole.position.set(x, 1.5, z); pole.castShadow = true; scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), lampMat);
    head.position.set(x, 3.1, z); scene.add(head);
    const sl = new THREE.SpotLight(0xffcc55, 800, 80, Math.PI / 2.5, 0.5, 2);
    sl.castShadow = true;
    sl.shadow.mapSize.set(512, 512);
    sl.shadow.camera.near = 0.5;
    sl.shadow.camera.far  = 15;
    sl.position.set(x, 3.0, z); sl.target.position.set(x, 0, z);
    scene.add(sl); scene.add(sl.target);
  });

  // Start area — ruined ranger station at (17, 17)

  // Mid clearing — abandoned camp with firepit at (3, -6)
  const campFire = new THREE.PointLight(0xff7700, 3.5, 9);
  campFire.position.set(3, 1, -6); scene.add(campFire); fireLights.push(campFire);
  const emberMat = new THREE.MeshLambertMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 1 });
  const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 0.3, 6), emberMat);
  ember.position.set(3, 0.15, -6); scene.add(ember);
  const stumpMat = new THREE.MeshLambertMaterial({ color: 0x5a3510 });
  [[1,-7],[5,-5],[2,-5],[4,-7]].forEach(([sx, sz]) => {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.4, 7), stumpMat);
    s.position.set(sx, 0.2, sz); scene.add(s);
  });

  // Generator shack at (-15, -8)
  const shedMat = new THREE.MeshLambertMaterial({ color: 0x5a5040 });
  const shed = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 3), shedMat);
  shed.position.set(-15, 1.25, -8); shed.castShadow = true; shed.receiveShadow = true; scene.add(shed);
  const shedRoof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.2, 3.4), new THREE.MeshLambertMaterial({ color: 0x4a4030 }));
  shedRoof.position.set(-15, 2.6, -8); scene.add(shedRoof);
  const gen = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 1.2), new THREE.MeshLambertMaterial({ color: 0x444444 }));
  gen.position.set(-15, 0.35, -8); scene.add(gen);
  const genGlow = new THREE.PointLight(0x3388ff, 0.6, 6);
  genGlow.position.set(-15, 1.5, -8); scene.add(genGlow); fireLights.push(genGlow);

  // Safe house cabin at (0, -20)
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(5, 3.2, 4), wallMat);
  cabin.position.set(0, 1.6, -20); cabin.castShadow = true; cabin.receiveShadow = true; scene.add(cabin);
  const roofMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 3.6, 1.8, 4), new THREE.MeshLambertMaterial({ color: 0x5a3a18 }));
  roofMesh.position.set(0, 3.8, -20); roofMesh.rotation.y = Math.PI / 4; scene.add(roofMesh);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.0, 0.12), new THREE.MeshLambertMaterial({ color: 0x3a1a08 }));
  door.position.set(0, 1.0, -18.06); scene.add(door);
  const safeLight = new THREE.PointLight(0x44ff88, 1.8, 10);
  safeLight.position.set(0, 2.5, -19); scene.add(safeLight);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.4, 0.1), new THREE.MeshLambertMaterial({ color: 0x22ee55, emissive: 0x22ee55, emissiveIntensity: 0.6 }));
  sign.position.set(0, 3.4, -18.0); scene.add(sign);

  return { fireLights, fogColor: 0x0d1808, fogNear: 14, fogFar: 42 };
}
