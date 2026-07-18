#!/usr/bin/env node
/**
 * STALE-ADVANCE / RUNAWAY TEST (bug 2026-07-18b)
 *
 * A move's turn-advance is gated behind async hand-offs (animation done, cutscene
 * drain) plus a safety-timeout fallback. If one of those fires LATE — after play
 * has already rotated on (e.g. a bot's move resolving after the table cycled back
 * to the human) — the stale callback must NOT advance the now-current player.
 * Without that guard a single draw set off an endless cascade that advanced every
 * seat including the human, over and over ("still not relinquishing the correct
 * turns", the human never got to play).
 *
 * Fix: waitForAll captures _turnSeq for the move; advanceOnce drops the advance if
 * the sequence has moved on. This test defers a move's advance, rotates the turn
 * by another path, THEN fires the stale callback and asserts it is ignored.
 *
 * Run: node fasttrack/test_turn_stale_advance.js
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
global.window.isPlayResolving=()=>false;

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
const N=3;

console.log('\n── a DELAYED move-advance that fires after the turn moved on is DROPPED ──');
{
  setup(N);
  // Defer P0's move-advance: capture the animation-done callback instead of firing it.
  let captured=null;
  global.window.waitForAnimations=(cb)=>{ captured=cb; };
  // P0 plays a move — the advance is now pending (gated on `captured`).
  _core._drawCardCommit({id:'c-2-p0',value:'2',display:'2♠'});
  if((state.turn.get('validMoves')||[]).length>0) _core.executeMove(0);
  ok(cur()===0, `P0's move made; advance still pending (current=${cur()})`);

  // Meanwhile the turn rotates on by another path (as the real cascade does).
  delete global.window.waitForAnimations;   // let the direct endTurn resolve normally
  _core.endTurn();                          // P0 -> P1
  ok(cur()===1, `turn rotated by another path: P0 -> ${cur()}`);

  // NOW the stale P0 callback finally fires. It must NOT advance P1.
  if(captured) captured();
  ok(cur()===1, `stale P0 advance fired late -> current STILL ${cur()} (not skipped to 2)`);
}

console.log('\n── a NON-stale deferred advance still works (no false rejection) ──');
{
  setup(N);
  let captured=null;
  global.window.waitForAnimations=(cb)=>{ captured=cb; };
  _core._drawCardCommit({id:'c-2-p0b',value:'2',display:'2♠'});
  if((state.turn.get('validMoves')||[]).length>0) _core.executeMove(0);
  ok(cur()===0, `P0's move made; advance pending (current=${cur()})`);
  // Fire the callback normally (turn has NOT moved on) — it should advance P0 -> P1.
  _core.CutsceneManager.queueCutscene=function(){};
  if(captured) captured();
  ok(cur()===1, `deferred advance fired in-order -> P0 -> ${cur()} (+1, not dropped)`);
}

console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════\n`);
process.exit(fail?1:0);
