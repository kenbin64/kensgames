// Headless solo-game test for the v2 engine-backed browser adapter.
// Drives a full 4-player solo game (1 human auto-driven + 3 bots) through
// window.FastTrackCore, with fast timers, and asserts:
//   - the adapter's own turn verifier (assertAdvance) never logs a violation,
//   - the seat pointer only ever holds (replay) or advances by exactly 1,
//   - the game reaches a winner (or many turns) with no skip / stall.
// Run: node fasttrack/v2/test_v2_solo.mjs
const realSetTimeout = setTimeout;
const sleep = (ms) => new Promise((r) => realSetTimeout(r, ms));

// ── minimal browser stubs ──
class El { constructor(){ this.innerHTML=''; this.textContent=''; this.style={ setProperty(){}, removeProperty(){} };
  this.disabled=false; this.classList={ add(){},remove(){},toggle(){},contains(){return false;} }; }
  setAttribute(){} getAttribute(){return null;} appendChild(){} }
const els = new Map();
const store = () => { const m=new Map(); return { getItem:(k)=>m.has(k)?m.get(k):null, setItem:(k,v)=>m.set(k,String(v)), removeItem:(k)=>m.delete(k) }; };
// Fast timers so bot pacing collapses; keep clearTimeout real.
global.setTimeout = (fn, ms) => realSetTimeout(fn, Math.min(ms || 0, 1));
global.window = global;
global.document = { getElementById: (id) => { if(!els.has(id)) els.set(id, new El()); return els.get(id); }, createElement: () => new El() };
global.localStorage = store();
// optional renderer/HUD hooks the adapter calls — no-ops
global.showYourTurnPopup = () => {}; global.dismissYourTurnPopup = () => {};
global.highlightMovePaths = () => {}; global.showReplayPrompt = null; global.ManifoldAudio = null;

// capture the adapter's turn-invariant tripwire
let violations = 0;
const realLog = console.log;
console.log = (...a) => { const s = a.join(' '); if (/TURN INVARIANT VIOLATED/.test(s)) { violations++; realLog('  ❌', s); } };

const { } = await import('./browser/fasttrack-core-v2.js');
const FTC = global.window.FastTrackCore;

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; realLog(`  ❌ ${n}`); } };

// Track the pointer every time it changes; verify each delta is 0 or 1.
const seatSeq = [];
function snapshotSeat() {
  const ci = FTC.state.players.get('current');
  if (seatSeq.length === 0 || seatSeq[seatSeq.length - 1] !== ci) seatSeq.push(ci);
}

FTC.initGame(4, { sessionPlayers: [
  { username: 'You', is_ai: false, slot: 0 },
  { username: 'B1', is_ai: true, slot: 1 },
  { username: 'B2', is_ai: true, slot: 2 },
  { username: 'B3', is_ai: true, slot: 3 },
]});

// Drive the human's seat whenever it's their turn; let bots play themselves.
let steps = 0;
const start = Date.now();
while (Date.now() - start < 8000) {
  await sleep(1);
  snapshotSeat();
  const st = FTC.state;
  if (st.meta.get('winner') != null) break;
  const players = st.players.get('list') || [];
  const ci = st.players.get('current') || 0;
  const cp = players[ci];
  const phase = st.turn.get('phase');
  if (cp && !cp.isBot) {
    if (phase === 'draw') { FTC.drawCard(); steps++; }
    else if (phase === 'move') {
      const vm = st.turn.get('validMoves') || [];
      if (vm.length) FTC.executeMove(0); else FTC.passTurn('test');
      steps++;
    }
  }
}

const N = 4;
let badDelta = 0;
for (let i = 1; i < seatSeq.length; i++) {
  const d = (seatSeq[i] - seatSeq[i - 1] + N) % N;
  if (d !== 1) badDelta++;   // between two DIFFERENT recorded seats the delta must be exactly 1
}
const winner = FTC.state.meta.get('winner');
// real progress: pegs must have left holding and be advancing toward home.
const players = FTC.state.players.get('list') || [];
let advanced = 0, homed = 0;
for (const p of players) for (const pg of (p.pegs || [])) {
  if (pg.holeType !== 'holding') advanced++;
  if (String(pg.holeId || '').startsWith('home-')) homed++;
}

console.log = realLog;
console.log('\n── v2 engine-backed solo game (turn integrity is the point) ──');
ok(seatSeq.length > 8, `game progressed through many seats (${seatSeq.length} pointer changes, ${steps} human actions)`);
ok(violations === 0, `turn verifier never tripped (assertAdvance violations: ${violations})`);
ok(badDelta === 0, `every seat change was exactly +1 clockwise — no skips (bad deltas: ${badDelta})`);
ok(advanced >= 4, `pegs left holding and are moving the board (${advanced} advanced, ${homed} home, winner=${winner})`);
console.log(`  seat order sample: ${seatSeq.slice(0, 16).join('→')}${seatSeq.length > 16 ? '…' : ''}`);
console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════\n`);
process.exit(fail ? 1 : 0);
