#!/usr/bin/env node
/**
 * DOUBLE-ADVANCE / SKIP GUARD TEST (bug 2026-07-18e)
 *
 * "Still skips sometimes, seems random." Cause: the DIRECT endTurn() callers
 * (bot no-move, no-legal-move auto-pass, watchdog, host) were not epoch-verified,
 * so a duplicate/stale one advanced a SECOND time and skipped a seat.
 *
 * Fix: endTurn(epoch) is the single verified choke point — every caller passes
 * the epoch of the turn it is resolving; a call whose epoch has moved on is
 * dropped. This test calls endTurn twice with the SAME epoch and asserts the seat
 * advances only ONCE, then advances again only with the fresh epoch.
 *
 * Run: node fasttrack/test_turn_double_advance.js
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
global.Event=global.Event||class{constructor(t){this.type=t;}};
global.requestAnimationFrame=global.window.requestAnimationFrame;global.cancelAnimationFrame=global.window.cancelAnimationFrame;
const coreSrc=fs.readFileSync(path.join(__dirname,'fasttrack-game-core.js'),'utf8').replace(/window\.FastTrackCore\s*=/,'globalThis.__core =');
eval(coreSrc);
const _core=globalThis.__core, state=_core.state;

const PEGS=_core.PEGS_PER_PLAYER||5;
const mkPeg=(i,p)=>({id:`p${i}-peg${p}`,holeId:'holding',holeType:'holding',nickname:'Peg',onFasttrack:false,eligibleForSafeZone:false,lockedToSafeZone:false,completedCircuit:false,fasttrackEntryHole:null,mustExitFasttrack:false,personality:'CHEERFUL',mood:'EAGER',captureCount:0,timesCaptured:0,rivalPegId:null});
const mkPlayer=i=>({index:i,name:`P${i}`,avatar:'🎮',userId:null,color:'#abcdef',boardPosition:i,isBot:false,pegs:Array.from({length:PEGS},(_,p)=>mkPeg(i,p))});

let pass=0, fail=0;
const ok=(c,n)=>{ if(c){pass++;console.log(`  ✅ ${n}`);} else {fail++;console.log(`  ❌ ${n}`);} };

buildCardMatrix();
state.meta.set('winner',null); state.meta.set('gameMode','solo'); state.meta.set('myUserId',null);
const N=4;
state.players.set('list', Array.from({length:N},(_,i)=>mkPlayer(i)));
state.players.set('current', 0);
const cur=()=>state.players.get('current');
const epoch=()=>window._getTurnEpoch();

console.log('\n── endTurn is epoch-verified: a duplicate/stale advance is dropped ──');
{
  const e0 = epoch();
  _core.endTurn(e0);                       // legitimate advance 0 -> 1
  ok(cur()===1, `first endTurn(epoch=${e0}) advanced 0 -> ${cur()}`);
  ok(epoch() === e0 + 1, `epoch bumped ${e0} -> ${epoch()}`);

  _core.endTurn(e0);                       // DUPLICATE with the old epoch — must be dropped
  ok(cur()===1, `duplicate endTurn(epoch=${e0}) DROPPED -> still ${cur()} (no skip to 2)`);

  _core.endTurn(epoch());                  // fresh epoch — advances 1 -> 2
  ok(cur()===2, `endTurn(freshEpoch) advanced 1 -> ${cur()}`);
}

console.log('\n── a whole lap: each seat advances exactly once, no skips ──');
{
  state.players.set('current', 0);
  const start = cur();
  const seen = [start];
  for (let i=0;i<N;i++){ _core.endTurn(epoch()); seen.push(cur()); }
  // After N advances from seat 0 we should have visited 1,2,3,0 in order.
  const expected = [0,1,2,3,0];
  ok(JSON.stringify(seen)===JSON.stringify(expected), `round-robin exact: ${seen.join('→')} (expected ${expected.join('→')})`);
}

console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════\n`);
process.exit(fail?1:0);
