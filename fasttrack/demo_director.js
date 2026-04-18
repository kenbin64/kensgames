// ============================================================
// FAST TRACK — LIVE DEMO SPECTATOR MODE
// ============================================================
// Loaded via ?demo=1 URL parameter on 3d.html
//
// Starts a real 4-bot game and lets visitors WATCH actual
// gameplay with cinematic camera. Prominent CTA overlay
// links them to the actual game.
//
// Perfect for Facebook / social media sharing.
// ============================================================

(function () {
    'use strict';

    // ============================================================
    // CONFIGURATION
    // ============================================================
    const DEMO_CFG = {
        playerCount: 4,
        botDrawDelay: 600,      // Faster than normal so action feels crisp
        botMoveDelay: 400,
        themeRotateInterval: 45000, // Rotate theme every 45s
        cameraPanSpeed: 2500,
        showCTA: true,
    };

    // ============================================================
    // THEME ROTATION — Show off all the worlds
    // ============================================================
    const DEMO_THEMES = ['cosmic', 'colosseum', 'spaceace', 'undersea', 'fibonacci'];
    let themeIndex = 0;
    let themeTimer = null;

    function rotateTheme() {
        themeIndex = (themeIndex + 1) % DEMO_THEMES.length;
        if (typeof window.setTheme === 'function') {
            window.setTheme(DEMO_THEMES[themeIndex]);
        }
    }

    function startThemeRotation() {
        themeTimer = setInterval(rotateTheme, DEMO_CFG.themeRotateInterval);
    }

    function stopThemeRotation() {
        if (themeTimer) clearInterval(themeTimer);
    }

    // ============================================================
    // CTA OVERLAY — Persistent "PLAY NOW" banner
    // ============================================================

    function createCTAOverlay() {
        // Top bar — branding
        const topBar = document.createElement('div');
        topBar.id = 'demo-top-bar';
        topBar.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; z-index: 99990;
            background: linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 70%, transparent 100%);
            padding: 12px 20px 24px; display: flex; align-items: center; gap: 14px;
            pointer-events: none;
        `;
        topBar.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 28px;">♠♥♦♣</span>
                <div>
                    <div style="font-size: 20px; font-weight: 800; color: #FFD700; letter-spacing: 0.15em;
                        text-shadow: 0 0 20px rgba(255,215,0,0.4);">FAST TRACK</div>
                    <div style="font-size: 11px; color: #aaa; letter-spacing: 0.3em; text-transform: uppercase;">
                        LIVE GAME • WATCHING BOTS PLAY
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(topBar);

        // Live badge — pulsing red dot
        const liveBadge = document.createElement('div');
        liveBadge.id = 'demo-live-badge';
        liveBadge.style.cssText = `
            position: fixed; top: 14px; right: 20px; z-index: 99991;
            display: flex; align-items: center; gap: 6px;
            background: rgba(0,0,0,0.6); padding: 6px 14px; border-radius: 20px;
            border: 1px solid rgba(255,60,60,0.4);
            pointer-events: none;
        `;
        liveBadge.innerHTML = `
            <div style="width: 8px; height: 8px; border-radius: 50%; background: #ff3c3c;
                animation: livePulse 1.5s infinite; box-shadow: 0 0 8px #ff3c3c;"></div>
            <span style="color: #ff8888; font-size: 11px; font-weight: 700; letter-spacing: 0.15em;">LIVE DEMO</span>
        `;
        document.body.appendChild(liveBadge);

        // Bottom CTA bar
        const ctaBar = document.createElement('div');
        ctaBar.id = 'demo-cta-bar';
        ctaBar.style.cssText = `
            position: fixed; bottom: 0; left: 0; width: 100%; z-index: 99990;
            background: linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 60%, transparent 100%);
            padding: 30px 20px 20px; display: flex; align-items: center; justify-content: center; gap: 16px;
            flex-wrap: wrap;
        `;
        ctaBar.innerHTML = `
            <div style="color: #ccc; font-size: 15px; text-align: center; max-width: 420px; line-height: 1.4;">
                <span style="color: #FFD700; font-weight: 700;">Like what you see?</span>
                Play against smart AI bots or challenge your friends & family!
            </div>
            <a href="3d.html" id="demo-play-btn" onclick="if(window.FTAnalytics)FTAnalytics.ctaClick('demo_play_now')" style="
                display: inline-flex; align-items: center; gap: 8px;
                background: linear-gradient(135deg, #FFD700, #FFA500);
                color: #000; font-size: 18px; font-weight: 800; letter-spacing: 0.1em;
                padding: 14px 36px; border-radius: 12px; text-decoration: none;
                text-transform: uppercase;
                box-shadow: 0 4px 20px rgba(255,215,0,0.4), 0 0 40px rgba(255,165,0,0.2);
                transition: transform 0.2s, box-shadow 0.2s;
                animation: ctaGlow 2s infinite;
            ">
                ▶ PLAY NOW
            </a>
        `;
        document.body.appendChild(ctaBar);

        // Inject animations
        const style = document.createElement('style');
        style.textContent = `
            @keyframes livePulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.4; transform: scale(1.3); }
            }
            @keyframes ctaGlow {
                0%, 100% { box-shadow: 0 4px 20px rgba(255,215,0,0.4), 0 0 40px rgba(255,165,0,0.2); }
                50% { box-shadow: 0 4px 30px rgba(255,215,0,0.7), 0 0 60px rgba(255,165,0,0.4); }
            }
            #demo-play-btn:hover {
                transform: scale(1.06) !important;
                box-shadow: 0 6px 30px rgba(255,215,0,0.6), 0 0 60px rgba(255,165,0,0.3) !important;
            }
            /* Letterbox bars for cinematic feel */
            .demo-letterbox {
                position: fixed; left: 0; width: 100%; background: black;
                z-index: 99989; pointer-events: none;
            }
            .demo-letterbox.top { top: 0; height: 36px; }
            .demo-letterbox.bot { bottom: 0; height: 36px; }
            /* Vignette */
            #demo-vignette {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%);
                z-index: 99988; pointer-events: none;
            }
        `;
        document.body.appendChild(style);

        // Add subtle letterbox + vignette
        const lt = document.createElement('div'); lt.className = 'demo-letterbox top'; document.body.appendChild(lt);
        const lb = document.createElement('div'); lb.className = 'demo-letterbox bot'; document.body.appendChild(lb);
        const vig = document.createElement('div'); vig.id = 'demo-vignette'; document.body.appendChild(vig);
    }

    // ============================================================
    // GAME EVENT COMMENTATOR — Floating action labels
    // ============================================================

    function showActionLabel(text, color = '#FFD700', duration = 2500) {
        const label = document.createElement('div');
        label.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.5);
            font-size: 42px; font-weight: 900; color: ${color};
            letter-spacing: 0.15em; text-transform: uppercase;
            text-shadow: 0 0 30px ${color}88, 0 4px 15px rgba(0,0,0,0.7);
            z-index: 99995; pointer-events: none;
            opacity: 0; transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        `;
        label.textContent = text;
        document.body.appendChild(label);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                label.style.opacity = '1';
                label.style.transform = 'translate(-50%, -50%) scale(1)';
            });
        });

        setTimeout(() => {
            label.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
            label.style.opacity = '0';
            label.style.transform = 'translate(-50%, -60%) scale(0.9)';
            setTimeout(() => label.remove(), 600);
        }, duration);
    }

    // ============================================================
    // HOOK INTO GAME EVENTS — React to real gameplay
    // ============================================================

    let lastTurnPlayer = -1;
    let turnsPlayed = 0;

    function hookGameEvents() {
        // Hook into GameEventSubstrate if available
        if (typeof GameEventSubstrate !== 'undefined') {
            GameEventSubstrate.on(GameEventSubstrate.types.FAST_TRACK_USED, (data) => {
                showActionLabel('⚡ FAST TRACK!', '#FF6600', 3000);
            });

            GameEventSubstrate.on(GameEventSubstrate.types.PEG_CUT, (data) => {
                showActionLabel('💥 CAPTURED!', '#FF4444', 3000);
            });

            GameEventSubstrate.on(GameEventSubstrate.types.BULLSEYE_ENTERED, (data) => {
                showActionLabel('🎯 BULLSEYE!', '#9B59B6', 3000);
            });

            GameEventSubstrate.on(GameEventSubstrate.types.SAFE_ZONE_ENTERED, (data) => {
                showActionLabel('🛡️ SAFE ZONE', '#4ade80', 2500);
            });

            GameEventSubstrate.on(GameEventSubstrate.types.WINNER, (data) => {
                showActionLabel('👑 VICTORY!', '#FFD700', 5000);
                // After win, restart with a new game after a delay
                setTimeout(() => restartDemo(), 8000);
            });
        }

        // Poll for turn changes to announce them visually
        setInterval(() => {
            if (!window.gameState) return;
            const gs = window.gameState;
            if (gs.currentPlayerIndex !== lastTurnPlayer) {
                lastTurnPlayer = gs.currentPlayerIndex;
                turnsPlayed++;

                // Every 30 turns show a subtle theme shift
                if (turnsPlayed > 0 && turnsPlayed % 30 === 0) {
                    rotateTheme();
                }
            }
        }, 500);
    }

    // ============================================================
    // AUTO-START ALL-BOT GAME
    // ============================================================

    function startBotGame() {
        console.log('[Demo] Starting all-bot spectator game...');

        // Hide all UI - start screen, menus, etc.
        hideAllUI();

        // Set AI config to control ALL players (no human)
        if (window.AI_CONFIG) {
            AI_CONFIG.enabled = true;
            AI_CONFIG.players = [0, 1, 2, 3]; // ALL are bots
            AI_CONFIG.drawDelay = DEMO_CFG.botDrawDelay;
            AI_CONFIG.thinkingDelay = DEMO_CFG.botMoveDelay;
        }

        // Configure camera mode
        if (typeof window.setCameraViewMode === 'function') {
            window.setCameraViewMode('follow');
        }

        // Set a theme
        if (typeof window.setTheme === 'function') {
            window.setTheme(DEMO_THEMES[0]);
        }

        // Start music
        try {
            if (window.MusicSubstrate) {
                MusicSubstrate.activate();
                MusicSubstrate.play(DEMO_THEMES[0]);
            }
        } catch (e) { }

        // Initialize a 4-player game
        if (typeof window.initGame === 'function') {
            window.initGame(DEMO_CFG.playerCount);
        }

        // After init, configure all players as AI with bot names
        setTimeout(() => {
            if (!window.gameState) return;

            const botNames = [
                { name: 'Turing', avatar: '🤖', personality: 'aggressive' },
                { name: 'Nexus', avatar: '🌐', personality: 'balanced' },
                { name: 'Cortex', avatar: '🧠', personality: 'cautious' },
                { name: 'Helix', avatar: '⚡', personality: 'aggressive' },
            ];

            // Use ManifoldAI bots if available
            let pool = botNames;
            if (window.BoardManifold) {
                const bots = BoardManifold.pickBots(4);
                pool = bots.map(b => ({ name: b.name, avatar: b.icon, personality: b.name.toLowerCase() }));
            }

            for (let i = 0; i < DEMO_CFG.playerCount; i++) {
                if (window.gameState.players[i]) {
                    const bot = pool[i % pool.length];
                    window.gameState.players[i].name = bot.name;
                    window.gameState.players[i].avatar = bot.avatar;
                    window.gameState.players[i].isAI = true;
                    window.gameState.players[i].isHuman = false;
                    window.gameState.players[i].isLocal = false;
                }
            }

            // Update AI_CONFIG with all player indices
            if (window.AI_CONFIG) {
                AI_CONFIG.players = [0, 1, 2, 3];
                AI_CONFIG.enabled = true;
            }

            // Spawn ManifoldAI entities
            if (window.ManifoldAI) {
                ManifoldAI.spawnEntities([0, 1, 2, 3], 'normal');
            }

            // Update UI panels
            if (window.GameUIMinimal) {
                GameUIMinimal.setPlayers(window.gameState.players, window.gameState.currentPlayerIndex);
            }

            // Now kick off the first AI turn (since initGame may have set up
            // a human player timeout, we need to force AI to take over)
            setTimeout(() => {
                if (window.gameState && typeof window.aiTakeTurn === 'function') {
                    window.aiTakeTurn();
                }
            }, 1000);

            console.log('[Demo] All-bot game started!',
                window.gameState.players.map(p => `${p.avatar} ${p.name}`));
        }, 500);
    }

    // Restart a new demo game after a winner
    function restartDemo() {
        console.log('[Demo] Restarting with new game...');
        turnsPlayed = 0;
        lastTurnPlayer = -1;
        rotateTheme();
        startBotGame();
    }

    // ============================================================
    // HIDE GAME UI
    // ============================================================

    function hideAllUI() {
        const ids = [
            'start-game-screen', 'hamburger-menu', 'settings-panel',
            'camera-panel', 'card-draw-area', 'mom-intro-modal',
            'debug-panel', 'card-rule-popup', 'auth-container',
            'lobby-container', 'exit-game-btn', 'mom-help-btn',
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        document.querySelectorAll('.hamburger-btn, .menu-btn, .settings-btn, .card-container').forEach(el => {
            el.style.display = 'none';
        });

        // Keep player panels visible but minimal — they show who's playing
        // Hide mobile action bar if present
        const mobileBar = document.getElementById('mobile-action-bar');
        if (mobileBar) mobileBar.style.display = 'none';
    }

    // ============================================================
    // INTRO SEQUENCE — Brief cinematic open before bots start
    // ============================================================

    async function playIntro() {
        // Black screen with title
        const black = document.createElement('div');
        black.id = 'demo-intro-black';
        black.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #000; z-index: 100000; display: flex;
            align-items: center; justify-content: center; flex-direction: column;
            transition: opacity 1.2s ease-out;
        `;
        black.innerHTML = `
            <div style="font-size: 72px; font-weight: 900; color: #FFD700;
                letter-spacing: 0.3em; text-shadow: 0 0 40px rgba(255,215,0,0.4);
                opacity: 0; animation: introFadeIn 1.5s ease-out 0.3s forwards;">
                FAST TRACK
            </div>
            <div style="font-size: 18px; color: #888; letter-spacing: 0.4em;
                text-transform: uppercase; margin-top: 16px;
                opacity: 0; animation: introFadeIn 1.5s ease-out 0.8s forwards;">
                Watch • Learn • Play
            </div>
        `;
        document.body.appendChild(black);

        // Inject intro animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes introFadeIn {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.body.appendChild(style);

        // Wait for title to display
        await new Promise(r => setTimeout(r, 3000));

        // Fade out intro
        black.style.opacity = '0';
        await new Promise(r => setTimeout(r, 1200));
        black.remove();
    }

    // ============================================================
    // EXPOSE aiTakeTurn GLOBALLY (needed for demo kickoff)
    // ============================================================

    // We'll do a fallback — find aiTakeTurn in the scope.
    // 3d.html defines it in a script block.
    // We may need to trigger it via a drawCard simulation.

    function kickOffAI() {
        // Try direct call first
        if (typeof window.aiTakeTurn === 'function') {
            window.aiTakeTurn();
            return;
        }
        // Fallback: try to click the deck
        const deck = document.querySelector('.card-deck, #deck-btn, [data-action="draw"]');
        if (deck) {
            deck.click();
            return;
        }
        // Last resort: dispatch the draw event
        if (window.gameState && typeof window.handleDrawCard === 'function') {
            window.handleDrawCard(true);
        }
    }

    // ============================================================
    // MAIN INIT
    // ============================================================

    async function initDemo() {
        console.log('[Demo] Initializing spectator mode...');

        // ── Analytics: demo page view ──
        if (window.FTAnalytics) FTAnalytics.demoView();

        // Cinematic intro
        await playIntro();

        // Create CTA overlay
        createCTAOverlay();

        // Hook game events for action labels
        hookGameEvents();

        // Start the all-bot game
        startBotGame();

        // Start theme rotation
        startThemeRotation();

        console.log('[Demo] Spectator mode active! Share this URL on Facebook.');
    }

    // ============================================================
    // PUBLIC API
    // ============================================================

    window.DemoDirector = {
        start: initDemo,
        restart: restartDemo,
        config: DEMO_CFG,
    };

    // ============================================================
    // WAIT FOR BOARD READY, THEN LAUNCH
    // ============================================================

    function waitForBoard() {
        if (window.boardReady || document.querySelector('#container canvas')) {
            setTimeout(initDemo, 300);
        } else {
            setTimeout(waitForBoard, 200);
        }
    }

    if (document.readyState === 'complete') waitForBoard();
    else window.addEventListener('load', waitForBoard);

})();
