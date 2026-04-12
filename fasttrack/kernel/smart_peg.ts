/**
 * FastTrack Smart Peg System
 * ButterflyFx Manifold Substrate Integration
 * 
 * Self-aware pegs that:
 * - Know their exact position and count hops during movement
 * - Have gladiator personalities (all in fun!)
 * - Verify landing matches card value
 * - Adjust if initial estimate was wrong
 * - Celebrate captures and react to being captured
 */

import {
  SmartPeg,
  Peg,
  PegPersonality,
  PegMood,
  PegAction,
  PEG_TAUNTS,
  PEG_REACTIONS,
  PegState,
  CaptureAnimation,
  CapturedAnimation,
  CAPTURE_ANIMATIONS
} from './types';

import {
  BoardConfig,
  getTrackIndex,
  getTrackPosition,
  isOnFastTrack,
  isInSafeZone,
  isCenter,
  getFastTrackIndex
} from './board';

// =============================================================================
// SMART PEG FACTORY
// =============================================================================

/**
 * Create a SmartPeg from a basic Peg
 * Assigns random personality and initializes self-awareness
 */
export function createSmartPeg(
  peg: Peg,
  board: BoardConfig,
  personality?: PegPersonality
): SmartPeg {
  const assignedPersonality = personality || randomPersonality();
  
  return {
    ...peg,
    personality: assignedPersonality,
    mood: determineMood(peg, board),
    currentHoleIndex: getPositionIndex(peg.positionId, board),
    hopsCounted: 0,
    targetHoleIndex: -1,
    pathTraveled: [],
    captureCount: 0,
    timesCaptured: 0,
    rivalPegId: null,
    cardValueExpected: 0,
    landingVerified: false,
    adjustedLanding: false,
    lastAction: null,
    celebrationPending: false
  };
}

function randomPersonality(): PegPersonality {
  const personalities: PegPersonality[] = [
    'AGGRESSIVE', 'CAUTIOUS', 'SHOWBOAT', 'STRATEGIC', 'LOYAL', 'WILDCARD'
  ];
  return personalities[Math.floor(Math.random() * personalities.length)];
}

function determineMood(peg: Peg, board: BoardConfig): PegMood {
  if (peg.state === 'IN_HOLDING') return 'EAGER';
  if (peg.state === 'IN_SAFE') return 'RELAXED';
  if (peg.state === 'FINISHED') return 'TRIUMPHANT';
  return 'CONFIDENT';
}

function getPositionIndex(positionId: string, board: BoardConfig): number {
  // Check outer rim
  const trackIdx = getTrackIndex(board, positionId);
  if (trackIdx !== -1) return trackIdx;
  
  // Check fast track
  const ftIdx = getFastTrackIndex(board, positionId);
  if (ftIdx !== -1) return 1000 + ftIdx; // Offset to distinguish from outer rim
  
  // Center
  if (isCenter(board, positionId)) return 9999;
  
  return -1;
}

// =============================================================================
// HOP-COUNTING MOVEMENT
// =============================================================================

export interface HopResult {
  path: string[];
  destination: string;
  hopsCompleted: number;
  expectedHops: number;
  verified: boolean;
  adjusted: boolean;
  blockedAt?: string;
  capturedOpponent?: string;
}

/**
 * Move a SmartPeg by counting hops
 * The peg counts each hop and verifies it matches the card value
 */
export function hopCountingMove(
  smartPeg: SmartPeg,
  cardValue: number,
  board: BoardConfig,
  direction: 'clockwise' | 'counter-clockwise',
  getNextHole: (current: string, dir: 'clockwise' | 'counter-clockwise') => string | null,
  isOccupiedByOpponent: (holeId: string) => string | null
): HopResult {
  // Initialize hop counting
  smartPeg.cardValueExpected = cardValue;
  smartPeg.hopsCounted = 0;
  smartPeg.pathTraveled = [smartPeg.positionId];
  smartPeg.targetHoleIndex = -1;
  smartPeg.landingVerified = false;
  smartPeg.adjustedLanding = false;
  
  let current = smartPeg.positionId;
  let capturedOpponent: string | undefined;
  
  // Count hops one by one
  for (let hop = 0; hop < cardValue; hop++) {
    const next = getNextHole(current, direction);
    
    if (!next) {
      // Blocked - can't continue
      return {
        path: smartPeg.pathTraveled,
        destination: current,
        hopsCompleted: smartPeg.hopsCounted,
        expectedHops: cardValue,
        verified: false,
        adjusted: false,
        blockedAt: current
      };
    }
    
    smartPeg.hopsCounted++;
    smartPeg.pathTraveled.push(next);
    current = next;
    
    // Check for opponent capture on final landing
    if (hop === cardValue - 1) {
      const opponentId = isOccupiedByOpponent(next);
      if (opponentId) {
        capturedOpponent = opponentId;
      }
    }
  }
  
  // Verify hop count matches card
  smartPeg.landingVerified = smartPeg.hopsCounted === cardValue;
  
  // Update peg position
  smartPeg.currentHoleIndex = getPositionIndex(current, board);
  smartPeg.targetHoleIndex = smartPeg.currentHoleIndex;
  
  // If count doesn't match, we would adjust (but shouldn't happen with proper counting)
  if (!smartPeg.landingVerified) {
    console.warn(`[SmartPeg ${smartPeg.id}] Hop count mismatch! Expected ${cardValue}, counted ${smartPeg.hopsCounted}`);
    smartPeg.adjustedLanding = true;
  }
  
  return {
    path: smartPeg.pathTraveled,
    destination: current,
    hopsCompleted: smartPeg.hopsCounted,
    expectedHops: cardValue,
    verified: smartPeg.landingVerified,
    adjusted: smartPeg.adjustedLanding,
    capturedOpponent
  };
}

// =============================================================================
// GLADIATOR ACTIONS & REACTIONS
// =============================================================================

/**
 * Generate capture animation for the hunter
 */
function generateHunterAnimation(personality: PegPersonality): CaptureAnimation {
  const style = CAPTURE_ANIMATIONS.HUNTER_STYLES[personality];
  const celebrations = CAPTURE_ANIMATIONS.CELEBRATIONS[personality];
  const celebration = celebrations[Math.floor(Math.random() * celebrations.length)];
  
  return {
    style: style.style,
    hunterJumpHeight: style.jumpHeight,
    impactForce: style.force,
    hunterCelebration: celebration
  };
}

/**
 * Generate captured animation for the victim (somersault through the air!)
 */
function generateVictimAnimation(impactForce: number): CapturedAnimation {
  // Higher impact = more dramatic arc
  const arcOptions = CAPTURE_ANIMATIONS.VICTIM_ARCS;
  const arc = arcOptions[Math.floor(Math.random() * arcOptions.length)];
  
  // Scale height by impact force
  const launchHeight = 50 + (impactForce * 0.5) + (Math.random() * 30);
  
  return {
    launchAngle: arc.launchAngle,
    launchHeight,
    spinCount: arc.spinCount,
    spinAxis: arc.spinAxis,
    hangTime: arc.hangTime + (impactForce * 2),
    landingStyle: CAPTURE_ANIMATIONS.VICTIM_LANDINGS[
      Math.floor(Math.random() * CAPTURE_ANIMATIONS.VICTIM_LANDINGS.length)
    ],
    expression: CAPTURE_ANIMATIONS.VICTIM_EXPRESSIONS[
      Math.floor(Math.random() * CAPTURE_ANIMATIONS.VICTIM_EXPRESSIONS.length)
    ]
  };
}

/**
 * Generate a taunt when capturing an opponent
 * Includes the jump-on animation!
 */
export function generateCaptureTaunt(smartPeg: SmartPeg, victimId: string): PegAction {
  const taunts = PEG_TAUNTS[smartPeg.personality];
  const taunt = taunts[Math.floor(Math.random() * taunts.length)];
  
  smartPeg.captureCount++;
  smartPeg.mood = 'TRIUMPHANT';
  smartPeg.celebrationPending = true;
  
  // Track rivalry
  if (!smartPeg.rivalPegId) {
    smartPeg.rivalPegId = victimId;
  }
  
  // Generate the dramatic capture animation
  const animation = generateHunterAnimation(smartPeg.personality);
  
  const action: PegAction = {
    type: 'CAPTURED_OPPONENT',
    victimId,
    taunt,
    animation
  };
  
  smartPeg.lastAction = action;
  return action;
}

/**
 * Generate a reaction when being captured
 * Includes the springboard somersault animation!
 */
export function generateCapturedReaction(
  smartPeg: SmartPeg, 
  hunterId: string,
  impactForce: number = 100
): PegAction {
  const reactions = PEG_REACTIONS.CAPTURED;
  const reaction = reactions[Math.floor(Math.random() * reactions.length)];
  
  smartPeg.timesCaptured++;
  smartPeg.mood = 'VENGEFUL';
  
  // Track rivalry
  smartPeg.rivalPegId = hunterId;
  
  // Generate the dramatic somersault animation
  const animation = generateVictimAnimation(impactForce);
  
  const action: PegAction = {
    type: 'WAS_CAPTURED',
    hunterId,
    reaction,
    animation
  };
  
  smartPeg.lastAction = action;
  return action;
}

/**
 * React to entering safe zone
 */
export function generateSafeZoneReaction(smartPeg: SmartPeg): PegAction {
  const reactions = PEG_REACTIONS.ENTERED_SAFE;
  const relief = reactions[Math.floor(Math.random() * reactions.length)];
  
  smartPeg.mood = 'RELAXED';
  
  const action: PegAction = {
    type: 'ENTERED_SAFE',
    relief
  };
  
  smartPeg.lastAction = action;
  return action;
}

/**
 * React to finishing (landing on winner hole)
 */
export function generateFinishedReaction(smartPeg: SmartPeg): PegAction {
  const reactions = PEG_REACTIONS.FINISHED;
  const celebration = reactions[Math.floor(Math.random() * reactions.length)];
  
  smartPeg.mood = 'TRIUMPHANT';
  smartPeg.celebrationPending = true;
  
  const action: PegAction = {
    type: 'FINISHED',
    celebration
  };
  
  smartPeg.lastAction = action;
  return action;
}

/**
 * React to a narrow escape (opponent just missed capturing this peg)
 */
export function generateNarrowEscapeReaction(smartPeg: SmartPeg): PegAction {
  const reactions = PEG_REACTIONS.NARROW_ESCAPE;
  const closeCall = reactions[Math.floor(Math.random() * reactions.length)];
  
  smartPeg.mood = 'NERVOUS';
  
  const action: PegAction = {
    type: 'NARROW_ESCAPE',
    closeCall
  };
  
  smartPeg.lastAction = action;
  return action;
}

// =============================================================================
// MOVE PREFERENCE (PERSONALITY-BASED)
// =============================================================================

export interface MoveOption {
  destination: string;
  capturesOpponent: boolean;
  entersFastTrack: boolean;
  entersSafe: boolean;
  entersCenter: boolean;
  risk: number; // 0-1, chance of being captured next turn
}

/**
 * Score a move option based on peg personality
 * Higher score = more preferred
 */
export function scoreMoveByPersonality(
  smartPeg: SmartPeg,
  option: MoveOption
): number {
  let score = 50; // Base score
  
  switch (smartPeg.personality) {
    case 'AGGRESSIVE':
      // Loves captures above all
      if (option.capturesOpponent) score += 100;
      if (option.entersFastTrack) score += 20;
      score -= option.risk * 10; // Slightly cares about risk
      break;
      
    case 'CAUTIOUS':
      // Safety first
      if (option.entersSafe) score += 100;
      score -= option.risk * 80; // Hates risk
      if (option.capturesOpponent) score += 30; // Still nice to capture
      break;
      
    case 'SHOWBOAT':
      // Fast track and center are glamorous
      if (option.entersCenter) score += 100;
      if (option.entersFastTrack) score += 80;
      if (option.capturesOpponent) score += 50;
      score -= option.risk * 20; // Risk is exciting!
      break;
      
    case 'STRATEGIC':
      // Balanced calculation
      if (option.capturesOpponent) score += 60;
      if (option.entersSafe) score += 50;
      score -= option.risk * 50;
      if (option.entersFastTrack) score += 30;
      break;
      
    case 'LOYAL':
      // Prefers moves that help team (blocking positions)
      if (option.entersSafe) score += 40;
      if (option.capturesOpponent) score += 40;
      score -= option.risk * 30;
      break;
      
    case 'WILDCARD':
      // Random bonus!
      score += Math.random() * 100;
      if (option.entersCenter) score += 50;
      if (option.capturesOpponent) score += 50;
      break;
  }
  
  // Rivalry bonus - always prioritize capturing nemesis
  if (option.capturesOpponent && smartPeg.rivalPegId) {
    score += 50;
  }
  
  // Vengeance mode
  if (smartPeg.mood === 'VENGEFUL' && option.capturesOpponent) {
    score += 30;
  }
  
  return score;
}

/**
 * Choose the best move from options based on personality
 */
export function chooseMoveByPersonality(
  smartPeg: SmartPeg,
  options: MoveOption[]
): MoveOption | null {
  if (options.length === 0) return null;
  if (options.length === 1) return options[0];
  
  let bestOption = options[0];
  let bestScore = scoreMoveByPersonality(smartPeg, options[0]);
  
  for (let i = 1; i < options.length; i++) {
    const score = scoreMoveByPersonality(smartPeg, options[i]);
    if (score > bestScore) {
      bestScore = score;
      bestOption = options[i];
    }
  }
  
  return bestOption;
}

// =============================================================================
// MANIFOLD INTEGRATION
// =============================================================================

/**
 * Log peg state to manifold for tracking
 */
export function createPegManifoldEntry(smartPeg: SmartPeg): Record<string, unknown> {
  return {
    pegId: smartPeg.id,
    playerId: smartPeg.playerId,
    personality: smartPeg.personality,
    mood: smartPeg.mood,
    position: smartPeg.positionId,
    holeIndex: smartPeg.currentHoleIndex,
    state: smartPeg.state,
    stats: {
      captures: smartPeg.captureCount,
      captured: smartPeg.timesCaptured,
      rival: smartPeg.rivalPegId
    },
    lastMove: {
      hops: smartPeg.hopsCounted,
      expected: smartPeg.cardValueExpected,
      verified: smartPeg.landingVerified,
      path: smartPeg.pathTraveled
    },
    lastAction: smartPeg.lastAction,
    timestamp: Date.now()
  };
}
