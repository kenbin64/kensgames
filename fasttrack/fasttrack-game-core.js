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
// "YOUR TURN" POPUP — shown for human players, auto-dismissed
// ═══════════════════════════════════════════════════════════════════════════
let _turnPopup = null;
function showYourTurnPopup(playerName, playerColor) {
  dismissYourTurnPopup(); // clear any lingering popup
  const el = document.createElement('div');
  el.id = 'your-turn-popup';
  el.innerHTML = `<span style="font-size:1.8em;display:block;margin-bottom:6px;">🎲</span><span style="font-size:1.1em;display:block;letter-spacing:0.04em;">YOUR TURN</span><b style="font-size:1.3em;display:block;margin-top:4px;">${playerName}</b>`;
  Object.assign(el.style, {
    position: 'fixed', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%) scale(0.7)',
    padding: '28px 52px', borderRadius: '18px',
    background: 'rgba(4,6,22,0.96)', color: '#fff',
    fontSize: '1.1em', fontFamily: "'Orbitron','Segoe UI', sans-serif",
    fontWeight: '700', textAlign: 'center',
    border: `2.5px solid ${playerColor || '#00b4ff'}`,
    boxShadow: `0 0 40px ${playerColor || '#00b4ff'}88, 0 12px 40px rgba(0,0,0,0.8)`,
    zIndex: '9999', pointerEvents: 'none',
    opacity: '0', transition: 'opacity 0.35s ease, transform 0.35s ease',
    textShadow: `0 0 16px ${playerColor || '#00b4ff'}`,
    minWidth: '240px',
  });
  document.body.appendChild(el);
  // Trigger entrance animation
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%, -50%) scale(1)';
  });
  _turnPopup = el;
}

function dismissYourTurnPopup() {
  if (!_turnPopup) return;
  const el = _turnPopup;
  _turnPopup = null;
  el.style.opacity = '0';
  el.style.transform = 'translate(-50%, -50%) scale(0.7)';
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 350);
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
  if (hasOwnPegOnHole(player, `ft-${toFtIdx}`, movingPeg && movingPeg.id)) {
    return false;
  }
  const skippedRegularSegment = getFastTrackBypassSegment(fromFtIdx);
  return !skippedRegularSegment.some(holeId => hasOwnPegOnHole(player, holeId, movingPeg && movingPeg.id));
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
  state.players.set('current', 0);
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
  state.meta.set('seed', Math.floor(Math.random() * 0xFFFFFFFF));
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
      aiDifficulty: isBot ? (sp && (sp.level || sp.aiDifficulty || aiDifficulty)) : null,
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

  // ─── Peg Matrix (substrate) ───
  // peg(id) | color | position(hole) | state
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

    const players0 = state.players.get('list') || [];
    const firstPlayer = players0[0];

    const enableFirstTurn = () => {
      dismissYourTurnPopup();
      if (firstPlayer && firstPlayer.isBot) {
        setTimeout(botTurn, 400);
      } else {
        if (drawBtn) drawBtn.disabled = false;
      }
    };

    const startBlink = () => {
      // Show "Your turn" popup for human players
      if (firstPlayer && !firstPlayer.isBot) {
        showYourTurnPopup(firstPlayer.name, firstPlayer.color);
      }
      if (window.blinkPlayerMarker) {
        window.blinkPlayerMarker(0, enableFirstTurn);
      } else {
        enableFirstTurn();
      }
    };

    if (window.CameraDirector && window.CameraDirector.mode === 'auto') {
      window.CameraDirector.whenSettled(startBlink);
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
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  state.deck.set('cards', deck);
}

// ═══════════════════════════════════════════════════════════════════════════
// DRAW CARD
// ═══════════════════════════════════════════════════════════════════════════
function drawCard() {
  if (state.turn.get('phase') !== 'draw') return;
  dismissYourTurnPopup();

  let deck = state.deck.get('cards') || [];
  if (deck.length === 0) {
    deck = [...(state.deck.get('discard') || [])];
    state.deck.set('discard', []);
    state.deck.set('cards', deck);
    shuffleDeck();
    deck = state.deck.get('cards');
    log('Deck reshuffled');
  }

  const card = deck.pop();
  state.deck.set('cards', deck);
  state.deck.set('currentCard', card);
  state.turn.set('phase', 'move');
  _splitSelectedRatio = null; // Reset split selector on new card

  const cardEl = document.getElementById('current-card');
  if (cardEl) cardEl.textContent = card.display;
  const infoEl = document.getElementById('card-info');
  if (infoEl) infoEl.textContent = getCardDescription(card.value);

  log(`${getCurrentPlayerName()} drew ${card.display}`);
  if (window.ManifoldAudio) ManifoldAudio.playCardDraw();
  _manifoldEmit('card', { deckSize: state.turn.get('deck')?.length || 0 });
  _turnCounter++;
  _manifoldStateUpdate();
  calculateValidMoves();
  updateUI();
}

function getCardDescription(v) {
  return {
    A: 'Move 1 or enter', '2': 'Move 2', '3': 'Move 3', '4': 'Move 4 BACKWARD',
    '5': 'Move 5', '6': 'Move 6 or enter', '7': 'Split 7 (wild)', '8': 'Move 8',
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
  if (type === 'fasttrack' && peg.onFasttrack) {
    const ftIdx = parseInt(peg.holeId.replace('ft-', ''));
    let currentFt = ftIdx;
    for (let i = 1; i <= 6; i++) {
      const next = (ftIdx + i) % 6;
      if (!canAdvanceFastTrackStep(player, currentFt, next, peg)) break;
      seq.push(`ft-${next}`);
      currentFt = next;
      if (next === bp) break;
    }
    return seq;
  }

  // Perimeter track — use the ordered 102-hole array
  const idx = CLOCKWISE_TRACK.indexOf(peg.holeId);
  if (idx === -1) return seq;

  const len = CLOCKWISE_TRACK.length;
  const fwd = dir === 'clockwise';
  const safeEntry = `outer-${bp}-2`;

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

  for (let pi = 0; pi < player.pegs.length; pi++) {
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
          moves.push({ type: 'move', pegIdx: pi, dest, steps, from: peg.holeId, path: trackSeq.slice(0, steps) });

          // rules.json :: FT_ENTRY_EXACT (z=8) — exact landing on ft-* clockwise grants FT.
          // rules.json :: FT_NO_BACKWARD_ENTRY (z=16) — !rules.noFastTrack guard (Card 4).
          if (dir === 'clockwise' && dest.startsWith('ft-') && !peg.onFasttrack && !rules.noFastTrack && !peg.mustExitFasttrack) {
            moves.push({ type: 'enterFastTrack', pegIdx: pi, dest, steps, from: peg.holeId, path: trackSeq.slice(0, steps) });
          }
        }
      }

      // ── PENULTIMATE FT HOLE → BULLSEYE CHOICE ──
      // rules.json :: BULL_ENTRY_PENULTIMATE (z=18) — !FT peg may divert to
      //               bullseye when penult lands on `ft-*` (clockwise only).
      // rules.json :: BULL_ENTRY_1STEP_FT     (z=12) — FT peg may also divert
      //               (no `!peg.onFasttrack` guard).
      // rules.json :: BULL_NO_BACKWARD        (z=24) — `!rules.noFastTrack`.
      // rules.json :: BULL_MAX_ONE_PEG        (z=30) — bullseye occupancy check.
      // rules.json :: FT_RING_PASS_RELAX      (z=72) — own pegs on `ft-*`
      //               intermediates are passable; penult itself must be free.
      if (dir === 'clockwise' && !rules.noFastTrack &&
        !peg.mustExitFasttrack && steps >= 2 && trackSeq.length >= steps - 1) {
        const penultimate = trackSeq[steps - 2];
        if (penultimate && penultimate.startsWith('ft-')) {
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

      // ── FT EXIT OPTIONS ──
      // A peg on FastTrack can exit only at legal ft-* checkpoints reachable
      // before it would violate the no-pass-own-peg rule. Reaching your own
      // ft-{bp} hole is a forced exit boundary.
      if (peg.onFasttrack && dir === 'clockwise') {
        const maxExitStep = Math.min(steps, trackSeq.length);
        for (let s = 0; s < maxExitStep; s++) {
          const h = trackSeq[s];
          const occ = state.board.get(h);
          if (occ && occ.playerIdx === ci) break;
          if (h.startsWith('ft-')) {
            moves.push({
              type: 'exitFastTrack', pegIdx: pi, dest: h,
              steps: s + 1, from: peg.holeId,
              path: trackSeq.slice(0, s + 1)
            });
          }
        }
      }

      // ── FT RING TRAVERSAL (peg sitting on an ft-* hole, not in FT mode) ──
      // Clockwise only. The path stops at the first forced exit boundary:
      // either the player's own ft-{bp} hole or the last safe ft hole before
      // bypassing one of that player's own pegs on the regular track.
      if (dir === 'clockwise' && getHoleType(peg.holeId) === 'fasttrack' && !peg.onFasttrack && !rules.noFastTrack && !peg.mustExitFasttrack) {
        const ftIdx = parseInt(peg.holeId.replace('ft-', ''));
        const ftSeq = [];
        let currentFt = ftIdx;
        for (let fi = 1; fi <= 6; fi++) {
          const next = (ftIdx + fi) % 6;
          if (!canAdvanceFastTrackStep(player, currentFt, next, peg)) break;
          ftSeq.push(`ft-${next}`);
          currentFt = next;
          if (next === bp) break;
        }
        if (ftSeq.length >= steps) {
          const ftDest = ftSeq[steps - 1];
          let ftBlocked = false;
          for (let s = 0; s < steps; s++) {
            const h = ftSeq[s];
            const occ = state.board.get(h);
            // rules.json :: FT_RING_PASS_RELAX (z=72) — `ft-*` intermediates passable
            if (occ && occ.playerIdx === ci && s < steps - 1 && !h.startsWith('ft-')) {
              ftBlocked = true; break;
            }
          }
          // rules.json :: MOV_NO_LAND_OWN (z=6) — destination occupancy check
          const ftDestOcc = state.board.get(ftDest);
          if (ftDestOcc && ftDestOcc.playerIdx === ci) ftBlocked = true;
          if (!ftBlocked) {
            moves.push({ type: 'enterFastTrack', pegIdx: pi, dest: ftDest, steps, from: peg.holeId, path: ftSeq.slice(0, steps) });
          }
        }
      }
    }

    // ENTER BULLSEYE from FastTrack — ONLY on a 1-move card (A, J, Q, K, JOKER)
    // and ONLY when the peg is currently sitting on an ft-* hole.
    // Traversing the fast track does NOT grant a free jump to bullseye; the peg
    // must stop on an ft-* hole and then draw a 1-move card.
    if (peg.onFasttrack && peg.holeId.startsWith('ft-') && rules.movement === 1) {
      const occ = state.board.get('bullseye');
      if (!occ || occ.playerIdx !== ci) {
        moves.push({ type: 'enterBullseye', pegIdx: pi, dest: 'bullseye', from: peg.holeId, path: ['bullseye'] });
      }
    }
  }

  // ── 7-SPLIT LOGIC ──
  // rules.json :: CARD_7_SPLIT       (z=38) — 2 pegs, a+b=7, both clockwise, both legal.
  // rules.json :: CARD_7_SOLO        (z=40) — 1 peg in play → single 7-step move.
  // rules.json :: CARD_7_FT_HANDOFF  (z=42) — FT-priority + on-ring constraint.
  // rules.json :: FT_RING_PASS_RELAX (z=72) — own pegs on `ft-*` are passable.
  // Three variants per (a, b, pi1, pi2): STANDARD | BULL-LEFT | BULL-RIGHT.
  if (rules.isWild && rules.movement === 7) {
    const activePegs = [];
    for (let pi = 0; pi < player.pegs.length; pi++) {
      const peg = player.pegs[pi];
      if (peg.holeType !== 'holding' && peg.holeId !== 'bullseye') {
        activePegs.push(pi);
      }
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
      // Conditions: n >= 2, seq[n-2] is an FT hole, no own pegs blocking path
      // (penult must be free; FT-ring relax allows passing through own pegs on
      // earlier `ft-*` intermediates).
      // _bullPath(seq, n, fromHole) — returns path to bullseye using n steps, or null.
      // Two legal scenarios:
      //   A) n=1 and the peg is already sitting on an ft-* hole (1-step direct jump).
      //   B) n>=2 and the penultimate step (seq[n-2]) is an ft-* hole (clockwise arrival).
      const _bullPath = (seq, n, fromHole) => {
        if (n === 1) {
          // Scenario A: direct 1-step jump from ft-* hole to bullseye
          if (!fromHole || !fromHole.startsWith('ft-')) return null;
          return ['bullseye'];
        }
        if (n < 2 || seq.length < n) return null;
        const penult = seq[n - 2];
        if (!penult || !penult.startsWith('ft-')) return null;
        for (let s = 0; s < n - 1; s++) {
          const h = seq[s];
          const o = state.board.get(h);
          if (!o || o.playerIdx !== ci) continue;
          if (s === n - 2) return null;
          if (!h.startsWith('ft-')) return null;
        }
        return [...seq.slice(0, n - 1), 'bullseye'];
      };

      // Helper: FT-status rule (user_directive_2026-04-25, refined).
      // General principle: "all pegs on FT must complete FT before any other
      // move can be made." For a Card 7 split:
      //   1. If the player has N FT pegs, the split must include min(N,2)
      //      of them as either peg1 or peg2 (can't substitute a non-FT peg
      //      while an FT peg is still available to use).
      //   2. Each FT peg involved in the split must keep its half ENTIRELY
      //      on the FT ring — every position in its path starts with 'ft-'.
      //      Landing on own ft-{bp} counts as completion (still on FT).
      //      Leaving FT mid-split (to outer rim, safe, or bullseye) is
      //      forbidden — that's "leaving FT" which would lose FT for all.
      //   3. Untouched FT pegs (when player has 3+ FT pegs) keep FT status.
      //   4. Partial FT movement is legal — peg2 with only 2 steps left on
      //      the ring may move 2 (doesn't have to complete).
      const _ftPegCount = player.pegs.filter(p => p.onFasttrack).length;
      const _isAllFT = (path) =>
        Array.isArray(path) && path.every(h => typeof h === 'string' && h.startsWith('ft-'));
      const _ftRuleOK = (path1, path2, peg1, peg2) => {
        if (_ftPegCount === 0) return true;
        const ftInSplit = (peg1.onFasttrack ? 1 : 0) + (peg2.onFasttrack ? 1 : 0);
        if (ftInSplit < Math.min(_ftPegCount, 2)) return false;
        if (peg1.onFasttrack && !_isAllFT(path1)) return false;
        if (peg2.onFasttrack && !_isAllFT(path2)) return false;
        return true;
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

      for (let a = 1; a <= 6; a++) {
        const b = 7 - a;
        for (let i = 0; i < activePegs.length; i++) {
          for (let j = 0; j < activePegs.length; j++) {
            if (i === j) continue;
            const pi1 = activePegs[i], pi2 = activePegs[j];
            const peg1 = player.pegs[pi1], peg2 = player.pegs[pi2];

            const seq1 = getTrackSequence(peg1, player, 'clockwise');
            const seq2 = getTrackSequence(peg2, player, 'clockwise');
            if (seq1.length < a || seq2.length < b) continue;
            const dest1 = seq1[a - 1], dest2 = seq2[b - 1];

            const aReachable = _rimReachable(seq1, a);
            const bReachable = _rimReachable(seq2, b);
            const path1Bull = _bullPath(seq1, a, peg1.holeId);
            const path2Bull = _bullPath(seq2, b, peg2.holeId);
            const bullOK = _bullFree();

            // VARIANT 1: STANDARD (rim/FT both halves)
            if (aReachable && bReachable) {
              const path1 = seq1.slice(0, a);
              const path2 = seq2.slice(0, b);
              if (_ftRuleOK(path1, path2, peg1, peg2)) {
                _pushSplit(`${pi1}:${a}-${pi2}:${b}`,
                  pi1, dest1, a, peg1.holeId, path1,
                  pi2, dest2, b, peg2.holeId, path2);
              }
            }

            // VARIANT 2: peg1 → bullseye, peg2 → rim
            if (path1Bull && bReachable && bullOK) {
              const path2 = seq2.slice(0, b);
              if (_ftRuleOK(path1Bull, path2, peg1, peg2)) {
                _pushSplit(`${pi1}:${a}B-${pi2}:${b}`,
                  pi1, 'bullseye', a, peg1.holeId, path1Bull,
                  pi2, dest2, b, peg2.holeId, path2);
              }
            }

            // VARIANT 3: peg1 → rim, peg2 → bullseye
            if (aReachable && path2Bull && bullOK) {
              const path1 = seq1.slice(0, a);
              if (_ftRuleOK(path1, path2Bull, peg1, peg2)) {
                _pushSplit(`${pi1}:${a}-${pi2}:${b}B`,
                  pi1, dest1, a, peg1.holeId, path1,
                  pi2, 'bullseye', b, peg2.holeId, path2Bull);
              }
            }
          }
        }
      }
    }
  }

  // ── FT OVERTAKE CHECK (removed) ──
  // Previously rewrote FT 'move' moves into forced exits when an own peg
  // sat ahead on the ring. Under the FT-ring relax (user_directive_2026-04-25),
  // pegs may PASS own pegs on `ft-*` holes — only landing is forbidden, and
  // that's already enforced upstream in the move generator. Forced-exit
  // alternatives are still surfaced by the FT EXIT OPTIONS block.

  // ── FASTTRACK PRIORITY RULE ──
  // If any of the player's pegs are on FastTrack, they MUST move a FT peg.
  // If no FT moves are possible, all FT pegs lose their FastTrack status
  // and drop to the regular track — then recalculate.
  const pegsOnFT = player.pegs.filter(p => p.onFasttrack);
  if (pegsOnFT.length > 0) {
    const ftMoves = moves.filter(m => {
      const p = player.pegs[m.pegIdx];
      if (p.onFasttrack || m.type === 'enterBullseye') return true;
      // For splits, also keep if the second peg is on FastTrack
      if (m.type === 'split' && player.pegs[m.peg2Idx] && player.pegs[m.peg2Idx].onFasttrack) return true;
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

function setOptionsPanelVisible(visible) {
  const panel = document.getElementById('panel-options');
  if (!panel) return;
  panel.style.display = visible ? 'block' : 'none';
}

function showMoveHints() {
  const hintsDiv = document.getElementById('move-hints');
  if (!hintsDiv) return;
  setOptionsPanelVisible(true);
  const vm = state.turn.get('validMoves') || [];
  if (vm.length === 0) {
    hintsDiv.innerHTML = '<div class="hint" style="opacity:0.5;">No moves available — passing turn</div>';
    setTimeout(endTurn, 1200);
    return;
  }

  // Light up all destination paths on the 3D board
  if (window.highlightMovePaths) window.highlightMovePaths(vm);

  // Separate split moves from regular moves
  const splitMoves = vm.filter(m => m.type === 'split');
  const regularMoves = vm.filter(m => m.type !== 'split');

  // Resolve current player for peg nicknames
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const curPlayer = players[ci];

  // Color dot helper — inline colored circle before peg name
  const colorDot = (color) =>
    `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:4px;vertical-align:middle;box-shadow:0 0 3px ${color}"></span>`;
  const playerDot = colorDot(curPlayer.color);

  // Build regular move buttons
  const buttons = [];
  regularMoves.forEach((m, _) => {
    const i = vm.indexOf(m);
    let icon = '', label = '';
    const pegName = curPlayer.pegs[m.pegIdx]?.nickname || `Peg ${m.pegIdx + 1}`;
    const dotName = `${playerDot}${pegName}`;
    const cut = cutLabel(m.dest);

    switch (m.type) {
      case 'enter':
        if (buttons.some(b => b.isEnter)) return;
        icon = '🏠';
        label = `${playerDot}Bring a peg onto the board${cut}`;
        buttons.push({ idx: i, icon, label, isEnter: true });
        return;

      case 'move': {
        const s = m.steps;
        const dest = m.dest;
        if (dest.startsWith('safe-')) {
          icon = '🛡️';
          label = `${dotName} into safe zone`;
        } else if (dest.startsWith('ft-')) {
          const peg = curPlayer.pegs[m.pegIdx];
          icon = '⚡';
          if (peg && peg.onFasttrack) {
            label = `${dotName} traverse FastTrack ${s} space${s > 1 ? 's' : ''}`;
          } else {
            const who = ownerName(dest);
            label = `${dotName} → ${who}'s FastTrack hole`;
          }
        } else if (dest.startsWith('home-')) {
          const who = ownerName(dest);
          icon = '🏠';
          label = `${dotName} → ${who}'s home`;
        } else {
          const card = state.deck.get('currentCard');
          const cardRules = card ? CARDS[card.value] : null;
          const isBackward = cardRules && cardRules.direction === 'backward';
          icon = s <= 3 ? '👣' : '🏃';
          label = `${dotName} ${isBackward ? 'backward' : 'forward'} ${s} space${s > 1 ? 's' : ''}`;
        }
        if (cut) label += cut;
        break;
      }

      case 'enterFastTrack':
        icon = '⚡';
        label = `${dotName} enters FastTrack`;
        break;

      case 'exitFastTrack': {
        const who = ownerName(m.dest);
        icon = '🚪';
        label = `${dotName} exits FastTrack at ${who}'s hole`;
        break;
      }

      case 'enterBullseye':
        icon = '🎯';
        label = `${dotName} → center bullseye`;
        break;

      case 'exitBullseye':
        icon = '🚀';
        label = `${dotName} exits bullseye`;
        break;
    }
    buttons.push({ idx: i, type: m.type, icon, label, dest: m.dest });
  });

  // Deduplicate — when multiple buttons share the same destination hole AND type, keep only the first
  const seenDests = new Set();
  const dedupedButtons = buttons.filter(b => {
    if (b.type === 'enter') return true;          // enter buttons already deduped above
    if (!b.dest) return true;
    const key = b.dest + '|' + b.type;
    if (seenDests.has(key)) return false;
    seenDests.add(key);
    return true;
  });

  let html = '';

  // Regular move hints
  html += dedupedButtons.map(b =>
    `<div class="hint" onclick="executeMove(${b.idx})" onmouseenter="if(window.highlightSinglePath)window.highlightSinglePath(${b.idx})" onmouseleave="if(window.highlightMovePaths)window.highlightMovePaths()">${b.icon} ${b.label}</div>`
  ).join('');

  // Split selector UI (if splits are available)
  if (splitMoves.length > 0) {
    html += renderSplitSelector(splitMoves, vm);
  }

  hintsDiv.innerHTML = html;

  // Peg name sprites are always visible (managed in renderBoard3D)
}

// ═══════════════════════════════════════════════════════════════════════════
// SPLIT SELECTOR — two-step interactive 7-split UI
// ═══════════════════════════════════════════════════════════════════════════
let _splitSelectedRatio = null;

function renderSplitSelector(splitMoves, allMoves) {
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const player = players[ci];

  // Group splits by ratio (a+b)
  const ratioMap = new Map(); // "a+b" → [moveIndices]
  for (const m of splitMoves) {
    const key = `${m.steps}+${m.steps2}`;
    if (!ratioMap.has(key)) ratioMap.set(key, []);
    ratioMap.get(key).push(allMoves.indexOf(m));
  }

  // Deduplicate symmetric ratios for display (show 1+6 and 6+1 separately since different pegs move different amounts)
  const ratios = Array.from(ratioMap.keys());

  let html = '<div class="split-header">✂️ SPLIT 7</div>';

  // Step 1: Ratio buttons
  html += '<div class="split-ratios">';
  for (const r of ratios) {
    const [a, b] = r.split('+');
    const selected = _splitSelectedRatio === r ? ' selected' : '';
    html += `<div class="split-ratio-btn${selected}" onclick="selectSplitRatio('${r}')">${a} + ${b}</div>`;
  }
  html += '</div>';

  // Step 2: If a ratio is selected, show peg pairs
  if (_splitSelectedRatio && ratioMap.has(_splitSelectedRatio)) {
    const indices = ratioMap.get(_splitSelectedRatio);
    const [selA, selB] = _splitSelectedRatio.split('+').map(Number);

    html += '<div class="split-pairs">';
    for (const idx of indices) {
      const m = allMoves[idx];
      const peg1 = player.pegs[m.pegIdx];
      const peg2 = player.pegs[m.peg2Idx];
      const name1 = peg1.nickname || `Peg ${m.pegIdx + 1}`;
      const name2 = peg2.nickname || `Peg ${m.peg2Idx + 1}`;
      const cut1 = cutLabel(m.dest);
      const cut2 = cutLabel(m.dest2);
      const dot = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${player.color};margin-right:4px;vertical-align:middle;box-shadow:0 0 3px ${player.color}"></span>`;

      // Describe destinations briefly
      const dest1Desc = describeHole(m.dest);
      const dest2Desc = describeHole(m.dest2);

      html += `<div class="split-pair" onclick="executeMove(${idx})" `
        + `onmouseenter="if(window.highlightSinglePath)window.highlightSinglePath(${idx})" `
        + `onmouseleave="if(window.highlightMovePaths)window.highlightMovePaths()">`;
      html += `${dot}<span>${name1} → ${dest1Desc}${cut1}</span>`;
      html += `<span class="split-arrow">│</span>`;
      html += `${dot}<span>${name2} → ${dest2Desc}${cut2}</span>`;
      html += `</div>`;
    }
    html += '</div>';
    html += `<div class="split-back-btn" onclick="selectSplitRatio(null)">↩ back to ratios</div>`;
  }

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

function selectSplitRatio(ratio) {
  _splitSelectedRatio = ratio;
  showMoveHints(); // Re-render with selection
}
window.selectSplitRatio = selectSplitRatio;

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
  // Clear path highlights when a move is chosen
  if (window.clearHighlights) window.clearHighlights();

  const vm = state.turn.get('validMoves') || [];
  const move = vm[moveIdx];
  if (!move) return;

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
      const safeEntry = `outer-${bp}-2`;
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
      {
        const card = state.deck.get('currentCard');
        const cardNoFT = card && CARDS[card.value] && CARDS[card.value].noFastTrack;
        if (getHoleType(move.dest) === 'fasttrack' && !peg.onFasttrack && !peg.mustExitFasttrack && !cardNoFT) {
          _deferredCutscenes.push(['fasttrack', {
            peg, playerColor: player.color, playerName: player.name, playerId: ci
          }]);
        }
      }
      log(`${getCurrentPlayerName()} moved ${move.steps} to ${move.dest}`);
      break;
    }

    case 'enterFastTrack':
      peg.onFasttrack = true;
      peg.fasttrackEntryHole = move.from || peg.holeId;
      peg.mood = 'EXCITED';
      placePeg(peg, move.dest, ci);
      log(`${getCurrentPlayerName()} entered FastTrack → ${move.dest}! ⚡`);
      _deferredCutscenes.push(['fasttrack', {
        peg, playerColor: player.color, playerName: player.name, playerId: ci
      }]);
      break;

    case 'exitFastTrack':
      peg.onFasttrack = false;
      peg.fasttrackEntryHole = null;
      peg.mustExitFasttrack = false;
      peg.mood = 'CAUTIOUS';
      placePeg(peg, move.dest, ci);
      log(`${getCurrentPlayerName()} exited FastTrack at ${move.dest}`);
      if (window.ManifoldAudio) ManifoldAudio.playEnter();
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
      const safeEntry = `outer-${bp}-2`;
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

  // ── All cutscenes must complete before the next turn begins ──
  const advanceTurn = () => {
    if (state.meta.get('winner') !== null) {
      const winnerName = getCurrentPlayerName();
      const gs = document.getElementById('game-status');
      if (gs) gs.textContent = `🏆 ${winnerName} WINS!`;
      if (typeof window !== 'undefined' && window.showReplayPrompt && !window._replayPromptShown) {
        window._replayPromptShown = true;
        // Defer so any in-flight cutscene/animation can play first
        setTimeout(() => window.showReplayPrompt(winnerName), 1200);
      }
      return;
    }

    const rules = CARDS[card.value];
    if (rules.extraTurn) {
      log(`${getCurrentPlayerName()} gets another turn!`);
      state.deck.set('currentCard', null);
      state.turn.set('phase', 'draw');
      updateUI();
      // If the current player is a bot, trigger another bot turn
      const players = state.players.get('list') || [];
      const ci = state.players.get('current') || 0;
      if (players[ci] && players[ci].isBot) {
        setTimeout(botTurn, 800);
      }
    } else {
      endTurn();
    }
  };

  // Wait for hop animations → fire deferred cutscenes → wait for cutscenes → advance turn
  const waitForAll = () => {
    const waitAnims = (cb) => window.waitForAnimations ? window.waitForAnimations(cb) : cb();
    waitAnims(() => {
      fireDeferredCutscenes();
      CutsceneManager.whenDrained(advanceTurn);
    });
  };
  waitForAll();
}


function endTurn() {
  // Clear any lingering path highlights
  if (window.clearHighlights) window.clearHighlights();

  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const next = (ci + 1) % players.length;

  state.deck.set('currentCard', null);
  state.players.set('current', next);
  if (window.CameraDirector) window.CameraDirector.setActivePlayer(next);

  // Disable draw button while camera transitions + avatar blinks
  const drawBtn = document.getElementById('draw-btn');
  if (drawBtn) drawBtn.disabled = true;

  state.turn.set('phase', 'draw');
  state.turn.set('validMoves', []);

  const cardEl = document.getElementById('current-card');
  if (cardEl) cardEl.innerHTML = '<div class="card-back"></div>';
  const infoEl = document.getElementById('card-info');
  if (infoEl) infoEl.textContent = 'Draw a card';
  const hintsDiv = document.getElementById('move-hints');
  if (hintsDiv) hintsDiv.innerHTML = '';
  setOptionsPanelVisible(false);
  updateUI();

  // Gate: wait for camera to settle, THEN blink avatar 3 times, THEN enable turn
  const enableTurn = () => {
    dismissYourTurnPopup();
    if (players[next].isBot) {
      setTimeout(botTurn, 400);
    } else {
      if (drawBtn) drawBtn.disabled = false;
    }
  };

  const startBlink = () => {
    const gameMode = state.meta.get('gameMode') || 'solo';
    const isSameScreen = gameMode === 'same-screen';

    // Show turn indicator for:
    // - All players in same-screen mode (so everyone knows whose turn it is)
    // - Only non-bot players in other modes
    const shouldShowIndicator = isSameScreen || !players[next].isBot;

    if (shouldShowIndicator) {
      const indicatorText = isSameScreen ? `${players[next].name}'s Turn` : players[next].name;
      showYourTurnPopup(indicatorText, players[next].color);

      // Auto-dismiss after 1.5-2 seconds
      setTimeout(dismissYourTurnPopup, 1500);
    }

    if (window.blinkPlayerMarker) {
      window.blinkPlayerMarker(next, enableTurn);
    } else {
      enableTurn();
    }
  };

  if (window.CameraDirector && window.CameraDirector.mode === 'auto') {
    window.CameraDirector.whenSettled(startBlink);
  } else {
    startBlink();
  }
}

function getCurrentPlayerName() {
  const players = state.players.get('list') || [];
  return players[state.players.get('current') || 0].name;
}

// ═══════════════════════════════════════════════════════════════════════════
// BOT AI
// ═══════════════════════════════════════════════════════════════════════════
function botTurn() {
  log(`${getCurrentPlayerName()} is thinking...`);
  setTimeout(() => {
    drawCard();
    setTimeout(() => {
      const vm = state.turn.get('validMoves') || [];
      if (vm.length === 0) return;

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
      const _safeEntryForBot = `outer-${_bpForBot}-2`;

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

      let bestIdx = 0, bestScore = -Infinity;
      for (let i = 0; i < vm.length; i++) {
        const m = vm[i];
        let score = Math.random() * 10; // small random tiebreaker

        if (m.type === 'enterFastTrack') score += w.fasttrack + 50;
        else if (m.type === 'enterBullseye') {
          score += w.fasttrack + 80 + _bullseyeAdjust;
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
        else if (m.type === 'exitBullseye') score += 40;
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
              score += w.fasttrack + 50 + _bullseyeAdjust;
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

        // 🜂 LogicLens boost: z = advance_delta × strategic_value from manifold surface
        // This makes the AI's priorities flow through the Schwarz Diamond z=x·y primitive
        if (_logicLens) {
          const mz = _logicLens.score(m);  // returns z ∈ [0, 1]
          score += mz * 70;               // scale to blend with personality range
        }

        if (score > bestScore) { bestScore = score; bestIdx = i; }
      }

      executeMove(bestIdx);
    }, 600);
  }, 500);
}

// ═══════════════════════════════════════════════════════════════════════════
// UI UPDATES — writes to DOM if elements exist
// ═══════════════════════════════════════════════════════════════════════════
function updateUI() {
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const phase = state.turn.get('phase');

  const playerListDiv = document.getElementById('player-list');
  if (playerListDiv) {
    playerListDiv.innerHTML = players.map((p, i) => {
      const onBoard = p.pegs.filter(pg => pg.holeType !== 'holding').length;
      const inSafe = p.pegs.filter(pg => getHoleType(pg.holeId) === 'safezone').length;
      return `
        <div class="player-row ${i === ci ? 'active' : ''}">
          <div class="player-color" style="background: ${p.color};"></div>
          <span class="player-name">${p.name}</span>
          ${i === ci ? '<span class="turn-chip">TURN</span>' : ''}
          <span class="player-pegs">${onBoard}/${PEGS_PER_PLAYER} (🏠${inSafe})</span>
        </div>`;
    }).join('');
  }

  const drawBtn = document.getElementById('draw-btn');
  if (drawBtn) {
    const cp = players[ci];
    drawBtn.disabled = phase !== 'draw' || cp.isBot;
  }
  const gs = document.getElementById('game-status');
  if (gs) {
    const cp = players[ci];
    // Always show the player's actual name — reflects URL ?name= param
    gs.textContent = `▶ ${cp.name.toUpperCase()} TURN`;
  }

  // Refresh manifold metrics panel
  updateMetricsPanel();
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
        // Victor reaction fires when camera switches to them
        this.showCelebrationGraphic('💪 VICTORY POSE! 💪', victorPlayer.color, false);
        this.showPegReaction(victorReaction, victorPlayer.color);
        // Victor jumps around in celebration (more energetic than 'victory')
        if (window.triggerPegPose) window.triggerPegPose(victorId, 'celebrate');
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
};

// Also expose directly for onclick handlers in HTML
window.drawCard = drawCard;
window.executeMove = executeMove;
window.initGame = initGame;
