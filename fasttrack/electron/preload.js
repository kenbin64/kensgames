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

// Desktop auth bridge: the login page saves the verified token here, and it is
// persisted (encrypted) at the Electron layer + injected into every page so the
// relay runs the connection as the real account.
contextBridge.exposeInMainWorld('kgAuth', {
  get: () => ipcRenderer.invoke('auth:get'),
  login: (token, user) => ipcRenderer.invoke('auth:login', token, user),
  logout: () => ipcRenderer.invoke('auth:logout'),
});
