"""
Fast Track Game Substrate - ButterflyFX Powered

Copyright (c) 2024-2026 Kenneth Bingham
Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0)

Game logic implemented as a dimensional substrate following the
ButterflyFX 7-level helix architecture.

Levels:
    0 - Potential: Game possibility space (valid moves)
    1 - Point: Individual token/peg positions
    2 - Length: Paths between holes (track segments)
    3 - Width: Player state (hand of cards, tokens)
    4 - Plane: Board state (all positions, whose turn)
    5 - Volume: Game session (players, rooms, history)
    6 - Whole: Complete game universe (leaderboards, achievements)
"""

from __future__ import annotations
import json
import random
import asyncio
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Set, Any, Callable
from enum import Enum, auto
import uuid

# Import ButterflyFX substrate components
try:
    from helix import (
        Substrate, Level, SRL, srl,
        invoke, ingest, materialize,
        Token
    )
    from helix.kernel import HelixState, LEVEL_NAMES, SEMANTIC_NAMES
    HELIX_AVAILABLE = True
except ImportError:
    HELIX_AVAILABLE = False
    # Fallback for standalone operation
    class Level:
        POTENTIAL = 0
        POINT = 1
        LENGTH = 2
        WIDTH = 3
        PLANE = 4
        VOLUME = 5
        WHOLE = 6


# =============================================================================
# GAME CONSTANTS
# =============================================================================

PLAYER_COLORS = [
    {"name": "Red", "hex": "#e74c3c"},
    {"name": "Orange", "hex": "#f39c12"},
    {"name": "Green", "hex": "#27ae60"},
    {"name": "Blue", "hex": "#3498db"},
    {"name": "Purple", "hex": "#9b59b6"},
    {"name": "Yellow", "hex": "#f1c40f"},
]

CARD_SUITS = ["♥", "♦", "♣", "♠"]
CARD_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]

# Card values for movement
CARD_VALUES = {
    "A": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6,
    "7": 7, "8": 8, "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "JK": 0
}

# Special entry cards
ENTRY_CARDS = {"A", "K", "JK"}


# =============================================================================
# LEVEL 1 - POINT: Individual Token State
# =============================================================================

class TokenLocation(Enum):
    """Where a token can be on the board"""
    HOLDING = "holding"      # In player's holding area (off track)
    HOME = "home"            # On home diamond (start position for 5th token)
    TRACK = "track"          # On main circular track
    FAST_TRACK = "fasttrack" # On fast track shortcut
    SAFE_ZONE = "safe"       # In safe zone (approaching center)
    FINISHED = "finished"    # Completed the circuit


@dataclass
class GameToken:
    """
    Level 1 - Point: A single game token (peg).
    
    Substrate principle: Identity before manifestation.
    The token EXISTS at level 1 before it APPEARS at level 4.
    """
    id: str
    player_id: int
    token_index: int
    location: TokenLocation = TokenLocation.HOLDING
    position_id: str = ""  # Hole ID where token sits
    track_position: int = -1  # Position along track (0-89 for 6 sections × 15)
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "playerId": self.player_id,
            "tokenIndex": self.token_index,
            "location": self.location.value,
            "positionId": self.position_id,
            "trackPosition": self.track_position
        }
    
    @classmethod
    def create(cls, player_id: int, index: int) -> "GameToken":
        """Factory method for creating tokens"""
        token_id = f"token_{player_id}_{index}"
        
        # 5th token (index 4) starts on home diamond, others in holding
        if index == 4:
            return cls(
                id=token_id,
                player_id=player_id,
                token_index=index,
                location=TokenLocation.HOME,
                position_id=f"home_{player_id}"
            )
        else:
            return cls(
                id=token_id,
                player_id=player_id,
                token_index=index,
                location=TokenLocation.HOLDING,
                position_id=f"holding_{player_id}_{index}"
            )


# =============================================================================
# LEVEL 2 - LENGTH: Card/Path State
# =============================================================================

@dataclass
class Card:
    """
    Level 2 - Length: A playing card (represents a path/distance).
    
    Cards ARE lengths - they define how far a token can move.
    """
    rank: str
    suit: str
    deck_id: int = 0  # Which deck (for multi-deck modes)
    
    @property
    def value(self) -> int:
        return CARD_VALUES.get(self.rank, 0)
    
    @property
    def is_red(self) -> bool:
        return self.suit in ["♥", "♦"]
    
    @property
    def is_entry_card(self) -> bool:
        return self.rank in ENTRY_CARDS
    
    def to_dict(self) -> dict:
        return {
            "rank": self.rank,
            "suit": self.suit,
            "value": self.value,
            "isRed": self.is_red,
            "isEntry": self.is_entry_card
        }
    
    @staticmethod
    def create_deck(num_decks: int = 1) -> List["Card"]:
        """Create shuffled deck(s) with jokers"""
        cards = []
        for deck_id in range(num_decks):
            for suit in CARD_SUITS:
                for rank in CARD_RANKS:
                    cards.append(Card(rank, suit, deck_id))
            # Add 2 jokers per deck
            cards.append(Card("JK", "🃏", deck_id))
            cards.append(Card("JK", "🃏", deck_id))
        
        random.shuffle(cards)
        return cards


# =============================================================================
# LEVEL 3 - WIDTH: Player State
# =============================================================================

class GameMode(Enum):
    """Game mode variants"""
    SINGLE_CARD = "single"    # 1 card per turn, must use it
    FIVE_CARD = "fivecard"    # 5 cards, choose which to play


@dataclass
class Player:
    """
    Level 3 - Width: A player's complete state.
    
    Includes tokens (points), cards (lengths), and relationships.
    """
    id: int
    name: str
    color: dict
    tokens: List[GameToken] = field(default_factory=list)
    hand: List[Card] = field(default_factory=list)
    deck: List[Card] = field(default_factory=list)
    finished_count: int = 0
    connected: bool = True
    websocket: Optional[Any] = None
    
    def __post_init__(self):
        if not self.tokens:
            # Create 5 tokens per player
            self.tokens = [GameToken.create(self.id, i) for i in range(5)]
    
    @property
    def is_winner(self) -> bool:
        """Win: 4 tokens finished + 5th token on home diamond"""
        finished = sum(1 for t in self.tokens if t.location == TokenLocation.FINISHED)
        home_token = any(t.location == TokenLocation.HOME for t in self.tokens)
        return finished >= 4 and home_token
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "color": self.color,
            "tokens": [t.to_dict() for t in self.tokens],
            "hand": [c.to_dict() for c in self.hand],
            "deckSize": len(self.deck),
            "finishedCount": self.finished_count,
            "connected": self.connected
        }


# =============================================================================
# LEVEL 4 - PLANE: Board State (Manifestation)
# =============================================================================

@dataclass
class BoardState:
    """
    Level 4 - Plane: The game board state.
    
    This is where tokens MANIFEST - become visible on the board.
    The collapsed projection from higher dimensions.
    """
    occupied_holes: Dict[str, str] = field(default_factory=dict)  # hole_id -> token_id
    
    def place_token(self, hole_id: str, token_id: str):
        """Manifest a token at a position"""
        self.occupied_holes[hole_id] = token_id
    
    def remove_token(self, hole_id: str) -> Optional[str]:
        """Remove token from position"""
        return self.occupied_holes.pop(hole_id, None)
    
    def get_token_at(self, hole_id: str) -> Optional[str]:
        """Get token at position (if any)"""
        return self.occupied_holes.get(hole_id)
    
    def is_occupied(self, hole_id: str) -> bool:
        return hole_id in self.occupied_holes
    
    def to_dict(self) -> dict:
        return {"occupiedHoles": self.occupied_holes}


# =============================================================================
# LEVEL 5 - VOLUME: Game Session (Multiplicity)
# =============================================================================

class GamePhase(Enum):
    """Game session phase"""
    LOBBY = "lobby"
    PLAYING = "playing"
    FINISHED = "finished"


@dataclass
class FastTrackGame:
    """
    Level 5 - Volume: Complete game session.
    
    The full game state with all players, board, and history.
    Implements ButterflyFX substrate pattern.
    """
    game_id: str
    mode: GameMode
    players: List[Player] = field(default_factory=list)
    board: BoardState = field(default_factory=BoardState)
    current_player_index: int = 0
    phase: GamePhase = GamePhase.LOBBY
    turn_number: int = 0
    history: List[dict] = field(default_factory=list)
    winner: Optional[int] = None
    
    # Substrate event callbacks
    _callbacks: Dict[str, List[Callable]] = field(default_factory=dict)
    
    def __post_init__(self):
        if not self._callbacks:
            self._callbacks = {
                "state_changed": [],
                "turn_changed": [],
                "token_moved": [],
                "card_played": [],
                "game_over": [],
            }
    
    # =========================================================================
    # SUBSTRATE OPERATIONS
    # =========================================================================
    
    def on(self, event: str, callback: Callable):
        """Register event callback (substrate pattern)"""
        if event in self._callbacks:
            self._callbacks[event].append(callback)
    
    def emit(self, event: str, data: Any = None):
        """Emit event to all callbacks"""
        for callback in self._callbacks.get(event, []):
            try:
                callback(data)
            except Exception as e:
                print(f"Callback error: {e}")
    
    # =========================================================================
    # PLAYER MANAGEMENT
    # =========================================================================
    
    def add_player(self, name: str, websocket: Any = None) -> Optional[Player]:
        """Add a player to the game"""
        if len(self.players) >= 6:
            return None
        
        player_id = len(self.players)
        num_decks = 2 if self.mode == GameMode.FIVE_CARD else 1
        
        player = Player(
            id=player_id,
            name=name,
            color=PLAYER_COLORS[player_id],
            deck=Card.create_deck(num_decks),
            websocket=websocket
        )
        
        # Draw initial hand
        self._draw_cards(player)
        
        # Place tokens on board
        for token in player.tokens:
            self.board.place_token(token.position_id, token.id)
        
        self.players.append(player)
        self.emit("state_changed", self.to_dict())
        return player
    
    def _draw_cards(self, player: Player):
        """Draw cards based on game mode"""
        cards_to_draw = 5 if self.mode == GameMode.FIVE_CARD else 1
        
        # Discard current hand
        player.hand = []
        
        for _ in range(cards_to_draw):
            if not player.deck:
                # Reshuffle - create new deck
                num_decks = 2 if self.mode == GameMode.FIVE_CARD else 1
                player.deck = Card.create_deck(num_decks)
            
            player.hand.append(player.deck.pop())
    
    # =========================================================================
    # GAME FLOW
    # =========================================================================
    
    def start_game(self) -> bool:
        """Start the game"""
        if len(self.players) < 2:
            return False
        
        self.phase = GamePhase.PLAYING
        self.current_player_index = 0
        self.turn_number = 1
        self.emit("state_changed", self.to_dict())
        return True
    
    @property
    def current_player(self) -> Optional[Player]:
        if 0 <= self.current_player_index < len(self.players):
            return self.players[self.current_player_index]
        return None
    
    def next_turn(self):
        """Advance to next player's turn"""
        self.current_player_index = (self.current_player_index + 1) % len(self.players)
        self.turn_number += 1
        
        # Draw new cards for the player
        if self.current_player:
            self._draw_cards(self.current_player)
        
        self.emit("turn_changed", {
            "playerId": self.current_player_index,
            "turnNumber": self.turn_number
        })
        self.emit("state_changed", self.to_dict())
    
    # =========================================================================
    # MOVE CALCULATION (Level 0 - Potential)
    # =========================================================================
    
    def calculate_valid_moves(self, player: Player, card_index: int) -> List[dict]:
        """
        Level 0 - Potential: Calculate all possible moves.
        
        This is the POTENTIAL space - what CAN happen.
        """
        if card_index >= len(player.hand):
            return []
        
        card = player.hand[card_index]
        valid_moves = []
        
        for token in player.tokens:
            token_moves = self._get_token_moves(player, token, card)
            valid_moves.extend(token_moves)
        
        return valid_moves
    
    def _get_token_moves(self, player: Player, token: GameToken, card: Card) -> List[dict]:
        """Get valid moves for a specific token with a specific card"""
        moves = []
        
        # Token in holding - can enter with entry card
        if token.location == TokenLocation.HOLDING:
            if card.is_entry_card:
                ft_id = f"FT_{player.id}"
                if not self._is_occupied_by_self(ft_id, player.id):
                    moves.append({
                        "tokenId": token.id,
                        "fromId": token.position_id,
                        "toId": ft_id,
                        "type": "enter",
                        "description": f"Enter Fast Track with {card.rank}"
                    })
        
        # Token on home diamond - can enter track or safe zone
        elif token.location == TokenLocation.HOME:
            # Can move to first track position or safe zone
            move_value = card.value
            if move_value > 0:
                # Enter safe zone
                if move_value <= 4:
                    safe_id = f"safe_{player.id}_{move_value - 1}"
                    moves.append({
                        "tokenId": token.id,
                        "fromId": token.position_id,
                        "toId": safe_id,
                        "type": "safe",
                        "description": f"Move to Safe Zone with {card.rank}"
                    })
        
        # Token on track - move forward
        elif token.location in [TokenLocation.TRACK, TokenLocation.FAST_TRACK]:
            move_value = card.value
            if move_value > 0:
                new_pos = (token.track_position + move_value) % 90
                dest_id = f"track_{new_pos // 15}_{new_pos % 15}"
                
                if not self._is_occupied_by_self(dest_id, player.id):
                    moves.append({
                        "tokenId": token.id,
                        "fromId": token.position_id,
                        "toId": dest_id,
                        "type": "move",
                        "newTrackPos": new_pos,
                        "description": f"Move {move_value} spaces"
                    })
        
        # Token in safe zone - move toward center
        elif token.location == TokenLocation.SAFE_ZONE:
            current_safe_idx = int(token.position_id.split("_")[-1])
            move_value = card.value
            new_safe_idx = current_safe_idx + move_value
            
            if new_safe_idx < 4:
                dest_id = f"safe_{player.id}_{new_safe_idx}"
                moves.append({
                    "tokenId": token.id,
                    "fromId": token.position_id,
                    "toId": dest_id,
                    "type": "safe",
                    "description": f"Move in Safe Zone"
                })
            elif new_safe_idx == 4:
                # Exact landing - finish!
                moves.append({
                    "tokenId": token.id,
                    "fromId": token.position_id,
                    "toId": "CENTER",
                    "type": "finish",
                    "description": f"Finish with {card.rank}!"
                })
        
        return moves
    
    def _is_occupied_by_self(self, hole_id: str, player_id: int) -> bool:
        """Check if a hole is occupied by player's own token"""
        token_id = self.board.get_token_at(hole_id)
        if token_id:
            return token_id.startswith(f"token_{player_id}_")
        return False
    
    # =========================================================================
    # MOVE EXECUTION
    # =========================================================================
    
    def execute_move(self, player_id: int, card_index: int, move: dict) -> dict:
        """Execute a move - transitions from Potential to Manifestation"""
        if player_id != self.current_player_index:
            return {"success": False, "error": "Not your turn"}
        
        player = self.current_player
        if not player or card_index >= len(player.hand):
            return {"success": False, "error": "Invalid card"}
        
        card = player.hand[card_index]
        token_id = move.get("tokenId")
        from_id = move.get("fromId")
        to_id = move.get("toId")
        
        # Find the token
        token = next((t for t in player.tokens if t.id == token_id), None)
        if not token:
            return {"success": False, "error": "Token not found"}
        
        # Execute the move
        result = {"success": True, "captures": []}
        
        # Remove from old position
        self.board.remove_token(from_id)
        
        # Check for capture at destination
        captured_token_id = self.board.get_token_at(to_id)
        if captured_token_id and not to_id.startswith("safe_"):
            # Send captured token back to holding
            result["captures"].append(captured_token_id)
            self._capture_token(captured_token_id)
        
        # Place at new position
        if move.get("type") == "finish":
            token.location = TokenLocation.FINISHED
            token.position_id = ""
            player.finished_count += 1
        else:
            self.board.place_token(to_id, token_id)
            token.position_id = to_id
            
            # Update location type
            if to_id.startswith("FT_"):
                token.location = TokenLocation.FAST_TRACK
            elif to_id.startswith("safe_"):
                token.location = TokenLocation.SAFE_ZONE
            elif to_id.startswith("track_"):
                token.location = TokenLocation.TRACK
                token.track_position = move.get("newTrackPos", 0)
        
        # Remove used card
        player.hand.pop(card_index)
        
        # Record in history
        self.history.append({
            "turn": self.turn_number,
            "playerId": player_id,
            "card": card.to_dict(),
            "move": move,
            "result": result
        })
        
        # Emit events
        self.emit("card_played", {"playerId": player_id, "card": card.to_dict()})
        self.emit("token_moved", {"tokenId": token_id, "from": from_id, "to": to_id})
        
        # Check for win
        if player.is_winner:
            self.phase = GamePhase.FINISHED
            self.winner = player_id
            self.emit("game_over", {"winnerId": player_id, "winnerName": player.name})
        else:
            # Next turn
            self.next_turn()
        
        return result
    
    def _capture_token(self, token_id: str):
        """Send a captured token back to holding"""
        parts = token_id.split("_")
        if len(parts) >= 3:
            player_id = int(parts[1])
            token_idx = int(parts[2])
            
            if player_id < len(self.players):
                player = self.players[player_id]
                for token in player.tokens:
                    if token.id == token_id:
                        # Find available holding spot
                        for i in range(4):
                            hold_id = f"holding_{player_id}_{i}"
                            if not self.board.is_occupied(hold_id):
                                token.location = TokenLocation.HOLDING
                                token.position_id = hold_id
                                token.track_position = -1
                                self.board.place_token(hold_id, token_id)
                                break
    
    def pass_turn(self, player_id: int) -> bool:
        """Pass the current turn"""
        if player_id != self.current_player_index:
            return False
        
        # Discard first card in single mode
        if self.current_player and self.current_player.hand:
            self.current_player.hand.pop(0)
        
        self.next_turn()
        return True
    
    # =========================================================================
    # SERIALIZATION
    # =========================================================================
    
    def to_dict(self) -> dict:
        """Serialize complete game state"""
        return {
            "gameId": self.game_id,
            "mode": self.mode.value,
            "phase": self.phase.value,
            "players": [p.to_dict() for p in self.players],
            "board": self.board.to_dict(),
            "currentPlayerIndex": self.current_player_index,
            "turnNumber": self.turn_number,
            "winner": self.winner
        }
    
    @classmethod
    def create(cls, mode: str = "single") -> "FastTrackGame":
        """Factory method for creating games"""
        game_mode = GameMode.FIVE_CARD if mode == "fivecard" else GameMode.SINGLE_CARD
        return cls(
            game_id=str(uuid.uuid4())[:8].upper(),
            mode=game_mode
        )


# =============================================================================
# LEVEL 6 - WHOLE: Game Universe (Meaning/Interpretation)
# =============================================================================

class FastTrackUniverse:
    """
    Level 6 - Whole: The complete game universe.
    
    Manages all games, leaderboards, achievements.
    This is the highest level of abstraction.
    """
    
    def __init__(self):
        self.games: Dict[str, FastTrackGame] = {}
        self.leaderboard: List[dict] = []
        
    def create_game(self, mode: str = "single") -> FastTrackGame:
        """Create a new game in the universe"""
        game = FastTrackGame.create(mode)
        self.games[game.game_id] = game
        
        # Register win callback for leaderboard
        game.on("game_over", lambda data: self._record_win(game, data))
        
        return game
    
    def get_game(self, game_id: str) -> Optional[FastTrackGame]:
        return self.games.get(game_id)
    
    def remove_game(self, game_id: str):
        self.games.pop(game_id, None)
    
    def _record_win(self, game: FastTrackGame, data: dict):
        """Record a win on the leaderboard"""
        winner_id = data.get("winnerId")
        if winner_id is not None and winner_id < len(game.players):
            winner = game.players[winner_id]
            self.leaderboard.append({
                "playerName": winner.name,
                "gameId": game.game_id,
                "mode": game.mode.value,
                "turns": game.turn_number
            })
            # Keep top 100
            self.leaderboard = sorted(
                self.leaderboard, 
                key=lambda x: x["turns"]
            )[:100]


# Global universe instance
GAME_UNIVERSE = FastTrackUniverse()


# =============================================================================
# SUBSTRATE INTEGRATION
# =============================================================================

if HELIX_AVAILABLE:
    # Register game entities with ButterflyFX substrate
    def register_fasttrack_substrate():
        """Register Fast Track game types with the helix substrate"""
        from helix import core_get, put
        
        # Register game patterns at appropriate levels
        put("fasttrack.token", Level.POINT)
        put("fasttrack.card", Level.LENGTH)
        put("fasttrack.player", Level.WIDTH)
        put("fasttrack.board", Level.PLANE)
        put("fasttrack.game", Level.VOLUME)
        put("fasttrack.universe", Level.WHOLE)
