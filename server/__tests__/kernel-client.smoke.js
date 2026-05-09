'use strict';

/**
 * Unit smoke for js/kernel-client.js — verifies the adapter's contract using
 * a stub client (no real websocket needed).
 *
 * Contracts under test:
 *   1. kernel_state envelope routing (state / turn / tick / game_over / error)
 *   2. canActLocally() gate (kernel inactive → null; mismatched id → false)
 *   3. send() uses client.sendKernelAction with explicit kernel envelope
 *   4. settle() === send('settle_complete')
 *   5. probe timer fires 'legacy' when no kernel_state arrives in window
 *   6. derived turn snapshot from a 'state' envelope (no separate 'turn' needed)
 */

const path = require('path');
const KGKernelClient = require(path.join(__dirname, '..', '..', 'js', 'kernel-client.js'));

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { console.log('  PASS', label); pass++; }
  else { console.error('  FAIL', label, extra != null ? extra : ''); fail++; }
}

function makeStubClient() {
  const sent = [];
  const handlers = Object.create(null);
  return {
    sent,
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
    off(ev, fn) {
      const a = handlers[ev]; if (!a) return;
      const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
    },
    emit(ev, payload) {
      const a = handlers[ev]; if (!a) return;
      for (const fn of a.slice()) fn(payload);
    },
    sendKernelAction(type, payload) { sent.push({ type, payload }); },
  };
}

(async () => {
  // ── 1. Envelope routing ──────────────────────────────────────────────────
  {
    const c = makeStubClient();
    const k = new KGKernelClient({ client: c, mySlot: 1, myUserId: 'me', probeMs: 9999 });

    const events = [];
    k.on('any', (e) => events.push({ type: e.type, raw: 'any' }));
    k.on('state', (e) => events.push({ type: 'state', state: e.state }));
    k.on('turn', (t) => events.push({ type: 'turn', t }));
    k.on('tick', (t) => events.push({ type: 'tick', t }));
    k.on('gameOver', (e) => events.push({ type: 'gameOver', winner: e.winner }));
    k.on('error', (e) => events.push({ type: 'error', err: e.error }));
    k.on('active', () => events.push({ type: 'active' }));

    c.emit('kernel_state', { type: 'state', state: { order: ['me', 'you'], turnIdx: 0, unsettled: false, board: [] } });
    c.emit('kernel_state', { type: 'turn', activePlayerId: 'you', settled: true });
    c.emit('kernel_state', { type: 'tick', t: 12 });
    c.emit('kernel_state', { type: 'error', error: 'bad', action: { type: 'drop' } });
    c.emit('kernel_state', { type: 'game_over', winner: 'me' });

    ok('active event emitted on first envelope', events.some((e) => e.type === 'active'));
    ok('state event delivered', events.some((e) => e.type === 'state' && e.state && e.state.order));
    ok('turn event delivered', events.some((e) => e.type === 'turn' && e.t.activePlayerId === 'you'));
    ok('tick event delivered', events.some((e) => e.type === 'tick'));
    ok('error event delivered', events.some((e) => e.type === 'error' && e.err === 'bad'));
    ok('gameOver event delivered', events.some((e) => e.type === 'gameOver' && e.winner === 'me'));
    ok('snapshot exposed', k.snapshot() && k.snapshot().order[0] === 'me');
    k.destroy();
  }

  // ── 2. canActLocally gate ───────────────────────────────────────────────
  {
    const c = makeStubClient();
    const k = new KGKernelClient({ client: c, mySlot: 1, myUserId: 'me', probeMs: 9999 });

    ok('canActLocally null before kernel active', k.canActLocally() === null);

    c.emit('kernel_state', { type: 'turn', activePlayerId: 'you', settled: true });
    ok('canActLocally false when not my turn', k.canActLocally() === false);

    c.emit('kernel_state', { type: 'turn', activePlayerId: 'me', settled: true });
    ok('canActLocally true when my turn', k.canActLocally() === true);

    c.emit('kernel_state', { type: 'game_over', winner: 'me' });
    ok('canActLocally false after game_over', k.canActLocally() === false);
    k.destroy();
  }

  // ── 3. send() uses kernel envelope ──────────────────────────────────────
  {
    const c = makeStubClient();
    const k = new KGKernelClient({ client: c, mySlot: 1, myUserId: 'me', probeMs: 9999 });
    k.send('drop', { col: 2, layer: 0 });
    ok('send dispatched via sendKernelAction',
      c.sent.length === 1 && c.sent[0].type === 'drop' && c.sent[0].payload.col === 2);

    // ── 4. settle() shorthand ────────────────────────────────────────────
    k.settle();
    ok('settle() shorthand sends settle_complete',
      c.sent.length === 2 && c.sent[1].type === 'settle_complete');

    // After game_over, send is suppressed
    c.emit('kernel_state', { type: 'game_over' });
    k.send('drop', { col: 0, layer: 0 });
    ok('send blocked after game_over', c.sent.length === 2);
    k.destroy();
  }

  // ── 5. legacy probe ─────────────────────────────────────────────────────
  await new Promise((resolve) => {
    const c = makeStubClient();
    const k = new KGKernelClient({ client: c, mySlot: 1, myUserId: 'me', probeMs: 25 });
    let firedLegacy = false;
    k.on('legacy', () => { firedLegacy = true; });
    setTimeout(() => {
      ok('legacy event fires when no kernel_state arrives within probeMs', firedLegacy);
      k.destroy();
      resolve();
    }, 80);
  });

  // ── 6. legacy NOT fired if kernel_state arrives in time ─────────────────
  await new Promise((resolve) => {
    const c = makeStubClient();
    const k = new KGKernelClient({ client: c, mySlot: 1, myUserId: 'me', probeMs: 60 });
    let firedLegacy = false;
    k.on('legacy', () => { firedLegacy = true; });
    setTimeout(() => c.emit('kernel_state', { type: 'turn', activePlayerId: 'me' }), 10);
    setTimeout(() => {
      ok('legacy suppressed when kernel becomes active before probe expires', !firedLegacy);
      ok('isKernelActive true after first envelope', k.isKernelActive() === true);
      k.destroy();
      resolve();
    }, 120);
  });

  // ── 7. derived turn from state envelope only ────────────────────────────
  {
    const c = makeStubClient();
    const k = new KGKernelClient({ client: c, mySlot: 2, myUserId: 'b', probeMs: 9999 });
    c.emit('kernel_state', { type: 'state', state: { order: ['a', 'b'], turnIdx: 1, unsettled: false } });
    ok('derived turn from state: canActLocally true (turnIdx=1, me=b)', k.canActLocally() === true);
    ok('activePlayerId derived correctly', k.activePlayerId() === 'b');
    k.destroy();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
