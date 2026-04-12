/**
 * Portal Auth Substrate - OAuth Integration
 * ═══════════════════════════════════════════════════════════════════════════
 * Extends FastTrack auth system with social login (Facebook, Google, Discord)
 * Bridges OAuth providers → Portal user profiles
 */

const AuthPortalSubstrate = (() => {
  const _state = new Map();
  const _listeners = new Map();
  let _currentUser = null;
  let _sessionToken = null;

  // OAuth Configuration
  // Set real IDs via window.KENSGAMES_CONFIG.oauth before this script loads,
  // or they will fall back to guest login mode automatically.
  const _extCfg = (typeof window !== 'undefined' && window.KENSGAMES_CONFIG && window.KENSGAMES_CONFIG.oauth) || {};
  const OAUTH_CONFIG = {
    facebook: {
      clientId: _extCfg.facebookAppId || '',
      redirectUri: `${typeof window !== 'undefined' ? window.location.origin : ''}/login/facebook/callback.html`,
      scope: ['public_profile', 'email']
    },
    google: {
      clientId: _extCfg.googleClientId || '',
      redirectUri: `${typeof window !== 'undefined' ? window.location.origin : ''}/login/google/callback.html`,
      scope: ['profile', 'email']
    },
    discord: {
      clientId: _extCfg.discordClientId || '',
      redirectUri: `${typeof window !== 'undefined' ? window.location.origin : ''}/login/discord/callback.html`,
      scope: ['identify', 'email', 'guilds']
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // OAuth Flow
  // ═══════════════════════════════════════════════════════════════════════════

  const initiateOAuth = (provider) => {
    if (!OAUTH_CONFIG[provider]) {
      console.error(`Unknown OAuth provider: ${provider}`);
      return;
    }

    const config = OAUTH_CONFIG[provider];
    const state = Math.random().toString(36).substring(7);
    sessionStorage.setItem(`oauth_state_${provider}`, state);

    let authUrl = '';
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scope.join(' '),
      state: state
    });

    if (provider === 'facebook') {
      authUrl = `https://www.facebook.com/v18.0/dialog/oauth?${params}`;
    } else if (provider === 'google') {
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    } else if (provider === 'discord') {
      authUrl = `https://discord.com/api/oauth2/authorize?${params}`;
    }

    window.location.href = authUrl;
  };

  /**
   * Handle OAuth callback (called from /login/[provider]/callback pages)
   */
  const handleOAuthCallback = async (provider, authCode, state) => {
    // Verify state matches
    const savedState = sessionStorage.getItem(`oauth_state_${provider}`);
    if (state !== savedState) {
      emit('error', { message: 'Invalid OAuth state' });
      return null;
    }

    try {
      // Exchange auth code for user data
      const response = await fetch('/api/auth/oauth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, code: authCode })
      });

      const data = await response.json();

      if (data.success) {
        _currentUser = data.user;
        _sessionToken = data.sessionToken;
        _state.set('currentUser', _currentUser);
        _state.set('sessionToken', _sessionToken);

        emit('login', { user: _currentUser });
        sessionStorage.removeItem(`oauth_state_${provider}`);
        return _currentUser;
      } else {
        emit('error', { message: data.error || 'OAuth failed' });
        return null;
      }
    } catch (error) {
      emit('error', { message: error.message });
      return null;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // User Management
  // ═══════════════════════════════════════════════════════════════════════════

  const getCurrentUser = () => _currentUser;

  const setDisplayName = (displayName) => {
    if (!_currentUser) {
      console.warn('No user logged in');
      return false;
    }

    _currentUser.displayName = displayName;
    _state.set('currentUser', _currentUser);

    // Persist to backend
    fetch('/api/auth/profile/displayName', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${_sessionToken}`
      },
      body: JSON.stringify({ displayName })
    }).catch(err => console.error('Failed to save display name:', err));

    emit('userUpdated', { user: _currentUser });
    return true;
  };

  const setAvatar = (avatarId) => {
    if (!_currentUser) {
      console.warn('No user logged in');
      return false;
    }

    _currentUser.avatar = avatarId;
    _state.set('currentUser', _currentUser);

    // Persist to backend
    fetch('/api/auth/profile/avatar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${_sessionToken}`
      },
      body: JSON.stringify({ avatarId })
    }).catch(err => console.error('Failed to save avatar:', err));

    emit('userUpdated', { user: _currentUser });
    return true;
  };

  const logout = () => {
    _currentUser = null;
    _sessionToken = null;
    _state.clear();
    sessionStorage.removeItem('sessionToken');
    emit('logout', {});
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Leaderboard & Stats
  // ═══════════════════════════════════════════════════════════════════════════

  const submitGameResults = async (gameId, score, metadata = {}) => {
    if (!_currentUser || !_sessionToken) {
      console.warn('Cannot submit score: not logged in');
      return false;
    }

    try {
      const response = await fetch('/api/leaderboards/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${_sessionToken}`
        },
        body: JSON.stringify({
          gameId,
          userId: _currentUser.id,
          score,
          metadata,
          timestamp: Date.now()
        })
      });

      const data = await response.json();
      if (data.success) {
        emit('scoreSubmitted', { gameId, score, rank: data.rank });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Score submission failed:', error);
      return false;
    }
  };

  const getLeaderboard = async (gameId, limit = 100) => {
    try {
      const response = await fetch(`/api/leaderboards/${gameId}?limit=${limit}`);
      const data = await response.json();
      return data.leaderboard || [];
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
      return [];
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Event System
  // ═══════════════════════════════════════════════════════════════════════════

  const on = (event, callback) => {
    if (!_listeners.has(event)) {
      _listeners.set(event, []);
    }
    const id = Math.random().toString(36);
    _listeners.get(event).push({ id, callback });
    return id;
  };

  const off = (id) => {
    for (const [event, handlers] of _listeners) {
      _listeners.set(event, handlers.filter(h => h.id !== id));
    }
  };

  const emit = (event, data) => {
    if (_listeners.has(event)) {
      _listeners.get(event).forEach(({ callback }) => callback(data));
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // REST API Initialization
  // ═══════════════════════════════════════════════════════════════════════════

  const init = async () => {
    // Check if user is already authenticated (session token in storage)
    const stored = sessionStorage.getItem('sessionToken');
    if (stored) {
      _sessionToken = stored;

      try {
        const response = await fetch('/api/auth/validate', {
          headers: { 'Authorization': `Bearer ${_sessionToken}` }
        });

        const data = await response.json();
        if (data.user) {
          _currentUser = data.user;
          _state.set('currentUser', _currentUser);
          emit('restored', { user: _currentUser });
          return true;
        }
      } catch (error) {
        console.warn('Session restore failed:', error);
        sessionStorage.removeItem('sessionToken');
      }
    }

    return false;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    // OAuth
    initiateOAuth,
    handleOAuthCallback,

    // User Management
    getCurrentUser,
    setDisplayName,
    setAvatar,
    logout,

    // Leaderboards
    submitGameResults,
    getLeaderboard,

    // Events
    on,
    off,
    emit,

    // Lifecycle
    init
  };
})();

// Init on page load
// Browser + Node dual export
if (typeof window !== 'undefined') window.AuthPortalSubstrate = AuthPortalSubstrate;
if (typeof module !== 'undefined') module.exports = AuthPortalSubstrate;

// Auto-init (browser only)
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AuthPortalSubstrate.init());
  } else {
    AuthPortalSubstrate.init();
  }
}
