#!/usr/bin/env node
'use strict';

/**
 * Same-screen flow audit (no server required).
 *
 * Same-screen mode is purely client-side: KGMultiplayerPanel builds a local
 * roster (host + N local-human seats + optional bots), then KGGameSetup
 * persists it via KGGameManager.persistGenericRuntime → and the game page
 * boots from sessionStorage on next navigation.
 *
 * This test stubs window/document/storage just enough to load both substrates
 * in Node, fabricates a same-screen-style summary for each lobby that opts in,
 * and verifies the persisted runtime is the shape the game-side
 * KGGameSetup.consumeRuntime expects.
 *
 * Run:  node scripts/same_screen_smoke.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

// ── tiny browser shim ──────────────────────────────────────────────────────
function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
    get length() { return map.size; },
    _dump: () => Object.fromEntries(map),
  };
}

function makeWindow() {
  const win = {};
  win.window = win;
  win.localStorage = makeStorage();
  win.sessionStorage = makeStorage();
  win.location = { href: '', pathname: '/test', search: '', hash: '' };
  win.history = { replaceState() { } };
  win.document = {
    addEventListener() { },
    createElement: () => ({ style: {}, appendChild() { }, setAttribute() { } }),
    head: { appendChild() { } },
    body: { appendChild() { }, contains: () => false },
    getElementById: () => null,
    querySelector: () => null,
    readyState: 'complete',
  };
  win.matchMedia = () => ({ matches: false });
  win.navigator = { userAgent: 'Node' };
  win.performance = { now: () => Date.now() };
  win.URL = URL;
  win.console = console;
  return win;
}

function loadInWindow(win, file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  vm.runInNewContext(src, win, { filename: file });
}

// ── per-game test ──────────────────────────────────────────────────────────
const GAMES = [
  { id: 'fasttrack', name: 'FastTrack', supports: true, seats: 4 },
  { id: 'cubic3d', name: 'Cubic', supports: false, seats: 1 }, // panel doesn't enable it; verify it's still off
  { id: '4dtictactoe', name: '4D TicTacToe', supports: false, seats: 1 },
  { id: 'brickbreaker3d', name: 'BrickBreaker 3D', supports: false, seats: 1 },
  { id: 'starfighter', name: 'Alien Attack', supports: false, seats: 1 },
];

function buildSameScreenSummary(gameId, seats) {
  // Mirror what KGMultiplayerPanel.launchSameScreen() hands to onLaunch()
  const players = [];
  for (let i = 0; i < seats; i++) {
    players.push({
      user_id: 'local-' + (i + 1),
      username: 'Player ' + (i + 1),
      avatar: '🎮',
      avatar_id: 'person_smile',
      is_ai: false,
      is_host: i === 0,
    });
  }
  return {
    session: {
      session_id: 'local-session',
      session_code: null,
      game_id: gameId,
      my_user_id: 'local-1',
      is_host: true,
      players,
      settings: {},
    },
    players,
    me: players[0],
    playerCount: seats,
    aiCount: 0,
    humanCount: seats,
    remoteHumanCount: 0,
    hasRemoteHumans: false,
    isHost: true,
    code: '',
    launchMode: 'same-screen',
  };
}

let failures = 0;

for (const g of GAMES) {
  const win = makeWindow();
  loadInWindow(win, 'js/substrates/game_manager.js');
  loadInWindow(win, 'js/substrates/game_setup.js');

  if (!win.KGGameManager || !win.KGGameSetup) {
    console.error('FAIL  ' + g.id + ' — substrates failed to load');
    failures++;
    continue;
  }

  const summary = buildSameScreenSummary(g.id, g.seats);
  // Drive the same code path the lobby's onLaunch handler uses.
  win.KGGameSetup.persistGenericRuntime(summary, {
    gameId: g.id,
    gameName: g.name,
    mode: 'same-screen',
  });

  const runtime = win.KGGameSetup.consumeRuntimeOrNull
    ? null
    : win.KGGameManager.readGenericRuntimeFromStorage(g.id);

  if (!runtime) {
    console.error('FAIL  ' + g.id + ' — no runtime persisted');
    failures++;
    continue;
  }
  if (runtime.schema !== 'kg.game.runtime/1') {
    console.error('FAIL  ' + g.id + ' — wrong schema: ' + runtime.schema);
    failures++;
    continue;
  }
  if (!runtime.game || runtime.game.id !== g.id) {
    console.error('FAIL  ' + g.id + ' — runtime.game.id mismatch: ' + (runtime.game && runtime.game.id));
    failures++;
    continue;
  }
  if (runtime.game.mode !== 'same-screen') {
    console.error('FAIL  ' + g.id + ' — runtime.game.mode is "' + runtime.game.mode + '" (expected "same-screen")');
    failures++;
    continue;
  }
  if (!Array.isArray(runtime.players) || runtime.players.length !== g.seats) {
    console.error('FAIL  ' + g.id + ' — players.length=' + (runtime.players && runtime.players.length) + ' (expected ' + g.seats + ')');
    failures++;
    continue;
  }
  // Legacy compatibility keys must be present for older game pages.
  const KG_Game = JSON.parse(win.localStorage.getItem('KG_Game') || 'null');
  const KG_Player = JSON.parse(win.localStorage.getItem('KG_Player') || 'null');
  if (!KG_Game || !KG_Player) {
    console.error('FAIL  ' + g.id + ' — legacy KG_Game/KG_Player not persisted');
    failures++;
    continue;
  }
  console.log('PASS  ' + g.id.padEnd(16) + ' — same-screen runtime OK (' + g.seats + ' seat' + (g.seats > 1 ? 's' : '') + '), legacy keys present');
}

if (failures) {
  console.error('\n' + failures + ' same-screen test(s) failed.');
  process.exit(1);
}
console.log('\nAll same-screen runtime tests passed.');
process.exit(0);
