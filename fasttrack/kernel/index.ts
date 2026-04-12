/**
 * FastTrack ButterflyFx Kernel - Main Export
 * 
 * Pure, deterministic game engine for Fast Track board game.
 * Zero UI or network dependencies.
 */

// Types
export * from './types';

// Board Configuration
export {
  createBoard,
  getTrackIndex,
  getTrackPosition,
  getPlayerZone,
  getPositionOwner,
  isOnFastTrack,
  getNextFastTrackHole,
  getPrevFastTrackHole,
  getPlayerHomeFastTrack,
  getFastTrackDistance,
  findFastTrackExit,
  canEnterCenter,
  getFastTrackAsOuterRim,
  isCenter,
  isSafeZoneFull,
  getNextSafePosition,
  wouldPassSafeZoneEntry,
  canMoveToWinner,
  getDistanceToSafeZoneEnd,
  isInSafeZone,
  isWinnerPosition,
  getSafeIndex,
  getFastTrackIndex,
  getTrackDistance,
  getStepsToExit
} from './board';

// Game Rules
export {
  initGame,
  applyEvent,
  applyMove,
  validateMove,
  getValidMoves,
  playCard,
  endTurn,
  getCardValue,
  isPlayAgainCard,
  canExitHolding,
  canExitCenter,
  getPegAt,
  getPlayerPegs,
  hasPlayerOnFastTrack,
  hashState
} from './rules';

// Events
export {
  EventLog,
  createGameCreatedEvent,
  createPlayerJoinedEvent,
  createPlayerLeftEvent,
  createGameStartedEvent,
  createCardDrawnEvent,
  createCardPlayedEvent,
  createPegMovedEvent,
  createPegCapturedEvent,
  createTurnEndedEvent,
  createTurnPlayAgainEvent,
  createPlayerFinishedEvent,
  createGameEndedEvent,
  createSyncRequestEvent,
  createSyncResponseEvent,
  createHeartbeatEvent,
  createManifoldRecord,
  validateEvent,
  EVENT_SCHEMA
} from './events';

// Smart Peg System (ButterflyFx Manifold Integration)
export {
  createSmartPeg,
  hopCountingMove,
  generateCaptureTaunt,
  generateCapturedReaction,
  generateSafeZoneReaction,
  generateFinishedReaction,
  generateNarrowEscapeReaction,
  scoreMoveByPersonality,
  chooseMoveByPersonality,
  createPegManifoldEntry
} from './smart_peg';

export type { HopResult, MoveOption } from './smart_peg';

// Sync Layer
export {
  FastTrackSync,
  LocalFastTrack
} from './sync';
