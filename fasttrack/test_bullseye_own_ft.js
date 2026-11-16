#!/usr/bin/env node
/**
 * ONE-STEP CARD INTO THE BULLSEYE FROM ANY FAST-TRACK HOLE (Ken, 2026-11-15)
 *
 * "Any time you are on fast track a single move card can put you on the bullseye," including
 * from the player's own colour's ft hole. Reported from play: a peg on its own ft hole drew a
 * royal and was not offered the bullseye, because the retired BULL_NO_FROM_OWN_FT still held.
 *
 * Also pins what must still NOT happen: no bullseye without fast-track status, none on a
 * backward 4, none straight after leaving the bullseye, none onto an own peg already there.
 *
 * Run: node fasttrack/test_bullseye_own_ft.js
 */
const fs = require('fs');
const path = require('path');
class StubEl { constructor(){ this.innerHTML='';this.textContent='';this.style={};this.disabled=false;
  this.classList={add(){},remove(){},contains(){return false;},toggle(){}}; }
  appendChild(){} setAttribute(){} removeChild(){} remove(){} addEventListener(){} removeEventListener(){}
  querySelector(){return null;} querySelectorAll(){return [];} contains(){return false;}
  getBoundingClientRect(){return {left:0,top:0,width:0,height:0};} }
const _els=new Map();
global.document={getElementById:id=>{if(!_els.has(id))_els.set(id,new StubEl());return _els.get(id);},
  createElement:()=>new StubEl(),querySelector:()=>null,querySelectorAll:()=>[],body:new StubEl(),head:new StubEl(),addEventListener:()=>{},readyState:'complete'};
function mkStore(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear()};}
global.localStorage=mkStore();global.sessionStorage=mkStore();
global.window={dispatchEvent:()=>{},addEventListener:()=>{},setTimeout,clearTimeout,setInterval,clearInterval,
  requestAnimationFrame:cb=>setTimeout(cb,0),cancelAnimationFrame:id=>clearTimeout(id),
  matchMedia:()=>({matches:true}),localStorage:global.localStorage,sessionStorage:global.sessionStorage};
global.CustomEvent=class{constructor(t,i={}){this.type=t;this.detail=i.detail;}};
global.requestAnimationFrame=global.window.requestAnimationFrame;

const print = console.log;
console.log = () => {}; console.warn = () => {};   // the engine is chatty; keep only the results
eval(fs.readFileSync(path.join(__dirname, 'fasttrack-game-core.js'), 'utf8').replace(/window\.FastTrackCore\s*=/, 'globalThis.__core ='));
const core = globalThis.__core, state = core.state;
const PEGS = core.PEGS_PER_PLAYER || 5;

let pass = 0, fail = 0;
const ok = (condition, name) => { if (condition) { pass++; print(`  PASS  ${name}`); } else { fail++; print(`  FAIL  ${name}`); } };

const makePeg = (player, n) => ({ id: `p${player}-peg${n}`, holeId: 'holding', holeType: 'holding', nickname: 'Peg',
  onFasttrack: false, eligibleForSafeZone: false, lockedToSafeZone: false, completedCircuit: false,
  fasttrackEntryHole: null, mustExitFasttrack: false, personality: 'CHEERFUL', mood: 'EAGER',
  captureCount: 0, timesCaptured: 0, rivalPegId: null });

// Player 0 sits at board position 0, so its own ft hole is ft-0. Returns the moves offered.
function movesFor(hole, card, pegSetup = {}, bullseyeOwner = null) {
  buildCardMatrix();
  for (const h of (core.CLOCKWISE_TRACK || [])) state.board.set(h, null);
  state.board.set('bullseye', null);
  state.meta.set('winner', null); state.meta.set('gameMode', 'solo');
  const players = [0, 1].map(i => ({ index: i, name: `P${i}`, avatar: 'x', color: '#abcdef',
    boardPosition: i === 0 ? 0 : 3, isBot: i > 0, pegs: Array.from({ length: PEGS }, (_, n) => makePeg(i, n)) }));
  const peg = Object.assign(players[0].pegs[0], { holeId: hole, holeType: core.getHoleType(hole),
    onFasttrack: true, fasttrackEntryHole: hole }, pegSetup);
  state.board.set(hole, { playerIdx: 0, pegId: peg.id });
  if (bullseyeOwner !== null) {
    const sitter = players[bullseyeOwner].pegs[1];
    sitter.holeId = 'bullseye'; sitter.holeType = 'bullseye';
    state.board.set('bullseye', { playerIdx: bullseyeOwner, pegId: sitter.id });
  }
  state.players.set('list', players); state.players.set('current', 0);
  state.turn.set('phase', 'draw'); state.turn.set('validMoves', []); state.turn.set('leaveFastTrack', false);
  state.deck.set('discard', []);
  core._drawCardCommit({ id: `c-${hole}-${card}-${Math.random()}`, value: card, display: card });
  return state.turn.get('validMoves') || [];
}
const offersBullseye = (moves) => moves.some(m => m.type === 'enterBullseye' && m.pegIdx === 0);

print('\n-- on its own ft hole (ft-0), with fast-track status, every one-step card offers the bullseye --');
for (const card of ['A', 'J', 'Q', 'K', 'JOKER']) ok(offersBullseye(movesFor('ft-0', card)), `own ft-0, ${card}: bullseye offered`);

print('\n-- from the own ft hole the walk into the home stretch is still shown, beside the bullseye --');
for (const card of ['A', 'K']) {
  const moves = movesFor('ft-0', card);
  ok(moves.some(m => m.pegIdx === 0 && m.type === 'exitFastTrack'),
    `own ft-0, ${card}: the home-stretch move is offered too, not hidden behind "Leave fast track"`);
}

print('\n-- on another colour\'s ft hole, unchanged --');
for (const card of ['A', 'J', 'Q', 'K', 'JOKER']) ok(offersBullseye(movesFor('ft-2', card)), `foreign ft-2, ${card}: bullseye offered`);

print('\n-- what must still not happen --');
ok(!offersBullseye(movesFor('ft-0', 'K', { onFasttrack: false })), 'no fast-track status: no bullseye');
ok(!offersBullseye(movesFor('ft-0', '4')), 'a backward 4: no bullseye');
ok(!offersBullseye(movesFor('ft-0', '2')), 'a two-step card: no bullseye');
ok(!offersBullseye(movesFor('ft-0', 'A', { onFasttrack: false, mustExitFasttrack: true })),
  'just left the bullseye onto own ft (status cleared): no straight return');
ok(!offersBullseye(movesFor('ft-0', 'Q', {}, 0)), 'own peg already on the bullseye: no bullseye');
ok(offersBullseye(movesFor('ft-0', 'Q', {}, 1)), 'opponent on the bullseye: offered (it gets cut)');

print(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
