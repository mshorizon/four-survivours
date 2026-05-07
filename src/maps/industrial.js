import * as THREE from 'three';

export function buildIndustrial(scene) {
  const fireLights = [];

  // Concrete floor
  const concreteMat = new THREE.MeshLambertMaterial({ color: 0x5a5a5a });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(50,50), concreteMat);
  ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);

  // Yellow hazard stripes on ground
  const hazardMat = new THREE.MeshLambertMaterial({ color: 0xddaa00 });
  [[0,0,50,1.2],[0,0,1.2,50]].forEach(([x,z,w,d]) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w,d), hazardMat);
    s.rotation.x = -Math.PI/2; s.position.set(x,0.01,z); scene.add(s);
  });

  // Large warehouse buildings
  const wallMat  = new THREE.MeshLambertMaterial({ color: 0x888880 });
  const roofMat  = new THREE.MeshLambertMaterial({ color: 0x666660 });
  const metalMat = new THREE.MeshLambertMaterial({ color: 0x999990 });
  const winMat   = new THREE.MeshLambertMaterial({ color: 0x223344, emissive: 0x112233, emissiveIntensity: 0.3 });

  [
    { x:-14, z:-14, w:10, h:7,  d:10 },
    { x: 14, z:-14, w:10, h:9,  d:10 },
    { x:-14, z: 14, w:10, h:6,  d:10 },
    { x: 14, z: 14, w: 9, h:8,  d:10 },
    { x:-21, z:  0, w: 4, h:10, d: 8 }, // tall chimney tower
    { x: 21, z:  0, w: 5, h: 6, d: 8 },
  ].forEach(b => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w,b.h,b.d), wallMat);
    mesh.position.set(b.x,b.h/2,b.z); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
    const rMesh = new THREE.Mesh(new THREE.BoxGeometry(b.w+0.3,0.4,b.d+0.3), roofMat);
    rMesh.position.set(b.x,b.h+0.2,b.z); scene.add(rMesh);
    // industrial windows (high up)
    for (let wx=-b.w/2+1; wx<b.w/2-0.5; wx+=2.2) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.2,0.9,0.05), winMat);
      win.position.set(b.x+wx, b.h-1.2, b.z+b.d/2+0.01); scene.add(win);
    }
  });

  // Chimney with smoke light
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.5,12,8), metalMat);
  chimney.position.set(-21,10,0); chimney.castShadow = true; scene.add(chimney);
  const smokeLight = new THREE.PointLight(0xff4400,1.5,12);
  smokeLight.position.set(-21,16,0); scene.add(smokeLight); fireLights.push(smokeLight);

  // Shipping containers
  const containerColors = [0xcc3322, 0x2255cc, 0x228833, 0xaa6600, 0x887722];
  [
    { x: 4, z: -6, r: 0 }, { x: 7, z: -6, r: 0 }, { x: 4, z: 6, r: 0.1 },
    { x:-4, z:-6, r: 0 }, { x:-7, z: 5, r: 0.05}, { x: 4, z:-10, r: Math.PI/2 },
    { x:-5, z:-10, r: Math.PI/2 }, { x: 6, z: 10, r: 0 },
  ].forEach(({ x, z, r }, i) => {
    const col = containerColors[i % containerColors.length];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4,2.2,5.8), new THREE.MeshLambertMaterial({ color: col }));
    mesh.position.set(x,1.1,z); mesh.rotation.y = r; mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
    // container door lines
    const lineMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.04,2.0,0.04), lineMat);
    line.position.set(x,1.1,z+2.92); scene.add(line);
  });

  // Oil drums
  const drumMat = new THREE.MeshLambertMaterial({ color: 0x333322 });
  [[3,3],[3.8,3],[3,3.8],[-3,-3],[-3.8,-3]].forEach(([x,z]) => {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.28,0.7,8), drumMat);
    drum.position.set(x,0.35,z); scene.add(drum);
  });

  // Barrel fire
  const barrelFire = new THREE.PointLight(0xff5500,2.5,7);
  barrelFire.position.set(3,1.2,3); scene.add(barrelFire); fireLights.push(barrelFire);

  // Chain-link fence sections
  const fenceMat = new THREE.MeshLambertMaterial({ color: 0x999966, wireframe: true });
  [{ x:8,z:-18,w:6 },{ x:-8,z:-18,w:6 }].forEach(({ x,z,w }) => {
    const fence = new THREE.Mesh(new THREE.BoxGeometry(w,2.5,0.15), fenceMat);
    fence.position.set(x,1.25,z); scene.add(fence);
  });

  // Safe house — metal bunker
  const bunkerMat = new THREE.MeshLambertMaterial({ color: 0x445544 });
  const bunker = new THREE.Mesh(new THREE.BoxGeometry(6,3,5), bunkerMat);
  bunker.position.set(0,1.5,-20); bunker.castShadow = true; scene.add(bunker);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.4,2.2,0.2), new THREE.MeshLambertMaterial({ color: 0x223322 }));
  door.position.set(0,1.1,-17.5); scene.add(door);
  const sl = new THREE.PointLight(0x44ff88,1.5,9); sl.position.set(0,2.5,-19); scene.add(sl);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(3.5,0.4,0.1), new THREE.MeshLambertMaterial({ color: 0x22ee55, emissive: 0x22ee55, emissiveIntensity: 0.6 }));
  sign.position.set(0,3.2,-17.4); scene.add(sign);

  return { fireLights, fogColor: 0x222222, fogNear: 30, fogFar: 80 };
}
