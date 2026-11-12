#!/usr/bin/env node
/**
 * ============================================================
 * ONLINE: EVERY PLAYER SEES THE WIN (Ken, 2026-11-11)
 *
 *   "All players did not get the winning fanfare, just me the host."
 *
 * The main cause was in the browser (fasttrack-3d.js): waitForAnimations kept
 * ONE waiting callback, and on a guest's screen the host's next snapshot,
 * arriving mid-hop, replaced the winning move's "play the cut scenes" callback.
 * That is fixed there (every waiter runs). This test covers the engine side:
 *
 *   1. host wins, the guest gets the move and the snapshots as sent: the
 *      celebration shows on both screens, once each, "you won" only for the host
 *   2. the guest gets ONLY the host's snapshots (the move is lost): the guest
 *      still gets the celebration, from the snapshot, once
 *
 * Run: node fasttrack/test_mp_win_everyone.js
 * ============================================================
 */

const { createEngine } = require('./engine/headless');

let pass = 0, fail = 0;
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function buildSession(tag) {
  const ids = ['user-0', 'user-1'];
  const sessionPlayers = ids.map((id, i) => ({ user_id: id, username: `P${i}`, is_ai: false, is_host: i === 0, slot: i }));
  const queue = [];
  const seats = ids.map((id, i) => {
    const engine = createEngine();
    const client = { connected: true, isHost: i === 0, userId: id, session: { players: sessionPlayers }, sendGameState() {} };
    return { id, engine, client, celebrations: [] };
  });
  for (const seat of seats) {
    seat.client.sendAction = (action, payload) => queue.push({ kind: 'action', from: seat, action, payload });
    seat.engine.initGame(2, { sessionSeed: 'win-' + tag, launchMode: 'private', myUserId: seat.id, sessionPlayers });
    seat.engine.setMyUserId(seat.id);
    if (typeof seat.engine.updateSessionRoster === 'function') seat.engine.updateSessionRoster(sessionPlayers);
    seat.engine.setMultiplayerClient(seat.client);
    seat.engine.sandbox.showWinCelebration = (o) => seat.celebrations.push(o);
  }
  seats[0].engine.setStateCommittedHandler(() => queue.push({ kind: 'snapshot', from: seats[0], snap: seats[0].engine.getStateSnapshot() }));
  return { seats, queue };
}

// The same position on both screens: the host's fifth peg one hole before its
// entrance with four in the safe zone, holding a 3 that takes it home.
function stageWin(engine) {
  const g = engine, list = g.state.players.get('list'), me = list[0], bp = me.boardPosition, t = g.CLOCKWISE_TRACK;
  for (const h of t) g.state.board.set(h, null);
  for (let k = 1; k <= 4; k++) g.state.board.set(`safe-${bp}-${k}`, null);
  for (const pl of list) for (const pg of pl.pegs) {
    pg.holeId = 'holding'; pg.holeType = 'holding'; pg.eligibleForSafeZone = false; pg.lockedToSafeZone = false; pg.onFasttrack = false;
  }
  const start = t[(t.indexOf(`outer-${bp}-2`) - 1 + t.length) % t.length];
  [start, `safe-${bp}-1`, `safe-${bp}-2`, `safe-${bp}-3`, `safe-${bp}-4`].forEach((h, k) => {
    const pg = me.pegs[k];
    pg.holeId = h; pg.holeType = g.getHoleType(h); pg.eligibleForSafeZone = true; pg.lockedToSafeZone = pg.holeType === 'safezone';
    g.state.board.set(h, { playerIdx: 0, pegId: pg.id });
  });
  g.state.players.set('current', 0);
  g.state.turn.set('phase', 'move');
  g._drawCardCommit(Object.assign({}, g.CARDS['3'], { value: '3', display: '3S', suit: 'S' }));
}

async function play(tag, deliver) {
  const { seats, queue } = buildSession(tag);
  for (const s of seats) stageWin(s.engine);
  queue.length = 0;
  const host = seats[0].engine;
  const idx = (host.state.turn.get('validMoves') || []).findIndex(m => m.pegIdx === 0 && String(m.dest).startsWith('home-'));
  host.executeMove(idx);
  for (const m of queue.splice(0)) {
    if (m.kind === 'action' && deliver === 'all') seats[1].engine.applyRemoteAction(m.action, m.payload);
    if (m.kind === 'snapshot') seats[1].engine.applyStateSnapshot(m.snap);
  }
  await wait(7000);
  return seats;
}

(async () => {
  console.log('ONLINE: EVERY PLAYER SEES THE WIN');
  console.log('='.repeat(64));
  const origLog = console.log;

  console.log = () => {};
  let seats;
  try { seats = await play('a', 'all'); } finally { console.log = origLog; }
  console.log('-- 1. The guest gets the move and the snapshots --');
  ok(seats[0].celebrations.length === 1 && seats[0].celebrations[0].localWon === true, 'the host sees it once, as the winner',
     JSON.stringify(seats[0].celebrations.map(c => c.localWon)));
  ok(seats[1].celebrations.length === 1 && seats[1].celebrations[0].localWon === false, 'the guest sees it once, told "better luck next time"',
     JSON.stringify(seats[1].celebrations.map(c => c.localWon)));
  ok(seats[1].celebrations[0] && seats[1].celebrations[0].winnerName === 'P0', 'the guest sees the winner\'s name');

  console.log = () => {};
  try { seats = await play('b', 'snapshots-only'); } finally { console.log = origLog; }
  console.log('-- 2. The guest gets only the snapshots --');
  ok(seats[1].engine.state.meta.get('winner') === 0, 'the guest\'s game knows the host won');
  ok(seats[1].celebrations.length === 1 && seats[1].celebrations[0].localWon === false, 'the guest still sees the celebration, once',
     `${seats[1].celebrations.length} shown`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
