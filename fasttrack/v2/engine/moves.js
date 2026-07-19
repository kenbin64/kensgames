// engine/moves.js
// Move generation for FastTrack v2: given the state, the indexed rules, and the drawn card,
// list the legal moves for the current player. PURE logic on the board topology, no DOM and
// no render: the board is the dimensional substrate, a move is an honest traversal of it, and
// each move is a small delta event { type, peg, from, dest, path } which is also exactly the
// unit the delta-only store persists. Ported from the proven engine, one move type at a time,
// each covered by a test.
//
// Implemented: enter (holding), exitBullseye (J/Q/K), safe-zone advance, and the perimeter step
// (forward, card-4 backward, with the safe-zone diversion at the entrance once a circuit is
// complete, no-pass-own with the ft-ring exemption, no-land-own, exact landing). Still to come:
// the fast-track leave-at-k exit and the card-7 split.
import { CENTER, ftId, homeId, safeId, outerId, safeEntranceId, orderedTrack, holeRole, SAFE_SIZE, WEDGES } from './board.js';
import { occupantOf, pegsOf } from './state.js';

const LOOP = orderedTrack();   // the 84-hole clockwise perimeter, static

function ownPegOn(state, holeId, player) { const o = occupantOf(state, holeId); return !!(o && o.player === player); }
function safeZoneFull(state, p) { return pegsOf(state, p).filter((pg) => pg.location.startsWith(`safe-${p}-`)).length >= SAFE_SIZE; }

// The forward (or card-4 backward) sequence of holes from a perimeter peg, including the
// diversion down the home stretch into the safe zone at the player's entrance (outer-{p}-2)
// once the peg has completed its circuit. Ported from the proven getTrackSequence perimeter case.
function trackSequence(state, peg, p, backward) {
  const idx = LOOP.indexOf(peg.location);
  if (idx < 0) return [];
  const fwd = !backward;
  const entrance = safeEntranceId(p);            // outer-{p}-2
  const full = safeZoneFull(state, p);
  const home = homeId(p);
  const seq = [];
  const divert = () => {
    if (!full) { for (let h = 1; h <= SAFE_SIZE; h++) seq.push(safeId(p, h)); }
    else { seq.push(outerId(p, 3)); seq.push(home); }
  };

  // Reaching your OWN entrance (outer-{p}-2) going clockwise IS completing the circuit:
  // in normal play a peg only arrives here after travelling the whole loop from home. So
  // the diversion must fire the moment the walk touches the entrance, NOT gated on a
  // pre-move hasCircuited flag. That flag is only set AFTER the move (apply.js), so gating
  // on it made the peg completing its lap sail past the entrance instead of turning in.
  // (Backward card-4 is excluded by `fwd`; it can flag the circuit but never diverts.)
  if (peg.location === entrance && fwd) { divert(); return seq; }
  for (let i = 1; i <= 30; i++) {
    const ni = fwd ? (idx + i) % LOOP.length : (idx - i + LOOP.length) % LOOP.length;
    const hole = LOOP[ni];
    if (hole === entrance && fwd) { seq.push(hole); divert(); break; }
    seq.push(hole);
    if (full && fwd && hole === home) break;     // when the safe zone is full, home is terminal
  }
  return seq;
}

// Fast-track leave-at-k exit, ported from the proven _enumerateFtExitOptions. A peg on ft-X with
// card value N gets up to min(N, ringReach)+1 options: for each k, hop k times clockwise on the
// inner ring (own pegs block the ring, no exemption), leave the ring at ft-((X+k) mod 6) onto the
// outer rim, then walk the remaining N-k hops, diverting into the home stretch / safe zone at the
// player's own entrance when eligible. Reaching the own ft completes the circuit (eligible this move).
function ftExitOptions(state, peg, p, N) {
  const opts = [];
  if (N < 1 || !peg.location.startsWith('ft-')) return opts;
  const ftX = parseInt(peg.location.slice(3), 10);
  const D = (p - ftX + WEDGES) % WEDGES;
  const ringDests = [];
  const ringLimit = D === 0 ? 0 : D;
  for (let i = 0; i < ringLimit; i++) {
    const next = (ftX + i + 1) % WEDGES;
    if (ownPegOn(state, ftId(next), p)) break;   // own peg blocks the inner ring (no exemption)
    ringDests.push(next);
  }
  const maxRing = ringDests.length;
  const full = safeZoneFull(state, p);
  const entrance = safeEntranceId(p);

  const walkOuter = (startFtIdx, hops) => {
    if (hops < 0) return null;
    if (hops === 0) return { path: [], dest: ftId(startFtIdx) };
    const startIdx = LOOP.indexOf(ftId(startFtIdx));
    if (startIdx < 0) return null;
    const elig = !!peg.hasCircuited || startFtIdx === p;   // leaving at own ft completes the circuit
    const path = [];
    for (let s = 1; s <= hops; s++) {
      const hole = LOOP[(startIdx + s) % LOOP.length];
      if (hole === entrance && elig) {
        path.push(hole);
        const remaining = hops - s;
        if (full) {
          if (remaining === 0) return { path, dest: hole };
          if (remaining === 1) { path.push(outerId(p, 3)); return { path, dest: outerId(p, 3) }; }
          if (remaining === 2) { path.push(outerId(p, 3)); path.push(homeId(p)); return { path, dest: homeId(p) }; }
          return null;
        }
        if (remaining > SAFE_SIZE) return null;
        for (let h = 1; h <= remaining; h++) { const sh = safeId(p, h); if (ownPegOn(state, sh, p)) return null; path.push(sh); }
        return { path, dest: path[path.length - 1] };
      }
      const occ = occupantOf(state, hole);
      if (occ && occ.player === p) return null;   // own peg blocks the rim walk
      path.push(hole);
    }
    return { path, dest: path[path.length - 1] };
  };

  for (let k = 0; k <= Math.min(N, maxRing); k++) {
    const ringSeg = ringDests.slice(0, k).map(ftId);
    const w = walkOuter((ftX + k) % WEDGES, N - k);
    if (!w) continue;
    opts.push({ path: [...ringSeg, ...w.path], dest: w.dest });
  }
  return opts;
}

// Forward k-step partial destinations for a single peg (the card-7 context: forward only;
// holding and bullseye pegs do not participate). Reuses the same generators the full move uses.
function partialMoves(state, p, peg, k) {
  const out = [];
  const loc = peg.location;
  if (loc.startsWith('hold-') || loc === CENTER) return out;
  if (loc.startsWith(`safe-${p}-`)) {
    const slot = parseInt(loc.slice(loc.lastIndexOf('-') + 1), 10);
    const h = slot + k;
    if (h <= SAFE_SIZE) {
      let clear = true;
      for (let s = slot + 1; s <= h; s++) if (occupantOf(state, safeId(p, s))) { clear = false; break; }
      if (clear) { const path = []; for (let s = slot + 1; s <= h; s++) path.push(safeId(p, s)); out.push({ type: 'move', dest: safeId(p, h), path }); }
    }
    return out;
  }
  if (holeRole(loc) === 'fasttrack') {
    for (const o of ftExitOptions(state, peg, p, k)) out.push({ type: 'exitFastTrack', dest: o.dest, path: o.path });
    return out;
  }
  if (LOOP.includes(loc)) {
    const seq = trackSequence(state, peg, p, false);
    if (seq.length >= k) {
      const dest = seq[k - 1];
      let blocked = false;
      for (let s = 0; s < k - 1; s++) { const o = occupantOf(state, seq[s]); if (o && o.player === p && holeRole(seq[s]) !== 'fasttrack') { blocked = true; break; } }
      const d = occupantOf(state, dest); if (d && d.player === p) blocked = true;
      if (!blocked) out.push({ type: 'move', dest, path: seq.slice(0, k) });
    }
  }
  return out;
}

// Card 7: one peg takes all 7, or two pegs split a + b = 7. Emits every legal complete 7; the
// turn engine forfeits when this is empty, honoring the all-7-or-no-motion rule. Each distinct
// split is emitted once (i < j, a = 1..6). FT-status consequences and anti-tunneling are applied
// in apply/validation, not here.
function card7Moves(state, p) {
  const moves = [];
  const pegs = pegsOf(state, p);
  for (const peg of pegs) for (const m of partialMoves(state, p, peg, 7)) moves.push({ ...m, peg: peg.n, from: peg.location, steps: 7 });
  for (let i = 0; i < pegs.length; i++) for (let j = i + 1; j < pegs.length; j++) {
    for (let a = 1; a <= 6; a++) {
      const b = 7 - a;
      const pa = partialMoves(state, p, pegs[i], a);
      const pb = partialMoves(state, p, pegs[j], b);
      for (const mA of pa) for (const mB of pb) {
        moves.push({ type: 'split', a, b,
          peg: pegs[i].n, from: pegs[i].location, destA: mA.dest, pathA: mA.path, kindA: mA.type,
          peg2: pegs[j].n, from2: pegs[j].location, destB: mB.dest, pathB: mB.path, kindB: mB.type });
      }
    }
  }
  return moves;
}

// The proven engine emits one move per eligible peg; the turn engine and the player pick among
// them. Returns an array of delta events.
export function calculateValidMoves(state, R, card) {
  const moves = [];
  if (!card) return moves;
  const rules = R.card(card.rank);
  if (!rules) return moves;
  const p = state.turn.current;

  // Card 7 is the split card: one peg takes all 7, or two pegs split a + b = 7. Delegated.
  if (rules.can_split) return card7Moves(state, p);

  for (const peg of pegsOf(state, p)) {
    const loc = peg.location;

    // ENTER from holding (A, 6, JOKER): onto the player's home hole, unless an own peg is there.
    if (loc.startsWith('hold-') && R.canEnterFromHolding(card.rank)) {
      if (!ownPegOn(state, homeId(p), p)) moves.push({ type: 'enter', peg: peg.n, from: loc, dest: homeId(p) });
    }

    // EXIT BULLSEYE (J, Q, K): own ft hole, or the nearest previous ft hole free of an own peg.
    if (loc === CENTER && R.canExitBullseye(card.rank)) {
      for (let a = 0; a < WEDGES; a++) {
        const ft = ftId((p - a + WEDGES) % WEDGES);
        if (!ownPegOn(state, ft, p)) { moves.push({ type: 'exitBullseye', peg: peg.n, from: loc, dest: ft }); break; }
      }
    }

    // SAFE ZONE: advance forward exactly `movement`, free hole, no jumping. Exact landing.
    if (loc.startsWith(`safe-${p}-`)) {
      const slot = parseInt(loc.slice(loc.lastIndexOf('-') + 1), 10);
      for (let h = slot + 1; h <= SAFE_SIZE; h++) {
        const hole = safeId(p, h);
        if (occupantOf(state, hole)) break;
        if (h - slot === rules.movement) {
          const path = []; for (let s = slot + 1; s <= h; s++) path.push(safeId(p, s));
          moves.push({ type: 'move', peg: peg.n, from: loc, dest: hole, steps: h - slot, path });
          break;
        }
      }
    }

    // PERIMETER step: a peg on the loop (not on an ft hole, which travels the inner ring) walks
    // `movement` holes, diverting into the safe zone at the entrance when eligible. No-pass-own
    // (ft holes exempt), no-land-own, exact landing. Card 4 goes backward.
    if (LOOP.includes(loc) && (holeRole(loc) !== 'fasttrack' || rules.is_backward)) {
      const seq = trackSequence(state, peg, p, !!rules.is_backward);
      const steps = rules.movement;
      if (seq.length >= steps) {
        const dest = seq[steps - 1];
        let blocked = false;
        for (let s = 0; s < steps - 1; s++) {
          const o = occupantOf(state, seq[s]);
          if (o && o.player === p && holeRole(seq[s]) !== 'fasttrack') { blocked = true; break; }
        }
        const destOcc = occupantOf(state, dest);
        if (destOcc && destOcc.player === p) blocked = true;
        if (!blocked) {
          moves.push({ type: 'move', peg: peg.n, from: loc, dest, steps, path: seq.slice(0, steps) });
          // BULLSEYE divert: a forward move of two or more whose penultimate hole is a FOREIGN ft
          // may instead pivot into the center as its final step. Offered only alongside the regular
          // continuation above, so both are genuine choices (rules.json BULL_PENULT_REACHABLE);
          // never from the own ft-{p} (BULL_NO_FROM_OWN_FT), never backward, never onto an own peg
          // at the penultimate ft or at the center (an opponent at the center is cut on arrival).
          if (!rules.is_backward && steps >= 2) {
            const penult = seq[steps - 2];
            if (penult && holeRole(penult) === 'fasttrack' && penult !== ftId(p)) {
              const pen = occupantOf(state, penult);
              const bc = occupantOf(state, CENTER);
              if (!(pen && pen.player === p) && !(bc && bc.player === p)) {
                moves.push({ type: 'enterBullseye', peg: peg.n, from: loc, dest: CENTER, steps,
                  path: [...seq.slice(0, steps - 1), CENTER] });
              }
            }
          }
        }
      }
    }

    // FAST-TRACK exit: a peg on an ft hole moving clockwise (not card-4 backward) gets the
    // leave-at-k options. A backward card-4 ft peg is handled by the perimeter walk above.
    if (holeRole(loc) === 'fasttrack' && !rules.is_backward) {
      for (const opt of ftExitOptions(state, peg, p, rules.movement)) {
        moves.push({ type: 'exitFastTrack', peg: peg.n, from: loc, dest: opt.dest, steps: rules.movement, path: opt.path });
      }
    }

    // BULLSEYE 1-jump: a peg in fast-track mode sitting on a FOREIGN ft hole may, on any one-step
    // card (A, J, Q, K, Joker), jump straight to the center. Offered independently of the
    // leave-at-k exits above (rules.json exit_constraint "1-hit bullseye jump", BULL_ENTRY_1STEP_FT).
    // Never from the own ft-{p} (BULL_NO_FROM_OWN_FT treats it as backward), never on card 4, and
    // never onto an own peg already at the center (single-occupancy; an opponent there is cut).
    if (holeRole(loc) === 'fasttrack' && peg.onFastTrack && !rules.is_backward &&
        R.isOneStep(card.rank) && loc !== ftId(p)) {
      const bc = occupantOf(state, CENTER);
      if (!(bc && bc.player === p)) {
        moves.push({ type: 'enterBullseye', peg: peg.n, from: loc, dest: CENTER, steps: 1, path: [CENTER] });
      }
    }
  }
  return moves;
}
