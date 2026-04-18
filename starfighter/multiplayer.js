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
            else if (d.action === 'wave_complete') {
                // A remote player cleared their enemies — add them to the ready set
                _waveReadySet.add(d.playerId || d.payload?.playerId);
                _checkAllReady(d.payload?.wave);
                _emit('wave_complete', d.payload);
            }
            else if (d.action === 'player_eliminated') {
                // Eliminated players no longer count toward wave gate
                _eliminatedSet.add(d.playerId || d.payload?.playerId);
                _checkAllReady(_gatedWave);
                _emit('player_eliminated', d.payload);
            }
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
    function createRoom(opts) {
        if (!_mp) return;
        const maxPlayers = opts && (opts.max_players || opts.maxPlayers) ? (opts.max_players || opts.maxPlayers) : undefined;
        const settings = opts && opts.settings ? opts.settings : (opts || {});
        _mp.createGame({ private: true, max_players: maxPlayers, settings });
    }
    function joinRoom(code) { if (_mp) _mp.joinByCode(code); }
    function leaveRoom() { if (_mp) _mp.leave(); }
    function toggleReady() { if (_mp) _mp.toggleReady(); }
    function acceptLobby() { if (_mp) _mp.acceptLobby(); }
    function startGame() { if (_mp) _mp.startGame(); }
    function matchmake() { if (_mp) _mp.matchmake(); }
    function listRooms() { if (_mp) _mp.listGames(); }
    function sendChat(msg) { if (_mp) _mp.chat(msg); }

    function addBot(level) { if (_mp) _mp.addBot(level); }
    function removeBot(playerId) { if (_mp) _mp.removeBot(playerId); }

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

    // ── Cooperative wave gate ──
    // Each player calls sendWaveComplete() when their enemies are cleared.
    // Eliminated players are excluded — they don't hold up the squad.
    let _waveReadySet = new Set();  // player IDs that have reported ready
    let _eliminatedSet = new Set(); // player IDs eliminated this session
    let _onAllReady = null;
    let _gatedWave = -1;

    function sendWaveComplete(wave) {
        if (!_mp) return;
        // Mark self ready
        _waveReadySet.add(_mp.userId);
        _mp.sendAction('wave_complete', { wave });
        _checkAllReady(wave);
    }

    function onAllPlayersReady(wave, cb) {
        _gatedWave = wave;
        _onAllReady = cb;
        // In case we're already the only player, check immediately
        _checkAllReady(wave);
    }

    function _checkAllReady(wave) {
        if (wave !== _gatedWave || !_onAllReady) return;
        const totalPlayers = _mp && _mp.session ? (_mp.session.players || []).length : 1;
        // Active players = total minus those already eliminated
        const activePlayers = Math.max(1, totalPlayers - _eliminatedSet.size);
        if (_waveReadySet.size >= activePlayers) {
            const cb = _onAllReady;
            _onAllReady = null;
            _gatedWave = -1;
            _waveReadySet.clear();
            cb();
        }
    }

    function resetWaveGate() {
        _waveReadySet.clear();
        _onAllReady = null;
        _gatedWave = -1;
        // Note: _eliminatedSet persists for the session — eliminated players stay excluded
    }

    function sendAction(action, payload) {
        if (_mp) _mp.sendAction(action, payload);
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
        createRoom, joinRoom, leaveRoom, toggleReady, acceptLobby, startGame, matchmake, listRooms, sendChat,
        get roomId() { return _mp && _mp.session ? _mp.session.session_id : null; },
        get roomCode() { return _mp ? _mp.sessionCode : null; },
        get isHost() { return _mp ? _mp.isHost : false; },
        get gameStarted() { return _mp ? _mp.gameStarted : false; },
        get currentRoom() { return _mp ? _mp.session : null; },
        get roomList() { return _mp ? _mp.sessionList : []; },
        addBot, removeBot,
        sendPlayerState, sendFire, sendComm, sendGameOver, sendAction,
        sendWaveComplete, onAllPlayersReady, resetWaveGate,
        get remotePlayers() { return _mp ? _mp.remotePlayers : new Map(); },
        get isMultiplayer() { return _mp ? _mp.isInGame : false; },
        get playerCount() { return _mp && _mp.session ? (_mp.session.players || []).length : 1; },
    };
})();

window.SFMultiplayer = SFMultiplayer;
