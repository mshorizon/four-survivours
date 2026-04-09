import { buildCity }       from './maps/city.js';
import { buildForest }     from './maps/forest.js';
import { buildIndustrial } from './maps/industrial.js';

export function buildMap(scene, mapId = 'city') {
  if (mapId === 'forest')     return buildForest(scene);
  if (mapId === 'industrial') return buildIndustrial(scene);
  return buildCity(scene);
}
