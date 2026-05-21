/**
 * Starfighter Electron wrapper — preload.js
 * Bridges renderer (game scripts) ↔ main process safely via contextBridge.
 * contextIsolation=true, nodeIntegration=false (HR-42 security contract).
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Platform identity — game scripts can branch on this
  platform: 'desktop',
  wrapper: 'electron',

  // Steam achievements
  unlockAchievement: (id) => ipcRenderer.invoke('steam-unlock-achievement', id),
  getSteamPersonaName: () => ipcRenderer.invoke('steam-get-persona-name'),

  // Fullscreen toggle (keyboard F11 also works, but game rail button uses this)
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
});
