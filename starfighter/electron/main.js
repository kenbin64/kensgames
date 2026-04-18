'use strict';

const { app, BrowserWindow, Menu, shell, globalShortcut, ipcMain } = require('electron');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const GAME_URL = 'https://kensgames.com/starfighter/lobby.html';
const LOCAL_GAME = path.join(__dirname, 'game', 'lobby.html');
const APP_NAME = 'Starfighter';
const MIN_WIDTH = 1280;
const MIN_HEIGHT = 720;

// ── Mode detection ───────────────────────────────────────────────────────────
// --dev  : force remote URL (live server)
// --steam: launched via Steam (fullscreen, no dev tools)
// default: local bundle if present, else remote fallback
const args = process.argv.slice(2);
const IS_DEV = args.includes('--dev') || process.env.NODE_ENV === 'development';
const IS_STEAM = args.includes('--steam') || !!process.env.SteamAppId;
const HAS_LOCAL = require('fs').existsSync(LOCAL_GAME);

// The single load target for this session — derived once, used everywhere
const LOAD_LOCAL = !IS_DEV && HAS_LOCAL;

let mainWindow = null;

// ── Window creation ──────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: APP_NAME,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#000000',
    show: false, // wait for ready-to-show
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  // Remove default menu bar (game has its own UI)
  Menu.setApplicationMenu(IS_STEAM ? null : buildMenu());

  // ── Load game: local bundle (offline/Steam) or remote URL (dev) ───────────
  if (LOAD_LOCAL) {
    mainWindow.loadFile(LOCAL_GAME);
  } else {
    mainWindow.loadURL(GAME_URL);
  }

  // Show window once loaded to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (IS_STEAM) {
      mainWindow.setFullScreen(true);   // Steam expects immediate fullscreen
    } else {
      mainWindow.maximize();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in the default browser, not a new Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── Native menu ──────────────────────────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'Game',
      submenu: [
        {
          label: 'Return to Lobby',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => {
            if (LOAD_LOCAL) mainWindow?.loadFile(LOCAL_GAME);
            else mainWindow?.loadURL(GAME_URL);
          },
        },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.reload(),
        },
        { type: 'separator' },
        {
          label: 'Toggle Fullscreen',
          accelerator: isMac ? 'Ctrl+Command+F' : 'F11',
          click: () => {
            const win = mainWindow;
            if (win) win.setFullScreen(!win.isFullScreen());
          },
        },
        { type: 'separator' },
        { role: isMac ? 'close' : 'quit', label: 'Quit Starfighter' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle DevTools',
          accelerator: isMac ? 'Alt+Command+I' : 'F12',
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

// ── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('toggle-fullscreen', () => {
  if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
});

ipcMain.handle('is-fullscreen', () => {
  return mainWindow?.isFullScreen() ?? false;
});

// ── Steam IPC shim ────────────────────────────────────────────────────────────
// All handlers are stubs returning safe defaults until Steamworks SDK is linked.
// When you have an App ID, replace stubs with real greenworks/steamworks.js calls.
ipcMain.handle('steam-available', () => IS_STEAM);
ipcMain.handle('steam-achievement-set', (_e, apiName) => {
  if (!IS_STEAM) return false;
  // TODO: greenworks.activateAchievement(apiName, cb)
  console.log('[Steam] achievement unlocked (stub):', apiName);
  return true;
});
ipcMain.handle('steam-achievement-get', (_e, apiName) => {
  if (!IS_STEAM) return false;
  // TODO: greenworks.getAchievement(apiName, cb)
  return false;
});
ipcMain.handle('steam-leaderboard-upload', (_e, name, score) => {
  if (!IS_STEAM) return null;
  // TODO: greenworks.uploadLeaderboardScore(...)
  console.log('[Steam] leaderboard upload (stub):', name, score);
  return { name, score };
});
ipcMain.handle('steam-leaderboard-fetch', (_e, name, count) => {
  if (!IS_STEAM) return [];
  // TODO: greenworks.downloadLeaderboardEntries(...)
  return [];
});
ipcMain.handle('steam-cloud-write', (_e, key, value) => {
  if (!IS_STEAM) return false;
  // TODO: greenworks.saveTextToFile(key, value, cb)
  return true;
});
ipcMain.handle('steam-cloud-read', (_e, key) => {
  if (!IS_STEAM) return null;
  // TODO: greenworks.readTextFromFile(key, cb)
  return null;
});
ipcMain.handle('steam-overlay', (_e, dialog) => {
  if (!IS_STEAM) return;
  // TODO: greenworks.activateGameOverlay(dialog)
  console.log('[Steam] overlay (stub):', dialog);
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();

  // F11 fullscreen toggle when app is focused (works even without menu focus)
  globalShortcut.register('F11', () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });

  app.on('activate', () => {
    // macOS: re-create window if dock icon is clicked and no windows are open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
