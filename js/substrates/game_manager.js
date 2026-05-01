(function (root) {
  'use strict';

  const RUNTIME_KEY = 'kg_fasttrack_runtime';
  const GENERIC_RUNTIME_KEY = 'kg_game_runtime';

  const AVATAR_EMOJIS = {
    person_smile: '😊',
    person_cool: '😎',
    animal_lion: '🦁',
    animal_fox: '🦊',
    space_rocket: '🚀',
    fantasy_dragon: '🐲',
    scifi_robot: '🤖',
    sport_soccer: '⚽',
    robot: '🤖',
  };

  function toAvatarGlyph(avatarId, fallbackGlyph) {
    if (fallbackGlyph) return String(fallbackGlyph);
    return AVATAR_EMOJIS[String(avatarId || '')] || '👤';
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function safeJsonParse(raw) {
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function safeStorageSet(storage, key, value) {
    if (!storage) return;
    try { storage.setItem(key, JSON.stringify(value)); } catch (_) { }
  }

  function pickMyPlayer(players, myUserId) {
    const id = String(myUserId || '');
    return asArray(players).find((p) => String(p && p.user_id || '') === id) || players[0] || null;
  }

  function buildPlayerSpec(raw, index) {
    const avatarId = raw && raw.avatar_id ? raw.avatar_id : (raw && raw.avatarObj && raw.avatarObj.id) || null;
    const avatarGlyph = toAvatarGlyph(avatarId, raw && (raw.avatar || raw.avatar_emoji));
    return {
      id: String((raw && (raw.user_id || raw.id)) || ('p-' + index + '-' + Date.now())),
      user_id: String((raw && (raw.user_id || raw.id)) || ('p-' + index)),
      name: String((raw && (raw.username || raw.name)) || ('Player ' + (index + 1))),
      isAI: !!(raw && (raw.is_ai || raw.isAI || raw.is_bot)),
      avatar: {
        id: avatarId,
        glyph: avatarGlyph,
      },
    };
  }

  function createFastTrackRuntimeFromSession(session, opts) {
    const options = opts || {};
    const sessionObj = session || {};
    const roster = asArray(sessionObj.players);

    const PlayerClass = root.Player;
    const FastTrackGameClass = root.FastTrackGame;
    if (!PlayerClass || !FastTrackGameClass) {
      return {
        ok: false,
        reason: 'missing-classes',
      };
    }

    const players = roster.map((raw, index) => new PlayerClass(buildPlayerSpec(raw, index)));

    const game = new FastTrackGameClass();
    game.setSession({
      session_id: sessionObj.session_id || null,
      session_code: sessionObj.session_code || '',
      game_id: sessionObj.game_id || 'fasttrack',
      host_id: sessionObj.host_id || null,
      my_user_id: options.myUserId || sessionObj.my_user_id || null,
      is_host: !!(sessionObj.is_host),
      settings: sessionObj.settings || {},
      players: roster,
    });
    game.injectPlayers(players);

    const meRaw = pickMyPlayer(roster, options.myUserId || sessionObj.my_user_id);
    const me = meRaw ? {
      id: String(meRaw.user_id || meRaw.id || ''),
      user_id: String(meRaw.user_id || meRaw.id || ''),
      username: String(meRaw.username || meRaw.name || 'Player'),
      avatar_id: meRaw.avatar_id || null,
      avatar: toAvatarGlyph(meRaw.avatar_id, meRaw.avatar),
      is_host: !!meRaw.is_host,
      is_ai: !!(meRaw.is_ai || meRaw.is_bot),
    } : null;

    const payload = {
      schema: 'kg.fasttrack.runtime/1',
      created_at: Date.now(),
      late_join: !!options.lateJoin,
      game: {
        id: game.id,
        name: game.name,
        mode: options.mode || 'private',
        code: String(sessionObj.session_code || '').toUpperCase(),
        player_count: players.length,
        settings: sessionObj.settings || {},
        manifold: game.toManifold(),
      },
      players: players.map((player, index) => {
        const raw = roster[index] || {};
        const avatar = player.avatar || {};
        return {
          id: player.id,
          user_id: String(raw.user_id || player.id),
          username: player.name,
          name: player.name,
          is_ai: !!player.isAI,
          is_host: !!raw.is_host,
          avatar_id: raw.avatar_id || avatar.id || null,
          avatar: avatar.glyph || avatar.emoji || '👤',
          avatarObj: avatar,
          color: player.color || null,
        };
      }),
      me,
      session: {
        session_id: sessionObj.session_id || null,
        session_code: String(sessionObj.session_code || '').toUpperCase(),
        game_id: sessionObj.game_id || 'fasttrack',
        host_id: sessionObj.host_id || null,
        my_user_id: options.myUserId || sessionObj.my_user_id || (me && me.user_id) || null,
        is_host: !!(sessionObj.is_host || (me && me.is_host)),
        settings: sessionObj.settings || {},
      },
    };

    return {
      ok: true,
      game,
      players,
      payload,
    };
  }

  function createGenericRuntimeFromSummary(summary, opts) {
    const options = opts || {};
    const s = summary || {};
    const session = s.session || null;
    const roster = asArray(s.players || (session && session.players));
    const myUserId = String((options.myUserId || (session && session.my_user_id) || '') || '');
    const meRaw = pickMyPlayer(roster, myUserId);
    const mode = options.mode ||
      (s.launchMode === 'friend' ? 'private' : (s.launchMode === 'ai' ? 'multi' : 'solo'));
    const gameId = String(options.gameId || (session && session.game_id) || 'game');
    const gameName = String(options.gameName || gameId);

    const players = roster.length > 0
      ? roster.map((raw, index) => {
        const spec = buildPlayerSpec(raw, index);
        return {
          id: spec.id,
          user_id: spec.user_id,
          username: spec.name,
          name: spec.name,
          is_ai: !!spec.isAI,
          is_host: !!(raw && raw.is_host),
          avatar_id: spec.avatar && spec.avatar.id ? spec.avatar.id : null,
          avatar: spec.avatar && spec.avatar.glyph ? spec.avatar.glyph : '👤',
          avatarObj: spec.avatar || null,
        };
      })
      : [{
        id: String(Date.now()),
        user_id: myUserId || 'local',
        username: String(options.playerName || root.localStorage && (root.localStorage.getItem('username') || root.localStorage.getItem('display_name')) || 'Player'),
        name: String(options.playerName || 'Player'),
        is_ai: false,
        is_host: true,
        avatar_id: options.avatarId || null,
        avatar: toAvatarGlyph(options.avatarId, options.avatar),
        avatarObj: { id: options.avatarId || null, glyph: toAvatarGlyph(options.avatarId, options.avatar) },
      }];

    const me = meRaw
      ? {
        user_id: String(meRaw.user_id || meRaw.id || ''),
        username: String(meRaw.username || meRaw.name || 'Player'),
        avatar_id: meRaw.avatar_id || (meRaw.avatarObj && meRaw.avatarObj.id) || null,
        avatar: toAvatarGlyph(meRaw.avatar_id, meRaw.avatar),
        is_host: !!meRaw.is_host,
      }
      : {
        user_id: myUserId || players[0].user_id,
        username: players[0].username,
        avatar_id: players[0].avatar_id,
        avatar: players[0].avatar,
        is_host: true,
      };

    const payload = {
      schema: 'kg.game.runtime/1',
      created_at: Date.now(),
      late_join: !!options.lateJoin,
      game: {
        id: gameId,
        name: gameName,
        mode,
        code: String((s.code || (session && session.session_code) || options.code || '') || '').toUpperCase() || null,
        player_count: Math.max(1, Number(s.playerCount || players.length || 1)),
        settings: (session && session.settings) || options.settings || {},
      },
      players,
      me,
      session: {
        session_id: session && session.session_id ? session.session_id : null,
        session_code: String((session && session.session_code) || (s.code || '') || '').toUpperCase(),
        game_id: gameId,
        host_id: session && session.host_id ? session.host_id : null,
        my_user_id: myUserId || me.user_id,
        is_host: !!(session && session.is_host || me.is_host),
        settings: (session && session.settings) || options.settings || {},
      },
    };

    return {
      ok: true,
      payload,
    };
  }

  function createLegacyLaunchObjects(runtime) {
    const payload = runtime && runtime.payload ? runtime.payload : runtime;
    const me = payload && payload.me ? payload.me : null;
    const game = payload && payload.game ? payload.game : null;

    const gameY = [
      { id: 'mode_private', value: 1.2 },
      { id: 'player_count', value: Math.max(1, Number(game && game.player_count || 1)) },
      { id: 'late_join', value: payload && payload.late_join ? 1.15 : 1 },
    ];
    const playerY = [
      { id: 'avatar_affinity', value: 1.05 },
      { id: 'session_presence', value: 1.1 },
    ];

    const solveZ = root.ManifoldBridge && typeof root.ManifoldBridge.solveZ === 'function'
      ? root.ManifoldBridge.solveZ
      : function (_x, yList) {
        return asArray(yList).reduce((acc, item) => acc * Number(item && item.value || 1), 1);
      };

    const KG_Game = {
      x: payload && payload.session && payload.session.session_id ? payload.session.session_id : ('session_' + Date.now()),
      mode: game && game.mode ? game.mode : 'private',
      code: game && game.code ? game.code : null,
      playerCount: Math.max(2, Math.min(6, Number(game && game.player_count || 2))),
      settings: game && game.settings ? game.settings : {},
      launchedAt: Date.now(),
      lateJoin: !!(payload && payload.late_join),
      y: gameY,
      z: solveZ(1, gameY),
      attrs: {
        host_id: payload && payload.session ? payload.session.host_id : null,
        game_id: payload && payload.session && payload.session.game_id ? payload.session.game_id : 'fasttrack',
      },
    };

    const KG_Player = {
      x: me && me.user_id ? me.user_id : ('user_' + Date.now()),
      user_id: me && me.user_id ? me.user_id : '',
      name: me && me.username ? me.username : 'Player',
      username: me && me.username ? me.username : 'Player',
      avatar: me && me.avatar ? me.avatar : '👤',
      avatarObj: {
        id: me && me.avatar_id ? me.avatar_id : null,
        glyph: me && me.avatar ? me.avatar : '👤',
      },
      y: playerY,
      z: solveZ(1, playerY),
    };

    return { KG_Game, KG_Player };
  }

  function persistRuntime(runtime, opts) {
    const options = opts || {};
    const payload = runtime && runtime.payload ? runtime.payload : runtime;
    if (!payload || !payload.schema) return;

    safeStorageSet(root.sessionStorage, RUNTIME_KEY, payload);

    const sessionForLegacy = {
      session_id: payload.session && payload.session.session_id,
      session_code: payload.session && payload.session.session_code,
      game_id: payload.session && payload.session.game_id,
      host_id: payload.session && payload.session.host_id,
      my_user_id: payload.session && payload.session.my_user_id,
      is_host: payload.session && payload.session.is_host,
      settings: payload.session && payload.session.settings,
      players: payload.players || [],
    };
    safeStorageSet(root.sessionStorage, 'kg_session', sessionForLegacy);

    const legacy = createLegacyLaunchObjects(payload);
    safeStorageSet(root.localStorage, 'KG_Game', legacy.KG_Game);
    safeStorageSet(root.localStorage, 'KG_Player', legacy.KG_Player);

    safeStorageSet(root.localStorage, 'fasttrack-lobby', {
      mode: legacy.KG_Game.mode,
      code: legacy.KG_Game.code,
      humanName: legacy.KG_Player.name,
      humanAvatar: legacy.KG_Player.avatar,
      aiDifficulty: legacy.KG_Game.aiDifficulty || 'normal',
      playerCount: String(legacy.KG_Game.playerCount),
    });

    safeStorageSet(root.sessionStorage, 'ft_session_players', (payload.players || []).map((p) => ({
      user_id: p.user_id,
      username: p.username || p.name,
      avatar: p.avatar || '👤',
      is_ai: !!p.is_ai,
      is_host: !!p.is_host,
    })));
    try {
      if (payload.session && payload.session.my_user_id) {
        root.sessionStorage.setItem('ft_my_user_id', String(payload.session.my_user_id));
      }
      if (payload.session && payload.session.host_id) {
        root.sessionStorage.setItem('ft_host_user_id', String(payload.session.host_id));
      }
    } catch (_) { }

    if (options.navigateTo) {
      root.location.href = options.navigateTo;
    }
  }

  function persistGenericRuntime(runtime, opts) {
    const options = opts || {};
    const payload = runtime && runtime.payload ? runtime.payload : runtime;
    if (!payload || payload.schema !== 'kg.game.runtime/1') return;

    const gameId = String(payload.game && payload.game.id || 'game');
    safeStorageSet(root.sessionStorage, GENERIC_RUNTIME_KEY, payload);
    safeStorageSet(root.sessionStorage, 'kg_runtime_' + gameId, payload);

    if (payload.session && (payload.session.session_id || payload.session.session_code || (payload.players && payload.players.length))) {
      safeStorageSet(root.sessionStorage, 'kg_session', {
        session_id: payload.session.session_id,
        session_code: payload.session.session_code,
        game_id: payload.session.game_id,
        host_id: payload.session.host_id,
        my_user_id: payload.session.my_user_id,
        is_host: payload.session.is_host,
        settings: payload.session.settings,
        players: payload.players || [],
      });
    }

    const legacy = createLegacyLaunchObjects(payload);
    legacy.KG_Game.attrs = legacy.KG_Game.attrs || {};
    legacy.KG_Game.attrs.game_id = gameId;
    safeStorageSet(root.localStorage, 'KG_Game', legacy.KG_Game);
    safeStorageSet(root.localStorage, 'KG_Player', legacy.KG_Player);

    safeStorageSet(root.localStorage, gameId + '-lobby', {
      mode: legacy.KG_Game.mode,
      code: legacy.KG_Game.code,
      playerCount: String(legacy.KG_Game.playerCount),
      humanName: legacy.KG_Player.name,
      humanAvatar: legacy.KG_Player.avatar,
    });

    if (options.navigateTo) {
      root.location.href = options.navigateTo;
    }
  }

  function readRuntimeFromStorage() {
    if (!root.sessionStorage) return null;
    const raw = root.sessionStorage.getItem(RUNTIME_KEY);
    if (!raw) return null;
    const parsed = safeJsonParse(raw);
    return parsed && parsed.schema === 'kg.fasttrack.runtime/1' ? parsed : null;
  }

  function readGenericRuntimeFromStorage(gameId) {
    if (!root.sessionStorage) return null;
    const key = gameId ? ('kg_runtime_' + String(gameId)) : GENERIC_RUNTIME_KEY;
    const raw = root.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = safeJsonParse(raw);
    return parsed && parsed.schema === 'kg.game.runtime/1' ? parsed : null;
  }

  const api = {
    AVATAR_EMOJIS,
    RUNTIME_KEY,
    GENERIC_RUNTIME_KEY,
    createFastTrackRuntimeFromSession,
    createGenericRuntimeFromSummary,
    createLegacyLaunchObjects,
    persistRuntime,
    persistGenericRuntime,
    readRuntimeFromStorage,
    readGenericRuntimeFromStorage,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.KGGameManager = api;
  }

}(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this));
