/**
 * FastTrack — Electron desktop wrapper
 * ButterflyFx / KensGames · Kenneth Bingham · kenetics.art@gmail.com
 *
 * HR-42: Distribution shell only. Game logic lives in ../index.html, ../fasttrack-game.js, etc.
 * Platform targets: Windows, macOS, Linux (Steam), packaged via electron-builder.
 */

'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Steam integration (optional) ─────────────────────────────────────────────
let greenworks = null;
try {
  greenworks = require('greenworks');
  if (greenworks.initAPI()) {
    console.log('[Steam] Initialized. FastTrack AppId:', greenworks.getSteamId().getRawSteamID());
  } else {
    greenworks = null;
  }
} catch (_) {
  console.log('[Steam] Greenworks not loaded (non-Steam launch or dev mode)');
}

// ── Window ───────────────────────────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'FastTrack — ButterflyFx',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#000812',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // needed for local GLB/asset loading
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  Menu.setApplicationMenu(null);

  const gameRoot = path.join(__dirname, '..', 'index.html');
  mainWindow.loadFile(gameRoot);

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      window.__KENSGAMES_PLATFORM__ = 'desktop';
      window.__KENSGAMES_WRAPPER__ = 'electron';
      window.__KENSGAMES_GAME__ = 'fasttrack';
      window.__KENSGAMES_VERSION__ = ${JSON.stringify(getAppVersion())};
      ${greenworks ? `window.__STEAM_AVAILABLE__ = true;` : ''}
    `);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── App events ───────────────────────────────────────────────────────────────
app.whenReady().then(() => {
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
ipcMain.handle('steam-unlock-achievement', (_event, achievementId) => {
  if (!greenworks) return false;
  try { greenworks.activateAchievement(achievementId, () => { }); return true; }
  catch (e) { console.warn('[Steam] activateAchievement failed:', e.message); return false; }
});

ipcMain.handle('steam-get-persona-name', () => {
  if (!greenworks) return null;
  try { return greenworks.getPersonaName(); } catch (_) { return null; }
});

ipcMain.on('toggle-fullscreen', () => {
  if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
});

function getAppVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    return pkg.version || '1.0.0';
  } catch (_) { return '1.0.0'; }
}
