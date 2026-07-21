/**
 * FastTrack, Electron desktop wrapper
 * ButterflyFx / KensGames · Kenneth Bingham · kenetics.art@gmail.com
 *
 * Distribution shell. Game logic lives in the served repo pages. The wrapper:
 *   - serves the repo root over a 127.0.0.1 loopback HTTP server (absolute web
 *     paths + a location-derived WS URL need a real http origin, not file://),
 *   - injects desktop globals (relay URL, API base) + the current login token
 *     into every page, so the relay runs the connection as the real account,
 *   - persists the login token encrypted at the Electron layer (safeStorage),
 *   - gates launch: a valid login opens the game, otherwise the login page.
 *
 * The injected __KG_WS_URL__ is also the seam where a future P2P/LAN transport
 * substitutes its own endpoint.
 */
'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { startStaticServer } = require('./loopback-server');
const { createSessionStore } = require('./session-store');
const { buildInjectSnippet } = require('./inject');

// ── Configuration ─────────────────────────────────────────────────────────────
// The multiplayer relay the desktop build talks to. Overridable via env for
// local relay testing (e.g. KG_WS_URL=ws://127.0.0.1:8765/ws npm start).
const WS_URL = process.env.KG_WS_URL || 'wss://www.kensgames.com/ws';
// The REST auth origin the login page signs in against. Overridable for local
// testing (e.g. KG_API_BASE=http://127.0.0.1:3000 against a local auth server).
const API_BASE = process.env.KG_API_BASE || 'https://www.kensgames.com';

// Docroot = the kensgames repo root (the live web docroot). In a packaged build
// it is copied to resources/app-root via electron-builder extraResources; in dev
// it is two levels up from this file (fasttrack/electron -> repo root).
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
let sessionStore = null;
let authToken = null;
let authUser = null;

/**
 * HTML injected into every page: desktop globals + the current login, seeded
 * before the page's own scripts run. Built per navigation (the loopback server
 * calls this as a function) so it reflects the latest auth state with no restart.
 */
function currentInject() {
  return buildInjectSnippet({
    config: {
      __KG_WS_URL__: WS_URL,
      __KG_API_BASE__: API_BASE,
      __KENSGAMES_PLATFORM__: 'desktop',
      __KENSGAMES_WRAPPER__: 'electron',
      __KENSGAMES_GAME__: 'fasttrack',
      __KENSGAMES_VERSION__: getAppVersion(),
      __STEAM_AVAILABLE__: !!greenworks,
    },
    token: authToken,
    user: authUser,
  });
}

function loadGame() {
  if (mainWindow && staticServer) mainWindow.loadURL(`${staticServer.url}/fasttrack/index.html`);
}
function loadLogin() {
  if (mainWindow && staticServer) mainWindow.loadURL(`${staticServer.url}/fasttrack/desktop-login.html`);
}

/**
 * Validate a persisted token against the REST auth service. A network error does
 * NOT lock the user out (returns true) so offline solo play still opens; only an
 * explicit 401/403 sends them back to login.
 */
async function tokenIsValid(token) {
  try {
    const opts = { headers: { Authorization: `Bearer ${token}` } };
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opts.signal = AbortSignal.timeout(4000);
    const res = await fetch(`${API_BASE}/api/auth/validate`, opts);
    return !(res.status === 401 || res.status === 403);
  } catch (_) { return true; }
}

async function createWindow() {
  const root = getAppRoot();
  staticServer = await startStaticServer({ root, injectHtml: () => currentInject() });
  console.log('[loopback] serving', root, 'at', staticServer.url, '| relay:', WS_URL, '| api:', API_BASE);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'FastTrack · ButterflyFx',
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

  // Diagnostic: mirror the game page's console into the desktop process output,
  // so turn traces, engine-version banners and invariant violations are visible
  // without opening DevTools. Electron changed this event's signature across
  // versions, so accept both shapes.
  mainWindow.webContents.on('console-message', (...args) => {
    const details = args[1];
    const msg = (details && typeof details === 'object' && details.message != null)
      ? details.message
      : args[2];
    if (msg != null) console.log('[renderer] ' + msg);
  });

  // Gate: with a valid login go straight to the game; otherwise the login page.
  const startValid = authToken ? await tokenIsValid(authToken) : false;
  if (authToken && !startValid) {
    try { if (sessionStore) sessionStore.clear(); } catch (_) { /* ignore */ }
    authToken = null;
    authUser = null;
  }
  mainWindow.loadURL(startValid
    ? `${staticServer.url}/fasttrack/index.html`
    : `${staticServer.url}/fasttrack/desktop-login.html`);

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

  // Load any persisted login before the first window decides game-vs-login.
  sessionStore = createSessionStore({
    safeStorage,
    filePath: path.join(app.getPath('userData'), 'session.json'),
  });
  const saved = sessionStore.load();
  if (saved) { authToken = saved.token; authUser = saved.user; }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (staticServer) { staticServer.close(); staticServer = null; }
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: desktop auth ──────────────────────────────────────────────────────────
ipcMain.handle('auth:get', () => ({ token: authToken, user: authUser, apiBase: API_BASE }));

ipcMain.handle('auth:login', (_event, token, user) => {
  if (!token || typeof token !== 'string') return { ok: false, error: 'missing token' };
  try { sessionStore.save(token, user || null); }
  catch (e) { return { ok: false, error: e.message }; }
  authToken = token;
  authUser = user || null;
  loadGame();
  return { ok: true };
});

ipcMain.handle('auth:logout', () => {
  try { if (sessionStore) sessionStore.clear(); } catch (_) { /* ignore */ }
  authToken = null;
  authUser = null;
  loadLogin();
  return { ok: true };
});

// ── IPC: Steam achievements bridge ─────────────────────────────────────────────
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
