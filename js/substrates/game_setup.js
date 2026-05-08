(function (root) {
  'use strict';

  function playersOf(session) {
    return Array.isArray(session && session.players) ? session.players : [];
  }

  function summarizeSession(session) {
    const players = playersOf(session);
    const myUserId = session && session.my_user_id;
    const me = players.find((player) => player && player.user_id === myUserId) || null;
    const aiCount = players.filter((player) => player && player.is_ai).length;
    const remoteHumanCount = players.filter((player) => player && !player.is_ai && player.user_id !== myUserId).length;
    const humanCount = players.length - aiCount;
    // Respect explicit launchMode on the session (e.g. 'same-screen' for local co-op).
    // Only fall back to the derived mode when none is provided.
    const explicitMode = session && session.launchMode;
    const launchMode = (explicitMode && typeof explicitMode === 'string')
      ? explicitMode
      : (remoteHumanCount > 0 ? 'friend' : (aiCount > 0 ? 'ai' : 'solo'));

    return {
      session,
      players,
      me,
      playerCount: players.length || 1,
      aiCount,
      humanCount,
      remoteHumanCount,
      hasRemoteHumans: remoteHumanCount > 0,
      isHost: !!(session && session.is_host),
      code: session && session.session_code ? session.session_code : '',
      gameUuid: session && session.game_uuid ? session.game_uuid : null,
      rosterSignature: session && session.roster_signature ? session.roster_signature : null,
      launchMode,
    };
  }

  function persistSession(session) {
    if (!session || !root.sessionStorage) return;
    try {
      root.sessionStorage.setItem('kg_session', JSON.stringify({
        session_id: session.session_id,
        session_code: session.session_code,
        game_id: session.game_id,
        game_uuid: session.game_uuid || null,
        host_id: session.host_id,
        my_user_id: session.my_user_id,
        is_host: session.is_host,
        settings: session.settings || {},
        roster_signature: session.roster_signature || null,
        players: session.players,
      }));
    } catch (_) {
      // Ignore storage failures; gameplay can still continue with the live session object.
    }
  }

  function persistSetup(summary) {
    if (!summary || !root.sessionStorage) return;
    try {
      root.sessionStorage.setItem('kg_setup', JSON.stringify({
        launch_mode: summary.launchMode,
        player_count: summary.playerCount,
        ai_count: summary.aiCount,
        remote_human_count: summary.remoteHumanCount,
        code: summary.code,
        is_host: summary.isHost,
      }));
    } catch (_) {
      // Ignore storage failures; this is a convenience cache for downstream pages.
    }
  }

  function buildFastTrackRuntime(summary, opts) {
    const manager = root.KGGameManager;
    if (!manager || typeof manager.createFastTrackRuntimeFromSession !== 'function') {
      return null;
    }
    const session = summary && summary.session ? summary.session : null;
    if (!session) return null;
    const options = Object.assign({
      mode: summary && summary.launchMode === 'friend' ? 'private' : 'solo',
      myUserId: session.my_user_id,
    }, opts || {});
    const runtime = manager.createFastTrackRuntimeFromSession(session, options);
    return runtime && runtime.ok ? runtime : null;
  }

  function persistFastTrackRuntime(summary, opts) {
    const runtime = buildFastTrackRuntime(summary, opts);
    if (!runtime) return null;
    root.KGGameManager.persistRuntime(runtime, opts || {});
    return runtime;
  }

  function persistGenericRuntime(summary, opts) {
    const manager = root.KGGameManager;
    if (!manager || typeof manager.createGenericRuntimeFromSummary !== 'function' || typeof manager.persistGenericRuntime !== 'function') {
      return null;
    }
    const runtime = manager.createGenericRuntimeFromSummary(summary, opts || {});
    if (!runtime || !runtime.ok) return null;
    manager.persistGenericRuntime(runtime, opts || {});
    return runtime;
  }

  function _applySetupViewportPolicy(target) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) return;

    const coarse = (typeof window.matchMedia === 'function' && window.matchMedia('(hover: none) and (pointer: coarse)').matches)
      || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');

    // Setup panel should be fully visible in one viewport on desktop.
    host.style.maxHeight = coarse ? 'none' : 'min(98dvh, 98vh)';
    host.style.overflow = coarse ? 'visible' : 'hidden';
    host.style.display = host.style.display || 'block';

    if (window.KGViewportPolicy && typeof window.KGViewportPolicy.apply === 'function') {
      window.KGViewportPolicy.apply();
    }
    if (window.KGViewportPolicy && typeof window.KGViewportPolicy.applyWizardSingleStep === 'function') {
      window.KGViewportPolicy.applyWizardSingleStep(host);
    }
  }

  function mount(target, opts) {
    if (!root.KGMultiplayerPanel || typeof root.KGMultiplayerPanel.mount !== 'function') {
      throw new Error('KGMultiplayerPanel is required before KGGameSetup.mount()');
    }
    const manager = root.KGGameManager;
    const gameId = opts && opts.gameId ? String(opts.gameId).toLowerCase() : 'game';
    const setupProfile = (manager && typeof manager.resolveSetupProcess === 'function')
      ? manager.resolveSetupProcess(gameId, { opts: opts || {} })
      : ((manager && typeof manager.getSetupProcess === 'function')
        ? manager.getSetupProcess(gameId)
        : null);
    const setupAssessment = setupProfile && setupProfile.assessment ? setupProfile.assessment : null;
    const panelProfile = setupAssessment ? setupAssessment.panel : (setupProfile && setupProfile.panel);
    const allowedPanelModes = setupAssessment && Array.isArray(setupAssessment.allowedPanelModes)
      ? setupAssessment.allowedPanelModes
      : null;
    const authRequiredPanelModes = setupAssessment && Array.isArray(setupAssessment.authRequiredPanelModes)
      ? setupAssessment.authRequiredPanelModes
      : null;
    const setupFlow = (manager && typeof manager.beginSetupFlow === 'function')
      ? manager.beginSetupFlow({
        gameId,
        gameName: opts && opts.gameName,
        source: 'KGGameSetup.mount',
      })
      : null;

    function mapStageToStep(stageInfo) {
      const st = String(stageInfo && stageInfo.stage || '');
      const state = String(stageInfo && stageInfo.state || '');
      if (state === 'choose') return 'mode_selected';
      if (st === 'share') return 'invite_shared';
      if (st === 'roster') return 'roster_ready';
      if (st === 'launch') return 'launch_confirmed';
      if (st === 'wait') return 'guest_waiting';
      if (state === 'launching') return 'launched';
      if (state === 'error') return 'setup_error';
      return null;
    }

    const onLaunch = opts && opts.onLaunch;
    const panelOpts = Object.assign({}, opts, {
      supportsSameScreen: panelProfile ? !!panelProfile.supportsSameScreen : (opts && opts.supportsSameScreen),
      supportsMatchmaker: panelProfile ? !!panelProfile.supportsMatchmaker : (opts && opts.supportsMatchmaker),
      supportsOpenGames: panelProfile ? !!panelProfile.supportsOpenGames : (opts && opts.supportsOpenGames),
      allowedModes: allowedPanelModes || (opts && opts.allowedModes) || null,
      authRequiredModes: authRequiredPanelModes || (opts && opts.authRequiredModes) || null,
      signupMethods: setupAssessment && setupAssessment.signup ? setupAssessment.signup : ((opts && opts.signupMethods) || null),
      onSignInRequired(info) {
        if (opts && typeof opts.onSignInRequired === 'function') {
          return opts.onSignInRequired(info);
        }
        const loginUrl = new URL('/login/', location.origin);
        loginUrl.searchParams.set('next', location.pathname + location.search);
        loginUrl.searchParams.set('game', gameId);
        if (info && info.mode) loginUrl.searchParams.set('mode', String(info.mode));
        location.href = loginUrl.toString();
        return false;
      },
      onStageChange(stageInfo) {
        if (manager && setupFlow && typeof manager.recordSetupStep === 'function') {
          const mapped = mapStageToStep(stageInfo);
          if (mapped) manager.recordSetupStep(setupFlow, mapped, stageInfo);
          manager.recordSetupStep(setupFlow, 'panel_stage', stageInfo);
        }
        if (opts && typeof opts.onStageChange === 'function') {
          opts.onStageChange(stageInfo);
        }
      },
      onLaunch(session) {
        try {
          const summary = summarizeSession(session);
          if (manager && setupFlow && typeof manager.recordSetupStep === 'function') {
            manager.recordSetupStep(setupFlow, 'profile_ready', {
              launchMode: summary.launchMode,
              playerCount: summary.playerCount,
              aiCount: summary.aiCount,
            });
          }
          persistSession(session);
          persistSetup(summary);
          const modeMap = { friend: 'private', ai: 'multi', 'same-screen': 'same-screen' };
          persistGenericRuntime(summary, {
            gameId: opts && opts.gameId,
            gameName: opts && opts.gameName,
            mode: modeMap[summary.launchMode] || 'solo',
          });
          if (manager && setupFlow && typeof manager.finalizeSetupFlow === 'function') {
            manager.finalizeSetupFlow(setupFlow, 'launch', {
              launchMode: summary.launchMode,
              players: summary.playerCount,
              ai: summary.aiCount,
            });
          }
          if (typeof onLaunch === 'function') {
            return onLaunch(summary);
          }
        } catch (e) {
          if (manager && setupFlow && typeof manager.finalizeSetupFlow === 'function') {
            manager.finalizeSetupFlow(setupFlow, 'error', {
              message: e && e.message ? e.message : String(e),
            });
          }
          console.error('[KGGameSetup] onLaunch threw:', e);
          // Allow the panel's own navGuard to handle navigation.
          throw e;
        }
      },
    });
    const mounted = root.KGMultiplayerPanel.mount(target, panelOpts);
    _applySetupViewportPolicy(target);
    return mounted;
  }

  // ─── Universal lobby → game navigation ────────────────────────────────────
  // Manifold contract: z = x * y
  //   x = session identity (the game, the players — who they are)
  //   y = launch mode modifiers (ai/friend/same-screen — how they play)
  //   z = the running game (derived, never stored independently)
  //
  // Every lobby's onLaunch reduces to: persist x, navigate to z-entry.
  // Game-specific intent (gameId, gameName, gamePath) is the only x input.
  // The substrate handles the universal z derivation and navigation.
  function launchTo(summary, opts) {
    const gameId = opts && opts.gameId;
    const gameName = opts && opts.gameName;
    const gamePath = (opts && opts.gamePath) || ('/' + gameId + '/index.html');
    const modeMap = { friend: 'private', ai: 'multi', 'same-screen': 'same-screen' };
    const launchMode = summary && summary.launchMode;
    const mode = (opts && opts.mode) || modeMap[launchMode] || 'solo';
    persistGenericRuntime(summary, { gameId, gameName, mode });
    root.location.href = gamePath + '?launch=1';
  }

  // ─── Universal game-side runtime consumer ─────────────────────────────────
  // Called by each game's index.html on load. Reads the z (persisted runtime)
  // left by the lobby, determines whether y (a live socket) is needed to
  // manifest z, reconnects x (player identity) to the server if so, and
  // delivers a fully-wired session to the game via callbacks.
  //
  // handlers: {
  //   onSolo(runtime)               — local/AI game; no socket needed
  //   onMultiplayer(session, mp)    — session.client = live KGMultiplayer
  //   onMissing()                   — no ?launch=1 or no valid runtime
  //   onMultiplayerTimeout(info)    — multiplayer reconnect did not converge
  //   reconnectTimeout              — ms per reconnect attempt (default 6000)
  //   reconnectAttempts             — attempts before timeout callback (default 3)
  // }
  function consumeRuntime(gameId, handlers) {
    if (!handlers) handlers = {};
    let params = null;
    try { params = new URL(root.location.href).searchParams; } catch { /* ignore */ }
    if (!params || params.get('launch') !== '1') {
      if (typeof handlers.onMissing === 'function') handlers.onMissing();
      return false;
    }

    const manager = root.KGGameManager;
    let runtime = null;
    if (manager && typeof manager.readGenericRuntimeFromStorage === 'function') {
      runtime = manager.readGenericRuntimeFromStorage(gameId);
    }
    if (!runtime || !runtime.game ||
      String(runtime.game.id || '').toLowerCase() !== String(gameId || '').toLowerCase()) {
      if (typeof handlers.onMissing === 'function') handlers.onMissing();
      return false;
    }

    // Clean URL — prevents re-triggering on refresh.
    try {
      params.delete('launch');
      const q = params.toString();
      root.history.replaceState(null, '', root.location.pathname + (q ? ('?' + q) : '') + root.location.hash);
    } catch { /* ignore */ }

    const players = Array.isArray(runtime.players) ? runtime.players : [];
    const humanCount = players.filter(function (p) { return !p.is_ai; }).length;
    const launchMode = runtime.game && runtime.game.mode;
    const needsSocket = humanCount > 1
      && launchMode !== 'ai' && launchMode !== 'solo'
      && typeof root.KGMultiplayer !== 'undefined';

    if (!needsSocket) {
      if (typeof handlers.onSolo === 'function') handlers.onSolo(runtime);
      return true;
    }

    // Multiplayer path: x (player identity token) reconnects via y (socket)
    // to bloom z (the live session + synced game state).
    // The server auto-resumes: guest_login with the same token → same user_id
    // → finds player in 'playing' session → sends game_started automatically.
    let sessionToken = null;
    try { sessionToken = root.sessionStorage.getItem('kg_mp_session_token') || null; } catch { /* ignore */ }

    const mp = new root.KGMultiplayer(gameId);
    let _launched = false;
    const timeoutMs = typeof handlers.reconnectTimeout === 'number' ? handlers.reconnectTimeout : 6000;
    const maxAttempts = Math.max(1, typeof handlers.reconnectAttempts === 'number' ? handlers.reconnectAttempts : 3);
    let _attempt = 0;

    const doLaunch = function (serverSession) {
      if (_launched) return;
      _launched = true;
      if (_fallbackTimer) { clearTimeout(_fallbackTimer); _fallbackTimer = null; }
      const sesData = runtime.session || null;
      const myUserId = mp.userId || (sesData && sesData.my_user_id) || null;
      const serverPlayers = serverSession && Array.isArray(serverSession.players) && serverSession.players.length > 0
        ? serverSession.players : null;
      const isHost = !!(serverSession && serverSession.host_id && myUserId &&
        String(serverSession.host_id) === String(myUserId));
      const merged = Object.assign({}, sesData, serverSession, {
        client: mp,
        my_user_id: myUserId,
        is_host: isHost,
        players: serverPlayers || players,
      });
      if (serverPlayers) {
        // Refresh the cached roster with the authoritative server list.
        runtime.players = serverPlayers;
        runtime.game.player_count = serverPlayers.length;
      }
      if (typeof handlers.onMultiplayer === 'function') handlers.onMultiplayer(merged, mp);
    };

    let _fallbackTimer = null;
    function scheduleAttemptTimeout() {
      if (_fallbackTimer) clearTimeout(_fallbackTimer);
      _fallbackTimer = setTimeout(function () {
        if (_launched) return;
        _attempt += 1;
        if (_attempt < maxAttempts) {
          console.warn('[KGGameSetup] reconnect attempt', _attempt, 'failed for', gameId, '- retrying');
          try { mp.disconnect(); } catch { /* ignore */ }
          mp.connect(sessionToken ? { guestToken: sessionToken } : {});
          scheduleAttemptTimeout();
          return;
        }
        // Fail closed: do NOT run unsynced local state for multiplayer launches.
        console.error('[KGGameSetup] reconnect timeout for', gameId, 'after', maxAttempts, 'attempts');
        if (typeof handlers.onMultiplayerTimeout === 'function') {
          handlers.onMultiplayerTimeout({ gameId: gameId, attempts: maxAttempts, timeoutMs: timeoutMs });
        }
      }, timeoutMs);
    }

    mp.on('game_started', function (data) {
      doLaunch(data && data.session ? data.session : (mp.session || {}));
    });
    mp.on('session_update', function (data) {
      if (data && data.status === 'playing') doLaunch(data);
    });
    scheduleAttemptTimeout();
    mp.connect(sessionToken ? { guestToken: sessionToken } : {});
    return true;
  }

  root.KGGameSetup = {
    summarizeSession,
    persistSession,
    persistSetup,
    buildFastTrackRuntime,
    persistFastTrackRuntime,
    persistGenericRuntime,
    launchTo,
    consumeRuntime,
    mount,
  };
}(window));
