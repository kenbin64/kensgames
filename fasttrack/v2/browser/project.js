// browser/project.js
// PURE projection of the v2 engine state into exactly the shapes the existing 3D renderer and HUD
// read: the players.list (with per-peg holeId), the board occupancy entries, and the validMoves in
// the renderer's move-object shape. No DOM, no engine mutation. The renderer never learns the
// engine changed underneath it because these shapes match the proven contract byte-for-byte.
import { pegHoleId, holeTypeOf, toRenderHole, toRenderPath } from './holemap.js';

// deco carries the cosmetic layer the engine does not track: per-seat color/avatar/name/isBot and
// per-peg nickname/personality. Assigned once at initGame and merged here so the visuals match.
export function buildPlayersList(engine, deco) {
  return engine.players.map((pl) => {
    const p = pl.index;
    const pegs = engine.pegs
      .filter((pg) => pg.player === p)
      .sort((a, b) => a.n - b.n)
      .map((pg) => {
        const id = `p${p}-peg${pg.n}`;
        const meta = deco.pegMeta[id] || {};
        return {
          id,
          holeId: pegHoleId(pg.location),
          holeType: holeTypeOf(pg.location),
          nickname: meta.nickname || '',
          personality: meta.personality || 'CHEERFUL',
          onFasttrack: !!pg.onFastTrack,
          eligibleForSafeZone: !!pg.hasCircuited,
          lockedToSafeZone: pg.location.startsWith(`safe-${p}-`),
          completedCircuit: !!pg.hasCircuited,
          mood: 'EAGER',
        };
      });
    return {
      index: p,
      name: deco.names[p],
      avatar: deco.avatars[p],
      color: deco.colors[p],
      boardPosition: pl.wedge,
      isBot: deco.isBot[p],
      userId: deco.userIds ? deco.userIds[p] : null,
      pegs,
    };
  });
}

// [ [renderHoleId, { playerIdx, pegId }], ... ] for every occupied hole. The adapter writes these
// into the board table; unoccupied holes simply return undefined from board.get (as before).
export function buildBoardEntries(engine) {
  return engine.pegs.map((pg) => [
    toRenderHole(pg.location),
    { playerIdx: pg.player, pegId: `p${pg.player}-peg${pg.n}` },
  ]);
}

// Translate one engine move (delta event) into the renderer's move object. Hole ids are mapped to
// the renderer vocabulary; pegIdx is the peg's number n (which is also its index in player.pegs).
export function translateMove(m) {
  if (m.type === 'split') {
    return {
      type: 'split',
      pegIdx: m.peg, from: toRenderHole(m.from), steps: m.a,
      dest: toRenderHole(m.destA), path: toRenderPath(m.pathA),
      peg2Idx: m.peg2, from2: toRenderHole(m.from2), steps2: m.b,
      dest2: toRenderHole(m.destB), path2: toRenderPath(m.pathB),
    };
  }
  return {
    type: m.type,
    pegIdx: m.peg,
    from: toRenderHole(m.from),
    dest: toRenderHole(m.dest),
    steps: m.steps != null ? m.steps : undefined,
    path: toRenderPath(m.path),
  };
}

// The full validMoves array, aligned by index with the engine moves (so executeMove(idx) replays
// engineMoves[idx]).
export function translateMoves(engineMoves) {
  return engineMoves.map(translateMove);
}

// The renderer animates a hop when a peg's holeId changes and an optional window._pendingHopAnim
// with a matching pegId + path is present. Build that hint (renderer hole ids) for a played move by
// player `p`. Returns { primary, secondary } — secondary is set only for a card-7 split.
export function hopHints(engineMove, p) {
  const m = engineMove;
  if (m.type === 'split') {
    return {
      primary: { pegId: `p${p}-peg${m.peg}`, path: toRenderPath(m.pathA), from: toRenderHole(m.from) },
      secondary: { pegId: `p${p}-peg${m.peg2}`, path: toRenderPath(m.pathB), from: toRenderHole(m.from2) },
    };
  }
  return {
    primary: { pegId: `p${p}-peg${m.peg}`, path: toRenderPath(m.path), from: toRenderHole(m.from) },
    secondary: null,
  };
}
