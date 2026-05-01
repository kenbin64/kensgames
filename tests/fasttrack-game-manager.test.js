'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Player } = require('../js/substrates/player.js');
const { FastTrackGame } = require('../fasttrack/fasttrack-game.js');

// Expose classes for the browser-style manager module.
global.Player = Player;
global.FastTrackGame = FastTrackGame;

const KGGameManager = require('../js/substrates/game_manager.js');

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    clear() { map.clear(); },
  };
}

function sampleSession() {
  return {
    session_id: 's_123',
    session_code: 'ABCD12',
    game_id: 'fasttrack',
    game_uuid: 'g_abc_001',
    host_id: 'u1',
    my_user_id: 'u1',
    is_host: true,
    settings: { turn_timer: true, turn_timer_seconds: 120 },
    players: [
      { user_id: 'u1', username: 'Host', avatar_id: 'person_smile', is_host: true, is_ai: false },
      { user_id: 'u2', username: 'Guest', avatar_id: 'person_cool', is_host: false, is_ai: false },
      { user_id: 'bot1', username: 'Bot One', avatar_id: 'robot', is_host: false, is_ai: true },
    ],
  };
}

test('createFastTrackRuntimeFromSession builds Player[] and injects into FastTrackGame', () => {
  const runtime = KGGameManager.createFastTrackRuntimeFromSession(sampleSession(), {
    mode: 'private',
    myUserId: 'u1',
  });

  assert.equal(runtime.ok, true);
  assert.ok(runtime.game instanceof FastTrackGame);
  assert.equal(runtime.players.length, 3);
  assert.equal(runtime.game.playerCount, 3);
  assert.equal(runtime.game.players.length, 3);
  assert.equal(runtime.payload.schema, 'kg.fasttrack.runtime/1');
  assert.equal(runtime.payload.game.code, 'ABCD12');
  assert.equal(runtime.payload.game.game_uuid, 'g_abc_001');
  assert.equal(runtime.payload.session.game_uuid, 'g_abc_001');
  assert.equal(runtime.payload.me.user_id, 'u1');
});

test('createFastTrackRuntimeFromSession returns not-ok when classes missing', () => {
  const prevPlayer = global.Player;
  const prevGame = global.FastTrackGame;
  delete global.Player;
  delete global.FastTrackGame;

  const runtime = KGGameManager.createFastTrackRuntimeFromSession(sampleSession(), {});

  assert.equal(runtime.ok, false);
  assert.equal(runtime.reason, 'missing-classes');

  global.Player = prevPlayer;
  global.FastTrackGame = prevGame;
});

test('createLegacyLaunchObjects maps runtime payload to KG_Game and KG_Player', () => {
  const runtime = KGGameManager.createFastTrackRuntimeFromSession(sampleSession(), {
    mode: 'private',
    myUserId: 'u1',
  });
  const legacy = KGGameManager.createLegacyLaunchObjects(runtime);

  assert.equal(legacy.KG_Game.mode, 'private');
  assert.equal(legacy.KG_Game.code, 'ABCD12');
  assert.equal(legacy.KG_Player.user_id, 'u1');
  assert.equal(legacy.KG_Player.avatarObj.id, 'person_smile');
});

test('persistRuntime writes canonical and legacy keys', () => {
  const prevSessionStorage = global.sessionStorage;
  const prevLocalStorage = global.localStorage;

  global.sessionStorage = memoryStorage();
  global.localStorage = memoryStorage();

  const runtime = KGGameManager.createFastTrackRuntimeFromSession(sampleSession(), {
    mode: 'private',
    myUserId: 'u1',
  });
  KGGameManager.persistRuntime(runtime);

  const canonical = JSON.parse(global.sessionStorage.getItem('kg_fasttrack_runtime'));
  const kgSession = JSON.parse(global.sessionStorage.getItem('kg_session'));
  const kgGame = JSON.parse(global.localStorage.getItem('KG_Game'));
  const kgPlayer = JSON.parse(global.localStorage.getItem('KG_Player'));

  assert.equal(canonical.schema, 'kg.fasttrack.runtime/1');
  assert.equal(kgSession.session_code, 'ABCD12');
  assert.equal(kgGame.code, 'ABCD12');
  assert.equal(kgPlayer.user_id, 'u1');

  global.sessionStorage = prevSessionStorage;
  global.localStorage = prevLocalStorage;
});

test('readRuntimeFromStorage validates schema', () => {
  const prevSessionStorage = global.sessionStorage;
  global.sessionStorage = memoryStorage();

  global.sessionStorage.setItem('kg_fasttrack_runtime', JSON.stringify({ schema: 'wrong' }));
  assert.equal(KGGameManager.readRuntimeFromStorage(), null);

  global.sessionStorage.setItem('kg_fasttrack_runtime', JSON.stringify({ schema: 'kg.fasttrack.runtime/1', game: {} }));
  assert.deepEqual(KGGameManager.readRuntimeFromStorage(), { schema: 'kg.fasttrack.runtime/1', game: {} });

  global.sessionStorage = prevSessionStorage;
});

test('createGenericRuntimeFromSummary builds cross-game payload', () => {
  const runtime = KGGameManager.createGenericRuntimeFromSummary({
    launchMode: 'friend',
    playerCount: 2,
    code: 'SFX123',
    players: [
      { user_id: 's1', username: 'Pilot', avatar_id: 'space_rocket', is_host: true, is_ai: false },
      { user_id: 's2', username: 'Wingmate', avatar_id: 'person_cool', is_host: false, is_ai: false },
    ],
    session: {
      session_id: 'star_1',
      session_code: 'SFX123',
      my_user_id: 's1',
      game_id: 'starfighter',
    },
  }, {
    gameId: 'starfighter',
    gameName: 'Alien Space Attack',
  });

  assert.equal(runtime.ok, true);
  assert.equal(runtime.payload.schema, 'kg.game.runtime/1');
  assert.equal(runtime.payload.game.id, 'starfighter');
  assert.equal(runtime.payload.game.code, 'SFX123');
  assert.equal(runtime.payload.players.length, 2);
  assert.equal(runtime.payload.me.user_id, 's1');
});

test('persistGenericRuntime writes generic and legacy keys', () => {
  const prevSessionStorage = global.sessionStorage;
  const prevLocalStorage = global.localStorage;

  global.sessionStorage = memoryStorage();
  global.localStorage = memoryStorage();

  const runtime = KGGameManager.createGenericRuntimeFromSummary({
    launchMode: 'solo',
    playerCount: 1,
    players: [{ user_id: 'b1', username: 'Breaker', avatar: '🟪', is_host: true }],
    session: { game_id: 'brickbreaker3d', my_user_id: 'b1' },
  }, {
    gameId: 'brickbreaker3d',
    gameName: 'BrickBreaker 3D',
    mode: 'solo',
  });

  KGGameManager.persistGenericRuntime(runtime);

  const generic = JSON.parse(global.sessionStorage.getItem('kg_game_runtime'));
  const byGame = JSON.parse(global.sessionStorage.getItem('kg_runtime_brickbreaker3d'));
  const kgGame = JSON.parse(global.localStorage.getItem('KG_Game'));
  const kgPlayer = JSON.parse(global.localStorage.getItem('KG_Player'));

  assert.equal(generic.schema, 'kg.game.runtime/1');
  assert.equal(byGame.game.id, 'brickbreaker3d');
  assert.equal(kgGame.attrs.game_id, 'brickbreaker3d');
  assert.equal(kgPlayer.user_id, 'b1');

  global.sessionStorage = prevSessionStorage;
  global.localStorage = prevLocalStorage;
});

test('readGenericRuntimeFromStorage returns null for wrong schema', () => {
  const prevSessionStorage = global.sessionStorage;
  global.sessionStorage = memoryStorage();

  global.sessionStorage.setItem('kg_runtime_starfighter', JSON.stringify({ schema: 'wrong' }));
  assert.equal(KGGameManager.readGenericRuntimeFromStorage('starfighter'), null);

  global.sessionStorage.setItem('kg_runtime_starfighter', JSON.stringify({ schema: 'kg.game.runtime/1', game: { id: 'starfighter' } }));
  assert.deepEqual(KGGameManager.readGenericRuntimeFromStorage('starfighter'), { schema: 'kg.game.runtime/1', game: { id: 'starfighter' } });

  global.sessionStorage = prevSessionStorage;
});
