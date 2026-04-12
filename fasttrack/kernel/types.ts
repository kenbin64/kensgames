/**
 * FastTrack ButterflyFx Kernel - Type Definitions
 * 
 * Pure types for the deterministic game engine.
 * No side effects, no network, no UI dependencies.
 */

// =============================================================================
// POSITION TYPES
// =============================================================================

export type PositionType = 
  | 'CENTER'           // Bull's eye
  | 'FASTTRACK'        // Fast track holes (FT_0 through FT_5) - 6 pentagon-shaped holes
  | 'OUTER_RIM'        // Main track around the board
  | 'HOLDING'          // Starting holding pen
  | 'SAFE'             // Home/safe zone
  | 'WINNER';          // Final winning position

export interface Position {
  id: string;
  type: PositionType;
  playerId?: number;       // Owner for HOLDING, SAFE, WINNER, FASTTRACK
  index?: number;          // Position index within its type
  coords?: { x: number; y: number; z: number }; // For rendering
}

// =============================================================================
// PEG/TOKEN TYPES
// =============================================================================

export type PegState = 
  | 'IN_HOLDING'       // In starting holding pen
  | 'ON_TRACK'         // On outer rim or fast track
  | 'IN_SAFE'          // In safe zone
  | 'FINISHED';        // In winner hole (goal achieved)

/**
 * PEG PERSONALITY TYPES
 * Each peg has a gladiator-like personality - they love the competition
 * and enjoy sending opponents home (all in good fun, no one gets hurt!)
 */
export type PegPersonality = 
  | 'AGGRESSIVE'       // Loves to hunt down opponents, celebrates captures
  | 'CAUTIOUS'         // Prefers safe routes, avoids risky positions
  | 'SHOWBOAT'         // Takes the flashy route, loves the fast track
  | 'STRATEGIC'        // Calculates optimal moves, patient hunter
  | 'LOYAL'            // Protects teammates, blocks for allies
  | 'WILDCARD';        // Unpredictable, keeps opponents guessing

export type PegMood = 
  | 'EAGER'            // Ready for action
  | 'CONFIDENT'        // Feeling good about position
  | 'NERVOUS'          // In danger of being captured
  | 'TRIUMPHANT'       // Just captured an opponent
  | 'VENGEFUL'         // Was recently sent home, wants payback
  | 'RELAXED';         // In safe zone or protected position

export interface Peg {
  id: string;
  playerId: number;
  positionId: string;
  state: PegState;
}

/**
 * SMART PEG - Self-aware peg with personality and manifold integration
 * 
 * SmartPegs are gladiator entities that:
 * - Know their current position and count hops as they move
 * - Have personalities that influence move preferences
 * - Celebrate captures and mourn being sent home (all in fun!)
 * - Track rivalries with specific opponent pegs
 * - Adjust landing if initial estimate was wrong (hop-counting verification)
 */
export interface SmartPeg extends Peg {
  // Personality & mood
  personality: PegPersonality;
  mood: PegMood;
  
  // Self-awareness (manifold substrate)
  currentHoleIndex: number;        // Knows exactly which hole it's in
  hopsCounted: number;             // Counts hops during movement
  targetHoleIndex: number;         // Where it's trying to land
  pathTraveled: string[];          // Holes visited this move
  
  // Gladiator stats (all in good fun!)
  captureCount: number;            // Opponents sent home
  timesCaptured: number;           // Times this peg was sent home
  rivalPegId: string | null;       // Nemesis peg (most interactions with)
  
  // Movement verification
  cardValueExpected: number;       // Card value for this move
  landingVerified: boolean;        // True if hop count matched card value
  adjustedLanding: boolean;        // True if had to adjust destination
  
  // Celebration/reaction state
  lastAction: PegAction | null;
  celebrationPending: boolean;
}

export type PegAction = 
  | { type: 'CAPTURED_OPPONENT'; victimId: string; taunt: string; animation: CaptureAnimation }
  | { type: 'WAS_CAPTURED'; hunterId: string; reaction: string; animation: CapturedAnimation }
  | { type: 'ENTERED_SAFE'; relief: string }
  | { type: 'FINISHED'; celebration: string }
  | { type: 'NARROW_ESCAPE'; closeCall: string }
  | { type: 'ENTERED_FASTTRACK'; excitement: string }
  | { type: 'BULLSEYE'; glory: string };

// =============================================================================
// CAPTURE ANIMATIONS & THROW STYLES
// =============================================================================

/**
 * When a peg captures an opponent, they GRAB and THROW them!
 * The victim flies through the air, does somersaults, and lands in holding.
 * Then the victor does a VICTORY DANCE! The crowd goes WILD! YAAAH!!!
 * All in good fun - no one gets hurt! 🎉
 */
export type CaptureStyle = 
  | 'STOMP'             // Classic jump-on capture
  | 'BODYSLAM'          // Flying tackle
  | 'BOUNCE'            // Spring-loaded launch
  | 'UPPERCUT'          // Pop them skyward POW!
  | 'CANNONBALL'        // Maximum impact devastation
  | 'JAVELIN'           // Grab and hurl like a javelin 🎯
  | 'SPIRAL_FOOTBALL'   // Perfect spiral throw 🏈
  | 'DROP_KICK'         // BOOT TO THE MOON! 🦶
  | 'SUPLEX'            // Grab, lift, SLAM!
  | 'YEET';             // YEEEEEET!!! 🚀

export type VictoryDanceName =
  | 'sword_salute' | 'battle_cry' | 'flex_pose'      // Warrior dances
  | 'moonwalk' | 'magic_flourish' | 'backflip'       // Trickster dances
  | 'shield_bash' | 'stoic_nod' | 'salute'           // Guardian dances
  | 'victory_lap' | 'lightning_pose' | 'speed_blur'  // Speedster dances
  | 'chess_checkmate' | 'finger_temple' | 'slow_clap'// Tactician dances
  | 'rage_stomp' | 'primal_roar' | 'ground_pound' | 'fire_breath'; // Berserker

export interface VictoryDance {
  name: VictoryDanceName;
  duration: number;       // Milliseconds
  description: string;    // What the dance looks like
}

export interface CaptureAnimation {
  style: CaptureStyle;
  hunterJumpHeight: number;      // How high the hunter jumps (units)
  impactForce: number;           // Power of the landing (affects victim launch)
  hunterCelebration: string;     // Animation after capture
  throwAngle?: number;           // For throw styles
  spinType?: 'none' | 'spiral' | 'tumble' | 'chaotic';
  victoryDance?: VictoryDance;   // Victory celebration!
}

export interface CapturedAnimation {
  launchAngle: number;           // Degrees from horizontal (45-80)
  launchHeight: number;          // Peak height of the arc
  spinCount: number;             // Number of somersaults (0.5-3)
  spinAxis: 'forward' | 'backward' | 'sideways';
  hangTime: number;              // Milliseconds in the air
  landingStyle: LandingStyle;
  expression: VictimExpression;
}

export type LandingStyle = 
  | 'GRACEFUL'        // Lands on feet, brushes off
  | 'TUMBLE'          // Rolls to a stop
  | 'SPLAT'           // Face-first (comedic)
  | 'BOUNCE'          // Springs back up
  | 'SUPERHERO'       // Three-point landing
  | 'CRATER'          // Creates an impact crater 💥
  | 'ROLL_RECOVERY';  // Parkour-style recovery roll 🤸

export type VictimExpression = 
  | 'SURPRISED'       // 😲 Didn't see that coming
  | 'DIZZY'           // 😵 Too many spins
  | 'DETERMINED'      // 😤 I'll be back!
  | 'LAUGHING'        // 😂 Good one!
  | 'DRAMATIC';       // 🎭 Over-the-top reaction

/**
 * Generate capture animation parameters based on personalities
 * Includes throw styles, victory dances, and crowd reactions!
 */
export const CAPTURE_ANIMATIONS = {
  // Hunter styles by personality (normal vs rivalry throws)
  HUNTER_STYLES: {
    AGGRESSIVE: { 
      normal: { style: 'STOMP' as CaptureStyle, jumpHeight: 50, force: 100 },
      rivalry: { style: 'DROP_KICK' as CaptureStyle, jumpHeight: 100, force: 200, throwAngle: 70 }
    },
    CAUTIOUS: { 
      normal: { style: 'BOUNCE' as CaptureStyle, jumpHeight: 30, force: 60 },
      rivalry: { style: 'UPPERCUT' as CaptureStyle, jumpHeight: 90, force: 100, throwAngle: 85 }
    },
    SHOWBOAT: { 
      normal: { style: 'SPIRAL_FOOTBALL' as CaptureStyle, jumpHeight: 70, force: 90, spinType: 'spiral', throwAngle: 45 },
      rivalry: { style: 'YEET' as CaptureStyle, jumpHeight: 150, force: 180, spinType: 'chaotic', throwAngle: 60 }
    },
    STRATEGIC: { 
      normal: { style: 'JAVELIN' as CaptureStyle, jumpHeight: 60, force: 80, throwAngle: 35 },
      rivalry: { style: 'JAVELIN' as CaptureStyle, jumpHeight: 70, force: 120, throwAngle: 30 }
    },
    LOYAL: { 
      normal: { style: 'SUPLEX' as CaptureStyle, jumpHeight: 40, force: 85 },
      rivalry: { style: 'BODYSLAM' as CaptureStyle, jumpHeight: 80, force: 140 }
    },
    WILDCARD: { 
      normal: { style: 'CANNONBALL' as CaptureStyle, jumpHeight: 100, force: 150 },
      rivalry: { style: 'YEET' as CaptureStyle, jumpHeight: 150, force: 200, spinType: 'chaotic', throwAngle: 70 }
    }
  },
  
  // Victim reactions - arcs matched to throw types
  VICTIM_ARCS: {
    DEFAULT: [
      { launchAngle: 60, spinCount: 1, spinAxis: 'forward' as const, hangTime: 1200, style: 'graceful' },
      { launchAngle: 75, spinCount: 2, spinAxis: 'backward' as const, hangTime: 1500, style: 'dramatic' },
      { launchAngle: 45, spinCount: 0.5, spinAxis: 'sideways' as const, hangTime: 800, style: 'quick' },
      { launchAngle: 80, spinCount: 3, spinAxis: 'forward' as const, hangTime: 2000, style: 'epic' },
      { launchAngle: 55, spinCount: 1.5, spinAxis: 'backward' as const, hangTime: 1100, style: 'stylish' }
    ],
    JAVELIN: [
      { launchAngle: 30, spinCount: 0, spinAxis: 'forward' as const, hangTime: 800, style: 'straight', wobble: true }
    ],
    SPIRAL_FOOTBALL: [
      { launchAngle: 50, spinCount: 4, spinAxis: 'forward' as const, hangTime: 1500, style: 'spiral', spiralRotations: 6 }
    ],
    DROP_KICK: [
      { launchAngle: 85, spinCount: 2.5, spinAxis: 'backward' as const, hangTime: 2200, style: 'sky-high' }
    ],
    YEET: [
      { launchAngle: 70, spinCount: 3, spinAxis: 'sideways' as const, hangTime: 2500, style: 'legendary', spinType: 'chaotic' }
    ]
  },
  
  VICTIM_LANDINGS: ['GRACEFUL', 'TUMBLE', 'SPLAT', 'BOUNCE', 'SUPERHERO', 'CRATER', 'ROLL_RECOVERY'] as LandingStyle[],
  VICTIM_EXPRESSIONS: ['SURPRISED', 'DIZZY', 'DETERMINED', 'LAUGHING', 'DRAMATIC'] as VictimExpression[],
  
  // Victory dances by personality
  VICTORY_DANCES: {
    AGGRESSIVE: [
      { name: 'sword_salute', duration: 1500, description: 'Raises imaginary sword to sky' },
      { name: 'battle_cry', duration: 1000, description: 'Primal scream of victory' },
      { name: 'flex_pose', duration: 1200, description: 'Double bicep flex' }
    ],
    CAUTIOUS: [
      { name: 'stoic_nod', duration: 600, description: 'Dignified acknowledgment' },
      { name: 'salute', duration: 800, description: 'Military salute' }
    ],
    SHOWBOAT: [
      { name: 'moonwalk', duration: 2000, description: 'Smooth criminal slides' },
      { name: 'magic_flourish', duration: 1500, description: 'Ta-da! *jazz hands*' },
      { name: 'backflip', duration: 800, description: 'Celebratory backflip' }
    ],
    STRATEGIC: [
      { name: 'chess_checkmate', duration: 1200, description: 'Adjusts invisible glasses' },
      { name: 'finger_temple', duration: 800, description: 'Taps temple knowingly' },
      { name: 'slow_clap', duration: 2000, description: 'Sarcastic self-applause' }
    ],
    LOYAL: [
      { name: 'shield_bash', duration: 1000, description: 'Pounds chest like shield' },
      { name: 'salute', duration: 800, description: 'Team salute' }
    ],
    WILDCARD: [
      { name: 'rage_stomp', duration: 1500, description: 'Stomps ground repeatedly' },
      { name: 'primal_roar', duration: 1200, description: 'RAAAAWR!' },
      { name: 'ground_pound', duration: 1000, description: 'Fists slam the ground' },
      { name: 'fire_breath', duration: 1800, description: 'Breathes imaginary fire' }
    ]
  },
  
  // Crowd reactions for victory dances
  CROWD_DANCE_REACTIONS: {
    sword_salute: "The crowd salutes back!",
    battle_cry: "WARRIORS UNITE!!!",
    flex_pose: "💪 LOOK AT THOSE MUSCLES!",
    moonwalk: "🕺 SMOOTH CRIMINAL!",
    magic_flourish: "✨ INCREDIBLE!",
    backflip: "PERFECT FORM!",
    shield_bash: "DEFENDER OF THE REALM!",
    stoic_nod: "Respect.",
    salute: "🎖️ HONOR!",
    victory_lap: "ZOOM ZOOM ZOOM!",
    lightning_pose: "⚡ LIKE A BOLT!",
    speed_blur: "CAN'T EVEN SEE THEM!",
    chess_checkmate: "CHECKMATE!",
    finger_temple: "BIG BRAIN PLAY!",
    slow_clap: "...clap...clap...clap...",
    rage_stomp: "THE GROUND IS SHAKING!",
    primal_roar: "RAAAAAAWR!!!",
    ground_pound: "EARTHQUAKE!!!",
    fire_breath: "🔥 HOT HOT HOT!"
  },
  
  // Hunter celebrations (legacy, kept for compatibility)
  CELEBRATIONS: {
    AGGRESSIVE: ['victory_pump', 'flex', 'stomp_dance'],
    CAUTIOUS: ['modest_wave', 'thumbs_up', 'nod'],
    SHOWBOAT: ['backflip', 'moonwalk', 'dab', 'breakdance'],
    STRATEGIC: ['chess_checkmate', 'finger_temple', 'slow_clap'],
    LOYAL: ['salute', 'team_signal', 'fist_bump_air'],
    WILDCARD: ['random_dance', 'cartwheel', 'spinning', 'chicken_dance']
  }
} as const;

/**
 * PEG TAUNTS & REACTIONS
 * Gladiator-style phrases (all playful, no one gets hurt!)
 */
export const PEG_TAUNTS = {
  AGGRESSIVE: [
    "See you back at holding! 👋",
    "Nothing personal, gladiator!",
    "The arena claims another!",
    "Back to the pen with you!"
  ],
  CAUTIOUS: [
    "Sorry, had to do it...",
    "Safe travels back home!",
    "Just playing the game!"
  ],
  SHOWBOAT: [
    "AND THE CROWD GOES WILD! 🎉",
    "Did you see that?! LEGENDARY!",
    "Another one for the highlight reel!"
  ],
  STRATEGIC: [
    "Calculated.",
    "As planned.",
    "Checkmate."
  ],
  LOYAL: [
    "For the team!",
    "Cleared the path!",
    "Got your back, teammates!"
  ],
  WILDCARD: [
    "SURPRISE! 🎲",
    "Bet you didn't see THAT coming!",
    "Chaos reigns!"
  ]
} as const;

export const PEG_REACTIONS = {
  CAPTURED: [
    "I'll be back! 💪",
    "This isn't over!",
    "Remember my face!",
    "Next time, gladiator..."
  ],
  ENTERED_SAFE: [
    "Home sweet home!",
    "Safe at last!",
    "Can't touch this! 🛡️"
  ],
  FINISHED: [
    "VICTORY! 🏆",
    "Champion of the arena!",
    "Mission accomplished!"
  ],
  NARROW_ESCAPE: [
    "Phew! That was close!",
    "Not today!",
    "Better luck next time!"
  ]
} as const;

// =============================================================================
// CARD TYPES
// =============================================================================

export type CardRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'JOKER';
export type CardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | null;

export interface Card {
  id: string;
  rank: CardRank;
  suit: CardSuit;
}

export const PLAY_AGAIN_RANKS: CardRank[] = ['A', '6', 'J', 'Q', 'K', 'JOKER'];

// =============================================================================
// PLAYER TYPES
// =============================================================================

export interface Player {
  id: number;
  name: string;
  color: string;
  connected: boolean;
  isBot: boolean;
}

// =============================================================================
// BOARD CONFIGURATION
// =============================================================================

/**
 * SAFE ZONE RULES:
 * - Player CANNOT pass/overtake their safeZoneEntry position
 * - MUST turn into safe zone at exitPosition (safeZoneEntry)
 * - Safe zone fills sequentially (SAFE_0, SAFE_1, SAFE_2, SAFE_3)
 * - Only when ALL 4 safe positions are filled can player continue to winner hole
 * - Winner hole requires EXACT card value to land on - no overshooting
 */
export interface PlayerZone {
  id: number;
  outerRim: string[];      // 13 positions per player on outer track
  holding: string[];       // 4 holding pen positions
  safe: string[];          // 4 safe zone positions (must fill in order)
  winner: string;          // Final winning position (requires EXACT card value)
  fasttrack: string;       // Their fast track entry point
  entryPosition: string;   // Where pegs enter track from holding
  exitPosition: string;    // Where pegs MUST exit to safe zone (cannot pass this)
}

export interface BoardConfig {
  center: string;
  fasttrackRing: string[];       // 6 fast track holes (FT_0-FT_5) in clockwise order
  players: PlayerZone[];
  positions: Map<string, Position>;
  trackOrder: string[];          // Complete outer rim in clockwise order
}

// =============================================================================
// GAME STATE
// =============================================================================

export interface GameState {
  // Configuration
  config: GameConfig;
  board: BoardConfig;
  
  // Players
  players: Player[];
  currentPlayerId: number;
  turnNumber: number;
  
  // Pegs
  pegs: Map<string, Peg>;
  
  // Cards
  decks: Map<number, Card[]>;      // Each player's deck
  hands: Map<number, Card[]>;      // Each player's hand
  discards: Map<number, Card[]>;   // Each player's discard pile
  
  // Turn state
  mustPlayAgain: boolean;
  selectedCard: Card | null;
  phase: GamePhase;
  
  // Win state
  winner: number | null;
  rankings: number[];              // Players in order of finishing
  
  // Metadata
  startedAt: number;
  lastEventId: string;
}

export type GamePhase = 
  | 'SETUP'
  | 'WAITING_FOR_PLAYERS'
  | 'PLAYING'
  | 'GAME_OVER';

export interface GameConfig {
  numPlayers: number;         // 2-6
  cardsPerHand: number;       // Default 5
  pegsPerPlayer: number;      // 5 (4 in holding + 1 on track at start)
  enableBots: boolean;
  seed?: number;              // For deterministic randomness
}

// =============================================================================
// MOVE TYPES
// =============================================================================

export type MoveType =
  | 'EXIT_HOLDING'        // Move peg from holding to entry position
  | 'MOVE_FORWARD'        // Move N spaces forward (clockwise)
  | 'MOVE_BACKWARD'       // Move N spaces backward (4 card only, counter-clockwise)
  | 'SWAP'                // Jack: swap with opponent
  | 'ENTER_SAFE'          // Enter safe zone
  | 'MOVE_IN_SAFE'        // Move within safe zone
  | 'ENTER_FASTTRACK'     // Land on fast track hole (clockwise only activates FT)
  | 'MOVE_FASTTRACK'      // Move between fast track holes (clockwise)
  | 'EXIT_FASTTRACK'      // Exit fast track to outer rim or safe zone
  | 'ENTER_CENTER'        // Enter bull's eye (ONLY from FT hole, ONLY clockwise)
  | 'EXIT_CENTER'         // Exit bull's eye (J/Q/K)
  | 'WILD_MOVE'           // Joker: move anywhere
  | 'FINISH';             // Land on winner hole

/**
 * CENTER (BULL'S EYE) ENTRY RULES:
 * - Can ONLY enter from a fast track hole
 * - Can ONLY enter when moving CLOCKWISE (forward)
 * - Penultimate move must land on FT hole, then final move goes to center
 * - When moving BACKWARD (4 card), FT holes act as regular outer rim - NO center access
 * - From FT hole: can go to center OR continue to next outer rim position
 */

/**
 * WINNING RULES:
 * - Must land on winner hole with EXACT card value
 * - Cannot overshoot - if card value exceeds distance to winner, move is illegal
 * - Safe zone must be completely filled (all 4 positions) before attempting winner
 */

export interface Move {
  pegId: string;
  type: MoveType;
  from: string;
  to: string;
  cardId: string;
  capturedPegId?: string;     // If landing on opponent
  swappedWithPegId?: string;  // For Jack swaps
}

export interface MoveValidation {
  valid: boolean;
  reason?: string;
  moves?: Move[];             // Valid moves for this card
}

// =============================================================================
// EVENT TYPES (FOR MANIFOLD INGESTION)
// =============================================================================

export type EventType =
  | 'GAME_CREATED'
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'GAME_STARTED'
  | 'CARD_DRAWN'
  | 'CARD_PLAYED'
  | 'PEG_MOVED'
  | 'PEG_CAPTURED'
  | 'TURN_ENDED'
  | 'TURN_PLAY_AGAIN'
  | 'PLAYER_FINISHED'
  | 'GAME_ENDED'
  | 'SYNC_REQUEST'
  | 'SYNC_RESPONSE'
  | 'HEARTBEAT';

export interface GameEvent {
  id: string;
  type: EventType;
  timestamp: number;
  actor: string;              // Player ID or 'SYSTEM'
  payload: Record<string, unknown>;
  sequence: number;           // Monotonic sequence for ordering
  checksum?: string;          // For state verification
}

// =============================================================================
// MANIFOLD RECORD
// =============================================================================

export interface ManifoldRecord {
  eventId: string;
  gameId: string;
  type: EventType;
  timestamp: number;
  actor: string;
  payload: Record<string, unknown>;
  stateBefore: string;        // Hash of state before
  stateAfter: string;         // Hash of state after
  dimensions: {
    game: string;
    player: string;
    turn: number;
    phase: GamePhase;
  };
}
