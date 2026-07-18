// browser/adapter-harness.js
// Headless proof that the engine-backed adapter honors the renderer's contract, without a browser.
// It shims a minimal DOM + window + a drainable timer queue, runs an all-bot game to completion by
// pumping the queue, and asserts: the projected state tables are well-formed every step, peg ids and
// hole ids match the renderer's expectations, the turn index is always valid (the bug that started
// this), a cosmetic hop hint is staged on every move, and the game actually finishes with a winner.
// Run: node browser/adapter-harness.js   (from fasttrack/v2)

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// ── shims (installed before importing the adapter) ────────────────────────────────────────────────
function fakeEl() {
  return {
    _cls: new Set(), innerHTML: '', textContent: '', disabled: false, style: {},
    classList: { toggle(c, on) { on ? this._on.add(c) : this._on.delete(c); }, add(c) { this._on.add(c); }, remove(c) { this._on.delete(c); }, _on: new Set() },
    setAttribute() {}, removeAttribute() {},
  };
}
const _el = fakeEl();
_el.style.setProperty = () => {}; _el.style.removeProperty = () => {};
global.document = { getElementById: () => _el, addEventListener: () => {}, readyState: 'complete' };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

let hopStaged = 0, invalidIdx = 0, renderCalls = 0, seatSkips = 0;
global.window = global;                       // window === globalThis so window.X = ... works
window.highlightMovePaths = () => {};
window.showYourTurnPopup = () => {};
window.dismissYourTurnPopup = () => {};
window.raiseAnimationBarrier = () => {};

// drainable timer queue (deterministic; no wall clock)
let _tid = 0; const timers = new Map();
global.setTimeout = (fn) => { const id = ++_tid; timers.set(id, fn); return id; };
global.clearTimeout = (id) => { timers.delete(id); };
function pump(maxSteps) {
  let steps = 0;
  while (timers.size && steps < maxSteps) {
    // Simulate the renderer's _maybeAutoCommitSingle: when exactly one legal move exists it commits
    // it on its own (a microtask), racing whatever timer the bot scheduled. This is the path the
    // first harness never exercised and where the out-of-turn bug hid.
    const FTC = window.FastTrackCore;
    const vm = FTC.state.turn.get('validMoves') || [];
    if (vm.length === 1 && FTC.state.turn.get('phase') === 'move') { window.executeMove(0); steps++; continue; }
    const [id, fn] = timers.entries().next().value;
    timers.delete(id);
    fn();
    steps++;
  }
  return steps;
}

const KNOWN_ROLE = (h) => h === 'holding' || h === 'bullseye'
  || /^(ft|home)-\d+$/.test(h) || /^(side-left|side-right|outer|safe)-\d+-\d+$/.test(h);

function validatePlayers(core, count, label) {
  const list = core.state.players.get('list') || [];
  if (list.length !== count) { ok(false, `${label}: player count ${list.length} != ${count}`); return; }
  let good = true;
  list.forEach((p, i) => {
    if (p.pegs.length !== 5) good = false;
    if (!p.color || p.boardPosition == null) good = false;
    p.pegs.forEach((pg, n) => {
      if (pg.id !== `p${i}-peg${n}`) good = false;
      if (!KNOWN_ROLE(pg.holeId)) good = false;
    });
  });
  const cur = core.state.players.get('current');
  if (cur < 0 || cur >= count) { invalidIdx++; good = false; }
  ok(good, `${label}: 4 players x 5 pegs, ids p{i}-peg{n}, every holeId known, current index valid`);
}

(async () => {
  const { default: core } = await import('./fasttrack-core-v2.js').then((m) => ({ default: m.FastTrackCore || window.FastTrackCore }));
  const FTC = window.FastTrackCore;

  // spy the renderer: every render, validate every peg holeId + the turn INDEX and the turn ORDER.
  // A double-advance keeps the index in range but skips a seat, so we check the delta too: between
  // renders the acting seat must stay the same (a redraw) or advance by exactly +1 (mod N). Anything
  // bigger is a skipped seat — the exact bug Ken hit.
  let lastCur = null;
  FTC.setRenderer(() => {
    renderCalls++;
    const list = FTC.state.players.get('list') || [];
    for (const p of list) for (const pg of p.pegs) if (!KNOWN_ROLE(pg.holeId)) invalidIdx++;
    const cur = FTC.state.players.get('current');
    if (cur < 0 || cur >= list.length) { invalidIdx++; }
    else {
      if (lastCur != null) { const d = (cur - lastCur + list.length) % list.length; if (d >= 2) seatSkips++; }
      lastCur = cur;
    }
    if (window._pendingHopAnim) hopStaged++;
  });

  console.log('\n== init: an all-bot 4-player game projects a clean board ==');
  FTC.initGame(4, { sessionPlayers: [{ is_ai: true }, { is_ai: true }, { is_ai: true }, { is_ai: true }] });
  validatePlayers(FTC, 4, 'init');

  // starting layout: 4 pegs in holding + 1 on the home hole, per player
  const list0 = FTC.state.players.get('list');
  const holdingCount = list0.reduce((s, p) => s + p.pegs.filter((pg) => pg.holeId === 'holding').length, 0);
  const homeCount = list0.reduce((s, p) => s + p.pegs.filter((pg) => pg.holeId === `home-${p.boardPosition}`).length, 0);
  ok(holdingCount === 16, `16 pegs start in holding (got ${holdingCount})`);
  ok(homeCount === 4, `4 pegs start on their home hole (got ${homeCount})`);

  // board occupancy: exactly one entry per peg, all distinct render hole ids
  const boardKeys = FTC.state.board.keys();
  ok(boardKeys.length === 20, `board table has one entry per peg (20; got ${boardKeys.length})`);
  ok(new Set(boardKeys).size === boardKeys.length, 'board table keys are all distinct (no two pegs share a hole)');

  console.log('\n== run the whole game by draining the timer queue ==');
  const steps = pump(200000);
  const winner = FTC.state.meta.get('winner');
  ok(steps > 0 && steps < 200000, `game advanced and terminated in ${steps} scheduled steps (no runaway)`);
  ok(winner != null, `a winner was reached: seat ${winner}`);
  ok(invalidIdx === 0, `the turn/hole projection was valid on every one of ${renderCalls} renders (0 invalid)`);
  ok(seatSkips === 0, `no seat was ever skipped across the whole game (0 double-advances) — even with single-move auto-commit racing the bot`);
  ok(hopStaged > 0, `a cosmetic hop hint was staged on moves (${hopStaged} times) — animation is decoupled from rotation`);
  validatePlayers(FTC, 4, 'final');

  console.log('\n== the winner truly has 4 pegs safe + 1 home (engine win condition) ==');
  const wl = FTC.state.players.get('list')[winner];
  const safe = wl.pegs.filter((pg) => pg.holeType === 'safezone').length;
  const home = wl.pegs.filter((pg) => pg.holeId === `home-${wl.boardPosition}`).length;
  ok(safe >= 4 && home >= 1, `winner has ${safe} in safe zone and ${home} on home`);

  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
