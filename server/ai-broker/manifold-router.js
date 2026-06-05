// server/ai-broker/manifold-router.js
// Wires the Schwarz Diamond router into the ai-broker.
//
// Wraps createBroker() so every invoke() call:
//   1. Derives routing signals from the role (default) + call overrides
//   2. Runs SchwarzRouter.route() against the Claude 4.x catalog
//   3. Selects the cheapest model that clears the quality threshold
//   4. Forwards to the Anthropic provider with that model
//   5. Logs the routing decision alongside usage
//
// This is the "minimal tokens for maximum effect" principle made operational:
// the Schwarz Diamond surface is the decision boundary between model tiers.
// Logger (low stakes) routes to haiku. Gamekeeper ruling (high stakes)
// routes to sonnet or opus. The surface finds the boundary automatically.
//
// Usage:
//   const { createManifoldBroker } = require('./manifold-router');
//   const broker = createManifoldBroker({ config, onLog });
//   const result = await broker.invoke({ role: 'gamekeeper', ... });
//
// The result includes a `routing` field with the full SchwarzRouter trace.
'use strict';

const SchwarzRouter = require('../../js/schwarz-router');
const { createBroker } = require('./index');
const { createAnthropicProvider } = require('./providers/anthropic');
const { loadConfig } = require('./config');

// Default routing signals per role.
// x = complexity, stakes = y (dominant signal), context = z.
// These are the z = x * y manifold coordinates for each role's typical call.
// Override per-call via call.routingSignals = { complexity, stakes, context }.
const ROLE_SIGNALS = {
  // High stakes: rules disputes must be correct; wrong ruling breaks the game.
  gamekeeper:    { complexity: 0.55, stakes: 0.85, context: 0.60 },

  // Medium stakes: wrong advice is inconvenient but recoverable.
  facilitator:   { complexity: 0.30, stakes: 0.45, context: 0.50 },

  // Medium stakes: wrong host decision stalls the session.
  host:          { complexity: 0.40, stakes: 0.60, context: 0.50 },

  // Low stakes: summaries are nice-to-have, not correctness-critical.
  logger:        { complexity: 0.25, stakes: 0.20, context: 0.75 },

  // Medium stakes, fast turnaround: player moves must be legal but haiku
  // handles turn-based games well.
  player:        { complexity: 0.45, stakes: 0.50, context: 0.60 },

  // Higher complexity: scenario generation from manifold params.
  curator:       { complexity: 0.70, stakes: 0.50, context: 0.65 },

  // Low stakes: telemetry classification, no consequences if imprecise.
  performance:   { complexity: 0.20, stakes: 0.25, context: 0.40 },

  // High stakes + high complexity: manifold-aware director writes y modifiers.
  'game-master': { complexity: 0.65, stakes: 0.80, context: 0.65 },

  // Highest complexity: proposing new manifold scenario manifests.
  'game-maker':  { complexity: 0.80, stakes: 0.60, context: 0.70 },
};

// Claude 4.x production catalog.
// quality is a 0..1 heuristic. cost_per_1k is USD per 1k input tokens.
// The router picks the cheapest tier whose quality >= computed threshold.
const CLAUDE_CATALOG = SchwarzRouter.CLAUDE_CATALOG;

function getSignals(role, callOverrides) {
  const base = ROLE_SIGNALS[role] || { complexity: 0.50, stakes: 0.50, context: 0.50 };
  if (!callOverrides) return base;
  return {
    complexity: callOverrides.complexity != null ? callOverrides.complexity : base.complexity,
    stakes:     callOverrides.stakes     != null ? callOverrides.stakes     : base.stakes,
    context:    callOverrides.context    != null ? callOverrides.context    : base.context,
  };
}

// Build capability flags from the call so the truth table can apply
// PII / offline / vision constraints during model selection.
function buildFlags(call) {
  const flags = {};
  if (call.needs_vision)    flags.needs_vision    = true;
  if (call.needs_tools)     flags.needs_tools     = true;
  if (call.must_be_offline) flags.must_be_offline = true;
  if (call.contains_pii)    flags.contains_pii    = true;
  // Infer from text if present
  const text = (call.input && typeof call.input.text === 'string') ? call.input.text : null;
  return SchwarzRouter.inferFlagsFromText(text, flags);
}

// createManifoldBroker: drop-in replacement for createBroker().
// Adds per-call model selection via the Schwarz Diamond router.
function createManifoldBroker(opts) {
  const options = opts || {};
  const config = options.config || loadConfig();
  const catalog = options.catalog || CLAUDE_CATALOG;
  const onLog = typeof options.onLog === 'function' ? options.onLog : null;

  function log(entry) {
    if (onLog) { try { onLog(entry); } catch (_) {} }
  }

  // Resolve signals and run the router for this call.
  function routeCall(call) {
    const signals = getSignals(call.role, call.routingSignals);
    const flags = buildFlags(call);
    const promptTokens = estimateTokens(call.input);

    const routeResult = SchwarzRouter.route(signals, catalog, {
      flags: flags,
      tokens: promptTokens,
      required_context: call.required_context || 0,
      text: (call.input && typeof call.input.text === 'string') ? call.input.text : null,
    });

    return { signals, routeResult };
  }

  // Rough token estimate before the call: used by the router to compute
  // cost_estimate. 1 token ~ 4 chars.
  function estimateTokens(input) {
    if (!input) return 256;
    const text = typeof input === 'string' ? input : JSON.stringify(input);
    return Math.ceil(text.length / 4) + 256; // +256 for system prompt
  }

  async function invoke(call) {
    if (!call || !call.role) throw new Error('manifold-router: role required');

    const { signals, routeResult } = routeCall(call);
    const selectedModel = routeResult.model.model || config.providers.anthropic.model;

    log({
      kind: 'manifold_route',
      role: call.role,
      sessionId: call.sessionId || null,
      signals: signals,
      tier: routeResult.tier,
      model: selectedModel,
      threshold: routeResult.threshold,
      manifold_demand: routeResult.manifold_demand,
      F_value: routeResult.F_value,
      path: routeResult.path,
      cost_estimate: routeResult.cost_estimate,
      reasoning: routeResult.reasoning,
    });

    // Build a single-use Anthropic provider with the routed model.
    const provider = createAnthropicProvider({
      apiKey: config.providers.anthropic.apiKey,
      model: selectedModel,
      maxTokens: config.providers.anthropic.maxTokens || 1024,
    });

    const start = Date.now();
    const outcome = await provider.invoke(call.role, call.input || {});
    const latencyMs = Date.now() - start;

    const usage = outcome.usage || { inputTokens: 0, outputTokens: 0 };
    const actualTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0);

    log({
      kind: 'manifold_invoke_complete',
      role: call.role,
      sessionId: call.sessionId || null,
      model: selectedModel,
      tier: routeResult.tier,
      latencyMs: latencyMs,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      actualCost: (actualTokens / 1000) * (routeResult.model.cost_per_1k || 0),
    });

    return {
      source: 'manifold-router',
      result: outcome.result,
      latencyMs: latencyMs,
      usage: usage,
      provider: outcome.provider,
      persona: call.persona || null,
      role: call.role,
      routing: {
        tier: routeResult.tier,
        model: selectedModel,
        signals: signals,
        threshold: routeResult.threshold,
        manifold_demand: routeResult.manifold_demand,
        F_value: routeResult.F_value,
        path: routeResult.path,
        cost_estimate: routeResult.cost_estimate,
        reasoning: routeResult.reasoning,
      },
    };
  }

  // plan(): dry-run routing for a multi-step request without executing.
  // Returns the step plan with per-step model selections and total cost.
  function planCall(request) {
    return SchwarzRouter.plan(request, catalog);
  }

  // batchRoute(): route multiple calls, return sorted by cost ascending.
  // Useful for choosing which of several pending agent tasks to run first.
  function batchRoute(calls) {
    return calls
      .map(function(call) {
        const { signals, routeResult } = routeCall(call);
        return Object.assign({}, call, { routing: routeResult, signals: signals });
      })
      .sort(function(a, b) { return a.routing.cost_estimate - b.routing.cost_estimate; });
  }

  return { invoke, plan: planCall, batchRoute, CLAUDE_CATALOG: catalog };
}

module.exports = {
  createManifoldBroker,
  ROLE_SIGNALS,
  CLAUDE_CATALOG,
};
