// engine/turn.js
// The turn engine, render-decoupled by construction. It draws, lists legal moves, plays the
// chosen one (or forfeits), grants the extra turn purely by card membership, and rotates to the
// next player, all in pure logic with NO dependency on animation or render callbacks. This is
// the proven turn fix turned into an architectural guarantee: the rotation can never be gated by
// an animation that did or did not fire, so the turn-skipping class of bug cannot occur.
import { draw, discard } from './deck.js';
import { calculateValidMoves } from './moves.js';
import { applyMove } from './apply.js';

export function drawCard(state) {
  state.turn.card = draw(state.deck);     // the deck reshuffles the discard pile on exhaustion
  state.turn.phase = 'play';
  return state.turn.card;
}

export function legalMoves(state, R) {
  return calculateValidMoves(state, R, state.turn.card);
}

function rotate(state) {
  state.turn.current = (state.turn.current + 1) % state.players.length;
  state.turn.phase = 'draw';
}

// Resolve after the card was played or forfeited. A redraw card (A,6,J,Q,K,Joker) grants an
// extra turn for the same player whether or not a legal move was made (TURN_EXTRA,
// TURN_NO_LEGAL_MOVE); any other card ends the turn and rotates.
function resolve(state, R) {
  const rank = state.turn.card && state.turn.card.rank;
  discard(state.deck, state.turn.card);
  const extra = !!(rank && R.grantsExtraTurn(rank));
  state.turn.card = null;
  if (extra) { state.turn.phase = 'draw'; return { extraTurn: true, current: state.turn.current }; }
  rotate(state);
  return { extraTurn: false, current: state.turn.current };
}

// Play a chosen move (one of legalMoves), then resolve the turn. Stops at a win.
export function playMove(state, R, move) {
  if (state.winner != null) return { winner: state.winner };
  applyMove(state, R, move);
  if (state.winner != null) { state.turn.phase = 'over'; return { winner: state.winner }; }
  return resolve(state, R);
}

// No legal move: forfeit the card (redraw cards still grant the extra turn), then resolve.
export function forfeit(state, R) { return resolve(state, R); }

// One full turn step, given choose(moves, state) -> move (defaults to the first move). Draws,
// then plays the chosen move or forfeits if none. Useful for tests and AI drivers.
export function step(state, R, choose) {
  if (state.winner != null) return { winner: state.winner };
  drawCard(state);
  const moves = legalMoves(state, R);
  if (moves.length === 0) return forfeit(state, R);
  return playMove(state, R, choose ? choose(moves, state) : moves[0]);
}
