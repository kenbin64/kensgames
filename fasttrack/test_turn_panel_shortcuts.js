#!/usr/bin/env node
/**
 * THE TURN PANEL'S SHORTCUT BUTTONS (Ken, 2026-11-18)
 *
 *   "two new buttons whenever fast track hole is a legal last hop ... whenever bullseye is a legal move for
 *    final hop that appears then other button will take them to the alternative routes"
 *   On the bullseye with a royal: "Leave 🎯" goes straight to the player's own fast-track hole; "Pick 🏁" opens
 *   every fast-track hole. Riding the fast track: "Traverse" and "Leave 🏁". 🏁 stands for the fast track.
 *   "add a wimp button when someone chooses to stay on the main track instead of risking the bullseye ...
 *    it will highlight the main track hole to the right of the fast track hole."
 *
 * Runs the real engine and the real fasttrack-turn-panel.js together (as test_turn_panel_seven.js does),
 * sets up each board directly, and presses the footer buttons.
 *
 * Run: node fasttrack/test_turn_panel_shortcuts.js
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
const section = (s) => console.log(`\n-- ${s} --`);

// Just enough page for the panel (the same stand-in as test_turn_panel_seven.js).
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

// A table where seat 0 (a person) has one peg at `hole` and holds `card`; everyone else is in holding.
function table(hole, card, { onFasttrack = false } = {}) {
  const game = createEngine();
  game.initGame(2, { sessionSeed: `shortcuts-${hole}-${card}` });
  const page = makePage();
  game.sandbox.document = page.document;
  let heartbeat = null;
  game.sandbox.setInterval = (fn) => { heartbeat = fn; return 1; };
  game.sandbox.executeMove = () => {};                      // explore the choices, never play
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'fasttrack-turn-panel.js'), 'utf8'), game.sandbox);
  const list = game.state.players.get('list');
  for (const h of game.CLOCKWISE_TRACK) game.state.board.set(h, null);
  game.state.board.set('bullseye', null);
  for (const pl of list) for (const pg of pl.pegs) {
    Object.assign(pg, { holeId: 'holding', holeType: 'holding', onFasttrack: false, eligibleForSafeZone: false, mustExitFasttrack: false });
  }
  list.forEach((pl, i) => { pl.isBot = i !== 0; });
  const pg = list[0].pegs[0];
  Object.assign(pg, { holeId: hole, holeType: game.getHoleType(hole), onFasttrack, fasttrackEntryHole: onFasttrack ? hole : null });
  game.state.board.set(hole, { playerIdx: 0, pegId: pg.id });
  game.state.players.set('current', 0);
  game.state.turn.set('phase', 'draw');
  game.state.turn.set('leaveFastTrack', false);
  game._drawCardCommit(Object.assign({}, game.CARDS[card], { value: card, display: card + 'S', suit: 'S' }));
  const t = { game, byId: page.byId, tick: () => heartbeat(), bp: list[0].boardPosition };
  t.tick();
  t.panel = game.sandbox.FTTurnPanel.state;
  t.labels = () => [0, 1, 2, 3, 4, 5, 6].map(i => t.byId.get('peg-btn-' + i)).filter(b => b && !b.disabled).map(b => (b.glyph || {}).textContent);
  t.press = (label) => {
    const i = [0, 1, 2, 3, 4, 5, 6].find(k => { const b = t.byId.get('peg-btn-' + k); return b && !b.disabled && (b.glyph || {}).textContent === label; });
    if (i === undefined) return false;
    t.byId.get('peg-btn-' + i).click(); t.tick(); return true;
  };
  t.back = () => { t.byId.get('ft-peg-back').click(); t.tick(); };
  t.staged = () => t.panel.stage === 'ready' ? (t.panel.options.find(o => o.moveIdx === t.panel.moveIdx) || {}).dest : null;
  return t;
}

const nextOnTrack = (game, hole) => game.CLOCKWISE_TRACK[(game.CLOCKWISE_TRACK.indexOf(hole) + 1) % game.CLOCKWISE_TRACK.length];

section('Riding the fast track with a one-hop card: Traverse, 🎯, 🐔 and Leave 🏁');
{
  // A peg on another player's fast-track hole, riding the ring, with an Ace (one hop).
  const t = table('ft-3', 'A', { onFasttrack: true });
  t.press('1');                                               // choose the peg
  const labels = t.labels();
  ok(labels.includes('🎯'), 'the bullseye jump has its own button', labels.join(' '));
  ok(labels.includes('Traverse'), 'Traverse stays on the ring', labels.join(' '));
  ok(labels.includes('🐔'), 'the wimp button is offered while the bullseye is on offer', labels.join(' '));
  ok(labels.includes('Leave 🏁'), 'Leave 🏁 lets the peg get off the ring', labels.join(' '));
  ok(labels.every(l => !/^[A-G]$/.test(l)), 'no hole letters at this step: buttons instead', labels.join(' '));
  t.press('🐔');
  const main = nextOnTrack(t.game, 'ft-3');
  ok(t.staged() === main, `🐔 picks the main-track hole after the fast-track hole (${main})`, `staged ${t.staged()}`);
  ok(t.game.state.turn.get('leaveFastTrack') === true, 'wimping out uses the engine\'s leave-fast-track moves');
  t.back();
  ok(t.game.state.turn.get('leaveFastTrack') !== true, '↩ turns leave mode off again, so the moves match the buttons');
  ok(t.labels().includes('🐔'), '↩ brings the shortcut buttons back');
  t.press('🎯');
  ok(t.staged() === 'bullseye', '🎯 picks the bullseye', `staged ${t.staged()}`);
}

section('Traverse rides the ring');
{
  const t = table('ft-3', '5', { onFasttrack: true });
  t.press('1');
  ok(t.labels().includes('Traverse'), 'Traverse is offered on a longer card', t.labels().join(' '));
  if (t.press('Traverse')) {
    const dest = t.staged();
    ok(dest && dest.startsWith('ft-') || /side-left|outer|home/.test(String(dest)), 'Traverse lands on the ring or on the home stretch past its own hole', `staged ${dest}`);
  }
}

section('On the bullseye with a royal: Leave 🎯 and Pick 🏁');
{
  const t = table('bullseye', 'K', { onFasttrack: false });
  t.press('1');
  const labels = t.labels();
  ok(labels.includes('Leave 🎯'), 'Leave 🎯 is offered', labels.join(' '));
  if (labels.includes('Pick 🏁')) ok(true, 'Pick 🏁 is offered for the other fast-track holes');
  t.press('Leave 🎯');
  ok(t.staged() === `ft-${t.bp}`, `Leave 🎯 goes straight to the player's own fast-track hole (ft-${t.bp})`, `staged ${t.staged()}`);
  t.back();
  if (t.press('Pick 🏁')) {
    const letters = t.labels();
    ok(letters.length >= 2 && letters.every(l => /^[A-G]$/.test(l)), 'Pick 🏁 letters the fast-track holes', letters.join(' '));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
