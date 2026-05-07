const MAX = 50;
let past   = [];
let future = [];

function clone(s) {
  return {
    boxes:    s.boxes.map(b => ({ ...b })),
    circles:  s.circles.map(c => ({ ...c })),
    pickups:  s.pickups.map(p => ({ ...p })),
    hpacks:   s.hpacks.map(h => ({ ...h })),
    safeZone: { ...s.safeZone },
    spawns:   s.spawns.map(sp => ({ ...sp })),
  };
}

export function push(state) {
  past.push(clone(state));
  if (past.length > MAX) past.shift();
  future = [];
}

export function undo(state) {
  if (past.length === 0) return null;
  future.push(clone(state));
  return past.pop();
}

export function redo(state) {
  if (future.length === 0) return null;
  past.push(clone(state));
  return future.pop();
}

export function canUndo() { return past.length > 0; }
export function canRedo() { return future.length > 0; }
export function clear()   { past = []; future = []; }
