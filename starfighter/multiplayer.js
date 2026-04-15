/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STARFIGHTER — MULTIPLAYER ADAPTER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Thin adapter over the unified KGMultiplayer client library.
 * Preserves the SFMultiplayer API that core.js already uses.
 * Connects to the unified lobby-server.js (port 8765, wss://kensgames.com/ws).
 */

const SFMultiplayer = (function () {
    'use strict';

    // The shared client instance
    let _mp = null;
    let _onEvent = null;

    function connect(playerCallsign, onEvent) {
        if (_mp) return;
        _onEvent = onEvent || null;
        _mp = new KGMultiplayer('starfighter');

        // Wire KGMultiplayer events → SFMultiplayer callback API
        _mp.on('authenticated', () => _emit('connected'));
        _mp.on('session_update', (s) => _emit('room_update', s));
        _mp.on('share_code', (c) => _emit('share_code', c));
        _mp.on('session_list', (list) => _emit('room_list', list));
        _mp.on('game_started', (d) => _emit('game_start', d));
        _mp.on('player_state', (d) => _emit('player_state', d));
        _mp.on('game_action', (d) => {
            if (d.action === 'fire') _emit('remote_fire', d.payload);
            else if (d.action === 'comm') _emit('comm', d.payload);
            else _emit(d.action, d.payload);
        });
        _mp.on('game_over', (d) => _emit('game_over', d));
        _mp.on('chat', (d) => _emit('chat', d));
        _mp.on('error', (msg) => _emit('error', msg));
        _mp.on('disconnected', () => _emit('disconnected'));

        _mp.connect({
            username: playerCallsign || localStorage.getItem('username') || 'Pilot',
            token: localStorage.getItem('user_token'),
        });
    }

    function disconnect() {
        if (_mp) { _mp.disconnect(); _mp = null; }
    }

    function _emit(eventType, data) {
        if (_onEvent) _onEvent(eventType, data);
    }

    // ── Room management (delegates to KGMultiplayer) ──
    function createRoom(opts) { if (_mp) _mp.createGame({ private: true, settings: opts }); }
    function joinRoom(code) { if (_mp) _mp.joinByCode(code); }
    function leaveRoom() { if (_mp) _mp.leave(); }
    function toggleReady() { if (_mp) _mp.toggleReady(); }
    function startGame() { if (_mp) _mp.startGame(); }
    function matchmake() { if (_mp) _mp.matchmake(); }
    function listRooms() { if (_mp) _mp.listGames(); }
    function sendChat(msg) { if (_mp) _mp.chat(msg); }

    // ── Game state sync ──
    let _lastStateSend = 0;

    function sendPlayerState(player) {
        if (!_mp || !_mp.isInGame) return;
        const now = performance.now();
        if (now - _lastStateSend < 50) return;
        _lastStateSend = now;
        _mp.sendPlayerState({
            x: player.position.x, y: player.position.y, z: player.position.z,
            qx: player.quaternion.x, qy: player.quaternion.y,
            qz: player.quaternion.z, qw: player.quaternion.w,
            vx: player.velocity.x, vy: player.velocity.y, vz: player.velocity.z,
            hull: player.hull, shields: player.shields, fuel: player.fuel,
        });
    }

    function sendFire(weapon, pos, dir) {
        if (_mp) _mp.sendAction('fire', { weapon, x: pos.x, y: pos.y, z: pos.z, dx: dir.x, dy: dir.y, dz: dir.z });
    }

    function sendComm(sender, message, commType) {
        if (_mp) _mp.sendAction('comm', { sender, message, commType });
    }

    function sendGameOver(result, message) {
        if (_mp) _mp.sendGameOver(result, null, null, message);
    }

    // ── Public API — same shape core.js already uses ──
    return {
        connect, disconnect,
        get connected() { return _mp ? _mp.connected : false; },
        get playerId() { return _mp ? _mp.userId : null; },
        get callsign() { return _mp ? _mp.username : null; },
        createRoom, joinRoom, leaveRoom, toggleReady, startGame, matchmake, listRooms, sendChat,
        get roomId() { return _mp && _mp.session ? _mp.session.session_id : null; },
        get roomCode() { return _mp ? _mp.sessionCode : null; },
        get isHost() { return _mp ? _mp.isHost : false; },
        get gameStarted() { return _mp ? _mp.gameStarted : false; },
        get currentRoom() { return _mp ? _mp.session : null; },
        get roomList() { return _mp ? _mp.sessionList : []; },
        sendPlayerState, sendFire, sendComm, sendGameOver,
        get remotePlayers() { return _mp ? _mp.remotePlayers : new Map(); },
        get isMultiplayer() { return _mp ? _mp.isInGame : false; },
    };
})();

window.SFMultiplayer = SFMultiplayer;
