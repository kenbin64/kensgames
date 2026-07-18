// engine/state.js
// The FastTrack game state model: players, pegs, the deck, and whose turn it is.
// The starting layout comes straight from the rules document (5 pegs per player:
// 4 in holding, 1 on the home/winner hole, per setup.peg_start_distribution), so
// it can never drift from the source of truth. PURE serializable data plus small
// query helpers; no DOM, no rendering.

import { holdId, homeId, CENTER } from './board.js';
import { createDeck } from './deck.js';

export function createState({ rules, players, seed = 1, firstPlayer = 0 }) {
  const setup = rules.setup;
  if (!Array.isArray(players) || players.length < setup.min_players || players.length > setup.max_players) {
    throw new Error(`state: player count must be ${setup.min_players}..${setup.max_players}`);
  }
  const pegsPerPlayer = setup.pegs_per_player;
  const inHolding = setup.peg_start_distribution.holding;
  const inHome = setup.peg_start_distribution.home;

  const playerList = players.map((pl, p) => ({
    index: p,
    name: pl.name || `Player ${p + 1}`,
    isAI: !!pl.isAI,
    wedge: p,
    color: pl.color || null,
  }));

  const pegList = [];
  for (let p = 0; p < players.length; p++) {
    let n = 0;
    for (let h = 1; h <= inHolding && n < pegsPerPlayer; h++, n++) {
      pegList.push({ player: p, n, location: holdId(p, h), onFastTrack: false, hasCircuited: false });
    }
    for (let h = 0; h < inHome && n < pegsPerPlayer; h++, n++) {
      pegList.push({ player: p, n, location: homeId(p), onFastTrack: false, hasCircuited: false });
    }
  }

  return {
    players: playerList,
    pegs: pegList,
    deck: createDeck(rules, seed),
    turn: { current: firstPlayer % players.length, phase: 'draw', card: null, extraTurn: false },
    winner: null,
  };
}

// ---- query helpers (single source of truth is the peg list) ----
export function pegsOf(state, player) { return state.pegs.filter((pg) => pg.player === player); }
export function occupantOf(state, holeId) { return state.pegs.find((pg) => pg.location === holeId) || null; }
export function isCenterOccupied(state) { return state.pegs.some((pg) => pg.location === CENTER); }
export function pegByPlayerN(state, player, n) { return state.pegs.find((pg) => pg.player === player && pg.n === n) || null; }
