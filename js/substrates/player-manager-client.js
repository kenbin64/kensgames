/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PLAYER MANAGER CLIENT  —  js/substrates/player-manager-client.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Browser-side proxy for the server PlayerManager.
 *
 * Every `game_action`, `game_state`, or `player_state` broadcast from the
 * server now carries a `_pm_seq` field.  This client automatically sends
 * a `game_action_ack` back so the server knows the turn was received.
 *
 * It also handles all `pm_*` control messages:
 *   pm_game_ready   — all players confirmed; game may begin rendering
 *   pm_resync       — resend last good state; player was out of sync
 *   pm_heal_ok      — connection restored after a resync
 *   pm_cancelled    — game cancelled; shows overlay + redirect
 *   pm_game_disabled — game disabled; shows unavailability notice
 *   pm_game_enabled  — game re-enabled (dismiss any disabled overlay)
 *
 * Usage
 * ─────
 *   const pm = new PlayerManagerClient({
 *     ws        : lobbyWs,          // WebSocket or any object with .send()
 *     sessionId : '…',
 *     userId    : '…',
 *     onResync  : (lastGoodState) => applyState(lastGoodState),
 *     onReady   : (data)          => startRendering(data.players),
 *     onCancel  : (reason)        => showModal(reason),
 *   });
 *
 *   ws.onmessage = ({ data }) => {
 *     const msg = JSON.parse(data);
 *     pm.onMessage(msg);   // ← auto-acks + handles pm_* events
 *     // your existing handler continues below
 *   };
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function (root) {
  'use strict';

  class PlayerManagerClient {
    /**
     * @param {object}   opts
     * @param {object}   opts.ws           WebSocket / lobby-client wrapper
     * @param {string}   opts.sessionId
     * @param {string}   opts.userId
     * @param {Function} [opts.onReady]    called with pm_game_ready payload
     * @param {Function} [opts.onResync]   called with lastGoodState snapshot
     * @param {Function} [opts.onHealOk]   called when resync succeeds
     * @param {Function} [opts.onCancel]   called with reason string — if omitted
     *                                     the built-in overlay is shown
     * @param {Function} [opts.onDisabled] called with { game_id, reason }
     */
    constructor(opts) {
      const o = opts || {};
      this._ws = o.ws || null;
      this._sessionId = o.sessionId || null;
      this._userId = o.userId || null;

      this._onReady = typeof o.onReady === 'function' ? o.onReady : null;
      this._onResync = typeof o.onResync === 'function' ? o.onResync : null;
      this._onHealOk = typeof o.onHealOk === 'function' ? o.onHealOk : null;
      this._onCancel = typeof o.onCancel === 'function' ? o.onCancel : null;
      this._onDisabled = typeof o.onDisabled === 'function' ? o.onDisabled : null;

      this._lastAckedSeq = -1;
      this._ready = false;
      this._gameUuid = null;
      this._reconnectVisible = false;
      this._hadWsOpen = false;

      this._bindWsEvents();
    }

    // ── Core message handler ────────────────────────────────────────────────

    /**
     * Process one incoming WebSocket message object (already JSON-parsed).
     * Call this from your existing ws.onmessage handler.
     * Returns true if the message was fully consumed by the PM (no need to
     * pass it to your game logic).  Returns false if the game should still
     * process it (e.g. the turn broadcast itself).
     *
     * @param {object} data
     * @returns {boolean}
     */
    onMessage(data) {
      if (!data || typeof data.type !== 'string') return false;

      switch (data.type) {

        // Turn broadcasts — auto-ack and let the game handle them too
        case 'game_action':
        case 'game_state':
        case 'player_state':
          if (data._pm_seq !== undefined) {
            this._ackTurn(data._pm_seq, data._pm_session);
          }
          return false; // game logic should still process this

        case 'pm_game_ready':
          this._ready = true;
          this._gameUuid = data.game_uuid || this._gameUuid;
          this._hideReconnectOverlay();
          if (this._onReady) this._onReady(data);
          else this._showBanner('All players connected. Game starting…', 'info', 3000);
          return true;

        case 'pm_resync':
          this._handleResync(data);
          return false; // game should also consume last_good_state

        case 'pm_heal_ok':
          this._hideReconnectOverlay();
          if (this._onHealOk) this._onHealOk(data);
          else this._showBanner('Connection restored. Continuing game.', 'ok', 4000);
          return true;

        case 'pm_cancelled':
          this._handleCancelled(data);
          return true;

        case 'pm_game_disabled':
          this._handleDisabled(data);
          return true;

        case 'pm_game_enabled':
          this._dismissOverlay('pm-disabled-overlay');
          return true;

        default:
          return false;
      }
    }

    // ── Accessors ───────────────────────────────────────────────────────────

    /** True once pm_game_ready has been received. */
    get isReady() { return this._ready; }

    /** Update the WebSocket reference (e.g. after reconnect). */
    setWs(ws) {
      this._ws = ws;
      this._bindWsEvents();
    }

    // ── Private: ack ────────────────────────────────────────────────────────

    _ackTurn(seq, sessionId) {
      if (seq <= this._lastAckedSeq) return; // already acked or older
      this._lastAckedSeq = seq;
      this._sendRaw({
        type: 'game_action_ack',
        session_id: sessionId || this._sessionId,
        seq,
        user_id: this._userId,
        game_uuid: this._gameUuid || null,
      });
    }

    _bindWsEvents() {
      const ws = this._ws;
      if (!ws || ws._pmBoundEvents) return;
      ws._pmBoundEvents = true;
      if (typeof ws.addEventListener === 'function') {
        ws.addEventListener('close', () => {
          if (this._ws !== ws) return;
          if (this._hadWsOpen) {
            this._showReconnectOverlay('Connection lost. Re-establishing session…');
          }
        });
        ws.addEventListener('error', () => {
          if (this._ws !== ws) return;
          if (this._hadWsOpen) {
            this._showReconnectOverlay('Connection unstable. Re-establishing session…');
          }
        });
        ws.addEventListener('open', () => {
          if (this._ws !== ws) return;
          this._hadWsOpen = true;
          this._hideReconnectOverlay();
          this._showBanner('Connection restored. Syncing latest game state…', 'ok', 2200);
        });
      }
      if (typeof root !== 'undefined' && root.addEventListener) {
        root.addEventListener('offline', () => this._showReconnectOverlay('Offline. Reconnecting when network returns…'));
        root.addEventListener('online', () => {
          this._hideReconnectOverlay();
          this._showBanner('Network online. Restoring game…', 'ok', 2500);
        });
      }
    }

    _sendRaw(data) {
      const ws = this._ws;
      if (!ws) return;
      try {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        ws.send(payload);
      } catch (_) { /* connection may have closed */ }
    }

    // ── Private: resync ─────────────────────────────────────────────────────

    _handleResync(data) {
      this._showReconnectOverlay('Resyncing game state…');
      this._showBanner('Resyncing game state…', 'warn', 6000);
      if (this._onResync) {
        this._onResync(data.last_good_state, data);
      }
      if (data._pm_seq !== undefined) {
        this._ackTurn(data._pm_seq, data.session_id || this._sessionId);
      }
    }

    // ── Private: cancel ─────────────────────────────────────────────────────

    _handleCancelled(data) {
      const reason = (data && data.reason) || 'Technical issue';

      if (this._onCancel) {
        this._onCancel(reason, data);
        return;
      }

      PlayerManagerClient._showOverlay('pm-cancel-overlay', 'Game Cancelled', reason, [
        { label: 'Return to Lobby', action: () => { root.location.href = '/'; } },
      ]);
    }

    // ── Private: disabled ───────────────────────────────────────────────────

    _handleDisabled(data) {
      const gameId = (data && data.game_id) || 'this game';
      const reason = (data && data.reason) || 'Temporary technical issue';

      if (this._onDisabled) {
        this._onDisabled({ game_id: gameId, reason }, data);
        return;
      }

      PlayerManagerClient._showOverlay(
        'pm-disabled-overlay',
        `${gameId} Temporarily Unavailable`,
        `${reason}\n\nOur team has been notified. Please try again later.`,
        [{ label: 'Return to Portal', action: () => { root.location.href = '/'; } }],
      );
    }

    // ── Private: UI helpers ─────────────────────────────────────────────────

    _showBanner(message, level, durationMs) {
      if (typeof document === 'undefined') return;
      const id = 'pm-banner';
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.style.cssText = [
          'position:fixed', 'top:0', 'left:50%', 'transform:translateX(-50%)',
          'z-index:99998', 'padding:0.5rem 1.4rem', 'border-radius:0 0 8px 8px',
          'font-family:sans-serif', 'font-size:0.9rem', 'font-weight:600',
          'transition:opacity 0.4s',
        ].join(';');
        document.body.appendChild(el);
      }
      el.textContent = message;
      el.style.background = level === 'ok' ? '#1a7a3a'
        : level === 'warn' ? '#7a5c1a'
          : '#1a3a7a';
      el.style.color = '#e0e0ff';
      el.style.opacity = '1';
      if (el._hideTimer) clearTimeout(el._hideTimer);
      el._hideTimer = setTimeout(() => { el.style.opacity = '0'; }, durationMs || 4000);
    }

    _dismissOverlay(id) {
      if (typeof document === 'undefined') return;
      const el = document.getElementById(id);
      if (el) el.remove();
    }

    _showReconnectOverlay(message) {
      if (typeof document === 'undefined') return;
      this._reconnectVisible = true;
      let el = document.getElementById('pm-reconnect-overlay');
      if (!el) {
        el = document.createElement('div');
        el.id = 'pm-reconnect-overlay';
        el.style.cssText = [
          'position:fixed', 'inset:0', 'z-index:99997',
          'background:rgba(8,10,24,0.75)', 'display:flex',
          'align-items:center', 'justify-content:center', 'pointer-events:none',
        ].join(';');
        el.innerHTML = [
          '<div style="display:flex;flex-direction:column;align-items:center;gap:12px;color:#dbe2ff;">',
          '<div id="pm-spin" style="width:38px;height:38px;border:4px solid rgba(219,226,255,0.22);border-top-color:#8cc4ff;border-radius:50%;animation:pmSpin 0.85s linear infinite;"></div>',
          '<div id="pm-reconnect-text" style="font-family:sans-serif;font-size:clamp(14px,3.7vw,18px);font-weight:600;text-align:center;max-width:84vw;"></div>',
          '</div>'
        ].join('');
        const style = document.createElement('style');
        style.textContent = '@keyframes pmSpin{to{transform:rotate(360deg)}}';
        style.id = 'pm-reconnect-style';
        document.head.appendChild(style);
        document.body.appendChild(el);
      }
      const txt = document.getElementById('pm-reconnect-text');
      if (txt) txt.textContent = message || 'Reconnecting…';
      el.style.display = 'flex';
    }

    _hideReconnectOverlay() {
      if (typeof document === 'undefined') return;
      this._reconnectVisible = false;
      const el = document.getElementById('pm-reconnect-overlay');
      if (el) el.style.display = 'none';
    }

    // ── Static: modal overlay ───────────────────────────────────────────────

    static _showOverlay(id, title, message, buttons) {
      if (typeof document === 'undefined') return;

      const existing = document.getElementById(id);
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = id;
      overlay.style.cssText = [
        'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.85)',
        'display:flex', 'align-items:center', 'justify-content:center',
        'z-index:99999', 'font-family:sans-serif',
      ].join(';');

      const card = document.createElement('div');
      card.style.cssText = [
        'background:#12122a', 'border:1px solid #5555aa',
        'border-radius:14px', 'padding:2rem 2.4rem',
        'max-width:440px', 'width:90%', 'text-align:center',
        'color:#dde0ff', 'box-shadow:0 12px 40px rgba(0,0,0,0.7)',
      ].join(';');

      const h = document.createElement('h2');
      h.style.cssText = 'margin:0 0 1rem;color:#ff7070;font-size:1.3rem;';
      h.textContent = title;

      const p = document.createElement('p');
      p.style.cssText = 'margin:0 0 1.6rem;line-height:1.6;white-space:pre-line;font-size:0.95rem;';
      p.textContent = message;

      card.appendChild(h);
      card.appendChild(p);

      (buttons || []).forEach(btn => {
        const b = document.createElement('button');
        b.textContent = btn.label;
        b.style.cssText = [
          'background:#3a3a8a', 'color:#dde0ff',
          'border:1px solid #5555aa', 'border-radius:7px',
          'padding:0.55rem 1.4rem', 'cursor:pointer',
          'font-size:0.95rem', 'margin:0.3rem',
          'transition:background 0.2s',
        ].join(';');
        b.addEventListener('mouseover', () => { b.style.background = '#5555aa'; });
        b.addEventListener('mouseout', () => { b.style.background = '#3a3a8a'; });
        b.addEventListener('click', btn.action);
        card.appendChild(b);
      });

      overlay.appendChild(card);
      document.body.appendChild(overlay);
    }
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlayerManagerClient;
  } else {
    root.PlayerManagerClient = PlayerManagerClient;
  }

}(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)));
