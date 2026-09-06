// FastTrack — Manifold Substrate Implementation (Full 133-Hole Rules)
// ═══════════════════════════════════════════════════════════════════════════
// CORE GAME LOGIC — No renderer. Shared by 2D Canvas and 3D Three.js.
// z = x·y on the 7-section helix
// ═══════════════════════════════════════════════════════════════════════════

// ─── RepresentationTable (browser-side, mirrors core API) ────
class RepresentationTable {
  constructor(name) { this.name = name; this._data = new Map(); }
  set(key, value) { this._data.set(key, value); }
  get(key) { return this._data.get(key); }
  has(key) { return this._data.has(key); }
  delete(key) { return this._data.delete(key); }
  keys() { return Array.from(this._data.keys()); }
  get size() { return this._data.size; }
}

const state = {
  players: new RepresentationTable('ft:players'),
  board: new RepresentationTable('ft:board'),
  deck: new RepresentationTable('ft:deck'),
  turn: new RepresentationTable('ft:turn'),
  movement: new RepresentationTable('ft:movement'),
  safeZone: new RepresentationTable('ft:safeZone'),
  meta: new RepresentationTable('ft:meta'),
  // ─── Substrate Matrices (manifold dimensional tables) ───
  cards: new RepresentationTable('ft:cards'),   // card(id)|suit[d](glyph)|rank(glyph)|moves|release|replay
  holes: new RepresentationTable('ft:holes'),   // hole(id)|number|type
  pegs: new RepresentationTable('ft:pegs'),    // peg(id)|color|position(hole)|state
  art: new RepresentationTable('ft:art'),     // art(name)|width|height|pixels(Uint8ClampedArray)
};

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS — single source of truth: fasttrack.rules.json
// Verified by test_card7_splits.js Scenario 10 (rules-sync); drift fails CI.
// ═══════════════════════════════════════════════════════════════════════════
const PEGS_PER_PLAYER = 5;   // rules.json :: setup.pegs_per_player
const SAFE_ZONE_SIZE = 4;   // rules.json :: geometry.safe_zone.holes_per_player
const PLAYER_COLORS = ['#FFC000', '#0050B5', '#CC0000', '#4B0082', '#A0522D', '#006400'];
const PLAYER_NAMES = ['Yellow', 'Blue', 'Red', 'Purple', 'Orange', 'Green'];

// Techy bot names — shuffled and assigned at game init
const BOT_NAME_POOL = [
  'Byte', 'Glitch', 'Pixel', 'Socket', 'Kernel', 'Cache', 'Vector', 'Turbo',
  'Nano', 'Codec', 'Probe', 'Cipher', 'Flux', 'Patch', 'Qubit', 'Voxel',
  'Daemon', 'Nexus', 'Sprite', 'Widget', 'Router', 'Mutex', 'Servo', 'Beacon',
  'Lattice', 'Modem', 'Tensor', 'Radar', 'Optic', 'Prism', 'Relay', 'Diode'
];
const _usedBotNames = new Set();
function assignBotName() {
  const available = BOT_NAME_POOL.filter(n => !_usedBotNames.has(n));
  const pick = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : `Unit-${_usedBotNames.size + 1}`;
  _usedBotNames.add(pick);
  return pick;
}

// ═══════════════════════════════════════════════════════════════════════════
// CENTER TOAST SYSTEM (user_directive_2026-05-18)
// Lightweight, transient pop-overs anchored to the upper-center of the
// viewport. Used for:
//   • "Your turn"     — when a new turn starts
//   • "Redraw!"       — when an extra-turn card lands
//   • "No legal move" — when validMoves is empty and the turn will pass
// Toasts are pointer-events:none so they NEVER block the board, the peg
// bar, or any panel. They auto-dismiss after ~1.8s and gracefully replace
// each other so we never stack a tower of pop-ups.
// ═══════════════════════════════════════════════════════════════════════════
let _centerToastEl = null;
let _centerToastTimer = null;
let _centerToastReflow = null;
let _lastNoLegalMoveTurnStamp = null; // dedupe across updateUI re-renders
// When the active human draws a card with zero legal moves, relinquish the
// turn automatically after a brief beat (so the "no legal move" toast is seen)
// instead of forcing them to find the End-Turn hint or wait out the 12 s stuck
// watchdog. Mirrors the bot path + rules.json CARD_NO_LEGAL_MOVE. Single-shot
// per (player, card) via _lastNoLegalMoveTurnStamp; handle kept so a manual
// pass / redraw / turn advance can cancel a still-pending auto-relinquish.
let _noMoveAutoTimer = null;
const NO_MOVE_AUTO_PASS_MS = 2000;
function _clearNoMoveAutoTimer() {
  if (_noMoveAutoTimer) { clearTimeout(_noMoveAutoTimer); _noMoveAutoTimer = null; }
}

function _ensureCenterToastEl() {
  if (_centerToastEl && document.body.contains(_centerToastEl)) return _centerToastEl;
  const el = document.createElement('div');
  el.id = 'ft-center-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  // All styles inline so we don't rely on CSS shipping order.
  Object.assign(el.style, {
    position: 'fixed',
    top: '14%',
    left: '50%',
    transform: 'translate(-50%, -8px) scale(0.96)',
    padding: '10px 20px',
    fontSize: '20px',
    fontWeight: '800',
    letterSpacing: '0.5px',
    color: '#fff8d8',
    background: 'rgba(8, 12, 24, 0.82)',
    border: '2px solid rgba(212, 175, 55, 0.8)',
    borderRadius: '14px',
    boxShadow: '0 6px 26px rgba(0,0,0,0.55), 0 0 18px rgba(212,175,55,0.35)',
    textShadow: '0 0 10px rgba(255,215,90,0.45)',
    pointerEvents: 'none',
    zIndex: '9000',
    opacity: '0',
    transition: 'opacity 180ms ease, transform 180ms ease',
    whiteSpace: 'nowrap',
    maxWidth: '90vw',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontFamily: 'inherit'
  });
  document.body.appendChild(el);
  _centerToastEl = el;
  return el;
}

function showCenterToast(text, accentColor, durationMs) {
  if (typeof document === 'undefined') return;
  const el = _ensureCenterToastEl();
  if (_centerToastTimer) { clearTimeout(_centerToastTimer); _centerToastTimer = null; }
  el.textContent = text;
  if (accentColor) {
    el.style.borderColor = accentColor;
    el.style.boxShadow = `0 6px 26px rgba(0,0,0,0.55), 0 0 18px ${accentColor}66`;
  }
  // Force a reflow so the transition runs even on rapid successive toasts.
  // (Reading offsetWidth is the canonical reflow trigger.)
  void el.offsetWidth;
  el.style.opacity = '1';
  el.style.transform = 'translate(-50%, 0) scale(1)';
  const dur = typeof durationMs === 'number' ? durationMs : 1800;
  _centerToastTimer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, -8px) scale(0.96)';
  }, dur);
}

function dismissCenterToast() {
  if (_centerToastTimer) { clearTimeout(_centerToastTimer); _centerToastTimer = null; }
  if (!_centerToastEl) return;
  _centerToastEl.style.opacity = '0';
  _centerToastEl.style.transform = 'translate(-50%, -8px) scale(0.96)';
}

// Back-compat shims for old call sites. These now emit the new center
// toast instead of doing nothing.
let _turnPopup = null;
let _turnPopupReflow = null;
function _positionDrawPrompt(_el) { /* legacy no-op */ }
function showYourTurnPopup(playerName, playerColor) {
  if (!playerName) return;
  // New turn => clear the no-legal-move dedupe so a stuck NEXT turn can toast.
  _lastNoLegalMoveTurnStamp = null;
  showCenterToast(`${playerName} — Your Turn`, playerColor || '#ffd633', 1800);
}
function dismissYourTurnPopup() {
  // Legacy callers used to clear the floating draw-prompt; route to the
  // generic dismiss so any active center toast clears too.
  dismissCenterToast();
}

function showRedrawToast(playerName, playerColor) {
  const who = playerName ? `${playerName}: ` : '';
  showCenterToast(`${who}Redraw! 🎴`, playerColor || '#7ad9ff', 2000);
}

function showNoLegalMoveToast(playerName, playerColor) {
  const who = playerName ? `${playerName}: ` : '';
  showCenterToast(`${who}No legal move — turn ends`, playerColor || '#ff9a7a', 2200);
}


function getBalancedBoardPosition(idx, count) {
  if (count === 2) return [0, 3][idx];
  if (count === 3) return [0, 2, 4][idx];
  if (count === 4) return [0, 1, 3, 4][idx];
  if (count === 5) return [0, 1, 2, 3, 4][idx];
  return idx;
}

// ═══════════════════════════════════════════════════════════════════════════
// PEG NICKNAME SYSTEM — Funny names assigned when pegs enter play
// ═══════════════════════════════════════════════════════════════════════════
const PEG_FUNNY_NAMES = [
  'Wobbles', 'Bonkers', 'Noodle', 'Turbo Snail', 'Zippy',
  'Bumblesnort', 'Wiggles', 'Tater Tot', 'Scooter', 'Pudding',
  'Wacky Wafer', 'Jellybean', 'Snickerdoodle', 'Goofball', 'Nugget',
  'Sprocket', 'Biscuit', 'Fizgig', 'Doodles', 'Rascal',
  'Waffle', 'Spaghetti', 'Kaboom', 'Donut', 'Kazoo',
  'Freckles', 'Pepperoni', 'Taco', 'Gadget', 'Pancake',
  'Pogo', 'Meatball', 'Banjo', 'Zigzag', 'Bloop',
  'Turnip', 'Pretzel', 'Wombat', 'Crouton', 'Pinwheel',
  'Clonk', 'Radish', 'Boomerang', 'Tornado', 'Pebble',
  'Sparky', 'Widget', 'Acorn', 'Gizmo', 'Confetti'
];
const _usedPegNames = new Set();

function assignPegNickname() {
  // Log all peg nicknames after assignment for debugging
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      if (window.state && window.state.players) {
        const players = window.state.players.get('list') || [];
        const allNicknames = players.flatMap((pl, pi) => (pl.pegs || []).map((peg, pj) => ({ player: pi, peg: pj, nickname: peg.nickname, id: peg.id })));
        console.log('[FT3D] All peg nicknames after assignment:', allNicknames);
      }
    }, 1000);
  }
  const available = PEG_FUNNY_NAMES.filter(n => !_usedPegNames.has(n));
  if (available.length === 0) {
    // Fallback: all names used, pick random with suffix
    const base = PEG_FUNNY_NAMES[Math.floor(Math.random() * PEG_FUNNY_NAMES.length)];
    const name = `${base} Jr.`;
    _usedPegNames.add(name);
    return name;
  }
  const name = available[Math.floor(Math.random() * available.length)];
  _usedPegNames.add(name);
  return name;
}

// ═══════════════════════════════════════════════════════════════════════════
// PEG PERSONALITY SYSTEM — Autonomous NPC pegs with emotions
// ═══════════════════════════════════════════════════════════════════════════
const PEG_PERSONALITIES = {
  AGGRESSIVE: {
    name: 'Aggressive', emoji: '😈',
    reactions: {
      onCutOpponent: ['Ha! Take that! 💪', 'Gotcha! 😈', 'Out of my way!', 'Sweet revenge! 🔥'],
      onGotCut: ['This isn\'t over! 😤', 'You\'ll pay for that!', 'Grr... 😡', 'I\'ll be back!'],
      onEnterFastTrack: ['SPEED! ⚡', 'Catch me if you can!', 'Zooom! 🏎️'],
      onEnterBullseye: ['Bullseye! 🎯', 'Center of attention!', 'Perfect shot!'],
      onEnterSafeZone: ['Safe at last! 😌', 'Can\'t touch this!', 'Home stretch! 🏆'],
      onWin: ['VICTORY! 🏆', 'I AM THE CHAMPION!', 'Bow down! 👑'],
      onNoLegalMove: ['Ugh, stuck! 😤', 'Come ON!', 'This is ridiculous!']
    },
    moveWeights: { capture: 100, fasttrack: 20, safe: 10, risk: -10 }
  },
  APOLOGETIC: {
    name: 'Apologetic', emoji: '🥺',
    reactions: {
      onCutOpponent: ['Sorry! Had to do it... 🙏', 'Nothing personal! 💕', 'Forgive me! 😅'],
      onGotCut: ['Fair play... 😌', 'Well played! 👏', 'It happens... 🤷'],
      onEnterFastTrack: ['Yay, fast track! ✨', 'Wheee! 🎢', 'Here I go!'],
      onEnterBullseye: ['Made it! 🎯', 'Wow, center!', 'Lucky me! 🍀'],
      onEnterSafeZone: ['Phew, safe! 😮‍💨', 'Almost there!', 'Thank goodness!'],
      onWin: ['We did it! 🎉', 'Great game everyone!', 'Thank you! 💖'],
      onNoLegalMove: ['Oh no... 😟', 'Stuck... 😔', 'That\'s okay...']
    },
    moveWeights: { capture: 30, fasttrack: 40, safe: 60, risk: -50 }
  },
  SMUG: {
    name: 'Smug', emoji: '😏',
    reactions: {
      onCutOpponent: ['Too easy! 😏', '*snicker* 🤭', 'Amateur move...', 'Predictable!'],
      onGotCut: ['Lucky shot! 🙄', 'Won\'t happen again!', 'Hmph! 😤'],
      onEnterFastTrack: ['Obviously! 💅', 'As expected!', 'Too easy!'],
      onEnterBullseye: ['Naturally! 🎯', 'Perfect aim!', 'Of course!'],
      onEnterSafeZone: ['Like clockwork! ⏰', 'Told you so!', 'Easy!'],
      onWin: ['Was there any doubt? 💅', 'As I predicted!', 'Flawless! 👑'],
      onNoLegalMove: ['A minor setback! 🙄', 'Patience...', 'Strategy!']
    },
    moveWeights: { capture: 60, fasttrack: 50, safe: 40, risk: -20 }
  },
  TIMID: {
    name: 'Timid', emoji: '😰',
    reactions: {
      onCutOpponent: ['Eep! Sorry! 😱', 'I didn\'t mean to!', 'Oh no...'],
      onGotCut: ['*whimper* 😢', 'I knew it...', 'Oh dear...'],
      onEnterFastTrack: ['S-so fast! 😨', 'Whoa!', 'Scary!'],
      onEnterBullseye: ['I made it?! 😲', 'Really?!', 'Wow!'],
      onEnterSafeZone: ['Finally safe! 😮‍💨', 'Phew!', 'So relieved!'],
      onWin: ['Wait... I won?! 🥹', 'Really?!', 'Thank you! 💕'],
      onNoLegalMove: ['Of course... 😔', 'I expected this...', 'It\'s fine...']
    },
    moveWeights: { capture: 10, fasttrack: 15, safe: 100, risk: -80 }
  },
  CHEERFUL: {
    name: 'Cheerful', emoji: '😄',
    reactions: {
      onCutOpponent: ['Oops! Tag! 🏃', 'Got you! 😄', 'Fun!'],
      onGotCut: ['Good one! 👍', 'Nice move!', 'Ha! Got me!'],
      onEnterFastTrack: ['Wheeeee! 🎢', 'So fun!', 'Woohoo!'],
      onEnterBullseye: ['Bullseye! 🎯', 'Yippee!', 'So cool!'],
      onEnterSafeZone: ['Yay! Safe! 🎉', 'Almost there!', 'Exciting!'],
      onWin: ['GG everyone! 🎉', 'That was fun!', 'Great game! 💖'],
      onNoLegalMove: ['Next time! 😊', 'No worries!', 'Part of the game!']
    },
    moveWeights: { capture: 50, fasttrack: 50, safe: 50, risk: -30 }
  },
  DRAMATIC: {
    name: 'Dramatic', emoji: '🎭',
    reactions: {
      onCutOpponent: ['BEGONE! ⚔️', 'The stage is MINE!', 'Exit, stage left!'],
      onGotCut: ['BETRAYAL! 💔', 'Et tu?!', 'The TRAGEDY!'],
      onEnterFastTrack: ['DESTINY CALLS! ⚡', 'MY MOMENT!', 'TO GLORY!'],
      onEnterBullseye: ['THE SPOTLIGHT! 🎯', 'Center stage!', 'MAGNIFICENT!'],
      onEnterSafeZone: ['SANCTUARY! 🏰', 'AT LAST!', 'THE FINALE APPROACHES!'],
      onWin: ['STANDING OVATION! 👏', 'BRAVO! BRAVO! 🎭', 'THE CROWN IS MINE!'],
      onNoLegalMove: ['THE SUSPENSE! 😱', 'A plot twist!', 'PATIENCE!']
    },
    moveWeights: { capture: 70, fasttrack: 80, safe: 30, risk: -5 }
  }
};

const PERSONALITY_TYPES = Object.keys(PEG_PERSONALITIES);

function assignPegPersonality() {
  return PERSONALITY_TYPES[Math.floor(Math.random() * PERSONALITY_TYPES.length)];
}

function getPegReaction(peg, eventType) {
  const personality = PEG_PERSONALITIES[peg.personality] || PEG_PERSONALITIES.CHEERFUL;
  const reactions = personality.reactions[eventType];
  if (!reactions || reactions.length === 0) return null;
  return reactions[Math.floor(Math.random() * reactions.length)];
}

// ─── Card Matrix (manifold substrate) ────
// card(id) | suit[d](glyph) | rank(glyph) | move[s] | release(bool) | replay(bool)
// Suits are a dimensional set [♠,♥,♦,♣] — each rank manifests across 4 suits
// The matrix stores the rules per rank; individual deck cards carry their suit instance
const SUIT_GLYPHS = ['♠', '♥', '♦', '♣'];
const RANK_GLYPHS = {
  A: 'A', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', '10': '10', J: 'J', Q: 'Q', K: 'K', JOKER: '🃏'
};

// ── CARD 7 MODE ────────────────────────────────────────────────────────────
// The single switch that decides what a 7 does. Mirrors
// fasttrack.rules.json :: cards.7.mode, and test_card7_splits.js Scenario 10
// fails CI if the two drift apart.
//
//   'classic' — THE RULE. One playable peg moves exactly 7. With two or more
//               playable pegs the 7 may instead be split a + b = 7 across two
//               of them, each half independently legal. When both a solo 7 and
//               a split are legal, both are offered and the player chooses.
//   'wild'    — one peg moves any distance 1..7, no split. Retired 2026-09-04.
//
// This exists because the 7 rule has been changed several times and each change
// used to be made by editing the driver in one build, which left the other
// build, the dead code and the tests describing the previous rule. Changing the
// rule is now a one word edit here plus the same word in rules.json. Never add
// a second code path or a build flag for it.
const SEVEN_MODE = 'classic';

// The 7 is the only card carrying isWild, so this is really "is this a 7".
// It reads `moves` rather than `movement` on purpose: 'wild' mode temporarily
// pins `movement`, and a predicate that flipped to false mid-generation is
// exactly the kind of bug this file has had before.
function isSevenCard(r) {
  return !!(r && r.isWild && r.moves === 7);
}

// Build the card matrix into the substrate.
// Single source of truth: fasttrack.rules.json :: cards.{rank}.
// Each row is z-tagged with its rule coordinate (z = x*y, x=2 = card category).
// test_card7_splits.js Scenario 10 verifies row-by-row equivalence.
function buildCardMatrix() {
  const matrix = [
    // id    rank    moves  dir          release  replay  exitBullseye  isWild  noFastTrack   z
    ['A', 'A', 1, 'clockwise', true, true, false, false, false],   // z=2
    ['2', '2', 2, 'clockwise', false, false, false, false, false],   // z=4
    ['3', '3', 3, 'clockwise', false, false, false, false, false],   // z=6
    ['4', '4', 4, 'backward', false, false, false, false, true],    // z=8  (FT_LOSS_ON_4 z=48; CARD_4_BACKWARD z=36)
    ['5', '5', 5, 'clockwise', false, false, false, false, false],   // z=10
    ['6', '6', 6, 'clockwise', true, true, false, false, false],   // z=12 (CARD_6_DUAL z=34)
    ['7', '7', 7, 'clockwise', false, false, false, true, false],   // z=14 (CARD_7_SPLIT z=38; CARD_7_FT_HANDOFF z=42)
    ['8', '8', 8, 'clockwise', false, false, false, false, false],   // z=16
    ['9', '9', 9, 'clockwise', false, false, false, false, false],   // z=18
    ['10', '10', 10, 'clockwise', false, false, false, false, false],   // z=20
    ['J', 'J', 1, 'clockwise', false, true, true, false, false],   // z=22
    ['Q', 'Q', 1, 'clockwise', false, true, true, false, false],   // z=24
    ['K', 'K', 1, 'clockwise', false, true, true, false, false],   // z=26
    ['JOKER', '🃏', 1, 'clockwise', true, true, false, false, false],   // z=28
  ];
  for (const [id, rank, moves, direction, release, replay, exitBullseye, isWild, noFastTrack] of matrix) {
    state.cards.set(id, {
      id, rank: RANK_GLYPHS[id] || rank, glyph: rank,
      suits: id === 'JOKER' ? [''] : SUIT_GLYPHS.slice(),
      moves, direction, release, replay,
      exitBullseye, isWild, noFastTrack,
      // Legacy compat aliases
      movement: moves, canEnter: release, extraTurn: replay, canExitBullseye: exitBullseye
    });
  }
}

// Accessor — reads from the card substrate (legacy compat)
const CARDS = new Proxy({}, {
  get(_, rank) {
    return state.cards.get(rank) || null;
  },
  has(_, rank) {
    return state.cards.has(rank);
  }
});

// ─── 84-hole ordered track (the hexagonal manifold surface) ────
function buildOrderedTrack() {
  const track = [];
  for (let p = 0; p < 6; p++) {
    track.push(`ft-${p}`);
    for (let h = 4; h >= 1; h--) track.push(`side-left-${p}-${h}`);
    for (let h = 0; h < 4; h++)  track.push(`outer-${p}-${h}`);
    track.push(`home-${p}`);
    for (let h = 1; h <= 4; h++) track.push(`side-right-${p}-${h}`);
  }
  return track; // 14 × 6 = 84
}
const CLOCKWISE_TRACK = buildOrderedTrack();

// Hole type classifier
function getHoleType(holeId) {
  if (holeId.startsWith('ft-')) return 'fasttrack';
  if (holeId.startsWith('side-left-')) return 'side-left';
  if (holeId.startsWith('outer-')) return 'outer';
  if (holeId.startsWith('home-')) return 'home';
  if (holeId.startsWith('side-right-')) return 'side-right';
  if (holeId.startsWith('safe-')) return 'safezone';
  if (holeId === 'bullseye') return 'bullseye';
  return 'holding';
}

function getFastTrackBypassSegment(ftIdx) {
  const segment = [];
  for (let h = 4; h >= 1; h--) segment.push(`side-left-${ftIdx}-${h}`);
  for (let h = 0; h < 4; h++) segment.push(`outer-${ftIdx}-${h}`);
  segment.push(`home-${ftIdx}`);
  for (let h = 1; h <= 4; h++) segment.push(`side-right-${ftIdx}-${h}`);
  return segment;
}

function hasOwnPegOnHole(player, holeId, excludePegId = null) {
  if (!player || !Array.isArray(player.pegs)) return false;
  if (!holeId || holeId === 'bullseye') return false;
  return player.pegs.some(peg => peg && peg.id !== excludePegId && peg.holeId === holeId);
}

function canAdvanceFastTrackStep(player, fromFtIdx, toFtIdx, movingPeg) {
  // rules.json :: FT_RING_PASS_RELAX (z=72) — only the destination matters
  // for FT-ring traversal. Own pegs sitting on the regular outer/home/side
  // segment of any bypassed pocket do NOT block the FT step (they aren't on
  // the FT path at all). Earlier guard here mistakenly inspected the bypass
  // segment and silently suppressed legal FT moves; user_directive_2026-05-18.
  if (hasOwnPegOnHole(player, `ft-${toFtIdx}`, movingPeg && movingPeg.id)) {
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🜂 MANIFOLD BUS HELPERS
// All game events flow through these two helpers into the substrate lenses.
// ═══════════════════════════════════════════════════════════════════════════
let _turnCounter = 0;

function _manifoldEmit(type, data = {}) {
  window.dispatchEvent(new CustomEvent('manifold:game-event', { detail: { type, data } }));
}

function _manifoldStateUpdate() {
  const pList = state.players.get('list') || [];
  let pegsInPlay = 0;
  pList.forEach(p => p.pegs.forEach(pg => { if (pg.holeId !== 'holding') pegsInPlay++; }));
  window.dispatchEvent(new CustomEvent('manifold:state-update', {
    detail: {
      turnNumber: _turnCounter,
      pegsInPlay,
      totalPegs: pList.length * PEGS_PER_PLAYER,
      totalPlayers: pList.length,
    }
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════
// config: { humanName, humanAvatar, aiDifficulty }
function initGame(playerCount = 2, config = {}) {
  const humanName = (config.humanName || '').trim() || 'You';
  const humanAvatar = config.humanAvatar || '🎮';
  const aiDifficulty = config.aiDifficulty || 'normal';
  const sessionPlayers = Array.isArray(config.sessionPlayers)
    ? config.sessionPlayers.filter(p => p && typeof p === 'object')
    : null;
  _usedPegNames.clear();
  _usedBotNames.clear();
  const effectiveCount = (sessionPlayers && sessionPlayers.length >= 2)
    ? sessionPlayers.length
    : playerCount;
  state.players.set('count', effectiveCount);
  // Provisional — final starting seat is chosen AFTER the roster is built
  // (so winner-name lookup can match against the new roster). See the
  // "Starting-player selection" block lower in this function.
  TurnManager.reset();
  TurnManager.set(0, 'init');
  // Reset host-authoritative turn-rotation counters for the new game.
  _turnSeq = 0;
  _lastAppliedTurnSeq = 0;
  if (window.CameraDirector) window.CameraDirector.setActivePlayer(0);

  // ─── Card Matrix (substrate) ───
  buildCardMatrix();

  // ─── Hole Matrix (substrate) ───
  // hole(id) | number | type
  let holeNum = 0;
  for (const holeId of CLOCKWISE_TRACK) {
    state.holes.set(holeId, { id: holeId, number: holeNum++, type: getHoleType(holeId) });
    state.board.set(holeId, null);
  }
  for (let p = 0; p < 6; p++) {
    for (let h = 1; h <= SAFE_ZONE_SIZE; h++) {
      const id = `safe-${p}-${h}`;
      state.holes.set(id, { id, number: holeNum++, type: 'safezone' });
      state.board.set(id, null);
    }
  }
  state.holes.set('bullseye', { id: 'bullseye', number: holeNum++, type: 'bullseye' });
  state.board.set('bullseye', null);
  // Holding area holes (4 per panel × 6 panels)
  for (let p = 0; p < 6; p++) {
    for (let h = 0; h < 4; h++) {
      const id = `hold-${p}-${h}`;
      state.holes.set(id, { id, number: holeNum++, type: 'holding' });
    }
  }

  // Deck
  state.deck.set('cards', createDeck());
  state.deck.set('discard', []);
  state.deck.set('currentCard', null);

  // Turn
  state.turn.set('phase', 'draw');
  state.turn.set('validMoves', []);

  // Log
  state.safeZone.set('log', []);

  // Meta
  state.meta.set('winner', null);
  // ── Shared deterministic seed (manifold-first, Phase 1) ────────────────────
  // The deck (and any future RNG) blooms from ONE seed that is identical for
  // every client in a session, instead of each client running a private
  // Math.random() shuffle — the root cause of "everyone gets a different
  // board". In live MP the seed is the shared session code / id (every client
  // already holds the same one). Solo / same-screen derive a stable per-game
  // seed so the SAME code path runs for every mode (consistency across all
  // games is the goal). The seed source is consistent; only its value differs.
  const _sharedSeed = (config && config.sessionSeed != null && String(config.sessionSeed))
    ? String(config.sessionSeed)
    : ('solo-' + Math.floor(Math.random() * 0xFFFFFFFF).toString(16));
  state.meta.set('seed', _sharedSeed);
  state.meta.set('reshuffleCount', 0);
  state.meta.set('myUserId', config.myUserId || null);
  state.meta.set('gameMode', config.launchMode || 'solo');  // 'solo', 'private', 'same-screen'

  // Players — each gets 5 pegs: 4 in holding, 1 on home hole
  const players = [];
  const sessionBackedPlayers = (sessionPlayers && sessionPlayers.length >= 2)
    ? sessionPlayers.slice().sort((a, b) => {
      const sa = Number.isFinite(a.slot) ? a.slot : Number.MAX_SAFE_INTEGER;
      const sb = Number.isFinite(b.slot) ? b.slot : Number.MAX_SAFE_INTEGER;
      return sa - sb;
    })
    : null;

  for (let i = 0; i < effectiveCount; i++) {
    const bp = getBalancedBoardPosition(i, effectiveCount);
    const sp = sessionBackedPlayers ? sessionBackedPlayers[i] : null;
    const isBot = sp ? !!sp.is_ai : i > 0;
    const name = sp
      ? (sp.username || (isBot ? `🤖 Bot "${assignBotName()}"` : `Player ${i + 1}`))
      : (i === 0 ? humanName : `🤖 Bot "${assignBotName()}"`);
    const avatar = sp
      ? ((sp.avatar && (sp.avatar.emoji || sp.avatar)) || (isBot ? '🤖' : '🎮'))
      : (i === 0 ? humanAvatar : '🤖');

    const player = {
      index: i,
      name,
      avatar,
      userId: sp ? sp.user_id : null,
      // Per-seat level first, then the game-wide setting. The old form was
      //   sp && (sp.level || sp.aiDifficulty || aiDifficulty)
      // which short-circuits to undefined when there is no session player at
      // all, so a solo game launched without a roster gave every bot a null
      // difficulty and quietly ignored the one the player picked.
      aiDifficulty: isBot
        ? ((sp && (sp.level || sp.aiDifficulty)) || aiDifficulty || 'normal')
        : null,
      // Whose turn it is. Exactly one player in the array carries true.
      // Only TurnManager._writeFlags may set this; nothing else writes it.
      isTurn: false,
      color: PLAYER_COLORS[bp],
      boardPosition: bp,
      isBot,
      pegs: Array.from({ length: PEGS_PER_PLAYER }, (_, p) => ({
        id: `p${i}-peg${p}`,
        holeId: 'holding',
        holeType: 'holding',
        nickname: assignPegNickname(),
        onFasttrack: false,
        eligibleForSafeZone: false,
        lockedToSafeZone: false,
        completedCircuit: false,
        fasttrackEntryHole: null,
        mustExitFasttrack: false,
        // NPC personality & emotional state
        personality: assignPegPersonality(),
        mood: 'EAGER',
        captureCount: 0,
        timesCaptured: 0,
        rivalPegId: null,
      }))
    };
    // Place first peg on the player's home hole to start
    const homeHole = `home-${bp}`;
    player.pegs[0].holeId = homeHole;
    player.pegs[0].holeType = 'home';
    state.board.set(homeHole, { playerIdx: i, pegId: player.pegs[0].id });

    players.push(player);
  }
  state.players.set('list', players);

  // ── Roster integrity check (user_directive_2026-07-18d) ────────────
  // Player count, players[] array size, and the number of seats that actually
  // hold a peg on the board must all agree, in seat order. A mismatch means a
  // desync (a missing / extra seat) that would corrupt the round-robin — surface
  // it loudly instead of seeding a turn order we can't trust.
  (function _validateRoster() {
    const arr = state.players.get('list') || [];
    const withPeg = arr.filter(p => (p.pegs || []).some(pg => pg.holeId && pg.holeId !== 'holding')).length;
    const inOrder = arr.every((p, i) => p && p.index === i);
    if (arr.length !== effectiveCount || withPeg !== effectiveCount || !inOrder) {
      console.error(`[INIT] roster integrity FAILED — players=${effectiveCount} arraySize=${arr.length} seatsWithPeg=${withPeg} inSeatOrder=${inOrder}`);
    } else {
      console.log(`[INIT] roster OK — ${effectiveCount} players, each with a peg on the board, in seat order.`);
    }
  })();

  // ── Starting-player selection (user_directive_2026-05-18) ──────────
  // Priority:
  //   1. Explicit override via config.startingPlayer (host-authoritative MP).
  //   2. `ft.rematchWinnerName` written by Play-Again — winner of the
  //      previous game opens the next one. One-shot, cleared on use.
  //   3. Solo (exactly one human seat): that human ALWAYS goes first
  //      (deterministic). The original randomisation was for multi-human
  //      games; in solo it just made the human wait through 0..N-1 bot
  //      turns before ever playing (user_directive_2026-05-20c).
  //   4. Multi-human (same-screen / live MP with ≥2 humans): uniformly
  //      random among the HUMAN seats, so games don't always open on the
  //      same human and no human ever waits behind a bot at game start.
  //   5. All-bot roster (dev observer): uniformly random over all seats.
  //
  // Note for MP: each client computes independently; the host's choice is
  // broadcast via the existing _turnSeq mechanism shortly after, so any
  // initial divergence is reconciled by host authority within one tick.
  (function pickStartingSeat() {
    let startingIdx = -1;
    const explicit = Number.isInteger(config.startingPlayer) ? config.startingPlayer : -1;
    if (explicit >= 0 && explicit < effectiveCount) {
      startingIdx = explicit;
    } else {
      let rematchName = null;
      try { rematchName = localStorage.getItem('ft.rematchWinnerName'); } catch (_) { /* ignore */ }
      try { localStorage.removeItem('ft.rematchWinnerName'); } catch (_) { /* ignore */ }
      if (rematchName) {
        const target = String(rematchName).trim().toLowerCase();
        for (let i = 0; i < players.length; i++) {
          if (String(players[i].name || '').trim().toLowerCase() === target) {
            startingIdx = i;
            break;
          }
        }
      }
      if (startingIdx < 0) {
        // user_directive_2026-07-18d: the FIRST game of a session opens on a
        // uniformly random seat among ALL players; the randomiser is used ONLY
        // for the first game. Replays open on the previous winner (the rematch
        // branch above). No seat is privileged.
        //
        // BUGFIX 2026-09-05: this used a private Math.random(), so every client
        // in a session picked its OWN starting seat and the participants began
        // in different games before a single card was drawn. The deck was
        // already derived from the shared session seed; the starting seat was
        // not. That is the "everyone gets their own game" bug at its source, and
        // it also reads as skipped turns, because each client believes a
        // different seat is active. Reproduced by test_mp_convergence.js, which
        // caught participants disagreeing on `current` at turn zero.
        //
        // The seat now blooms from the SAME shared seed as the deck, using a
        // distinct sub-stream so it does not consume the deck's randomness.
        const _seed = state.meta.get('seed');
        const _codec = (typeof ManifoldCodec !== 'undefined' && ManifoldCodec)
          || (typeof window !== 'undefined' && window.ManifoldCodec)
          || (typeof globalThis !== 'undefined' && globalThis.ManifoldCodec)
          || null;
        if (_seed != null && _codec && typeof _codec.prng === 'function') {
          startingIdx = Math.floor(_codec.prng(`${_seed}:startingSeat`)() * effectiveCount);
        } else {
          // Loud on purpose. A silent fallback here is what let the original
          // divergence hide: the game looks fine locally and only breaks when a
          // second participant disagrees.
          console.warn('[INIT] no seeded RNG available — starting seat falls back to '
            + 'Math.random() and will NOT match other clients in a session');
          startingIdx = Math.floor(Math.random() * effectiveCount);
        }
      }
    }
    TurnManager.set(startingIdx, 'init');
    if (window.CameraDirector) window.CameraDirector.setActivePlayer(startingIdx);
    log(`Starting player: ${players[startingIdx]?.name || `Seat ${startingIdx + 1}`}`);
  })();

  // ─── Peg Matrix (substrate) ───
  // peg(id) | color | position(hole) | state
  // A snapshot replaces the players array wholesale, so the isTurn flags that
  // arrived belong to the SENDER's array. Re-stamp them from the turn index,
  // which is the value the snapshot is authoritative about.
  try { TurnManager._writeFlags(TurnManager.current()); } catch (_) {}
  // A snapshot legitimately relocates the turn; do not judge it as a jump.
  try { TurnManager._history.push({ from: -1, to: TurnManager.current(), reason: 'restore', at: Date.now(), seats: TurnManager.count() }); } catch (_) {}
  syncPegMatrix();

  // Deck
  shuffleDeck();
  log('Game started with ' + effectiveCount + ' players');

  // Disable draw until camera + avatar blink are done
  const drawBtn = document.getElementById('draw-btn');
  if (drawBtn) drawBtn.disabled = true;

  updateUI();
  renderBoard();

  // Initialize 3D player markers on rails, wait for camera, blink, then enable
  setTimeout(() => {
    if (window.updatePlayerMarkers) window.updatePlayerMarkers();

    // user_directive_2026-05-18 — use the ACTUAL starting seat (chosen
    // randomly or via rematch-winner stash above), not hardcoded index 0.
    // Otherwise when a bot is picked as first player, botTurn() never
    // fires and the game stalls waiting on a human at seat 0.
    const players0 = state.players.get('list') || [];
    const startIdx = state.players.get('current') || 0;
    const firstPlayer = players0[startIdx];

    const enableFirstTurn = () => {
      if (firstPlayer && firstPlayer.isBot) {
        // Bot's turn — dismiss the prompt; bot will drive itself.
        dismissYourTurnPopup();
        // In MP, only the host (game manager) drives bot turns.
        if (!_isMpMode() || _isHost()) setTimeout(botTurn, 400);
      } else {
        // Human turn: leave the DRAW CARD prompt up until they draw.
        // In MP, only enable the draw button for the local active player.
        // Otherwise a peer can click draw and play on the active player's
        // behalf (turn-skip bug).
        if (drawBtn && (!_isMpMode() || _isMyTurn())) drawBtn.disabled = false;
      }
    };

    const startBlink = () => {
      // Show "Your turn" popup for human players — in networked MP, only
      // for the LOCAL active player so peers don't see another player's
      // turn-start banner.
      if (firstPlayer && !firstPlayer.isBot) {
        const mpMode = _isMpMode();
        const showFirstPopup = mpMode ? _isMyTurn() : true;
        if (showFirstPopup) {
          showYourTurnPopup(firstPlayer.name, firstPlayer.color);
          // Popup persists until the player draws a card (drawCard() calls
          // dismissYourTurnPopup). No auto-timeout.
        }
      }
      if (window.blinkPlayerMarker) {
        window.blinkPlayerMarker(startIdx, enableFirstTurn);
      } else {
        enableFirstTurn();
      }
    };

    if (window.CameraDirector && window.CameraDirector.mode === 'auto') {
      // Same freeze-proofing as _applyTurnAdvance: the opener must be enabled
      // even if the camera never reports settled. Fire on settle OR fallback, once.
      let _blinkStarted = false;
      const _startBlinkOnce = () => { if (_blinkStarted) return; _blinkStarted = true; startBlink(); };
      window.CameraDirector.whenSettled(_startBlinkOnce);
      setTimeout(_startBlinkOnce, 1200);
    } else {
      startBlink();
    }
  }, 500);
}

// Sync peg matrix substrate from player state
function syncPegMatrix() {
  const players = state.players.get('list') || [];
  for (const player of players) {
    for (const peg of player.pegs) {
      state.pegs.set(peg.id, {
        id: peg.id,
        color: player.color,
        position: peg.holeId,
        state: peg.holeId === 'holding' ? 'holding'
          : peg.lockedToSafeZone ? 'safe'
            : peg.onFasttrack ? 'fasttrack'
              : peg.holeId === 'bullseye' ? 'bullseye'
                : 'active',
        playerIdx: player.index,
        boardPosition: player.boardPosition,
        personality: peg.personality,
        mood: peg.mood,
      });
    }
  }
}

function createDeck() {
  const deck = [];
  const suits = ['♠', '♥', '♦', '♣'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  for (const s of suits) for (const v of values) deck.push({ value: v, suit: s, display: `${v}${s}` });
  deck.push({ value: 'JOKER', suit: '', display: '🃏' });
  deck.push({ value: 'JOKER', suit: '', display: '🃏' });
  return deck;
}

function shuffleDeck() {
  const deck = state.deck.get('cards') || [];
  // Deterministic, seed-derived order (manifold-first, Phase 1): every client
  // in a session derives the identical deck from the one shared seed, so the
  // deck — and therefore the whole game — blooms the same on every board. The
  // reshuffle counter advances the stream so each reshuffle of the discard
  // pile is a fresh-but-reproducible order, identical across clients.
  const seed = state.meta.get('seed');
  const codec = (typeof ManifoldCodec !== 'undefined' && ManifoldCodec)
    || (typeof window !== 'undefined' && window.ManifoldCodec)
    || (typeof globalThis !== 'undefined' && globalThis.ManifoldCodec)
    || null;
  if (seed != null && codec && typeof codec.seededShuffle === 'function') {
    const rc = state.meta.get('reshuffleCount') || 0;
    const shuffled = codec.seededShuffle(deck, `${seed}:${rc}`);
    state.meta.set('reshuffleCount', rc + 1);
    state.deck.set('cards', shuffled);
    return;
  }
  // Fallback (codec unavailable / no seed): legacy local shuffle. Non-
  // deterministic — only reached in degraded contexts (e.g. a bare unit
  // harness that didn't load the codec).
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  state.deck.set('cards', deck);
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTIPLAYER SYNC — drawCard / executeMove / reshuffle relay over KGMultiplayer
// ═══════════════════════════════════════════════════════════════════════════
// _mpClient is a KGMultiplayer instance set by 3d.html via setMultiplayerClient.
// _applying is true while we're re-running an action received from a peer so the
// commit path doesn't echo it back. _isMpMode() is true only when we're in a
// real session (not solo or same-screen).
let _mpClient = null;
let _applying = false;

// ── Game Manager (host-authoritative turn control) ────────────────────────
// The host is the sole authority on `state.players.current`. It runs the full
// simulation for every seat — its own turns and bots directly, every remote
// human's turn by replaying their relayed draw/move under the _applying guard
// — so its endTurn() fires once per turn for ALL players. The host's endTurn()
// advances current and broadcasts a 'turn_advance'; non-host peers never
// advance locally, they just clear their turn UI and commit the rotation when
// the host's broadcast arrives (idempotent via a fresh seq). A genuinely
// stalled remote seat is backstopped by the host's stuck-watchdog (which, on
// the host, watches whichever seat is current — not only its own).
// In solo / same-screen / non-MP modes, every endTurn advances directly.
let _turnSeq = 0;
let _lastAppliedTurnSeq = 0;
// NOTE: turn advancement is made exactly-once at the SOURCE — the `advanced`
// latch inside waitForAll() (see executeMove) fires advanceTurn a single time per
// move, no matter how many async callbacks (animation-done, cutscene-drain, the
// safety timeouts) end up calling it. There is deliberately NO persistent
// "already advanced" boolean: such a flag leaked across the turn boundary and
// blocked the NEXT player's legitimate pass/advance — and the manual host advance
// button — freezing the game (bug 2026-07-18). Rotation math + the redraw table
// are untouched; the watchdog/no-move fallbacks stay single-fire via their own
// state re-checks.

// ── Kernel adapter (slice 2 of the per-game GameKernel rollout) ──────────
// In hybrid mode the host client still owns the deck and broadcasts the popped
// card to peers via the legacy peer relay. The kernel runs alongside as a
// server-side validator: it confirms the active player matches the one taking
// the action and rotates its own turnIdx in lockstep. If the kernel never
// activates within ~1.5 s of game start (e.g. the lobby's KernelRouter isn't
// enabled for this gameId), the legacy peer relay continues to be the sole
// transport — zero behaviour change.
let _kernelClient = null;
let _kernelMode = false;

const _SYNC_TABLES = ['players', 'board', 'deck', 'turn', 'movement', 'safeZone', 'meta'];

function _tableToObject(table) {
  const out = {};
  const keys = table.keys();
  for (const key of keys) out[key] = table.get(key);
  return out;
}

function _replaceTableFromObject(table, nextObj) {
  const prevKeys = table.keys();
  for (const key of prevKeys) table.delete(key);
  for (const key of Object.keys(nextObj || {})) table.set(key, nextObj[key]);
}

function getStateSnapshot() {
  const snapshot = {};
  for (const name of _SYNC_TABLES) {
    snapshot[name] = _tableToObject(state[name]);
  }
  // JSON copy guarantees plain-serializable payload over socket transport.
  return JSON.parse(JSON.stringify(snapshot));
}

function applyStateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  for (const name of _SYNC_TABLES) {
    if (!snapshot[name] || typeof snapshot[name] !== 'object') return false;
  }
  // Debug: Log incoming snapshot and local state
  console.log('[SYNC] Applying state snapshot:', JSON.stringify(snapshot));
  // Preserve local-only identity that must NOT be overwritten by the host's
  // canonical broadcast (otherwise every peer adopts the host's userId and
  // thinks it is the active player).
  const localMyUserId = state.meta.get('myUserId');
  const localGameMode = state.meta.get('gameMode');
  console.log('[SYNC] Local myUserId before:', localMyUserId, 'gameMode:', localGameMode);
  for (const name of _SYNC_TABLES) {
    _replaceTableFromObject(state[name], snapshot[name]);
    // Debug: Log each table after replacement
    console.log(`[SYNC] Table '${name}' after sync:`, JSON.stringify(state[name]));
  }
  if (localMyUserId != null) state.meta.set('myUserId', localMyUserId);
  if (localGameMode != null) state.meta.set('gameMode', localGameMode);
  console.log('[SYNC] Local myUserId after:', state.meta.get('myUserId'), 'gameMode:', state.meta.get('gameMode'));
  syncPegMatrix();
  updateUI();
  renderBoard();
  return true;
}

// ── STATE COMMIT HOOK ──────────────────────────────────────────────────────
// Fires after any delta that changes authoritative game state: a draw, a move,
// a turn rotation. The transport layer subscribes to it and broadcasts the
// resulting state to every participant, which is what keeps all seats holding
// the SAME game.
//
// Why a hook rather than calling the publisher directly: the core must stay
// transport agnostic. It knows when state changed; it must not know whether
// that goes out over Colyseus, the socket relay, or nothing at all in solo.
//
// It deliberately fires even while _applying is true. When the host replays a
// peer's move it is _applying, but the result IS the authoritative outcome and
// is exactly the delta the other seats need. Suppressing it there is what left
// peers to re-simulate on their own and drift apart.
let _onStateCommitted = null;

function setStateCommittedHandler(fn) {
  _onStateCommitted = typeof fn === 'function' ? fn : null;
}

function _commitState(reason) {
  if (!_onStateCommitted) return;
  try { _onStateCommitted(reason); }
  catch (err) { console.warn('[ft-mp] state-committed handler failed', reason, err); }
}

function setMultiplayerClient(client) {
  _mpClient = client || null;
  // Tear down any previous kernel adapter (e.g. on rematch / new session).
  if (_kernelClient) { try { _kernelClient.destroy(); } catch (_) { } }
  _kernelClient = null;
  _kernelMode = false;
  // Debug: Log multiplayer client set and mode
  console.log('[SYNC] setMultiplayerClient called. Client:', _mpClient);
  // BUGFIX (turn-rotation): setMultiplayerClient is only ever invoked when a
  // real network session is being attached (see fasttrack-3d.js — never in
  // solo). If state.meta.gameMode somehow leaked through as 'solo' (stale
  // KG_Game cache, missing URL params, lobby handoff regression), the
  // _isMpMode() guard returned false and endTurn() / drawCard() ran the
  // local-only branch — host advanced to slot 1 with NO turn_advance
  // broadcast and never gated their own UI, so host played every seat.
  // Force the game mode into a live MP value the moment a real client
  // attaches so the rotation + broadcast path is always taken.
  try {
    if (client && state && state.meta) {
      const cur = state.meta.get('gameMode');
      if (cur !== 'private' && cur !== 'public' && cur !== 'multiplayer') {
        state.meta.set('gameMode', 'multiplayer');
      }
    }
  } catch (_) { /* state may not be initialised yet — initGame will read this later */ }
  if (!client || typeof window === 'undefined' || typeof window.KGKernelClient !== 'function') return;
  _kernelClient = new window.KGKernelClient({
    client,
    myUserId: client.userId != null ? String(client.userId) : null,
  });
  _kernelClient.on('active', () => { _kernelMode = true; });
  _kernelClient.on('legacy', () => { _kernelMode = false; });
  _kernelClient.on('error', (e) => console.warn('[ft-kernel] rejected', e));
  // The kernel's `state` envelope is parallel to the host-relayed deck/board,
  // so we do not consume it for UX; we only read it for audit when needed.
}

// Map the local FastTrack player index to the kernel's playerId (= ws user_id).
function _activePlayerKernelId() {
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const p = players[ci];
  return (p && p.userId != null) ? String(p.userId) : null;
}

function setMyUserId(userId) {
  state.meta.set('myUserId', userId || null);
}

function updateSessionRoster(sessionPlayers) {
  const incoming = Array.isArray(sessionPlayers) ? sessionPlayers : null;
  if (!incoming || incoming.length < 2) return;
  // Debug: Log roster update
  console.log('[SYNC] updateSessionRoster called. Players:', JSON.stringify(sessionPlayers));
  const sorted = incoming.slice().sort((a, b) => {
    const sa = Number.isFinite(a && a.slot) ? a.slot : Number.MAX_SAFE_INTEGER;
    const sb = Number.isFinite(b && b.slot) ? b.slot : Number.MAX_SAFE_INTEGER;
    return sa - sb;
  });
  const players = state.players.get('list') || [];
  if (!players.length) return;
  for (let i = 0; i < players.length && i < sorted.length; i++) {
    const sp = sorted[i] || null;
    if (!sp) continue;
    players[i].userId = sp.user_id || players[i].userId || null;
    // A roster sync must NEVER flip an established HUMAN seat into a bot.
    // Index-mapping a stale / slot-misaligned roster echo onto the seats and
    // doing `isBot = sp.is_ai` is exactly what let "bots take over and skip
    // me": the local player's seat got isBot=true, so enableTurn auto-played
    // it (botTurn) and the turn advanced past the human. Human->bot only
    // happens via the explicit Break button or a dedicated replace-with-bot
    // event, never a routine roster refresh. Bot->human (a real player joining
    // a bot slot) is still allowed.
    if (!(players[i].isBot === false && !!sp.is_ai)) {
      players[i].isBot = !!sp.is_ai;
    }
    players[i].name = sp.username || sp.name || players[i].name;
    players[i].avatar = (sp.avatar && (sp.avatar.emoji || sp.avatar)) || sp.avatar_id || players[i].avatar;
  }
  state.players.set('list', players);
  updateUI();
}

function _isMpMode() {
  // Belt-and-suspenders: a real KGMultiplayer client is only ever attached
  // in live MP (see setMultiplayerClient comment). If one is present, treat
  // this as MP regardless of state.meta.gameMode — that string has too many
  // legacy paths that can leak 'solo' into a networked game and silently
  // disable the turn_advance broadcast.
  if (_mpClient) return true;
  const mode = state.meta.get('gameMode');
  return mode === 'private' || mode === 'public' || mode === 'multiplayer';
}

function _myUserId() {
  const meta = state.meta.get('myUserId');
  if (meta) return meta;
  if (_mpClient && _mpClient.userId) return _mpClient.userId;
  // game_manager.js stashes the resolved id here during lobby handoff.
  try {
    const stash = (typeof sessionStorage !== 'undefined') && sessionStorage.getItem('ft_my_user_id');
    if (stash) return stash;
  } catch (_) { }
  return null;
}

function _activePlayerUserId() {
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const p = players[ci];
  return (p && p.userId) || null;
}

// Stable cross-client identity for a seat. Prefer userId (assigned from the
// server roster); fall back to the display name. Turn rotation targets a
// PLAYER via this identity, not a raw seat index — peer roster ordering is not
// guaranteed to match the host's, so a bare index can land on the wrong seat.
function _seatIdentity(p) {
  if (!p) return '';
  return String(p.userId || p.name || '');
}

// True when the local client is the ONLY human in the game (true solo,
// solo-vs-bots, or a stale-cache game that came up in MP mode with no peer).
// Such a game has nobody to coordinate with, so this client owns every
// decision and the MP turn-gating must collapse to solo behaviour — otherwise
// an ambiguous identity match locks the lone human out of drawing, moving, or
// relinquishing. Real multiplayer (2+ humans) is unaffected.
function _loneHuman() {
  // Prefer the SESSION's human count — the relay's player list is the source of
  // truth for who is actually connected. The local players[] roster can come up
  // stale/corrupted (a real 2nd human mislabeled as a bot); treating THAT as
  // "lone" wrongly promotes this peer to host AND to always-my-turn, so it
  // auto-plays other humans' seats — the exact "skipping players / extra turns /
  // strayed moves" cluster. Fall back to the local roster only pre-session.
  try {
    const sess = _mpClient && _mpClient.session;
    const sp = sess && Array.isArray(sess.players) ? sess.players : null;
    if (sp && sp.length) {
      return sp.filter(p => p && !p.is_ai).length <= 1;
    }
  } catch (_) { /* fall through to local roster */ }
  const players = state.players.get('list') || [];
  return players.filter(p => p && !p.isBot).length <= 1;
}

function _isMyTurn() {
  if (!_isMpMode()) return true;
  // Single-human authority: the lone human is never "not my turn". This keeps
  // the local player able to draw / move / relinquish on their turn, and lets
  // this client (the de-facto host) draw for the bots, regardless of how the
  // stale session left the userId/roster.
  if (_loneHuman()) return true;
  const me = _myUserId();
  const active = _activePlayerUserId();
  if (me && active) return String(me) === String(active);
  // Degraded fallback: lobby handoff didn't stash my_user_id (or the player
  // roster lacks user_id). Identify "me" by username match against the local
  // identity so the active player still sees their own turn UI instead of
  // being locked out forever (regression observed v0.5.5: turn 1 popup
  // shows from initGame's direct call but every subsequent turn's popup,
  // hints and instructions get gated off because _isMyTurn returned false).
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const ap = players[ci];
  if (!ap) return true;
  let myName = '';
  try {
    myName = (typeof localStorage !== 'undefined' && localStorage.getItem('username')) || '';
  } catch (_) { myName = ''; }
  if (myName && ap.name && String(myName).trim() === String(ap.name).trim()) return true;
  // BUGFIX (turn-skip): if the active player has a resolvable identity
  // (userId or a name distinct from ours) and we don't match, this is NOT
  // our turn — even if our own userId hasn't resolved yet. Returning true
  // here let the local player draw + play on the active peer's behalf
  // (e.g. on game start before `authenticated` fires), causing the peer's
  // turn to "flash" and snap back to us. Lock the UI in that case.
  if (active) return false;
  if (myName && ap.name && String(myName).trim() !== String(ap.name).trim()) return false;
  // Truly cannot identify either side — fall through to the permissive
  // fallback so the active tab isn't permanently locked out.
  if (!me) return true;
  return false;
}

function _isHost() {
  if (!_mpClient) return true;
  // Lone-client authority (user_directive_2026-06-06: "single games must be
  // consistent"). A client attached to the relay but NOT inside an established
  // session — a stale-cache "solo" that came up in MP mode, or a session that
  // never formed — is its own authority. Without this it is neither the human
  // nor a host, so no one drives the bots or advances past a bot's turn and
  // the game stalls after the first turn. Defer to the server's host flag only
  // when we are genuinely in a live session.
  if (!_mpClient.session) return true;
  // Single-human authority: a game with at most one human needs no remote
  // host — this client drives its own bots and turns (mirrors _isMyTurn).
  if (_loneHuman()) return true;
  return !!_mpClient.isHost;
}

// True when THIS client is allowed to drive (draw / move for) whoever is the
// CURRENT seat right now. Two cases:
//   1. It is genuinely my own turn (_isMyTurn), or
//   2. the current seat is a BOT and I am the host. The host is the sole
//      authority that runs bot turns in MP (see enableTurn / botTurn, which
//      both gate bot play on `_isHost()`).
//
// BUGFIX (bot-skip in MP with 2+ humans): drawCard() and executeMove() used to
// gate purely on `!_isMyTurn()`. When the host drove a bot's turn, the active
// seat was the BOT, so _isMyTurn() returned false (active userId = the bot, not
// the host) and BOTH the draw and the move bailed out. botTurn() then saw an
// empty validMoves and called endTurn(), rotating PAST the bot without it ever
// playing, i.e. the bot's turn was silently skipped (the user's "skips
// others"). The lone-human-plus-bots case happened to work only because
// _loneHuman() makes _isMyTurn() return true for every seat; with a second
// human present that shortcut is (correctly) gone, which is why the bug only
// showed up once a real peer joined. Allowing the host to act for a bot seat
// here closes the gap without touching real human turn gating: a non-host can
// still never act outside its own turn, and the host can still never act on
// another HUMAN's seat (that path is driven by replaying the peer's relayed
// draw/move under the _applying guard, not by this client deciding locally).
function _canDriveActiveSeat() {
  if (_isMyTurn()) return true;
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const cur = players[ci];
  return !!(cur && cur.isBot && _isHost());
}

function _broadcast(action, payload) {
  if (!_isMpMode()) return;
  // Echo-suppression: while _applying (re-running a peer's relayed action) we
  // must NOT re-broadcast that same draw/move back out. BUT 'turn_advance' is
  // generated authoritatively by the host, and the host reaches endTurn() WHILE
  // _applying is true whenever it is replaying a NON-HOST player's move. If we
  // suppressed it there, the host would advance locally but never tell the
  // peers, so a non-host player's turn-end never rotated on the other clients —
  // the host skipped ahead while the peer kept its turn. That is the
  // "skips some turns / gives multiple turns" desync. So let turn_advance
  // through under _applying; suppress every other action. (test_mp_turn_sync.js)
  if (_applying && action !== 'turn_advance') return;
  try { _mpClient.sendAction(action, payload || {}); }
  catch (err) { console.warn('[ft-mp] broadcast failed', action, err); }
  // Hybrid kernel pass: server-validated turn rotation + audit log.
  // Only the active player should send draw/play to the kernel; remote peers
  // receive the same deck mutation via the legacy relay above and would be
  // rejected as 'not-your-turn'. The host signs the action under its own
  // userId; the kernel rotates turnIdx upon receipt.
  if (!_kernelMode || !_kernelClient) return;
  if (action === 'draw' && _isMyTurn()) {
    _kernelClient.send('draw', {});
  } else if (action === 'move' && _isMyTurn()) {
    // Surface the local extra-turn flag so the server agrees on rotation
    // even though its own popped card may not match the host's local card.
    const move = (payload && payload.move) || {};
    const card = state.deck.get('currentCard') || null;
    const rules = card ? CARDS[card.value] : null;
    const extraTurn = !!(rules && rules.extraTurn);
    _kernelClient.send('play', { extraTurn, move });
  } else if (action === 'peg_home') {
    const id = (payload && payload.playerId) || null;
    if (id) _kernelClient.send('peg_home', { playerId: String(id) });
  }
}

// Re-run a peer's action locally under the _applying guard.
// Called by 3d.html via window.FastTrackCore.applyRemoteAction(action, payload).
function applyRemoteAction(action, payload) {
  if (!action) return;
  _applying = true;
  try {
    switch (action) {
      case 'draw': {
        // Inject the card the host actually drew so deck order matches.
        const card = payload && payload.card;
        if (!card) break;
        const deck = state.deck.get('cards') || [];
        // Remove one matching card from local deck (by display) so the local
        // deck stays in sync with the broadcaster's. If not found we still
        // proceed — _drawCardCommit uses the card from the payload, not the deck.
        const idx = deck.findIndex(c => c && c.display === card.display);
        if (idx >= 0) { deck.splice(idx, 1); state.deck.set('cards', deck); }
        _drawCardCommit(card);
        break;
      }
      case 'move': {
        const move = payload && payload.move;
        if (!move) break;
        // Replace local validMoves with this single resolved move so executeMove
        // operates on a known index. The local validMoves were already populated
        // by calculateValidMoves after the draw was applied above.
        state.turn.set('validMoves', [move]);
        executeMove(0);
        break;
      }
      case 'turn_done': {
        // A non-host reports that its seat has finished. Only the host acts on
        // it, because the host is the sole rotator.
        //
        // Idempotent by seat identity: if we already rotated (normally because
        // we applied that player's move a moment earlier) then the seat named
        // here is no longer the active one and this is a no-op. That is what
        // lets the sender fire it unconditionally at the end of every non-host
        // turn without any risk of double-advancing.
        if (!_isHost()) break;
        const players = state.players.get('list') || [];
        const ci = state.players.get('current') || 0;
        const cur = players[ci];
        if (!cur) break;
        const seatId = payload && payload.seatId != null ? String(payload.seatId) : null;
        if (seatId && _seatIdentity(cur) !== seatId) {
          console.log('[TURN] turn_done ignored — seat', seatId, 'already rotated off.');
          break;
        }
        console.log('[TURN] turn_done from', seatId, '— host rotating on its behalf.');
        // endTurn broadcasts turn_advance even under _applying (see _broadcast),
        // which is exactly the path this needs.
        endTurn(_turnEpoch);
        break;
      }
      case 'reshuffle': {
        const cards = payload && Array.isArray(payload.cards) ? payload.cards : null;
        if (!cards) break;
        state.deck.set('cards', cards.slice());
        state.deck.set('discard', []);
        break;
      }
      case 'turn_advance': {
        // Authoritative turn rotation broadcast by the player who just
        // ended their turn (or by the host on behalf of a bot).
        // Idempotent via seq.
        const from = payload && Number.isFinite(payload.from) ? payload.from : null;
        const next = payload && Number.isFinite(payload.next) ? payload.next : null;
        const nextId = payload && payload.nextId != null ? String(payload.nextId) : null;
        const seq = payload && Number.isFinite(payload.seq) ? payload.seq : 0;
        console.log('[TURN] applyRemoteAction: turn_advance received. from:', from, 'next:', next, 'nextId:', nextId, 'seq:', seq, 'lastApplied:', _lastAppliedTurnSeq, 'turnSeq:', _turnSeq);
        if (from === null || next === null) break;
        if (seq && seq <= _lastAppliedTurnSeq) {
          console.log('[TURN] applyRemoteAction: turn_advance seq too old, ignoring.');
          break;
        }
        _lastAppliedTurnSeq = seq || _lastAppliedTurnSeq;
        if (seq > _turnSeq) _turnSeq = seq;
        // Resolve the target seat by IDENTITY, not the raw index. Peer roster
        // ordering isn't guaranteed identical to the host's, so the host's
        // `next` index can point at a different player locally. Match nextId
        // against our own roster; fall back to the raw index only when we
        // can't resolve the identity. This is the fix for turns landing on the
        // wrong seat (skipped humans / strayed moves / no relinquish).
        let resolvedNext = next;
        if (nextId) {
          const list = state.players.get('list') || [];
          const byId = list.findIndex(p => _seatIdentity(p) === nextId);
          if (byId >= 0) {
            if (byId !== next) {
              console.warn('[TURN] turn_advance index/identity mismatch — host index', next, '→ local seat', byId, 'for', nextId, '(using identity)');
            }
            resolvedNext = byId;
          } else {
            console.warn('[TURN] turn_advance nextId', nextId, 'not in local roster; using raw index', next);
          }
        }
        _applyTurnAdvance(from, resolvedNext, seq);
        break;
      }
      case 'notice': {
        // Host broadcast: show a transient alert (idle warning / relinquish) to
        // every player so the whole table sees the same messaging.
        const msg = payload && payload.msg;
        if (msg) {
          try { if (typeof showCenterToast === 'function') showCenterToast(msg, (payload && payload.color) || '#ffcf6b', 3200); } catch (_) {}
          try { log(msg); } catch (_) {}
        }
        break;
      }
      case 'relinquish': {
        // Host replaced an idle player with a bot. Apply the roster change locally,
        // resolving the seat by identity when possible (peer ordering may differ),
        // else the raw index.
        const seatRaw = payload && Number.isFinite(payload.seat) ? payload.seat : null;
        const id = payload && payload.id != null ? String(payload.id) : null;
        const list = state.players.get('list') || [];
        let seat = seatRaw;
        if (id) { const byId = list.findIndex(p => _seatIdentity(p) === id); if (byId >= 0) seat = byId; }
        const cp = (seat != null) ? list[seat] : null;
        if (cp && !cp.isBot) {
          _AFK.away.set(seat, { name: cp.name, avatar: cp.avatar, isBot: cp.isBot, userId: cp.userId, reason: 'host-relinquish', at: Date.now() });
          cp.name = `${(payload && payload.name) || cp.name} (bot)`;
          cp.avatar = '🤖';
          cp.isBot = true;
          state.players.set('list', list);
          updateUI();
        }
        break;
      }
    }
  } finally {
    _applying = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DRAW CARD
// ═══════════════════════════════════════════════════════════════════════════
function drawCard() {
  if (state.turn.get('phase') !== 'draw') return;
  // Hard guard: even on a redraw / extra-turn card, the player must wait for
  // every peg hop and cutscene from the previous play to finish before drawing
  // again. The phase flips back to 'draw' only after waitForAll, but this is a
  // defense-in-depth check in case any code path skips that.
  if (typeof window.isPlayResolving === 'function' && window.isPlayResolving()) return;
  // Multiplayer: only the active player (or the host driving a bot seat) draws
  // locally; remote peers receive the card via applyRemoteAction and replay it
  // under the _applying guard. See _canDriveActiveSeat for the bot-skip bugfix.
  if (!_applying && _isMpMode() && !_canDriveActiveSeat()) return;
  dismissYourTurnPopup();

  let deck = state.deck.get('cards') || [];
  if (deck.length === 0) {
    deck = [...(state.deck.get('discard') || [])];
    state.deck.set('discard', []);
    state.deck.set('cards', deck);
    shuffleDeck();
    deck = state.deck.get('cards');
    log('Deck reshuffled');
    // Tell peers the post-shuffle deck order so their next remote draw matches.
    if (!_applying && _isHost()) _broadcast('reshuffle', { cards: deck.slice() });
  }

  const card = deck.pop();
  state.deck.set('cards', deck);
  _drawCardCommit(card);

  // Broadcast the actual card we drew so all peers replay the same value.
  if (!_applying) _broadcast('draw', { card });
}

// Commit a drawn card into local state + UI. Shared by drawCard (local actor)
// and applyRemoteAction (peer) so visual side-effects stay consistent.
function _drawCardCommit(card) {
  state.deck.set('currentCard', card);
  state.turn.set('phase', 'move');
  _splitPegIdx = null;
  _splitStepChoice = null;

  const cardEl = document.getElementById('current-card');
  if (cardEl) {
    const disp = String(card.display || card.value || '');
    // Extract suit symbol (♠♥♦♣) — last char by convention. Falls back gracefully.
    const m = disp.match(/([\u2660\u2665\u2666\u2663])/);
    const suit = m ? m[1] : '';
    const rank = suit ? disp.replace(suit, '') : disp;
    const isRed = suit === '♥' || suit === '♦';
    cardEl.innerHTML = `<div class="card-face ${isRed ? 'red' : 'black'}" data-suit="${suit}">
      <span class="cf-rank">${rank}</span><span class="cf-suit">${suit}</span>
    </div>`;
  }
  const infoEl = document.getElementById('card-info');
  if (infoEl) infoEl.textContent = getCardDescription(card.value);

  log(`${getCurrentPlayerName()} drew ${card.display}`);
  if (window.ManifoldAudio) ManifoldAudio.playCardDraw();
  _manifoldEmit('card', { deckSize: state.turn.get('deck')?.length || 0 });
  _turnCounter++;
  _manifoldStateUpdate();
  calculateValidMoves();
  updateUI();
  _commitState('draw');
}

function getCardDescription(v) {
  return {
    A: 'Move 1 or enter', '2': 'Move 2', '3': 'Move 3', '4': 'Move 4 BACKWARD',
    '5': 'Move 5', '6': 'Move 6 or enter', '7': 'Move 7, or split 7 between two pegs', '8': 'Move 8',
    '9': 'Move 9', '10': 'Move 10', J: 'Move 1 / exit bullseye', Q: 'Move 1 / exit bullseye',
    K: 'Move 1 / exit bullseye', JOKER: 'Wild! Enter or move 1'
  }[v] || '';
}



// ═══════════════════════════════════════════════════════════════════════════
// TRACK SEQUENCE — builds the path a peg can travel from its current hole
// ═══════════════════════════════════════════════════════════════════════════
function getTrackSequence(peg, player, direction) {
  const seq = [];
  const type = getHoleType(peg.holeId);
  const dir = direction || 'clockwise';
  const bp = player.boardPosition;
  const inSafe = player.pegs.filter(p => getHoleType(p.holeId) === 'safezone').length;
  const safeZoneFull = inSafe >= SAFE_ZONE_SIZE;
  const homeHole = `home-${bp}`;

  // Safe zone: can only move forward within safe zone
  if (type === 'safezone') {
    const m = peg.holeId.match(/safe-(\d+)-(\d+)/);
    if (m) {
      const num = parseInt(m[2]);
      for (let h = num + 1; h <= SAFE_ZONE_SIZE; h++) seq.push(`safe-${m[1]}-${h}`);
    }
    return seq;
  }

  // FastTrack backward (4 card)
  if (type === 'fasttrack' && dir === 'backward') {
    const ftIdx = parseInt(peg.holeId.replace('ft-', ''));
    const prev = (ftIdx - 1 + 6) % 6;
    for (let h = 4; h >= 1; h--) seq.push(`side-right-${prev}-${h}`);
    seq.push(`home-${prev}`);
    for (let h = 3; h >= 0; h--) seq.push(`outer-${prev}-${h}`);
    for (let h = 1; h <= 4; h++) seq.push(`side-left-${prev}-${h}`);
    seq.push(`ft-${prev}`);
    return seq;
  }

  // FastTrack forward (inner ring)
  // bugfix_2026-05-18 (v0.5.16): drop the `peg.onFasttrack` guard. Geometry
  // is authoritative — any peg whose holeId is an `ft-*` hole moving
  // forward MUST travel the FT ring; there is no perimeter path leaving an
  // ft-* hole. Previously, a peg that landed on ft-* via a regular `move`
  // (rather than the explicit `enterFastTrack` choice) had onFasttrack=false
  // and this branch was skipped, then perimeter lookup returned empty,
  // freezing all of that peg's future moves.
  if (type === 'fasttrack') {
    // rules.json :: FT_NO_PASS_OWN_FT (v3.2.0, user_directive_2026-05-20b)
    // The peg consumes the full card value. When the ring path crosses the
    // player's own ft-{bp}, the move continues through it into the home
    // stretch (safe-{bp}-1..4). The OLD behaviour — truncating at own FT —
    // is retired: stopping early discarded hops and removed legal choices.
    // Up-stream (calculateValidMoves) re-types this move as `exitFastTrack`
    // when the destination is own FT or own stretch so the UI/AI still
    // distinguish "left the ring" from "still on it".
    const ftIdx = parseInt(peg.holeId.replace('ft-', ''));
    let currentFt = ftIdx;
    let crossedOwnFt = false;
    for (let i = 1; i <= 6; i++) {
      const next = (ftIdx + i) % 6;
      if (!canAdvanceFastTrackStep(player, currentFt, next, peg)) break;
      seq.push(`ft-${next}`);
      currentFt = next;
      if (next === bp) { crossedOwnFt = true; break; }
    }
    if (crossedOwnFt) {
      // Continue past own ft-{bp} DOWN THE HOME STRETCH on the outer track,
      // hole-by-hole (side-left-{bp}-4..1 → outer-{bp}-0,1 → outer-{bp}-2
      // entrance → safe zone). Reaching own ft-{bp} completes the fast track,
      // so the peg is eligible to divert into safe at the entrance. This is
      // the SAME contiguous walk a perimeter approach makes — never a jump
      // from ft-{bp} straight into the safe zone. (no-teleport rule)
      const ownFtIdx = CLOCKWISE_TRACK.indexOf(`ft-${bp}`);
      const homeSafeEntry = `outer-${bp}-2`;
      for (let s = 1; s <= 12; s++) {
        const hole = CLOCKWISE_TRACK[(ownFtIdx + s) % CLOCKWISE_TRACK.length];
        if (hole === homeSafeEntry) {
          seq.push(hole);
          if (!safeZoneFull) {
            for (let h = 1; h <= SAFE_ZONE_SIZE; h++) {
              if (hasOwnPegOnHole(player, `safe-${bp}-${h}`, peg.id)) break;
              seq.push(`safe-${bp}-${h}`);
            }
          } else {
            // Safe zone full: 2 more holes to the winning hole, exact landing.
            seq.push(`outer-${bp}-3`);
            seq.push(`home-${bp}`);
          }
          break;
        }
        // Own peg blocks further travel (MOV_NO_PASS_OWN); ft-* are passable.
        if (hasOwnPegOnHole(player, hole, peg.id) && !hole.startsWith('ft-')) break;
        seq.push(hole);
      }
    }
    return seq;
  }

  // Perimeter track — use the ordered 102-hole array
  const idx = CLOCKWISE_TRACK.indexOf(peg.holeId);
  if (idx === -1) return seq;

  const len = CLOCKWISE_TRACK.length;
  const fwd = dir === 'clockwise';
  const safeEntry = `outer-${bp}-2`;   // safe-zone entrance (was stale -8; geometry: isSafeZoneEntry h===2)

  // IF the peg is already sitting exactly ON the safe entry gate,
  // and is eligible to enter, and is moving forward, build the safe sequence directly.
  if (peg.holeId === safeEntry && fwd && (peg.eligibleForSafeZone || peg.lockedToSafeZone)) {
    if (!safeZoneFull) {
      for (let h = 1; h <= SAFE_ZONE_SIZE; h++) seq.push(`safe-${bp}-${h}`);
    } else {
      // Safe zone is full: home hole becomes terminal; exact landing required.
      seq.push(`outer-${bp}-3`);
      seq.push(`home-${bp}`);
    }
    return seq;
  }

  for (let i = 1; i <= 30; i++) {
    const ni = fwd ? (idx + i) % len : (idx - i + len) % len;
    const holeId = CLOCKWISE_TRACK[ni];

    if (holeId === safeEntry && fwd && (peg.eligibleForSafeZone || peg.lockedToSafeZone)) {
      seq.push(holeId);
      if (!safeZoneFull) {
        for (let h = 1; h <= SAFE_ZONE_SIZE; h++) seq.push(`safe-${bp}-${h}`);
      } else {
        // Safe zone is full: home hole becomes terminal; exact landing required.
        seq.push(`outer-${bp}-3`);
        seq.push(`home-${bp}`);
      }
      break;
    }
    seq.push(holeId);

    // Once safe zone is full, home is the terminal winning hole.
    // Do not allow movement past home; overshooting becomes illegal.
    if (safeZoneFull && fwd && holeId === homeHole) {
      break;
    }
  }
  return seq;
}

// ═══════════════════════════════════════════════════════════════════════════
// MOVE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════
function calculateValidMoves() {
  let moves = [];
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const player = players[ci];
  const card = state.deck.get('currentCard');
  if (!card) { state.turn.set('validMoves', []); return; }
  const rules = CARDS[card.value];
  const bp = player.boardPosition;

  // ── FT EXIT OPTION ENUMERATOR (user_directive_2026-05-20e / FT_EXIT_ANY_HOLE) ──
  // Returns array of { path, dest } options for an FT peg consuming exactly N
  // hops via the leave-at-k semantics. Used by both the per-card emission
  // (_ftForward branch below) and the 7-split halves (so an FT peg with split
  // half value `a` enumerates min(a,D)+1 options for that half).
  // Closures: peg-dependent context (eligibleForSafeZone, holeId, id) is read
  // from the passed peg; player/bp/ci/CLOCKWISE_TRACK from outer scope.
  const _enumerateFtExitOptions = (peg, N) => {
    const opts = [];
    if (N < 1) return opts;
    if (!peg || !peg.holeId || !peg.holeId.startsWith('ft-')) return opts;
    const ftX = parseInt(peg.holeId.replace('ft-', ''));
    const D = (bp - ftX + 6) % 6;

    // Pre-walk inner ring (blocked by own peg on next ft-* via canAdvanceFastTrackStep).
    const ringDests = [];
    {
      let curr = ftX;
      const ringLimit = D === 0 ? 0 : D;
      for (let i = 0; i < ringLimit; i++) {
        const next = (ftX + i + 1) % 6;
        if (!canAdvanceFastTrackStep(player, curr, next, peg)) break;
        ringDests.push(`ft-${next}`);
        curr = next;
      }
    }
    const maxRing = ringDests.length;

    const _inSafe = player.pegs.filter(p => getHoleType(p.holeId) === 'safezone').length;
    const _safeZoneFull = _inSafe >= SAFE_ZONE_SIZE;
    const _safeEntry = `outer-${bp}-2`;   // safe-zone entrance (was stale -8; geometry: isSafeZoneEntry h===2)
    const _len = CLOCKWISE_TRACK.length;
    const walkOuter = (startFtIdx, hops) => {
      if (hops < 0) return null;
      if (hops === 0) return { path: [], dest: `ft-${startFtIdx}` };
      const startHole = `ft-${startFtIdx}`;
      const startIdx = CLOCKWISE_TRACK.indexOf(startHole);
      if (startIdx < 0) return null;
      // Leaving the ring at the player's OWN ft-{bp} means the peg just
      // completed the fast track — it is eligible to enter its home stretch
      // and safe zone on this move, even if its stored flag predates it.
      const _elig = peg.eligibleForSafeZone || peg.lockedToSafeZone || startFtIdx === bp;
      const path = [];
      for (let s = 1; s <= hops; s++) {
        const ni = (startIdx + s) % _len;
        const hole = CLOCKWISE_TRACK[ni];
        if (hole === _safeEntry && _elig) {
          path.push(hole);
          const remaining = hops - s;
          if (_safeZoneFull) {
            if (remaining === 0) return { path, dest: hole };
            if (remaining === 1) { path.push(`outer-${bp}-3`); return { path, dest: `outer-${bp}-3` }; }
            if (remaining === 2) { path.push(`outer-${bp}-3`); path.push(`home-${bp}`); return { path, dest: `home-${bp}` }; }
            return null;
          }
          if (remaining > SAFE_ZONE_SIZE) return null;
          for (let h = 1; h <= remaining; h++) {
            const sh = `safe-${bp}-${h}`;
            if (hasOwnPegOnHole(player, sh, peg.id)) return null;
            path.push(sh);
          }
          return { path, dest: path[path.length - 1] };
        }
        const occ = state.board.get(hole);
        if (occ && occ.playerIdx === ci) return null;
        path.push(hole);
      }
      return { path, dest: path[path.length - 1] };
    };

    // Enumerate leave-at-k options for k = 0..min(N, maxRing).
    // For EVERY k (including k === D, where the peg leaves the ring at its own
    // ft-{bp}), the remaining N-k hops are the SAME contiguous outer-track
    // walk via walkOuter. When k === D this walks the home stretch
    // (side-left-{bp}-4..1 → outer-{bp}-0,1 → outer-{bp}-2 entrance → safe),
    // hole-by-hole. There is no longer a special case that jumps from ft-{bp}
    // straight into the safe zone — reaching safe is always a walked journey
    // down the home stretch. (no-teleport rule; geometry-validated)
    // D == 0 (peg already on own ft-{bp}) falls out naturally: maxRing is 0,
    // so the only option is k = 0 → walkOuter(bp, N).
    for (let k = 0; k <= Math.min(N, maxRing); k++) {
      const ringSeg = ringDests.slice(0, k);
      const exitFt = (ftX + k) % 6;
      const w = walkOuter(exitFt, N - k);
      if (!w) continue;
      opts.push({ path: [...ringSeg, ...w.path], dest: w.dest });
    }

    return opts;
  };

  // ── PER-PEG MOVE COLLECTION ─────────────────────────────────────────
  // Extracted from the former 630-line monolith for readability. This is the
  // exact former `for (pi…)` loop body, now a named inner function so it still
  // closes over player / bp / ci / rules / card / state / moves /
  // _enumerateFtExitOptions. Behavior is byte-identical (verified against the
  // deterministic test_card7_splits.js fingerprint). Drivers are at the
  // bottom of calculateValidMoves, in the original execution order.
  function collectPegMoves(pi) {
    const peg = player.pegs[pi];

    // ENTER from holding (A, 6, JOKER)
    if (peg.holeType === 'holding' && rules.canEnter) {
      const homeHole = `home-${bp}`;
      const occ = state.board.get(homeHole);
      if (!occ || occ.playerIdx !== ci) {
        moves.push({ type: 'enter', pegIdx: pi, dest: homeHole });
      }
    }

    // EXIT BULLSEYE (J, Q, K) — exit to player's own FT hole; if occupied, previous unoccupied FT hole
    if (peg.holeId === 'bullseye' && rules.canExitBullseye) {
      let exitDest = null;
      // Try player's own FT hole first, then search backward
      for (let attempt = 0; attempt < 6; attempt++) {
        const ftHole = `ft-${(bp - attempt + 6) % 6}`;
        const occ = state.board.get(ftHole);
        if (!occ || occ.playerIdx !== ci) {
          exitDest = ftHole;
          break;
        }
      }
      if (exitDest) {
        moves.push({ type: 'exitBullseye', pegIdx: pi, dest: exitDest });
      }
    }

    // SAFE ZONE — pegs can only advance forward to the next unoccupied safe hole
    if (peg.holeType === 'safezone') {
      const safeMatch = peg.holeId.match(/safe-(\d+)-(\d+)/);
      if (safeMatch) {
        const safeBp = parseInt(safeMatch[1]);
        const safeSlot = parseInt(safeMatch[2]);
        // Only move forward (higher slot number) within safe zone
        for (let h = safeSlot + 1; h <= SAFE_ZONE_SIZE; h++) {
          const nextSafe = `safe-${safeBp}-${h}`;
          const occ = state.board.get(nextSafe);
          if (!occ) {
            const dist = h - safeSlot;
            if (dist === rules.movement) {
              const path = [];
              for (let s = safeSlot + 1; s <= h; s++) path.push(`safe-${safeBp}-${s}`);
              moves.push({ type: 'move', pegIdx: pi, dest: nextSafe, steps: dist, from: peg.holeId, path });
            }
            break; // can't jump over unoccupied holes
          }
        }
      }
    }

    // MOVE on perimeter (not safe zone — safe zone pegs handled above)
    if (peg.holeType !== 'holding' && peg.holeId !== 'bullseye' && peg.holeType !== 'safezone') {
      const dir = rules.direction;

      // ── FT-FORWARD ENUMERATION (user_directive_2026-05-20e) ──
      // rules.json :: FT_EXIT_ANY_HOLE (replaces FT_NO_PASS_OWN_FT / v3.2.0).
      // When a peg geometrically sits on an `ft-*` hole and the card is a
      // forward / FT-eligible card, the player chooses how many hops k
      // (0..min(N,D)) to spend on the inner ring before "leaving" the ring
      // back onto the outer rim. Remaining N-k hops are spent clockwise on
      // the outer rim. Reaching own ft-{bp} (k=D) FORCES exit into the home
      // stretch consuming N-D hops there (blocked only by own peg in stretch).
      // D = (bp - X + 6) % 6 = ring distance from ft-X to own ft-{bp}.
      // The 1-hit bullseye jump (peg on foreign ft-*, card movement===1) is
      // still emitted separately below — independent of this enumeration.
      const _ftForward = peg.holeId.startsWith('ft-') && dir === 'clockwise' && !rules.noFastTrack;

      if (_ftForward) {
        const N = rules.movement;
        const _ftOpts = _enumerateFtExitOptions(peg, N);
        for (const opt of _ftOpts) {
          moves.push({
            type: 'exitFastTrack', pegIdx: pi, dest: opt.dest,
            steps: N, from: peg.holeId,
            path: opt.path
          });
        }
        // Skip standard perimeter emission below for FT-forward pegs.
      } else {

        const trackSeq = getTrackSequence(peg, player, dir);
        const steps = rules.movement;

        if (trackSeq.length >= steps) {
          const dest = trackSeq[steps - 1];
          let blocked = false;
          for (let s = 0; s < steps; s++) {
            const h = trackSeq[s];
            const occ = state.board.get(h);
            // rules.json :: MOV_NO_PASS_OWN (z=9) — cannot pass own peg
            // rules.json :: FT_RING_PASS_RELAX (z=72) — `ft-*` intermediates exempt
            if (occ && occ.playerIdx === ci && s < steps - 1 && !h.startsWith('ft-')) {
              blocked = true; break;
            }
          }
          // rules.json :: MOV_NO_LAND_OWN (z=6) — cannot land on own peg
          const destOcc = state.board.get(dest);
          if (destOcc && destOcc.playerIdx === ci) blocked = true;
          if (!blocked) {
            // rules.json :: FT_NO_PASS_OWN_FT (v3.2.0) — an FT peg whose path
            // exits through own ft-{bp} into the stretch is classified as
            // `exitFastTrack` so the peg flips off FT and downstream UI / AI
            // see a real exit event. Pure on-ring continuations stay as `move`.
            const _exitsFt = peg.onFasttrack && dir === 'clockwise' &&
              (dest === `ft-${bp}` || dest.startsWith(`safe-${bp}-`));
            moves.push({
              type: _exitsFt ? 'exitFastTrack' : 'move',
              pegIdx: pi, dest, steps, from: peg.holeId,
              path: trackSeq.slice(0, steps)
            });

            // FT entry: offer the inner-ring jump whenever the peg LANDS on its
            // own ft-${bp} hole going clockwise. Starting position doesn't
            // matter — Bambi (or anyone) can hit FT from any outer-rim hole.
            // The peg must not already be on FT, the card must not be a
            // noFastTrack card, and the peg must not be flagged mustExitFasttrack.
            // bugfix_2026-05-19: previous code required peg.holeId === `home-${bp}`
            // which is geometrically unreachable from clockwise motion (own home
            // is 9 holes PAST own ft-${bp}, requiring a 75-step move), so the
            // FT-entry choice was effectively never generated.
            if (
              dir === 'clockwise' &&
              dest === `ft-${bp}` &&
              !peg.onFasttrack &&
              !rules.noFastTrack &&
              !peg.mustExitFasttrack
            ) {
              moves.push({ type: 'enterFastTrack', pegIdx: pi, dest, steps, from: peg.holeId, path: trackSeq.slice(0, steps) });
            }
          }
        }

        // ── PENULTIMATE FT HOLE → BULLSEYE CHOICE ──
        // rules.json :: BULL_ENTRY_PENULTIMATE (z=18) — !FT peg may divert to
        //               bullseye when penult lands on `ft-*` (clockwise only).
        // rules.json :: BULL_NO_FINAL_HOP_FROM_FT_TRAVERSAL (user_directive_2026-05-09)
        //               while traversing the FT inner ring, the final hop may
        //               NEVER be the bullseye. Only a 1-move card from a peg
        //               sitting on an ft-* hole may enter the bullseye.
        // rules.json :: BULL_NO_BACKWARD        (z=24) — `!rules.noFastTrack`.
        // rules.json :: BULL_MAX_ONE_PEG        (z=30) — bullseye occupancy check.
        // rules.json :: FT_RING_PASS_RELAX      (z=72) — own pegs on `ft-*`
        //               intermediates are passable; penult itself must be free.
        // rules.json :: BULL_PENULT_REACHABLE   (user_directive_2026-05-09)
        //               bullseye divert may only be offered when the regular
        //               full-step continuation is ALSO reachable AND the
        //               regular path itself was not blocked. Both alternatives
        //               must be genuine choices.
        if (dir === 'clockwise' && !rules.noFastTrack && !peg.onFasttrack &&
          !peg.holeId.startsWith('ft-') &&
          !peg.mustExitFasttrack && steps >= 2 && trackSeq.length >= steps) {
          const penultimate = trackSeq[steps - 2];
          const finalHole = trackSeq[steps - 1];
          if (penultimate && penultimate.startsWith('ft-')
            // user_directive_2026-05-18 — bullseye entry forbidden when the
            // launching ft-* is the player's OWN ft-{bp}. This mirrors
            // BULL_NO_FROM_OWN_FT for the 1-step rule and stops the
            // exit-bullseye → own-FT → re-enter-bullseye no-op loop.
            && penultimate !== `ft-${bp}`) {
            let bullPathBlocked = false;
            for (let s = 0; s < steps - 1; s++) {
              const h = trackSeq[s];
              const occ = state.board.get(h);
              if (occ && occ.playerIdx === ci) {
                if (s === steps - 2 || !h.startsWith('ft-')) {
                  bullPathBlocked = true; break;
                }
              }
            }
            // Penultimate ft-* itself must be unoccupied by own peg
            // (so peg can pivot to bullseye from it). Opponent on penult is OK.
            const penultOcc = state.board.get(penultimate);
            if (penultOcc && penultOcc.playerIdx === ci) bullPathBlocked = true;
            if (!bullPathBlocked) {
              const bullOcc = state.board.get('bullseye');
              if (!bullOcc || bullOcc.playerIdx !== ci) {
                moves.push({
                  type: 'enterBullseye', pegIdx: pi, dest: 'bullseye',
                  steps, from: peg.holeId,
                  path: [...trackSeq.slice(0, steps - 1), 'bullseye']
                });
              }
            }
          }
        }

        // ── FT EXIT (v3.2.0) ──
        // Retired: the loop that emitted a TRUNCATED exitFastTrack at own
        // ft-{bp} (steps=k instead of the full card value). Per
        // user_directive_2026-05-20b, an FT peg must consume the entire card
        // value; when the path crosses own ft-{bp}, the remaining hops carry
        // the peg into the home stretch automatically. The regular `move`
        // emission above is re-typed as `exitFastTrack` in that case.
        // FURTHER RETIRED (user_directive_2026-05-20e / FT_EXIT_ANY_HOLE):
        // FT-forward emission is now handled in the `_ftForward` branch above
        // and bypasses this entire perimeter path.

        // ── FT RING TRAVERSAL (peg sitting on an ft-* hole, not in FT mode) ──
        // Only allow FT entry from own home hole, not by backing up or traversing from other FT holes
        // (No FT entry from other FT holes)
      } // end else (_ftForward)
    }

    // ENTER BULLSEYE from FastTrack — ONLY on a 1-move card (A, J, Q, K, JOKER)
    // and ONLY when the peg is currently sitting on an ft-* hole.
    // Traversing the fast track does NOT grant a free jump to bullseye; the peg
    // must stop on an ft-* hole and then draw a 1-move card.
    // rules.json :: BULL_NO_FROM_OWN_FT (user_directive_2026-05-09) — entering
    //               bullseye from the player's own-color ft-{bp} hole is
    //               considered backward and is not allowed; only foreign ft-*
    //               holes count as a forward bullseye entry.
    if (peg.onFasttrack && peg.holeId.startsWith('ft-') && rules.movement === 1 &&
      peg.holeId !== `ft-${bp}`) {
      const occ = state.board.get('bullseye');
      if (!occ || occ.playerIdx !== ci) {
        moves.push({ type: 'enterBullseye', pegIdx: pi, dest: 'bullseye', from: peg.holeId, path: ['bullseye'] });
      }
    }
  }

  // ── SEVEN-SPLIT MOVE COLLECTION ──────────────────────────────────────
  // Extracted for readability. All the split-only closures (_rimReachable,
  // _bullPath, _ftRuleOK, _bullFree, _pushSplit, _halfOptions) live inside
  // this function, scoped exactly as before. Behavior is byte-identical.
  function collectSevenSplitMoves() {
  // ── 7-SPLIT LOGIC ──
  // rules.json :: CARD_7_SPLIT       (z=38) — 2 pegs, a+b=7, both clockwise, both legal.
  // rules.json :: CARD_7_SOLO        (z=40) — 1 peg in play → single 7-step move.
  // rules.json :: CARD_7_FT_HANDOFF  (z=42) — FT-priority + on-ring constraint.
  // rules.json :: FT_RING_PASS_RELAX (z=72) — own pegs on `ft-*` are passable.
  // Three variants per (a, b, pi1, pi2): STANDARD | BULL-LEFT | BULL-RIGHT.
  //
  // The caller already establishes that this is a 7 in classic mode. This guard
  // used to read `rules.isWild && rules.movement === 7`, which silently became
  // unreachable when the wild driver moved the call into its else branch, and
  // every split in the game quietly stopped being generated.
  if (isSevenCard(rules)) {
    // user_directive_2026-05-18: "the 7 split can only happen when there are
    // 2 to n pegs ON THE BOARD. if there is only 1 peg a 7 is just another
    // number." A peg is split-eligible iff it can legally absorb a split
    // half:
    //   - holding  → cannot move without an enter card (7 doesn't enter)  → out
    //   - bullseye → can only leave on J/Q/K, never on a 7 half           → out
    //   - home-{bp}→ the winner hole; the 5th peg parks here              → out
    //   - safezone → forward_only within the zone with exact landing
    //                (rules.json board.safe_zone) — a peg at safe-{bp}-k
    //                legally advances 1..(4-k) holes, so it IS eligible for
    //                a small split half. (bugfix 2026-06-06: previously
    //                excluded, which dropped every safe-zone split option.)
    // With <2 split-eligible pegs the engine skips the split block entirely
    // and the regular 7-step move generated above stands alone.
    const activePegs = [];
    for (let pi = 0; pi < player.pegs.length; pi++) {
      const peg = player.pegs[pi];
      if (peg.holeType === 'holding') continue;
      if (peg.holeId === 'bullseye') continue;
      if (peg.holeId === `home-${bp}`) continue;
      activePegs.push(pi);
    }
    if (activePegs.length >= 2) {
      const _ownFt = `ft-${bp}`;

      // Helper: is the rim half of length n (positions seq[0..n-1]) reachable?
      // Cannot land on own peg. FT-ring relax (user_directive_2026-04-25):
      // own pegs on `ft-*` intermediate holes do NOT block — pegs may pass each
      // other on the ring; only the destination must be unoccupied by self.
      const _rimReachable = (seq, n) => {
        if (seq.length < n) return false;
        for (let s = 0; s < n; s++) {
          const h = seq[s];
          const o = state.board.get(h);
          if (!o || o.playerIdx !== ci) continue;
          if (s === n - 1) return false;
          if (!h.startsWith('ft-')) return false;
        }
        return true;
      };

      // Helper: build bullseye route for half of length n. Returns path or null.
      // Conditions (rules.json :: BULL_NO_FINAL_HOP_FROM_FT_TRAVERSAL,
      //               user_directive_2026-05-20d):
      //   A) n=1 and the peg is already sitting on an ft-* hole — the 1-hit
      //      jump from FT to bullseye. Legal regardless of peg.onFasttrack.
      //   B) n>=2 and the penultimate step is an ft-* hole AND the peg
      //      DID NOT START on an ft-* hole (i.e. it is approaching from the
      //      outside track clockwise). An FT-ring peg (holeId startsWith
      //      'ft-') may NEVER reach bullseye via multi-hop traversal — only
      //      via the 1-hit rule above. Geometry, not the .onFasttrack flag,
      //      is authoritative: a peg on an ft-* hole IS on the ring even if
      //      the engine has stripped its .onFasttrack flag during a recalc
      //      pass (see FT priority + strip logic at end of calculateValidMoves).
      // Bullseye entry (user_directive_2026-06-06). Two legal routes, both
      // launching from a FOREIGN ft-* hole (never own ft-{bp} — reaching own
      // ft means fast track is already COMPLETE, so the peg diverts into its
      // home stretch and can no longer take the center). Geometry (holeId),
      // not the .onFasttrack flag, is authoritative.
      //   A) On-ring 1-hit: a peg ALREADY sitting on a foreign ft-* hole hops
      //      straight to the center with a single step. For a peg on the ring
      //      this is the ONLY route onto the bullseye (one hop, never multi).
      //   B) Outer approach: a peg NOT on the ring travels clockwise and lands
      //      on a foreign ft-* hole as its PENULTIMATE position, then hops to
      //      the center on the final step. Intermediate own pegs block, except
      //      passable own pegs sitting on ft-* holes (FT_RING_PASS_RELAX).
      const _bullPath = (seq, n, fromHole) => {
        const _ownFtHole = `ft-${bp}`;
        if (n === 1) {
          if (!fromHole || !fromHole.startsWith('ft-')) return null;
          if (fromHole === _ownFtHole) return null;
          return ['bullseye'];
        }
        if (n < 2 || seq.length < n) return null;
        if (fromHole && fromHole.startsWith('ft-')) return null; // ring pegs: route A only
        const penult = seq[n - 2];
        if (!penult || !penult.startsWith('ft-')) return null;   // penultimate must be a ring hole
        if (penult === _ownFtHole) return null;                  // own ft completes FT, never bullseye
        for (let s = 0; s < n - 1; s++) {
          const h = seq[s];
          const o = state.board.get(h);
          if (!o || o.playerIdx !== ci) continue;
          if (s === n - 2) return null;            // cannot land penultimate on an own peg
          if (!h.startsWith('ft-')) return null;   // own peg blocks unless passable on the ring
        }
        return [...seq.slice(0, n - 1), 'bullseye'];
      };

      // Helper: FT-status rule (user_directive_2026-04-25, refined).
      // General principle: "all pegs on FT must complete FT before any other
      // move can be made." For a Card 7 split:
      //   1. If the player has N FT pegs, the split must include min(N,2)
      //      of them as either peg1 or peg2 (can't substitute a non-FT peg
      //      while an FT peg is still available to use).
      //   2. Each FT peg involved in the split must keep its half on the FT
      //      ring OR finish at bullseye. Every intermediate position must
      //      start with 'ft-'; the final position may be either an 'ft-*'
      //      hole (still on FT — landing on own ft-{bp} counts as completion)
      //      or 'bullseye' (FT journey COMPLETED — bullseye IS the goal of
      //      fast track, so reaching it is not "leaving", it is finishing).
      //      Going to outer rim or safe zone mid-split is still forbidden —
      //      that's a true mid-FT abort that would lose FT for all.
      //   3. Untouched FT pegs (when player has 3+ FT pegs) keep FT status.
      //   4. Partial FT movement is legal — peg2 with only 2 steps left on
      //      the ring may move 2 (doesn't have to complete).
      // user_directive_2026-05-20d — supersedes the 2026-05-19 leniency.
      //   An FT peg may reach bullseye ONLY via the 1-hit rule (n=1 jump
      //   from an ft-* hole). It may NEVER reach bullseye by traversing
      //   the FT ring across multiple hops. Therefore 'bullseye' is a
      //   legal terminal for an FT peg's half ONLY when path.length === 1.
      // Helper: FT-status rule (user_directive_2026-04-25, refined by 2026-05-20e).
      // General principle: "all pegs on FT must complete FT before any other
      // move can be made." For a Card 7 split this still means:
      //   - If the player has N FT pegs, the split MUST include min(N,2) of
      //     them as either peg1 or peg2. The player cannot route the 7 around
      //     an idle FT peg while another non-FT peg gets the half.
      // user_directive_2026-05-20e (FT_EXIT_ANY_HOLE) REMOVES the prior
      // requirement that an FT peg's half must stay on the FT ring. Under
      // the new semantics an FT peg may legitimately leave the ring at any
      // hole during its half — enumeration of those leave-at-k options is
      // delegated to `_enumerateFtExitOptions` (see _halfOptions below).
      // The 1-hit bullseye jump and the no-multi-hop-bullseye gate are
      // preserved via _bullPath (user_directive_2026-05-20d).
      // Geometry-authoritative: a peg sitting on an ft-* hole is "on the ring"
      // regardless of its .onFasttrack flag (a recalc pass can transiently
      // clear it). Counting / gating on geometry keeps a flag-cleared ring
      // peg's bullseye 1-hit and ring moves from being wrongly dropped, and
      // matches rules.json's "geometrically on any ft-* hole" wording.
      const _onRing = (p) => !!(p && p.holeId && p.holeId.startsWith('ft-'));
      const _ftPegCount = player.pegs.filter(_onRing).length;
      const _ftRuleOK = (peg1, peg2) => {
        if (_ftPegCount === 0) return true;
        const ftInSplit = (_onRing(peg1) ? 1 : 0) + (_onRing(peg2) ? 1 : 0);
        return ftInSplit >= Math.min(_ftPegCount, 2);
      };

      // Bullseye occupancy gate — own peg already on bullseye blocks variants.
      const _bullFree = () => {
        const o = state.board.get('bullseye');
        return !o || o.playerIdx !== ci;
      };

      const _pushSplit = (key, pi1, dest1, steps1, from1, path1, pi2, dest2, steps2, from2, path2) => {
        // Both pegs cannot land on the same hole (would land on own peg).
        if (dest1 === dest2) return;
        if (moves.some(m => m._splitKey === key)) return;
        moves.push({
          type: 'split', _splitKey: key,
          pegIdx: pi1, dest: dest1, steps: steps1, from: from1, path: path1,
          peg2Idx: pi2, dest2, steps2, from2, path2,
        });
      };

      // Helper: enumerate all legal "rim" half-paths of length n for a peg.
      // Geometry-authoritative (peg.holeId, not peg.onFasttrack flag):
      //  - Peg on an `ft-*` hole → returns the FT_EXIT_ANY_HOLE leave-at-k
      //    options (delegated to `_enumerateFtExitOptions`). This is the
      //    user_directive_2026-05-20e extension to 7-split halves: an FT peg
      //    with split half value `n` enumerates min(n,D)+1 stopping options
      //    instead of being forced to consume the entire half on the ring.
      //  - Peg elsewhere → standard perimeter half via getTrackSequence.
      // Returns Array<{ path, dest }>. May be empty (blocked / unreachable).
      const _halfOptions = (peg, n) => {
        if (n < 1 || !peg || !peg.holeId) return [];
        if (peg.holeId.startsWith('ft-')) {
          return _enumerateFtExitOptions(peg, n);
        }
        const seq = getTrackSequence(peg, player, 'clockwise');
        if (!_rimReachable(seq, n)) return [];
        return [{ path: seq.slice(0, n), dest: seq[n - 1] }];
      };

      for (let a = 1; a <= 6; a++) {
        const b = 7 - a;
        for (let i = 0; i < activePegs.length; i++) {
          for (let j = 0; j < activePegs.length; j++) {
            if (i === j) continue;
            const pi1 = activePegs[i], pi2 = activePegs[j];
            const peg1 = player.pegs[pi1], peg2 = player.pegs[pi2];

            // Clockwise perimeter sequences feed the outer-approach bullseye
            // route (route B), where a non-ring peg's penultimate hole must be
            // a foreign ft-* hole.
            const seq1 = getTrackSequence(peg1, player, 'clockwise');
            const seq2 = getTrackSequence(peg2, player, 'clockwise');

            const opts1 = _halfOptions(peg1, a);
            const opts2 = _halfOptions(peg2, b);
            const path1Bull = _bullPath(seq1, a, peg1.holeId);
            const path2Bull = _bullPath(seq2, b, peg2.holeId);
            const bullOK = _bullFree();

            // VARIANT 1: STANDARD (rim/FT both halves — cartesian product of
            // per-half options so FT pegs surface every leave-at-k variant).
            for (const o1 of opts1) {
              for (const o2 of opts2) {
                if (o1.dest === o2.dest) continue;
                if (!_ftRuleOK(peg1, peg2)) continue;
                _pushSplit(
                  `${pi1}:${a}@${o1.dest}-${pi2}:${b}@${o2.dest}`,
                  pi1, o1.dest, a, peg1.holeId, o1.path,
                  pi2, o2.dest, b, peg2.holeId, o2.path);
              }
            }

            // VARIANT 2: peg1 → bullseye, peg2 → rim/FT (any option)
            if (path1Bull && bullOK) {
              for (const o2 of opts2) {
                if (o2.dest === 'bullseye') continue;
                if (!_ftRuleOK(peg1, peg2)) continue;
                _pushSplit(
                  `${pi1}:${a}B-${pi2}:${b}@${o2.dest}`,
                  pi1, 'bullseye', a, peg1.holeId, path1Bull,
                  pi2, o2.dest, b, peg2.holeId, o2.path);
              }
            }

            // VARIANT 3: peg1 → rim/FT (any option), peg2 → bullseye
            if (path2Bull && bullOK) {
              for (const o1 of opts1) {
                if (o1.dest === 'bullseye') continue;
                if (!_ftRuleOK(peg1, peg2)) continue;
                _pushSplit(
                  `${pi1}:${a}@${o1.dest}-${pi2}:${b}B`,
                  pi1, o1.dest, a, peg1.holeId, o1.path,
                  pi2, 'bullseye', b, peg2.holeId, path2Bull);
              }
            }
          }
        }
      }
    }
  }
  } // end collectSevenSplitMoves

  // ── DRIVERS ──────────────────────────────────────────────────────────
  // Run the collectors in order: every peg first, then (for a 7 in classic
  // mode) the split pass, which reads the moves the peg loop already pushed.
  const _collectAllPegs = () => {
    for (let pi = 0; pi < player.pegs.length; pi++) collectPegMoves(pi);
  };

  if (isSevenCard(rules) && SEVEN_MODE === 'wild') {
    // WILD 1..7, single peg. Retired, kept behind SEVEN_MODE so the rule can
    // be switched back without reintroducing a second code path.
    //
    // `rules` is a live reference to the shared CARDS['7'] object, not a copy,
    // so movement is restored in a finally. Without it, one throw anywhere in
    // the collectors would leave the card matrix pinned at d for the rest of
    // the session and every later 7 would move the wrong distance.
    const _savedMovement = rules.movement;
    try {
      for (let d = 1; d <= 7; d++) {
        rules.movement = d;
        _collectAllPegs();
      }
    } finally {
      rules.movement = _savedMovement;
    }

    // De-duplicate: different distances can resolve to the same
    // (type, peg, destination). Keep the first, drop exact repeats.
    const _seen = new Set();
    moves = moves.filter(m => {
      const k = `${m.type}|${m.pegIdx}|${m.dest}`;
      if (_seen.has(k)) return false;
      _seen.add(k);
      return true;
    });
  } else {
    // CLASSIC. The peg loop runs at movement=7 and yields the solo seven for
    // every peg that can legally travel all 7. collectSevenSplitMoves then adds
    // the two-peg a+b=7 options, and gates itself on there being at least two
    // split-eligible pegs, which is what makes "one playable peg must move the
    // full 7" fall out rather than needing a special case.
    _collectAllPegs();
    if (isSevenCard(rules)) collectSevenSplitMoves();
  }

  // ── FT OVERTAKE CHECK (removed) ──
  // Previously rewrote FT 'move' moves into forced exits when an own peg
  // sat ahead on the ring. Under the FT-ring relax (user_directive_2026-04-25),
  // pegs may PASS own pegs on `ft-*` holes — only landing is forbidden, and
  // that's already enforced upstream in the move generator. Forced-exit
  // alternatives are still surfaced by the FT EXIT OPTIONS block.

  // ── WIN-HOLE OVERSHOOT GUARD ──
  // rules.json :: WIN_NO_OVERSHOOT (user_directive_2026-05-09)
  // Once the player's safe zone is full (4 pegs in safe), the last peg must
  // land EXACTLY on the winning hole (home-{bp}) AND must have traversed the
  // track first (peg.eligibleForSafeZone === true). Traversal triggers are
  // ONLY: passing/touching the safe-zone entrance (outer-{bp}-2) or the
  // player's own FT hole (ft-{bp}). Passing the winning hole itself
  // (home-{bp}) — including a Card 4 backward that lands one hole away from
  // safe entry — is NOT a traversal. Without traversal the peg cannot land
  // on the winning hole; it must lap forward to safe entry first.
  // It is never legal for the last peg to traverse past the winning hole —
  // no lapping, no skipping past home-{bp}.
  {
    const _bp = player.boardPosition;
    const _inSafe = player.pegs.filter(p => getHoleType(p.holeId) === 'safezone').length;
    const _safeFull = _inSafe >= SAFE_ZONE_SIZE;
    if (_safeFull) {
      const _winHole = `home-${_bp}`;
      moves = moves.filter(m => {
        // Bullseye / FT-ring / safezone-internal moves don't touch the winning hole
        if (m.type === 'enterBullseye' || m.type === 'exitBullseye' ||
          m.type === 'enterFastTrack' || m.type === 'exitFastTrack' ||
          m.type === 'enter') return true;
        const _p = m.path || [];
        const _hits = _p.indexOf(_winHole);
        // path doesn't touch winning hole → fine (peg is mid-lap)
        if (_hits === -1) return true;
        // path lands EXACTLY on winning hole as final step → legal only if
        // the moving peg has officially traversed the track
        if (_hits === _p.length - 1 && m.dest === _winHole) {
          const _movingPeg = player.pegs[m.pegIdx];
          return !!(_movingPeg && _movingPeg.eligibleForSafeZone);
        }
        return false; // overshoot — drop the move
      });
    }
  }

  // ── FASTTRACK PRIORITY RULE ──
  // If any of the player's pegs are on FastTrack, they MUST move a FT peg.
  // If no FT moves are possible, all FT pegs lose their FastTrack status
  // and drop to the regular track — then recalculate.
  const pegsOnFT = player.pegs.filter(p => p.onFasttrack);
  if (pegsOnFT.length > 0) {
    // Geometry-authoritative keep: a move counts as "FT-related" when the
    // moving peg sits on an ft-* hole (regardless of its .onFasttrack flag),
    // so geometry-generated ring / bullseye split halves are not dropped here
    // after the split block already enumerated them on the same basis.
    const _moveOnRing = (idx) => {
      const p = player.pegs[idx];
      return !!(p && p.holeId && p.holeId.startsWith('ft-'));
    };
    const ftMoves = moves.filter(m => {
      if (m.type === 'enterBullseye') return true;
      if (_moveOnRing(m.pegIdx)) return true;
      // For splits, also keep if the second peg is on the ring.
      if (m.type === 'split' && _moveOnRing(m.peg2Idx)) return true;
      return false;
    });
    if (ftMoves.length > 0) {
      // Only allow FT-related moves
      moves = ftMoves;
    } else {
      // No legal FT moves — all FT pegs lose FastTrack status
      for (const p of pegsOnFT) {
        p.onFasttrack = false;
        p.fasttrackEntryHole = null;
        p.mustExitFasttrack = false;
      }
      log(`⚠️ ${getCurrentPlayerName()} lost FastTrack — no legal FT moves!`);
      syncPegMatrix();
      // Recalculate moves from scratch without FT pegs
      return calculateValidMoves();
    }
  }

  state.turn.set('validMoves', moves);
  showMoveHints();
}


// ═══════════════════════════════════════════════════════════════════════════
// MOVE HINTS UI
// ═══════════════════════════════════════════════════════════════════════════
function ownerName(holeId) {
  // Which player "owns" this hole by board position?
  const m = holeId.match(/(?:home|ft|safe|side-left|side-right|outer)-(\d+)/);
  if (!m) return '';
  const bp = parseInt(m[1]);
  const players = state.players.get('list') || [];
  const p = players.find(pl => pl.boardPosition === bp);
  return p ? p.name : PLAYER_NAMES[bp] || '';
}

function cutLabel(dest) {
  // If an opponent occupies the destination, describe the cut
  const occ = state.board.get(dest);
  if (!occ) return '';
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  if (occ.playerIdx === ci) return '';
  const victim = players[occ.playerIdx];
  return victim ? ` — send ${victim.name}'s peg home` : '';
}

function safeUiText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function summarizeMoveForHint(move, player, playerIdx) {
  if (!move) return 'Only one legal move — auto-playing';
  const pegName = safeUiText(player && player.pegs && player.pegs[move.pegIdx] && player.pegs[move.pegIdx].nickname, `Peg ${(move.pegIdx || 0) + 1}`);
  const playerName = safeUiText(player && player.name, PLAYER_NAMES[playerIdx] || 'Player');
  const actor = `${playerName}'s ${pegName}`;

  switch (move.type) {
    case 'enter':
      return `${actor} enters the board`;
    case 'enterFastTrack':
      return `${actor} enters FastTrack`;
    case 'exitFastTrack':
      return `${actor} exits FastTrack`;
    case 'enterBullseye':
      return `${actor} enters bullseye`;
    case 'exitBullseye':
      return `${actor} exits bullseye`;
    case 'split':
      return `${actor} starts a split-7 move`;
    case 'move': {
      const s = Number(move.steps) || 0;
      const card = state.deck.get('currentCard');
      const cardRules = card ? CARDS[card.value] : null;
      const isBackward = cardRules && cardRules.direction === 'backward';
      return `${actor} moves ${isBackward ? 'backward ' : ''}${Math.abs(s)} space${Math.abs(s) === 1 ? '' : 's'}`;
    }
    default:
      return `${actor} makes the only legal move`;
  }
}

function setOptionsPanelVisible(visible) {
  const panel = document.getElementById('panel-options');
  if (!panel) return;
  panel.style.display = visible ? 'block' : 'none';
}

let _expandedHintGroup = null;
let _hintGroups = {};

function previewHintGroup(groupKey) {
  const vm = state.turn.get('validMoves') || [];
  const indices = _hintGroups[groupKey] || [];
  if (!indices.length) return;
  const moves = indices.map(i => vm[i]).filter(Boolean);
  if (moves.length && window.highlightMovePaths) window.highlightMovePaths(moves);
}

function clearHintPreview() {
  const vm = state.turn.get('validMoves') || [];
  if (window.highlightMovePaths) window.highlightMovePaths(vm);
}

function toggleHintGroup(groupKey) {
  _expandedHintGroup = (_expandedHintGroup === groupKey) ? null : groupKey;
  showMoveHints();
}

window.previewHintGroup = previewHintGroup;
window.clearHintPreview = clearHintPreview;
window.toggleHintGroup = toggleHintGroup;
window.summarizeMoveForHint = summarizeMoveForHint;
window.cutLabel = cutLabel;
window.ownerName = ownerName;
window.getCardRules = function (rank) { return state.cards.get(rank) || null; };

function showMoveHints() {
  const hintsDiv = document.getElementById('move-hints');
  if (!hintsDiv) return;

  // In networked multiplayer, only the active player sees the move
  // mechanics (instructions, glowing destinations, split selector).
  // Peers just watch the pegs move once executeMove broadcasts.
  if (_isMpMode() && !_isMyTurn()) {
    hintsDiv.innerHTML = '';
    setOptionsPanelVisible(false);
    if (window.clearMovePathHighlights) {
      try { window.clearMovePathHighlights(); } catch (_) { }
    } else if (window.highlightMovePaths) {
      try { window.highlightMovePaths([]); } catch (_) { }
    }
    return;
  }

  setOptionsPanelVisible(true);
  const vm = state.turn.get('validMoves') || [];

  // Refresh the move card bar (new UI)
  if (typeof window._refreshFastTrackToolbar === 'function') {
    try { window._refreshFastTrackToolbar(); } catch (e) { /* ignore */ }
  }
  // Dispatch a custom event for move updates (for card bar)
  try {
    window.dispatchEvent(new Event('ft3d:moveUpdate'));
  } catch (_) { }

  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const curPlayer = players[ci] || { name: PLAYER_NAMES[ci] || 'Player', pegs: [] };

  if (vm.length === 0) {
    // No legal move. Per rules.json CARD_NO_LEGAL_MOVE the turn is forfeit
    // (discard, end turn, no extra turn). Bots already auto-end via botTurn;
    // a human shouldn't have to hunt for this hint button or wait out the
    // 12 s stuck watchdog (whose countdown can reset on MP snapshots / re-
    // renders, stalling relinquish indefinitely). Surface the End-Turn button
    // as an instant-out, but also auto-relinquish after a short, toasted beat.
    hintsDiv.innerHTML = '<button id="ft-end-turn-btn" class="hint" style="cursor:pointer;font-weight:600;">No legal move — End Turn</button>';
    // user_directive_2026-05-18 — center-toast the no-legal-move state so
    // the player understands the End Turn button isn't a punishment.
    // Dedupe by (currentPlayer, currentCard) so updateUI re-renders don't
    // re-fire the toast (or re-arm the auto-relinquish) every frame.
    try {
      const card = state.deck.get('currentCard');
      const stamp = `${ci}|${card && card.id}|${card && card.value}`;
      const canAct = !_isMpMode() || _isMyTurn();
      if (stamp !== _lastNoLegalMoveTurnStamp) {
        _lastNoLegalMoveTurnStamp = stamp;
        showNoLegalMoveToast(curPlayer.name, curPlayer.color);
        // Auto-relinquish exactly once for this (player, card). Only the
        // client whose turn it is schedules it — endTurn() then broadcasts the
        // turn_advance on the active-player-authoritative path, identical to a
        // manual click. Re-verify at fire time so a redraw / manual pass /
        // snapshot that already moved on cancels it.
        _clearNoMoveAutoTimer();
        if (canAct) {
          const _noMoveEpoch = _turnEpoch;   // the turn this auto-pass belongs to
          _noMoveAutoTimer = setTimeout(() => {
            _noMoveAutoTimer = null;
            const _ci = state.players.get('current') || 0;
            const _card = state.deck.get('currentCard');
            const _stampNow = `${_ci}|${_card && _card.id}|${_card && _card.value}`;
            if (_stampNow !== stamp) return;                       // turn/card changed
            if ((state.turn.get('validMoves') || []).length > 0) return; // moves appeared
            if (state.turn.get('phase') === 'draw') return;        // already advanced
            if (_isMpMode() && !_isMyTurn()) return;               // no longer our turn
            // resolveTurn, NOT endTurn. House rule: A, 6, J, Q, K and JOKER
            // grant a redraw EVERY time they are drawn, and that holds even
            // when the card produced no legal move. endTurn rotates
            // unconditionally, so calling it here silently ate the redraw and
            // handed the turn away, which is indistinguishable from a skipped
            // turn to the player it happened to. resolveTurn is the single
            // authority that knows the difference: replay card reopens the same
            // seat, anything else rotates.
            resolveTurn(_noMoveEpoch);                             // epoch-verified (dropped if stale)
          }, NO_MOVE_AUTO_PASS_MS);
        }
      }
    } catch (_) { /* ignore */ }
    const btn = document.getElementById('ft-end-turn-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        if (_isMpMode() && !_isMyTurn()) return;
        // Manual instant-out: cancel the pending auto-relinquish and end now.
        // With validMoves empty there is no real move to play. Route through
        // resolveTurn so a redraw card (A, 6, J, Q, K, JOKER) still grants its
        // redraw rather than rotating the turn away; resolveTurn falls through
        // to endTurn for every other card.
        _clearNoMoveAutoTimer();
        resolveTurn(_turnEpoch);   // the live turn
      }, { once: true });
    }
    return;
  }

  // If there is exactly one legal move, highlight it and wait for the player
  // to confirm via the toolbar (no auto-play timer).
  if (vm.length === 1) {
    const autoText = summarizeMoveForHint(vm[0], curPlayer, ci);
    hintsDiv.innerHTML = `<div class="hint" style="opacity:0.9;">${escapeHtml(autoText)} — press ▶ then Confirm</div>`;
    if (window.highlightSinglePath) window.highlightSinglePath(0);
    return;
  }

  // Light up all destination paths on the 3D board.
  // If a split first leg has been picked, restrict highlights to candidate
  // completions so only the second-leg routes glow.
  if (window.highlightMovePaths) {
    const splitChoice = (_splitPegIdx != null && _splitStepChoice != null)
      ? { pegIdx: _splitPegIdx, steps: _splitStepChoice } : null;
    if (splitChoice) {
      const candidates = vm.filter(m => m && m.type === 'split'
        && ((m.pegIdx === splitChoice.pegIdx && m.steps === splitChoice.steps)
          || (m.peg2Idx === splitChoice.pegIdx && m.steps2 === splitChoice.steps)));
      window.highlightMovePaths(candidates);
    } else {
      window.highlightMovePaths(vm);
    }
  }

  // Separate split moves from regular moves
  const splitMoves = vm.filter(m => m.type === 'split');

  // Pick-on-board: the 3D board itself is the input surface — destinations
  // glow in the active player's color and accept clicks/taps. The rail just
  // shows a neutral status line so the player knows it's their turn and what
  // to do. Split-7 still needs the rail because it's a two-step decision and
  // the picker doesn't yet have a way to confirm the second leg unambiguously.
  const playerName = safeUiText(curPlayer.name, PLAYER_NAMES[ci] || 'Player');
  let html = '';
  if (splitMoves.length === 0) {
    html += '<div class="hint hint-status" style="opacity:0.85;cursor:default;">'
      + `Your turn, ${escapeHtml(playerName)} — click a glowing hole to move.`
      + '</div>';
  } else {
    html += '<div class="hint hint-status" style="opacity:0.85;cursor:default;">'
      + `Your turn, ${escapeHtml(playerName)} — click a glowing hole, or use the split panel below.`
      + '</div>';
  }

  // Split selector UI (if splits are available)
  if (splitMoves.length > 0) {
    html += renderSplitSelector(splitMoves, vm);
  }

  hintsDiv.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════
// SPLIT SELECTOR — two-step interactive 7-split UI
// ═══════════════════════════════════════════════════════════════════════════
let _splitPegIdx = null;
let _splitStepChoice = null;

function splitPegLabel(player, pegIdx) {
  const peg = player && player.pegs ? player.pegs[pegIdx] : null;
  const nickname = safeUiText(peg && peg.nickname, `Peg ${Number(pegIdx) + 1}`);
  return `${nickname} (Peg ${Number(pegIdx) + 1})`;
}

function splitMoveMatchesChoice(move, pegIdx, stepChoice) {
  if (!move || move.type !== 'split') return false;
  const p = Number(pegIdx);
  const s = Number(stepChoice);
  return (move.pegIdx === p && move.steps === s) || (move.peg2Idx === p && move.steps2 === s);
}

function renderSplitSelector(splitMoves, allMoves) {
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const player = players[ci];

  // Desktop: pick-on-board flow (raycaster in fasttrack-3d.js handles the
  // clicks). Just emit instructions + a cancel pill in the rail.
  const isDesktop = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(min-width: 601px)').matches;
  if (isDesktop) {
    let html = '<div class="split-header">✂️ Split 7</div>';
    if (_splitPegIdx == null || _splitStepChoice == null) {
      html += '<div style="font-size:0.82em;color:#9fdcff;text-align:center;padding:6px 4px;">'
        + 'Click any glowing hole on the board — that route\'s peg + step count becomes your <b>first leg</b>.'
        + '</div>';
    } else {
      const pegName = safeUiText(player && player.pegs && player.pegs[_splitPegIdx]
        && player.pegs[_splitPegIdx].nickname, `Peg ${_splitPegIdx + 1}`);
      const remaining = 7 - _splitStepChoice;
      html += `<div style="font-size:0.82em;color:#b7ffd6;text-align:center;padding:6px 4px;">`
        + `<b>${escapeHtml(pegName)}</b> moves ${_splitStepChoice}. `
        + `Now click a destination for the other peg (${remaining} steps).`
        + `</div>`;
      html += '<button class="hint" style="margin:2px 4px;" onclick="cancelSplitChoice()">↺ Cancel first leg</button>';
    }
    return html;
  }

  // Build peg -> first-step options from legal split moves.
  const pegMap = new Map(); // pegIdx -> Set<steps>
  for (const m of splitMoves) {
    if (!pegMap.has(m.pegIdx)) pegMap.set(m.pegIdx, new Set());
    if (!pegMap.has(m.peg2Idx)) pegMap.set(m.peg2Idx, new Set());
    pegMap.get(m.pegIdx).add(m.steps);
    pegMap.get(m.peg2Idx).add(m.steps2);
  }

  const pegOptions = Array.from(pegMap.keys()).sort((a, b) => a - b);
  if (!pegOptions.includes(_splitPegIdx)) {
    _splitPegIdx = pegOptions.length ? pegOptions[0] : null;
    _splitStepChoice = null;
  }

  const stepOptions = _splitPegIdx != null && pegMap.get(_splitPegIdx)
    ? Array.from(pegMap.get(_splitPegIdx)).sort((a, b) => a - b)
    : [];
  if (!stepOptions.includes(_splitStepChoice)) {
    _splitStepChoice = null;
  }

  const candidateIndices = (_splitPegIdx != null && _splitStepChoice != null)
    ? splitMoves
      .map((m) => allMoves.indexOf(m))
      .filter((idx) => idx >= 0 && splitMoveMatchesChoice(allMoves[idx], _splitPegIdx, _splitStepChoice))
    : [];

  let html = '<div class="split-header">✂️ Split 7 · Pick Peg + First Steps</div>';
  html += '<div style="font-size:0.82em;color:rgba(255,255,255,0.75);text-align:center;padding:2px 0 8px;">Card 7 is active. Choose one peg and its first move; the remaining steps complete to 7 automatically.</div>';
  html += '<div style="display:flex;flex-direction:column;gap:8px;padding:4px 2px 8px;">';

  html += '<label style="font-size:0.82em;color:#9fdcff;">Eligible Peg</label>';
  html += '<select onchange="selectSplitPeg(this.value)" style="padding:9px;border-radius:8px;background:rgba(8,20,34,0.92);color:#e8f6ff;border:1px solid rgba(80,180,255,0.35);">';
  for (const pegIdx of pegOptions) {
    const selected = pegIdx === _splitPegIdx ? ' selected' : '';
    html += `<option value="${pegIdx}"${selected}>${escapeHtml(splitPegLabel(player, pegIdx))}</option>`;
  }
  html += '</select>';

  html += '<label style="font-size:0.82em;color:#9fdcff;">First Move Steps (1-7)</label>';
  html += '<div class="split-ratios">';
  for (let n = 1; n <= 7; n++) {
    const legal = stepOptions.includes(n);
    const selected = n === _splitStepChoice;
    html += `<button class="split-ratio-btn${selected ? ' selected' : ''}" ${legal ? '' : 'disabled'} `
      + `onmouseenter="previewSplitChoice(${_splitPegIdx != null ? _splitPegIdx : -1}, ${n})" `
      + `onmouseleave="clearSplitPreview()" `
      + `onclick="selectSplitSteps(${n})">${n}</button>`;
  }
  html += '</div>';

  if (_splitPegIdx != null && _splitStepChoice != null) {
    if (candidateIndices.length === 1) {
      const chosen = allMoves[candidateIndices[0]];
      const primaryLabel = splitPegLabel(player, _splitPegIdx);
      const otherPegIdx = chosen.pegIdx === _splitPegIdx ? chosen.peg2Idx : chosen.pegIdx;
      const otherSteps = chosen.pegIdx === _splitPegIdx ? chosen.steps2 : chosen.steps;
      html += `<div style="font-size:0.82em;color:#b7ffd6;">${escapeHtml(primaryLabel)} moves ${_splitStepChoice}. Then ${escapeHtml(splitPegLabel(player, otherPegIdx))} moves ${otherSteps}.</div>`;
      html += `<button class="hint" style="margin-top:4px;" onclick="executeMove(${candidateIndices[0]})" `
        + `onmouseenter="if(window.highlightSinglePath)window.highlightSinglePath(${candidateIndices[0]})" `
        + `onmouseleave="if(window.highlightMovePaths)window.highlightMovePaths()">✅ Execute Split 7</button>`;
    } else if (candidateIndices.length > 1) {
      html += '<div style="font-size:0.82em;color:#ffd7a8;">Multiple legal completions found. Pick the completion path:</div>';
      html += '<div class="split-pairs">';
      for (const idx of candidateIndices) {
        const m = allMoves[idx];
        const peg1 = splitPegLabel(player, m.pegIdx);
        const peg2 = splitPegLabel(player, m.peg2Idx);
        html += `<div class="split-pair" onclick="executeMove(${idx})" `
          + `onmouseenter="if(window.highlightSinglePath)window.highlightSinglePath(${idx})" `
          + `onmouseleave="if(window.highlightMovePaths)window.highlightMovePaths()">`
          + `<span>${escapeHtml(peg1)} ${m.steps} + ${escapeHtml(peg2)} ${m.steps2}</span></div>`;
      }
      html += '</div>';
    } else {
      html += '<div style="font-size:0.82em;color:#ffb5b5;">No legal split with this peg/step selection.</div>';
    }
  }

  html += '</div>';
  return html;
}

function describeHole(holeId) {
  if (holeId.startsWith('safe-')) return '🛡️safe';
  if (holeId.startsWith('ft-')) return `⚡FT-${ownerName(holeId)}`;
  if (holeId.startsWith('home-')) return `🏠${ownerName(holeId)}`;
  if (holeId === 'bullseye') return '🎯center';
  // Generic outer/side position — show abbreviated
  const m = holeId.match(/(outer|side-left|side-right)-(\d+)-(\d+)/);
  if (m) return `${ownerName(holeId)}'s ${m[1] === 'outer' ? 'outer' : 'side'} ${m[3]}`;
  return holeId;
}

function selectSplitPeg(pegIdx) {
  const parsed = Number(pegIdx);
  _splitPegIdx = Number.isFinite(parsed) ? parsed : null;
  _splitStepChoice = null;

  // If exactly one step count is viable for this peg, auto-pick it so the
  // player only has to confirm the destination next.
  if (_splitPegIdx != null) {
    const vm = state.turn.get('validMoves') || [];
    const stepSet = new Set();
    for (const m of vm) {
      if (!m || m.type !== 'split') continue;
      if (m.pegIdx === _splitPegIdx && m.steps != null) stepSet.add(m.steps);
      if (m.peg2Idx === _splitPegIdx && m.steps2 != null) stepSet.add(m.steps2);
    }
    if (stepSet.size === 1) {
      _splitStepChoice = [...stepSet][0];
    }
  }
  showMoveHints();
}

function selectSplitSteps(step) {
  const parsed = Number(step);
  _splitStepChoice = Number.isFinite(parsed) ? parsed : null;

  // If this first-leg choice yields exactly one legal completion, auto-play it.
  // This keeps split flow fast and avoids requiring a redundant second click.
  const vm = state.turn.get('validMoves') || [];
  const candidateIndices = (_splitPegIdx != null && _splitStepChoice != null)
    ? vm
      .map((m, idx) => ({ m, idx }))
      .filter(({ m }) => splitMoveMatchesChoice(m, _splitPegIdx, _splitStepChoice))
      .map(({ idx }) => idx)
    : [];

  if (candidateIndices.length === 1) {
    executeMove(candidateIndices[0]);
    return;
  }

  showMoveHints(); // Re-render with selection
}

function previewSplitChoice(pegIdx, step) {
  const vm = state.turn.get('validMoves') || [];
  const matching = vm
    .map((m, idx) => ({ m, idx }))
    .filter(({ m }) => splitMoveMatchesChoice(m, pegIdx, step))
    .map(({ idx }) => vm[idx]);
  if (matching.length === 0) return;
  if (window.highlightMovePaths) window.highlightMovePaths(matching);
}

function clearSplitPreview() {
  const vm = state.turn.get('validMoves') || [];
  if (window.highlightMovePaths) window.highlightMovePaths(vm);
}

window.selectSplitPeg = selectSplitPeg;
window.selectSplitSteps = selectSplitSteps;
window.previewSplitChoice = previewSplitChoice;
window.clearSplitPreview = clearSplitPreview;
window.getSplitChoice = () => ({ pegIdx: _splitPegIdx, steps: _splitStepChoice });
window.cancelSplitChoice = () => {
  _splitPegIdx = null;
  _splitStepChoice = null;
  showMoveHints();
};

// ═══════════════════════════════════════════════════════════════════════════
// MOVE EXECUTION
// ═══════════════════════════════════════════════════════════════════════════
function placePeg(peg, holeId, playerIdx) {
  if (peg.holeId && peg.holeId !== 'holding') state.board.set(peg.holeId, null);
  bumpOccupant(holeId, playerIdx, peg);
  peg.holeId = holeId;
  peg.holeType = getHoleType(holeId);
  state.board.set(holeId, { playerIdx, pegId: peg.id });
}

function bumpOccupant(holeId, currentPlayerIdx, attackerPeg) {
  const occ = state.board.get(holeId);
  if (!occ || occ.playerIdx === currentPlayerIdx) return;
  const players = state.players.get('list') || [];
  const victorPlayer = players[currentPlayerIdx];
  const victimPlayer = players[occ.playerIdx];
  const vPeg = victimPlayer.pegs.find(p => p.id === occ.pegId);
  if (vPeg) {
    // Update emotional state
    if (attackerPeg) {
      attackerPeg.captureCount = (attackerPeg.captureCount || 0) + 1;
      attackerPeg.mood = 'TRIUMPHANT';
    }
    vPeg.timesCaptured = (vPeg.timesCaptured || 0) + 1;
    vPeg.mood = 'VENGEFUL';
    if (attackerPeg) vPeg.rivalPegId = attackerPeg.id;

    // Reset victim peg state
    vPeg.onFasttrack = false;
    vPeg.eligibleForSafeZone = false;
    vPeg.lockedToSafeZone = false;
    vPeg.completedCircuit = false;
    vPeg.fasttrackEntryHole = null;

    // Send victim peg back — holding area has 4 slots max
    const pegsInHolding = victimPlayer.pegs.filter(p => p.holeId === 'holding').length;
    // Tag the cut origin so the renderer can arc the peg out instead of
    // teleporting it. Cleared by renderBoard once the arc kicks off.
    vPeg._cutFromHole = holeId;
    if (pegsInHolding >= 4) {
      // Holding full: place on victim's home hole instead
      const victimHome = `home-${victimPlayer.boardPosition}`;
      // If home hole is occupied by another of victim's pegs, just stack into holding anyway
      const homeOcc = state.board.get(victimHome);
      if (homeOcc && homeOcc.playerIdx === occ.playerIdx) {
        vPeg.holeId = 'holding';
        vPeg.holeType = 'holding';
      } else {
        // Bump anyone else on the victim's home hole
        bumpOccupant(victimHome, occ.playerIdx, vPeg);
        vPeg.holeId = victimHome;
        vPeg.holeType = 'home';
        state.board.set(victimHome, { playerIdx: occ.playerIdx, pegId: vPeg.id });
      }
    } else {
      vPeg.holeId = 'holding';
      vPeg.holeType = 'holding';
    }
    log(`${victimPlayer.name}'s ${vPeg.nickname || vPeg.id} bumped back to home!`);

    // Fire cut cutscene — victor and victim react with personality
    CutsceneManager.queueCutscene('cut', {
      victorPeg: attackerPeg || { personality: 'CHEERFUL' },
      victimPeg: vPeg,
      victorPlayer,
      victimPlayer
    });
  }
  state.board.set(holeId, null);
}

function executeMove(moveIdx) {
  // Multiplayer: only the active player (or the host driving a bot seat) plays a
  // move locally; remote peers receive the resolved move via applyRemoteAction
  // and replay it under guard. See _canDriveActiveSeat for the bot-skip bugfix.
  if (!_applying && _isMpMode() && !_canDriveActiveSeat()) return;

  // Clear path highlights when a move is chosen
  if (window.clearHighlights) window.clearHighlights();

  const vm = state.turn.get('validMoves') || [];
  const move = vm[moveIdx];
  if (!move) return;

  // Broadcast the resolved move BEFORE applying so peers see it the moment we do.
  // The local actor is gated above; this only runs when we're the deciding peer.
  if (!_applying) _broadcast('move', { move });

  // ── DEBOUNCE: clear valid moves immediately to prevent double-click ──
  state.turn.set('validMoves', []);
  // Also clear the hint buttons from the UI right away
  const hintsEl = document.getElementById('move-hints');
  if (hintsEl) hintsEl.innerHTML = '';
  setOptionsPanelVisible(false);
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const player = players[ci];
  const peg = player.pegs[move.pegIdx];

  // ── DEFERRED CUTSCENES: collect here, fire AFTER peg animation lands ──
  const _deferredCutscenes = [];

  switch (move.type) {
    case 'enter':
      placePeg(peg, move.dest, ci);
      peg.mood = 'CONFIDENT';
      if (window.ManifoldAudio) ManifoldAudio.playEnter();
      log(`${getCurrentPlayerName()} entered a peg`);
      break;

    case 'move': {
      const bp = player.boardPosition;
      const safeEntry = `outer-${bp}-2`;   // safe-zone entrance (was stale -8; engine geometry names it -2). Redundant with the universal circuit-completion block below, but kept consistent.
      // Circuit completion: passing the safe zone entrance in either direction
      // (including card 4 backward) makes peg eligible for safe zone on next forward turn
      const traversed = move.path || [];
      if (!peg.eligibleForSafeZone && traversed.includes(safeEntry)) {
        peg.eligibleForSafeZone = true;
      }
      placePeg(peg, move.dest, ci);
      // Clear mustExitFasttrack once the peg moves away from the FT hole
      if (peg.mustExitFasttrack && getHoleType(move.dest) !== 'fasttrack') {
        peg.mustExitFasttrack = false;
      }
      if (getHoleType(move.dest) === 'safezone') {
        peg.lockedToSafeZone = true;
        peg.onFasttrack = false;
        peg.mustExitFasttrack = false;
        peg.mood = 'RELAXED';
        _deferredCutscenes.push(['safeZone', {
          peg, playerColor: player.color, playerName: player.name, playerId: ci
        }]);
      }
      // FT landing cutscene — when regular move lands on an FT hole
      // No fanfare for: bullseye exit pegs, or card 4 (backward — no FT status awarded)
      // bugfix_2026-05-18 (v0.5.16): also set peg.onFasttrack = true here.
      // Geometry is authoritative — if the peg now sits on an ft-* hole and
      // the card was not a noFastTrack card, the peg IS on the fast track.
      // Without this flip, the peg becomes stuck: getTrackSequence used to
      // require peg.onFasttrack to traverse the inner ring, so the peg had
      // no legal forward moves on subsequent cards ("continues on main
      // track" symptom reported 2026-05-18).
      {
        const card = state.deck.get('currentCard');
        const cardNoFT = card && CARDS[card.value] && CARDS[card.value].noFastTrack;
        if (getHoleType(move.dest) === 'fasttrack' && !peg.onFasttrack && !peg.mustExitFasttrack && !cardNoFT) {
          peg.onFasttrack = true;
          peg.fasttrackEntryHole = move.from || peg.holeId;
          _deferredCutscenes.push(['fasttrack', {
            peg, playerColor: player.color, playerName: player.name, playerId: ci
          }]);
        }
      }
      log(`${getCurrentPlayerName()} moved ${move.steps} to ${move.dest}`);
      break;
    }

    case 'enterFastTrack': {
      // bugfix_2026-05-19: FT entry is legal whenever the destination is the
      // player's own ft-${bp} hole and the peg is not already on FT. Removed
      // the spurious `peg.holeId === home-${bp}` gate (see calculateValidMoves
      // for full reasoning).
      const bp = player.boardPosition;
      if (move.dest === `ft-${bp}` && !peg.onFasttrack) {
        peg.onFasttrack = true;
        peg.fasttrackEntryHole = move.from || peg.holeId;
        peg.mood = 'EXCITED';
        placePeg(peg, move.dest, ci);
        log(`${getCurrentPlayerName()} entered FastTrack → ${move.dest}! ⚡`);
        _deferredCutscenes.push(['fasttrack', {
          peg, playerColor: player.color, playerName: player.name, playerId: ci
        }]);
      } else {
        // Illegal FT entry attempt, ignore
        log(`❌ Illegal FastTrack entry attempt from ${peg.holeId} to ${move.dest}`);
      }
      break;
    }

    case 'exitFastTrack':
      peg.onFasttrack = false;
      peg.fasttrackEntryHole = null;
      peg.mustExitFasttrack = false;
      peg.mood = 'CAUTIOUS';
      // user_directive_2026-05-20e: FT-leave moves may continue onto the
      // outer rim or into the home stretch. Mirror the regular `move`
      // handler's circuit-completion + safe-zone flag bookkeeping so the
      // peg's state is consistent regardless of which leg of the path
      // landed it.
      {
        const _bp = player.boardPosition;
        const _safeEntry = `outer-${_bp}-2`;   // safe-zone entrance (was stale -8)
        const _traversed = move.path || [];
        if (!peg.eligibleForSafeZone && _traversed.includes(_safeEntry)) {
          peg.eligibleForSafeZone = true;
        }
      }
      placePeg(peg, move.dest, ci);
      if (getHoleType(move.dest) === 'safezone') {
        peg.lockedToSafeZone = true;
        peg.mood = 'RELAXED';
        _deferredCutscenes.push(['safeZone', {
          peg, playerColor: player.color, playerName: player.name, playerId: ci
        }]);
      }
      log(`${getCurrentPlayerName()} exited FastTrack at ${move.dest}`);
      // Sound side-effect guard: when the FT exit lands IN the safe zone the
      // 'safeZone' cutscene queued just above already plays its own arrival
      // sound. Firing the generic landing sound here too double-stacked the
      // audio for one landing. Only play the generic sound for a plain
      // outer-track / FT-hole landing.
      if (window.ManifoldAudio && getHoleType(move.dest) !== 'safezone') ManifoldAudio.playEnter();
      break;

    case 'enterBullseye':
      placePeg(peg, 'bullseye', ci);
      peg.onFasttrack = false;
      peg.mood = 'TRIUMPHANT';
      log(`${getCurrentPlayerName()} reached Bullseye! 🎯`);
      _deferredCutscenes.push(['bullseye', {
        peg, playerColor: player.color, playerName: player.name, playerId: ci
      }]);
      break;

    case 'exitBullseye':
      placePeg(peg, move.dest, ci);
      peg.onFasttrack = false;
      peg.mustExitFasttrack = true;
      // eligibleForSafeZone is set by the universal circuit-completion block below
      // ONLY when exit dest === own ft-{bp}. Backward-stepped exits to other FT holes
      // do NOT complete a circuit on their own.
      if (window.ManifoldAudio) ManifoldAudio.playEnter();
      log(`${getCurrentPlayerName()} exited Bullseye! 🚀`);
      break;

    case 'split': {
      // First peg moves
      const bp = player.boardPosition;
      const safeEntry = `outer-${bp}-2`;   // safe-zone entrance (was stale -8)
      if (!peg.eligibleForSafeZone && move.path && move.path.includes(safeEntry)) {
        peg.eligibleForSafeZone = true;
      }
      placePeg(peg, move.dest, ci);
      if (getHoleType(move.dest) === 'safezone') {
        peg.lockedToSafeZone = true;
        peg.mood = 'RELAXED';
      }
      if (move.dest === 'bullseye') {
        peg.mood = 'TRIUMPHANT';
        _deferredCutscenes.push(['bullseye', {
          peg, playerColor: player.color, playerName: player.name, playerId: ci
        }]);
      }
      // Second peg moves
      const peg2 = player.pegs[move.peg2Idx];
      if (!peg2.eligibleForSafeZone && move.path2 && move.path2.includes(safeEntry)) {
        peg2.eligibleForSafeZone = true;
      }
      placePeg(peg2, move.dest2, ci);
      if (getHoleType(move.dest2) === 'safezone') {
        peg2.lockedToSafeZone = true;
        peg2.mood = 'RELAXED';
      }
      if (move.dest2 === 'bullseye') {
        peg2.mood = 'TRIUMPHANT';
        _deferredCutscenes.push(['bullseye', {
          peg: peg2, playerColor: player.color, playerName: player.name, playerId: ci
        }]);
      }
      log(`${getCurrentPlayerName()} split 7: peg moved ${move.steps} + ${move.steps2}`);
      break;
    }
  }

  // ── CIRCUIT COMPLETION (universal, all move types) ──
  // Two ways to complete a circuit:
  //   1. Path/dest passes through safe zone entrance (outer-{bp}-2) — any direction
  //   2. Path/dest passes through player's own FT hole (ft-{bp}) — from FT or bullseye
  // Card 4 backward: passing safe entry counts, but can't back INTO safe zone
  //   (eligibility is set, but safe zone entry only happens on a forward turn)
  // Strategic-move flourish: peg dances when it first becomes eligible.
  {
    const bp = player.boardPosition;
    const ownFT = `ft-${bp}`;
    const safeEntry = `outer-${bp}-2`;
    const path = move.path || [];
    if (!peg.eligibleForSafeZone) {
      if (move.dest === ownFT || path.includes(ownFT) ||
        move.dest === safeEntry || path.includes(safeEntry)) {
        peg.eligibleForSafeZone = true;
        log(`🔄 ${peg.nickname || peg.id} completed a circuit — eligible for safe zone`);
        if (window.triggerPegPose && peg.id) {
          setTimeout(() => window.triggerPegPose(peg.id, 'dance'), 0);
        }
      }
    }
    // Split: also check peg2
    if (move.type === 'split') {
      const peg2 = player.pegs[move.peg2Idx];
      const path2 = move.path2 || [];
      if (!peg2.eligibleForSafeZone) {
        if (move.dest2 === ownFT || path2.includes(ownFT) ||
          move.dest2 === safeEntry || path2.includes(safeEntry)) {
          peg2.eligibleForSafeZone = true;
          log(`🔄 ${peg2.nickname || peg2.id} completed a circuit — eligible for safe zone`);
          if (window.triggerPegPose && peg2.id) {
            setTimeout(() => window.triggerPegPose(peg2.id, 'dance'), 0);
          }
        }
      }
    }
  }

  // ── FASTTRACK STATUS ENFORCEMENT ──
  // rules.json :: FT_LOSS_ON_4           (z=48) — Card 4 strips ALL player FT pegs.
  // rules.json :: FT_LOSS_ON_NON_FT_MOVE (z=56) — non-FT-traversing move strips at end of turn.
  // rules.json :: FT_LOSS_VOLUNTARY_EXIT (z=64) — moved peg leaving ft-* loses FT.
  // rules.json :: CARD_7_FT_HANDOFF      (z=42) — split FT-preservation rule.
  const destIsFT = getHoleType(move.dest) === 'fasttrack';
  const _curCardForFT = state.deck.get('currentCard');
  const _curCardRules = _curCardForFT ? CARDS[_curCardForFT.value] : null;
  const cardStripsAllFT = !!(_curCardRules && _curCardRules.noFastTrack);

  // Split FT-preservation (matches generation-time _ftRuleOK):
  // FT is preserved iff every FT peg in the split kept its half entirely on
  // the FT ring. Untouched FT pegs (3rd+) keep FT when this holds.
  let _splitPreservesFT = false;
  let _splitPeg2 = null;
  if (move.type === 'split') {
    _splitPeg2 = player.pegs[move.peg2Idx];
    const _path1 = move.path || [];
    const _path2 = move.path2 || [];
    const _isAllFT = (path) =>
      Array.isArray(path) && path.every(h => typeof h === 'string' && h.startsWith('ft-'));
    const _peg1OK = !peg.onFasttrack || _isAllFT(_path1);
    const _peg2OK = !_splitPeg2 || !_splitPeg2.onFasttrack || _isAllFT(_path2);
    _splitPreservesFT = _peg1OK && _peg2OK;
  }

  const isFTPreserving = !cardStripsAllFT && (
    (move.type === 'enterFastTrack' && destIsFT) ||
    move.type === 'enterBullseye' ||
    move.type === 'exitFastTrack' ||
    (move.type === 'move' && peg.onFasttrack && destIsFT) ||
    _splitPreservesFT
  );

  if (!isFTPreserving) {
    // The moved peg itself loses FT if it was on FT and landed off it
    if (peg.onFasttrack && getHoleType(move.dest) !== 'fasttrack') {
      peg.onFasttrack = false;
      peg.fasttrackEntryHole = null;
      peg.mustExitFasttrack = false;
    }
    // For splits, peg2 also moved — handle its individual landing identically
    if (move.type === 'split' && _splitPeg2 && _splitPeg2.onFasttrack &&
      getHoleType(move.dest2) !== 'fasttrack') {
      _splitPeg2.onFasttrack = false;
      _splitPeg2.fasttrackEntryHole = null;
      _splitPeg2.mustExitFasttrack = false;
    }
    // ALL other FT pegs also lose their status
    for (const p of player.pegs) {
      if (p === peg) continue;
      if (move.type === 'split' && p === _splitPeg2) continue;
      if (p.onFasttrack) {
        p.onFasttrack = false;
        p.fasttrackEntryHole = null;
        p.mustExitFasttrack = false;
        log(`⚠️ ${player.name}'s ${p.nickname || p.id} lost FastTrack status`);
      }
    }
  } else if (move.type === 'split') {
    // Split preserved FT for the player overall, but moved pegs that landed
    // off FT individually still lose their own FT status.
    if (peg.onFasttrack && getHoleType(move.dest) !== 'fasttrack') {
      peg.onFasttrack = false;
      peg.fasttrackEntryHole = null;
      peg.mustExitFasttrack = false;
    }
    if (_splitPeg2 && _splitPeg2.onFasttrack &&
      getHoleType(move.dest2) !== 'fasttrack') {
      _splitPeg2.onFasttrack = false;
      _splitPeg2.fasttrackEntryHole = null;
      _splitPeg2.mustExitFasttrack = false;
    }
  }

  // Sync peg matrix after every move
  syncPegMatrix();

  // Check win
  // The home-hole peg must have completed a circuit (eligibleForSafeZone === true)
  // to count as a real arrival — the 5th peg starts on home-{bp} at init and would
  // otherwise trigger an instant win the moment the other 4 fill the safe zone.
  const inSafe = player.pegs.filter(p => getHoleType(p.holeId) === 'safezone').length;
  const onHome = player.pegs.filter(p =>
    p.holeId === `home-${player.boardPosition}` &&
    p.eligibleForSafeZone &&
    inSafe >= SAFE_ZONE_SIZE
  ).length;
  if (inSafe >= SAFE_ZONE_SIZE && onHome > 0) {
    state.meta.set('winner', ci);
    log(`🏆 ${getCurrentPlayerName()} WINS!`);
    _deferredCutscenes.push(['win', {
      peg, playerColor: player.color, playerName: player.name,
      playerAvatar: player.avatar || '🎮', playerId: ci
    }]);
  }

  // Golden Crown — check if player filled safe zone and has a peg on home/FT
  if (inSafe >= SAFE_ZONE_SIZE && !onHome) {
    // Safe zone full but no peg on home yet — check if any peg is on
    // home stretch (own FT hole or regular track approaching home)
    const hasHomeStretchPeg = player.pegs.some(p =>
      p.holeId === `ft-${player.boardPosition}` ||
      p.holeId === `home-${player.boardPosition}` ||
      (p.onFasttrack && p.holeId !== 'holding')
    );
    if (hasHomeStretchPeg && !player._goldenCrownShown) {
      player._goldenCrownShown = true;
      log(`👑 ${player.name} has filled the safe zone! Golden Crown on home hole!`);
      if (window.showGoldenCrown) window.showGoldenCrown(player.boardPosition, player.color);
      _deferredCutscenes.push(['crown', {
        playerName: player.name, playerColor: player.color, playerId: ci
      }]);
    }
  }

  state.players.set('list', players);

  // Discard card
  const card = state.deck.get('currentCard');
  const discard = state.deck.get('discard') || [];
  discard.push(card);
  state.deck.set('discard', discard);

  // Store pending hop animation for the 3D renderer
  if (move.type === 'split') {
    // Queue both peg animations for split moves
    window._pendingHopAnim = { pegId: peg.id, path: move.path.slice(), from: move.from || peg.holeId };
    const peg2 = player.pegs[move.peg2Idx];
    window._pendingHopAnim2 = { pegId: peg2.id, path: move.path2.slice(), from: move.from2 || peg2.holeId };
  } else if (move.path && move.path.length > 0) {
    window._pendingHopAnim = { pegId: peg.id, path: move.path.slice(), from: move.from || peg.holeId };
  } else if (move.from && move.from !== move.dest) {
    // Single hop for enter/exit moves
    window._pendingHopAnim = { pegId: peg.id, path: [move.dest], from: move.from };
  }

  // Raise animation barrier before render so waitForAnimations blocks correctly
  if (window.raiseAnimationBarrier) window.raiseAnimationBarrier();
  renderBoard();

  // ── DEFERRED CUTSCENES: fire only AFTER hop animations complete ──
  const fireDeferredCutscenes = () => {
    for (const [type, data] of _deferredCutscenes) {
      CutsceneManager.queueCutscene(type, data);
    }
  };

  // ── Resolve the turn once every peg move + cutscene is complete ──
  // Capture the turn instance this move belongs to. resolveTurn() is the SINGLE
  // authority for what happens next (advance vs replay); the async layer below
  // only decides WHEN it runs. resolveTurn() drops the call if the turn has since
  // moved on (epoch changed) — a stale bot move can never advance the human.
  const _moveEpoch = _turnEpoch;
  // The move is applied and the turn is resolving: publish the resulting state
  // so every seat converges on it. Peers defer APPLYING a snapshot until their
  // own hop animations drain (see the pending-snapshot buffer in
  // fasttrack-3d.js), so publishing now cannot yank a peg mid-hop.
  _commitState('move');

  const waitForAll = () => {
    const waitAnims = (cb) => window.waitForAnimations ? window.waitForAnimations(cb) : cb();
    waitAnims(() => {
      fireDeferredCutscenes();
      // Resolve when the cutscene queue drains; the fallback guarantees the turn
      // is never stranded if a cutscene fails to report "drained". Firing twice or
      // late is harmless — resolveTurn() is idempotent by epoch.
      CutsceneManager.whenDrained(() => resolveTurn(_moveEpoch));
      setTimeout(() => resolveTurn(_moveEpoch), 6000);
    });
  };
  waitForAll();
}

// ═
// TURN MANAGER — one owner of whose turn it is, and it checks itself
// ═
// Whose turn it is has exactly ONE representation: the index
// state.players.current. Deliberately an index and not an isTurn boolean per
// player, because an index CANNOT represent two seats holding the turn at once,
// or none holding it. N booleans can, and then a desync between them is a whole
// new class of bug. isTurn(i) below is derived from the index, so the two can
// never disagree.
//
// What was missing was not a different data shape, it was ENFORCEMENT. Nothing
// checked that the turn actually rotates by one, so a skipped seat left no
// evidence and could only be caught by someone watching the screen. Every
// change of turn now goes through set(), which validates the transition and
// records it. A violation is logged loudly and kept, so a player who sees a
// seat skipped can run FastTrackTurns.report() and hand over proof instead of
// a description.
const TurnManager = {
  _history: [],      // every accepted transition, newest last
  _violations: [],   // transitions that broke the rules
  _max: 400,

  seats() { return state.players.get('list') || []; },
  count() { return this.seats().length; },
  current() { const c = state.players.get('current'); return Number.isInteger(c) ? c : 0; },

  /**
   * Whose turn it is, read off the player's own isTurn flag.
   * Exactly one player in the array carries true; every other carries false.
   */
  isTurn(seatIdx) {
    const p = this.seats()[Number(seatIdx)];
    return !!(p && p.isTurn);
  },

  /**
   * Stamp the flags across the whole array in ONE pass: the seat at `idx` gets
   * true, everyone else false. Writing them together is what keeps them
   * consistent; nothing else in the codebase may set isTurn.
   */
  _writeFlags(idx) {
    const seats = this.seats();
    for (let i = 0; i < seats.length; i++) {
      if (seats[i]) seats[i].isTurn = (i === Number(idx));
    }
  },

  /**
   * The invariant: exactly one player holds the turn, and it is the one the
   * index names. Returns null when healthy, or a description when not.
   */
  checkFlags() {
    const seats = this.seats();
    if (!seats.length) return null;
    const holders = [];
    for (let i = 0; i < seats.length; i++) if (seats[i] && seats[i].isTurn) holders.push(i);
    if (holders.length !== 1) {
      return `${holders.length} players hold isTurn (${holders.join(',') || 'none'}); exactly 1 must`;
    }
    if (holders[0] !== this.current()) {
      return `isTurn is on seat ${holders[0]} but the turn index says ${this.current()}`;
    }
    return null;
  },

  /** The seat whose turn it is, or null before the game starts. */
  activeSeat() { return this.seats()[this.current()] || null; },

  /** What the next seat must be. Pure round robin, no exceptions. */
  nextSeat() { const n = this.count(); return n ? (this.current() + 1) % n : 0; },

  /**
   * The ONLY place the turn changes.
   * reason: 'init' | 'advance' | 'restore'
   *   init     game start, any seat is legal
   *   advance  must be exactly the next seat in array order
   *   restore  applying an authoritative snapshot from elsewhere
   */
  set(next, reason) {
    const n = this.count();
    const from = this.current();
    const to = Number(next);
    const entry = { from, to, reason, at: Date.now(), seats: n };

    if (!Number.isInteger(to) || to < 0 || (n && to >= n)) {
      entry.error = `seat ${next} is not a valid index for ${n} players`;
    } else if (reason === 'advance' && n > 1) {
      const expected = (from + 1) % n;
      if (to !== expected) {
        const skipped = [];
        for (let s = (from + 1) % n; s !== to; s = (s + 1) % n) {
          skipped.push(s);
          if (skipped.length >= n) break;
        }
        entry.error = `turn jumped ${from} -> ${to}, expected ${expected}; skipped seat(s) ${skipped.join(',')}`;
        entry.skipped = skipped;
      }
    }

    if (entry.error) {
      entry.stack = (new Error('turn-order violation')).stack;
      this._violations.push(entry);
      console.error('[TURN][VIOLATION]', entry.error);
      console.error(entry.stack);
      // Deliberately NOT blocked. Refusing the write here would freeze the game
      // on a bad transition, which is worse than a skipped seat. Record and
      // continue; the whole point is evidence, not enforcement by veto.
    }

    this._history.push(entry);
    if (this._history.length > this._max) this._history.shift();
    state.players.set('current', to);
    this._writeFlags(to);

    // The flags are the visible state, so they get checked every single time.
    const flagProblem = this.checkFlags();
    if (flagProblem) {
      const bad = { from, to, reason, at: Date.now(), error: `isTurn invariant broken: ${flagProblem}`,
                    stack: (new Error('isTurn invariant')).stack };
      this._violations.push(bad);
      console.error('[TURN][VIOLATION]', bad.error);
    }
    return to;
  },

  /** Hand to a player who just saw a seat skipped. */
  report() {
    const names = this.seats().map((p, i) => `${i}:${p.name}${p.isBot ? '(bot)' : ''}`);
    return {
      seats: names,
      current: this.current(),
      isTurnFlags: this.seats().map((p, i) => `${i}:${p.isTurn ? 'TRUE' : 'false'}`),
      flagInvariant: this.checkFlags() || 'ok',
      activeIsBot: !!(this.activeSeat() || {}).isBot,
      violations: this._violations.slice(-20),
      recent: this._history.slice(-40).map(h =>
        `${h.from}->${h.to} (${h.reason})${h.error ? '  !! ' + h.error : ''}`),
    };
  },

  reset() { this._history = []; this._violations = []; },
};

if (typeof window !== 'undefined') window.FastTrackTurns = TurnManager;
// ══════════════════════════════════════════════════════════════════════════════
// AUTHORITATIVE TURN MACHINE (user_directive_2026-07-18c)
// ──────────────────────────────────────────────────────────────────────────────
// Unfoolable turn control. The next player is a PURE round-robin function of the
// current seat (see endTurn: next = (current + 1) % N) — WHO can never be wrong.
// Async callbacks only choose WHEN the deterministic advance runs. Every turn
// instance carries a monotonic epoch, bumped on every seat change (_applyTurnAdvance)
// AND every replay reopen (_replaySameSeat). A resolve tagged with an old epoch is
// a stale/duplicate call and is dropped — the stopgap verifier that makes
// "advance the wrong seat / run away / double-advance" impossible.
//   ADVANCE  ⇔  card is NOT a replay  AND  the turn is fully complete
//               (resolveTurn is only called once every peg move + cutscene is done).
//   REPLAY   ⇔  card IS a replay (A, 6, J, Q, K, JOKER) → same seat draws again.
let _turnEpoch = 0;

// cardReplay: the drawn card grants the same player another draw (no rotation).
function _cardIsReplay(card) {
  const r = card && CARDS[card.value];
  return !!(r && r.extraTurn);
}

// Resolve the CURRENT turn exactly once. `epoch` was captured when the move was
// made; if the turn has already moved on this call is stale and is dropped.
function resolveTurn(epoch) {
  if (epoch !== _turnEpoch) return;              // stopgap verifier: stale / duplicate
  if (state.meta.get('winner') !== null) { _resolveWinner(); return; }
  const card = state.deck.get('currentCard');
  if (_cardIsReplay(card)) _replaySameSeat();    // replay → same seat draws again
  else endTurn(epoch);                           // deterministic round-robin advance (epoch-verified)
}

// Replay: reopen the draw for the SAME seat as a fresh turn instance.
function _replaySameSeat() {
  _turnEpoch++;                                  // new instance; the old move's resolve is now stale
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const cp = players[ci];
  log(`${getCurrentPlayerName()} gets another turn!`);
  try { showRedrawToast(cp && cp.name, cp && cp.color); } catch (_) { /* ignore */ }
  state.deck.set('currentCard', null);
  state.turn.set('phase', 'draw');
  updateUI();
  // A replay card resolves the turn just as much as a rotation does: the card
  // is cleared and the seat reopens for a fresh draw. Without this the last
  // state peers received was the mid-move snapshot, so on every A/6/J/Q/K/JOKER
  // they were left holding a card the host had already discarded.
  _commitState('replay');
  if (cp && cp.isBot && (!_isMpMode() || _isHost())) setTimeout(botTurn, 800);
}

// Game over: announce the winner, do NOT rotate.
function _resolveWinner() {
  const winnerName = getCurrentPlayerName();
  const gs = (typeof document !== 'undefined') && document.getElementById('game-status');
  if (gs) gs.textContent = `🏆 ${winnerName} WINS!`;
  try { if (typeof window !== 'undefined' && window.KGGameCache) window.KGGameCache.purgeRuntime('game_winner'); } catch (_) { /* ignore */ }
  try { if (_mpClient && typeof _mpClient.sendGameOver === 'function' && _isHost()) _mpClient.sendGameOver('win', winnerName, null, `${winnerName} wins!`); } catch (_) { /* ignore */ }
  if (typeof window !== 'undefined' && window.showReplayPrompt && !window._replayPromptShown) {
    window._replayPromptShown = true;
    setTimeout(() => window.showReplayPrompt(winnerName), 1200); // let the last animation play
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// PASS TURN — universal safety-net (user_directive_2026-05-19)
// ─────────────────────────────────────────────────────────────────────────
// If for any reason the game appears stuck on the current player's turn
// (no legal moves detected but the "End Turn" hint never appeared, a split
// stuck in mid-selection, a broken validMoves pipeline, etc.), the player
// can force their turn to end via the always-visible "⏭ Pass" button or
// the watchdog auto-trigger. Per rules.json (CARD_NO_LEGAL_MOVE):
//   legalMoves.length === 0 ==> discard(card); endTurn(); extraTurn = false
// We apply the same outcome unconditionally on pass: clear the card, clear
// any split-pick state, then route through the normal endTurn() so MP
// turn-advance broadcasts fire on the correct path.
// ═══════════════════════════════════════════════════════════════════════════
function passTurn(reason) {
  try {
    // In MP, only the active player may pass their own turn (or the host
    // for a bot that's wedged). Mirrors the endTurn() authority check.
    if (_isMpMode()) {
      const players = state.players.get('list') || [];
      const ci = state.players.get('current') || 0;
      const cur = players[ci];
      const curIsBot = !!(cur && cur.isBot);
      // Host may pass whichever seat is current (it is the sole turn authority
      // and backstops stalled remotes); a non-host may only pass its own human
      // turn. Either way the actual rotation happens in the host's endTurn().
      const allowed = _isHost() ? true : (!curIsBot && _isMyTurn());
      if (!allowed) {
        console.warn('[PASS] Ignored — not host and not own human turn.');
        return;
      }
    }
    // RECOVERY / forfeit path (stuck-watchdog, no-legal-move, host relinquish,
    // manual). It advances the CURRENT turn deterministically. Capture the live
    // epoch NOW and hand it to endTurn(): if two passes race, only the first (this
    // epoch) advances — the second finds the epoch already bumped and is dropped.
    // It is never blocked by prior state (gating it froze the game before).
    const _passEpoch = _turnEpoch;
    // Clear in-progress split selection so the next turn starts fresh.
    if (typeof _splitPegIdx !== 'undefined') _splitPegIdx = null;
    if (typeof _splitStepChoice !== 'undefined') _splitStepChoice = null;
    // Clear any lingering highlights & the toast dedupe key.
    if (window.clearHighlights) try { window.clearHighlights(); } catch (_) { }
    _lastNoLegalMoveTurnStamp = null;
    // Clear the in-progress card and validMoves so endTurn / next-player UI
    // is reset and no stale move can be replayed.
    try { state.deck.set('currentCard', null); } catch (_) { }
    try { state.turn.set('validMoves', []); } catch (_) { }
    try { state.turn.set('phase', 'draw'); } catch (_) { }
    const players = state.players.get('list') || [];
    const ci = state.players.get('current') || 0;
    const curPlayer = players[ci] || {};
    showCenterToast(
      `${curPlayer.name || 'Player'}: turn passed${reason ? ' (' + reason + ')' : ''}`,
      curPlayer.color || '#ff9a7a',
      1800
    );
    log(`⏭ ${curPlayer.name || 'Player'} passed their turn${reason ? ' (' + reason + ')' : ''}.`);
    endTurn(_passEpoch);
  } catch (err) {
    console.error('[PASS] passTurn() failed:', err);
    // Last-ditch: try to advance turn anyway so the game doesn't freeze.
    try { endTurn(_turnEpoch); } catch (_) { }
  }
}
if (typeof window !== 'undefined') window.passTurn = passTurn;

// ── STUCK-TURN WATCHDOG ─────────────────────────────────────────────────
// Polls every 2s. If the current player is human (not bot), it's their
// turn (or solo/same-screen), validMoves is empty, AND no card draw is
// pending (phase !== 'draw'), we count down ~12s of inactivity before
// auto-passing. Resets whenever phase/validMoves change.
let _stuckWatchdogTimer = null;
let _stuckSinceMs = 0;
let _stuckLastSig = '';
const STUCK_AUTO_PASS_MS = 12000;
function _stuckSig() {
  try {
    const ci = state.players.get('current') || 0;
    const phase = state.turn.get('phase');
    const vmLen = (state.turn.get('validMoves') || []).length;
    const card = state.deck.get('currentCard');
    return `${ci}|${phase}|${vmLen}|${card && card.id}`;
  } catch (_) { return ''; }
}
function _stuckWatchdogTick() {
  try {
    const players = state.players.get('list') || [];
    const ci = state.players.get('current') || 0;
    const cur = players[ci];
    if (!cur || cur.isBot) { _stuckSinceMs = 0; _stuckLastSig = _stuckSig(); return; }
    // Non-host clients only watch their OWN turn — they can't advance anyone
    // else. The host watches whichever seat is current (its authority covers
    // every seat) so it can backstop-pass a genuinely stalled remote human.
    if (_isMpMode() && !_isHost() && !_isMyTurn()) { _stuckSinceMs = 0; _stuckLastSig = _stuckSig(); return; }
    const phase = state.turn.get('phase');
    const vm = state.turn.get('validMoves') || [];
    const card = state.deck.get('currentCard');
    // Only consider "stuck" when a card has been drawn and no legal moves exist.
    if (!card || vm.length > 0 || phase === 'draw') {
      _stuckSinceMs = 0;
      _stuckLastSig = _stuckSig();
      return;
    }
    const sig = _stuckSig();
    if (sig !== _stuckLastSig) {
      _stuckLastSig = sig;
      _stuckSinceMs = Date.now();
      return;
    }
    if (!_stuckSinceMs) _stuckSinceMs = Date.now();
    if (Date.now() - _stuckSinceMs >= STUCK_AUTO_PASS_MS) {
      console.warn('[WATCHDOG] Stuck turn detected — auto-passing.');
      _stuckSinceMs = 0;
      _stuckLastSig = '';
      passTurn('auto');
    }
  } catch (_) { /* ignore */ }
}
function _ensureStuckWatchdog() {
  if (_stuckWatchdogTimer) return;
  _stuckWatchdogTimer = setInterval(() => { _stuckWatchdogTick(); _idleTick(); }, 2000);
}
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _ensureStuckWatchdog, { once: true });
  } else {
    _ensureStuckWatchdog();
  }
}

// ─── IDLE-RELINQUISH (host abandonment recovery, user_directive_2026-07-18) ───
// Fast Track has NO voluntary passes — skipping a turn could be a strategic dodge
// (avoid making a peg vulnerable, or keep a rival from becoming vulnerable). The
// ONLY way a turn is taken from a player is host-initiated abandonment recovery,
// staged to be fair to someone who just stepped away:
//   1. The current HUMAN sits idle for _IDLE_TO_WARN_MS (default 2 min).
//   2. A 30s WARNING (_WARN_MS) begins: ALL players are alerted that this player
//      may be relinquished, and the host's ⏭ button APPEARS but stays DISABLED
//      (bathroom-break grace — the host can simply wait it out).
//   3. After the 30s the button ENABLES. The host may relinquish the player to a
//      bot and advance, OR keep waiting. ANY action by the player at any point
//      cancels the whole thing and hides the button.
// Only applies with 2+ humans (solo / vs-bots have nothing to abandon). Authority:
// the host online, or the shared device in same-screen. Timers are overridable via
// state.meta (idleWarnMs / idleWarnWindowMs) for tuning + tests.
const _IDLE_TO_WARN_MS = 120_000; // 2 min before the warning begins
const _WARN_MS = 30_000;          // 30s warning window before the host can act
let _idleSince = 0;
let _idleSig = '';
let _idleSeat = null;             // seat currently in warning/relinquishable state
let _idleStage = 'none';         // 'none' | 'warning' | 'relinquishable'
let _idleWarnedSig = '';         // sig we've already alerted for (alert once per turn)

const _idleWarnAt = () => Number(state.meta.get('idleWarnMs')) || _IDLE_TO_WARN_MS;
const _idleWinMs = () => Number(state.meta.get('idleWarnWindowMs')) || _WARN_MS;

function _sameScreen() { return (state.meta.get('gameMode') || 'solo') === 'same-screen'; }

// Who may relinquish an idle player: the host online (never their OWN turn), or the
// shared device in same-screen. Never in solo / vs-bots.
function _canRelinquishCurrent() {
  if (_sameScreen()) return true;
  return _isMpMode() && _isHost() && !_isMyTurn();
}

function _idleRelevant() {
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const cur = players[ci];
  if (!cur || cur.isBot) return false;
  return players.filter(p => p && !p.isBot).length >= 2; // 2+ humans only
}

function _resetIdle() {
  _idleSince = 0; _idleSig = '';
  if (_idleStage !== 'none' || _idleSeat !== null) {
    _idleStage = 'none'; _idleSeat = null;
    _updateHostAdvanceButton();
  }
}

function _idleTick() {
  try {
    if (!_idleRelevant()) { _resetIdle(); return; }
    const ci = state.players.get('current') || 0;
    const card = state.deck.get('currentCard');
    const sig = `${ci}|${state.turn.get('phase')}|${card && card.id}`;
    if (sig !== _idleSig) {                       // any activity resets the idle clock
      _idleSig = sig; _idleSince = Date.now();
      if (_idleStage !== 'none') { _idleStage = 'none'; _idleSeat = null; _updateHostAdvanceButton(); }
      return;
    }
    if (!_idleSince) _idleSince = Date.now();
    const idle = Date.now() - _idleSince;
    let stage = 'none';
    if (idle >= _idleWarnAt() + _idleWinMs()) stage = 'relinquishable';
    else if (idle >= _idleWarnAt()) stage = 'warning';
    if (stage !== _idleStage || (stage !== 'none' && _idleSeat !== ci)) {
      _idleStage = stage;
      _idleSeat = (stage === 'none') ? null : ci;
      if (stage === 'warning' && _idleWarnedSig !== sig) {
        _idleWarnedSig = sig;
        const players = state.players.get('list') || [];
        const nm = (players[ci] && players[ci].name) || `Player ${ci + 1}`;
        _alertAllPlayers(`⏳ ${nm} has 30 seconds to take their turn, or the host may hand it to a bot.`);
      }
      _updateHostAdvanceButton();
    }
  } catch (_) { /* ignore */ }
}

// Show/label/enable the host ⏭ button per the idle stage. Hidden unless the
// current human is idle AND this client may relinquish them.
function _updateHostAdvanceButton() {
  const btn = (typeof document !== 'undefined') && document.getElementById('btn-pass-turn');
  if (!btn) return;
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const cur = players[ci];
  const show = _idleRelevant() && _canRelinquishCurrent() && _idleSeat === ci && _idleStage !== 'none' && cur && !cur.isBot;
  btn.style.display = show ? '' : 'none';
  if (!show) { btn.disabled = true; return; }
  const nm = (cur && cur.name) || `Player ${ci + 1}`;
  btn.disabled = (_idleStage !== 'relinquishable');   // disabled during the 30s grace
  btn.textContent = (_idleStage === 'relinquishable') ? `⏭ Relinquish ${nm} to bot` : `⏳ ${nm} idle — 30s…`;
  btn.title = (_idleStage === 'relinquishable')
    ? `Host: replace ${nm} (idle) with a bot and advance. Fast Track has no voluntary passes.`
    : `${nm} is idle. If they don't act within 30 seconds you can relinquish them to a bot.`;
}
if (typeof window !== 'undefined') window._updateHostAdvanceButton = _updateHostAdvanceButton;

// Alert every player (local toast + log; host also broadcasts so peers see it).
function _alertAllPlayers(msg, color) {
  try { if (typeof showCenterToast === 'function') showCenterToast(msg, color || '#ffcf6b', 3200); } catch (_) {}
  try { log(msg); } catch (_) {}
  if (!_applying && _isMpMode() && _isHost()) {
    try { _broadcast('notice', { msg, color: color || '#ffcf6b' }); } catch (_) {}
  }
}

// Host action: replace the idle current player with a bot, alert everyone, advance.
// Only fires once the 30s warning has fully elapsed (button is enabled).
function hostRelinquishToBot() {
  if (!_canRelinquishCurrent()) return;
  if (_idleStage !== 'relinquishable') return;
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const cp = players[ci];
  if (!cp || cp.isBot) return;
  const origName = cp.name;
  // Stash identity so a returning player could be restored (see _maybeRestoreFromAfk).
  _AFK.away.set(ci, { name: cp.name, avatar: cp.avatar, isBot: cp.isBot, userId: cp.userId, reason: 'host-relinquish', at: Date.now() });
  cp.name = `${origName} (bot)`;
  cp.avatar = '🤖';
  cp.isBot = true;
  state.players.set('list', players);
  _alertAllPlayers(`🤖 ${origName} was idle and has been handed to a bot by the host.`);
  if (!_applying && _isMpMode() && _isHost()) { try { _broadcast('relinquish', { seat: ci, id: _seatIdentity(cp), name: origName }); } catch (_) {} }
  _resetIdle();
  updateUI();
  passTurn('host-relinquish'); // advance to the next player
}
if (typeof window !== 'undefined') { window.hostRelinquishToBot = hostRelinquishToBot; window._idleTick = _idleTick; window._getTurnEpoch = () => _turnEpoch; window.resolveTurn = resolveTurn; }


function endTurn(epoch) {
  // ── THE single, epoch-verified rotation choke point ──────────────────────
  // EVERY advance passes the epoch of the turn it is resolving. If that turn has
  // already moved on (epoch bumped by a prior advance in _applyTurnAdvance), this
  // call is a STALE or DUPLICATE advance and is DROPPED. That is what makes a
  // skipped seat (double-advance) structurally impossible — the exact "it can
  // never not be the next player" verifier. Recovery / no-move callers pass the
  // CURRENT epoch, so they always advance the live turn (never a freeze). The
  // rotation itself is deterministic: next = (current + 1) % N (below).
  if (epoch !== undefined && epoch !== _turnEpoch) {
    console.warn(`[TURN] stale/duplicate endTurn dropped — epoch ${epoch} != live ${_turnEpoch}`);
    return;
  }
  // Clear any lingering path highlights
  if (window.clearHighlights) window.clearHighlights();

  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const next = (ci + 1) % players.length;

  // ── Host-authoritative turn rotation (MP) ─────────────────────────────
  // The host runs the full game simulation for EVERY seat: its own turns and
  // bot turns directly, and each remote human's turn by replaying their
  // relayed draw/move under the _applying guard. Because of that, the host's
  // endTurn() is reached exactly once per turn for ALL players — making the
  // host the natural single authority. The host advances current and
  // broadcasts 'turn_advance'; every client (host included) commits the
  // rotation only when applying that broadcast's fresh seq. Non-host peers
  // NEVER advance locally; they clear their in-progress turn UI and wait.
  //
  // This replaces the older "active player advances their own turn" model,
  // which desynced whenever two clients both believed it was their turn (the
  // _isMyTurn fallbacks are deliberately permissive), when per-client turn
  // seqs collided, or when a self-broadcast was dropped or duplicated. With a
  // single advancer, those whole failure classes disappear.
  if (_isMpMode()) {
    if (_isHost()) {
      const nextId = _seatIdentity(players[next]);
      _applyTurnAdvance(ci, next, ++_turnSeq);
      _lastAppliedTurnSeq = _turnSeq; // our own advance counts as applied; reject any echo
      _broadcast('turn_advance', { from: ci, next, nextId, seq: _turnSeq });
      console.log('[TURN] host advanced turn. ci:', ci, '-> next:', next, 'nextId:', nextId, 'seq:', _turnSeq);
    } else {
      _localTurnUiCleanup();
      // BUGFIX 2026-09-05 (skipped / stuck turns): tell the host this seat is
      // finished.
      //
      // A non-host ends its turn through several paths that never produce a
      // move: no legal moves for the drawn card, the manual end-turn button,
      // the stuck watchdog, an idle relinquish. Every one of them lands here.
      // Previously this branch cleaned up the local UI and returned, sending
      // NOTHING. The host, which is the only seat allowed to rotate, was never
      // told the turn was over, so it sat on that seat forever and the table
      // stopped. Isolated and reproduced: a peer holding a 2 with all pegs in
      // holding has zero legal moves, ends its turn, and not one byte goes on
      // the wire.
      //
      // After a MOVE this is redundant, because the host rotates when it
      // applies the broadcast move. Sending it anyway is deliberate and safe:
      // the handler ignores it unless the reported seat is still the active
      // one, so a late or duplicate turn_done can never rotate twice.
      const _doneSeat = players[ci];
      _broadcast('turn_done', {
        seat: ci,
        seatId: _seatIdentity(_doneSeat),
        epoch: epoch !== undefined ? epoch : _turnEpoch,
      });
      console.log('[TURN] non-host endTurn — cleaned up; told the host this seat is done.');
    }
    return;
  }

  // Solo / same-screen: original local advance.
  _applyTurnAdvance(ci, next, ++_turnSeq);
}

// Wipe the in-progress turn's local UI (card / hints / draw button) without
// touching state.players.current. Used by non-host peers in endTurn().
function _localTurnUiCleanup() {
  _clearNoMoveAutoTimer();
  state.deck.set('currentCard', null);
  state.turn.set('phase', 'draw');
  state.turn.set('validMoves', []);
  // Card face stays visible from the previous draw until the next player
  // draws their card — it represents the in-progress turn's value the
  // entire time. We deliberately do NOT flip it back to the deck here.
  const infoEl = document.getElementById('card-info');
  if (infoEl) infoEl.textContent = 'Draw a card';
  const hintsDiv = document.getElementById('move-hints');
  if (hintsDiv) hintsDiv.innerHTML = '';
  setOptionsPanelVisible(false);
  const drawBtn = document.getElementById('draw-btn');
  if (drawBtn) drawBtn.disabled = true;
  updateUI();
}

// The single canonical turn-advance routine. Called locally on the host when
// it ends a turn, and on every peer (including the host) when a 'turn_advance'
// message is applied. Idempotent: a stale seq is rejected by the caller.
function _applyTurnAdvance(fromCi, next, seq) {
  const players = state.players.get('list') || [];
  if (!players.length) {
    console.warn('[TURN] _applyTurnAdvance: No players in list! fromCi:', fromCi, 'next:', next, 'seq:', seq);
    return;
  }
  console.log('[TURN] _applyTurnAdvance called. fromCi:', fromCi, 'next:', next, 'seq:', seq, 'players:', players.map(p => p && p.name));

  state.deck.set('currentCard', null);
  // Through the manager so a jump that is not exactly +1 is recorded with a
  // stack trace instead of vanishing.
  TurnManager.set(next, 'advance');
  _turnEpoch++; // new turn instance — any pending resolve for the old seat is now stale
  const _advEpoch = _turnEpoch; // this turn's epoch; the enable-gate below verifies against it
  // Turn boundary: cancel any pending no-legal-move auto-relinquish from the
  // seat we just left, and try to restore the next seat from AFK if they
  // returned.
  _clearNoMoveAutoTimer();
  _maybeRestoreFromAfk(next);
  if (window.CameraDirector) window.CameraDirector.setActivePlayer(next);

  // Disable draw button while camera transitions + avatar blinks
  const drawBtn = document.getElementById('draw-btn');
  if (drawBtn) drawBtn.disabled = true;

  state.turn.set('phase', 'draw');
  state.turn.set('validMoves', []);

  // Card face stays visible from the previous draw until the next player
  // draws — represents the in-progress turn's value for its full duration.
  const infoEl = document.getElementById('card-info');
  if (infoEl) infoEl.textContent = 'Draw a card';
  const hintsDiv = document.getElementById('move-hints');
  if (hintsDiv) hintsDiv.innerHTML = '';
  setOptionsPanelVisible(false);
  updateUI();

  // The seat has rotated. Publish before the presentation chain below, so the
  // authoritative turn reaches every seat without waiting on a camera or a blink.
  _commitState('turn');

  // Gate: wait for camera to settle, THEN blink avatar 3 times, THEN enable turn
  const enableTurn = () => {
    // Stale-gate (same epoch counter as the rest of the turn machine): this enable
    // was scheduled for the turn whose epoch is _advEpoch. If the turn has already
    // rotated on (epoch bumped), this enable is for a dead turn — do nothing, or it
    // would trigger a redundant botTurn / enable the wrong seat. The live turn has
    // its own enable-gate, so nothing is stranded.
    if (_turnEpoch !== _advEpoch) return;
    if (players[next] && players[next].isBot) {
      // Bot's turn — dismiss the prompt; bot will drive itself.
      dismissYourTurnPopup();
      // In MP, only the host should drive bot turns to avoid every peer
      // racing to broadcast the same draw/move pair.
      if (!_isMpMode() || _isHost()) botTurn();
    } else {
      // Human turn: leave the DRAW CARD prompt up until they draw.
      if (drawBtn && (!_isMpMode() || _isMyTurn())) drawBtn.disabled = false;
    }
  };

  const startBlink = () => {
    const gameMode = state.meta.get('gameMode') || 'solo';
    const isSameScreen = gameMode === 'same-screen';
    const mpMode = _isMpMode();

    // Show turn indicator for:
    // - Same-screen mode: only HUMAN players (bots drive themselves; popping
    //   a "Ken's Turn" banner on every bot turn is just noise).
    // - In networked MP, only the LOCAL active player (peers must not see
    //   the active player's mechanics — only the pegs moving) AND only when
    //   that local active player is a human.
    // - In solo, only non-bot players.
    const activeIsBot = !!(players[next] && players[next].isBot);
    let shouldShowIndicator;
    if (activeIsBot) {
      shouldShowIndicator = false;
    } else if (isSameScreen) {
      shouldShowIndicator = true;
    } else if (mpMode) {
      shouldShowIndicator = _isMyTurn();
    } else {
      shouldShowIndicator = true;
    }

    if (shouldShowIndicator) {
      const indicatorText = isSameScreen ? `${players[next].name}'s Turn` : players[next].name;
      showYourTurnPopup(indicatorText, players[next].color);
      // Popup persists until the active player draws a card (drawCard() calls
      // dismissYourTurnPopup). No auto-timeout.
    }

    if (window.blinkPlayerMarker) {
      window.blinkPlayerMarker(next, enableTurn);
    } else {
      enableTurn();
    }
  };

  if (window.CameraDirector && window.CameraDirector.mode === 'auto') {
    // Never let a camera that fails to settle (or a clobbered settled-callback)
    // strand the turn: startBlink -> blinkPlayerMarker -> enableTurn MUST run so
    // the next player can act, else the game freezes with no legal way forward
    // (the stuck-watchdog can't help — phase is 'draw'). Fire on settle OR a
    // short fallback, whichever comes first, exactly once.
    let _blinkStarted = false;
    const _startBlinkOnce = () => { if (_blinkStarted) return; _blinkStarted = true; startBlink(); };
    window.CameraDirector.whenSettled(_startBlinkOnce);
    setTimeout(_startBlinkOnce, 1200);
  } else {
    startBlink();
  }
}

function getCurrentPlayerName() {
  const players = state.players.get('list') || [];
  return players[state.players.get('current') || 0].name;
}

// ═══════════════════════════════════════════════════════════════════════════
// BOT STRATEGY — difficulty profiles and positional play
// ═══════════════════════════════════════════════════════════════════════════
// player.aiDifficulty was already set on every bot at init, but nothing read it,
// so all four settings played identically. These profiles are what make the
// setting mean something.
//
// DIFFICULTY IS THE CUTTING AXIS, per the house rules:
//   easy    only cuts when there is no other legal move
//   normal  cuts when it is strategically worth it
//   hard    hunts other pegs, humans first, and will go out of its way to do it
//   expert  hard, with sharper positional play on top
//
// Positional play is a separate thing from aggression, so it scales in by
// weight rather than switching on and off.
const AI_PROFILES = {
  easy: {
    cutMode: 'last-resort',
    cutBonus: 0,
    huntWeight: 0,
    humanPreference: 0,
    stagingWeight: 0,
    bullseyeAppetite: 0.35,
  },
  normal: {
    cutMode: 'strategic',
    cutBonus: 0,            // the peg personality's own w.capture decides
    huntWeight: 0,
    humanPreference: 0,
    stagingWeight: 45,
    bullseyeAppetite: 1.0,
  },
  hard: {
    cutMode: 'aggressive',
    cutBonus: 55,
    huntWeight: 40,
    humanPreference: 35,
    stagingWeight: 55,
    bullseyeAppetite: 1.15,
  },
  expert: {
    cutMode: 'aggressive',
    cutBonus: 70,
    huntWeight: 55,
    humanPreference: 45,
    stagingWeight: 70,
    bullseyeAppetite: 1.25,
  },
};

// How far a capture is pushed down when the profile says "last resort". It has
// to exceed anything the rest of the scoring can award, so that ANY non-capture
// outranks ANY capture. Only when every legal move is a cut does one win.
const LAST_RESORT_CUT_PENALTY = 100000;

function _aiProfile(player) {
  const key = String((player && player.aiDifficulty) || 'normal').toLowerCase();
  return AI_PROFILES[key] || AI_PROFILES.normal;
}

// Clockwise distance along the shared track from one hole to another. Null when
// either hole is off the track (holding, safe zone, home, bullseye), because
// distance is meaningless there.
function _trackGap(fromHole, toHole) {
  if (!fromHole || !toHole) return null;
  const a = CLOCKWISE_TRACK.indexOf(fromHole);
  const b = CLOCKWISE_TRACK.indexOf(toHole);
  if (a < 0 || b < 0) return null;
  const n = CLOCKWISE_TRACK.length;
  return ((b - a) % n + n) % n;
}

// ── THE FOUR-BACK STAGING RULE ─────────────────────────────────────────────
// A peg only becomes eligible for the safe zone by crossing its own entrance,
// outer-{bp}-2. Card 4 moves BACKWARD, so a peg parked 1 to 4 holes PAST its
// entrance can play a 4, cross back over it, and be eligible to enter the safe
// zone on a later turn. That turns the 4 from a setback into a shortcut, and it
// is the most useful piece of positional play in the game.
//
// Only worth anything to a peg that is not eligible yet. Once a peg has crossed,
// parking there does nothing for it.
const SAFE_ENTRY_STAGING_BAND = 4;

function _holesPastSafeEntry(holeId, boardPosition) {
  return _trackGap(`outer-${boardPosition}-2`, holeId);
}

function _isStagedForFour(holeId, boardPosition) {
  const past = _holesPastSafeEntry(holeId, boardPosition);
  return past !== null && past >= 1 && past <= SAFE_ENTRY_STAGING_BAND;
}

// Does this move land an opponent peg under one of ours?
function _moveCutsSomeone(move, ci) {
  const hit = (dest) => {
    if (!dest) return false;
    const occ = state.board.get(dest);
    return !!(occ && occ.playerIdx !== ci);
  };
  return hit(move.dest) || (move.type === 'split' && hit(move.dest2));
}

// ── HUNTING (hard and expert) ──────────────────────────────────────────────
// Closing on prey matters even when this turn cannot cut, because a peg sitting
// a few holes behind an opponent threatens it on the next draw. Humans are
// worth more than bots, because that is what makes a hard bot feel hard to a
// person. Returns a bonus for ending at `dest`.
function _huntBonus(dest, ci, players, profile) {
  if (!profile.huntWeight || !dest) return 0;
  let best = 0;
  for (let pi = 0; pi < players.length; pi++) {
    if (pi === ci) continue;
    const isHuman = !players[pi].isBot;
    for (const peg of players[pi].pegs) {
      // Only pegs that can actually be cut are worth chasing.
      if (peg.holeType === 'holding' || peg.holeType === 'safezone'
        || peg.holeType === 'home') continue;
      const d = _trackGap(dest, peg.holeId);
      // d === 0 is the cut itself, scored elsewhere. Past ten holes the threat
      // is too far off to steer for.
      if (d === null || d === 0 || d > 10) continue;
      const closeness = (11 - d) / 10;            // 1.0 adjacent, 0.1 at ten
      let value = profile.huntWeight * closeness;
      if (isHuman) value += profile.humanPreference * closeness;
      if (value > best) best = value;
    }
  }
  return best;
}

// ── HOW FAR BEHIND ARE WE ──────────────────────────────────────────────────
// Used for the bullseye decision: a peg that is behind and needs a quick
// advance can justify the risk of sitting in the centre. Returns 0 when this
// player is leading and approaches 1 when they are furthest back.
function _behindFactor(players, ci) {
  const progress = (pl) => {
    let n = 0;
    for (const pg of pl.pegs) {
      if (pg.holeType === 'home') n += 3;
      else if (pg.holeType === 'safezone') n += 2;
      else if (pg.holeType !== 'holding') n += 1;
    }
    return n;
  };
  const mine = progress(players[ci]);
  let best = mine;
  for (let pi = 0; pi < players.length; pi++) {
    if (pi === ci) continue;
    const p = progress(players[pi]);
    if (p > best) best = p;
  }
  if (best <= 0) return 0;
  return Math.max(0, Math.min(1, (best - mine) / best));
}

// ═══════════════════════════════════════════════════════════════════════════
// BOT AI
// ── BOT PACING — how long a bot takes, so a person can SEE it happen ──
// A bot needs no time to decide anything; these pauses exist purely so the
// table is followable. Previously 500 + 600 = 1.1s per bot turn, and with three
// bots a whole round was over in about three seconds. Reported as bots being
// 'skipped': the turn genuinely reached every seat, it was just gone before it
// registered. A bot that FORFEITS is the worst case, because there is no peg
// animation to watch either, just a toast.
//
// Tunable live from the console without a redeploy:
//     FastTrackPace.think = 1400; FastTrackPace.decide = 1600;
// Set both low (say 120) to fast-forward a game while testing.
const BOT_PACE = {
  think: 900,    // before the bot draws its card
  decide: 1100,  // between the draw landing and the move being played
};
if (typeof window !== 'undefined') window.FastTrackPace = BOT_PACE;
// ═══════════════════════════════════════════════════════════════════════════
function botTurn() {
  // ── HARD GUARD (user_directive_2026-05-18: "bots taking over human turns")
  // botTurn() is reached via several scheduled paths (setTimeout from
  // initial-turn, extra-turn, AFK takeover) which capture state at SCHEDULE
  // time, not FIRE time. If state.players.current advances or the seat at
  // `current` is no longer a bot by the time the timer fires, the original
  // checks at the call sites are stale and the bot would play on the human's
  // behalf. Re-verify here; bail (no-op) if it isn't a bot's turn anymore.
  {
    const _players = state.players.get('list') || [];
    const _ci = state.players.get('current') || 0;
    const _cur = _players[_ci];
    if (!_cur || !_cur.isBot) {
      console.warn('[BOT] botTurn() suppressed — current player is not a bot.',
        { ci: _ci, name: _cur && _cur.name, isBot: _cur && _cur.isBot });
      return;
    }
    // Belt-and-suspenders: never auto-play the LOCAL human's OWN seat, even if
    // a stray roster echo flipped its isBot flag true. Identify "my" seat by
    // userId. Skipped in solo (no userId resolves) so real bots still run.
    {
      const _me = _myUserId();
      if (_me != null && _cur.userId != null && String(_cur.userId) === String(_me)) {
        console.warn('[BOT] botTurn() suppressed — current seat is the local human.',
          { ci: _ci, name: _cur && _cur.name });
        return;
      }
    }
    // In MP, only the host drives bot turns; double-check here too.
    if (_isMpMode() && !_isHost()) {
      console.warn('[BOT] botTurn() suppressed — not the host in MP mode.');
      return;
    }
  }
  const _botEpoch = _turnEpoch; // the turn this bot is playing (drawing doesn't bump it) —
                                // used to epoch-verify a no-move forfeit so a stale/duplicate
                                // bot trigger can't double-advance and skip the next seat.
  log(`${getCurrentPlayerName()} is thinking...`);
  setTimeout(() => {
    // ── Inner re-verify: between the "thinking" log and actually drawing,
    // another setTimeout cycle has elapsed. State could have shifted again
    // (snapshot apply, manual takeBreak/resume, etc.). Re-verify.
    const _players2 = state.players.get('list') || [];
    const _ci2 = state.players.get('current') || 0;
    const _cur2 = _players2[_ci2];
    if (!_cur2 || !_cur2.isBot) {
      console.warn('[BOT] botTurn() inner phase suppressed — current player is no longer a bot.',
        { ci: _ci2, name: _cur2 && _cur2.name });
      return;
    }
    drawCard();
    setTimeout(() => {
      // ── Third re-verify before executing the bot's move.
      const _players3 = state.players.get('list') || [];
      const _ci3 = state.players.get('current') || 0;
      const _cur3 = _players3[_ci3];
      if (!_cur3 || !_cur3.isBot) {
        console.warn('[BOT] botTurn() move phase suppressed — current player is no longer a bot.',
          { ci: _ci3, name: _cur3 && _cur3.name });
        return;
      }
      const vm = state.turn.get('validMoves') || [];
      if (vm.length === 0) {
        // No valid moves: forfeit this turn. Epoch-verified with the epoch captured
        // when this bot turn began, so a stale/duplicate bot trigger is dropped
        // instead of double-advancing and skipping the next seat.
        log('🤖 Bot has no valid moves, ending turn.');
        // SHOW IT. A bot that moves is visible because its peg animates; a bot
        // that forfeits used to show nothing at all and resolve in a few
        // milliseconds, because bots never get the turn indicator
        // (shouldShowIndicator is false for them). With three bots at the table
        // that happens most rounds, and from the player's chair a seat that
        // silently does nothing is indistinguishable from a seat being skipped.
        // Reported exactly that way: "it ignores the 3rd bot".
        //
        // The toast is fire-and-forget. It deliberately does NOT delay endTurn:
        // the turn machine must never wait on presentation, which is the bug
        // class this file already suffers from elsewhere.
        try {
          const _bp = state.players.get('list') || [];
          const _bc = _bp[state.players.get('current') || 0] || {};
          const _bcard = state.deck.get('currentCard');
          showCenterToast(
            _bcard ? `${_bc.name || 'Bot'} drew ${_bcard.display} — no legal move`
                   : `${_bc.name || 'Bot'} has no legal move`,
            _bc.color || '#9fb0c4',
            1600
          );
        } catch (_) { /* a missing toast must never block the turn */ }
        endTurn(_botEpoch);
        return;
      }

      const players = state.players.get('list') || [];
      const ci = state.players.get('current') || 0;
      const player = players[ci];

      // Pick the "lead" peg's personality for scoring (first non-holding peg, or first peg)
      const activePeg = player.pegs.find(p => p.holeId !== 'holding') || player.pegs[0];
      const personality = PEG_PERSONALITIES[activePeg.personality] || PEG_PERSONALITIES.CHEERFUL;
      const w = personality.moveWeights;

      // Score each move — personality layer PLUS LogicLens (z = x · y from manifold)
      // LogicLens: advance_delta × strategic_value → manifold z → move priority
      const _logicLens = window.FastTrackManifoldSubstrate?.lenses?.LogicLens;

      // Circuit-completion lookups (used by scoring pass below)
      const _bpForBot = player.boardPosition;
      const _ownFTForBot = `ft-${_bpForBot}`;
      const _safeEntryForBot = `outer-${_bpForBot}-2`;   // safe-zone entrance (was stale -8; engine geometry names it -2)

      // ── BULLSEYE RISK/REWARD (user_directive_2026-04-25) ──
      // Bullseye is high-risk/high-reward. Score adjustment factors:
      //   RISK   — opponent pegs on the open board can cut a bullseye-stuck peg
      //            once it eventually exits; opponents on FT have a near-direct
      //            path to bullseye and can cut on entry; you can only exit
      //            bullseye on J/Q/K so each turn stuck = more cut chances.
      //   REWARD — late game (most opponent pegs in safe zone) the board is
      //            empty and the stuck-peg risk falls. A bullseye sit also
      //            denies the spot to opponents.
      // Result: _bullseyeAdjust is added to bullseye-related scores.
      let _oppOnBoard = 0, _oppOnFT = 0, _oppInSafe = 0, _oppTotal = 0;
      for (let _pi = 0; _pi < players.length; _pi++) {
        if (_pi === ci) continue;
        for (const _pg of players[_pi].pegs) {
          _oppTotal++;
          if (_pg.holeType === 'safezone' || _pg.holeType === 'home') _oppInSafe++;
          else if (_pg.holeType !== 'holding') {
            _oppOnBoard++;
            if (_pg.onFasttrack) _oppOnFT++;
          }
        }
      }
      const _lateGameRatio = _oppTotal > 0 ? _oppInSafe / _oppTotal : 0;
      const _threatPenalty = _oppOnBoard * 6 + _oppOnFT * 10;
      const _safeBoardBonus = _lateGameRatio * 50;
      const _bullseyeAdjust = Math.max(-90,
        _safeBoardBonus - _threatPenalty * (1 - _lateGameRatio * 0.7));

      // ── DIFFICULTY + POSITIONAL STRATEGY ──────────────────────────────
      const _profile = _aiProfile(player);
      const _behind = _behindFactor(players, ci);
      // "Less likely for someone to cut a peg on the bullseye when few other
      // pegs are on the board", and "towards the end of the game a peg that is
      // behind can take it for a quick advance". _bullseyeAdjust already
      // measures the board; appetite scales it by difficulty and the behind
      // term adds the catch-up case.
      const _bullseyeBias = (_bullseyeAdjust * _profile.bullseyeAppetite)
        + (_behind * 40 * _profile.bullseyeAppetite);
      // Easy only cuts as a last resort, which is only meaningful if some other
      // move exists. Computed once per turn, not per move.
      const _anyNonCaptureMove = vm.some(mv => !_moveCutsSomeone(mv, ci));

      let bestIdx = 0, bestScore = -Infinity;
      for (let i = 0; i < vm.length; i++) {
        const m = vm[i];
        let score = Math.random() * 10; // small random tiebreaker

        if (m.type === 'enterFastTrack') score += w.fasttrack + 50;
        else if (m.type === 'enterBullseye') {
          score += w.fasttrack + 80 + _bullseyeBias;
          // FT peg → bullseye is usually wasteful: traversing FT is faster.
          // Only valuable if there's an opponent on bullseye to cut.
          const _enterPeg = player.pegs[m.pegIdx];
          const _bullOcc = state.board.get('bullseye');
          const _isCut = _bullOcc && _bullOcc.playerIdx !== ci;
          if (_enterPeg && _enterPeg.onFasttrack && !_isCut) score -= 60;
          if (_isCut) { score += w.capture; m.captures = true; }
        }
        else if (m.type === 'exitFastTrack') score += 20;
        else if (m.type === 'enter') score += 30;
        else if (m.type === 'exitBullseye') {
          // user_directive_2026-05-18 — exiting the bullseye is almost
          // always a regression: the peg is already "scored" and safe.
          // Penalize heavily so the bot only chooses this when no other
          // legal move exists with the J/Q/K (forced play).
          score -= 80;
        }
        else if (m.type === 'move') {
          // Check if destination has an opponent (capture opportunity)
          const occ = state.board.get(m.dest);
          if (occ && occ.playerIdx !== ci) {
            score += w.capture;
            m.captures = true;  // mark for LogicLens
            // Rivalry bonus — aggressive/vengeful pegs target their rival
            const movePeg = player.pegs[m.pegIdx];
            if (movePeg.rivalPegId && occ.pegId === movePeg.rivalPegId) score += 30;
          }
          // Safe zone destination
          if (getHoleType(m.dest) === 'safezone') { score += w.safe; m.toSafeZone = true; }
          // Risk: landing on exposed outer track
          if (getHoleType(m.dest) === 'outer') score += w.risk;
        }

        // ── CIRCUIT-COMPLETION BONUS ──
        // If this move would set eligibleForSafeZone on a peg that doesn't have
        // it yet, weight it heavily — it's the only way that peg can ever score.
        // Covers Card-4 backward moves that land on/past the safe entry hole.
        const _scoredPeg = player.pegs[m.pegIdx];
        if (_scoredPeg && !_scoredPeg.eligibleForSafeZone) {
          const _path = m.path || [];
          const _passesOwnFT = m.dest === _ownFTForBot || _path.includes(_ownFTForBot);
          const _passesSafeEntry = m.dest === _safeEntryForBot || _path.includes(_safeEntryForBot);
          if (_passesOwnFT || _passesSafeEntry) {
            m.completesCircuit = true;  // mark for LogicLens
            score += 60;
          }
        }
        // Split — also check peg2
        if (m.type === 'split') {
          const _scoredPeg2 = player.pegs[m.peg2Idx];
          if (_scoredPeg2 && !_scoredPeg2.eligibleForSafeZone) {
            const _path2 = m.path2 || [];
            const _passesOwnFT2 = m.dest2 === _ownFTForBot || _path2.includes(_ownFTForBot);
            const _passesSafeEntry2 = m.dest2 === _safeEntryForBot || _path2.includes(_safeEntryForBot);
            if (_passesOwnFT2 || _passesSafeEntry2) {
              m.completesCircuit = true;
              score += 60;
            }
          }

          // ── SPLIT STRATEGY EVALUATION (user_directive_2026-04-25) ──
          // Bots must recognize the four high-value 7-split outcomes per half:
          //   (1) FT-hole landing — positions a peg for FastTrack entry next turn
          //   (2) Bullseye landing — best forward position on the board
          //   (3) Safe-zone landing — "cleans up" a peg into the safe zone
          //   (4) Cut shot — destination has an opponent peg
          // Without these, splits get only the small random tiebreaker and bots
          // pick splits arbitrarily, which makes them too easy to beat.
          const _evalHalf = (dest, pegIdx) => {
            if (!dest) return;
            // Cut shot — opponent on destination
            const occ = state.board.get(dest);
            if (occ && occ.playerIdx !== ci) {
              score += w.capture * 0.6;  // 60% weight per half (full split = both)
              m.captures = true;
              const movePeg = player.pegs[pegIdx];
              if (movePeg && movePeg.rivalPegId && occ.pegId === movePeg.rivalPegId) {
                score += 30;
              }
            }
            // FT-hole positioning (peg lands ON its FT-ring node — sets up
            // explicit enterFastTrack on a future turn)
            if (typeof dest === 'string' && dest.startsWith('ft-')) {
              score += 35;
            }
            // Bullseye landing — high-risk/high-reward: scaled by board state.
            // FT-peg-to-bullseye on a split is usually wasteful unless cutting.
            if (dest === 'bullseye') {
              score += w.fasttrack + 50 + _bullseyeBias;
              m.toBullseye = true;
              const _movePeg = player.pegs[pegIdx];
              const _bOcc = state.board.get('bullseye');
              const _isCutB = _bOcc && _bOcc.playerIdx !== ci;
              if (_movePeg && _movePeg.onFasttrack && !_isCutB) score -= 40;
            }
            // Safe-zone cleanup — moving a peg into safe zone via split half
            if (getHoleType(dest) === 'safezone') {
              score += w.safe * 0.6;
              m.toSafeZone = true;
            }
            // Risk: outer-rim landing (matches single-move logic)
            if (getHoleType(dest) === 'outer') {
              score += w.risk * 0.5;
            }
          };
          _evalHalf(m.dest, m.pegIdx);
          _evalHalf(m.dest2, m.peg2Idx);

          // Bonus when the split FULFILS the FT-reach-own-FT constraint —
          // i.e. an FT peg's portion lands on/passes own ft-{bp}. This is the
          // ONLY way a split keeps FT status alive for other FT pegs, so it
          // should be preferred over splits that drop FT for everyone.
          const _peg1 = player.pegs[m.pegIdx];
          const _peg2 = player.pegs[m.peg2Idx];
          if (_peg1?.onFasttrack || _peg2?.onFasttrack) {
            const _ownFT = _ownFTForBot;
            const _path1 = m.path || [];
            const _path2b = m.path2 || [];
            const _ftReached =
              (_peg1?.onFasttrack && (m.dest === _ownFT || _path1.includes(_ownFT))) ||
              (_peg2?.onFasttrack && (m.dest2 === _ownFT || _path2b.includes(_ownFT)));
            if (_ftReached) score += 40;
          }
        }

        // ── DIFFICULTY: how this bot feels about cutting ──────────────
        const _cuts = _moveCutsSomeone(m, ci);
        if (_cuts) {
          if (_profile.cutMode === 'last-resort' && _anyNonCaptureMove) {
            // Easy: never cut while anything else is playable. The penalty is
            // larger than any bonus above it, so every non-capture outranks
            // every capture. When all moves are cuts, one still wins.
            score -= LAST_RESORT_CUT_PENALTY;
          } else if (_profile.cutMode === 'aggressive') {
            score += _profile.cutBonus;
            // Hard and expert prefer a human's peg over a bot's.
            if (_profile.humanPreference) {
              for (const dest of [m.dest, m.dest2]) {
                if (!dest) continue;
                const occ = state.board.get(dest);
                if (occ && occ.playerIdx !== ci && players[occ.playerIdx]
                  && !players[occ.playerIdx].isBot) {
                  score += _profile.humanPreference;
                  break;
                }
              }
            }
          }
        } else if (_profile.huntWeight) {
          // No cut available on this move, so value getting CLOSE to prey. Only
          // hard and expert do this, and it is what "goes out of its way" means.
          score += _huntBonus(m.dest, ci, players, _profile);
          if (m.type === 'split') score += _huntBonus(m.dest2, ci, players, _profile) * 0.6;
        }

        // ── POSITIONAL: the four-back staging rule ────────────────────
        // Park a not-yet-eligible peg 1 to 4 holes past its own safe-zone
        // entrance, so a Card 4 carries it back across and makes it eligible.
        if (_profile.stagingWeight) {
          const _stagePeg = player.pegs[m.pegIdx];
          if (_stagePeg && !_stagePeg.eligibleForSafeZone
            && _isStagedForFour(m.dest, _bpForBot)) {
            score += _profile.stagingWeight;
            m.stagesForFour = true;   // surfaced for LogicLens / debugging
          }
          if (m.type === 'split') {
            const _stagePeg2 = player.pegs[m.peg2Idx];
            if (_stagePeg2 && !_stagePeg2.eligibleForSafeZone
              && _isStagedForFour(m.dest2, _bpForBot)) {
              score += _profile.stagingWeight * 0.6;
              m.stagesForFour = true;
            }
          }
        }

        // 🜂 LogicLens boost: z = advance_delta × strategic_value from manifold surface
        // This makes the AI's priorities flow through the Schwarz Diamond z=x·y primitive
        if (_logicLens) {
          const mz = _logicLens.score(m);  // returns z ∈ [0, 1]
          score += mz * 70;               // scale to blend with personality range
        }

        if (score > bestScore) { bestScore = score; bestIdx = i; }
      }

      executeMove(bestIdx);
    }, BOT_PACE.decide);
  }, BOT_PACE.think);
}

// ═══════════════════════════════════════════════════════════════════════════
// UI UPDATES — writes to DOM if elements exist
// ═══════════════════════════════════════════════════════════════════════════

// ─── AFK / Break manager ────────────────────────────────────────────────────
// At each turn boundary (phase becomes 'draw' for a human), arm a 30s warning
// and a 60s bot-takeover. The Break button takes over immediately. While the
// player is "afk", the bot plays for them; their avatar shows 🤖 and a ticking
// clock appears in the roster. They can click Resume (or the host can disable
// the feature) to come back at the next turn boundary.
const _AFK = {
  warnMs: 30_000,
  takeoverMs: 60_000,
  warnTimer: null,
  takeoverTimer: null,
  warnedIdx: null,    // player index currently showing the clock
  startedAt: 0,
  // map of player index → { name, avatar, isBot, userId, awayBot: true }
  away: new Map(),
};

function _hostAllowsReturn() {
  // Default true. The lobby/host setting is propagated through state.meta.
  const v = state.meta && state.meta.get && state.meta.get('allowReturn');
  return v !== false;
}

function _activeIsLocalHuman() {
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const cp = players[ci];
  if (!cp || cp.isBot) return false;
  // AFK only matters when there are 2+ humans waiting on each other.
  // Solo games and human-vs-bots-only games have no AFK enforcement.
  const humans = players.filter(p => p && !p.isBot).length;
  if (humans < 2) return false;
  // Same-screen / solo: every human seat counts as "local". Online MP: only
  // arm for the seat that belongs to this client.
  const mode = state.meta.get('gameMode') || 'solo';
  if (mode === 'private' || mode === 'public' || mode === 'multiplayer') {
    return _isMyTurn();
  }
  return true;
}

function _clearAfkTimers() {
  if (_AFK.warnTimer) { clearTimeout(_AFK.warnTimer); _AFK.warnTimer = null; }
  if (_AFK.takeoverTimer) { clearTimeout(_AFK.takeoverTimer); _AFK.takeoverTimer = null; }
  if (_AFK.warnedIdx !== null) {
    _AFK.warnedIdx = null;
    // Re-render so the clock disappears on next updateUI
  }
  _AFK.startedAt = 0;
}

function armAfkTimer() {
  _clearAfkTimers();
  // user_directive: "there should be no timers at all" — AFK warn / auto
  // takeover are disabled. Players can still hit the explicit Break button
  // (takeBreak) to hand off to a bot manually; the manual takeover path
  // below is preserved.
  return;
}

// Swap the active human for a bot. The original identity is stashed in _AFK.away
// so they can resume at the next turn boundary (if host allows).
function takeBreak(reason) {
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const cp = players[ci];
  if (!cp || cp.isBot) return;
  if (!_activeIsLocalHuman()) return;
  _clearAfkTimers();
  // Stash original identity for restoration.
  _AFK.away.set(ci, {
    name: cp.name,
    avatar: cp.avatar,
    isBot: cp.isBot,
    userId: cp.userId,
    reason: reason || 'break',
    at: Date.now(),
  });
  cp.name = (cp.name || 'Player') + ' (AFK)';
  cp.avatar = '🤖';
  cp.isBot = true;
  state.players.set('list', players);
  log(`⏸ ${(_AFK.away.get(ci).name)} stepped away — bot is taking over.`);
  updateUI();
  // Drive the bot for the current turn.
  if (state.turn.get('phase') === 'draw') {
    setTimeout(botTurn, 400);
  }
}

// Restore the human at the next turn boundary if they were away.
// Called from endTurn() and from the Resume button.
function _maybeRestoreFromAfk(playerIdx) {
  if (!_AFK.away.has(playerIdx)) return false;
  if (!_hostAllowsReturn()) return false;
  const players = state.players.get('list') || [];
  const cp = players[playerIdx];
  if (!cp) return false;
  const orig = _AFK.away.get(playerIdx);
  cp.name = orig.name;
  cp.avatar = orig.avatar;
  cp.isBot = orig.isBot;
  cp.userId = orig.userId;
  _AFK.away.delete(playerIdx);
  state.players.set('list', players);
  log(`▶ ${cp.name} returned.`);
  return true;
}

// Public hook: player clicked the Resume button (or any UI activity counts).
function resumeFromAfk() {
  const ci = state.players.get('current') || 0;
  // If they're currently away, mark for restore. The actual swap happens at
  // the next turn boundary (so we don't yank the bot mid-turn).
  if (_AFK.away.has(ci)) {
    if (!_hostAllowsReturn()) {
      log('Host has disabled returning players for this game.');
      return false;
    }
    log('Welcome back — you will resume on your next turn.');
    return true;
  }
  // Not away: just rearm the AFK timer (treat as activity).
  armAfkTimer();
  return true;
}

if (typeof window !== 'undefined') {
  window.takeBreak = takeBreak;
  window.resumeFromAfk = resumeFromAfk;
  window.armAfkTimer = armAfkTimer;
}

// ═══════════════════════════════════════════════════════════════════════════
// UI UPDATES — writes to DOM if elements exist
// ═══════════════════════════════════════════════════════════════════════════
function updateUI() {
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const phase = state.turn.get('phase');

  // Ensure the DRAW CARD prompt and Draw button are correctly armed whenever
  // it's the local human's draw phase. Safety net for code paths (extra-turn
  // cards, snapshot apply, etc.) that may have left the button disabled or
  // the popup dismissed. The popup remains until drawCard() runs.
  try {
    const cp = players[ci];
    const myTurn = !_isMpMode() || _isMyTurn();
    const inDraw = phase === 'draw' && state.meta.get('winner') === null;
    const humanDraw = cp && !cp.isBot && inDraw && myTurn;
    const drawBtnEl = document.getElementById('draw-btn');
    if (humanDraw) {
      if (!_turnPopup) showYourTurnPopup(cp.name, cp.color);
      if (drawBtnEl && drawBtnEl.disabled) drawBtnEl.disabled = false;
    } else {
      if (_turnPopup) dismissYourTurnPopup();
    }
  } catch (_) { /* never let UI helpers break updateUI */ }

  const playerListDiv = document.getElementById('player-list');
  if (playerListDiv) {
    playerListDiv.innerHTML = players.map((p, i) => {
      const onBoard = p.pegs.filter(pg => pg.holeType !== 'holding').length;
      const inSafe = p.pegs.filter(pg => getHoleType(pg.holeId) === 'safezone').length;
      const showClock = (i === ci) && (_AFK.warnedIdx === ci) && (phase === 'draw') && !p.isBot;
      const awayBadge = _AFK.away.has(i) ? '<span class="away-chip" title="AFK — bot is playing">AFK</span>' : '';
      const rowCls = [
        'player-row',
        i === ci ? 'active' : '',
        p.isBot ? 'is-bot' : 'is-human',
      ].filter(Boolean).join(' ');
      return `
        <div class="${rowCls}">
          <span class="turn-light" aria-label="${i === ci ? 'Your turn' : 'Waiting'}" title="${i === ci ? `${p.name} — TURN` : `${p.name} — waiting`}"></span>
          <div class="player-color" style="background: ${p.color};"></div>
          <span class="player-avatar">${p.avatar || ''}</span>
          <span class="player-name">${p.name}</span>
          ${showClock ? '<span class="afk-clock" title="Idle — bot will take over soon">⏱️</span>' : ''}
          ${awayBadge}
          ${i === ci ? '<span class="turn-chip">TURN</span>' : ''}
          <span class="player-pegs">${onBoard}/${PEGS_PER_PLAYER} (🏠${inSafe})</span>
        </div>`;
    }).join('');
  }

  // ── AFK timer arming ────────────────────────────────────────────────
  // Re-arm only when we cross into a fresh draw phase for a non-bot active
  // seat. armAfkTimer no-ops if conditions don't match, so it's safe to call.
  const cpForAfk = players[ci];
  if (phase === 'draw' && cpForAfk && !cpForAfk.isBot && state.meta.get('winner') === null) {
    if (!_AFK.warnTimer && !_AFK.takeoverTimer) armAfkTimer();
  } else {
    _clearAfkTimers();
  }

  // ── Break / Resume button visibility ────────────────────────────────
  const breakBtn = document.getElementById('btn-break');
  if (breakBtn) {
    const isLocalActive = _activeIsLocalHuman();
    const cp = players[ci];
    const away = !!(cp && _AFK.away.has(ci));
    if (away) {
      breakBtn.textContent = '▶ Resume';
      breakBtn.title = 'Resume — take back control on your next turn';
      breakBtn.classList.remove('hidden');
      breakBtn.disabled = !_hostAllowsReturn();
    } else if (isLocalActive && phase === 'draw') {
      breakBtn.textContent = '☕ Break';
      breakBtn.title = 'Take a break — a bot will play your turn(s) until you return';
      breakBtn.classList.remove('hidden');
      breakBtn.disabled = false;
    } else {
      breakBtn.classList.add('hidden');
    }
  }

  const drawBtn = document.getElementById('draw-btn');
  if (drawBtn) {
    const cp = players[ci];
    // In multiplayer: only the active player's client enables the draw button.
    const notMyTurn = _isMpMode() && !_isMyTurn();
    drawBtn.disabled = phase !== 'draw' || cp.isBot || notMyTurn;
  }
  // The card-area <div> is also a draw shortcut — sync its disabled visual /
  // pointer state with the button so the player can't queue a second card while
  // pegs are still hopping or cutscenes are firing (extra-turn / redraw flows).
  const cardArea = document.getElementById('card-area');
  if (cardArea) {
    const cp = players[ci];
    const notMyTurn = _isMpMode() && !_isMyTurn();
    const blocked = phase !== 'draw' || cp.isBot || notMyTurn;
    // Always block clicks when not in a fresh draw window, but ONLY apply
    // the dim/desaturate visual when the deck is showing its face-back
    // (no active card). While a card is face-up we want it brightly
    // legible for the entire turn so every peer can see what the active
    // player drew — the card itself signals "can't draw again" already.
    const hasActiveCard = !!state.deck.get('currentCard');
    const visuallyDim = blocked && !hasActiveCard;
    cardArea.classList.toggle('disabled', visuallyDim);
    cardArea.classList.toggle('locked', blocked && hasActiveCard);
    cardArea.setAttribute('aria-disabled', blocked ? 'true' : 'false');
  }
  const gs = document.getElementById('game-status');
  if (gs) {
    const cp = players[ci];
    // Always show the player's actual name — reflects URL ?name= param
    gs.textContent = `▶ ${cp.name.toUpperCase()} TURN`;
  }

  // Refresh manifold metrics panel
  updateMetricsPanel();

  // Keep the host idle-relinquish button in sync (hides the instant a player acts).
  try { _updateHostAdvanceButton(); } catch (_) { /* ignore */ }
}

function log(message) {
  const gameLog = state.safeZone.get('log') || [];
  gameLog.push({ time: Date.now(), message });
  state.safeZone.set('log', gameLog);

  const logDiv = document.getElementById('game-log');
  if (logDiv) {
    logDiv.innerHTML = gameLog.slice(-10).map(l =>
      `<div class="log-entry">${l.message}</div>`
    ).join('');
    logDiv.scrollTop = logDiv.scrollHeight;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER BRIDGE — overridden by 2D Canvas or 3D Three.js renderer
// ═══════════════════════════════════════════════════════════════════════════
let _renderBoard = function () { };  // set by the renderer

function renderBoard() {
  _renderBoard();
}

function setRenderer(fn) {
  _renderBoard = fn;
}

// ═══════════════════════════════════════════════════════════════════════════
// CUTSCENE MANAGER — queue-based, blocks turn progression
// ═══════════════════════════════════════════════════════════════════════════
const CutsceneManager = {
  isPlaying: false,
  queue: [],
  seenCutscenes: new Map(),

  config: {
    cutsceneDuration: {
      fasttrack: 1800, fasttrackShort: 600,
      bullseye: 1500, bullseyeShort: 500,
      cut: 2000, cutShort: 800,
      safeZone: 1200, safeZoneShort: 0,
      win: 4000, crown: 800
    },
    skipAfterCount: {
      fasttrack: 0, bullseye: 3, cut: 0, safeZone: 1, win: 0, crown: 0
    }
  },

  isFirstTime(type, playerId) {
    const key = playerId != null ? `${type}:${playerId}` : type;
    return !this.seenCutscenes.has(key);
  },

  markSeen(type, playerId) {
    const key = playerId != null ? `${type}:${playerId}` : type;
    this.seenCutscenes.set(key, (this.seenCutscenes.get(key) || 0) + 1);
  },

  shouldSkip(type, playerId) {
    const max = this.config.skipAfterCount[type] || 0;
    if (max === 0) return false;
    const key = playerId != null ? `${type}:${playerId}` : type;
    return (this.seenCutscenes.get(key) || 0) >= max;
  },

  getDuration(type, playerId) {
    const d = this.config.cutsceneDuration;
    if (!this.isFirstTime(type, playerId)) return d[type + 'Short'] ?? Math.floor(d[type] * 0.4);
    return d[type] || 1000;
  },

  queueCutscene(type, data) {
    const playerId = data.playerId ?? null;
    if (this.shouldSkip(type, playerId)) return;
    this.queue.push({ type, data, timestamp: Date.now() });
    if (!this.isPlaying) this.playNext();
  },

  playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      // Resume game flow
      if (this._onQueueDrained) { this._onQueueDrained(); this._onQueueDrained = null; }
      return;
    }
    this.isPlaying = true;
    const scene = this.queue.shift();
    switch (scene.type) {
      case 'cut': this.playCutCutscene(scene.data); break;
      case 'fasttrack': this.playFastTrackCutscene(scene.data); break;
      case 'bullseye': this.playBullseyeCutscene(scene.data); break;
      case 'safeZone': this.playSafeZoneCutscene(scene.data); break;
      case 'crown': this.playCrownCutscene(scene.data); break;
      case 'win': this.playWinCutscene(scene.data); break;
      default: this.finishCutscene();
    }
  },

  finishCutscene() {
    this.isPlaying = false;
    setTimeout(() => this.playNext(), 100);
  },

  // Block until all queued cutscenes finish, then call callback
  whenDrained(callback) {
    if (!this.isPlaying && this.queue.length === 0) { callback(); return; }
    this._onQueueDrained = callback;
  },

  // ── Cutscene Implementations ──────────────────────────────────────────

  playCutCutscene(data) {
    const { victorPeg, victimPeg, victorPlayer, victimPlayer } = data;
    const duration = this.getDuration('cut');
    this.markSeen('cut');

    const victorReaction = getPegReaction(victorPeg, 'onCutOpponent') || '💪';
    const victimReaction = getPegReaction(victimPeg, 'onGotCut') || '😱';

    // Audio: dissonant crash → resolve
    if (window.ManifoldAudio) { ManifoldAudio.playCut(); ManifoldAudio.playFanfare('cut'); }
    _manifoldEmit('cut', { pegId: data.victimPegId, boardPos: data.boardPos, threatCount: 0 });
    _manifoldStateUpdate();

    // Camera: follow victim peg arching to holding, then cut to victor
    if (window.CameraDirector) {
      const victimId = victimPeg.id || `peg-${victimPlayer.color}-0`;
      const victorId = victorPeg.id || `peg-${victorPlayer.color}-0`;
      // Victim hangs head in shame as they get arc'd back to holding
      if (window.triggerPegPose) window.triggerPegPose(victimId, 'shame');
      window.CameraDirector.followCutVictim(victimId, victorId, () => {
        // Victor reaction fires when camera switches to them — full jig + whoo hoo
        this.showCelebrationGraphic('🕺 WHOO HOO! 🕺', victorPlayer.color, false);
        this.showPegReaction(victorReaction, victorPlayer.color);
        this.spawnFloatingEmojis(['🎉', '✨', '🕺', '💃'], 8);
        // Victor dances a jig (kicks + spins + arm swings)
        if (window.triggerPegPose) window.triggerPegPose(victorId, 'jig');
      });
    }

    // Victim protest — immediate
    this.showCelebrationGraphic('⚔️💥 CUT! 💥⚔️', victorPlayer.color, true);
    this.showPegReaction(victimReaction, victimPlayer.color);
    this.spawnFloatingEmojis(['⚔️', '💥', '🔥'], 6);

    // Trigger victim protest animation in 3D
    const victimId = victimPeg.id || `peg-${victimPlayer.color}-0`;
    if (window.triggerPegPose) window.triggerPegPose(victimId, 'protest');

    log(`⚔️ ${victorPlayer.name}'s ${victorPeg.nickname || 'peg'}: "${victorReaction}"`);
    log(`😢 ${victimPlayer.name}'s ${victimPeg.nickname || 'peg'}: "${victimReaction}"`);

    setTimeout(() => {
      if (window.CameraDirector) window.CameraDirector.unlockCutscene();
      this.finishCutscene();
    }, duration);
  },

  playFastTrackCutscene(data) {
    const { peg, playerColor, playerName, playerId } = data;
    const isFirst = this.isFirstTime('fasttrack', playerId);
    const duration = this.getDuration('fasttrack', playerId);
    this.markSeen('fasttrack', playerId);

    if (window.ManifoldAudio) { ManifoldAudio.playFastTrack(); ManifoldAudio.playFanfare('fasttrack'); }
    _manifoldEmit('fasttrack', { pegId: data.pegId, boardPos: data.boardPos || 0 });
    _manifoldStateUpdate();

    // Peg dances on the FT ring entry
    if (window.triggerPegPose && peg && peg.id) window.triggerPegPose(peg.id, 'dance');

    if (isFirst) {
      const reaction = getPegReaction(peg, 'onEnterFastTrack') || '⚡';
      this.showCelebrationGraphic('⚡ FASTTRACK! ⚡', playerColor, true);
      this.showPegReaction(reaction, playerColor);
      this.spawnFloatingEmojis(['⚡', '🏎️', '💨'], 7);
      log(`⚡ ${playerName}'s peg: "${reaction}"`);
    } else {
      this.showPegReaction('⚡', playerColor);
    }
    setTimeout(() => this.finishCutscene(), duration);
  },

  playBullseyeCutscene(data) {
    const { peg, playerColor, playerName, playerId } = data;
    const isFirst = this.isFirstTime('bullseye', playerId);
    const duration = this.getDuration('bullseye', playerId);
    this.markSeen('bullseye', playerId);

    if (window.ManifoldAudio) { ManifoldAudio.playBullseye(); ManifoldAudio.playFanfare('bullseye'); }
    _manifoldEmit('bullseye', { pegId: data.pegId, boardPos: 0 });

    // Bullseye is the highest reward — celebrate (jumping + spin)
    if (window.triggerPegPose && peg && peg.id) window.triggerPegPose(peg.id, 'celebrate');

    if (isFirst) {
      const reaction = getPegReaction(peg, 'onEnterBullseye') || '🎯';
      this.showCelebrationGraphic('🎯 BULLSEYE! 🎯', playerColor, true);
      this.showPegReaction(reaction, playerColor);
      this.spawnFloatingEmojis(['🎯', '🎈', '✨'], 8);
      log(`🎯 ${playerName}'s peg: "${reaction}"`);
    }
    setTimeout(() => this.finishCutscene(), duration);
  },

  playSafeZoneCutscene(data) {
    const { peg, playerColor, playerName, playerId } = data;
    if (this.shouldSkip('safeZone', playerId)) { this.finishCutscene(); return; }
    this.markSeen('safeZone', playerId);
    const duration = this.getDuration('safeZone', playerId);

    if (window.ManifoldAudio) { ManifoldAudio.playSafeZone(); ManifoldAudio.playFanfare('safeZone'); }
    _manifoldEmit('safezone', { pegId: data.pegId, boardPos: data.boardPos || 0 });
    _manifoldStateUpdate();

    // Peg dances on safe-zone arrival
    if (window.triggerPegPose && peg && peg.id) window.triggerPegPose(peg.id, 'dance');

    const reaction = getPegReaction(peg, 'onEnterSafeZone') || '🛡️';
    this.showCelebrationGraphic('🛡️ SAFE!', playerColor, true);
    this.showPegReaction(reaction, playerColor);
    log(`🛡️ ${playerName}'s peg: "${reaction}"`);
    setTimeout(() => this.finishCutscene(), duration);
  },

  playCrownCutscene(data) {
    const { playerName, playerColor, playerId } = data;
    const duration = this.config.cutsceneDuration.crown;

    if (window.ManifoldAudio) ManifoldAudio.playFanfare('crown');

    this.showCelebrationGraphic('👑 HOME STRETCH! 👑', playerColor, true);
    this.spawnFloatingEmojis(['👑', '✨', '🏠'], 8);
    log(`👑 ${playerName}'s safe zone is FULL! Crown appears on home hole!`);
    setTimeout(() => this.finishCutscene(), duration);
  },

  playWinCutscene(data) {
    const { playerName, playerColor, peg, playerAvatar } = data;
    const duration = this.config.cutsceneDuration.win;

    if (window.ManifoldAudio) { ManifoldAudio.playVictory(); ManifoldAudio.playFanfare('win'); }
    _manifoldEmit('victory', { playerName: data.playerName });
    _manifoldStateUpdate();

    const reaction = getPegReaction(peg, 'onWin') || '🏆';
    const pegName = peg.nickname || `Peg ${peg.id || ''}`;
    const avatar = playerAvatar || '🎮';

    // Grand celebration with player identity
    this.showCelebrationGraphic(`👑 ${playerName} WINS! 👑`, playerColor, true);

    // Second line with peg identity after short delay
    setTimeout(() => {
      this.showCelebrationGraphic(`${avatar} ${pegName}: "${reaction}"`, playerColor, false);
    }, 800);

    this.showPegReaction(reaction, playerColor);
    this.spawnFloatingEmojis(['🏆', '👑', '🎉', '🎊', '✨', '🥇'], 30);

    // Trigger crown + victory pose in 3D
    const pegId = peg.id || `peg-${playerColor}-0`;
    if (window.triggerPegPose) window.triggerPegPose(pegId, 'victory');
    if (window.triggerWinCrown) window.triggerWinCrown(pegId);

    // ── Victory blink — color bars & safe zone indicators cycle random colors ──
    const celebrationColors = [
      '#FF0000', '#FF7700', '#FFD700', '#00FF44', '#00D4FF',
      '#0050FF', '#9400FF', '#FF00AA', '#FF2D95', '#00FFAA',
      '#FF4444', '#FFAA00', '#44FF44', '#44AAFF', '#FF44FF'
    ];
    const colorDots = document.querySelectorAll('.player-color');
    const pegSpans = document.querySelectorAll('.player-pegs');
    const origDotColors = Array.from(colorDots).map(d => d.style.background);
    const origSpanColors = Array.from(pegSpans).map(s => s.style.color || '');
    const blinkInterval = setInterval(() => {
      colorDots.forEach(dot => {
        dot.style.background = celebrationColors[Math.floor(Math.random() * celebrationColors.length)];
        dot.style.boxShadow = `0 0 8px ${dot.style.background}`;
      });
      pegSpans.forEach(span => {
        span.style.color = celebrationColors[Math.floor(Math.random() * celebrationColors.length)];
        span.style.textShadow = `0 0 6px ${span.style.color}`;
      });
    }, 120);

    log(`🏆 ${playerName}'s ${pegName}: "${reaction}"`);
    log(`👑 ${playerName} (${avatar}) is the CHAMPION!`);
    setTimeout(() => {
      clearInterval(blinkInterval);
      // Restore original colors
      colorDots.forEach((dot, i) => {
        dot.style.background = origDotColors[i] || '';
        dot.style.boxShadow = '';
      });
      pegSpans.forEach((span, i) => {
        span.style.color = origSpanColors[i] || '';
        span.style.textShadow = '';
      });
      this.finishCutscene();
    }, duration);
  },

  // ── Visual Helpers ────────────────────────────────────────────────────

  showCelebrationGraphic(text, color, bold = false) {
    const overlay = document.createElement('div');
    overlay.innerHTML = text;
    const size = bold ? '6rem' : '4rem';
    const shadow = bold
      ? `0 0 40px ${color || '#FFD700'}, 0 0 80px ${color || '#FFD700'}, 0 6px 12px rgba(0,0,0,0.7)`
      : `0 0 20px ${color || '#FFD700'}, 0 4px 8px rgba(0,0,0,0.5)`;
    const extraStyle = bold ? 'letter-spacing:0.05em; -webkit-text-stroke:2px rgba(0,0,0,0.3);' : '';
    overlay.style.cssText = `
      position:fixed; top:50%; left:50%;
      transform:translate(-50%,-50%) scale(0);
      font-size:${size}; font-weight:900;
      color:${color || '#FFD700'};
      text-shadow:${shadow};
      z-index:10000; pointer-events:none;
      animation:cutscenePop 0.5s ease-out forwards;
      ${extraStyle}
    `;
    document.body.appendChild(overlay);
    const holdTime = bold ? 1500 : 1000;
    setTimeout(() => {
      overlay.style.animation = 'cutsceneFadeOut 0.5s ease-in forwards';
      setTimeout(() => overlay.remove(), 500);
    }, holdTime);
  },

  showPegReaction(text, color) {
    if (!text) return;
    const bubble = document.createElement('div');
    bubble.textContent = text;
    bubble.style.cssText = `
      position:fixed; top:35%; left:50%;
      transform:translateX(-50%);
      padding:10px 20px;
      background:rgba(0,0,0,0.85);
      color:${color || '#fff'};
      border:2px solid ${color || '#fff'};
      border-radius:24px; font-size:1.2rem;
      z-index:10001; pointer-events:none;
      animation:bubbleFloat 2.5s ease-out forwards;
      white-space:nowrap; font-weight:bold;
    `;
    document.body.appendChild(bubble);
    setTimeout(() => bubble.remove(), 2500);
  },

  spawnFloatingEmojis(emojis, count) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        el.style.cssText = `
          position:fixed; bottom:-50px;
          left:${10 + Math.random() * 80}%;
          font-size:${2 + Math.random() * 2}rem;
          z-index:10000; pointer-events:none;
          animation:emojiFloat ${3 + Math.random() * 2}s ease-out forwards;
        `;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 5000);
      }, i * 100);
    }
  }
};

// ── Cutscene CSS animations ──
(function injectCutsceneCSS() {
  const s = document.createElement('style');
  s.textContent = `
    @keyframes cutscenePop {
      0%   { transform:translate(-50%,-50%) scale(0); opacity:0; }
      50%  { transform:translate(-50%,-50%) scale(1.2); }
      100% { transform:translate(-50%,-50%) scale(1); opacity:1; }
    }
    @keyframes cutsceneFadeOut {
      0%   { opacity:1; transform:translate(-50%,-50%) scale(1); }
      100% { opacity:0; transform:translate(-50%,-50%) scale(0.8); }
    }
    @keyframes bubbleFloat {
      0%   { opacity:1; transform:translateX(-50%) translateY(0); }
      100% { opacity:0; transform:translateX(-50%) translateY(-80px); }
    }
    @keyframes emojiFloat {
      0%   { opacity:1; transform:translateY(0) rotate(0deg); }
      100% { opacity:0; transform:translateY(-100vh) rotate(360deg); }
    }
  `;
  document.head.appendChild(s);
})();

// ═══════════════════════════════════════════════════════════════════════════
// MANIFOLD METRICS — storage efficiency analytics
// ═══════════════════════════════════════════════════════════════════════════
function getManifoldMetrics() {
  const tables = [
    { name: 'Players', table: state.players },
    { name: 'Board', table: state.board },
    { name: 'Deck', table: state.deck },
    { name: 'Turn', table: state.turn },
    { name: 'Movement', table: state.movement },
    { name: 'SafeZone', table: state.safeZone },
    { name: 'Meta', table: state.meta },
    { name: 'Cards', table: state.cards },
    { name: 'Holes', table: state.holes },
    { name: 'Pegs', table: state.pegs },
  ];

  const PATH_EXPR_BYTES = 32; // 4 × Float64 (section, angle, radius, depth)
  const results = [];
  let totalManifold = 0, totalJson = 0, totalEntries = 0;

  for (const { name, table } of tables) {
    const keys = table.keys();
    const entries = keys.length;
    totalEntries += entries;

    // Manifold cost: each entry = 1 PathExpr address (32 bytes)
    // + key string overhead (avg 8 bytes for Map key ref)
    const manifoldBytes = entries * (PATH_EXPR_BYTES + 8);
    totalManifold += manifoldBytes;

    // JSON equivalent: serialize all key-value pairs
    let jsonBytes = 2; // { }
    for (const k of keys) {
      const v = table.get(k);
      const keyStr = JSON.stringify(k);
      let valStr;
      try { valStr = JSON.stringify(v); } catch { valStr = '"[circular]"'; }
      jsonBytes += keyStr.length + 1 + (valStr ? valStr.length : 4) + 1; // key:val,
    }
    totalJson += jsonBytes;

    results.push({
      name, entries, manifoldBytes, jsonBytes,
      savings: jsonBytes > 0 ? ((1 - manifoldBytes / jsonBytes) * 100) : 0
    });
  }

  return {
    tables: results,
    totals: {
      entries: totalEntries,
      manifoldBytes: totalManifold,
      jsonBytes: totalJson,
      savings: totalJson > 0 ? ((1 - totalManifold / totalJson) * 100) : 0,
      ratio: totalJson > 0 ? (totalJson / totalManifold).toFixed(2) : '—'
    }
  };
}

function updateMetricsPanel() {
  const panel = document.getElementById('metrics-body');
  if (!panel) return;
  const m = getManifoldMetrics();

  const fmtBytes = (b) => b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;
  const barColor = (s) => s > 0 ? '#00ff88' : '#ff4444';

  let html = '';
  for (const t of m.tables) {
    const pct = Math.max(0, Math.min(100, t.savings));
    html += `<div class="metric-row">
      <span class="metric-label">${t.name}</span>
      <span class="metric-entries">${t.entries}</span>
      <span class="metric-manifold">${fmtBytes(t.manifoldBytes)}</span>
      <span class="metric-json">${fmtBytes(t.jsonBytes)}</span>
      <div class="metric-bar-track"><div class="metric-bar" style="width:${Math.abs(pct)}%;background:${barColor(t.savings)}"></div></div>
      <span class="metric-pct" style="color:${barColor(t.savings)}">${t.savings > 0 ? '−' : '+'}${Math.abs(t.savings).toFixed(0)}%</span>
    </div>`;
  }

  html += `<div class="metric-totals">
    <div>📊 <strong>${m.totals.entries}</strong> entries across 10 helix sections</div>
    <div>🌀 Manifold: <strong>${fmtBytes(m.totals.manifoldBytes)}</strong> (PathExpr addresses)</div>
    <div>📦 JSON equiv: <strong>${fmtBytes(m.totals.jsonBytes)}</strong></div>
    <div>⚡ Ratio: <strong>${m.totals.ratio}×</strong> — ${m.totals.savings > 0 ? `saving ${m.totals.savings.toFixed(1)}%` : `${Math.abs(m.totals.savings).toFixed(1)}% overhead (address cost)`}</div>
  </div>`;

  panel.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPOSE TO GLOBAL SCOPE — both renderers and HTML onclick handlers need these
// ═══════════════════════════════════════════════════════════════════════════
window.FastTrackCore = {
  state,
  initGame,
  drawCard,
  _drawCardCommit, // exposed for headless tests: the real draw path that re-arms the turn guard
  executeMove,
  endTurn,
  botTurn,
  getHoleType,
  getTrackSequence,
  calculateValidMoves,
  setRenderer,
  renderBoard,
  CLOCKWISE_TRACK,
  CARDS,
  SUIT_GLYPHS,
  RANK_GLYPHS,
  syncPegMatrix,
  PEGS_PER_PLAYER,
  SAFE_ZONE_SIZE,
  PLAYER_COLORS,
  PLAYER_NAMES,
  getBalancedBoardPosition,
  getCurrentPlayerName,
  log,
  updateUI,
  // NPC personality & cutscene systems
  PEG_PERSONALITIES,
  PERSONALITY_TYPES,
  getPegReaction,
  CutsceneManager,
  getManifoldMetrics,
  updateMetricsPanel,
  // Multiplayer wiring — set by 3d.html after initGame so the live KGMultiplayer
  // socket can broadcast moves and replay peer actions under the _applying guard.
  setMultiplayerClient,
  setStateCommittedHandler,
  setMyUserId,
  updateSessionRoster,
  getStateSnapshot,
  applyStateSnapshot,
  applyRemoteAction,
};

// Also expose directly for onclick handlers in HTML
window.drawCard = drawCard;
window.executeMove = executeMove;
window.initGame = initGame;
// user_directive_2026-05-18 — surface the center-toast so the peg-bar UI
// can flash short strategic tags ("Cut peg!", "Hit fast track", etc.)
// when the player toggles choices.
window.showCenterToast = showCenterToast;
