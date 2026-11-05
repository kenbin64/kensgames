// fasttrack-turn-panel.js
// The turn panel (Ken, 2026-11-05): how a player makes a move, the same on a computer and a phone. Everything
// happens in the footer, and only what can be pressed right now is shown.
//
//   The footer has seven slots. Only a slot with something to press has a number on it; the rest are blank.
//   The slots mean whatever the current step needs:
//     - which peg moves (1 to 5, the same numbers that float over the pegs on the board),
//     - on a 7, how many hops the first peg takes (1 to 7, only counts that can be played),
//     - which hole to land in, when a peg can land in more than one (each hole gets a number on the board;
//       a peg on the fast track can have up to six, measured).
//   Once the choice is complete, the numbers give way to a single Confirm button. After Confirm it becomes Undo,
//   until the next card is drawn. Pressing Undo takes the move back and brings the numbers back to play it again.
//   The ↩ button steps back one choice.
//
// A 7 is two small turns: the first peg and its hop count, then the peg that takes the rest. If only one play is
// legal at all, the game makes it with no button pressed.
//
// It invents nothing. Every choice is one of the moves the rules engine already listed (state.turn.validMoves);
// a 7 split is one engine move, played whole on Confirm.

(function () {
  'use strict';

  const SLOT_COUNT = 7;
  const PEG_COUNT = 5;
  const SEVEN = 7;
  const TICK_MS = 150;
  const ONE_PLAY_DELAY_MS = 600;

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

  function plainOption(move, moveIdx) {
    return { moveIdx, from: move.from, path: move.path, dest: move.dest };
  }

  // One half of a split move, seen from the peg that walks it.
  function legOf(move, pegIdx) {
    return move.pegIdx === pegIdx
      ? { pegIdx, steps: move.steps, from: move.from, path: move.path, dest: move.dest }
      : { pegIdx, steps: move.steps2, from: move.from2, path: move.path2, dest: move.dest2 };
  }

  function otherPeg(move, pegIdx) { return move.pegIdx === pegIdx ? move.peg2Idx : move.pegIdx; }

  function splitsWith(moves, pegIdx, steps) {
    return moves.map((move, moveIdx) => ({ move, moveIdx }))
      .filter(({ move }) => move && move.type === 'split'
        && ((move.pegIdx === pegIdx && move.steps === steps) || (move.peg2Idx === pegIdx && move.steps2 === steps)));
  }

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

  function uniqueDests(options) { return [...new Set(options.map(o => o.dest))]; }

  // One play means one distinct result: two routes to the same hole are one play, and so is a 7 that can only be
  // split one way.
  function distinctPlays(moves) {
    const plays = new Map();
    moves.forEach((m, moveIdx) => {
      if (!m) return;
      const key = m.type === 'split' ? `split:${m.pegIdx}:${m.dest}:${m.peg2Idx}:${m.dest2}` : `move:${m.pegIdx}:${m.dest}`;
      if (!plays.has(key)) plays.set(key, moveIdx);
    });
    return [...plays.values()];
  }

  // ── The panel's state ───────────────────────────────────────────────────────────────────────
  //   stage: 'peg'    choose a peg
  //          'count'  a 7: choose how many hops the first peg takes
  //          'dest'   choose the hole the (first) peg lands in
  //          'peg2'   a 7 split: choose the peg for the rest of the hops
  //          'dest2'  a 7 split: choose the hole the second peg lands in
  //          'ready'  the choice is complete: Confirm plays it
  const pick = freshPick();
  const undo = { open: false, endsAt: 0 };
  let signature = '';

  function freshPick() {
    return { stage: 'peg', peg: null, counts: [], steps: null, dest: null, firstLeg: null, peg2: null, moveIdx: null,
      options: [], choices: [], history: [] };
  }

  function resetPick() { Object.assign(pick, freshPick()); }

  // Before each choice the player makes, keep the step they were on, so ↩ can return to it.
  function remember() {
    const { history, ...step } = pick;
    pick.history.push({ ...step, counts: step.counts.slice(), options: step.options.slice(), choices: step.choices.slice() });
  }

  function goBack() {
    const step = pick.history.pop();
    if (!step) return;
    Object.assign(pick, step);
    repaint();
    render();
  }

  // Which pegs may be pressed now.
  function activePegs() {
    const moves = readMoves();
    const active = new Set();
    if (pick.stage === 'peg2') {
      for (const { move } of splitsWith(moves, pick.peg, pick.steps)) {
        if (legOf(move, pick.peg).dest === pick.dest) active.add(otherPeg(move, pick.peg));
      }
      return active;
    }
    const seven = isSevenCard();
    for (let i = 0; i < PEG_COUNT; i++) {
      const has = seven ? sevenCountsFor(moves, i).length > 0 : plainOptionsFor(moves, i).length > 0;
      if (has) active.add(i);
    }
    return active;
  }

  // Number the landing holes nearest first; only when there is more than one.
  function numberChoices(options) {
    const firstByDest = new Map();
    for (const o of options) if (!firstByDest.has(o.dest)) firstByDest.set(o.dest, o);
    const ordered = [...firstByDest.values()]
      .sort((a, b) => ((a.path || []).length - (b.path || []).length) || String(a.dest).localeCompare(String(b.dest)));
    pick.choices = ordered.length > 1 ? ordered.map(o => o.dest) : [];
  }

  // ── The steps of a turn (a choice the player makes calls remember first) ────────────────────

  function choosePeg(pegIdx) {
    if (pick.stage === 'peg2') { chooseSecondPeg(pegIdx); return; }
    remember();
    pick.peg = pegIdx;
    const moves = readMoves();
    if (!isSevenCard()) { offerDests(plainOptionsFor(moves, pegIdx), 'dest'); return; }
    const counts = sevenCountsFor(moves, pegIdx);
    if (counts.length === 1) { takeCount(counts[0]); return; }
    pick.stage = 'count';
    pick.counts = counts;
    paint([]);
  }

  function chooseCount(steps) {
    remember();
    takeCount(steps);
  }

  function takeCount(steps) {
    pick.steps = steps;
    const moves = readMoves();
    if (steps === SEVEN) { offerDests(plainOptionsFor(moves, pick.peg), 'dest'); return; }
    const legs = splitsWith(moves, pick.peg, steps).map(({ move }) => legOf(move, pick.peg));
    pick.stage = 'dest';
    pick.options = legs;
    numberChoices(legs);
    paint(legs);
    const dests = uniqueDests(legs);
    if (dests.length === 1) takeFirstDest(dests[0]);
  }

  // A plain move (or the whole 7 on one peg): show its holes; a single hole is chosen for the player.
  function offerDests(options, stage) {
    pick.stage = stage;
    pick.options = options;
    numberChoices(options);
    paint(options);
    const dests = uniqueDests(options);
    if (dests.length === 1) stageMove(options.find(o => o.dest === dests[0]).moveIdx);
  }

  function chooseHole(dest) {
    const match = pick.options.find(o => o.dest === dest);
    if (!match) return;
    remember();
    if (pick.stage === 'dest' && pick.steps != null && pick.steps !== SEVEN) takeFirstDest(dest);
    else stageMove(match.moveIdx);
  }

  function takeFirstDest(dest) {
    pick.dest = dest;
    pick.firstLeg = pick.options.find(o => o.dest === dest) || null;
    pick.stage = 'peg2';
    pick.options = [];
    pick.choices = [];
    paint(firstLeg());
  }

  function chooseSecondPeg(pegIdx) {
    remember();
    pick.peg2 = pegIdx;
    const options = splitsWith(readMoves(), pick.peg, pick.steps)
      .filter(({ move }) => legOf(move, pick.peg).dest === pick.dest && otherPeg(move, pick.peg) === pegIdx)
      .map(({ move, moveIdx }) => ({ ...legOf(move, pegIdx), moveIdx }));
    offerDests(options, 'dest2');
  }

  function firstLeg() { return pick.firstLeg ? [pick.firstLeg] : []; }

  function stageMove(moveIdx) {
    pick.moveIdx = moveIdx;
    pick.stage = 'ready';
    repaint();
  }

  function confirmMove() {
    if (undo.open) { if (window.undoMove) window.undoMove(); return; }
    if (pick.stage !== 'ready' || pick.moveIdx == null) return;
    const moveIdx = pick.moveIdx;
    resetPick();
    if (typeof window.executeMove === 'function') window.executeMove(moveIdx);
    render();
  }

  // A tap on a glowing hole on the board does what pressing its number does. True when the panel used the tap.
  function boardTap(holeId) {
    if (!isHumanTurn() || !holeId) return false;
    if (pick.stage === 'dest' || pick.stage === 'dest2' || pick.stage === 'ready') { chooseHole(holeId); render(); }
    return true;
  }

  function isTargetHole(holeId) {
    return (pick.stage === 'dest' || pick.stage === 'dest2' || pick.stage === 'ready') && pick.options.some(o => o.dest === holeId);
  }

  // ── Drawing on the board ────────────────────────────────────────────────────────────────────

  let drawPaths = null;                                         // the board's own highlighter, kept for the panel

  function paint(options) {
    if (drawPaths) drawPaths(options.map(o => ({ type: 'move', from: o.from, path: o.path, dest: o.dest })));
    drawHoleNumbers();
  }

  // What the board should show for the current step.
  function repaint() {
    const chosen = pick.options.filter(o => o.moveIdx === pick.moveIdx).slice(0, 1);
    const byStage = { peg: [], count: [], dest: pick.options, peg2: firstLeg(), dest2: firstLeg().concat(pick.options),
      ready: firstLeg().concat(chosen) };
    paint(byStage[pick.stage] || []);
  }

  // While it is a person's turn, only the panel draws move highlights.
  function takeOverHighlights() {
    if (drawPaths || typeof window.highlightMovePaths !== 'function') return;
    drawPaths = window.highlightMovePaths;
    window.highlightMovePaths = function (moves) { if (!isHumanTurn()) drawPaths(moves); };
    window.highlightSinglePath = function () {};
  }

  function choosingHole() {
    return pick.choices.length > 1 && (pick.stage === 'dest' || pick.stage === 'dest2' || pick.stage === 'ready');
  }

  // A numbered square over each landing hole on offer; the chosen one turns green.
  const holeBadges = [];
  let holeBadgeKey = '';
  function drawHoleNumbers() {
    const chosen = pick.stage === 'ready' ? (pick.options.find(o => o.moveIdx === pick.moveIdx) || {}).dest : null;
    const key = (choosingHole() ? pick.choices.join(',') : '') + '|' + (chosen || '');
    if (key === holeBadgeKey) return;
    holeBadgeKey = key;
    clearHoleNumbers();
    if (!choosingHole() || typeof THREE === 'undefined' || typeof scene === 'undefined' || !scene) return;
    pick.choices.forEach((dest, i) => {
      const hole = window.holeRegistry && window.holeRegistry.get(dest);
      const at = hole && (hole.mesh ? hole.mesh.position : hole.position);
      if (!at) return;
      const badge = holeBadge(String(i + 1), dest === chosen);
      badge.position.set(at.x, at.y + 42, at.z);
      scene.add(badge);
      holeBadges.push(badge);
    });
  }

  function clearHoleNumbers() {
    while (holeBadges.length) {
      const badge = holeBadges.pop();
      if (badge.parent) badge.parent.remove(badge);
      if (badge.material) { if (badge.material.map) badge.material.map.dispose(); badge.material.dispose(); }
    }
  }

  // A hole's number: a dark square with a gold number (green when chosen), never mistaken for a peg's round badge.
  function holeBadge(number, chosen) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const accent = chosen ? '#35ff7a' : '#ffd666';
    ctx.fillStyle = 'rgba(10, 12, 24, 0.92)';
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(10, 10, 108, 108, 18); else ctx.rect(10, 10, 108, 108); ctx.fill();
    ctx.lineWidth = 9; ctx.strokeStyle = accent; ctx.stroke();
    ctx.font = '900 78px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = accent; ctx.fillText(number, 64, 70);
    const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(chosen ? 44 : 38, chosen ? 44 : 38, 1);
    sprite.renderOrder = 1000;
    return sprite;
  }

  // ── The footer ──────────────────────────────────────────────────────────────────────────────

  // What each of the seven slots offers now: { number, kind, chosen, press } or null for a blank slot.
  function slotsNow() {
    const slots = new Array(SLOT_COUNT).fill(null);
    if (pick.stage === 'peg' || pick.stage === 'peg2') {
      const active = activePegs();
      for (let i = 0; i < PEG_COUNT; i++) {
        if (active.has(i)) slots[i] = { number: i + 1, kind: 'peg', chosen: i === pick.peg, press: () => choosePeg(i) };
      }
    } else if (pick.stage === 'count') {
      for (const n of pick.counts) slots[n - 1] = { number: n, kind: 'count', chosen: false, press: () => chooseCount(n) };
    } else if (choosingHole() && pick.stage !== 'ready') {
      pick.choices.forEach((dest, i) => { slots[i] = { number: i + 1, kind: 'hole', chosen: false, press: () => chooseHole(dest) }; });
    }
    return slots;
  }

  let slotActions = [];

  function render() {
    const human = isHumanTurn();
    const player = readPlayer();
    const color = (player && player.color) || '#8899aa';
    const choosing = human && !undo.open && pick.stage !== 'ready';
    const slots = choosing ? slotsNow() : new Array(SLOT_COUNT).fill(null);
    slotActions = slots.map(s => (s ? s.press : null));
    slots.forEach((slot, i) => renderSlot(i, slot, color));
    showElement('ft-peg-buttons', choosing);
    showElement('ft-peg-back', human && !undo.open && pick.history.length > 0);
    renderConfirm(human);
    document.body.classList.toggle('ft-bar-idle', !human && !undo.open);
    refreshBanner();
  }

  function renderSlot(i, slot, color) {
    const button = document.getElementById('peg-btn-' + i);
    if (!button) return;
    const glyph = button.querySelector('.peg-glyph');
    if (glyph) glyph.textContent = slot ? String(slot.number) : '';
    const tint = !slot ? '' : slot.kind === 'peg' ? color : slot.kind === 'hole' ? '#ffd666' : '#e9f2ff';
    button.style.backgroundColor = tint;
    button.style.setProperty('--peg-color', tint || 'transparent');
    button.disabled = !slot;
    button.className = 'peg-btn' + (slot ? ` active ${slot.kind}-btn` : ' dormant') + (slot && slot.chosen ? ' selected' : '');
    const words = !slot ? '' : slot.kind === 'peg' ? `Peg ${slot.number}` : slot.kind === 'hole' ? `Landing hole ${slot.number}` : `${slot.number} hops`;
    button.title = words;
    button.setAttribute('aria-label', words || 'Not in use');
  }

  function showElement(id, show) {
    const element = document.getElementById(id);
    if (element) element.hidden = !show;
  }

  function renderConfirm(human) {
    const button = document.getElementById('ft-peg-confirm');
    if (!button) return;
    const seconds = undo.endsAt ? Math.max(0, Math.ceil((undo.endsAt - Date.now()) / 1000)) : 0;
    const label = button.querySelector('.peg-confirm-label');
    const check = button.querySelector('.peg-confirm-check');
    if (label) label.textContent = undo.open ? (seconds ? `Undo ${seconds}` : 'Undo') : 'Confirm';
    if (check) check.textContent = undo.open ? '↶' : '✔';
    button.classList.toggle('is-undo', undo.open);
    button.hidden = !(undo.open || (human && pick.stage === 'ready'));
    button.disabled = false;
    button.setAttribute('aria-label', undo.open ? 'Undo your move' : 'Confirm move');
  }

  // Seven slot buttons and the ↩ button, made once.
  function buildFooter() {
    const row = document.getElementById('ft-peg-buttons');
    if (!row) return;
    for (let i = row.querySelectorAll('.peg-btn').length; i < SLOT_COUNT; i++) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'peg-btn'; button.id = 'peg-btn-' + i;
      button.innerHTML = '<span class="peg-glyph"></span><span class="peg-nickname"></span>';
      row.appendChild(button);
    }
    for (let i = 0; i < SLOT_COUNT; i++) {
      const button = document.getElementById('peg-btn-' + i);
      if (button && !button._turnPanel) { button._turnPanel = true; button.addEventListener('click', () => pressSlot(i)); }
    }
    if (!document.getElementById('ft-peg-back')) {
      const back = document.createElement('button');
      back.type = 'button'; back.id = 'ft-peg-back'; back.textContent = '↩'; back.hidden = true;
      back.title = 'Back one step'; back.setAttribute('aria-label', 'Back one step');
      back.addEventListener('click', goBack);
      row.parentNode.insertBefore(back, row);
    }
    const confirm = document.getElementById('ft-peg-confirm');
    if (confirm && !confirm._turnPanel) { confirm._turnPanel = true; confirm.addEventListener('click', confirmMove); }
  }

  function pressSlot(i) {
    const action = slotActions[i];
    if (!action || undo.open || !isHumanTurn()) return;
    action();
    render();
  }

  // ── Undo: Confirm becomes Undo while the engine allows it ───────────────────────────────────

  function takeOverUndo() {
    const hideOld = window.hideUndoOffer;
    if (typeof window.showUndoOffer !== 'function' || window.showUndoOffer._panel) return;
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

  // ── Only one legal play: the game makes it, no button pressed ───────────────────────────────

  function playIfOnlyOne(expected) {
    if (distinctPlays(readMoves()).length !== 1) return;
    setTimeout(() => {
      if (signatureNow() !== expected || !isHumanTurn() || undo.open) return;
      const plays = distinctPlays(readMoves());
      if (plays.length === 1 && typeof window.executeMove === 'function') window.executeMove(plays[0]);
    }, ONE_PLAY_DELAY_MS);
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
    const now = signatureNow();
    if (now !== signature) {
      signature = now;
      resetPick();
      clearHoleNumbers(); holeBadgeKey = '';
      if (typeof window.refreshAlwaysOnPegNames === 'function') window.refreshAlwaysOnPegNames();   // pegs that can leave holding show their numbers
      if (isHumanTurn()) { paint([]); playIfOnlyOne(now); }
    }
    render();
  }

  // The instruction banner (fasttrack-3d.js) asks this panel what to say; tell it when the step changes.
  let bannerKey = '';
  function refreshBanner() {
    const key = pick.stage + ':' + signature + ':' + undo.open;
    if (key === bannerKey || typeof window._refreshInstructionBanner !== 'function') return;
    bannerKey = key;
    window._refreshInstructionBanner();
  }

  function instruction() {
    if (undo.open) return 'Press Undo to take it back';
    const rest = SEVEN - (pick.steps || 0);
    const texts = {
      peg: isSevenCard() ? 'A 7: press the number of the first peg to move' : 'Press the number of a peg to move',
      count: `How many hops for peg ${(pick.peg ?? 0) + 1}? The other peg takes the rest`,
      dest: 'Press the number of the hole to land in',
      peg2: `Now press the peg that takes the other ${rest}`,
      dest2: 'Press the number of the hole for the second peg',
      ready: 'Press Confirm to play it',
    };
    return texts[pick.stage] || '';
  }

  function wire() {
    buildFooter();
    document.body.classList.add('ft-turn-panel');
    setInterval(tick, TICK_MS);
    tick();
  }

  window.FTTurnPanel = { boardTap, isTargetHole, instruction, state: pick };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
