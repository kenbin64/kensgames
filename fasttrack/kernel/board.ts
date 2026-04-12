/**
 * FastTrack Board Configuration
 * 
 * Canonical board layout for 6-player hexagonal Fast Track.
 * Based on exact specification with:
 * - CENTER: Bull's eye
 * - FASTTRACK_RING: 6 positions (FT_0 through FT_5)
 * - 6 players, each with:
 *   - 13 outer rim positions
 *   - 4 holding positions
 *   - 4 safe zone positions
 *   - 1 winner position
 */

import { BoardConfig, Position, PositionType, PlayerZone } from './types';

// =============================================================================
// BOARD GEOMETRY CONSTANTS
// =============================================================================

const OUTER_RADIUS = 280;
const FASTTRACK_RADIUS = 100;
const SAFE_RADIUS = 180;
const HOLDING_RADIUS = 320;

// Player angles (hexagon vertices, flat-top orientation)
const PLAYER_ANGLES = [90, 30, -30, -90, -150, 150]; // degrees

// =============================================================================
// POSITION GENERATORS
// =============================================================================

function hexVertex(angleDeg: number, radius: number): { x: number; y: number; z: number } {
  const a = angleDeg * Math.PI / 180;
  return { x: radius * Math.cos(a), y: 0, z: radius * Math.sin(a) };
}

function lerp(p1: { x: number; z: number }, p2: { x: number; z: number }, t: number) {
  return { x: p1.x + (p2.x - p1.x) * t, y: 0, z: p1.z + (p2.z - p1.z) * t };
}

// =============================================================================
// CREATE CANONICAL BOARD
// =============================================================================

export function createBoard(): BoardConfig {
  const positions = new Map<string, Position>();
  const players: PlayerZone[] = [];
  const trackOrder: string[] = [];

  // 1. CENTER (Bull's Eye)
  positions.set('CENTER', {
    id: 'CENTER',
    type: 'CENTER',
    coords: { x: 0, y: 0, z: 0 }
  });

  // 2. FASTTRACK RING - 6 pentagon-shaped holes forming inner hexagon
  // Players traverse these clockwise after landing on one
  // Each player's home FT hole matches their player index
  const fasttrackRing: string[] = [];
  for (let i = 0; i < 6; i++) {
    const id = `FT_${i}`;
    const coords = hexVertex(PLAYER_ANGLES[i], FASTTRACK_RADIUS);
    positions.set(id, {
      id,
      type: 'FASTTRACK',
      playerId: i,  // This player's "home" fast track hole
      index: i,
      coords
    });
    fasttrackRing.push(id);
  }

  // 3. PLAYER ZONES
  for (let playerId = 0; playerId < 6; playerId++) {
    const angle = PLAYER_ANGLES[playerId];
    const nextAngle = PLAYER_ANGLES[(playerId + 1) % 6];
    
    // Calculate hexagon edge vertices
    const v1 = hexVertex(angle, OUTER_RADIUS);
    const v2 = hexVertex(nextAngle, OUTER_RADIUS);
    
    // Direction from center to edge midpoint
    const edgeMid = { x: (v1.x + v2.x) / 2, z: (v1.z + v2.z) / 2 };
    const dist = Math.sqrt(edgeMid.x ** 2 + edgeMid.z ** 2);
    const dirX = edgeMid.x / dist;
    const dirZ = edgeMid.z / dist;

    // === OUTER RIM: 13 positions along the edge ===
    const outerRim: string[] = [];
    for (let i = 0; i < 13; i++) {
      const id = `OR_${playerId}_${String(i).padStart(2, '0')}`;
      const t = (i + 0.5) / 13;
      const coords = lerp(v1, v2, t);
      positions.set(id, {
        id,
        type: 'OUTER_RIM',
        playerId,
        index: i,
        coords
      });
      outerRim.push(id);
    }

    // === HOLDING PEN: 4 positions (2x2 grid) ===
    const holding: string[] = [];
    const holdCenter = { 
      x: edgeMid.x + dirX * 60, 
      z: edgeMid.z + dirZ * 60 
    };
    
    // Perpendicular direction along edge
    const perpX = (v2.x - v1.x) / Math.sqrt((v2.x - v1.x) ** 2 + (v2.z - v1.z) ** 2);
    const perpZ = (v2.z - v1.z) / Math.sqrt((v2.x - v1.x) ** 2 + (v2.z - v1.z) ** 2);
    
    const holdSpacing = 18;
    for (let i = 0; i < 4; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const id = `P${playerId}_HOLD_${i}`;
      positions.set(id, {
        id,
        type: 'HOLDING',
        playerId,
        index: i,
        coords: {
          x: holdCenter.x + (col - 0.5) * holdSpacing * perpX + (row - 0.5) * holdSpacing * dirX * 0.7,
          y: 0,
          z: holdCenter.z + (col - 0.5) * holdSpacing * perpZ + (row - 0.5) * holdSpacing * dirZ * 0.7
        }
      });
      holding.push(id);
    }

    // === SAFE ZONE: 4 positions leading toward center ===
    const safe: string[] = [];
    const safeStart = { x: dirX * (OUTER_RADIUS - 20), z: dirZ * (OUTER_RADIUS - 20) };
    const safeEnd = { x: dirX * (FASTTRACK_RADIUS + 30), z: dirZ * (FASTTRACK_RADIUS + 30) };
    
    for (let i = 0; i < 4; i++) {
      const id = `P${playerId}_SAFE_${i}`;
      const t = i / 3;
      const coords = lerp(safeStart, safeEnd, t);
      positions.set(id, {
        id,
        type: 'SAFE',
        playerId,
        index: i,
        coords
      });
      safe.push(id);
    }

    // === WINNER POSITION: Just outside holding (entry point) ===
    // This is OR_X_06 (middle of outer rim) which serves as both entry and winner
    const winner = outerRim[6]; // Middle position
    
    // Update the winner position's type
    const winnerPos = positions.get(winner)!;
    positions.set(`P${playerId}_WINNER`, {
      id: `P${playerId}_WINNER`,
      type: 'WINNER',
      playerId,
      coords: winnerPos.coords
    });

    // Entry position (where pegs enter from holding)
    const entryPosition = outerRim[6];
    
    // Exit position (where pegs exit to safe zone - last position before next player's section)
    const exitPosition = outerRim[12];

    players.push({
      id: playerId,
      outerRim,
      holding,
      safe,
      winner: `P${playerId}_WINNER`,
      fasttrack: `FT_${playerId}`,
      entryPosition,
      exitPosition
    });
  }

  // 4. BUILD TRACK ORDER (complete outer rim clockwise)
  for (let p = 0; p < 6; p++) {
    trackOrder.push(...players[p].outerRim);
  }

  return {
    center: 'CENTER',
    fasttrackRing,
    players,
    positions,
    trackOrder
  };
}

// =============================================================================
// BOARD NAVIGATION HELPERS
// =============================================================================

export function getTrackIndex(board: BoardConfig, positionId: string): number {
  return board.trackOrder.indexOf(positionId);
}

export function getTrackPosition(board: BoardConfig, index: number): string {
  const len = board.trackOrder.length;
  return board.trackOrder[((index % len) + len) % len];
}

export function getPlayerZone(board: BoardConfig, playerId: number): PlayerZone {
  return board.players[playerId];
}

export function getPositionOwner(board: BoardConfig, positionId: string): number | undefined {
  return board.positions.get(positionId)?.playerId;
}

export function isOnFastTrack(board: BoardConfig, positionId: string): boolean {
  return board.fasttrackRing.includes(positionId);
}

/**
 * Get the next fast track hole clockwise from current position
 */
export function getNextFastTrackHole(board: BoardConfig, currentFT: string): string {
  const idx = board.fasttrackRing.indexOf(currentFT);
  if (idx === -1) return currentFT;
  return board.fasttrackRing[(idx + 1) % 6];
}

/**
 * Get the previous fast track hole (counter-clockwise)
 */
export function getPrevFastTrackHole(board: BoardConfig, currentFT: string): string {
  const idx = board.fasttrackRing.indexOf(currentFT);
  if (idx === -1) return currentFT;
  return board.fasttrackRing[(idx + 5) % 6]; // +5 is same as -1 mod 6
}

/**
 * Get player's home fast track hole
 */
export function getPlayerHomeFastTrack(board: BoardConfig, playerId: number): string {
  return board.players[playerId].fasttrack;
}

/**
 * Get distance (number of hops) from current FT position to target FT position
 * Traveling clockwise
 */
export function getFastTrackDistance(board: BoardConfig, from: string, to: string): number {
  const fromIdx = board.fasttrackRing.indexOf(from);
  const toIdx = board.fasttrackRing.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return -1;
  return ((toIdx - fromIdx) % 6 + 6) % 6;
}

/**
 * Find the exit fast track hole for a player.
 * Normally their home hole, but if occupied by own peg, use previous hole.
 * @param board - The board configuration
 * @param playerId - The player trying to exit
 * @param occupiedPositions - Set of position IDs occupied by this player's pegs
 */
export function findFastTrackExit(
  board: BoardConfig, 
  playerId: number, 
  occupiedPositions: Set<string>
): string {
  const homeHole = getPlayerHomeFastTrack(board, playerId);
  
  // Check backwards from home hole to find first unoccupied
  let current = homeHole;
  for (let i = 0; i < 6; i++) {
    if (!occupiedPositions.has(current)) {
      return current;
    }
    current = getPrevFastTrackHole(board, current);
  }
  
  // All occupied (shouldn't happen normally)
  return homeHole;
}

export function isInSafeZone(board: BoardConfig, positionId: string, playerId: number): boolean {
  return board.players[playerId].safe.includes(positionId);
}

export function isWinnerPosition(board: BoardConfig, positionId: string, playerId: number): boolean {
  return positionId === board.players[playerId].winner;
}

export function getSafeIndex(board: BoardConfig, positionId: string, playerId: number): number {
  return board.players[playerId].safe.indexOf(positionId);
}

export function getFastTrackIndex(board: BoardConfig, positionId: string): number {
  return board.fasttrackRing.indexOf(positionId);
}

// =============================================================================
// CENTER (BULL'S EYE) RULES
// =============================================================================

/**
 * Check if a peg can enter the center (bull's eye).
 * Rules:
 * - Must be on a fast track hole
 * - Must be moving CLOCKWISE (forward, not with a 4 card)
 * - Center must not be occupied by own peg
 * 
 * @param board - Board configuration
 * @param fromPosition - Current position (must be FT hole)
 * @param isMovingBackward - True if moving with a 4 card (counter-clockwise)
 */
export function canEnterCenter(
  board: BoardConfig, 
  fromPosition: string, 
  isMovingBackward: boolean
): boolean {
  // Must be on a fast track hole
  if (!isOnFastTrack(board, fromPosition)) {
    return false;
  }
  
  // Cannot enter center when moving backward (4 card)
  if (isMovingBackward) {
    return false;
  }
  
  return true;
}

/**
 * When moving backward (4 card), fast track holes act as regular outer rim positions.
 * This returns the equivalent outer rim position for a FT hole.
 * 
 * Each FT hole corresponds to the entry point of that player's section.
 */
export function getFastTrackAsOuterRim(board: BoardConfig, ftPosition: string): string | null {
  const ftIdx = getFastTrackIndex(board, ftPosition);
  if (ftIdx === -1) return null;
  
  // FT_X corresponds to player X's entry position
  return board.players[ftIdx].entryPosition;
}

/**
 * Check if position is the center (bull's eye)
 */
export function isCenter(board: BoardConfig, positionId: string): boolean {
  return positionId === board.center;
}

// =============================================================================
// SAFE ZONE RULES
// =============================================================================

/**
 * Check if a player's safe zone is completely full
 */
export function isSafeZoneFull(
  board: BoardConfig, 
  playerId: number, 
  occupiedPositions: Set<string>
): boolean {
  const zone = getPlayerZone(board, playerId);
  return zone.safe.every(pos => occupiedPositions.has(pos));
}

/**
 * Get the next available (unoccupied) safe zone position
 * Safe zone fills in order: SAFE_0, SAFE_1, SAFE_2, SAFE_3
 * Returns null if safe zone is full
 */
export function getNextSafePosition(
  board: BoardConfig, 
  playerId: number, 
  occupiedPositions: Set<string>
): string | null {
  const zone = getPlayerZone(board, playerId);
  for (const pos of zone.safe) {
    if (!occupiedPositions.has(pos)) {
      return pos;
    }
  }
  return null;
}

/**
 * Check if a peg would pass/overtake the safe zone entry point.
 * Players CANNOT pass their exit position - they MUST turn into safe zone.
 * 
 * @param board - Board configuration
 * @param playerId - The player moving
 * @param fromPosition - Current position on outer rim
 * @param toPosition - Target position
 * @returns true if the move would illegally pass the safe zone entry
 */
export function wouldPassSafeZoneEntry(
  board: BoardConfig,
  playerId: number,
  fromPosition: string,
  toPosition: string
): boolean {
  const zone = getPlayerZone(board, playerId);
  const fromIdx = getTrackIndex(board, fromPosition);
  const exitIdx = getTrackIndex(board, zone.exitPosition);
  const toIdx = getTrackIndex(board, toPosition);
  
  if (fromIdx === -1 || toIdx === -1 || exitIdx === -1) return false;
  
  const len = board.trackOrder.length;
  
  // Calculate distances (clockwise)
  const distToExit = ((exitIdx - fromIdx) % len + len) % len;
  const distToTarget = ((toIdx - fromIdx) % len + len) % len;
  
  // If target is beyond exit point (and we haven't wrapped around fully)
  // then we're passing the safe zone entry
  if (distToTarget > distToExit && distToExit > 0) {
    return true;
  }
  
  return false;
}

/**
 * Check if a move to the winner hole is valid.
 * Requires EXACT card value - no overshooting.
 * Safe zone must be full before attempting winner.
 * 
 * @param board - Board configuration
 * @param playerId - The player moving
 * @param fromPosition - Current position (should be last safe zone or exit position)
 * @param cardValue - The value of the played card
 * @param occupiedPositions - Set of positions occupied by this player's pegs
 * @returns Object with valid flag and reason if invalid
 */
export function canMoveToWinner(
  board: BoardConfig,
  playerId: number,
  fromPosition: string,
  cardValue: number,
  occupiedPositions: Set<string>
): { valid: boolean; reason?: string } {
  const zone = getPlayerZone(board, playerId);
  
  // Check if safe zone is full
  if (!isSafeZoneFull(board, playerId, occupiedPositions)) {
    return { valid: false, reason: 'Safe zone must be completely filled before moving to winner' };
  }
  
  // Calculate exact distance needed
  const safeIdx = getSafeIndex(board, fromPosition, playerId);
  
  if (safeIdx === -1) {
    // Not in safe zone - check if at exit position
    if (fromPosition !== zone.exitPosition) {
      return { valid: false, reason: 'Must be in safe zone or at exit position' };
    }
    // From exit: need to traverse all 4 safe positions + 1 for winner = 5
    const exactDistance = 5;
    if (cardValue !== exactDistance) {
      return { valid: false, reason: `Need exact value ${exactDistance} to reach winner, card is ${cardValue}` };
    }
    return { valid: true };
  }
  
  // From safe zone position: distance = remaining safe positions + 1 for winner
  // SAFE_0 -> 4 spaces to winner (3 safe + 1 winner)
  // SAFE_1 -> 3 spaces to winner (2 safe + 1 winner)
  // SAFE_2 -> 2 spaces to winner (1 safe + 1 winner)
  // SAFE_3 -> 1 space to winner
  const exactDistance = 4 - safeIdx;
  
  if (cardValue !== exactDistance) {
    return { valid: false, reason: `Need exact value ${exactDistance} to reach winner, card is ${cardValue}` };
  }
  
  return { valid: true };
}

/**
 * Get the distance from current position to the last safe zone position
 */
export function getDistanceToSafeZoneEnd(
  board: BoardConfig,
  playerId: number,
  fromPosition: string
): number {
  const zone = getPlayerZone(board, playerId);
  const lastSafe = zone.safe[zone.safe.length - 1];
  
  const safeIdx = getSafeIndex(board, fromPosition, playerId);
  
  if (safeIdx !== -1) {
    // Already in safe zone
    return zone.safe.length - 1 - safeIdx;
  }
  
  // On outer rim - need to get to exit first, then traverse safe zone
  if (fromPosition === zone.exitPosition) {
    return zone.safe.length;
  }
  
  // Not at exit yet
  return -1;
}

// =============================================================================
// DISTANCE CALCULATIONS
// =============================================================================

export function getTrackDistance(board: BoardConfig, from: string, to: string): number {
  const fromIdx = getTrackIndex(board, from);
  const toIdx = getTrackIndex(board, to);
  if (fromIdx === -1 || toIdx === -1) return -1;
  
  const len = board.trackOrder.length;
  return ((toIdx - fromIdx) % len + len) % len;
}

export function getStepsToExit(board: BoardConfig, positionId: string, playerId: number): number {
  const zone = getPlayerZone(board, playerId);
  const currentIdx = getTrackIndex(board, positionId);
  const exitIdx = getTrackIndex(board, zone.exitPosition);
  
  if (currentIdx === -1 || exitIdx === -1) return -1;
  
  const len = board.trackOrder.length;
  let steps = ((exitIdx - currentIdx) % len + len) % len;
  if (steps === 0) steps = len; // Full lap if already at exit
  
  return steps;
}
