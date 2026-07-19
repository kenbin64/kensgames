// browser/fasttrack-core-v2.js
// The bridge: it presents the EXACT window.FastTrackCore surface the existing 3D renderer and HUD
// already speak to, but every rule, every peg position, and every turn is owned by the clean,
// tested v2 engine. The renderer is untouched and never learns the logic changed beneath it.
//
// Why this kills the turn bug: the old core advanced the turn inside an animation/cutscene callback
// chain (waitForAnimations -> whenDrained -> advanceTurn). If a callback misfired, a seat was
// skipped or handed a turn it should not get. Here the engine rotates the turn SYNCHRONOUSLY the
// instant a move is applied; the hop animation is fired afterward and is purely cosmetic. Rotation
// can never wait on an animation, so the skip/extra-turn class of bug cannot occur (proven by the
// v2 turn-sync test).
//
// Loaded as an ES module (type="module"), which runs after parsing but BEFORE DOMContentLoaded, so
// window.FastTrackCore exists in time for init3D's DOMContentLoaded handler.
import rulesDoc from './rules-data.js';
import { loadRules } from '../engine/rules.js';
import { createState, occupantOf } from '../engine/state.js';
import { crownPresent } from '../engine/apply.js';
import { drawCard as engineDraw, legalMoves, playMove, forfeit } from '../engine/turn.js';
import { buildPlayersList, buildBoardEntries, translateMoves, hopHints } from './project.js';
import { cardFace, cardDescription, toRenderHole } from './holemap.js';

// ── RepresentationTable: the exact same tiny named-Map the renderer reads via .get() ──────────────
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
  cards: new RepresentationTable('ft:cards'),
  holes: new RepresentationTable('ft:holes'),
  pegs: new RepresentationTable('ft:pegs'),
  art: new RepresentationTable('ft:art'),
};

// ── cosmetic decoration (colors/avatars/nicknames/personalities) the engine does not track ────────
const PLAYER_COLORS = ['#FFC000', '#0050B5', '#CC0000', '#4B0082', '#A0522D', '#006400'];
const BOT_NAMES = ['Byte', 'Glitch', 'Pixel', 'Socket', 'Kernel', 'Cache', 'Vector', 'Turbo',
  'Nano', 'Codec', 'Probe', 'Cipher', 'Flux', 'Patch', 'Qubit', 'Voxel'];
const PEG_NICKS = ['Scout', 'Dash', 'Pip', 'Nova', 'Ziggy', 'Comet', 'Bolt', 'Echo', 'Rue', 'Fizz'];
const PERSONALITIES = ['CHEERFUL', 'TIMID', 'BOLD', 'CAUTIOUS', 'NERVOUS'];
const pick = (arr, i) => arr[i % arr.length];

// balanced seating: 2 players sit opposite (0,3); otherwise consecutive wedges. Mirrors the proven
// getBalancedBoardPosition just enough that colors/rails line up the same way.
function boardPositionFor(i, count) { return count === 2 ? [0, 3][i] : i; }

const R = loadRules(rulesDoc);
const BOT_THINK_MS = 650;   // pause before a bot draws
const BOT_MOVE_MS = 650;    // pause between a bot's draw and its move
const NEXT_TURN_MS = 450;   // pause before the next seat starts (room for the hop to play)
const NO_MOVE_MS = 1100;    // pause so the player sees a dead card before it auto-passes

let _engine = null;         // the authoritative v2 engine state
let _deco = null;           // { names, avatars, colors, isBot, userIds, pegMeta }
let _v2Moves = [];          // engine moves, aligned by index with state.turn.validMoves
let _renderBoard = null;    // renderBoard3D, registered by init3D via setRenderer
let _config = {};           // remembered for Play-Again
let _splitPeg = null, _splitSteps = null;   // split staging (UI narrowing only)
let _turnTimer = null;      // the SINGLE pending turn-driver timer — never more than one
let _turnToken = 0;         // bumped when a new seat's turn begins; stale scheduled callbacks bail
let _hasReplay = false;     // true when the current drawn card grants a replay (extra turn)

// ── multiplayer (deterministic lockstep over the relay) ───────────────────────────────────────────
// The engine is a pure function of seed + ordered deltas, so MP is: every client runs the same
// engine and applies the same draw/move/pass deltas. The turn pointer advances INSIDE playMove/
// forfeit, so there is no separate turn-rotation message — applying the same move rotates every
// client identically. Only the seat's owner (or the host, for a bot seat) originates + broadcasts a
// delta; everyone else applies what they receive. `_applying` is true while replaying a received
// delta, which both suppresses re-broadcast and bypasses the "is it my seat" origination guard.
let _mpClient = null;       // the KGMultiplayer instance (set by the renderer via setMultiplayerClient)
let _applying = false;      // true while applyRemoteAction is replaying a peer's delta
// Monotonic count of applied deltas (draw/move/pass), identical on every client because all apply
// the same ordered deltas. It gates the host's periodic full-state snapshot: a snapshot only
// applies when it is AHEAD of us (a genuine catch-up / late-join), never to REVERT a client that
// is momentarily ahead of the host — the cause of the mid-game state jitter over the socket.
let _appliedCount = 0;

// ── build the cosmetic layer once, from the roster ────────────────────────────────────────────────
function buildDeco(playerDescs) {
  const names = [], avatars = [], colors = [], isBot = [], userIds = [], pegMeta = {};
  let nick = 0, botN = 0;
  playerDescs.forEach((d, p) => {
    const bp = d.wedge;
    isBot[p] = !!d.isAI;
    names[p] = d.name || (d.isAI ? `🤖 Bot "${pick(BOT_NAMES, botN++)}"` : `Player ${p + 1}`);
    avatars[p] = d.avatar || (d.isAI ? '🤖' : '🎮');
    colors[p] = PLAYER_COLORS[bp];
    userIds[p] = d.userId || null;
    for (let n = 0; n < 5; n++) {
      pegMeta[`p${p}-peg${n}`] = { nickname: pick(PEG_NICKS, nick++), personality: pick(PERSONALITIES, n) };
    }
  });
  return { names, avatars, colors, isBot, userIds, pegMeta };
}

// ── project the engine into the state tables the renderer reads ────────────────────────────────────
function syncState() {
  state.players.set('list', buildPlayersList(_engine, _deco));
  state.players.set('current', _engine.turn.current);
  state.board._data = new Map(buildBoardEntries(_engine));
  state.turn.set('phase', _engine.turn.phase === 'play' ? 'move' : 'draw');
  state.deck.set('currentCard', cardFace(_engine.turn.card));
  state.deck.set('deckCount', _engine.deck.drawPile.length);
  state.meta.set('winner', _engine.winner);
  // CROWN per player: computed live from the engine so the renderer can place a crown on home-{p}
  // the moment the final peg reaches the home stretch, and drop it if that peg is cut or leaves.
  state.meta.set('crowns', _engine.players.map((_pl, p) => crownPresent(_engine, p)));
}

function render() { if (typeof _renderBoard === 'function') _renderBoard(); }

const currentPlayer = () => _engine.players[_engine.turn.current];
function _log(m) {
  try { console.log('[FT]', m); } catch (_) {}
  // Best-effort mirror to the local dev log receiver so the trace can be watched live. Fire-and-
  // forget; wrapped so it can never affect the game if the receiver is not running.
  try { if (typeof navigator !== 'undefined' && navigator.sendBeacon) navigator.sendBeacon('http://127.0.0.1:8091/ftlog', m); } catch (_) {}
}

// Schedule the ONE pending turn-driver step. Clears any previous pending step (so a bot's move
// timer and the next-seat handoff can never both be live), and the token check makes a callback a
// no-op if the turn already moved on (e.g. the renderer auto-committed a single legal move first).
function schedule(fn, ms, token) {
  clearTimeout(_turnTimer);
  _turnTimer = setTimeout(() => { if (token === _turnToken) fn(); }, ms);
}

// ── explicit turn authority (the array + pointer model) ───────────────────────────────────────────
// The active players sit in a fixed clockwise array; a single integer pointer selects whose turn it
// is. A seat may act ONLY when its index equals the pointer (activeOrder[pointer] === seat), so a
// stray or duplicated call for any other seat does nothing and no seat can be skipped. The pointer
// advances by exactly one each turn UNLESS the drawn card grants a replay, in which case it holds.
// The v2 engine already stores this pointer as state.turn.current over the ordered players; these
// helpers make the invariant explicit and enforce it at every action.
function activeOrder() { return _engine.players.map((p) => p.index); }   // clockwise seat order
function turnPointer() { return _engine.turn.current; }                  // the integer `player`
function isTurnOf(seat) { return seat === _engine.turn.current; }        // activeOrder[pointer] === seat

// Tripwire: after a card resolves, the pointer must have either held (a replay card) or moved to the
// very next seat, mod the number of active players. Anything else is a skip, which this model makes
// impossible; we still assert it so a regression is caught the instant it happens.
function assertAdvance(before, after, replay) {
  if (_engine.winner != null) return;
  const N = _engine.players.length;
  const delta = (after - before + N) % N;
  const expected = replay ? 0 : 1;
  if (delta !== expected) {
    _log(`!! TURN INVARIANT VIOLATED: pointer ${before} -> ${after} (delta ${delta}), replay=${replay}; expected ${expected}. No seat may be skipped.`);
  }
}

// ── the DOM HUD (player list + status + draw affordance), matching the proven updateUI markup ──────
function getHoleType(holeId) {
  if (!holeId || holeId === 'holding') return 'holding';
  if (holeId === 'bullseye') return 'bullseye';
  if (holeId.startsWith('safe-')) return 'safezone';
  if (holeId.startsWith('home-')) return 'home';
  if (holeId.startsWith('ft-')) return 'fasttrack';
  if (holeId.startsWith('side-left-')) return 'side-left';
  if (holeId.startsWith('side-right-')) return 'side-right';
  if (holeId.startsWith('outer-')) return 'outer';
  return 'unknown';
}

function updateUI() {
  const players = state.players.get('list') || [];
  const ci = state.players.get('current') || 0;
  const phase = state.turn.get('phase');
  const over = state.meta.get('winner') != null;

  const listDiv = document.getElementById('player-list');
  if (listDiv) {
    listDiv.innerHTML = players.map((p, i) => {
      const onBoard = p.pegs.filter((pg) => pg.holeType !== 'holding').length;
      const inSafe = p.pegs.filter((pg) => getHoleType(pg.holeId) === 'safezone').length;
      const rowCls = ['player-row', i === ci ? 'active' : '', p.isBot ? 'is-bot' : 'is-human']
        .filter(Boolean).join(' ');
      return `
        <div class="${rowCls}">
          <span class="turn-light" title="${i === ci ? `${p.name} — TURN` : `${p.name} — waiting`}"></span>
          <div class="player-color" style="background: ${p.color};"></div>
          <span class="player-avatar">${p.avatar || ''}</span>
          <span class="player-name">${p.name}</span>
          ${i === ci ? '<span class="turn-chip">TURN</span>' : ''}
          <span class="player-pegs">${onBoard}/5 (🏠${inSafe})</span>
        </div>`;
    }).join('');
  }

  const cp = players[ci];
  const humanDraw = cp && !cp.isBot && phase === 'draw' && !over;
  const drawBtn = document.getElementById('draw-btn');
  if (drawBtn) drawBtn.disabled = !humanDraw;
  const cardArea = document.getElementById('card-area');
  if (cardArea) {
    const hasCard = !!state.deck.get('currentCard');
    cardArea.classList.toggle('disabled', !humanDraw && !hasCard);
    cardArea.classList.toggle('locked', !humanDraw && hasCard);
    cardArea.setAttribute('aria-disabled', humanDraw ? 'false' : 'true');
  }
  const gs = document.getElementById('game-status');
  if (gs && cp) gs.textContent = over ? '🏆 GAME OVER' : `▶ ${String(cp.name).toUpperCase()} TURN`;
}

// paint the drawn card into #current-card + #card-info, exactly like the proven _drawCardCommit.
function syncCardDom() {
  const face = state.deck.get('currentCard');
  const cardEl = document.getElementById('current-card');
  if (cardEl && face) {
    cardEl.innerHTML = `<div class="card-face ${face.isRed ? 'red' : 'black'}" data-suit="${face.suit}">
      <span class="cf-rank">${face.value}</span><span class="cf-suit">${face.suit}</span>
    </div>`;
  } else if (cardEl && !face) {
    cardEl.innerHTML = '<div class="card-back"></div>';
  }
  const infoEl = document.getElementById('card-info');
  if (infoEl) infoEl.textContent = face ? cardDescription(face.value) : 'Draw a card';
}

// recompute legal moves, publish them (engine + renderer shapes) and refresh highlights.
function refreshMoves() {
  _splitPeg = null; _splitSteps = null;
  _v2Moves = _engine.turn.card ? legalMoves(_engine, R) : [];
  const vm = translateMoves(_v2Moves);
  state.turn.set('validMoves', vm);
  if (typeof window.highlightMovePaths === 'function') {
    try { window.highlightMovePaths(vm); } catch (_) { /* renderer optional */ }
  }
  return vm;
}

// ── turn driving: hand control to the current seat (human draws; bot is scheduled) ────────────────
// A single entry point per seat. It bumps the turn token so any leftover timer from the previous
// seat is neutralized, then either waits for the human or schedules the bot. Exactly one timer is
// ever pending, so seats cannot be double-driven or skipped.
function kickTurn() {
  clearTimeout(_turnTimer);
  if (_engine.winner != null) { showWinner(); return; }
  const tok = ++_turnToken;                     // a fresh turn begins here
  const seat = turnPointer();                   // the ONE seat allowed to act now
  syncState(); updateUI(); syncCardDom();
  const cp = currentPlayer();
  _log(`turn -> pointer ${seat} of [${activeOrder().join(',')}] (${cp.name}, ${cp.isAI ? 'bot' : 'human'})`);
  if (cp.isAI) {
    // MP: exactly ONE client drives a bot seat — the host — and its draw/move relay to peers.
    if (!_isMpMode() || _isHost()) schedule(() => botTurn(seat), BOT_THINK_MS, tok);
  } else if (typeof window.showYourTurnPopup === 'function') {
    try { window.showYourTurnPopup(cp.name, _deco.colors[seat]); } catch (_) {}
  }
}

// After a card resolves (played or passed), advance visuals and hand off to the next actor. The
// handoff is the ONE pending timer; it is scheduled unguarded (kickTurn is always the right next
// step) and it cancels any lingering bot-move timer, so the next seat runs exactly once.
function afterResolve() {
  syncState();
  render();          // cosmetic hop STARTS here; the turn is ALREADY rotated in the engine
  updateUI();
  syncCardDom();
  clearTimeout(_turnTimer);
  // Pace the NEXT seat to begin only AFTER this seat's hop animation finishes, so
  // seats never animate on top of each other (bots all moving at once). This is
  // VISUAL pacing only — the turn already rotated in the engine, so a missed/late
  // animation callback can never corrupt the turn. A fallback timer guarantees
  // play never stalls even if the renderer never reports the animation done.
  const tok = _turnToken;
  let advanced = false;
  const nextSeat = () => { if (advanced || tok !== _turnToken) return; advanced = true; kickTurn(); };
  if (typeof window.waitForAnimations === 'function') {
    try { window.waitForAnimations(nextSeat); } catch (_) { /* fall through to the timer */ }
    _turnTimer = setTimeout(nextSeat, 3000);       // hard cap so a lost callback can't hang the game
  } else {
    _turnTimer = setTimeout(nextSeat, NEXT_TURN_MS);
  }
}

// ── public: draw a card ───────────────────────────────────────────────────────────────────────────
function drawCard() {
  if (!_engine || _engine.turn.phase !== 'draw' || _engine.winner != null) return;
  if (!_applying && _isMpMode() && !_canDrive(turnPointer())) return;   // MP: only the seat's driver draws
  const tok = _turnToken;
  if (typeof window.dismissYourTurnPopup === 'function') { try { window.dismissYourTurnPopup(); } catch (_) {} }
  engineDraw(_engine); _appliedCount++;   // engine draws + flips to the play phase (count the delta)
  syncState(); syncCardDom();
  if (typeof window.ManifoldAudio !== 'undefined' && window.ManifoldAudio) {
    try { window.ManifoldAudio.playCardDraw(); } catch (_) {}
  }
  _hasReplay = !!(_engine.turn.card && R.grantsExtraTurn(_engine.turn.card.rank));   // HasReplay
  state.turn.set('hasReplay', _hasReplay);
  const vm = refreshMoves();
  updateUI();
  _log(`draw pointer ${_engine.turn.current}: ${_engine.turn.card ? _engine.turn.card.rank : '?'} (${vm.length} legal, replay=${_hasReplay})`);
  // A dead card for a HUMAN auto-passes after a beat (a bot's dead card is handled in botAct). The
  // engine's forfeit still grants a redraw for redraw cards.
  if (vm.length === 0 && !currentPlayer().isAI && !_applying) {
    schedule(() => { if (_engine.turn.phase === 'play' && _engine.turn.card) passTurn('human-no-move'); }, NO_MOVE_MS, tok);
  }
  // exactly-one-move auto-commit is handled by the renderer's move cycle.
  if (!_applying) _broadcast('draw', { card: _engine.turn.card });   // MP: relay the (deterministic) draw
}

// ── public: play validMoves[idx] ─────────────────────────────────────────────────────────────────
// Called by the human's confirm, the renderer's single-move auto-commit, or the bot. It is safe to
// call more than once for the same turn: the phase guard and the emptied _v2Moves make the second
// call a no-op, so the auto-commit and the bot timer can never both advance the turn.
function executeMove(moveIdx) {
  if (!_engine || _engine.turn.phase !== 'play') return;
  if (!_applying && _isMpMode() && !_canDrive(turnPointer())) return;   // MP: only the seat's driver moves
  const m = _v2Moves[moveIdx];
  if (!m) return;
  if (!_applying) _broadcast('move', { move: m });    // MP: relay the exact chosen move (a choice, not deterministic)
  const player = _engine.turn.current;
  const before = turnPointer();
  // stage the cosmetic hop BEFORE applying, so the renderer arcs along the path.
  const hints = hopHints(m, player);
  window._pendingHopAnim = hints.primary;
  window._pendingHopAnim2 = hints.secondary;
  state.turn.set('validMoves', []);      // clear immediately so the UI can't double-commit
  _v2Moves = [];
  playMove(_engine, R, m); _appliedCount++;   // applies the move AND advances the pointer, synchronously (count the delta)
  assertAdvance(before, turnPointer(), _hasReplay);   // pointer moved by exactly 0 (replay) or +1
  _log(`seat ${player} played ${m.type}${_engine.winner != null ? ' (WIN)' : ` -> pointer ${turnPointer()}`}`);
  afterResolve();
}

// ── public: pass / forfeit the current card ───────────────────────────────────────────────────────
function passTurn(reason) {
  if (!_engine || _engine.turn.phase !== 'play') return;
  if (!_applying && _isMpMode() && !_canDrive(turnPointer())) return;   // MP: only the seat's driver passes
  if (!_applying) _broadcast('pass', { reason });      // MP: relay so all clients forfeit in lockstep
  const player = _engine.turn.current;
  const before = turnPointer();
  forfeit(_engine, R); _appliedCount++;   // discards the card and resolves (redraw cards still redraw); count the delta
  assertAdvance(before, turnPointer(), _hasReplay);
  state.turn.set('validMoves', []);
  _v2Moves = [];
  _log(`seat ${player} passed (${reason || ''}) -> pointer ${turnPointer()}`);
  afterResolve();
}

// ── a bot's turn, paced by timers (never gated on animation) ──────────────────────────────────────
// botTurn just draws; the move (or pass) is a separate step. Both are gated on `seat` still being the
// pointer, so a stray/duplicated bot callback for a seat that is no longer active does nothing (and
// if the renderer auto-committed the bot's single legal move first, botAct simply bails).
function botTurn(seat) {
  if (!_engine || _engine.winner != null) return;
  if (!isTurnOf(seat) || !currentPlayer().isAI || _engine.turn.phase !== 'draw') return;
  const tok = _turnToken;
  drawCard();
  schedule(() => botAct(seat, tok), BOT_MOVE_MS, tok);
}
function botAct(seat, tok) {
  if (tok !== _turnToken || !isTurnOf(seat)) return;    // turn already moved on / not this seat
  if (!currentPlayer().isAI || _engine.turn.phase !== 'play') return;
  if (_v2Moves.length === 0) passTurn('bot-no-move');
  else executeMove(pickBotMove());
}

// a light, sensible bot: win if you can, else take the center, else cut an opponent, else enter a
// peg, else the move that travels furthest. Not the old AI's exact heuristics (a deliberate v1
// simplification), but it plays legally and reasonably; parity is a tracked follow-up.
function pickBotMove() {
  let best = 0, bestScore = -Infinity;
  _v2Moves.forEach((m, i) => {
    let s = 0;
    const dest = m.type === 'split' ? m.destA : m.dest;
    if (m.type === 'enterBullseye') s += 90;
    if (m.type === 'enter') s += 40;
    if (m.type === 'exitFastTrack') s += 30;
    const occ = dest ? occupantOf(_engine, dest) : null;   // dest is engine id here
    if (occ && occ.player !== _engine.turn.current) s += 60;   // a cut
    if (dest && dest.startsWith(`safe-${_engine.turn.current}-`)) s += 50;
    s += (m.steps || m.a || 0);
    if (s > bestScore) { bestScore = s; best = i; }
  });
  return best;
}

// ── split staging: the UI narrows a card-7 by peg then steps; we only re-highlight candidates ─────
function selectSplitPeg(pegIdx) {
  _splitPeg = pegIdx; _splitSteps = null;
  if (typeof window.highlightMovePaths === 'function') {
    const vm = state.turn.get('validMoves') || [];
    try { window.highlightMovePaths(vm.filter((m) => m.type === 'split' && (m.pegIdx === pegIdx || m.peg2Idx === pegIdx))); } catch (_) {}
  }
}
function selectSplitSteps(steps) {
  _splitSteps = steps;
  if (typeof window.highlightMovePaths === 'function') {
    const vm = state.turn.get('validMoves') || [];
    try {
      window.highlightMovePaths(vm.filter((m) => m.type === 'split'
        && ((m.pegIdx === _splitPeg && m.steps === steps) || (m.peg2Idx === _splitPeg && m.steps2 === steps))));
    } catch (_) {}
  }
}
function getSplitChoice() { return _splitPeg == null ? null : { pegIdx: _splitPeg, steps: _splitSteps }; }

// ── win ───────────────────────────────────────────────────────────────────────────────────────────
function showWinner() {
  syncState(); updateUI();
  const w = _engine.winner;
  const name = w != null ? _deco.names[w] : '';
  try { localStorage.setItem('ft.rematchWinnerName', name); } catch (_) {}
  if (typeof window.showReplayPrompt === 'function') { try { window.showReplayPrompt(name); return; } catch (_) {} }
  const overlay = document.getElementById('replay-overlay');
  const winEl = document.getElementById('replay-winner');
  if (winEl) winEl.textContent = `${name} wins!`;
  if (overlay) overlay.style.setProperty('display', 'flex', 'important');
}

// ── init / restart ────────────────────────────────────────────────────────────────────────────────
// ── multiplayer: helpers, relay, and the receive path ─────────────────────────────────────────────
function _isMpMode() {
  if (_mpClient) return true;
  const m = state.meta.get('gameMode');
  return m === 'private' || m === 'public' || m === 'multiplayer';
}
function _myUid() {
  const m = state.meta.get('myUserId');
  if (m != null) return String(m);
  if (_mpClient && _mpClient.userId != null) return String(_mpClient.userId);
  return null;
}
function _seatUid(seat) {
  const u = _deco && _deco.userIds ? _deco.userIds[seat] : null;
  return u != null ? String(u) : null;
}
function _humanCount() { return _engine ? _engine.players.filter((p) => !p.isAI).length : 0; }
function _isHost() {
  if (!_mpClient) return true;              // no live client → sole authority (solo / same-screen)
  if (!_mpClient.session) return true;      // attached but no session yet → own authority
  if (_humanCount() <= 1) return true;      // only one human → drive your own bots
  return !!_mpClient.isHost;                // else defer to the server's host flag
}
// Who may ORIGINATE the current seat's action: its human owner, or the host for a bot seat.
function _canDrive(seat) {
  if (!_isMpMode()) return true;            // solo / same-screen: this client drives every seat
  const su = _seatUid(seat);
  if (su != null && su === _myUid()) return true;
  const cp = _engine.players[seat];
  return !!(cp && cp.isAI && _isHost());
}

// Relay one delta to peers. No-op while replaying a received delta (never echo) or outside MP.
function _broadcast(action, payload) {
  if (_applying || !_isMpMode() || !_mpClient) return;
  try { _mpClient.sendAction(action, payload || {}); }
  catch (e) { console.warn('[FT v2 mp] broadcast failed:', action, e); }
}

// Apply a peer's delta onto our identical engine. draw/pass are deterministic (the seeded deck);
// move carries the exact chosen engine move. `_applying` suppresses re-broadcast during replay and
// lets the origination guard through so the delta always applies regardless of whose seat it is.
function applyRemoteAction(action, payload) {
  if (!action || !_engine) return;
  _applying = true;
  try {
    if (action === 'draw') {
      drawCard();
      const got = _engine.turn.card, want = payload && payload.card;
      if (want && got && got.rank !== want.rank) {
        console.warn('[FT v2 mp] DESYNC: drew', got.rank, 'but peer sent', want.rank);
      }
    } else if (action === 'move') {
      const move = payload && payload.move;
      if (move) { _v2Moves = [move]; state.turn.set('validMoves', [move]); executeMove(0); }
    } else if (action === 'pass') {
      passTurn((payload && payload.reason) || 'remote');
    }
  } finally { _applying = false; }
}

function setMultiplayerClient(client) {
  _mpClient = client || null;
  if (client) {
    try {
      const cur = state.meta.get('gameMode');
      if (cur !== 'private' && cur !== 'public' && cur !== 'multiplayer') state.meta.set('gameMode', 'multiplayer');
    } catch (_) {}
  }
}
function setMyUserId(userId) { state.meta.set('myUserId', userId != null ? String(userId) : null); }

// Live roster refresh from the lobby: map sessionPlayers (sorted by slot) onto our seats. A refresh
// must never flip an established human seat into a bot (only an explicit relinquish does that).
function updateSessionRoster(sessionPlayers) {
  if (!_deco || !_engine || !Array.isArray(sessionPlayers) || sessionPlayers.length < 2) return;
  const sorted = sessionPlayers.slice().sort((a, b) => {
    const sa = Number.isFinite(a && a.slot) ? a.slot : 1e9;
    const sb = Number.isFinite(b && b.slot) ? b.slot : 1e9;
    return sa - sb;
  });
  const n = Math.min(_engine.players.length, sorted.length);
  for (let i = 0; i < n; i++) {
    const sp = sorted[i]; if (!sp) continue;
    if (sp.user_id != null) _deco.userIds[i] = String(sp.user_id);
    if (!(_deco.isBot[i] === false && !!sp.is_ai)) {   // never demote a human → bot on a routine refresh
      _deco.isBot[i] = !!sp.is_ai;
      _engine.players[i].isAI = !!sp.is_ai;
    }
    if (sp.username || sp.name) { _deco.names[i] = sp.username || sp.name; _engine.players[i].name = _deco.names[i]; }
    const av = sp.avatar && (sp.avatar.emoji || sp.avatar);
    if (av || sp.avatar_id) _deco.avatars[i] = av || sp.avatar_id;
  }
  syncState(); updateUI();
}

// One deterministic draw (mulberry32) so every client opens on the SAME seat in MP — replaces the
// non-deterministic Math.random() that would desync lockstep at seat zero.
function _seededPick(seed, n) {
  let t = (seed + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return Math.floor(r * n);
}

function rosterFromConfig(playerCount, config) {
  const count = Math.max(2, Math.min(6, config.sessionPlayers ? config.sessionPlayers.length : (playerCount || 2)));
  const sp = config.sessionPlayers || null;
  const descs = [];
  for (let i = 0; i < count; i++) {
    const s = sp ? sp[i] : null;
    const isAI = s ? !!s.is_ai : i > 0;   // solo: seat 0 human, rest bots
    descs.push({
      index: i,
      wedge: boardPositionFor(i, count),
      isAI,
      name: s ? (s.username || null) : (i === 0 ? (config.humanName || 'You') : null),
      avatar: s ? ((s.avatar && (s.avatar.emoji || s.avatar)) || null) : (i === 0 ? (config.humanAvatar || '🎮') : null),
      userId: s ? s.user_id : null,
    });
  }
  return descs;
}

function initGame(playerCount = 2, config = {}) {
  clearTimeout(_turnTimer);
  _turnToken++;                           // invalidate any in-flight timer from a prior game
  _config = { playerCount, ...config };
  const descs = rosterFromConfig(playerCount, config);
  _deco = buildDeco(descs);
  const seed = (config.sessionSeed && hashSeed(config.sessionSeed))
    || (config.deckSeed && hashSeed(config.deckSeed)) || 1 + descs.length;
  // Starting seat (user_directive_2026-07-18d): an explicit override wins; else a
  // REPLAY opens on the previous winner (one-shot, matched by name); else the FIRST
  // game of the session opens on a uniformly RANDOM seat among ALL players.
  let firstPlayer = Number.isInteger(config.startingPlayer) ? config.startingPlayer : -1;
  if (firstPlayer < 0) {
    let rematch = null;
    try { rematch = localStorage.getItem('ft.rematchWinnerName'); } catch (_) {}
    try { localStorage.removeItem('ft.rematchWinnerName'); } catch (_) {}
    if (rematch) {
      const target = String(rematch).trim().toLowerCase();
      firstPlayer = descs.findIndex((d) => String(_deco.names[d.index] || '').trim().toLowerCase() === target);
    }
    // MP must be deterministic: derive the opening seat from the SHARED session seed so every client
    // agrees (Math.random would desync lockstep at seat zero). Solo keeps a fresh pick each game.
    if (firstPlayer < 0) firstPlayer = config.sessionSeed ? _seededPick(seed, descs.length) : Math.floor(Math.random() * descs.length);
  }
  _engine = createState({
    rules: R,
    players: descs.map((d) => ({ name: _deco.names[d.index], isAI: d.isAI, color: _deco.colors[d.index] })),
    seed,
    firstPlayer: firstPlayer < 0 ? 0 : firstPlayer,
  });
  _appliedCount = 0;                       // fresh game → no deltas applied yet
  // rebuild board+holes tables once (holes are static; board updates every sync).
  seedHoleTable();
  syncState();
  const overlay = document.getElementById('replay-overlay');
  if (overlay) overlay.style.removeProperty('display');
  updateUI(); syncCardDom();
  render();
  // hand off to the opening seat after the scene has a beat to settle (mirrors the proven tail).
  clearTimeout(_turnTimer);
  _turnTimer = setTimeout(kickTurn, 500);
}

// a tiny deterministic string hash so a lobby seed maps to the engine's integer seed.
function hashSeed(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 1;
}

// populate state.holes once (id|type) so any consumer that reads it sees the full board.
function seedHoleTable() {
  const t = state.holes; t._data = new Map();
  for (const p of _engine.players.map((x) => x.index)) {
    t.set(`ft-${p}`, { id: `ft-${p}`, type: 'fasttrack' });
    for (let h = 1; h <= 4; h++) t.set(`side-left-${p}-${h}`, { id: `side-left-${p}-${h}`, type: 'side-left' });
    for (let h = 0; h <= 3; h++) t.set(`outer-${p}-${h}`, { id: `outer-${p}-${h}`, type: 'outer' });
    t.set(`home-${p}`, { id: `home-${p}`, type: 'home' });
    for (let h = 1; h <= 4; h++) t.set(`side-right-${p}-${h}`, { id: `side-right-${p}-${h}`, type: 'side-right' });
    for (let h = 1; h <= 4; h++) t.set(`safe-${p}-${h}`, { id: `safe-${p}-${h}`, type: 'safezone' });
    for (let h = 0; h <= 3; h++) t.set(`hold-${p}-${h}`, { id: `hold-${p}-${h}`, type: 'holding' });
  }
  t.set('bullseye', { id: 'bullseye', type: 'bullseye' });
}

// ── multiplayer snapshot hooks (minimal; MP transport is Phase 3) ─────────────────────────────────
function getStateSnapshot() { return JSON.parse(JSON.stringify({ engine: _engine, deco: _deco, config: _config, applied: _appliedCount })); }
function applyStateSnapshot(snap) {
  if (!snap || !snap.engine) return;
  // Only adopt a snapshot that is AHEAD of us (a catch-up after a missed delta, or a late-join with
  // no engine yet). A snapshot at or behind our applied-delta count is stale — applying it would
  // REVERT a client that is momentarily ahead of the host and cause the mid-game jitter. Ignore it.
  if (_engine && snap.applied != null && snap.applied <= _appliedCount) return;
  _engine = snap.engine; _deco = snap.deco; _config = snap.config || _config;
  _appliedCount = (snap.applied != null) ? snap.applied : _appliedCount;
  syncState(); updateUI(); syncCardDom(); render();
}

// ── publish the exact surface the renderer + UI already call ───────────────────────────────────────
const FastTrackCore = {
  state,
  initGame,
  drawCard,
  executeMove,
  passTurn,
  selectSplitPeg,
  selectSplitSteps,
  getSplitChoice,
  botTurn,
  updateUI,
  setRenderer(fn) { _renderBoard = fn; },
  getStateSnapshot,
  applyStateSnapshot,
  // multiplayer: the renderer's socket wiring (fasttrack-3d.js) calls these
  setMultiplayerClient,
  setMyUserId,
  updateSessionRoster,
  applyRemoteAction,
  // read-only helpers a few UI paths reference
  getHoleType,
  PLAYER_COLORS,
  isEngineV2: true,
};

window.FastTrackCore = FastTrackCore;
// The legacy renderer (fasttrack-3d.js) is a NON-module script that reads several
// core values as bare globals via the shared script scope. This adapter is an ES
// MODULE, so its bindings are module-scoped and invisible to those bare refs —
// which threw "state is not defined" and blacked out the whole scene. Re-publish
// the ones the renderer reads bare onto window so the shared-global contract holds.
window.state = state;
window.getHoleType = getHoleType;
window.PLAYER_COLORS = PLAYER_COLORS;
window.initGame = initGame;
window.drawCard = drawCard;
window.executeMove = executeMove;
window.passTurn = passTurn;
window.selectSplitPeg = selectSplitPeg;
window.selectSplitSteps = selectSplitSteps;
window.botTurn = botTurn;
// A few UI buttons call these globals; provide safe no-op-ish fallbacks only if nothing else did.
window.playAgain = window.playAgain || function () {
  const overlay = document.getElementById('replay-overlay');
  if (overlay) overlay.style.removeProperty('display');
  initGame(_config.playerCount || 2, _config);
};

console.log('[FastTrack v2] engine-backed core ready — turn rotation is render-decoupled.');
_log('BUILD 20260704e loaded — engine-backed core, explicit array+pointer turn authority');
