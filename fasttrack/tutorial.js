/**
 * FastTrack Tutorial System
 * =========================
 * Interactive step-by-step tutorial that teaches game mechanics.
 * 
 * Features:
 *   - Skip Tutorial button (visible at all times during tutorial)
 *   - Step-by-step walkthrough of board holes, cards, and game flow
 *   - Cutscenes: FastTrack traversal, cutting opponents, bullseye
 *   - Can be launched anytime via the Tutorial button
 *   - On completion or skip, game starts normally
 *
 * Copyright (c) 2024-2026 Kenneth Bingham — ButterflyFX
 * Licensed under CC BY 4.0
 */

'use strict';

window.FastTrackTutorial = (function () {

    // ═══════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════

    let currentStep = 0;
    let isActive = false;
    let overlay = null;
    let onComplete = null; // callback when tutorial ends

    // ═══════════════════════════════════════════════════════════════
    // TUTORIAL CONTENT — ordered steps
    // ═══════════════════════════════════════════════════════════════

    const HOLE_STEPS = [
        {
            id: 'holding',
            title: '🏠 Holding Area',
            body: 'Each player has <b>5 pegs</b> that start in their <b>Holding Area</b>. ' +
                  'Pegs are safe here — they cannot be cut. ' +
                  'You need an <b>Ace, 6, or Joker</b> to bring a peg onto the board.',
            highlight: 'hold-0-0'
        },
        {
            id: 'home',
            title: '💎 Diamond / Home Hole',
            body: 'When you play an entry card, your peg goes to your <b>Diamond Hole</b> (also called the Home Hole). ' +
                  'This is also the <b>winner hole</b> — your 5th peg must land here exactly to win!<br><br>' +
                  '<b>Warning:</b> Opponents can cut you here!',
            highlight: 'home-0'
        },
        {
            id: 'outer',
            title: '🔵 Outer Perimeter Track',
            body: 'The main board is an <b>84-hole track</b> that runs clockwise around the hexagonal board. ' +
                  'Each of the 6 sections has 14 holes including side-left, outer, home, side-right, and a FastTrack corner.<br><br>' +
                  'Pegs move <b>clockwise</b> (except the 4 card which goes backward).',
            highlight: 'outer-0-0'
        },
        {
            id: 'safezone-entry',
            title: '🚪 Safe Zone Entry',
            body: 'After your peg completes a full lap around the board, it becomes <b>eligible for safe zone</b>. ' +
                  'When it reaches the entry point (2 holes before your Diamond Hole), it turns into your safe zone.<br><br>' +
                  'Your peg <b>must</b> enter the safe zone — it cannot pass the entry going forward.',
            highlight: 'outer-0-2'
        },
        {
            id: 'safezone',
            title: '🛡️ Safe Zone (4 holes)',
            body: 'Each player has <b>4 safe zone holes</b>. Pegs here are <b>completely safe</b> — they cannot be cut.<br><br>' +
                  'You must land on each hole with an exact count. Fill all 4 safe zone holes, then get your 5th peg to the winner hole to win!',
            list: [
                'Safe Zone 1 — closest to entry',
                'Safe Zone 2',
                'Safe Zone 3',
                'Safe Zone 4 — deepest position'
            ],
            highlight: 'safe-0-1'
        },
        {
            id: 'fasttrack',
            title: '⚡ FastTrack Holes (Inner Ring)',
            body: 'The 6 corner holes connecting each section are <b>FastTrack entry points</b>. ' +
                  'When your peg lands <b>exactly</b> on one of these, you can choose to <b>enter FastTrack mode</b>.<br><br>' +
                  'FastTrack is a shortcut — your peg hops between the 6 inner holes instead of walking the full outer track!',
            list: [
                'ft-0 through ft-5 — one per section corner',
                'Enter at any ft-* EXCEPT your own color',
                'Exit at your own ft-* corner → heading to safe zone',
                'You CANNOT enter FastTrack going backward (4 card)'
            ],
            highlight: 'ft-1'
        },
        {
            id: 'bullseye',
            title: '🎯 Bullseye (Center Hole)',
            body: 'The <b>center hole</b> (Bullseye) is a special protected position. ' +
                  'You can enter the Bullseye by:<br>' +
                  '• Landing 1 step past an ft-* hole on the perimeter, OR<br>' +
                  '• Using a 1-step card while on FastTrack<br><br>' +
                  'While in the Bullseye, your peg is <b>safe from cuts</b> (unless an opponent enters with a royal card). ' +
                  'Exit with a <b>Jack, Queen, or King</b> — you jump to your FastTrack corner!',
            highlight: 'center'
        }
    ];

    const CARD_STEPS = [
        {
            id: 'cards-intro',
            title: '🃏 Card Guide',
            body: 'FastTrack uses a <b>standard 54-card deck</b> (52 cards + 2 Jokers). ' +
                  'Each player gets their own shuffled deck.<br><br>' +
                  'Draw a card each turn to see how far your peg can move.'
        },
        {
            id: 'entry-cards',
            title: '🚀 Entry Cards — A, 6, Joker',
            body: 'These cards let you bring a peg from <b>Holding</b> onto the board:',
            list: [
                '<b>Ace (A)</b> — Enter from holding OR move 1 space. <span style="color:#4ade80;">+Extra Turn!</span>',
                '<b>Six (6)</b> — Enter from holding OR move 6 spaces. <span style="color:#4ade80;">+Extra Turn!</span>',
                '<b>Joker (★)</b> — Enter from holding OR move 1 space. <span style="color:#4ade80;">+Extra Turn!</span>'
            ]
        },
        {
            id: 'royal-cards',
            title: '👑 Royal Cards — J, Q, K',
            body: 'Royal cards move <b>1 space</b> and grant an extra turn. ' +
                  'Their superpower: they can <b>exit the Bullseye</b> to your FastTrack corner!',
            list: [
                '<b>Jack (J)</b> — Move 1 space. Exit Bullseye. <span style="color:#4ade80;">+Extra Turn!</span>',
                '<b>Queen (Q)</b> — Move 1 space. Exit Bullseye. <span style="color:#4ade80;">+Extra Turn!</span>',
                '<b>King (K)</b> — Move 1 space. Exit Bullseye. <span style="color:#4ade80;">+Extra Turn!</span>'
            ]
        },
        {
            id: 'number-cards',
            title: '🔢 Number Cards — 2, 3, 5, 8, 9, 10',
            body: 'Standard movement cards. Move your peg <b>clockwise</b> by the card value. No special traits.',
            list: [
                '<b>2</b> — Move 2 spaces',
                '<b>3</b> — Move 3 spaces',
                '<b>5</b> — Move 5 spaces',
                '<b>8</b> — Move 8 spaces',
                '<b>9</b> — Move 9 spaces',
                '<b>10</b> — Move 10 spaces'
            ]
        },
        {
            id: 'special-four',
            title: '⏪ Four (4) — Backward Card',
            body: 'The only card that moves <b>BACKWARD</b> (counter-clockwise) by 4 spaces.<br><br>' +
                  '<b>Restrictions:</b> Cannot back into FastTrack, Bullseye, or Safe Zone.<br>' +
                  '<b>Strategy:</b> Use it to position near your safe zone entry, or to dodge an opponent!',
            list: [
                'Moves 4 spaces counter-clockwise',
                'Cannot enter FastTrack going backward',
                'Cannot enter Bullseye going backward',
                'Cannot enter Safe Zone going backward',
                'CAN pass through home/diamond holes'
            ]
        },
        {
            id: 'special-seven',
            title: '✂️ Seven (7) — Split Card',
            body: 'Move <b>7 spaces</b> with one peg, or <b>split</b> the 7 between two pegs! ' +
                  'For example: 3 + 4, or 2 + 5, or 1 + 6.<br><br>' +
                  'You must use <b>all 7 steps</b>. If splitting, both moves are clockwise.',
            list: [
                'Full move: one peg moves 7 spaces',
                'Split: divide 7 between two pegs (e.g. 3+4)',
                'Both split moves are clockwise',
                'Need 2+ pegs on the board to split'
            ]
        }
    ];

    const CUTSCENE_STEPS = [
        {
            id: 'cutscene-fasttrack',
            title: '⚡ Cutscene: FastTrack Shortcut',
            body: 'Watch how a peg takes the <b>FastTrack!</b><br><br>' +
                  '1️⃣ Peg lands on an ft-* hole (not their own color)<br>' +
                  '2️⃣ Player chooses "Enter FastTrack"<br>' +
                  '3️⃣ Peg hops around the <b>6 inner holes</b> (ft-0 → ft-1 → ... → ft-5)<br>' +
                  '4️⃣ When peg reaches their own ft-* corner, it <b>exits to the outer track</b> heading for safe zone!<br><br>' +
                  '<em>FastTrack skips most of the outer track — a huge shortcut!</em>',
            animation: 'fasttrack'
        },
        {
            id: 'cutscene-cut',
            title: '✂️ Cutscene: Cutting an Opponent',
            body: 'When your peg <b>lands on the same hole</b> as an opponent\'s peg, you <b>cut them!</b><br><br>' +
                  '1️⃣ Your peg moves to the destination hole<br>' +
                  '2️⃣ The opponent\'s peg is sent back to their <b>Holding Area</b><br>' +
                  '3️⃣ They must draw an entry card (A, 6, Joker) to get back on the board<br><br>' +
                  '<em>Cutting is a key strategy — it can set opponents back significantly!</em>',
            animation: 'cut'
        },
        {
            id: 'cutscene-bullseye',
            title: '🎯 Cutscene: Bullseye Entry & Exit',
            body: 'The <b>Bullseye</b> (center hole) is a safe haven:<br><br>' +
                  '1️⃣ Peg must pass through an ft-* hole with <b>exactly 1 step remaining</b><br>' +
                  '2️⃣ Player chooses "Enter Bullseye" — peg goes to center<br>' +
                  '3️⃣ Peg is <b>safe</b> in the Bullseye (unless opponent enters with a Royal card)<br>' +
                  '4️⃣ To exit: draw a <b>Jack, Queen, or King</b> — peg jumps to your FastTrack corner<br><br>' +
                  '<em>The Bullseye is powerful but risky — if an opponent enters with a Royal, you get cut!</em>',
            animation: 'bullseye'
        }
    ];

    const GAMEPLAY_STEPS = [
        {
            id: 'how-to-start',
            title: '🎮 How to Start',
            body: 'Each turn follows these steps:<br><br>' +
                  '1️⃣ <b>Draw a card</b> — click/tap the deck<br>' +
                  '2️⃣ <b>See your options</b> — green circles show where you can move<br>' +
                  '3️⃣ <b>Click a destination</b> — your peg moves there<br>' +
                  '4️⃣ If you drew an entry card (A, 6, Joker) with pegs in holding, you can bring one out<br><br>' +
                  'If you have <b>no legal moves</b>, your turn is automatically skipped.'
        },
        {
            id: 'how-to-win',
            title: '🏆 How to Win',
            body: 'To win the game:<br><br>' +
                  '1️⃣ Get <b>4 pegs</b> into your <b>Safe Zone</b> (the 4 protected holes)<br>' +
                  '2️⃣ Get your <b>5th peg</b> to land <b>exactly</b> on your <b>Diamond/Winner hole</b><br><br>' +
                  'The 5th peg must have <b>completed a full circuit</b> around the board. ' +
                  'When it lands on the Diamond hole with 4 pegs already safe — <b>YOU WIN!</b> 🎉'
        }
    ];

    // Combine all steps
    const ALL_STEPS = [
        ...HOLE_STEPS,
        ...CARD_STEPS,
        ...CUTSCENE_STEPS,
        ...GAMEPLAY_STEPS
    ];

    // ═══════════════════════════════════════════════════════════════
    // UI CREATION
    // ═══════════════════════════════════════════════════════════════

    function createOverlay() {
        if (overlay) overlay.remove();

        overlay = document.createElement('div');
        overlay.id = 'tutorial-overlay';
        overlay.innerHTML = `
            <div class="tutorial-backdrop"></div>
            <div class="tutorial-panel">
                <div class="tutorial-progress">
                    <div class="tutorial-progress-bar" id="tutorial-progress-bar"></div>
                </div>
                <div class="tutorial-step-counter" id="tutorial-step-counter">1 / ${ALL_STEPS.length}</div>
                <h2 class="tutorial-title" id="tutorial-title"></h2>
                <div class="tutorial-body" id="tutorial-body"></div>
                <div class="tutorial-list" id="tutorial-list"></div>
                <div class="tutorial-nav">
                    <button class="tutorial-btn tutorial-btn-prev" id="tutorial-prev" onclick="FastTrackTutorial.prev()">← Back</button>
                    <button class="tutorial-btn tutorial-btn-skip" id="tutorial-skip" onclick="FastTrackTutorial.skip()">Skip Tutorial</button>
                    <button class="tutorial-btn tutorial-btn-next" id="tutorial-next" onclick="FastTrackTutorial.next()">Next →</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Inject styles if not already present
        if (!document.getElementById('tutorial-styles')) {
            const style = document.createElement('style');
            style.id = 'tutorial-styles';
            style.textContent = TUTORIAL_CSS;
            document.head.appendChild(style);
        }

        // Animate in
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP RENDERING
    // ═══════════════════════════════════════════════════════════════

    function renderStep(index) {
        if (index < 0 || index >= ALL_STEPS.length) return;
        currentStep = index;

        const step = ALL_STEPS[index];
        const title = document.getElementById('tutorial-title');
        const body = document.getElementById('tutorial-body');
        const list = document.getElementById('tutorial-list');
        const counter = document.getElementById('tutorial-step-counter');
        const progressBar = document.getElementById('tutorial-progress-bar');
        const prevBtn = document.getElementById('tutorial-prev');
        const nextBtn = document.getElementById('tutorial-next');

        if (title) title.innerHTML = step.title;
        if (body) body.innerHTML = step.body;
        if (counter) counter.textContent = `${index + 1} / ${ALL_STEPS.length}`;
        if (progressBar) progressBar.style.width = `${((index + 1) / ALL_STEPS.length) * 100}%`;

        // List items
        if (list) {
            if (step.list && step.list.length > 0) {
                list.innerHTML = '<ul>' + step.list.map(item => `<li>${item}</li>`).join('') + '</ul>';
                list.style.display = 'block';
            } else {
                list.innerHTML = '';
                list.style.display = 'none';
            }
        }

        // Nav buttons
        if (prevBtn) prevBtn.style.visibility = index === 0 ? 'hidden' : 'visible';
        if (nextBtn) {
            nextBtn.textContent = index === ALL_STEPS.length - 1 ? 'Start Game ✅' : 'Next →';
        }

        // Highlight holes on the board if applicable
        highlightBoardHole(step.highlight || null);
    }

    // ═══════════════════════════════════════════════════════════════
    // BOARD HIGHLIGHTING
    // ═══════════════════════════════════════════════════════════════

    function highlightBoardHole(holeId) {
        // Remove previous highlight
        clearTutorialHighlight();

        if (!holeId) return;

        // Try to highlight hole in 3D scene
        if (window.holeRegistry) {
            // Look for the 3D mesh for this hole
            for (const [id, data] of window.holeRegistry) {
                if (id === holeId && data.mesh) {
                    // Create a pulsing ring around the hole
                    const ring = createHighlightRing(data.mesh.position, data.mesh);
                    if (ring) {
                        ring.userData.isTutorialHighlight = true;
                        if (window.scene) window.scene.add(ring);
                    }

                    // Attempt to move camera toward the hole
                    focusCameraOnPosition(data.mesh.position);
                    break;
                }
            }
        }
    }

    function createHighlightRing(position, holeMesh) {
        if (typeof THREE === 'undefined') return null;
        const geometry = new THREE.RingGeometry(0.4, 0.55, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        const ring = new THREE.Mesh(geometry, material);
        ring.position.copy(position);
        ring.position.y += 0.15;
        ring.rotation.x = -Math.PI / 2;

        // Pulsing animation
        let phase = 0;
        ring.userData.animateId = setInterval(() => {
            phase += 0.06;
            const s = 1 + Math.sin(phase) * 0.2;
            ring.scale.set(s, s, 1);
            material.opacity = 0.5 + Math.sin(phase) * 0.3;
        }, 30);

        return ring;
    }

    function clearTutorialHighlight() {
        if (!window.scene) return;
        const toRemove = [];
        window.scene.traverse(child => {
            if (child.userData && child.userData.isTutorialHighlight) {
                if (child.userData.animateId) clearInterval(child.userData.animateId);
                toRemove.push(child);
            }
        });
        toRemove.forEach(obj => window.scene.remove(obj));
    }

    function focusCameraOnPosition(position) {
        if (!window.controls || !window.camera) return;
        // Smoothly look at the highlighted hole
        const target = position.clone();
        target.y = Math.max(target.y, 0.2);
        window.controls.target.lerp(target, 0.5);
        window.controls.update();
    }

    // ═══════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════

    function start(completeCb) {
        if (isActive) return;
        isActive = true;
        currentStep = 0;
        onComplete = completeCb || null;
        createOverlay();
        renderStep(0);
        console.log('[Tutorial] Started — ' + ALL_STEPS.length + ' steps');
    }

    function next() {
        if (!isActive) return;
        if (currentStep >= ALL_STEPS.length - 1) {
            // Last step — finish tutorial
            finish();
        } else {
            renderStep(currentStep + 1);
        }
    }

    function prev() {
        if (!isActive || currentStep <= 0) return;
        renderStep(currentStep - 1);
    }

    function skip() {
        if (!isActive) return;
        console.log('[Tutorial] Skipped at step ' + (currentStep + 1));
        finish();
    }

    function finish() {
        isActive = false;
        clearTutorialHighlight();
        if (overlay) {
            overlay.classList.remove('visible');
            setTimeout(() => {
                if (overlay) overlay.remove();
                overlay = null;
            }, 400);
        }
        console.log('[Tutorial] Completed');
        if (onComplete) onComplete();
    }

    function isRunning() {
        return isActive;
    }

    // ═══════════════════════════════════════════════════════════════
    // TUTORIAL BUTTON (persistent — shown during game)
    // ═══════════════════════════════════════════════════════════════

    function createTutorialButton() {
        if (document.getElementById('tutorial-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'tutorial-btn';
        btn.title = 'Tutorial';
        btn.innerHTML = '📖';
        btn.onclick = () => {
            if (isActive) return; // already running
            start(null); // no callback — just viewing
        };
        document.body.appendChild(btn);
    }

    // ═══════════════════════════════════════════════════════════════
    // CSS
    // ═══════════════════════════════════════════════════════════════

    const TUTORIAL_CSS = `
        /* Tutorial Overlay */
        #tutorial-overlay {
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            z-index: 30000;
            pointer-events: auto;
            opacity: 0;
            transition: opacity 0.4s ease;
        }
        #tutorial-overlay.visible { opacity: 1; }

        .tutorial-backdrop {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.55);
            backdrop-filter: blur(4px);
        }

        .tutorial-panel {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 520px;
            max-height: 80vh;
            overflow-y: auto;
            background: linear-gradient(135deg, rgba(15, 15, 35, 0.97), rgba(30, 20, 60, 0.97));
            border: 2px solid rgba(100, 255, 150, 0.5);
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 0 60px rgba(100, 255, 150, 0.2), inset 0 0 30px rgba(100, 255, 150, 0.05);
            color: #e0e0e0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .tutorial-progress {
            width: 100%;
            height: 4px;
            background: rgba(255,255,255,0.1);
            border-radius: 2px;
            margin-bottom: 12px;
            overflow: hidden;
        }
        .tutorial-progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #4ade80, #22d3ee);
            border-radius: 2px;
            transition: width 0.4s ease;
        }
        .tutorial-step-counter {
            text-align: center;
            color: #888;
            font-size: 12px;
            margin-bottom: 10px;
        }

        .tutorial-title {
            color: #4ade80;
            font-size: 22px;
            margin: 0 0 15px 0;
            text-align: center;
        }

        .tutorial-body {
            font-size: 15px;
            line-height: 1.7;
            margin-bottom: 12px;
        }
        .tutorial-body b { color: #ffd700; }
        .tutorial-body em { color: #a78bfa; font-style: italic; }

        .tutorial-list {
            margin-bottom: 15px;
        }
        .tutorial-list ul {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .tutorial-list li {
            padding: 8px 12px;
            border-left: 3px solid rgba(100, 255, 150, 0.4);
            margin-bottom: 6px;
            background: rgba(100, 255, 150, 0.05);
            border-radius: 0 8px 8px 0;
            font-size: 14px;
            line-height: 1.5;
        }
        .tutorial-list li b { color: #ffd700; }

        .tutorial-nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            margin-top: 20px;
        }
        .tutorial-btn {
            padding: 10px 20px;
            border: none;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .tutorial-btn-prev {
            background: rgba(255,255,255,0.1);
            color: #ccc;
            border: 1px solid rgba(255,255,255,0.2);
        }
        .tutorial-btn-prev:hover { background: rgba(255,255,255,0.2); }
        .tutorial-btn-next {
            background: linear-gradient(135deg, #4ade80, #22d3ee);
            color: #000;
            min-width: 100px;
        }
        .tutorial-btn-next:hover {
            transform: scale(1.05);
            box-shadow: 0 0 15px rgba(74, 222, 128, 0.5);
        }
        .tutorial-btn-skip {
            background: rgba(255, 80, 80, 0.15);
            color: #ff8888;
            border: 1px solid rgba(255, 80, 80, 0.3);
            font-size: 12px;
            padding: 8px 14px;
        }
        .tutorial-btn-skip:hover {
            background: rgba(255, 80, 80, 0.3);
            color: #ff6666;
        }

        /* Tutorial persistent button */
        #tutorial-btn {
            position: fixed;
            bottom: 260px;
            right: 20px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: linear-gradient(135deg, rgba(100, 255, 150, 0.2), rgba(34, 211, 238, 0.2));
            border: 2px solid rgba(100, 255, 150, 0.4);
            color: #fff;
            font-size: 22px;
            cursor: pointer;
            z-index: 10002;
            display: none; /* shown after game init */
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 20px rgba(100, 255, 150, 0.2);
            backdrop-filter: blur(10px);
            transition: all 0.3s;
        }
        #tutorial-btn:hover {
            transform: scale(1.1);
            box-shadow: 0 0 30px rgba(100, 255, 150, 0.4);
            background: linear-gradient(135deg, rgba(100, 255, 150, 0.35), rgba(34, 211, 238, 0.35));
        }

        /* Mobile adjustments */
        @media (max-width: 768px) {
            .tutorial-panel {
                width: 95%;
                padding: 20px;
                max-height: 85vh;
            }
            .tutorial-title { font-size: 18px; }
            .tutorial-body { font-size: 14px; }
            .tutorial-nav { flex-wrap: wrap; }
            .tutorial-btn { flex: 1; min-width: 80px; }
            .tutorial-btn-skip { order: 3; flex-basis: 100%; margin-top: 8px; }

            #tutorial-btn {
                bottom: 240px;
                right: 10px;
                width: 44px;
                height: 44px;
                font-size: 18px;
            }
        }
    `;

    // ═══════════════════════════════════════════════════════════════
    // PUBLIC INTERFACE
    // ═══════════════════════════════════════════════════════════════

    return {
        start,
        next,
        prev,
        skip,
        finish,
        isRunning,
        createTutorialButton,
    };

})();

console.log('[Tutorial] Module loaded');
