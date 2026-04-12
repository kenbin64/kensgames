/**
 * FastTrack Socket Sync Layer
 * 
 * Serverless peer-to-peer synchronization using WebRTC data channels
 * with a simple WebSocket signaling server for connection bootstrapping.
 */

import { GameEvent, GameState, GameConfig } from './types';
import { initGame, applyEvent, hashState } from './rules';
import { EventLog, createSyncRequestEvent, createSyncResponseEvent, createHeartbeatEvent } from './events';

// =============================================================================
// PEER CONNECTION TYPES
// =============================================================================

export interface PeerInfo {
  id: string;
  name: string;
  playerId: number;
  connected: boolean;
  lastSeen: number;
}

export interface SyncMessage {
  type: 'EVENT' | 'SYNC_REQUEST' | 'SYNC_RESPONSE' | 'HEARTBEAT' | 'PEER_INFO';
  sender: string;
  payload: unknown;
  timestamp: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// =============================================================================
// SYNC LAYER
// =============================================================================

export class FastTrackSync {
  private peerId: string;
  private gameId: string;
  private config: GameConfig;
  
  private state: GameState;
  private eventLog: EventLog;
  
  private peers: Map<string, PeerInfo> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  
  private signalingSocket: WebSocket | null = null;
  private connectionState: ConnectionState = 'disconnected';
  
  private stateSubscribers: Set<(state: GameState) => void> = new Set();
  private connectionSubscribers: Set<(state: ConnectionState) => void> = new Set();
  
  private heartbeatInterval: number | null = null;
  
  constructor(peerId: string, gameId: string, config: GameConfig) {
    this.peerId = peerId;
    this.gameId = gameId;
    this.config = config;
    this.eventLog = new EventLog();
    this.state = initGame(config);
    
    // Subscribe to event log for manifold ingestion compatibility
    this.eventLog.subscribe((event) => {
      this.broadcastEvent(event);
    });
  }
  
  // ===========================================================================
  // STATE MANAGEMENT
  // ===========================================================================
  
  getState(): GameState {
    return this.state;
  }
  
  subscribeToState(callback: (state: GameState) => void): () => void {
    this.stateSubscribers.add(callback);
    return () => this.stateSubscribers.delete(callback);
  }
  
  subscribeToConnection(callback: (state: ConnectionState) => void): () => void {
    this.connectionSubscribers.add(callback);
    return () => this.connectionSubscribers.delete(callback);
  }
  
  private notifyStateChange(): void {
    for (const callback of this.stateSubscribers) {
      try {
        callback(this.state);
      } catch (e) {
        console.error('State subscriber error:', e);
      }
    }
  }
  
  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    for (const callback of this.connectionSubscribers) {
      try {
        callback(state);
      } catch (e) {
        console.error('Connection subscriber error:', e);
      }
    }
  }
  
  // ===========================================================================
  // EVENT HANDLING
  // ===========================================================================
  
  dispatchEvent(event: GameEvent): void {
    // Apply locally first
    const oldState = this.state;
    this.state = applyEvent(this.state, event);
    
    // Log the event
    this.eventLog.append(event);
    
    // Notify subscribers
    this.notifyStateChange();
    
    console.log(`[Sync] Event dispatched: ${event.type}`, event.payload);
  }
  
  private handleRemoteEvent(event: GameEvent): void {
    // Check if we already have this event
    if (this.eventLog.getById(event.id)) {
      console.log(`[Sync] Duplicate event ignored: ${event.id}`);
      return;
    }
    
    // Validate sequence
    const lastSeq = this.eventLog.getLastSequence();
    if (event.sequence !== lastSeq + 1) {
      console.warn(`[Sync] Out of order event: expected ${lastSeq + 1}, got ${event.sequence}`);
      // Request sync
      this.requestSync();
      return;
    }
    
    // Apply the event
    this.state = applyEvent(this.state, event);
    this.eventLog.append(event);
    this.notifyStateChange();
  }
  
  // ===========================================================================
  // SYNC PROTOCOL
  // ===========================================================================
  
  private requestSync(): void {
    const syncRequest = createSyncRequestEvent(this.peerId);
    this.broadcast({
      type: 'SYNC_REQUEST',
      sender: this.peerId,
      payload: { lastSequence: this.eventLog.getLastSequence() },
      timestamp: Date.now()
    });
  }
  
  private handleSyncRequest(fromPeer: string, lastSequence: number): void {
    const events = this.eventLog.getAfter(lastSequence);
    const response = createSyncResponseEvent(events, hashState(this.state));
    
    const channel = this.dataChannels.get(fromPeer);
    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify({
        type: 'SYNC_RESPONSE',
        sender: this.peerId,
        payload: { events, stateHash: hashState(this.state) },
        timestamp: Date.now()
      }));
    }
  }
  
  private handleSyncResponse(events: GameEvent[], stateHash: string): void {
    // Apply missing events in order
    for (const event of events) {
      if (!this.eventLog.getById(event.id)) {
        this.state = applyEvent(this.state, event);
        this.eventLog.append(event);
      }
    }
    
    // Verify state
    const ourHash = hashState(this.state);
    if (ourHash !== stateHash) {
      console.warn(`[Sync] State mismatch after sync! Ours: ${ourHash}, Theirs: ${stateHash}`);
      // Could trigger full state rebuild here
    }
    
    this.notifyStateChange();
  }
  
  // ===========================================================================
  // WEBRTC CONNECTION
  // ===========================================================================
  
  async connect(signalingUrl: string): Promise<void> {
    this.setConnectionState('connecting');
    
    return new Promise((resolve, reject) => {
      this.signalingSocket = new WebSocket(signalingUrl);
      
      this.signalingSocket.onopen = () => {
        console.log('[Sync] Signaling connected');
        this.signalingSocket!.send(JSON.stringify({
          type: 'JOIN',
          gameId: this.gameId,
          peerId: this.peerId
        }));
        this.setConnectionState('connected');
        this.startHeartbeat();
        resolve();
      };
      
      this.signalingSocket.onmessage = (event) => {
        this.handleSignalingMessage(JSON.parse(event.data));
      };
      
      this.signalingSocket.onerror = (error) => {
        console.error('[Sync] Signaling error:', error);
        this.setConnectionState('error');
        reject(error);
      };
      
      this.signalingSocket.onclose = () => {
        console.log('[Sync] Signaling closed');
        this.setConnectionState('disconnected');
        this.stopHeartbeat();
      };
    });
  }
  
  private async handleSignalingMessage(msg: any): Promise<void> {
    switch (msg.type) {
      case 'PEER_LIST':
        // New peers joined - initiate connections
        for (const peer of msg.peers) {
          if (peer.id !== this.peerId && !this.peerConnections.has(peer.id)) {
            await this.createPeerConnection(peer.id, true);
          }
        }
        break;
        
      case 'OFFER':
        await this.handleOffer(msg.from, msg.offer);
        break;
        
      case 'ANSWER':
        await this.handleAnswer(msg.from, msg.answer);
        break;
        
      case 'ICE_CANDIDATE':
        await this.handleIceCandidate(msg.from, msg.candidate);
        break;
    }
  }
  
  private async createPeerConnection(remotePeerId: string, initiator: boolean): Promise<void> {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    
    this.peerConnections.set(remotePeerId, pc);
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingSocket?.send(JSON.stringify({
          type: 'ICE_CANDIDATE',
          to: remotePeerId,
          from: this.peerId,
          candidate: event.candidate
        }));
      }
    };
    
    pc.ondatachannel = (event) => {
      this.setupDataChannel(remotePeerId, event.channel);
    };
    
    if (initiator) {
      const channel = pc.createDataChannel('fasttrack', { ordered: true });
      this.setupDataChannel(remotePeerId, channel);
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      this.signalingSocket?.send(JSON.stringify({
        type: 'OFFER',
        to: remotePeerId,
        from: this.peerId,
        offer
      }));
    }
  }
  
  private async handleOffer(fromPeerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    let pc = this.peerConnections.get(fromPeerId);
    if (!pc) {
      await this.createPeerConnection(fromPeerId, false);
      pc = this.peerConnections.get(fromPeerId)!;
    }
    
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    this.signalingSocket?.send(JSON.stringify({
      type: 'ANSWER',
      to: fromPeerId,
      from: this.peerId,
      answer
    }));
  }
  
  private async handleAnswer(fromPeerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peerConnections.get(fromPeerId);
    if (pc) {
      await pc.setRemoteDescription(answer);
    }
  }
  
  private async handleIceCandidate(fromPeerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.peerConnections.get(fromPeerId);
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }
  
  private setupDataChannel(remotePeerId: string, channel: RTCDataChannel): void {
    channel.onopen = () => {
      console.log(`[Sync] Data channel open with ${remotePeerId}`);
      this.dataChannels.set(remotePeerId, channel);
      this.peers.set(remotePeerId, {
        id: remotePeerId,
        name: `Player ${remotePeerId.slice(0, 6)}`,
        playerId: -1,
        connected: true,
        lastSeen: Date.now()
      });
      
      // Request sync from new peer
      this.requestSync();
    };
    
    channel.onmessage = (event) => {
      this.handleDataChannelMessage(remotePeerId, JSON.parse(event.data));
    };
    
    channel.onclose = () => {
      console.log(`[Sync] Data channel closed with ${remotePeerId}`);
      this.dataChannels.delete(remotePeerId);
      const peer = this.peers.get(remotePeerId);
      if (peer) peer.connected = false;
    };
  }
  
  private handleDataChannelMessage(fromPeer: string, msg: SyncMessage): void {
    // Update peer last seen
    const peer = this.peers.get(fromPeer);
    if (peer) peer.lastSeen = Date.now();
    
    switch (msg.type) {
      case 'EVENT':
        this.handleRemoteEvent(msg.payload as GameEvent);
        break;
        
      case 'SYNC_REQUEST':
        const { lastSequence } = msg.payload as { lastSequence: number };
        this.handleSyncRequest(fromPeer, lastSequence);
        break;
        
      case 'SYNC_RESPONSE':
        const { events, stateHash } = msg.payload as { events: GameEvent[]; stateHash: string };
        this.handleSyncResponse(events, stateHash);
        break;
        
      case 'HEARTBEAT':
        // Just updates lastSeen, already done above
        break;
        
      case 'PEER_INFO':
        const info = msg.payload as Partial<PeerInfo>;
        if (peer) {
          peer.name = info.name ?? peer.name;
          peer.playerId = info.playerId ?? peer.playerId;
        }
        break;
    }
  }
  
  // ===========================================================================
  // BROADCAST
  // ===========================================================================
  
  private broadcastEvent(event: GameEvent): void {
    this.broadcast({
      type: 'EVENT',
      sender: this.peerId,
      payload: event,
      timestamp: Date.now()
    });
  }
  
  private broadcast(msg: SyncMessage): void {
    const data = JSON.stringify(msg);
    for (const channel of this.dataChannels.values()) {
      if (channel.readyState === 'open') {
        channel.send(data);
      }
    }
  }
  
  // ===========================================================================
  // HEARTBEAT
  // ===========================================================================
  
  private startHeartbeat(): void {
    this.heartbeatInterval = window.setInterval(() => {
      this.broadcast({
        type: 'HEARTBEAT',
        sender: this.peerId,
        payload: { time: Date.now() },
        timestamp: Date.now()
      });
      
      // Check for stale peers
      const now = Date.now();
      for (const [id, peer] of this.peers) {
        if (now - peer.lastSeen > 30000) {
          console.log(`[Sync] Peer ${id} timed out`);
          peer.connected = false;
        }
      }
    }, 5000);
  }
  
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  // ===========================================================================
  // CLEANUP
  // ===========================================================================
  
  disconnect(): void {
    this.stopHeartbeat();
    
    for (const channel of this.dataChannels.values()) {
      channel.close();
    }
    this.dataChannels.clear();
    
    for (const pc of this.peerConnections.values()) {
      pc.close();
    }
    this.peerConnections.clear();
    
    this.signalingSocket?.close();
    this.signalingSocket = null;
    
    this.setConnectionState('disconnected');
  }
  
  // ===========================================================================
  // UTILITY
  // ===========================================================================
  
  getPeers(): PeerInfo[] {
    return Array.from(this.peers.values());
  }
  
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }
  
  getEventLog(): EventLog {
    return this.eventLog;
  }
  
  rebuildState(): GameState {
    // Rebuild state from event log
    let state = initGame(this.config);
    for (const event of this.eventLog.getAll()) {
      state = applyEvent(state, event);
    }
    this.state = state;
    return state;
  }
}

// =============================================================================
// LOCAL GAME (no networking, for single player or testing)
// =============================================================================

export class LocalFastTrack {
  private state: GameState;
  private eventLog: EventLog;
  private config: GameConfig;
  private subscribers: Set<(state: GameState) => void> = new Set();
  
  constructor(config: GameConfig) {
    this.config = config;
    this.eventLog = new EventLog();
    this.state = initGame(config);
  }
  
  getState(): GameState {
    return this.state;
  }
  
  dispatchEvent(event: GameEvent): void {
    this.state = applyEvent(this.state, event);
    this.eventLog.append(event);
    this.notifySubscribers();
  }
  
  subscribe(callback: (state: GameState) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
  
  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      callback(this.state);
    }
  }
  
  getEventLog(): EventLog {
    return this.eventLog;
  }
  
  reset(): void {
    this.eventLog.clear();
    this.state = initGame(this.config);
    this.notifySubscribers();
  }
}
