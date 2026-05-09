/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STARFIGHTER ⇄ GameKernel — kernel adapter (slice 4 of the rollout)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * In hybrid mode the client owns physics and renders authoritatively from its
 * local sim; the server-side GameKernel runs alongside as an audit ledger that
 * validates inputs, advances its own 30 Hz sim, and broadcasts unified state
 * for any consumer that wants the canonical view.
 *
 * This adapter:
 *   1. Waits for SFMultiplayer to surface its underlying KGMultiplayer client.
 *   2. Constructs a KGKernelClient over it.
 *   3. On every local SFMultiplayer.sendPlayerState(...) call, emits a
 *      throttled `input` envelope to the kernel ({thrust, turn, fire}).
 *
 * Activation is automatic and fully back-compat: if the kernel router is not
 * registered for starfighter on the server, the legacy peer relay continues
 * to drive remote player rendering and the kernel calls become no-ops.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (typeof window.KGKernelClient !== 'function') return;

  let _kernel = null;
  let _kernelReady = false;
  let _wrapped = false;
  let _lastSent = 0;
  const SEND_INTERVAL_MS = 100;  // 10 Hz audit feed (kernel sim runs at 30 Hz)

  function attach() {
    if (_wrapped) return;
    const MP = window.SFMultiplayer;
    if (!MP) return;
    // SFMultiplayer keeps its KGMultiplayer instance private; the public
    // surface exposes playerId, but we need the raw client for kernel wiring.
    // Reach in via a documented accessor, falling back to scanning closures.
    const rawClient = MP._mp || MP.__rawClient || (MP.getRawClient && MP.getRawClient()) || null;
    if (!rawClient) return;
    _kernel = new window.KGKernelClient({
      client: rawClient,
      myUserId: rawClient.userId != null ? String(rawClient.userId) : null,
    });
    _kernel.on('active', () => { _kernelReady = true; });
    _kernel.on('legacy', () => { _kernelReady = false; });
    _kernel.on('error', (e) => console.warn('[sf-kernel] rejected', e));

    // Wrap sendPlayerState — every per-frame state push also fans an input
    // envelope to the kernel for server-side audit & sim.
    const orig = MP.sendPlayerState;
    if (typeof orig !== 'function') return;
    MP.sendPlayerState = function (player) {
      try { orig.call(MP, player); } catch (e) { /* let original handle */ }
      if (!_kernelReady || !_kernel || !player) return;
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (now - _lastSent < SEND_INTERVAL_MS) return;
      _lastSent = now;
      const thrust = clamp(num(player.throttle), -1, 1);
      // Turn = signed yaw rate proxy. Prefer explicit yawRate; else 0.
      const turn = clamp(num(player.yawRate || player.turn || 0), -1, 1);
      const fire = !!(player.firing || player.firingPrimary);
      try { _kernel.send('input', { thrust, turn, fire }); }
      catch (err) { console.warn('[sf-kernel] send failed', err); }
    };
    _wrapped = true;
  }

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // SFMultiplayer is created lazily; poll until it appears + connects.
  const t = setInterval(() => {
    try { attach(); } catch (e) { /* keep polling */ }
    if (_wrapped) clearInterval(t);
  }, 250);

  // Stop polling after 30 s — multiplayer never connected this session.
  setTimeout(() => { try { clearInterval(t); } catch (_) { } }, 30000);
}());
