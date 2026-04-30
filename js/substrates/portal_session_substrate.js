/**
 * ═══════════════════════════════════════════════════════════════════
 * 🜂 PORTAL SESSION SUBSTRATE  v1.0
 * js/substrates/portal_session_substrate.js
 *
 * Expresses the portal's player session through the manifold.
 * z = x · y governs every derived session property.
 *
 * Axes:
 *   x = player identity seed (deterministic hash of username)
 *   y = session modifier (time-of-day * auth level, normalised)
 *   z = session_state (derived: never stored independently)
 *
 * Lenses:
 *   PlayerLens     (identity_seed   × session_factor) → session_strength
 *   PresenceLens   (players_online  × game_activity)  → lobby_energy
 *   GameCardLens   (game_x          × game_y)         → card_bloom
 *   AvatarLens     (identity_seed   × avatar_index)   → avatar_resonance
 * ═══════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  const M = () => global.Manifold;

  // ── Stable identity seed from a string (FNV-1a 32-bit) ──────────
  function hashSeed(str) {
    if (!str) return 1;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    // Normalise to [0.01, 1.0] so x is never zero (void crossing = r=1)
    return 0.01 + (h / 0xFFFFFFFF) * 0.99;
  }

  // ── Session modifier: normalised time + auth weight ──────────────
  function sessionModifier(authLevel) {
    const hour = new Date().getUTCHours();
    // Peak hours 18-23 UTC = 1.0; off-peak = ~0.3
    const timeFactor = 0.3 + 0.7 * Math.max(0, Math.sin(((hour - 6) / 24) * Math.PI));
    const authWeight = authLevel === 'superuser' ? 1.0
      : authLevel === 'admin' ? 0.85
      : authLevel === 'user' ? 0.6
      : 0.3; // anonymous
    return Math.min(1, timeFactor * 0.5 + authWeight * 0.5);
  }

  // ════════════════════════════════════════════════════════════════
  // LENS 1 — PlayerLens: identity × session_factor → session_strength
  // ════════════════════════════════════════════════════════════════
  const PlayerLens = {
    focus(username, authLevel) {
      if (!M()) return 0;
      const x = hashSeed(username);
      const y = sessionModifier(authLevel);
      // z = x · y (linear; no quadratic here — identity is primary)
      const z = x * y;
      // Register the player as a manifold point in region 'portal'
      M().put(`player:${username}`, x, y, 'portal');
      return z;
    }
  };

  // ════════════════════════════════════════════════════════════════
  // LENS 2 — PresenceLens: players_online × game_activity → lobby_energy
  // ════════════════════════════════════════════════════════════════
  const PresenceLens = {
    MAX_PLAYERS: 100,
    focus(onlineCount, activeGameCount) {
      const x = Math.min(1, (onlineCount || 0) / this.MAX_PLAYERS);
      const y = Math.min(1, 0.2 + ((activeGameCount || 0) / 20) * 0.8);
      const z = x * y;
      if (M()) M().put('portal:presence', x, y, 'portal');
      return z;  // 0 = empty lobby; 1 = full house
    }
  };

  // ════════════════════════════════════════════════════════════════
  // LENS 3 — GameCardLens: game manifold dimensions → card bloom
  // Reads dimension.x and dimension.y from the registry entry and
  // derives a bloom factor for the game card visual intensity.
  // ════════════════════════════════════════════════════════════════
  const GameCardLens = {
    NORM_X: 5,    // normalise x axis (max players meaningful = 5)
    NORM_Y: 60,   // normalise y axis (max session minutes = 60)
    focus(gameEntry) {
      if (!gameEntry?.dimension) return 0.5;
      const x = Math.min(1, (gameEntry.dimension.x || 1) / this.NORM_X);
      const y = Math.min(1, (gameEntry.dimension.y || 1) / this.NORM_Y);
      const z = x * y;
      if (M()) M().put(`game:${gameEntry.id}`, x, y, 'portal');
      return z;  // drives card glow amplitude in arcade.js
    }
  };

  // ════════════════════════════════════════════════════════════════
  // LENS 4 — AvatarLens: identity_seed × avatar_index → resonance
  // Gives each player/avatar combination a unique visual resonance
  // frequency that drives their avatar's glow color in the portal.
  // ════════════════════════════════════════════════════════════════
  const AvatarLens = {
    AVATAR_COUNT: 32,
    focus(username, avatarIndex) {
      const x = hashSeed(username);
      const y = 0.1 + (((avatarIndex || 0) % this.AVATAR_COUNT) / this.AVATAR_COUNT) * 0.9;
      return x * y;  // drives hue rotation in HSL space [0,1] → [0°,360°]
    }
  };

  // ════════════════════════════════════════════════════════════════
  // PUBLIC API — window.PortalSessionSubstrate
  // ════════════════════════════════════════════════════════════════
  const PortalSessionSubstrate = {
    /**
     * Call when a player signs in or the session is restored.
     * Returns session_strength z ∈ [0,1].
     */
    onSignIn(username, role) {
      const z = PlayerLens.focus(username, role);
      window.dispatchEvent(new CustomEvent('manifold:session', {
        detail: { event: 'sign-in', username, sessionStrength: z }
      }));
      return z;
    },

    /**
     * Call on each lobby update tick.
     * Returns lobby_energy z ∈ [0,1].
     */
    updatePresence(onlineCount, activeGameCount) {
      return PresenceLens.focus(onlineCount, activeGameCount);
    },

    /**
     * Derive bloom factor for a game card from registry entry.
     * Returns z ∈ [0,1] — drives CSS glow amplitude.
     */
    cardBloom(gameEntry) {
      return GameCardLens.focus(gameEntry);
    },

    /**
     * Derive avatar resonance (hue offset) for a player.
     * Returns z ∈ [0,1] — multiply by 360 for CSS hue-rotate degrees.
     */
    avatarResonance(username, avatarIndex) {
      return AvatarLens.focus(username, avatarIndex);
    },

    /** Apply avatar resonance as a CSS hue-rotate to an element. */
    applyAvatarResonance(el, username, avatarIndex) {
      if (!el) return;
      const resonance = this.avatarResonance(username, avatarIndex);
      el.style.filter = `hue-rotate(${Math.round(resonance * 360)}deg) drop-shadow(0 0 6px currentColor)`;
    },
  };

  global.PortalSessionSubstrate = PortalSessionSubstrate;

  // Announce readiness
  window.dispatchEvent(new CustomEvent('manifold:substrate-ready', {
    detail: { game: 'portal', lenses: 4 }
  }));

})(typeof window !== 'undefined' ? window : global);
