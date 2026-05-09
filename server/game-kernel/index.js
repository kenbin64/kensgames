'use strict';

/**
 * Game Kernel — public entry point.
 *
 *   const { registerRules, getRules, GameMaster, channels } = require('./game-kernel');
 *
 * See ./rules.js for the GameRules contract.
 * See ./game-master.js for the per-match orchestrator.
 * See ./channel.js for transport adapters (ws, local, null).
 */

const rules = require('./rules.js');
const { GameMaster } = require('./game-master.js');
const channels = require('./channel.js');

module.exports = {
  // Rules registry
  registerRules: rules.registerRules,
  getRules: rules.getRules,
  hasRules: rules.hasRules,
  listRules: rules.listRules,
  unregisterRules: rules.unregisterRules,
  makeAction: rules.makeAction,
  REQUIRED_METHODS: rules.REQUIRED_METHODS,

  // Orchestrator
  GameMaster,

  // Transport adapters
  channels,
};
