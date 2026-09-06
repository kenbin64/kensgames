#!/usr/bin/env node
/**
 * ============================================================
 * TURN HANDOFF
 *
 * Covers the two ways a turn used to go missing.
 *
 * 1. THE REDRAW RULE.  A, 6, J, Q, K and JOKER grant a redraw EVERY time they
 *    are drawn, and that holds even when the card produced no legal move. The
 *    no-legal-move paths used to call endTurn() directly, which rotates
 *    unconditionally, so the redraw was silently eaten and the turn handed
 *    away. To the player whose redraw vanished that is indistinguishable from
 *    a skipped turn. Those paths now route through resolveTurn(), the single
 *    authority that knows replay from rotate.
 *
 * 2. THE SILENT NON-HOST HANDOFF.  A non-host ends its turn through several
 *    paths that produce no move: no legal moves, the manual end-turn button,
 *    the stuck watchdog, an idle relinquish. All of them land in endTurn's
 *    non-host branch, which used to clean up the local UI and return, sending
 *    nothing. The host is the only seat allowed to rotate, so it was never told
 *    and sat on that seat forever. The branch now emits `turn_done`.
 *
 * Run: node fasttrack/test_turn_handoff.js
 * ============================================================
 */

const { createEngine } = require('./engine/headless');

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function section(label) { console.log(NL + '-- ' + label + ' --'); }

console.log('TURN HANDOFF');
console.log('='.repeat(62));

// ───────────────────────────────────────────────────────────
section('1. The redraw rule, including when there is no legal move');

const REDRAW = ['A', '6', 'J', 'Q', 'K', 'JOKER'];
const ROTATE = ['2', '3', '4', '5', '7', '8', '9', '10'];

// The card matrix is the source of truth for which ranks redraw.
{
  const g = createEngine();
  g.initGame(2, { sessionSeed: 'flags' });
  const wrong = [];
  for (const r of REDRAW) if (!(g.state.cards.get(r) || {}).extraTurn) wrong.push(r);
  for (const r of ROTATE) if ((g.state.cards.get(r) || {}).extraTurn) wrong.push(r);
  ok(wrong.length === 0, 'exactly A, 6, J, Q, K, JOKER are flagged as redraw cards',
     wrong.length ? 'wrong: ' + wrong.join(',') : '');
}

// resolveTurn is what the no-legal-move paths now call. With NO legal moves,
// a redraw card must keep the seat and a normal card must rotate it.
function seatAfterNoMoveTurn(rank) {
  const g = createEngine();
  g.initGame(2, { sessionSeed: 'redraw-' + rank });
  g.state.players.set('current', 0);
  g.state.turn.set('phase', 'move');
  const card = Object.assign({}, g.CARDS[rank], { value: rank, display: rank + 'S', suit: 'S' });
  g.state.deck.set('currentCard', card);
  g.state.turn.set('validMoves', []);          // the no-legal-move situation
  g.sandbox.resolveTurn(g.sandbox._getTurnEpoch());
  return g.state.players.get('current');
}

for (const r of REDRAW) {
  ok(seatAfterNoMoveTurn(r) === 0,
     `${r} with no legal move KEEPS the seat (redraw preserved)`,
     `seat became ${seatAfterNoMoveTurn(r)}`);
}
for (const r of ROTATE) {
  ok(seatAfterNoMoveTurn(r) === 1,
     `${r} with no legal move rotates the seat`,
     `seat stayed ${seatAfterNoMoveTurn(r)}`);
}

// ───────────────────────────────────────────────────────────
section('2. A non-host that finishes without a move tells the host');

function buildPair() {
  const ids = ['host', 'peer'];
  const sessionPlayers = ids.map((id, i) => ({
    user_id: id, username: id, is_ai: false, is_host: i === 0, slot: i,
  }));
  const wire = [];
  const seats = ids.map((id, i) => {
    const engine = createEngine();
    const client = {
      connected: true, isHost: i === 0, userId: id,
      session: { players: sessionPlayers },
      sendAction: (a, p) => wire.push({ from: i, action: a, payload: p }),
      sendGameState: () => {},
    };
    return { id, i, engine, client, isHost: i === 0 };
  });
  for (const s of seats) {
    s.engine.initGame(2, { sessionSeed: 'handoff', launchMode: 'private', myUserId: s.id, sessionPlayers });
    s.engine.setMyUserId(s.id);
    if (typeof s.engine.updateSessionRoster === 'function') s.engine.updateSessionRoster(sessionPlayers);
    s.engine.setMultiplayerClient(s.client);
  }
  return { seats, wire };
}

// Put the peer on the clock with zero legal moves: every peg in holding and a 2,
// which cannot release from holding.
function stagePeerWithNoMoves(seats) {
  const peerIdx = (seats[0].engine.state.players.get('list') || [])
    .findIndex(p => p.userId === 'peer');
  for (const s of seats) {
    const list = s.engine.state.players.get('list') || [];
    for (const h of s.engine.CLOCKWISE_TRACK) s.engine.state.board.set(h, null);
    for (const pg of list[peerIdx].pegs) {
      pg.holeId = 'holding'; pg.holeType = 'holding'; pg.onFasttrack = false;
    }
    s.engine.state.players.set('current', peerIdx);
    s.engine.state.turn.set('phase', 'draw');
  }
  return peerIdx;
}

{
  const { seats, wire } = buildPair();
  const [host, peer] = seats;
  const peerIdx = stagePeerWithNoMoves(seats);

  const two = Object.assign({}, peer.engine.CARDS['2'], { value: '2', display: '2C', suit: 'C' });
  peer.engine._drawCardCommit(two);
  wire.length = 0;                                  // ignore the synthetic draw

  ok((peer.engine.state.turn.get('validMoves') || []).length === 0,
     'the peer genuinely has no legal move');

  peer.engine.endTurn();
  const sent = wire.filter(m => m.from === peer.i).map(m => m.action);
  ok(sent.includes('turn_done'),
     'the peer tells the host its seat is finished',
     'wire carried: ' + (sent.join(',') || '(nothing)'));

  // Host acts on it.
  const before = host.engine.state.players.get('current');
  for (const m of wire) {
    if (m.from === host.i) continue;
    host.engine.applyRemoteAction(m.action, m.payload);
  }
  ok(host.engine.state.players.get('current') !== before,
     'the host rotates on receiving turn_done',
     `host stayed on seat ${before}`);
  ok(before === peerIdx, 'sanity: the host was parked on the peer seat beforehand');
}

// ───────────────────────────────────────────────────────────
section('3. turn_done cannot rotate twice');

{
  const { seats, wire } = buildPair();
  const [host, peer] = seats;
  stagePeerWithNoMoves(seats);

  const two = Object.assign({}, peer.engine.CARDS['2'], { value: '2', display: '2C', suit: 'C' });
  peer.engine._drawCardCommit(two);
  wire.length = 0;
  peer.engine.endTurn();

  const msg = wire.find(m => m.action === 'turn_done');
  host.engine.applyRemoteAction('turn_done', msg.payload);
  const afterFirst = host.engine.state.players.get('current');

  // Deliver the very same message again, the way a retry or a duplicated
  // broadcast would. It must be ignored, because that seat is no longer active.
  host.engine.applyRemoteAction('turn_done', msg.payload);
  ok(host.engine.state.players.get('current') === afterFirst,
     'a duplicate turn_done is ignored rather than advancing again',
     `seat moved ${afterFirst} -> ${host.engine.state.players.get('current')}`);
}

console.log(NL + '='.repeat(62));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(62));
if (fail) {
  console.log(NL + 'Failures:');
  failures.forEach(f => console.log(`  - ${f.name}${f.detail ? ': ' + f.detail : ''}`));
  process.exit(1);
}
process.exit(0);
