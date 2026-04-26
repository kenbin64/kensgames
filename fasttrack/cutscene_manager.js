/**
 * 🎬 CUTSCENE MANAGER
 * Orchestrates all game cutscenes and celebrations.
 * Cutscenes play AFTER moves complete, not during gameplay.
 * In manual camera mode, smoothly returns to previous camera position.
 */

const CutsceneManager = {
    // State
    isPlaying: false,
    queue: [],
    savedCameraState: null,
    currentCutscene: null,

    // Track seen cutscenes for first-time vs. subsequent behavior
    // Key: "type:playerId" or "type" for global events
    seenCutscenes: new Map(),

    // Last winner tracking (for replay first player)
    lastWinner: null,

    // Game intro taglines
    taglines: [
        "The game that sends your friends back home! 🏠",
        "Race to victory... or send them packing! 📦",
        "Fast moves, faster revenge! ⚡",
        "Where friendship goes to be tested! 😈",
        "May the best peg win! 🏆",
        "Home is where the heart breaks! 💔",
    ],

    // References (set during init)
    scene: null,
    camera: null,
    renderer: null,
    boardGroup: null,

    // Config - FIRST time durations (subsequent = 40% of these or skipped)
    config: {
        transitionDuration: 500,  // ms for camera transitions (snappy)
        cutsceneDuration: {
            fasttrack: 1800,      // First time: full fanfare
            fasttrackShort: 600,  // Subsequent: quick flash
            bullseye: 1500,
            bullseyeShort: 500,
            cut: 2000,
            cutShort: 800,        // Quick stomp animation
            safeZone: 1200,
            safeZoneShort: 0,     // Skip entirely after first
            win: 4000,            // Always full - it's the big moment!
            crown: 800
        },
        // After this many times, skip the cutscene entirely (0 = never skip)
        skipAfterCount: {
            fasttrack: 0,   // Never skip, but shorten
            bullseye: 3,    // Skip after 3rd time
            cut: 0,         // Never skip cuts - they're important
            safeZone: 1,    // Only show first entry per player
            win: 0,         // Never skip
            crown: 0
        }
    },

    // Check if this is first time seeing this cutscene
    isFirstTime: function (type, playerId) {
        playerId = playerId || null;
        const key = playerId !== null ? `${type}:${playerId}` : type;
        return !this.seenCutscenes.has(key);
    },

    // Get count of times this cutscene has been seen
    getSeenCount: function (type, playerId) {
        playerId = playerId || null;
        const key = playerId !== null ? `${type}:${playerId}` : type;
        return this.seenCutscenes.get(key) || 0;
    },

    // Mark cutscene as seen
    markSeen: function (type, playerId) {
        playerId = playerId || null;
        const key = playerId !== null ? `${type}:${playerId}` : type;
        const count = this.seenCutscenes.get(key) || 0;
        this.seenCutscenes.set(key, count + 1);
    },

    // Should we skip this cutscene entirely?
    shouldSkip: function (type, playerId) {
        playerId = playerId || null;
        const skipAfter = this.config.skipAfterCount[type];
        if (skipAfter === 0) return false;
        return this.getSeenCount(type, playerId) >= skipAfter;
    },

    // Get duration based on first-time vs subsequent
    getDuration: function (type, playerId) {
        playerId = playerId || null;
        if (this.isFirstTime(type, playerId)) {
            return this.config.cutsceneDuration[type];
        }
        return this.config.cutsceneDuration[type + 'Short'] ||
            Math.floor(this.config.cutsceneDuration[type] * 0.4);
    },

    // Reset seen cutscenes (for new game)
    reset: function () {
        this.seenCutscenes.clear();
        this.queue = [];
        this.isPlaying = false;
        this.currentCutscene = null;
        console.log('🎬 CutsceneManager reset');
    },

    // Initialize with scene references
    init: function (scene, camera, renderer, boardGroup) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.boardGroup = boardGroup;
        console.log('🎬 CutsceneManager initialized');
    },

    // Save current camera state before cutscene
    saveCameraState: function () {
        if (!this.camera) return;
        this.savedCameraState = {
            position: this.camera.position.clone(),
            rotation: this.camera.rotation.clone(),
            fov: this.camera.fov,
            cameraMode: window.currentCameraView || 'chase'
        };
    },

    // Restore camera state after cutscene (smooth transition)
    restoreCameraState: function (callback) {
        if (!this.savedCameraState || !this.camera) {
            if (callback) callback();
            return;
        }

        const start = {
            x: this.camera.position.x,
            y: this.camera.position.y,
            z: this.camera.position.z
        };
        const end = {
            x: this.savedCameraState.position.x,
            y: this.savedCameraState.position.y,
            z: this.savedCameraState.position.z
        };

        const duration = this.config.transitionDuration;
        const startTime = performance.now();

        const animate = () => {
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / duration, 1);
            const eased = this.easeOutCubic(t);

            this.camera.position.x = start.x + (end.x - start.x) * eased;
            this.camera.position.y = start.y + (end.y - start.y) * eased;
            this.camera.position.z = start.z + (end.z - start.z) * eased;
            this.camera.lookAt(0, 0, 0);

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                this.savedCameraState = null;
                if (callback) callback();
            }
        };

        requestAnimationFrame(animate);
    },

    // Easing function for smooth transitions
    easeOutCubic: function (t) {
        return 1 - Math.pow(1 - t, 3);
    },

    // Queue a cutscene to play (checks skip rules first)
    queueCutscene: function (type, data) {
        const playerId = data.playerId || null;

        // Check if we should skip this cutscene entirely
        if (this.shouldSkip(type, playerId)) {
            console.log(`🎬 Skipping cutscene: ${type} (seen too many times)`);
            return;
        }

        this.queue.push({ type, data, timestamp: Date.now() });
        console.log(`🎬 Queued cutscene: ${type} (${this.isFirstTime(type, playerId) ? 'first' : 'repeat'})`);

        // Start playing if not already
        if (!this.isPlaying) {
            this.playNext();
        }
    },

    // Play the next cutscene in queue
    playNext: function () {
        if (this.queue.length === 0) {
            this.isPlaying = false;
            window._cutSceneActive = false;
            return;
        }

        this.isPlaying = true;
        window._cutSceneActive = true;
        this.currentCutscene = this.queue.shift();

        // Save camera state for manual mode restoration
        if (window.currentCameraView && window.currentCameraView.includes('fixed')) {
            this.saveCameraState();
        }

        // Play the appropriate cutscene
        switch (this.currentCutscene.type) {
            case 'intro':
                this.playGameIntroCutscene(this.currentCutscene.data);
                break;
            case 'fasttrack':
                this.playFastTrackCutscene(this.currentCutscene.data);
                break;
            case 'bullseye':
                this.playBullseyeCutscene(this.currentCutscene.data);
                break;
            case 'cut':
                this.playCutCutscene(this.currentCutscene.data);
                break;
            case 'safeZone':
                this.playSafeZoneCutscene(this.currentCutscene.data);
                break;
            case 'win':
                this.playWinCutscene(this.currentCutscene.data);
                break;
            case 'crown':
                this.playCrownCutscene(this.currentCutscene.data);
                break;
            default:
                console.warn('Unknown cutscene type:', this.currentCutscene.type);
                this.finishCutscene();
        }
    },

    // Finish current cutscene and play next
    finishCutscene: function () {
        // Restore camera if we were in manual mode
        if (this.savedCameraState) {
            this.restoreCameraState(() => {
                this.currentCutscene = null;
                this.playNext();
            });
        } else {
            this.currentCutscene = null;
            this.playNext();
        }
    },

    // ============================================================
    // GAME START & FIRST PLAYER LOGIC
    // ============================================================

    // Determine first player (random for new game, last winner for replay)
    getFirstPlayer: function (players, isReplay = false) {
        if (isReplay && this.lastWinner !== null) {
            // Winner of last game goes first
            const winnerIdx = players.findIndex(p => p.id === this.lastWinner || p.name === this.lastWinner);
            if (winnerIdx !== -1) {
                console.log(`🎮 Replay: Last winner "${players[winnerIdx].name}" goes first!`);
                return winnerIdx;
            }
        }
        // Random first player
        const firstIdx = Math.floor(Math.random() * players.length);
        console.log(`🎮 New game: Random first player "${players[firstIdx].name}"`);
        return firstIdx;
    },

    // Set the last winner (call when game ends)
    setLastWinner: function (playerIdOrName) {
        this.lastWinner = playerIdOrName;
        // Also persist to localStorage for page refreshes
        try {
            localStorage.setItem('fasttrack_lastWinner', playerIdOrName);
        } catch (e) { }
    },

    // Load last winner from localStorage
    loadLastWinner: function () {
        try {
            this.lastWinner = localStorage.getItem('fasttrack_lastWinner');
        } catch (e) { }
    },

    // Play game intro cutscene
    playGameIntroCutscene: function (data) {
        const { players, firstPlayerIndex, onComplete } = data;
        const firstPlayer = players[firstPlayerIndex];
        const tagline = this.taglines[Math.floor(Math.random() * this.taglines.length)];

        console.log('🎬 Playing Game Intro cutscene');

        // Phase 1: Title card with dramatic zoom
        this.showGameIntroOverlay(tagline, firstPlayer, () => {
            if (onComplete) onComplete(firstPlayerIndex);
            this.finishCutscene();
        });
    },

    // Show full-screen game intro overlay
    showGameIntroOverlay: function (tagline, firstPlayer, callback) {
        const overlay = document.createElement('div');
        overlay.id = 'game-intro-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: radial-gradient(ellipse at center, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.95) 100%);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 20000;
            animation: introFadeIn 0.5s ease-out;
        `;

        overlay.innerHTML = `
            <div style="text-align: center; animation: introSlideUp 0.8s ease-out;">
                <div style="font-size: 5rem; margin-bottom: 20px; animation: introPulse 1.5s ease-in-out infinite;">
                    ⚡🎲⚡
                </div>
                <h1 style="font-size: 4rem; color: #FFD700; text-shadow: 0 0 30px #FFD700, 0 4px 8px rgba(0,0,0,0.8); margin: 0; font-family: 'Arial Black', sans-serif;">
                    FAST TRACK
                </h1>
                <p style="font-size: 1.5rem; color: #fff; margin: 20px 0; opacity: 0.9;">
                    ${tagline}
                </p>
            </div>
            <div style="margin-top: 60px; text-align: center; animation: introFadeIn 1s ease-out 1s both;">
                <p style="font-size: 1.2rem; color: #aaa; margin-bottom: 10px;">First to play:</p>
                <div style="font-size: 2rem; color: ${firstPlayer.color || '#fff'}; font-weight: bold; text-shadow: 0 0 20px ${firstPlayer.color || '#fff'};">
                    🎯 ${firstPlayer.name} 🎯
                </div>
            </div>
            <div style="margin-top: 80px; animation: introFadeIn 1s ease-out 1.5s both;">
                <button id="intro-start-btn" style="
                    padding: 15px 50px;
                    font-size: 1.5rem;
                    background: linear-gradient(135deg, #FFD700, #FFA500);
                    border: none;
                    border-radius: 30px;
                    color: #000;
                    font-weight: bold;
                    cursor: pointer;
                    box-shadow: 0 4px 20px rgba(255,215,0,0.5);
                    transition: transform 0.2s, box-shadow 0.2s;
                ">
                    LET'S PLAY! 🎲
                </button>
            </div>
        `;

        document.body.appendChild(overlay);

        // Play intro sound
        if (window.GameSFX) GameSFX.play('game_start');

        // Button click to start
        const btn = overlay.querySelector('#intro-start-btn');
        btn.onmouseenter = () => { btn.style.transform = 'scale(1.1)'; btn.style.boxShadow = '0 6px 30px rgba(255,215,0,0.7)'; };
        btn.onmouseleave = () => { btn.style.transform = 'scale(1)'; btn.style.boxShadow = '0 4px 20px rgba(255,215,0,0.5)'; };
        btn.onclick = () => {
            overlay.style.animation = 'introFadeOut 0.5s ease-in forwards';
            setTimeout(() => {
                overlay.remove();
                if (callback) callback();
            }, 500);
        };

        // Auto-start after 5 seconds if no click
        setTimeout(() => {
            if (document.getElementById('game-intro-overlay')) {
                btn.click();
            }
        }, 5000);
    },

    // ============================================================
    // CUTSCENE IMPLEMENTATIONS
    // ============================================================

    // FASTTRACK! entry celebration
    playFastTrackCutscene: function (data) {
        const { peg, hole, playerColor, playerName, playerId } = data;
        const isFirst = this.isFirstTime('fasttrack', playerId);
        const duration = this.getDuration('fasttrack', playerId);
        this.markSeen('fasttrack', playerId);

        console.log(`🎬 FastTrack cutscene (${isFirst ? 'FIRST' : 'repeat'}) - ${duration}ms`);

        if (isFirst) {
            // Full celebration: graphic + reaction + emojis
            this.showCelebrationGraphic('⚡ FASTTRACK! ⚡', playerColor, () => {
                const reaction = window.getPegReaction ?
                    window.getPegReaction(peg, 'onEnterFastTrack') : 'Zoom!';
                this.showPegReaction(peg, reaction);
                if (window.GameSFX) GameSFX.play('fasttrack_entry');
                this.spawnFloatingEmojis(['⚡', '🏎️', '💨'], 5);
                setTimeout(() => this.finishCutscene(), duration);
            });
        } else {
            // Quick: just sound + small reaction
            if (window.GameSFX) GameSFX.play('fasttrack_entry');
            this.showPegReaction(peg, '⚡');
            setTimeout(() => this.finishCutscene(), duration);
        }
    },

    // Bullseye entry/exit celebration
    playBullseyeCutscene: function (data) {
        const { peg, isEntry, playerColor, playerId } = data;

        if (this.shouldSkip('bullseye', playerId)) {
            this.finishCutscene();
            return;
        }

        const isFirst = this.isFirstTime('bullseye', playerId);
        const duration = this.getDuration('bullseye', playerId);
        this.markSeen('bullseye', playerId);

        if (isFirst) {
            this.showCelebrationGraphic('🎯', playerColor, () => {
                const reaction = window.getPegReaction ?
                    window.getPegReaction(peg, 'onEnterBullseye') : '🎯';
                this.showPegReaction(peg, reaction);
                if (window.GameSFX) GameSFX.play('bullseye');
                this.spawnFloatingEmojis(['🎯', '🎈', '✨'], 6);
                setTimeout(() => this.finishCutscene(), duration);
            });
        } else {
            // Quick flash only
            if (window.GameSFX) GameSFX.play('bullseye');
            setTimeout(() => this.finishCutscene(), duration);
        }
    },

    // Cut opponent - always show but shorter on repeat
    playCutCutscene: function (data) {
        const { victorPeg, victimPeg, victorPlayer, victimPlayer } = data;
        const isFirst = this.isFirstTime('cut');
        const duration = this.getDuration('cut');
        this.markSeen('cut');

        // Get personality reactions
        const victorReaction = window.getPegReaction ?
            window.getPegReaction(victorPeg, 'onCutOpponent') : '💪';
        const victimReaction = window.getPegReaction ?
            window.getPegReaction(victimPeg, 'onGotCut') : '😱';

        // Victor reacts
        this.showPegReaction(victorPeg, victorReaction);
        if (window.GameSFX) GameSFX.play('cut');

        if (isFirst) {
            // Full: victim also reacts with delay
            setTimeout(() => {
                this.showPegReaction(victimPeg, victimReaction);
            }, 500);
        }

        setTimeout(() => this.finishCutscene(), duration);
    },

    // Safe zone entry - ONLY first time per player
    playSafeZoneCutscene: function (data) {
        const { peg, playerColor, playerId } = data;

        if (this.shouldSkip('safeZone', playerId)) {
            // Skip entirely after first time
            this.finishCutscene();
            return;
        }

        this.markSeen('safeZone', playerId);
        const duration = this.getDuration('safeZone', playerId);

        this.showCelebrationGraphic('🛡️ SAFE!', playerColor, () => {
            const reaction = window.getPegReaction ?
                window.getPegReaction(peg, 'onEnterSafeZone') : '🛡️';
            this.showPegReaction(peg, reaction);
            if (window.GameSFX) GameSFX.play('safe_zone');
            setTimeout(() => this.finishCutscene(), duration);
        });
    },

    // Golden crown on winning hole
    playCrownCutscene: function (data) {
        const { holePosition, playerColor } = data;
        console.log('🎬 Playing Crown cutscene');

        // Spawn 3D golden crown above winning hole
        this.spawnCrownAboveHole(holePosition, playerColor);

        setTimeout(() => this.finishCutscene(), this.config.cutsceneDuration.crown);
    },

    // Win celebration (delegates to VictoryCeremony if available)
    playWinCutscene: function (data) {
        const { winner, homePosition, playerColor } = data;
        console.log('🎬 Playing Win cutscene for', winner.name);

        const showReplay = () => {
            if (window.showReplayPrompt) {
                window.showReplayPrompt(winner && winner.name);
            }
        };

        if (window.VictoryCeremony) {
            VictoryCeremony.start(winner, homePosition, playerColor, () => {
                this.finishCutscene();
                showReplay();
            });
        } else {
            // Fallback
            this.showCelebrationGraphic('🏆 WINNER! 🏆', playerColor, () => {
                this.spawnFloatingEmojis(['🏆', '👑', '🎉', '🎊', '✨'], 20);
                setTimeout(() => {
                    this.finishCutscene();
                    showReplay();
                }, this.config.cutsceneDuration.win);
            });
        }
    },

    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================

    // Show large celebration text
    showCelebrationGraphic: function (text, color, callback) {
        const overlay = document.createElement('div');
        overlay.className = 'cutscene-celebration-graphic';
        overlay.innerHTML = text;
        overlay.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0);
            font-size: 4rem;
            font-weight: bold;
            color: ${color || '#FFD700'};
            text-shadow: 0 0 20px ${color || '#FFD700'}, 0 4px 8px rgba(0,0,0,0.5);
            z-index: 10000;
            pointer-events: none;
            animation: cutscenePop 0.5s ease-out forwards;
        `;

        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.style.animation = 'cutsceneFadeOut 0.5s ease-in forwards';
            setTimeout(() => overlay.remove(), 500);
            if (callback) callback();
        }, 1000);
    },

    // Show peg reaction bubble
    showPegReaction: function (peg, text) {
        if (!text || !peg) return;

        // Create floating text bubble above peg
        const bubble = document.createElement('div');
        bubble.className = 'peg-reaction-bubble';
        bubble.textContent = text;
        bubble.style.cssText = `
            position: fixed;
            padding: 8px 16px;
            background: rgba(0,0,0,0.85);
            color: #fff;
            border-radius: 20px;
            font-size: 1.1rem;
            z-index: 10001;
            pointer-events: none;
            animation: bubbleFloat 2s ease-out forwards;
            white-space: nowrap;
        `;

        // Position above peg (would need 3D to 2D projection)
        bubble.style.top = '40%';
        bubble.style.left = '50%';
        bubble.style.transform = 'translateX(-50%)';

        document.body.appendChild(bubble);
        setTimeout(() => bubble.remove(), 2000);
    },

    // Spawn floating emojis like balloons
    spawnFloatingEmojis: function (emojis, count) {
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                const emoji = document.createElement('div');
                emoji.textContent = emojis[Math.floor(Math.random() * emojis.length)];
                emoji.style.cssText = `
                    position: fixed;
                    bottom: -50px;
                    left: ${10 + Math.random() * 80}%;
                    font-size: ${2 + Math.random() * 2}rem;
                    z-index: 10000;
                    pointer-events: none;
                    animation: emojiFloat ${3 + Math.random() * 2}s ease-out forwards;
                `;
                document.body.appendChild(emoji);
                setTimeout(() => emoji.remove(), 5000);
            }, i * 100);
        }
    },

    // Spawn 3D golden crown above winning hole
    spawnCrownAboveHole: function (position, color) {
        // This would create a 3D crown mesh - simplified for now
        console.log('👑 Spawning crown at', position);
        this.showCelebrationGraphic('👑', color, null);
    }
};

// CSS for cutscene animations
const cutsceneStyles = document.createElement('style');
cutsceneStyles.textContent = `
    @keyframes cutscenePop {
        0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
        50% { transform: translate(-50%, -50%) scale(1.2); }
        100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    }
    @keyframes cutsceneFadeOut {
        0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
    }
    @keyframes bubbleFloat {
        0% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-60px); }
    }
    @keyframes emojiFloat {
        0% { opacity: 1; transform: translateY(0) rotate(0deg); }
        100% { opacity: 0; transform: translateY(-100vh) rotate(360deg); }
    }
    @keyframes introFadeIn {
        0% { opacity: 0; }
        100% { opacity: 1; }
    }
    @keyframes introFadeOut {
        0% { opacity: 1; }
        100% { opacity: 0; }
    }
    @keyframes introSlideUp {
        0% { opacity: 0; transform: translateY(50px); }
        100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes introPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
    }
    @keyframes emojiPop {
        0% { transform: translate(-50%, 0) scale(0.5); opacity: 1; }
        70% { transform: translate(-50%, -33vh) scale(1.2); opacity: 1; }
        85% { transform: translate(-50%, -33vh) scale(1.5); opacity: 0.8; }
        100% { transform: translate(-50%, -33vh) scale(0); opacity: 0; }
    }
`;
document.head.appendChild(cutsceneStyles);

// Export
window.CutsceneManager = CutsceneManager;
console.log('🎬 CutsceneManager module loaded');

