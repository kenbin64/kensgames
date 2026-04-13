/**
 * Starfighter — Electron Preload Script
 * Exposes safe APIs to the renderer (game) process
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('NativeApp', {
  platform: process.platform,
  isElectron: true,
  // Steam integration hook (populated when Steamworks SDK is linked)
  steam: {
    isAvailable: false,
    getUsername: () => null,
    unlockAchievement: (id) => ipcRenderer.send('steam-achievement', id),
  },
  // Native fullscreen control
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  // Gamepad vibration (native haptics)
  vibrate: (intensity, duration) => ipcRenderer.send('vibrate', { intensity, duration }),
});
