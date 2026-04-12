#!/usr/bin/env python3
"""
Fast Track Lobby Server
WebSocket-based lobby management, matchmaking, and game session coordination.

Features:
- User authentication (login/register)
- Private game sessions (no login required, URL + code sharing)
- Public matchmaking lobby
- Guild management
- Prestige point tracking
- Real-time player status updates
"""

import asyncio
import json
import hashlib
import hmac
import secrets
import time
import uuid
import re
import html
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Set
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from enum import Enum
import logging

try:
    import websockets
    from websockets.server import WebSocketServerProtocol
except ImportError:
    print("Installing websockets...")
    import subprocess
    subprocess.run(["pip3", "install", "websockets"])
    import websockets
    from websockets.server import WebSocketServerProtocol

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Data directory
DATA_DIR = Path(__file__).parent.parent / "data" / "lobby"
DATA_DIR.mkdir(parents=True, exist_ok=True)


# =============================================================================
# Enums and Constants
# =============================================================================

class PrestigeLevel(Enum):
    BRONZE = "bronze"
    SILVER = "silver"
    GOLD = "gold"
    DIAMOND = "diamond"
    PLATINUM = "platinum"

PRESTIGE_THRESHOLDS = {
    PrestigeLevel.BRONZE: 0,
    PrestigeLevel.SILVER: 500,
    PrestigeLevel.GOLD: 2000,
    PrestigeLevel.DIAMOND: 5000,
    PrestigeLevel.PLATINUM: 15000,
}

PRESTIGE_POINTS = {
    "game_win": 100,
    "game_complete": 20,  # Just for finishing
    "peg_home": 25,       # Getting a peg to safe zone
    "peg_vanquish": 15,   # Sending opponent home
    "fasttrack_use": 10,  # Using the fast track
    "bullseye_land": 20,  # Landing on center
    "bold_move": 5,       # Strategic plays (detected by AI)
    "tournament_win": 500,
    "guild_tournament_win": 1000,
}

# Session codes are 6 alphanumeric characters
SESSION_CODE_LENGTH = 6
SESSION_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # No I/O/0/1 to avoid confusion

# Security salt for password hashing (generated once, stored)
PASSWORD_SALT_FILE = DATA_DIR / ".password_salt"
def _get_password_salt():
    if PASSWORD_SALT_FILE.exists():
        return PASSWORD_SALT_FILE.read_text().strip()
    salt = secrets.token_hex(32)
    PASSWORD_SALT_FILE.write_text(salt)
    PASSWORD_SALT_FILE.chmod(0o600)
    return salt

PASSWORD_SALT = _get_password_salt()


# =============================================================================
# Security: Rate Limiter, Input Sanitizer, Brute-Force Protection
# =============================================================================

class RateLimiter:
    """Per-client sliding window rate limiter"""
    def __init__(self, max_requests: int = 30, window_seconds: float = 10.0):
        self.max_requests = max_requests
        self.window = window_seconds
        self._requests: Dict[str, list] = defaultdict(list)
    
    def is_allowed(self, client_id: str) -> bool:
        now = time.time()
        window_start = now - self.window
        # Prune old entries
        self._requests[client_id] = [t for t in self._requests[client_id] if t > window_start]
        if len(self._requests[client_id]) >= self.max_requests:
            return False
        self._requests[client_id].append(now)
        return True
    
    def cleanup(self):
        """Remove stale entries"""
        now = time.time()
        stale = [k for k, v in self._requests.items() if not v or v[-1] < now - self.window * 2]
        for k in stale:
            del self._requests[k]


class BruteForceProtection:
    """Track failed login attempts and lock out after threshold"""
    LOCKOUT_THRESHOLD = 5        # Failed attempts before lockout
    LOCKOUT_DURATION = 300       # 5 minutes lockout
    ATTEMPT_WINDOW = 600         # 10 minute sliding window
    
    def __init__(self):
        self._attempts: Dict[str, list] = defaultdict(list)  # ip -> [timestamps]
        self._lockouts: Dict[str, float] = {}                # ip -> lockout_until
    
    def is_locked_out(self, ip: str) -> bool:
        if ip in self._lockouts:
            if time.time() < self._lockouts[ip]:
                return True
            del self._lockouts[ip]
        return False
    
    def record_failure(self, ip: str):
        now = time.time()
        cutoff = now - self.ATTEMPT_WINDOW
        self._attempts[ip] = [t for t in self._attempts[ip] if t > cutoff]
        self._attempts[ip].append(now)
        if len(self._attempts[ip]) >= self.LOCKOUT_THRESHOLD:
            self._lockouts[ip] = now + self.LOCKOUT_DURATION
            logger.warning(f"SECURITY: IP {ip} locked out for {self.LOCKOUT_DURATION}s after {self.LOCKOUT_THRESHOLD} failed attempts")
    
    def record_success(self, ip: str):
        self._attempts.pop(ip, None)
        self._lockouts.pop(ip, None)


def sanitize_input(text: str, max_length: int = 100, allow_html: bool = False) -> str:
    """Sanitize user input to prevent XSS and injection"""
    if not isinstance(text, str):
        return ""
    text = text.strip()
    text = text[:max_length]
    if not allow_html:
        text = html.escape(text)
    # Remove control characters except newline/tab
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    return text


def validate_username(username: str) -> tuple:
    """Validate username - returns (is_valid, error_message)"""
    if not username or len(username) < 3:
        return False, "Username must be at least 3 characters"
    if len(username) > 24:
        return False, "Username must be 24 characters or less"
    if not re.match(r'^[a-zA-Z0-9_\-]+$', username):
        return False, "Username can only contain letters, numbers, underscores, and hyphens"
    # Block common injection patterns
    if re.search(r'(script|javascript|onclick|onerror|eval|alert)', username, re.IGNORECASE):
        return False, "Invalid username"
    return True, ""


def validate_password(password: str) -> tuple:
    """Validate password strength - returns (is_valid, error_message)"""
    if not password or len(password) < 6:
        return False, "Password must be at least 6 characters"
    if len(password) > 128:
        return False, "Password is too long"
    return True, ""


def hash_password_secure(password: str) -> str:
    """Hash password with PBKDF2-HMAC-SHA256 (100k iterations) + site salt"""
    # Use per-password random salt + site salt
    pw_salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), 
                              (PASSWORD_SALT + pw_salt).encode('utf-8'), 100000)
    return f"pbkdf2:{pw_salt}:{dk.hex()}"


def verify_password_secure(password: str, stored_hash: str) -> bool:
    """Verify password against PBKDF2 hash"""
    if stored_hash.startswith("pbkdf2:"):
        parts = stored_hash.split(":")
        if len(parts) != 3:
            return False
        _, pw_salt, expected_hex = parts
        dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'),
                                  (PASSWORD_SALT + pw_salt).encode('utf-8'), 100000)
        return hmac.compare_digest(dk.hex(), expected_hex)
    else:
        # Legacy: plain SHA-256 hash — verify then upgrade
        legacy_hash = hashlib.sha256(password.encode()).hexdigest()
        return hmac.compare_digest(legacy_hash, stored_hash)


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class User:
    user_id: str
    username: str
    password_hash: str
    email: str = ""
    avatar_id: str = "person_default"
    prestige_points: int = 0
    prestige_level: str = "bronze"
    guild_id: Optional[str] = None
    games_played: int = 0
    games_won: int = 0
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    last_seen: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    
    def to_public_dict(self) -> dict:
        """Return public info (no password)"""
        return {
            "user_id": self.user_id,
            "username": self.username,
            "avatar_id": self.avatar_id,
            "prestige_points": self.prestige_points,
            "prestige_level": self.prestige_level,
            "guild_id": self.guild_id,
            "games_played": self.games_played,
            "games_won": self.games_won,
        }


@dataclass
class Guild:
    guild_id: str
    name: str
    tag: str  # 3-4 character tag like [FT]
    owner_id: str
    members: List[str] = field(default_factory=list)
    officers: List[str] = field(default_factory=list)
    description: str = ""
    avatar_id: str = "guild_default"
    total_prestige: int = 0
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    
    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class GameSession:
    session_id: str
    session_code: str
    host_id: str
    host_username: str
    is_private: bool
    players: List[dict] = field(default_factory=list)  # [{user_id, username, avatar_id, prestige_level, slot}]
    max_players: int = 6
    min_players: int = 2
    ai_players: int = 0
    game_started: bool = False
    game_state: Optional[dict] = None
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    settings: dict = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        return asdict(self)
    
    def to_lobby_dict(self) -> dict:
        """Info shown in lobby listing"""
        return {
            "session_id": self.session_id,
            "session_code": self.session_code,
            "host_username": self.host_username,
            "player_count": len(self.players),
            "max_players": self.max_players,
            "is_private": self.is_private,
            "game_started": self.game_started,
        }


@dataclass
class Tournament:
    tournament_id: str
    name: str
    organizer_id: str
    guild_id: Optional[str]  # None for open tournaments
    participants: List[str] = field(default_factory=list)
    bracket: dict = field(default_factory=dict)
    status: str = "registration"  # registration, in_progress, completed
    max_participants: int = 16
    prize_prestige: int = 500
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


# =============================================================================
# Database (JSON file-based for simplicity, can upgrade to SQLite/Helix)
# =============================================================================

class LobbyDatabase:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.users_file = data_dir / "users.json"
        self.guilds_file = data_dir / "guilds.json"
        self.sessions_file = data_dir / "sessions.json"
        self.tournaments_file = data_dir / "tournaments.json"
        
        self.users: Dict[str, User] = {}
        self.guilds: Dict[str, Guild] = {}
        self.sessions: Dict[str, GameSession] = {}
        self.tournaments: Dict[str, Tournament] = {}
        
        self.load()
    
    def load(self):
        """Load all data from files"""
        if self.users_file.exists():
            with open(self.users_file) as f:
                data = json.load(f)
                self.users = {k: User(**v) for k, v in data.items()}
        
        if self.guilds_file.exists():
            with open(self.guilds_file) as f:
                data = json.load(f)
                self.guilds = {k: Guild(**v) for k, v in data.items()}
        
        if self.sessions_file.exists():
            with open(self.sessions_file) as f:
                data = json.load(f)
                self.sessions = {k: GameSession(**v) for k, v in data.items()}
        
        logger.info(f"Loaded {len(self.users)} users, {len(self.guilds)} guilds, {len(self.sessions)} sessions")
    
    def save_users(self):
        with open(self.users_file, 'w') as f:
            json.dump({k: asdict(v) for k, v in self.users.items()}, f, indent=2)
    
    def save_guilds(self):
        with open(self.guilds_file, 'w') as f:
            json.dump({k: asdict(v) for k, v in self.guilds.items()}, f, indent=2)
    
    def save_sessions(self):
        with open(self.sessions_file, 'w') as f:
            json.dump({k: asdict(v) for k, v in self.sessions.items()}, f, indent=2)
    
    # User methods
    def get_user(self, user_id: str) -> Optional[User]:
        return self.users.get(user_id)
    
    def get_user_by_username(self, username: str) -> Optional[User]:
        for user in self.users.values():
            if user.username.lower() == username.lower():
                return user
        return None
    
    def create_user(self, username: str, password: str, email: str = "") -> User:
        user_id = str(uuid.uuid4())
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        user = User(
            user_id=user_id,
            username=username,
            password_hash=password_hash,
            email=email
        )
        self.users[user_id] = user
        self.save_users()
        return user
    
    def update_user(self, user: User):
        self.users[user.user_id] = user
        self.save_users()
    
    def verify_password(self, username: str, password: str) -> Optional[User]:
        user = self.get_user_by_username(username)
        if user:
            password_hash = hashlib.sha256(password.encode()).hexdigest()
            if user.password_hash == password_hash:
                return user
        return None
    
    def search_users(self, query: str, limit: int = 20) -> List[User]:
        query_lower = query.lower()
        results = []
        for user in self.users.values():
            if query_lower in user.username.lower():
                results.append(user)
                if len(results) >= limit:
                    break
        return results
    
    # Session methods
    def create_session(self, host_id: str, host_username: str, is_private: bool, 
                       settings: dict = None) -> GameSession:
        session_id = str(uuid.uuid4())
        session_code = self._generate_session_code()
        
        session = GameSession(
            session_id=session_id,
            session_code=session_code,
            host_id=host_id,
            host_username=host_username,
            is_private=is_private,
            settings=settings or {}
        )
        self.sessions[session_id] = session
        self.save_sessions()
        return session
    
    def _generate_session_code(self) -> str:
        while True:
            code = ''.join(secrets.choice(SESSION_CODE_CHARS) for _ in range(SESSION_CODE_LENGTH))
            # Make sure it's unique
            if not any(s.session_code == code for s in self.sessions.values()):
                return code
    
    def get_session(self, session_id: str) -> Optional[GameSession]:
        return self.sessions.get(session_id)
    
    def get_session_by_code(self, code: str) -> Optional[GameSession]:
        code = code.upper().strip()
        for session in self.sessions.values():
            if session.session_code == code:
                return session
        return None
    
    def delete_session(self, session_id: str):
        if session_id in self.sessions:
            del self.sessions[session_id]
            self.save_sessions()
    
    def get_public_sessions(self) -> List[GameSession]:
        return [s for s in self.sessions.values() 
                if not s.is_private and not s.game_started]
    
    # Guild methods
    def create_guild(self, name: str, tag: str, owner_id: str) -> Guild:
        guild_id = str(uuid.uuid4())
        guild = Guild(
            guild_id=guild_id,
            name=name,
            tag=tag.upper()[:4],
            owner_id=owner_id,
            members=[owner_id]
        )
        self.guilds[guild_id] = guild
        
        # Update owner
        user = self.get_user(owner_id)
        if user:
            user.guild_id = guild_id
            self.update_user(user)
        
        self.save_guilds()
        return guild
    
    def get_guild(self, guild_id: str) -> Optional[Guild]:
        return self.guilds.get(guild_id)
    
    def search_guilds(self, query: str, limit: int = 20) -> List[Guild]:
        query_lower = query.lower()
        results = []
        for guild in self.guilds.values():
            if query_lower in guild.name.lower() or query_lower in guild.tag.lower():
                results.append(guild)
                if len(results) >= limit:
                    break
        return results


# =============================================================================
# Prestige Calculator
# =============================================================================

class PrestigeCalculator:
    @staticmethod
    def calculate_level(points: int) -> str:
        level = PrestigeLevel.BRONZE
        for lvl, threshold in PRESTIGE_THRESHOLDS.items():
            if points >= threshold:
                level = lvl
        return level.value
    
    @staticmethod
    def points_to_next_level(points: int) -> Optional[int]:
        current = PrestigeCalculator.calculate_level(points)
        levels = list(PrestigeLevel)
        current_idx = next(i for i, l in enumerate(levels) if l.value == current)
        
        if current_idx >= len(levels) - 1:
            return None  # Max level
        
        next_level = levels[current_idx + 1]
        return PRESTIGE_THRESHOLDS[next_level] - points
    
    @staticmethod
    def award_points(db: LobbyDatabase, user_id: str, action: str, multiplier: float = 1.0) -> int:
        user = db.get_user(user_id)
        if not user:
            return 0
        
        base_points = PRESTIGE_POINTS.get(action, 0)
        points = int(base_points * multiplier)
        
        user.prestige_points += points
        user.prestige_level = PrestigeCalculator.calculate_level(user.prestige_points)
        db.update_user(user)
        
        return points


# =============================================================================
# Connected Client
# =============================================================================

@dataclass
class ConnectedClient:
    websocket: WebSocketServerProtocol
    user_id: Optional[str] = None
    username: Optional[str] = None
    session_id: Optional[str] = None
    is_guest: bool = False
    guest_name: str = ""
    avatar_id: str = "person_default"
    prestige_level: str = "bronze"
    connected_at: float = field(default_factory=time.time)


# =============================================================================
# Lobby Server
# =============================================================================

class LobbyServer:
    def __init__(self, host: str = "0.0.0.0", port: int = 8765):
        self.host = host
        self.port = port
        self.db = LobbyDatabase(DATA_DIR)
        self.clients: Dict[WebSocketServerProtocol, ConnectedClient] = {}
        self.session_clients: Dict[str, Set[WebSocketServerProtocol]] = {}  # session_id -> websockets
        
        # Pending join requests: session_id -> [{websocket, client, player_info, timestamp}]
        self.pending_requests: Dict[str, List[dict]] = {}
        
        # Matchmaking queue: list of (websocket, client, queue_time, preferred_players)
        self.matchmaking_queue: List[tuple] = []
        self.matchmaking_task = None
        
        # Security: Rate limiting and brute-force protection
        self.rate_limiter = RateLimiter(max_requests=30, window_seconds=10.0)
        self.auth_rate_limiter = RateLimiter(max_requests=5, window_seconds=60.0)  # Strict for auth
        self.brute_force = BruteForceProtection()
        
        # Allowed message types (whitelist)
        self.ALLOWED_MESSAGE_TYPES = frozenset({
            'register', 'login', 'logout', 'guest_login',
            'update_username', 'update_avatar', 'update_profile', 'get_profile', 'search_users',
            'create_session', 'join_session', 'join_by_code', 'leave_session',
            'start_game', 'game_action', 'game_state_sync', 'chat',
            'kick_player', 'update_settings', 'add_ai',
            'request_join', 'approve_player', 'reject_player',
            'late_join_request', 'approve_late_join', 'reject_late_join', 'cancel_join_request',
            'matchmaking_join', 'matchmaking_leave',
            'create_guild', 'join_guild', 'leave_guild', 'search_guilds',
            'ping', 'pong'
        })
        
    async def start(self):
        logger.info(f"Starting Fast Track Lobby Server on ws://{self.host}:{self.port}")
        # Start matchmaking background task
        self.matchmaking_task = asyncio.create_task(self.matchmaking_loop())
        async with websockets.serve(
            self.handle_client, self.host, self.port,
            ping_interval=30,       # Send ping every 30s to detect stale connections
            ping_timeout=10,        # Close if no pong within 10s
            close_timeout=5,        # Time to wait for close handshake
            max_size=2**20,         # 1MB max message size
            compression="deflate",  # Enable per-message compression
        ):
            await asyncio.Future()  # Run forever
    
    async def handle_client(self, websocket: WebSocketServerProtocol):
        """Handle a connected client. Compatible with websockets 10.0+"""
        client = ConnectedClient(websocket=websocket)
        self.clients[websocket] = client
        
        logger.info(f"Client connected: {websocket.remote_address}")
        
        try:
            await self.send(websocket, {
                "type": "connected",
                "message": "Welcome to Fast Track Lobby",
                "server_time": datetime.utcnow().isoformat()
            })
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.handle_message(websocket, data)
                except json.JSONDecodeError:
                    await self.send_error(websocket, "Invalid JSON")
                except Exception as e:
                    logger.error(f"Error handling message: {e}")
                    await self.send_error(websocket, str(e))
        
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            await self.handle_disconnect(websocket)
    
    async def handle_disconnect(self, websocket: WebSocketServerProtocol):
        client = self.clients.get(websocket)
        if client:
            # Remove from matchmaking queue
            self.matchmaking_queue = [
                e for e in self.matchmaking_queue if e[0] != websocket
            ]
            
            # Remove from pending join requests
            for sid, pending in list(self.pending_requests.items()):
                before = len(pending)
                self.pending_requests[sid] = [r for r in pending if r["websocket"] != websocket]
                if len(self.pending_requests[sid]) < before:
                    # Notify host that request was withdrawn
                    await self.broadcast_to_session(sid, {
                        "type": "join_request_cancelled",
                        "user_id": client.user_id,
                        "username": client.username or "Unknown",
                        "pending_count": len(self.pending_requests[sid])
                    })
            
            # Remove from session
            if client.session_id:
                await self.leave_session(websocket, client.session_id)
            
            del self.clients[websocket]
            logger.info(f"Client disconnected: {client.username or 'anonymous'}")
    
    async def send(self, websocket: WebSocketServerProtocol, data: dict):
        try:
            await websocket.send(json.dumps(data))
        except websockets.exceptions.ConnectionClosed:
            pass
        except Exception as e:
            logger.debug(f"Send error: {e}")
    
    async def send_error(self, websocket: WebSocketServerProtocol, message: str):
        await self.send(websocket, {"type": "error", "message": message})
    
    async def broadcast_to_session(self, session_id: str, data: dict, exclude: WebSocketServerProtocol = None):
        if session_id in self.session_clients:
            msg = json.dumps(data)  # Serialize once for all recipients
            stale = []
            for ws in self.session_clients[session_id]:
                if ws != exclude:
                    try:
                        await ws.send(msg)
                    except websockets.exceptions.ConnectionClosed:
                        stale.append(ws)
                    except Exception:
                        stale.append(ws)
            # Clean up stale connections
            for ws in stale:
                self.session_clients[session_id].discard(ws)
                if ws in self.clients:
                    await self.handle_disconnect(ws)
    
    async def broadcast_to_lobby(self, data: dict):
        """Broadcast to all clients not in a game"""
        msg = json.dumps(data)  # Serialize once
        for ws, client in list(self.clients.items()):
            if not client.session_id:
                try:
                    await ws.send(msg)
                except Exception:
                    pass
    
    # =========================================================================
    # Message Handlers
    # =========================================================================
    
    async def handle_message(self, websocket: WebSocketServerProtocol, data: dict):
        msg_type = data.get("type", "")
        client = self.clients[websocket]
        
        # ── Security: Get client IP for rate limiting ──
        client_ip = "unknown"
        try:
            if hasattr(websocket, 'remote_address') and websocket.remote_address:
                client_ip = str(websocket.remote_address[0])
            # Check X-Real-IP header from nginx proxy
            if hasattr(websocket, 'request_headers'):
                real_ip = websocket.request_headers.get('X-Real-IP')
                if real_ip:
                    client_ip = real_ip
        except Exception:
            pass
        
        # ── Security: Rate limiting ──
        is_auth_msg = msg_type in ('register', 'login')
        if is_auth_msg:
            if not self.auth_rate_limiter.is_allowed(client_ip):
                logger.warning(f"SECURITY: Auth rate limit exceeded for {client_ip}")
                return await self.send_error(websocket, "Too many authentication attempts. Please wait.")
            if self.brute_force.is_locked_out(client_ip):
                logger.warning(f"SECURITY: Locked out IP {client_ip} attempted auth")
                return await self.send_error(websocket, "Account temporarily locked due to too many failed attempts. Try again later.")
        else:
            if not self.rate_limiter.is_allowed(client_ip):
                logger.warning(f"SECURITY: Rate limit exceeded for {client_ip}")
                return await self.send_error(websocket, "Rate limit exceeded. Please slow down.")
        
        # ── Security: Message type whitelist ──
        if msg_type not in self.ALLOWED_MESSAGE_TYPES and msg_type not in (
            'list_sessions', 'add_ai_player', 'update_player_info', 'update_session_settings',
            'toggle_ready', 'join_matchmaking', 'leave_matchmaking', 'matchmaking_status',
            'game_state_sync', 'prestige_action', 'get_guild', 'kick_player'
        ):
            logger.warning(f"SECURITY: Unknown message type '{msg_type}' from {client_ip}")
            return await self.send_error(websocket, f"Unknown message type")
        
        # ── Security: Sanitize all string values in data ──
        for key, value in data.items():
            if isinstance(value, str) and key not in ('password', 'type'):
                data[key] = sanitize_input(value, max_length=500)
        
        handlers = {
            # Auth
            "register": self.handle_register,
            "login": self.handle_login,
            "logout": self.handle_logout,
            "guest_login": self.handle_guest_login,
            
            # Profile
            "update_profile": self.handle_update_profile,
            "update_username": self.handle_update_username,
            "update_avatar": self.handle_update_avatar,
            "get_profile": self.handle_get_profile,
            "search_users": self.handle_search_users,
            
            # Sessions
            "create_session": self.handle_create_session,
            "join_session": self.handle_join_session,
            "join_by_code": self.handle_join_by_code,
            "leave_session": self.handle_leave_session_msg,
            "list_sessions": self.handle_list_sessions,
            "start_game": self.handle_start_game,
            "add_ai_player": self.handle_add_ai_player,
            "approve_player": self.handle_approve_player,
            "reject_player": self.handle_reject_player,
            "kick_player": self.handle_kick_player,
            "update_player_info": self.handle_update_player_info,
            "update_session_settings": self.handle_update_session_settings,
            "cancel_join_request": self.handle_cancel_join_request,
            "toggle_ready": self.handle_toggle_ready,
            "late_join_request": self.handle_late_join_request,
            "approve_late_join": self.handle_approve_late_join,
            "reject_late_join": self.handle_reject_late_join,
            
            # Matchmaking
            "join_matchmaking": self.handle_join_matchmaking,
            "leave_matchmaking": self.handle_leave_matchmaking,
            "matchmaking_status": self.handle_matchmaking_status,
            
            # Game actions
            "game_action": self.handle_game_action,
            "game_state_sync": self.handle_game_state_sync,
            "prestige_action": self.handle_prestige_action,
            
            # Guilds
            "create_guild": self.handle_create_guild,
            "join_guild": self.handle_join_guild,
            "leave_guild": self.handle_leave_guild,
            "search_guilds": self.handle_search_guilds,
            "get_guild": self.handle_get_guild,
            
            # Chat
            "chat": self.handle_chat,
            
            # Ping
            "ping": self.handle_ping,
        }
        
        handler = handlers.get(msg_type)
        if handler:
            try:
                await handler(websocket, client, data)
            except Exception as e:
                logger.error(f"Error in handler '{msg_type}': {e}", exc_info=True)
                await self.send_error(websocket, f"Server error handling '{msg_type}': {str(e)}")
        else:
            await self.send_error(websocket, f"Unknown message type: {msg_type}")
    
    # =========================================================================
    # Auth Handlers
    # =========================================================================
    
    async def handle_register(self, websocket, client: ConnectedClient, data: dict):
        username = data.get("username", "").strip()
        password = data.get("password", "")
        email = data.get("email", "").strip()
        
        # Security: Validate username format
        valid, err = validate_username(username)
        if not valid:
            return await self.send_error(websocket, err)
        
        # Security: Validate password strength
        valid, err = validate_password(password)
        if not valid:
            return await self.send_error(websocket, err)
        
        if self.db.get_user_by_username(username):
            return await self.send_error(websocket, "Username already taken")
        
        user = self.db.create_user(username, password, email)
        
        client.user_id = user.user_id
        client.username = user.username
        client.is_guest = False
        client.avatar_id = user.avatar_id
        client.prestige_level = user.prestige_level
        
        await self.send(websocket, {
            "type": "auth_success",
            "action": "register",
            "user": user.to_public_dict()
        })
        
        logger.info(f"User registered: {username}")
    
    async def handle_login(self, websocket, client: ConnectedClient, data: dict):
        username = data.get("username", "")
        password = data.get("password", "")
        
        # Security: Get IP for brute-force tracking
        client_ip = "unknown"
        try:
            if hasattr(websocket, 'remote_address') and websocket.remote_address:
                client_ip = str(websocket.remote_address[0])
            if hasattr(websocket, 'request_headers'):
                real_ip = websocket.request_headers.get('X-Real-IP')
                if real_ip:
                    client_ip = real_ip
        except Exception:
            pass
        
        user = self.db.verify_password(username, password)
        if not user:
            self.brute_force.record_failure(client_ip)
            # Constant-time response to prevent username enumeration
            return await self.send_error(websocket, "Invalid username or password")
        
        self.brute_force.record_success(client_ip)
        
        user.last_seen = datetime.utcnow().isoformat()
        self.db.update_user(user)
        
        client.user_id = user.user_id
        client.username = user.username
        client.is_guest = False
        client.avatar_id = user.avatar_id
        client.prestige_level = user.prestige_level
        
        await self.send(websocket, {
            "type": "auth_success",
            "action": "login",
            "user": user.to_public_dict()
        })
        
        logger.info(f"User logged in: {username}")
    
    async def handle_logout(self, websocket, client: ConnectedClient, data: dict):
        if client.session_id:
            await self.leave_session(websocket, client.session_id)
        
        client.user_id = None
        client.username = None
        client.is_guest = False
        
        await self.send(websocket, {"type": "logged_out"})
    
    async def handle_guest_login(self, websocket, client: ConnectedClient, data: dict):
        """For private games without login"""
        guest_name = data.get("name", "").strip() or f"Guest_{secrets.token_hex(3)}"
        avatar_id = data.get("avatar_id", "person_default")
        
        client.user_id = f"guest_{uuid.uuid4()}"
        client.username = guest_name
        client.guest_name = guest_name
        client.is_guest = True
        client.avatar_id = avatar_id
        
        await self.send(websocket, {
            "type": "auth_success",
            "action": "guest_login",
            "user": {
                "user_id": client.user_id,
                "username": client.username,
                "avatar_id": client.avatar_id,
                "prestige_level": "bronze",
                "prestige_points": 0,
                "is_guest": True
            }
        })
    
    # =========================================================================
    # Profile Handlers
    # =========================================================================
    
    async def handle_update_username(self, websocket, client: ConnectedClient, data: dict):
        """Update username (works for guests and logged-in users)"""
        new_name = data.get("username", "").strip()
        if not new_name or len(new_name) < 1:
            return await self.send_error(websocket, "Username cannot be empty")
        if len(new_name) > 20:
            new_name = new_name[:20]
        
        old_name = client.username
        client.username = new_name
        
        # Update in session player list if in a session
        if client.session_id:
            session = self.db.get_session(client.session_id)
            if session:
                for p in session.players:
                    if p["user_id"] == client.user_id:
                        p["username"] = new_name
                        break
                # Also update host_username if this is the host
                if session.host_id == client.user_id:
                    session.host_username = new_name
                self.db.save_sessions()
                await self.broadcast_to_session(session.session_id, {
                    "type": "player_updated",
                    "user_id": client.user_id,
                    "username": new_name,
                    "players": session.players
                })
        
        # Update stored user if not guest
        if not client.is_guest:
            user = self.db.get_user(client.user_id)
            if user:
                user.username = new_name
                self.db.update_user(user)
        
        await self.send(websocket, {"type": "username_updated", "username": new_name})
        logger.info(f"Username updated: {old_name} -> {new_name}")
    
    async def handle_update_avatar(self, websocket, client: ConnectedClient, data: dict):
        """Update avatar (works for guests and logged-in users)"""
        avatar_id = data.get("avatar_id", "person_smile")
        
        client.avatar_id = avatar_id
        
        # Update in session player list if in a session
        if client.session_id:
            session = self.db.get_session(client.session_id)
            if session:
                for p in session.players:
                    if p["user_id"] == client.user_id:
                        p["avatar_id"] = avatar_id
                        break
                self.db.save_sessions()
                await self.broadcast_to_session(session.session_id, {
                    "type": "player_updated",
                    "user_id": client.user_id,
                    "avatar_id": avatar_id,
                    "players": session.players
                })
        
        # Update stored user if not guest
        if not client.is_guest:
            user = self.db.get_user(client.user_id)
            if user:
                user.avatar_id = avatar_id
                self.db.update_user(user)
        
        await self.send(websocket, {"type": "avatar_updated", "avatar_id": avatar_id})
        logger.info(f"Avatar updated for {client.username}: {avatar_id}")
    
    async def handle_update_profile(self, websocket, client: ConnectedClient, data: dict):
        if client.is_guest:
            return await self.send_error(websocket, "Guests cannot update profile")
        
        user = self.db.get_user(client.user_id)
        if not user:
            return await self.send_error(websocket, "User not found")
        
        if "avatar_id" in data:
            user.avatar_id = data["avatar_id"]
            client.avatar_id = data["avatar_id"]
        
        if "email" in data:
            user.email = data["email"]
        
        self.db.update_user(user)
        
        await self.send(websocket, {
            "type": "profile_updated",
            "user": user.to_public_dict()
        })
    
    async def handle_get_profile(self, websocket, client: ConnectedClient, data: dict):
        user_id = data.get("user_id") or client.user_id
        user = self.db.get_user(user_id)
        
        if not user:
            return await self.send_error(websocket, "User not found")
        
        await self.send(websocket, {
            "type": "profile",
            "user": user.to_public_dict()
        })
    
    async def handle_search_users(self, websocket, client: ConnectedClient, data: dict):
        query = data.get("query", "")
        users = self.db.search_users(query)
        
        await self.send(websocket, {
            "type": "user_search_results",
            "users": [u.to_public_dict() for u in users]
        })
    
    # =========================================================================
    # Session Handlers
    # =========================================================================
    
    async def handle_create_session(self, websocket, client: ConnectedClient, data: dict):
        if not client.username:
            return await self.send_error(websocket, "Must be logged in to create session")
        
        is_private = data.get("private", False)
        settings = data.get("settings", {})
        max_players = min(6, max(2, data.get("max_players", 6)))
        
        session = self.db.create_session(
            host_id=client.user_id,
            host_username=client.username,
            is_private=is_private,
            settings=settings
        )
        session.max_players = max_players
        
        # Add host as first player
        session.players.append({
            "user_id": client.user_id,
            "username": client.username,
            "avatar_id": client.avatar_id,
            "prestige_level": client.prestige_level,
            "slot": 0,
            "is_host": True,
            "is_ai": False,
            "ready": False
        })
        
        self.db.save_sessions()
        
        # Track client in session
        client.session_id = session.session_id
        if session.session_id not in self.session_clients:
            self.session_clients[session.session_id] = set()
        self.session_clients[session.session_id].add(websocket)
        
        await self.send(websocket, {
            "type": "session_created",
            "session": session.to_dict(),
            "share_url": f"https://kensgames.com/fasttrack/join.html?code={session.session_code}",
            "share_code": session.session_code
        })
        
        # Update lobby
        if not is_private:
            await self.broadcast_to_lobby({
                "type": "lobby_update",
                "action": "session_created",
                "session": session.to_lobby_dict()
            })
        
        logger.info(f"Session created: {session.session_code} by {client.username}")
    
    async def handle_join_session(self, websocket, client: ConnectedClient, data: dict):
        session_id = data.get("session_id")
        session = self.db.get_session(session_id)
        
        if not session:
            return await self.send_error(websocket, "Session not found")
        
        await self._join_session(websocket, client, session)
    
    async def handle_join_by_code(self, websocket, client: ConnectedClient, data: dict):
        code = data.get("code", "").upper().strip()
        session = self.db.get_session_by_code(code)
        
        if not session:
            return await self.send_error(websocket, "Invalid session code")
        
        await self._join_session(websocket, client, session)
    
    async def _join_session(self, websocket, client: ConnectedClient, session: GameSession):
        if not client.username:
            return await self.send_error(websocket, "Must be logged in to join")
        
        # Check if already in session
        if any(p["user_id"] == client.user_id for p in session.players):
            return await self.send_error(websocket, "Already in this session")
        
        # Game already started - handle late join
        if session.game_started:
            allow_late = session.settings.get("allow_late_join", True)
            if not allow_late:
                return await self.send_error(websocket, "This game does not allow late joiners")
            # Route to late join flow (always requires host approval)
            await self._request_late_join(websocket, client, session)
            return
        
        if len(session.players) >= session.max_players:
            return await self.send_error(websocket, "Session is full")
        
        # Private games: require host approval only if setting is enabled
        if session.is_private and session.settings.get("require_approval", False):
            await self._request_join_approval(websocket, client, session)
            return
        
        # Public games and private games without approval: join directly
        await self._admit_player(websocket, client, session)
    
    async def _request_join_approval(self, websocket, client: ConnectedClient, session: GameSession):
        """Queue a join request for host approval in private games"""
        player_info = {
            "user_id": client.user_id,
            "username": client.username,
            "avatar_id": client.avatar_id,
            "prestige_level": client.prestige_level,
        }
        
        # Check if already pending
        sid = session.session_id
        if sid not in self.pending_requests:
            self.pending_requests[sid] = []
        
        if any(r["client"].user_id == client.user_id for r in self.pending_requests[sid]):
            return await self.send_error(websocket, "Already waiting for approval")
        
        self.pending_requests[sid].append({
            "websocket": websocket,
            "client": client,
            "player_info": player_info,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # Tell the joiner they are pending
        await self.send(websocket, {
            "type": "join_pending",
            "session_code": session.session_code,
            "host_username": session.host_username,
            "message": f"Waiting for {session.host_username} to accept you..."
        })
        
        # Notify the host about the pending request
        await self.broadcast_to_session(sid, {
            "type": "join_request",
            "player": player_info,
            "pending_count": len(self.pending_requests[sid])
        })
        
        logger.info(f"{client.username} requesting to join {session.session_code} (pending approval)")
    
    async def _admit_player(self, websocket, client: ConnectedClient, session: GameSession):
        """Actually add a player to the session"""
        # Find next slot
        used_slots = {p["slot"] for p in session.players}
        next_slot = next(i for i in range(6) if i not in used_slots)
        
        player_info = {
            "user_id": client.user_id,
            "username": client.username,
            "avatar_id": client.avatar_id,
            "prestige_level": client.prestige_level,
            "slot": next_slot,
            "is_host": False,
            "is_ai": False,
            "ready": False
        }
        
        session.players.append(player_info)
        self.db.save_sessions()
        
        # Track client
        client.session_id = session.session_id
        if session.session_id not in self.session_clients:
            self.session_clients[session.session_id] = set()
        self.session_clients[session.session_id].add(websocket)
        
        # Notify joiner
        await self.send(websocket, {
            "type": "session_joined",
            "session": session.to_dict()
        })
        
        # Notify others in session
        await self.broadcast_to_session(session.session_id, {
            "type": "player_joined",
            "player": player_info,
            "players": session.players
        }, exclude=websocket)
        
        # Update lobby
        if not session.is_private:
            await self.broadcast_to_lobby({
                "type": "lobby_update",
                "action": "session_updated",
                "session": session.to_lobby_dict()
            })
        
        logger.info(f"{client.username} joined session {session.session_code}")
    
    async def handle_approve_player(self, websocket, client: ConnectedClient, data: dict):
        """Host approves a pending player"""
        session = self.db.get_session(client.session_id)
        if not session:
            return await self.send_error(websocket, "Not in a session")
        if session.host_id != client.user_id:
            return await self.send_error(websocket, "Only host can approve players")
        
        target_user_id = data.get("user_id")
        sid = session.session_id
        pending = self.pending_requests.get(sid, [])
        
        request = next((r for r in pending if r["client"].user_id == target_user_id), None)
        if not request:
            return await self.send_error(websocket, "No pending request from that player")
        
        # Remove from pending
        self.pending_requests[sid] = [r for r in pending if r["client"].user_id != target_user_id]
        
        # Check if session still has room
        if len(session.players) >= session.max_players:
            await self.send(request["websocket"], {
                "type": "join_rejected",
                "reason": "Session is now full"
            })
            return
        
        # Admit the player
        await self._admit_player(request["websocket"], request["client"], session)
        logger.info(f"Host {client.username} approved {request['client'].username}")
    
    async def handle_reject_player(self, websocket, client: ConnectedClient, data: dict):
        """Host rejects a pending player"""
        session = self.db.get_session(client.session_id)
        if not session:
            return await self.send_error(websocket, "Not in a session")
        if session.host_id != client.user_id:
            return await self.send_error(websocket, "Only host can reject players")
        
        target_user_id = data.get("user_id")
        sid = session.session_id
        pending = self.pending_requests.get(sid, [])
        
        request = next((r for r in pending if r["client"].user_id == target_user_id), None)
        if not request:
            return await self.send_error(websocket, "No pending request from that player")
        
        # Remove from pending
        self.pending_requests[sid] = [r for r in pending if r["client"].user_id != target_user_id]
        
        # Notify the rejected player
        await self.send(request["websocket"], {
            "type": "join_rejected",
            "reason": "Host declined your request"
        })
        
        logger.info(f"Host {client.username} rejected {request['client'].username}")
    
    # =========================================================================
    # Late Join (mid-game) Handlers
    # =========================================================================

    async def _request_late_join(self, websocket, client: ConnectedClient, session: GameSession):
        """Queue a late join request for host approval during an active game"""
        player_info = {
            "user_id": client.user_id,
            "username": client.username,
            "avatar_id": client.avatar_id,
            "prestige_level": client.prestige_level,
        }

        sid = session.session_id
        if sid not in self.pending_requests:
            self.pending_requests[sid] = []

        if any(r["client"].user_id == client.user_id for r in self.pending_requests[sid]):
            return await self.send_error(websocket, "Already waiting for approval")

        self.pending_requests[sid].append({
            "websocket": websocket,
            "client": client,
            "player_info": player_info,
            "timestamp": datetime.utcnow().isoformat(),
            "late_join": True
        })

        # Tell joiner they are pending
        await self.send(websocket, {
            "type": "join_pending",
            "session_code": session.session_code,
            "host_username": session.host_username,
            "game_in_progress": True,
            "message": f"Game in progress. Waiting for {session.host_username} to accept you..."
        })

        # Notify host with a late_join_request (distinct from pre-game join_request)
        # so the in-game UI shows the popup
        await self.broadcast_to_session(sid, {
            "type": "late_join_request",
            "player": player_info,
            "pending_count": len(self.pending_requests[sid])
        })

        logger.info(f"{client.username} requesting late join to {session.session_code}")

    async def handle_late_join_request(self, websocket, client: ConnectedClient, data: dict):
        """Player explicitly requests to join a game in progress via code"""
        code = data.get("code", "").upper().strip()
        session = self.db.get_session_by_code(code)
        if not session:
            return await self.send_error(websocket, "Invalid session code")
        if not session.game_started:
            # Game hasn't started yet, use normal flow
            return await self._join_session(websocket, client, session)
        await self._request_late_join(websocket, client, session)

    async def handle_approve_late_join(self, websocket, client: ConnectedClient, data: dict):
        """Host approves a late joiner during an active game"""
        session = self.db.get_session(client.session_id)
        if not session:
            return await self.send_error(websocket, "Not in a session")
        if session.host_id != client.user_id:
            return await self.send_error(websocket, "Only host can approve players")

        target_user_id = data.get("user_id")
        slot_type = data.get("slot_type", "replace-bot")  # 'replace-bot' or 'new-slot'
        sid = session.session_id
        pending = self.pending_requests.get(sid, [])

        request = next((r for r in pending if r["client"].user_id == target_user_id), None)
        if not request:
            return await self.send_error(websocket, "No pending request from that player")

        # Remove from pending
        self.pending_requests[sid] = [r for r in pending if r["client"].user_id != target_user_id]

        # Track the new client in session
        req_client = request["client"]
        req_ws = request["websocket"]
        req_client.session_id = sid
        if sid not in self.session_clients:
            self.session_clients[sid] = set()
        self.session_clients[sid].add(req_ws)

        player_info = request["player_info"]
        player_info["is_host"] = False
        player_info["is_ai"] = False
        player_info["ready"] = True  # Late joiner is automatically ready (game in progress)

        # Determine slot assignment
        bot_index = None
        for i, p in enumerate(session.players):
            if p.get("is_ai"):
                bot_index = i
                break

        if slot_type == "replace-bot" and bot_index is not None:
            # Replace the bot
            player_info["slot"] = session.players[bot_index]["slot"]
            session.players[bot_index] = player_info
        elif len(session.players) < session.max_players:
            # New slot
            used_slots = {p["slot"] for p in session.players}
            next_slot = next(i for i in range(6) if i not in used_slots)
            player_info["slot"] = next_slot
            session.players.append(player_info)
        elif bot_index is not None:
            # Fallback: replace bot
            player_info["slot"] = session.players[bot_index]["slot"]
            session.players[bot_index] = player_info
        else:
            await self.send(req_ws, {
                "type": "join_rejected",
                "reason": "No available slots"
            })
            return

        self.db.save_sessions()

        # Notify the late joiner they're in
        await self.send(req_ws, {
            "type": "late_join_approved",
            "session": session.to_dict(),
            "game_state": session.game_state,
            "slot_type": slot_type,
            "assigned_slot": player_info["slot"]
        })

        # Notify all players in session about the new player
        await self.broadcast_to_session(sid, {
            "type": "late_player_joined",
            "player": player_info,
            "slot_type": slot_type,
            "assigned_slot": player_info["slot"],
            "players": [p for p in session.players],
            "session": session.to_dict()
        })

        logger.info(f"Host {client.username} approved late join for {req_client.username} (slot_type={slot_type})")

    async def handle_reject_late_join(self, websocket, client: ConnectedClient, data: dict):
        """Host rejects a late joiner"""
        session = self.db.get_session(client.session_id)
        if not session:
            return await self.send_error(websocket, "Not in a session")
        if session.host_id != client.user_id:
            return await self.send_error(websocket, "Only host can reject players")

        target_user_id = data.get("user_id")
        sid = session.session_id
        pending = self.pending_requests.get(sid, [])

        request = next((r for r in pending if r["client"].user_id == target_user_id), None)
        if not request:
            return await self.send_error(websocket, "No pending request from that player")

        self.pending_requests[sid] = [r for r in pending if r["client"].user_id != target_user_id]

        await self.send(request["websocket"], {
            "type": "join_rejected",
            "reason": "Host declined your request to join the game"
        })

        logger.info(f"Host {client.username} rejected late join from {request['client'].username}")

    async def handle_cancel_join_request(self, websocket, client: ConnectedClient, data: dict):
        """Player cancels their own pending join request"""
        for sid, pending in self.pending_requests.items():
            before = len(pending)
            self.pending_requests[sid] = [r for r in pending if r["websocket"] != websocket]
            if len(self.pending_requests[sid]) < before:
                # Notify host that request was withdrawn
                await self.broadcast_to_session(sid, {
                    "type": "join_request_cancelled",
                    "user_id": client.user_id,
                    "username": client.username,
                    "pending_count": len(self.pending_requests[sid])
                })
                break
        
        await self.send(websocket, {"type": "join_request_cancelled_ack"})
    
    async def handle_kick_player(self, websocket, client: ConnectedClient, data: dict):
        """Host kicks a player from the session"""
        session = self.db.get_session(client.session_id)
        if not session:
            return await self.send_error(websocket, "Not in a session")
        if session.host_id != client.user_id:
            return await self.send_error(websocket, "Only host can kick players")
        
        target_user_id = data.get("user_id")
        if target_user_id == client.user_id:
            return await self.send_error(websocket, "Cannot kick yourself")
        
        # Find the target's websocket
        target_ws = None
        for ws, c in self.clients.items():
            if c.user_id == target_user_id and c.session_id == session.session_id:
                target_ws = ws
                break
        
        # Remove player from session
        kicked_name = None
        for p in session.players:
            if p["user_id"] == target_user_id:
                kicked_name = p["username"]
                break
        
        session.players = [p for p in session.players if p["user_id"] != target_user_id]
        self.db.save_sessions()
        
        # Notify kicked player
        if target_ws:
            target_client = self.clients.get(target_ws)
            if target_client:
                target_client.session_id = None
            if session.session_id in self.session_clients:
                self.session_clients[session.session_id].discard(target_ws)
            await self.send(target_ws, {
                "type": "kicked",
                "reason": "You were removed by the host"
            })
        
        # Notify remaining players
        await self.broadcast_to_session(session.session_id, {
            "type": "player_kicked",
            "user_id": target_user_id,
            "username": kicked_name or "Unknown",
            "players": session.players
        })
        
        logger.info(f"Host {client.username} kicked {kicked_name} from {session.session_code}")
    
    async def handle_update_player_info(self, websocket, client: ConnectedClient, data: dict):
        """Update username/avatar for a player in their current session (works for guests)"""
        new_username = data.get("username", "").strip()
        new_avatar = data.get("avatar_id", "")
        
        if new_username:
            client.username = new_username
            if client.guest_name:
                client.guest_name = new_username
        if new_avatar:
            client.avatar_id = new_avatar
        
        # Update in session player list
        session = self.db.get_session(client.session_id) if client.session_id else None
        if session:
            for p in session.players:
                if p["user_id"] == client.user_id:
                    if new_username:
                        p["username"] = new_username
                    if new_avatar:
                        p["avatar_id"] = new_avatar
                    break
            if session.host_id == client.user_id and new_username:
                session.host_username = new_username
            self.db.save_sessions()
            
            # Broadcast updated player list
            await self.broadcast_to_session(session.session_id, {
                "type": "player_update",
                "players": session.players,
                "session": session.to_dict()
            })
        
        # Also update for non-guest registered users
        if not client.is_guest:
            user = self.db.get_user(client.user_id)
            if user:
                if new_avatar:
                    user.avatar_id = new_avatar
                self.db.update_user(user)
        
        await self.send(websocket, {
            "type": "player_info_updated",
            "username": client.username,
            "avatar_id": client.avatar_id
        })

    async def handle_update_session_settings(self, websocket, client: ConnectedClient, data: dict):
        """Host updates session settings (music, max_players, allow_bots, etc.)"""
        session = self.db.get_session(client.session_id)
        if not session:
            return await self.send_error(websocket, "Not in a session")
        if session.host_id != client.user_id:
            return await self.send_error(websocket, "Only host can change settings")
        
        settings = data.get("settings", {})
        
        # Update allowed settings
        if "music_enabled" in settings:
            session.settings["music_enabled"] = bool(settings["music_enabled"])
        if "allow_bots" in settings:
            session.settings["allow_bots"] = bool(settings["allow_bots"])
        if "max_players" in settings:
            new_max = min(6, max(2, int(settings["max_players"])))
            session.max_players = new_max
        if "max_players" in data:
            new_max = min(6, max(2, int(data["max_players"])))
            session.max_players = new_max
        if "difficulty" in settings:
            session.settings["difficulty"] = settings["difficulty"]
        if "turn_timer" in settings:
            session.settings["turn_timer"] = bool(settings["turn_timer"])
        if "turn_timer_seconds" in settings:
            session.settings["turn_timer_seconds"] = int(settings["turn_timer_seconds"])
        if "late_arrivals" in settings:
            session.settings["allow_late_join"] = bool(settings["late_arrivals"])
        if "music" in settings:
            session.settings["music_enabled"] = bool(settings["music"])
        
        self.db.save_sessions()
        
        # Broadcast settings to all in session
        await self.broadcast_to_session(session.session_id, {
            "type": "session_settings_updated",
            "settings": session.settings,
            "max_players": session.max_players,
            "session": session.to_dict()
        })
        
        logger.info(f"Host {client.username} updated settings for {session.session_code}: {settings}")
    
    async def handle_leave_session_msg(self, websocket, client: ConnectedClient, data: dict):
        if client.session_id:
            await self.leave_session(websocket, client.session_id)
    
    async def leave_session(self, websocket, session_id: str):
        client = self.clients.get(websocket)
        if not client:
            return
        
        session = self.db.get_session(session_id)
        if not session:
            return
        
        # Remove from session clients
        if session_id in self.session_clients:
            self.session_clients[session_id].discard(websocket)
        
        # Remove player from session
        session.players = [p for p in session.players if p["user_id"] != client.user_id]
        
        # If host left and others remain, transfer host
        if session.host_id == client.user_id and session.players:
            new_host = session.players[0]
            session.host_id = new_host["user_id"]
            session.host_username = new_host["username"]
            new_host["is_host"] = True
        
        # If no players left, delete session
        if not session.players:
            self.db.delete_session(session_id)
            if session_id in self.session_clients:
                del self.session_clients[session_id]
            
            if not session.is_private:
                await self.broadcast_to_lobby({
                    "type": "lobby_update",
                    "action": "session_removed",
                    "session_id": session_id
                })
        else:
            self.db.save_sessions()
            
            # Notify remaining players
            await self.broadcast_to_session(session_id, {
                "type": "player_left",
                "user_id": client.user_id,
                "username": client.username,
                "players": session.players,
                "new_host": session.host_username
            })
        
        client.session_id = None
        
        await self.send(websocket, {"type": "left_session"})
        logger.info(f"{client.username} left session {session.session_code}")
    
    async def handle_list_sessions(self, websocket, client: ConnectedClient, data: dict):
        sessions = self.db.get_public_sessions()
        
        await self.send(websocket, {
            "type": "session_list",
            "sessions": [s.to_lobby_dict() for s in sessions]
        })
    
    async def handle_add_ai_player(self, websocket, client: ConnectedClient, data: dict):
        session = self.db.get_session(client.session_id)
        if not session:
            return await self.send_error(websocket, "Not in a session")
        
        if session.host_id != client.user_id:
            return await self.send_error(websocket, "Only host can add AI players")
        
        if len(session.players) >= session.max_players:
            return await self.send_error(websocket, "Session is full")
        
        ai_level = data.get("level", "medium")  # easy, medium, hard
        ai_names = ["Robo", "Circuit", "Nexus", "Pixel", "Binary", "Logic"]
        
        used_slots = {p["slot"] for p in session.players}
        next_slot = next(i for i in range(6) if i not in used_slots)
        
        ai_count = sum(1 for p in session.players if p.get("is_ai"))
        ai_name = f"AI-{ai_names[ai_count % len(ai_names)]}"
        
        player_info = {
            "user_id": f"ai_{uuid.uuid4()}",
            "username": ai_name,
            "avatar_id": "robot_default",
            "prestige_level": "bronze",
            "slot": next_slot,
            "is_host": False,
            "is_ai": True,
            "ai_level": ai_level,
            "ready": True
        }
        
        session.players.append(player_info)
        session.ai_players += 1
        self.db.save_sessions()
        
        await self.broadcast_to_session(session.session_id, {
            "type": "player_joined",
            "player": player_info,
            "players": session.players
        })
    
    # =========================================================================
    # Matchmaking
    # =========================================================================
    
    async def matchmaking_loop(self):
        """Background task to match players in queue"""
        logger.info("Matchmaking loop started")
        while True:
            try:
                await asyncio.sleep(3)  # Check every 3 seconds
                await self.process_matchmaking_queue()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Matchmaking error: {e}")
    
    async def process_matchmaking_queue(self):
        """Try to match queued players"""
        if len(self.matchmaking_queue) < 2:
            return
        
        # Remove disconnected clients first
        self.matchmaking_queue = [
            (ws, client, queue_time, pref) 
            for (ws, client, queue_time, pref) in self.matchmaking_queue 
            if ws in self.clients
        ]
        
        # Group by preferred player count
        by_preference: Dict[int, List[tuple]] = {}
        for entry in self.matchmaking_queue:
            pref = entry[3]  # preferred_players (3 or 4)
            if pref not in by_preference:
                by_preference[pref] = []
            by_preference[pref].append(entry)
        
        # Try to form games with exact match first
        for pref_count, entries in by_preference.items():
            if len(entries) >= pref_count:
                # We have enough! Create a game
                match_entries = entries[:pref_count]
                await self.create_match(match_entries)
                # Remove matched players from queue
                for entry in match_entries:
                    if entry in self.matchmaking_queue:
                        self.matchmaking_queue.remove(entry)
                return
        
        # Flexible matching: If anyone has waited > 30 seconds, match with 3 if possible
        now = time.time()
        waiting_long = [e for e in self.matchmaking_queue if now - e[2] > 30]
        
        if len(waiting_long) >= 3:
            match_entries = self.matchmaking_queue[:3]
            await self.create_match(match_entries)
            for entry in match_entries:
                if entry in self.matchmaking_queue:
                    self.matchmaking_queue.remove(entry)
        elif len(waiting_long) >= 2 and len(self.matchmaking_queue) >= 3:
            match_entries = self.matchmaking_queue[:3]
            await self.create_match(match_entries)
            for entry in match_entries:
                if entry in self.matchmaking_queue:
                    self.matchmaking_queue.remove(entry)
    
    async def create_match(self, entries: List[tuple]):
        """Create a game session from matched players"""
        if not entries:
            return
        
        # First player becomes host
        host_ws, host_client, _, _ = entries[0]
        
        # Create session
        session_id = str(uuid.uuid4())
        session_code = self.generate_session_code()
        
        host_username = host_client.username or host_client.guest_name or "Player"
        host_user_id = host_client.user_id or f"guest_{uuid.uuid4()}"
        
        session = GameSession(
            session_id=session_id,
            session_code=session_code,
            host_id=host_user_id,
            host_username=host_username,
            is_private=False,
            max_players=len(entries),
            min_players=len(entries),
            settings={"matchmaking": True}
        )
        
        # Add all players
        for i, (ws, client, _, _) in enumerate(entries):
            username = client.username or client.guest_name or f"Player{i+1}"
            user_id = client.user_id or f"guest_{uuid.uuid4()}"
            
            player_info = {
                "user_id": user_id,
                "username": username,
                "avatar_id": client.avatar_id,
                "prestige_level": client.prestige_level,
                "slot": i,
                "is_host": i == 0,
                "is_ai": False
            }
            session.players.append(player_info)
            
            # Assign client to session
            client.session_id = session_id
            
            # Track websocket in session
            if session_id not in self.session_clients:
                self.session_clients[session_id] = set()
            self.session_clients[session_id].add(ws)
        
        # Save session
        self.db.sessions[session_id] = session
        self.db.save_sessions()
        
        logger.info(f"Matchmaking created session {session_code} with {len(entries)} players")
        
        # Notify all matched players
        for ws, client, _, _ in entries:
            try:
                await ws.send(json.dumps({
                    "type": "match_found",
                    "session": session.to_dict(),
                    "message": f"Match found! {len(entries)} players ready."
                }))
            except Exception as e:
                logger.error(f"Error notifying matched player: {e}")
        
        # Auto-start the game after brief delay
        await asyncio.sleep(2)
        
        # Start the game
        session.game_started = True
        game_state = {
            "players": session.players,
            "started_at": datetime.utcnow().isoformat(),
            "matchmaking_game": True
        }
        session.game_state = game_state
        self.db.save_sessions()
        
        await self.broadcast_to_session(session.session_id, {
            "type": "game_started",
            "session": session.to_dict(),
            "game_state": game_state
        })
    
    async def handle_join_matchmaking(self, websocket, client: ConnectedClient, data: dict):
        """Add player to matchmaking queue"""
        # Must be logged in or guest
        username = client.username or client.guest_name
        if not username:
            return await self.send_error(websocket, "Please login or enter as guest first")
        
        # Can't be in a session already
        if client.session_id:
            return await self.send_error(websocket, "Leave current session before matchmaking")
        
        # Check if already in queue
        for entry in self.matchmaking_queue:
            if entry[0] == websocket:
                return await self.send_error(websocket, "Already in matchmaking queue")
        
        preferred_players = data.get("preferred_players", 4)
        if preferred_players < 3:
            preferred_players = 3
        if preferred_players > 4:
            preferred_players = 4
        
        self.matchmaking_queue.append((websocket, client, time.time(), preferred_players))
        
        logger.info(f"Player {username} joined matchmaking queue (want {preferred_players} players)")
        
        await websocket.send(json.dumps({
            "type": "matchmaking_joined",
            "queue_position": len(self.matchmaking_queue),
            "estimated_wait": "Finding players..."
        }))
        
        # Notify queue status to all in queue
        await self.broadcast_queue_status()
    
    async def handle_leave_matchmaking(self, websocket, client: ConnectedClient, data: dict):
        """Remove player from matchmaking queue"""
        self.matchmaking_queue = [
            e for e in self.matchmaking_queue if e[0] != websocket
        ]
        
        logger.info(f"Player {client.username or client.guest_name} left matchmaking")
        
        await websocket.send(json.dumps({
            "type": "matchmaking_left"
        }))
        
        await self.broadcast_queue_status()
    
    async def handle_matchmaking_status(self, websocket, client: ConnectedClient, data: dict):
        """Get current matchmaking queue status"""
        position = None
        for i, entry in enumerate(self.matchmaking_queue):
            if entry[0] == websocket:
                position = i + 1
                break
        
        await websocket.send(json.dumps({
            "type": "matchmaking_status",
            "in_queue": position is not None,
            "queue_position": position,
            "queue_size": len(self.matchmaking_queue)
        }))
    
    async def broadcast_queue_status(self):
        """Send queue status to all players in matchmaking"""
        queue_size = len(self.matchmaking_queue)
        
        for i, (ws, client, queue_time, pref) in enumerate(self.matchmaking_queue):
            try:
                wait_time = int(time.time() - queue_time)
                await ws.send(json.dumps({
                    "type": "matchmaking_update",
                    "queue_position": i + 1,
                    "queue_size": queue_size,
                    "wait_time": wait_time,
                    "status": "Finding players..." if queue_size < 3 else f"Almost ready! ({queue_size} players)"
                }))
            except Exception:
                pass
    
    def generate_session_code(self) -> str:
        """Generate a unique session code"""
        while True:
            code = ''.join(secrets.choice(SESSION_CODE_CHARS) for _ in range(SESSION_CODE_LENGTH))
            if not any(s.session_code == code for s in self.db.sessions.values()):
                return code
    
    async def handle_toggle_ready(self, websocket, client: ConnectedClient, data: dict):
        """Player toggles their ready status"""
        session = self.db.get_session(client.session_id)
        if not session:
            return await self.send_error(websocket, "Not in a session")
        
        for p in session.players:
            if p["user_id"] == client.user_id:
                p["ready"] = not p.get("ready", False)
                self.db.save_sessions()
                
                # Broadcast to all in session
                await self.broadcast_to_session(session.session_id, {
                    "type": "player_ready_changed",
                    "user_id": client.user_id,
                    "username": client.username,
                    "ready": p["ready"],
                    "players": session.players
                })
                break
    
    async def handle_start_game(self, websocket, client: ConnectedClient, data: dict):
        session = self.db.get_session(client.session_id)
        if not session:
            return await self.send_error(websocket, "Not in a session")
        
        if session.host_id != client.user_id:
            return await self.send_error(websocket, "Only host can start the game")
        
        if len(session.players) < session.min_players:
            return await self.send_error(websocket, f"Need at least {session.min_players} players")
        
        # Check all non-host human players are ready (host starting = host is ready)
        not_ready = [p["username"] for p in session.players 
                     if not p.get("is_ai") and not p.get("ready", False) and p["user_id"] != session.host_id]
        if not_ready:
            return await self.send_error(websocket, f"Waiting for: {', '.join(not_ready)}")
        
        session.game_started = True
        self.db.save_sessions()
        
        # Generate initial game state
        game_state = {
            "players": session.players,
            "current_player_index": 0,
            "phase": "roll",
            "started_at": datetime.utcnow().isoformat()
        }
        session.game_state = game_state
        
        await self.broadcast_to_session(session.session_id, {
            "type": "game_started",
            "session": session.to_dict(),
            "game_state": game_state
        })
        
        # Remove from lobby listings
        await self.broadcast_to_lobby({
            "type": "lobby_update",
            "action": "session_removed",
            "session_id": session.session_id
        })
        
        logger.info(f"Game started: {session.session_code} with {len(session.players)} players")
    
    # =========================================================================
    # Game Action Handlers
    # =========================================================================
    
    async def handle_game_action(self, websocket, client: ConnectedClient, data: dict):
        """Forward game actions to all players in session"""
        session_id = client.session_id
        if not session_id:
            return
        
        action = data.get("action", {})
        action["from_user_id"] = client.user_id
        action["timestamp"] = datetime.utcnow().isoformat()
        
        await self.broadcast_to_session(session_id, {
            "type": "game_action",
            "action": action
        })
    
    async def handle_game_state_sync(self, websocket, client: ConnectedClient, data: dict):
        """Host syncs game state to all players"""
        session = self.db.get_session(client.session_id)
        if not session or session.host_id != client.user_id:
            return
        
        game_state = data.get("game_state")
        session.game_state = game_state
        
        await self.broadcast_to_session(session.session_id, {
            "type": "game_state_sync",
            "game_state": game_state
        }, exclude=websocket)
    
    async def handle_prestige_action(self, websocket, client: ConnectedClient, data: dict):
        """Award prestige points for actions"""
        if client.is_guest:
            return  # Guests don't earn prestige
        
        action = data.get("action")
        multiplier = data.get("multiplier", 1.0)
        
        points = PrestigeCalculator.award_points(self.db, client.user_id, action, multiplier)
        
        if points > 0:
            user = self.db.get_user(client.user_id)
            client.prestige_level = user.prestige_level
            
            await self.send(websocket, {
                "type": "prestige_awarded",
                "action": action,
                "points": points,
                "total_points": user.prestige_points,
                "level": user.prestige_level
            })
    
    # =========================================================================
    # Guild Handlers
    # =========================================================================
    
    async def handle_create_guild(self, websocket, client: ConnectedClient, data: dict):
        if client.is_guest:
            return await self.send_error(websocket, "Guests cannot create guilds")
        
        user = self.db.get_user(client.user_id)
        if user.guild_id:
            return await self.send_error(websocket, "Already in a guild")
        
        name = data.get("name", "").strip()
        tag = data.get("tag", "").strip().upper()
        
        if not name or len(name) < 3:
            return await self.send_error(websocket, "Guild name must be at least 3 characters")
        
        if not tag or len(tag) < 2 or len(tag) > 4:
            return await self.send_error(websocket, "Guild tag must be 2-4 characters")
        
        guild = self.db.create_guild(name, tag, client.user_id)
        
        await self.send(websocket, {
            "type": "guild_created",
            "guild": guild.to_dict()
        })
    
    async def handle_join_guild(self, websocket, client: ConnectedClient, data: dict):
        if client.is_guest:
            return await self.send_error(websocket, "Guests cannot join guilds")
        
        user = self.db.get_user(client.user_id)
        if user.guild_id:
            return await self.send_error(websocket, "Already in a guild")
        
        guild_id = data.get("guild_id")
        guild = self.db.get_guild(guild_id)
        
        if not guild:
            return await self.send_error(websocket, "Guild not found")
        
        guild.members.append(client.user_id)
        user.guild_id = guild_id
        
        self.db.save_guilds()
        self.db.update_user(user)
        
        await self.send(websocket, {
            "type": "guild_joined",
            "guild": guild.to_dict()
        })
    
    async def handle_leave_guild(self, websocket, client: ConnectedClient, data: dict):
        user = self.db.get_user(client.user_id)
        if not user or not user.guild_id:
            return await self.send_error(websocket, "Not in a guild")
        
        guild = self.db.get_guild(user.guild_id)
        if not guild:
            return
        
        if guild.owner_id == client.user_id:
            return await self.send_error(websocket, "Owner cannot leave guild. Transfer ownership first.")
        
        guild.members.remove(client.user_id)
        if client.user_id in guild.officers:
            guild.officers.remove(client.user_id)
        
        user.guild_id = None
        
        self.db.save_guilds()
        self.db.update_user(user)
        
        await self.send(websocket, {"type": "guild_left"})
    
    async def handle_search_guilds(self, websocket, client: ConnectedClient, data: dict):
        query = data.get("query", "")
        guilds = self.db.search_guilds(query)
        
        await self.send(websocket, {
            "type": "guild_search_results",
            "guilds": [g.to_dict() for g in guilds]
        })
    
    async def handle_get_guild(self, websocket, client: ConnectedClient, data: dict):
        guild_id = data.get("guild_id")
        guild = self.db.get_guild(guild_id)
        
        if not guild:
            return await self.send_error(websocket, "Guild not found")
        
        # Get member details
        members = []
        for member_id in guild.members:
            user = self.db.get_user(member_id)
            if user:
                members.append(user.to_public_dict())
        
        await self.send(websocket, {
            "type": "guild_details",
            "guild": guild.to_dict(),
            "members": members
        })
    
    # =========================================================================
    # Chat Handler
    # =========================================================================
    
    async def handle_chat(self, websocket, client: ConnectedClient, data: dict):
        message = data.get("message", "").strip()[:500]  # Limit length
        
        if not message:
            return
        
        chat_msg = {
            "type": "chat",
            "user_id": client.user_id,
            "username": client.username,
            "avatar_id": client.avatar_id,
            "message": message,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        if client.session_id:
            # In-game chat
            await self.broadcast_to_session(client.session_id, chat_msg)
        else:
            # Lobby chat
            await self.broadcast_to_lobby(chat_msg)
    
    # =========================================================================
    # Utility Handlers
    # =========================================================================
    
    async def handle_ping(self, websocket, client: ConnectedClient, data: dict):
        await self.send(websocket, {
            "type": "pong",
            "server_time": datetime.utcnow().isoformat()
        })


# =============================================================================
# Main
# =============================================================================

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Fast Track Lobby Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on")
    args = parser.parse_args()
    
    server = LobbyServer(host=args.host, port=args.port)
    asyncio.run(server.start())


if __name__ == "__main__":
    main()
