/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KENSGAMES — GAME MANAGER (manifold-backed)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dimensional mapping:
 *   0D atom      → a single placement / eat / hit
 *   1D combo     → a line of atoms (seq | set | count | score)
 *   2D scenario  → a plane of combos bound by a win rule
 *   3D game      → a session instance bound to one scenario
 *   4D history   → D5 STACK action log (tetracube sessions.actions)
 *
 * No authoritative state lives in this process. Every read/write goes to
 * TetracubeDB via the adapter's SessionStore / raw client. Game-specific
 * shape matching (board geometry) is delegated to registered adapters so
 * the manager itself stays substrate-agnostic.
 */
'use strict';

const fs = require('fs');
const path = require('path');

let _stores = null;
try { _stores = require('./tetracube_adapter'); }
catch (e) { console.warn('[game_manager] tetracube_adapter unavailable:', e.message); }

const SCENARIOS_FILE = path.join(__dirname, '..', 'shared', 'scenarios.json');
const _shapeAdapters = new Map();   // gameId → { matchSeq, matchSet, countAtoms }

function registerGameAdapter(gameId, adapter) {
  _shapeAdapters.set(gameId, adapter);
}

async function _scenarioCell(scenarioId) {
  if (!_stores) return null;
  try { return await _stores.tetracube.getRow('scenarios', scenarioId); }
  catch { return null; }
}

async function seedScenarios() {
  let catalog;
  try { catalog = JSON.parse(fs.readFileSync(SCENARIOS_FILE, 'utf8')); }
  catch (e) { console.error('[game_manager] scenarios.json read failed:', e.message); return { ok: false }; }
  if (!_stores) return { ok: false, reason: 'no-tetracube' };

  const results = [];
  for (const sc of (catalog.scenarios || [])) {
    try {
      await _stores.tetracube.setRow('scenarios', sc.id, sc);
      results.push({ id: sc.id, ok: true });
    } catch (e) {
      results.push({ id: sc.id, ok: false, err: e.message });
    }
  }
  console.log(`[game_manager] seeded ${results.filter(r => r.ok).length}/${results.length} scenarios`);
  return { ok: true, results };
}

async function listScenarios(gameId) {
  if (!_stores) return _localCatalog(gameId);
  try {
    const plane = await _stores.tetracube.scanTable('scenarios', { limit: 500 });
    const rows = (plane.rows || []).map(r => r.value).filter(Boolean);
    return gameId ? rows.filter(s => s.gameId === gameId) : rows;
  } catch {
    return _localCatalog(gameId);
  }
}

function _localCatalog(gameId) {
  try {
    const cat = JSON.parse(fs.readFileSync(SCENARIOS_FILE, 'utf8'));
    return gameId ? cat.scenarios.filter(s => s.gameId === gameId) : cat.scenarios;
  } catch { return []; }
}

async function getScenario(scenarioId) {
  const fromCell = await _scenarioCell(scenarioId);
  if (fromCell) return fromCell;
  const local = _localCatalog().find(s => s.id === scenarioId);
  return local || null;
}

async function createGame({ gameId, scenarioId, hostId, opts = {} }) {
  const scenario = await getScenario(scenarioId);
  if (!scenario) throw new Error(`unknown scenario: ${scenarioId}`);
  if (scenario.gameId !== gameId) throw new Error(`scenario ${scenarioId} is not for ${gameId}`);

  const sessionId = opts.sessionId || `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const session = {
    session_id: sessionId,
    game_id: gameId,
    scenario_id: scenarioId,
    scenario,
    host_id: hostId,
    players: opts.players || [{ user_id: hostId, is_host: true, score: 0, progress: {} }],
    max_players: opts.maxPlayers || (scenario.constraints && scenario.constraints.maxPlayers) || 2,
    status: 'waiting',
    created_at: Date.now(),
    settings: opts.settings || {},
  };

  if (_stores) await _stores.SessionStore.create(sessionId, session);
  return session;
}

async function applyAction(sessionId, action) {
  if (!_stores) throw new Error('tetracube unavailable');
  const session = await _stores.SessionStore.get(sessionId);
  if (!session) throw new Error(`session not found: ${sessionId}`);

  // Allow the game's shape adapter to resolve / complete the action
  // (e.g. 4dconnect fills in landing gy from the column placements).
  const adapter = _shapeAdapters.get(session.game_id);
  const resolved = (adapter && adapter.resolveAction)
    ? (adapter.resolveAction(session, action) || action)
    : action;

  await _stores.SessionStore.pushAction(sessionId, { ...resolved, ts: Date.now() });
  const progress = _accumulate(session, resolved);
  await _stores.SessionStore.update(sessionId, { progress });

  const win = await evaluateWin(sessionId, { ...session, progress });
  if (win) {
    await _stores.SessionStore.update(sessionId, { status: 'finished', winner: win });
    if (_stores.LeaderboardStore && win.playerId && typeof win.score === 'number') {
      await _stores.LeaderboardStore.submitScore(session.game_id, win.playerId, win.score);
    }
  }
  return { action: resolved, progress, win };
}

/**
 * Mirror an in-memory lobby session into the tetracube manifold so that
 * apply_action has the authoritative record to read from. Safe to call
 * multiple times; no-op when the scenario can't be resolved.
 */
async function seedSession(lobbySession) {
  if (!_stores || !lobbySession) return null;
  const sid = lobbySession.session_id;
  const scenarioId = (lobbySession.settings && lobbySession.settings.scenario_id) || null;
  if (!sid || !scenarioId) return null;
  const scenario = await getScenario(scenarioId);
  if (!scenario || scenario.gameId !== lobbySession.game_id) return null;

  const cellSession = {
    session_id: sid,
    game_id: lobbySession.game_id,
    scenario_id: scenarioId,
    scenario,
    host_id: lobbySession.host_id,
    players: (lobbySession.players || []).map(p => ({
      user_id: p.user_id, username: p.username, slot: p.slot,
      is_host: !!p.is_host, is_ai: !!p.is_ai,
    })),
    max_players: lobbySession.max_players,
    status: 'playing',
    settings: lobbySession.settings || {},
    progress: {},
    created_at: lobbySession.created_at || Date.now(),
  };
  try { await _stores.SessionStore.create(sid, cellSession); return cellSession; }
  catch (e) { console.warn('[game_manager] seedSession failed:', e.message); return null; }
}

function _accumulate(session, action) {
  const prev = session.progress || {};
  const pid = action.playerId || action.user_id;
  if (!pid) return prev;
  const p = prev[pid] || { atoms: {}, score: 0, placements: [] };
  if (action.atom) p.atoms[action.atom] = (p.atoms[action.atom] || 0) + 1;
  if (typeof action.score === 'number') p.score += action.score;
  if (action.cell) p.placements.push(action.cell);
  prev[pid] = p;
  return prev;
}

async function evaluateWin(sessionId, sessionMaybe) {
  const session = sessionMaybe || (_stores ? await _stores.SessionStore.get(sessionId) : null);
  if (!session || !session.scenario) return null;
  const sc = session.scenario;
  const adapter = _shapeAdapters.get(session.game_id);

  for (const player of (session.players || [])) {
    const prog = (session.progress && session.progress[player.user_id]) || { atoms: {}, score: 0, placements: [] };
    for (const combo of (sc.combos || [])) {
      const hit = _matchCombo(combo, prog, player, session, adapter);
      if (hit && sc.winRule === 'first_combo') return { playerId: player.user_id, combo: combo.id, score: prog.score };
      if (hit && sc.winRule === 'reach_score' && prog.score >= (sc.constraints && sc.constraints.targetScore || Infinity))
        return { playerId: player.user_id, combo: combo.id, score: prog.score };
    }
  }
  if (sc.winRule === 'most_score' && _boardComplete(session, adapter)) {
    const ranked = (session.players || []).map(p => ({ pid: p.user_id, score: ((session.progress || {})[p.user_id] || {}).score || 0 })).sort((a, b) => b.score - a.score);
    if (ranked.length && (ranked.length === 1 || ranked[0].score > ranked[1].score)) return { playerId: ranked[0].pid, score: ranked[0].score };
  }
  return null;
}

function _matchCombo(combo, prog, player, session, adapter) {
  if (combo.pattern === 'count') {
    const total = (combo.atoms || []).reduce((s, a) => s + (prog.atoms[a] || 0), 0);
    return total >= (combo.count || 0);
  }
  if (combo.pattern === 'score') return prog.score >= (combo.score || 0);
  if (combo.pattern === 'seq' && adapter && adapter.matchSeq) return !!adapter.matchSeq(session, player.user_id, combo);
  if (combo.pattern === 'set' && adapter && adapter.matchSet) return !!adapter.matchSet(session, player.user_id, combo);
  return false;
}

function _boardComplete(session, adapter) {
  if (adapter && adapter.boardFull) return !!adapter.boardFull(session);
  return false;
}

module.exports = {
  registerGameAdapter,
  seedScenarios,
  listScenarios,
  getScenario,
  createGame,
  seedSession,
  applyAction,
  evaluateWin,
};
