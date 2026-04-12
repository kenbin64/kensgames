"""
Fast Track - Exact Board Specification Implementation
=====================================================
This implements the EXACT board geometry as specified:
- Regular hexagon board
- 6 player zones: Orange, Brown, Red, Yellow, Green, Blue
- Precise coordinate-based hole placement
- 6 pegs per player lifecycle

Author: ButterflyFX Dimensional Kernel
"""

import math
from dataclasses import dataclass, field
from typing import List, Dict, Tuple, Optional, Set
from enum import Enum
import json

# =============================================================================
# BOARD CONSTANTS - DO NOT MODIFY
# =============================================================================

R = 300  # Outer hexagon radius (units)
FAST_R = R * 0.55  # Fast track hexagon radius
SAFE_STEPS = 4  # Exactly 4 safe zone holes per player
TRACK_PER_SIDE = 10  # Exactly 10 outer track holes per hexagon side
TOTAL_OUTER_TRACK = 6 * TRACK_PER_SIDE  # 60 total outer track holes

# Player colors in clockwise order
PLAYER_COLORS = ["orange", "brown", "red", "yellow", "green", "blue"]

# Hexagon vertex angles (starting at -30° for proper orientation)
HEX_ANGLES = [-30, 30, 90, 150, 210, 270]


# =============================================================================
# DATA STRUCTURES
# =============================================================================

class HoleType(Enum):
    """Exact hole types as specified"""
    OUTER = "outer"          # Outer track holes (60 total)
    SAFE = "safe"            # Safe zone holes (4 per player)
    HOLDING = "holding"      # Holding area holes (4 per player)
    START = "start"          # Start hole (1 per player, on outer track)
    WINNER = "winner"        # Winner hole (1 per player, inside start)
    FAST_ENTRY = "fast_entry"  # Fast track entry (1 per player)
    FAST_EXIT = "fast_exit"    # Fast track exit (1 per player)
    FAST = "fast"            # Fast track intermediate holes
    CENTER = "center"        # Center hole


class PegState(Enum):
    """All possible peg states in lifecycle"""
    IN_HOLDING = "in_holding"      # Waiting to be released
    ON_START = "on_start"          # On start position (initial setup for 1 peg)
    ON_TRACK = "on_track"          # Moving on outer track
    ON_FAST_TRACK = "on_fast_track"  # Moving on fast track
    IN_SAFE_ZONE = "in_safe_zone"  # In safe zone
    ON_WINNER = "on_winner"        # Reached winner hole (finished)
    CAPTURED = "captured"          # Captured - returns to holding


@dataclass
class Hole:
    """A specific hole on the board with exact coordinates"""
    id: str
    x: float
    y: float
    hole_type: HoleType
    player_id: Optional[int] = None  # Which player this belongs to (for safe/holding/start/winner)
    track_index: Optional[int] = None  # Position on outer track (0-59)
    safe_index: Optional[int] = None  # Position in safe zone (0-3)
    fast_index: Optional[int] = None  # Position on fast track
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "x": self.x,
            "y": self.y,
            "type": self.hole_type.value,
            "player_id": self.player_id,
            "track_index": self.track_index,
            "safe_index": self.safe_index,
            "fast_index": self.fast_index
        }


@dataclass
class Peg:
    """A peg/token with its state and position"""
    id: str
    player_id: int
    color: str
    state: PegState
    hole_id: Optional[str] = None  # Current hole ID
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "player_id": self.player_id,
            "color": self.color,
            "state": self.state.value,
            "hole_id": self.hole_id
        }


@dataclass
class PlayerZone:
    """A player's zone with all their holes"""
    player_id: int
    color: str
    holding_holes: List[Hole]  # Exactly 4
    start_hole: Hole  # Exactly 1
    winner_hole: Hole  # Exactly 1
    safe_zone_holes: List[Hole]  # Exactly 4
    fast_entry_hole: Hole  # Entry to fast track
    fast_exit_hole: Hole  # Exit from fast track


@dataclass 
class Card:
    """A playing card"""
    rank: str  # "A", "2"-"10", "J", "Q", "K", "JOKER"
    suit: Optional[str] = None  # "hearts", "diamonds", "clubs", "spades" or None for joker


# =============================================================================
# GEOMETRY FUNCTIONS
# =============================================================================

def hex_vertex(angle_deg: float, radius: float) -> Tuple[float, float]:
    """Compute a point on a circle at given angle and radius"""
    a = math.radians(angle_deg)
    return radius * math.cos(a), radius * math.sin(a)


def lerp_point(p1: Tuple[float, float], p2: Tuple[float, float], t: float) -> Tuple[float, float]:
    """Linear interpolation between two points"""
    return p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t


def perpendicular_offset(p1: Tuple[float, float], p2: Tuple[float, float], 
                         point: Tuple[float, float], offset: float) -> Tuple[float, float]:
    """Offset a point perpendicular to a line"""
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    length = math.sqrt(dx*dx + dy*dy)
    # Perpendicular unit vector pointing outward
    nx = -dy / length
    ny = dx / length
    return point[0] + nx * offset, point[1] + ny * offset


# =============================================================================
# BOARD GENERATOR
# =============================================================================

class BoardGenerator:
    """Generates the exact board geometry"""
    
    def __init__(self, radius: float = R, fast_radius: float = FAST_R):
        self.radius = radius
        self.fast_radius = fast_radius
        self.vertices = [hex_vertex(a, radius) for a in HEX_ANGLES]
        self.fast_vertices = [hex_vertex(a, fast_radius) for a in HEX_ANGLES]
        
        # All holes
        self.outer_track: List[Hole] = []
        self.fast_track: List[Hole] = []
        self.center_hole: Hole = None
        self.player_zones: Dict[int, PlayerZone] = {}
        
        # Lookup tables
        self.hole_by_id: Dict[str, Hole] = {}
        
    def generate(self) -> Dict:
        """Generate the complete board"""
        self._generate_outer_track()
        self._generate_fast_track()
        self._generate_center()
        self._generate_player_zones()
        self._build_lookup()
        return self.to_dict()
    
    def _generate_outer_track(self):
        """Generate exactly 60 outer track holes (10 per side)"""
        hole_id = 0
        for side in range(6):
            v1 = self.vertices[side]
            v2 = self.vertices[(side + 1) % 6]
            
            for step in range(TRACK_PER_SIDE):
                # Evenly space holes, starting just after vertex
                t = (step + 0.5) / TRACK_PER_SIDE
                x, y = lerp_point(v1, v2, t)
                
                hole = Hole(
                    id=f"outer_{hole_id}",
                    x=x,
                    y=y,
                    hole_type=HoleType.OUTER,
                    track_index=hole_id
                )
                self.outer_track.append(hole)
                hole_id += 1
    
    def _generate_fast_track(self):
        """Generate fast track holes inside the hexagon"""
        hole_id = 0
        # 12 fast track holes total (2 per side: entry and exit)
        for side in range(6):
            v1 = self.fast_vertices[side]
            v2 = self.fast_vertices[(side + 1) % 6]
            
            # Entry hole at 1/3 position
            entry_x, entry_y = lerp_point(v1, v2, 1/3)
            entry = Hole(
                id=f"fast_entry_{side}",
                x=entry_x,
                y=entry_y,
                hole_type=HoleType.FAST_ENTRY,
                player_id=side,
                fast_index=hole_id
            )
            self.fast_track.append(entry)
            hole_id += 1
            
            # Exit hole at 2/3 position
            exit_x, exit_y = lerp_point(v1, v2, 2/3)
            exit_hole = Hole(
                id=f"fast_exit_{side}",
                x=exit_x,
                y=exit_y,
                hole_type=HoleType.FAST_EXIT,
                player_id=side,
                fast_index=hole_id
            )
            self.fast_track.append(exit_hole)
            hole_id += 1
    
    def _generate_center(self):
        """Generate center hole"""
        self.center_hole = Hole(
            id="center",
            x=0,
            y=0,
            hole_type=HoleType.CENTER
        )
    
    def _generate_player_zones(self):
        """Generate all player zones with exact hole placement"""
        for player_id in range(6):
            v1 = self.vertices[player_id]
            v2 = self.vertices[(player_id + 1) % 6]
            
            # Midpoint of this edge
            mid_x, mid_y = lerp_point(v1, v2, 0.5)
            
            # Direction vector from center to midpoint (for safe zone alignment)
            dist = math.sqrt(mid_x**2 + mid_y**2)
            dir_x, dir_y = mid_x / dist, mid_y / dist
            
            # === START HOLE ===
            # Located at the midpoint of the edge on the outer track
            # Find the outer track hole closest to midpoint
            start_track_index = player_id * TRACK_PER_SIDE + TRACK_PER_SIDE // 2
            start_hole = self.outer_track[start_track_index]
            start_hole.hole_type = HoleType.START
            start_hole.player_id = player_id
            
            # === WINNER HOLE ===
            # Located directly inside the start hole along the safe zone line
            # At 85% of the distance from center to edge midpoint
            winner_dist = dist * 0.85
            winner_x = dir_x * winner_dist
            winner_y = dir_y * winner_dist
            winner_hole = Hole(
                id=f"winner_{player_id}",
                x=winner_x,
                y=winner_y,
                hole_type=HoleType.WINNER,
                player_id=player_id
            )
            
            # === SAFE ZONE HOLES ===
            # 4 holes in a line from winner hole toward center
            safe_zone_holes = []
            for s in range(SAFE_STEPS):
                # Distribute between winner hole and center
                # Start from winner (s=0) going toward center (s=3)
                safe_dist = winner_dist * (1 - (s + 1) / (SAFE_STEPS + 1))
                safe_x = dir_x * safe_dist
                safe_y = dir_y * safe_dist
                safe_hole = Hole(
                    id=f"safe_{player_id}_{s}",
                    x=safe_x,
                    y=safe_y,
                    hole_type=HoleType.SAFE,
                    player_id=player_id,
                    safe_index=s
                )
                safe_zone_holes.append(safe_hole)
            
            # === HOLDING AREA HOLES ===
            # 4 holes in a 2x2 grid outside the edge
            holding_holes = []
            # Position holding area outside the edge at 115% radius
            hold_center_x = dir_x * dist * 1.15
            hold_center_y = dir_y * dist * 1.15
            
            # Get perpendicular direction
            edge_dx = v2[0] - v1[0]
            edge_dy = v2[1] - v1[1]
            edge_len = math.sqrt(edge_dx**2 + edge_dy**2)
            perp_x, perp_y = edge_dx / edge_len, edge_dy / edge_len
            
            # Create 2x2 grid with 20-unit spacing
            spacing = 20
            for i in range(4):
                row = i // 2
                col = i % 2
                hold_x = hold_center_x + (col - 0.5) * spacing * perp_x + (row - 0.5) * spacing * dir_x
                hold_y = hold_center_y + (col - 0.5) * spacing * perp_y + (row - 0.5) * spacing * dir_y
                hold_hole = Hole(
                    id=f"holding_{player_id}_{i}",
                    x=hold_x,
                    y=hold_y,
                    hole_type=HoleType.HOLDING,
                    player_id=player_id
                )
                holding_holes.append(hold_hole)
            
            # === FAST TRACK ENTRY/EXIT ===
            fast_entry = next(h for h in self.fast_track if h.id == f"fast_entry_{player_id}")
            fast_exit = next(h for h in self.fast_track if h.id == f"fast_exit_{player_id}")
            
            # Create player zone
            self.player_zones[player_id] = PlayerZone(
                player_id=player_id,
                color=PLAYER_COLORS[player_id],
                holding_holes=holding_holes,
                start_hole=start_hole,
                winner_hole=winner_hole,
                safe_zone_holes=safe_zone_holes,
                fast_entry_hole=fast_entry,
                fast_exit_hole=fast_exit
            )
    
    def _build_lookup(self):
        """Build hole lookup by ID"""
        # Outer track
        for hole in self.outer_track:
            self.hole_by_id[hole.id] = hole
        
        # Fast track
        for hole in self.fast_track:
            self.hole_by_id[hole.id] = hole
        
        # Center
        self.hole_by_id[self.center_hole.id] = self.center_hole
        
        # Player zones
        for zone in self.player_zones.values():
            for hole in zone.holding_holes:
                self.hole_by_id[hole.id] = hole
            self.hole_by_id[zone.winner_hole.id] = zone.winner_hole
            for hole in zone.safe_zone_holes:
                self.hole_by_id[hole.id] = hole
    
    def to_dict(self) -> dict:
        """Export board as dictionary for JSON serialization"""
        return {
            "radius": self.radius,
            "fast_radius": self.fast_radius,
            "outer_track": [h.to_dict() for h in self.outer_track],
            "fast_track": [h.to_dict() for h in self.fast_track],
            "center": self.center_hole.to_dict() if self.center_hole else None,
            "player_zones": {
                pid: {
                    "player_id": zone.player_id,
                    "color": zone.color,
                    "holding_holes": [h.to_dict() for h in zone.holding_holes],
                    "start_hole": zone.start_hole.to_dict(),
                    "winner_hole": zone.winner_hole.to_dict(),
                    "safe_zone_holes": [h.to_dict() for h in zone.safe_zone_holes],
                    "fast_entry": zone.fast_entry_hole.to_dict(),
                    "fast_exit": zone.fast_exit_hole.to_dict()
                }
                for pid, zone in self.player_zones.items()
            },
            "totals": {
                "outer_track_holes": len(self.outer_track),
                "fast_track_holes": len(self.fast_track),
                "holding_holes_per_player": 4,
                "safe_zone_holes_per_player": 4,
                "total_holes": (
                    len(self.outer_track) + 
                    len(self.fast_track) + 
                    1 +  # center
                    6 * (4 + 1 + 4)  # per player: holding + winner + safe
                )
            }
        }


# =============================================================================
# GAME STATE
# =============================================================================

class FastTrackGame:
    """Complete game state and logic"""
    
    def __init__(self, num_players: int = 6):
        if num_players < 2 or num_players > 6:
            raise ValueError("Number of players must be between 2 and 6")
        
        self.num_players = num_players
        self.current_player = 0
        
        # Generate board
        self.board_gen = BoardGenerator()
        self.board_gen.generate()
        
        # Create pegs - EXACTLY 6 per player as specified
        self.pegs: Dict[str, Peg] = {}
        self.player_pegs: Dict[int, List[Peg]] = {}
        
        for player_id in range(num_players):
            zone = self.board_gen.player_zones[player_id]
            player_pegs = []
            
            # 4 pegs in holding area
            for i in range(4):
                peg = Peg(
                    id=f"peg_{player_id}_{i}",
                    player_id=player_id,
                    color=zone.color,
                    state=PegState.IN_HOLDING,
                    hole_id=zone.holding_holes[i].id
                )
                self.pegs[peg.id] = peg
                player_pegs.append(peg)
            
            # 1 peg on start hole
            start_peg = Peg(
                id=f"peg_{player_id}_start",
                player_id=player_id,
                color=zone.color,
                state=PegState.ON_START,
                hole_id=zone.start_hole.id
            )
            self.pegs[start_peg.id] = start_peg
            player_pegs.append(start_peg)
            
            # 1 peg on winner hole
            winner_peg = Peg(
                id=f"peg_{player_id}_winner",
                player_id=player_id,
                color=zone.color,
                state=PegState.ON_WINNER,
                hole_id=zone.winner_hole.id
            )
            self.pegs[winner_peg.id] = winner_peg
            player_pegs.append(winner_peg)
            
            self.player_pegs[player_id] = player_pegs
        
        # Card deck
        self.deck: List[Card] = []
        self.discard: List[Card] = []
        self._create_deck()
        self._shuffle_deck()
        
        # Player hands
        self.hands: Dict[int, List[Card]] = {i: [] for i in range(num_players)}
        self._deal_initial_hands()
    
    def _create_deck(self):
        """Create standard 54-card deck (52 + 2 jokers)"""
        suits = ["hearts", "diamonds", "clubs", "spades"]
        ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
        
        for suit in suits:
            for rank in ranks:
                self.deck.append(Card(rank=rank, suit=suit))
        
        # 2 jokers
        self.deck.append(Card(rank="JOKER", suit=None))
        self.deck.append(Card(rank="JOKER", suit=None))
    
    def _shuffle_deck(self):
        """Shuffle the deck"""
        import random
        random.shuffle(self.deck)
    
    def _deal_initial_hands(self, cards_per_hand: int = 5):
        """Deal initial hands to all players"""
        for _ in range(cards_per_hand):
            for player_id in range(self.num_players):
                if self.deck:
                    self.hands[player_id].append(self.deck.pop())
    
    def draw_card(self, player_id: int) -> Optional[Card]:
        """Draw a card for a player"""
        if not self.deck:
            # Reshuffle discard pile
            self.deck = self.discard
            self.discard = []
            self._shuffle_deck()
        
        if self.deck:
            card = self.deck.pop()
            self.hands[player_id].append(card)
            return card
        return None
    
    def get_hole(self, hole_id: str) -> Optional[Hole]:
        """Get a hole by ID"""
        return self.board_gen.hole_by_id.get(hole_id)
    
    def get_peg_at_hole(self, hole_id: str) -> Optional[Peg]:
        """Get peg at a specific hole"""
        for peg in self.pegs.values():
            if peg.hole_id == hole_id:
                return peg
        return None
    
    def get_valid_moves(self, peg_id: str, card: Card) -> List[str]:
        """Get all valid destination hole IDs for a peg given a card"""
        peg = self.pegs.get(peg_id)
        if not peg:
            return []
        
        moves = []
        
        # Card-specific logic
        if card.rank == "JOKER":
            moves.extend(self._get_joker_moves(peg))
        elif card.rank == "A":
            moves.extend(self._get_ace_moves(peg))
        elif card.rank == "K":
            moves.extend(self._get_king_moves(peg))
        elif card.rank == "Q":
            moves.extend(self._get_queen_moves(peg))
        elif card.rank == "J":
            moves.extend(self._get_jack_moves(peg))
        elif card.rank == "7":
            moves.extend(self._get_seven_moves(peg))
        elif card.rank == "4":
            moves.extend(self._get_four_moves(peg))
        else:
            # Number cards: 2, 3, 5, 6, 8, 9, 10
            value = int(card.rank)
            moves.extend(self._get_number_moves(peg, value))
        
        return moves
    
    def _get_joker_moves(self, peg: Peg) -> List[str]:
        """Joker: Capture any opponent's peg"""
        moves = []
        for other_peg in self.pegs.values():
            if other_peg.player_id != peg.player_id:
                if other_peg.state == PegState.ON_TRACK:
                    moves.append(other_peg.hole_id)
        return moves
    
    def _get_ace_moves(self, peg: Peg) -> List[str]:
        """Ace: Release from holding OR move 1 space"""
        moves = []
        
        if peg.state == PegState.IN_HOLDING:
            # Can release to start hole
            zone = self.board_gen.player_zones[peg.player_id]
            start_peg = self.get_peg_at_hole(zone.start_hole.id)
            if not start_peg or start_peg.player_id != peg.player_id:
                moves.append(zone.start_hole.id)
        elif peg.state == PegState.ON_TRACK:
            # Move 1 forward
            moves.extend(self._get_track_moves(peg, 1))
        
        return moves
    
    def _get_king_moves(self, peg: Peg) -> List[str]:
        """King: Release from holding OR move 13 spaces"""
        moves = []
        
        if peg.state == PegState.IN_HOLDING:
            zone = self.board_gen.player_zones[peg.player_id]
            start_peg = self.get_peg_at_hole(zone.start_hole.id)
            if not start_peg or start_peg.player_id != peg.player_id:
                moves.append(zone.start_hole.id)
        elif peg.state == PegState.ON_TRACK:
            moves.extend(self._get_track_moves(peg, 13))
        
        return moves
    
    def _get_queen_moves(self, peg: Peg) -> List[str]:
        """Queen: Move 12 spaces"""
        if peg.state == PegState.ON_TRACK:
            return self._get_track_moves(peg, 12)
        return []
    
    def _get_jack_moves(self, peg: Peg) -> List[str]:
        """Jack: Swap with any opponent's peg on track"""
        moves = []
        if peg.state == PegState.ON_TRACK:
            for other_peg in self.pegs.values():
                if other_peg.player_id != peg.player_id:
                    if other_peg.state == PegState.ON_TRACK:
                        moves.append(other_peg.hole_id)
        return moves
    
    def _get_seven_moves(self, peg: Peg) -> List[str]:
        """Seven: Move 7 OR split between two pegs"""
        # For now, just return single moves of 7
        # Split moves handled separately
        if peg.state == PegState.ON_TRACK:
            return self._get_track_moves(peg, 7)
        return []
    
    def _get_four_moves(self, peg: Peg) -> List[str]:
        """Four: Move backward 4 spaces"""
        if peg.state == PegState.ON_TRACK:
            return self._get_track_moves(peg, -4)
        return []
    
    def _get_number_moves(self, peg: Peg, value: int) -> List[str]:
        """Number cards: Move forward that many spaces"""
        if peg.state == PegState.ON_TRACK:
            return self._get_track_moves(peg, value)
        return []
    
    def _get_track_moves(self, peg: Peg, spaces: int) -> List[str]:
        """Calculate track movement possibilities"""
        moves = []
        hole = self.get_hole(peg.hole_id)
        
        if not hole or hole.track_index is None:
            return moves
        
        # Calculate destination on outer track
        if spaces > 0:
            # Forward movement
            dest_index = (hole.track_index + spaces) % TOTAL_OUTER_TRACK
        else:
            # Backward movement (4 card)
            dest_index = (hole.track_index + spaces) % TOTAL_OUTER_TRACK
        
        dest_hole = self.board_gen.outer_track[dest_index]
        
        # Check if destination is blocked by own peg
        dest_peg = self.get_peg_at_hole(dest_hole.id)
        if not dest_peg or dest_peg.player_id != peg.player_id:
            moves.append(dest_hole.id)
        
        # Check for safe zone entry
        zone = self.board_gen.player_zones[peg.player_id]
        start_track_index = zone.start_hole.track_index
        
        # If passing over start, check for safe zone entry
        if spaces > 0:
            for i in range(1, spaces + 1):
                check_index = (hole.track_index + i) % TOTAL_OUTER_TRACK
                if check_index == start_track_index:
                    # Calculate safe zone depth
                    safe_depth = spaces - i - 1
                    if 0 <= safe_depth < SAFE_STEPS:
                        safe_hole = zone.safe_zone_holes[safe_depth]
                        safe_peg = self.get_peg_at_hole(safe_hole.id)
                        if not safe_peg or safe_peg.player_id != peg.player_id:
                            moves.append(safe_hole.id)
                    elif safe_depth == SAFE_STEPS:
                        # Exact landing on winner hole
                        winner_peg = self.get_peg_at_hole(zone.winner_hole.id)
                        if not winner_peg or winner_peg.player_id != peg.player_id:
                            moves.append(zone.winner_hole.id)
                    break
        
        return moves
    
    def move_peg(self, peg_id: str, dest_hole_id: str) -> dict:
        """Execute a peg movement"""
        peg = self.pegs.get(peg_id)
        if not peg:
            return {"success": False, "error": "Peg not found"}
        
        dest_hole = self.get_hole(dest_hole_id)
        if not dest_hole:
            return {"success": False, "error": "Destination hole not found"}
        
        # Check for capture
        captured_peg = self.get_peg_at_hole(dest_hole_id)
        capture_info = None
        
        if captured_peg and captured_peg.player_id != peg.player_id:
            # Capture opponent's peg - send to holding
            cap_zone = self.board_gen.player_zones[captured_peg.player_id]
            for hold_hole in cap_zone.holding_holes:
                if not self.get_peg_at_hole(hold_hole.id):
                    captured_peg.hole_id = hold_hole.id
                    captured_peg.state = PegState.IN_HOLDING
                    capture_info = {"captured": captured_peg.id}
                    break
        
        # Move peg
        peg.hole_id = dest_hole_id
        
        # Update state based on destination
        if dest_hole.hole_type == HoleType.OUTER or dest_hole.hole_type == HoleType.START:
            peg.state = PegState.ON_TRACK
        elif dest_hole.hole_type == HoleType.SAFE:
            peg.state = PegState.IN_SAFE_ZONE
        elif dest_hole.hole_type == HoleType.WINNER:
            peg.state = PegState.ON_WINNER
        elif dest_hole.hole_type in [HoleType.FAST, HoleType.FAST_ENTRY, HoleType.FAST_EXIT]:
            peg.state = PegState.ON_FAST_TRACK
        
        result = {
            "success": True,
            "peg_id": peg_id,
            "from": peg.hole_id,
            "to": dest_hole_id,
            "new_state": peg.state.value
        }
        
        if capture_info:
            result.update(capture_info)
        
        # Check for win
        if self.check_win(peg.player_id):
            result["winner"] = peg.player_id
        
        return result
    
    def check_win(self, player_id: int) -> bool:
        """Check if a player has won"""
        zone = self.board_gen.player_zones[player_id]
        
        # All 4 safe zone holes must be filled
        for safe_hole in zone.safe_zone_holes:
            peg = self.get_peg_at_hole(safe_hole.id)
            if not peg or peg.player_id != player_id:
                return False
        
        # Winner hole must have a peg
        winner_peg = self.get_peg_at_hole(zone.winner_hole.id)
        if not winner_peg or winner_peg.player_id != player_id:
            return False
        
        return True
    
    def next_turn(self):
        """Advance to next player's turn"""
        self.current_player = (self.current_player + 1) % self.num_players
    
    def get_state(self) -> dict:
        """Get complete game state as dictionary"""
        return {
            "board": self.board_gen.to_dict(),
            "pegs": {pid: p.to_dict() for pid, p in self.pegs.items()},
            "current_player": self.current_player,
            "hands": {
                pid: [{"rank": c.rank, "suit": c.suit} for c in cards]
                for pid, cards in self.hands.items()
            },
            "deck_remaining": len(self.deck)
        }


# =============================================================================
# JSON EXPORT FOR 3D RENDERER
# =============================================================================

def export_board_json(filename: str = "board_geometry.json"):
    """Export board geometry to JSON for 3D renderer"""
    gen = BoardGenerator()
    gen.generate()
    
    with open(filename, 'w') as f:
        json.dump(gen.to_dict(), f, indent=2)
    
    print(f"Board geometry exported to {filename}")
    return gen.to_dict()


# =============================================================================
# MAIN - TEST
# =============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("FAST TRACK - EXACT BOARD SPECIFICATION")
    print("=" * 60)
    
    # Generate board
    gen = BoardGenerator()
    board = gen.generate()
    
    print(f"\n✓ Board generated with radius {R} units")
    print(f"✓ Outer track holes: {len(gen.outer_track)} (should be 60)")
    print(f"✓ Fast track holes: {len(gen.fast_track)} (entry + exit)")
    print(f"✓ Player zones: {len(gen.player_zones)}")
    
    for pid, zone in gen.player_zones.items():
        print(f"\n  Player {pid} ({zone.color}):")
        print(f"    - Holding holes: {len(zone.holding_holes)} (should be 4)")
        print(f"    - Start hole: {zone.start_hole.id}")
        print(f"    - Winner hole: {zone.winner_hole.id}")
        print(f"    - Safe zone holes: {len(zone.safe_zone_holes)} (should be 4)")
    
    # Create game
    print("\n" + "=" * 60)
    print("GAME STATE INITIALIZATION")
    print("=" * 60)
    
    game = FastTrackGame(num_players=6)
    
    for pid, pegs in game.player_pegs.items():
        zone = gen.player_zones[pid]
        print(f"\nPlayer {pid} ({zone.color}): {len(pegs)} pegs")
        for peg in pegs:
            print(f"  - {peg.id}: {peg.state.value} at {peg.hole_id}")
    
    # Export JSON
    export_board_json()
    
    print("\n✓ Board geometry exported to board_geometry.json")
    print("✓ Use this JSON to render the 3D board in Three.js")
