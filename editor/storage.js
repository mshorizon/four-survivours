const KEY = 'four-survivors-editor';

export function save(mapId, state, missionPositions) {
  try {
    const all = loadAll();
    all[mapId] = {
      boxes:         state.boxes,
      circles:       state.circles,
      pickups:       state.pickups,
      hpacks:        state.hpacks,
      safeZone:      state.safeZone,
      spawns:        state.spawns,
      playerSpawns:  state.playerSpawns,
      missionPositions,
    };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

export function load(mapId) {
  try {
    return loadAll()[mapId] ?? null;
  } catch { return null; }
}

function loadAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
}

export function exportAll() {
  return loadAll();
}

export function importAll(json) {
  try {
    const data = JSON.parse(json);
    localStorage.setItem(KEY, JSON.stringify(data));
    return data;
  } catch (e) {
    alert('Invalid JSON: ' + e.message);
    return null;
  }
}

export function clearMap(mapId) {
  try {
    const all = loadAll();
    delete all[mapId];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}
