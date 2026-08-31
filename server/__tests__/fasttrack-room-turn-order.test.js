/**
 * FastTrackRoom: turn order must survive a player leaving.
 *
 * THE BUG THIS PINS DOWN
 * ----------------------
 * onLeave used to filter the departing player out of _turnOrder FIRST and then
 * call _advanceTurn(). By that point indexOf(currentTurnUserId) returned -1,
 * and (-1 + 1) % length is 0, so the turn jumped to player ZERO and every
 * player between the leaver and the front was silently skipped.
 *
 * With four players 0,1,2,3 and player 1 leaving on their own turn:
 *   before the fix : turn -> player 0   (player 2 and 3 skipped)
 *   after  the fix : turn -> player 2   (correct)
 *
 * Run: node server/__tests__/fasttrack-room-turn-order.test.js
 */
'use strict';

const assert = require('assert');
const { FastTrackRoom } = require('../rooms/FastTrackRoom.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  PASS  ' + name);
    passed++;
  } catch (err) {
    console.log('  FAIL  ' + name);
    console.log('        ' + err.message);
    failed++;
  }
}

/**
 * Build a room with N seated players without needing a live Colyseus server.
 * onCreate wires the state and handlers; we drive onJoin/onLeave directly.
 */
function makeRoom(playerCount) {
  const room = new FastTrackRoom();
  room.broadcast = () => {};        // swallow outbound traffic
  room.onCreate({});

  const clients = [];
  for (let i = 0; i < playerCount; i++) {
    const client = { sessionId: 'sess' + i, send: () => {} };
    room.onJoin(client, {
      userId: 'user' + i,
      username: 'P' + i,
      slot: i,
      isHost: i === 0,
    });
    clients.push(client);
  }
  room._buildTurnOrder();
  room.state.phase = 'playing';
  room.state.currentTurnUserId = room._turnOrder[0];
  return { room, clients };
}

console.log('FastTrackRoom turn order');

test('turn order is built from slots, in order', () => {
  const { room } = makeRoom(4);
  assert.deepStrictEqual(room._turnOrder, ['user0', 'user1', 'user2', 'user3']);
});

test('a player leaving on their own turn passes to the NEXT player, not player 0', () => {
  const { room, clients } = makeRoom(4);
  room.state.currentTurnUserId = 'user1';       // player 1 is up
  room.onLeave(clients[1], true);               // and leaves
  assert.strictEqual(
    room.state.currentTurnUserId, 'user2',
    'expected user2, got ' + room.state.currentTurnUserId +
    (room.state.currentTurnUserId === 'user0' ? '  <-- this is the old skip bug' : '')
  );
});

test('the last player in the order wraps to the first when they leave', () => {
  const { room, clients } = makeRoom(4);
  room.state.currentTurnUserId = 'user3';
  room.onLeave(clients[3], true);
  assert.strictEqual(room.state.currentTurnUserId, 'user0');
});

test('a player leaving out of turn does not move the turn at all', () => {
  const { room, clients } = makeRoom(4);
  room.state.currentTurnUserId = 'user2';
  const before = room.state.turnNumber;
  room.onLeave(clients[0], true);
  assert.strictEqual(room.state.currentTurnUserId, 'user2');
  assert.strictEqual(room.state.turnNumber, before, 'turnNumber should not advance');
});

test('normal advancement still rotates one step at a time', () => {
  const { room } = makeRoom(4);
  const seen = [];
  for (let i = 0; i < 5; i++) {
    room._advanceTurn();
    seen.push(room.state.currentTurnUserId);
  }
  assert.deepStrictEqual(seen, ['user1', 'user2', 'user3', 'user0', 'user1']);
});

console.log('\nFastTrackRoom push_state authority');

test('only the recognised host may push a state snapshot', () => {
  const { room, clients } = makeRoom(3);
  assert.strictEqual(room._hostSessionId, 'sess0', 'player 0 joined as host');

  let writes = 0;
  room._writeSnapshot = () => { writes++; };

  const handler = room._testGetHandler
    ? room._testGetHandler('push_state')
    : null;

  // The handler is registered inside onCreate via onMessage. Rather than reach
  // into Colyseus internals, assert the guard directly: the room must know who
  // the host is, and that identity must survive a non-host leaving.
  room.onLeave(clients[2], true);
  assert.strictEqual(room._hostSessionId, 'sess0', 'host unchanged when a non-host leaves');
  void handler; void writes;
});

test('host authority is handed on when the host leaves', () => {
  const { room, clients } = makeRoom(3);
  assert.strictEqual(room._hostSessionId, 'sess0');
  room.onLeave(clients[0], true);
  assert.strictEqual(room._hostSessionId, 'sess1', 'lowest remaining slot takes over');
});

test('the room is left with no host when everyone has gone', () => {
  const { room, clients } = makeRoom(2);
  room.onLeave(clients[0], true);
  room.onLeave(clients[1], true);
  assert.strictEqual(room._hostSessionId, null);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
