'use strict';

const { app, BrowserWindow, Menu, shell, globalShortcut, ipcMain } = require('electron');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const GAME_URL = 'https://kensgames.com/starfighter/lobby.html';
const APP_NAME = 'Starfighter';
const MIN_WIDTH = 1280;
const MIN_HEIGHT = 720;

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
  Menu.setApplicationMenu(buildMenu());

  mainWindow.loadURL(GAME_URL);

  // Show window once loaded to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
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
          click: () => mainWindow?.loadURL(GAME_URL),
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
