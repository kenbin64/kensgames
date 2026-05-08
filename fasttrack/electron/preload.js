'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: 'desktop',
  wrapper: 'electron',
  game: 'fasttrack',
  unlockAchievement: (id) => ipcRenderer.invoke('steam-unlock-achievement', id),
  getSteamPersonaName: () => ipcRenderer.invoke('steam-get-persona-name'),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
});
