// AI Broker — server-side substrate fulfilling HR-31 roles for the shared
// game manager. Single entry point: createBroker(opts) -> { invoke, ... }.
//
// Contract:
//   broker.invoke({ role, gameId, sessionId, phase, isRealtimeTick, input,
//                   provider, persona })
//     -> { source, result, latencyMs, usage, provider, persona, role }
//
// Guarantees:
//   - Never blocks the realtime tick (HR-33). Callers tag isRealtimeTick.
//   - Heuristic fallback runs on timeout/provider error so the manager never
//     stalls (HR-21 liveness).
//   - All responses carry transparency metadata (HR-35).
//   - Tokens counted; per-session and per-day ceilings enforced.
'use strict';

const { loadConfig } = require('./config');
const { ROLE_SPECS, isValidRole, assertPhase, assertNotInTick } = require('./roles');
const { createCeilingTracker, callWithFallback } = require('./safety');
const { createRegistry, createDefaultRegistry, heuristic } = require('./providers');
const { describeAiPeer } = require('./transparency');

function createBroker(opts) {
  const options = opts || {};
  const config = options.config || loadConfig();
  const registry = options.registry || createDefaultRegistry(config);
  const ceilings = createCeilingTracker(config.safety);
  const onLog = typeof options.onLog === 'function' ? options.onLog : null;

  if (Array.isArray(options.providers)) {
    for (const p of options.providers) registry.register(p);
  }

  function log(entry) {
    if (onLog) {
      try { onLog(entry); } catch (_) { /* swallow */ }
    }
  }

  function resolveProvider(requested) {
    const id = requested || config.defaultProvider || heuristic.name;
    const p = registry.get(id);
    if (p) return p;
    return registry.get(heuristic.name);
  }

  async function invoke(call) {
    const role = call && call.role;
    if (!isValidRole(role)) throw new Error('ai-broker: invalid role ' + role);
    assertNotInTick(role, !!(call && call.isRealtimeTick));
    if (call && call.phase) assertPhase(role, call.phase);

    const sessionId = call.sessionId || null;
    const projected = (call.projectedTokens != null) ? call.projectedTokens : 256;
    const ceilingCheck = ceilings.check(sessionId, projected);
    if (!ceilingCheck.ok) {
      log({ kind: 'ceiling_block', role, sessionId, reason: ceilingCheck.reason });
    }

    const provider = (ceilingCheck.ok ? resolveProvider(call.provider) : registry.get(heuristic.name));
    const persona = call.persona || { name: config.transparency.defaultPersona };

    const primary = () => provider.invoke(role, call.input || {});
    const fallback = config.safety.heuristicFallback
      ? () => registry.get(heuristic.name).invoke(role, call.input || {})
      : null;

    const outcome = await callWithFallback({
      primary,
      fallback,
      timeoutMs: config.safety.perCallTimeoutMs,
      onPrimaryError: (err) => log({ kind: 'primary_error', role, sessionId, provider: provider.name, error: err.message }),
    });

    const usage = (outcome.result && outcome.result.usage) || { inputTokens: 0, outputTokens: 0 };
    const tokens = (usage.inputTokens || 0) + (usage.outputTokens || 0);
    if (tokens > 0) ceilings.add(sessionId, tokens);

    const peer = describeAiPeer({
      role,
      persona,
      provider: outcome.result.provider || provider.describe(),
      badge: config.transparency.badgeText,
    });

    log({ kind: 'invoke', role, sessionId, source: outcome.source, latencyMs: outcome.latencyMs, tokens, provider: peer.provider.id });

    return {
      role,
      source: outcome.source,
      result: outcome.result.result,
      latencyMs: outcome.latencyMs,
      usage,
      provider: peer.provider,
      persona: peer.persona,
      badge: peer.badge,
    };
  }

  function describe() {
    return {
      enabled: !!config.enabled,
      defaultProvider: config.defaultProvider,
      providers: registry.list(),
      roles: Object.keys(ROLE_SPECS),
      safety: config.safety,
    };
  }

  function snapshotUsage() {
    return ceilings.snapshot();
  }

  function registerProvider(provider) {
    registry.register(provider);
  }

  return { invoke, describe, snapshotUsage, registerProvider, _config: config };
}

module.exports = {
  createBroker,
  ROLE_SPECS,
  loadConfig,
};
