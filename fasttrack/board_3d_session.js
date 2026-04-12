    (function() {
        'use strict';
        
        // Session state
        let sessionData = null;
        let myPlayerId = null;
        let ws = null;
        let isMultiplayer = false;
        
        // Listen for messages from parent window (index.html iframe integration)
        window.addEventListener('message', (event) => {
            const data = event.data;
            
            if (data.type === 'initGame') {
                console.log('Received session data from parent:', data);
                sessionData = data.session;
                myPlayerId = data.playerId;
                isMultiplayer = true;
                
                // Connect to WebSocket
                connectToSession(data.wsUrl, sessionData.code);
                
                // Start the game with session players
                initMultiplayerGame();
            }
        });
        
        // Check URL params for direct game access
        const urlParams = new URLSearchParams(window.location.search);
        const sessionCode = urlParams.get('session') || urlParams.get('code');
        const playerId = urlParams.get('player');
        const debugMode = urlParams.get('debug') === '1' || urlParams.get('debug') === 'true';
        const quickplayMode = urlParams.get('quickplay') === '1' || urlParams.get('quickply') === '1';
        
        // Dimensional mode manifold — only observed modes manifest
        const modeManifold = {
            quickplay: quickplayMode && !sessionCode && !debugMode,
            debug: debugMode && !sessionCode,
            session: sessionCode && (playerId || urlParams.get('multiplayer') === 'true'),
            default: true // Always exists as potential
        };
        
        // Observation-based manifestation — no if-else branching
        const observedMode = Object.keys(modeManifold).find(key => modeManifold[key]);
        
        console.log(`[DIMENSIONAL] Observed mode: ${observedMode}`);
        
        // Each mode is a self-invoking manifold
        const modeInvocations = {
            quickplay: () => {
                console.log('[QUICKPLAY] Manifesting from observation...');
                const startScreen = document.getElementById('start-game-screen');
                if (startScreen) startScreen.style.display = 'none';
                
                if (window.GameInit) {
                    window.GameInit.waitAndStart(10000);
                } else {
                    let waitAttempts = 0;
                    const waitForGameInit = setInterval(() => {
                        waitAttempts++;
                        if (window.GameInit) {
                            clearInterval(waitForGameInit);
                            window.GameInit.waitAndStart(10000);
                        } else if (waitAttempts >= 50) {
                            clearInterval(waitForGameInit);
                            console.error('GameInit not ready after 5 seconds');
                        }
                    }, 100);
                }
            },
            
            debug: () => {
                console.log('[DEBUG] Manifesting from observation...');
                const startScreen = document.getElementById('start-game-screen');
                if (startScreen) startScreen.style.display = 'none';
                
                // Show debug overlay
                const debugOverlay = document.createElement('div');
                debugOverlay.id = 'debug-overlay';
                debugOverlay.innerHTML = `
                    <div style="position: fixed; top: 10px; left: 10px; background: rgba(0,0,0,0.8); color: #0f0; padding: 10px; font-family: monospace; z-index: 10000;">
                        <div>DEBUG MODE</div>
                        <div id="debug-info"></div>
                    </div>
                `;
                document.body.appendChild(debugOverlay);
                
                let debugAttempts = 0;
                const waitForDebugReady = setInterval(() => {
                    debugAttempts++;
                    const hr = window.holeRegistry;
                    const holeCount = hr ? hr.size : 0;
                    if (holeCount > 0 && !window.boardReady) {
                        window.boardReady = true;
                        document.getElementById('debug-info').innerHTML = `Board ready: ${holeCount} holes`;
                    }
                    
                    if (window.GameInit && window.GameInit.isReady()) {
                        clearInterval(waitForDebugReady);
                        window.GameInit.startGame(3);
                    } else if (debugAttempts >= 100) {
                        clearInterval(waitForDebugReady);
                        console.error('Debug mode timeout');
                    }
                }, 100);
            },
            
            session: () => {
                console.log('[SESSION] Manifesting from observation...');
                const startScreen = document.getElementById('start-game-screen');
                if (startScreen) startScreen.style.display = 'none';

                // Session data handling manifests from observation
                let storedSession = null;
                try {
                    const stored = sessionStorage.getItem('fasttrack_session');
                    if (stored) {
                        storedSession = JSON.parse(stored);
                        sessionStorage.removeItem('fasttrack_session');
                    }
                } catch (e) {
                    console.warn('Could not read session from storage:', e);
                }

                // Fallback: build session data from lobby's ft_session_players roster
                // (lobby_client.js stores the roster under this key before redirecting)
                if (!storedSession) {
                    try {
                        const roster = JSON.parse(sessionStorage.getItem('ft_session_players') || 'null');
                        const myUserId = sessionStorage.getItem('ft_my_user_id') || '';
                        if (roster && roster.length > 0) {
                            storedSession = {
                                code: sessionCode,
                                playerId: myUserId,
                                players: roster.map(p => ({
                                    id: p.user_id,
                                    username: p.username,
                                    avatar: p.avatar,
                                    playerType: p.is_ai ? 'ai' : 'human',
                                    user_id: p.user_id
                                }))
                            };
                                        console.log('[SESSION] Built session from ft_session_players roster:', storedSession.players.map(p => p.username));
                        }
                    } catch (e) {
                        console.warn('[SESSION] Could not read ft_session_players:', e);
                    }
                }

                isMultiplayer = true;

                if (storedSession) {
                    sessionData = storedSession;
                    myPlayerId = playerId || sessionData.playerId;

                    let attempts = 0;
                    const maxAttempts = 100;
                    const waitForBoard = setInterval(() => {
                        attempts++;
                        const hr = window.holeRegistry;
                        const isReady = window.boardReady || (hr && hr.size > 0);

                        if (isReady || attempts >= maxAttempts) {
                            clearInterval(waitForBoard);

                            if (sessionData && sessionData.players && sessionData.players.length > 0) {
                                initMultiplayerGame();
                            } else if (typeof window.initGame === 'function') {
                                window.initGame(3);
                            }
                        }
                    }, 100);
                } else {
                    // No session data at all — fall back to solo game with URL params
                    console.warn('[SESSION] No session data found, falling back to startGameSession()');
                    isMultiplayerGame = true; // Ensure startGameSession reads ft_session_players
                    let attempts = 0;
                    const waitForBoard = setInterval(() => {
                        attempts++;
                        const hr = window.holeRegistry;
                        const isReady = window.boardReady || (hr && hr.size > 0);
                        if (isReady || attempts >= 100) {
                            clearInterval(waitForBoard);
                            window.boardReady = true;
                            startGameSession();
                        }
                    }, 100);
                }
            },
            
            default: () => {
                console.log('[DEFAULT] Manifesting from observation...');
                const startScreen = document.getElementById('start-game-screen');
                if (startScreen) startScreen.style.display = 'none';
                
                let attempts = 0;
                const waitForBoard = setInterval(() => {
                    attempts++;
                    const hr = window.holeRegistry;
                    const isReady = window.boardReady || (hr && hr.size > 0);
                    
                    if (isReady) {
                        clearInterval(waitForBoard);
                        window.boardReady = true;
                        
                        if (typeof window.initGame === 'function') {
                            window.initGame(3);
                        } else if (window.GameInit) {
                            window.GameInit.waitAndStart(5000);
                        }
                    } else if (attempts >= 50) {
                        clearInterval(waitForBoard);
                        console.error('Default mode timeout waiting for board');
                    }
                }, 100);
            }
        };
        
        // The observed mode manifests — no branching, no conditions
        modeInvocations[observedMode]?.();
        
        function connectToSession(wsUrl, code) {
            console.log(`Connecting to session ${code} at ${wsUrl}...`);
            
            ws = new WebSocket(wsUrl);
            
            ws.onopen = () => {
                console.log('WebSocket connected for game session');
                
                // Request current session state
                ws.send(JSON.stringify({
                    type: 'getSession',
                    code: code
                }));
            };
            
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                handleGameMessage(data);
            };
            
            ws.onerror = (error) => {
                console.error('Game WebSocket error:', error);
            };
            
            ws.onclose = () => {
                console.log('Game WebSocket closed');
                // Try to reconnect
                setTimeout(() => {
                    if (isMultiplayer && sessionData) {
                        connectToSession(wsUrl, sessionData.code);
                    }
                }, 3000);
            };
        }
        
        function handleGameMessage(data) {
            console.log('Game message:', data);
            
            switch (data.type) {
                case 'sessionState':
                    sessionData = data.session;
                    if (sessionData.phase === 'playing') {
                        initMultiplayerGame();
                    }
                    break;
                    
                case 'gameStarted':
                    sessionData = data.session;
                    initMultiplayerGame();
                    break;
                    
                case 'playCard':
                    // Another player played a card
                    if (data.data.playerId !== myPlayerId) {
                        handleRemoteCardPlay(data.data);
                    }
                    break;
                    
                case 'movePeg':
                    // Another player moved a peg
                    if (data.data.playerId !== myPlayerId) {
                        handleRemotePegMove(data.data);
                    }
                    break;
                    
                case 'drawCard':
                    // Another player drew a card
                    if (data.data.playerId !== myPlayerId) {
                        handleRemoteCardDraw(data.data);
                    }
                    break;
                    
                case 'endTurn':
                    // Turn ended
                    handleTurnEnd(data.data);
                    break;
                    
                case 'chat':
                    showChatMessage(data.username, data.message, data.avatarId);
                    break;
                    
                case 'playerLeft':
                    showNotification(`Player left the game`);
                    break;
            }
        }
        
        // Guard against multiple initMultiplayerGame calls
        let multiplayerGameInitPending = false;
        let multiplayerGameInitComplete = false;
        
        function initMultiplayerGame() {
            // Prevent duplicate initialization
            if (multiplayerGameInitComplete) {
                console.log('[initMultiplayerGame] Already initialized, skipping');
                return;
            }
            if (multiplayerGameInitPending) {
                console.log('[initMultiplayerGame] Init already pending, skipping');
                return;
            }
            multiplayerGameInitPending = true;
            
            console.log('[initMultiplayerGame] Called with sessionData:', sessionData);
            
            // Hide start screen first
            const startScreen = document.getElementById('start-game-screen');
            if (startScreen) {
                startScreen.style.display = 'none';
                startScreen.remove();
            }
            
            // Hide auth/lobby containers
            const authContainer = document.getElementById('auth-container');
            const lobbyContainer = document.getElementById('lobby-container');
            if (authContainer) authContainer.style.display = 'none';
            if (lobbyContainer) lobbyContainer.style.display = 'none';
            
            // Determine player count from session
            const playerCount = sessionData && sessionData.players ? sessionData.players.length : 3;
            console.log('[initMultiplayerGame] Player count from session:', playerCount);
            
            // Wait for boardReady flag (set by the board init code)
            const waitForReady = setInterval(() => {
                const hr = window.holeRegistry;
                const isReady = window.boardReady || (hr && hr.size > 0);
                
                if (isReady) {
                    clearInterval(waitForReady);
                    window.boardReady = true;
                    
                    console.log('[initMultiplayerGame] Board ready, initializing game with', playerCount, 'players');

                    // Show leave game button
                    const leaveBtn = document.getElementById('leave-game-btn');
                    if (leaveBtn) leaveBtn.style.display = 'flex';


                    // Initialize game with correct player count from session
                    if (typeof window.initGame === 'function') {
                        window.initGame(playerCount);
                        multiplayerGameInitComplete = true;
                        console.log('[initMultiplayerGame] Game initialized with', playerCount, 'players - marking as complete');
                        
                        // After game starts, update player names and types from session data
                        setTimeout(() => {
                            if (sessionData && sessionData.players && window.gameState) {
                                console.log('[initMultiplayerGame] Session players:', sessionData.players);
                                console.log('[initMultiplayerGame] myPlayerId:', myPlayerId);
                                
                                sessionData.players.forEach((sessionPlayer, idx) => {
                                    if (window.gameState.players[idx]) {
                                        window.gameState.players[idx].name = sessionPlayer.username;
                                        window.gameState.players[idx].isHuman = sessionPlayer.playerType === 'human';
                                        window.gameState.players[idx].isAI = sessionPlayer.playerType === 'ai';
                                        window.gameState.players[idx].sessionId = sessionPlayer.id;
                                        
                                        // Mark the local player - MUST set isAI to false!
                                        if (sessionPlayer.id === myPlayerId) {
                                            window.gameState.players[idx].isLocal = true;
                                            window.gameState.players[idx].isHuman = true;
                                            window.gameState.players[idx].isAI = false;  // Explicitly NOT AI
                                            console.log('[initMultiplayerGame] LOCAL PLAYER found at index', idx, ':', sessionPlayer.username);
                                        }
                                    }
                                });
                                
                                // Update panels with correct names
                                updatePlayerPanelsFromSession();
                                
                                // Update card UI
                                if (window.cardUI) {
                                    window.cardUI.updateCurrentPlayer(window.gameState.currentPlayer);
                                }
                                
                                console.log('[initMultiplayerGame] Players configured:', 
                                    window.gameState.players.map(p => ({ name: p.name, isAI: p.isAI, isLocal: p.isLocal })));
                            }
                        }, 300);
                    } else {
                        console.error('[initMultiplayerGame] window.initGame not found!');
                    }
                }
            }, 100);
            
            // Timeout after 10 seconds
            setTimeout(() => clearInterval(waitForReady), 10000);
        }
        
        function updatePlayerPanelsFromSession() {
            if (!sessionData) return;
            
            setTimeout(() => {
                const panels = document.querySelectorAll('.player-panel');
                panels.forEach((panel, idx) => {
                    const player = sessionData.players[idx];
                    if (!player) return;
                    
                    const nameEl = panel.querySelector('.player-name');
                    if (nameEl) {
                        let nameText = player.username;
                        if (player.id === myPlayerId) {
                            nameText += ' (You)';
                        }
                        if (player.playerType === 'ai') {
                            nameText += ' 🤖';
                        }
                        nameEl.textContent = nameText;
                    }
                    
                    // Add avatar to panel if not already there
                    const existingAvatar = panel.querySelector('.session-avatar');
                    if (!existingAvatar) {
                        const avatarEl = document.createElement('div');
                        avatarEl.className = 'session-avatar';
                        avatarEl.style.cssText = 'font-size: 24px; text-align: center; margin-bottom: 5px;';
                        
                        if (player.avatarUrl) {
                            avatarEl.innerHTML = `<img src="${player.avatarUrl}" style="width:30px;height:30px;border-radius:50%;">`;
                        } else {
                            avatarEl.textContent = player.avatarId || '👤';
                        }
                        
                        panel.insertBefore(avatarEl, panel.firstChild);
                    }
                });
            }, 200);
        }
        
        // Send game actions to server
        window.sendGameAction = function(actionType, actionData) {
            if (!isMultiplayer || !ws || ws.readyState !== WebSocket.OPEN) {
                return false;
            }
            
            ws.send(JSON.stringify({
                type: actionType,
                code: sessionData.code,
                playerId: myPlayerId,
                ...actionData
            }));
            
            return true;
        };
        
        // Check if it's local player's turn
        window.isMyTurn = function() {
            if (!isMultiplayer) return true; // Solo mode
            if (!gameState || !sessionData) return false;
            
            const currentPlayer = gameState.players[gameState.currentPlayer];
            return currentPlayer && currentPlayer.sessionId === myPlayerId;
        };
        
        // Handle remote card play
        function handleRemoteCardPlay(data) {
            console.log('Remote player played card:', data);
            // TODO: Animate the card play
            if (typeof updateGameState === 'function') {
                // Update will come from server
            }
        }
        
        // Handle remote peg move
        function handleRemotePegMove(data) {
            console.log('Remote player moved peg:', data);
            // TODO: Animate the peg movement
            if (typeof animatePegMove === 'function') {
                // animatePegMove(data.pegId, data.fromHole, data.toHole);
            }
        }
        
        // Handle remote card draw
        function handleRemoteCardDraw(data) {
            console.log('Remote player drew card:', data);
            // Visual feedback that another player drew
        }
        
        // Handle turn end
        function handleTurnEnd(data) {
            console.log('Turn ended:', data);
            if (typeof gameState !== 'undefined') {
                const nextIdx = data.nextPlayerIndex ?? data.next_player ?? 0;
                gameState.currentPlayerIndex = nextIdx;
                const nextPlayer = gameState.players?.[nextIdx];

                // Update card UI
                if (typeof cardUI !== 'undefined' && cardUI) {
                    cardUI.updateCurrentPlayer(nextPlayer);
                    cardUI.setActivePlayer(nextIdx);
                    cardUI.updateAllDeckCounts(gameState.players);
                }

                // Update player panels
                if (window.playerPanelUI) {
                    window.playerPanelUI.setActivePlayer(`player_${nextIdx}`);
                    if (typeof updatePlayerPanelStats === 'function') updatePlayerPanelStats();
                }

                // Update GameUIMinimal
                if (window.GameUIMinimal) {
                    window.GameUIMinimal.setCurrentPlayer(nextPlayer, nextIdx);
                    window.GameUIMinimal.setDrawnCard(null);
                    window.GameUIMinimal.setDeckCount(nextPlayer?.deck?.remaining || 54);
                    window.GameUIMinimal.setPlayers(gameState.players, nextIdx);
                }

                // Check if it's now my turn
                if (typeof window.isMyTurn === 'function' && window.isMyTurn()) {
                    showNotification("Your turn!");
                }
            }
        }
        
        // Show notification
        function showNotification(message) {
            // Use existing notification system or create simple one
            console.log('NOTIFICATION:', message);
            
            const notif = document.createElement('div');
            notif.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(74, 222, 128, 0.9);
                color: #000;
                padding: 15px 30px;
                border-radius: 10px;
                font-weight: bold;
                z-index: 30020;
                animation: slideDown 0.3s ease;
            `;
            notif.textContent = message;
            document.body.appendChild(notif);
            
            setTimeout(() => notif.remove(), 3000);
        }
        
        // Show chat message
        function showChatMessage(username, message, avatarId) {
            console.log(`[CHAT] ${avatarId} ${username}: ${message}`);
            // TODO: Add chat UI to game board
        }
        
        // Expose for debugging
        window.betaSession = {
            get data() { return sessionData; },
            get playerId() { return myPlayerId; },
            get isMultiplayer() { return isMultiplayer; },
            get ws() { return ws; }
        };
        
        console.log('Beta session integration loaded');
    })();