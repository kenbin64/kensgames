/**
 * Fast Track - Electron Preload Script
 * Exposes secure APIs to the renderer process
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 *                        BUTTERFLYFX SUBSTRATE MODEL
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This preload script represents Level 2 (LINE) - Connection/Relationship:
 * 
 * Main Process (POINT) ←─── LINE ───→ Renderer Process (POINT)
 *                           │
 *                    contextBridge
 *                           │
 *              Secure channel for IPC communication
 * 
 * The bridge is the manifold boundary - it defines what can cross between
 * the two dimensional spaces (Node.js ↔ Browser contexts).
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer
contextBridge.exposeInMainWorld('fasttrack', {
    // Platform detection
    platform: process.platform,
    isElectron: true,
    version: process.env.npm_package_version || '1.0.0',

    // Storage API (persistent data)
    store: {
        get: (key) => ipcRenderer.invoke('store:get', key),
        set: (key, value) => ipcRenderer.invoke('store:set', key, value)
    },

    // Steam integration (comprehensive API)
    steam: {
        // Basic
        isAvailable: () => ipcRenderer.invoke('steam:available'),
        getUserInfo: () => ipcRenderer.invoke('steam:getUserInfo'),
        activateOverlay: (dialog) => ipcRenderer.invoke('steam:activateOverlay', dialog),
        
        // Achievements
        unlockAchievement: (key) => ipcRenderer.invoke('steam:unlockAchievement', key),
        getAchievements: () => ipcRenderer.invoke('steam:getAchievements'),
        
        // Rich Presence
        setRichPresence: (key, value) => ipcRenderer.invoke('steam:setRichPresence', key, value),
        updateStatus: (status) => ipcRenderer.invoke('steam:updateStatus', status),
        
        // Leaderboards
        submitScore: (board, score) => ipcRenderer.invoke('steam:submitScore', board, score),
        getLeaderboard: (board, start, count) => ipcRenderer.invoke('steam:getLeaderboard', board, start, count),
        
        // Lobbies
        createLobby: (maxPlayers) => ipcRenderer.invoke('steam:createLobby', maxPlayers),
        joinLobby: (lobbyId) => ipcRenderer.invoke('steam:joinLobby', lobbyId),
        getLobbies: () => ipcRenderer.invoke('steam:getLobbies')
    },
    
    // Game Statistics (local + Steam sync)
    stats: {
        get: () => ipcRenderer.invoke('stats:get'),
        recordGame: (won, pegsHome, pegsCaptured, perfect) => 
            ipcRenderer.invoke('stats:recordGame', won, pegsHome, pegsCaptured, perfect)
    },

    // Menu event listeners
    onMenuEvent: (callback) => {
        ipcRenderer.on('menu:new-game', () => callback('new-game'));
        ipcRenderer.on('menu:join-game', () => callback('join-game'));
        ipcRenderer.on('menu:profile', () => callback('profile'));
        ipcRenderer.on('menu:friends', () => callback('friends'));
        ipcRenderer.on('menu:guild', () => callback('guild'));
        ipcRenderer.on('menu:invite', () => callback('invite'));
        ipcRenderer.on('menu:rules', () => callback('rules'));
        ipcRenderer.on('menu:about', () => callback('about'));
    },

    // Camera event listeners
    onCameraEvent: (callback) => {
        ipcRenderer.on('camera:reset', () => callback('reset'));
        ipcRenderer.on('camera:zoom-in', () => callback('zoom-in'));
        ipcRenderer.on('camera:zoom-out', () => callback('zoom-out'));
    },

    // Steam overlay state
    onSteamOverlay: (callback) => {
        ipcRenderer.on('steam:overlay', (event, isActive) => callback(isActive));
    }
});

// Also expose a simpler API for browser compatibility
contextBridge.exposeInMainWorld('isNativeApp', true);

console.log('Fast Track native preload initialized - ButterflyFX Level 2 (LINE)');

