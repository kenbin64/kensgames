// fasttrack/3d-bootstrap.js
// Resolves KG_Game and KG_Player before the 3D scene initialises.
//
// Solo & same-screen: NO server is required. If the player has no saved
// identity we provide sensible defaults so the game can launch directly
// from /fasttrack/play.html → 3d.html without round-tripping the lobby
// (which is currently broken).
//
// Live multiplayer (private/public/multiplayer): a session code is
// required and we still try to bootstrap from the server; if that fails
// AND we have no recoverable code, we redirect back to the lobby.
window.KG_BOOTSTRAP_PROMISE = (async function () {
  // ── 1. Read whatever is already on the device ──
  let kgGame = null;
  let kgPlayer = null;
  try { kgGame = JSON.parse(localStorage.getItem('KG_Game') || 'null'); } catch (_) { }
  try { kgPlayer = JSON.parse(localStorage.getItem('KG_Player') || 'null'); } catch (_) { }

  const usp = new URLSearchParams(location.search);

  // URL-param fallback (direct links / dev testing)
  if (!kgGame) {
    kgGame = {
      x: 'fasttrack:' + Date.now(),
      mode: usp.get('mode') || 'solo',
      code: (usp.get('code') || '').toUpperCase() || null,
      playerCount: parseInt(usp.get('players') || '2', 10),
      aiDifficulty: usp.get('difficulty') || 'normal',
    };
  } else if (usp.has('mode') && !kgGame.mode) {
    kgGame.mode = usp.get('mode');
  }
  // Explicit URL params for solo launches must override stale cached values.
  // Without this, a previously-cached KG_Game.playerCount sticks across every
  // new launch and ?players=N from play.html is silently ignored.
  if (usp.has('players')) {
    const n = parseInt(usp.get('players'), 10);
    if (Number.isFinite(n) && n >= 2 && n <= 6) kgGame.playerCount = n;
  }
  if (usp.has('difficulty')) {
    kgGame.aiDifficulty = usp.get('difficulty');
  }

  if (!kgPlayer && usp.has('name')) {
    kgPlayer = {
      x: decodeURIComponent(usp.get('name') || 'Player'),
      name: decodeURIComponent(usp.get('name') || 'Player'),
      avatar: decodeURIComponent(usp.get('avatar') || '🎮'),
    };
  }

  // ── 2. Determine effective mode ──
  let runtimeCache = null;
  let cachedSession = null;
  try { runtimeCache = JSON.parse(sessionStorage.getItem('kg_fasttrack_runtime') || 'null'); } catch (_) { }
  try { cachedSession = JSON.parse(sessionStorage.getItem('kg_session') || 'null'); } catch (_) { }

  const runtimeCode = String((runtimeCache && runtimeCache.game && runtimeCache.game.code) || '').toUpperCase();
  const sessionCode = String((cachedSession && cachedSession.session_code) || '').toUpperCase();
  const urlCode = String(usp.get('code') || '').toUpperCase();
  const code = String((kgGame && kgGame.code) || runtimeCode || sessionCode || urlCode || '').toUpperCase();
  if (kgGame && code && !kgGame.code) kgGame.code = code;

  // If the URL carries ?session= or ?code= (lobby launch), force live mode
  // even when stale localStorage KG_Game still says 'solo'. Without this,
  // two browsers launched from the same lobby room each run their own
  // independent offline game with bots and never rejoin the server session.
  const urlSession = String(usp.get('session') || '').trim();
  const urlCode2 = String(usp.get('code') || '').trim();
  const urlMode = String(usp.get('mode') || '').trim();
  let mode = (kgGame && kgGame.mode) || 'solo';
  if (urlMode === 'private' || urlMode === 'public' || urlMode === 'multiplayer') {
    mode = urlMode;
  } else if (urlSession || urlCode2) {
    mode = (mode === 'private' || mode === 'public' || mode === 'multiplayer') ? mode : 'public';
  }
  if (kgGame) kgGame.mode = mode;
  const isLive = (mode === 'private' || mode === 'public' || mode === 'multiplayer');

  // ── 3. Default an identity for solo / same-screen so we never get stuck ──
  function ensureLocalIdentity() {
    let name = localStorage.getItem('username');
    let avatarRaw = localStorage.getItem('kg_avatar');
    let avatarEmoji = null;
    try {
      if (avatarRaw) {
        const parsed = JSON.parse(avatarRaw);
        avatarEmoji = parsed.emoji || parsed.id;
      }
    } catch (_) { avatarEmoji = avatarRaw; }

    if (!name) {
      name = (kgPlayer && kgPlayer.name) || 'You';
      localStorage.setItem('username', name);
    }
    if (!avatarEmoji) {
      avatarEmoji = (kgPlayer && kgPlayer.avatar) || '🎮';
      localStorage.setItem('kg_avatar', JSON.stringify({ id: avatarEmoji, emoji: avatarEmoji }));
    }
    if (!kgPlayer) {
      kgPlayer = { x: name, name, avatar: avatarEmoji };
    }
  }

  // Expose early so init3D can consume even if the server call below is skipped.
  window.KG_Game = kgGame;
  window.KG_Player = kgPlayer;

  if (!isLive) {
    // Solo / same-screen / demo: no server required. Make sure we have an
    // identity, then resolve. The game core defaults missing humans/avatars
    // and fills bot slots automatically.
    ensureLocalIdentity();
    window.KG_Player = kgPlayer;
    return;
  }

  // ── 4. Live multiplayer: try to bootstrap from the server ──
  // Fast path — the lobby's onGameStarted handler already wrote the resolved
  // roster + my identity to sessionStorage before navigating. Trust that and
  // resolve immediately so init3D() is not blocked on a network round-trip
  // (this is what made guest boards stall on a black screen for several
  // seconds while the server caught up to the join).
  const cachedRosterReady =
    code &&
    runtimeCache &&
    runtimeCache.game &&
    String(runtimeCache.game.code || '').toUpperCase() === code &&
    Array.isArray(runtimeCache.players) &&
    runtimeCache.players.length >= 2;
  const cachedSessionReady =
    code &&
    cachedSession &&
    String(cachedSession.session_code || '').toUpperCase() === code &&
    Array.isArray(cachedSession.players) &&
    cachedSession.players.length >= 2;
  const haveLocalIdentity = !!(localStorage.getItem('username') && localStorage.getItem('kg_avatar'));

  if (haveLocalIdentity && (cachedRosterReady || cachedSessionReady)) {
    ensureLocalIdentity();
    window.KG_Player = kgPlayer;
    // Refresh the server view in the background so any late-joining peers /
    // server-side state changes still reach this client, but do NOT block the
    // 3D scene from initialising.
    (async () => {
      try {
        const ep = `/api/session/bootstrap?code=${encodeURIComponent(code)}`;
        let res = await fetch(ep);
        if (!res.ok && (res.status === 400 || res.status === 404)) {
          res = await fetch(`/ws/api/session/bootstrap?code=${encodeURIComponent(code)}`);
        }
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.session) {
          sessionStorage.setItem('kg_session', JSON.stringify(data.session));
        }
      } catch (_) { /* background refresh — silent */ }
    })();
    return;
  }

  const endpoint = code
    ? `/api/session/bootstrap?code=${encodeURIComponent(code)}`
    : `/api/players/me`;
  try {
    let res = await fetch(endpoint);
    if (!res.ok && (res.status === 400 || res.status === 404)) {
      const wsEndpoint = code
        ? `/ws/api/session/bootstrap?code=${encodeURIComponent(code)}`
        : `/ws/api/players/me`;
      res = await fetch(wsEndpoint);
    }
    if (!res.ok) throw new Error(`Bootstrap failed: ${res.status}`);
    const data = await res.json();
    const me = data.me || data;
    const myName = me && (me.username || me.name);
    if (myName) {
      localStorage.setItem('username', myName);
      if (window.KG_Player) window.KG_Player.x = myName;
      const myAvatar = me.avatar_id || me.avatar;
      if (myAvatar) {
        localStorage.setItem('kg_avatar', JSON.stringify({ id: myAvatar, emoji: myAvatar }));
      }
    }
    if (data.session) {
      sessionStorage.setItem('kg_session', JSON.stringify(data.session));
    }
    if (!localStorage.getItem('username') || !localStorage.getItem('kg_avatar')) {
      window.location.replace('/lobby/?game=fasttrack');
      return new Promise(() => { });
    }
  } catch (err) {
    console.warn('REST bootstrap failed', err);
    // Live mode with no recoverable code: bounce to the lobby.
    if (!code) {
      window.location.replace('/lobby/?game=fasttrack');
      return new Promise(() => { });
    }
    // We have a code but the server is unreachable; default an identity and
    // let the game initialise — it will fall back to local roster.
    ensureLocalIdentity();
    window.KG_Player = kgPlayer;
  }
})();
