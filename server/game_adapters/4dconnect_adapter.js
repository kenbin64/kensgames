/**
 * 4dconnect shape adapter — 3D substrate knowledge injected into the
 * dimension-agnostic Game Manager (2D scenario plane).
 *
 * Placements are read from session.progress[playerId].placements as
 * [x, y, z] triples on a 4x4x4 lattice. The adapter returns true when
 * the player satisfies the combo's geometric shape.
 */
'use strict';

const G = 4;

const ALL_DIRS = (() => {
  const d = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    if (dx === 0 && dy === 0 && dz === 0) continue;
    if (dx < 0 || (dx === 0 && dy < 0) || (dx === 0 && dy === 0 && dz < 0)) continue;
    d.push([dx, dy, dz]);
  }
  return d;
})();
const DIAG_DIRS = ALL_DIRS.filter(([dx, dy, dz]) => (dx ? 1 : 0) + (dy ? 1 : 0) + (dz ? 1 : 0) > 1);

function _ownSet(session, playerId) {
  const prog = (session.progress || {})[playerId];
  if (!prog || !prog.placements) return new Set();
  return new Set(prog.placements.map(c => `${c[0]},${c[1]},${c[2]}`));
}

function _allFilled(session) {
  const ps = session.players || [];
  let total = 0;
  for (const p of ps) {
    const prog = (session.progress || {})[p.user_id];
    if (prog && prog.placements) total += prog.placements.length;
  }
  return total >= G * G * G;
}

function _inb(x, y, z) { return x >= 0 && x < G && y >= 0 && y < G && z >= 0 && z < G; }

function matchSeq(session, playerId, combo) {
  const own = _ownSet(session, playerId);
  if (own.size < (combo.len || 4)) return false;
  const dirs = combo.dirs === 'diag' ? DIAG_DIRS : ALL_DIRS;
  const len = combo.len || 4;
  for (const [dx, dy, dz] of dirs) {
    for (let x = 0; x < G; x++) for (let y = 0; y < G; y++) for (let z = 0; z < G; z++) {
      let ok = true;
      for (let s = 0; s < len; s++) {
        const nx = x + dx * s, ny = y + dy * s, nz = z + dz * s;
        if (!_inb(nx, ny, nz) || !own.has(`${nx},${ny},${nz}`)) { ok = false; break; }
      }
      if (ok) return true;
    }
  }
  return false;
}

function matchSet(session, playerId, combo) {
  const own = _ownSet(session, playerId);
  if (combo.shape === 'cube222') {
    for (let x = 0; x < G - 1; x++) for (let y = 0; y < G - 1; y++) for (let z = 0; z < G - 1; z++) {
      const cells = [[x, y, z], [x + 1, y, z], [x, y + 1, z], [x + 1, y + 1, z],
      [x, y, z + 1], [x + 1, y, z + 1], [x, y + 1, z + 1], [x + 1, y + 1, z + 1]];
      if (cells.every(c => own.has(`${c[0]},${c[1]},${c[2]}`))) return true;
    }
  }
  return false;
}

function boardFull(session) { return _allFilled(session); }

/**
 * Gravity-drop resolver: given a 'drop' action with cell = [gx, null, gz],
 * fill in gy from the existing placements in that column. Noop for any
 * other action shape.
 */
function resolveAction(session, action) {
  if (!action || action.type !== 'drop') return action;
  const c = action.cell || [];
  const gx = c[0], gz = c[2];
  if (typeof gx !== 'number' || typeof gz !== 'number') return action;
  const occupied = new Set();
  const prog = session.progress || {};
  for (const pid of Object.keys(prog)) {
    const pl = (prog[pid] && prog[pid].placements) || [];
    for (const p of pl) if (p[0] === gx && p[2] === gz) occupied.add(p[1]);
  }
  let gy = 0;
  while (gy < G && occupied.has(gy)) gy++;
  if (gy >= G) return { ...action, rejected: 'column_full' };
  return { ...action, cell: [gx, gy, gz] };
}

module.exports = { gameId: '4dconnect', matchSeq, matchSet, boardFull, resolveAction };
