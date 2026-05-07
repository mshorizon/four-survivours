import * as THREE from 'three';
import { buildCity }        from '../src/maps/city.js';
import { buildForest }      from '../src/maps/forest.js';
import { buildIndustrial }  from '../src/maps/industrial.js';
import { buildForestTrail } from '../src/maps/forest_trail.js';
import { MAP_HALF } from '../shared/constants.js';

const BUILDERS = {
  city:         buildCity,
  forest:       buildForest,
  industrial:   buildIndustrial,
  forest_trail: buildForestTrail,
};

const PREVIEW_SIZE = 1024;
let renderer  = null;
const cache   = {}; // mapId → HTMLCanvasElement

function getRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    renderer.setSize(PREVIEW_SIZE, PREVIEW_SIZE);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  }
  return renderer;
}

export async function getPreview(mapId) {
  if (cache[mapId]) return cache[mapId];
  return buildPreview(mapId);
}

export function invalidate(mapId) {
  delete cache[mapId];
}

async function buildPreview(mapId) {
  const builder = BUILDERS[mapId];
  if (!builder) return null;

  const r = getRenderer();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x181818);

  const ambient = new THREE.AmbientLight(0xffffff, 1.8);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 2.2);
  dir.position.set(MAP_HALF * 0.4, 60, MAP_HALF * 0.3);
  dir.castShadow = true;
  dir.shadow.camera.left   = -MAP_HALF;
  dir.shadow.camera.right  =  MAP_HALF;
  dir.shadow.camera.top    =  MAP_HALF;
  dir.shadow.camera.bottom = -MAP_HALF;
  dir.shadow.mapSize.set(1024, 1024);
  scene.add(dir);

  builder(scene);

  const h = MAP_HALF;
  const cam = new THREE.OrthographicCamera(-h, h, h, -h, 0.1, 200);
  cam.up.set(0, 0, -1);
  cam.position.set(0, 80, 0);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();

  r.render(scene, cam);

  // Copy WebGL output into a regular canvas so we can reuse the renderer
  const out = document.createElement('canvas');
  out.width  = PREVIEW_SIZE;
  out.height = PREVIEW_SIZE;
  out.getContext('2d').drawImage(r.domElement, 0, 0);

  // Cleanup Three.js objects
  scene.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
  });

  cache[mapId] = out;
  return out;
}
