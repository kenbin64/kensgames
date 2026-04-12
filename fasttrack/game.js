/**
 * FastTrack - Main Game Entry Point
 *
 * MINIMAL SURFACE ARCHITECTURE
 * Total game logic: ~150 lines (orchestration)
 * Modules: ~900 lines (substrates + manifolds)
 * Total: ~1050 lines vs 17,194 original (94% reduction)
 */

(function() {
    'use strict';

    // ================================
    // INITIALIZE
    // ================================

    // Initialize renderer (creates canvas in container)
    FastTrackRender.init('container');

    // Hide loading screen after brief delay
    setTimeout(() => {
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';
    }, 500);
    
    // ================================
    // GAME SETUP
    // ================================
    
    function startGame(options) {
        GameManifold.init({
            playerCount: options.playerCount || 4,
            playerNames: options.playerNames,
            aiPlayers: options.aiPlayers || [1, 2, 3], // Default: player 0 is human
            settings: typeof SettingsSubstrate !== 'undefined' ? SettingsSubstrate.getAll() : {}
        });
        
        FastTrackRender.renderBoard();
        FastTrackRender.renderPegs();
        
        // Wire up events
        GameManifold.on('onCardDrawn', onCardDrawn);
        GameManifold.on('onMoveExecuted', onMoveExecuted);
        GameManifold.on('onTurnEnd', onTurnEnd);
        GameManifold.on('onGameEnd', onGameEnd);
        
        // Start first turn
        nextTurn();
    }
    
    // ================================
    // TURN FLOW
    // ================================
    
    function nextTurn() {
        const player = GameManifold.state.players[GameManifold.currentPlayer];
        updateUI(`${player.name}'s turn`);
        
        if (player.isAI) {
            AIManifold.think(() => {
                GameManifold.aiTakeTurn();
            });
        } else {
            GameManifold.startTurn();
            showDrawButton();
        }
    }
    
    function onCardDrawn(data) {
        const card = data.card;
        const moves = data.moves;
        
        updateUI(`Drew ${CardSubstrate.getDisplay(card)}`);
        showCard(card);
        
        if (moves.length === 0) {
            updateUI('No legal moves - turn ends');
            setTimeout(() => GameManifold.endTurn(), 1500);
        } else {
            FastTrackRender.highlightMoves(moves);
            enableMoveSelection(moves);
        }
    }
    
    function onMoveExecuted(data) {
        const move = data.move;
        const peg = PegSubstrate.getPeg(move.pegId);
        
        FastTrackRender.clearHighlights();
        
        // Animate the move
        FastTrackRender.animatePegMove(move.pegId, move.from, move.to, () => {
            FastTrackRender.renderPegs();
            
            if (data.cuts) {
                playSound('cut');
                showCutAnimation(data.cuts);
            }
        });
    }
    
    function onTurnEnd(data) {
        hideCard();
        disableMoveSelection();
        
        if (GameManifold.isPlaying) {
            setTimeout(nextTurn, 500);
        }
    }
    
    function onGameEnd(data) {
        const winner = GameManifold.state.players[data.winner];
        showWinScreen(winner);
    }
    
    // ================================
    // USER INPUT
    // ================================
    
    function onDrawClick() {
        if (!GameManifold.state.players[GameManifold.currentPlayer].isAI) {
            GameManifold.drawCard();
        }
    }
    
    function onMoveClick(move) {
        GameManifold.executeMove(move);
        setTimeout(() => GameManifold.endTurn(), 800);
    }
    
    function enableMoveSelection(moves) {
        // Add click handlers to highlighted holes
        moves.forEach(move => {
            const holeEl = document.querySelector(`[data-hole="${move.to}"]`);
            if (holeEl) {
                holeEl.onclick = () => onMoveClick(move);
                holeEl.classList.add('selectable');
            }
        });
    }
    
    function disableMoveSelection() {
        document.querySelectorAll('.selectable').forEach(el => {
            el.onclick = null;
            el.classList.remove('selectable');
        });
    }
    
    // ================================
    // UI HELPERS
    // ================================
    
    function updateUI(message) {
        const status = document.getElementById('status');
        if (status) status.textContent = message;
    }
    
    function showDrawButton() {
        const btn = document.getElementById('draw-btn');
        if (btn) btn.style.display = 'block';
    }
    
    function hideDrawButton() {
        const btn = document.getElementById('draw-btn');
        if (btn) btn.style.display = 'none';
    }
    
    function showCard(card) {
        const cardEl = document.getElementById('current-card');
        if (cardEl) {
            cardEl.textContent = CardSubstrate.getDisplay(card);
            cardEl.style.display = 'block';
        }
        hideDrawButton();
    }
    
    function hideCard() {
        const cardEl = document.getElementById('current-card');
        if (cardEl) cardEl.style.display = 'none';
    }
    
    function showWinScreen(winner) {
        const overlay = document.getElementById('win-overlay');
        if (overlay) {
            overlay.querySelector('.winner-name').textContent = winner.name;
            overlay.style.display = 'flex';
        }
    }
    
    function showCutAnimation(pegId) {
        const peg = PegSubstrate.getPeg(pegId);
        if (peg?.mesh) {
            peg.mesh.material.emissive.setHex(0xff0000);
            setTimeout(() => peg.mesh.material.emissive.setHex(0), 500);
        }
    }

    function playSound(type) {
        // Audio (optional)
        console.log('Sound:', type);
    }

    // ================================
    // PLAYER PANELS
    // ================================

    function renderPlayerPanels() {
        const container = document.getElementById('player-panels');
        if (!container) return;

        container.innerHTML = '';
        GameManifold.state.players.forEach((player, i) => {
            const colorHex = '#' + player.color.toString(16).padStart(6, '0');
            const isActive = i === GameManifold.currentPlayer;
            const finishedCount = PegSubstrate.getPlayerPegs(i).filter(p => p.isFinished).length;
            const homeCount = PegSubstrate.getHomePegs(i).length;

            const panel = document.createElement('div');
            panel.className = 'player-panel' + (isActive ? ' active' : '');
            panel.innerHTML = `
                <div class="player-name">
                    <span class="player-indicator" style="background: ${colorHex}; box-shadow: 0 0 8px ${colorHex}"></span>
                    ${player.name}${player.isAI ? ' 🤖' : ' 👤'}
                </div>
                <div class="player-pegs">🏠 ${homeCount} | 🏁 ${finishedCount}/5</div>
            `;
            container.appendChild(panel);
        });
    }

    // ================================
    // ANIMATION LOOP
    // ================================

    function animate() {
        requestAnimationFrame(animate);
        FastTrackRender.render();
    }

    // ================================
    // START
    // ================================

    // Wire up UI
    document.getElementById('draw-btn')?.addEventListener('click', onDrawClick);
    document.getElementById('settings-btn')?.addEventListener('click', () => alert('Settings coming soon!'));
    document.getElementById('view-btn')?.addEventListener('click', () => FastTrackRender.resetView());

    // Start game with default options
    startGame({ playerCount: 4 });
    renderPlayerPanels();
    animate();

    console.log('🏁 FastTrack loaded — Minimal Surface Architecture');
    
})();

