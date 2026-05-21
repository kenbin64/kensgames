// X-Dimensional Bootstrap: resolve Game and Player identities before init.
    //
    // KG_Game  { x, mode, code?, playerCount, aiDifficulty }  — outer Russian Doll
    // KG_Player{ x, name, avatar }                            — next level down
    //
    // Both have an identity-x so either can be reached directly without
    // traversing the tree.  URL params are accepted as a legacy fallback only.
    window.KG_BOOTSTRAP_PROMISE = (async function () {
      // Resolve Game object — prefer localStorage, fall back to URL params
      let kgGame = null;
      let kgPlayer = null;
      try { kgGame = JSON.parse(localStorage.getItem('KG_Game') || 'null'); } catch (_) { }
      try { kgPlayer = JSON.parse(localStorage.getItem('KG_Player') || 'null'); } catch (_) { }

      // Legacy URL-param fallback (direct links, dev testing)
      const usp = new URLSearchParams(location.search);
      if (!kgGame && usp.has('mode')) {
        kgGame = {
          x: 'fasttrack:' + Date.now(),
          mode: usp.get('mode') || 'solo',
          code: usp.get('code') || null,
          playerCount: parseInt(usp.get('players') || '2', 10),
          aiDifficulty: usp.get('difficulty') || 'normal',
        };
      }
      if (!kgPlayer && usp.has('name')) {
        kgPlayer = {
          x: decodeURIComponent(usp.get('name') || 'Player'),
          name: decodeURIComponent(usp.get('name') || 'Player'),
          avatar: decodeURIComponent(usp.get('avatar') || '🎮'),
        };
      }

      // Expose on window so init3D can consume them without re-reading storage
      window.KG_Game = kgGame;
      window.KG_Player = kgPlayer;

      const code = kgGame && kgGame.code;
      const endpoint = code
        ? `/api/session/bootstrap?code=${encodeURIComponent(code)}`
        : `/api/players/me`;
      try {
        let res = await fetch(endpoint);
        // Safety fallback for environments that only expose lobby APIs behind /ws.
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
          // Patch KG_Player identity with server-confirmed name
          if (window.KG_Player) window.KG_Player.x = myName;
          const myAvatar = me.avatar_id || me.avatar;
          if (myAvatar) {
            localStorage.setItem('kg_avatar', JSON.stringify({ id: myAvatar, emoji: myAvatar }));
          }
        }

        // If still no identity, return to lobby
        if (!localStorage.getItem('username') || !localStorage.getItem('kg_avatar')) {
          window.location.replace('/fasttrack/lobby-simple.html');
          return new Promise(() => { });
        }

        if (data.session) {
          sessionStorage.setItem('kg_session', JSON.stringify(data.session));
        }
      } catch (err) {
        console.warn('REST bootstrap failed', err);
        sessionStorage.removeItem('kg_session');
        if (!localStorage.getItem('username') || !localStorage.getItem('kg_avatar')) {
          window.location.replace('/fasttrack/lobby-simple.html');
          return new Promise(() => { });
        }
      }
    })();
