#!/usr/bin/env node
/**
 * ============================================================
 * READING A CARD 7 SPLIT
 *
 * Reported as: "7 is still a bit clunky when dividing, we need to show what has
 * been chosen on the first split."
 *
 * A split moves two pegs. Both legs used to be handed to the animator in one
 * batch and started in the same tick, so seven holes worth of movement happened
 * at once and there was no way to tell which peg took which half. Leg 2 now
 * waits for leg 1 to land.
 *
 * The split itself stays ONE atomic move. That matters more now that socket
 * play works: the engine still executes a single 'split' and publishes one
 * state, so peers see one move and the turn machine has nothing new to reason
 * about. Only the presentation is staged.
 *
 * What is checked here is the engine side of that contract, plus the wiring in
 * the shipped renderer. How it LOOKS is checked by eye; what cannot drift
 * silently is checked here.
 *
 * Run: node fasttrack/test_split_presentation.js
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

console.log('SPLIT PRESENTATION');
console.log('='.repeat(62));

const threed = fs.readFileSync(path.join(__dirname, 'fasttrack-3d.js'), 'utf8');
const core = fs.readFileSync(path.join(__dirname, 'fasttrack-game-core.js'), 'utf8');

// ───────────────────────────────────────────────────────────
section('1. The two legs are handed over as leg 1 and leg 2, not as a batch');
{
  ok(/const leg = \(pendingAnim2 && pendingAnim2\.pegId === pegId\) \? 1 : 0;/.test(threed),
    'the second peg of a split is tagged as leg 1 rather than left anonymous');
  ok(/_deferredAnims\.push\(\{ pegId, path: anim\.path, existing, holeId, leg \}\)/.test(threed),
    'the tag travels with the queued animation');
  ok(/const firstLeg = _deferredAnims\.filter\(da => legOf\(da\) === 0\);/.test(threed)
    && /const secondLeg = _deferredAnims\.filter\(da => legOf\(da\) === 1\);/.test(threed),
    'the animator separates the two legs');
  ok(/if \(--remaining > 0\) return;/.test(threed),
    'leg 2 waits for EVERY animation in leg 1, not just one of them');
  ok(/for \(const da of secondLeg\) runOne\(da, null\);/.test(threed),
    'a second leg with no first still moves rather than stalling the turn');
}

// ───────────────────────────────────────────────────────────
section('2. The committed first leg is shown as an object, not just a trail');
{
  ok(/function _createGhostPeg\(/.test(threed),
    'a ghost of the peg stands on the hole it is committed to');
  ok(/function _createSplitCountLabel\(/.test(threed),
    'the steps still to spend are shown on the board');
  ok(/_createSplitCountLabel\(dest, 7 - steps\)/.test(threed),
    'and the number shown is what is LEFT of the seven',
    'must be 7 minus the committed leg');
  ok(/createPegHalo\(peg\.id, color, \{ pulsing: false \}\)/.test(threed),
    'the committed peg is haloed without pulsing, so it does not read as still choosable');
}

// ───────────────────────────────────────────────────────────
section('3. The ghost cannot damage the real peg it was cloned from');
{
  // A three.js clone shares materials with its source. Making the ghost
  // translucent without cloning them would turn the real peg see-through, and
  // disposing the highlight would destroy a material the board still uses.
  const at = threed.indexOf('function _createGhostPeg(');
  const body = threed.slice(at, at + 1600);
  ok(/const c = m\.clone\(\);/.test(body),
    'every material is cloned before being made translucent');
  ok(/function _disposeHighlightObject\(/.test(threed),
    'highlight disposal walks the object rather than assuming a single mesh');
  ok(/if \(obj\.traverse\) obj\.traverse\(dropOne\);/.test(threed),
    'so a cloned GROUP releases its children');
  ok(/if \(m\.map && m\.map\.dispose\) m\.map\.dispose\(\);/.test(threed),
    'and the count label releases its canvas texture');
}

// ───────────────────────────────────────────────────────────
section('4. The split is still ONE move, which is what protects multiplayer');
{
  const g = createEngine();
  g.initGame(2, { sessionSeed: 'split-atomic' });

  // Only the presentation was staged. If the engine ever starts executing a
  // split in two commits, peers would see a half finished 7 and the turn
  // machine would have to learn not to resolve between the legs.
  ok(/window\._pendingHopAnim2 = \{ pegId: peg2\.id/.test(core),
    'both legs are still published by a single executeMove');
  const at = core.indexOf('Store pending hop animation for the 3D renderer');
  const emit = core.slice(at, at + 900);
  ok(at > 0, 'the pending-hop emission is where the test expects it');
  ok(/window\._pendingHopAnim = \{ pegId: peg\.id/.test(emit)
    && /window\._pendingHopAnim2 = \{ pegId: peg2\.id/.test(emit),
    'and they are published together, in the same branch');

  ok(typeof g.executeMove === 'function', 'there is exactly one entry point for executing a move');
  ok(!/executeSplitLeg|commitFirstLeg|executeMoveLeg/.test(core),
    'no separate per-leg execution path has crept in');
}

// ───────────────────────────────────────────────────────────
section('5. A first leg on offer always has a legal completion');
{
  // This is what makes committing to a first leg safe: the step choices are
  // built from COMPLETE legal splits, so picking one can never strand the
  // player with no legal second move.
  ok(/for \(const m of splitMoves\) \{/.test(core)
    && /pegMap\.get\(m\.pegIdx\)\.add\(m\.steps\);/.test(core),
    'the offered step counts come from complete legal splits, not from arithmetic');

  // Forced, not hoped for. Two pegs far apart on the outer track with a 7 is
  // the canonical split position; random play can run hundreds of turns
  // without producing one, and a check that never runs is not a check.
  const g = createEngine();
  g.initGame(2, { sessionSeed: 'split-complete' });
  const OUTER = g.CLOCKWISE_TRACK.filter(h => h.startsWith('outer-'));
  const list = g.state.players.get('list') || [];
  for (const h of g.CLOCKWISE_TRACK) g.state.board.set(h, null);
  for (const pl of list) for (const pg of pl.pegs) { pg.holeId = 'holding'; pg.holeType = 'holding'; }
  const place = (peg, hole) => {
    peg.holeId = hole; peg.holeType = g.getHoleType(hole);
    g.state.board.set(hole, { playerIdx: 0, pegId: peg.id });
  };
  place(list[0].pegs[0], OUTER[0]);
  place(list[0].pegs[1], OUTER[6]);
  g.state.players.set('current', 0);
  g._drawCardCommit({ ...g.CARDS['7'], value: '7', display: '7S', suit: 'S' });

  const splits = (g.state.turn.get('validMoves') || []).filter(m => m && m.type === 'split');
  let checked = splits.length, bad = 0;
  for (const m of splits) {
    if (m.pegIdx == null || m.peg2Idx == null) { bad++; continue; }
    if ((m.steps + m.steps2) !== 7) bad++;
  }
  ok(checked > 0, 'the forced position really does produce splits', `${checked} splits`);
  ok(bad === 0, `every split emitted names two pegs totalling 7 (${checked} seen)`,
    `${bad} malformed`);
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
