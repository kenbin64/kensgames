// fasttrack-turn-panel.js
// The turn panel (Ken, 2026-11-05): how a player picks a move, the same on a computer and a phone.
//
// Testers kept finding the 7 clunky, and picking pegs by tapping them on the board was fiddly. So a turn is
// now made with buttons in the footer, never by touching a peg:
//
//   1. Five numbered buttons, one per peg, always in the footer in the player's colour. A peg that can move
//      this turn is lit; one that can't (in holding with nothing to enter, or no legal move) is dimmed.
//      The same number floats over each peg on the board.
//   2. Press a peg's button. Its legal landing holes glow. One hole: it is chosen for you. Several: tap one.
//   3. Confirm plays it. Confirm then turns into Undo until the turn is over and the next card comes.
//
// A 7 is two small turns. Press the first peg: a meter asks how many hops, 1 to 7, offering only counts
// that are legal (if 7 can't be done, it stops at the most that can). Choose 4 and the board shows that
// peg's moves as if a 4 were drawn; the meter goes away. Then the buttons light again for the peg that
// takes the other 3. To change your mind, press the first peg again and start over.
//
// It invents nothing. Every choice it offers is one of the moves the rules engine already listed
// (state.turn.validMoves); a 7 split is one engine move, played whole when Confirm is pressed.

(function () {
  'use strict';

  const PEG_COUNT = 5;
  const SEVEN = 7;
  const TICK_MS = 150;

  // ── What the engine says right now ──────────────────────────────────────────────────────────

  function readCore() { return window.FastTrackCore && window.FastTrackCore.state ? window.FastTrackCore.state : null; }

  function readPlayer() {
    const core = readCore();
    const list = core ? (core.players.get('list') || []) : [];
    return core ? list[core.players.get('current') || 0] || null : null;
  }

  function readMoves() {
    const core = readCore();
    return core ? (core.turn.get('validMoves') || []) : [];
  }

  function isHumanTurn() {
    const player = readPlayer();
    return !!(player && !player.isBot && readMoves().length > 0);
  }

  function isSevenCard() {
    const core = readCore();
    const card = core ? core.deck.get('currentCard') : null;
    return !!(card && String(card.value) === String(SEVEN));
  }

  // ── The choices, worked out from the engine's moves ────────────────────────────────────────

  // A plain move (not a split) as something the board can draw and the panel can stage.
  function plainOption(move, moveIdx) {
    return { moveIdx, from: move.from, path: move.path, dest: move.dest };
  }

  // One half of a split move, seen from the peg that walks it.
  function legOf(move, pegIdx) {
    const first = move.pegIdx === pegIdx;
    return first
      ? { pegIdx, steps: move.steps, from: move.from, path: move.path, dest: move.dest }
      : { pegIdx, steps: move.steps2, from: move.from2, path: move.path2, dest: move.dest2 };
  }

  function otherPeg(move, pegIdx) { return move.pegIdx === pegIdx ? move.peg2Idx : move.pegIdx; }

  function splitsWith(moves, pegIdx, steps) {
    return moves.map((move, moveIdx) => ({ move, moveIdx }))
      .filter(({ move }) => move && move.type === 'split'
        && ((move.pegIdx === pegIdx && move.steps === steps) || (move.peg2Idx === pegIdx && move.steps2 === steps)));
  }

  // Plain moves for one peg: every card but a split 7.
  function plainOptionsFor(moves, pegIdx) {
    return moves.map((move, moveIdx) => ({ move, moveIdx }))
      .filter(({ move }) => move && move.type !== 'split' && move.pegIdx === pegIdx)
      .map(({ move, moveIdx }) => plainOption(move, moveIdx));
  }

  // On a 7: the hop counts this peg may take as the first half (7 means the whole card on one peg).
  function sevenCountsFor(moves, pegIdx) {
    const counts = new Set();
    if (plainOptionsFor(moves, pegIdx).length) counts.add(SEVEN);
    for (const move of moves) {
      if (!move || move.type !== 'split') continue;
      if (move.pegIdx === pegIdx) counts.add(move.steps);
      if (move.peg2Idx === pegIdx) counts.add(move.steps2);
    }
    return [...counts].sort((a, b) => a - b);
  }

  // Unique landing holes among options, so two routes to one hole are one choice.
  function uniqueDests(options) { return [...new Set(options.map(o => o.dest))]; }

  // ── The panel's own state ───────────────────────────────────────────────────────────────────
  //   stage: 'peg'     choose a peg (first, or the only one)
  //          'count'   a 7: choose how many hops for the first peg (the meter is up)
  //          'dest'    choose where the first (or only) peg lands
  //          'peg2'    a 7 split: choose the peg for the remaining hops
  //          'dest2'   a 7 split: choose where the second peg lands
  //          'ready'   a move is staged: Confirm plays it
  const pick = { stage: 'peg', peg: null, steps: null, dest: null, firstLeg: null, peg2: null, moveIdx: null, options: [], signature: '' };
  const undo = { open: false, endsAt: 0 };

  function resetPick() {
    Object.assign(pick, { stage: 'peg', peg: null, steps: null, dest: null, firstLeg: null, peg2: null, moveIdx: null, options: [] });
  }

  // Which pegs may be pressed now, by stage.
  function activePegs() {
    const moves = readMoves();
    const seven = isSevenCard();
    const active = new Set();
    if (pick.stage === 'peg2' || pick.stage === 'dest2') {
      for (const { move } of splitsWith(moves, pick.peg, pick.steps)) {
        if (legOf(move, pick.peg).dest === pick.dest) active.add(otherPeg(move, pick.peg));
      }
      active.add(pick.peg);                                     // pressing the first peg again starts over
    } else {
      for (let i = 0; i < PEG_COUNT; i++) {
        const has = seven ? sevenCountsFor(moves, i).length > 0 : plainOptionsFor(moves, i).length > 0;
        if (has) active.add(i);
      }
    }
    return active;
  }

  // ── Steps of a turn ─────────────────────────────────────────────────────────────────────────

  // The game's usual "no legal move" popup, but the turn stays: the player chooses again (Ken, 2026-11-05).
  function sayNoMove(text) {
    const player = readPlayer();
    if (typeof window.showCenterToast === 'function') window.showCenterToast(text, (player && player.color) || '#ff9a7a', 2200);
  }

  function choosePeg(pegIdx) {
    if (undo.open || !isHumanTurn()) return;
    if (!activePegs().has(pegIdx)) { sayNoMove(`No legal move for peg ${pegIdx + 1}. Choose again.`); return; }
    const secondStage = pick.stage === 'peg2' || pick.stage === 'dest2';
    if (secondStage && pegIdx !== pick.peg) { chooseSecondPeg(pegIdx); return; }
    resetPick();
    pick.peg = pegIdx;
    const moves = readMoves();
    if (!isSevenCard()) { offerDests(plainOptionsFor(moves, pegIdx), 'dest'); return; }
    const counts = sevenCountsFor(moves, pegIdx);
    if (counts.length === 1) { chooseCount(counts[0]); return; }
    pick.stage = 'count';
    showMeter(counts);
    paint([]);
  }

  function chooseCount(steps) {
    hideMeter();
    pick.steps = steps;
    const moves = readMoves();
    if (steps === SEVEN) { offerDests(plainOptionsFor(moves, pick.peg), 'dest'); return; }
    const legs = splitsWith(moves, pick.peg, steps).map(({ move }) => legOf(move, pick.peg));
    pick.stage = 'dest';
    pick.options = legs;
    paint(legs);
    const dests = uniqueDests(legs);
    if (dests.length === 1) chooseFirstDest(dests[0]);
    render();
  }

  // A plain move (or the whole 7 on one peg): show its holes; one hole stages itself.
  function offerDests(options, stage) {
    pick.stage = stage;
    pick.options = options;
    paint(options);
    const dests = uniqueDests(options);
    if (dests.length === 1) stageMove(options.find(o => o.dest === dests[0]).moveIdx);
    render();
  }

  function chooseFirstDest(dest) {
    pick.dest = dest;
    pick.firstLeg = pick.options.find(o => o.dest === dest) || null;   // kept: the second peg's options replace pick.options
    pick.stage = 'peg2';
    paint(firstLegOnly());
    render();                                                   // the buttons light for the second peg: the player presses it
  }

  function chooseSecondPeg(pegIdx) {
    pick.peg2 = pegIdx;
    pick.stage = 'dest2';
    const options = splitsWith(readMoves(), pick.peg, pick.steps)
      .filter(({ move }) => legOf(move, pick.peg).dest === pick.dest && otherPeg(move, pick.peg) === pegIdx)
      .map(({ move, moveIdx }) => ({ ...legOf(move, pegIdx), moveIdx }));
    pick.options = options;
    paint(firstLegOnly().concat(options));
    const dests = uniqueDests(options);
    if (dests.length === 1) stageMove(options.find(o => o.dest === dests[0]).moveIdx);
    render();
  }

  function firstLegOnly() { return pick.firstLeg ? [pick.firstLeg] : []; }

  function stageMove(moveIdx) {
    pick.moveIdx = moveIdx;
    pick.stage = 'ready';
    const chosen = pick.options.filter(o => o.moveIdx === moveIdx).slice(0, 1);
    paint(firstLegOnly().concat(chosen));
    render();
  }

  function confirmMove() {
    if (undo.open) { if (window.undoMove) window.undoMove(); return; }
    if (pick.stage !== 'ready' || pick.moveIdx == null) return;
    const moveIdx = pick.moveIdx;
    resetPick();
    if (typeof window.executeMove === 'function') window.executeMove(moveIdx);
    render();
  }

  // A tap on the board picks a glowing landing hole. Returns true when the panel used the tap.
  function boardTap(holeId) {
    if (!isHumanTurn() || !holeId) return false;
    if (pick.stage === 'peg' || pick.stage === 'count' || pick.stage === 'peg2') return true;   // a peg button comes first
    const match = pick.options.find(o => o.dest === holeId);
    if (!match) return true;                                    // the panel owns the board: nothing else acts on a tap
    if (pick.stage === 'dest' && pick.steps != null && pick.steps !== SEVEN) chooseFirstDest(holeId);
    else stageMove(match.moveIdx);
    return true;
  }

  function isTargetHole(holeId) { return (pick.stage === 'dest' || pick.stage === 'dest2' || pick.stage === 'ready') && pick.options.some(o => o.dest === holeId); }

  // ── Drawing on the board ────────────────────────────────────────────────────────────────────

  let drawPaths = null;                                         // the board's own highlighter, kept for the panel

  function paint(options) {
    if (!drawPaths) return;
    drawPaths(options.map(o => ({ type: 'move', from: o.from, path: o.path, dest: o.dest })));
  }

  // While it is a person's turn, only the panel draws move highlights, so the old hints can't redraw
  // every legal move over the panel's choice.
  function takeOverHighlights() {
    if (drawPaths || typeof window.highlightMovePaths !== 'function') return;
    drawPaths = window.highlightMovePaths;
    window.highlightMovePaths = function (moves) { if (!isHumanTurn()) drawPaths(moves); };
    window.highlightSinglePath = function () {};
  }

  // ── The footer: five numbered buttons and Confirm / Undo ────────────────────────────────────

  function render() {
    const player = readPlayer();
    const human = isHumanTurn() || undo.open;
    const active = human ? activePegs() : new Set();
    const color = (player && player.color) || '#8899aa';
    for (let i = 0; i < PEG_COUNT; i++) renderPegButton(i, player, color, active);
    renderConfirm(human);
    document.body.classList.toggle('ft-turn-panel-human', human);
    refreshBanner();
  }

  // The instruction banner (fasttrack-3d.js) asks this panel what to say; tell it when the step changes.
  let bannerStage = '';
  function refreshBanner() {
    const key = pick.stage + ':' + pick.signature + ':' + undo.open;
    if (key === bannerStage || typeof window._refreshInstructionBanner !== 'function') return;
    bannerStage = key;
    window._refreshInstructionBanner();
  }

  function renderPegButton(i, player, color, active) {
    const button = document.getElementById('peg-btn-' + i);
    if (!button) return;
    const peg = player && Array.isArray(player.pegs) ? player.pegs[i] : null;
    const glyph = button.querySelector('.peg-glyph');
    if (glyph) glyph.textContent = String(i + 1);
    const where = !peg || peg.holeId === 'holding' ? 'in holding' : 'on the board';
    button.title = `Peg ${i + 1} (${where})`;
    button.setAttribute('aria-label', `Peg ${i + 1}, ${where}`);
    button.style.setProperty('--peg-color', color);
    button.style.backgroundColor = color;
    const on = active.has(i) && !undo.open;
    button.disabled = undo.open || !isHumanTurn();             // dimmed pegs stay pressable: they say why
    button.classList.toggle('active', on);
    button.classList.toggle('dim', !on);
    button.classList.toggle('selected', i === pick.peg || i === pick.peg2);
  }

  function renderConfirm(human) {
    const button = document.getElementById('ft-peg-confirm');
    if (!button) return;
    const label = button.querySelector('.peg-confirm-label');
    const check = button.querySelector('.peg-confirm-check');
    const seconds = undo.endsAt ? Math.max(0, Math.ceil((undo.endsAt - Date.now()) / 1000)) : 0;
    const text = undo.open ? (seconds ? `Undo ${seconds}` : 'Undo') : 'Confirm';
    if (label) label.textContent = text;
    if (check) check.textContent = undo.open ? '↶' : '✔';
    button.classList.toggle('is-undo', undo.open);
    button.disabled = !(undo.open || (human && pick.stage === 'ready'));
    button.setAttribute('aria-label', undo.open ? 'Undo your move' : 'Confirm move');
  }

  // ── The 7 meter ─────────────────────────────────────────────────────────────────────────────

  function ensureMeter() {
    let box = document.getElementById('ft-seven-meter');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'ft-seven-meter';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'How many hops');
    box.hidden = true;
    box.innerHTML = '<div class="ft-sm-title"></div>'
      + '<input type="range" class="ft-sm-range" min="1" max="7" step="1" aria-label="Hops for this peg">'
      + '<div class="ft-sm-ticks"></div>'
      + '<button type="button" class="ft-sm-go">Use <b>0</b> hops</button>';
    document.body.appendChild(box);
    const range = box.querySelector('.ft-sm-range');
    range.addEventListener('input', () => previewCount(Number(range.value)));
    box.querySelector('.ft-sm-go').addEventListener('click', () => chooseCount(Number(range.value)));
    return box;
  }

  function showMeter(counts) {
    const box = ensureMeter();
    const range = box.querySelector('.ft-sm-range');
    const most = counts[counts.length - 1];
    box.dataset.counts = counts.join(',');
    box.querySelector('.ft-sm-title').textContent = most < SEVEN
      ? `Peg ${pick.peg + 1}: how many hops? (at most ${most} can be played)`
      : `Peg ${pick.peg + 1}: how many hops? The other peg takes the rest.`;
    range.max = String(most);
    range.value = String(most);
    const ticks = box.querySelector('.ft-sm-ticks');
    ticks.innerHTML = '';
    for (let n = 1; n <= SEVEN; n++) {
      const tick = document.createElement('button');
      tick.type = 'button';
      tick.textContent = String(n);
      tick.classList.toggle('illegal', !counts.includes(n));
      tick.addEventListener('click', () => (counts.includes(n) ? chooseCount(n) : sayNoCount(n)));
      ticks.appendChild(tick);
    }
    box.hidden = false;
    previewCount(most);
  }

  // While the meter moves, snap to the nearest legal count and preview that peg's holes.
  function previewCount(value) {
    const box = ensureMeter();
    const counts = (box.dataset.counts || '').split(',').map(Number).filter(Boolean);
    const near = counts.reduce((best, n) => (Math.abs(n - value) < Math.abs(best - value) ? n : best), counts[0]);
    box.querySelector('.ft-sm-range').value = String(near);
    box.querySelector('.ft-sm-go b').textContent = String(near);
    box.querySelectorAll('.ft-sm-ticks button').forEach(t => t.classList.toggle('on', Number(t.textContent) === near));
    const moves = readMoves();
    const preview = near === SEVEN ? plainOptionsFor(moves, pick.peg)
      : splitsWith(moves, pick.peg, near).map(({ move }) => legOf(move, pick.peg));
    paint(preview);
  }

  // A count that can't be played: a split needs two pegs that can move, and both halves must be legal.
  function sayNoCount(n) {
    const movable = activePegs().size;
    const text = n < SEVEN && movable < 2 ? 'A split needs two pegs that can move. Choose again.' : `No legal move for ${n} hops. Choose again.`;
    sayNoMove(text);
  }

  function hideMeter() {
    const box = document.getElementById('ft-seven-meter');
    if (box) box.hidden = true;
  }

  // ── Undo: Confirm becomes Undo while the engine allows it ───────────────────────────────────

  function takeOverUndo() {
    const showOld = window.showUndoOffer, hideOld = window.hideUndoOffer;
    if (typeof showOld !== 'function' || window.showUndoOffer._panel) return;
    window.showUndoOffer = function (ms) {
      undo.open = true;
      undo.endsAt = ms > 0 ? Date.now() + ms : 0;
      render();
    };
    window.showUndoOffer._panel = true;
    window.hideUndoOffer = function () {
      undo.open = false;
      undo.endsAt = 0;
      if (typeof hideOld === 'function') hideOld();
      render();
    };
  }

  // ── The heartbeat: start fresh whenever the engine's moves change ───────────────────────────

  function signatureNow() {
    const player = readPlayer();
    const moves = readMoves();
    return (isHumanTurn() ? 'h' : 'b') + '|' + (player ? player.id || player.name : '') + '|' + moves.length + '|'
      + moves.map(m => `${m.type}:${m.pegIdx}:${m.dest}:${m.steps || ''}:${m.peg2Idx ?? ''}:${m.dest2 || ''}`).join(',');
  }

  function tick() {
    takeOverHighlights();
    takeOverUndo();
    const signature = signatureNow();
    if (signature !== pick.signature) {
      pick.signature = signature;
      resetPick();
      hideMeter();
      if (isHumanTurn()) { paint([]); playIfOnlyOne(signature); }
    }
    render();
  }

  // Only one legal play (Ken, 2026-11-05): the game just makes it, with no button to press. One play means one
  // distinct result: the same peg to the same hole by two routes is one play, and a 7 that can only be split one
  // way is one play even though it moves two pegs. Waits a moment so the card can be seen, then checks again.
  const ONE_PLAY_DELAY_MS = 600;

  function distinctPlays(moves) {
    const plays = new Map();
    moves.forEach((m, moveIdx) => {
      if (!m) return;
      const key = m.type === 'split' ? `split:${m.pegIdx}:${m.dest}:${m.peg2Idx}:${m.dest2}` : `move:${m.pegIdx}:${m.dest}`;
      if (!plays.has(key)) plays.set(key, moveIdx);
    });
    return [...plays.values()];
  }

  function playIfOnlyOne(signature) {
    if (distinctPlays(readMoves()).length !== 1) return;
    setTimeout(() => {
      if (pick.signature !== signatureNow() || pick.signature !== signature || !isHumanTurn() || undo.open) return;
      const plays = distinctPlays(readMoves());
      if (plays.length === 1 && typeof window.executeMove === 'function') window.executeMove(plays[0]);
    }, ONE_PLAY_DELAY_MS);
  }

  function wire() {
    for (let i = 0; i < PEG_COUNT; i++) {
      const button = document.getElementById('peg-btn-' + i);
      if (button && !button._turnPanel) { button._turnPanel = true; button.addEventListener('click', () => choosePeg(i)); }
    }
    const confirm = document.getElementById('ft-peg-confirm');
    if (confirm && !confirm._turnPanel) { confirm._turnPanel = true; confirm.addEventListener('click', confirmMove); }
    document.body.classList.add('ft-turn-panel');
    setInterval(tick, TICK_MS);
    tick();
  }

  // What the instruction banner should say, for fasttrack-3d.js.
  function instruction() {
    const texts = {
      peg: isSevenCard() ? 'A 7: press the number of the first peg to move' : 'Press the number of a peg to move',
      count: 'Slide to how many hops this peg takes',
      dest: 'Tap a glowing hole',
      peg2: `Now press the peg that takes the other ${SEVEN - (pick.steps || 0)}`,
      dest2: 'Tap a glowing hole for the second peg',
      ready: 'Press Confirm to play it',
    };
    return texts[pick.stage] || '';
  }

  window.FTTurnPanel = { boardTap, isTargetHole, instruction, choosePeg, chooseCount, confirmMove, state: pick };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
