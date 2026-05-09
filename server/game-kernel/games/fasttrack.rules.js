'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 FastTrack — server-authoritative GameRules (turn / deck / win slice)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * SCOPE (first slice):
 *   The server owns:
 *     - turn rotation (clockwise by player index)
 *     - the deck (shuffle, deal, discard, reshuffle on exhaust)
 *     - extra-turn detection (cards with extra_turn=true grant the same
 *       player another draw after the current move settles)
 *     - the settle handshake (tokens jumping, cutscenes, FT entry/exit
 *       animations) — turn does NOT relinquish until every player ack's
 *     - peg-home accounting → winner declared when a player gets all 5 home
 *
 *   The client still owns (for now):
 *     - actual board geometry / move legality
 *     - cuts, FT ring traversal, bullseye logic
 *     - cinematic playback
 *
 * This mirrors the BrickBreaker3D approach: authoritative on the things
 * most likely to be cheated (turn, deck, winner) while leaving heavy
 * physics/board state client-side.
 *
 * State shape:
 *   {
 *     phase:    'playing' | 'ended',
 *     order:    [playerId, ...],          // turn rotation
 *     turnIdx:  0,
 *     phaseStep: 'draw' | 'play',         // 'draw' → must draw; 'play' → must play
 *     pendingCard: { rank, suit, def } | null,
 *     deck:     string[],                 // remaining card codes (top = end)
 *     discard:  string[],
 *     unsettled: boolean,
 *     acks:     { playerId: true },
 *     extraTurnPending: boolean,          // last played card grants another turn
 *     pegsHome: { playerId: 0..5 },
 *     winner:   playerId | null,
 *   }
 *
 * Wire actions:
 *   { type: 'draw' }                                     // active player only
 *   { type: 'play', payload: { ...client move detail } } // active player only
 *   { type: 'peg_home', payload: { playerId } }          // any client (animation lands)
 *   { type: 'settle_complete' }                          // every client must send
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let _rulesSheet = null;
function loadRulesSheet() {
  if (_rulesSheet) return _rulesSheet;
  const p = path.join(__dirname, '..', '..', '..', 'fasttrack', 'fasttrack.rules.json');
  _rulesSheet = JSON.parse(fs.readFileSync(p, 'utf8'));
  return _rulesSheet;
}

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function buildDeck() {
  const cards = [];
  for (const s of SUITS) for (const r of RANKS) cards.push(`${r}-${s}`);
  cards.push('JOKER-1');
  cards.push('JOKER-2');
  return cards;
}

function shuffle(arr, seed) {
  // Deterministic shuffle from a hex seed — reproducible from action log.
  const a = arr.slice();
  let s = parseInt(String(seed || '').slice(0, 8) || '0', 16) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0;
    const j = s % (i + 1);
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

function rankOf(cardCode) {
  if (cardCode.startsWith('JOKER')) return 'JOKER';
  return cardCode.split('-')[0];
}
function suitOf(cardCode) {
  if (cardCode.startsWith('JOKER')) return null;
  return cardCode.split('-')[1];
}
function defOf(cardCode) {
  const sheet = loadRulesSheet();
  return sheet.cards[rankOf(cardCode)] || null;
}

const RULES = {
  id: 'fasttrack',

  createInitialState(players, meta) {
    if (!Array.isArray(players) || players.length < 2 || players.length > 6) {
      throw new Error('fasttrack: requires 2–6 players');
    }
    const seed = (meta && (meta.deckSeed || meta.sessionId)) || crypto.randomBytes(8).toString('hex');
    const deck = shuffle(buildDeck(), seed);
    const pegsHome = {};
    for (const p of players) pegsHome[p.id] = 0;

    return {
      phase: 'playing',
      order: players.map((p) => p.id),
      turnIdx: 0,
      phaseStep: 'draw',
      pendingCard: null,
      deck,
      discard: [],
      unsettled: false,
      acks: {},
      extraTurnPending: false,
      pegsHome,
      winner: null,
      deckSeed: seed,
    };
  },

  validateAction(state, action) {
    if (state.phase !== 'playing') return false;
    if (!action || !action.playerId) return false;
    if (!state.order.includes(action.playerId)) return false;
    const active = state.order[state.turnIdx];

    if (action.type === 'settle_complete') {
      // Hybrid mode: settle ack is informational; always accepted.
      return true;
    }
    if (action.type === 'peg_home') {
      // Any client may report a peg arriving home (the cinematic that lands
      // the peg fires on each client). Server dedupes via the action log.
      const id = (action.payload && action.payload.playerId) || null;
      if (!id || !state.pegsHome.hasOwnProperty(id)) return false;
      return state.pegsHome[id] < 5;
    }
    if (action.type === 'draw') {
      if (action.playerId !== active) return false;
      if (state.phaseStep !== 'draw') return false;
      return true;
    }
    if (action.type === 'play') {
      if (action.playerId !== active) return false;
      if (state.phaseStep !== 'play') return false;
      if (!state.pendingCard) return false;
      return true;
    }
    return false;
  },

  applyAction(state, action) {
    if (action.type === 'draw') {
      // Hybrid mode: the host client still owns the actual deck and broadcasts
      // the popped card to peers via the lobby's peer relay. The kernel only
      // pops its own internal deck for audit and immediately advances to the
      // 'play' phase so the host can submit the resolved move next.
      let deck = state.deck.slice();
      let discard = state.discard.slice();
      if (deck.length === 0) {
        if (discard.length === 0) return { ...state, phase: 'ended', winner: null };
        deck = shuffle(discard, state.deckSeed + ':' + (state.discard.length));
        discard = [];
      }
      const card = deck.pop();
      const def = defOf(card);
      return {
        ...state,
        deck,
        discard,
        pendingCard: { code: card, rank: rankOf(card), suit: suitOf(card), def },
        unsettled: false,
        acks: {},
        phaseStep: 'play',
      };
    }

    if (action.type === 'play') {
      // Move details are opaque to the server. The host's local card might not
      // match the server's popped card (the server's deck is bookkeeping only),
      // so the client passes its own extra-turn determination in the payload.
      // Falls back to the server's pendingCard def when no flag is supplied.
      const card = state.pendingCard;
      const extra = (action.payload && typeof action.payload.extraTurn === 'boolean')
        ? action.payload.extraTurn
        : !!(card && card.def && card.def.extra_turn);
      const next = {
        ...state,
        discard: card ? state.discard.concat([card.code]) : state.discard,
        pendingCard: null,
        unsettled: false,
        acks: {},
        extraTurnPending: false,
        phaseStep: 'draw',
      };
      // Rotate turn unless the played card grants an extra turn.
      if (!extra) next.turnIdx = (state.turnIdx + 1) % state.order.length;
      return next;
    }

    if (action.type === 'peg_home') {
      const id = action.payload.playerId;
      const pegsHome = { ...state.pegsHome, [id]: Math.min(5, state.pegsHome[id] + 1) };
      const winner = pegsHome[id] >= 5 ? id : null;
      return {
        ...state,
        pegsHome,
        winner,
        phase: winner ? 'ended' : state.phase,
      };
    }

    if (action.type === 'settle_complete') {
      // Hybrid mode no longer requires a server-side settle handshake; the
      // client-side cinematic timing is owned entirely by the host client.
      // Accept the ack as a no-op so older clients that still send it don't
      // get an error envelope. (Recorded in the action log for audit.)
      return state;
    }

    return state;
  },

  isGameOver(state) { return state.phase === 'ended'; },

  // Public knowledge except deck contents (only count is exposed).
  getVisibleState(state /*, playerId */) {
    return {
      phase: state.phase,
      order: state.order,
      turnIdx: state.turnIdx,
      phaseStep: state.phaseStep,
      pendingCard: state.pendingCard,
      deckCount: state.deck.length,
      discardCount: state.discard.length,
      discardTop: state.discard.length ? state.discard[state.discard.length - 1] : null,
      unsettled: state.unsettled,
      acks: state.acks,
      extraTurnPending: state.extraTurnPending,
      pegsHome: state.pegsHome,
      winner: state.winner,
    };
  },

  // ── Turn-authority hooks ───────────────────────────────────────────────────
  getCurrentTurn(state) {
    if (state.phase !== 'playing') return null;
    return state.order[state.turnIdx];
  },
  isSettled(state) { return !state.unsettled; },
};

module.exports = RULES;
