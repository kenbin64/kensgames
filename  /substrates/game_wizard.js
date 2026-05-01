/**
 * =========================================
 * 🧙 GAME WIZARD SUBSTRATE
 * Single-Player Game Configuration
 * =========================================
 *
 * Provides a generic wizard for configuring single-player games:
 * - Player name selection (with generic fallback)
 * - Avatar selection from preset pool
 * - AI opponent configuration (1-3 bots)
 * - Game difficulty selection
 */

const GameWizardSubstrate = (() => {
    // Avatar pool - generic emojis
    const AVATAR_POOL = ['🎮', '🏆', '⚡', '🔮', '🎯', '🌟', '💎', '🚀', '🎲', '👾'];

    // AI difficulty levels
    const AI_LEVELS = {
        easy: { label: 'Easy', botCount: 1, skillMult: 0.6 },
        medium: { label: 'Medium', botCount: 2, skillMult: 1.0 },
        hard: { label: 'Hard', botCount: 3, skillMult: 1.4 }
    };

    // =========================================
    // WIZARD STATE
    // =========================================
    let wizardState = {
        playerName: null,
        playerAvatar: null,
        difficulty: 'medium',
        aiOpponents: []
    };

    // =========================================
    // CREATE WIZARD UI
    // =========================================
    const createWizardUI = () => {
        const modal = document.createElement('div');
        modal.id = 'game-wizard-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            z-index: 3000;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            font-family: 'Rajdhani', sans-serif;
            color: #e2e8f0;
        `;

        modal.innerHTML = `
            <div style="
                background: rgba(20, 20, 40, 0.9);
                border: 2px solid #00b4ff;
                border-radius: 24px;
                padding: 50px;
                max-width: 600px;
                width: 90%;
                box-shadow: 0 0 60px rgba(0, 180, 255, 0.3);
            ">
                <h1 style="
                    font-family: 'Orbitron', sans-serif;
                    font-size: 36px;
                    margin-bottom: 10px;
                    background: linear-gradient(135deg, #00b4ff, #ffd700);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                ">🧙 Game Wizard</h1>
                <p style="color: #94a3b8; margin-bottom: 40px;">Set up your single-player adventure</p>

                <!-- Step 1: Player Name -->
                <div style="margin-bottom: 40px;">
                    <label style="
                        display: block;
                        margin-bottom: 12px;
                        font-weight: 700;
                        font-size: 16px;
                        color: #00b4ff;
                    ">Your Player Name</label>
                    <input type="text" id="wizard-player-name" placeholder="Enter your name..." style="
                        width: 100%;
                        padding: 12px 16px;
                        border: 2px solid rgba(0, 180, 255, 0.3);
                        border-radius: 12px;
                        background: rgba(255, 255, 255, 0.05);
                        color: #e2e8f0;
                        font-family: 'Rajdhani', sans-serif;
                        font-size: 16px;
                        transition: border-color 0.3s;
                    " onfocus="this.style.borderColor='#00b4ff'" onblur="this.style.borderColor='rgba(0, 180, 255, 0.3)'" />
                    <p style="font-size: 13px; color: #94a3b8; margin-top: 8px;">If left blank, you'll be assigned a random name</p>
                </div>

                <!-- Step 2: Avatar Selection -->
                <div style="margin-bottom: 40px;">
                    <label style="
                        display: block;
                        margin-bottom: 12px;
                        font-weight: 700;
                        font-size: 16px;
                        color: #00b4ff;
                    ">Choose Your Avatar</label>
                    <div id="wizard-avatar-pool" style="
                        display: grid;
                        grid-template-columns: repeat(5, 1fr);
                        gap: 12px;
                    ">
                    </div>
                </div>

                <!-- Step 3: Difficulty & AI -->
                <div style="margin-bottom: 40px;">
                    <label style="
                        display: block;
                        margin-bottom: 12px;
                        font-weight: 700;
                        font-size: 16px;
                        color: #00b4ff;
                    ">Difficulty Level</label>
                    <div id="wizard-difficulty" style="display: flex; gap: 12px;">
                    </div>
                </div>

                <!-- Start Game Button -->
                <button onclick="GameWizardSubstrate.startGame()" style="
                    width: 100%;
                    padding: 16px;
                    background: linear-gradient(135deg, #00b4ff, #ffd700);
                    color: #000;
                    border: none;
                    border-radius: 12px;
                    font-family: 'Rajdhani', sans-serif;
                    font-size: 18px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.3s;
                " onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 10px 40px rgba(0, 180, 255, 0.4)';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none';">
                    ▶️ Start Game
                </button>
            </div>
        `;

        document.body.appendChild(modal);
        renderAvatarPool();
        renderDifficultyButtons();
        setDefaultValues();
    };

    // =========================================
    // RENDER AVATAR POOL
    // =========================================
    const renderAvatarPool = () => {
        const pool = document.getElementById('wizard-avatar-pool');
        if (!pool) return;

        AVATAR_POOL.forEach(avatar => {
            const btn = document.createElement('button');
            btn.textContent = avatar;
            btn.style.cssText = `
                padding: 16px;
                background: rgba(0, 180, 255, 0.1);
                border: 2px solid rgba(0, 180, 255, 0.3);
                border-radius: 12px;
                cursor: pointer;
                font-size: 28px;
                transition: all 0.3s;
            `;

            btn.addEventListener('click', () => selectAvatar(avatar, btn));
            btn.addEventListener('mouseover', () => {
                btn.style.background = 'rgba(0, 180, 255, 0.2)';
                btn.style.transform = 'scale(1.1)';
            });
            btn.addEventListener('mouseout', () => {
                btn.style.background = wizardState.playerAvatar === avatar ? 'rgba(0, 180, 255, 0.4)' : 'rgba(0, 180, 255, 0.1)';
                btn.style.transform = 'scale(1)';
            });

            pool.appendChild(btn);
        });

        // Set first avatar as default
        wizardState.playerAvatar = AVATAR_POOL[0];
        const firstBtn = pool.querySelector('button');
        if (firstBtn) {
            firstBtn.style.background = 'rgba(0, 180, 255, 0.4)';
            firstBtn.style.borderColor = '#00b4ff';
        }
    };

    // =========================================
    // RENDER DIFFICULTY BUTTONS
    // =========================================
    const renderDifficultyButtons = () => {
        const container = document.getElementById('wizard-difficulty');
        if (!container) return;

        Object.entries(AI_LEVELS).forEach(([key, level]) => {
            const btn = document.createElement('button');
            btn.textContent = level.label;
            btn.style.cssText = `
                flex: 1;
                padding: 12px;
                background: ${key === 'medium' ? 'rgba(0, 180, 255, 0.4)' : 'rgba(0, 180, 255, 0.1)'};
                border: 2px solid ${key === 'medium' ? '#00b4ff' : 'rgba(0, 180, 255, 0.3)'};
                border-radius: 12px;
                cursor: pointer;
                font-family: 'Rajdhani', sans-serif;
                font-size: 14px;
                font-weight: 700;
                color: #e2e8f0;
                transition: all 0.3s;
            `;

            btn.addEventListener('click', () => selectDifficulty(key, btn));
            btn.addEventListener('mouseover', () => {
                if (wizardState.difficulty !== key) {
                    btn.style.background = 'rgba(0, 180, 255, 0.2)';
                }
            });
            btn.addEventListener('mouseout', () => {
                btn.style.background = wizardState.difficulty === key ? 'rgba(0, 180, 255, 0.4)' : 'rgba(0, 180, 255, 0.1)';
            });

            container.appendChild(btn);
        });
    };

    // =========================================
    // EVENT HANDLERS
    // =========================================
    const selectAvatar = (avatar, buttonElement) => {
        // Deselect all
        document.querySelectorAll('#wizard-avatar-pool button').forEach(btn => {
            btn.style.background = 'rgba(0, 180, 255, 0.1)';
            btn.style.borderColor = 'rgba(0, 180, 255, 0.3)';
        });

        // Select this one
        wizardState.playerAvatar = avatar;
        buttonElement.style.background = 'rgba(0, 180, 255, 0.4)';
        buttonElement.style.borderColor = '#00b4ff';
    };

    const selectDifficulty = (difficulty, buttonElement) => {
        // Deselect all
        document.querySelectorAll('#wizard-difficulty button').forEach(btn => {
            btn.style.background = 'rgba(0, 180, 255, 0.1)';
            btn.style.borderColor = 'rgba(0, 180, 255, 0.3)';
        });

        // Select this one
        wizardState.difficulty = difficulty;
        buttonElement.style.background = 'rgba(0, 180, 255, 0.4)';
        buttonElement.style.borderColor = '#00b4ff';
    };

    const setDefaultValues = () => {
        // Set random default name if blank
        const nameInput = document.getElementById('wizard-player-name');
        if (nameInput) {
            nameInput.addEventListener('blur', () => {
                const input = document.getElementById('wizard-player-name');
                if (input && !input.value.trim()) {
                    wizardState.playerName = null;
                } else if (input) {
                    wizardState.playerName = input.value.trim();
                }
            });
        }
    };

    // =========================================
    // GENERATE AI OPPONENTS
    // =========================================
    const generateAIOpponents = (difficulty) => {
        const level = AI_LEVELS[difficulty];
        const bots = [];

        for (let i = 0; i < level.botCount; i++) {
            bots.push({
                id: `ai_${i}`,
                name: `Bot_${Math.floor(Math.random() * 1000)}`,
                avatar: AVATAR_POOL[Math.floor(Math.random() * AVATAR_POOL.length)],
                difficulty: difficulty,
                skillMultiplier: level.skillMult
            });
        }

        return bots;
    };

    // =========================================
    // PUBLIC API
    // =========================================
    return {
        initialize: () => {
            createWizardUI();
        },

        startGame: () => {
            const nameInput = document.getElementById('wizard-player-name');
            if (nameInput) {
                wizardState.playerName = nameInput.value.trim();
            }

            // Generate random name if blank
            if (!wizardState.playerName) {
                const randomId = Math.floor(Math.random() * 10000);
                wizardState.playerName = `Player_${randomId}`;
            }

            // Generate AI opponents
            wizardState.aiOpponents = generateAIOpponents(wizardState.difficulty);

            // Dispatch game config event
            window.dispatchEvent(new CustomEvent('game-wizard-complete', {
                detail: {
                    playerConfig: {
                        name: wizardState.playerName,
                        avatar: wizardState.playerAvatar,
                        isHuman: true
                    },
                    aiOpponents: wizardState.aiOpponents,
                    difficulty: wizardState.difficulty
                }
            }));

            // Close wizard
            const modal = document.getElementById('game-wizard-modal');
            if (modal) modal.remove();
        },

        getConfig: () => wizardState,

        close: () => {
            const modal = document.getElementById('game-wizard-modal');
            if (modal) modal.remove();
        }
    };
})();

// Export to global scope
window.GameWizardSubstrate = GameWizardSubstrate;
