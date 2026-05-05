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

  root.KGGameSetup = {
    summarizeSession,
    persistSession,
    persistSetup,
    buildFastTrackRuntime,
    persistFastTrackRuntime,
    persistGenericRuntime,
    mount,
  };
}(window));
