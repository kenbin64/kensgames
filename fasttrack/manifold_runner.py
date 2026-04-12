#!/usr/bin/env python3
"""
Fast Track Manifold Runner
ButterflyFX Math Transmission Protocol for Game Events

This bridges the Fast Track game with the Manifold Server, enabling:
1. Musical phrase transmission (math, not samples)
2. Game state synchronization via dimensional coordinates
3. Smart peg events logged to the manifold

The 7-Layer Creation Model for Fast Track:
    Layer 7 (COMPLETION) - Game over, winner declared
    Layer 6 (MIND)       - AI decision making, strategy
    Layer 5 (LIFE)       - Active game, moves in progress
    Layer 4 (FORM)       - Game board structure
    Layer 3 (RELATION)   - Player interactions, captures
    Layer 2 (MIRROR)     - Turn state (whose turn)
    Layer 1 (SPARK)      - Game created, session start

Copyright (c) 2024-2026 Kenneth Bingham
Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0)
"""

import asyncio
import json
import os
import sys
import time
import logging
from dataclasses import dataclass, asdict
from typing import Dict, Set, Optional, Any
from enum import IntEnum

# Add DimensionsOS to path
sys.path.insert(0, '/opt/butterflyfx/dimensionsos')

try:
    from helix.manifold_server import ManifoldServer, WaveformDescriptor, WaveformType
    from helix.kernel import HelixKernel
    HELIX_AVAILABLE = True
except ImportError:
    HELIX_AVAILABLE = False
    print("[Manifold] Warning: helix module not available, running in stub mode")

try:
    import websockets
    WEBSOCKETS_AVAILABLE = True
except ImportError:
    WEBSOCKETS_AVAILABLE = False
    print("[Manifold] Warning: websockets not available")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [Manifold] %(levelname)s: %(message)s'
)
logger = logging.getLogger(__name__)


# =============================================================================
# DIMENSIONAL LAYER MAPPING (Fibonacci-aligned)
# =============================================================================

class GameLayer(IntEnum):
    """Fast Track dimensional layers - aligned with 7-Layer Creation Model"""
    SPARK = 1       # Fib 1 - Game session created
    MIRROR = 2      # Fib 1 - Turn state reflection  
    RELATION = 3    # Fib 2 - Player interactions (captures, blocks)
    FORM = 4        # Fib 3 - Board structure
    LIFE = 5        # Fib 5 - Active game, moves
    MIND = 6        # Fib 8 - AI strategy
    COMPLETION = 7  # Fib 13 - Game over


@dataclass
class ManifoldEvent:
    """Event structure for manifold logging"""
    layer: int
    event_type: str
    session_id: str
    player_id: Optional[str]
    timestamp: float
    data: Dict[str, Any]
    
    def to_dict(self) -> dict:
        return asdict(self)


# =============================================================================
# MUSIC MANIFOLD - Math not samples
# =============================================================================

class MusicManifold:
    """
    Transmits music as mathematical waveform descriptors.
    
    Instead of sending 48,000 samples/second, we send:
    - f(t) = A * sin(2π * freq * t + phase)
    - Parameters: ~30 bytes vs 192KB/second
    
    The client evaluates the math to generate audio.
    """
    
    # Theme frequency maps (Hz) - pentatonic scales
    THEMES = {
        'DEFAULT': {'root': 220, 'scale': [1, 1.125, 1.25, 1.5, 1.667]},
        'SPACE_ACE': {'root': 196, 'scale': [1, 1.125, 1.333, 1.5, 1.778]},
        'UNDERSEA': {'root': 174.6, 'scale': [1, 1.125, 1.25, 1.5, 1.667]},
        'ROMAN_COLISEUM': {'root': 220, 'scale': [1, 1.125, 1.333, 1.5, 1.667]},
        'FIBONACCI': {'root': 233, 'scale': [1, 1.618, 2.618, 4.236, 6.854]},
    }
    
    def __init__(self, theme: str = 'DEFAULT'):
        self.theme = theme
        self.active_waveforms = []
        if HELIX_AVAILABLE:
            self.server = ManifoldServer()
        else:
            self.server = None
    
    def create_note(self, note_index: int, duration: float = 0.5) -> dict:
        """Create a waveform descriptor for a note"""
        config = self.THEMES.get(self.theme, self.THEMES['DEFAULT'])
        freq = config['root'] * config['scale'][note_index % len(config['scale'])]
        
        if HELIX_AVAILABLE:
            wf = WaveformDescriptor(
                waveform_type=WaveformType.SINE,
                frequency=freq,
                amplitude=0.3,
                phase=0.0,
                start_time=time.time(),
                duration=duration
            )
            return wf.to_bytes().hex()
        else:
            return {
                'type': 'sine',
                'freq': freq,
                'amp': 0.3,
                'duration': duration,
                'start': time.time()
            }
    
    def create_chord(self, root: int, intervals: list = [0, 2, 4]) -> dict:
        """Create chord as harmonic sum"""
        config = self.THEMES.get(self.theme, self.THEMES['DEFAULT'])
        base_freq = config['root'] * config['scale'][root % len(config['scale'])]
        
        harmonics = []
        for i, interval in enumerate(intervals):
            harmonic_freq = base_freq * config['scale'][(root + interval) % len(config['scale'])]
            harmonics.append({
                'freq': harmonic_freq,
                'amp': 0.3 / (i + 1)  # Decreasing amplitude
            })
        
        return {
            'type': 'harmonic',
            'harmonics': harmonics,
            'duration': 0.5
        }
    
    def create_capture_sfx(self) -> dict:
        """Victory sting for capture event"""
        return {
            'type': 'envelope',
            'waveform': 'sawtooth',
            'freq': 440,
            'attack': 0.01,
            'decay': 0.1,
            'sustain': 0.3,
            'release': 0.2
        }


# =============================================================================
# GAME STATE MANIFOLD
# =============================================================================

class GameStateManifold:
    """
    Tracks game state in dimensional coordinates.
    
    State is represented as (spiral, layer) where:
    - spiral: game session number
    - layer: current phase (1-7)
    """
    
    def __init__(self):
        self.sessions: Dict[str, dict] = {}
        self.event_log: list = []
        if HELIX_AVAILABLE:
            self.kernel = HelixKernel()
        else:
            self.kernel = None
    
    def create_session(self, session_id: str, players: list) -> ManifoldEvent:
        """Create a new game session at Layer 1 (SPARK)"""
        self.sessions[session_id] = {
            'id': session_id,
            'layer': GameLayer.SPARK,
            'spiral': len(self.sessions),
            'players': players,
            'created_at': time.time(),
            'state': 'waiting'
        }
        
        event = ManifoldEvent(
            layer=GameLayer.SPARK,
            event_type='SESSION_CREATED',
            session_id=session_id,
            player_id=None,
            timestamp=time.time(),
            data={'players': players}
        )
        self.event_log.append(event)
        return event
    
    def start_game(self, session_id: str) -> ManifoldEvent:
        """Move to Layer 5 (LIFE) - active game"""
        if session_id in self.sessions:
            self.sessions[session_id]['layer'] = GameLayer.LIFE
            self.sessions[session_id]['state'] = 'active'
        
        return ManifoldEvent(
            layer=GameLayer.LIFE,
            event_type='GAME_STARTED',
            session_id=session_id,
            player_id=None,
            timestamp=time.time(),
            data={}
        )
    
    def log_move(self, session_id: str, player_id: str, move: dict) -> ManifoldEvent:
        """Log a peg move at Layer 5"""
        return ManifoldEvent(
            layer=GameLayer.LIFE,
            event_type='PEG_MOVE',
            session_id=session_id,
            player_id=player_id,
            timestamp=time.time(),
            data=move
        )
    
    def log_capture(self, session_id: str, player_id: str, 
                    captured_player: str, position: str) -> ManifoldEvent:
        """Log a capture at Layer 3 (RELATION)"""
        return ManifoldEvent(
            layer=GameLayer.RELATION,
            event_type='CAPTURE',
            session_id=session_id,
            player_id=player_id,
            timestamp=time.time(),
            data={
                'captured_player': captured_player,
                'position': position
            }
        )
    
    def log_ai_decision(self, session_id: str, player_id: str, 
                        decision: dict) -> ManifoldEvent:
        """Log AI decision at Layer 6 (MIND)"""
        return ManifoldEvent(
            layer=GameLayer.MIND,
            event_type='AI_DECISION',
            session_id=session_id,
            player_id=player_id,
            timestamp=time.time(),
            data=decision
        )
    
    def end_game(self, session_id: str, winner: str) -> ManifoldEvent:
        """Move to Layer 7 (COMPLETION)"""
        if session_id in self.sessions:
            self.sessions[session_id]['layer'] = GameLayer.COMPLETION
            self.sessions[session_id]['state'] = 'complete'
            self.sessions[session_id]['winner'] = winner
        
        return ManifoldEvent(
            layer=GameLayer.COMPLETION,
            event_type='GAME_COMPLETE',
            session_id=session_id,
            player_id=winner,
            timestamp=time.time(),
            data={'winner': winner}
        )
    
    def get_dimensional_state(self, session_id: str) -> dict:
        """Get current state as dimensional coordinates"""
        session = self.sessions.get(session_id, {})
        return {
            'spiral': session.get('spiral', 0),
            'layer': session.get('layer', GameLayer.SPARK),
            'layer_name': GameLayer(session.get('layer', 1)).name,
            'fibonacci': [1, 1, 2, 3, 5, 8, 13][session.get('layer', 1) - 1],
            'state': session.get('state', 'unknown')
        }


# =============================================================================
# WEBSOCKET SERVER
# =============================================================================

class ManifoldWebSocketServer:
    """
    WebSocket server for manifold communication.
    
    Endpoints:
    - /manifold/music   - Music waveform transmission
    - /manifold/state   - Game state sync
    - /manifold/events  - Real-time event stream
    """
    
    def __init__(self, host: str = '127.0.0.1', port: int = 8767):
        self.host = host
        self.port = port
        self.music = MusicManifold()
        self.game_state = GameStateManifold()
        self.connections: Set = set()
    
    async def handler(self, websocket, path):
        """Handle incoming WebSocket connections"""
        self.connections.add(websocket)
        client_id = f"{websocket.remote_address}"
        logger.info(f"Client connected: {client_id} path={path}")
        
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    response = await self.process_message(data, path)
                    if response:
                        await websocket.send(json.dumps(response))
                except json.JSONDecodeError:
                    await websocket.send(json.dumps({
                        'error': 'Invalid JSON'
                    }))
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client disconnected: {client_id}")
        finally:
            self.connections.discard(websocket)
    
    async def process_message(self, data: dict, path: str) -> dict:
        """Process incoming message based on type"""
        msg_type = data.get('type', '')
        
        if msg_type == 'create_session':
            event = self.game_state.create_session(
                data.get('session_id'),
                data.get('players', [])
            )
            return {'type': 'session_created', 'event': event.to_dict()}
        
        elif msg_type == 'start_game':
            event = self.game_state.start_game(data.get('session_id'))
            return {'type': 'game_started', 'event': event.to_dict()}
        
        elif msg_type == 'peg_move':
            event = self.game_state.log_move(
                data.get('session_id'),
                data.get('player_id'),
                data.get('move', {})
            )
            return {'type': 'move_logged', 'event': event.to_dict()}
        
        elif msg_type == 'capture':
            event = self.game_state.log_capture(
                data.get('session_id'),
                data.get('player_id'),
                data.get('captured_player'),
                data.get('position')
            )
            # Also send capture SFX waveform
            sfx = self.music.create_capture_sfx()
            return {
                'type': 'capture_logged',
                'event': event.to_dict(),
                'sfx_waveform': sfx
            }
        
        elif msg_type == 'request_music':
            theme = data.get('theme', 'DEFAULT')
            self.music.theme = theme
            note = self.music.create_note(data.get('note_index', 0))
            return {'type': 'music_waveform', 'waveform': note}
        
        elif msg_type == 'get_state':
            state = self.game_state.get_dimensional_state(data.get('session_id'))
            return {'type': 'state', 'dimensional_state': state}
        
        elif msg_type == 'end_game':
            event = self.game_state.end_game(
                data.get('session_id'),
                data.get('winner')
            )
            return {'type': 'game_ended', 'event': event.to_dict()}
        
        elif msg_type == 'ping':
            return {'type': 'pong', 'timestamp': time.time()}
        
        return {'type': 'unknown', 'received': data}
    
    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        if self.connections:
            await asyncio.gather(
                *[ws.send(json.dumps(message)) for ws in self.connections]
            )
    
    async def run(self):
        """Start the WebSocket server"""
        if not WEBSOCKETS_AVAILABLE:
            logger.error("websockets module not available")
            return
        
        logger.info(f"Starting Manifold Server on ws://{self.host}:{self.port}")
        logger.info("Dimensional layers active: SPARK → COMPLETION (1-7)")
        
        async with websockets.serve(self.handler, self.host, self.port):
            logger.info(f"""
╔══════════════════════════════════════════════════════════════╗
║         ButterflyFX Manifold Server - Fast Track             ║
╠══════════════════════════════════════════════════════════════╣
║  Endpoint: ws://{self.host}:{self.port}/manifold                       ║
║  Math Transmission Protocol Active                           ║
║                                                              ║
║  Layer 7: COMPLETION (Fib 13) - Game Over                    ║
║  Layer 6: MIND (Fib 8)        - AI Strategy                  ║
║  Layer 5: LIFE (Fib 5)        - Active Game                  ║
║  Layer 4: FORM (Fib 3)        - Board Structure              ║
║  Layer 3: RELATION (Fib 2)    - Captures                     ║
║  Layer 2: MIRROR (Fib 1)      - Turn State                   ║
║  Layer 1: SPARK (Fib 1)       - Session Start                ║
╚══════════════════════════════════════════════════════════════╝
            """)
            await asyncio.Future()  # Run forever


# =============================================================================
# MAIN
# =============================================================================

def main():
    host = os.environ.get('MANIFOLD_HOST', '127.0.0.1')
    port = int(os.environ.get('MANIFOLD_PORT', 8767))
    
    server = ManifoldWebSocketServer(host=host, port=port)
    
    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        logger.info("Manifold server stopped")


if __name__ == '__main__':
    main()
