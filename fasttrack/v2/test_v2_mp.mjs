// Adapter multiplayer control logic: driver guards, delta broadcast, and echo suppression.
// The engine-level lockstep determinism is proven separately (tests/netcode-determinism.test.js);
// this exercises the NEW relay layer in the browser adapter with a mock KGMultiplayer client:
//   - the seat's owner (or host of a bot seat) originates + broadcasts draw/move/pass,
//   - a client whose seat it is NOT never draws/moves locally,
//   - applyRemoteAction replays a peer's delta WITHOUT re-broadcasting it (no echo),
//   - the turn pointer advances identically from the applied deltas (no turn_advance message).
// Run: node fasttrack/v2/test_v2_mp.mjs
const realSetTimeout = setTimeout;
const sleep = (ms) => new Promise((r) => realSetTimeout(r, ms));

// ── minimal browser stubs (same shape as test_v2_solo.mjs) ──
class El { constructor(){ this.innerHTML=''; this.textContent=''; this.style={ setProperty(){}, removeProperty(){} };
  this.disabled=false; this.classList={ add(){},remove(){},toggle(){},contains(){return false;} }; }
  setAttribute(){} getAttribute(){return null;} appendChild(){} }
const els = new Map();
const store = () => { const m=new Map(); return { getItem:(k)=>m.has(k)?m.get(k):null, setItem:(k,v)=>m.set(k,String(v)), removeItem:(k)=>m.delete(k) }; };
global.setTimeout = (fn, ms) => realSetTimeout(fn, Math.min(ms || 0, 1));   // collapse pacing
global.window = global;
global.document = { getElementById: (id) => { if(!els.has(id)) els.set(id, new El()); return els.get(id); }, createElement: () => new El() };
global.localStorage = store();
global.showYourTurnPopup = () => {}; global.dismissYourTurnPopup = () => {};
global.highlightMovePaths = () => {}; global.showReplayPrompt = null; global.ManifoldAudio = null;

const { } = await import('./browser/fasttrack-core-v2.js');
const FTC = global.window.FastTrackCore;

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const seat = () => FTC.state.players.get('current');
const phase = () => FTC.state.turn.get('phase');

// A mock relay client: records every outbound delta so we can assert what was (and was not) sent.
const sent = [];
const mock = { userId: 'me', isHost: true, session: { host_id: 'me' }, sendAction: (action, payload) => sent.push({ action, payload }) };

// Two humans: seat 0 is me, seat 1 is the peer. Explicit startingPlayer=0 so I open.
FTC.initGame(2, {
  gameMode: 'multiplayer',
  sessionSeed: 'mp-test-seed',
  startingPlayer: 0,
  sessionPlayers: [
    { username: 'Me',   is_ai: false, user_id: 'me',   slot: 0 },
    { username: 'Peer', is_ai: false, user_id: 'peer', slot: 1 },
  ],
});
FTC.setMultiplayerClient(mock);
FTC.setMyUserId('me');
await sleep(30);   // let the opening kickTurn settle

console.log('\n== my own seat: I originate and broadcast ==');
ok(seat() === 0, `opened on my seat (seat ${seat()})`);
sent.length = 0;
FTC.drawCard();
const drewMine = sent.find((m) => m.action === 'draw');
ok(!!drewMine && phase() === 'move', 'my draw drew locally AND broadcast a draw delta');   // engine 'play' → render 'move'
ok(drewMine && drewMine.payload && drewMine.payload.card, 'the draw delta carries the card');

const myMoves = FTC.state.turn.get('validMoves') || [];
sent.length = 0;
if (myMoves.length) {
  FTC.executeMove(0);
  const movedMine = sent.find((m) => m.action === 'move');
  ok(!!movedMine && movedMine.payload && movedMine.payload.move, 'my move broadcast a move delta carrying the engine move');
  ok(seat() === 1, `applying my own move rotated the pointer to the peer (seat ${seat()}) with no turn_advance message`);
} else {
  await sleep(20);   // dead card auto-passes
  ok(sent.some((m) => m.action === 'pass'), 'my dead card broadcast a pass delta');
  ok(seat() === 1, `pass rotated the pointer to the peer (seat ${seat()})`);
}

console.log('\n== the peer\'s seat: I must NOT act locally, and applying their delta must not echo ==');
sent.length = 0;
const phaseBefore = phase();
FTC.drawCard();                       // it is the peer's turn — my client must ignore this
ok(sent.length === 0 && phase() === phaseBefore, 'on the peer\'s turn my local drawCard is ignored (no draw, no broadcast)');

sent.length = 0;
FTC.applyRemoteAction('draw', {});   // the peer drew — replay it (the deterministic deck picks the card)
ok(phase() === 'move', 'applying the peer\'s draw advances my engine to the play phase');
ok(sent.length === 0, 'applying a remote delta does NOT re-broadcast it (no echo)');

sent.length = 0;
const before = JSON.stringify([seat(), phase()]);
FTC.applyRemoteAction('pass', {});    // the peer forfeits the drawn card — replay it
ok(sent.length === 0, 'applying a remote pass does not echo either');
// the pass resolves the card: either the pointer rotates, or (a redraw card) the same seat re-draws.
ok(JSON.stringify([seat(), phase()]) !== before, 'applying the peer\'s pass resolved the card (turn state changed)');

console.log('\n== snapshot counter-gating: a STALE host snapshot must not revert an advanced client ==');
{
  const stale = FTC.getStateSnapshot();          // capture at applied = A
  FTC.applyRemoteAction('draw', {});             // advance two deltas
  FTC.applyRemoteAction('pass', {});
  const advanced = FTC.getStateSnapshot();       // applied = B > A
  ok(advanced.applied > stale.applied, `the game advanced past the snapshot (applied ${stale.applied} -> ${advanced.applied})`);
  FTC.applyStateSnapshot(stale);                 // the host's periodic 5s snapshot, now stale — MUST be ignored
  ok(FTC.getStateSnapshot().applied === advanced.applied, 'stale snapshot ignored — the client did NOT revert (the mid-game jitter fix)');
  // a snapshot AHEAD of us (a genuine catch-up after a missed delta) IS adopted
  const ahead = FTC.getStateSnapshot(); ahead.applied = advanced.applied + 3;
  FTC.applyStateSnapshot(ahead);
  ok(FTC.getStateSnapshot().applied === advanced.applied + 3, 'an ahead snapshot IS adopted (catch-up / late-join still works)');
}

console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════\n`);
process.exit(fail ? 1 : 0);
