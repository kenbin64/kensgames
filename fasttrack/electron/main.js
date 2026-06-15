/**
 * FastTrack — Electron desktop wrapper
 * ButterflyFx / KensGames · Kenneth Bingham · kenetics.art@gmail.com
 *
 * HR-42: Distribution shell only. Game logic lives in ../index.html, ../fasttrack-game.js, etc.
 * Platform targets: Windows, macOS, Linux, packaged via electron-builder (itch.io / Steam).
 *
 * Networking: the game pages use absolute web paths and a location-derived
 * WebSocket URL, so we serve the repo root over a 127.0.0.1 HTTP server (see
 * loopback-server.js) and inject a fixed relay URL into every page. That single
 * injected URL (__KG_WS_URL__) is also the seam where a future P2P/LAN-direct
 * transport will substitute its own endpoint.
 */

'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { startStaticServer } = require('./loopback-server');

// ── Configuration ─────────────────────────────────────────────────────────────
// The multiplayer relay the desktop build talks to. Overridable via env for
// local relay testing (e.g. KG_WS_URL=ws://127.0.0.1:8765/ws npm start).
const WS_URL = process.env.KG_WS_URL || 'wss://www.kensgames.com/ws';

// Docroot = the kensgames repo root (the live web docroot). In a packaged build
// it is copied to resources/app-root via electron-builder extraResources; in dev
// it is two levels up from this file (fasttrack/electron → repo root).
function getAppRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'app-root');
  return path.join(__dirname, '..', '..');
}

function getAppVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    return pkg.version || '1.0.0';
  } catch (_) { return '1.0.0'; }
}

// ── Steam integration (optional, dormant until a Steam build) ──────────────────
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

// ── State ──────────────────────────────────────────────────────────────────────
let mainWindow = null;
let staticServer = null;

/** HTML injected into every page so desktop globals exist before page scripts run. */
function buildInjectSnippet() {
  const cfg = {
    __KG_WS_URL__: WS_URL,
    __KENSGAMES_PLATFORM__: 'desktop',
    __KENSGAMES_WRAPPER__: 'electron',
    __KENSGAMES_GAME__: 'fasttrack',
    __KENSGAMES_VERSION__: getAppVersion(),
    __STEAM_AVAILABLE__: !!greenworks,
  };
  const assigns = Object.entries(cfg)
    .map(([k, v]) => `window.${k}=${JSON.stringify(v)};`)
    .join('');
  return `<script>${assigns}</script>`;
}

async function createWindow() {
  const root = getAppRoot();
  staticServer = await startStaticServer({ root, injectHtml: buildInjectSnippet() });
  console.log('[loopback] serving', root, 'at', staticServer.url, '| relay:', WS_URL);

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
      webSecurity: false, // local GLB/asset loading + the loopback origin
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  Menu.setApplicationMenu(null);

  mainWindow.loadURL(`${staticServer.url}/fasttrack/index.html`);

  // External links open in the user's browser, never in-app.
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
  if (staticServer) { staticServer.close(); staticServer = null; }
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
