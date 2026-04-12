/**
 * Fast Track - Electron Main Process
 * Native desktop application with Steam integration
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 *                        BUTTERFLYFX SUBSTRATE MODEL
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This application demonstrates dimensional computing in a native context:
 * 
 * Level 0 (VOID):     App not yet launched — pure potential
 * Level 1 (POINT):    App identity established (appId, window handle)
 * Level 2 (LINE):     IPC connections between main and renderer
 * Level 3 (WIDTH):    Menu structure, window geometry
 * Level 4 (PLANE):    Window manifests — user sees the game (INVOKE LEVEL)
 * Level 5 (VOLUME):   Multiple windows, Steam overlay, background processes
 * Level 6 (WHOLE):    App meaning — user engagement, session completion
 * 
 * The hexagonal game board IS the manifold. Camera angle (15°) views the
 * saddle surface z = xy from optimal perspective for gameplay.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const steam = require('./steam-manager');

// Initialize persistent storage (player profiles, settings)
const store = new Store({
    name: 'fasttrack-data',
    defaults: {
        profile: null,
        settings: {
            fullscreen: false,
            musicVolume: 0.7,
            sfxVolume: 0.8,
            cameraAngle: 15  // Default 15-degree viewing angle
        },
        friends: [],
        guild: null,
        stats: {
            gamesPlayed: 0,
            gamesWon: 0,
            pegsHome: 0,
            pegsCaptured: 0,
            perfectGames: 0,
            currentStreak: 0,
            bestStreak: 0
        }
    }
});

// Initialize Steam (using steam-manager module)
const steamInitialized = steam.initSteam();

// Main window reference
let mainWindow = null;

// Create the main game window
function createWindow() {
    const settings = store.get('settings');
    
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 1024,
        minHeight: 600,
        fullscreen: settings.fullscreen,
        title: 'Fast Track',
        icon: path.join(__dirname, 'build', 'icon.png'),
        backgroundColor: '#1a1a2e',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Load the game
    const isDev = process.argv.includes('--dev');
    if (isDev) {
        // Development: load from local server or file
        mainWindow.loadFile(path.join(__dirname, '..', 'fasttrack_final.html'));
        mainWindow.webContents.openDevTools();
    } else {
        // Production: load bundled game
        mainWindow.loadFile(path.join(__dirname, 'game', 'index.html'));
    }

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Window events
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.on('enter-full-screen', () => {
        store.set('settings.fullscreen', true);
    });

    mainWindow.on('leave-full-screen', () => {
        store.set('settings.fullscreen', false);
    });

    // Create application menu
    createMenu();
}

// Create application menu
function createMenu() {
    const template = [
        {
            label: 'Game',
            submenu: [
                {
                    label: 'New Game',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => mainWindow.webContents.send('menu:new-game')
                },
                {
                    label: 'Join Game',
                    accelerator: 'CmdOrCtrl+J',
                    click: () => mainWindow.webContents.send('menu:join-game')
                },
                { type: 'separator' },
                {
                    label: 'Profile',
                    accelerator: 'CmdOrCtrl+P',
                    click: () => mainWindow.webContents.send('menu:profile')
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    accelerator: 'Alt+F4',
                    click: () => app.quit()
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Toggle Fullscreen',
                    accelerator: 'F11',
                    click: () => {
                        mainWindow.setFullScreen(!mainWindow.isFullScreen());
                    }
                },
                { type: 'separator' },
                {
                    label: 'Reset Camera',
                    accelerator: 'Home',
                    click: () => mainWindow.webContents.send('camera:reset')
                },
                {
                    label: 'Zoom In',
                    accelerator: 'Plus',
                    click: () => mainWindow.webContents.send('camera:zoom-in')
                },
                {
                    label: 'Zoom Out',
                    accelerator: '-',
                    click: () => mainWindow.webContents.send('camera:zoom-out')
                }
            ]
        },
        {
            label: 'Social',
            submenu: [
                {
                    label: 'Friends',
                    click: () => mainWindow.webContents.send('menu:friends')
                },
                {
                    label: 'Guild',
                    click: () => mainWindow.webContents.send('menu:guild')
                },
                { type: 'separator' },
                {
                    label: 'Invite Friend',
                    click: () => {
                        if (steamInitialized) {
                            greenworks.activateGameOverlayInviteDialog(greenworks.getSteamId().steamId);
                        } else {
                            mainWindow.webContents.send('menu:invite');
                        }
                    }
                }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'How to Play',
                    click: () => mainWindow.webContents.send('menu:rules')
                },
                {
                    label: 'About Fast Track',
                    click: () => mainWindow.webContents.send('menu:about')
                },
                { type: 'separator' },
                {
                    label: 'ButterflyFX Website',
                    click: () => shell.openExternal('https://butterflyfx.us')
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// IPC Handlers for renderer communication

// Store/retrieve player profile
ipcMain.handle('store:get', (event, key) => {
    return store.get(key);
});

ipcMain.handle('store:set', (event, key, value) => {
    store.set(key, value);
    return true;
});

// Steam-specific handlers (using steam-manager module)
ipcMain.handle('steam:available', () => steam.isInitialized);
ipcMain.handle('steam:getUserInfo', () => steam.getSteamUser());
ipcMain.handle('steam:unlockAchievement', (_, key) => steam.unlockAchievement(key));
ipcMain.handle('steam:getAchievements', () => steam.getAchievements());
ipcMain.handle('steam:setRichPresence', (_, key, value) => steam.setRichPresence(key, value));
ipcMain.handle('steam:updateStatus', (_, status) => steam.updateGameStatus(status));
ipcMain.handle('steam:submitScore', (_, board, score) => steam.submitScore(board, score));
ipcMain.handle('steam:getLeaderboard', (_, board, start, count) => steam.getLeaderboard(board, start, count));
ipcMain.handle('steam:createLobby', (_, maxPlayers) => steam.createLobby(maxPlayers));
ipcMain.handle('steam:joinLobby', (_, lobbyId) => steam.joinLobby(lobbyId));
ipcMain.handle('steam:getLobbies', () => steam.getLobbies());
ipcMain.handle('steam:activateOverlay', (_, dialog) => steam.activateOverlay(dialog));

// Game statistics handlers
ipcMain.handle('stats:get', () => store.get('stats'));

ipcMain.handle('stats:recordGame', (_, won, pegsHome, pegsCaptured, perfect) => {
    const stats = store.get('stats');
    stats.gamesPlayed++;
    if (won) {
        stats.gamesWon++;
        stats.currentStreak++;
        stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
    } else {
        stats.currentStreak = 0;
    }
    stats.pegsHome += pegsHome;
    stats.pegsCaptured += pegsCaptured;
    if (perfect) stats.perfectGames++;
    store.set('stats', stats);
    
    // Submit to Steam leaderboards
    if (steamInitialized) {
        steam.submitScore(steam.LEADERBOARDS.WINS_TOTAL, stats.gamesWon);
        steam.submitScore(steam.LEADERBOARDS.WIN_STREAK, stats.bestStreak);
        steam.submitScore(steam.LEADERBOARDS.GAMES_PLAYED, stats.gamesPlayed);
        steam.submitScore(steam.LEADERBOARDS.PEGS_CAPTURED, stats.pegsCaptured);
        steam.submitScore(steam.LEADERBOARDS.PERFECT_GAMES, stats.perfectGames);
        
        // Check achievements
        if (stats.gamesPlayed === 1) steam.unlockAchievement('FIRST_GAME');
        if (stats.gamesWon >= 10) steam.unlockAchievement('WIN_10_GAMES');
        if (perfect) steam.unlockAchievement('PERFECT_GAME');
    }
    
    return stats;
});

// App lifecycle
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle second instance (prevent multiple windows)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

// Steam overlay handling is managed by steam-manager module
// Callbacks are pumped automatically every 100ms
