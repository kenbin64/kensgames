// engine/rules.js
// Indexes the declarative rules document (fasttrack.rules.json) into a small,
// query-friendly API. This module is PURE: it takes the already-parsed JSON in,
// so it never touches the filesystem or the network and behaves identically in
// Node tests and in the browser. The rules live in the JSON; this file only
// makes them convenient to ask questions of. It never re-encodes a rule.

export function loadRules(doc) {
  if (!doc || !doc.cards || !doc.board) {
    throw new Error('loadRules: invalid rules document (missing cards or board)');
  }

  const cards = doc.cards;
  const ranks = Object.keys(cards);

  // Derive the canonical card sets straight from the card flags, so they can
  // never drift from the source of truth.
  const redrawSet = new Set(ranks.filter((r) => cards[r].extra_turn === true));
  const oneStepSet = new Set(ranks.filter((r) => cards[r].movement === 1));
  const entryFromHolding = new Set(ranks.filter((r) => cards[r].can_enter_from_holding === true));
  const bullseyeExit = new Set(ranks.filter((r) => cards[r].can_exit_bullseye === true));

  const ruleById = new Map((doc.rules || []).map((r) => [r.id, r]));

  return {
    meta: doc._meta,
    board: doc.board,
    setup: doc.setup,
    ranks,

    card: (rank) => cards[rank] || null,
    rule: (id) => ruleById.get(id) || null,
    rules: doc.rules || [],

    grantsExtraTurn: (rank) => redrawSet.has(rank),
    isOneStep: (rank) => oneStepSet.has(rank),
    canEnterFromHolding: (rank) => entryFromHolding.has(rank),
    canExitBullseye: (rank) => bullseyeExit.has(rank),

    // exposed for tests and callers that want the raw sets
    redrawSet,
    oneStepSet,
    entryFromHolding,
    bullseyeExit,
  };
}
