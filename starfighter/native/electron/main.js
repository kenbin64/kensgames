/**
 * Starfighter — Electron Main Process
 * Wraps the web game in a native chromeless window for Steam/Desktop
 * No browser chrome, auto-fullscreen, pointer lock works natively
 */
const { app, BrowserWindow, globalShortcut, screen } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    fullscreen: true,
    autoHideMenuBar: true,
    frame: false,            // No window chrome — pure game
    backgroundColor: '#000',
    icon: path.join(__dirname, '../../assets/textures/starfighterlogo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Gamepad API requires these
      navigatorGamepadEnabled: true,
    }
  });

  // Load the game — point to the local index.html
  mainWindow.loadFile(path.join(__dirname, '../../index.html'));

  // Fullscreen + no cursor by default
  mainWindow.setFullScreen(true);

  // F11 toggles fullscreen
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  // Pointer lock is auto-allowed in Electron (no browser permission prompt)
  mainWindow.webContents.session.setPermissionCheckHandler(() => true);
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    // Allow all permissions the game needs (pointer lock, fullscreen, audio, gamepad)
    callback(true);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

// Disable default Ctrl+W close behavior in-game
app.on('browser-window-focus', () => {
  globalShortcut.register('CommandOrControl+W', () => {
    // Ignore — prevent accidental close during gameplay
  });
});

app.on('browser-window-blur', () => {
  globalShortcut.unregisterAll();
});
