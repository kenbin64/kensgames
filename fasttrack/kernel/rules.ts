/**
 * FastTrack ButterflyFx Kernel - Game Rules & Reducer
 * 
 * Pure, deterministic game logic.
 * state' = applyEvent(state, event)
 */

import {
  GameState, GameConfig, GameEvent, EventType, GamePhase,
  Card, CardRank, Peg, PegState, Move, MoveType, MoveValidation,
  Player, PLAY_AGAIN_RANKS, BoardConfig
} from './types';
import {
  createBoard, getTrackIndex, getTrackPosition, getPlayerZone,
  isOnFastTrack, isInSafeZone, isWinnerPosition, getSafeIndex,
  getFastTrackIndex, getStepsToExit
} from './board';

// =============================================================================
// DETERMINISTIC RANDOM (Seeded PRNG)
// =============================================================================

function createRNG(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// =============================================================================
// CARD UTILITIES
// =============================================================================

function createDeck(playerId: number): Card[] {
  const deck: Card[] = [];
  const suits: Array<'hearts' | 'diamonds' | 'clubs' | 'spades'> = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks: CardRank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  
  let idx = 0;
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ id: `P${playerId}_CARD_${idx++}`, rank, suit });
    }
  }
  // Add 2 jokers
  deck.push({ id: `P${playerId}_CARD_52`, rank: 'JOKER', suit: null });
  deck.push({ id: `P${playerId}_CARD_53`, rank: 'JOKER', suit: null });
  
  return deck;
}

export function getCardValue(rank: CardRank): number {
  const values: Record<CardRank, number> = {
    'JOKER': 0, 'A': 1, '2': 2, '3': 3, '4': -4, '5': 5,
    '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 0, 'Q': 10, 'K': 1
  };
  return values[rank];
}

export function isPlayAgainCard(rank: CardRank): boolean {
  return PLAY_AGAIN_RANKS.includes(rank);
}

export function canExitHolding(rank: CardRank): boolean {
  return ['A', '6', 'K', 'JOKER'].includes(rank);
}

export function canExitCenter(rank: CardRank): boolean {
  return ['J', 'Q', 'K'].includes(rank);
}

// =============================================================================
// INIT GAME
// =============================================================================

export function initGame(config: GameConfig): GameState {
  const board = createBoard();
  const rng = createRNG(config.seed ?? Date.now());
  
  // Create players
  const players: Player[] = [];
  const colors = ['#4169e1', '#2ecc71', '#f1c40f', '#e74c3c', '#7f8c8d', '#e67e22'];
  const names = ['Blue', 'Green', 'Yellow', 'Red', 'Gray', 'Orange'];
  
  for (let i = 0; i < config.numPlayers; i++) {
    players.push({
      id: i,
      name: names[i],
      color: colors[i],
      connected: true,
      isBot: i > 0 && config.enableBots
    });
  }
  
  // Create pegs: 4 in holding, 1 on entry position (which is also winner spot)
  const pegs = new Map<string, Peg>();
  
  for (let playerId = 0; playerId < config.numPlayers; playerId++) {
    const zone = board.players[playerId];
    
    // 4 pegs in holding pen
    for (let i = 0; i < 4; i++) {
      const peg: Peg = {
        id: `PEG_${playerId}_${i}`,
        playerId,
        positionId: zone.holding[i],
        state: 'IN_HOLDING'
      };
      pegs.set(peg.id, peg);
    }
    
    // 1 peg on the entry position (also the "home hole" / winner position)
    const entryPeg: Peg = {
      id: `PEG_${playerId}_4`,
      playerId,
      positionId: zone.entryPosition,
      state: 'ON_TRACK'
    };
    pegs.set(entryPeg.id, entryPeg);
  }
  
  // Create and shuffle decks
  const decks = new Map<number, Card[]>();
  const hands = new Map<number, Card[]>();
  const discards = new Map<number, Card[]>();
  
  for (let playerId = 0; playerId < config.numPlayers; playerId++) {
    const deck = shuffleArray(createDeck(playerId), rng);
    decks.set(playerId, deck);
    discards.set(playerId, []);
    
    // Draw initial hand
    const hand: Card[] = [];
    for (let i = 0; i < config.cardsPerHand; i++) {
      const card = deck.pop();
      if (card) hand.push(card);
    }
    hands.set(playerId, hand);
  }
  
  return {
    config,
    board,
    players,
    currentPlayerId: 0,
    turnNumber: 1,
    pegs,
    decks,
    hands,
    discards,
    mustPlayAgain: false,
    selectedCard: null,
    phase: 'PLAYING',
    winner: null,
    rankings: [],
    startedAt: Date.now(),
    lastEventId: ''
  };
}

// =============================================================================
// MOVE VALIDATION
// =============================================================================

export function getPegAt(state: GameState, positionId: string): Peg | undefined {
  for (const peg of state.pegs.values()) {
    if (peg.positionId === positionId) return peg;
  }
  return undefined;
}

export function getPlayerPegs(state: GameState, playerId: number): Peg[] {
  return Array.from(state.pegs.values()).filter(p => p.playerId === playerId);
}

export function hasPlayerOnFastTrack(state: GameState, playerId: number): boolean {
  return getPlayerPegs(state, playerId).some(p => 
    isOnFastTrack(state.board, p.positionId)
  );
}

export function validateMove(state: GameState, pegId: string, card: Card, targetPosition?: string): MoveValidation {
  const peg = state.pegs.get(pegId);
  if (!peg) return { valid: false, reason: 'Peg not found' };
  if (peg.playerId !== state.currentPlayerId) return { valid: false, reason: 'Not your peg' };
  if (state.phase !== 'PLAYING') return { valid: false, reason: 'Game not in play phase' };
  
  // If player has peg on fast track, they must move it first
  if (hasPlayerOnFastTrack(state, peg.playerId) && !isOnFastTrack(state.board, peg.positionId)) {
    return { valid: false, reason: 'Must move fast track peg first' };
  }
  
  const validMoves = getValidMoves(state, pegId, card);
  if (validMoves.length === 0) {
    return { valid: false, reason: 'No valid moves for this peg with this card' };
  }
  
  if (targetPosition) {
    const targetMove = validMoves.find(m => m.to === targetPosition);
    if (!targetMove) {
      return { valid: false, reason: 'Invalid target position' };
    }
    return { valid: true, moves: [targetMove] };
  }
  
  return { valid: true, moves: validMoves };
}

export function getValidMoves(state: GameState, pegId: string, card: Card): Move[] {
  const peg = state.pegs.get(pegId);
  if (!peg) return [];
  
  const moves: Move[] = [];
  const board = state.board;
  const zone = getPlayerZone(board, peg.playerId);
  const rank = card.rank;
  const value = getCardValue(rank);
  
  // === IN HOLDING PEN ===
  if (peg.state === 'IN_HOLDING') {
    if (canExitHolding(rank)) {
      const entryPos = zone.entryPosition;
      const occupant = getPegAt(state, entryPos);
      
      // Can exit if entry is empty or has opponent
      if (!occupant || occupant.playerId !== peg.playerId) {
        moves.push({
          pegId,
          type: 'EXIT_HOLDING',
          from: peg.positionId,
          to: entryPos,
          cardId: card.id,
          capturedPegId: occupant?.id
        });
      }
    }
    return moves;
  }
  
  // === ON CENTER (Bull's Eye) ===
  if (peg.positionId === 'CENTER') {
    if (canExitCenter(rank)) {
      const ftPos = zone.fasttrack;
      const occupant = getPegAt(state, ftPos);
      if (!occupant || occupant.playerId !== peg.playerId) {
        moves.push({
          pegId,
          type: 'EXIT_CENTER',
          from: 'CENTER',
          to: ftPos,
          cardId: card.id,
          capturedPegId: occupant?.id
        });
      }
    }
    return moves;
  }
  
  // === ON FAST TRACK ===
  if (isOnFastTrack(board, peg.positionId)) {
    const ftIdx = getFastTrackIndex(board, peg.positionId);
    const playerFtIdx = peg.playerId;
    
    // Can only exit at own fast track position
    if (ftIdx === playerFtIdx && value !== 0) {
      // Exit to main track toward safe zone
      const exitPos = zone.exitPosition;
      const destIdx = getTrackIndex(board, exitPos);
      
      // Move forward on track
      if (value > 0) {
        const newIdx = (destIdx + (value - 1) + board.trackOrder.length) % board.trackOrder.length;
        const destPos = getTrackPosition(board, newIdx);
        const occupant = getPegAt(state, destPos);
        
        if (!occupant || occupant.playerId !== peg.playerId) {
          moves.push({
            pegId,
            type: 'EXIT_FASTTRACK',
            from: peg.positionId,
            to: destPos,
            cardId: card.id,
            capturedPegId: occupant?.id
          });
        }
      }
    }
    
    // Move around fast track ring (forward)
    if (value > 0 && value <= 6) {
      for (let steps = 1; steps <= value; steps++) {
        const newFtIdx = (ftIdx + steps) % 6;
        // Can't pass own color going forward
        if (newFtIdx === playerFtIdx && steps < value) continue;
        
        if (steps === value) {
          const destPos = board.fasttrackRing[newFtIdx];
          const occupant = getPegAt(state, destPos);
          if (!occupant || occupant.playerId !== peg.playerId) {
            moves.push({
              pegId,
              type: 'MOVE_FASTTRACK',
              from: peg.positionId,
              to: destPos,
              cardId: card.id,
              capturedPegId: occupant?.id
            });
          }
        }
      }
    }
    
    return moves;
  }
  
  // === IN SAFE ZONE ===
  if (peg.state === 'IN_SAFE') {
    const safeIdx = getSafeIndex(board, peg.positionId, peg.playerId);
    
    if (value > 0) {
      const newIdx = safeIdx + value;
      if (newIdx < 4) {
        // Move within safe
        const destPos = zone.safe[newIdx];
        if (!getPegAt(state, destPos)) {
          moves.push({
            pegId,
            type: 'MOVE_IN_SAFE',
            from: peg.positionId,
            to: destPos,
            cardId: card.id
          });
        }
      } else if (newIdx === 4) {
        // Land exactly on winner
        if (!getPegAt(state, zone.winner)) {
          moves.push({
            pegId,
            type: 'FINISH',
            from: peg.positionId,
            to: zone.winner,
            cardId: card.id
          });
        }
      }
    }
    return moves;
  }
  
  // === ON MAIN TRACK ===
  if (peg.state === 'ON_TRACK') {
    const currentIdx = getTrackIndex(board, peg.positionId);
    const trackLen = board.trackOrder.length;
    const stepsToExit = getStepsToExit(board, peg.positionId, peg.playerId);
    
    // JACK: Swap with opponent
    if (rank === 'J') {
      for (const other of state.pegs.values()) {
        if (other.playerId !== peg.playerId && other.state === 'ON_TRACK') {
          moves.push({
            pegId,
            type: 'SWAP',
            from: peg.positionId,
            to: other.positionId,
            cardId: card.id,
            swappedWithPegId: other.id
          });
        }
      }
    }
    
    // JOKER: Move anywhere (except home hole)
    if (rank === 'JOKER') {
      for (const pos of board.trackOrder) {
        if (pos !== peg.positionId) {
          const occupant = getPegAt(state, pos);
          if (!occupant || occupant.playerId !== peg.playerId) {
            moves.push({
              pegId,
              type: 'WILD_MOVE',
              from: peg.positionId,
              to: pos,
              cardId: card.id,
              capturedPegId: occupant?.id
            });
          }
        }
      }
    }
    
    // Forward moves
    if (value > 0) {
      // Check if we should enter safe zone
      if (value >= stepsToExit && value <= stepsToExit + 4) {
        const safeIdx = value - stepsToExit - 1;
        if (safeIdx >= 0 && safeIdx < 4) {
          const safePos = zone.safe[safeIdx];
          if (!getPegAt(state, safePos)) {
            moves.push({
              pegId,
              type: 'ENTER_SAFE',
              from: peg.positionId,
              to: safePos,
              cardId: card.id
            });
          }
        }
      }
      
      // Check if can enter winner directly (exactly stepsToExit + 5)
      if (value === stepsToExit + 5) {
        if (!getPegAt(state, zone.winner)) {
          moves.push({
            pegId,
            type: 'FINISH',
            from: peg.positionId,
            to: zone.winner,
            cardId: card.id
          });
        }
      }
      
      // Regular forward move (if not passing exit)
      if (value < stepsToExit) {
        const destIdx = (currentIdx + value) % trackLen;
        const destPos = getTrackPosition(board, destIdx);
        
        // Check path for own pegs (can't pass own)
        let canMove = true;
        for (let i = 1; i <= value; i++) {
          const checkIdx = (currentIdx + i) % trackLen;
          const checkPos = getTrackPosition(board, checkIdx);
          const occupant = getPegAt(state, checkPos);
          if (occupant && occupant.playerId === peg.playerId && i < value) {
            canMove = false;
            break;
          }
        }
        
        if (canMove) {
          const finalOccupant = getPegAt(state, destPos);
          if (!finalOccupant || finalOccupant.playerId !== peg.playerId) {
            moves.push({
              pegId,
              type: 'MOVE_FORWARD',
              from: peg.positionId,
              to: destPos,
              cardId: card.id,
              capturedPegId: finalOccupant?.id
            });
          }
        }
      }
      
      // Check fast track entry (overshoot by 1)
      // Enter fast track if landing exactly 1 past a fast track junction
      const ftJunction = board.fasttrackRing.findIndex((ftId, idx) => {
        const ftZone = board.players[idx];
        const junctionIdx = getTrackIndex(board, ftZone.outerRim[0]); // Start of player section
        const distToJunction = ((junctionIdx - currentIdx) % trackLen + trackLen) % trackLen;
        return distToJunction === value - 1;
      });
      
      if (ftJunction !== -1) {
        const centerOccupant = getPegAt(state, 'CENTER');
        if (!centerOccupant || centerOccupant.playerId !== peg.playerId) {
          moves.push({
            pegId,
            type: 'ENTER_CENTER',
            from: peg.positionId,
            to: 'CENTER',
            cardId: card.id,
            capturedPegId: centerOccupant?.id
          });
        }
      }
    }
    
    // Backward moves (4 card)
    if (value < 0) {
      const dist = Math.abs(value);
      const destIdx = ((currentIdx - dist) % trackLen + trackLen) % trackLen;
      const destPos = getTrackPosition(board, destIdx);
      
      // Check path for own pegs
      let canMove = true;
      for (let i = 1; i <= dist; i++) {
        const checkIdx = ((currentIdx - i) % trackLen + trackLen) % trackLen;
        const checkPos = getTrackPosition(board, checkIdx);
        const occupant = getPegAt(state, checkPos);
        if (occupant && occupant.playerId === peg.playerId && i < dist) {
          canMove = false;
          break;
        }
      }
      
      if (canMove) {
        const finalOccupant = getPegAt(state, destPos);
        if (!finalOccupant || finalOccupant.playerId !== peg.playerId) {
          moves.push({
            pegId,
            type: 'MOVE_BACKWARD',
            from: peg.positionId,
            to: destPos,
            cardId: card.id,
            capturedPegId: finalOccupant?.id
          });
        }
      }
    }
  }
  
  return moves;
}

// =============================================================================
// APPLY MOVE
// =============================================================================

export function applyMove(state: GameState, move: Move): GameState {
  const newState = cloneState(state);
  const peg = newState.pegs.get(move.pegId)!;
  const board = newState.board;
  
  // Handle capture
  if (move.capturedPegId) {
    const captured = newState.pegs.get(move.capturedPegId)!;
    const capZone = getPlayerZone(board, captured.playerId);
    // Send to first empty holding spot
    for (const holdId of capZone.holding) {
      if (!getPegAt(newState, holdId)) {
        captured.positionId = holdId;
        captured.state = 'IN_HOLDING';
        break;
      }
    }
  }
  
  // Handle swap
  if (move.swappedWithPegId) {
    const other = newState.pegs.get(move.swappedWithPegId)!;
    other.positionId = peg.positionId;
  }
  
  // Move the peg
  peg.positionId = move.to;
  
  // Update peg state
  const destPos = board.positions.get(move.to);
  if (destPos) {
    switch (destPos.type) {
      case 'OUTER_RIM':
      case 'FASTTRACK':
        peg.state = 'ON_TRACK';
        break;
      case 'SAFE':
        peg.state = 'IN_SAFE';
        break;
      case 'WINNER':
        peg.state = 'FINISHED';
        break;
      case 'CENTER':
        peg.state = 'ON_TRACK'; // Treat center as special track position
        break;
    }
  }
  
  // Check for winner
  checkWinner(newState, peg.playerId);
  
  return newState;
}

// =============================================================================
// CHECK WINNER
// =============================================================================

function checkWinner(state: GameState, playerId: number): void {
  const zone = getPlayerZone(state.board, playerId);
  const pegs = getPlayerPegs(state, playerId);
  
  // Win condition: 4 pegs in safe + 1 peg on winner position
  const inSafe = pegs.filter(p => p.state === 'IN_SAFE').length;
  const finished = pegs.filter(p => p.state === 'FINISHED').length;
  
  // Player wins when they have all pegs either in safe or finished, with final peg on winner
  if (inSafe === 4 && finished === 1) {
    if (!state.rankings.includes(playerId)) {
      state.rankings.push(playerId);
    }
    if (state.rankings.length === 1) {
      state.winner = playerId;
    }
    if (state.rankings.length === state.config.numPlayers) {
      state.phase = 'GAME_OVER';
    }
  }
}

// =============================================================================
// CARD MANAGEMENT
// =============================================================================

export function playCard(state: GameState, cardIndex: number): GameState {
  const newState = cloneState(state);
  const hand = newState.hands.get(state.currentPlayerId)!;
  
  if (cardIndex < 0 || cardIndex >= hand.length) return state;
  
  const card = hand.splice(cardIndex, 1)[0];
  newState.discards.get(state.currentPlayerId)!.push(card);
  newState.selectedCard = card;
  
  return newState;
}

export function endTurn(state: GameState, playAgain: boolean): GameState {
  const newState = cloneState(state);
  
  if (playAgain && newState.selectedCard && isPlayAgainCard(newState.selectedCard.rank)) {
    newState.mustPlayAgain = true;
    newState.selectedCard = null;
  } else {
    newState.mustPlayAgain = false;
    newState.selectedCard = null;
    
    // Draw back to hand limit
    const hand = newState.hands.get(newState.currentPlayerId)!;
    const deck = newState.decks.get(newState.currentPlayerId)!;
    const discard = newState.discards.get(newState.currentPlayerId)!;
    
    while (hand.length < newState.config.cardsPerHand) {
      if (deck.length === 0 && discard.length > 0) {
        // Shuffle discard into deck
        const rng = createRNG(newState.turnNumber * 1000 + newState.currentPlayerId);
        const reshuffled = shuffleArray(discard.splice(0, discard.length), rng);
        deck.push(...reshuffled);
      }
      if (deck.length > 0) {
        hand.push(deck.pop()!);
      } else {
        break;
      }
    }
    
    // Next player
    newState.currentPlayerId = (newState.currentPlayerId + 1) % newState.config.numPlayers;
    newState.turnNumber++;
  }
  
  return newState;
}

// =============================================================================
// EVENT REDUCER
// =============================================================================

export function applyEvent(state: GameState, event: GameEvent): GameState {
  let newState = cloneState(state);
  newState.lastEventId = event.id;
  
  switch (event.type) {
    case 'CARD_PLAYED': {
      const { cardIndex } = event.payload as { cardIndex: number };
      newState = playCard(newState, cardIndex);
      break;
    }
    
    case 'PEG_MOVED': {
      const move = event.payload as unknown as Move;
      newState = applyMove(newState, move);
      break;
    }
    
    case 'TURN_ENDED': {
      const { playAgain } = event.payload as { playAgain: boolean };
      newState = endTurn(newState, playAgain);
      break;
    }
    
    case 'PLAYER_JOINED': {
      const { playerId, name } = event.payload as { playerId: number; name: string };
      if (newState.players[playerId]) {
        newState.players[playerId].connected = true;
        newState.players[playerId].name = name;
      }
      break;
    }
    
    case 'PLAYER_LEFT': {
      const { playerId } = event.payload as { playerId: number };
      if (newState.players[playerId]) {
        newState.players[playerId].connected = false;
      }
      break;
    }
    
    case 'GAME_STARTED': {
      newState.phase = 'PLAYING';
      newState.startedAt = event.timestamp;
      break;
    }
    
    case 'GAME_ENDED': {
      newState.phase = 'GAME_OVER';
      break;
    }
  }
  
  return newState;
}

// =============================================================================
// STATE UTILITIES
// =============================================================================

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: [...state.players],
    pegs: new Map(state.pegs),
    decks: new Map(Array.from(state.decks.entries()).map(([k, v]) => [k, [...v]])),
    hands: new Map(Array.from(state.hands.entries()).map(([k, v]) => [k, [...v]])),
    discards: new Map(Array.from(state.discards.entries()).map(([k, v]) => [k, [...v]])),
    rankings: [...state.rankings]
  };
}

export function hashState(state: GameState): string {
  // Simple hash for state verification
  const pegs = Array.from(state.pegs.values())
    .map(p => `${p.id}:${p.positionId}`)
    .sort()
    .join(',');
  const turn = `T${state.turnNumber}P${state.currentPlayerId}`;
  return btoa(`${turn}|${pegs}`).slice(0, 16);
}
