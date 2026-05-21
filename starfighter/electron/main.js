/**
 * Starfighter — Electron desktop wrapper
 * ButterflyFx / KensGames · Kenneth Bingham · kenetics.art@gmail.com
 *
 * HR-42: This file is a distribution shell only. All game logic lives in the
 * shared web source (../index.html, ../bundle.js, etc.). No game logic here.
 *
 * Platform targets: Windows, macOS, Linux (Steam), packaged via electron-builder.
 */

'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Steam integration (optional — Greenworks) ────────────────────────────────
let greenworks = null;
try {
  greenworks = require('greenworks');
  if (greenworks.initAPI()) {
    console.log('[Steam] Initialized. AppId:', greenworks.getSteamId().getRawSteamID());
  } else {
    console.warn('[Steam] initAPI() returned false — not running via Steam client');
    greenworks = null;
  }
} catch (_) {
  console.log('[Steam] Greenworks not loaded (non-Steam launch or dev mode)');
}

// ── Window ───────────────────────────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Starfighter — ButterflyFx',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#000812',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Allow local file access so bundle.js can load GLBs from disk
      webSecurity: false,
    },
    // No title bar chrome — the game's own fixed rail is the chrome (HR-6.2)
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  // Remove default menu on all platforms (game provides its own controls)
  Menu.setApplicationMenu(null);

  // Load the game — same source as the web version (HR-42)
  const gameRoot = path.join(__dirname, '..', 'index.html');
  mainWindow.loadFile(gameRoot);

  // Inject desktop context so game scripts can detect desktop wrapper
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      window.__KENSGAMES_PLATFORM__ = 'desktop';
      window.__KENSGAMES_WRAPPER__ = 'electron';
      window.__KENSGAMES_VERSION__ = ${JSON.stringify(getAppVersion())};
      ${greenworks ? `window.__STEAM_AVAILABLE__ = true;` : ''}
    `);
  });

  // External links open in system browser, not in the game window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── App events ───────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Suppress hardware acceleration warnings on older GPUs
  app.commandLine.appendSwitch('ignore-gpu-blacklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: Steam achievements bridge ───────────────────────────────────────────
// Game scripts call window.electronAPI.unlockAchievement(id) via preload
ipcMain.handle('steam-unlock-achievement', (_event, achievementId) => {
  if (!greenworks) return false;
  try {
    greenworks.activateAchievement(achievementId, () => { });
    return true;
  } catch (e) {
    console.warn('[Steam] activateAchievement failed:', e.message);
    return false;
  }
});

ipcMain.handle('steam-get-persona-name', () => {
  if (!greenworks) return null;
  try { return greenworks.getPersonaName(); } catch (_) { return null; }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function getAppVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    return pkg.version || '1.0.0';
  } catch (_) { return '1.0.0'; }
}
