'use strict';

const { createBroker } = require('..');
const {
  createAnthropicProvider,
  buildSystemPrompt,
  buildUserMessage,
  parseJsonObject,
} = require('../providers/anthropic');

// Fake @anthropic-ai/sdk that records the last request and replies with a
// canned content block.
function fakeSdk(reply) {
  const calls = [];
  function FakeClient(opts) {
    this.opts = opts;
    this.messages = {
      create: async (req) => {
        calls.push(req);
        return reply;
      },
    };
  }
  return { Sdk: FakeClient, calls };
}

function curatorReply() {
  return {
    content: [
      { type: 'text', text: '{"variant":{"id":"speed-plus","_basedOn":"speed","tempo":1.4}}' },
    ],
    usage: { input_tokens: 42, output_tokens: 17 },
  };
}

describe('anthropic provider — prompt construction', () => {
  test('system prompt names the role and demands JSON', () => {
    const sys = buildSystemPrompt('curator');
    expect(sys).toMatch(/role "curator"/);
    expect(sys).toMatch(/single valid JSON object/);
    expect(sys).toMatch(/HR-34/);
    expect(sys).toMatch(/variant/);
  });

  test('user message embeds input as JSON', () => {
    const msg = buildUserMessage('logger', { events: ['e1'] });
    expect(msg).toMatch(/role "logger"/);
    expect(msg).toMatch(/"events"/);
    expect(msg).toMatch(/"e1"/);
  });

  test('parseJsonObject extracts JSON from prose-wrapped output', () => {
    const obj = parseJsonObject('Sure! Here you go:\n{"answer":"yes","suggestions":[]}\nThanks.');
    expect(obj.answer).toBe('yes');
  });

  test('parseJsonObject throws on non-JSON output', () => {
    expect(() => parseJsonObject('no braces here')).toThrow(/JSON object/);
  });
});

describe('anthropic provider — invoke', () => {
  test('factory requires apiKey', () => {
    expect(() => createAnthropicProvider({ sdkOverride: fakeSdk(curatorReply()).Sdk }))
      .toThrow(/ANTHROPIC_API_KEY required/);
  });

  test('factory throws when SDK missing and no override', () => {
    expect(() => createAnthropicProvider({ apiKey: 'k', sdkOverride: { not: 'a constructor' } }))
      .toThrow(/sdk not installed/);
  });

  test('invoke calls client.messages.create with role-shaped prompt', async () => {
    const fake = fakeSdk(curatorReply());
    const provider = createAnthropicProvider({
      apiKey: 'sk-test',
      model: 'claude-opus-4-5',
      maxTokens: 256,
      sdkOverride: fake.Sdk,
    });

    const out = await provider.invoke('curator', {
      gameId: '4dtictactoe',
      declaredScenarios: [{ id: 'classic' }, { id: 'speed' }],
    });

    expect(fake.calls).toHaveLength(1);
    const req = fake.calls[0];
    expect(req.model).toBe('claude-opus-4-5');
    expect(req.max_tokens).toBe(256);
    expect(req.system).toMatch(/role "curator"/);
    expect(req.messages[0].role).toBe('user');
    expect(req.messages[0].content).toMatch(/declaredScenarios/);

    expect(out.result.variant._basedOn).toBe('speed');
    expect(out.usage).toEqual({ inputTokens: 42, outputTokens: 17 });
    expect(out.provider).toEqual({ id: 'anthropic', model: 'claude-opus-4-5', transport: 'https' });
  });

  test('invoke throws on empty response so broker fallback kicks in', async () => {
    const fake = fakeSdk({ content: [], usage: {} });
    const provider = createAnthropicProvider({
      apiKey: 'sk-test', sdkOverride: fake.Sdk,
    });
    await expect(provider.invoke('logger', { events: [] })).rejects.toThrow(/empty response/);
  });
});

describe('anthropic provider — end-to-end through broker (curator, HR-34)', () => {
  function makeBrokerWithAnthropic(reply) {
    const fake = fakeSdk(reply);
    const provider = createAnthropicProvider({
      apiKey: 'sk-test', sdkOverride: fake.Sdk,
    });
    const broker = createBroker({
      config: {
        enabled: true,
        defaultProvider: 'anthropic',
        providers: { anthropic: { apiKey: 'sk-test' } },
        safety: {
          perCallTimeoutMs: 500, perSessionTokenCap: 10000,
          perDayTokenCap: 100000, perCallMaxRetries: 0, heuristicFallback: true,
        },
        transparency: { defaultPersona: 'TestBot', badgeText: 'AI' },
        mcpServer: { enabled: false, transport: 'stdio', requireHostApproval: true },
      },
      providers: [provider],
    });
    return { broker, fake };
  }

  test('curator returns variant from Anthropic, usage tokens counted', async () => {
    const { broker, fake } = makeBrokerWithAnthropic(curatorReply());
    const r = await broker.invoke({
      role: 'curator', phase: 'lobby',
      gameId: '4dtictactoe', sessionId: 's-anth-1',
      provider: 'anthropic',
      input: { declaredScenarios: [{ id: 'classic' }, { id: 'speed' }] },
    });
    expect(r.source).toBe('primary');
    expect(r.provider.id).toBe('anthropic');
    expect(r.result.variant._basedOn).toBe('speed');
    expect(r.usage.inputTokens + r.usage.outputTokens).toBe(59);
    expect(fake.calls).toHaveLength(1);

    const snap = broker.snapshotUsage();
    const session = snap.sessions.find((s) => s.sessionId === 's-anth-1');
    expect(session && session.used).toBe(59);
  });
});
