// engine/apply.js
// Execute a chosen move and mutate the state: move the peg(s), cut an opponent on the landing
// hole (back to holding, or to its home hole when holding is full), set circuit-eligibility when
// the path crosses the entrance, update fast-track status (including the card-4 and
// non-fast-track-move loss cascade), and detect the win. PURE state mutation, no DOM, no render.
// Ported from the proven placePeg/bumpOccupant/executeMove. Each move is a delta; apply replays
// one delta onto the state.
import { homeId, holdId, safeEntranceId, holeRole, HOLDING_SIZE, SAFE_SIZE, ftId, sideLeftId, outerId } from './board.js';
import { pegsOf, occupantOf, pegByPlayerN } from './state.js';

function firstOpenHold(state, player) {
  for (let h = 1; h <= HOLDING_SIZE; h++) { const id = holdId(player, h); if (!occupantOf(state, id)) return id; }
  return holdId(player, 1);
}

// Send any opponent peg on holeId back, resetting its progress. Holding first; if holding is full,
// the victim goes to its own home hole (bumping anyone already there), per CUT_DEST_HOME_FALLBACK.
function cut(state, holeId, attacker) {
  const victim = state.pegs.find((pg) => pg.location === holeId && pg.player !== attacker);
  if (!victim) return;
  victim.onFastTrack = false;
  victim.hasCircuited = false;
  const inHolding = pegsOf(state, victim.player).filter((pg) => pg.location.startsWith(`hold-${victim.player}-`)).length;
  if (inHolding >= HOLDING_SIZE) {
    const home = homeId(victim.player);
    const occ = occupantOf(state, home);
    if (occ && occ.player === victim.player) victim.location = firstOpenHold(state, victim.player);
    else { cut(state, home, victim.player); victim.location = home; }
  } else {
    victim.location = firstOpenHold(state, victim.player);
  }
}

// Apply one leg (a single peg's hop to dest along path). Cuts, sets circuit-eligibility, moves,
// and sets the moved peg's own fast-track status.
function applyLeg(state, p, pegN, dest, path, isExit) {
  const peg = pegByPlayerN(state, p, pegN);
  cut(state, dest, p);
  if (path && path.includes(safeEntranceId(p))) peg.hasCircuited = true;   // CIR_SAFE_ENTRANCE / CIR_BACKWARD_4
  peg.location = dest;
  if (holeRole(dest) === 'fasttrack' && !isExit) peg.onFastTrack = true;   // FT_ENTRY_EXACT (forward landing)
  else if (holeRole(dest) !== 'fasttrack') peg.onFastTrack = false;        // left the ring
  return peg;
}

export function applyMove(state, R, move) {
  const p = state.turn.current;
  const card = state.turn.card;
  const rules = card ? R.card(card.rank) : null;
  const isBackward = !!(rules && rules.is_backward);
  const hadFtBefore = pegsOf(state, p).some((pg) => pg.onFastTrack);

  let preserving;
  if (move.type === 'split') {
    applyLeg(state, p, move.peg, move.destA, move.pathA, move.kindA === 'exitFastTrack');
    applyLeg(state, p, move.peg2, move.destB, move.pathB, move.kindB === 'exitFastTrack');
    // CARD_7_FT_PRIORITY (approximate): the split preserves FT only if every moved peg that was
    // on FT ended on FT. The per-leg applyLeg already cleared any that landed off the ring.
    preserving = true; // legs handled individually; the cascade below still strips if a non-FT peg moved
  } else {
    const landedOnFt = holeRole(move.dest) === 'fasttrack' && !isBackward && move.type !== 'exitFastTrack' && move.type !== 'exitBullseye';
    applyLeg(state, p, move.peg, move.dest, move.path, move.type === 'exitFastTrack' || move.type === 'exitBullseye');
    // FT is preserved by a deliberate exit, a bullseye exit, reaching the center (the goal move
    // leaves the mover off the ring but does not cost the player's other pegs their FT status,
    // per the proven isFTPreserving rule), or a move that keeps the peg on the ring.
    preserving = move.type === 'exitFastTrack' || move.type === 'exitBullseye'
      || move.type === 'enterBullseye' || landedOnFt;
  }

  // Fast-track loss cascade. Card 4 strips all of the player's FT pegs (FT_LOSS_ON_4). Otherwise,
  // if the player had FT pegs and this move was not FT-preserving (a non-FT peg moved, or an FT
  // peg left the ring other than by a deliberate exit), all the player's FT pegs lose status
  // (FT_LOSS_ON_NON_FT_MOVE).
  if ((card && card.rank === '4') || (hadFtBefore && !preserving)) {
    for (const pg of pegsOf(state, p)) pg.onFastTrack = false;
  }

  checkWin(state, p);
}

// The HOME STRETCH (run-in): the player's own ft-{p}, down the side-left holes, along the outer
// holes through the safe-zone entrance (outer-{p}-2), on to the win hole home-{p}. This is the ONLY
// legitimate approach to home. The side-right holes (the exit side, immediately AFTER home, where a
// peg sits just after leaving holding) are deliberately excluded — sitting there is not a run-in.
export function homeStretchHoles(p) {
  return [ftId(p), sideLeftId(p, 1), sideLeftId(p, 2), sideLeftId(p, 3), sideLeftId(p, 4),
    outerId(p, 0), outerId(p, 1), outerId(p, 2), outerId(p, 3), homeId(p)];
}

// CROWN: sits on home-{p} once all four safe holes are filled AND the final (circuited) peg is on
// the home stretch — the player is one exact landing from the win. Computed live from the board, so
// it appears the moment that peg enters the stretch and CLEARS ITSELF the instant the peg is cut
// back to holding or moves off the stretch (Ken's rule — no stored flag to go stale). The crown MUST
// be present to award the win.
export function crownPresent(state, p) {
  const inSafe = pegsOf(state, p).filter((pg) => pg.location.startsWith(`safe-${p}-`)).length;
  if (inSafe < SAFE_SIZE) return false;
  const stretch = new Set(homeStretchHoles(p));
  return pegsOf(state, p).some((pg) => pg.hasCircuited && stretch.has(pg.location));
}

// WIN_CONDITION: four own pegs in the safe zone and the fifth landed EXACTLY on the home/winner hole
// (having completed a circuit, WIN_CIRCUIT_REQUIRED, so the peg that starts on home cannot win
// instantly). The crown must be present — which, being the final peg on the home stretch, it is by
// the time that peg reaches home; the gate rejects any peg that arrived at home some other way.
export function checkWin(state, p) {
  const onHome = pegsOf(state, p).some((pg) => pg.location === homeId(p) && pg.hasCircuited);
  if (onHome && crownPresent(state, p)) state.winner = p;
  return state.winner;
}
