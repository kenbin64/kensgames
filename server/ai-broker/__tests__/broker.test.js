'use strict';

const { createBroker, ROLE_SPECS } = require('..');
const { ROLE_IDS, assertPhase, assertNotInTick } = require('../roles');
const { createRegistry } = require('../providers');

function makeBroker(overrides) {
  const cfg = Object.assign({
    enabled: true,
    defaultProvider: 'heuristic',
    providers: { anthropic: {} },
    safety: {
      perCallTimeoutMs: 200,
      perSessionTokenCap: 1000,
      perDayTokenCap: 5000,
      perCallMaxRetries: 0,
      heuristicFallback: true,
    },
    transparency: { defaultPersona: 'TestBot', badgeText: 'AI' },
    mcpServer: { enabled: false, transport: 'stdio', requireHostApproval: true },
  }, overrides && overrides.config || {});
  return createBroker({ config: cfg, providers: overrides && overrides.providers || [] });
}

describe('roles registry', () => {
  test('exports the seven HR-31 roles', () => {
    expect(ROLE_IDS).toEqual([
      'gamekeeper', 'facilitator', 'host', 'logger', 'player', 'curator', 'performance',
    ]);
    for (const id of ROLE_IDS) expect(ROLE_SPECS[id].id).toBe(id);
  });

  test('phase guard rejects player outside between-turns', () => {
    expect(() => assertPhase('player', 'lobby')).toThrow(/HR-33/);
    expect(() => assertPhase('player', 'between-turns')).not.toThrow();
  });

  test('realtime-tick guard blocks player role (HR-33)', () => {
    expect(() => assertNotInTick('player', true)).toThrow(/HR-33/);
    expect(() => assertNotInTick('logger', true)).not.toThrow();
  });
});

describe('broker invoke (heuristic provider)', () => {
  test('player role returns a legal move', async () => {
    const broker = makeBroker();
    const r = await broker.invoke({
      role: 'player', phase: 'between-turns',
      gameId: '4dtictactoe', sessionId: 's1',
      input: { legalMoves: [{ x: 0 }, { x: 1 }, { x: 2 }] },
    });
    expect([0, 1, 2]).toContain(r.result.move.x);
    expect(r.source).toBe('primary');
    expect(r.provider.id).toBe('heuristic');
    expect(r.badge).toBe('AI');
    expect(r.persona.name).toBeDefined();
  });

  test('curator returns a variant based on declared scenarios (HR-34)', async () => {
    const broker = makeBroker();
    const r = await broker.invoke({
      role: 'curator', phase: 'lobby',
      gameId: '4dtictactoe', sessionId: 's2',
      input: { declaredScenarios: [{ id: 'classic' }, { id: 'speed' }] },
    });
    expect(['classic', 'speed']).toContain(r.result.variant._basedOn);
  });

  test('logger summarises events', async () => {
    const broker = makeBroker();
    const r = await broker.invoke({
      role: 'logger', phase: 'post', sessionId: 's3',
      input: { events: ['e1', 'e2', 'e3', 'e4'] },
    });
    expect(r.result.summary).toMatch(/4 events/);
    expect(r.result.highlights).toHaveLength(3);
  });

  test('rejects unknown role', async () => {
    const broker = makeBroker();
    await expect(broker.invoke({ role: 'oracle' })).rejects.toThrow(/invalid role/);
  });
});

describe('safety: timeout + fallback', () => {
  function slowProvider(latencyMs) {
    return {
      name: 'slow',
      describe: () => ({ id: 'slow', model: 'x', transport: 'inproc' }),
      invoke: () => new Promise((res) => setTimeout(
        () => res({ result: { move: { x: 99 } }, usage: {}, provider: { id: 'slow' } }),
        latencyMs
      )),
    };
  }

  test('falls back to heuristic when primary times out', async () => {
    const broker = makeBroker({
      providers: [slowProvider(500)],
      config: { safety: { perCallTimeoutMs: 50, heuristicFallback: true, perSessionTokenCap: 1000, perDayTokenCap: 5000 } },
    });
    const r = await broker.invoke({
      role: 'player', phase: 'between-turns', provider: 'slow',
      input: { legalMoves: [{ x: 1 }] },
    });
    expect(r.source).toBe('fallback');
    expect(r.result.move.x).toBe(1);
  });

  test('throws when fallback disabled and primary errors', async () => {
    const errProvider = {
      name: 'broken',
      describe: () => ({ id: 'broken' }),
      invoke: () => Promise.reject(new Error('boom')),
    };
    const broker = makeBroker({
      providers: [errProvider],
      config: { safety: { perCallTimeoutMs: 50, heuristicFallback: false, perSessionTokenCap: 1000, perDayTokenCap: 5000 } },
    });
    await expect(broker.invoke({
      role: 'logger', phase: 'post', provider: 'broken', input: { events: [] },
    })).rejects.toThrow(/boom/);
  });
});

describe('describe + usage snapshot', () => {
  test('describe lists registered providers and roles', () => {
    const broker = makeBroker();
    const d = broker.describe();
    expect(d.providers).toContain('heuristic');
    expect(d.roles).toEqual(Object.keys(ROLE_SPECS));
    expect(d.enabled).toBe(true);
  });

  test('snapshotUsage returns daily + session counters', () => {
    const broker = makeBroker();
    const snap = broker.snapshotUsage();
    expect(snap).toHaveProperty('day');
    expect(snap).toHaveProperty('dayUsed');
    expect(Array.isArray(snap.sessions)).toBe(true);
  });
});
