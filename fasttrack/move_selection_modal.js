/**
 * ============================================================
 * MOVE SELECTION MODAL
 * Touch-friendly move selection interface for FastTrack
 * Replaces tiny hole clicking with large, tappable cards
 * ============================================================
 */

class MoveSelectionModal {
    constructor() {
        this.modal = null;
        this.moves = [];
        this.onMoveSelected = null;
        this.isMobile = this.detectMobile();
        this.currentGameState = null;
        this.createModal();
        
        console.log('[MoveSelectionModal] Initialized, isMobile:', this.isMobile);
    }
    
    detectMobile() {
        return window.innerWidth <= 768 || 
               /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    createModal() {
        const modal = document.createElement('div');
        modal.id = 'move-selection-modal';
        modal.className = this.isMobile ? 'bottom-sheet' : 'centered-card';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">Choose Your Move</h2>
                    <button class="modal-close" aria-label="Close">×</button>
                </div>
                <div class="modal-body" id="move-options-container"></div>
            </div>
        `;
        document.body.appendChild(modal);
        this.modal = modal;
        this.attachEventListeners();
    }
    
    attachEventListeners() {
        // Close button
        const closeBtn = this.modal.querySelector('.modal-close');
        closeBtn.addEventListener('click', () => this.hide());
        
        // Backdrop click to close
        const backdrop = this.modal.querySelector('.modal-backdrop');
        backdrop.addEventListener('click', () => this.hide());
        
        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('visible')) {
                this.hide();
                e.preventDefault();
            }
        });
        
        // Swipe down to dismiss on mobile
        if (this.isMobile) {
            this.setupSwipeToDismiss();
        }
    }
    
    setupSwipeToDismiss() {
        const content = this.modal.querySelector('.modal-content');
        let startY = 0;
        let currentY = 0;
        
        content.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
        });
        
        content.addEventListener('touchmove', (e) => {
            currentY = e.touches[0].clientY;
            const diff = currentY - startY;
            
            // Only allow swipe down
            if (diff > 0) {
                content.style.transform = `translateY(${diff}px)`;
            }
        });
        
        content.addEventListener('touchend', () => {
            const diff = currentY - startY;
            
            if (diff > 100) {
                // Swipe threshold met - dismiss
                this.hide();
            } else {
                // Snap back
                content.style.transform = '';
            }
        });
    }
    
    show(moves, gameState, onSelect) {
        this.moves = moves;
        this.currentGameState = gameState;
        this.onMoveSelected = onSelect;
        
        console.log('[MoveSelectionModal] Showing', moves.length, 'moves');
        
        // Calculate best move for easy/intermediate difficulty
        this.bestMove = this.calculateBestMove(moves);
        
        this.renderMoves();
        this.modal.classList.add('visible');
        
        // Haptic feedback on mobile
        if (this.isMobile && navigator.vibrate) {
            navigator.vibrate(10);
        }
        
        // Update title with move count and recommendation
        const title = this.modal.querySelector('.modal-title');
        const pegCount = new Set(moves.map(m => m.pegId)).size;
        const difficulty = window.GAME_CONFIG?.difficulty || 'easy';
        const showRecommendation = difficulty === 'easy' || difficulty === 'intermediate';
        
        if (showRecommendation && this.bestMove) {
            title.textContent = `Choose Your Move (⭐ = Recommended)`;
        } else if (pegCount > 1) {
            title.textContent = `Choose Your Move (${moves.length} options, ${pegCount} pegs)`;
        } else {
            title.textContent = `Choose Your Move (${moves.length} options)`;
        }
    }
    
    hide() {
        this.modal.classList.remove('visible');
        
        // Reset transform
        const content = this.modal.querySelector('.modal-content');
        if (content) {
            content.style.transform = '';
        }
    }
    
    renderMoves() {
        const container = document.getElementById('move-options-container');
        container.innerHTML = '';
        
        // Group moves by peg
        const groupedMoves = this.groupByPeg(this.moves);
        
        for (const [pegId, pegMoves] of Object.entries(groupedMoves)) {
            const pegGroup = this.createPegGroup(pegId, pegMoves);
            container.appendChild(pegGroup);
        }
    }
    
    groupByPeg(moves) {
        const grouped = {};
        for (const move of moves) {
            const pegId = move.pegId || 'unknown';
            if (!grouped[pegId]) {
                grouped[pegId] = [];
            }
            grouped[pegId].push(move);
        }
        return grouped;
    }
    
    createPegGroup(pegId, moves) {
        const group = document.createElement('div');
        group.className = 'peg-group';
        
        const pegNum = this.getPegNumber(pegId);
        const header = document.createElement('div');
        header.className = 'peg-header';
        header.textContent = `🎯 Peg #${pegNum}`;
        group.appendChild(header);
        
        // Sort moves by strategic value
        const sortedMoves = this.sortMoves(moves);
        
        for (const move of sortedMoves) {
            const card = this.createMoveCard(move);
            group.appendChild(card);
        }
        
        return group;
    }
    
    sortMoves(moves) {
        // Sort by priority: cuts > fasttrack > safe zone > winner > regular
        return moves.sort((a, b) => {
            const scoreA = this.getMoveScore(a);
            const scoreB = this.getMoveScore(b);
            return scoreB - scoreA;
        });
    }
    
    getMoveScore(move) {
        let score = 0;
        
        // Winner hole is highest priority
        if (move.toHoleId && move.toHoleId.includes('winner')) {
            score += 1000;
        }
        
        // Cuts are high priority
        if (this.findCutTarget(move.toHoleId)) {
            score += 500;
        }
        
        // FastTrack entry is strategic
        if (move.isFastTrackEntry) {
            score += 300;
        }
        
        // Safe zone is good
        if (move.toHoleId && move.toHoleId.includes('safe')) {
            score += 200;
        }
        
        // Bullseye is strategic
        if (move.toHoleId === 'center') {
            score += 250;
        }
        
        // Longer moves slightly preferred
        score += (move.steps || 0) * 10;
        
        return score;
    }
    
    calculateBestMove(moves) {
        // For easy and intermediate difficulty, recommend the best move
        const difficulty = window.GAME_CONFIG?.difficulty || 'easy';
        
        if (difficulty !== 'easy' && difficulty !== 'intermediate') {
            return null; // No recommendations for normal/hard/expert/warpath
        }
        
        if (!moves || moves.length === 0) return null;
        
        // Score all moves
        let bestMove = moves[0];
        let bestScore = this.getMoveScore(bestMove);
        
        for (const move of moves) {
            const score = this.getMoveScore(move);
            
            // For easy mode, avoid cuts unless it's the only option
            if (difficulty === 'easy') {
                const isCut = this.findCutTarget(move.toHoleId);
                const hasNonCutMoves = moves.some(m => !this.findCutTarget(m.toHoleId));
                
                if (isCut && hasNonCutMoves) {
                    continue; // Skip cuts in easy mode if there are other options
                }
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }
        
        return bestMove;
    }
    
    createMoveCard(move) {
        const card = document.createElement('button');
        card.className = 'move-card';
        card.dataset.moveId = move.pegId + '-' + move.toHoleId;
        
        // Determine move type and styling
        const moveType = this.getMoveType(move);
        card.classList.add(`move-type-${moveType.class}`);
        
        // Check if this is the recommended move
        const isRecommended = this.bestMove && 
                             move.pegId === this.bestMove.pegId && 
                             move.toHoleId === this.bestMove.toHoleId;
        
        if (isRecommended) {
            card.classList.add('recommended-move');
        }
        
        card.innerHTML = `
            <div class="move-icon">${moveType.icon}</div>
            <div class="move-details">
                <div class="move-title">${moveType.title}</div>
                <div class="move-subtitle">${move.steps || 0} step${move.steps !== 1 ? 's' : ''}</div>
            </div>
            <div class="move-badge">
                ${isRecommended ? '<span class="badge-recommended">⭐ Best</span>' : ''}
                <span class="badge-steps">${move.steps || 0}</span>
            </div>
        `;
        
        // Click handler
        card.addEventListener('click', () => {
            this.selectMove(move);
        });
        
        // Keyboard support
        card.setAttribute('tabindex', '0');
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.selectMove(move);
            }
        });
        
        return card;
    }
    
    getMoveType(move) {
        // Determine move type and return icon, title, class
        
        // Winner hole
        if (move.toHoleId && move.toHoleId.includes('winner')) {
            return { icon: '🏆', title: 'Winner Hole!', class: 'winner' };
        }
        
        // Bullseye/center
        if (move.toHoleId === 'center') {
            return { icon: '🎯', title: 'Enter Bullseye', class: 'bullseye' };
        }
        
        // FastTrack entry
        if (move.isFastTrackEntry) {
            return { icon: '⚡', title: 'Enter FastTrack', class: 'fasttrack' };
        }
        
        // Leaving FastTrack
        if (move.isLeaveFastTrack) {
            if (move.isForcedFTExit) {
                return { icon: '⚠️', title: 'Exit FastTrack (Blocked)', class: 'forced' };
            } else {
                return { icon: '🔄', title: 'Leave FastTrack', class: 'leave-ft' };
            }
        }
        
        // Safe zone
        if (move.toHoleId && move.toHoleId.includes('safe')) {
            const safeNum = move.toHoleId.split('-').pop();
            return { icon: '🛡️', title: `Safe Zone ${safeNum}`, class: 'safe' };
        }
        
        // Check for cut
        const cutTarget = this.findCutTarget(move.toHoleId);
        if (cutTarget) {
            return { icon: '⚔️', title: 'Cut Opponent!', class: 'cut' };
        }
        
        // FastTrack hole (traversing)
        if (move.toHoleId && move.toHoleId.startsWith('ft-')) {
            const ftNum = move.toHoleId.replace('ft-', '');
            return { icon: '⭐', title: `FastTrack ${ftNum}`, class: 'ft-traverse' };
        }
        
        // Home hole
        if (move.toHoleId && move.toHoleId.startsWith('home-')) {
            return { icon: '🏠', title: 'Home Position', class: 'home' };
        }
        
        // Default - simplify hole name
        const simpleName = this.simplifyHoleId(move.toHoleId);
        return { icon: '📍', title: simpleName, class: 'normal' };
    }
    
    simplifyHoleId(holeId) {
        if (!holeId) return 'Move';
        
        const parts = holeId.split('-');
        if (parts[0] === 'outer') {
            return `Outer ${parts[1]}-${parts[2]}`;
        } else if (parts[0] === 'side') {
            return `Side ${parts[1]}-${parts[2]}-${parts[3]}`;
        } else if (parts[0] === 'home') {
            return `Home ${parts[1]}`;
        }
        return holeId;
    }
    
    findCutTarget(holeId) {
        // Check if an opponent peg is at this hole
        if (!this.currentGameState || !this.currentGameState.players) {
            return null;
        }
        
        const currentPlayerIdx = this.currentGameState.currentPlayerIndex;
        
        for (const player of this.currentGameState.players) {
            if (player.index === currentPlayerIdx) continue;
            
            for (const peg of player.peg || []) {
                if (peg.holeId === holeId) {
                    return { player, peg };
                }
            }
        }
        
        return null;
    }
    
    getPegNumber(pegId) {
        // Extract peg number from ID (e.g., "peg-0-2" -> "3")
        if (typeof window.getPegNumber === 'function') {
            return window.getPegNumber(pegId);
        }
        
        // Fallback: parse from ID
        const parts = pegId.split('-');
        if (parts.length >= 3) {
            return parseInt(parts[2]) + 1;
        }
        return '?';
    }
    
    selectMove(move) {
        console.log('[MoveSelectionModal] Move selected:', move);
        
        // Haptic feedback
        if (this.isMobile && navigator.vibrate) {
            navigator.vibrate(30);
        }
        
        this.hide();
        
        if (this.onMoveSelected) {
            this.onMoveSelected(move);
        }
    }
}

// Create global instance
window.moveSelectionModal = new MoveSelectionModal();
console.log('[MoveSelectionModal] Global instance created');
