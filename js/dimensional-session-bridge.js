/**
 * X-Dimensional Session Bridge
 * Converts the new x-dimensional session format to legacy game formats
 *
 * Session Structure (x-dimensional):
 * {
 *   _x: session-id (identity seed)
 *   _schema: '1.0-dimensional'
 *   game: { _x: gameId, name, x, y, z, players: {...}, board: {...} }
 *   players: { _x, count, mode, difficulty }
 *   modifiers: { inviteCode, startedAt, channel }
 * }
 *
 * Games expect:
 * {
 *   playerCount: number
 *   humanName: string
 *   humanAvatar: emoji
 *   aiDifficulty: 'easy' | 'medium' | 'hard'
 *   mode: 'solo' | 'multiplayer' | 'ranked'
 *   inviteCode: string (for multiplayer/ranked)
 * }
 */

(function initDimensionalBridge() {
  window.DIMENSIONAL_SESSION = window.DIMENSIONAL_SESSION || {};

  // Global viewport policy:
  // - Desktop (non-landing): no page scrolling, fit content into a single viewport.
  // - Smartphone/tablet touch: allow vertical scroll for stacked layouts.
  // - Wizard helper: only one step visible at a time when data-wizard-step attrs are used.
  function installViewportPolicy() {
    if (window.KGViewportPolicy) return window.KGViewportPolicy;

    const isLanding = () => /\/landing\.html$/i.test((typeof location !== 'undefined' ? location.pathname : '') || '');
    const isMobileLike = () => (
      (typeof window.matchMedia === 'function' && window.matchMedia('(hover: none) and (pointer: coarse)').matches)
      || /Android|iPhone|iPad|iPod|Mobile/i.test((typeof navigator !== 'undefined' ? navigator.userAgent : '') || '')
      || Math.min(window.innerWidth || 0, window.innerHeight || 0) < 700
    );

    const policy = {
      apply() {
        if (isLanding()) return;

        const html = document.documentElement;
        const body = document.body;
        if (!html || !body) return;

        const mobile = isMobileLike();
        html.style.height = '100dvh';
        body.style.height = '100dvh';
        html.style.maxHeight = '100dvh';
        body.style.maxHeight = '100dvh';

        if (mobile) {
          html.style.overflowX = 'hidden';
          html.style.overflowY = 'auto';
          body.style.overflowX = 'hidden';
          body.style.overflowY = 'auto';
          html.style.zoom = '';
          body.style.zoom = '';
          return;
        }

        // Desktop: hard no-scroll policy.
        html.style.overflow = 'hidden';
        body.style.overflow = 'hidden';

        // If content still exceeds viewport, uniformly scale page down to fit.
        // Uses CSS zoom (Chromium/Electron); safe no-op elsewhere.
        html.style.zoom = '';
        body.style.zoom = '';
        const vw = Math.max(1, window.innerWidth || 1);
        const vh = Math.max(1, window.innerHeight || 1);
        const sw = Math.max(body.scrollWidth || 1, html.scrollWidth || 1);
        const sh = Math.max(body.scrollHeight || 1, html.scrollHeight || 1);
        const scale = Math.min(1, vw / sw, vh / sh);
        if (scale < 0.999) {
          const z = Math.max(0.72, scale);
          html.style.zoom = String(z);
        }
      },

      applyWizardSingleStep(host) {
        if (!host) return;
        const steps = Array.from(host.querySelectorAll('[data-wizard-step]'));
        if (!steps.length) return;
        let active = steps.findIndex((el) => el.hasAttribute('data-active') || el.classList.contains('active'));
        if (active < 0) active = 0;
        for (let i = 0; i < steps.length; i++) {
          steps[i].style.display = i === active ? '' : 'none';
        }
      },
    };

    window.KGViewportPolicy = policy;
    return policy;
  }

  function applyViewportPolicyNow() {
    const policy = installViewportPolicy();
    policy.apply();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyViewportPolicyNow, { once: true });
  } else {
    applyViewportPolicyNow();
  }
  window.addEventListener('resize', () => {
    if (window.KGViewportPolicy && typeof window.KGViewportPolicy.apply === 'function') {
      window.KGViewportPolicy.apply();
    }
  });

  function toManifoldY(session) {
    const game = session && session.game ? session.game : {};
    const players = game.players || {};
    const modifiers = session && session.modifiers ? session.modifiers : {};
    const y = [];

    y.push({ id: 'mode', value: players.mode === 'multiplayer' ? 1.2 : (players.mode === 'ranked' ? 1.35 : 1) });
    y.push({ id: 'difficulty', value: players.difficulty === 'hard' ? 1.25 : (players.difficulty === 'easy' ? 0.85 : 1) });
    y.push({ id: 'playerCount', value: Math.max(1, Number(players.count || game.x || 1)) });

    if (modifiers.inviteCode) y.push({ id: 'inviteCode', value: 1.1 });
    if (modifiers.channel) y.push({ id: 'channel', value: 1.05 });

    return y;
  }

  function composeSessionWhole(session) {
    const xRef = session && session._x ? session._x : `session_${Date.now()}`;
    const attrs = {
      game: session && session.game ? session.game : {},
      modifiers: session && session.modifiers ? session.modifiers : {},
    };
    const y = toManifoldY(session);

    if (window.ManifoldBridge && typeof window.ManifoldBridge.composeEntity === 'function') {
      return window.ManifoldBridge.composeEntity({
        type: 'session',
        xRef,
        xScalar: 1,
        y,
        attrs,
      });
    }

    const z = y.reduce((acc, item) => acc * Number(item.value || 1), 1);
    return {
      type: 'session',
      x: { ref: xRef, scalar: 1 },
      y,
      z,
      attrs,
      whole: { id: xRef, type: 'session', z },
      axiom: 'z=xy',
      schema: '1.1-dimensional',
      createdAt: Date.now(),
    };
  }

  /**
   * Extract x-dimensional session from window.KENSGAMES_SESSION
   * Returns normalized game config or null if not present
   */
  window.DIMENSIONAL_SESSION.extract = function () {
    const session = window.KENSGAMES_SESSION;
    if (!session || !session._schema || !session.game) {
      return null;
    }

    const whole = composeSessionWhole(session);
    const solvedZ = Number(whole && whole.z) || Number(session.game.z) || 1;

    return {
      sessionX: session._x,
      gameId: session.game._x,
      gameName: session.game.name,
      gameDimensions: {
        x: session.game.x,     // player count
        y: session.game.y,     // duration
        z: solvedZ             // workload solved from manifold modifiers
      },
      players: {
        count: session.game.players?.count || 1,
        mode: session.game.players?.mode || 'solo',
        difficulty: session.game.players?.difficulty || 'medium'
      },
      board: {
        holes: session.game.board?.holes,
        pegs: session.game.board?.pegs
      },
      modifiers: session.modifiers || {},
      dimensionalWhole: whole
    };
  };

  /**
   * Convert x-dimensional session to game init config
   */
  window.DIMENSIONAL_SESSION.toGameConfig = function () {
    const extracted = this.extract();
    if (!extracted) return null;

    const { players, modifiers } = extracted;
    const humanName = modifiers.inviteCode ? `Player-${modifiers.inviteCode.slice(0, 4)}` : 'You';
    const humanAvatar = players.mode === 'ranked' ? '🎯' : (players.mode === 'multiplayer' ? '👥' : '🤖');

    return {
      playerCount: players.count,
      humanName,
      humanAvatar,
      aiDifficulty: players.difficulty, // 'easy' | 'medium' | 'hard'
      mode: players.mode,                 // 'solo' | 'multiplayer' | 'ranked'
      inviteCode: modifiers.inviteCode,
      sessionX: extracted.sessionX,
      gameBoard: extracted.board,
      dimensionalWhole: extracted.dimensionalWhole
    };
  };

  /**
   * Store x-dimensional session in sessionStorage for access across pages
   */
  window.DIMENSIONAL_SESSION.persist = function () {
    const session = window.KENSGAMES_SESSION;
    if (session) {
      sessionStorage.setItem('kg_session_dimensional', JSON.stringify(session));
      sessionStorage.setItem('kg_session_dimensional_whole', JSON.stringify(composeSessionWhole(session)));
    }
  };

  /**
   * Retrieve stored x-dimensional session from sessionStorage
   */
  window.DIMENSIONAL_SESSION.retrieve = function () {
    const stored = sessionStorage.getItem('kg_session_dimensional');
    if (stored) {
      try {
        window.KENSGAMES_SESSION = JSON.parse(stored);
        return window.KENSGAMES_SESSION;
      } catch (e) {
        console.warn('Failed to restore dimensional session:', e);
      }
    }
    return null;
  };

  /**
   * Initialize game with x-dimensional session
   * Handles both new (dimensional) and legacy (query param) flows
   */
  window.DIMENSIONAL_SESSION.initializeGame = function (initFn) {
    // Try x-dimensional session first
    let config = this.toGameConfig();

    if (config) {
      // Have x-dimensional session from landing page
      this.persist(); // Save for later access
      console.log('[DIMENSIONAL] Initializing with x-dimensional session:', config);
      return initFn(config);
    }

    // Fallback: try sessionStorage
    if (this.retrieve()) {
      config = this.toGameConfig();
      if (config) {
        console.log('[DIMENSIONAL] Initializing with stored session:', config);
        return initFn(config);
      }
    }

    // Legacy fallback: use query params (existing flow)
    console.log('[DIMENSIONAL] No x-dimensional session; using legacy flow');
    return null;
  };

  console.log('[DIMENSIONAL] Session bridge ready');
})();
