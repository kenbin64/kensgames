/**
 * Ask Mom — Game Advisor System
 * ==============================
 * Context-aware game advisor that provides strategic advice.
 *
 * When it IS the player's turn:
 *   - Analyzes all legal moves
 *   - Recommends the best option with explanation
 *   - Player can choose an option → auto-executes the move
 *
 * When it is NOT the player's turn:
 *   - Provides tips and game information
 *   - Explains what opponents might be doing
 *   - Teaches strategy concepts
 *
 * Copyright (c) 2024-2026 Kenneth Bingham — ButterflyFX
 * Licensed under CC BY 4.0
 */

'use strict';

window.AskMomAdvisor = (function () {

    // ═══════════════════════════════════════════════════════════════
    // STRATEGY TIPS — shown when it's not the player's turn
    // ═══════════════════════════════════════════════════════════════

    const TIPS = [
        "💡 Always try to bring pegs out from holding when you draw an Ace, 6, or Joker. Having more pegs on the board gives you more options!",
        "💡 The 4 card moves backward. Use it to your advantage — position a peg just past your safe zone entry, so your next forward card sends it in!",
        "💡 FastTrack is a huge shortcut. When you land exactly on an ft-* hole, seriously consider entering — it can save you 50+ spaces of travel!",
        "💡 Don't leave pegs sitting on your home/diamond hole. They can be cut there! Move them forward as soon as possible.",
        "💡 The Bullseye (center) is safe, but you need a Royal card (J, Q, K) to exit. If no Royals are left in your deck, avoid entering!",
        "💡 When cutting an opponent, prioritize cutting pegs that are close to their safe zone — it hurts them the most!",
        "💡 Save your Royal cards (J, Q, K) for exiting the Bullseye. They only move 1 space, so they're less valuable for regular movement.",
        "💡 The 7 card split is powerful. You can move one peg into the safe zone AND advance another peg at the same time!",
        "💡 Watch for the 4-card trap. Don't park your peg exactly 4 spaces in front of an opponent — they might draw a 4 and back into you!",
        "💡 When your safe zone has 4 pegs, your 5th peg must land EXACTLY on the winner hole. High cards might overshoot — low cards are your friend!",
        "💡 Keep track of which entry cards (A, 6, Joker) are left in your deck — if you run out, pegs in holding are stuck!",
        "💡 Entering FastTrack automatically makes your peg eligible for your safe zone, even if it hasn't completed a full circuit!",
    ];

    let tipIndex = 0;

    function getNextTip() {
        const tip = TIPS[tipIndex % TIPS.length];
        tipIndex++;
        return tip;
    }

    // ═══════════════════════════════════════════════════════════════
    // MOVE ANALYSIS — evaluates and ranks all legal moves
    // ═══════════════════════════════════════════════════════════════

    function analyzeMoves(legalMoves, gameState, playerIndex) {
        if (!legalMoves || legalMoves.length === 0 || !gameState) return [];

        const player = gameState.players[playerIndex];
        if (!player) return [];

        const analyzed = legalMoves.map(move => {
            const score = scoreMoveForAdvice(move, player, gameState);
            return { move, ...score };
        });

        // Sort by score descending
        analyzed.sort((a, b) => b.score - a.score);
        return analyzed;
    }

    function scoreMoveForAdvice(move, player, gameState) {
        let score = 0;
        let reason = '';
        let emoji = '➡️';

        // Win condition
        if (move.toHoleId && move.toHoleId.includes('winner')) {
            return { score: 1000, reason: 'This move WINS the game!', emoji: '🏆', priority: 'critical' };
        }

        // Safe zone entry
        if (move.toHoleId && move.toHoleId.startsWith('safe-')) {
            const safeNum = parseInt(move.toHoleId.split('-')[2]) || 1;
            score = 200 + safeNum * 10;
            reason = `Move into Safe Zone position ${safeNum}. Pegs in the safe zone are protected and can't be cut!`;
            emoji = '🛡️';
            return { score, reason, emoji, priority: 'high' };
        }

        // Home hole as winning position (5th peg)
        const pegsInSafe = player.peg.filter(p => p.holeType === 'safezone').length;
        if (move.toHoleId && move.toHoleId.startsWith('home-') && pegsInSafe >= 4) {
            return { score: 900, reason: 'Land on Winner Hole with 4 pegs in safe zone — THIS WINS THE GAME!', emoji: '🏆', priority: 'critical' };
        }

        // Enter from holding
        if (move.type === 'enter') {
            const pegsOnBoard = player.peg.filter(p => p.holeType !== 'holding').length;
            score = pegsOnBoard < 2 ? 150 : 80;
            reason = pegsOnBoard < 2
                ? 'Bring a peg from holding to the board. You need more pegs in play!'
                : 'Bring another peg onto the board. More pegs = more options.';
            emoji = '🚀';
            return { score, reason, emoji, priority: pegsOnBoard < 2 ? 'high' : 'medium' };
        }

        // FastTrack entry
        if (move.isFastTrackEntry) {
            score = 160;
            reason = 'Enter the FastTrack shortcut! This skips most of the outer track and gets your peg closer to the safe zone much faster.';
            emoji = '⚡';
            return { score, reason, emoji, priority: 'high' };
        }

        // Bullseye/center entry
        if (move.toHoleId === 'center' || move.isCenterOption) {
            // Check if cutting opponent in bullseye
            const cutTarget = findCutAtHole('center', player, gameState);
            if (cutTarget) {
                score = 250;
                reason = `Enter the Bullseye AND cut ${cutTarget.name}'s peg! Double win!`;
                emoji = '🎯✂️';
            } else {
                score = 100;
                reason = 'Enter the Bullseye for safety. You\'ll need a Royal card (J/Q/K) to exit.';
                emoji = '🎯';
            }
            return { score, reason, emoji, priority: cutTarget ? 'high' : 'medium' };
        }

        // Cutting an opponent
        const cutTarget = findCutAtHole(move.toHoleId, player, gameState);
        if (cutTarget) {
            const isVictimAdvanced = cutTarget.peg && (cutTarget.peg.eligibleForSafeZone || cutTarget.peg.inHomeStretch);
            score = isVictimAdvanced ? 220 : 130;
            reason = isVictimAdvanced
                ? `Cut ${cutTarget.name}'s peg and send it to holding! They were close to their safe zone — huge setback!`
                : `Cut ${cutTarget.name}'s peg and send it back to holding!`;
            emoji = '✂️';
            return { score, reason, emoji, priority: 'high' };
        }

        // Default: forward progress
        const steps = move.steps || 1;
        score = 10 + steps;

        // Bonus for moves that reach a dangerous position for opponents
        // Penalty for being in front of opponents
        let dangerPenalty = 0;
        if (gameState.players && move.toHoleId) {
            for (const opp of gameState.players) {
                if (opp.index === player.index) continue;
                for (const oppPeg of opp.peg) {
                    if (oppPeg.holeType === 'holding' || oppPeg.inBullseye) continue;
                    if (typeof window.getTrackDistance === 'function') {
                        const dist = window.getTrackDistance(oppPeg.holeId, move.toHoleId);
                        if (dist !== null && dist >= 1 && dist <= 4) {
                            dangerPenalty = Math.max(dangerPenalty, 30);
                        }
                    }
                }
            }
        }
        score -= dangerPenalty;

        if (dangerPenalty > 0) {
            reason = `Move ${steps} spaces forward. ⚠️ Be careful — an opponent could reach this spot!`;
            emoji = '⚠️';
        } else {
            reason = `Move ${steps} spaces forward.`;
            emoji = '➡️';
        }

        return { score, reason, emoji, priority: 'low' };
    }

    function findCutAtHole(holeId, player, gameState) {
        if (!gameState || !gameState.players || !holeId) return null;
        for (const opp of gameState.players) {
            if (opp.index === player.index) continue;
            const opponentPeg = opp.peg.find(p => p.holeId === holeId && p.holeType !== 'holding');
            if (opponentPeg) {
                return { name: opp.name || `Player ${opp.index + 1}`, peg: opponentPeg, player: opp };
            }
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════════
    // RICH PANEL RENDERING
    // ═══════════════════════════════════════════════════════════════

    function showAdvice() {
        const panel = document.getElementById('mom-help-panel');
        const messageEl = document.getElementById('mom-message-text');
        const optionsEl = document.getElementById('mom-options');
        if (!panel || !messageEl || !optionsEl) return;

        optionsEl.innerHTML = '';

        const gs = window.gameState;
        if (!gs) {
            messageEl.textContent = "The game hasn't started yet! Click START GAME when you're ready.";
            optionsEl.innerHTML = '<button class="mom-option" onclick="hideMomHelp()">Got it!</button>';
            panel.classList.add('visible');
            return;
        }

        const humanIdx = getHumanPlayerIndex(gs);
        const isMyTurn = gs.currentPlayerIndex === humanIdx;

        if (!isMyTurn) {
            // NOT MY TURN — tips and info
            showTipsAndInfo(gs, humanIdx, messageEl, optionsEl);
        } else if (gs.phase === 'draw') {
            // My turn, draw phase
            messageEl.innerHTML = "🃏 It's your turn! <b>Draw a card</b> from the deck to see your move options.";
            addOption(optionsEl, "Where's the deck?", () => {
                if (window.cardUI && typeof window.cardUI.flashDeck === 'function') {
                    window.cardUI.flashDeck();
                }
                hideMomHelp();
            });
            addOption(optionsEl, "Thanks, Mom!", () => hideMomHelp());
        } else if (gs.phase === 'play') {
            // My turn, play phase — analyze moves and advise
            showMoveAdvice(gs, humanIdx, messageEl, optionsEl);
        } else {
            messageEl.textContent = "I'm here if you need help! Just ask anytime.";
            addOption(optionsEl, "Thanks, Mom!", () => hideMomHelp());
        }

        panel.classList.add('visible');
    }

    function showTipsAndInfo(gs, humanIdx, messageEl, optionsEl) {
        const currentPlayer = gs.players[gs.currentPlayerIndex];
        const currentName = currentPlayer ? currentPlayer.name : 'Someone';

        // Build situational info
        const humanPlayer = gs.players[humanIdx];
        const myPegsInSafe = humanPlayer ? humanPlayer.peg.filter(p => p.holeType === 'safezone').length : 0;
        const myPegsOnBoard = humanPlayer ? humanPlayer.peg.filter(p => p.holeType !== 'holding' && !p.completedCircuit).length : 0;
        const myPegsInHolding = humanPlayer ? humanPlayer.peg.filter(p => p.holeType === 'holding').length : 0;

        let info = `<b>${currentName}</b> is playing right now. While you wait, here's some info:\n\n`;
        info += `📊 <b>Your Status:</b><br>`;
        info += `• ${myPegsOnBoard} peg${myPegsOnBoard !== 1 ? 's' : ''} on the board<br>`;
        info += `• ${myPegsInSafe} peg${myPegsInSafe !== 1 ? 's' : ''} in safe zone (need 4!)<br>`;
        info += `• ${myPegsInHolding} peg${myPegsInHolding !== 1 ? 's' : ''} in holding<br><br>`;
        info += getNextTip();

        messageEl.innerHTML = info;

        addOption(optionsEl, "Another tip!", () => {
            messageEl.innerHTML = info.replace(/💡.*$/, getNextTip());
        }, false);
        addOption(optionsEl, "Got it!", () => hideMomHelp());
    }

    function showMoveAdvice(gs, humanIdx, messageEl, optionsEl) {
        const moves = window.legalMoves;
        if (!moves || moves.length === 0) {
            messageEl.innerHTML = "😔 You have no legal moves with this card. Your turn will be skipped.";
            addOption(optionsEl, "That's okay!", () => hideMomHelp());
            return;
        }

        const analyzed = analyzeMoves(moves, gs, humanIdx);
        if (analyzed.length === 0) {
            messageEl.innerHTML = "🤔 I'm not sure what to recommend here. Trust your instincts!";
            addOption(optionsEl, "Thanks, Mom!", () => hideMomHelp());
            return;
        }

        // Get card info
        const card = gs.currentCard;
        const cardName = card ? (card.rank || card.value || '?') : '?';

        // Show top advice
        const best = analyzed[0];
        let advice = `You drew a <b>${cardName}</b>. You have <b>${moves.length}</b> possible move${moves.length > 1 ? 's' : ''}.<br><br>`;
        advice += `${best.emoji} <b>Mom's Recommendation:</b><br>${best.reason}`;

        if (analyzed.length > 1) {
            advice += '<br><br>Choose one of these options:';
        }

        messageEl.innerHTML = advice;

        // Show top 4 move options as buttons
        const maxOptions = Math.min(analyzed.length, 4);
        for (let i = 0; i < maxOptions; i++) {
            const item = analyzed[i];
            const move = item.move;
            const peg = gs.players[humanIdx]?.peg.find(p => p.id === move.pegId);
            const pegNum = peg ? (typeof window.getPegNumber === 'function' ? window.getPegNumber(peg.id) : peg.id) : '?';

            let label = `${item.emoji} `;
            if (move.type === 'enter') {
                label += `Enter peg from holding`;
            } else {
                label += `Peg #${pegNum}: ${move.fromHoleId || '?'} → ${move.toHoleId}`;
            }
            if (i === 0) label += ' ⭐';

            addOption(optionsEl, label, () => {
                hideMomHelp();
                executeAdvice(move);
            });
        }

        // Dismiss option
        addOption(optionsEl, "I'll decide myself", () => hideMomHelp());
    }

    // ═══════════════════════════════════════════════════════════════
    // AUTO-EXECUTE — runs the move the player selected
    // ═══════════════════════════════════════════════════════════════

    function executeAdvice(move) {
        if (!move) return;
        console.log('[AskMom] Executing advised move:', move.toHoleId, move);

        // Use the same execution path as clicking a hole
        if (typeof window.executeMoveDirectly === 'function') {
            if (typeof window.clearHighlights === 'function') window.clearHighlights();
            window.executeMoveDirectly(move);
        } else if (typeof window.executeHoleClick === 'function') {
            window.executeHoleClick(move.toHoleId);
        } else {
            console.warn('[AskMom] No execute function available — cannot auto-execute');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════

    function getHumanPlayerIndex(gs) {
        if (!gs || !gs.players) return 0;
        // First non-AI player
        for (let i = 0; i < gs.players.length; i++) {
            if (typeof window.isAIPlayer === 'function' && !window.isAIPlayer(i)) return i;
            if (!gs.players[i].isAI && !gs.players[i].isBot) return i;
        }
        return 0;
    }

    function addOption(container, text, action, closePanel) {
        const btn = document.createElement('button');
        btn.className = 'mom-option';
        btn.innerHTML = text;
        btn.onclick = () => {
            if (action) action();
            if (closePanel !== false && text !== 'Another tip!') hideMomHelp();
        };
        container.appendChild(btn);
    }

    function hideMomHelp() {
        const panel = document.getElementById('mom-help-panel');
        if (panel) panel.classList.remove('visible');
    }

    // ═══════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════

    return {
        showAdvice,
        analyzeMoves,
        getNextTip,
    };

})();

console.log('[AskMom] Advisor module loaded');
