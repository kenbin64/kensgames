/**
 * 4D TIC-TAC-TOE -- Manifold Substrate
 * Manifold = Expression + Attributes + Substrate
 * Expression: m=x*y*z (Schwartz-diamond triply-periodic lattice)
 * Axiom: z=x*y -- every game fact is derived from coordinate pairs
 *
 * Two substrates live in this file:
 *   BoardManifold (3D plane) : 4x4x4 cell lattice + pure geometric lenses
 *   Turns         (4D height): ordered deltas of the plane (turn history)
 * Rule Zero: nothing stored beyond the 64-byte cell array and the turn list.
 */
window.BoardManifold = (() => {
  let G = 4, N = G ** 3;
  const EMPTY = 0, P1 = 1, P2 = 2, P3 = 3, P4 = 4;
  // 13 line directions in a 3D lattice (half-space, per axis sign convention)
  const DIRS = [
    [1, 0, 0], [0, 1, 0], [0, 0, 1],
    [1, 1, 0], [1, -1, 0], [0, 1, 1], [0, 1, -1], [1, 0, 1], [1, 0, -1],
    [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
  ];
  // Diagonals = directions touching 2+ axes
  const DIAG_DIRS = DIRS.filter(([dx, dy, dz]) => (dx ? 1 : 0) + (dy ? 1 : 0) + (dz ? 1 : 0) > 1);
  let cells = new Uint8Array(N);
  // Grid-aware accessors close over the current G via the outer let-binding so setGrid()
  // resizes cleanly without touching call sites in game.js.
  const idx = (x, y, z) => z * G * G + y * G + x;
  const ok = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < G && y < G && z < G;
  const getCell = (x, y, z) => cells[idx(x, y, z)];
  const setCell = (x, y, z, v) => { cells[idx(x, y, z)] = v; };
  // Resize the lattice to a new edge length and clear it. Called from game.js startGame().
  const setGrid = (newG) => { G = newG | 0; N = G ** 3; cells = new Uint8Array(N); };
  // Gravity: lowest unoccupied y in column (x,z)
  const lowestFree = (x, z) => { for (let y = 0; y < G; y++)if (!getCell(x, y, z)) return y; return -1; };
  const columnFull = (x, z) => lowestFree(x, z) < 0;
  // Line scan: returns first len-cell line of player p in dir-family, else null
  function findLine(p, len = 4, dirs = DIRS) {
    for (const [dx, dy, dz] of dirs)
      for (let x = 0; x < G; x++)for (let y = 0; y < G; y++)for (let z = 0; z < G; z++) {
        const line = [];
        for (let s = 0; s < len; s++) {
          const nx = x + dx * s, ny = y + dy * s, nz = z + dz * s;
          if (!ok(nx, ny, nz) || getCell(nx, ny, nz) !== p) break;
          line.push([nx, ny, nz]);
        }
        if (line.length === len) return line;
      }
    return null;
  }
  // 2x2x2 cube of player p, else null
  function checkCube(p) {
    for (let x = 0; x < G - 1; x++)for (let y = 0; y < G - 1; y++)for (let z = 0; z < G - 1; z++) {
      const cs = [[x, y, z], [x + 1, y, z], [x, y + 1, z], [x + 1, y + 1, z], [x, y, z + 1], [x + 1, y, z + 1], [x, y + 1, z + 1], [x + 1, y + 1, z + 1]];
      if (cs.every(([a, b, c]) => getCell(a, b, c) === p)) return cs;
    }
    return null;
  }
  // Count every len-cell line of player p across dirs
  function countAllLines(p, len = 4, dirs = DIRS) {
    let n = 0;
    for (const [dx, dy, dz] of dirs)
      for (let x = 0; x < G; x++)for (let y = 0; y < G; y++)for (let z = 0; z < G; z++) {
        let full = true;
        for (let s = 0; s < len; s++) {
          if (!ok(x + dx * s, y + dy * s, z + dz * s) || getCell(x + dx * s, y + dy * s, z + dz * s) !== p) { full = false; break; }
        }
        if (full) n++;
      }
    return n;
  }
  // Threats = 3-in-a-row open lines; alias over countAllLines
  const countThreats = (p, len = 3, dirs = DIRS) => countAllLines(p, len, dirs);
  // Composite win lens -- scenario-driven dispatch, Rule Zero
  function checkWin(p, scenario) {
    const s = scenario || {};
    if (s.special === 'cube') return checkCube(p);
    if (s.special === 'territory') return null;
    const dirs = s.modes === 'diag' ? DIAG_DIRS : DIRS;
    return findLine(p, s.winLen || 4, dirs);
  }
  // Gravity-place: set cell at lowest free y, return placement record
  const place = (x, z, p) => { const y = lowestFree(x, z); if (y < 0) return { ok: false }; setCell(x, y, z, p); return { ok: true, gx: x, gy: y, gz: z }; };
  const reset = () => cells.fill(EMPTY);
  const snapshot = () => cells.slice();
  const restore = s => cells.set(s);
  const boardFull = () => !cells.some(v => v === EMPTY);
  // Lenses: derived projections, zero stored state
  const filled = () => cells.reduce((n, v) => n + (v !== EMPTY), 0);
  const manifoldValue = (x, y, z) => x * y * z;
  const saddleZ = (x, z) => x * z;
  const eachOccupied = fn => cells.forEach((v, i) => v && fn(i % G, (i / G | 0) % G, i / G / G | 0, v));
  const columnOccupancy = () => Array.from({ length: G * G }, (_, i) => {
    const x = i % G, z = i / G | 0; let free = 0, p1 = 0, p2 = 0;
    for (let y = 0; y < G; y++) { const v = getCell(x, y, z); v === P1 ? p1++ : v === P2 ? p2++ : free++; }
    return { gx: x, gz: z, free, p1, p2, full: !free };
  });
  const openColumns = () => { const out = []; for (let gz = 0; gz < G; gz++)for (let gx = 0; gx < G; gx++)if (!columnFull(gx, gz)) out.push([gx, gz]); return out; };
  const dirLabel = line => {
    if (!line || line.length < 2) return '';
    const axes = ['X', 'Y', 'Z'].filter((_, i) => line[1][i] !== line[0][i]);
    return (line.length) + ' in a row -- ' + (axes.length === 1 ? axes[0] + ' axis' : axes.join('/') + ' diagonal');
  };
  // GRID is exposed as a getter so callers always see the current edge length after setGrid().
  const api = { EMPTY, P1, P2, P3, P4, DIRS, DIAG_DIRS, setGrid, getCell, setCell, place, lowestFree, columnFull, findLine, checkCube, countAllLines, countThreats, checkWin, boardFull, reset, snapshot, restore, eachOccupied, filled, manifoldValue, saddleZ, columnOccupancy, openColumns, dirLabel };
  Object.defineProperty(api, 'GRID', { get: () => G });
  return api;
})();

/**
 * Turns -- 4D height substrate: deltas of the 3D plane indexed by turn number.
 * Identity of each turn point: z = cellIndex * turnIndex (axiom).
 * turns[] is the source of truth; counters/logs/streaks are O(1) indexes
 * maintained on record() -- database-index pattern, Rule Zero efficient.
 */
window.Turns = (() => {
  const P1 = 1, P2 = 2, P3 = 3, P4 = 4, MAXP = 4, LOGCAP = 6;
  // Counter banks are sized for MAXP so the same module supports 1..4 players without
  // a reset-time reallocation. Unused slots stay at 0 -- cheap and avoids index drama.
  let turns = [];
  let counts = new Array(MAXP).fill(0);
  let scores = new Array(MAXP).fill(0);
  let streaks = new Array(MAXP).fill(0);
  let logs = Array.from({ length: MAXP }, () => []);
  const fmt = t => `X${t.gx + 1}Z${t.gz + 1}Y${t.gy + 1}`;
  const record = t => {
    turns.push(t);
    const pi = t.p - 1;
    counts[pi]++;
    logs[pi].unshift(fmt(t)); if (logs[pi].length > LOGCAP) logs[pi].pop();
    // On any win, the winner's streak advances and every other player's streak resets to 0.
    if (t.isWin) { scores[pi]++; streaks[pi]++; for (let i = 0; i < MAXP; i++) if (i !== pi) streaks[i] = 0; }
    return t;
  };
  const awardWin = p => { const pi = p - 1; scores[pi]++; streaks[pi]++; for (let i = 0; i < MAXP; i++) if (i !== pi) streaks[i] = 0; };
  const count = p => counts[p - 1];
  const log = (p, n = LOGCAP) => logs[p - 1].slice(0, n);
  const streak = p => streaks[p - 1];
  const score = p => scores[p - 1];
  const reset = ({ resetScores } = {}) => {
    turns = [];
    counts = new Array(MAXP).fill(0);
    logs = Array.from({ length: MAXP }, () => []);
    if (resetScores) { scores = new Array(MAXP).fill(0); streaks = new Array(MAXP).fill(0); }
  };
  const last = () => turns[turns.length - 1] || null;
  const length = () => turns.length;
  const identity = i => { const t = turns[i]; return t ? (t.gz * 16 + t.gy * 4 + t.gx) * (i + 1) : 0; };
  const snapshot = () => ({ turns: turns.slice(), scores: scores.slice() });
  return { P1, P2, P3, P4, record, awardWin, count, log, streak, score, reset, last, length, identity, snapshot };
})();

if (typeof module !== 'undefined') module.exports = { BoardManifold: window.BoardManifold, Turns: window.Turns };
