'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, safe API to the renderer (game) under window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {
  /** Toggle native fullscreen (supplements the existing in-game pointer-lock fullscreen) */
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),

  /** Indicates to the game that it's running inside Electron */
  isDesktop: true,

  /** Platform string: 'win32' | 'darwin' | 'linux' */
  platform: process.platform,
});
