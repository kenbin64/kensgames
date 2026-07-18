#!/usr/bin/env node
/**
 * TURN-FREEZE GUARD TEST
 *
 * Bug (Ken 2026-07-18): after a player's turn the game FREEZES when it should
 * relinquish to the next player — no console error. Root cause: the turn-enable
 * gate in _applyTurnAdvance waits on CameraDirector.whenSettled(startBlink) ->
 * blinkPlayerMarker -> enableTurn. whenSettled used a single callback slot that
 * a deferred peg-animation could clobber, and it never fires if the camera never
 * settles. Either way enableTurn is lost and the next player can never act; the
 * stuck-watchdog can't help because phase is 'draw'.
 *
 * Fix: whenSettled is now a queue (no clobber), AND the gate has a timeout
 * fallback so enableTurn ALWAYS runs even if the camera never reports settled.
 *
 * This test simulates a PERMANENTLY stuck camera (whenSettled never fires) and
 * asserts the next player's turn still enables (draw button re-enabled) via the
 * fallback — i.e. no freeze.
 *
 * Run: node fasttrack/test_turn_freeze_guard.js
 */
const fs = require('fs');
const path = require('path');
class StubEl { constructor(){ this.innerHTML='';this.textContent='';this.style={};this.disabled=false;
  this.classList={add(){},remove(){},contains(){return false;},toggle(){}}; }
  appendChild(){} setAttribute(){} removeChild(){} remove(){} addEventListener(){} removeEventListener(){}
  querySelector(){return null;} querySelectorAll(){return [];} contains(){return false;}
  getBoundingClientRect(){return {left:0,top:0,width:0,height:0};} }
const _els=new Map();
const _getEl=id=>{ if(!_els.has(id))_els.set(id,new StubEl()); return _els.get(id); };
global.document={getElementById:_getEl,createElement:()=>new StubEl(),querySelector:()=>null,querySelectorAll:()=>[],body:new StubEl(),head:new StubEl(),addEventListener:()=>{},readyState:'complete'};
function mkStore(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear()};}
global.localStorage=mkStore();global.sessionStorage=mkStore();
global.window={dispatchEvent:()=>{},addEventListener:()=>{},setTimeout,clearTimeout,setInterval,clearInterval,
  requestAnimationFrame:cb=>setTimeout(cb,0),cancelAnimationFrame:id=>clearTimeout(id),
  matchMedia:()=>({matches:true}),localStorage:global.localStorage,sessionStorage:global.sessionStorage};
global.CustomEvent=class{constructor(t,i={}){this.type=t;this.detail=i.detail;}};
global.Event=global.Event||class{constructor(t){this.type=t;}};
global.requestAnimationFrame=global.window.requestAnimationFrame;global.cancelAnimationFrame=global.window.cancelAnimationFrame;

// ── A PERMANENTLY STUCK camera: whenSettled NEVER fires its callback. Without
//    the timeout fallback this reproduces the freeze; with it, the turn enables.
global.window.CameraDirector = {
  mode: 'auto',
  whenSettled(/* cb */) { /* intentionally never fires — simulate a stuck camera */ },
  setActivePlayer() {},
};
// Track whether the enable-gate actually reached startBlink -> blinkPlayerMarker.
// This is the TRUE freeze indicator: for a bot next-seat, enableTurn (reached
// only through here) is the sole trigger of botTurn, so if this never fires the
// game freezes. (The draw button is not a valid indicator — updateUI re-enables
// it synchronously, which is why humans survive but bots freeze.)
let blinkCalled = false;
global.window.blinkPlayerMarker = (idx, onDone) => { blinkCalled = true; if (onDone) onDone(); };

const coreSrc=fs.readFileSync(path.join(__dirname,'fasttrack-game-core.js'),'utf8').replace(/window\.FastTrackCore\s*=/,'globalThis.__core =');
eval(coreSrc);
const _core=globalThis.__core, state=_core.state;

const PEGS=_core.PEGS_PER_PLAYER||5;
const mkPeg=(i,p)=>({id:`p${i}-peg${p}`,holeId:'holding',holeType:'holding',nickname:'Peg',onFasttrack:false,eligibleForSafeZone:false,lockedToSafeZone:false,completedCircuit:false,fasttrackEntryHole:null,mustExitFasttrack:false,personality:'CHEERFUL',mood:'EAGER',captureCount:0,timesCaptured:0,rivalPegId:null});
const mkPlayer=(i,isBot)=>({index:i,name:`P${i}`,avatar:'🎮',userId:null,color:'#abcdef',boardPosition:i,isBot:!!isBot,pegs:Array.from({length:PEGS},(_,p)=>mkPeg(i,p))});

let pass=0, fail=0;
const ok=(c,n)=>{ if(c){pass++;console.log(`  ✅ ${n}`);} else {fail++;console.log(`  ❌ ${n}`);} };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  buildCardMatrix();
  state.meta.set('winner',null); state.meta.set('gameMode','solo'); state.meta.set('myUserId',null);
  const list=[mkPlayer(0,false), mkPlayer(1,false)]; // both human so enableTurn re-enables the draw button
  state.players.set('list',list); state.players.set('current',0);
  state.turn.set('phase','move'); state.turn.set('validMoves',[]);

  console.log('\n── Stuck camera (whenSettled never fires): the turn must still enable ──');
  _core.endTurn();                       // P0 -> P1; runs the camera-gated enable path

  ok(state.players.get('current')===1, `seat advanced 0 -> ${state.players.get('current')} (rotation is synchronous)`);
  ok(blinkCalled===false, 'immediately after: enable-gate has NOT fired (camera stuck, settle pending)');

  await sleep(1400);                     // > the 1200ms fallback

  ok(blinkCalled===true, 'after the fallback: enable-gate FIRED despite the stuck camera — bot/human can act, no freeze');

  console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════\n`);
  process.exit(fail?1:0);
})();
