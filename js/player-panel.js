/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 PlayerPanel — unified header roster for every game
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Drop-in component: include once per game page; it injects a fixed-position
 * header showing every seated player with avatar, name, score/lives if known,
 * connection state, and an "active turn" highlight for turn-based games.
 *
 * Honors HARD_RULES HR-6.2 (control rail) — the panel is fixed at the top
 * of the viewport, outside the game / 3D layer.
 *
 * Inputs (auto-discovered):
 *   - window.MultiplayerClient (or window.kgmp) emitting:
 *       'game_object'   — roster + ready states (lobby + in-game)
 *       'kernel_state'  — server-authoritative game state (kernel-managed)
 *       'turn'          — { activePlayerId, settled }
 *   - Plain DOM events on document for non-MP games:
 *       'kg:roster'     detail = { players: [...] }
 *       'kg:turn'       detail = { activePlayerId, settled }
 *       'kg:state'      detail = { state }       (same shape as kernel_state.state)
 *
 * Manual API (for any game that wants to drive it directly):
 *   PlayerPanel.mount(opts?)                 → returns { update, setTurn, setState }
 *   PlayerPanel.update(roster)               → roster: [{id|user_id, name|username, avatar|avatar_id, isAI?, isHost?, ready?, isConnected?}]
 *   PlayerPanel.setTurn(activeId, settled?)
 *   PlayerPanel.setState(state)              → reads .seats / .ships / .paddles / .pegsHome
 *
 * Usage:
 *   <script src="/js/player-panel.js" defer></script>
 *   PlayerPanel.mount({ gameId: 'fasttrack' });
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  const PANEL_ID = 'kg-player-panel';
  const STYLE_ID = 'kg-player-panel-styles';

  const STYLES = `
#${PANEL_ID} {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 9000;
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(8, 10, 18, 0.78);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(120, 160, 220, 0.25);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  color: #e8eef8;
  pointer-events: none;            /* HR-6.2: panel itself is non-interactive */
  user-select: none;
}
#${PANEL_ID} .kg-pp-seat {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(20, 26, 40, 0.55);
  border: 1px solid rgba(120, 160, 220, 0.18);
  min-width: 120px;
  max-width: 220px;
  transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
}
#${PANEL_ID} .kg-pp-seat.is-active {
  border-color: #ffd166;
  background: rgba(80, 64, 16, 0.55);
  box-shadow: 0 0 0 1px rgba(255, 209, 102, 0.4), 0 0 18px rgba(255, 209, 102, 0.18);
}
#${PANEL_ID} .kg-pp-seat.is-disconnected { opacity: 0.45; }
#${PANEL_ID} .kg-pp-seat.is-eliminated { opacity: 0.4; filter: grayscale(0.9); }
#${PANEL_ID} .kg-pp-avatar {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 50%;
  flex: 0 0 auto;
}
#${PANEL_ID} .kg-pp-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
  min-width: 0;
}
#${PANEL_ID} .kg-pp-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#${PANEL_ID} .kg-pp-stat {
  font-size: 11px;
  opacity: 0.8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#${PANEL_ID} .kg-pp-badges {
  display: flex; gap: 4px; margin-left: auto;
  font-size: 10px;
}
#${PANEL_ID} .kg-pp-badge {
  padding: 2px 5px;
  border-radius: 6px;
  background: rgba(120, 160, 220, 0.2);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
#${PANEL_ID} .kg-pp-badge.ai     { background: rgba(180, 100, 220, 0.3); }
#${PANEL_ID} .kg-pp-badge.host   { background: rgba(80, 200, 140, 0.3); }
#${PANEL_ID} .kg-pp-badge.ready  { background: rgba(80, 180, 220, 0.3); }
#${PANEL_ID} .kg-pp-badge.wait   { background: rgba(220, 120, 80, 0.3); }
#${PANEL_ID} .kg-pp-turn-indicator {
  position: absolute;
  top: 100%; left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  padding: 2px 6px;
  background: #ffd166;
  color: #221a00;
  border-radius: 0 0 6px 6px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
#${PANEL_ID} .kg-pp-seat { position: relative; }
@media (max-width: 600px) {
  #${PANEL_ID} { padding: 4px 6px; gap: 4px; }
  #${PANEL_ID} .kg-pp-seat { min-width: 80px; padding: 4px 6px; }
  #${PANEL_ID} .kg-pp-name { font-size: 11px; }
  #${PANEL_ID} .kg-pp-stat { font-size: 10px; }
  #${PANEL_ID} .kg-pp-badge { display: none; }
}
`;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  function normalizeRoster(input) {
    if (!Array.isArray(input)) return [];
    return input.map((p, i) => {
      if (!p || typeof p !== 'object') return null;
      return {
        id: String(p.id || p.user_id || p.userId || ''),
        name: String(p.name || p.username || `Player ${i + 1}`),
        avatar: String(p.avatar || p.avatar_id || p.avatarId || '👤'),
        isAI: !!(p.isAI || p.is_ai),
        isHost: !!(p.isHost || p.is_host),
        ready: !!p.ready,
        isConnected: p.isConnected !== false && p.is_connected !== false,
        slot: typeof p.slot === 'number' ? p.slot : i,
      };
    }).filter(Boolean);
  }

  // Pull score / lives / hp / etc. for a player from a kernel state object.
  // Recognizes the shapes used by the games we ship.
  function extractStatsForId(state, id) {
    if (!state || typeof state !== 'object') return null;
    if (state.seats && state.seats[id]) {
      const s = state.seats[id];
      const parts = [];
      if (typeof s.score === 'number') parts.push(`★ ${s.score}`);
      if (typeof s.lives === 'number') parts.push(`♥ ${s.lives}`);
      return { stat: parts.join('  '), eliminated: s.lives === 0 };
    }
    if (state.ships && state.ships[id]) {
      const s = state.ships[id];
      const stat = `K ${s.kills || 0}/D ${s.deaths || 0}` + (s.alive ? '' : '  ✦');
      return { stat, eliminated: !s.alive };
    }
    if (state.paddles && state.paddles[id]) {
      const s = state.paddles[id];
      return {
        stat: `★ ${s.score || 0}  ♥ ${s.lives || 0}`,
        eliminated: !s.alive,
      };
    }
    if (state.pegsHome && typeof state.pegsHome[id] === 'number') {
      return { stat: `🏠 ${state.pegsHome[id]}/5`, eliminated: false };
    }
    return null;
  }

  // ── Component instance ─────────────────────────────────────────────────────
  let _root = null;
  let _roster = [];
  let _activeId = null;
  let _settled = true;
  let _state = null;

  function ensureRoot() {
    ensureStyles();
    if (_root && document.body.contains(_root)) return _root;
    _root = document.getElementById(PANEL_ID) || document.createElement('div');
    _root.id = PANEL_ID;
    if (!document.body.contains(_root)) document.body.appendChild(_root);
    return _root;
  }

  function render() {
    if (!_root) return;
    if (_roster.length === 0) {
      _root.innerHTML = '';
      _root.style.display = 'none';
      return;
    }
    _root.style.display = '';
    const html = _roster.map((p) => {
      const stats = extractStatsForId(_state, p.id);
      const isActive = _activeId && p.id === _activeId;
      const cls = [
        'kg-pp-seat',
        isActive ? 'is-active' : '',
        !p.isConnected ? 'is-disconnected' : '',
        stats && stats.eliminated ? 'is-eliminated' : '',
      ].filter(Boolean).join(' ');
      const badges = [];
      if (p.isHost) badges.push(`<span class="kg-pp-badge host">HOST</span>`);
      if (p.isAI) badges.push(`<span class="kg-pp-badge ai">AI</span>`);
      if (p.ready) badges.push(`<span class="kg-pp-badge ready">READY</span>`);
      else if (!p.isAI) badges.push(`<span class="kg-pp-badge wait">WAIT</span>`);
      const indicator = isActive
        ? `<div class="kg-pp-turn-indicator">${_settled ? 'YOUR TURN' : 'RESOLVING…'}</div>`
        : '';
      const stat = stats ? stats.stat : '';
      return `
        <div class="${cls}" data-pid="${escapeHtml(p.id)}">
          <div class="kg-pp-avatar">${escapeHtml(p.avatar)}</div>
          <div class="kg-pp-meta">
            <span class="kg-pp-name">${escapeHtml(p.name)}</span>
            ${stat ? `<span class="kg-pp-stat">${escapeHtml(stat)}</span>` : ''}
          </div>
          <div class="kg-pp-badges">${badges.join('')}</div>
          ${indicator}
        </div>
      `;
    }).join('');
    _root.innerHTML = html;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  const api = {
    mount(opts) {
      ensureRoot();
      this._wireSources(opts || {});
      render();
      return this;
    },
    update(roster) {
      _roster = normalizeRoster(roster);
      render();
      return this;
    },
    setTurn(activeId, settled) {
      _activeId = activeId == null ? null : String(activeId);
      if (typeof settled === 'boolean') _settled = settled;
      render();
      return this;
    },
    setState(state) {
      _state = state || null;
      render();
      return this;
    },
    destroy() {
      if (_root && _root.parentNode) _root.parentNode.removeChild(_root);
      _root = null;
    },

    _wireSources(/* opts */) {
      // 1) MultiplayerClient (window.MultiplayerClient or window.kgmp)
      const mp = global.MultiplayerClient || global.kgmp;
      if (mp && typeof mp.on === 'function') {
        mp.on('game_object', (obj) => {
          if (obj && Array.isArray(obj.players)) this.update(obj.players);
        });
        // Kernel-managed games send a single 'kernel_state' envelope whose
        // .type identifies the inner payload (state | turn | game_over).
        mp.on('kernel_state', (msg) => {
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'state' && msg.state) this.setState(msg.state);
          else if (msg.type === 'turn') this.setTurn(msg.activePlayerId, msg.settled);
        });
      }
      // 2) DOM CustomEvent fallback (works for non-MP single-player flows too)
      document.addEventListener('kg:roster', (ev) => {
        const d = ev.detail || {};
        if (Array.isArray(d.players)) this.update(d.players);
      });
      document.addEventListener('kg:turn', (ev) => {
        const d = ev.detail || {};
        this.setTurn(d.activePlayerId, d.settled);
      });
      document.addEventListener('kg:state', (ev) => {
        const d = ev.detail || {};
        if (d.state) this.setState(d.state);
      });
    },
  };

  global.PlayerPanel = api;

  // Auto-mount when DOM is ready (idempotent — explicit mount() also works)
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => api.mount(), { once: true });
    } else {
      api.mount();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
