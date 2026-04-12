"""
Fast Track Game Server - ButterflyFX Kernel Integration
WebSocket multiplayer support for 2-6 players with AI
"""

import asyncio
import json
import random
import string
from typing import Dict, List, Optional, Set
from dataclasses import dataclass, field, asdict
from enum import Enum

try:
    from helix import HelixKernel
    HELIX_AVAILABLE = True
except ImportError:
    HELIX_AVAILABLE = False


class PegLocation(Enum):
    HOME = "home"
    TRACK = "track"
    SAFE_ZONE = "safeZone"
    FINISHED = "finished"


@dataclass
class Peg:
    id: int
    location: str = "home"
    position: int = 0
    track_index: int = -1
    
    def to_dict(self):
        return {
            "id": self.id,
            "location": self.location,
            "position": self.position,
            "trackIndex": self.track_index
        }


@dataclass
class Player:
    id: int
    name: str
    color_index: int
    player_type: str = "human"  # human or ai
    websocket: Optional[object] = None
    pegs: List[Peg] = field(default_factory=list)
    home_count: int = 0
    finished: bool = False
    connected: bool = True
    
    def __post_init__(self):
        if not self.pegs:
            self.pegs = [Peg(i, "home", min(i, 3)) for i in range(5)]
    
    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "type": self.player_type,
            "color": COLORS[self.color_index],
            "pegs": [p.to_dict() for p in self.pegs],
            "homeCount": self.home_count,
            "finished": self.finished,
            "connected": self.connected
        }


COLORS = {
    0: {"name": "Orange", "hex": "#FF6B00", "light": "#FF9944"},
    1: {"name": "Brown", "hex": "#8B4513", "light": "#A0522D"},
    2: {"name": "Red", "hex": "#DC143C", "light": "#FF4466"},
    3: {"name": "Yellow", "hex": "#FFD700", "light": "#FFEB3B"},
    4: {"name": "Green", "hex": "#228B22", "light": "#32CD32"},
    5: {"name": "Blue", "hex": "#1E90FF", "light": "#4DA6FF"}
}

TRACK_HOLES_PER_SECTION = 10
TOTAL_TRACK_HOLES = 60


class FastTrackRoom:
    """Manages a single game room with multiple players."""
    
    def __init__(self, room_code: str, host_name: str):
        self.room_code = room_code
        self.players: List[Player] = []
        self.current_player_index = 0
        self.dice_value: Optional[int] = None
        self.game_phase = "lobby"  # lobby, playing, finished
        self.host_name = host_name
        self.created_at = asyncio.get_event_loop().time()
        self.websockets: Set[object] = set()
        self.ai_task: Optional[asyncio.Task] = None
        
    def add_player(self, name: str, player_type: str = "human", websocket=None) -> Optional[Player]:
        """Add a player to the room."""
        if len(self.players) >= 6:
            return None
            
        player_id = len(self.players)
        player = Player(
            id=player_id,
            name=name,
            color_index=player_id,
            player_type=player_type,
            websocket=websocket
        )
        self.players.append(player)
        
        if websocket:
            self.websockets.add(websocket)
            
        return player
    
    def remove_player(self, player_id: int):
        """Remove a player from the room."""
        if 0 <= player_id < len(self.players):
            player = self.players[player_id]
            if player.websocket in self.websockets:
                self.websockets.discard(player.websocket)
            player.connected = False
    
    def get_state(self) -> dict:
        """Get the current game state."""
        return {
            "roomCode": self.room_code,
            "players": [p.to_dict() for p in self.players],
            "currentPlayerIndex": self.current_player_index,
            "diceValue": self.dice_value,
            "gamePhase": self.game_phase
        }
    
    def get_current_player(self) -> Optional[Player]:
        """Get the current player."""
        if 0 <= self.current_player_index < len(self.players):
            return self.players[self.current_player_index]
        return None
    
    def roll_dice(self) -> int:
        """Roll the dice and return the value."""
        self.dice_value = random.randint(1, 6)
        return self.dice_value
    
    def calculate_valid_moves(self, player: Player) -> List[dict]:
        """Calculate all valid moves for the current player."""
        if self.dice_value is None:
            return []
            
        valid_moves = []
        
        for peg_idx, peg in enumerate(player.pegs):
            if peg.location == "finished":
                continue
                
            if peg.location == "home":
                # Can only leave home on 1 or 6
                if self.dice_value in (1, 6):
                    valid_moves.append({
                        "pegIndex": peg_idx,
                        "action": "enterTrack",
                        "targetPosition": player.id * TRACK_HOLES_PER_SECTION
                    })
                    
            elif peg.location == "track":
                new_pos = (peg.track_index + self.dice_value) % TOTAL_TRACK_HOLES
                
                # Check if would pass home entry
                if self._would_pass_home_entry(peg.track_index, self.dice_value, player.id):
                    steps_to_entry = self._steps_to_home_entry(peg.track_index, player.id)
                    remaining = self.dice_value - steps_to_entry
                    
                    if remaining <= 4:
                        valid_moves.append({
                            "pegIndex": peg_idx,
                            "action": "enterSafeZone",
                            "targetPosition": remaining - 1
                        })
                else:
                    valid_moves.append({
                        "pegIndex": peg_idx,
                        "action": "moveTrack",
                        "targetPosition": new_pos
                    })
                    
            elif peg.location == "safeZone":
                new_pos = peg.position + self.dice_value
                if new_pos < 4:
                    valid_moves.append({
                        "pegIndex": peg_idx,
                        "action": "moveSafeZone",
                        "targetPosition": new_pos
                    })
                elif new_pos == 4:
                    valid_moves.append({
                        "pegIndex": peg_idx,
                        "action": "finish",
                        "targetPosition": 4
                    })
                    
        return valid_moves
    
    def _would_pass_home_entry(self, current_pos: int, steps: int, player_id: int) -> bool:
        """Check if movement would pass the player's home entry."""
        home_entry = player_id * TRACK_HOLES_PER_SECTION
        for i in range(1, steps + 1):
            if (current_pos + i) % TOTAL_TRACK_HOLES == home_entry:
                return True
        return False
    
    def _steps_to_home_entry(self, current_pos: int, player_id: int) -> int:
        """Calculate steps to reach home entry."""
        home_entry = player_id * TRACK_HOLES_PER_SECTION
        if current_pos <= home_entry:
            return home_entry - current_pos
        else:
            return TOTAL_TRACK_HOLES - current_pos + home_entry
    
    def execute_move(self, player: Player, move: dict) -> dict:
        """Execute a move and return the result."""
        peg = player.pegs[move["pegIndex"]]
        action = move["action"]
        target = move["targetPosition"]
        
        result = {"success": True, "capture": None, "message": ""}
        
        if action == "enterTrack":
            peg.location = "track"
            peg.track_index = target
            result["message"] = f"{player.name} entered the track"
            
        elif action == "moveTrack":
            # Check for captures
            capture = self._check_capture(target, player.id)
            if capture:
                result["capture"] = capture
                result["message"] = f"{player.name} captured {capture['playerName']}'s peg!"
            else:
                result["message"] = f"{player.name} moved on track"
            peg.track_index = target
            
        elif action == "enterSafeZone":
            peg.location = "safeZone"
            peg.position = target
            peg.track_index = -1
            result["message"] = f"{player.name} entered safe zone!"
            
        elif action == "moveSafeZone":
            peg.position = target
            result["message"] = f"{player.name} advanced in safe zone"
            
        elif action == "finish":
            peg.location = "finished"
            peg.position = 4
            player.home_count += 1
            result["message"] = f"{player.name} got a peg home! ({player.home_count}/5)"
            
            if player.home_count >= 5:
                result["message"] = f"🏆 {player.name} WINS!"
                player.finished = True
                self.game_phase = "finished"
        
        return result
    
    def _check_capture(self, target_position: int, current_player_id: int) -> Optional[dict]:
        """Check if moving to target position captures an opponent's peg."""
        for player in self.players:
            if player.id == current_player_id:
                continue
                
            for peg in player.pegs:
                if peg.location == "track" and peg.track_index == target_position:
                    # Capture!
                    peg.location = "home"
                    peg.track_index = -1
                    peg.position = self._get_first_empty_home(player.id)
                    return {
                        "playerId": player.id,
                        "playerName": player.name,
                        "pegId": peg.id
                    }
        return None
    
    def _get_first_empty_home(self, player_id: int) -> int:
        """Get the first empty home slot for a player."""
        occupied = {p.position for p in self.players[player_id].pegs if p.location == "home"}
        for i in range(4):
            if i not in occupied:
                return i
        return 4
    
    def next_turn(self):
        """Move to the next player's turn."""
        attempts = 0
        while attempts < len(self.players):
            self.current_player_index = (self.current_player_index + 1) % len(self.players)
            if not self.players[self.current_player_index].finished:
                break
            attempts += 1
        
        self.dice_value = None
    
    async def broadcast(self, message: dict):
        """Broadcast a message to all connected players."""
        message_str = json.dumps(message)
        disconnected = set()
        
        for ws in self.websockets:
            try:
                await ws.send(message_str)
            except Exception:
                disconnected.add(ws)
        
        self.websockets -= disconnected
    
    async def play_ai_turn(self):
        """Execute an AI player's turn."""
        player = self.get_current_player()
        if not player or player.player_type != "ai":
            return
            
        await asyncio.sleep(0.8)  # Thinking delay
        
        # Roll dice
        self.roll_dice()
        await self.broadcast({
            "type": "diceRoll",
            "playerId": player.id,
            "value": self.dice_value
        })
        
        await asyncio.sleep(0.5)
        
        # Calculate and choose move
        valid_moves = self.calculate_valid_moves(player)
        
        if valid_moves:
            # AI strategy: prioritize finish > safe zone > enter track > random
            finish_moves = [m for m in valid_moves if m["action"] == "finish"]
            safe_moves = [m for m in valid_moves if m["action"] in ("enterSafeZone", "moveSafeZone")]
            enter_moves = [m for m in valid_moves if m["action"] == "enterTrack"]
            
            if finish_moves:
                chosen_move = finish_moves[0]
            elif safe_moves:
                chosen_move = random.choice(safe_moves)
            elif enter_moves and random.random() > 0.3:
                chosen_move = enter_moves[0]
            else:
                chosen_move = random.choice(valid_moves)
            
            result = self.execute_move(player, chosen_move)
            
            await self.broadcast({
                "type": "move",
                "playerId": player.id,
                "move": chosen_move,
                "result": result
            })
            
            # Check for extra turn on 6
            if self.dice_value != 6 and self.game_phase == "playing":
                self.next_turn()
        else:
            self.next_turn()
        
        await self.broadcast({
            "type": "gameState",
            "state": self.get_state()
        })
        
        # If next player is also AI, continue
        next_player = self.get_current_player()
        if next_player and next_player.player_type == "ai" and self.game_phase == "playing":
            self.ai_task = asyncio.create_task(self.play_ai_turn())


class FastTrackServer:
    """Main server managing all game rooms."""
    
    def __init__(self):
        self.rooms: Dict[str, FastTrackRoom] = {}
        # Register with HelixKernel if available
        if HELIX_AVAILABLE:
            self.helix_kernel = HelixKernel()
    
    def generate_room_code(self) -> str:
        """Generate a unique room code."""
        while True:
            code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
            if code not in self.rooms:
                return code
    
    def create_room(self, host_name: str) -> FastTrackRoom:
        """Create a new game room."""
        code = self.generate_room_code()
        room = FastTrackRoom(code, host_name)
        self.rooms[code] = room
        return room
    
    def get_room(self, room_code: str) -> Optional[FastTrackRoom]:
        """Get a room by code."""
        return self.rooms.get(room_code.upper())
    
    def remove_room(self, room_code: str):
        """Remove a room."""
        if room_code in self.rooms:
            del self.rooms[room_code]
    
    async def handle_websocket(self, websocket, room_code: str):
        """Handle a WebSocket connection for a game room."""
        room = self.get_room(room_code)
        
        if not room:
            # Create new room
            room = self.create_room("Player 1")
            self.rooms[room_code.upper()] = room
        
        player = None
        
        try:
            async for message_str in websocket:
                message = json.loads(message_str)
                await self.handle_message(websocket, room, message, player)
                
        except Exception as e:
            print(f"WebSocket error: {e}")
        finally:
            if player:
                room.remove_player(player.id)
                await room.broadcast({
                    "type": "playerLeft",
                    "playerId": player.id,
                    "playerName": player.name
                })
            
            room.websockets.discard(websocket)
            
            # Clean up empty rooms
            if not room.websockets:
                self.remove_room(room.room_code)
    
    async def handle_message(self, websocket, room: FastTrackRoom, message: dict, player: Optional[Player]):
        """Handle incoming WebSocket messages."""
        msg_type = message.get("type")
        
        if msg_type == "join":
            # Player joining room
            name = message.get("name", f"Player {len(room.players) + 1}")
            player = room.add_player(name, "human", websocket)
            
            if player:
                await websocket.send(json.dumps({
                    "type": "joined",
                    "playerId": player.id,
                    "state": room.get_state()
                }))
                
                await room.broadcast({
                    "type": "playerJoined",
                    "playerId": player.id,
                    "playerName": name
                })
            else:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Room is full"
                }))
                
        elif msg_type == "addAI":
            # Add AI player
            ai_name = message.get("name", f"AI {len(room.players) + 1}")
            ai_player = room.add_player(ai_name, "ai")
            
            if ai_player:
                await room.broadcast({
                    "type": "playerJoined",
                    "playerId": ai_player.id,
                    "playerName": ai_name,
                    "isAI": True
                })
                await room.broadcast({
                    "type": "gameState",
                    "state": room.get_state()
                })
                
        elif msg_type == "startGame":
            if len(room.players) >= 2:
                room.game_phase = "playing"
                await room.broadcast({
                    "type": "gameStarted",
                    "state": room.get_state()
                })
                
                # Start AI turn if first player is AI
                if room.players[0].player_type == "ai":
                    room.ai_task = asyncio.create_task(room.play_ai_turn())
                    
        elif msg_type == "roll":
            current = room.get_current_player()
            if current and current.websocket == websocket and room.dice_value is None:
                value = room.roll_dice()
                await room.broadcast({
                    "type": "diceRoll",
                    "playerId": current.id,
                    "value": value
                })
                
                # Calculate and send valid moves
                valid_moves = room.calculate_valid_moves(current)
                await websocket.send(json.dumps({
                    "type": "validMoves",
                    "moves": valid_moves
                }))
                
        elif msg_type == "move":
            current = room.get_current_player()
            if current and current.websocket == websocket:
                move = message.get("move")
                result = room.execute_move(current, move)
                
                await room.broadcast({
                    "type": "move",
                    "playerId": current.id,
                    "move": move,
                    "result": result
                })
                
                # Check for extra turn
                if room.dice_value != 6 and room.game_phase == "playing":
                    room.next_turn()
                
                await room.broadcast({
                    "type": "gameState",
                    "state": room.get_state()
                })
                
                # Trigger AI turn if needed
                next_player = room.get_current_player()
                if next_player and next_player.player_type == "ai" and room.game_phase == "playing":
                    room.ai_task = asyncio.create_task(room.play_ai_turn())
                    
        elif msg_type == "chat":
            await room.broadcast({
                "type": "chat",
                "playerId": player.id if player else -1,
                "playerName": player.name if player else "Unknown",
                "message": message.get("message", "")
            })


# Global server instance
fasttrack_server = FastTrackServer()


# WebSocket route handler (for integration with existing server)
async def handle_fasttrack_ws(websocket, path):
    """WebSocket handler for Fast Track game."""
    # Extract room code from path
    parts = path.split("/")
    room_code = parts[-1] if len(parts) > 0 else fasttrack_server.generate_room_code()
    
    await fasttrack_server.handle_websocket(websocket, room_code)


# Helix kernel integration
if HELIX_AVAILABLE:
    def create_fasttrack_entity(room_code: str = None) -> dict:
        """Create a Fast Track game entity in Helix."""
        if room_code:
            room = fasttrack_server.get_room(room_code)
        else:
            room = fasttrack_server.create_room("Host")
        
        return {
            "room_code": room.room_code,
            "url": f"/games/fasttrack/?room={room.room_code}",
            "state": room.get_state()
        }
