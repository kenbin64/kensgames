/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 * 
 * PARADIGM: Objects are dimensions containing points. Each point
 * is an object in a lower dimension containing its own points.
 * All properties, attributes, and behaviors exist as infinite
 * potentials — invoke only when needed. No pre-calculation,
 * no storage. Geometry IS information.
 * 
 * ============================================================
 * FASTTRACK RULES SUBSTRATE
 * ButterflyFX Manifold Pattern - Complete Game Rules Codification
 * ============================================================
 * 
 * This substrate defines ALL game rules as formal, composable entities.
 * Each rule is an independent unit that can be queried, validated,
 * and composed with other rules.
 * 
 * Based on: fastrack_officials_rules_single_card_draw
 */

// ============================================================
// RULE SUBSTRATE: Core Architecture
// ============================================================

const RulesSubstrate = {
    version: '1.0.0',
    name: 'FastTrack Official Rules',
    
    // Rule registry - all rules indexed by ID
    rules: new Map(),
    
    // Rule categories for organization
    categories: {
        SETUP: 'setup',
        TURN_FLOW: 'turn_flow',
        MOVEMENT: 'movement',
        CARDS: 'cards',
        CUTTING: 'cutting',
        WINNING: 'winning',
        SPECIAL: 'special'
    },
    
    // Register a rule
    register: function(rule) {
        if (!rule.id) throw new Error('Rule must have an ID');
        this.rules.set(rule.id, {
            ...rule,
            registered: Date.now()
        });
        return this;
    },
    
    // Get a rule by ID
    get: function(id) {
        return this.rules.get(id);
    },
    
    // Get all rules in a category
    getByCategory: function(category) {
        const results = [];
        this.rules.forEach(rule => {
            if (rule.category === category) results.push(rule);
        });
        return results;
    },
    
    // Validate a move against all applicable rules
    validateMove: function(move, gameState) {
        const violations = [];
        this.rules.forEach(rule => {
            if (rule.validates && typeof rule.validate === 'function') {
                const result = rule.validate(move, gameState);
                if (!result.valid) {
                    violations.push({
                        ruleId: rule.id,
                        ruleName: rule.name,
                        message: result.message
                    });
                }
            }
        });
        return {
            valid: violations.length === 0,
            violations: violations
        };
    },
    
    // Export rules as JSON for documentation
    toJSON: function() {
        const output = [];
        this.rules.forEach(rule => {
            output.push({
                id: rule.id,
                name: rule.name,
                category: rule.category,
                description: rule.description,
                priority: rule.priority
            });
        });
        return output;
    }
};

// ============================================================
// RULE SUBSTRATE: Setup Rules
// ============================================================

RulesSubstrate.register({
    id: 'SETUP_001',
    name: 'Player Count',
    category: RulesSubstrate.categories.SETUP,
    priority: 1,
    description: 'Game supports 2-6 players',
    validate: function(move, gameState) {
        const count = gameState.playerCount;
        return {
            valid: count >= 2 && count <= 6,
            message: `Player count must be 2-6 (got ${count})`
        };
    }
});

RulesSubstrate.register({
    id: 'SETUP_002',
    name: 'Initial Peg Placement',
    category: RulesSubstrate.categories.SETUP,
    priority: 2,
    description: 'Each player starts with 4 pegs in their holding area, 1 peg in home position',
    details: [
        'Holding area has 4 positions arranged in a semi-circle',
        'Home position is the first hole on the outer track in player\'s color segment',
        'All pegs start in holding except the home peg'
    ]
});

RulesSubstrate.register({
    id: 'SETUP_003',
    name: 'Deck Composition',
    category: RulesSubstrate.categories.SETUP,
    priority: 3,
    description: 'Standard 52-card deck plus 2 Jokers (54 cards total)',
    details: [
        '4 suits: Hearts, Diamonds, Clubs, Spades',
        '13 cards per suit: A, 2-10, J, Q, K',
        '2 Jokers (red and black)'
    ]
});

RulesSubstrate.register({
    id: 'SETUP_004',
    name: 'First Player',
    category: RulesSubstrate.categories.SETUP,
    priority: 4,
    description: 'Player 1 (Red) goes first, play proceeds clockwise',
    details: [
        'Turn order follows player index: 0 → 1 → 2 → ... → 5 → 0',
        'In physical game, youngest player often goes first'
    ]
});

// ============================================================
// RULE SUBSTRATE: Turn Flow Rules
// ============================================================

RulesSubstrate.register({
    id: 'TURN_001',
    name: 'Turn Structure',
    category: RulesSubstrate.categories.TURN_FLOW,
    priority: 1,
    description: 'Each turn consists of: Draw → Play → End',
    phases: {
        DRAW: 'Player draws exactly one card from the deck',
        PLAY: 'Player must make a legal move if one exists',
        END: 'Turn passes to next player (or extra turn if applicable)'
    }
});

RulesSubstrate.register({
    id: 'TURN_002',
    name: 'Mandatory Move',
    category: RulesSubstrate.categories.TURN_FLOW,
    priority: 2,
    description: 'If a legal move exists, the player MUST make it',
    validates: true,
    validate: function(move, gameState) {
        // This rule is informational - validation happens at engine level
        return { valid: true };
    }
});

RulesSubstrate.register({
    id: 'TURN_003',
    name: 'No Legal Moves',
    category: RulesSubstrate.categories.TURN_FLOW,
    priority: 3,
    description: 'If no legal move exists, the card is discarded and turn ends'
});

RulesSubstrate.register({
    id: 'TURN_004',
    name: 'Deck Exhaustion',
    category: RulesSubstrate.categories.TURN_FLOW,
    priority: 4,
    description: 'When deck is empty, shuffle discard pile to form new deck'
});

// ============================================================
// RULE SUBSTRATE: Card Rules
// ============================================================

RulesSubstrate.register({
    id: 'CARD_001',
    name: 'Ace Properties',
    category: RulesSubstrate.categories.CARDS,
    priority: 1,
    description: 'Ace can bring peg from holding OR move 1 space clockwise. Grants extra turn.',
    properties: {
        rank: 'A',
        movement: 1,
        direction: 'clockwise',
        extraTurn: true,
        canEnterFromHolding: true,
        canExitBullseye: false,    // Ace CANNOT exit bullseye (only J/Q/K)
        type: 'entry'              // Entry card, NOT royal
    }
});

RulesSubstrate.register({
    id: 'CARD_002',
    name: 'Face Card Properties (K, Q, J)',
    category: RulesSubstrate.categories.CARDS,
    priority: 2,
    description: 'Kings, Queens, and Jacks move 1 space, can exit bullseye, and grant extra turn',
    properties: {
        movement: 1,
        direction: 'clockwise',
        extraTurn: true,
        canEnterFromHolding: false,
        canExitBullseye: true,     // Royal cards CAN exit bullseye to FastTrack
        type: 'royal'
    },
    details: [
        'Can exit bullseye to fast track',
        'Cannot bring peg out of holding'
    ]
});

RulesSubstrate.register({
    id: 'CARD_003',
    name: 'Number Card Movement',
    category: RulesSubstrate.categories.CARDS,
    priority: 3,
    description: 'Number cards (2-10 except 6,7,4) move that many spaces clockwise',
    details: [
        '2 - Move 2 spaces',
        '3 - Move 3 spaces',
        '5 - Move 5 spaces',
        '8 - Move 8 spaces',
        '9 - Move 9 spaces',
        '10 - Move 10 spaces'
    ]
});

RulesSubstrate.register({
    id: 'CARD_004',
    name: 'Four Special Rule',
    category: RulesSubstrate.categories.CARDS,
    priority: 4,
    description: 'Four moves 4 spaces BACKWARD (counter-clockwise). Has movement restrictions.',
    properties: {
        rank: '4',
        movement: 4,
        direction: 'backward',         // Counter-clockwise
        extraTurn: false,
        canEnterFromHolding: false,
        canExitBullseye: false
    },
    restrictions: {
        cannotEnterFastTrack: true,    // Cannot back into FastTrack
        cannotEnterCenter: true,       // Cannot back into Bullseye
        cannotEnterSafeZone: true,     // Cannot back into Safe Zone
        cannotEnterWinner: true        // Cannot back into Home/Winner hole
    },
    details: [
        'Movement is counter-clockwise (opposite of normal)',
        'CANNOT enter: FastTrack, Bullseye, Safe Zone, Home hole',
        'Can cut opponent pegs when moving backward'
    ]
});

RulesSubstrate.register({
    id: 'CARD_005',
    name: 'Six Special Rule',
    category: RulesSubstrate.categories.CARDS,
    priority: 5,
    description: 'Six can enter from holding (0 moves) OR move 6 spaces. Grants extra turn.',
    properties: {
        rank: '6',
        movement: 6,                   // Regular movement: 6 spaces
        enterMovement: 0,              // Entry movement: 0 spaces (just places on home)
        direction: 'clockwise',
        extraTurn: true,
        canEnterFromHolding: true,
        canExitBullseye: false
    },
    details: [
        'OPTION 1: Enter from holding - places peg on home hole with 0 movement',
        'OPTION 2: Move existing peg 6 spaces clockwise',
        'Always grants extra turn regardless of which option used'
    ]
});

RulesSubstrate.register({
    id: 'CARD_006',
    name: 'Seven Split Rule',
    category: RulesSubstrate.categories.CARDS,
    priority: 6,
    description: 'Seven can be split between TWO pegs (e.g., 3+4, 2+5, 1+6). Both moves clockwise.',
    properties: {
        rank: '7',
        movement: 7,
        direction: 'clockwise',
        extraTurn: false,
        canSplit: true
    },
    details: [
        'Must have 2+ pegs on board to split',
        'If splitting, both pegs must use all 7 moves total',
        'Can choose to move single peg full 7 spaces instead',
        'Both sub-moves are CLOCKWISE (never backward)',
        'Cutting only happens on the SECOND sub-move',
        'FT peg + outer-track peg: FT peg must have completed FT circuit to split',
        'Two FT pegs CAN split with each other'
    ]
});

RulesSubstrate.register({
    id: 'CARD_007',
    name: 'Joker Properties',
    category: RulesSubstrate.categories.CARDS,
    priority: 7,
    description: 'Joker can bring peg from holding OR move 1 space. Grants extra turn. Cannot exit bullseye.',
    properties: {
        rank: 'JOKER',
        movement: 1,
        direction: 'clockwise',
        extraTurn: true,
        canEnterFromHolding: true,
        canExitBullseye: false,    // Joker CANNOT exit bullseye (only J/Q/K)
        type: 'wild'               // Wild card, NOT royal
    }
});

// ============================================================
// RULE SUBSTRATE: Movement Rules
// ============================================================

RulesSubstrate.register({
    id: 'MOVE_001',
    name: 'Clockwise Direction',
    category: RulesSubstrate.categories.MOVEMENT,
    priority: 1,
    description: 'Standard movement is clockwise around the board',
    details: [
        'Exception: 4 card moves counter-clockwise',
        'Clockwise follows hole numbering sequence'
    ]
});

RulesSubstrate.register({
    id: 'MOVE_002',
    name: 'No Passing Own Pegs',
    category: RulesSubstrate.categories.MOVEMENT,
    priority: 2,
    description: 'A peg cannot pass over or land on another peg of the same player',
    validates: true,
    validate: function(move, gameState) {
        // Check if path crosses own peg
        if (move.path) {
            const player = gameState.currentPlayer;
            for (const holeId of move.path.slice(0, -1)) {
                if (player.pegs.some(p => p.holeId === holeId)) {
                    return {
                        valid: false,
                        message: 'Cannot pass over your own peg'
                    };
                }
            }
        }
        return { valid: true };
    }
});

RulesSubstrate.register({
    id: 'MOVE_003',
    name: 'Entering Board',
    category: RulesSubstrate.categories.MOVEMENT,
    priority: 3,
    description: 'Pegs enter the board at their home position',
    details: [
        'Home position is the hexagon-marked hole in player\'s color segment',
        'Only Ace, 6, or Joker can bring peg from holding',
        'Can only enter if home position is not occupied by own peg'
    ],
    validates: true,
    validate: function(move, gameState) {
        if (move.type === 'enter') {
            const homeHoleId = `home-${gameState.currentPlayer.index}`;
            const ownPegAtHome = gameState.currentPlayer.pegs.some(
                p => p.holeId === homeHoleId
            );
            if (ownPegAtHome) {
                return {
                    valid: false,
                    message: 'Cannot enter - home position occupied by your peg'
                };
            }
        }
        return { valid: true };
    }
});

RulesSubstrate.register({
    id: 'MOVE_004',
    name: 'Fast Track Access',
    category: RulesSubstrate.categories.MOVEMENT,
    priority: 4,
    description: 'Fast Track is the inner ring shortcut (6 holes). Enter by landing exactly on an FT hole.',
    details: [
        'Entry: Land exactly on an ft-* hole as the final step of a clockwise move',
        'Cannot enter FastTrack going backward (Card 4)',
        'Must pass own color FT hole to complete circuit',
        'FT pegs can enter bullseye with a 1-step card (A, J, Q, K, Joker) — no waiting period',
        'FT status lost if: draw 4, move non-FT peg while having FT pegs, or voluntarily exit'
    ]
});

RulesSubstrate.register({
    id: 'MOVE_005',
    name: 'Bullseye Rules',
    category: RulesSubstrate.categories.MOVEMENT,
    priority: 5,
    description: 'Bullseye (center hole) is entered from FastTrack with a 1-step card, exited with J/Q/K only',
    entry: {
        condition: 'Peg on any ft-* hole with a 1-step card (A, J, Q, K, Joker)',
        noWaitingPeriod: true,
        method: 'When next hop from an FT hole leads to center, bullseye is offered as destination'
    },
    exit: {
        cards: ['J', 'Q', 'K'],       // ONLY these cards can exit bullseye
        notAllowed: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'JOKER'],
        destination: 'ft-{playerIdx}' // Exit to own FastTrack hole
    },
    details: [
        'Bullseye is the center hole (id: "center")',
        'ENTRY: Peg on FastTrack + 1-step card — no waiting period',
        'EXIT: ONLY J, Q, K cards can exit (NOT Ace, NOT Joker)',
        'EXIT DESTINATION: Own FastTrack hole (ft-{playerIdx})',
        'IF OWN FT OCCUPIED: Exit to previous FastTrack hole',
        'SAFE: Cannot be cut while in bullseye',
        'BLOCKING: Only one peg can occupy bullseye at a time'
    ]
});

RulesSubstrate.register({
    id: 'MOVE_006',
    name: 'Safe Zone Entry',
    category: RulesSubstrate.categories.MOVEMENT,
    priority: 6,
    description: 'Safe zone is the final stretch before home (4 holes)',
    details: [
        'Entry: Must pass home position completely around the board once',
        'Only the owning player can occupy their safe zone',
        'Pegs in safe zone cannot be cut',
        'Must fill all 4 safe zone holes before reaching home'
    ]
});

RulesSubstrate.register({
    id: 'MOVE_007',
    name: 'Exact Landing Required',
    category: RulesSubstrate.categories.MOVEMENT,
    priority: 7,
    description: 'Cannot overshoot destination (must have exact count)',
    validates: true,
    validate: function(move, gameState) {
        // Validation happens during move calculation
        return { valid: true };
    }
});

// ============================================================
// RULE SUBSTRATE: Cutting Rules
// ============================================================

RulesSubstrate.register({
    id: 'CUT_001',
    name: 'Cutting Definition',
    category: RulesSubstrate.categories.CUTTING,
    priority: 1,
    description: 'Landing on an opponent\'s peg sends their peg back to holding',
    details: [
        'This is called "cutting" or "sending home"',
        'The cut peg returns to one of the 4 holding positions',
        'Cut player must re-enter with A, 6, or Joker'
    ]
});

RulesSubstrate.register({
    id: 'CUT_002',
    name: 'Cut-Safe Zones',
    category: RulesSubstrate.categories.CUTTING,
    priority: 2,
    description: 'Certain positions are safe from cutting',
    safePositions: [
        'Holding area (pegs waiting to enter)',
        'Bullseye (center hole)',
        'Safe zone (player\'s final 4 holes)'
    ],
    notSafe: [
        'Home hole (CAN be cut by opponents)',
        'FastTrack holes (CAN be cut)',
        'Outer track (CAN be cut)'
    ]
});

RulesSubstrate.register({
    id: 'CUT_003',
    name: 'Cannot Cut Own Pegs',
    category: RulesSubstrate.categories.CUTTING,
    priority: 3,
    description: 'A player can never cut their own pegs',
    validates: true,
    validate: function(move, gameState) {
        // Prevented by MOVE_002 (can't land on own peg)
        return { valid: true };
    }
});

// ============================================================
// RULE SUBSTRATE: Winning Rules
// ============================================================

RulesSubstrate.register({
    id: 'WIN_001',
    name: 'Win Condition',
    category: RulesSubstrate.categories.WINNING,
    priority: 1,
    description: 'First player to get all 5 pegs home wins',
    details: [
        '4 pegs must fill the 4 safe zone holes',
        '1 peg must reach the final home position',
        'All 5 must be in place at turn end to win'
    ],
    check: function(gameState, player) {
        const safeZonePegs = player.pegs.filter(p => p.holeType === 'safezone').length;
        const homePeg = player.pegs.find(p => p.holeType === 'home');
        return safeZonePegs === 4 && homePeg !== undefined;
    }
});

RulesSubstrate.register({
    id: 'WIN_002',
    name: 'Game End',
    category: RulesSubstrate.categories.WINNING,
    priority: 2,
    description: 'Game ends immediately when win condition is met',
    details: [
        'Remaining players do not complete their turns',
        'Winner is announced',
        'Other players can continue for placement (optional variant)'
    ]
});

// ============================================================
// RULE SUBSTRATE: Special Rules
// ============================================================

RulesSubstrate.register({
    id: 'SPECIAL_001',
    name: 'Extra Turn',
    category: RulesSubstrate.categories.SPECIAL,
    priority: 1,
    description: 'Certain cards grant an extra turn after playing',
    grantExtraTurn: ['A', 'K', 'Q', 'J', '6', 'JOKER'],
    details: [
        'Player draws again immediately after move',
        'No extra turn if player had no legal moves',
        'Extra turns stack (royal after royal = another extra turn)'
    ]
});

RulesSubstrate.register({
    id: 'SPECIAL_002',
    name: 'Home Position Protection',
    category: RulesSubstrate.categories.SPECIAL,
    priority: 2,
    description: 'Home position has special protection rules',
    details: [
        'Own peg at home cannot be passed by own pegs',
        'Opponent landing on home cuts the occupant',
        'After entering, peg must move clockwise to complete circuit'
    ]
});

RulesSubstrate.register({
    id: 'SPECIAL_003',
    name: 'FastTrack Loss Enforcement',
    category: RulesSubstrate.categories.SPECIAL,
    priority: 3,
    description: 'FT pegs lose status if player does not traverse FT during their turn',
    details: [
        'Drawing a 4 → FT peg gets mustExitFasttrack flag',
        'Moving a non-FT peg while having FT pegs → ALL FT pegs lose status at end of turn',
        'Player must traverse FT each turn they have FT pegs, or lose status'
    ]
});

RulesSubstrate.register({
    id: 'SPECIAL_004',
    name: 'Mrs. Kravits Rule (Neighbor Awareness)',
    category: RulesSubstrate.categories.SPECIAL,
    priority: 4,
    description: 'Every point and dimension in the substrate knows the location of its immediate neighbors and keeps a protective watch over them',
    details: [
        'Each token maintains awareness of adjacent tokens in the manifold',
        'Neighbors know location and state signature but NOT payload or full context',
        'This is a neighborhood watch, not a window — you can tell when something changed next door but you cannot read the mail',
        'Change propagation is instant — O(1) ripple through neighbor links, no polling or event bus',
        'Self-healing — if a token is lost the substrate reconstructs it from neighbor knowledge',
        'Named after Mrs. Kravits from Bewitched — always watching what the neighbors are up to'
    ],
    properties: {
        propagation: 'instant',
        selfHealing: true,
        contextVisibility: 'location_and_signature_only',
        payloadVisibility: false
    }
});

// ============================================================
// BOARD SUBSTRATE: Topology Definition
// ============================================================

const BoardSubstrate = {
    version: '1.0.0',
    name: 'FastTrack Board Topology',
    
    // Board zones
    zones: {
        HOLDING: {
            id: 'holding',
            description: 'Starting area for pegs not yet on board',
            perPlayer: 4,
            isSafe: true
        },
        OUTER_TRACK: {
            id: 'outer',
            description: 'Main track around the hexagonal board',
            holesPerSide: 6,
            totalHoles: 36,
            isSafe: false
        },
        FAST_TRACK: {
            id: 'fasttrack',
            description: 'Inner ring shortcut',
            holes: 6,
            isSafe: false
        },
        BULLSEYE: {
            id: 'bullseye',
            description: 'Center hole - gateway to fast track',
            holes: 1,
            isSafe: true
        },
        SAFE_ZONE: {
            id: 'safezone',
            description: 'Final stretch before home (per player)',
            perPlayer: 4,
            isSafe: true
        },
        HOME: {
            id: 'home',
            description: 'Final destination for each player',
            perPlayer: 1,
            isSafe: true
        }
    },
    
    // Hole type definitions
    holeTypes: {
        'holding': { canBeCut: false, canEnter: true, canExit: true },
        'outer': { canBeCut: true, canEnter: true, canExit: true },
        'home_marker': { canBeCut: true, canEnter: true, canExit: true, isStart: true },
        'fasttrack': { canBeCut: true, canEnter: true, canExit: true },
        'bullseye': { canBeCut: false, canEnter: true, canExit: true, requiresRoyal: true },
        'safezone': { canBeCut: false, canEnter: true, canExit: true, ownerOnly: true },
        'home': { canBeCut: false, canEnter: true, canExit: false, isFinal: true }
    },
    
    // Visual markers
    markers: {
        PENTAGON: { type: 'pentagon', description: 'Entry/exit point for fast track' },
        DIAMOND: { type: 'diamond', description: 'Special hole marker' },
        CIRCLE: { type: 'circle', description: 'Standard hole' },
        HEXAGON: { type: 'hexagon', description: 'Home position marker' },
        BULLSEYE: { type: 'bullseye', description: 'Center target' }
    },
    
    // Adjacency rules
    getAdjacent: function(holeId, direction) {
        // Returns the next hole in given direction
        // This would be populated from holeRegistry connections
        return null; // Implemented by game engine
    }
};

// ============================================================
// CARD SUBSTRATE: Complete Card Definitions
// ============================================================

const CardSubstrate = {
    version: '1.0.0',
    
    // Card definitions with all properties
    // MUST MATCH game_engine.js CARD_TYPES for consistency
    cards: {
        ACE: {
            rank: 'A',
            value: 1,
            type: 'entry',              // Entry card, NOT royal
            movement: 1,
            direction: 'clockwise',
            extraTurn: true,
            canEnterFromHolding: true,  // Can enter from holding
            canExitBullseye: false,     // CANNOT exit bullseye (only J/Q/K can)
            color: 'any',
            description: 'Enter from holding OR move 1 clockwise. Extra turn.'
        },
        TWO: {
            rank: '2',
            value: 2,
            type: 'number',
            movement: 2,
            direction: 'clockwise',
            extraTurn: false,
            canEnterFromHolding: false,
            canExitBullseye: false,
            color: 'any'
        },
        THREE: {
            rank: '3',
            value: 3,
            type: 'number',
            movement: 3,
            direction: 'clockwise',
            extraTurn: false,
            canEnterFromHolding: false,
            canExitBullseye: false,
            color: 'any'
        },
        FOUR: {
            rank: '4',
            value: 4,
            type: 'special_backward',
            movement: 4,
            direction: 'counter_clockwise',
            extraTurn: false,
            canEnterFromHolding: false,
            canExitBullseye: false,
            color: 'any',
            special: 'Moves BACKWARDS (counter-clockwise)'
        },
        FIVE: {
            rank: '5',
            value: 5,
            type: 'number',
            movement: 5,
            direction: 'clockwise',
            extraTurn: false,
            canEnterFromHolding: false,
            canExitBullseye: false,
            color: 'any'
        },
        SIX: {
            rank: '6',
            value: 6,
            type: 'special_extra_turn',
            movement: 6,
            direction: 'clockwise',
            extraTurn: true,
            canEnterFromHolding: true,
            canExitBullseye: false,
            color: 'any',
            special: 'Grants extra turn AND can enter from holding'
        },
        SEVEN: {
            rank: '7',
            value: 7,
            type: 'special_split',
            movement: 7,
            direction: 'clockwise',
            extraTurn: false,
            canEnterFromHolding: false,
            canExitBullseye: false,
            canSplit: true,
            color: 'any',
            special: 'Can split movement between two pegs'
        },
        EIGHT: {
            rank: '8',
            value: 8,
            type: 'number',
            movement: 8,
            direction: 'clockwise',
            extraTurn: false,
            canEnterFromHolding: false,
            canExitBullseye: false,
            color: 'any'
        },
        NINE: {
            rank: '9',
            value: 9,
            type: 'number',
            movement: 9,
            direction: 'clockwise',
            extraTurn: false,
            canEnterFromHolding: false,
            canExitBullseye: false,
            color: 'any'
        },
        TEN: {
            rank: '10',
            value: 10,
            type: 'number',
            movement: 10,
            direction: 'clockwise',
            extraTurn: false,
            canEnterFromHolding: false,
            canExitBullseye: false,
            color: 'any'
        },
        JACK: {
            rank: 'J',
            value: 11,
            type: 'royal',
            movement: 1,
            direction: 'clockwise',
            extraTurn: true,
            canEnterFromHolding: false,  // Cannot enter from holding
            canExitBullseye: true,       // CAN exit bullseye to FastTrack
            color: 'any',
            isRoyal: true,
            description: 'Move 1 clockwise. Can exit bullseye. Extra turn.'
        },
        QUEEN: {
            rank: 'Q',
            value: 12,
            type: 'royal',
            movement: 1,
            direction: 'clockwise',
            extraTurn: true,
            canEnterFromHolding: false,
            canExitBullseye: true,
            color: 'any',
            isRoyal: true,
            description: 'Move 1 clockwise. Can exit bullseye. Extra turn.'
        },
        KING: {
            rank: 'K',
            value: 13,
            type: 'royal',
            movement: 1,
            direction: 'clockwise',
            extraTurn: true,
            canEnterFromHolding: false,
            canExitBullseye: true,
            color: 'any',
            isRoyal: true,
            description: 'Move 1 clockwise. Can exit bullseye. Extra turn.'
        },
        JOKER: {
            rank: 'JOKER',
            value: 0,
            type: 'wild',
            movement: 1,
            direction: 'clockwise',
            extraTurn: true,
            canEnterFromHolding: true,  // Can enter from holding
            canExitBullseye: false,     // CANNOT exit bullseye (only J/Q/K can)
            color: 'wild',
            description: 'Enter from holding OR move 1 clockwise. Extra turn.'
        }
    },
    
    // Suits
    suits: ['hearts', 'diamonds', 'clubs', 'spades'],
    
    // Get card by rank
    getCard: function(rank) {
        for (const [key, card] of Object.entries(this.cards)) {
            if (card.rank === rank) return card;
        }
        return null;
    },
    
    // Check if card grants extra turn
    grantsExtraTurn: function(rank) {
        const card = this.getCard(rank);
        return card ? card.extraTurn : false;
    },
    
    // Check if card can enter from holding
    canEnterFromHolding: function(rank) {
        const card = this.getCard(rank);
        return card ? card.canEnterFromHolding : false;
    }
};

// ============================================================
// PLAYER SUBSTRATE: Player State and Properties
// ============================================================

const PlayerSubstrate = {
    version: '1.0.0',
    
    // Create a new player state
    create: function(index, name, color) {
        return {
            // Identity
            id: `player_${index}`,
            index: index,
            name: name,
            color: color,
            
            // Peg state
            pegs: [],
            pegsInHolding: 4,
            pegsOnBoard: 0,
            pegsInSafeZone: 0,
            pegAtHome: false,
            
            // Progress
            hasWon: false,
            turnsTaken: 0,
            
            // Statistics
            stats: {
                pegsEntered: 0,
                pegsCut: 0,
                pegsLost: 0,
                extraTurns: 0,
                fastTrackUses: 0
            }
        };
    },
    
    // Update peg counts from current state
    updateCounts: function(player) {
        player.pegsInHolding = player.pegs.filter(p => p.holeType === 'holding').length;
        player.pegsOnBoard = player.pegs.filter(p => 
            p.holeType !== 'holding' && p.holeType !== 'safezone' && p.holeType !== 'home'
        ).length;
        player.pegsInSafeZone = player.pegs.filter(p => p.holeType === 'safezone').length;
        player.pegAtHome = player.pegs.some(p => p.holeType === 'home');
    }
};

// ============================================================
// PEG SUBSTRATE: Individual Peg State
// (Skip if already loaded from peg_substrate.js)
// ============================================================

const _RulesPegSubstrate = window.PegSubstrate || {
    version: '1.0.0',
    
    // Create a new peg
    create: function(id, playerIndex, holeId) {
        return {
            id: id,
            playerIndex: playerIndex,
            holeId: holeId,
            holeType: 'holding',
            
            // Track state
            onFasttrack: false,
            passedOriginOnce: false, // Required to enter safe zone
            inBullseye: false,
            
            // Visual reference
            mesh: null
        };
    },
    
    // Move peg to new hole
    moveTo: function(peg, newHoleId, newHoleType) {
        peg.holeId = newHoleId;
        peg.holeType = newHoleType;
        
        if (newHoleType === 'fasttrack') {
            peg.onFasttrack = true;
        }
        if (newHoleType === 'bullseye') {
            peg.inBullseye = true;
        }
    },
    
    // Reset peg to holding
    sendToHolding: function(peg, holdingHoleId) {
        peg.holeId = holdingHoleId;
        peg.holeType = 'holding';
        peg.onFasttrack = false;
        peg.passedOriginOnce = false;
        peg.inBullseye = false;
    }
};

// ============================================================
// MOVE SUBSTRATE: Move Definitions and Validation
// ============================================================

const MoveSubstrate = {
    version: '1.0.0',
    
    // Move types
    types: {
        ENTER: 'enter',           // From holding to board
        MOVE: 'move',             // Regular movement
        SPLIT: 'split',           // Seven split move
        BULLSEYE_EXIT: 'bullseye_exit', // Exit bullseye to fast track
        SKIP: 'skip'              // No legal moves available
    },
    
    // Create a move object
    create: function(type, pegId, fromHoleId, toHoleId, steps = 0, path = []) {
        return {
            type: type,
            pegId: pegId,
            fromHoleId: fromHoleId,
            toHoleId: toHoleId,
            steps: steps,
            path: path,
            timestamp: Date.now(),
            validated: false
        };
    },
    
    // Validate a move against rules
    validate: function(move, gameState) {
        return RulesSubstrate.validateMove(move, gameState);
    }
};

// ============================================================
// GAME EVENT SUBSTRATE: Event System
// ============================================================

const GameEventSubstrate = {
    version: '1.0.0',
    
    // Event types
    types: {
        // Turn events
        TURN_START: 'turn_start',
        CARD_DRAWN: 'card_drawn',
        MOVE_EXECUTED: 'move_executed',
        TURN_END: 'turn_end',
        
        // Game events
        GAME_START: 'game_start',
        GAME_OVER: 'game_over',
        
        // Special events
        PEG_ENTERED: 'peg_entered',
        PEG_CUT: 'peg_cut',
        EXTRA_TURN: 'extra_turn',
        FAST_TRACK_USED: 'fast_track',
        BULLSEYE_ENTERED: 'bullseye_entered',
        SAFE_ZONE_ENTERED: 'safe_zone_entered',
        PEG_HOME: 'peg_home'
    },
    
    // Event listeners
    listeners: new Map(),
    
    // Register event listener
    on: function(eventType, callback) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, []);
        }
        this.listeners.get(eventType).push(callback);
    },
    
    // Emit event
    emit: function(eventType, data) {
        const callbacks = this.listeners.get(eventType) || [];
        callbacks.forEach(cb => cb(data));
        
        // Also log for debugging
        console.log(`[GameEvent] ${eventType}:`, data);
    },
    
    // Clear all listeners
    clear: function() {
        this.listeners.clear();
    }
};

// ============================================================
// EXPORTS
// ============================================================

if (typeof window !== 'undefined') {
    window.RulesSubstrate = RulesSubstrate;
    window.BoardSubstrate = BoardSubstrate;
    window.CardSubstrate = CardSubstrate;
    window.PlayerSubstrate = PlayerSubstrate;
    window.PegSubstrate = window.PegSubstrate || _RulesPegSubstrate;
    window.MoveSubstrate = MoveSubstrate;
    window.GameEventSubstrate = GameEventSubstrate;
    
    // Convenience accessor
    window.FastTrackSubstrates = {
        Rules: RulesSubstrate,
        Board: BoardSubstrate,
        Card: CardSubstrate,
        Player: PlayerSubstrate,
        Peg: window.PegSubstrate,
        Move: MoveSubstrate,
        Events: GameEventSubstrate,
        
        // Print all rules
        printRules: function() {
            console.log('=== FASTTRACK OFFICIAL RULES ===\n');
            RulesSubstrate.rules.forEach(rule => {
                console.log(`[${rule.id}] ${rule.name}`);
                console.log(`  Category: ${rule.category}`);
                console.log(`  ${rule.description}`);
                if (rule.details) {
                    rule.details.forEach(d => console.log(`    - ${d}`));
                }
                console.log('');
            });
        }
    };
}

console.log(`FastTrack Rules Substrate loaded: ${RulesSubstrate.rules.size} rules registered`);
