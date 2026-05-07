import { buildCity }        from './maps/city.js';
import { buildForest }      from './maps/forest.js';
import { buildIndustrial }  from './maps/industrial.js';
import { buildForestTrail } from './maps/forest_trail.js';

export function buildMap(scene, mapId = 'city') {
  if (mapId === 'forest')       return buildForest(scene);
  if (mapId === 'industrial')   return buildIndustrial(scene);
  if (mapId === 'forest_trail') return buildForestTrail(scene);
  return buildCity(scene);
}
