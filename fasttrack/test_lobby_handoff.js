#!/usr/bin/env node
/**
 * ============================================================
 * LOBBY HANDOFF
 *
 * The lobby lets a host create a game, set the player count, and add bots at a
 * chosen difficulty. This checks that what the host picks actually survives the
 * trip into the game.
 *
 * The chain, and where it used to break:
 *
 *   lobby UI  addBot(difficulty)
 *      |          client defaulted to 'medium', which is not one of the
 *      |          engine's four levels, so it fell back to normal
 *      v
 *   lobby-server  add_ai_player
 *      |          never stored `level` at all
 *      v
 *   sanitize() / session broadcast
 *      |          omitted `level`, so it could not reach any client
 *      v
 *   fasttrack-3d.js roster -> initGame sessionPlayers
 *      |          stripped `level` in the mapping
 *      v
 *   initGame -> player.aiDifficulty -> AI_PROFILES
 *
 * Four separate places dropped it. Any one of them was enough to make the
 * difficulty setting look broken, which is why it had never worked.
 *
 * Run: node fasttrack/test_lobby_handoff.js
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const { createEngine } = require('./engine/headless');

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function section(label) { console.log(NL + '-- ' + label + ' --'); }

const LEVELS = ['easy', 'normal', 'hard', 'expert'];

console.log('LOBBY HANDOFF');
console.log('='.repeat(62));

// ───────────────────────────────────────────────────────────
section('1. The engine accepts a lobby roster and honours each bot difficulty');

// A roster shaped exactly like what the lobby broadcasts, one bot per level.
function lobbyRoster() {
  const players = [{
    user_id: 'human-0', username: 'Ken', avatar_id: 'player',
    is_ai: false, is_host: true, slot: 0, level: null,
  }];
  LEVELS.forEach((lvl, i) => {
    players.push({
      user_id: 'ai_' + lvl, username: 'Bot ' + lvl, avatar_id: 'robot',
      is_ai: true, is_host: false, slot: i + 1, ready: true, level: lvl,
    });
  });
  return players;
}

{
  const roster = lobbyRoster();
  const g = createEngine();
  g.initGame(roster.length, {
    sessionSeed: 'lobby-handoff',
    launchMode: 'private',
    myUserId: 'human-0',
    sessionPlayers: roster,
  });

  const list = g.state.players.get('list') || [];
  ok(list.length === roster.length,
     `the game seats all ${roster.length} lobby players`, `got ${list.length}`);

  const human = list.find(p => p.userId === 'human-0');
  ok(human && !human.isBot, 'the host is seated as a human');
  ok(human && human.aiDifficulty == null, 'a human carries no difficulty');

  for (const lvl of LEVELS) {
    const seat = list.find(p => p.userId === 'ai_' + lvl);
    ok(!!seat, `the ${lvl} bot got a seat`);
    if (!seat) continue;
    ok(seat.isBot === true, `the ${lvl} bot is marked as a bot`);
    ok(String(seat.aiDifficulty) === lvl,
       `the ${lvl} bot kept its difficulty through the handoff`,
       `aiDifficulty=${seat.aiDifficulty}`);
  }
}

// ───────────────────────────────────────────────────────────
section('2. Each seated bot resolves to the profile it was given');
{
  const roster = lobbyRoster();
  const g = createEngine();
  g.initGame(roster.length, {
    sessionSeed: 'lobby-profiles', launchMode: 'private',
    myUserId: 'human-0', sessionPlayers: roster,
  });
  const list = g.state.players.get('list') || [];
  const S = g.sandbox;

  const easy = list.find(p => p.userId === 'ai_easy');
  const hard = list.find(p => p.userId === 'ai_hard');
  ok(S._aiProfile(easy).cutMode === 'last-resort',
     'the easy bot resolves to the last-resort cutter');
  ok(S._aiProfile(hard).cutMode === 'aggressive',
     'the hard bot resolves to the aggressive cutter');
  ok(S._aiProfile(hard).huntWeight > S._aiProfile(easy).huntWeight,
     'the hard bot hunts and the easy bot does not');
  // The whole point: two bots at the same table must NOT play the same way.
  ok(S._aiProfile(easy).cutMode !== S._aiProfile(hard).cutMode,
     'two bots at the same table play differently');
}

// ───────────────────────────────────────────────────────────
section('3. A roster with no difficulty still produces a playable table');
{
  // Older sessions, or a server that predates the fix, send no `level`.
  const roster = [
    { user_id: 'h', username: 'Host', is_ai: false, is_host: true, slot: 0 },
    { user_id: 'b1', username: 'Bot', is_ai: true, is_host: false, slot: 1 },
  ];
  const g = createEngine();
  g.initGame(2, {
    sessionSeed: 'no-level', launchMode: 'private',
    myUserId: 'h', sessionPlayers: roster,
  });
  const bot = (g.state.players.get('list') || []).find(p => p.userId === 'b1');
  ok(!!bot && bot.isBot, 'the bot is still seated');
  ok(g.sandbox._aiProfile(bot).cutMode === 'strategic',
     'a bot with no difficulty falls back to normal rather than breaking');
}

// ───────────────────────────────────────────────────────────
section('4. The wiring in the shipped files, not just in this test');

function readFile(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

{
  const server = readFile('server/lobby-server.js');
  ok(/normalizeAiLevel\(/.test(server),
     'lobby-server validates the requested difficulty');
  ok(/level:\s*normalizeAiLevel\(/.test(server),
     'lobby-server STORES the difficulty on the bot it creates');
  ok(/level:\s*p\.is_ai\s*\?/.test(server),
     'lobby-server includes level when it sends the roster to clients');
  ok(/data\.player_id\s*\|\|\s*data\.user_id/.test(server),
     'remove-bot accepts the field name the client actually sends');

  const client = readFile('js/multiplayer-client.js');
  ok(!/level:\s*difficulty\s*\|\|\s*'medium'/.test(client),
     "the client no longer defaults a bot to 'medium', which is not a real level");
  ok(/\['easy',\s*'normal',\s*'hard',\s*'expert'\]/.test(client),
     'the client validates against the four real levels');

  const threed = readFile('fasttrack/fasttrack-3d.js');
  ok(/level:\s*\(p\.is_ai/.test(threed),
     'the roster handoff into initGame carries level through');

  const lobby = readFile('lobby/index.html');
  ok(/id="mp-bot-difficulty"/.test(lobby),
     'the multiplayer lobby offers a bot difficulty control');
  ok(!/mp\.addBot\('medium'\)/.test(lobby),
     'the Add Bot button no longer hardcodes an invalid difficulty');
  for (const lvl of LEVELS) {
    ok(new RegExp(`value="${lvl}"`).test(lobby),
       `the lobby offers "${lvl}"`);
  }
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
