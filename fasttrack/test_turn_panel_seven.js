#!/usr/bin/env node
/**
 * THE TURN PANEL ON A 7 (Ken, 2026-11-15)
 *
 *   "sometimes when I pick a card for 7 it does not give me button options. You can still pick a hole
 *    but not everyone knows they have that option."
 *   "A B first then each hole and button for each hole when more than one option exists"
 *
 * Runs the real engine and the real fasttrack-turn-panel.js together (a small stand-in page), deals
 * random boards with a 7 in the player's hand, and presses through every choice the footer offers.
 *   1. a step that waits for the player always has at least one footer button lit
 *   2. when the first peg can go more than one way, the routes (A, B ...) come first
 *   3. after a route is picked, every stop on it has its own button
 *   4. with a single route, its stops are offered straight away, one button each
 *
 * Run: node fasttrack/test_turn_panel_seven.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createEngine } = require('./engine/headless');

let pass = 0, fail = 0;
const ok = (condition, name, detail = '') => {
  if (condition) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
};

// Just enough page for the panel: elements by id, buttons with a glyph, click listeners.
function makePage() {
  const byId = new Map();
  const element = () => ({
    id: '', hidden: false, disabled: false, className: '', title: '', textContent: '', children: [],
    style: { setProperty() {} }, listeners: {}, parentNode: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    click() { (this.listeners.click || []).forEach(fn => fn()); },
    appendChild(child) { child.parentNode = this; this.children.push(child); if (child.id) byId.set(child.id, child); return child; },
    insertBefore(child) { return this.appendChild(child); },
    querySelectorAll(sel) { return sel === '.peg-btn' ? this.children.filter(c => String(c.className).includes('peg-btn')) : []; },
    querySelector(sel) {
      if (sel === '.peg-glyph') return this.glyph || (this.glyph = { textContent: '' });
      return sel.startsWith('.peg-confirm') ? { textContent: '' } : null;
    },
    set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html || ''; },
  });
  const frame = element();
  const row = element(); row.id = 'ft-peg-buttons'; frame.appendChild(row);
  const confirm = element(); confirm.id = 'ft-peg-confirm'; frame.appendChild(confirm);
  const document = { readyState: 'complete', body: element(), getElementById: id => byId.get(id) || null,
    createElement: () => element(), querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  return { document, byId };
}

function startTable(seed, players) {
  const game = createEngine();
  game.initGame(players, { sessionSeed: seed });
  const page = makePage();
  game.sandbox.document = page.document;
  let heartbeat = null;
  game.sandbox.setInterval = (fn) => { heartbeat = fn; return 1; };
  game.sandbox.executeMove = () => {};                      // explore the choices, never play
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'fasttrack-turn-panel.js'), 'utf8'), game.sandbox);
  return { game, byId: page.byId, tick: () => heartbeat() };
}

// A random board for seat 0 (a person) with a 7 in hand.
function dealSeven(game, random) {
  const list = game.state.players.get('list');
  for (const h of game.CLOCKWISE_TRACK) game.state.board.set(h, null);
  game.state.board.set('bullseye', null);
  for (const pl of list) for (const pg of pl.pegs) {
    Object.assign(pg, { holeId: 'holding', holeType: 'holding', onFasttrack: false, eligibleForSafeZone: false, mustExitFasttrack: false });
  }
  list.forEach((pl, i) => { pl.isBot = i !== 0; });
  const free = game.CLOCKWISE_TRACK.slice();
  const take = () => free.splice(Math.floor(random() * free.length), 1)[0];
  list.forEach((pl, seat) => {
    const count = seat === 0 ? 1 + Math.floor(random() * 4) : Math.floor(random() * 3);
    for (let k = 0; k < count; k++) {
      const pg = pl.pegs[k], hole = take();
      pg.holeId = hole; pg.holeType = game.getHoleType(hole);
      if (hole.startsWith('ft-') && random() < 0.7) { pg.onFasttrack = true; pg.fasttrackEntryHole = hole; }
      game.state.board.set(hole, { playerIdx: seat, pegId: pg.id });
    }
  });
  game.state.players.set('current', 0);
  game.state.turn.set('phase', 'draw');
  game.state.turn.set('leaveFastTrack', false);
  game._drawCardCommit(Object.assign({}, game.CARDS['7'], { value: '7', display: '7S', suit: 'S' }));
}

const WAITING = ['peg', 'route', 'stop', 'dest', 'peg2', 'dest2'];
let state = 20261115;
const random = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; };

let boards = 0, steps = 0, routeFirstSeen = 0, singleRouteSeen = 0;
let silent = '', routeProblem = '', stopProblem = '';
for (let t = 0; t < 250; t++) {
  const table = startTable(`panel-seven-${t}`, 2 + (t % 3));
  dealSeven(table.game, random);
  table.tick();
  if (!(table.game.state.turn.get('validMoves') || []).length) continue;
  boards++;
  const panel = table.game.sandbox.FTTurnPanel.state;
  const lit = () => [0, 1, 2, 3, 4, 5, 6].filter(i => { const b = table.byId.get('peg-btn-' + i); return b && !b.disabled; });
  const label = (i) => (table.byId.get('peg-btn-' + i).glyph || {}).textContent;
  const press = (i) => { table.byId.get('peg-btn-' + i).click(); table.tick(); };
  const back = () => { const b = table.byId.get('ft-peg-back'); if (b) b.click(); table.tick(); };

  const walk = (depth, trail) => {
    steps++;
    const buttons = lit();
    const entryShown = table.byId.get('ft-entry-new') && !table.byId.get('ft-entry-new').hidden;
    if (!silent && WAITING.includes(panel.stage) && !buttons.length && !entryShown) {
      silent = `board ${t}, stage ${panel.stage}, after ${trail.join(' > ') || '(start)'}`;
    }
    if (panel.stage === 'route') {
      routeFirstSeen++;
      const routes = new Set(panel.stops.map(s => s.route)).size;
      if (!routeProblem && (routes < 2 || buttons.map(label).some(l => !/^[A-G]$/.test(l)))) {
        routeProblem = `board ${t}: route step shows ${buttons.map(label).join(',')} for ${routes} route(s)`;
      }
    }
    if (panel.stage === 'stop') {
      const routes = new Set(panel.options.map(s => s.route));
      if (trail.length === 1) singleRouteSeen++;
      const labels = buttons.map(label).sort().join(',');
      const expected = panel.options.map(s => s.label).sort().join(',');
      if (!stopProblem && (routes.size !== 1 || labels !== expected)) {
        stopProblem = `board ${t}: stops ${expected} but buttons ${labels} (${routes.size} routes shown together)`;
      }
    }
    if (depth > 4) return;
    for (const i of buttons) { const l = label(i); press(i); walk(depth + 1, trail.concat(l)); back(); }
  };
  walk(0, []);
}

console.log(`\n${boards} boards with a 7, ${steps} panel steps`);
ok(!silent, 'every step that waits for the player has a footer button lit', silent);
ok(routeFirstSeen > 0 && !routeProblem, `more than one route: the routes A, B ... come first (${routeFirstSeen} seen)`, routeProblem);
ok(!stopProblem, 'then one button per stop, and only the chosen route\'s stops at a time', stopProblem);
ok(singleRouteSeen > 0, `a single route: its stops are offered straight away (${singleRouteSeen} seen)`);
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
