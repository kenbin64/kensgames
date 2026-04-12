"""
Fast Track - ButterflyFX Kernel Game Module
Integrates Fast Track board game into the dimensional kernel
"""

from helix import (
    HelixKernel,
    manifold,
    Dimension
)
from helix.geometric_substrate import Shape
from helix.enhanced_primitives import Color
from helix.substrates import Frequency, Amplitude, Waveform, Duration, TimePoint
from .server import FastTrackRoom, FastTrackServer, fasttrack_server

# Game metadata as dimensional entity
FASTTRACK_MANIFEST = {
    "name": "Fast Track",
    "version": "1.0.0",
    "type": "game",
    "dimensions": {
        "visual": {
            "board": "hexagonal",
            "colors": 6,
            "pegs_per_player": 5,
            "track_holes": 60
        },
        "audio": {
            "dice_roll": "effects/dice.wav",
            "capture": "effects/capture.wav",
            "win": "effects/victory.wav"
        },
        "logic": {
            "min_players": 2,
            "max_players": 6,
            "supports_ai": True,
            "supports_multiplayer": True
        },
        "network": {
            "protocol": "websocket",
            "path": "/ws/fasttrack/{room_code}"
        }
    }
}


class FastTrackKernel:
    """
    Kernel integration for Fast Track game.
    Registers the game as a dimensional entity with full helix support.
    """
    
    def __init__(self, helix_kernel: HelixKernel = None):
        self.helix_kernel = helix_kernel or HelixKernel()
        self.server = fasttrack_server
        self._register_entity()
    
    def _register_entity(self):
        """Register Fast Track as a dimensional entity (stub, no registration)."""
        entity = {
            "name": "FastTrack",
            "type": "game",
            "dimensions": {
                "visual": self._create_visual_dimension(),
                "audio": self._create_audio_dimension(),
                "logic": self._create_logic_dimension(),
                "network": self._create_network_dimension(),
                "data": self._create_data_dimension()
            }
        }
        return entity
    
    def _create_visual_dimension(self) -> dict:
        """Define visual properties."""
        return {
            "board_shape": Shape.HEXAGON,
            "board_size": (700, 700),
            "player_colors": [
                Color.from_hex("#FF6B00"),  # Orange
                Color.from_hex("#8B4513"),  # Brown
                Color.from_hex("#DC143C"),  # Red
                Color.from_hex("#FFD700"),  # Yellow
                Color.from_hex("#228B22"),  # Green
                Color.from_hex("#1E90FF"),  # Blue
            ],
            "peg_style": {
                "shape": Shape.CIRCLE,
                "size": 24,
                "shadow": True,
                "highlight": True
            },
            "track_style": {
                "hole_radius": 8,
                "hole_color": "#3D2914"
            },
            "animations": {
                "peg_move": {"duration": 300, "easing": "ease-out"},
                "dice_roll": {"duration": 800, "frames": 10},
                "capture": {"duration": 500, "effect": "flash"}
            }
        }
    
    def _create_audio_dimension(self) -> dict:
        """Define audio properties."""
        return {
            "effects": {
                "dice_roll": Sound(frequency=440, duration=0.1, type="click"),
                "peg_move": Sound(frequency=330, duration=0.05, type="tap"),
                "capture": Sound(frequency=220, duration=0.3, type="boom"),
                "safe_zone": Sound(frequency=550, duration=0.2, type="chime"),
                "win": Sound(frequency=880, duration=1.0, type="fanfare")
            },
            "music": {
                "lobby": "music/lobby_ambient.mp3",
                "game": "music/game_tension.mp3",
                "victory": "music/victory.mp3"
            },
            "voice": {
                "your_turn": "Your turn",
                "rolled_six": "Six! Roll again!",
                "captured": "Captured!",
                "winner": "Winner!"
            }
        }
    
    def _create_logic_dimension(self) -> dict:
        """Define game logic rules."""
        return {
            "rules": {
                "enter_track_on": [1, 6],
                "extra_turn_on": [6],
                "pegs_to_win": 5,
                "safe_zone_holes": 4,
                "track_holes_per_section": 10,
                "total_track_holes": 60,
                "can_capture": True,
                "fast_track_enabled": True,
                "bullseye_enabled": True
            },
            "ai": {
                "difficulty_levels": ["easy", "medium", "hard"],
                "strategies": {
                    "easy": {"random_factor": 0.8},
                    "medium": {"random_factor": 0.4, "prioritize_safe": True},
                    "hard": {"random_factor": 0.1, "prioritize_safe": True, "block_opponents": True}
                }
            }
        }
    
    def _create_network_dimension(self) -> dict:
        """Define network/multiplayer properties."""
        return {
            "protocol": "websocket",
            "paths": {
                "game": "/ws/fasttrack/{room_code}",
                "lobby": "/ws/fasttrack/lobby"
            },
            "messages": {
                "join": "Join a game room",
                "roll": "Roll the dice",
                "move": "Execute a peg move",
                "chat": "Send chat message",
                "sync": "Synchronize game state"
            },
            "room": {
                "max_players": 6,
                "code_length": 6,
                "timeout_minutes": 30
            }
        }
    
    def _create_data_dimension(self) -> dict:
        """Define data/persistence properties."""
        return {
            "storage": {
                "type": "json",
                "path": "data/games/fasttrack/"
            },
            "save_format": {
                "version": "1.0",
                "fields": ["players", "board_state", "current_turn", "dice_history"]
            },
            "statistics": {
                "games_played": 0,
                "wins_by_color": {},
                "average_game_length": 0,
                "captures_total": 0
            }
        }
    
    def create_room(self, host_name: str = "Host") -> FastTrackRoom:
        """Create a new game room."""
        return self.server.create_room(host_name)
    
    def join_room(self, room_code: str, player_name: str) -> dict:
        """Join an existing game room."""
        room = self.server.get_room(room_code)
        if not room:
            return {"error": "Room not found"}
        
        player = room.add_player(player_name)
        if not player:
            return {"error": "Room is full"}
        
        return {
            "player_id": player.id,
            "room_code": room.room_code,
            "state": room.get_state()
        }
    
    def get_websocket_handler(self):
        """Get the WebSocket handler function."""
        from .server import handle_fasttrack_ws
        return handle_fasttrack_ws


# Global kernel instance
fasttrack_kernel = None

def init_fasttrack(helix_kernel: HelixKernel = None) -> FastTrackKernel:
    """Initialize Fast Track kernel integration."""
    global fasttrack_kernel
    fasttrack_kernel = FastTrackKernel(helix_kernel)
    return fasttrack_kernel

def get_fasttrack() -> FastTrackKernel:
    """Get the Fast Track kernel instance."""
    global fasttrack_kernel
    if fasttrack_kernel is None:
        fasttrack_kernel = FastTrackKernel(HelixKernel())
    return fasttrack_kernel
