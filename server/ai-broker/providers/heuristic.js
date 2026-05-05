// Heuristic provider: deterministic, no network, no cost.
// Always available; serves as the fallback when LLM providers are absent or
// fail. Per-role implementations delegate to existing per-game logic where
// possible, otherwise return a safe, transparent stub.
'use strict';

const NAME = 'heuristic';

function pickRandom(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

const handlers = {
  async gamekeeper(input) {
    return {
      ruling: 'Heuristic gamekeeper: deferring to declared rules in manifest.',
      citations: [],
    };
  },
  async facilitator(input) {
    const q = (input && input.question) || '';
    return {
      answer: q
        ? 'Heuristic facilitator: refer to ' + (input.gameId || 'game') + ' rules manifest for "' + q.slice(0, 80) + '".'
        : 'Heuristic facilitator: choose a mode from the wizard.',
      suggestions: ['solo', 'solo-bots', 'host-invite'],
    };
  },
  async host(input) {
    return {
      decisions: { autoStartWhenReady: true, fillBots: true },
    };
  },
  async logger(input) {
    const events = (input && Array.isArray(input.events)) ? input.events : [];
    return {
      summary: 'Match completed in ' + events.length + ' events.',
      highlights: events.slice(0, 3).map((e, i) => ({ index: i, event: e })),
    };
  },
  async player(input) {
    const moves = (input && Array.isArray(input.legalMoves)) ? input.legalMoves : [];
    return {
      move: pickRandom(moves),
      reasoning: 'heuristic: uniform random over ' + moves.length + ' legal moves',
    };
  },
  async curator(input) {
    const declared = (input && Array.isArray(input.declaredScenarios)) ? input.declaredScenarios : [];
    const base = pickRandom(declared) || {};
    return {
      variant: Object.assign({}, base, { _curator: 'heuristic', _basedOn: base.id || null }),
    };
  },
  async performance(input) {
    return { tier: 'auto', notes: 'heuristic: no telemetry-driven adjustment' };
  },
};

function describe() {
  return { id: NAME, model: null, transport: 'inproc' };
}

async function invoke(roleId, input) {
  const fn = handlers[roleId];
  if (!fn) throw new Error('heuristic provider: unsupported role ' + roleId);
  const result = await fn(input || {});
  return { result, usage: { inputTokens: 0, outputTokens: 0 }, provider: describe() };
}

module.exports = { name: NAME, describe, invoke };
