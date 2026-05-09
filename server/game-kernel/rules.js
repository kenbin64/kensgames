'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 GAME KERNEL — GameRules contract + registry
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * One contract every game implements so the lobby/GameMaster can host any
 * game without knowing its rules.
 *
 * Manifold alignment (HARD_RULES):
 *   x = identity   (player + seed)
 *   y = action     (modifier delivered via channel)
 *   z = state      (derived projection — never stored as the source of truth;
 *                   GameMaster persists actions to the seed log and re-derives)
 *
 * A GameRules module is therefore PURE:
 *   - createInitialState(players, meta)   → state seed (meta = session metadata)
 *   - validateAction(state, action)       → boolean
 *   - applyAction(state, action)          → next state (no I/O, no mutation)
 *   - isGameOver(state)                   → boolean
 *   - getVisibleState(state, playerId)    → per-player projection (fog-of-war)
 *
 * Optional methods (turn-based games only — omit for real-time games):
 *   - getCurrentTurn(state)               → playerId | null   (active player)
 *   - isSettled(state)                    → boolean           (true when the
 *                                           current turn's effects have fully
 *                                           resolved; the GameMaster will not
 *                                           hand the turn to the next player
 *                                           until this returns true)
 *
 * Standard turn-control actions any turn-based ruleset should handle in
 * applyAction (the GameMaster routes them like any other action):
 *   { type: 'settle_complete' }   — client(s) signal cinematic / animation /
 *                                   token-jump / cutscene resolution finished;
 *                                   rules clear the un-settled flag and may
 *                                   advance the turn.
 *
 * GameAction shape:
 *   { type: string, payload: any, playerId: string, ts?: number }
 *
 * PlayerDescriptor shape:
 *   { id: string, name: string, isAI: boolean, slot?: number, meta?: object }
 *
 * Registration:
 *   registerRules({ id: 'tic-tac-toe', ...impl })
 *   getRules('tic-tac-toe')    → impl | null
 *   listRules()                → string[]
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const REQUIRED_METHODS = [
  'createInitialState',
  'validateAction',
  'applyAction',
  'isGameOver',
  'getVisibleState',
];

// Optional — turn-based rules implement these. Real-time rules omit them.
const OPTIONAL_METHODS = [
  'getCurrentTurn',   // (state) → playerId | null
  'isSettled',        // (state) → boolean
];

const _registry = new Map();

function _validateImpl(impl) {
  if (!impl || typeof impl !== 'object') {
    throw new TypeError('GameRules: impl must be an object');
  }
  if (typeof impl.id !== 'string' || !impl.id) {
    throw new TypeError('GameRules: impl.id must be a non-empty string');
  }
  for (const m of REQUIRED_METHODS) {
    if (typeof impl[m] !== 'function') {
      throw new TypeError(`GameRules[${impl.id}]: missing method ${m}`);
    }
  }
}

function registerRules(impl) {
  _validateImpl(impl);
  if (_registry.has(impl.id)) {
    // Re-registration is allowed (hot-reload) but logged via return value.
    _registry.set(impl.id, impl);
    return { id: impl.id, replaced: true };
  }
  _registry.set(impl.id, impl);
  return { id: impl.id, replaced: false };
}

function getRules(id) {
  return _registry.get(String(id || '')) || null;
}

function hasRules(id) {
  return _registry.has(String(id || ''));
}

function listRules() {
  return Array.from(_registry.keys());
}

function unregisterRules(id) {
  return _registry.delete(String(id || ''));
}

/**
 * Helper: build a GameAction from a raw inbound message + playerId.
 * Centralises the wire shape so the GameMaster doesn't reinvent it.
 */
function makeAction(playerId, msg) {
  return {
    type: String((msg && msg.type) || ''),
    payload: (msg && msg.payload) || {},
    playerId: String(playerId || ''),
    ts: Date.now(),
  };
}

/**
 * Detect whether a rules module participates in turn-based gating.
 * A ruleset is turn-based iff it implements getCurrentTurn().
 */
function isTurnBased(impl) {
  return !!(impl && typeof impl.getCurrentTurn === 'function');
}

module.exports = {
  REQUIRED_METHODS,
  OPTIONAL_METHODS,
  registerRules,
  getRules,
  hasRules,
  listRules,
  unregisterRules,
  makeAction,
  isTurnBased,
};
