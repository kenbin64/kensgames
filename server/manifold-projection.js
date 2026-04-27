/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 MANIFOLD PROJECTION — server-side projection of the four-function loop
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The lobby server is a TRANSPORT. This module is the AUTHORITY.
 *
 *   portal x  ─bloom→  game x  ─bloom→  session x  ─bloom→  player x
 *
 * Every identity (game registered, session born, player joined, game started,
 * game ended) is a bloom: a child seed appended to the seed log. The seed log
 * is the backup; the field re-derives everything else.
 *
 * Invite codes are NOT stored. They are observable: codeFromSeed(seed) is a
 * deterministic 6-char projection of the session seed onto the code alphabet.
 * Lookup by code = scan the active session frontier and observe.
 *
 * Modes (solo | private | join | auto) are intent vectors that flow through
 * solve(); the host's choice does not branch in JS, it bends the manifold.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const Field = require('../js/manifold-field.js');
const Loop = require('../js/manifold-loop.js');
const SLog = require('../js/manifold-seedlog.js');
const Codec = require('../js/manifold-codec.js');

// Mode → intent vector. Length 6 = arbitrary identity dim. Each mode bends
// the loop differently: solo aligns with self, private inverts visibility,
// join aligns with the host, auto floats with the field.
const MODE_INTENT = {
  solo: [1, 0, 0, 0, 1, 1],
  private: [0, 1, 0, 0, 1, -1],
  join: [0, 0, 1, 0, 1, 0],
  auto: [0, 0, 0, 1, 1, 0],
  public: [0, 0, 0, 1, -1, 0], // legacy alias
};

const PORTAL_ROOT = {
  id: 'portal',
  parent: null,
  dim: 0,
  seed: [1, 1, 1, 1, 1, 1],
  t: 0,
  meta: { kind: 'root' },
};

function modeIntent(mode) { return (MODE_INTENT[mode] || MODE_INTENT.auto).slice(); }
function gameSeedId(gameId) { return 'game:' + gameId; }

// 6-char invite code derived from session seed. Delegates to the shared
// codec so the FastTrack browser lens derives the same codes off the same
// seeds — one algorithm, two homes.
const codeFromSeed = Codec.codeFromSeed;

// Build a deterministic game seed from id + dimension manifest.
function makeGameSeed(gameId, dimension) {
  const code = gameId.split('').map(c => c.charCodeAt(0) / 256);
  const dim = dimension || {};
  const seed = code.concat([+dim.x || 1, +dim.y || 1, +dim.z || 1, code.length]);
  return {
    id: gameSeedId(gameId),
    parent: PORTAL_ROOT.id,
    dim: 1,
    seed: seed,
    t: Date.now(),
    meta: { kind: 'game', game_id: gameId, dimension: dim },
  };
}

// Open / hydrate the seed log; ensure portal root exists exactly once.
function load(seedLogPath) {
  const log = SLog.file(seedLogPath);
  if (!log.latestById(PORTAL_ROOT.id)) log.append(PORTAL_ROOT);
  return log;
}

// Bloom a game seed if not already present (idempotent on restart).
function ensureGame(log, gameId, dimension, name) {
  if (log.latestById(gameSeedId(gameId))) return log.latestById(gameSeedId(gameId));
  const g = makeGameSeed(gameId, dimension);
  if (name) g.meta.name = name;
  return log.append(g);
}

// Bloom a session off a game seed using mode-as-intent + per-call entropy.
// Returns the new seed x with meta tagged for later observation.
function bloomSession(log, gameId, mode, hostId, extraMeta) {
  const gx = log.latestById(gameSeedId(gameId));
  if (!gx) throw new Error('manifold-projection: unknown game ' + gameId);
  const intent = modeIntent(mode).concat([Math.random() * Field.TAU]);
  const r = Loop.cycle(gx, intent);
  r.x.meta = Object.assign({
    kind: 'session', game_id: gameId, mode: mode || 'private', host_id: hostId,
  }, extraMeta || {});
  log.append(r.x);
  return r.x;
}

// Bloom a player x off a session x. user_id hash drives intent so the same
// human re-joining the same session lands at the same player point.
function bloomPlayer(log, sessionX, identity) {
  const sx = (typeof sessionX === 'string') ? log.latestById(sessionX) : sessionX;
  if (!sx) throw new Error('manifold-projection: unknown session');
  const buf = crypto.createHash('sha256')
    .update(String(identity.user_id || identity.username || 'anon')).digest();
  const intent = [];
  for (let i = 0; i < 6; i++) intent.push(((buf[i] / 255) - 0.5) * 4);
  const r = Loop.cycle(sx, intent);
  r.x.meta = {
    kind: 'player', session_id: sx.id, user_id: identity.user_id, username: identity.username,
  };
  log.append(r.x);
  return r.x;
}

// Bloom a generic identity event (start_game, game_over, lobby_accepted…)
// off any parent x. Intent is supplied by the caller (e.g. action vector).
function bloomEvent(log, parentX, intent, meta) {
  const px = (typeof parentX === 'string') ? log.latestById(parentX) : parentX;
  if (!px) throw new Error('manifold-projection: unknown parent ' + parentX);
  const r = Loop.cycle(px, intent || [1, 0, 0, 0, 0, 0]);
  r.x.meta = Object.assign({ kind: 'event', parent_id: px.id }, meta || {});
  log.append(r.x);
  return r.x;
}

// Frontier filtered by meta.kind. The "live" set the server projects onto.
function frontier(log, kind) {
  const snap = log.snapshot();
  return kind ? snap.filter(s => s.meta && s.meta.kind === kind) : snap;
}

// Observe a session by code — pure scan, no index. "Observable, not stored."
function findSessionByCode(log, code) {
  const code6 = String(code || '').toUpperCase();
  const sessions = frontier(log, 'session');
  for (let i = 0; i < sessions.length; i++) {
    if (codeFromSeed(sessions[i].seed) === code6) return sessions[i];
  }
  return null;
}

module.exports = {
  PORTAL_ROOT, MODE_INTENT, modeIntent, gameSeedId, codeFromSeed,
  load, ensureGame, bloomSession, bloomPlayer, bloomEvent,
  frontier, findSessionByCode,
};
