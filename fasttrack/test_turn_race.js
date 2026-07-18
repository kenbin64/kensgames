#!/usr/bin/env node
/**
 * ============================================================
 * TURN-ADVANCE EXACTLY-ONCE + NO-FREEZE TEST
 *
 * Two invariants, one test:
 *  1. SKIP guard: a move advances the seat EXACTLY ONCE even when the async
 *     completion fires multiple times. This is enforced at the source by the
 *     `advanced` latch inside waitForAll() (one advanceTurn per move), NOT by a
 *     persistent flag.
 *  2. NO-FREEZE: passTurn (the stuck-watchdog auto-pass / manual host advance)
 *     must ALWAYS advance a stalled turn — even right after a PREVIOUS turn
 *     resolved. A persistent "already advanced" flag used to leak across the turn
 *     boundary and swallow this pass, freezing the game (bug 2026-07-18: reached
 *     player 3, then "[PASS] Ignored — turn already resolved").
 *
 * Run: node fasttrack/test_turn_race.js
 * ============================================================
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

function setup(n){ buildCardMatrix();
  for(const h of (_core.CLOCKWISE_TRACK||[])) state.board.set(h,null);
  state.meta.set('winner',null);state.meta.set('gameMode','solo');state.meta.set('myUserId',null);
  const list=Array.from({length:n},(_,i)=>mkPlayer(i));
  state.players.set('list',list);state.players.set('current',0);
  const holes=['side-left-0-4','side-left-2-4','side-left-4-4'];
  for(let i=0;i<n;i++){ const peg=list[i].pegs[0]; peg.holeId=holes[i]; peg.holeType=_core.getHoleType(holes[i]); state.board.set(holes[i],{playerIdx:i,pegId:peg.id}); }
  _core.CutsceneManager.queueCutscene=function(){};
  state.turn.set('phase','draw'); state.turn.set('validMoves',[]); state.deck.set('discard',[]);
  return list;
}
const cur=()=>state.players.get('current');
function playCard(v){
  _core._drawCardCommit({id:`c-${v}-${cur()}`,value:v,display:`${v}♠`});
  const m=(state.turn.get('validMoves')||[]).length;
  if(m>0) _core.executeMove(0);
  return m;
}
const N=3;

// ── 1. SKIP guard: a move whose async completion fires TWICE advances once ──
console.log('\n── 1. doubled async completion advances the seat exactly once (no skip) ──');
{
  setup(N);
  // waitForAnimations that fires its callback TWICE — the classic double-fire that
  // used to skip a seat. The `advanced` latch in waitForAll must collapse it to one.
  global.window.waitForAnimations = (cb) => { cb(); cb(); };
  const before=cur();
  const moves=playCard('2');
  delete global.window.waitForAnimations;
  ok(moves>0, `1: a legal move existed (moves=${moves})`);
  ok(cur()===(before+1)%N, `1: seat ${before} -> ${cur()} = exactly +1 (doubled callback did NOT skip)`);
}

// ── 2. NO-FREEZE: passTurn after a PREVIOUS turn resolved still advances ──
//     (the exact bug: reach a later seat, then a stuck-pass must not be swallowed)
console.log('\n── 2. passTurn is never swallowed by a prior turn — it always advances ──');
{
  setup(N);
  // Resolve P0 with a real move so any (removed) "already advanced" state would be
  // set, then make the NEXT seat pass. The pass MUST advance, not freeze.
  playCard('2');                                   // P0 -> P1
  const before=cur();
  ok(before===1, `2: after P0's move, current is P1 (${before})`);
  (window.passTurn || _core.passTurn)('auto');     // P1 has drawn nothing / stuck-pass
  ok(cur()===(before+1)%N, `2: passTurn advanced P1 -> ${cur()} (NOT frozen)`);
}

// ── 3. NO-FREEZE across a full lap: every seat can pass without freezing ──
console.log('\n── 3. consecutive passTurns walk the table, never freezing ──');
{
  setup(N);
  let sHead=cur();
  let frozen=false;
  for(let i=0;i<6;i++){
    const b=cur();
    (window.passTurn || _core.passTurn)('auto');
    if(cur()!==(b+1)%N){ ok(false,`3: pass ${i+1}: ${b} -> ${cur()} (expected ${(b+1)%N}) FROZEN/WRONG`); frozen=true; break; }
  }
  if(!frozen) ok(true, `3: 6 consecutive passes each advanced +1, no freeze (start seat ${sHead})`);
}

// ── 4. redraw stays on the same seat, then a normal card advances once ──
console.log('\n── 4. redraw keeps the seat; the next normal card advances +1 ──');
{
  setup(N);
  const before=cur();
  playCard('J');                                   // redraw: same seat, phase back to draw
  ok(cur()===before && state.turn.get('phase')==='draw', `4: redraw kept seat ${before}, phase=draw`);
  playCard('2');                                   // normal card
  ok(cur()===(before+1)%N, `4: after the redraw, a normal card advanced ${before} -> ${cur()} (+1)`);
}

console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════\n`);
process.exit(fail?1:0);
