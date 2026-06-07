/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 FAST TRACK — MANIFOLD CORE ADAPTER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Same 3D board, same pieces, same renderer — different brain.
 *
 * The existing renderer (fasttrack-3d.js) talks to a `window.FastTrackCore`:
 * it READS `FastTrackCore.state` and CALLS drawCard / executeMove / initGame /
 * setRenderer. This module provides that exact surface, but the logic
 * underneath is the PURE manifold core (ft-manifold.js): the whole game is
 * `z = derive(seed, action-log)`, projected into the legacy state shape so the
 * 3D board can draw it. No rules live here — only projection + orchestration.
 *
 * Activate with  ?engine=manifold  on /fasttrack/3d.html. Without the flag this
 * file does nothing and the legacy core runs untouched.
 *
 * Scope: the perimeter game the pure core supports today (enter, travel,
 * circuit, exact-landing safe entry, win, turn rotation, pass). FT-ring /
 * bullseye / 7-split arrive as the core gains those lenses; the adapter does
 * not change to add them.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('engine') !== 'manifold') return; // opt-in only
  } catch (_) { return; }

  const FT = window.FTManifold;
  if (!FT) { console.error('[ft-manifold] FTManifold not loaded — include ft-manifold.js'); return; }

  // ── Minimal RepresentationTable (the shape fasttrack-3d.js reads) ──────────
  function Table() { this._data = new Map(); }
  Table.prototype.get = function (k) { return this._data.get(k); };
  Table.prototype.set = function (k, v) { this._data.set(k, v); return v; };
  Table.prototype.has = function (k) { return this._data.has(k); };
  Table.prototype.delete = function (k) { return this._data.delete(k); };
  Table.prototype.keys = function () { return Array.from(this._data.keys()); };

  const state = {};
  for (const name of ['players', 'board', 'deck', 'turn', 'movement', 'safeZone', 'meta', 'cards', 'holes', 'pegs', 'art']) {
    state[name] = new Table();
  }

  // ── The whole game state of THIS client: genesis (x) + action log (y) ──────
  let G = null;        // genesis
  let LOG = [];        // action log
  let _renderer = function () {};
  const CARD_GLYPH = { A: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', J: 'J', Q: 'Q', K: 'K', JOKER: '🃏' };
  const SUIT = '♠';

  const pegId = (pi, k) => `p${pi}-peg${k}`;          // renderer convention
  const mPegId = (pi, k) => `p${pi}-${k}`;            // manifold convention
  const holeType = (h) => h === 'holding' ? 'holding'
    : h.startsWith('ft-') ? 'fasttrack'
      : h.startsWith('safe-') ? 'safezone'
        : h.startsWith('home-') ? 'home'
          : h.startsWith('side-left') ? 'side-left'
            : h.startsWith('side-right') ? 'side-right'
              : h.startsWith('outer-') ? 'outer'
                : h === 'bullseye' ? 'bullseye' : 'holding';

  // ── Projection: write the derived z into the legacy state shape ────────────
  function project() {
    const z = FT.derive(G, LOG);
    const v = FT.view(z, G);

    const players = v.players.map((p) => ({
      index: p.idx,
      name: p.name,
      color: p.color,
      boardPosition: p.bp,
      isBot: p.isBot,
      aiDifficulty: p.isBot ? 'normal' : null,
      pegs: p.pegs.map((peg, k) => ({
        id: pegId(p.idx, k),
        holeId: peg.hole,
        holeType: holeType(peg.hole),
        onFasttrack: peg.hole.startsWith('ft-'),
        eligibleForSafeZone: peg.eligible,
        nickname: '',
      })),
    }));
    state.players.set('list', players);
    state.players.set('current', v.current);
    state.players.set('count', players.length);

    // Board occupancy (some render paths read it).
    for (const k of state.board.keys()) state.board.set(k, null);
    players.forEach((pl) => pl.pegs.forEach((pg) => {
      if (pg.holeId !== 'holding') state.board.set(pg.holeId, { playerIdx: pl.index, pegId: pg.id });
    }));

    state.turn.set('phase', v.phase);
    state.turn.set('validMoves', toValidMoves(v));
    state.deck.set('currentCard', v.card ? { value: v.card, display: CARD_GLYPH[v.card] + SUIT, id: 'c' + LOG.length, suits: [SUIT] } : null);
    state.meta.set('winner', v.winner);
    paintCard(v.card);
    return v;
  }

  // Populate the card face on top of the deck, exactly as the legacy core did.
  const CARD_DESC = {
    A: 'Move 1 or enter', 2: 'Move 2', 3: 'Move 3', 4: 'Move 4 BACKWARD', 5: 'Move 5',
    6: 'Move 6 or enter', 7: 'Move 7', 8: 'Move 8', 9: 'Move 9', 10: 'Move 10',
    J: 'Move 1', Q: 'Move 1', K: 'Move 1', JOKER: 'Wild! Enter or move 1',
  };
  function paintCard(rank) {
    const cardEl = document.getElementById('current-card');
    if (cardEl) {
      if (rank) {
        const glyph = CARD_GLYPH[rank] || rank;
        cardEl.innerHTML = `<div class="card-face black" data-suit="${SUIT}">` +
          `<span class="cf-rank">${glyph}</span><span class="cf-suit">${SUIT}</span></div>`;
      }
    }
    const infoEl = document.getElementById('card-info');
    if (infoEl) infoEl.textContent = rank ? (CARD_DESC[rank] || '') : 'Draw a card';
  }

  // Manifold legal moves → the renderer's pick-system shape (type/pegIdx/dest/path/from).
  function toValidMoves(v) {
    if (v.current !== 0) return []; // only the local human picks; bots are driven below
    return v.legalMoves.map((m) => {
      const k = parseInt(String(m.pegId).split('-')[1], 10);
      const seat = v.players[v.current];
      const from = seat.pegs[k] ? seat.pegs[k].hole : 'holding';
      return {
        type: m.type === 'enter' ? 'enter' : 'move',
        pegIdx: k,
        dest: m.dest,
        from: from,
        path: Array.isArray(m.path) ? m.path.slice() : [m.dest],
        steps: (m.path || []).length,
      };
    });
  }

  // ── Orchestration helpers (drive the real renderer's primitives) ───────────
  const waitAnims = (cb) => (typeof window.waitForAnimations === 'function') ? window.waitForAnimations(cb) : setTimeout(cb, 30);
  function render() { try { _renderer(); } catch (e) { console.warn('[ft-manifold] render', e); } refreshHUD(); }
  function refreshHUD() {
    const v = FT.view(FT.derive(G, LOG), G);
    const drawBtn = document.getElementById('draw-btn');
    const myTurn = v.current === 0 && v.winner == null;
    if (drawBtn) drawBtn.disabled = !(myTurn && v.phase === 'draw');
    const gs = document.getElementById('game-status');
    if (gs) gs.textContent = v.winner != null ? `🏆 ${v.players[v.winner].name} WINS!` : `▶ ${v.players[v.current].name.toUpperCase()} TURN`;
    if (typeof window.highlightMovePaths === 'function') {
      try { window.highlightMovePaths(state.turn.get('validMoves') || []); } catch (_) {}
    }
  }

  function afterTurnBoundary() {
    const v = project();
    render();
    if (v.winner != null) return;
    if (v.current !== 0) { setTimeout(botStep, 650); return; } // bot's turn
    // human's turn: wait for a Draw click (handled by drawCard)
  }

  // A true-random genesis seed (high entropy from the platform CSPRNG). The
  // game is unpredictable per-launch, yet every card + board state still derives
  // deterministically from this one seed — so the manifold randomiser stays
  // pure. In live MP the SHARED session seed is used instead (same seed → same
  // deck on every client).
  function trueRandomSeed() {
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const a = new Uint32Array(4); crypto.getRandomValues(a);
        return 'r-' + Array.from(a).map((n) => n.toString(16).padStart(8, '0')).join('');
      }
    } catch (_) { /* fall through */ }
    return 'r-' + Math.floor(Math.random() * 0xffffffff).toString(16);
  }

  // ── Public API the renderer calls ──────────────────────────────────────────
  function initGame(count, config) {
    const cfg = config || {};
    const sp = Array.isArray(cfg.sessionPlayers) ? cfg.sessionPlayers : null;
    const n = Math.max(2, Math.min(6, sp ? sp.length : (parseInt(count, 10) || 3)));
    const roster = sp
      ? sp.map((p, i) => ({ id: p.user_id || `seat-${i}`, name: p.username || (i === 0 ? (cfg.humanName || 'You') : null), isBot: !!p.is_ai }))
      : Array.from({ length: n }, (_, i) => ({ id: `seat-${i}`, name: i === 0 ? (cfg.humanName || 'You') : null, isBot: i !== 0 }));
    const seed = (cfg.sessionSeed != null && String(cfg.sessionSeed)) ? String(cfg.sessionSeed) : trueRandomSeed();
    G = FT.genesis(seed, roster);
    LOG = [];
    state.meta.set('gameMode', 'solo');
    state.meta.set('seed', seed);
    project();
    render();
    // Seat 0 is the human and starts. If it were a bot we'd kick botStep here.
    const v = FT.view(FT.derive(G, LOG), G);
    if (v.current !== 0) setTimeout(botStep, 700);
    console.log('[ft-manifold] game started — seed', seed, '| players', roster.length);
  }

  function drawCard() {
    const v0 = FT.view(FT.derive(G, LOG), G);
    if (v0.winner != null || v0.phase !== 'draw') return;
    if (v0.current === 0) { if (typeof window.dismissYourTurnPopup === 'function') try { window.dismissYourTurnPopup(); } catch (_) {} }
    LOG = LOG.concat([{ type: 'draw' }]);
    const v = project();
    render();
    // No legal move for the human? auto-pass after a short beat.
    if (v.current === 0 && (state.turn.get('validMoves') || []).length === 0) {
      setTimeout(() => { if ((FT.view(FT.derive(G, LOG), G)).phase === 'move') passTurn('no legal move'); }, 1400);
    }
  }

  function executeMove(idx) {
    const vm = state.turn.get('validMoves') || [];
    const mv = vm[idx];
    if (!mv) return;
    const seatBefore = FT.view(FT.derive(G, LOG), G).current;
    const action = { type: 'move', pegId: mPegId(seatBefore, mv.pegIdx), dest: mv.dest };
    // Set the hop animation BEFORE projecting so the renderer interpolates the move.
    window._pendingHopAnim = { pegId: pegId(seatBefore, mv.pegIdx), path: (mv.path || [mv.dest]).slice(), from: mv.from };
    LOG = LOG.concat([action]);
    project();
    if (typeof window.raiseAnimationBarrier === 'function') try { window.raiseAnimationBarrier(); } catch (_) {}
    render();
    waitAnims(afterTurnBoundary);
  }

  function passTurn() {
    const v = FT.view(FT.derive(G, LOG), G);
    if (v.phase !== 'move') return;
    LOG = LOG.concat([{ type: 'pass' }]);
    afterTurnBoundary();
  }

  function botStep() {
    const v = FT.view(FT.derive(G, LOG), G);
    if (v.winner != null || v.current === 0) { project(); render(); return; }
    if (v.phase === 'draw') { LOG = LOG.concat([{ type: 'draw' }]); project(); render(); setTimeout(botStep, 480); return; }
    const moves = v.legalMoves;
    if (moves.length) {
      const m = moves[0];
      const k = parseInt(String(m.pegId).split('-')[1], 10);
      const seat = v.players[v.current];
      window._pendingHopAnim = { pegId: pegId(v.current, k), path: (m.path || [m.dest]).slice(), from: seat.pegs[k].hole };
      LOG = LOG.concat([{ type: 'move', pegId: m.pegId, dest: m.dest }]);
      if (typeof window.raiseAnimationBarrier === 'function') try { window.raiseAnimationBarrier(); } catch (_) {}
      project(); render();
      waitAnims(afterTurnBoundary);
    } else {
      LOG = LOG.concat([{ type: 'pass' }]);
      afterTurnBoundary();
    }
  }

  function updateUI() { try { refreshHUD(); } catch (_) {} }
  function setRenderer(fn) { if (typeof fn === 'function') _renderer = fn; }
  function getCurrentPlayerName() { const v = FT.view(FT.derive(G, LOG), G); return v.players[v.current].name; }

  // No-op MP / split surface (the manifold PoC runs solo; the action log is the
  // future multiplayer transport, and FT/bullseye/split land as core lenses).
  const noop = function () {};
  const FastTrackCore = {
    state, initGame, drawCard, executeMove, passTurn, endTurn: passTurn,
    calculateValidMoves: () => { project(); refreshHUD(); }, updateUI, setRenderer,
    getCurrentPlayerName, getBalancedBoardPosition: FT.balancedBp,
    setMultiplayerClient: noop, setMyUserId: noop, updateSessionRoster: noop,
    applyRemoteAction: noop,
    getStateSnapshot: () => ({ seed: G && G.seed, log: LOG.slice() }),
    applyStateSnapshot: (snap) => { if (snap && Array.isArray(snap.log)) { LOG = snap.log.slice(); project(); render(); } return true; },
    PLAYER_COLORS: FT.PLAYER_COLORS, SAFE_ZONE_SIZE: FT.SAFE_ZONE_SIZE, PEGS_PER_PLAYER: FT.PEGS_PER_PLAYER,
  };

  // Take over the global surface the renderer + HTML buttons use.
  window.FastTrackCore = FastTrackCore;
  window.drawCard = drawCard;
  window.executeMove = executeMove;
  window.passTurn = passTurn;
  window.initGame = initGame;
  // Split flow is inert until the core gains the 7-split lens.
  window.selectSplitPeg = noop;
  window.selectSplitSteps = noop;
  window.cancelSplitChoice = noop;
  window.getSplitChoice = () => ({ pegIdx: null, steps: null });

  // ── HR-6.3: gameplay is click-the-hole only — strip the nav chrome ─────────
  // User directive 2026-06-06: there are no nav buttons; you draw by tapping the
  // deck and move by tapping a gold hole. So the move-hint panel, peg bar, and
  // the redundant Draw button are removed, and the deck is docked compactly so
  // nothing floats over the board. Hiding chrome cannot break the board; the
  // pick-on-board system (highlightMovePaths + raycast → executeMove) is
  // independent of these panels.
  function cleanLayout() {
   try {
    if (!document.createElement || document.getElementById('ft-manifold-clean')) return;
    const css =
      'body.engine-manifold #panel-options,' +
      'body.engine-manifold #move-hints,' +
      'body.engine-manifold #ft-peg-bar,' +
      'body.engine-manifold #draw-btn,' +
      'body.engine-manifold #panel-log { display:none !important; }' +
      'body.engine-manifold #panel-action {' +
      '  width:auto !important; max-width:128px !important; padding:6px 8px !important;' +
      '  background:rgba(8,10,16,.55) !important; }';
    const el = document.createElement('style');
    el.id = 'ft-manifold-clean';
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
    if (document.body) document.body.classList.add('engine-manifold');
    else if (document.addEventListener) document.addEventListener('DOMContentLoaded', () => document.body && document.body.classList.add('engine-manifold'), { once: true });
   } catch (_) { /* layout injection is best-effort; never break the engine */ }
  }
  cleanLayout();

  console.log('🜂 [ft-manifold] adapter active — the 3D board is now driven by the pure manifold core (click-the-hole UI).');
})();
