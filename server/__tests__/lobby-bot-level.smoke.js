#!/usr/bin/env node
/**
 * Bot difficulty must survive the GameObject round trip.
 *
 * The lobby handler pushes a bot onto session.players and then calls
 * syncGameObjectSession(), which does:
 *
 *     session.players = toSessionPlayersFromGame(gameObject.toJSON())
 *
 * That REBUILDS the roster from the canonical GameObject. Anything the Player
 * class does not carry is silently discarded no matter what the handler pushed,
 * which is exactly how bot difficulty was being lost: the handler stored it, the
 * round trip threw it away, and every bot came out 'normal'.
 *
 * Run: node server/__tests__/lobby-bot-level.smoke.js
 */

const path = require('path');
const GameObject = require(path.join(__dirname, '..', 'game-object.js'));

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('LOBBY BOT LEVEL — GameObject round trip');
console.log('='.repeat(58));

const LEVELS = ['easy', 'normal', 'hard', 'expert'];

function sessionWith(botLevel) {
  return {
    session_id: 'sess-1',
    session_code: 'ABC123',
    game_id: 'fasttrack',
    host_id: 'human-1',
    max_players: 4,
    settings: {},
    status: 'lobby',
    players: [
      { user_id: 'human-1', username: 'Host', avatar_id: 'player', is_host: true, is_ai: false, slot: 0, ready: true },
      { user_id: 'ai-1', username: 'Bot', avatar_id: 'robot', is_host: false, is_ai: true, slot: 1, ready: true, level: botLevel },
    ],
  };
}

for (const lvl of LEVELS) {
  const g = GameObject.upsertFromSession(sessionWith(lvl));
  ok(!!g, `upsertFromSession accepts a roster with a ${lvl} bot`);
  if (!g) continue;
  const json = g.toJSON();
  const bot = (json.players || []).find(p => p.isAI);
  ok(!!bot, `the ${lvl} bot survives into the GameObject`);
  ok(bot && bot.level === lvl,
     `the GameObject keeps level "${lvl}"`, bot ? `got ${bot.level}` : 'no bot');
}

// A human must not acquire a difficulty.
{
  const g = GameObject.upsertFromSession(sessionWith('hard'));
  const human = (g.toJSON().players || []).find(p => !p.isAI);
  ok(human && human.level === null, 'a human carries no difficulty',
     human ? `got ${human.level}` : 'no human');
}

// Garbage must not pass through to the engine, which would silently fall back
// and hide the typo.
{
  const g = GameObject.upsertFromSession(sessionWith('impossible'));
  const bot = (g.toJSON().players || []).find(p => p.isAI);
  ok(bot && bot.level === 'normal',
     'an unrecognised difficulty is normalised to normal', bot ? `got ${bot.level}` : 'no bot');
}

// A roster with no level at all (older client or server) must still work.
{
  const s = sessionWith('hard');
  delete s.players[1].level;
  const g = GameObject.upsertFromSession(s);
  const bot = (g.toJSON().players || []).find(p => p.isAI);
  ok(bot && bot.level === 'normal',
     'a bot with no level defaults to normal rather than undefined',
     bot ? `got ${bot.level}` : 'no bot');
}

// The host changing their mind must stick.
{
  const g = GameObject.upsertFromSession(sessionWith('easy'));
  const before = (g.toJSON().players || []).find(p => p.isAI).level;
  const g2 = GameObject.upsertFromSession(sessionWith('expert'));
  const after = (g2.toJSON().players || []).find(p => p.isAI).level;
  ok(before === 'easy' && after === 'expert',
     'changing a bot difficulty updates it', `${before} -> ${after}`);
}

console.log('='.repeat(58));
console.log(`  ${pass} passed, ${fail} failed`);
if (fail) {
  failures.forEach(f => console.log(`  - ${f.name}${f.detail ? ': ' + f.detail : ''}`));
  process.exit(1);
}
process.exit(0);
