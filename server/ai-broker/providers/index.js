// Provider registry. Providers are y-extracted (selectable per call), never
// x-baked. The heuristic provider is always present as the fallback.
'use strict';

const heuristic = require('./heuristic');

function createRegistry() {
  const providers = new Map();
  providers.set(heuristic.name, heuristic);

  function register(provider) {
    if (!provider || !provider.name || typeof provider.invoke !== 'function') {
      throw new Error('provider registry: invalid provider');
    }
    providers.set(provider.name, provider);
  }

  function get(name) {
    return providers.get(name) || null;
  }

  function has(name) {
    return providers.has(name);
  }

  function list() {
    return Array.from(providers.keys());
  }

  return { register, get, has, list };
}

// Build a registry pre-populated from broker config: heuristic always present,
// optional providers (Anthropic) registered when their key is configured.
// HR-32: keys are read here from server-side config and never leave the server.
function createDefaultRegistry(brokerConfig) {
  const reg = createRegistry();
  const cfg = (brokerConfig && brokerConfig.providers) || {};
  const aCfg = cfg.anthropic;
  if (aCfg && aCfg.apiKey) {
    try {
      const { createAnthropicProvider } = require('./anthropic');
      reg.register(createAnthropicProvider(aCfg));
    } catch (_) {
      // Fall through silently: heuristic remains as fallback (HR-21 liveness).
    }
  }
  return reg;
}

module.exports = { createRegistry, createDefaultRegistry, heuristic };
