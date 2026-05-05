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
      game_uuid: sessionObj.game_uuid || null,
      host_id: sessionObj.host_id || null,
      my_user_id: options.myUserId || sessionObj.my_user_id || null,
      is_host: !!(sessionObj.is_host),
      settings: sessionObj.settings || {},
      roster_signature: sessionObj.roster_signature || null,
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
        game_uuid: sessionObj.game_uuid || null,
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
        game_uuid: sessionObj.game_uuid || null,
        host_id: sessionObj.host_id || null,
        my_user_id: options.myUserId || sessionObj.my_user_id || (me && me.user_id) || null,
        is_host: !!(sessionObj.is_host || (me && me.is_host)),
        settings: sessionObj.settings || {},
        roster_signature: sessionObj.roster_signature || null,
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

  // ─── Rules registry ────────────────────────────────────────────────
  // Each game declares a rules JSON (and optional scenarios JSON). Lobbies
  // call registerGame() at load; the manager fetches, caches, and exposes
  // a synchronous enforce() that evaluates rule assertions against a
  // caller-supplied context object. Expandable: adding a new game is one
  // registerGame() call.
  const _registry = new Map();   // id -> { rulesUrl, scenariosUrl, name }
  const _rulesCache = new Map(); // id -> parsed rules object
  const _scenariosCache = new Map();
  const _inflight = new Map();   // id -> Promise<rules>

  const DEFAULT_REGISTRY = [
    { id: 'fasttrack', rulesUrl: '/fasttrack/fasttrack.rules.json', scenariosUrl: null, name: 'FastTrack' },
    { id: '4dtictactoe', rulesUrl: '/4DTicTacToe/rules.json', scenariosUrl: '/4DTicTacToe/manifold.game.json', name: 'Connect 4D' },
    { id: 'brickbreaker3d', rulesUrl: '/brickbreaker3d/rules.json', scenariosUrl: null, name: 'BrickBreaker 3D' },
    { id: 'starfighter', rulesUrl: '/starfighter/rules.json', scenariosUrl: '/starfighter/scenarios.json', name: 'Starfighter' },
  ];

  // ── Setup workflow governance (AI-observable) ─────────────────────────────
  const SETUP_TRACE_KEY = 'kg_setup_trace';
  const SETUP_TRACE_CAP = 300;

  const DEFAULT_SETUP_PROFILE = {
    id: 'default',
    // Panel capabilities that drive which options are practical for a game.
    panel: {
      supportsSameScreen: false,
      supportsMatchmaker: true,
      supportsOpenGames: true,
    },
    // Canonical option family map requested by product.
    options: ['solo', 'solo-bots', 'host-invite', 'private-invite', 'matchmaker', 'browse', 'same-screen'],
    authRequiredModes: ['private-invite', 'matchmaker', 'browse'],
    signup: {
      guestAllowedModes: ['solo', 'solo-bots', 'host-invite', 'same-screen'],
      signedInModes: ['private-invite', 'matchmaker', 'browse'],
      createMethods: ['quick-create', 'signed-in-create'],
      joinMethods: ['url-code', 'open-lobby-list', 'skill-matchmaker'],
    },
    // Ordered setup steps for compliance monitoring.
    requiredSteps: ['profile_ready', 'mode_selected', 'roster_ready', 'launch_confirmed', 'launched'],
  };

  const GAME_SETUP_PROFILES = {
    starfighter: {
      panel: { supportsSameScreen: false, supportsMatchmaker: true, supportsOpenGames: true },
      options: ['solo', 'solo-bots', 'host-invite', 'private-invite', 'matchmaker', 'browse'],
      authRequiredModes: ['private-invite', 'matchmaker', 'browse'],
      requiredSteps: ['profile_ready', 'mode_selected', 'invite_shared', 'roster_ready', 'launch_confirmed', 'launched'],
    },
    fasttrack: {
      panel: { supportsSameScreen: true, supportsMatchmaker: true, supportsOpenGames: true },
      options: ['solo', 'solo-bots', 'host-invite', 'private-invite', 'matchmaker', 'browse', 'same-screen'],
      authRequiredModes: ['private-invite', 'matchmaker', 'browse'],
      requiredSteps: ['profile_ready', 'mode_selected', 'roster_ready', 'launch_confirmed', 'launched'],
    },
    brickbreaker3d: {
      panel: { supportsSameScreen: true, supportsMatchmaker: true, supportsOpenGames: true },
      options: ['solo', 'solo-bots', 'host-invite', 'private-invite', 'matchmaker', 'browse', 'same-screen'],
      authRequiredModes: ['private-invite', 'matchmaker', 'browse'],
      requiredSteps: ['profile_ready', 'mode_selected', 'roster_ready', 'launch_confirmed', 'launched'],
    },
    '4dtictactoe': {
      panel: { supportsSameScreen: true, supportsMatchmaker: true, supportsOpenGames: true },
      options: ['solo', 'solo-bots', 'host-invite', 'private-invite', 'matchmaker', 'browse', 'same-screen'],
      authRequiredModes: ['private-invite', 'matchmaker', 'browse'],
      requiredSteps: ['profile_ready', 'mode_selected', 'roster_ready', 'launch_confirmed', 'launched'],
    },
  };

  const PROFILE_TO_PANEL_MODE = {
    'solo': 'solo',
    'solo-bots': 'solo-bots',
    'host-invite': 'friend',
    'private-invite': 'private',
    'matchmaker': 'matchmaker',
    'browse': 'browse',
    'same-screen': 'same-screen',
  };

  const PANEL_TO_PROFILE_MODE = {
    'solo': 'solo',
    'solo-bots': 'solo-bots',
    'friend': 'host-invite',
    'private': 'private-invite',
    'matchmaker': 'matchmaker',
    'browse': 'browse',
    'same-screen': 'same-screen',
  };

  let _setupDecisionResolver = null;

  function _clamp01(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
  }

  function createAdaptiveSetupResolver(signalProvider) {
    return function adaptiveSetupResolver(gameId, context, baseProfile) {
      const base = getSetupProcess(gameId, baseProfile || {});
      const signals = (typeof signalProvider === 'function')
        ? (signalProvider(gameId, context || {}, base) || {})
        : ((context && context.signals) || {});

      const queueHealth = _clamp01(signals.queueHealth, 1);
      const lobbyHealth = _clamp01(signals.lobbyHealth, 1);
      const serviceHealth = _clamp01(signals.serviceHealth, 1);
      const isSignedIn = !!signals.isSignedIn;

      const blocked = new Set(Array.isArray(signals.blockedModes) ? signals.blockedModes.map(String) : []);
      const only = Array.isArray(signals.onlyModes) ? new Set(signals.onlyModes.map(String)) : null;

      let options = (base.options || []).slice();

      if (queueHealth < 0.35 || serviceHealth < 0.35) {
        blocked.add('matchmaker');
      }
      if (lobbyHealth < 0.25 || serviceHealth < 0.25) {
        blocked.add('browse');
      }
      if (!isSignedIn) {
        blocked.add('private-invite');
        blocked.add('matchmaker');
        blocked.add('browse');
      }

      options = options.filter(function (m) {
        const mode = String(m);
        if (only && !only.has(mode)) return false;
        return !blocked.has(mode);
      });

      if (!options.length) options = ['solo', 'solo-bots'];

      return {
        options: options,
        panel: Object.assign({}, base.panel, {
          supportsMatchmaker: options.indexOf('matchmaker') >= 0,
          supportsOpenGames: options.indexOf('browse') >= 0,
          supportsSameScreen: options.indexOf('same-screen') >= 0,
        }),
      };
    };
  }

  function enableAdaptiveSetupPolicy(signalProvider) {
    return setSetupDecisionResolver(createAdaptiveSetupResolver(signalProvider));
  }

  function _setupStorage() {
    try { return (typeof sessionStorage !== 'undefined') ? sessionStorage : null; } catch (_) { return null; }
  }

  function _readSetupTrace() {
    const s = _setupStorage();
    if (!s) return [];
    const raw = s.getItem(SETUP_TRACE_KEY);
    const arr = raw ? safeJsonParse(raw) : null;
    return Array.isArray(arr) ? arr : [];
  }

  function _writeSetupTrace(trace) {
    const s = _setupStorage();
    if (!s) return;
    try { s.setItem(SETUP_TRACE_KEY, JSON.stringify((trace || []).slice(-SETUP_TRACE_CAP))); } catch (_) { }
  }

  function _pushSetupTrace(rec) {
    const trace = _readSetupTrace();
    trace.push(rec);
    _writeSetupTrace(trace);
  }

  function _normalizeGameId(gameId) {
    return String(gameId || '').toLowerCase();
  }

  function getSetupProcess(gameId, opts) {
    const id = _normalizeGameId(gameId);
    const profile = Object.assign({}, DEFAULT_SETUP_PROFILE, GAME_SETUP_PROFILES[id] || {}, opts || {});
    profile.id = id || DEFAULT_SETUP_PROFILE.id;
    profile.panel = Object.assign({}, DEFAULT_SETUP_PROFILE.panel, (GAME_SETUP_PROFILES[id] && GAME_SETUP_PROFILES[id].panel) || {}, (opts && opts.panel) || {});
    profile.options = Array.isArray(profile.options) ? profile.options.slice() : DEFAULT_SETUP_PROFILE.options.slice();
    profile.authRequiredModes = Array.isArray(profile.authRequiredModes)
      ? profile.authRequiredModes.slice()
      : DEFAULT_SETUP_PROFILE.authRequiredModes.slice();
    profile.signup = Object.assign({}, DEFAULT_SETUP_PROFILE.signup, profile.signup || {}, (opts && opts.signup) || {});
    profile.requiredSteps = Array.isArray(profile.requiredSteps) ? profile.requiredSteps.slice() : DEFAULT_SETUP_PROFILE.requiredSteps.slice();
    return profile;
  }

  function _modeMeta(modeId) {
    switch (modeId) {
      case 'solo': return { label: 'Solo', joinMethod: 'none', createMethod: 'instant' };
      case 'solo-bots': return { label: 'Solo + AI Bots', joinMethod: 'none', createMethod: 'instant-with-bots' };
      case 'host-invite': return { label: 'Invite Friends (URL + Code)', joinMethod: 'url-code', createMethod: 'host-create' };
      case 'private-invite': return { label: 'Signed-In Private Invite', joinMethod: 'url-code', createMethod: 'signed-in-create' };
      case 'matchmaker': return { label: 'Matchmaker', joinMethod: 'queue', createMethod: 'queue' };
      case 'browse': return { label: 'Join Offered Games', joinMethod: 'open-lobby-list', createMethod: 'open-lobby-create' };
      case 'same-screen': return { label: 'Same Screen', joinMethod: 'none', createMethod: 'local-device' };
      default: return { label: String(modeId || 'Unknown'), joinMethod: 'unknown', createMethod: 'unknown' };
    }
  }

  function assessMultiplayerPotential(gameId, context) {
    const ctx = context || {};
    const profile = getSetupProcess(gameId, ctx.profile || {});
    const modeIds = Array.isArray(profile.options) ? profile.options : DEFAULT_SETUP_PROFILE.options;
    const authReq = new Set(Array.isArray(profile.authRequiredModes) ? profile.authRequiredModes : []);
    const modes = modeIds.map((modeId) => {
      const mm = _modeMeta(modeId);
      return {
        id: String(modeId),
        panelMode: PROFILE_TO_PANEL_MODE[String(modeId)] || null,
        label: mm.label,
        requiresSignIn: authReq.has(String(modeId)),
        joinMethod: mm.joinMethod,
        createMethod: mm.createMethod,
      };
    });

    return {
      gameId: profile.id,
      panel: Object.assign({}, profile.panel),
      modes,
      signup: Object.assign({}, profile.signup),
      allowedPanelModes: modes.map((m) => m.panelMode).filter(Boolean),
      authRequiredPanelModes: Array.from(authReq)
        .map((m) => PROFILE_TO_PANEL_MODE[String(m)] || null)
        .filter(Boolean),
      mapping: {
        profileToPanel: Object.assign({}, PROFILE_TO_PANEL_MODE),
        panelToProfile: Object.assign({}, PANEL_TO_PROFILE_MODE),
      },
    };
  }

  function setSetupDecisionResolver(fn) {
    _setupDecisionResolver = (typeof fn === 'function') ? fn : null;
    return !!_setupDecisionResolver;
  }

  function resolveSetupProcess(gameId, context) {
    const ctx = context || {};
    const base = getSetupProcess(gameId);
    let resolved = base;
    if (_setupDecisionResolver) {
      try {
        const out = _setupDecisionResolver(gameId, ctx, base);
        if (out && typeof out === 'object') {
          resolved = getSetupProcess(gameId, out);
        }
      } catch (err) {
        report({
          level: 'warn',
          code: 'setup_process_resolver_failed',
          gameId: _normalizeGameId(gameId),
          message: 'Setup decision resolver failed; using default process',
          details: { error: err && err.message ? err.message : String(err) },
        });
      }
    }
    return Object.assign({}, resolved, {
      assessment: assessMultiplayerPotential(gameId, { profile: resolved, context: ctx }),
    });
  }

  function beginSetupFlow(meta) {
    const m = meta || {};
    const gameId = _normalizeGameId(m.gameId);
    const flow = {
      flowId: String(m.flowId || ('flow_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8))),
      gameId,
      gameName: m.gameName ? String(m.gameName) : gameId,
      startedAt: Date.now(),
      profile: getSetupProcess(gameId),
      steps: [],
      status: 'active',
      source: m.source ? String(m.source) : 'unknown',
      sessionId: m.sessionId ? String(m.sessionId) : null,
      userId: m.userId ? String(m.userId) : null,
    };
    _pushSetupTrace({ ts: new Date().toISOString(), type: 'setup_flow_started', flow });
    report({
      level: 'info',
      code: 'setup_flow_started',
      gameId,
      sessionId: flow.sessionId,
      userId: flow.userId,
      message: 'Setup flow started',
      details: { flowId: flow.flowId, source: flow.source },
    });
    return flow;
  }

  function recordSetupStep(flow, stepId, details) {
    if (!flow || !stepId) return null;
    const step = {
      id: String(stepId),
      ts: Date.now(),
      details: (details && typeof details === 'object') ? details : null,
    };
    flow.steps = Array.isArray(flow.steps) ? flow.steps : [];
    flow.steps.push(step);
    _pushSetupTrace({
      ts: new Date().toISOString(),
      type: 'setup_step',
      flowId: flow.flowId,
      gameId: flow.gameId,
      step,
    });
    report({
      level: 'info',
      code: 'setup_step',
      gameId: flow.gameId,
      sessionId: flow.sessionId,
      userId: flow.userId,
      message: 'Setup step: ' + step.id,
      details: { flowId: flow.flowId, step: step.id, stepDetails: step.details },
    });
    return step;
  }

  function evaluateSetupCompliance(flow, opts) {
    const options = opts || {};
    if (!flow) return { ok: false, missing: ['flow'], completed: [], required: [] };
    const profile = options.profile || flow.profile || getSetupProcess(flow.gameId);
    const completed = (flow.steps || []).map((s) => String(s && s.id || ''));
    const modeStep = (flow.steps || []).find((s) => s && s.id === 'profile_ready' && s.details && s.details.launchMode);
    const launchMode = modeStep && modeStep.details ? String(modeStep.details.launchMode || '') : '';
    const required = (Array.isArray(profile.requiredSteps) ? profile.requiredSteps : []).filter((stepId) => {
      if (stepId !== 'invite_shared') return true;
      return launchMode === 'friend' || launchMode === 'private';
    });
    const completedSet = new Set((flow.steps || []).map((s) => String(s && s.id || '')));
    const missing = required.filter((r) => !completedSet.has(String(r)));
    return {
      ok: missing.length === 0,
      required,
      completed: completed,
      missing,
      flowId: flow.flowId,
      gameId: flow.gameId,
      launchMode: launchMode || null,
    };
  }

  function finalizeSetupFlow(flow, status, details) {
    if (!flow) return null;
    flow.status = String(status || 'completed');
    flow.finishedAt = Date.now();
    const compliance = evaluateSetupCompliance(flow);
    const rec = {
      ts: new Date().toISOString(),
      type: 'setup_flow_finished',
      flowId: flow.flowId,
      gameId: flow.gameId,
      status: flow.status,
      compliance,
      details: (details && typeof details === 'object') ? details : null,
    };
    _pushSetupTrace(rec);
    report({
      level: compliance.ok ? 'info' : 'warn',
      code: compliance.ok ? 'setup_flow_compliant' : 'setup_flow_noncompliant',
      gameId: flow.gameId,
      sessionId: flow.sessionId,
      userId: flow.userId,
      message: compliance.ok ? 'Setup flow completed with compliance' : 'Setup flow completed with missing steps',
      details: {
        flowId: flow.flowId,
        status: flow.status,
        missing: compliance.missing,
        providedDetails: rec.details,
      },
    });
    return rec;
  }

  function getSetupTrace(limit) {
    const trace = _readSetupTrace();
    const n = Math.max(0, Math.min(SETUP_TRACE_CAP, parseInt(limit, 10) || SETUP_TRACE_CAP));
    return trace.slice(-n);
  }

  function clearSetupTrace() {
    _writeSetupTrace([]);
    return true;
  }

  function registerGame(id, opts) {
    const key = String(id || '').toLowerCase();
    if (!key) return false;
    const existing = _registry.get(key) || {};
    const next = {
      id: key,
      rulesUrl: (opts && opts.rulesUrl) || existing.rulesUrl || null,
      scenariosUrl: (opts && opts.scenariosUrl) || existing.scenariosUrl || null,
      name: (opts && opts.name) || existing.name || key,
    };
    _registry.set(key, next);
    return true;
  }

  function listGames() { return Array.from(_registry.keys()); }
  function getRegistration(id) { return _registry.get(String(id || '').toLowerCase()) || null; }

  function _fetchJson(url) {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('KGGameManager.loadRules requires fetch (browser environment).'));
    }
    return fetch(url, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error('rules fetch ' + r.status + ' ' + url);
      return r.json();
    });
  }

  function loadRules(id) {
    const key = String(id || '').toLowerCase();
    const reg = _registry.get(key);
    if (!reg || !reg.rulesUrl) return Promise.reject(new Error('No rulesUrl registered for ' + key));
    if (_rulesCache.has(key)) return Promise.resolve(_rulesCache.get(key));
    if (_inflight.has(key)) return _inflight.get(key);

    const p = _fetchJson(reg.rulesUrl).then((rules) => {
      _rulesCache.set(key, rules);
      _inflight.delete(key);
      // Best-effort scenario load alongside.
      if (reg.scenariosUrl && !_scenariosCache.has(key)) {
        _fetchJson(reg.scenariosUrl).then((s) => _scenariosCache.set(key, s)).catch(() => { });
      }
      return rules;
    }).catch((err) => {
      _inflight.delete(key);
      throw err;
    });
    _inflight.set(key, p);
    return p;
  }

  function getRules(id) { return _rulesCache.get(String(id || '').toLowerCase()) || null; }
  function getScenarios(id) { return _scenariosCache.get(String(id || '').toLowerCase()) || null; }
  function setRules(id, rules) { _rulesCache.set(String(id || '').toLowerCase(), rules); return true; } // test/seed helper
  function setScenarios(id, s) { _scenariosCache.set(String(id || '').toLowerCase(), s); return true; }

  function _evalAssertion(expr, ctx) {
    // Sandbox: assertion is a JS expression of `ctx`. Errors → skipped (not violated),
    // so partial contexts during gameplay don't false-fail rules they don't apply to.
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('ctx', 'return (' + String(expr) + ');');
      const result = fn(ctx);
      return { ok: result !== false, skipped: result === undefined };
    } catch (_) {
      return { ok: true, skipped: true };
    }
  }

  function enforce(id, ctx, opts) {
    const options = opts || {};
    const rules = getRules(id);
    if (!rules || !Array.isArray(rules.rules)) {
      return { ok: true, evaluated: 0, violations: [], skipped: 0, reason: 'rules-not-loaded' };
    }
    const wantCategory = options.category ? String(options.category) : null;
    const subset = wantCategory
      ? rules.rules.filter((r) => String(r.category || '') === wantCategory)
      : rules.rules;
    const violations = [];
    let skipped = 0;
    for (let i = 0; i < subset.length; i++) {
      const r = subset[i];
      if (!r || !r.assertion) continue;
      const out = _evalAssertion(r.assertion, ctx);
      if (out.skipped) { skipped++; continue; }
      if (!out.ok) violations.push({ id: r.id, category: r.category, desc: r.desc });
    }
    return { ok: violations.length === 0, evaluated: subset.length, violations, skipped };
  }

  // Auto-register defaults so any page that loads game_manager.js can
  // immediately call loadRules('fasttrack') etc. without prior wiring.
  for (let i = 0; i < DEFAULT_REGISTRY.length; i++) registerGame(DEFAULT_REGISTRY[i].id, DEFAULT_REGISTRY[i]);

  // ── Health monitor (Phase 6) ──────────────────────────────────────────────
  // Append-only ring buffer kept in localStorage and best-effort POSTed to
  // /api/gm/log so the AI can read /state/game-manager.log on the server.
  const HEALTH_LOG_KEY = 'kg_gm_health_log';
  const HEALTH_LOG_CAP = 200;
  const HEALTH_INGEST_URL = '/api/gm/log';

  function _healthStorage() {
    try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (_) { return null; }
  }

  function _readHealthBuffer() {
    const s = _healthStorage();
    if (!s) return [];
    const raw = s.getItem(HEALTH_LOG_KEY);
    const arr = raw ? safeJsonParse(raw) : null;
    return Array.isArray(arr) ? arr : [];
  }

  function _writeHealthBuffer(arr) {
    const s = _healthStorage();
    if (!s) return;
    try { s.setItem(HEALTH_LOG_KEY, JSON.stringify(arr.slice(-HEALTH_LOG_CAP))); } catch (_) { }
  }

  function _postHealthEntry(entry) {
    if (typeof fetch !== 'function') return;
    try {
      fetch(HEALTH_INGEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
        keepalive: true,
      }).catch(() => { });
    } catch (_) { }
  }

  function report(entry) {
    const e = entry || {};
    const rec = {
      ts: new Date().toISOString(),
      level: String(e.level || 'info'),
      code: e.code ? String(e.code) : null,
      gameId: e.gameId ? String(e.gameId).toLowerCase() : null,
      sessionId: e.sessionId ? String(e.sessionId) : null,
      userId: e.userId ? String(e.userId) : null,
      message: e.message ? String(e.message) : '',
      details: (e.details && typeof e.details === 'object') ? e.details : null,
      page: (typeof location !== 'undefined' && location.pathname) ? location.pathname : null,
      ua: (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : null,
    };
    const buf = _readHealthBuffer();
    buf.push(rec);
    _writeHealthBuffer(buf);
    const tag = '[GM ' + rec.level.toUpperCase() + ']';
    const line = tag + ' ' + (rec.code ? rec.code + ' ' : '') + rec.message;
    if (typeof console !== 'undefined') {
      if (rec.level === 'error') console.error(line, rec.details || '');
      else if (rec.level === 'warn') console.warn(line, rec.details || '');
      else console.log(line, rec.details || '');
    }
    _postHealthEntry(rec);
    return rec;
  }

  function getLog(limit) {
    const buf = _readHealthBuffer();
    const n = Math.max(0, Math.min(HEALTH_LOG_CAP, parseInt(limit, 10) || HEALTH_LOG_CAP));
    return buf.slice(-n);
  }

  function clearLog() { _writeHealthBuffer([]); return true; }

  function monitor(name, ok, details) {
    if (ok) return { ok: true, name: String(name || '') };
    return report({
      level: 'warn',
      code: 'invariant_failed',
      message: 'Invariant failed: ' + String(name || ''),
      details: (details && typeof details === 'object') ? details : { details: details },
    });
  }

  // Capture uncaught client errors so the AI sees runtime breakage too.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('error', function (ev) {
      if (!ev) return;
      report({
        level: 'error',
        code: 'window_error',
        message: ev.message || 'window error',
        details: {
          filename: ev.filename || null,
          lineno: ev.lineno || null,
          colno: ev.colno || null,
          stack: (ev.error && ev.error.stack) ? String(ev.error.stack).slice(0, 1500) : null,
        },
      });
    });
    window.addEventListener('unhandledrejection', function (ev) {
      if (!ev) return;
      const reason = ev.reason || {};
      report({
        level: 'error',
        code: 'unhandled_rejection',
        message: String(reason.message || reason || 'unhandled promise rejection'),
        details: { stack: (reason.stack ? String(reason.stack).slice(0, 1500) : null) },
      });
    });
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
    // Rules registry (Phase 3)
    registerGame,
    listGames,
    getRegistration,
    loadRules,
    getRules,
    getScenarios,
    setRules,
    setScenarios,
    enforce,
    // Setup workflow governance
    getSetupProcess,
    assessMultiplayerPotential,
    setSetupDecisionResolver,
    createAdaptiveSetupResolver,
    enableAdaptiveSetupPolicy,
    resolveSetupProcess,
    beginSetupFlow,
    recordSetupStep,
    evaluateSetupCompliance,
    finalizeSetupFlow,
    getSetupTrace,
    clearSetupTrace,
    // Health monitor (Phase 6)
    report,
    getLog,
    clearLog,
    monitor,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.KGGameManager = api;
  }

}(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this));
