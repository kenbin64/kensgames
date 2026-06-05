// server/ai-broker/game-kernel-adapter.js
// Wires the manifold-router broker into the game-kernel at phase boundaries.
//
// The GameMaster owns the realtime tick; the broker never enters it (HR-33).
// This adapter attaches broker calls to lobby, between-turns, and post-match
// hooks that the lobby-router fires outside the tick.
//
// Usage:
//   const { createAdapter } = require('./game-kernel-adapter');
//   const adapter = createAdapter({ config, onLog });
//
//   // In lobby phase:
//   await adapter.onLobbyEvent(sessionId, 'player_join', { player, gameId });
//
//   // Between turns (after each completed turn):
//   await adapter.onTurnBoundary(sessionId, gameId, { state, lastAction, legalMoves, botPlayer });
//
//   // Post-match:
//   await adapter.onMatchComplete(sessionId, gameId, { result, events });
'use strict';

const { createManifoldBroker } = require('./manifold-router');
const { loadConfig } = require('./config');

function createAdapter(opts) {
  const options = opts || {};
  const config = options.config || loadConfig();
  const broker = createManifoldBroker({ config, onLog: options.onLog });

  // onLobbyEvent: called by lobby-router on lobby state changes.
  // Routes to facilitator (guidance) or host (when no human host).
  async function onLobbyEvent(sessionId, eventType, ctx) {
    if (!config.enabled) return null;

    const role = ctx.hostIsAI ? 'host' : 'facilitator';
    const result = await broker.invoke({
      role,
      sessionId,
      input: {
        gameId: ctx.gameId,
        question: ctx.question || '',
        context: { eventType, player: ctx.player || null },
        sessionState: ctx.sessionState || null,
      },
    });
    return result;
  }

  // onTurnBoundary: called after a human turn completes and a bot must act.
  // Routes to player role (bot move selection). Always haiku or sonnet
  // because stakes are moderate and speed matters.
  async function onTurnBoundary(sessionId, gameId, ctx) {
    if (!config.enabled) return null;
    if (!ctx.botPlayer) return null;

    const result = await broker.invoke({
      role: 'player',
      sessionId,
      persona: ctx.botPlayer.persona || { name: ctx.botPlayer.name },
      routingSignals: { complexity: 0.45, stakes: 0.50, context: 0.60 },
      input: {
        gameId,
        sessionId,
        legalMoves: ctx.legalMoves || [],
        state: ctx.state || {},
        persona: ctx.botPlayer.persona || {},
      },
    });
    return result;
  }

  // onMatchComplete: post-match summary, registration invite, stats.
  // Routes to logger (low stakes, haiku-grade) and optionally performance
  // tier negotiation.
  async function onMatchComplete(sessionId, gameId, ctx) {
    if (!config.enabled) return null;

    const logResult = await broker.invoke({
      role: 'logger',
      sessionId,
      input: {
        gameId,
        sessionId,
        events: ctx.events || [],
      },
    });

    const perfResult = await broker.invoke({
      role: 'performance',
      sessionId,
      input: {
        gameId,
        sessionId,
        telemetry: ctx.telemetry || {},
      },
    });

    return { log: logResult, performance: perfResult };
  }

  // onRulingNeeded: dispute mediation mid-match (called from between-turns,
  // never from the realtime tick).
  async function onRulingNeeded(sessionId, gameId, dispute) {
    if (!config.enabled) return null;
    return broker.invoke({
      role: 'gamekeeper',
      sessionId,
      input: { gameId, sessionId, dispute },
    });
  }

  // onCuratorRequest: generate a scenario variant. Pre-match only.
  async function onCuratorRequest(sessionId, gameId, params) {
    if (!config.enabled) return null;
    return broker.invoke({
      role: 'curator',
      sessionId,
      input: { gameId, sessionId, params },
    });
  }

  return {
    onLobbyEvent,
    onTurnBoundary,
    onMatchComplete,
    onRulingNeeded,
    onCuratorRequest,
    broker,
  };
}

module.exports = { createAdapter };
