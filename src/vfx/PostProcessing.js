import * as THREE from 'three';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

export function createPostProcessing(renderer, scene, camera) {
  const w = renderer.domElement.width;
  const h = renderer.domElement.height;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // threshold 0.6 — only bright emissives/fire glow, not flat surfaces
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.15, 0.6, 0.60);
  composer.addPass(bloom);

  composer.addPass(new OutputPass());

  return {
    composer,
    resize(w, h) { composer.setSize(w, h); bloom.resolution.set(w, h); },
    tick()       {},
  };
}
