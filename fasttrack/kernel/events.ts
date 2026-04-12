/**
 * FastTrack Event Schema for Manifold Ingestion
 * 
 * All events are self-describing and contain enough context
 * to reconstruct state through replay.
 */

import { EventType, GameEvent, Move, Card, ManifoldRecord, GamePhase, GameState } from './types';
import { hashState } from './rules';

// =============================================================================
// EVENT FACTORY
// =============================================================================

let sequenceCounter = 0;

function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createEvent(
  type: EventType,
  actor: string,
  payload: Record<string, unknown>
): GameEvent {
  return {
    id: generateEventId(),
    type,
    timestamp: Date.now(),
    actor,
    payload,
    sequence: ++sequenceCounter
  };
}

// =============================================================================
// EVENT CREATORS
// =============================================================================

export function createGameCreatedEvent(config: {
  numPlayers: number;
  gameId: string;
  hostId: string;
}): GameEvent {
  return createEvent('GAME_CREATED', 'SYSTEM', {
    gameId: config.gameId,
    hostId: config.hostId,
    numPlayers: config.numPlayers,
    createdAt: Date.now()
  });
}

export function createPlayerJoinedEvent(
  playerId: number,
  name: string,
  peerId: string
): GameEvent {
  return createEvent('PLAYER_JOINED', `P${playerId}`, {
    playerId,
    name,
    peerId,
    joinedAt: Date.now()
  });
}

export function createPlayerLeftEvent(playerId: number, reason: string): GameEvent {
  return createEvent('PLAYER_LEFT', `P${playerId}`, {
    playerId,
    reason,
    leftAt: Date.now()
  });
}

export function createGameStartedEvent(startingPlayerId: number): GameEvent {
  return createEvent('GAME_STARTED', 'SYSTEM', {
    startingPlayerId,
    startedAt: Date.now()
  });
}

export function createCardDrawnEvent(playerId: number, cards: Card[]): GameEvent {
  return createEvent('CARD_DRAWN', `P${playerId}`, {
    playerId,
    cards: cards.map(c => ({ id: c.id, rank: c.rank, suit: c.suit })),
    count: cards.length
  });
}

export function createCardPlayedEvent(
  playerId: number,
  card: Card,
  cardIndex: number
): GameEvent {
  return createEvent('CARD_PLAYED', `P${playerId}`, {
    playerId,
    card: { id: card.id, rank: card.rank, suit: card.suit },
    cardIndex
  });
}

export function createPegMovedEvent(playerId: number, move: Move): GameEvent {
  return createEvent('PEG_MOVED', `P${playerId}`, {
    playerId,
    pegId: move.pegId,
    moveType: move.type,
    from: move.from,
    to: move.to,
    cardId: move.cardId,
    capturedPegId: move.capturedPegId,
    swappedWithPegId: move.swappedWithPegId
  });
}

export function createPegCapturedEvent(
  capturedPegId: string,
  capturingPegId: string,
  capturedPlayerId: number,
  capturingPlayerId: number,
  sentToPosition: string
): GameEvent {
  return createEvent('PEG_CAPTURED', `P${capturingPlayerId}`, {
    capturedPegId,
    capturingPegId,
    capturedPlayerId,
    capturingPlayerId,
    sentToPosition
  });
}

export function createTurnEndedEvent(playerId: number): GameEvent {
  return createEvent('TURN_ENDED', `P${playerId}`, {
    playerId,
    playAgain: false
  });
}

export function createTurnPlayAgainEvent(playerId: number, card: Card): GameEvent {
  return createEvent('TURN_PLAY_AGAIN', `P${playerId}`, {
    playerId,
    triggerCard: { id: card.id, rank: card.rank, suit: card.suit }
  });
}

export function createPlayerFinishedEvent(playerId: number, rank: number): GameEvent {
  return createEvent('PLAYER_FINISHED', `P${playerId}`, {
    playerId,
    finishRank: rank,
    finishedAt: Date.now()
  });
}

export function createGameEndedEvent(rankings: number[]): GameEvent {
  return createEvent('GAME_ENDED', 'SYSTEM', {
    rankings,
    winner: rankings[0],
    endedAt: Date.now()
  });
}

export function createSyncRequestEvent(requesterId: string): GameEvent {
  return createEvent('SYNC_REQUEST', requesterId, {
    requesterId,
    requestedAt: Date.now()
  });
}

export function createSyncResponseEvent(
  events: GameEvent[],
  currentStateHash: string
): GameEvent {
  return createEvent('SYNC_RESPONSE', 'SYSTEM', {
    events: events.map(e => e.id),
    eventCount: events.length,
    stateHash: currentStateHash
  });
}

export function createHeartbeatEvent(peerId: string): GameEvent {
  return createEvent('HEARTBEAT', peerId, {
    peerId,
    time: Date.now()
  });
}

// =============================================================================
// MANIFOLD RECORD CREATOR
// =============================================================================

export function createManifoldRecord(
  event: GameEvent,
  gameId: string,
  stateBefore: GameState,
  stateAfter: GameState
): ManifoldRecord {
  return {
    eventId: event.id,
    gameId,
    type: event.type,
    timestamp: event.timestamp,
    actor: event.actor,
    payload: event.payload,
    stateBefore: hashState(stateBefore),
    stateAfter: hashState(stateAfter),
    dimensions: {
      game: gameId,
      player: event.actor,
      turn: stateAfter.turnNumber,
      phase: stateAfter.phase
    }
  };
}

// =============================================================================
// EVENT VALIDATION
// =============================================================================

export function validateEvent(event: GameEvent): { valid: boolean; reason?: string } {
  if (!event.id) return { valid: false, reason: 'Missing event ID' };
  if (!event.type) return { valid: false, reason: 'Missing event type' };
  if (!event.timestamp) return { valid: false, reason: 'Missing timestamp' };
  if (!event.actor) return { valid: false, reason: 'Missing actor' };
  if (event.payload === undefined) return { valid: false, reason: 'Missing payload' };
  if (event.sequence === undefined) return { valid: false, reason: 'Missing sequence' };
  
  return { valid: true };
}

// =============================================================================
// EVENT LOG
// =============================================================================

export class EventLog {
  private events: GameEvent[] = [];
  private subscribers: Set<(event: GameEvent) => void> = new Set();
  
  append(event: GameEvent): void {
    const validation = validateEvent(event);
    if (!validation.valid) {
      throw new Error(`Invalid event: ${validation.reason}`);
    }
    this.events.push(event);
    this.notify(event);
  }
  
  getAll(): GameEvent[] {
    return [...this.events];
  }
  
  getAfter(sequence: number): GameEvent[] {
    return this.events.filter(e => e.sequence > sequence);
  }
  
  getById(id: string): GameEvent | undefined {
    return this.events.find(e => e.id === id);
  }
  
  getLastSequence(): number {
    return this.events.length > 0 
      ? this.events[this.events.length - 1].sequence 
      : 0;
  }
  
  subscribe(callback: (event: GameEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
  
  private notify(event: GameEvent): void {
    for (const callback of this.subscribers) {
      try {
        callback(event);
      } catch (e) {
        console.error('Event subscriber error:', e);
      }
    }
  }
  
  clear(): void {
    this.events = [];
  }
  
  loadFrom(events: GameEvent[]): void {
    this.events = [...events];
    sequenceCounter = this.getLastSequence();
  }
  
  toJSON(): string {
    return JSON.stringify(this.events, null, 2);
  }
  
  fromJSON(json: string): void {
    this.events = JSON.parse(json);
    sequenceCounter = this.getLastSequence();
  }
}

// =============================================================================
// EVENT SCHEMA (JSON Schema for validation)
// =============================================================================

export const EVENT_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "FastTrack Game Event",
  "type": "object",
  "required": ["id", "type", "timestamp", "actor", "payload", "sequence"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^evt_[0-9]+_[a-z0-9]+$"
    },
    "type": {
      "type": "string",
      "enum": [
        "GAME_CREATED",
        "PLAYER_JOINED",
        "PLAYER_LEFT",
        "GAME_STARTED",
        "CARD_DRAWN",
        "CARD_PLAYED",
        "PEG_MOVED",
        "PEG_CAPTURED",
        "TURN_ENDED",
        "TURN_PLAY_AGAIN",
        "PLAYER_FINISHED",
        "GAME_ENDED",
        "SYNC_REQUEST",
        "SYNC_RESPONSE",
        "HEARTBEAT"
      ]
    },
    "timestamp": {
      "type": "integer",
      "minimum": 0
    },
    "actor": {
      "type": "string"
    },
    "payload": {
      "type": "object"
    },
    "sequence": {
      "type": "integer",
      "minimum": 1
    },
    "checksum": {
      "type": "string"
    }
  }
};
