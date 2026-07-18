// engine/deck.js
// The 54-card deck (standard 52 + 2 jokers), built from the rules document and
// shuffled deterministically from a seed so a game is reproducible and testable.
// PURE serializable data: the deck is plain state (no closures), and every
// operation is a deterministic function of that state and the seed. Reshuffle on
// exhaustion follows setup.deck (reshuffle_on_exhaustion from the discard pile).

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build the ordered 54-card deck straight from the rules (suits x ranks + jokers).
export function buildOrderedDeck(rules) {
  const d = rules.setup && rules.setup.deck;
  if (!d) throw new Error('deck: rules.setup.deck missing');
  const cards = [];
  let id = 0;
  for (const suit of d.suits) {
    for (const rank of d.ranks_per_suit) cards.push({ id: id++, rank, suit });
  }
  for (let j = 0; j < (d.jokers || 0); j++) cards.push({ id: id++, rank: 'JOKER', suit: null });
  return cards;
}

// Deterministic Fisher-Yates from a seed.
export function shuffleWith(cards, seed) {
  const out = cards.slice();
  const rnd = mulberry32(seed >>> 0);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}

export function createDeck(rules, seed = 1) {
  const ordered = buildOrderedDeck(rules);
  return { drawPile: shuffleWith(ordered, seed >>> 0), discardPile: [], seed: seed >>> 0, reshuffles: 0 };
}

// Draw the top card. If the draw pile is exhausted, reshuffle the discard pile
// deterministically (a fresh order derived from the seed and the reshuffle count).
// Mutates and returns the deck via the returned card; returns null only if nothing
// is left anywhere.
export function draw(deck) {
  if (deck.drawPile.length === 0) {
    if (deck.discardPile.length === 0) return null;
    deck.reshuffles += 1;
    deck.drawPile = shuffleWith(deck.discardPile, (deck.seed ^ (deck.reshuffles * 0x9E3779B1)) >>> 0);
    deck.discardPile = [];
  }
  return deck.drawPile.shift();
}

export function discard(deck, card) { if (card) deck.discardPile.push(card); }

// Cards still accounted for in the deck itself (a drawn card in a hand is not here).
export function totalInDeck(deck) { return deck.drawPile.length + deck.discardPile.length; }
