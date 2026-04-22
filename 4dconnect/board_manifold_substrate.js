/**
 * 4D CONNECT -- Board Manifold Substrate
 * Manifold = Expression + Attributes + Substrate
 * Expression: m=x*y*z (Schwartz-diamond triply-periodic lattice)
 * Axiom: z=x*y -- every game fact is derived from coordinate pairs
 * Nothing stored beyond the 64-byte cell array.
 */
window.BoardManifold = (() => {
  const G = 4, N = G ** 3, EMPTY = 0, P1 = 1, P2 = 2;
  const DIRS = [
    [1, 0, 0], [0, 1, 0], [0, 0, 1],
    [1, 1, 0], [1, -1, 0], [0, 1, 1], [0, 1, -1], [1, 0, 1], [1, 0, -1],
    [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
  ];
  const cells = new Uint8Array(N);
  const idx = (x, y, z) => z * G * G + y * G + x;
  const ok = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < G && y < G && z < G;
  const getCell = (x, y, z) => cells[idx(x, y, z)];
  const setCell = (x, y, z, v) => { cells[idx(x, y, z)] = v; };
  // Gravity: lowest unoccupied y in column (x,z)
  const lowestFree = (x, z) => { for (let y = 0; y < G; y++)if (!getCell(x, y, z)) return y; return -1; };
  const columnFull = (x, z) => lowestFree(x, z) < 0;
  // Win scan: all 13 direction families, return 4-cell line or null
  function checkWin(p) {
    for (const [dx, dy, dz] of DIRS)
      for (let x = 0; x < G; x++)for (let y = 0; y < G; y++)for (let z = 0; z < G; z++) {
        let n = 0;
        for (let s = 0; s < 4; s++) { if (!ok(x + dx * s, y + dy * s, z + dz * s) || getCell(x + dx * s, y + dy * s, z + dz * s) !== p) break; n++; }
        if (n === 4) return Array.from({ length: 4 }, (_, s) => [x + dx * s, y + dy * s, z + dz * s]);
      }
    return null;
  }
  // Gravity-place: set cell at lowest free y, return placement record
  const place = (x, z, p) => { const y = lowestFree(x, z); if (y < 0) return { ok: false }; setCell(x, y, z, p); return { ok: true, gx: x, gy: y, gz: z }; };
  const reset = () => cells.fill(EMPTY);
  const snapshot = () => cells.slice();
  const restore = s => cells.set(s);
  const boardFull = () => !cells.some(v => v === EMPTY);
  // Lenses: derived projections, zero stored state
  const turnCount = () => cells.reduce((n, v) => n + (v !== EMPTY), 0);
  const manifoldValue = (x, y, z) => x * y * z;
  const saddleZ = (x, z) => x * z;
  const eachOccupied = fn => cells.forEach((v, i) => v && fn(i % G, (i / G | 0) % G, i / G / G | 0, v));
  const columnOccupancy = () => Array.from({ length: G * G }, (_, i) => {
    const x = i % G, z = i / G | 0; let free = 0, p1 = 0, p2 = 0;
    for (let y = 0; y < G; y++) { const v = getCell(x, y, z); v === P1 ? p1++ : v === P2 ? p2++ : free++; }
    return { gx: x, gz: z, free, p1, p2, full: !free };
  });
  const dirLabel = line => {
    if (!line || line.length < 2) return '';
    const axes = ['X', 'Y', 'Z'].filter((_, i) => line[1][i] !== line[0][i]);
    return '4 in a row -- ' + (axes.length === 1 ? axes[0] + ' axis' : axes.join('/') + ' diagonal');
  };
  return { GRID: G, EMPTY, P1, P2, getCell, setCell, place, lowestFree, columnFull, checkWin, boardFull, reset, snapshot, restore, eachOccupied, turnCount, manifoldValue, saddleZ, columnOccupancy, dirLabel };
})();
if (typeof module !== 'undefined') module.exports = window.BoardManifold;
