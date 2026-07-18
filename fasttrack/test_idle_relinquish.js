#!/usr/bin/env node
/**
 * IDLE-RELINQUISH TEST (user_directive_2026-07-18)
 *
 * Fast Track has NO voluntary passes. The only way a turn is taken from a player
 * is host abandonment-recovery, staged fairly:
 *   idle 2 min -> 30s WARNING (host button visible but DISABLED) -> button ENABLES
 *   -> host may relinquish the idle player to a bot and advance (or keep waiting).
 * Any action by the player cancels it. Only with 2+ humans.
 *
 * This drives the state machine with short (meta-overridden) timers and asserts:
 *   - button hidden while active
 *   - after warnMs: WARNING stage, button visible + DISABLED
 *   - after warnMs+winMs: RELINQUISHABLE, button visible + ENABLED
 *   - hostRelinquishToBot(): player becomes a bot AND the turn advances
 *   - a player action (sig change) cancels the whole thing
 *
 * Run: node fasttrack/test_idle_relinquish.js
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
const coreSrc=fs.readFileSync(path.join(__dirname,'fasttrack-game-core.js'),'utf8').replace(/window\.FastTrackCore\s*=/,'globalThis.__core =');
eval(coreSrc);
const _core=globalThis.__core, state=_core.state;

const PEGS=_core.PEGS_PER_PLAYER||5;
const mkPeg=(i,p)=>({id:`p${i}-peg${p}`,holeId:'holding',holeType:'holding',nickname:'Peg',onFasttrack:false,eligibleForSafeZone:false,lockedToSafeZone:false,completedCircuit:false,fasttrackEntryHole:null,mustExitFasttrack:false,personality:'CHEERFUL',mood:'EAGER',captureCount:0,timesCaptured:0,rivalPegId:null});
const mkPlayer=(i,name)=>({index:i,name:name||`P${i}`,avatar:'🎮',userId:`u${i}`,color:'#abcdef',boardPosition:i,isBot:false,pegs:Array.from({length:PEGS},(_,p)=>mkPeg(i,p))});

let pass=0, fail=0;
const ok=(c,n)=>{ if(c){pass++;console.log(`  ✅ ${n}`);} else {fail++;console.log(`  ❌ ${n}`);} };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const btn=_getEl('btn-pass-turn');

(async()=>{
  buildCardMatrix();
  state.meta.set('winner',null);
  state.meta.set('gameMode','same-screen');          // 2 humans, one device = local authority
  state.meta.set('myUserId','u0');
  state.meta.set('idleWarnMs', 40);                  // short timers for the test
  state.meta.set('idleWarnWindowMs', 40);
  const list=[mkPlayer(0,'Alice'), mkPlayer(1,'Bob')];
  state.players.set('list',list);
  state.players.set('current',0);
  state.turn.set('phase','draw'); state.turn.set('validMoves',[]); state.deck.set('currentCard',null);
  btn.style.display='none';                            // matches the HTML default (hidden)

  console.log('\n── idle-relinquish state machine (Alice idles on her turn) ──');
  window._idleTick();                                 // t0: arm the idle clock
  ok(btn.style.display==='none', `start: host button hidden (Alice just started, not idle)`);

  await sleep(55);
  window._idleTick();                                 // > warnMs, < warnMs+winMs
  ok(btn.style.display!=='none', `after ${'>'}warn: button VISIBLE`);
  ok(btn.disabled===true, `warning stage: button DISABLED (30s bathroom-break grace)`);
  ok(/idle/i.test(btn.textContent), `warning stage: button shows the idle countdown ("${btn.textContent}")`);

  await sleep(45);
  window._idleTick();                                 // > warnMs+winMs
  ok(btn.style.display!=='none' && btn.disabled===false, `after grace: button ENABLED`);
  ok(/relinquish/i.test(btn.textContent), `relinquishable: button offers to relinquish ("${btn.textContent}")`);

  console.log('\n── host relinquishes the idle player ──');
  const beforeSeat=state.players.get('current');
  window.hostRelinquishToBot();
  const alice=state.players.get('list')[0];
  ok(alice.isBot===true, `Alice was converted to a bot (isBot=${alice.isBot})`);
  ok(alice.avatar==='🤖', `Alice's avatar is now a bot`);
  ok(state.players.get('current')===(beforeSeat+1)%2, `turn advanced to the next player (seat ${beforeSeat} -> ${state.players.get('current')})`);
  ok(btn.style.display==='none', `button hidden again after relinquish`);

  console.log('\n── an ACTIVE player is never flagged (activity cancels idle) ──');
  // Fresh 2-human roster (the previous one now has only 1 human left, which
  // correctly disables idle-relinquish). Let Bob's turn warn, then he acts.
  state.players.set('list',[mkPlayer(0,'Alice'), mkPlayer(1,'Bob')]);
  state.players.set('current',1); state.turn.set('phase','draw'); state.deck.set('currentCard',null);
  window._idleTick(); await sleep(90); window._idleTick();
  ok(btn.style.display!=='none', `Bob idle -> button shows`);
  state.deck.set('currentCard',{id:'card-x',value:'2',display:'2♠'}); // Bob draws = activity (sig change)
  window._idleTick();
  ok(btn.style.display==='none', `Bob acted -> button hides (no voluntary pass, idle cancelled)`);

  console.log('\n── solo / vs-bots never shows the button ──');
  state.meta.set('gameMode','solo');
  const solo=[mkPlayer(0,'You'), {index:1,name:'Bot',avatar:'🤖',userId:null,color:'#abc',boardPosition:1,isBot:true,pegs:[]}];
  state.players.set('list',solo); state.players.set('current',0);
  state.deck.set('currentCard',null);
  window._idleTick(); await sleep(90); window._idleTick();
  ok(btn.style.display==='none', `solo (1 human + bot): no idle-relinquish button ever`);

  console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════\n`);
  process.exit(fail?1:0);
})();
