'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 GAME KERNEL — lobby router
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Bridges the existing lobby-server.js to the per-game kernel rules.
 * Opt-in by gameId via the GAME_REGISTRY map below; any gameId not present
 * falls through and the lobby keeps using its current relay/PlayerManager
 * pipeline (zero behavior change for unmodified games).
 *
 * Lifecycle:
 *   start(session, ctx)   → instantiate a GameMaster bound to the session
 *   handle(session, ws, data, conn) → route a game_action through the kernel
 *                                     returns true if handled, false to fall through
 *   stop(sessionId)       → tear down (called from start_game cleanup / game_over)
 *   detachPeer(ws, conn)  → mark a player disconnected (no kernel state lost)
 *
 * The lobby owns transport (ws), identity (conn.user_id), and broadcast.
 * The kernel owns rule validation, score/lives derivation, and AI ticking.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const { GameMaster, channels, registerRules } = require('./index.js');
const BB3D = require('./games/brickbreaker3d.rules.js');
const { createBrickBreakerAI } = require('./games/brickbreaker3d.ai.js');
const T4 = require('./games/4dtictactoe.rules.js');
const FT = require('./games/fasttrack.rules.js');
const SF = require('./games/starfighter.rules.js');
const BBM = require('./games/brickbreaker3d-multi.rules.js');

// Register all kernel-managed games at load time.
registerRules(BB3D);
registerRules(T4);
registerRules(FT);
registerRules(SF);
registerRules(BBM);

/**
 * GAME_REGISTRY[gameId] = {
 *   rules:       GameRules module
 *   modeFor:     (session) => string   resolve mode from session settings
 *   aiFactory:   (player, session) => AIController | null
 *   minPlayers:  number   minimum to start (overrides lobby default if smaller)
 * }
 */
const GAME_REGISTRY = {
  brickbreaker3d: {
    rules: BB3D,
    modeFor: (session) => {
      // Honor session.settings.mode if set; otherwise infer from player makeup.
      const explicit = session && session.settings && session.settings.mode;
      if (explicit === 'solo' || explicit === 'solo_vs_bot') return explicit;
      const humans = (session.players || []).filter((p) => !p.is_ai).length;
      const ais = (session.players || []).filter((p) => p.is_ai).length;
      if (humans === 1 && ais === 0) return 'solo';
      if (humans === 1 && ais === 1) return 'solo_vs_bot';
      // Multi-human falls through to brickbreaker3d_multi entry below.
      return null;
    },
    aiFactory: (player, session) => {
      if (!player.isAI) return null;
      const diff = (session && session.settings && session.settings.ai_difficulty) || 'normal';
      return createBrickBreakerAI({ difficulty: diff });
    },
    minPlayers: 1,
  },

  brickbreaker3d_multi: {
    rules: BBM,
    modeFor: (session) => {
      const humans = (session.players || []).filter((p) => !p.is_ai).length;
      return humans >= 2 ? 'multi' : null;
    },
    aiFactory: () => null,
    minPlayers: 2,
  },

  starfighter: {
    rules: SF,
    modeFor: () => 'dogfight',
    aiFactory: () => null, // ANPC bots already client-side; can re-route later
    minPlayers: 2,
  },

  '4dtictactoe': {
    rules: T4,
    modeFor: (session) => {
      // Scenario stored as session.settings.scenario; only 'classic' supported
      // in this slice. Returning a non-null marker enables the kernel.
      const scenario = (session && session.settings && session.settings.scenario) || 'classic';
      return scenario === 'classic' ? 'classic' : null;
    },
    aiFactory: () => null, // no AI in this first slice
    minPlayers: 2,
  },

  fasttrack: {
    rules: FT,
    modeFor: (session) => {
      // Default variant for this kernel slice. Other variants (5-card, 2-dice)
      // are intentionally not implemented — return null to fall through.
      const variant = (session && session.settings && session.settings.variant) || 'standard';
      return variant === 'standard' ? 'standard' : null;
    },
    aiFactory: () => null, // FastTrack AI not in this slice
    minPlayers: 2,
  },
};

// sessionId → { gm, gameId, channelsByUser: Map<userId, channel> }
const _active = new Map();

function isKernelGame(gameId) {
  return !!GAME_REGISTRY[String(gameId || '').toLowerCase()];
}

function minPlayers(gameId) {
  const reg = GAME_REGISTRY[String(gameId || '').toLowerCase()];
  return reg ? reg.minPlayers : 2;
}

/**
 * Look up a player's live ws by user_id. The lobby's `connections` map is
 * peer→conn; we invert it on demand because peers are short-lived.
 */
function findWsForUser(connections, userId, sessionId) {
  for (const [ws, conn] of connections.entries()) {
    if (conn && conn.user_id === userId && conn.session_x_id === sessionId) return ws;
  }
  return null;
}

/**
 * Start the kernel for a session. Called from handlers.start_game when
 * status flips to 'playing'.
 *
 * @returns { gm } | null   null if the gameId isn't kernel-managed or the
 *                          mode can't be resolved.
 */
function start(session, ctx) {
  const gameKey = String(session.game_id || '').toLowerCase();
  let reg = GAME_REGISTRY[gameKey];
  if (!reg) return null;
  if (_active.has(session.session_id)) return _active.get(session.session_id);

  let mode = reg.modeFor(session);
  // Fall-through: BB3D solo registry returns null for multi-human sessions;
  // route those to the multi-paddle ruleset under the same game_id.
  if (!mode && gameKey === 'brickbreaker3d' && GAME_REGISTRY.brickbreaker3d_multi) {
    const multiReg = GAME_REGISTRY.brickbreaker3d_multi;
    const multiMode = multiReg.modeFor(session);
    if (multiMode) { reg = multiReg; mode = multiMode; }
  }
  if (!mode) return null;

  const players = session.players.map((p) => ({
    id: String(p.user_id),
    name: String(p.username || ''),
    isAI: !!p.is_ai,
    slot: p.slot,
  }));

  // Build a channel per player. Humans get a wsChannel-like adapter wired
  // to ctx.broadcastSession (so other players see state too); AIs get local.
  const channelsByUser = new Map();
  const playerChannels = players.map((p) => {
    if (p.isAI) {
      const ch = channels.localChannel(p.id);
      // AI inbound is unused (server pushes state via outbound only); we
      // capture outbound so AI can read state via `getVisibleState` callback.
      channelsByUser.set(p.id, ch);
      return ch;
    }
    // Human: build a thin channel that bridges into the lobby's send/broadcast.
    // We wrap every kernel-emitted message under a single 'kernel_state'
    // envelope so the client gets one stable event regardless of the inner
    // type (state, turn, game_over, …).
    const ch = {
      id: p.id,
      _handlers: { msg: [], close: [] },
      send(msg) {
        const ws = findWsForUser(ctx.connections, p.id, session.session_id);
        if (ws) ctx.send(ws, {
          type: 'kernel_state',
          session_id: session.session_id,
          payload: msg,
        });
      },
      onMessage(h) { if (typeof h === 'function') ch._handlers.msg.push(h); },
      onClose(h) { if (typeof h === 'function') ch._handlers.close.push(h); },
      close() { for (const h of ch._handlers.close) { try { h(); } catch (_) { } } },
    };
    channelsByUser.set(p.id, ch);
    return ch;
  });

  const gm = new GameMaster({
    rules: reg.rules,
    players,
    channels: playerChannels,
    aiFactory: (p) => reg.aiFactory(p, session),
    persist: (action) => {
      // Best-effort seed-log append: the lobby owns the seed log.
      // We delegate via ctx.persistAction so this module stays I/O-free.
      if (typeof ctx.persistAction === 'function') {
        try { ctx.persistAction(session, action); } catch (_) { }
      }
    },
    meta: {
      mode,
      sessionId: session.session_id,
      sessionCode: session.session_code,
    },
  });

  _active.set(session.session_id, { gm, gameId: session.game_id, channelsByUser });
  return { gm };
}

/**
 * Route an inbound `game_action` through the kernel. Returns true ONLY when
 * the client explicitly opted into the kernel protocol via a `data.kernel`
 * envelope. Legacy peer-to-peer `game_action` traffic (e.g. 4DTicTacToe's
 * `{ action: 'move', payload: {gx,gy,gz,p} }`) falls through to the lobby's
 * existing relay so games that haven't migrated to kernel actions yet keep
 * working unchanged.
 *
 * Migration contract for client opt-in:
 *   client.send({ type: 'game_action', kernel: { type: '<action>', payload: {…} } })
 */
function handle(session, ws, data, conn) {
  const entry = _active.get(session.session_id);
  if (!entry) return false;

  // Only intercept explicit kernel opt-in messages. Anything else falls
  // through to the lobby relay (backward compatibility).
  if (!data || typeof data !== 'object') return false;
  if (!data.kernel || typeof data.kernel !== 'object') return false;

  const ch = entry.channelsByUser.get(String(conn.user_id));
  if (!ch || !ch._handlers) return false;

  const kernelMsg = data.kernel;
  if (!kernelMsg || typeof kernelMsg.type !== 'string') return true; // malformed — swallow

  // Fan out to handlers (GameMaster wired one).
  for (const h of ch._handlers.msg) {
    try { h(kernelMsg); } catch (_) { }
  }
  return true;
}

/**
 * Tear down a kernel session. Called from handlers.game_over and lobby cleanup.
 */
function stop(sessionId) {
  const entry = _active.get(sessionId);
  if (!entry) return false;
  try { entry.gm.close(); } catch (_) { }
  _active.delete(sessionId);
  return true;
}

/** Mark a player's channel disconnected (non-fatal — game continues). */
function detachPeer(ws, conn) {
  if (!conn || !conn.session_x_id) return;
  const entry = _active.get(conn.session_x_id);
  if (!entry) return;
  const ch = entry.channelsByUser.get(String(conn.user_id));
  if (ch && ch._handlers && Array.isArray(ch._handlers.close)) {
    for (const h of ch._handlers.close) { try { h(); } catch (_) { } }
  }
}

function getActive(sessionId) {
  const e = _active.get(sessionId);
  return e ? { gameId: e.gameId, gm: e.gm } : null;
}

module.exports = {
  isKernelGame,
  minPlayers,
  start,
  handle,
  stop,
  detachPeer,
  getActive,
  GAME_REGISTRY,
};
