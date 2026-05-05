// AI roles per HR-31. Each role is an async function with a fixed shape.
// Roles never run inside the realtime tick (HR-33). The broker enforces this
// by exposing player/curator/logger only as awaitable hooks the manager calls
// from pre-match, between-turn, or post-match boundaries.
'use strict';

const ROLE_IDS = Object.freeze([
  'gamekeeper',     // rules enforcement, dispute mediation, narration
  'facilitator',    // wizard guidance, mode suggestion, rules Q&A
  'host',           // assumes host duties when no human host volunteers
  'logger',         // match transcripts, highlights, post-match summaries
  'player',         // fills bot slots; turn-based games only (HR-33)
  'curator',        // scenario variants from declared params (HR-34)
  'performance',    // tier negotiation per HR-37
]);

const REALTIME_FORBIDDEN = Object.freeze(new Set(['player']));
const PRE_OR_POST_ONLY = Object.freeze(new Set(['curator', 'logger', 'host', 'performance']));

function makeRoleSpec(id, opts) {
  return Object.freeze({
    id,
    description: opts.description,
    inputSchema: opts.inputSchema,
    outputSchema: opts.outputSchema,
    phaseAllowed: opts.phaseAllowed,
  });
}

const ROLE_SPECS = Object.freeze({
  gamekeeper: makeRoleSpec('gamekeeper', {
    description: 'Enforces rules, mediates disputes, narrates state.',
    inputSchema: { gameId: 'string', sessionId: 'string', dispute: 'object' },
    outputSchema: { ruling: 'string', citations: 'array' },
    phaseAllowed: ['lobby', 'between-turns', 'post'],
  }),
  facilitator: makeRoleSpec('facilitator', {
    description: 'Guides hosts through wizard, suggests modes, answers rules questions.',
    inputSchema: { gameId: 'string', question: 'string', context: 'object' },
    outputSchema: { answer: 'string', suggestions: 'array' },
    phaseAllowed: ['lobby'],
  }),
  host: makeRoleSpec('host', {
    description: 'Assumes host duties when no human host volunteers.',
    inputSchema: { gameId: 'string', sessionId: 'string', sessionState: 'object' },
    outputSchema: { decisions: 'object' },
    phaseAllowed: ['lobby'],
  }),
  logger: makeRoleSpec('logger', {
    description: 'Produces match transcripts, highlights, post-match summaries.',
    inputSchema: { gameId: 'string', sessionId: 'string', events: 'array' },
    outputSchema: { summary: 'string', highlights: 'array' },
    phaseAllowed: ['post'],
  }),
  player: makeRoleSpec('player', {
    description: 'Fills a bot slot in turn-based games.',
    inputSchema: { gameId: 'string', sessionId: 'string', legalMoves: 'array', state: 'object', persona: 'object' },
    outputSchema: { move: 'object', reasoning: 'string?' },
    phaseAllowed: ['between-turns'],
  }),
  curator: makeRoleSpec('curator', {
    description: 'Recombines declared scenario parameters into variants. Never invents rules outside the manifest (HR-34).',
    inputSchema: { gameId: 'string', declaredScenarios: 'array', request: 'object' },
    outputSchema: { variant: 'object' },
    phaseAllowed: ['lobby'],
  }),
  performance: makeRoleSpec('performance', {
    description: 'Observes telemetry and suggests tier adjustments per HR-37.',
    inputSchema: { gameId: 'string', telemetry: 'object' },
    outputSchema: { tier: 'string', notes: 'string' },
    phaseAllowed: ['lobby', 'post'],
  }),
});

function isValidRole(roleId) {
  return ROLE_IDS.indexOf(roleId) !== -1;
}

function assertPhase(roleId, phase) {
  const spec = ROLE_SPECS[roleId];
  if (!spec) throw new Error('ai-broker: unknown role ' + roleId);
  if (spec.phaseAllowed.indexOf(phase) === -1) {
    throw new Error('ai-broker: role ' + roleId + ' not allowed in phase ' + phase + ' (HR-33)');
  }
}

function assertNotInTick(roleId, isRealtimeTick) {
  if (isRealtimeTick && REALTIME_FORBIDDEN.has(roleId)) {
    throw new Error('ai-broker: role ' + roleId + ' forbidden inside realtime tick (HR-33)');
  }
}

module.exports = {
  ROLE_IDS,
  ROLE_SPECS,
  REALTIME_FORBIDDEN,
  PRE_OR_POST_ONLY,
  isValidRole,
  assertPhase,
  assertNotInTick,
};
