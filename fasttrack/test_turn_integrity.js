#!/usr/bin/env node
/**
 * FULL-GAME TURN-INTEGRITY TEST
 *
 * Drives a long game through the REAL async turn machine (async waitForAnimations
 * + real CutsceneManager.whenDrained), mixing:
 *   - normal cards      → advance exactly one seat
 *   - replay cards      → SAME seat draws again (A,6,J,Q,K,JOKER)
 *   - no-legal-move     → forfeit (advance one seat) via passTurn
 * and asserts, every single turn, that the seat moves EXACTLY as the rules
 * require — never a skip (+2), never a stall, never a double. This is the
 * regression guard for "turns keep breaking".
 *
 * Run: node fasttrack/test_turn_integrity.js
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
// ASYNC animation completion, like the real 3D layer.
global.window.waitForAnimations=(cb)=>setTimeout(cb,2);
global.window.isPlayResolving=()=>false;

const PEGS=_core.PEGS_PER_PLAYER||5;
const mkPeg=(i,p)=>({id:`p${i}-peg${p}`,holeId:'holding',holeType:'holding',nickname:'Peg',onFasttrack:false,eligibleForSafeZone:false,lockedToSafeZone:false,completedCircuit:false,fasttrackEntryHole:null,mustExitFasttrack:false,personality:'CHEERFUL',mood:'EAGER',captureCount:0,timesCaptured:0,rivalPegId:null});
const mkPlayer=i=>({index:i,name:`P${i}`,avatar:'🎮',userId:null,color:'#abcdef',boardPosition:i,isBot:false,pegs:Array.from({length:PEGS},(_,p)=>mkPeg(i,p))});

let pass=0, fail=0;
const ok=(c,n)=>{ if(c){pass++;} else {fail++;console.log(`  ❌ ${n}`);} };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const N=4;
function setup(){ buildCardMatrix();
  for(const h of (_core.CLOCKWISE_TRACK||[])) state.board.set(h,null);
  state.meta.set('winner',null);state.meta.set('gameMode','solo');state.meta.set('myUserId',null);
  const list=Array.from({length:N},(_,i)=>mkPlayer(i));
  state.players.set('list',list);state.players.set('current',0);
  const holes=['side-left-0-4','side-left-2-4','side-left-4-4','side-right-1-4'];
  for(let i=0;i<N;i++){ const peg=list[i].pegs[0]; const h=holes[i]; peg.holeId=h; peg.holeType=_core.getHoleType(h); state.board.set(h,{playerIdx:i,pegId:peg.id}); }
  _core.CutsceneManager.queueCutscene=function(){};
  state.turn.set('phase','draw'); state.turn.set('validMoves',[]); state.deck.set('discard',[]);
}
const cur=()=>state.players.get('current');
async function settle(before,expect){
  const deadline=Date.now()+400;
  while(Date.now()<deadline){ if(cur()===expect && state.turn.get('phase')==='draw') break; await sleep(4); }
  await sleep(8);
}

(async()=>{
  setup();
  const REPLAY=new Set(['A','6','J','Q','K','JOKER']);
  // A long, deterministic mix of cards (some replay, some not).
  const deck=['2','5','A','3','6','8','J','4','9','2','Q','5','7','K','3','2','6','10','A','5','9','J','4','8'];
  let mismatches=0, turns=0;
  for(let i=0;i<deck.length;i++){
    const card=deck[i];
    const before=cur();
    const isReplay=REPLAY.has(card);
    _core._drawCardCommit({id:`c-${card}-${i}`,value:card,display:`${card}♠`});
    const vm=(state.turn.get('validMoves')||[]).length;
    let expect;
    if(vm>0){ _core.executeMove(0); expect = isReplay ? before : (before+1)%N; }
    else    { (window.passTurn||_core.passTurn)('no-move'); expect = (before+1)%N; }   // forfeit → advance
    await settle(before,expect);
    turns++;
    const good = cur()===expect;
    if(!good){ mismatches++; console.log(`  ❌ turn ${turns}: card ${card} (${vm>0?(isReplay?'replay':'move'):'no-move'}) seat ${before} -> ${cur()} (expected ${expect})`); }
    ok(good, `turn ${turns}`);
  }
  console.log(`\n  drove ${turns} turns through the async machine; ${mismatches} skips/mis-advances.`);
  console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════\n`);
  process.exit(fail?1:0);
})();
