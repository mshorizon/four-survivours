import * as THREE from 'three';

export function buildForest(scene) {
  const fireLights = [];

  // Ground — dark soil path
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x2a3a1a });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // Dirt paths (crossroads)
  const pathMat = new THREE.MeshLambertMaterial({ color: 0x6b4f30 });
  [[0,0,6,50],[0,0,50,6]].forEach(([x,z,w,d]) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w,d), pathMat);
    p.rotation.x = -Math.PI/2; p.position.set(x,0.01,z); p.receiveShadow = true; scene.add(p);
  });

  // Dense tree clusters
  const treeDef = [
    [-15,-15],[-12,-18],[-18,-12],[-16,-10],[-10,-16],
    [ 15,-15],[ 12,-18],[ 18,-12],[ 16,-10],[ 10,-16],
    [-15, 15],[-12, 18],[-18, 12],[-16, 10],[-10, 16],
    [ 15, 15],[ 12, 18],[ 18, 12],[ 16, 10],[ 10, 16],
    [-21,  0],[-21,  5],[-21, -5],
    [ 21,  0],[ 21,  5],[ 21, -5],
    [  0, 21],[  5, 21],[ -5, 21],
    [ -4,-12],[  4,-12],[-12,  4],[ 12,  4],
  ];
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3a1a });
  const leafMats = [
    new THREE.MeshLambertMaterial({ color: 0x1a4a12 }),
    new THREE.MeshLambertMaterial({ color: 0x22551a }),
    new THREE.MeshLambertMaterial({ color: 0x183e10 }),
  ];
  treeDef.forEach(([x,z]) => {
    const h = 3 + Math.random() * 2.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.28,h,7), trunkMat);
    trunk.position.set(x, h/2, z); trunk.castShadow = true; trunk.receiveShadow = true; scene.add(trunk);
    const lMat = leafMats[Math.floor(Math.random()*leafMats.length)];
    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4+Math.random()*0.6,0), lMat);
    crown.position.set(x, h+0.6, z); crown.castShadow = true; crown.receiveShadow = true; scene.add(crown);
  });

  // Fallen logs
  const logMat = new THREE.MeshLambertMaterial({ color: 0x6b4020 });
  [{ x: 6, z: -5, r: 0.4 }, { x: -6, z: 4, r: -0.3 }, { x: 9, z: 10, r: 1.1 }].forEach(({x,z,r}) => {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.25,3,8), logMat);
    log.position.set(x,0.22,z); log.rotation.z = Math.PI/2; log.rotation.y = r;
    log.castShadow = true; log.receiveShadow = true; scene.add(log);
  });

  // Boulders
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x666660 });
  [[-7,7],[8,-8],[-10,0],[7,13]].forEach(([x,z]) => {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8+Math.random()*0.4,0), rockMat);
    rock.position.set(x,0.5,z); rock.castShadow = true; rock.receiveShadow = true; scene.add(rock);
  });

  // Campfire
  const campfire = new THREE.PointLight(0xff7700, 3.5, 8);
  campfire.position.set(3, 1, 3); scene.add(campfire); fireLights.push(campfire);
  const emberMat = new THREE.MeshLambertMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 1 });
  const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.3,0.3,6), emberMat);
  ember.position.set(3,0.15,3); scene.add(ember);

  // Lamp posts along the two dirt paths
  const lampPoleM = new THREE.MeshLambertMaterial({ color: 0x7a4820 });
  const lampHeadM = new THREE.MeshLambertMaterial({ color: 0xffcc66, emissive: 0xffaa00, emissiveIntensity: 0.6 });
  [
    [-14, 0], [-7, 0], [7, 0], [14, 0],   // x-axis path
    [0, -14], [0, -7], [0,  7], [0,  14], // z-axis path
  ].forEach(([x, z]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.13, 3.5, 7), lampPoleM);
    pole.position.set(x, 1.75, z); pole.castShadow = true; scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.20, 0.35), lampHeadM);
    head.position.set(x, 3.6, z); scene.add(head);
    const sl = new THREE.SpotLight(0xffcc88, 60, 12, Math.PI / 3.5, 0.5, 2);
    sl.castShadow = true;
    sl.shadow.mapSize.set(512, 512);
    sl.shadow.camera.near = 0.5;
    sl.shadow.camera.far  = 14;
    sl.position.set(x, 3.5, z);
    sl.target.position.set(x, 0, z);
    scene.add(sl); scene.add(sl.target);
  });

  // Cabin safe house
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a3a18 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(5,3.2,4), wallMat);
  cabin.position.set(0,1.6,-20); cabin.castShadow = true; scene.add(cabin);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.1,3.6,1.8,4), roofMat);
  roof.position.set(0,3.8,-20); roof.rotation.y = Math.PI/4; scene.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1,2.0,0.12), new THREE.MeshLambertMaterial({ color: 0x3a1a08 }));
  door.position.set(0,1.0,-18.06); scene.add(door);
  const sl = new THREE.PointLight(0x44ff88,1.5,9); sl.position.set(0,2.5,-19); scene.add(sl);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.8,0.4,0.1), new THREE.MeshLambertMaterial({ color: 0x22ee55, emissive: 0x22ee55, emissiveIntensity: 0.6 }));
  sign.position.set(0,3.4,-18.0); scene.add(sign);

  return { fireLights, fogColor: 0x1a2a12, fogNear: 20, fogFar: 60 };
}
