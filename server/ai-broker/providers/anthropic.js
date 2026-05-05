// Anthropic provider for the AI broker.
// HR-32: API key lives only on the server, sourced from ANTHROPIC_API_KEY.
// HR-33: never invoked inside a realtime tick (broker enforces upstream).
// HR-34: prompt instructs the model to recombine declared inputs only,
// never invent rules outside the manifest.
//
// Contract matches providers/heuristic.js:
//   { name, describe(), invoke(roleId, input) -> { result, usage, provider } }
'use strict';

const { ROLE_SPECS } = require('../roles');

const NAME = 'anthropic';

function loadSDK(sdkOverride) {
  if (sdkOverride) return sdkOverride;
  try {
    return require('@anthropic-ai/sdk');
  } catch (_) {
    return null;
  }
}

function resolveClientCtor(SDK) {
  if (!SDK) return null;
  if (typeof SDK === 'function') return SDK;
  if (typeof SDK.default === 'function') return SDK.default;
  if (typeof SDK.Anthropic === 'function') return SDK.Anthropic;
  return null;
}

function buildSystemPrompt(roleId) {
  const spec = ROLE_SPECS[roleId];
  if (!spec) throw new Error('anthropic provider: unknown role ' + roleId);
  const schemaKeys = Object.keys(spec.outputSchema || {});
  return [
    'You are filling the AI role "' + roleId + '" inside a game manager.',
    'Role description: ' + spec.description,
    'You MUST respond with a single valid JSON object and no prose.',
    'The JSON object MUST contain these top-level fields: ' + schemaKeys.join(', ') + '.',
    'HR-34: never invent rules, scenarios, or parameters outside the input.',
    'Recombine, observe, narrate, or rule only on what was given.',
  ].join('\n');
}

function buildUserMessage(roleId, input) {
  const safeInput = input == null ? {} : input;
  return 'Input for role "' + roleId + '":\n```json\n' +
    JSON.stringify(safeInput, null, 2) + '\n```';
}

function extractText(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
}

function parseJsonObject(text) {
  if (typeof text !== 'string' || !text.length) {
    throw new Error('anthropic provider: empty response');
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('anthropic provider: response did not contain a JSON object');
  }
  return JSON.parse(text.slice(start, end + 1));
}

function createAnthropicProvider(opts) {
  const apiKey = opts && opts.apiKey;
  const model = (opts && opts.model) || 'claude-opus-4-5';
  const maxTokens = (opts && opts.maxTokens) || 1024;

  if (!apiKey) {
    throw new Error('anthropic provider: ANTHROPIC_API_KEY required');
  }

  const SDK = loadSDK(opts && opts.sdkOverride);
  const Client = resolveClientCtor(SDK);
  if (!Client) {
    throw new Error('anthropic provider: @anthropic-ai/sdk not installed');
  }

  const client = (opts && opts.clientOverride) || new Client({ apiKey });

  function describe() {
    return { id: NAME, model, transport: 'https' };
  }

  async function invoke(roleId, input) {
    const system = buildSystemPrompt(roleId);
    const user = buildUserMessage(roleId, input);

    const resp = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const text = extractText(resp && resp.content);
    const result = parseJsonObject(text);
    const usage = {
      inputTokens: (resp && resp.usage && resp.usage.input_tokens) || 0,
      outputTokens: (resp && resp.usage && resp.usage.output_tokens) || 0,
    };

    return { result, usage, provider: describe() };
  }

  return { name: NAME, describe, invoke };
}

module.exports = {
  NAME,
  createAnthropicProvider,
  // Exported for tests and advanced wiring.
  buildSystemPrompt,
  buildUserMessage,
  parseJsonObject,
};
