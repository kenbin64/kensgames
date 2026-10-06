#!/usr/bin/env node
/**
 * ============================================================
 * THE 7 SPLIT DIAL
 *
 * Testers: "the actual play to make moves is clunky, especially on 7 splits."
 *
 * The dial shows the two numbers and lets the player slide the 7 between two
 * pegs. Its promise is that it invents nothing: every position it can show is
 * a 'split' move the rules engine produced, and every split the engine
 * produced can be reached on it. That promise is what is checked here, against
 * the real engine, using the dial's own grouping code lifted out of the
 * shipped renderer.
 *
 * How it LOOKS is checked by eye in the browser.
 *
 * Run: node fasttrack/test_split_dial.js
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const { createEngine } = require('./engine/headless');

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function section(label) { console.log(NL + '-- ' + label + ' --'); }

// Lift a top-level function out of the renderer source by name.
const threed = fs.readFileSync(path.join(__dirname, 'fasttrack-3d.js'), 'utf8');
function lift(name) {
  const start = threed.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found in fasttrack-3d.js`);
  const end = threed.indexOf(NL + '}', start);
  return threed.slice(start, end + 2);
}
const dial = new Function(`
  const _splitDial = { movesHash: '', pairKey: '', stepsA: 0, route: 0, touched: false };
  ${lift('_splitDialModel')}
  ${lift('_splitDialSelection')}
  return { _splitDial, _splitDialModel, _splitDialSelection };
`)();

// A position with several pegs on the track, holding a 7.
function sevenPosition(holes) {
  const g = createEngine();
  g.initGame(3, { sessionSeed: 'dial' });
  const S = g.sandbox;
  const players = g.state.players.get('list');
  const ci = g.state.players.get('current') || 0;
  const me = players[ci];
  holes.forEach((holeId, i) => {
    const peg = me.pegs[i];
    if (peg.holeId && peg.holeId !== 'holding') g.state.board.set(peg.holeId, null);
    peg.holeId = holeId; peg.holeType = 'outer';
    g.state.board.set(holeId, { playerIdx: ci, pegId: peg.id });
  });
  g.state.players.set('list', players);
  g.state.deck.set('currentCard', { value: '7', display: '7♠', suit: '♠' });
  g.state.turn.set('phase', 'move');
  S.calculateValidMoves();
  return g.state.turn.get('validMoves') || [];
}

console.log('SPLIT DIAL');
console.log('='.repeat(62));

section('1. Two pegs on the track');
{
  const vm = sevenPosition(['outer-0-3', 'outer-1-3']);
  const splits = vm.filter(m => m.type === 'split');
  ok(splits.length > 0, 'the engine offers splits for this position', `${vm.length} moves, 0 splits`);

  const pairs = dial._splitDialModel(vm);
  ok(pairs.length === 1, 'the dial sees one pair of pegs', `${pairs.length} pairs`);

  // Every split the engine produced is on the dial, exactly once.
  const onDial = pairs.flatMap(p => [...p.bySteps.values()].flat());
  const splitIdx = vm.map((m, i) => (m.type === 'split' ? i : -1)).filter(i => i >= 0);
  ok(onDial.length === splitIdx.length && splitIdx.every(i => onDial.includes(i)),
    'every engine split is reachable on the dial, none twice',
    `${onDial.length} on dial vs ${splitIdx.length} from engine`);

  // Nothing on the dial is anything other than an engine split that adds to 7.
  ok(onDial.every(i => vm[i].type === 'split' && vm[i].steps + vm[i].steps2 === 7),
    'the dial holds only real splits whose halves add to 7');

  // The number shown for the first peg is really that peg's share.
  let labelsRight = true;
  for (const p of pairs) for (const [stepsA, idxs] of p.bySteps) for (const i of idxs) {
    const m = vm[i];
    const shareOfA = m.pegIdx === p.a ? m.steps : m.steps2;
    if (shareOfA !== stepsA || Math.min(m.pegIdx, m.peg2Idx) !== p.a) labelsRight = false;
  }
  ok(labelsRight, 'the number beside each peg is that peg\'s own share');

  const sel = dial._splitDialSelection(vm);
  ok(sel && sel.legal.includes(sel.stepsA), 'the dial opens on a legal share', sel && `opened on ${sel.stepsA}`);
  ok(sel && Math.abs(sel.stepsA - 3.5) === Math.min(...sel.legal.map(s => Math.abs(s - 3.5))),
    'and that share is the most even one available');
  ok(sel && vm[sel.moveIdx] && vm[sel.moveIdx].type === 'split', 'Play would execute a real split move');

  // An illegal dialled value is not kept.
  dial._splitDial.stepsA = 99;
  const sel2 = dial._splitDialSelection(vm);
  ok(sel2.legal.includes(sel2.stepsA), 'a value the engine did not offer cannot stay selected');
}

section('2. Three pegs on the track: a choice of pairs');
{
  dial._splitDial.pairKey = ''; dial._splitDial.stepsA = 0; dial._splitDial.route = 0;
  const vm = sevenPosition(['outer-0-3', 'outer-1-3', 'outer-2-3']);
  const pairs = dial._splitDialModel(vm);
  ok(pairs.length === 3, 'three pegs give three pairs to choose from', `${pairs.length} pairs`);
  ok(new Set(pairs.map(p => p.key)).size === pairs.length && pairs.every(p => p.a < p.b),
    'each pair appears once, whichever peg the engine listed first');

  dial._splitDial.pairKey = pairs[2].key;
  const sel = dial._splitDialSelection(vm);
  const m = vm[sel.moveIdx];
  ok(sel.pair.key === pairs[2].key && Math.min(m.pegIdx, m.peg2Idx) === pairs[2].a && Math.max(m.pegIdx, m.peg2Idx) === pairs[2].b,
    'choosing a pair plays a split of exactly those two pegs');
}

section('3. No split available');
{
  const vm = sevenPosition(['outer-0-3']);   // one peg: a 7 is just a 7
  ok(dial._splitDialModel(vm).length === 0 && dial._splitDialSelection(vm) === null,
    'with one peg on the track the dial has nothing to show');
}

section('4. Wiring in the shipped files');
{
  const html = fs.readFileSync(path.join(__dirname, '3d.html'), 'utf8');
  for (const id of ['ft-split-dial', 'ft-sd-range', 'ft-sd-less', 'ft-sd-more', 'ft-sd-play', 'ft-sd-pairs', 'ft-sd-route']) {
    ok(html.includes(`id="${id}"`), `3d.html has #${id}`);
  }
  ok(/_refreshInstructionBanner\(\) \{\s*_refreshSplitDial\(\);/.test(threed),
    'the dial refreshes whenever the move prompt does');
  ok(/window\.executeMove\(sel\.moveIdx\)/.test(threed), 'Play goes through the engine\'s executeMove');
}

console.log(NL + '='.repeat(62));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(62));
process.exit(fail ? 1 : 0);
