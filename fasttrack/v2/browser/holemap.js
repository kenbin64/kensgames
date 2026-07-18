// browser/holemap.js
// The only vocabulary differences between the v2 engine and the existing 3D renderer, in one
// place. The engine and the scene already agree on ft-{p}, side-left-{p}-{1..4}, outer-{p}-{0..3},
// home-{p}, side-right-{p}-{1..4}, and safe-{p}-{1..4} verbatim. Two things differ:
//   - holding: the engine uses hold-{p}-{1..4}; the renderer uses hold-{p}-{0..3} for the board,
//     and for a peg it wants the literal string 'holding' (it derives the slot from peg order).
//   - the center: the engine calls it 'center'; the renderer calls it 'bullseye'.
// PURE string functions, no state.

// A board-hole id as the RENDERER names it (used for board occupancy and animation paths).
export function toRenderHole(id) {
  if (id === 'center') return 'bullseye';
  const m = id.match(/^hold-(\d+)-(\d+)$/);
  if (m) return `hold-${m[1]}-${parseInt(m[2], 10) - 1}`;   // 1..4 -> 0..3
  return id;
}

// The holeId the renderer wants ON A PEG. Holding pegs report the literal 'holding'; the renderer
// places them into the four holding slots itself, in peg order.
export function pegHoleId(location) {
  if (location.startsWith('hold-')) return 'holding';
  if (location === 'center') return 'bullseye';
  return location;
}

// The renderer/HUD's holeType tag for a peg, from the engine location.
export function holeTypeOf(location) {
  if (location.startsWith('hold-')) return 'holding';
  if (location.startsWith('home-')) return 'home';
  if (location.startsWith('side-left-')) return 'side-left';
  if (location.startsWith('side-right-')) return 'side-right';
  if (location.startsWith('outer-')) return 'outer';
  if (location.startsWith('ft-')) return 'fasttrack';
  if (location.startsWith('safe-')) return 'safezone';
  if (location === 'center') return 'bullseye';
  return 'unknown';
}

// Map an engine path (array of engine hole ids) to renderer hole ids for the hop animation.
export function toRenderPath(path) {
  return Array.isArray(path) ? path.map(toRenderHole) : path;
}

// Suit word (rules.json) -> glyph the card face renders.
const SUIT_GLYPH = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };

// An engine card { id, rank, suit } -> the { value, suit, display, isRed } the UI expects. The card
// face parses the suit glyph out of `display`, so the glyph must be appended there.
export function cardFace(card) {
  if (!card) return null;
  if (card.rank === 'JOKER') return { value: 'JOKER', suit: '', display: 'JOKER', isRed: false };
  const glyph = SUIT_GLYPH[card.suit] || '';
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  return { value: card.rank, suit: glyph, display: card.rank + glyph, isRed };
}

// One-line human hint for the card, mirrors the proven getCardDescription.
const CARD_DESC = {
  A: 'Move 1 or enter', '2': 'Move 2', '3': 'Move 3', '4': 'Move 4 BACKWARD', '5': 'Move 5',
  '6': 'Move 6 or enter', '7': 'Split 7 (wild)', '8': 'Move 8', '9': 'Move 9', '10': 'Move 10',
  J: 'Move 1 / exit bullseye', Q: 'Move 1 / exit bullseye', K: 'Move 1 / exit bullseye',
  JOKER: 'Wild! Enter or move 1',
};
export function cardDescription(value) { return CARD_DESC[value] || ''; }
