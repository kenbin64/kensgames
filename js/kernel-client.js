/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KENSGAMES KERNEL CLIENT ADAPTER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Thin wrapper over an existing KGMultiplayer (a.k.a. window.MultiplayerClient
 * or window.kgmp) that speaks the server's GameKernel protocol:
 *
 *   send →  { type: 'game_action', kernel: { type, payload } }
 *   recv ←  { type: 'kernel_state', payload: { type, ... } }
 *
 * Why a separate module?
 *   - Keeps `multiplayer-client.js` agnostic of any game's rules.
 *   - Centralises the settle-handshake pattern (drop → animate → settle_complete)
 *     so every turn-based game uses the same client surface.
 *   - Provides clean fallback to legacy peer-to-peer when no `kernel_state`
 *     is received within a probe window — games can opt-in incrementally
 *     without breaking sessions that aren't kernel-managed.
 *
 * Manifold alignment:
 *   x = local actor identity   (myUserId, mySlot)
 *   y = action sent            (kernel envelope payload)
 *   z = state observed         (kernel_state derived; never stored authoritatively)
 *   m = the kernel itself      (queried by `state` / `turn` events)
 *
 * Usage:
 *   const k = new KGKernelClient({
 *     client: window.kgmp,           // or window.MultiplayerClient
 *     mySlot: 1,                     // 1-based seat from lobby
 *     myUserId: 'u_abc',             // string id used by the kernel
 *   });
 *   k.on('turn',     ({ activePlayerId, settled }) => { ... });
 *   k.on('state',    ({ state }) => { ... });
 *   k.on('error',    ({ error, action }) => { ... });
 *   k.on('gameOver', ({ winner }) => { ... });
 *   k.on('active',   () => { /* first kernel_state arrived → kernel mode confirmed *\/ });
 *   k.on('legacy',   () => { /* probe window expired → legacy peer-to-peer fallback *\/ });
 *   k.send('drop', { col: 2, layer: 0 });
 *   k.send('settle_complete');
 *   k.canActLocally();          // true iff the kernel says it's my turn (or before any kernel_state arrives, defers to legacy)
 *
 * Loaded as: <script src="/js/kernel-client.js" defer></script>
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  function KGKernelClient(opts) {
    if (!(this instanceof KGKernelClient)) return new KGKernelClient(opts);
    opts = opts || {};
    this.client = opts.client || (typeof window !== 'undefined' && (window.kgmp || window.MultiplayerClient)) || null;
    this.mySlot = (opts.mySlot != null) ? Number(opts.mySlot) : 0;
    this.myUserId = opts.myUserId != null ? String(opts.myUserId) : null;

    this._listeners = Object.create(null);
    this._lastTurn = null;          // last { activePlayerId, settled } seen
    this._lastState = null;         // last full state snapshot
    this._kernelActive = false;     // true once we've seen any kernel_state
    this._gameOver = false;
    this._winner = null;
    this._probeMs = (opts.probeMs != null) ? +opts.probeMs : 1500;
    this._probeTimer = null;
    this._destroyed = false;

    this._onKernelState = (inner) => this._handleKernelState(inner);

    if (this.client && typeof this.client.on === 'function') {
      this.client.on('kernel_state', this._onKernelState);
      this._armProbe();
    } else {
      // No client → fire 'legacy' on next tick so callers don't deadlock.
      setTimeout(() => { if (!this._destroyed) this._emit('legacy', {}); }, 0);
    }
  }

  KGKernelClient.prototype = {
    on(event, fn) {
      if (typeof fn !== 'function') return this;
      (this._listeners[event] = this._listeners[event] || []).push(fn);
      return this;
    },
    off(event, fn) {
      const arr = this._listeners[event];
      if (!arr) return this;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
      return this;
    },
    _emit(event, data) {
      const arr = this._listeners[event];
      if (!arr) return;
      for (const fn of arr.slice()) {
        try { fn(data); } catch (e) { console.warn('[KGKernelClient] listener', event, 'threw:', e); }
      }
    },

    _armProbe() {
      if (this._probeTimer) clearTimeout(this._probeTimer);
      this._probeTimer = setTimeout(() => {
        this._probeTimer = null;
        if (this._destroyed) return;
        if (!this._kernelActive) this._emit('legacy', {});
      }, this._probeMs);
    },

    _handleKernelState(inner) {
      if (!inner || typeof inner !== 'object') return;
      const wasActive = this._kernelActive;
      this._kernelActive = true;
      if (!wasActive) {
        if (this._probeTimer) { clearTimeout(this._probeTimer); this._probeTimer = null; }
        this._emit('active', { first: inner });
      }

      switch (inner.type) {
        case 'state':
          this._lastState = inner.state || null;
          // Many rule sets ship `unsettled` / `turnIdx` inside state — derive a
          // turn snapshot for callers that subscribe only to 'turn'.
          if (this._lastState && Array.isArray(this._lastState.order)
            && Number.isInteger(this._lastState.turnIdx)) {
            this._lastTurn = {
              activePlayerId: this._lastState.order[this._lastState.turnIdx],
              settled: this._lastState.unsettled === false,
            };
          }
          this._emit('state', { state: this._lastState });
          break;

        case 'turn':
          this._lastTurn = {
            activePlayerId: inner.activePlayerId,
            settled: inner.settled !== false,
          };
          this._emit('turn', this._lastTurn);
          break;

        case 'tick':
          // Real-time games: forward as-is for the game loop to apply.
          this._emit('tick', inner);
          break;

        case 'game_over':
          this._gameOver = true;
          this._winner = inner.winner != null ? inner.winner : null;
          this._emit('gameOver', { winner: this._winner, raw: inner });
          break;

        case 'error':
          this._emit('error', { error: inner.error, action: inner.action || null, raw: inner });
          break;

        default:
          this._emit('message', inner);
      }
      // Always fan out raw envelope last, so listeners that want everything see it
      // *after* the typed event.
      this._emit('any', inner);
    },

    /** Did we ever receive a kernel_state envelope? */
    isKernelActive() { return this._kernelActive; },

    /** True while the kernel says it's the local actor's turn. */
    canActLocally() {
      if (this._gameOver) return false;
      if (!this._kernelActive) return null;            // kernel mode not yet confirmed
      if (!this._lastTurn) return false;
      const me = this._myKernelId();
      if (!me) return false;
      // Block sending while a settle handshake is in flight (server expects only
      // the active player to send `settle_complete`, and only once per drop).
      if (this._lastTurn.activePlayerId !== me) return false;
      return true;
    },

    /** Last kernel-reported active player id (string), or null. */
    activePlayerId() { return this._lastTurn ? this._lastTurn.activePlayerId : null; },

    /** Last full state snapshot or null. */
    snapshot() { return this._lastState; },

    /** Resolve our kernel-side player id. Prefer myUserId; fall back to mySlot lookup. */
    _myKernelId() {
      if (this.myUserId) return String(this.myUserId);
      if (this._lastState && Array.isArray(this._lastState.order) && this.mySlot >= 1) {
        const id = this._lastState.order[this.mySlot - 1];
        return id != null ? String(id) : null;
      }
      return null;
    },

    /**
     * Send a kernel action. Returns true if dispatched, false otherwise.
     * Falls back to MultiplayerClient.sendKernelAction (which uses the explicit
     * `kernel:` envelope so the server's KernelRouter intercepts it).
     */
    send(type, payload) {
      if (this._destroyed || this._gameOver) return false;
      if (!this.client) return false;
      if (typeof this.client.sendKernelAction === 'function') {
        this.client.sendKernelAction(type, payload || {});
        return true;
      }
      // Older client builds: emit the envelope directly via the raw socket
      // helper if exposed; otherwise no-op.
      if (typeof this.client._send === 'function') {
        this.client._send({
          type: 'game_action',
          kernel: { type, payload: payload || {} },
        });
        return true;
      }
      return false;
    },

    /**
     * Confirm a settle handshake (animation finished, ball at rest, etc.).
     * Convenience over send('settle_complete').
     */
    settle() { return this.send('settle_complete'); },

    destroy() {
      this._destroyed = true;
      if (this._probeTimer) { clearTimeout(this._probeTimer); this._probeTimer = null; }
      if (this.client && typeof this.client.off === 'function' && this._onKernelState) {
        try { this.client.off('kernel_state', this._onKernelState); } catch (_) { }
      }
      this._listeners = Object.create(null);
      this._lastTurn = null;
      this._lastState = null;
    },
  };

  if (typeof window !== 'undefined') {
    window.KGKernelClient = KGKernelClient;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = KGKernelClient;
  }
})();
