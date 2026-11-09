// fasttrack-turn-panel.js
// The turn panel (Ken, 2026-11-05): how a player makes a move, the same on a computer and a phone. Everything
// happens in the footer, and only what can be pressed right now is shown.
//
//   The footer has seven slots, never more. Only a slot with something to press has a label; the rest are blank.
//   Numbers are pegs and letters are holes, so the two are never confused (Ken, 2026-11-06):
//     - which peg moves: 1 to 5, the same numbers that float over the pegs on the board;
//     - which hole to land in, when a peg can land in more than one: A, B, C ... nearest first, with the same
//       letter floating over the hole on the board, above any peg already sitting there;
//     - on a 7, where the first peg stops: every hole it can stop in lights up, labelled by route and hop count.
//       A1 to A7 run along one route. Where the route branches (the bullseye, a fast-track exit), the other
//       route's holes are B<n> from the branch on, so no hole carries two labels. A route ends at its last legal
//       hole.
//   A 7 can have more than seven stops (measured: about a quarter of the time on random boards, up to 33 across
//   7 routes for a peg on the fast track). Then the player picks the route first (A, B, C ...), and the footer
//   shows that route's stops (at most 7, since a 7 has 7 hops). Up to seven stops are shown in one step.
//   Tapping a lit hole on the board always works too, at every step.
//   Once the choice is complete, the labels give way to a single Confirm button. After Confirm it becomes Undo,
//   until the next card is drawn. Pressing Undo takes the move back and brings the labels back to play it again.
//   The ↩ button steps back one choice.
//
// A 7 is two small turns: the first peg and where it stops, then the peg that takes the rest of the hops. If only
// one play is legal at all, the game makes it with no button pressed.
//
// It invents nothing. Every choice is one of the moves the rules engine already listed (state.turn.validMoves);
// a 7 split is one engine move, played whole on Confirm.

(function () {
  'use strict';

  const SLOT_COUNT = 7;
  const LETTERS = 'ABCDEFG';
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

  // A person's turn ON THIS SCREEN. Online, a friend's turn is not ours: their buttons, lit holes and
  // letters stay on their screen (Ken, 2026-11-08).
  function isHumanTurn() {
    const player = readPlayer();
    const core = window.FastTrackCore;
    const local = !core || typeof core.isLocalTurn !== 'function' || core.isLocalTurn();
    return !!(player && !player.isBot && local && readMoves().length > 0);
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

  // The splits where this peg moves FIRST. The engine lists each split in the order it is played
  // (pegIdx first, then peg2Idx), and the peg the player presses first is the one that moves first.
  function splitsWith(moves, pegIdx, steps) {
    return moves.map((move, moveIdx) => ({ move, moveIdx }))
      .filter(({ move }) => move && move.type === 'split' && move.pegIdx === pegIdx && move.steps === steps);
  }

  function plainOptionsFor(moves, pegIdx) {
    return moves.map((move, moveIdx) => ({ move, moveIdx }))
      .filter(({ move }) => move && move.type !== 'split' && move.pegIdx === pegIdx
        && !(pick.entry === 'board' && move.type === 'enter'))
      .map(({ move, moveIdx }) => plainOption(move, moveIdx));
  }

  // On a 7: every hole this peg can stop in as the first half (it moves first, the other peg after), as { steps, dest, path, from, moveIdx }. A stop at
  // 7 hops is the whole card on this peg (a plain move, so it has a moveIdx); a shorter stop leaves the rest of the
  // hops for another peg.
  function sevenStopsFor(moves, pegIdx) {
    const stops = new Map();
    const add = (stop) => { const key = stop.steps + '>' + stop.dest; if (!stops.has(key)) stops.set(key, stop); };
    plainOptionsFor(moves, pegIdx).forEach(option => add({ ...option, steps: SEVEN }));
    for (const move of moves) {
      if (!move || move.type !== 'split') continue;
      if (move.pegIdx === pegIdx) add({ ...legOf(move, pegIdx), moveIdx: null });
    }
    return [...stops.values()];
  }

  function startsWith(long, short) { return short.every((hole, i) => long[i] === hole); }

  // Label each stop by its route and hop count. Longest paths first: a stop whose path begins a known route lies on
  // that route; otherwise it starts a new one. A hole before a branch begins both routes, so it stays on the first
  // (A) and the next route's labels (B ...) start only where it branches off.
  function labelStops(stops) {
    const routes = [];
    const longestFirst = stops.slice()
      .sort((a, b) => (b.steps - a.steps) || String(a.dest).localeCompare(String(b.dest)));
    for (const stop of longestFirst) {
      const path = stop.path || [stop.dest];
      let route = routes.find(r => startsWith(r.path, path));
      if (!route) { route = { path, stops: [] }; routes.push(route); }
      route.stops.push(stop);
    }
    const labelled = [];
    routes.slice(0, LETTERS.length).forEach((route, r) => {
      route.stops.sort((a, b) => a.steps - b.steps)
        .forEach(stop => labelled.push({ ...stop, route: LETTERS[r], label: LETTERS[r] + stop.steps }));
    });
    return labelled;
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
  //          'route'  a 7 with more than seven stops: choose the route first
  //          'stop'   a 7: choose where the first peg stops
  //          'dest'   choose the hole the peg lands in
  //          'peg2'   a 7 split: choose the peg for the rest of the hops
  //          'dest2'  a 7 split: choose the hole the second peg lands in
  //          'ready'  the choice is complete: Confirm plays it
  //   options: what is lit on the board (and can be tapped); choices: what the footer offers, each
  //   { dest, label, kind, words, act } where dest is the hole its label floats over.
  const pick = freshPick();
  const undo = { open: false, endsAt: 0 };
  let signature = '';

  function freshPick() {
    return { stage: 'peg', peg: null, stops: [], steps: null, dest: null, firstLeg: null, peg2: null, moveIdx: null,
      entry: null, options: [], choices: [], history: [] };
  }

  function resetPick() { Object.assign(pick, freshPick()); }

  // Before each choice the player makes, keep the step they were on, so ↩ can return to it.
  function remember() {
    const { history, ...step } = pick;
    pick.history.push({ ...step, stops: step.stops.slice(), options: step.options.slice(), choices: step.choices.slice() });
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
      const has = seven ? sevenStopsFor(moves, i).length > 0 : plainOptionsFor(moves, i).length > 0;
      if (has) active.add(i);
    }
    return active;
  }

  // Letter the landing holes nearest first; only when there is more than one.
  function letterHoles(options) {
    const firstByDest = new Map();
    for (const o of options) if (!firstByDest.has(o.dest)) firstByDest.set(o.dest, o);
    // Nearest first. Equal distances (a peg on the fast track: every option is the card's full count)
    // go by how far each stays on the ring, most first, so A keeps the fast track longest (Ken, 2026-11-08);
    // only then by hole name.
    const ringHops = (o) => (o.path || []).filter(h => String(h).startsWith('ft-')).length;
    const ordered = [...firstByDest.values()]
      .sort((a, b) => ((a.path || []).length - (b.path || []).length) || (ringHops(b) - ringHops(a))
        || String(a.dest).localeCompare(String(b.dest)))
      .slice(0, LETTERS.length);
    pick.choices = ordered.length < 2 ? [] : ordered.map((o, i) => ({
      dest: o.dest, label: LETTERS[i], kind: 'hole', words: `Hole ${LETTERS[i]}`, act: () => chooseHole(o.dest),
    }));
  }

  // ── The steps of a turn (a choice the player makes calls remember first) ────────────────────

  function choosePeg(pegIdx) {
    if (pick.stage === 'peg2') { chooseSecondPeg(pegIdx); return; }
    remember();
    pick.peg = pegIdx;
    const moves = readMoves();
    if (!isSevenCard()) { offerDests(plainOptionsFor(moves, pegIdx), 'dest'); return; }
    offerStops(labelStops(sevenStopsFor(moves, pegIdx)));
  }

  // A 7: one stop is taken for the player; up to seven are shown at once; more than seven, the routes come first.
  function offerStops(stops) {
    pick.stops = stops;
    if (stops.length === 1) { takeStop(stops[0]); return; }
    if (stops.length <= SLOT_COUNT) { showStops(stops); return; }
    pick.stage = 'route';
    pick.options = stops;
    const routes = [...new Set(stops.map(s => s.route))];
    pick.choices = routes.map(route => {
      const onRoute = stops.filter(s => s.route === route);
      const end = onRoute[onRoute.length - 1];
      return { dest: end.dest, label: route, kind: 'route', words: `Route ${route}`, act: () => chooseRoute(route) };
    });
    paint(stops);
  }

  function showStops(stops) {
    pick.stage = 'stop';
    pick.options = stops;
    pick.choices = stops.map(stop => ({
      dest: stop.dest, label: stop.label, kind: 'stop', words: `Stop ${stop.label}: ${stop.steps} of 7 hops`,
      act: () => chooseStop(stop),
    }));
    paint(stops);
  }

  function chooseRoute(route) {
    remember();
    const onRoute = pick.stops.filter(s => s.route === route);
    if (onRoute.length === 1) takeStop(onRoute[0]);
    else showStops(onRoute);
  }

  function chooseStop(stop) {
    remember();
    takeStop(stop);
  }

  // All 7 hops on one peg is a whole move; fewer leaves the rest for a second peg.
  function takeStop(stop) {
    pick.steps = stop.steps;
    if (stop.steps === SEVEN) { pick.options = [stop]; stageMove(stop.moveIdx); return; }
    pick.dest = stop.dest;
    pick.firstLeg = stop;
    pick.stage = 'peg2';
    pick.options = [];
    pick.choices = [];
    paint(firstLeg());
  }

  // A plain move or the second peg of a 7: show its holes; a single hole is chosen for the player.
  function offerDests(options, stage) {
    pick.stage = stage;
    pick.options = options;
    letterHoles(options);
    paint(options);
    const dests = uniqueDests(options);
    if (dests.length === 1) stageMove(options.find(o => o.dest === dests[0]).moveIdx);
  }

  function chooseHole(dest) {
    const match = pick.options.find(o => o.dest === dest);
    if (!match) return;
    remember();
    stageMove(match.moveIdx);
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

  // A tap on a lit hole does what pressing its label does. On a 7 any lit stop can be tapped, even while the
  // footer is offering routes. True when the panel used the tap.
  function boardTap(holeId) {
    if (!isHumanTurn() || !holeId) return false;
    if (pick.stage === 'route' || pick.stage === 'stop') {
      const stop = pick.options.find(o => o.dest === holeId);
      if (stop) chooseStop(stop);
    } else if (pick.stage === 'dest' || pick.stage === 'dest2' || pick.stage === 'ready') {
      const choice = pick.choices.find(c => c.dest === holeId);
      if (choice) choice.act();
    }
    render();
    return true;
  }

  function isTargetHole(holeId) {
    const tappable = ['route', 'stop', 'dest', 'dest2', 'ready'].includes(pick.stage);
    return tappable && (pick.options.some(o => o.dest === holeId) || pick.choices.some(c => c.dest === holeId));
  }

  // ── Drawing on the board ────────────────────────────────────────────────────────────────────

  let drawPaths = null;                                         // the board's own highlighter, kept for the panel

  function paint(options) {
    if (drawPaths) drawPaths(options.map(o => ({ type: 'move', from: o.from, path: o.path, dest: o.dest })));
    drawHoleLabels();
  }

  // What the board should show for the current step.
  function repaint() {
    const chosen = pick.options.filter(o => o.moveIdx === pick.moveIdx).slice(0, 1);
    const byStage = { peg: [], route: pick.options, stop: pick.options, dest: pick.options, peg2: firstLeg(),
      dest2: firstLeg().concat(pick.options), ready: firstLeg().concat(chosen) };
    paint(byStage[pick.stage] || []);
  }

  // Only the panel draws move highlights, and only on this screen's player's turn. On anyone else's
  // turn (a friend, a bot) the board shows no possible moves at all, only the move when it is made.
  function takeOverHighlights() {
    if (drawPaths || typeof window.highlightMovePaths !== 'function') return;
    drawPaths = window.highlightMovePaths;
    window.highlightMovePaths = function () { if (!isHumanTurn()) drawPaths([]); };
    window.highlightSinglePath = function () {};
  }

  function hasChoices() {
    return pick.choices.length > 1 && ['route', 'stop', 'dest', 'dest2', 'ready'].includes(pick.stage);
  }

  // A lettered square over each hole on offer; the chosen one turns green. Two labels on one hole stack upward.
  const holeBadges = [];
  let holeBadgeKey = '';
  function drawHoleLabels() {
    const chosen = pick.stage === 'ready' ? (pick.options.find(o => o.moveIdx === pick.moveIdx) || {}).dest : null;
    const key = (hasChoices() ? pick.choices.map(c => c.label + '@' + c.dest).join(',') : '') + '|' + (chosen || '');
    if (key === holeBadgeKey) return;
    holeBadgeKey = key;
    clearHoleLabels();
    if (!hasChoices() || typeof THREE === 'undefined' || typeof scene === 'undefined' || !scene) return;
    const placed = pick.choices.map(choice => ({ choice, at: holePosition(choice.dest) })).filter(p => p.at);
    const size = badgeSize(placed.map(p => p.at));
    const perHole = new Map();
    placed.forEach(({ choice, at }) => {
      const stacked = perHole.get(choice.dest) || 0;
      perHole.set(choice.dest, stacked + 1);
      const isChosen = choice.dest === chosen;
      const badge = holeBadge(choice.label, isChosen, isChosen ? size * 1.15 : size);
      badge.position.set(at.x, at.y + size * 0.7 + 6 + stacked * size, at.z);
      scene.add(badge);
      holeBadges.push(badge);
    });
  }

  // Where the hole really is in the scene. The holes live in the raised board group, so their own position is
  // 90 units low; the labels are added to the scene itself and need the world position.
  function holePosition(holeId) {
    const hole = window.holeRegistry && window.holeRegistry.get(holeId);
    const mesh = hole && hole.mesh;
    if (!mesh) return hole && hole.position ? hole.position : null;
    return mesh.getWorldPosition(new THREE.Vector3());
  }

  // Labels as big as they can be without touching: a little under the gap between the two closest lit holes,
  // never smaller than readable or larger than the old single-hole square.
  const BADGE_MIN = 18;
  const BADGE_MAX = 38;
  function badgeSize(points) {
    let gap = Infinity;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z);
        if (d > 0.01) gap = Math.min(gap, d);
      }
    }
    return Math.max(BADGE_MIN, Math.min(BADGE_MAX, gap * 0.9));
  }

  function clearHoleLabels() {
    while (holeBadges.length) {
      const badge = holeBadges.pop();
      if (badge.parent) badge.parent.remove(badge);
      if (badge.material) { if (badge.material.map) badge.material.map.dispose(); badge.material.dispose(); }
    }
  }

  // A hole's label: a dark square with gold lettering (green when chosen), never mistaken for a peg's round number.
  // Drawn last and through everything, so a peg sitting on the hole never hides it.
  function holeBadge(label, chosen, size) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const accent = chosen ? '#35ff7a' : '#ffd666';
    ctx.fillStyle = 'rgba(10, 12, 24, 0.92)';
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(10, 10, 108, 108, 18); else ctx.rect(10, 10, 108, 108); ctx.fill();
    ctx.lineWidth = 9; ctx.strokeStyle = accent; ctx.stroke();
    ctx.font = `900 ${label.length > 1 ? 60 : 78}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = accent; ctx.fillText(label, 64, 70);
    const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, depthWrite: false,
      transparent: true, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(size, size, 1);
    sprite.renderOrder = 2000;
    return sprite;
  }

  // ── The footer ──────────────────────────────────────────────────────────────────────────────

  // What each of the seven slots offers now: { label, kind, words, chosen, act } or null for a blank slot.
  function slotsNow() {
    const slots = new Array(SLOT_COUNT).fill(null);
    if (pick.stage === 'peg' || pick.stage === 'peg2') {
      const active = activePegs();
      for (let i = 0; i < PEG_COUNT; i++) {
        if (active.has(i)) slots[i] = { label: String(i + 1), kind: 'peg', words: `Peg ${i + 1}`, chosen: i === pick.peg, act: () => choosePeg(i) };
      }
    } else if (hasChoices() && pick.stage !== 'ready') {
      pick.choices.slice(0, SLOT_COUNT).forEach((choice, i) => { slots[i] = { ...choice, chosen: false }; });
    }
    return slots;
  }

  let slotActions = [];

  function render() {
    const human = isHumanTurn();
    const player = readPlayer();
    const color = (player && player.color) || '#8899aa';
    const choosing = human && !undo.open && pick.stage !== 'ready' && !entryPending(human);
    const slots = choosing ? slotsNow() : new Array(SLOT_COUNT).fill(null);
    slotActions = slots.map(s => (s ? s.act : null));
    slots.forEach((slot, i) => renderSlot(i, slot, color));
    showElement('ft-peg-buttons', choosing);
    showElement('ft-peg-back', human && !undo.open && pick.history.length > 0);
    renderConfirm(human);
    renderLeaveFastTrack(human);
    renderEntry(human);
    document.body.classList.toggle('ft-bar-idle', !human && !undo.open);
    refreshBanner();
  }

  const SLOT_TINTS = { hole: '#ffd666', stop: '#ffd666', route: '#9fd3ff' };

  function renderSlot(i, slot, color) {
    const button = document.getElementById('peg-btn-' + i);
    if (!button) return;
    const glyph = button.querySelector('.peg-glyph');
    if (glyph) glyph.textContent = slot ? slot.label : '';
    const tint = !slot ? '' : slot.kind === 'peg' ? color : SLOT_TINTS[slot.kind];
    button.style.backgroundColor = tint;
    button.style.setProperty('--peg-color', tint || 'transparent');
    button.disabled = !slot;
    const kindClass = slot ? (slot.kind === 'peg' ? ' peg-kind' : ' hole-btn') : '';
    const longClass = slot && slot.label.length > 1 ? ' long-label' : '';
    button.className = 'peg-btn' + (slot ? ' active' : ' dormant') + kindClass + longClass + (slot && slot.chosen ? ' selected' : '');
    button.title = slot ? slot.words : '';
    button.setAttribute('aria-label', slot ? slot.words : 'Not in use');
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
    if (!document.getElementById('ft-entry-new')) {
      const add = (id, text, title, act) => {
        const button = document.createElement('button');
        button.type = 'button'; button.id = id; button.className = 'ft-entry-btn'; button.hidden = true;
        button.textContent = text; button.title = title; button.addEventListener('click', act);
        row.parentNode.insertBefore(button, row);
      };
      add('ft-entry-new', 'New peg', 'Bring a peg out of holding onto your home hole', chooseNewPeg);
      add('ft-entry-board', 'Board peg', 'Move one of your pegs already on the board', chooseBoardPeg);
    }
    if (!document.getElementById('ft-leave-ft')) {
      const leave = document.createElement('button');
      leave.type = 'button'; leave.id = 'ft-leave-ft'; leave.hidden = true;
      leave.addEventListener('click', toggleLeaveFastTrack);
      row.parentNode.insertBefore(leave, row);
    }
    const confirm = document.getElementById('ft-peg-confirm');
    if (confirm && !confirm._turnPanel) { confirm._turnPanel = true; confirm.addEventListener('click', confirmMove); }
  }

  // "New peg" / "Board peg" (Ken, 2026-11-08): an Ace, 6 or Joker with a peg in holding and a peg on the board
  // that can move. "New peg" brings a peg out of holding onto the home hole at once; "Board peg" goes on to the
  // usual choice among the pegs on the board (↩ comes back here).
  function entryPending(human) {
    const core = readCore();
    return !!(human && !undo.open && pick.stage === 'peg' && pick.entry == null && core && core.turn.get('canChooseEntry'));
  }

  function chooseNewPeg() {
    if (!isHumanTurn() || undo.open) return;
    const moves = readMoves();
    let best = -1;
    moves.forEach((m, i) => { if (m && m.type === 'enter' && (best < 0 || m.pegIdx < moves[best].pegIdx)) best = i; });
    if (best < 0) return;
    remember();
    pick.moveIdx = best;
    pick.stage = 'ready';
    confirmMove();
  }

  function chooseBoardPeg() {
    if (!isHumanTurn() || undo.open) return;
    remember();
    pick.entry = 'board';
    render();
  }

  function renderEntry(human) {
    const show = entryPending(human);
    showElement('ft-entry-new', show);
    showElement('ft-entry-board', show);
  }

  // "Leave fast track" (Ken, 2026-11-08): by default a player with pegs on the fast track is only offered
  // moves that keep going on it. This button turns the other options on (duck out early, play another peg);
  // pressed again, "Stay on fast track" turns them off. Either way the choice starts over.
  function toggleLeaveFastTrack() {
    const core = window.FastTrackCore;
    if (!core || typeof core.setLeaveFastTrack !== 'function' || undo.open || !isHumanTurn()) return;
    const leaving = core.state.turn.get('leaveFastTrack') === true;
    resetPick();
    core.setLeaveFastTrack(!leaving);
    signature = '';
    render();
  }

  function renderLeaveFastTrack(human) {
    const button = document.getElementById('ft-leave-ft');
    const core = readCore();
    if (!button) return;
    const offered = !!(human && !undo.open && core && core.turn.get('canLeaveFastTrack'));
    const leaving = !!(core && core.turn.get('leaveFastTrack') === true);
    button.hidden = !offered;
    button.textContent = leaving ? 'Stay on fast track' : 'Leave fast track';
    button.classList.toggle('is-leaving', leaving);
    button.title = leaving ? 'Back to moves that keep going on the fast track'
      : 'Show every other move: leave the fast track early or play another peg. Making one of those moves loses the fast track.';
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

  // Not when "Leave fast track" is on offer: the player still has a choice to make (Ken, 2026-11-08).
  function leaveOffered() { const core = readCore(); return !!(core && (core.turn.get('canLeaveFastTrack') || core.turn.get('canChooseEntry'))); }

  function playIfOnlyOne(expected) {
    if (distinctPlays(readMoves()).length !== 1 || leaveOffered()) return;
    setTimeout(() => {
      if (signatureNow() !== expected || !isHumanTurn() || undo.open) return;
      const plays = distinctPlays(readMoves());
      if (plays.length === 1 && !leaveOffered() && typeof window.executeMove === 'function') window.executeMove(plays[0]);
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
      clearHoleLabels(); holeBadgeKey = '';
      if (typeof window.refreshAlwaysOnPegNames === 'function') window.refreshAlwaysOnPegNames();   // pegs that can leave holding show their numbers
      if (isHumanTurn()) { paint([]); playIfOnlyOne(now); }
    }
    render();
  }

  // The instruction banner (fasttrack-3d.js) asks this panel what to say; tell it when the step changes.
  let bannerKey = '';
  function refreshBanner() {
    const key = pick.stage + ':' + signature + ':' + undo.open + ':' + pick.choices.length + ':' + pick.entry;
    if (key === bannerKey || typeof window._refreshInstructionBanner !== 'function') return;
    bannerKey = key;
    window._refreshInstructionBanner();
  }

  // One short sentence per step: what to press, in the words on the buttons.
  function instruction() {
    if (undo.open) return 'Press Undo to take it back';
    if (entryPending(isHumanTurn())) return 'New peg brings one out of holding. Board peg moves one already out';
    const peg = (pick.peg ?? 0) + 1;
    const rest = SEVEN - (pick.steps || 0);
    const texts = {
      peg: isSevenCard() ? 'You have a 7. Pick the first peg to move' : 'Pick a peg to move',
      route: `Peg ${peg} can go more than one way. Pick a route, or tap a lit hole`,
      stop: `Pick where peg ${peg} stops. The number is how many hops it moves`,
      dest: 'Pick the hole to land in, or tap it',
      peg2: `Now pick the peg that moves the other ${rest}`,
      dest2: 'Pick the hole for that peg, or tap it',
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
