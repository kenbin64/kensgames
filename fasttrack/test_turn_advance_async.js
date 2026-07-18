#!/usr/bin/env node
/**
 * REPRO: turn-advance FREEZE after the 2nd player's turn (Ken 2026-07-18,
 * no console error). Earlier turn tests ran the advance SYNCHRONOUSLY (no
 * window.waitForAnimations defined). The real game gates the advance behind an
 * ASYNC window.waitForAnimations -> CutsceneManager.whenDrained. This drives
 * multiple turns through that async path and detects a stuck turn.
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

// ── KEY: define an ASYNC window.waitForAnimations, like the real 3D layer. ──
// The real one resolves when peg-hop animations finish; here we resolve on a
// short timer so the advance goes through the deferred path, not synchronously.
global.window.waitForAnimations = (cb) => setTimeout(cb, 3);
global.window.isPlayResolving = () => false;

const PEGS=_core.PEGS_PER_PLAYER||5;
const mkPeg=(i,p)=>({id:`p${i}-peg${p}`,holeId:'holding',holeType:'holding',nickname:'Peg',onFasttrack:false,eligibleForSafeZone:false,lockedToSafeZone:false,completedCircuit:false,fasttrackEntryHole:null,mustExitFasttrack:false,personality:'CHEERFUL',mood:'EAGER',captureCount:0,timesCaptured:0,rivalPegId:null});
const mkPlayer=i=>({index:i,name:`P${i}`,avatar:'🎮',userId:null,color:'#abcdef',boardPosition:i,isBot:false,pegs:Array.from({length:PEGS},(_,p)=>mkPeg(i,p))});

function setup(n){ buildCardMatrix();
  for(const h of (_core.CLOCKWISE_TRACK||[])) state.board.set(h,null);
  state.meta.set('winner',null);state.meta.set('gameMode','solo');state.meta.set('myUserId',null);
  const list=Array.from({length:n},(_,i)=>mkPlayer(i));
  state.players.set('list',list);state.players.set('current',0);
  const holes=['side-left-0-4','side-left-2-4','side-left-4-4'];
  for(let i=0;i<n;i++){ const peg=list[i].pegs[0]; peg.holeId=holes[i]; peg.holeType=_core.getHoleType(holes[i]); state.board.set(holes[i],{playerIdx:i,pegId:peg.id}); }
  // Real CutsceneManager, but drain instantly so we isolate the ASYNC advance
  // gating (whenDrained fires immediately when nothing is queued).
  _core.CutsceneManager.queueCutscene=function(){};
  state.turn.set('phase','draw'); state.turn.set('validMoves',[]); state.deck.set('discard',[]);
  return list;
}
const cur=()=>state.players.get('current');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// Force a specific card, execute the first legal move, then wait for the async
// advance to land (poll current until it changes, or timeout = FREEZE).
async function playTurn(cardValue){
  const before=cur();
  _core._drawCardCommit({id:`c-${cardValue}-${Math.floor(before)}`,value:cardValue,display:`${cardValue}♠`});
  const vm=state.turn.get('validMoves')||[];
  const moves=vm.length;
  if(moves>0) _core.executeMove(0);
  // wait up to 400ms for the async advance
  const deadline=Date.now()+400;
  while(cur()===before && state.turn.get('phase')!=='draw'){
    if(Date.now()>deadline) break;
    await sleep(5);
  }
  // For a non-redraw the seat must change; give the async path a beat.
  await sleep(15);
  return {before, after:cur(), moves, phase:state.turn.get('phase')};
}

(async ()=>{
  const N=3; setup(N);
  console.log(`=== drive ${N} players through the ASYNC advance path ===`);
  const cards=['2','3','5','2','3','5','2','3'];  // all non-redraw: each must +1
  let frozen=false;
  for(let t=0;t<cards.length;t++){
    const c=cards[t];
    const r=await playTurn(c);
    const expected=(r.before+1)%N;
    const ok = r.after===expected;
    console.log(`  turn ${t+1}: P${r.before} card ${c} moves=${r.moves} -> P${r.after} (expected P${expected}) phase=${r.phase} ${ok?'OK':'*** FROZE/WRONG ***'}`);
    if(!ok){ frozen=true; break; }
  }
  console.log(frozen ? '\nRESULT: TURN FROZE (reproduced).' : '\nRESULT: all turns advanced (no freeze).');
  process.exit(frozen?1:0);
})();
