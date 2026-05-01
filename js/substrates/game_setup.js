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
    const launchMode = remoteHumanCount > 0 ? 'friend' : (aiCount > 0 ? 'ai' : 'solo');

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

  function mount(target, opts) {
    if (!root.KGMultiplayerPanel || typeof root.KGMultiplayerPanel.mount !== 'function') {
      throw new Error('KGMultiplayerPanel is required before KGGameSetup.mount()');
    }
    const onLaunch = opts && opts.onLaunch;
    const panelOpts = Object.assign({}, opts, {
      onLaunch(session) {
        const summary = summarizeSession(session);
        persistSession(session);
        persistSetup(summary);
        persistGenericRuntime(summary, {
          gameId: opts && opts.gameId,
          gameName: opts && opts.gameName,
          mode: summary.launchMode === 'friend' ? 'private' : (summary.launchMode === 'ai' ? 'multi' : 'solo'),
        });
        if (typeof onLaunch === 'function') {
          return onLaunch(summary);
        }
      },
    });
    return root.KGMultiplayerPanel.mount(target, panelOpts);
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
