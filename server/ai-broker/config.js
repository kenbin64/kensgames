// Env-driven config for the AI broker.
// HR-32: AI keys live ONLY here (server). Never expose to clients.
'use strict';

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envFloat(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
}

function loadConfig(env) {
  const e = env || process.env;
  return {
    enabled: /^(1|true|yes|on)$/i.test(e.AI_BROKER_ENABLED || ''),
    defaultProvider: e.AI_BROKER_PROVIDER || 'heuristic',
    providers: {
      anthropic: {
        apiKey: e.ANTHROPIC_API_KEY || '',
        model: e.ANTHROPIC_MODEL || 'claude-opus-4-5',
        maxTokens: parseInt(e.ANTHROPIC_MAX_TOKENS || '1024', 10),
      },
    },
    safety: {
      perCallTimeoutMs: parseInt(e.AI_BROKER_TIMEOUT_MS || '4000', 10),
      perSessionTokenCap: parseInt(e.AI_BROKER_SESSION_TOKEN_CAP || '50000', 10),
      perDayTokenCap: parseInt(e.AI_BROKER_DAY_TOKEN_CAP || '500000', 10),
      perCallMaxRetries: parseInt(e.AI_BROKER_MAX_RETRIES || '1', 10),
      heuristicFallback: !/^(0|false|no|off)$/i.test(e.AI_BROKER_HEURISTIC_FALLBACK || '1'),
    },
    transparency: {
      defaultPersona: e.AI_BROKER_PERSONA || 'House Bot',
      badgeText: e.AI_BROKER_BADGE || 'AI',
    },
    mcpServer: {
      enabled: /^(1|true|yes|on)$/i.test(e.AI_MCP_SERVER_ENABLED || ''),
      transport: e.AI_MCP_SERVER_TRANSPORT || 'stdio',
      requireHostApproval: !/^(0|false|no|off)$/i.test(e.AI_MCP_REQUIRE_APPROVAL || '1'),
    },
  };
}

module.exports = { loadConfig, envInt, envFloat, envBool };
