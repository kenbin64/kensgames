/**
 * The join failure: a slow-connecting player cancels the whole session.
 *
 *     node server/test_connect_window.js
 *
 * THE BUG THIS PINS. connectRetryDelay x connectMaxRetries was 500ms x 3, so
 * the PlayerManager gave every player 1.5 seconds to register a websocket after
 * the game launched. Navigating from the lobby to the 3D page closes the lobby
 * socket, and that page takes 10-20 seconds to come back on a cold load. The
 * PlayerManager stopped waiting, cancelled the session, and every later join
 * was refused with "Game already started" because status was then 'cancelled'.
 *
 * The production log showed it directly:
 *
 *     [joinExisting] New player joining: guest_2546... to session 676fa97c
 *     [Lobby] Disconnected (total: 1)
 *     [join_by_code] SUCCESS: Joining session D28UVD for user guest_8d62...
 *     [joinExisting] ERROR: Game not waiting, status: cancelled
 *
 * THE CONTROLS MATTER MORE THAN THE TESTS. Three of the checks below are
 * written to FAIL if the fix is wrong in the other direction: the session must
 * still be cancellable when nobody ever connects, a player who connects within
 * the window must NOT be replaced by a bot, and the fallback must not loop.
 * A fix that only ever says yes would pass a test that only ever asks nicely.
 */

const PlayerManager = require('./player-manager.js');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  pass  ${name}${detail ? `  (${detail})` : ''}`); }
  else    { fail++; console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`); }
}

/** A minimal world: connections map, live sessions map, send and broadcast. */
function makeWorld() {
  const sent = [];
  const connections = new Map();
  const liveSessions = new Map();
  const send = (ws, msg) => sent.push({ ws, msg });
  const broadcast = (session, msg) => sent.push({ session: session.session_id, msg });
  return { sent, connections, liveSessions, send, broadcast };
}

function makeSession(id, humans, bots) {
  const players = [];
  humans.forEach((u, i) => players.push({
    user_id: u, username: u, is_ai: false, slot: i, isReady: true,
  }));
  (bots || []).forEach((b, i) => players.push({
    user_id: b, username: b, is_ai: true, slot: humans.length + i, isReady: true, level: 'normal',
  }));
  return {
    session_id: id, session_code: id.slice(0, 6).toUpperCase(), game_id: 'fasttrack',
    status: 'waiting', players, max_players: 6,
    host_id: humans[0], host_username: humans[0], settings: {},
  };
}

/** Attach a fake websocket for a user so the PlayerManager can "see" them. */
function connectUser(world, sessionId, userId) {
  const ws = { id: userId, readyState: 1 };
  world.connections.set(ws, { user_id: userId, session_x_id: sessionId, user: { user_id: userId } });
  return ws;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async function main() {

  console.log('\nCONFIGURATION');

  // Read the shipped defaults through a throwaway instance rather than
  // re-stating them here, so this test cannot pass against a config it is not
  // actually describing.
  const probe = new PlayerManager(new Map(), new Map(), () => {}, () => {});
  const cfg = probe._cfg;
  const windowMs = cfg.connectRetryDelay * cfg.connectMaxRetries;

  console.log(`  connectRetryDelay  ${cfg.connectRetryDelay}ms`);
  console.log(`  connectMaxRetries  ${cfg.connectMaxRetries}`);
  console.log(`  connect window     ${windowMs}ms`);
  console.log(`  disconnectGraceMs  ${cfg.disconnectGraceMs}ms`);

  // The contradiction that caused the bug. The 3D page is documented in this
  // very file as needing 10-20s, so a connect window below that is broken by
  // its own comment.
  check('the connect window covers a 10-20s cold page load',
        windowMs >= 20000, `${windowMs}ms`);

  check('the connect window is not longer than the disconnect grace',
        windowMs <= cfg.disconnectGraceMs,
        `${windowMs}ms vs ${cfg.disconnectGraceMs}ms`);

  // ---------------------------------------------------------------------
  console.log('\nTHE REPORTED FAILURE: second player joins a cancelled room');

  {
    const w = makeWorld();
    // Short window so the test runs quickly, same SHAPE as production.
    const pm = new PlayerManager(w.connections, w.liveSessions, w.send, w.broadcast,
                                 { connectRetryDelay: 20, connectMaxRetries: 3 });

    const s = makeSession('sess-slow', ['host', 'slowplayer'], ['bot1']);
    w.liveSessions.set(s.session_id, s);

    // The host is connected. The second player is mid-navigation and has no
    // socket yet, exactly like a 3D page still loading.
    connectUser(w, s.session_id, 'host');

    pm.startSession(s.session_id);
    await sleep(250);   // longer than 20ms x 3

    check('the session is NOT cancelled by one slow player',
          s.status !== 'cancelled', `status: ${s.status}`);

    const humans = s.players.filter(p => !p.is_ai).map(p => p.user_id);
    check('the connected host keeps their seat as a human',
          humans.includes('host'), `humans: ${humans.join(', ') || 'none'}`);

    check('the slow player was replaced by a bot rather than killing the room',
          !humans.includes('slowplayer'));

    // The actual reported symptom: can a new player still join afterwards?
    check('the room can still accept a join (status is not cancelled)',
          s.status === 'waiting' || s.status === 'playing',
          `status: ${s.status}`);
  }

  // ---------------------------------------------------------------------
  console.log('\nCONTROL: a player who connects in time must NOT become a bot');

  {
    const w = makeWorld();
    const pm = new PlayerManager(w.connections, w.liveSessions, w.send, w.broadcast,
                                 { connectRetryDelay: 20, connectMaxRetries: 10 });

    const s = makeSession('sess-ok', ['host', 'latecomer'], ['bot1']);
    w.liveSessions.set(s.session_id, s);
    connectUser(w, s.session_id, 'host');

    pm.startSession(s.session_id);
    // Connect the second player inside the window, as a real page load would.
    await sleep(60);
    connectUser(w, s.session_id, 'latecomer');
    await sleep(250);

    const humans = s.players.filter(p => !p.is_ai).map(p => p.user_id);
    check('a player connecting within the window stays human',
          humans.includes('latecomer'), `humans: ${humans.join(', ') || 'none'}`);
    check('that session is not cancelled', s.status !== 'cancelled', `status: ${s.status}`);
  }

  // ---------------------------------------------------------------------
  console.log('\nCONTROL: the session must STILL cancel when nobody connects');

  {
    const w = makeWorld();
    const pm = new PlayerManager(w.connections, w.liveSessions, w.send, w.broadcast,
                                 { connectRetryDelay: 20, connectMaxRetries: 3 });

    const s = makeSession('sess-dead', ['ghost1', 'ghost2'], []);
    w.liveSessions.set(s.session_id, s);
    // Nobody connects at all.

    pm.startSession(s.session_id);
    await sleep(400);

    check('a session where NO human ever connects is cancelled',
          s.status === 'cancelled', `status: ${s.status}`);
  }

  // ---------------------------------------------------------------------
  console.log('\nCONTROL: the bot fallback must run once, not loop');

  {
    const w = makeWorld();
    const pm = new PlayerManager(w.connections, w.liveSessions, w.send, w.broadcast,
                                 { connectRetryDelay: 20, connectMaxRetries: 3 });

    const s = makeSession('sess-loop', ['host', 'slow1', 'slow2'], []);
    w.liveSessions.set(s.session_id, s);
    connectUser(w, s.session_id, 'host');

    pm.startSession(s.session_id);
    await sleep(500);

    const replacements = w.sent.filter(e => e.msg && e.msg.type === 'player_replaced_with_bot');
    check('each missing player is replaced exactly once',
          replacements.length === 2, `${replacements.length} replacement broadcasts for 2 players`);
    check('the fallback flag is set so it cannot run again',
          pm._managed.get(s.session_id) ? pm._managed.get(s.session_id).botFallbackUsed === true : false);
  }

  console.log(`\n  ${pass} passing, ${fail} failing\n`);
  process.exit(fail > 0 ? 1 : 0);
})();
