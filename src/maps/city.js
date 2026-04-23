import * as THREE from 'three';

export function buildCity(scene) {
  const fireLights = [];
  const asphalt  = new THREE.MeshLambertMaterial({ color: 0x555550 });
  const sidewalk = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), asphalt);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);

  [[-14,-14],[14,-14],[-14,14],[14,14]].forEach(([x,z]) => {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(10, 0.15, 10), sidewalk);
    sw.position.set(x, 0.075, z); sw.receiveShadow = true; scene.add(sw);
  });

  const brickMat  = new THREE.MeshLambertMaterial({ color: 0xaa4433 });
  const brickMat2 = new THREE.MeshLambertMaterial({ color: 0x994422 });
  const greyMat   = new THREE.MeshLambertMaterial({ color: 0x7077aa });
  const greyMat2  = new THREE.MeshLambertMaterial({ color: 0x8888aa });
  const winMat    = new THREE.MeshLambertMaterial({ color: 0x111a22, emissive: 0x001122, emissiveIntensity: 0.4 });

  const buildings = [
    { x: -14, z: -14, w: 9, h: 6, d: 9, mat: brickMat  },
    { x:  14, z: -14, w: 8, h: 5, d: 8, mat: greyMat   },
    { x: -14, z:  14, w:10, h: 8, d: 9, mat: brickMat2 },
    { x:  14, z:  14, w: 9, h: 4, d: 9, mat: greyMat2  },
    { x: -20, z:   2, w: 5, h: 5, d: 7, mat: greyMat   },
    { x:  20, z:  -2, w: 5, h: 7, d: 7, mat: brickMat  },
    { x:   0, z: -21, w: 8, h: 4, d: 5, mat: greyMat   },
  ];
  buildings.forEach(b => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), b.mat);
    mesh.position.set(b.x, b.h/2, b.z); mesh.castShadow = true; scene.add(mesh);
    for (let wx = -b.w/2+0.9; wx < b.w/2-0.3; wx += 1.4)
      for (let wy = 0.5; wy < b.h-0.6; wy += 1.3) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.7,0.7,0.05), winMat);
        win.position.set(b.x+wx, b.h/2-b.h/2+wy+0.15, b.z+b.d/2+0.01); scene.add(win);
      }
  });

  const barrMat = new THREE.MeshLambertMaterial({ color: 0xaa8833 });
  [[ 3,-1.5],[-3,-1.5],[ 3, 2.0],[-3, 2.0]].forEach(([x,z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.9,0.3), barrMat);
    m.position.set(x,0.45,z); m.rotation.y=(Math.random()-0.5)*0.3; m.castShadow=true; scene.add(m);
  });

  _addCar(scene, -5.5, -7.5, 0.15, 0xd4aa00);
  _addCar(scene,  8.5,  6.5, Math.PI/2, 0xdddddd);
  _addCar(scene, -9.0,  5.0, -0.25, 0xaa2222);

  const fire1 = new THREE.PointLight(0xff6600, 40, 8);
  fire1.position.set(-9,1.8,5); scene.add(fire1); fireLights.push(fire1);

  _addSafeHouse(scene);

  const poleM = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const lampM = new THREE.MeshLambertMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.5 });
  [[-7,-7],[7,-7],[-7,7],[7,7]].forEach(([x,z]) => {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.18,4,0.18), poleM);
    pole.position.set(x,2,z); scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4,0.2,0.4), lampM);
    head.position.set(x,4.1,z); scene.add(head);
    const pt = new THREE.SpotLight(0xffeecc, 80, 14, Math.PI / 3.5, 0.45, 2);
    pt.position.set(x, 4, z);
    pt.target.position.set(x, 0, z);
    scene.add(pt); scene.add(pt.target);
  });

  return { fireLights, fogColor: 0x3a3a4e, fogNear: 35, fogFar: 90 };
}

function _addCar(scene, x, z, ry, color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7,0.65,3.5), new THREE.MeshLambertMaterial({ color }));
  body.position.y = 0.5;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.4,0.55,1.9), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  roof.position.y = 1.075;
  const winM = new THREE.MeshLambertMaterial({ color: 0x1a2a3a, emissive: 0x0a1520, emissiveIntensity: 0.3 });
  const wf = new THREE.Mesh(new THREE.BoxGeometry(1.3,0.45,0.08), winM); wf.position.set(0,1.0, 1.0);
  const wr = new THREE.Mesh(new THREE.BoxGeometry(1.3,0.45,0.08), winM); wr.position.set(0,1.0,-1.0);
  const wG = new THREE.CylinderGeometry(0.3,0.3,0.25,8);
  const wM = new THREE.MeshLambertMaterial({ color: 0x111111 });
  [[-0.9,1.2],[0.9,1.2],[-0.9,-1.2],[0.9,-1.2]].forEach(([wx,wz]) => {
    const w = new THREE.Mesh(wG, wM); w.rotation.z = Math.PI/2; w.position.set(wx,0.3,wz); g.add(w);
  });
  g.add(body,roof,wf,wr);
  g.position.set(x,0,z); g.rotation.y = ry; scene.add(g);
}

function _addSafeHouse(scene) {
  const safeMat = new THREE.MeshLambertMaterial({ color: 0x2d5c2d });
  const body = new THREE.Mesh(new THREE.BoxGeometry(5,3.5,4), safeMat);
  body.position.set(0,1.75,-20); body.castShadow = true; scene.add(body);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2,2.2,0.12), new THREE.MeshLambertMaterial({ color: 0x1a3a1a }));
  door.position.set(0,1.1,-18.06); scene.add(door);
  const sl = new THREE.PointLight(0x44ff88, 30, 10); sl.position.set(0, 2, -19); scene.add(sl);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(3,0.4,0.1), new THREE.MeshLambertMaterial({ color: 0x22ee55, emissive: 0x22ee55, emissiveIntensity: 0.5 }));
  sign.position.set(0,3.7,-18.0); scene.add(sign);
}
