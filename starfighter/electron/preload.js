'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// ── Electron API ─────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  /** Toggle native fullscreen (supplements the existing in-game pointer-lock fullscreen) */
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),

  /** Indicates to the game that it's running inside Electron */
  isDesktop: true,

  /** Platform string: 'win32' | 'darwin' | 'linux' */
  platform: process.platform,
});

// ── Steam API shim ────────────────────────────────────────────────────────────
// Exposes window.steamAPI to the game renderer.
// Interface is stable now; backend wires to real Steamworks SDK once App ID is
// registered. All calls are fire-and-forget or return a Promise.
//
// Dimensional mapping:
//   x = game event (achievement/score/etc.)
//   y = Steam SDK call (the multiplier — does the actual platform work)
//   z = confirmed result (the manifold point: event × SDK = persisted state)
contextBridge.exposeInMainWorld('steamAPI', {
  /** Whether Steam context is active (set by main.js via IS_STEAM) */
  isAvailable: () => ipcRenderer.invoke('steam-available'),

  // ── Achievements ────────────────────────────────────────────────────────
  /** Unlock a Steam achievement by API name string */
  activateAchievement: (apiName) => ipcRenderer.invoke('steam-achievement-set', apiName),

  /** Check if an achievement is already unlocked */
  getAchievement: (apiName) => ipcRenderer.invoke('steam-achievement-get', apiName),

  // ── Leaderboards ─────────────────────────────────────────────────────────
  /** Upload a score to a named leaderboard (creates if not exists) */
  uploadScore: (leaderboardName, score) =>
    ipcRenderer.invoke('steam-leaderboard-upload', leaderboardName, score),

  /** Fetch top N entries from a leaderboard */
  getLeaderboard: (leaderboardName, count) =>
    ipcRenderer.invoke('steam-leaderboard-fetch', leaderboardName, count ?? 10),

  // ── Cloud saves ──────────────────────────────────────────────────────────
  /** Write a string to Steam Cloud (key → value) */
  cloudWrite: (key, value) => ipcRenderer.invoke('steam-cloud-write', key, value),

  /** Read a string from Steam Cloud */
  cloudRead: (key) => ipcRenderer.invoke('steam-cloud-read', key),

  // ── Overlay ──────────────────────────────────────────────────────────────
  /** Activate the Steam overlay to a specific dialog ('achievements', 'community', etc.) */
  activateOverlay: (dialog) => ipcRenderer.invoke('steam-overlay', dialog),
});
