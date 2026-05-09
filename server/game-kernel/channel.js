'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 GAME KERNEL — PlayerChannel adapters
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Transport-agnostic player I/O. The GameMaster only sees PlayerChannel; it
 * never imports `ws`, Colyseus, or any in-process queue.
 *
 * Contract:
 *   {
 *     id: string,                                  // playerId
 *     send(message: object): void,                 // server → player
 *     onMessage(handler: (msg: object) => void),   // player → server
 *     onClose(handler: () => void),
 *     close(): void,
 *   }
 *
 * Three adapters:
 *   - wsChannel(playerId, ws)    : wraps a `ws` (or compatible) WebSocket
 *   - localChannel(playerId)     : in-process duplex (for AI players, tests)
 *   - nullChannel(playerId)      : drops sends, never emits (slot reserved)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

function wsChannel(playerId, ws) {
  if (!ws || typeof ws.send !== 'function') {
    throw new TypeError('wsChannel: ws must expose .send()');
  }
  const messageHandlers = [];
  const closeHandlers = [];

  const onRaw = (raw) => {
    let msg;
    try { msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8')); }
    catch { return; }
    for (const h of messageHandlers) {
      try { h(msg); } catch (_) { /* isolate handler failures */ }
    }
  };
  const onClose = () => {
    for (const h of closeHandlers) {
      try { h(); } catch (_) { }
    }
  };

  // `ws` lib uses .on; browsers use addEventListener. Support both.
  if (typeof ws.on === 'function') {
    ws.on('message', onRaw);
    ws.on('close', onClose);
  } else if (typeof ws.addEventListener === 'function') {
    ws.addEventListener('message', (ev) => onRaw(ev.data));
    ws.addEventListener('close', onClose);
  }

  return {
    id: String(playerId),
    send(msg) {
      try { ws.send(JSON.stringify(msg)); } catch (_) { /* socket gone */ }
    },
    onMessage(h) { if (typeof h === 'function') messageHandlers.push(h); },
    onClose(h) { if (typeof h === 'function') closeHandlers.push(h); },
    close() { try { ws.close(); } catch (_) { } },
  };
}

function localChannel(playerId) {
  const messageHandlers = [];
  const closeHandlers = [];
  const outbox = [];     // messages sent server→player (the AI reads these)
  const outboxListeners = [];

  let closed = false;

  return {
    id: String(playerId),

    // Server → player
    send(msg) {
      if (closed) return;
      outbox.push(msg);
      for (const l of outboxListeners) {
        try { l(msg); } catch (_) { }
      }
    },
    onMessage(h) { if (typeof h === 'function') messageHandlers.push(h); },
    onClose(h) { if (typeof h === 'function') closeHandlers.push(h); },
    close() {
      if (closed) return;
      closed = true;
      for (const h of closeHandlers) { try { h(); } catch (_) { } }
    },

    // Local-only extensions for the AI / test side:
    _inject(msg) {
      if (closed) return;
      for (const h of messageHandlers) {
        try { h(msg); } catch (_) { }
      }
    },
    _onOutbound(listener) {
      if (typeof listener === 'function') outboxListeners.push(listener);
    },
    _drainOutbox() { return outbox.splice(0, outbox.length); },
    _isClosed() { return closed; },
  };
}

function nullChannel(playerId) {
  return {
    id: String(playerId),
    send() { },
    onMessage() { },
    onClose() { },
    close() { },
  };
}

module.exports = { wsChannel, localChannel, nullChannel };
