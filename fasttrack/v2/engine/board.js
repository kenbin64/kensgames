// engine/board.js
// The FastTrack board in the proven semantic naming that the engine and the 3D scene share.
// Each of the 6 wedges contributes 14 holes to the clockwise perimeter loop, in order:
//   ft, side-left 4..1, outer 0..3, home, side-right 1..4    (84 holes around).
// ft-{p} and home-{p} are perimeter holes with extra roles (ft is also a node on the inner
// fast-track ring; home is also the winner hole). Off-loop holes: per-player safe zone (4),
// holding (4), and the single center (bullseye). PURE data: no DOM, no rendering.
//
// rules.json's flat outer-{p}-{1..14} is the canonical data mapping for storage: position 1 is
// ft, position 8 is the safe-zone entrance (the semantic outer-{p}-2), position 10 is home.

export const WEDGES = 6;
export const SAFE_SIZE = 4;
export const HOLDING_SIZE = 4;
export const HOLES_PER_WEDGE = 14;

// ── hole id builders ────────────────────────────────────────────────────────
export const ftId = (p) => `ft-${p}`;
export const sideLeftId = (p, h) => `side-left-${p}-${h}`;   // h 1..4
export const outerId = (p, h) => `outer-${p}-${h}`;          // h 0..3
export const homeId = (p) => `home-${p}`;
export const sideRightId = (p, h) => `side-right-${p}-${h}`;  // h 1..4
export const safeId = (p, h) => `safe-${p}-${h}`;            // h 1..4
export const holdId = (p, h) => `hold-${p}-${h}`;            // h 1..4
export const CENTER = 'center';
export const safeEntranceId = (p) => outerId(p, 2);          // the proven safe-zone entrance

// ── topology ────────────────────────────────────────────────────────────────
// one wedge's 14 perimeter holes, clockwise
export function wedgeSegment(p) {
  const seg = [ftId(p)];
  for (let h = 4; h >= 1; h--) seg.push(sideLeftId(p, h));
  for (let h = 0; h <= 3; h++) seg.push(outerId(p, h));
  seg.push(homeId(p));
  for (let h = 1; h <= 4; h++) seg.push(sideRightId(p, h));
  return seg;
}

// the full 84-hole clockwise perimeter loop
export function orderedTrack() {
  const t = [];
  for (let p = 0; p < WEDGES; p++) t.push(...wedgeSegment(p));
  return t;
}

// the clockwise inner fast-track ring is ft-0 -> ft-1 -> ... -> ft-5 -> ft-0
export const ftRingNext = (p) => (p + 1) % WEDGES;

// role of any hole by its id
export function holeRole(id) {
  if (id.startsWith('ft-')) return 'fasttrack';
  if (id.startsWith('side-left-')) return 'side-left';
  if (id.startsWith('outer-')) return 'outer';
  if (id.startsWith('home-')) return 'home';
  if (id.startsWith('side-right-')) return 'side-right';
  if (id.startsWith('safe-')) return 'safezone';
  if (id.startsWith('hold-')) return 'holding';
  if (id === CENTER) return 'bullseye';
  return 'unknown';
}

// the wedge a hole belongs to (the first number in its id); center has none (-1)
export function wedgeOf(id) {
  if (id === CENTER) return -1;
  const m = id.match(/-(\d+)/);
  return m ? parseInt(m[1], 10) : -1;
}

// build the full hole set: the 84 loop holes plus safe, holding, and the center
export function buildBoard() {
  const holes = new Map();
  const add = (id) => holes.set(id, { id, kind: holeRole(id), wedge: wedgeOf(id) });
  const loop = orderedTrack();
  for (const id of loop) add(id);
  for (let p = 0; p < WEDGES; p++) {
    for (let h = 1; h <= SAFE_SIZE; h++) add(safeId(p, h));
    for (let h = 1; h <= HOLDING_SIZE; h++) add(holdId(p, h));
  }
  add(CENTER);
  return { holes, loop };
}
