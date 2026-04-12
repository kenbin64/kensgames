/**
 * Fastrack! Game Engine - Single Card Draw Version
 * Based on fastrack_officials_rules_single_card_draw
 * 
 * ============================================================
 * MEANINGFUL HOLE NAMES & DEFINITIVE GAME RULES
 * ============================================================
 * 
 * HOLE TYPES (7 distinct types with meaningful names):
 * ---------------------------------------------------------------
 * 
 * 1. HOLDING HOLES (hold-{playerIdx}-{0-3}) - "Holding Area"
 *    CODE ID: hold-{playerIdx}-{0-3}
 *    COMMON NAME: Holding Area / Holding Holes
 *    COUNT: 4 per player
 *    PURPOSE: 
 *      - Starting position for 4 pegs (1 peg starts on Diamond)
 *      - Vanquished/cut pegs return here
 *      - Pegs waiting to enter play
 *    SAFETY: SAFE - Cannot be cut while in holding
 *    EXIT: Requires A, 6, or Joker to enter play via Diamond Hole
 * 
 * 2. DIAMOND HOLE / STARTING HOLE / WINNER HOLE (home-{playerIdx})
 *    CODE ID: home-{playerIdx}
 *    COMMON NAME: Diamond Hole / Starting Hole / Winner Hole
 *    VISUAL: Has diamond/square marker around it on board
 *    COUNT: 1 per player
 *    DUAL PURPOSE:
 *      a) STARTING: The 5th token begins game here. Entry point from holding.
 *      b) WINNING: The 5th token wins the game by landing here (after 4 are in safe zone)
 *    SAFETY: UNSAFE - Opponents can cut you here
 *    NOTES:
 *      - Own peg on diamond blocks other own pegs from passing (HOME BOUNDARY RULE)
 *      - This is NOT the Safe Zone Entry - that is a separate hole in front of Safe Zone
 *      - 5th token (after 4 in safe zone) goes LEFT from Safe Zone Entry to land here
 * 
 * 3. SAFE ZONE ENTRY HOLE (outer-{playerIdx}-2)
 *    CODE ID: outer-{playerIdx}-2
 *    COMMON NAME: Safe Zone Entry / Gateway to Safe Zone
 *    VISUAL: The hole directly in front of safe-{playerIdx}-1
 *    COUNT: 1 per player (specific outer track hole)
 *    PURPOSE:
 *      - The penultimate hole before entering the safe zone
 *      - ALL tokens must touch this hole (from left or right side) to count as
 *        having traversed the entire perimeter
 *      - Marks "circuit completion" - eligible for safe zone after passing here
 *    FLOW:
 *      - Tokens arrive via side-right track after exiting FastTrack
 *      - From here: Enter Safe Zone (holes 1-4) if eligible
 *      - 5th Token: After 4 pegs fill safe zone, passes Safe Zone Entry to the 
 *        LEFT and proceeds to Diamond/Winner Hole
 *    SAFETY: UNSAFE - Can be cut by opponents
 * 
 * 4. OUTER PERIMETER / TRACK HOLES
 *    A. SIDE-LEFT HOLES (side-left-{playerIdx}-{1-4})
 *       CODE ID: side-left-{playerIdx}-{1-4}
 *       COMMON NAME: Left Side Track
 *       COUNT: 4 per player section
 *       PURPOSE: Path from FastTrack Entry toward outer edge
 *       FLOW: side-left-1 → side-left-2 → side-left-3 → side-left-4 → outer track
 *    
 *    B. OUTER EDGE HOLES (outer-{playerIdx}-{0-3})
 *       CODE ID: outer-{playerIdx}-{0-3}
 *       COMMON NAME: Outer Track / Outer Edge
 *       COUNT: 4 per player section (along board edge)
 *       SPECIAL: outer-{playerIdx}-2 = SAFE ZONE ENTRY (see #3 above)
 *       PURPOSE: Main circular track around board perimeter
 *    
 *    C. SIDE-RIGHT HOLES (side-right-{playerIdx}-{1-4})
 *       CODE ID: side-right-{playerIdx}-{4-1}
 *       COMMON NAME: Right Side Track
 *       COUNT: 4 per player section
 *       PURPOSE: Path from FastTrack Exit toward Safe Zone Entry
 *       FLOW: FT Exit → side-right-4 → side-right-3 → side-right-2 → side-right-1 → Safe Zone Entry
 *    
 *    SAFETY: ALL UNSAFE - Pegs can be cut by opponents landing here
 *    MOVEMENT: Clockwise around board
 * 
 * 5. FASTTRACK HOLES (ft-{playerIdx}) - Inner Ring
 *    CODE ID: ft-{playerIdx}
 *    COUNT: 6 total (1 per player color, forming inner hexagon)
 * 
 *    A. FASTTRACK ENTRY HOLES (ft-{i} where i != playerIdx)
 *       COMMON NAME: FastTrack Entry / Hyperspace Entry
 *       PURPOSE: Shortcut entry points - any FT hole NOT matching player's color
 *       COUNT: 5 per player (all FT holes except own color)
 *       ENTRY: From side-left-{i}-4 of that section
 *       NOTES: Traversing FastTrack counts as completing a lap (hyperspace rule)
 * 
 *    B. FASTTRACK EXIT HOLE (ft-{playerIdx})
 *       COMMON NAME: FastTrack Exit / Player's Pentagon
 *       PURPOSE: Exit point from FastTrack to player's playing area
 *       VISUAL: Pentagon shape matching player's token color
 *       COUNT: 1 per player
 *       EXIT BEHAVIOR:
 *         - Default exit from FastTrack traversal to side-right track
 *         - Default exit from Bullseye (via J/Q/K)
 *         - If occupied by same color, exits to previous available FT hole
 *    
 *    SAFETY: UNSAFE - Pegs can be cut on FastTrack
 *    MOVEMENT: Clockwise around inner ring (ft-0 → ft-1 → ft-2 → ... → ft-5)
 * 
 * 6. BULLSEYE / CENTER HOLE (center)
 *    CODE ID: center
 *    COMMON NAME: Bullseye / Center / Dead Center
 *    COUNT: 1 (board center)
 *    LOCATION: Dead center of the board
 *    ENTRY CONDITIONS (2 ways to enter):
 *      a) PENULTIMATE: When ANY ft-* hole is second-to-last step of move
 *      b) BREAK ENTRY: On turn, sitting on ANY ft-* hole, use 1-card (J/Q/K)
 *    SAFETY: SAFE - Cannot be cut while in bullseye
 *    EXIT CONDITIONS:
 *      - ONLY with Royal cards (J, Q, K)
 *      - Exit destination: Own FastTrack Exit Hole (ft-{playerIdx})
 *    STRATEGY: Wait for perfect exit timing or cause traffic jam for opponents
 * 
 * 7. SAFE ZONE HOLES (safe-{playerIdx}-{1-4})
 *    CODE ID: safe-{playerIdx}-{1-4}
 *    COMMON NAME: Safe Zone / Protected Holes / Final Stretch
 *    COUNT: 4 per player
 *    PURPOSE: Final 4 protected holes before winning
 *    ENTRY: Via Safe Zone Entry hole (outer-{playerIdx}-2) after completing circuit
 *    SAFETY: SAFE - Cannot be cut in safe zone
 *    RESTRICTIONS:
 *      - OWNER ONLY: Only the owning player's pegs can enter
 *      - FORWARD ONLY: Can only move toward end, never backward
 *      - EXACT LANDING: Must land exactly to proceed (no overshooting)
 *    WIN CONDITION: Fill all 4 safe zone holes, then 5th peg bypasses safe zone
 *                   and lands on Diamond Hole to win
 * 
 * ============================================================
 * CARD BEHAVIORS
 * ============================================================
 * 
 * ENTRY CARDS (can bring peg from holding to home hole):
 * - Ace (A): Enter OR move 1 space clockwise. EXTRA TURN.
 * - Six (6): Enter with 0 moves OR move 6 spaces. EXTRA TURN.
 * - Joker: Enter OR move 1 space clockwise. EXTRA TURN.
 * 
 * ROYAL CARDS (can exit bullseye to FastTrack):
 * - Jack (J): Move 1 space. Exit bullseye allowed. EXTRA TURN.
 * - Queen (Q): Move 1 space. Exit bullseye allowed. EXTRA TURN.
 * - King (K): Move 1 space. Exit bullseye allowed. EXTRA TURN.
 * 
 * NUMBER CARDS (standard clockwise movement):
 * - Two (2): Move 2 spaces clockwise.
 * - Three (3): Move 3 spaces clockwise.
 * - Five (5): Move 5 spaces clockwise.
 * - Eight (8): Move 8 spaces clockwise.
 * - Nine (9): Move 9 spaces clockwise.
 * - Ten (10): Move 10 spaces clockwise.
 * 
 * SPECIAL CARDS:
 * - Four (4): Move 4 spaces BACKWARD (counter-clockwise).
 *   RESTRICTIONS: Cannot enter FastTrack, Bullseye, Safe Zone, or Home.
 * - Seven (7): Move 7 spaces OR split between 2 pegs (e.g., 3+4).
 *   Must use all 7 moves. No extra turn.
 * 
 * EXTRA TURN CARDS: A, 6, J, Q, K, Joker
 * 
 * ============================================================
 * MOVEMENT RULES
 * ============================================================
 * 
 * 1. DIRECTION: All movement is clockwise except 4 (backward).
 * 2. BLOCKING: Cannot pass or land on own peg.
 * 3. CUTTING: Landing on opponent's peg sends them to holding.
 * 4. CUT PREVENTION: If opponent has no room in holding (4 full + home occupied),
 *    the move that would cut them is BLOCKED and not legal.
 * 5. EXACT LANDING: Safe zone and home require exact count.
 * 6. CIRCUIT REQUIREMENT: Must pass home once before entering safe zone.
 * 
 * ============================================================
 * WIN CONDITION
 * ============================================================
 * 
 * Player wins when:
 * - 4 pegs occupy safe zone holes (safe-{idx}-1 through safe-{idx}-4)
 * - 5th peg has COMPLETED CIRCUIT and landed on home hole
 * - Circuit completion = peg traveled from home → around board → safe zone → home
 */

// ============================================================
// SUBSTRATE LINKAGE
// ============================================================

// Card definitions - uses CardSubstrate when available, otherwise fallback
// CANONICAL CARD DEFINITIONS - All behaviors explicit and unambiguous
const CARD_TYPES = (typeof CardSubstrate !== 'undefined') 
    ? CardSubstrate.cards 
    : {
        // ============================================================
        // ENTRY CARDS: Can bring peg from holding to home hole
        // ============================================================
        ACE: { 
            rank: 'A', 
            value: 1, 
            type: 'entry',
            movement: 1,                    // Moves 1 space when moving (not entering)
            direction: 'clockwise',
            extraTurn: true,                // Draw again after play
            canEnterFromHolding: true,      // Can bring peg out of holding
            canExitBullseye: false,         // Cannot exit bullseye (only J, Q, K can)
            description: 'Enter from holding OR move 1 clockwise. Extra turn.'
        },
        JOKER: {
            rank: 'JOKER',
            value: 0,
            type: 'wild',
            movement: 1,                    // Moves 1 space clockwise when on board
            direction: 'clockwise',         // Standard play: clockwise only
            extraTurn: true,
            canEnterFromHolding: true,
            canExitBullseye: false,         // Cannot exit bullseye (only J, Q, K can)
            // NOTE (house rules): canMoveBackward removed from basic play.
            // To restore: add canMoveBackward:true, backwardRequiresOpponent:true,
            // cannotBackwardInto:['home','safezone','fasttrack','center']
            description: 'Enter from holding OR move 1 space clockwise. Extra turn.'
        },
        SIX: { 
            rank: '6', 
            value: 6, 
            type: 'entry_movement',
            movement: 6,                    // Moves 6 spaces when moving on board
            enterMovement: 0,               // Moves 0 spaces when entering (just places on home)
            direction: 'clockwise',
            extraTurn: true,
            canEnterFromHolding: true,
            canExitBullseye: false,
            description: 'Enter from holding (0 moves) OR move 6 spaces. Extra turn.'
        },
        
        // ============================================================
        // ROYAL CARDS: Can exit bullseye to FastTrack. NO entry from holding.
        // ============================================================
        KING: { 
            rank: 'K', 
            value: 13, 
            type: 'royal',
            movement: 1,
            direction: 'clockwise',
            extraTurn: true,
            canEnterFromHolding: false,     // Cannot enter from holding
            canExitBullseye: true,          // Can exit bullseye to FastTrack
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
            isRoyal: true,
            description: 'Move 1 clockwise. Can exit bullseye. Extra turn.'
        },
        JACK: { 
            rank: 'J', 
            value: 11, 
            type: 'royal',
            movement: 1,
            direction: 'clockwise',
            extraTurn: true,
            canEnterFromHolding: false,
            canExitBullseye: true,
            isRoyal: true,
            description: 'Move 1 clockwise. Can exit bullseye. Extra turn.'
        },
        
        // ============================================================
        // NUMBER CARDS: Standard clockwise movement. No special abilities.
        // ============================================================
        TEN: { 
            rank: '10', 
            value: 10, 
            type: 'number',
            movement: 10,
            direction: 'clockwise',
            extraTurn: false,
            canEnterFromHolding: false,
            canExitBullseye: false,
            description: 'Move 10 spaces clockwise.'
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
            description: 'Move 9 spaces clockwise.'
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
            description: 'Move 8 spaces clockwise.'
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
            description: 'Move 5 spaces clockwise.'
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
            description: 'Move 3 spaces clockwise.'
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
            description: 'Move 2 spaces clockwise.'
        },
        
        // ============================================================
        // SPECIAL CARDS: Unique movement behaviors
        // ============================================================
        SEVEN: { 
            rank: '7', 
            value: 7, 
            type: 'wild',
            movement: 7,
            direction: 'clockwise',
            extraTurn: false,
            canEnterFromHolding: false,
            canExitBullseye: false,
            canSplit: false,                // No longer splits - it's a wild card
            isWild: true,                   // Wild card - can move 1-7 spaces
            description: '🎲 Wild Card: Move any token 1-7 spaces.'
        },
        FOUR: { 
            rank: '4', 
            value: 4, 
            type: 'backward',
            movement: 4,
            direction: 'backward',          // Counter-clockwise movement
            extraTurn: false,
            canEnterFromHolding: false,
            canExitBullseye: false,
            // BACKWARD MOVEMENT RESTRICTIONS:
            // A peg moving backward (counter-clockwise) CANNOT enter:
            //   - Bullseye (center hole)
            //   - Safe zone (safe-* holes)
            // A peg CAN move backward through:
            //   - FastTrack holes (ft-* holes) — they are perimeter corners, peg stays on outer track
            //   - Home holes (home-* holes) on the perimeter
            // If 4 brings a peg to (or past) the safe zone entrance going counter-clockwise,
            // that DOES satisfy the circuit completion requirement (eligible for safe zone next forward move).
            cannotEnterFastTrack: false,    // CAN land on ft-* holes, just stays on outer track
            cannotEnterCenter: true,        // Cannot back into Bullseye
            cannotEnterSafeZone: true,      // Cannot back into Safe Zone
            cannotEnterWinner: false,       // CAN move backward through home holes on perimeter
            description: 'Move 4 spaces BACKWARD. Cannot enter FastTrack, Bullseye, or Safe Zone.'
        }
    };

// Suits - uses CardSubstrate when available
const SUITS = (typeof CardSubstrate !== 'undefined')
    ? CardSubstrate.suits
    : ['hearts', 'diamonds', 'clubs', 'spades'];

// ============================================================
// HOLE TYPES - Definitive definitions for game engine decisions
// ============================================================

const HOLE_TYPES = {
    // HOLDING: Pegs waiting to enter play (Holding Area)
    HOLDING: {
        id: 'holding',
        meaningfulName: 'Holding Area',
        pattern: /^hold-(\d)-(\d)$/,           // hold-{playerIdx}-{0-3}
        canBeCut: false,                        // Safe from cuts
        canEnterFrom: [],                       // Cannot move into (only sent home)
        canExitTo: ['home'],                    // Exit via entry cards to Diamond Hole
        ownerOnly: true,                        // Only owner's pegs here
        description: 'Holding Area - Starting area for pegs. Safe from cuts. Exit with A/6/Joker.'
    },
    
    // HOME: Diamond Hole - Starting position AND final win destination
    // NOTE: This is NOT Safe Zone Entry - that is outer-{p}-2
    HOME: {
        id: 'home',
        meaningfulName: 'Diamond Hole',
        altNames: ['Starting Hole', 'Winner Hole'],
        pattern: /^home-(\d)$/,                 // home-{playerIdx}
        canBeCut: true,                         // Opponent can cut you here
        canEnterFrom: ['holding', 'safezone'],  // From holding (entry) or safezone (win)
        canExitTo: ['outer', 'side-left', 'side-right'], // Continue on outer track
        ownerOnly: false,                       // Opponents CAN land here (and cut)
        isEntry: true,                          // Entry point from holding (5th token starts here)
        isWinPosition: true,                    // Final position (5th peg wins here after 4 in safe zone)
        description: 'Diamond Hole - 5th token starts here. 5th token wins here (after 4 in safe zone).'
    },
    
    // OUTER: Main track around the board (Outer Perimeter)
    // Includes: side-left, outer, side-right holes
    // SPECIAL: outer-{playerIdx}-2 = Safe Zone Entry hole
    OUTER: {
        id: 'outer',
        meaningfulName: 'Outer Perimeter',
        hasSafeZoneEntry: true,                 // outer-{p}-2 is Safe Zone Entry
        pattern: /^(outer|side-left|side-right)-(\d)-(\d)$/,
        canBeCut: true,                         // Unsafe - can be cut
        canEnterFrom: ['home', 'outer', 'side-left', 'side-right', 'fasttrack'],
        canExitTo: ['outer', 'side-left', 'side-right', 'safezone', 'fasttrack'],
        ownerOnly: false,
        description: 'Outer Perimeter - Main circular track. Includes Left Track, Outer Track, Right Track.'
    },
    
    // FASTTRACK: Inner ring shortcut (Hyperspace)
    // Includes both Entry holes (other colors) and Exit hole (own color pentagon)
    FASTTRACK: {
        id: 'fasttrack',
        meaningfulName: 'FastTrack',
        altNames: ['Hyperspace', 'Inner Ring'],
        pattern: /^ft-(\d)$/,                   // ft-{playerIdx}
        canBeCut: true,                         // Unsafe - can be cut
        canEnterFrom: ['center', 'side-left'],  // From Bullseye exit or side track
        canExitTo: ['fasttrack', 'side-right', 'center'], // Around ring, out, or to Bullseye
        ownerOnly: false,
        requiresEntry: true,                    // Must enter via specific paths
        hasEntryAndExit: true,                  // FT Entry (other colors) vs FT Exit (own color pentagon)
        description: 'FastTrack - Inner ring shortcut. Entry holes (other colors) vs Exit hole (own pentagon).'
    },
    
    // CENTER/BULLSEYE: Center hole
    CENTER: {
        id: 'center',
        meaningfulName: 'Bullseye',
        altNames: ['Center Hole', 'Dead Center'],
        pattern: /^center$/,
        canBeCut: true,                         // Can be cut by another player entering bullseye
        canEnterFrom: ['fasttrack'],            // Only when exactly 1 past FT exit
        canExitTo: ['fasttrack'],               // Exit to own FT Exit hole only
        ownerOnly: false,
        requiresRoyalToExit: true,              // ONLY J/Q/K can exit
        description: 'Bullseye - Center hole. Can be cut. Exit with J/Q/K to own FT Exit.'
    },
    
    // SAFEZONE: Final stretch before winning
    SAFEZONE: {
        id: 'safezone',
        meaningfulName: 'Safe Zone',
        altNames: ['Protected Holes', 'Final Stretch'],
        pattern: /^safe-(\d)-(\d)$/,            // safe-{playerIdx}-{1-4}
        canBeCut: false,                        // Safe from cuts
        canEnterFrom: ['outer', 'safezone'],    // From Safe Zone Entry (outer-{p}-2) or within Safe Zone
        canExitTo: ['safezone'],                // Forward only within safe zone (4 pegs fill it)
        ownerOnly: true,                        // ONLY owner's pegs allowed
        forwardOnlyMovement: true,              // Cannot move backward
        exactLandingRequired: true,             // Must land exactly
        description: 'Safe Zone - 4 protected holes. Enter via Safe Zone Entry (outer-{p}-2). Owner only.'
    }
};

// Helper function to determine hole type from hole ID
function getHoleTypeFromId(holeId) {
    if (!holeId) return null;
    
    if (holeId === 'center') return HOLE_TYPES.CENTER;
    if (holeId.startsWith('hold-')) return HOLE_TYPES.HOLDING;
    if (holeId.startsWith('home-')) return HOLE_TYPES.HOME;
    if (holeId.startsWith('ft-')) return HOLE_TYPES.FASTTRACK;
    if (holeId.startsWith('safe-')) return HOLE_TYPES.SAFEZONE;
    if (holeId.startsWith('outer-') || holeId.startsWith('side-')) return HOLE_TYPES.OUTER;
    
    return null;
}

// ============================================================
// MEANINGFUL HOLE NAMES - Human-readable names for each hole
// ============================================================
// Use these names for tooltips, UI displays, and move descriptions

const HOLE_NAMES = {
    // Holding Area (4 per player)
    // Pattern: hold-{playerIdx}-{0-3}
    holding: {
        shortName: 'Holding',
        fullName: 'Holding Area',
        description: 'Starting/vanquished peg storage',
        emoji: '🏠'
    },
    
    // Diamond/Starting/Winner Hole (1 per player)
    // Pattern: home-{playerIdx}
    // NOTE: This is NOT the Safe Zone Entry - that is outer-{p}-2
    home: {
        shortName: 'Home Hole',
        fullName: 'Home Hole',
        altNames: ['Starting Hole', 'Winner Hole', 'Diamond Hole'],
        description: 'Entry point from holding AND the winning position for the 5th peg',
        emoji: '💎'
    },
    
    // Safe Zone Entry Hole (1 per player - specific outer track hole)
    // Pattern: outer-{playerIdx}-2
    // This is the penultimate hole before entering safe zone
    safeZoneEntry: {
        shortName: 'Safe Zone Gateway',
        fullName: 'Safe Zone Gateway',
        altNames: ['Gateway', 'Circuit Finish'],
        description: 'Turn-off point into your safe zone after completing a circuit',
        emoji: '🚪'
    },
    
    // Outer Perimeter - Side Left (4 per player section)
    // Pattern: side-left-{playerIdx}-{1-4}
    sideLeft: {
        shortName: 'Perimeter',
        fullName: 'Perimeter Track',
        description: 'Part of the outer track pegs travel clockwise around',
        emoji: '⬅️'
    },
    
    // Outer Perimeter - Outer Edge (4 per player section)
    // Pattern: outer-{playerIdx}-{0-3}
    // SPECIAL: outer-{playerIdx}-2 = Safe Zone Entry (see safeZoneEntry above)
    outer: {
        shortName: 'Perimeter',
        fullName: 'Perimeter Track',
        description: 'The main track pegs travel clockwise around the board',
        emoji: '🔵'
    },
    
    // Outer Perimeter - Side Right (4 per player section)
    // Pattern: side-right-{playerIdx}-{4-1}
    // Flow: FT Exit → side-right-4 → 3 → 2 → 1 → Safe Zone Entry
    sideRight: {
        shortName: 'Perimeter',
        fullName: 'Perimeter Track',
        description: 'Part of the outer track pegs travel clockwise around',
        emoji: '➡️'
    },
    
    // FastTrack Entry Holes (5 per player - all FT except own color)
    // Pattern: ft-{i} where i != playerBoardPosition
    ftEntry: {
        shortName: 'FastTrack Corner',
        fullName: 'FastTrack Corner',
        altNames: ['Hyperspace Entry'],
        description: 'Land here exactly to take the FastTrack shortcut across the board',
        emoji: '🚀'
    },
    
    // FastTrack Exit Hole (1 per player - own color pentagon)
    // Pattern: ft-{playerBoardPosition}
    ftExit: {
        shortName: 'Your FastTrack Exit',
        fullName: 'Your FastTrack Exit',
        altNames: ['Player Pentagon', 'Color Pentagon'],
        description: 'Your exit from the FastTrack back to your section of the board',
        emoji: '🎯'
    },
    
    // Bullseye/Center Hole (1 total)
    // Pattern: center
    center: {
        shortName: 'Bullseye',
        fullName: 'The Bullseye',
        altNames: ['Center'],
        description: 'Safe spot in the middle of the board — exit with a J, Q, or K',
        emoji: '🎯'
    },
    
    // Safe Zone Holes (4 per player)
    // Pattern: safe-{playerIdx}-{1-4}
    safezone: {
        shortName: 'Safe Zone',
        fullName: 'Safe Zone',
        altNames: ['Protected Holes', 'Final Stretch'],
        description: 'Protected holes only you can use — fill all 4 then land your 5th peg on your home hole to win',
        emoji: '🛡️'
    }
};

/**
 * Get the meaningful name for a hole ID
 * @param {string} holeId - The hole ID (e.g., 'home-0', 'ft-2', 'safe-1-3')
 * @param {number} playerBoardPosition - Current player's board position (for FT entry/exit distinction)
 * @param {string} format - 'short', 'full', or 'emoji' (default: 'short')
 * @returns {string} Human-readable hole name
 */
function getHoleMeaningfulName(holeId, playerBoardPosition = null, format = 'short') {
    if (!holeId) return 'Unknown';
    
    // Bullseye/Center
    if (holeId === 'center') {
        return format === 'emoji' ? HOLE_NAMES.center.emoji :
               format === 'full' ? HOLE_NAMES.center.fullName :
               HOLE_NAMES.center.shortName;
    }
    
    // Holding holes
    if (holeId.startsWith('hold-')) {
        const match = holeId.match(/hold-(\d)-(\d)/);
        if (match) {
            const slotNum = parseInt(match[2]) + 1; // Make 1-indexed
            const name = format === 'full' ? `${HOLE_NAMES.holding.fullName} #${slotNum}` :
                        format === 'emoji' ? HOLE_NAMES.holding.emoji :
                        `${HOLE_NAMES.holding.shortName} ${slotNum}`;
            return name;
        }
        return HOLE_NAMES.holding.shortName;
    }
    
    // Diamond/Home holes — include owner name
    if (holeId.startsWith('home-')) {
        const bp = parseInt(holeId.split('-')[1]);
        const COLOR_NAMES_GE = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];
        const ownerName = COLOR_NAMES_GE[bp] || 'Player';
        return format === 'emoji' ? HOLE_NAMES.home.emoji :
               format === 'full' ? `${ownerName}'s ${HOLE_NAMES.home.fullName}` :
               `${ownerName}'s ${HOLE_NAMES.home.shortName}`;
    }
    
    // FastTrack holes - distinguish entry vs exit based on player's board position
    if (holeId.startsWith('ft-')) {
        const ftIdx = parseInt(holeId.replace('ft-', ''));
        const isOwnFt = playerBoardPosition !== null && ftIdx === playerBoardPosition;
        
        if (isOwnFt) {
            // This is the player's exit pentagon
            return format === 'emoji' ? HOLE_NAMES.ftExit.emoji :
                   format === 'full' ? HOLE_NAMES.ftExit.fullName :
                   HOLE_NAMES.ftExit.shortName;
        } else {
            // This is an entry point (not the player's color)
            return format === 'emoji' ? HOLE_NAMES.ftEntry.emoji :
                   format === 'full' ? HOLE_NAMES.ftEntry.fullName :
                   HOLE_NAMES.ftEntry.shortName;
        }
    }
    
    // Safe Zone holes
    if (holeId.startsWith('safe-')) {
        const match = holeId.match(/safe-(\d)-(\d)/);
        if (match) {
            const safeNum = match[2];
            const name = format === 'full' ? `${HOLE_NAMES.safezone.fullName} #${safeNum}` :
                        format === 'emoji' ? HOLE_NAMES.safezone.emoji :
                        `Safe ${safeNum}`;
            return name;
        }
        return HOLE_NAMES.safezone.shortName;
    }
    
    // Side-left holes
    if (holeId.startsWith('side-left-')) {
        return format === 'emoji' ? HOLE_NAMES.sideLeft.emoji :
               HOLE_NAMES.sideLeft.shortName;
    }
    
    // Side-right holes
    if (holeId.startsWith('side-right-')) {
        return format === 'emoji' ? HOLE_NAMES.sideRight.emoji :
               HOLE_NAMES.sideRight.shortName;
    }
    
    // Outer track holes
    // SPECIAL: outer-{playerIdx}-2 is the Safe Zone Entry hole for that player
    if (holeId.startsWith('outer-')) {
        const match = holeId.match(/outer-(\d)-(\d)/);
        if (match) {
            const sectionIdx = parseInt(match[1]);
            const outerIdx = parseInt(match[2]);
            
            // Check if this is the Safe Zone Entry hole (outer-{p}-2)
            // It's "own" Safe Zone Entry if sectionIdx matches playerBoardPosition
            const isSafeZoneEntry = outerIdx === 2;
            const isOwnSafeZoneEntry = isSafeZoneEntry && playerBoardPosition !== null && sectionIdx === playerBoardPosition;
            
            if (isSafeZoneEntry) {
                return format === 'emoji' ? HOLE_NAMES.safeZoneEntry.emoji :
                       format === 'full' ? HOLE_NAMES.safeZoneEntry.fullName :
                       HOLE_NAMES.safeZoneEntry.shortName;
            }
            
            return format === 'emoji' ? HOLE_NAMES.outer.emoji :
                   HOLE_NAMES.outer.shortName;
        }
        return HOLE_NAMES.outer.shortName;
    }
    
    return holeId; // Fallback to raw ID
}

/**
 * Get a detailed description of what a hole is and its purpose
 * @param {string} holeId - The hole ID
 * @param {number} playerBoardPosition - Current player's board position
 * @returns {string} Description text
 */
function getHoleDescription(holeId, playerBoardPosition = null) {
    if (!holeId) return '';
    
    if (holeId === 'center') return HOLE_NAMES.center.description;
    if (holeId.startsWith('hold-')) return HOLE_NAMES.holding.description;
    if (holeId.startsWith('home-')) return HOLE_NAMES.home.description;
    if (holeId.startsWith('safe-')) return HOLE_NAMES.safezone.description;
    if (holeId.startsWith('side-left-')) return HOLE_NAMES.sideLeft.description;
    if (holeId.startsWith('side-right-')) return HOLE_NAMES.sideRight.description;
    
    // Check for Safe Zone Entry (outer-{p}-2) before generic outer
    if (holeId.startsWith('outer-')) {
        const match = holeId.match(/outer-(\d)-(\d)/);
        if (match && parseInt(match[2]) === 2) {
            return HOLE_NAMES.safeZoneEntry.description;
        }
        return HOLE_NAMES.outer.description;
    }
    
    if (holeId.startsWith('ft-')) {
        const ftIdx = parseInt(holeId.replace('ft-', ''));
        const isOwnFt = playerBoardPosition !== null && ftIdx === playerBoardPosition;
        return isOwnFt ? HOLE_NAMES.ftExit.description : HOLE_NAMES.ftEntry.description;
    }
    
    return '';
}

// ============================================================
// PLAYER COLORS AND NAMES (matching 3d.html)
// ============================================================

const GAME_RAINBOW_COLORS = [
    0xff0000, // Red (0°)
    0x00ff4a, // Teal (137.5°)  
    0x9400ff, // Violet (275°)
    0xffdf00, // Gold (52.5°)
    0x00d4ff, // Azure (190°)
    0xff008a  // Pink (327.5°)
];

const GAME_PLAYER_NAMES = ['Red', 'Teal', 'Violet', 'Gold', 'Azure', 'Pink'];

// Default player avatars (can be customized in lobby/setup)
const GAME_PLAYER_AVATARS = ['🦊', '🐢', '🦄', '🦁', '🐳', '🦩'];

// ============================================================
// DECK CLASS
// ============================================================

class Deck {
    constructor() {
        this.cards = [];
        this.discardPile = [];
        this.build();
        this.shuffle();
    }

    build() {
        this.cards = [];
        // Add standard 52 cards
        for (const suit of SUITS) {
            for (const [cardName, cardDef] of Object.entries(CARD_TYPES)) {
                if (cardName !== 'JOKER') {
                    this.cards.push({
                        ...cardDef,
                        suit: suit,
                        id: `${cardDef.rank}_${suit}`
                    });
                }
            }
        }
        // Add 2 jokers
        this.cards.push({ ...CARD_TYPES.JOKER, suit: 'red', id: 'JOKER_red' });
        this.cards.push({ ...CARD_TYPES.JOKER, suit: 'black', id: 'JOKER_black' });
    }

    // Single Fisher-Yates shuffle pass with crypto-random values
    _fisherYatesShuffle() {
        const len = this.cards.length;
        const cryptoArray = new Uint32Array(len);
        crypto.getRandomValues(cryptoArray);
        
        for (let i = len - 1; i > 0; i--) {
            const j = cryptoArray[i] % (i + 1);
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    // Random cut - split deck at random point and swap halves
    _randomCut() {
        const len = this.cards.length;
        if (len < 2) return;
        
        // Generate random cut point (between 10% and 90% of deck)
        const cryptoArray = new Uint32Array(1);
        crypto.getRandomValues(cryptoArray);
        const minCut = Math.floor(len * 0.1);
        const maxCut = Math.floor(len * 0.9);
        const cutPoint = minCut + (cryptoArray[0] % (maxCut - minCut));
        
        // Split and swap halves
        const topHalf = this.cards.slice(0, cutPoint);
        const bottomHalf = this.cards.slice(cutPoint);
        this.cards = [...bottomHalf, ...topHalf];
    }

    // Full shuffle: 3+ Fisher-Yates passes + random cut (casino-style)
    shuffle() {
        // Shuffle 3-5 times (randomized for extra unpredictability)
        const cryptoArray = new Uint32Array(1);
        crypto.getRandomValues(cryptoArray);
        const shuffleCount = 3 + (cryptoArray[0] % 3); // 3, 4, or 5 shuffles
        
        for (let i = 0; i < shuffleCount; i++) {
            this._fisherYatesShuffle();
        }
        
        // Random cut after shuffling
        this._randomCut();
        
        console.log(`Deck shuffled ${shuffleCount}x with crypto random + cut (unique sequence)`);
    }

    draw() {
        if (this.cards.length === 0) {
            // Reshuffle discard pile
            if (this.discardPile.length === 0) {
                console.warn('Deck and discard pile both empty! Rebuilding deck.');
                this.build();
                this.shuffle();
            } else {
                this.cards = [...this.discardPile];
                this.discardPile = [];
                this.shuffle();
                console.log('Deck reshuffled from discard pile');
            }
        }
        const card = this.cards.pop();
        if (!card) {
            console.error('Failed to draw a card!');
            // Return a dummy card to prevent crash - must include direction!
            return { 
                rank: '2', 
                suit: 'spades', 
                movement: 2, 
                name: '2', 
                value: 2, 
                direction: 'clockwise',
                extraTurn: false,
                canEnterFromHolding: false,
                canExitBullseye: false
            };
        }
        return card;
    }

    discard(card) {
        this.discardPile.push(card);
    }

    get remaining() {
        return this.cards.length;
    }
}

// ============================================================
// GAME STATE CLASS
// ============================================================

// Map player index to balanced board position for fewer than 6 players
// This spreads players evenly around the hexagonal board
function getBalancedBoardPosition(playerIdx, playerCount) {
    if (playerCount === 2) {
        return [0, 3][playerIdx];  // Opposite sides
    } else if (playerCount === 3) {
        return [0, 2, 4][playerIdx];  // Every other position
    } else if (playerCount === 4) {
        return [0, 1, 3, 4][playerIdx];  // Skip 2 and 5
    } else {
        return playerIdx;  // 5 or 6 players use all positions
    }
}

class GameState {
    constructor(playerCount = 4) {
        this.playerCount = Math.min(Math.max(playerCount, 2), 6);
        this.currentPlayerIndex = 0;
        this.currentCard = null;
        this.phase = 'waiting'; // waiting, draw, play, animating, gameOver
        this.turnCount = 0;
        this.extraTurnPending = false;
        
        // Player data - each player gets their own deck
        this.players = [];
        for (let i = 0; i < this.playerCount; i++) {
            const boardPos = getBalancedBoardPosition(i, this.playerCount);
            this.players.push({
                index: i,
                boardPosition: boardPos,  // Physical position on board (for hole IDs)
                name: GAME_PLAYER_NAMES[i],
                avatar: GAME_PLAYER_AVATARS[i] || '👤',
                color: GAME_RAINBOW_COLORS[boardPos],  // Use boardPos for color to match visual
                colorHex: '#' + GAME_RAINBOW_COLORS[boardPos].toString(16).padStart(6, '0'),
                deck: new Deck(), // Each player has their own deck
                peg: [],
                pegsInHolding: 4,
                pegsOnBoard: 1,  // 5th peg starts on home hole
                pegsInSafeZone: 0,
                pegAtHome: false,
                hasWon: false
            });
        }
        
        this.winner = null;
        this.moveHistory = [];
        
        // Callbacks for UI updates
        this.onStateChange = null;
        this.onCardDrawn = null;
        this.onLegalMovesCalculated = null;
        this.onMoveExecuted = null;
        this.onTurnEnd = null;
        this.onGameOver = null;
    }

    get currentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    // Get current player's deck (each player has their own)
    get deck() {
        return this.currentPlayer ? this.currentPlayer.deck : this.players[0].deck;
    }

    // Initialize peg positions from board registry
    initializeFromBoard(pegRegistry) {
        pegRegistry.forEach((peg, id) => {
            // Only initialize pegs for players in this game
            if (peg.playerIndex >= this.playerCount) {
                return; // Skip pegs for players not in this game
            }
            
            const player = this.players[peg.playerIndex];
            if (!player) {
                console.warn('Player not found for peg:', id, 'playerIndex:', peg.playerIndex);
                return;
            }
            
            // Get hole from registry to determine type - NORMALIZE the type
            const holeId = peg.currentHole || peg.holeId;
            const hole = holeRegistry.get(holeId);
            // Use normalized type from getHoleTypeFromId for consistency
            const normalizedType = getHoleTypeFromId(holeId);
            const holeType = normalizedType ? normalizedType.id : (hole ? hole.type : 'holding');
            
            player.peg.push({
                id: id,
                holeId: holeId,
                holeType: holeType,
                onFasttrack: false,
                passedOriginFasttrack: false,
                inBullseye: false,
                hasExitedBullseye: false, // Once true, peg cannot re-enter bullseye
                completedCircuit: false,  // Track if peg has completed the circuit
                eligibleForSafeZone: false, // Track if peg has gone around board and can enter safe zone
                lockedToSafeZone: false, // Once true, peg MUST enter safe zone (cannot continue on outer track)
                fasttrackEntryTurn: null, // Turn when peg entered FastTrack (for bullseye timing)
                fasttrackEntryHole: null, // Which ft-* hole the peg entered FastTrack from
                mustExitFasttrack: false, // Flag set when token must exit FastTrack next turn
                inHomeStretch: false, // True once peg lands on OWN ft-X hole (can only go forward to safe zone)
                mesh: peg.mesh
            });
        });
        
        console.log('Pegs initialized for', this.playerCount, 'players');
    }

    // Check if a player can receive another cut peg (has room in holding or home)
    canReceiveCutPeg(player) {
        // Count pegs already in holding holes (0-3)
        // Use boardPosition to match actual hole IDs on the board
        const boardPos = player.boardPosition;
        let holdingCount = 0;
        for (let i = 0; i < 4; i++) {
            const holdHoleId = `hold-${boardPos}-${i}`;
            const isOccupied = player.peg.some(p => p.holeId === holdHoleId);
            if (isOccupied) holdingCount++;
        }
        
        // If holding holes not full, can receive
        if (holdingCount < 4) return true;
        
        // Check if home hole is available (fallback when holding is full)
        const homeHoleId = `home-${boardPos}`;
        const homeOccupied = player.peg.some(p => p.holeId === homeHoleId);
        
        // If home hole is also occupied, cannot receive cut peg
        return !homeOccupied;
    }

    // Start the game
    start() {
        this.phase = 'draw';
        this.turnCount = 1;
        console.log(`Game started with ${this.playerCount} players`);
        console.log(`${this.currentPlayer.name}'s turn`);
        this.notifyStateChange();
    }

    // Draw a card
    drawCard() {
        console.log(`[GameState.drawCard] Called - phase: ${this.phase}, currentPlayer: ${this.currentPlayer?.name}`);
        if (this.phase !== 'draw') {
            console.warn('Cannot draw card - not in draw phase');
            return null;
        }

        this.currentCard = this.deck.draw();
        console.log(`[GameState.drawCard] Card drawn: ${this.currentCard?.rank} of ${this.currentCard?.suit}`);
        console.log(`[GameState.drawCard] Card properties:`, {
            rank: this.currentCard.rank,
            isWild: this.currentCard.isWild,
            canSplit: this.currentCard.canSplit,
            movement: this.currentCard.movement,
            type: this.currentCard.type
        });
        console.log(`${this.currentPlayer.name} drew: ${this.currentCard.rank} of ${this.currentCard.suit}`);
        
        // FASTTRACK LOSS: Drawing a 4 card causes ALL pegs on FastTrack (ALL players) to lose FT status.
        // They must exit to the outer track on subsequent turns.
        if (this.currentCard.rank === '4') {
            for (const player of this.players) {
                for (const peg of player.peg) {
                    if (peg.onFasttrack) {
                        peg.mustExitFasttrack = true;
                        console.log(`⚠️ [4-CARD FT LOSS] Peg ${peg.id} (${player.name}) must exit FastTrack (4 card drawn by ${this.currentPlayer.name})`);
                    }
                }
            }
        }
        
        // Reset per-turn FT traversal tracking
        // Used by endTurn to enforce "must traverse FT if you have FT pegs" rule
        this.ftTraversedThisTurn = false;
        this.madeMoveSinceLastDraw = false;
        
        this.phase = 'play';
        
        if (this.onCardDrawn) {
            console.log('[GameState.drawCard] Calling onCardDrawn callback with:', this.currentCard);
            this.onCardDrawn(this.currentCard);
        } else {
            console.warn('[GameState.drawCard] onCardDrawn callback not set!');
        }
        
        return this.currentCard;
    }

    // Calculate legal moves for current card and player
    calculateLegalMoves() {
        if (!this.currentCard || this.phase !== 'play') {
            return [];
        }

        // ── SmartPeg: Audit state before calculating to fix any corruption ──
        if (window.gameManager && typeof window.gameManager.auditState === 'function') {
            window.gameManager.auditState(this);
        }

        const player = this.currentPlayer;
        const card = this.currentCard;
        let legalMoves = [];
        
        // Track per-peg results for debugging
        const pegResults = {};
        
        console.log(`[LegalMoves] Player ${player.index}, Card: ${card.rank}, canEnterFromHolding: ${card.canEnterFromHolding}, pegsInHolding: ${player.pegsInHolding}`);
        console.log(`[LegalMoves] Player pegs:`, player.peg.map(p => ({ id: p.id, holeType: p.holeType, holeId: p.holeId })));

        // Use boardPosition for all hole ID lookups
        const boardPos = player.boardPosition;

        // Check if card can bring peg out of holding
        if (card.canEnterFromHolding && player.pegsInHolding > 0) {
            // Find the player's home hole
            const homeHoleId = `home-${boardPos}`;
            const homeHole = holeRegistry.get(homeHoleId);
            const isOccupied = this.isPegOnHole(homeHoleId, player.index);
            
            console.log(`[LegalMoves] Home hole check: homeHole=${!!homeHole}, isOccupied=${isOccupied}`);
            
            if (homeHole && !isOccupied) {
                // Find a peg in holding
                const holdingPeg = player.peg.find(p => p.holeType === 'holding');
                console.log(`[LegalMoves] Found holding peg:`, holdingPeg ? holdingPeg.id : 'NONE');
                if (holdingPeg) {
                    legalMoves.push({
                        type: 'enter',
                        pegId: holdingPeg.id,
                        fromHoleId: holdingPeg.holeId,
                        toHoleId: homeHoleId,
                        steps: 0,
                        path: [holdingPeg.holeId, homeHoleId], // Direct path for enter
                        description: `🚀 Escape Holding Area`
                    });
                }
            }
        }

        // Calculate moves for pegs on the board
        for (const peg of player.peg) {
            pegResults[peg.id] = { 
                holeId: peg.holeId, 
                holeType: peg.holeType,
                skipped: false, 
                skipReason: null,
                destinationsCount: 0,
                movesAdded: 0,
                blockedMoves: 0
            };
            
            console.log(`[LegalMoves] Checking peg ${peg.id}: holeType=${peg.holeType}, holeId=${peg.holeId}, completedCircuit=${peg.completedCircuit}`);
            
            if (peg.holeType === 'holding') {
                pegResults[peg.id].skipped = true;
                pegResults[peg.id].skipReason = 'in holding';
                console.log(`[LegalMoves] Skipping ${peg.id} - in holding`);
                continue;
            }
            if (peg.holeType === 'home' && peg.completedCircuit) {
                pegResults[peg.id].skipped = true;
                pegResults[peg.id].skipReason = 'finished (completedCircuit=true)';
                console.log(`[LegalMoves] Skipping ${peg.id} - finished peg on home with completedCircuit=true`);
                continue; // Already finished (on home after circuit)
            }
            
            // Peg on home hole but not finished - should be able to move
            if (peg.holeType === 'home') {
                console.log(`🏠 [LegalMoves] Peg ${peg.id} is on HOME HOLE and CAN move! (completedCircuit=${peg.completedCircuit})`);
                console.log(`🏠 [LegalMoves] Will now calculate destinations for home peg with card movement=${card.movement}`);
                console.log(`🏠 [LegalMoves] Peg inBullseye flag: ${peg.inBullseye}`);
            }
            
            // BUG FIX: If peg is on home but has inBullseye=true, that's a corrupted state - fix it
            if (peg.holeType === 'home' && peg.inBullseye) {
                console.warn(`🔧 [AUTO-FIX] Peg ${peg.id} on HOME has inBullseye=true - clearing corrupt flag`);
                peg.inBullseye = false;
            }
            
            // BUG FIX: If peg is on home with lockedToSafeZone=true but completedCircuit=false,
            // check if it's actually eligible. If not eligible, clear the lock.
            // This handles cases where a peg entered from holding and was incorrectly flagged.
            if (peg.holeType === 'home' && peg.lockedToSafeZone && !peg.completedCircuit) {
                // A peg that JUST entered from holding should NOT be locked
                // Only pegs that have completed a lap should be locked
                if (!peg.eligibleForSafeZone) {
                    console.warn(`🔧 [AUTO-FIX] Peg ${peg.id} on HOME has lockedToSafeZone=true but NOT eligible - clearing corrupt flag`);
                    peg.lockedToSafeZone = false;
                } else {
                    console.log(`🔒 [LegalMoves] Peg ${peg.id} on HOME is LOCKED to safe zone (eligibleForSafeZone=${peg.eligibleForSafeZone})`);
                }
            }
            
            // Special case: peg in bullseye (center hole)
            // RULE: Can ONLY exit bullseye with cards that have canExitBullseye === true
            // These are: J, Q, K (royal cards only - NOT Ace, NOT Joker)
            // EXIT PLACEMENT: Normally exits to your own ft-* hole (ft-{boardPos})
            // BUT if your own peg is there, you're placed on the PREVIOUS ft-* hole without your peg
            if (peg.inBullseye) {
                if (card.canExitBullseye === true) {
                    // Find the exit hole - start with player's own ft-* hole
                    let exitHoleId = `ft-${boardPos}`;
                    
                    // Check if our own peg is blocking the preferred exit
                    const ownPegOnExit = player.peg.find(p => p.holeId === exitHoleId && p.id !== peg.id);
                    
                    if (ownPegOnExit) {
                        // Own peg is blocking - find previous ft-* hole without our peg
                        // Go counter-clockwise (backward) to find available ft-* hole
                        console.log(`[LegalMoves] Own peg blocking ${exitHoleId}, finding previous ft-* hole`);
                        let foundExit = false;
                        for (let i = 1; i < 6; i++) {
                            const prevIdx = (boardPos - i + 6) % 6;
                            const prevFtId = `ft-${prevIdx}`;
                            const ownPegOnPrev = player.peg.find(p => p.holeId === prevFtId && p.id !== peg.id);
                            if (!ownPegOnPrev) {
                                exitHoleId = prevFtId;
                                foundExit = true;
                                console.log(`[LegalMoves] Using previous ft-* hole: ${exitHoleId}`);
                                break;
                            }
                        }
                        if (!foundExit) {
                            // All ft-* holes have our pegs - can't exit (shouldn't happen in normal play)
                            console.log(`[LegalMoves] No available ft-* hole for bullseye exit`);
                            continue;
                        }
                    }
                    
                    // Check if opponent on exit hole can receive cut
                    let canExit = true;
                    for (const opponent of this.players) {
                        if (opponent.index === player.index) continue;
                        const opponentPeg = opponent.peg.find(p => p.holeId === exitHoleId);
                        if (opponentPeg) {
                            if (!this.canReceiveCutPeg(opponent)) {
                                canExit = false;
                                console.log(`[LegalMoves] Blocked bullseye exit to ${exitHoleId} - opponent cannot receive cut`);
                            }
                            break;
                        }
                    }
                    
                    if (canExit) {
                        legalMoves.push({
                            type: 'bullseye_exit',
                            pegId: peg.id,
                            fromHoleId: 'center',
                            toHoleId: exitHoleId,
                            steps: 0,
                            path: ['center', exitHoleId], // Direct path for bullseye exit
                            description: `🎯 Exit Bullseye`
                        });
                    }
                }
                continue;
            }

            // Calculate regular movement
            const destinations = this.calculateDestinations(peg, card, player);
            pegResults[peg.id].destinationsCount = destinations.length;
            
            // SPECIAL DEBUG for home pegs
            if (peg.holeType === 'home' && !peg.completedCircuit) {
                console.log(`🏠 [LegalMoves] Home peg ${peg.id} got ${destinations.length} destinations:`, destinations.map(d => d.holeId));
            }
            
            // Log all destinations for pegs on track
            console.log(`🔍 [LegalMoves] Peg ${peg.id} at ${peg.holeId}: ${destinations.length} destinations: [${destinations.map(d => d.holeId).join(', ')}]`);
            
            for (const dest of destinations) {
                // Check if landing on opponent - verify opponent can receive cut
                let canMakeMove = true;
                for (const opponent of this.players) {
                    if (opponent.index === player.index) continue;
                    const opponentPeg = opponent.peg.find(p => p.holeId === dest.holeId);
                    if (opponentPeg) {
                        // Opponent is on this hole - check if they can receive the cut
                        if (!this.canReceiveCutPeg(opponent)) {
                            canMakeMove = false;
                            pegResults[peg.id].blockedMoves++;
                            console.log(`[LegalMoves] Blocked move to ${dest.holeId} - opponent ${opponent.name} cannot receive cut (holding+home full)`);
                        }
                        break;
                    }
                }
                
                if (canMakeMove) {
                    pegResults[peg.id].movesAdded++;
                    const moveObj = {
                        type: 'move',
                        pegId: peg.id,
                        fromHoleId: peg.holeId,
                        toHoleId: dest.holeId,
                        steps: dest.steps,
                        path: dest.path,
                        cardDirection: card.direction || 'clockwise', // Pass card direction to UI
                        isBackward: (card.direction === 'backward'),   // Convenience flag for backward (4-card)
                        isFastTrackEntry: dest.isFastTrackEntry || false,  // IMPORTANT: Pass through FastTrack entry flag
                        isCenterOption: dest.isCenterOption || false,      // Pass through bullseye option flag
                        isLeaveFastTrack: dest.isLeaveFastTrack || false,  // Pass through leave-FT flag
                        isForcedFTExit: dest.isForcedFTExit || false,     // Pass through forced FT exit flag
                        description: dest.description || `Move ${dest.steps} spaces`
                    };
                    console.log('📍 [LegalMoves] Adding move:', moveObj.toHoleId, 'isFastTrackEntry:', moveObj.isFastTrackEntry, 'isLeaveFT:', moveObj.isLeaveFastTrack);
                    legalMoves.push(moveObj);
                }
            }
        }
        
        // Log per-peg summary before split card handling
        console.log(`🔎 [LegalMoves] PER-PEG SUMMARY:`);
        for (const [pegId, result] of Object.entries(pegResults)) {
            if (result.skipped) {
                console.log(`   ${pegId}: SKIPPED (${result.skipReason})`);
            } else {
                console.log(`   ${pegId} at ${result.holeId}: ${result.destinationsCount} destinations, ${result.movesAdded} moves added, ${result.blockedMoves} blocked`);
            }
        }

        // ════════════════════════════════════════════════════════════
        // FASTTRACK STATUS LOSS WARNING:
        // If the current player has any pegs on FastTrack, tag all moves
        // for NON-FT pegs with willLoseFTStatus=true so the UI can warn
        // the player. This does NOT prevent the move — the player can
        // choose to lose FT status — but they must see the warning.
        // The actual status loss happens in endTurn() via ftTraversedThisTurn.
        // ════════════════════════════════════════════════════════════
        const ftPegsForCurrentPlayer = player.peg.filter(p => p.onFasttrack);
        if (ftPegsForCurrentPlayer.length > 0) {
            for (const move of legalMoves) {
                // A move is an "FT move" if it involves a peg that is on FT,
                // or if the move itself is a FT entry/traversal/exit
                const movingPeg = player.peg.find(p => p.id === move.pegId);
                const isMovingFTPeg = movingPeg && movingPeg.onFasttrack;
                const isFTRelated = isMovingFTPeg || move.isFastTrackEntry || move.isLeaveFastTrack;
                if (!isFTRelated) {
                    move.willLoseFTStatus = true;
                    console.log(`⚠️ [FT WARNING] Move ${move.pegId} → ${move.toHoleId} tagged willLoseFTStatus=true`);
                }
            }
        }

        // 7-card is SPLIT ONLY — must split 7 moves between exactly 2 pegs
        // Split move generation is handled in 3d.html startSplitMoveMode()
        // calculateLegalMoves returns empty for 7-card; split validation done separately
        if (card.rank === '7') {
            console.log('[LegalMoves] 7 Card (Split) - split handled by board UI, returning empty');
            legalMoves = [];
        }
        
        // ── HOUSE RULES ONLY ── Joker backward-1 move (disabled for standard play)
        // To enable: add canMoveBackward:true to JOKER card definition above.
        // Rule: Joker may move 1 space backward to cut an opponent directly behind.
        /* if (card.canMoveBackward && card.rank === 'JOKER') {
            console.log('[LegalMoves] JOKER - checking for backward moves (requires opponent behind)');
            
            const jokerBackwardMoves = [];
            
            for (const peg of player.peg) {
                // Skip holding, bullseye, and completed pegs
                if (peg.holeType === 'holding') continue;
                if (peg.inBullseye || peg.holeType === 'bullseye') continue;
                if (peg.completedCircuit) continue;
                
                // RESTRICTION: Cannot do backward move FROM these hole types
                const currentHole = holeRegistry.get(peg.holeId);
                if (currentHole) {
                    // Cannot backward from FastTrack, safe zone, starting hole (home), center, or safe zone entrance
                    if (currentHole.type === 'fasttrack') {
                        console.log(`[LegalMoves] JOKER: Cannot move backward FROM FastTrack hole ${peg.holeId}`);
                        continue;
                    }
                    if (currentHole.type === 'safezone') {
                        console.log(`[LegalMoves] JOKER: Cannot move backward FROM safe zone ${peg.holeId}`);
                        continue;
                    }
                    if (currentHole.type === 'home') {
                        console.log(`[LegalMoves] JOKER: Cannot move backward FROM starting hole ${peg.holeId}`);
                        continue;
                    }
                    if (currentHole.type === 'center') {
                        console.log(`[LegalMoves] JOKER: Cannot move backward FROM bullseye ${peg.holeId}`);
                        continue;
                    }
                    // Check if this is a safe zone entrance hole (the hole right before safe zone)
                    if (currentHole.isSafeZoneEntry || peg.holeId === `p${player.boardPosition}-safezone-entry`) {
                        console.log(`[LegalMoves] JOKER: Cannot move backward FROM safe zone entrance ${peg.holeId}`);
                        continue;
                    }
                }
                
                // Get the hole directly behind this peg (1 space backward)
                const backwardDest = this.getBackwardHole(peg, player);
                
                if (!backwardDest) {
                    console.log(`[LegalMoves] JOKER: No backward hole for peg ${peg.id}`);
                    continue;
                }
                
                // Check restrictions - cannot move backward INTO these hole types
                const backwardHole = holeRegistry.get(backwardDest);
                if (!backwardHole) continue;
                
                const restrictedTypes = card.cannotBackwardInto || [];
                if (restrictedTypes.includes(backwardHole.type)) {
                    console.log(`[LegalMoves] JOKER: Cannot move backward INTO ${backwardHole.type} (${backwardDest})`);
                    continue;
                }
                
                // Check if opponent is directly behind (required for backward move)
                let opponentBehind = false;
                for (const opponent of this.players) {
                    if (opponent.index === player.index) continue;
                    const opponentPeg = opponent.peg.find(p => p.holeId === backwardDest);
                    if (opponentPeg) {
                        opponentBehind = true;
                        console.log(`[LegalMoves] JOKER: Opponent peg ${opponentPeg.id} found at ${backwardDest} - backward move allowed!`);
                        break;
                    }
                }
                
                if (opponentBehind) {
                    // Add backward move (will cut the opponent)
                    jokerBackwardMoves.push({
                        type: 'joker_backward',
                        pegId: peg.id,
                        fromHoleId: peg.holeId,
                        toHoleId: backwardDest,
                        steps: -1,
                        path: [peg.holeId, backwardDest],
                        description: '🃏 Joker Backward (Cut Opponent!)'
                    });
                }
            }
            
            console.log(`[LegalMoves] JOKER backward moves: ${jokerBackwardMoves.length}`);
            legalMoves.push(...jokerBackwardMoves);
        } */ // ── END HOUSE RULES ──

        if (this.onLegalMovesCalculated) {
            this.onLegalMovesCalculated(legalMoves);
        }
        
        // Check if player has a peg on home but no moves were generated - this would be a bug!
        const hasHomePeg = player.peg.some(p => p.holeType === 'home' && !p.completedCircuit);
        if (hasHomePeg && legalMoves.length === 0) {
            console.error(`🚨 BUG: Player has movable peg on HOME but NO LEGAL MOVES generated! Card: ${card.rank}`);
            console.error(`🚨 Player pegs:`, player.peg.map(p => ({ id: p.id, holeType: p.holeType, holeId: p.holeId, completedCircuit: p.completedCircuit })));
        }
        
        console.log('[LegalMoves] Final moves:', legalMoves.map(m => ({ type: m.type, from: m.fromHoleId, to: m.toHoleId })));

        return legalMoves;
    }

    // Calculate possible destinations for a peg
    calculateDestinations(peg, card, player) {
        // ════════════════════════════════════════════════════════
        // SMART PEG DELEGATION — hop-counting replaces legacy path building
        // ════════════════════════════════════════════════════════
        if (window.gameManager && window.gameManager.adjacency) {
            try {
                const smartDestinations = window.gameManager.calculateDestinations(peg, card, player);
                return smartDestinations;
            } catch (e) {
                console.error('[SmartPeg] Error, falling back to legacy:', e);
                // Fall through to legacy code below
            }
        }
        // ════════════════════════════════════════════════════════
        // LEGACY FALLBACK — original path-building code
        // Only used if smart_peg.js fails to load
        // ════════════════════════════════════════════════════════
        const destinations = [];
        const steps = card.movement;
        const direction = card.direction || 'clockwise'; // Default to clockwise if not specified
        
        console.log(`[calculateDestinations] Peg ${peg.id} at ${peg.holeId}, card movement=${steps}, direction=${direction}`);
        
        // ============================================================
        // SMART PEG: Initialize hop tracking for this calculation
        // The peg itself counts its hops and validates against the card
        // ============================================================
        const hopTracker = {
            pegId: peg.id,
            cardSteps: steps,
            cardDirection: direction,
            startHoleId: peg.holeId,
            hopsCount: 0,
            holesVisited: [peg.holeId],
            validated: false
        };
        
        // SPECIAL DEBUG for home pegs - trace everything
        if (peg.holeType === 'home' && !peg.completedCircuit) {
            console.log(`🏠🏠🏠 [HOME PEG FULL DEBUG] ==================`);
            console.log(`🏠 Peg: ${peg.id}, holeId: ${peg.holeId}, holeType: ${peg.holeType}`);
            console.log(`🏠 Player: ${player.name}, boardPosition: ${player.boardPosition}, index: ${player.index}`);
            console.log(`🏠 Card: movement=${steps}, direction=${direction}`);
            console.log(`🏠 Peg flags: completedCircuit=${peg.completedCircuit}, eligibleForSafeZone=${peg.eligibleForSafeZone}`);
            console.log(`🏠 All player pegs:`, player.peg.map(p => ({ id: p.id, holeId: p.holeId, holeType: p.holeType })));
            console.log(`🏠🏠🏠 ========================================`);
        }
        
        // Track if this is a FastTrack peg for special center hole option
        const isOnFastTrack = peg.onFasttrack && peg.holeId.startsWith('ft-');
        let stepsFromFastTrackExit = -1; // Will track steps past FastTrack exit
        
        // Get the track sequence for this peg
        const trackSequence = this.getTrackSequence(peg, player, direction);
        
        console.log(`[calculateDestinations] trackSequence length=${trackSequence.length}, first 5: ${trackSequence.slice(0, 5).join(', ')}`);
        
        if (trackSequence.length === 0) {
            console.log(`⚠️ [calculateDestinations] NO TRACK SEQUENCE for peg ${peg.id} at ${peg.holeId} - returning empty destinations!`);
            return destinations;
        }
        
        // Find valid destination(s) based on steps
        let currentIndex = 0;
        let stepsRemaining = steps;
        const path = [peg.holeId];
        let blockedAt = null;  // Track if/where path was blocked
        
        while (stepsRemaining > 0 && currentIndex < trackSequence.length) {
            const nextHoleId = trackSequence[currentIndex];
            const nextHole = holeRegistry.get(nextHoleId);
            
            // Track if we're exiting FastTrack (for center hole option)
            if (isOnFastTrack && nextHoleId === `ft-${player.boardPosition}`) {
                // This is the player's FastTrack exit point
                stepsFromFastTrackExit = 0;
            } else if (stepsFromFastTrackExit >= 0) {
                stepsFromFastTrackExit++;
            }
            
            // Check backward movement restrictions (4 card)
            // ft-* holes are perimeter corners — peg CAN land on/pass through them,
            // it just stays on the outer track (no FastTrack traversal).
            if (nextHole && card.direction === 'backward') {
                if (card.cannotEnterCenter && nextHole.type === 'center') {
                    break; // Cannot backup into center/bullseye
                }
                if (card.cannotEnterSafeZone && nextHole.type === 'safezone') {
                    break; // Cannot backup into safe zone
                }
                if (card.cannotEnterWinner && nextHole.type === 'home') {
                    break; // Cannot backup into home hole
                }
            }
            
            // ============================================================
            // HOME HOLE NOTES
            // The home hole is the STARTING position (where 5th peg begins) AND
            // the WINNING position (where 5th peg lands to win after 4 in safe zone).
            // 
            // The SAFE ZONE ENTRY is at outer-{p}-2, NOT at the home hole.
            // Pegs CAN pass through/land on home hole during normal play.
            // The safe zone entry check happens at outer-{p}-2 in getTrackSequence().
            //
            // Note: Unlike safe zone entry, there is NO blocking at home hole.
            // The 5th peg wins by landing on home after 4 pegs are in safe zone.
            // ============================================================
            
            // Home hole (as winning position) requires exact landing - can't pass it
            // This ONLY applies when approaching FROM THE SAFE ZONE (path includes safe-* holes).
            // The 5th peg on the OUTER TRACK can freely pass through home — it continues
            // around the board and must land exactly on home on a future turn.
            const isOwnHome = nextHole && nextHole.type === 'home' && 
                nextHoleId === `home-${player.boardPosition}`;
            const isFromSafeZone = path.some(h => h.startsWith('safe-'));
            const isHomeAsFinalPosition = isOwnHome && isFromSafeZone;
            
            if (isHomeAsFinalPosition) {
                if (stepsRemaining === 1) {
                    // Exact landing from safe zone - valid WIN
                    path.push(nextHoleId);
                    destinations.push({
                        holeId: nextHoleId,
                        steps: steps,
                        path: [...path]
                    });
                }
                // Can't pass the final hole when coming from safe zone
                break;
            }
            
            // Check if blocked by own peg (exclude the moving peg itself)
            // EXCEPTION: Pegs in the bullseye (center hole) do NOT block movement on the outer track or FastTrack
            // The bullseye is a separate "dimension" - only blocks entry to bullseye itself
            const isBlocked = this.isPegBlockingPath(nextHoleId, player.index, peg.id);
            
            // SPECIAL DEBUG for home pegs
            if (peg.holeType === 'home' && !peg.completedCircuit) {
                console.log(`🏠 [HOME LOOP] step ${currentIndex}: nextHoleId=${nextHoleId}, isBlocked=${isBlocked}, stepsRemaining=${stepsRemaining}`);
            }
            
            if (isBlocked) {
                blockedAt = nextHoleId;
                // Log WHICH peg is blocking for debugging
                const blockingPeg = player.peg.find(p => p.holeId === nextHoleId && p.id !== peg.id && p.holeType !== 'holding' && !p.inBullseye);
                console.log(`🚫 [calculateDestinations] Path BLOCKED by own peg ${blockingPeg ? blockingPeg.id : '?'} at ${nextHoleId} after ${currentIndex} steps`);
                break; // Cannot pass own peg
            }
            
            // Special case: If trying to ENTER bullseye and own peg is there, block
            if (nextHoleId === 'center' && this.isPegOnHole('center', player.index)) {
                // Can't enter bullseye if own peg is there
                blockedAt = 'center (own peg)';
                break;
            }
            
            path.push(nextHoleId);
            stepsRemaining--;
            currentIndex++;
            
            // SMART PEG: Track each hop
            hopTracker.hopsCount++;
            hopTracker.holesVisited.push(nextHoleId);
            
            if (stepsRemaining === 0) {
                // Check if destination is valid
                const destOccupied = this.isPegOnHole(nextHoleId, player.index);
                
                // SPECIAL DEBUG for safe zone landings
                if (nextHoleId.startsWith('safe-')) {
                    console.log(`🎯 [SAFE ZONE LANDING] Peg ${peg.id} landing at ${nextHoleId}`);
                    console.log(`🎯 [SAFE ZONE LANDING] Path: ${path.join(' → ')}`);
                    console.log(`🎯 [SAFE ZONE LANDING] Steps: ${steps}, Path length: ${path.length} (should be ${steps + 1})`);
                    console.log(`🎯 [SAFE ZONE LANDING] destOccupied=${destOccupied}`);
                }
                
                // SPECIAL DEBUG for home pegs
                if (peg.holeType === 'home' && !peg.completedCircuit) {
                    console.log(`🏠 [HOME FINAL] Reached destination ${nextHoleId}, destOccupied=${destOccupied}`);
                }
                
                if (!destOccupied) {
                    // SMART PEG: Validate hop count matches card
                    hopTracker.validated = (hopTracker.hopsCount === steps);
                    if (!hopTracker.validated) {
                        console.warn(`🐛 [SMART PEG] Hop count mismatch! Peg ${peg.id}: counted ${hopTracker.hopsCount} hops but card says ${steps}. Auto-correcting.`);
                        // The path is the source of truth — use path length for actual step count
                    }
                    
                    // ============================================================
                    // FINAL-POSITION PASSING CHECK
                    // The FT peg's final landing position (on the perimeter) cannot
                    // be equal to or further than another own peg's perimeter position.
                    // FT hops are shortcuts — intermediate ft-* hops don't "visit" the
                    // perimeter holes between corners, so passing is only checked at
                    // the FINAL landing spot.
                    // ============================================================
                    let passingViolation = false;
                    
                    if (peg.onFasttrack) {
                        const startPerim = this.getPerimeterIndex(peg.holeId);
                        const destPerim = this.getPerimeterIndex(nextHoleId);
                        
                        if (startPerim !== -1 && destPerim !== -1) {
                            for (const otherPeg of player.peg) {
                                if (otherPeg.id === peg.id) continue;
                                if (otherPeg.holeType === 'holding' || otherPeg.completedCircuit) continue;
                                if (otherPeg.holeId === 'center') continue;
                                if (otherPeg.holeId.startsWith('safe-')) continue;
                                
                                const otherPerim = this.getPerimeterIndex(otherPeg.holeId);
                                if (otherPerim === -1) continue;
                                
                                // Check if destination is at or past this peg
                                // (in the clockwise arc from start to destination)
                                if (this.isInClockwiseArc(startPerim, destPerim, otherPerim) ||
                                    destPerim === otherPerim) {
                                    passingViolation = true;
                                    console.log(`🚧 [FT FINAL-POS] Landing at ${nextHoleId}(${destPerim}) would pass/land on own peg ${otherPeg.id} at ${otherPeg.holeId}(${otherPerim}). Start: ${peg.holeId}(${startPerim})`);
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Only add destination if there's no passing violation
                    if (!passingViolation) {
                        destinations.push({
                            holeId: nextHoleId,
                            steps: steps,
                            path: [...path],
                            hopCount: hopTracker.hopsCount,
                            hopValidated: hopTracker.validated
                        });
                    }
                    
                    // ============================================================
                    // FASTTRACK SCENARIOS - ft-* holes have dual roles
                    // ============================================================
                    
                    // HOME STRETCH CHECK: If peg is in home stretch, skip all FastTrack/center options
                    // A peg in home stretch has already landed on its own ft-X and can only move forward to safe zone
                    if (peg.inHomeStretch) {
                        console.log(`🏠 [HOME STRETCH] Peg ${peg.id} is in home stretch - skipping FastTrack/center options`);
                        // No FastTrack entry or center options for home stretch pegs
                    } else {
                        // SCENARIO 1: Landing EXACTLY on ANY ft-* hole as final move
                        // → Player has TWO choices:
                        //   a) Just stop there (continue on perimeter next turn)
                        //   b) Enter FastTrack mode (traverse ft-* ring next turn)
                        // EXCEPTION: Cannot enter FastTrack at your OWN ft-X (that's home stretch)
                        const playerOwnFtHole = `ft-${player.boardPosition}`;
                        if (nextHoleId.startsWith('ft-') && !peg.onFasttrack && nextHoleId !== playerOwnFtHole && direction !== 'backward') {
                            console.log(`⚡ SCENARIO 1: Landing exactly on ${nextHoleId} - offering FastTrack entry choice`);
                            // The regular destination was already added above (option a)
                            // Add a second destination for FastTrack entry (option b)
                            destinations.push({
                                holeId: nextHoleId,
                                steps: steps,
                                path: [...path],
                                isFastTrackEntry: true,
                                description: `⚡ Traverse Fast Track`
                            });
                        } else if (nextHoleId === playerOwnFtHole && !peg.onFasttrack) {
                            console.log(`🏠 [HOME STRETCH] Landing on OWN ft-${player.boardPosition} - this is home stretch, NO FastTrack entry option`);
                        }
                        
                        // SCENARIO 2: REMOVED
                        // Once you start traversing FastTrack (onFasttrack=true and NOT on your entry ft-X),
                        // you can NO LONGER enter the center. You can only exit FastTrack to the outer rim.
                        // The bullseye option was here before - now removed per game rules.
                        
                        // SCENARIO 3: On OUTER TRACK, passing through ANY ft-* hole with exactly 1 step remaining
                        // → This is the "penultimate" scenario: ANY ft-* is the second-to-last step, center is final step
                        // → Offer bullseye as alternative to continuing on outer track  
                        // EXCEPTION: Cannot enter center if going through YOUR OWN ft-X (that's home stretch)
                        console.log(`🎯 [CENTER CHECK] Checking for center option: onFasttrack=${peg.onFasttrack}, path.length=${path.length}`);
                        console.log(`🎯 [CENTER CHECK] Path: ${path.join(' → ')}`);
                        if (!peg.onFasttrack && path.length >= 2) {
                            // Check if ANY ft-* hole is in the path (not the final destination)
                            let ftIndexInPath = -1;
                            let foundFtHole = null;
                            for (let pi = 0; pi < path.length - 1; pi++) {
                                if (path[pi].startsWith('ft-')) {  // Match ANY ft-* hole
                                    ftIndexInPath = pi;
                                    foundFtHole = path[pi];
                                    console.log(`🎯 [CENTER CHECK] Found ft hole: ${foundFtHole} at index ${ftIndexInPath}`);
                                    break;
                                }
                            }
                        
                            if (ftIndexInPath >= 0 && foundFtHole) {
                                // We passed through an ft hole. Check if final destination is just 1 step past ft
                                const stepsAfterFt = path.length - 1 - ftIndexInPath;
                                console.log(`🎯 [CENTER CHECK] stepsAfterFt=${stepsAfterFt} (need 1 for center option)`);
                                if (stepsAfterFt === 1) {
                                    console.log(`⚡ SCENARIO 3: Outer track, passed through ${foundFtHole} with 1 step remaining - penultimate bullseye entry!`);
                                    // RULE: Cannot enter bullseye via own color FT hole (backwards move)
                                    const ownFtHole = `ft-${player.boardPosition}`;
                                    if (foundFtHole === ownFtHole) {
                                        console.log(`🚫 [CENTER CHECK] Blocked - ${foundFtHole} is own FT hole (backwards move)`);
                                    } else if (!this.isPegOnHole('center', player.index) && !peg.hasExitedBullseye) {
                                        destinations.push({
                                            holeId: 'center',
                                            steps: steps,
                                            path: [...path.slice(0, ftIndexInPath + 1), 'center'], // Path to ft, then center
                                            isCenterOption: true,
                                            isFastTrackEntry: true, // Mark as FT entry since they're entering via ft hole
                                            description: `🎯 Enter Bullseye`
                                        });
                                        console.log(`✅ Added bullseye option via outer track: ${foundFtHole} → center`);
                                    }
                                }
                            } else {
                                console.log(`🎯 [CENTER CHECK] No ft-* hole found in path (excluding final destination)`);
                            }
                        }
                    } // End of else block for !inHomeStretch
                }
            }
        }
        // NOTE: SCENARIO 3 (mid-path FastTrack entry) was REMOVED
        // You cannot stop early at an ft-* hole just because it's in your path.
        // You must move the EXACT number of steps on your card.
        // The only exception is the 7 card which can be split (handled separately).
        
        // ============================================================
        // FASTTRACK EARLY EXIT — peg blocked on FT ring, or final destination 
        // has a passing violation, or the while loop couldn't complete.
        // Rule: The peg moves the FULL card value. Some hops on FT ring,
        // remaining hops on the outer perimeter after exiting.
        // FT hops + perimeter hops = card value.
        // The peg exits at the LATEST ft-* hole where the remaining perimeter
        // hops don't cause it to land on or pass another own peg.
        // Example: Card=10, peg at ft-1. 2 FT hops to ft-3, then 8 perimeter hops.
        // ============================================================
        if (peg.onFasttrack && destinations.length === 0) {
            // Collect all ft-* holes in the path we already walked (excluding start hole)
            const ftExitCandidates = [];
            for (let i = path.length - 1; i >= 1; i--) {
                if (path[i].startsWith('ft-')) {
                    ftExitCandidates.push({ hole: path[i], pathIndex: i });
                }
            }
            
            // Also try exiting from the starting ft-* hole (0 FT hops, all perimeter)
            if (peg.holeId.startsWith('ft-')) {
                ftExitCandidates.push({ hole: peg.holeId, pathIndex: 0 });
            }
            
            console.log(`🚧 [FT EARLY EXIT] Searching for valid exit. Blocked at ${blockedAt}, ${ftExitCandidates.length} ft-* exit candidates`);
            
            // Try each candidate from FURTHEST to NEAREST
            for (const candidate of ftExitCandidates) {
                const ftHops = candidate.pathIndex; // hops on FT ring to reach this exit
                const remainingHops = steps - ftHops;
                
                if (remainingHops <= 0) continue; // Already past card value at this FT hole
                
                // Build perimeter path from this ft-* hole
                const tempPeg = { ...peg, onFasttrack: false, fasttrackEntryHole: null, holeId: candidate.hole };
                const perimeterSeq = this.getTrackSequence(tempPeg, player, direction);
                
                if (perimeterSeq.length < remainingHops) continue; // Not enough perimeter track
                
                // Walk perimeter for remainingHops, checking for blocks
                let canReach = true;
                const exitPath = path.slice(0, candidate.pathIndex + 1); // FT portion
                for (let s = 0; s < remainingHops; s++) {
                    const nextH = perimeterSeq[s];
                    if (this.isPegBlockingPath(nextH, player.index, peg.id)) {
                        canReach = false;
                        break;
                    }
                    exitPath.push(nextH);
                }
                
                if (canReach) {
                    const dest = exitPath[exitPath.length - 1];
                    const destOccupied = this.isPegOnHole(dest, player.index);
                    if (!destOccupied) {
                        // Final-position check: combined FT+perimeter move cannot pass own pegs
                        const startPerim = this.getPerimeterIndex(peg.holeId);
                        const destPerim = this.getPerimeterIndex(dest);
                        let wouldPass = false;
                        
                        if (startPerim !== -1 && destPerim !== -1) {
                            for (const otherPeg of player.peg) {
                                if (otherPeg.id === peg.id) continue;
                                if (otherPeg.holeType === 'holding' || otherPeg.completedCircuit) continue;
                                if (otherPeg.holeId === 'center' || otherPeg.holeId.startsWith('safe-')) continue;
                                
                                const otherPerim = this.getPerimeterIndex(otherPeg.holeId);
                                if (otherPerim === -1) continue;
                                
                                if (this.isInClockwiseArc(startPerim, destPerim, otherPerim) ||
                                    destPerim === otherPerim) {
                                    wouldPass = true;
                                    console.log(`🚧 [FT EARLY EXIT] Exit at ${candidate.hole} → ${dest}(${destPerim}) would pass ${otherPeg.id} at ${otherPeg.holeId}(${otherPerim})`);
                                    break;
                                }
                            }
                        }
                        
                        if (!wouldPass) {
                            destinations.push({
                                holeId: dest,
                                steps: steps,
                                path: exitPath,
                                isForcedFTExit: true,
                                isLeaveFastTrack: true,
                                description: `⚠️ FastTrack exit at ${candidate.hole} → ${dest}`
                            });
                            console.log(`🚧 [FT EARLY EXIT] Valid exit at ${candidate.hole}: ${ftHops} FT hops + ${remainingHops} perimeter hops = ${steps} total → ${dest}`);
                            break; // Use the FURTHEST valid exit
                        }
                    }
                }
            }
            
            // If absolutely no valid exit exists (all perimeter paths blocked too), skip turn
            if (destinations.length === 0) {
                console.log(`🚧 [FT EARLY EXIT] NO valid exit found for peg ${peg.id} — all paths blocked`);
            }
        }
        
        // BULLSEYE ENTRY WITH 1-STEP CARD from ft-* hole on FastTrack
        // RULE: A peg on FastTrack can enter bullseye with a 1-step card from any ft-* hole
        // EXCEPT their own color FT hole (ft-{boardPosition}). That's a backwards move.
        // NOTE: Once a peg has exited bullseye, it can NEVER re-enter!
        const ownFtHoleForBullseye = `ft-${player.boardPosition}`;
        if (peg.holeId && peg.holeId.startsWith('ft-') && peg.onFasttrack && steps === 1
            && peg.holeId !== ownFtHoleForBullseye
            && !this.isPegOnHole('center', player.index) && !peg.hasExitedBullseye) {
            const bullseyeAlreadyAdded = destinations.some(d => d.isCenterOption);
            if (!bullseyeAlreadyAdded) {
                destinations.push({
                    holeId: 'center',
                    steps: 1,
                    path: [peg.holeId, 'center'],
                    isCenterOption: true,
                    description: `🎯 Enter Bullseye`
                });
                console.log(`✅ Added bullseye option from FT (1-step): ${peg.holeId} → center`);
            }
        }
        
        // LEAVE FASTTRACK OPTION (Legacy fallback)
        // RULE: Any peg on FastTrack at ANY ft-* hole can leave FT to outer perimeter.
        // Calculate where the peg would land if it took perimeter path instead of FT ring.
        if (peg.onFasttrack && peg.holeId && peg.holeId.startsWith('ft-') && !peg.inHomeStretch) {
            const perimeterTrackSeq = this.getTrackSequence(
                { ...peg, onFasttrack: false, fasttrackEntryHole: null },
                player,
                direction
            );
            if (perimeterTrackSeq.length >= steps) {
                let canReach = true;
                const leavePath = [peg.holeId];
                for (let s = 0; s < steps; s++) {
                    const nextH = perimeterTrackSeq[s];
                    if (this.isPegBlockingPath(nextH, player.index, peg.id)) { canReach = false; break; }
                    leavePath.push(nextH);
                }
                if (canReach) {
                    const leaveDest = leavePath[leavePath.length - 1];
                    const alreadyHas = destinations.some(d => d.holeId === leaveDest && !d.isCenterOption && !d.isFastTrackEntry);
                    if (!alreadyHas) {
                        destinations.push({
                            holeId: leaveDest,
                            steps: steps,
                            path: leavePath,
                            isLeaveFastTrack: true,
                            description: `🔄 Leave FastTrack → ${leaveDest}`
                        });
                        console.log(`✅ Added leave-FT option (legacy): ${peg.holeId} → perimeter → ${leaveDest}`);
                    }
                }
            }
        }
        
        // VALIDATION: Ensure all destinations have correct step counts
        for (const dest of destinations) {
            const pathLength = dest.path.length - 1; // -1 because path includes starting hole
            if (pathLength !== dest.steps && !dest.isCenterOption) {
                console.warn(`⚠️ STEP MISMATCH: Path length ${pathLength} != steps ${dest.steps} for ${peg.holeId} → ${dest.holeId}`);
            }
        }
        
        // LOCKED TO SAFE ZONE ENFORCEMENT
        // If peg is lockedToSafeZone, filter out any outer track destinations
        // The peg MUST enter safe zone (or HOME if safe zone is full)
        // EXCEPTION: Backward moves (4 card) are always allowed — a locked peg can still
        // move backward on the outer track. The lock only prevents forward deviation.
        if (peg.lockedToSafeZone && direction !== 'backward') {
            const pegsInSafeZone = player.peg.filter(p => p.holeType === 'safezone').length;
            console.log(`🔒 [LOCK ENFORCEMENT] Peg ${peg.id} is LOCKED to safe zone, pegsInSafeZone=${pegsInSafeZone}`);
            
            // DEFENSIVE CHECK: If peg is on home hole with lockedToSafeZone=true but no safe zone
            // destinations exist, this might be an incorrect state (e.g., peg was sent to home when cut)
            // The flag should have been reset by sendPegToHolding, but we'll fix it here as a safety
            const hasSafeZoneInDestinations = destinations.some(d => {
                const destHole = holeRegistry.get(d.holeId);
                return destHole && destHole.type === 'safezone';
            });
            
            if (!hasSafeZoneInDestinations && peg.holeType === 'home') {
                console.warn(`🔧 [AUTO-FIX] Peg ${peg.id} on home with lockedToSafeZone=true but NO safe zone destinations - unlocking!`);
                peg.lockedToSafeZone = false;
                peg.eligibleForSafeZone = false;
                // Don't filter, just return all destinations
                console.log(`[calculateDestinations] Found ${destinations.length} destinations (after LOCK FIX):`, destinations.map(d => d.holeId));
                return destinations;
            }
            
            if (pegsInSafeZone < 4) {
                // Safe zone not full - ONLY allow safe zone or home hole destinations
                const filteredDestinations = destinations.filter(dest => {
                    const destHole = holeRegistry.get(dest.holeId);
                    const destType = destHole ? destHole.type : 'unknown';
                    const isAllowed = destType === 'safezone' || destType === 'home';
                    if (!isAllowed) {
                        console.log(`🚫 [LOCK] Blocked destination ${dest.holeId} (type=${destType}) - must enter safe zone`);
                    }
                    return isAllowed;
                });
                console.log(`🔒 [LOCK] Filtered to ${filteredDestinations.length} safe zone destinations (was ${destinations.length})`);
                return filteredDestinations;
            } else {
                // Safe zone is full (4 pegs) - 5th peg goes THROUGH safe zone to HOME hole
                // Allow safe zone or home hole destinations only
                const filteredDestinations = destinations.filter(dest => {
                    const destHole = holeRegistry.get(dest.holeId);
                    const destType = destHole ? destHole.type : 'unknown';
                    const isAllowed = destType === 'safezone' || destType === 'home';
                    if (!isAllowed) {
                        console.log(`🚫 [LOCK] Blocked destination ${dest.holeId} (type=${destType}) - 5th peg must go to home`);
                    }
                    return isAllowed;
                });
                console.log(`🏆 [5TH PEG] Filtered to ${filteredDestinations.length} home+safe zone destinations (was ${destinations.length})`);
                return filteredDestinations;
            }
        }
        
        console.log(`[calculateDestinations] Found ${destinations.length} destinations for ${steps} steps:`, destinations.map(d => d.holeId));
        
        // SPECIAL DEBUG: If home peg got 0 destinations, log detailed info
        if (destinations.length === 0 && peg.holeType === 'home' && !peg.completedCircuit) {
            console.error(`🚨 [HOME PEG BUG] Peg ${peg.id} on home hole got 0 destinations!`);
            console.error(`🚨 [HOME PEG BUG] Card: movement=${steps}, direction=${direction}`);
            console.error(`🚨 [HOME PEG BUG] trackSequence first 10:`, trackSequence.slice(0, 10));
            console.error(`🚨 [HOME PEG BUG] Player pegs on track:`, player.peg.filter(p => p.holeType !== 'holding').map(p => ({ id: p.id, holeId: p.holeId })));
        }
        
        // Summary: Why are there no destinations?
        if (destinations.length === 0) {
            console.log(`⚠️ [calculateDestinations] Peg ${peg.id} at ${peg.holeId} has 0 DESTINATIONS!`);
            if (blockedAt) {
                console.log(`⚠️   Reason: Path blocked by own peg at ${blockedAt}`);
            } else if (trackSequence.length === 0) {
                console.log(`⚠️   Reason: Empty track sequence`);
            } else if (trackSequence.length < steps) {
                console.log(`⚠️   Reason: Track sequence too short (${trackSequence.length} holes) for ${steps} steps`);
            } else {
                console.log(`⚠️   Reason: Destination occupied by own peg OR path exited early`);
            }
            // Log the first few holes in the track to help debug
            console.log(`⚠️   Track (first 5): [${trackSequence.slice(0, 5).join(', ')}]`);
            console.log(`⚠️   Own pegs on track: [${player.peg.filter(p => p.holeType !== 'holding').map(p => p.holeId).join(', ')}]`);
        }
        
        return destinations;
    }

    // Get the sequence of holes for movement
    getTrackSequence(peg, player, direction) {
        const sequence = [];
        const currentHole = holeRegistry.get(peg.holeId);
        if (!currentHole) {
            console.error(`🚨 [getTrackSequence] HOLE NOT FOUND IN REGISTRY: "${peg.holeId}" for peg ${peg.id}`);
            console.error(`🚨 [getTrackSequence] Peg state: holeType=${peg.holeType}, player=${player.name}`);
            console.error(`🚨 [getTrackSequence] Registry size: ${holeRegistry.size}`);
            // Try to debug - list some holes that exist
            const sampleHoles = [];
            holeRegistry.forEach((h, id) => { if (sampleHoles.length < 10) sampleHoles.push(id); });
            console.error(`🚨 [getTrackSequence] Sample registry holes: ${sampleHoles.join(', ')}`);
            return sequence;
        }
        
        // Default direction to clockwise if not specified
        const dir = direction || 'clockwise';
        
        console.log('[getTrackSequence] Peg at:', peg.holeId, 'type:', currentHole.type, 'direction:', dir, 'onFasttrack:', peg.onFasttrack);
        
        // SPECIAL DEBUG for home pegs
        if (currentHole.type === 'home') {
            console.log(`🏠 [getTrackSequence] HOME PEG DETECTION!`);
            console.log(`🏠 [getTrackSequence] peg.id=${peg.id}, holeId=${peg.holeId}, completedCircuit=${peg.completedCircuit}`);
        }
        
        // Build the ORDERED track list for the hexagonal board
        // PARALLEL LAYOUT - 6 holes on each side line (parallel to safe zone)
        // Clockwise order for each player section (0-5):
        // 1. ft-{p} (FastTrack pentagon hole)
        // 2. side-left-{p}-6→1 (entering from FT, parallel to safe zone, toward outer edge)
        // 3. outer-{p}-0→3 (along outer edge)
        // 4. home-{p} (diamond marker at right corner)
        // 5. side-right-{p}-1→6 (from home toward next FT, parallel to safe zone)
        const buildOrderedTrack = () => {
            const orderedTrack = [];
            // Go around all 6 players in clockwise order (0, 1, 2, 3, 4, 5)
            for (let p = 0; p < 6; p++) {
                // FastTrack hole at corner
                orderedTrack.push(`ft-${p}`);
                // Side-left holes: from FT toward outer (6, 5, 4, 3, 2, 1) - 6 holes parallel to safe zone
                for (let h = 6; h >= 1; h--) {
                    orderedTrack.push(`side-left-${p}-${h}`);
                }
                // Outer track holes (0, 1, 2, 3)
                for (let h = 0; h < 4; h++) {
                    orderedTrack.push(`outer-${p}-${h}`);
                }
                // Home hole (diamond at right corner)
                orderedTrack.push(`home-${p}`);
                // Side-right holes: from home toward next FT (1, 2, 3, 4, 5, 6) - 6 holes parallel to safe zone
                for (let h = 1; h <= 6; h++) {
                    orderedTrack.push(`side-right-${p}-${h}`);
                }
            }
            return orderedTrack;
        };

        const clockwiseTrack = buildOrderedTrack();
        console.log(`[getTrackSequence] Track built with ${clockwiseTrack.length} holes (should be 102 = 17 per section × 6 sections)`);
        
        // SPECIAL DEBUG for home pegs - dump more track info
        if (currentHole.type === 'home') {
            const homeIdx = clockwiseTrack.indexOf(peg.holeId);
            console.log(`🏠 [HOME TRACK DEBUG] Looking for ${peg.holeId}, found at index ${homeIdx}`);
            if (homeIdx !== -1) {
                console.log(`🏠 [HOME TRACK DEBUG] Holes around ${peg.holeId}: before=${clockwiseTrack[homeIdx-1]}, at=${clockwiseTrack[homeIdx]}, after=${clockwiseTrack[homeIdx+1]}`);
            }
        }
        
        console.log('[getTrackSequence] First section sample (includes ft-1):', clockwiseTrack.slice(0, 15));
        
        // Special case: Home hole with backward movement (4 card)
        // Goes counter-clockwise, past safe zone (which it can't enter anyway)
        if (currentHole.type === 'home' && dir === 'backward') {
            const homeIdx = clockwiseTrack.indexOf(peg.holeId);
            if (homeIdx !== -1) {
                const trackLength = clockwiseTrack.length;
                for (let i = 1; i <= 10; i++) {
                    // Counter-clockwise = go BACKWARD in the array (since array is built clockwise)
                    const idx = (homeIdx - i + trackLength) % trackLength;
                    sequence.push(clockwiseTrack[idx]);
                }
                console.log('[getTrackSequence] Home backward sequence:', sequence.slice(0, 6));
            }
            return sequence;
        }
        
        // If peg is in safe zone, it can only move forward within safe zone
        if (currentHole.type === 'safezone') {
            const match = peg.holeId.match(/safe-(\d+)-(\d+)/);
            if (match) {
                const safePlayerIdx = parseInt(match[1]);
                const safeHoleNum = parseInt(match[2]);
                
                // Can only move forward in safe zone to higher numbered holes
                // Pegs IN the safe zone can NEVER exit to home — they are permanently placed.
                // Only the 5th peg (on the outer track) bypasses a full safe zone to reach home.
                for (let h = safeHoleNum + 1; h <= 4; h++) {
                    sequence.push(`safe-${safePlayerIdx}-${h}`);
                }
            }
            return sequence;
        }
        
        // ============================================================
        // SAFE ZONE ENTRY SPECIAL CASE - Peg ON safe zone entry hole
        // If peg is ON outer-{p}-2 (safe zone entry) AND eligible/locked,
        // it MUST enter safe zone (cannot continue on outer track)
        // ============================================================
        const safeZoneEntryHoleId = `outer-${player.boardPosition}-2`;
        const isOnSafeZoneEntry = peg.holeId === safeZoneEntryHoleId;
        const shouldEnterSafeZoneFromEntry = (peg.eligibleForSafeZone || peg.lockedToSafeZone) && dir === 'clockwise';
        
        if (isOnSafeZoneEntry && shouldEnterSafeZoneFromEntry) {
            console.log(`🚪🔒 [ENTRY→SAFE] Peg ${peg.id} is ON safe zone entry hole AND eligible/locked - routing to safe zone!`);
            
            // Count pegs already in safe zone
            const pegsInSafeZone = player.peg.filter(p => p.holeType === 'safezone').length;
            
            if (pegsInSafeZone < 4) {
                // Add safe zone holes (safe-{boardPos}-1 through safe-{boardPos}-4)
                for (let h = 1; h <= 4; h++) {
                    sequence.push(`safe-${player.boardPosition}-${h}`);
                }
            } else {
                // Safe zone full - 5th peg continues on outer track past home
                // Home requires EXACT landing to win. If peg overshoots, it continues
                // around the board and must return to home on a future turn.
                sequence.push(`outer-${player.boardPosition}-3`);
                sequence.push(`home-${player.boardPosition}`);
                // Continue past home on outer track (side-right → ft → next section...)
                // PARALLEL LAYOUT: 6 holes per side
                const bp = player.boardPosition;
                for (let h = 1; h <= 6; h++) {
                    sequence.push(`side-right-${bp}-${h}`);
                }
                const nextSection = (bp + 1) % 6;
                sequence.push(`ft-${nextSection}`);
                for (let h = 6; h >= 1; h--) {
                    sequence.push(`side-left-${nextSection}-${h}`);
                }
                for (let h = 0; h < 4; h++) {
                    sequence.push(`outer-${nextSection}-${h}`);
                }
                sequence.push(`home-${nextSection}`);
                for (let h = 1; h <= 6; h++) {
                    sequence.push(`side-right-${nextSection}-${h}`);
                }
                console.log(`🏆 [5TH PEG] Safe zone full - 5th peg on outer track, can pass through home`);
            }
            
            console.log(`🚪🔒 [ENTRY→SAFE] Safe zone sequence:`, sequence);
            return sequence;
        }
        
        // ============================================================
        // HOME HOLE SPECIAL CASE - Starting position OR Winning position
        // The home/diamond hole is:
        // - STARTING: Where the 5th peg begins the game (enters from holding)
        // - WINNING: Where the 5th peg lands to win (after 4 in safe zone)
        // It is NOT the safe zone entry - that is outer-{p}-2
        // This fallback handles edge cases where a peg somehow ended up on home
        // with eligibility (e.g., after backing up and moving forward again)
        // ============================================================
        const isOnOwnHomeHole = currentHole.type === 'home' && peg.holeId === `home-${player.boardPosition}`;
        const shouldEnterSafeZone = (peg.eligibleForSafeZone || peg.lockedToSafeZone) && dir === 'clockwise';
        
        if (isOnOwnHomeHole && shouldEnterSafeZone) {
            console.warn(`⚠️ [HOME→SAFE FALLBACK] Peg ${peg.id} is on home hole with eligibility - this is an edge case!`);
            console.log(`🏠🔒 [HOME→SAFE] eligibleForSafeZone=${peg.eligibleForSafeZone}, lockedToSafeZone=${peg.lockedToSafeZone}`);
            
            // Count pegs already in safe zone
            const pegsInSafeZone = player.peg.filter(p => p.holeType === 'safezone').length;
            
            if (pegsInSafeZone === 4) {
                // This IS the winning scenario - 5th peg on home hole
                // No need to route anywhere - they're at the winner position!
                console.log(`🏆 [5TH PEG] Peg is on HOME with full safe zone - THIS IS THE WIN!`);
                // Return empty sequence - peg has already won
                return sequence;
            }
            
            // Edge case: Peg on home with eligibility but safe zone not full
            // Route to side-right to continue the circuit (they missed safe zone entry)
            // This shouldn't happen in normal play but serves as a safety net
            console.warn(`⚠️ [HOME→SAFE FALLBACK] Routing through side-right to continue circuit`);
            // PARALLEL LAYOUT: 6 holes per side
            for (let h = 1; h <= 6; h++) {
                sequence.push(`side-right-${player.boardPosition}-${h}`);
            }
            // Then to next section and eventually back around to safe zone entry
            const nextSection = (player.boardPosition + 1) % 6;
            sequence.push(`ft-${nextSection}`);
            
            console.log(`🏠🔒 [HOME→SAFE FALLBACK] Sequence:`, sequence);
            return sequence;
        }
        
        // ============================================================
        // FASTTRACK BACKWARD MOVEMENT SPECIAL CASE
        // If peg is on ft-* hole (regardless of onFasttrack flag) AND moving backward,
        // force backward exit from FastTrack corner
        // This handles: 1) Pegs in FastTrack mode with 4 card
        //               2) Pegs on ft-* in perimeter mode with 4 card
        // ============================================================
        if (currentHole.type === 'fasttrack' && dir === 'backward') {
            const currentFtIdx = parseInt(peg.holeId.replace('ft-', ''));
            console.log(`⬅️ [FT BACKWARD] Peg on ft-${currentFtIdx} with BACKWARD movement - forcing backward exit`);
            console.log(`⬅️ [FT BACKWARD] onFasttrack=${peg.onFasttrack} (doesn't matter for backward movement)`);
            
            // Backward from ft-X: exit counter-clockwise to section (X-1)
            // ft-X is at the END of section (X-1), so backward goes to side-right-(X-1)-1, then -2, -3, -4
            const prevSectionIdx = (currentFtIdx - 1 + 6) % 6;
            
            // PARALLEL LAYOUT: 6 holes per side (going backward/counter-clockwise)
            // First: side-right holes of previous section (6, 5, 4, 3, 2, 1 going backward)
            for (let h = 6; h >= 1; h--) {
                sequence.push(`side-right-${prevSectionIdx}-${h}`);
            }
            // Then: home of previous section
            sequence.push(`home-${prevSectionIdx}`);
            // Then: outer track of previous section (3, 2, 1, 0 going backward)
            for (let h = 3; h >= 0; h--) {
                sequence.push(`outer-${prevSectionIdx}-${h}`);
            }
            // Then: side-left of previous section (1, 2, 3, 4, 5, 6 going backward toward FT)
            for (let h = 1; h <= 6; h++) {
                sequence.push(`side-left-${prevSectionIdx}-${h}`);
            }
            // Then: ft of previous section
            sequence.push(`ft-${prevSectionIdx}`);
            
            console.log(`⬅️ [FT BACKWARD] Backward exit sequence (first 6):`, sequence.slice(0, 6));
            console.log(`⬅️ [FT BACKWARD] For 4 card, destination should be:`, sequence[3]); // 4th step = index 3
            return sequence;
        }
        
        // FASTTRACK FORWARD MOVEMENT: If peg is on a FastTrack hole AND in FastTrack mode
        if (currentHole.type === 'fasttrack' && peg.onFasttrack) {
            const currentFtIdx = parseInt(peg.holeId.replace('ft-', ''));
            console.log(`🎯 [FastTrack] Peg on ft-${currentFtIdx}, building FORWARD sequence...`);
            
            // If peg must exit FastTrack due to mustExitFasttrack flag (e.g., bullseye exit),
            // force exit to regular outer track (forward/clockwise direction)
            // NOTE: Backward (4 card) exit is handled earlier in the code
            if (peg.mustExitFasttrack) {
                console.log(`[getTrackSequence] Peg has mustExitFasttrack flag - forcing forward outer track exit`);

                // PARALLEL LAYOUT: 6 holes per side
                // Forward forced exit: go clockwise to side-left-X holes
                for (let h = 6; h >= 1; h--) {
                    sequence.push(`side-left-${currentFtIdx}-${h}`);
                }
                for (let h = 0; h < 4; h++) {
                    sequence.push(`outer-${currentFtIdx}-${h}`);
                }
                sequence.push(`home-${currentFtIdx}`);
                for (let h = 1; h <= 6; h++) {
                    sequence.push(`side-right-${currentFtIdx}-${h}`);
                }

                console.log('[getTrackSequence] Forced forward exit sequence:', sequence);
                return sequence;
            }
            
            // Move around FastTrack circle CLOCKWISE (from ft-0 to ft-1 to ft-2...)
            // Until reaching player's own FastTrack hole (based on boardPosition, not index)
            const playerFtExitPosition = player.boardPosition;
            
            // SPECIAL CASE: If peg is ALREADY at its own ft-* hole AND has traversed (entered from different hole),
            // it should exit to the OUTER PERIMETER track (not safe zone!)
            // BUT if they just ENTERED at their own hole, they need to traverse first!
            const entryHole = peg.fasttrackEntryHole;
            const hasTraversed = entryHole && entryHole !== peg.holeId;
            
            if (currentFtIdx === playerFtExitPosition && hasTraversed) {
                console.log(`🏁 [FastTrack] Peg ALREADY at exit point ft-${currentFtIdx} AND has traversed (entered at ${entryHole}) → HYPERSPACE LAP COMPLETE!`);

                // FastTrack traversal = "hyperspace" = counts as completing a lap!
                // Route to outer perimeter, safe zone entry is at outer-{p}-2
                // PARALLEL LAYOUT: 6 holes per side

                // Exit to side-left track from this ft-* hole
                for (let h = 6; h >= 1; h--) {
                    sequence.push(`side-left-${player.boardPosition}-${h}`);
                }
                // Continue on outer track UP TO safe zone entry (outer-{p}-2)
                for (let h = 0; h <= 2; h++) {
                    sequence.push(`outer-${player.boardPosition}-${h}`);
                }
                // outer-{p}-2 is the safe zone entry - now add safe zone holes
                // Count pegs already in safe zone
                const pegsInSafeZone = player.peg.filter(p => p.holeType === 'safezone').length;

                if (pegsInSafeZone < 4) {
                    // Enter safe zone after outer-{p}-2
                    for (let h = 1; h <= 4; h++) {
                        sequence.push(`safe-${player.boardPosition}-${h}`);
                    }
                    console.log(`🚪 [FastTrack HYPERSPACE] Routing through safe zone entry (outer-${player.boardPosition}-2) to safe zone`);
                } else {
                    // Safe zone full - 5th peg continues on outer track past home
                    sequence.push(`outer-${player.boardPosition}-3`);
                    sequence.push(`home-${player.boardPosition}`);
                    const bp = player.boardPosition;
                    for (let h = 1; h <= 6; h++) sequence.push(`side-right-${bp}-${h}`);
                    const ns = (bp + 1) % 6;
                    sequence.push(`ft-${ns}`);
                    for (let h = 6; h >= 1; h--) sequence.push(`side-left-${ns}-${h}`);
                    for (let h = 0; h < 4; h++) sequence.push(`outer-${ns}-${h}`);
                    console.log(`🏆 [FastTrack HYPERSPACE] Safe zone full - 5th peg on outer track, can pass through home`);
                }

                console.log('🎯 [getTrackSequence] FastTrack HYPERSPACE exit sequence:', sequence);
                return sequence;
            } else if (currentFtIdx === playerFtExitPosition && !hasTraversed) {
                // Peg is at its own ft-* but JUST entered here - must traverse the loop first
                console.log(`📍 [FastTrack] Peg at own ft-${currentFtIdx} but JUST ENTERED (entry: ${entryHole}) - must traverse loop`);
                // Fall through to normal FastTrack traversal logic
            }
            
            for (let i = 1; i <= 6; i++) {
                const nextIdx = (currentFtIdx + i) % 6;  // Clockwise
                const nextFtId = `ft-${nextIdx}`;
                console.log(`🎯 [FastTrack] Step ${i}: nextIdx=${nextIdx}, nextFtId=${nextFtId}, playerBoardPos=${playerFtExitPosition}`);
                
                // Check if this is the player's exit point (use boardPosition, not index!)
                if (nextIdx === playerFtExitPosition) {
                    // Check if player's FastTrack hole is occupied by own peg
                    const ownPegOnFt = this.isPegOnHole(nextFtId, player.index);
                    
                    if (ownPegOnFt) {
                        // Must exit earlier - find side track exit from previous FT hole
                        // The peg must exit at a PREVIOUS ft-* hole that is NOT occupied by their own peg
                        console.log(`🚧 [FastTrack BLOCKED] Player's exit ${nextFtId} is blocked by own peg - must exit earlier!`);
                        
                        // Look backward through the sequence to find an unblocked ft-* hole
                        let exitFoundIdx = -1;
                        for (let backIdx = sequence.length - 1; backIdx >= 0; backIdx--) {
                            const candidateHole = sequence[backIdx];
                            if (candidateHole.startsWith('ft-') && !this.isPegOnHole(candidateHole, player.index)) {
                                exitFoundIdx = backIdx;
                                console.log(`🚧 [FastTrack BLOCKED] Found unblocked exit at ${candidateHole} (index ${backIdx})`);
                                break;
                            }
                        }
                        
                        if (exitFoundIdx >= 0) {
                            // Trim sequence to this exit point and add side track exit
                            const exitHole = sequence[exitFoundIdx];
                            const exitFtIdx = parseInt(exitHole.replace('ft-', ''));
                            sequence.length = exitFoundIdx + 1; // Truncate to exit point

                            // PARALLEL LAYOUT: 6 holes per side
                            // Add side track exit from this ft-* hole (exit to side-left-X-* holes)
                            for (let h = 6; h >= 1; h--) {
                                sequence.push(`side-left-${exitFtIdx}-${h}`);
                            }
                            for (let h = 0; h < 4; h++) {
                                sequence.push(`outer-${exitFtIdx}-${h}`);
                            }
                            console.log(`🚧 [FastTrack BLOCKED] Forced exit via ${exitHole} → side track`);
                        } else {
                            console.log(`🚧 [FastTrack BLOCKED] No unblocked earlier ft-* hole found!`);
                        }
                        break;
                    }

                    // This is the exit point - add it
                    sequence.push(nextFtId);

                    // FASTTRACK EXIT = HYPERSPACE LAP COMPLETE!
                    // When exiting FastTrack at player's own ft-* hole after traversing,
                    // they go to OUTER TRACK and enter safe zone at outer-{p}-2
                    // because FastTrack traversal counts as completing a circuit ("hyperspace")
                    console.log(`🏁 [FastTrack] Exiting at ${nextFtId} → HYPERSPACE LAP COMPLETE! → outer track → safe zone entry (outer-${playerFtExitPosition}-2)`);

                    // PARALLEL LAYOUT: 6 holes per side
                    // Exit to side-left track from this ft-* hole
                    for (let h = 6; h >= 1; h--) {
                        sequence.push(`side-left-${playerFtExitPosition}-${h}`);
                    }
                    // Continue on outer track UP TO safe zone entry (outer-{p}-2)
                    for (let h = 0; h <= 2; h++) {
                        sequence.push(`outer-${playerFtExitPosition}-${h}`);
                    }
                    // outer-{p}-2 is the safe zone entry - now add safe zone holes
                    const pegsInSafeZone = player.peg.filter(p => p.holeType === 'safezone').length;

                    if (pegsInSafeZone < 4) {
                        // Enter safe zone after outer-{p}-2
                        for (let h = 1; h <= 4; h++) {
                            sequence.push(`safe-${player.boardPosition}-${h}`);
                        }
                    } else {
                        // Safe zone full - 5th peg continues on outer track past home
                        sequence.push(`outer-${player.boardPosition}-3`);
                        sequence.push(`home-${player.boardPosition}`);
                        const bp2 = player.boardPosition;
                        for (let h = 1; h <= 6; h++) sequence.push(`side-right-${bp2}-${h}`);
                        const ns2 = (bp2 + 1) % 6;
                        sequence.push(`ft-${ns2}`);
                        for (let h = 6; h >= 1; h--) sequence.push(`side-left-${ns2}-${h}`);
                        for (let h = 0; h < 4; h++) sequence.push(`outer-${ns2}-${h}`);
                        console.log(`🏆 [FastTrack exit] Safe zone full - 5th peg on outer track, can pass through home`);
                    }

                    break;
                } else {
                    // Add this FastTrack hole and mark it as potential exit if blocked later
                    sequence.push(nextFtId);
                }
            }
            
            console.log('🎯 [getTrackSequence] FastTrack sequence:', sequence);
            return sequence;
        }
        
        // DEBUG: Log when a peg is on ft-* but NOT in FastTrack mode (e.g., after bullseye exit)
        if (currentHole.type === 'fasttrack' && !peg.onFasttrack) {
            console.log(`📍 [PERIMETER MODE] Peg ${peg.id} on ft-* hole but NOT in FastTrack mode - using perimeter track`);
            console.log(`📍 [PERIMETER MODE] eligibleForSafeZone=${peg.eligibleForSafeZone}, lockedToSafeZone=${peg.lockedToSafeZone}, completedCircuit=${peg.completedCircuit}`);
            
            // REMOVED AUTO-FIX: Previously forced eligibleForSafeZone=true here, but that was wrong.
            // A peg on ft-* in perimeter mode may have:
            // 1. Just passed through on perimeter (NOT eligible)
            // 2. Exited FastTrack via 4 card (NOT eligible unless they traversed)
            // 3. Exited bullseye (eligible - but should be set by bullseye exit logic)
            // Don't auto-set eligibility here - trust the existing flags.
        }
        
        // Use the pre-built ordered track list for consistent movement
        // Find current position in clockwise track
        const currentIdx = clockwiseTrack.indexOf(peg.holeId);
        
        // DEBUG: Special logging for home pegs
        if (currentHole.type === 'home') {
            console.log(`🏠 [HOME DEBUG] Looking for '${peg.holeId}' (length=${peg.holeId.length}) in clockwiseTrack`);
            console.log(`🏠 [HOME DEBUG] currentIdx = ${currentIdx}`);
            console.log(`🏠 [HOME DEBUG] clockwiseTrack sample:`, clockwiseTrack.slice(6, 16));
            // Check if any home holes exist in track
            const homeHolesInTrack = clockwiseTrack.filter(h => h && h.startsWith && h.startsWith('home-'));
            console.log(`🏠 [HOME DEBUG] All home holes in track:`, homeHolesInTrack);
        }
        
        if (currentIdx === -1) {
            console.warn('[getTrackSequence] Current hole not found in ordered track:', peg.holeId);
            
            // DEFENSIVE FIX: For home holes, manually find the track position
            if (currentHole.type === 'home') {
                const homeMatch = peg.holeId.match(/home-(\d+)/);
                if (homeMatch) {
                    const homePlayerIdx = parseInt(homeMatch[1]);
                    // PARALLEL LAYOUT: home-X is at index 11 + (homePlayerIdx * 17) in the ordered track
                    // Section: ft(0) + side-left(1-6) + outer(7-10) + home(11) + side-right(12-17)
                    const calculatedIdx = 11 + (homePlayerIdx * 17);
                    console.log(`🔧 [AUTO-FIX] Home hole ${peg.holeId} not found, using calculated index ${calculatedIdx}`);
                    
                    // Verify and use calculated index
                    if (clockwiseTrack[calculatedIdx] === peg.holeId) {
                        // Continue with calculated index
                        const isClockwise = dir === 'clockwise';
                        const trackLength = clockwiseTrack.length;
                        for (let i = 1; i <= 30; i++) {
                            let idx;
                            if (isClockwise) {
                                idx = (calculatedIdx + i) % trackLength;
                            } else {
                                idx = (calculatedIdx - i + trackLength) % trackLength;
                            }
                            sequence.push(clockwiseTrack[idx]);
                        }
                        console.log(`🔧 [AUTO-FIX] Generated home peg sequence:`, sequence.slice(0, 8));
                        return sequence;
                    }
                }
            }
            
            return sequence;
        }
        
        const isClockwise = dir === 'clockwise';
        console.log(`[getTrackSequence] Peg at index ${currentIdx} in ordered track, direction=${dir}, isClockwise=${isClockwise}`);
        
        // DEBUG: For home pegs, log what we expect
        if (currentHole.type === 'home') {
            console.log(`🏠 [HOME DEBUG] Starting loop from index ${currentIdx}, will iterate forward`);
            console.log(`🏠 [HOME DEBUG] Expected first holes: ${clockwiseTrack[(currentIdx + 1) % clockwiseTrack.length]}, ${clockwiseTrack[(currentIdx + 2) % clockwiseTrack.length]}`);
        }
        
        // Get next holes in the appropriate direction
        // The ordered track array is built in clockwise order (player 0 → 1 → 2 → 3 → 4 → 5)
        // So clockwise movement = FORWARD in array, counter-clockwise = BACKWARD in array
        const trackLength = clockwiseTrack.length;
        for (let i = 1; i <= 30; i++) {
            let idx;
            if (isClockwise) {
                // Clockwise movement = go FORWARD through the array
                idx = (currentIdx + i) % trackLength;
            } else {
                // Counter-clockwise (backward/4 card) = go BACKWARD through the array
                idx = (currentIdx - i + trackLength) % trackLength;
            }
            
            const nextHoleId = clockwiseTrack[idx];
            
            // DEBUG: For home pegs, trace each iteration
            if (currentHole.type === 'home' && i <= 10) {
                console.log(`🏠 [HOME TRACE] i=${i}, idx=${idx}, nextHoleId=${nextHoleId}`);
            }
            
            // ============================================================
            // SAFE ZONE ENTRY CHECK (outer-{p}-2)
            // The safe zone entry is outer-{p}-2 - the hole directly in front of the safe zone
            // This is 2 holes BEFORE the home/diamond hole in the clockwise direction
            // Tokens can ONLY enter safe zone from this hole when:
            // 1. Approaching from the LEFT (clockwise direction)
            // 2. Peg has completed a circuit (eligibleForSafeZone flag)
            // Coming from the RIGHT (backward/counter-clockwise) cannot enter safe zone
            // ============================================================
            const safeZoneEntryHoleId = `outer-${player.boardPosition}-2`;
            const homeHoleId = `home-${player.boardPosition}`;
            
            // DEBUG: Log when approaching safe zone entry
            if (nextHoleId === safeZoneEntryHoleId) {
                console.log(`🚪 [SAFE ZONE ENTRY CHECK] nextHoleId=${nextHoleId}, isClockwise=${isClockwise}, eligibleForSafeZone=${peg.eligibleForSafeZone}, lockedToSafeZone=${peg.lockedToSafeZone}`);
            }
            
            // Check if we're approaching safe zone entry from clockwise AND eligible
            if (nextHoleId === safeZoneEntryHoleId && isClockwise && (peg.eligibleForSafeZone || peg.lockedToSafeZone)) {
                // Count pegs already in safe zone
                const pegsInSafeZone = player.peg.filter(p => p.holeType === 'safezone').length;
                console.log(`🚪 [SAFE ZONE ENTRY] Approaching safe zone entry from LEFT (clockwise), pegsInSafeZone=${pegsInSafeZone}`);
                
                // Add the safe zone entry hole to the sequence
                sequence.push(nextHoleId);
                
                if (pegsInSafeZone < 4) {
                    // Must enter safe zone - add safe zone holes instead of continuing outer track
                    for (let h = 1; h <= 4; h++) {
                        sequence.push(`safe-${player.boardPosition}-${h}`);
                    }
                    console.log(`🔒 [SAFE ZONE] Peg entering safe zone - cannot continue on outer track`);
                } else {
                    // Safe zone is full (4 pegs) - 5th peg continues on outer track past home
                    // Home requires EXACT landing to win. If peg overshoots, it continues
                    // around the board and must return to home on a future turn.
                    // PARALLEL LAYOUT: 6 holes per side
                    sequence.push(`outer-${player.boardPosition}-3`);
                    sequence.push(`home-${player.boardPosition}`);
                    // Continue past home on outer track
                    const bp = player.boardPosition;
                    for (let h = 1; h <= 6; h++) {
                        sequence.push(`side-right-${bp}-${h}`);
                    }
                    const nextSec = (bp + 1) % 6;
                    sequence.push(`ft-${nextSec}`);
                    for (let h = 6; h >= 1; h--) {
                        sequence.push(`side-left-${nextSec}-${h}`);
                    }
                    for (let h = 0; h < 4; h++) {
                        sequence.push(`outer-${nextSec}-${h}`);
                    }
                    sequence.push(`home-${nextSec}`);
                    for (let h = 1; h <= 6; h++) {
                        sequence.push(`side-right-${nextSec}-${h}`);
                    }
                    console.log(`🏆 [5TH PEG] Safe zone full - 5th peg on outer track, can pass through home`);
                }
                break; // Stop adding outer track holes
            }
            
            // Prevent backward entry into safe zone (coming from right / counter-clockwise)
            // If peg lands exactly on safe zone entry from backward direction, they stop there
            // and must wait for next turn to potentially enter safe zone from correct direction
            if (nextHoleId === safeZoneEntryHoleId && !isClockwise) {
                // Backward movement CAN land on safe zone entry, but CANNOT enter safe zone
                sequence.push(nextHoleId);
                console.log(`⛔ [SAFE ZONE] Peg approaching safe zone entry from RIGHT (backward) - cannot enter safe zone`);
                // Continue adding backward track - they go past it
                continue;
            }
            
            // Default: just add this hole to the sequence
            sequence.push(nextHoleId);
        }
        
        console.log('[getTrackSequence] Sequence:', sequence.slice(0, 8), '...');
        
        // SPECIAL DEBUG for home pegs
        if (currentHole.type === 'home') {
            console.log(`🏠 [getTrackSequence HOME] Final sequence for home peg: length=${sequence.length}`);
            console.log(`🏠 [getTrackSequence HOME] First 5 holes:`, sequence.slice(0, 5));
            if (sequence.length === 0) {
                console.error(`🚨 [getTrackSequence HOME] EMPTY SEQUENCE FOR HOME PEG! This is a bug!`);
                console.error(`🚨 [getTrackSequence HOME] currentIdx=${currentIdx}, dir=${dir}`);
                console.error(`🚨 [getTrackSequence HOME] Attempting FAILSAFE recovery...`);
                
                // FAILSAFE: Build sequence directly for home peg
                // PARALLEL LAYOUT: 6 holes per side
                const homeMatch = peg.holeId.match(/home-(\d+)/);
                if (homeMatch) {
                    const homePlayerIdx = parseInt(homeMatch[1]);
                    // Build the continuation from home: side-right-X-1, side-right-X-2, etc.
                    for (let h = 1; h <= 6; h++) {
                        sequence.push(`side-right-${homePlayerIdx}-${h}`);
                    }
                    // Then ft-{next}
                    const nextFt = (homePlayerIdx + 1) % 6;
                    sequence.push(`ft-${nextFt}`);
                    // Then continue through next section
                    const nextSection = nextFt;
                    for (let h = 6; h >= 1; h--) {
                        sequence.push(`side-left-${nextSection}-${h}`);
                    }
                    for (let h = 0; h < 4; h++) {
                        sequence.push(`outer-${nextSection}-${h}`);
                    }
                    sequence.push(`home-${nextSection}`);
                    console.log(`🔧 [FAILSAFE] Generated backup sequence for home peg:`, sequence.slice(0, 10));
                }
            }
        }
        
        return sequence;
    }

    // Get the hole directly behind a peg (1 space backward) for JOKER card
    getBackwardHole(peg, player) {
        const currentHole = holeRegistry.get(peg.holeId);
        if (!currentHole) return null;
        
        // Build the ordered track (same as getTrackSequence) - PARALLEL LAYOUT with 6 holes per side
        const buildOrderedTrack = () => {
            const orderedTrack = [];
            for (let p = 0; p < 6; p++) {
                orderedTrack.push(`ft-${p}`);
                for (let h = 6; h >= 1; h--) orderedTrack.push(`side-left-${p}-${h}`);
                for (let h = 0; h < 4; h++) orderedTrack.push(`outer-${p}-${h}`);
                orderedTrack.push(`home-${p}`);
                for (let h = 1; h <= 6; h++) orderedTrack.push(`side-right-${p}-${h}`);
            }
            return orderedTrack;
        };
        
        const clockwiseTrack = buildOrderedTrack();
        const currentIdx = clockwiseTrack.indexOf(peg.holeId);
        
        if (currentIdx === -1) {
            console.log(`[getBackwardHole] Peg ${peg.id} at ${peg.holeId} not found in track`);
            return null;
        }
        
        // Backward = counter-clockwise = go BACKWARD in array
        const trackLength = clockwiseTrack.length;
        const backwardIdx = (currentIdx - 1 + trackLength) % trackLength;
        const backwardHoleId = clockwiseTrack[backwardIdx];
        
        console.log(`[getBackwardHole] Peg ${peg.id} at ${peg.holeId} (idx ${currentIdx}) -> backward hole: ${backwardHoleId} (idx ${backwardIdx})`);
        return backwardHoleId;
    }

    // Check if a hole has a peg belonging to a specific player
    // IMPORTANT: Pegs in the bullseye (center hole) should NOT count as blocking for path checks
    // Use this for landing checks. For path blocking checks, exclude center hole.
    isPegOnHole(holeId, playerIndex) {
        const player = this.players[playerIndex];
        return player.peg.some(p => p.holeId === holeId && p.holeType !== 'holding' && !p.completedCircuit);
    }
    
    // Calculate a peg's progress toward home (higher = further along toward winning)
    // Used to determine if one peg is "ahead" of another for FastTrack passing rules
    // Returns a value 0-100 where: home=100, safe zone=91-94, outer track=0-89
    getPegProgress(peg, playerBoardPosition) {
        if (!peg || !peg.holeId) return -1;  // Invalid/holding
        
        const holeId = peg.holeId;
        
        // Completed/winner = highest
        if (peg.completedCircuit) return 100;
        
        // Safe zone holes (safe-X-1 through safe-X-4)
        if (holeId.startsWith('safe-')) {
            const match = holeId.match(/safe-(\d+)-(\d+)/);
            if (match) {
                const safeNum = parseInt(match[2]);
                return 90 + safeNum;  // 91-94
            }
        }
        
        // Home hole (starting position, but also pre-circuit)
        if (holeId.startsWith('home-')) {
            // If completed circuit, they're at 100. Otherwise at start (0)
            return peg.eligibleForSafeZone ? 89 : 0;
        }
        
        // Holding zones (not on track yet)
        if (holeId.startsWith('hold-')) return -1;
        
        // Bullseye (center) - special position, treat as very advanced
        if (holeId === 'center') return 88;
        
        // FastTrack holes (ft-0 through ft-5)
        if (holeId.startsWith('ft-')) {
            const ftIdx = parseInt(holeId.replace('ft-', ''));
            // Calculate distance from player's exit (ft-{boardPosition})
            // Progress increases as we approach exit
            const distFromExit = (playerBoardPosition - ftIdx + 6) % 6;
            // Exit point (distance 0) = 85, furthest (distance 5) = 80
            return 80 + (6 - distFromExit);
        }
        
        // Outer track positions - calculate based on distance from home stretch
        // Track sequence is: outer-X-0 → side-right-X → ft-X → ... (perimeter)
        // Progress = how far from starting home toward ft-X entry
        
        if (holeId.startsWith('outer-')) {
            const match = holeId.match(/outer-(\d+)-(\d+)/);
            if (match) {
                const outerPos = parseInt(match[1]);
                const outerIdx = parseInt(match[2]);
                // Calculate position relative to player's home
                const sectionOffset = (outerPos - playerBoardPosition + 6) % 6;
                // Each section has 4 outer holes + 4 side-right + 1 ft = 9 holes
                // Progress within section
                const withinSection = outerIdx;  // 0-3
                const totalProgress = sectionOffset * 9 + withinSection;
                // Scale to 1-79 range (0 = just left home, 79 = about to enter safe)
                return Math.min(79, Math.max(1, totalProgress));
            }
        }
        
        if (holeId.startsWith('side-right-')) {
            const match = holeId.match(/side-right-(\d+)-(\d+)/);
            if (match) {
                const sidePos = parseInt(match[1]);
                const sideIdx = parseInt(match[2]);
                const sectionOffset = (sidePos - playerBoardPosition + 6) % 6;
                const withinSection = 4 + sideIdx;  // 4-7 (after outer holes)
                const totalProgress = sectionOffset * 9 + withinSection;
                return Math.min(79, Math.max(1, totalProgress));
            }
        }
        
        if (holeId.startsWith('side-left-')) {
            const match = holeId.match(/side-left-(\d+)-(\d+)/);
            if (match) {
                const sidePos = parseInt(match[1]);
                const sideIdx = parseInt(match[2]);
                // Side-left holes are FastTrack exits, position near ft hole
                const sectionOffset = (sidePos - playerBoardPosition + 6) % 6;
                const withinSection = 8 + sideIdx;  // After ft hole
                const totalProgress = sectionOffset * 9 + withinSection;
                return Math.min(79, Math.max(1, totalProgress));
            }
        }
        
        // Default for unknown positions
        return 50;
    }
    
    // Check if moving peg to destination would put it ahead of any other own peg
    // Returns the blocking peg if found, null otherwise
    wouldPassOwnPeg(movingPeg, destHoleId, player) {
        const boardPos = player.boardPosition;
        const destProgress = this.getPegProgress({ holeId: destHoleId, eligibleForSafeZone: true }, boardPos);
        
        for (const otherPeg of player.peg) {
            // Skip the moving peg itself
            if (otherPeg.id === movingPeg.id) continue;
            // Skip pegs in holding zone or completed
            if (otherPeg.holeType === 'holding' || otherPeg.completedCircuit) continue;
            // Skip pegs in safe zone or bullseye (they're "ahead" already, can't be passed)
            if (otherPeg.holeId.startsWith('safe-') || otherPeg.holeId === 'center') continue;
            
            const otherProgress = this.getPegProgress(otherPeg, boardPos);
            
            // If destination would put moving peg ahead of another peg on the track
            if (destProgress > otherProgress) {
                console.log(`🚧 [PASS CHECK] Moving to ${destHoleId} (progress ${destProgress}) would pass peg ${otherPeg.id} at ${otherPeg.holeId} (progress ${otherProgress})`);
                return otherPeg;
            }
        }
        
        return null;  // No passing violation
    }
    
    // ============================================================
    // CROSS-TRACK FASTTRACK PASSING HELPERS
    // ft-* holes are part of the outer perimeter at specific positions.
    // When an FT peg hops between ft-* holes, it effectively "covers"
    // the perimeter arc between them. If an own outer-track peg sits
    // in that arc, the FT peg is "passing" it and must stop.
    // ============================================================
    
    // Map any outer-track hole to its perimeter index (0-101)
    // PARALLEL LAYOUT: 17 holes per section × 6 sections = 102 total
    // Section layout: ft-P (0) → side-left-P-6..1 (1-6) → outer-P-0..3 (7-10) → home-P (11) → side-right-P-1..6 (12-17)
    // Returns -1 for non-perimeter holes (safe zone, center, holding)
    getPerimeterIndex(holeId) {
        if (!holeId) return -1;

        // ft-P: at section P's first position = P*17
        if (holeId.startsWith('ft-')) {
            const ftNum = parseInt(holeId.replace('ft-', ''));
            return ftNum * 17;
        }

        // side-left-P-H: H goes 6→1, indices = P*17 + (7 - H)
        // side-left-P-6 = P*17 + 1, side-left-P-1 = P*17 + 6
        const sideLeftMatch = holeId.match(/^side-left-(\d+)-(\d+)$/);
        if (sideLeftMatch) {
            const section = parseInt(sideLeftMatch[1]);
            const h = parseInt(sideLeftMatch[2]);
            return section * 17 + (7 - h);
        }

        // outer-P-H: H goes 0→3, indices = P*17 + 7 + H
        const outerMatch = holeId.match(/^outer-(\d+)-(\d+)$/);
        if (outerMatch) {
            const section = parseInt(outerMatch[1]);
            const h = parseInt(outerMatch[2]);
            return section * 17 + 7 + h;
        }

        // home-P: index = P*17 + 11
        const homeMatch = holeId.match(/^home-(\d+)$/);
        if (homeMatch) {
            return parseInt(homeMatch[1]) * 17 + 11;
        }

        // side-right-P-H: H goes 1→6, indices = P*17 + 11 + H
        const sideRightMatch = holeId.match(/^side-right-(\d+)-(\d+)$/);
        if (sideRightMatch) {
            const section = parseInt(sideRightMatch[1]);
            const h = parseInt(sideRightMatch[2]);
            return section * 17 + 11 + h;
        }

        return -1; // Not on perimeter (safe zone, center, holding)
    }

    // Check if 'position' falls in the clockwise arc from 'from' (exclusive) to 'to' (inclusive)
    // on a 102-hole circular track. Used for cross-track FT passing detection.
    isInClockwiseArc(from, to, position) {
        if (from === to) return false; // Same position = no arc
        const arcLen = (to - from + 102) % 102;
        const distFromStart = (position - from + 102) % 102;
        return distFromStart > 0 && distFromStart <= arcLen;
    }
    
    // Check if an FT hop from one hole to another would pass any own peg on the outer track.
    // fromHoleId: the FT peg's current position (ft-* hole or starting position)
    // toFtHoleId: the candidate next ft-* hole
    // Returns the blocking peg if found, null otherwise.
    wouldFtHopPassOwnPeg(fromHoleId, toFtHoleId, player, movingPegId) {
        const fromPerim = this.getPerimeterIndex(fromHoleId);
        const toPerim = this.getPerimeterIndex(toFtHoleId);
        
        if (fromPerim === -1 || toPerim === -1) return null;
        
        for (const otherPeg of player.peg) {
            if (otherPeg.id === movingPegId) continue;
            if (otherPeg.holeType === 'holding' || otherPeg.completedCircuit) continue;
            if (otherPeg.holeId === 'center') continue; // Bullseye doesn't block
            if (otherPeg.holeId.startsWith('safe-')) continue; // Safe zone doesn't block
            if (otherPeg.onFasttrack) continue; // Other FT pegs handled by isPegBlockingPath
            
            const otherPerim = this.getPerimeterIndex(otherPeg.holeId);
            if (otherPerim === -1) continue;
            
            if (this.isInClockwiseArc(fromPerim, toPerim, otherPerim)) {
                console.log(`🚧 [FT CROSS-TRACK] FT hop ${fromHoleId}(${fromPerim}) → ${toFtHoleId}(${toPerim}) would pass own peg ${otherPeg.id} at ${otherPeg.holeId}(${otherPerim})`);
                return otherPeg;
            }
        }
        
        return null;
    }
    
    // Check if a peg blocks a path (excludes bullseye pegs - they don't block the track)
    // excludePegId: optionally exclude a specific peg (the one that's moving)
    isPegBlockingPath(holeId, playerIndex, excludePegId = null) {
        // Bullseye pegs NEVER block path movement - they're in a separate dimension
        if (holeId === 'center') return false;
        
        const player = this.players[playerIndex];
        // Check if any peg (except ones in bullseye, holding, completed circuit, and the moving peg) is on this hole
        return player.peg.some(p => 
            p.holeId === holeId && 
            p.holeType !== 'holding' && 
            !p.inBullseye &&  // Exclude bullseye pegs from blocking
            !p.completedCircuit &&  // Exclude finished pegs (on home hole after winning) from blocking
            (excludePegId === null || p.id !== excludePegId)  // Exclude the moving peg itself
        );
    }

    // Execute a move
    executeMove(move) {
        if (this.phase !== 'play') {
            console.warn('Cannot execute move - not in play phase');
            return false;
        }

        this.phase = 'animating';
        
        const player = this.currentPlayer;
        const peg = player.peg.find(p => p.id === move.pegId);
        
        if (!peg) {
            console.error('Peg not found:', move.pegId);
            this.phase = 'play';
            return false;
        }

        // ================================================================
        // FASTTRACK LOSS RULE:
        // FastTrack status is lost when:
        //   1. Drawing a 4 card (handled at card draw time - sets mustExitFasttrack)
        //   2. The FastTrack peg itself exits to perimeter (handled in FT traversal below)
        //   3. Entering the bullseye (handled below)
        //   4. Player makes ANY non-FastTrack move while having pegs on FT (handled in endTurn)
        //
        // Rule 4 is enforced in endTurn() via ftTraversedThisTurn flag.
        // If the player has FT pegs and doesn't traverse FT during the turn,
        // ALL FT pegs lose their status at end of turn.
        // ================================================================

        // Check for cutting (landing on opponent)
        const targetHole = holeRegistry.get(move.toHoleId);
        let cutPeg = null;
        
        for (const opponent of this.players) {
            if (opponent.index === player.index) continue;
            const opponentPeg = opponent.peg.find(p => p.holeId === move.toHoleId);
            if (opponentPeg) {
                cutPeg = { player: opponent, peg: opponentPeg };
                break;
            }
        }

        // Record move
        this.moveHistory.push({
            turn: this.turnCount,
            player: player.index,
            card: this.currentCard,
            move: move,
            cut: cutPeg ? { player: cutPeg.player.index, peg: cutPeg.peg.id } : null
        });

        // Update peg position
        const oldHoleType = peg.holeType;
        const wasOnFasttrack = peg.onFasttrack;
        const wasInBullseye = peg.inBullseye;
        
        // ── FT traversal tracking ──
        // If this peg was on FastTrack, is entering FastTrack, or is leaving FastTrack, mark FT as traversed this turn
        if (wasOnFasttrack || move.isFastTrackEntry === true || move.isLeaveFastTrack === true) {
            this.ftTraversedThisTurn = true;
        }
        this.madeMoveSinceLastDraw = true;
        
        peg.holeId = move.toHoleId;
        // Use NORMALIZED hole type for consistency (side-left/side-right → outer)
        const normalizedType = getHoleTypeFromId(move.toHoleId);
        peg.holeType = normalizedType ? normalizedType.id : (targetHole ? targetHole.type : 'unknown');
        console.log(`[executeMove] Updated peg ${peg.id} holeType: ${oldHoleType} → ${peg.holeType} (on ${move.toHoleId})`);
        
        // Track entry events for UI banners
        let enteredFasttrack = false;
        let enteredBullseye = false;
        let exitedBullseye = false;
        
        // Handle FastTrack entry/exit
        // IMPORTANT: Landing on ft-* during REGULAR movement (passing through corners) does NOT activate FastTrack mode
        // FastTrack mode is ONLY activated when the move is explicitly marked as isFastTrackEntry
        const isBackwardMove = this.currentCard && this.currentCard.direction === 'backward';
        const isIntentionalFastTrackEntry = move.isFastTrackEntry === true;
        
        console.log('📍 [executeMove] FastTrack check:', {
            targetHoleType: targetHole?.type,
            isBackwardMove: isBackwardMove,
            isIntentionalFastTrackEntry: isIntentionalFastTrackEntry,
            moveFastTrackEntry: move.isFastTrackEntry,
            isLeaveFastTrack: move.isLeaveFastTrack || false,
            wasOnFasttrack: wasOnFasttrack
        });
        
        // ────────────────────────────────────────────────────────
        // LEAVE FASTTRACK: Player chose to exit FT to outer perimeter
        // Must be checked BEFORE the normal FT handling below to prevent
        // the "stay on FT" branch from triggering when destination is ft-*
        // ────────────────────────────────────────────────────────
        if (move.isLeaveFastTrack && wasOnFasttrack) {
            peg.onFasttrack = false;
            peg.fasttrackEntryTurn = null;
            peg.fasttrackEntryHole = null;
            peg.mustExitFasttrack = false;
            // Keep eligibleForSafeZone — they earned it by entering FT
            console.log(`🔄 Peg ${peg.id} LEFT FastTrack to perimeter: ${move.toHoleId}`);
            
            // If landing on own ft-{boardPos} via perimeter, mark as home stretch
            if (move.toHoleId.startsWith('ft-')) {
                const ftHoleIdx = parseInt(move.toHoleId.replace('ft-', ''));
                if (ftHoleIdx === player.boardPosition) {
                    peg.inHomeStretch = true;
                    peg.eligibleForSafeZone = true;
                    console.log(`🏠 Peg ${peg.id} left FT and landed on OWN ft-${player.boardPosition} - NOW IN HOME STRETCH`);
                }
            }
        } else if (targetHole && targetHole.type === 'fasttrack' && !isBackwardMove && isIntentionalFastTrackEntry) {
            // Only mark as "entered" FastTrack if this was an INTENTIONAL FastTrack entry (from side-left-*-4)
            if (!wasOnFasttrack) {
                enteredFasttrack = true;
                peg.fasttrackEntryTurn = this.turnCount; // Track when we entered FastTrack
                peg.fasttrackEntryHole = move.toHoleId;  // Track WHERE we entered FastTrack
                peg.mustExitFasttrack = false; // Reset exit flag
                // FASTTRACK ENTRY = SAFE ZONE ELIGIBLE
                // Entering FastTrack counts as completing a lap - peg will exit at safe zone
                peg.eligibleForSafeZone = true;
                console.log(`Peg ${peg.id} ENTERED FastTrack: ${move.toHoleId} on turn ${this.turnCount} - NOW ELIGIBLE FOR SAFE ZONE`);
                
                // NOTE: Even if entering at your OWN ft-* hole, do NOT lock to safe zone yet!
                // Player must traverse the FastTrack loop and come BACK to their own hole
                // The lock happens when they REACH their exit point after traversing
                const ftHoleIdx = parseInt(move.toHoleId.replace('ft-', ''));
                if (ftHoleIdx === player.boardPosition) {
                    console.log(`📍 Peg ${peg.id} entered FastTrack at OWN corner ${move.toHoleId} - must traverse loop before exiting to safe zone`);
                }
            }
            peg.onFasttrack = true;
        } else if (targetHole && targetHole.type === 'fasttrack' && wasOnFasttrack) {
            // Already on FastTrack, moving to another ft-* hole - KEEP onFasttrack = true
            console.log(`Peg ${peg.id} traversing FastTrack: ${move.toHoleId} (staying in FastTrack mode)`);
            // peg.onFasttrack stays true (don't change it)
            
            // CRITICAL: If landing on own ft-* hole (exit point) AFTER TRAVERSING, LOCK to safe zone
            // Must have entered from a DIFFERENT ft-* hole OR traversed away from entry and returned
            const ftHoleIdx = parseInt(move.toHoleId.replace('ft-', ''));
            if (ftHoleIdx === player.boardPosition) {
                // Check if they entered from a different hole (meaning they traversed)
                // OR if they entered from own hole but have traversed away (move proves traversal)
                const entryHole = peg.fasttrackEntryHole;
                const enteredAtOwnHole = entryHole === move.toHoleId;
                // If entry was at a different hole, or entry was own hole but move came FROM a different ft-*
                // (which proves traversal around the ring), then exit
                if (entryHole && (!enteredAtOwnHole || (enteredAtOwnHole && move.fromHoleId !== move.toHoleId))) {
                    peg.eligibleForSafeZone = true;
                    peg.lockedToSafeZone = true;
                    peg.inHomeStretch = true;  // Now in home stretch - can only go to safe zone
                    peg.onFasttrack = false;   // Exit FastTrack mode
                    console.log(`🏠🔒 Peg ${peg.id} TRAVERSED and reached OWN FastTrack exit ${move.toHoleId} (entered at ${entryHole}) - NOW IN HOME STRETCH, LOCKED TO SAFE ZONE`);
                } else {
                    console.log(`📍 Peg ${peg.id} at own ft-* but hasn't traversed yet (entry: ${entryHole})`);
                }
            }
        } else if (targetHole && targetHole.type === 'fasttrack' && !isIntentionalFastTrackEntry && !wasOnFasttrack) {
            // Landed on ft-* during regular PERIMETER movement (passing through corner) - do NOT activate FastTrack mode
            // This only applies when coming from regular perimeter, not when already on FastTrack
            console.log(`Peg ${peg.id} passed through ft-* corner: ${move.toHoleId} (not entering FastTrack mode)`);
            peg.onFasttrack = false;
            
            // HOME STRETCH CHECK: If this is the player's OWN ft-{boardPosition}, they're now in home stretch
            const ftHoleIdx = parseInt(move.toHoleId.replace('ft-', ''));
            if (ftHoleIdx === player.boardPosition) {
                peg.inHomeStretch = true;
                peg.eligibleForSafeZone = true;
                console.log(`🏠 Peg ${peg.id} landed on OWN ft-${player.boardPosition} via perimeter - NOW IN HOME STRETCH (can only go to safe zone)`);
            }
        } else if (wasOnFasttrack && targetHole && targetHole.type !== 'fasttrack') {
            // Exiting FastTrack
            peg.onFasttrack = false;
            peg.fasttrackEntryTurn = null; // Clear entry tracking
            peg.fasttrackEntryHole = null; // Clear entry hole tracking
            peg.mustExitFasttrack = false;
            console.log(`Peg ${peg.id} exited FastTrack to: ${move.toHoleId}`);
        }
        // Note: If moving backwards onto a FastTrack hole, peg.onFasttrack stays false
        // This prevents triggering FastTrack traversal rules
        
        // FASTTRACK LOSS RULE:
        // FastTrack status is ONLY lost directly in executeMove when:
        // 1. Drawing a 4 card (handled at card draw time - line ~1050)
        // 2. The FastTrack peg itself exits to perimeter (handled above)
        // 3. Entering the bullseye (handled below)
        // 4. Making ANY non-FT move while having FT pegs (enforced in endTurn)
        //
        // Rule 4 is tracked via this.ftTraversedThisTurn flag set above.
        
        // Handle Bullseye (center hole) entry
        if (move.toHoleId === 'center' && !wasInBullseye) {
            peg.inBullseye = true;
            enteredBullseye = true;
            
            // IMPORTANT: Clear FastTrack state when entering bullseye
            // The bullseye is a separate "dimension" - not part of the FastTrack ring
            // When exiting bullseye later, the peg will be on PERIMETER mode, not FastTrack
            if (peg.onFasttrack) {
                console.log(`Peg ${peg.id} leaving FastTrack to enter Bullseye - clearing FastTrack state`);
                peg.onFasttrack = false;
                peg.fasttrackEntryHole = null;  // Clear entry tracking since we're leaving FastTrack
                peg.fasttrackEntryTurn = null;
            }
            
            // Entering bullseye via FastTrack means eligible for safe zone
            if (!peg.eligibleForSafeZone) {
                peg.eligibleForSafeZone = true;
                console.log(`Peg ${peg.id} ENTERED Bullseye - NOW ELIGIBLE FOR SAFE ZONE`);
            } else {
                console.log(`Peg ${peg.id} ENTERED Bullseye!`);
            }
        } else if (wasInBullseye && move.toHoleId !== 'center') {
            peg.inBullseye = false;
            peg.hasExitedBullseye = true; // Mark that peg has exited bullseye - cannot re-enter!
            exitedBullseye = true;
            // BULLSEYE EXIT RULE (Royal card J/Q/K):
            // When exiting bullseye, peg is placed on an ft-* hole but is NOT in FastTrack mode
            // The peg must traverse the REGULAR PERIMETER (outer track) to reach their safe zone
            // This is just a convenient exit point, not a FastTrack entry
            console.log(`🚫 Peg ${peg.id} has EXITED Bullseye - can NEVER re-enter bullseye!`);
            if (move.toHoleId.startsWith('ft-')) {
                // IMPORTANT: Do NOT set onFasttrack = true!
                // Exiting bullseye puts you ON the ft-* corner hole but in PERIMETER mode
                peg.onFasttrack = false;
                peg.eligibleForSafeZone = true; // You've circled via bullseye, now eligible
                peg.fasttrackEntryHole = null;  // Not entering FastTrack
                peg.lockedToSafeZone = false;   // Must traverse perimeter to reach safe zone
                
                console.log(`Peg ${peg.id} exited Bullseye to ft-* corner: ${move.toHoleId} - ON PERIMETER (not FastTrack), must traverse to safe zone`);
            } else {
                console.log(`Peg ${peg.id} exited Bullseye to: ${move.toHoleId}`);
            }
        }
        
        // Track circuit completion - landing on home hole
        const homeHoleId = `home-${player.boardPosition}`;
        if (move.toHoleId === homeHoleId && oldHoleType === 'safezone') {
            peg.completedCircuit = true;
            console.log(`Peg ${peg.id} COMPLETED CIRCUIT - landed on home from safe zone!`);
        }
        
        // 5th peg bypass: safe zone is full (4 pegs), peg lands on home from perimeter
        // BUG FIX: Also check if the CURRENT move's path passes through the safe zone
        // entry hole (outer-{p}-2). SmartPeg's sim correctly updates eligibility mid-path,
        // but the real peg's eligibleForSafeZone is set LATER in executeMove (after this
        // check). When the peg passes through the entry AND lands on home in the SAME
        // move, eligibleForSafeZone is still false here. The path check covers that case.
        const safeZoneEntryForCircuit = `outer-${player.boardPosition}-2`;
        const pathPassesThroughSafeEntry = move.path && move.path.includes(safeZoneEntryForCircuit);
        if (move.toHoleId === homeHoleId && !peg.completedCircuit &&
            oldHoleType !== 'holding' &&
            (peg.eligibleForSafeZone || pathPassesThroughSafeEntry)) {
            const safeZoneCount = player.peg.filter(p => p.holeType === 'safezone' && p.id !== peg.id).length;
            if (safeZoneCount >= 4) {
                peg.completedCircuit = true;
                peg.eligibleForSafeZone = true; // Sync real peg state with what SmartPeg's sim computed
                console.log(`🏆 Peg ${peg.id} COMPLETED CIRCUIT - 5th peg bypassed full safe zone and landed on home!`);
            }
        }
        
        // ============================================================
        // SAFE ZONE ELIGIBILITY TRACKING
        // Player must travel around the board clockwise before entering safe zone
        // The "pivot point" is the SAFE ZONE ENTRY HOLE (outer-{p}-2) - 2 holes LEFT of home
        // When peg passes through or lands on outer-{p}-2 from clockwise, it becomes eligible
        // ============================================================
        
        // SAFE ZONE ENTRY POINT: outer-{p}-2 (2 holes left of home hole in clockwise direction)
        const safeZoneEntryId = `outer-${player.boardPosition}-2`;
        
        // Check if peg traveled through path that includes the SAFE ZONE ENTRY from clockwise direction
        // This means the peg has "completed a lap" and can now enter safe zone
        const pathIncludesSafeEntry = move.path && move.path.includes(safeZoneEntryId);
        const isMovingClockwise = !isBackwardMove;
        
        // IMPORTANT: Only check for lap completion if peg was ALREADY ON THE TRACK
        // Pegs entering from holding (move.type === 'enter') have NOT completed a lap
        const wasOnTrack = move.type !== 'enter' && oldHoleType !== 'holding';
        
        if (pathIncludesSafeEntry && isMovingClockwise && wasOnTrack) {
            // Check that we approached from the LEFT (outer-{p}-1 is the hole before entry)
            const entryIdx = move.path.indexOf(safeZoneEntryId);
            if (entryIdx > 0) {
                const prevHole = move.path[entryIdx - 1];
                // The hole before safe zone entry (outer-{p}-2) in clockwise order is outer-{p}-1
                // Coming from outer-{p}-1 means we approached from the LEFT (clockwise)
                if (prevHole === `outer-${player.boardPosition}-1`) {
                    if (!peg.eligibleForSafeZone) {
                        peg.eligibleForSafeZone = true;
                        console.log(`🏁 Peg ${peg.id} COMPLETED LAP - passed safe zone entry (outer-${player.boardPosition}-2) from LEFT`);
                    }
                    // LOCK TO SAFE ZONE: Once peg passes safe zone entry from clockwise, it MUST enter safe zone
                    if (!peg.lockedToSafeZone) {
                        peg.lockedToSafeZone = true;
                        console.log(`🔒 Peg ${peg.id} LOCKED TO SAFE ZONE - must enter safe zone (cannot continue on outer track)`);
                    }
                }
            }
        }
        
        // Also check if we LANDED on the SAFE ZONE ENTRY hole from clockwise direction
        // IMPORTANT: Only applies to pegs that were ALREADY ON THE TRACK, not pegs entering from holding!
        // A peg entering from holding (move.type === 'enter') has NOT completed a lap
        const isFromTrack = move.type !== 'enter' && oldHoleType !== 'holding';
        if (move.toHoleId === safeZoneEntryId && isMovingClockwise && !peg.eligibleForSafeZone && isFromTrack) {
            peg.eligibleForSafeZone = true;
            console.log(`🏁 Peg ${peg.id} LANDED ON SAFE ZONE ENTRY (${safeZoneEntryId}) from clockwise - now eligible for safe zone`);
            // LOCK TO SAFE ZONE: Landing on safe zone entry from clockwise locks peg to safe zone
            if (!peg.lockedToSafeZone) {
                peg.lockedToSafeZone = true;
                console.log(`🔒 Peg ${peg.id} LOCKED TO SAFE ZONE - must enter safe zone (cannot continue on outer track)`);
            }
        }
        
        // If moving BACKWARD (4 card) and ending up BEFORE the safe zone entry,
        // DO NOT reset safe zone eligibility - once eligible, always eligible
        // On subsequent forward turns, the peg will be FORCED into safe zone
        // (unless safe zone is full)
        // BUT: Clear lockedToSafeZone! The hard lock prevents ALL outer track
        // destinations. If the peg backed up, it may not reach safe zone with
        // every card. Keeping eligibleForSafeZone ensures the path routing
        // still sends it to safe zone when it reaches entry. The lock will be
        // re-applied when the peg passes through safe zone entry clockwise again.
        if (isBackwardMove && oldHoleType !== 'holding' && peg.eligibleForSafeZone) {
            // Track that peg backed up past safe zone entry - they MUST enter safe zone on next forward move
            const destParts = move.toHoleId.split('-');
            const destType = destParts[0];
            const destPlayerSection = parseInt(destParts[1]);
            
            // Check if we've backed up to a position BEFORE safe zone entry (outer-{p}-2)
            // Clockwise order: outer-{p}-0 → outer-{p}-1 → outer-{p}-2 (ENTRY) → outer-{p}-3 → home-{p} → side-right-{p}-*
            // So being at outer-{p}-0 or outer-{p}-1 means we're BEFORE safe zone entry
            const destIdx = destType === 'outer' ? parseInt(destParts[2]) : -1;
            const isBeforeSafeEntry = (destType === 'outer' && destPlayerSection === player.boardPosition && destIdx < 2) ||
                                 (destType === 'side-left') ||
                                 (destPlayerSection !== player.boardPosition && destType !== 'ft' && destType !== 'side-right');
            
            if (isBeforeSafeEntry) {
                // Clear the hard lock — it will be re-applied when the peg
                // passes safe zone entry clockwise again. Keep eligibleForSafeZone so
                // getTrackSequence still routes into safe zone at that point.
                if (peg.lockedToSafeZone) {
                    peg.lockedToSafeZone = false;
                    console.log(`🔓 Peg ${peg.id} backed up past safe zone entry - UNLOCKING safe zone lock (eligibleForSafeZone stays true)`);
                }
                console.log(`🔄 Peg ${peg.id} backed up past safe zone entry to ${move.toHoleId} - STILL eligible for safe zone, will re-lock on next pass through entry`);
            }
        }
        
        // ============================================================
        // SPECIAL CASE: BACKWARD (4 card) TOUCHING SAFE ZONE ENTRY FROM RIGHT
        // If a peg moves BACKWARD and lands ON or BEHIND (before in clockwise order)
        // their OWN safe zone entry hole (outer-{p}-2), they become eligible for safe zone.
        // This is a valid shortcut - touching the entry from the right side.
        // Only applies to the player's OWN section, not other players' sections.
        // Track order (clockwise): side-left-{p}-1→4 → outer-{p}-0→3 → home-{p} → ...
        // Safe zone entry is at outer-{p}-2
        // ============================================================
        if (isBackwardMove && oldHoleType !== 'holding' && !peg.eligibleForSafeZone) {
            const destHoleId = move.toHoleId;
            
            // Check if destination is in player's own section and at/before safe zone entry
            let isOnOrBeforeSafeEntry = false;
            let destPlayerSection = -1;
            
            if (destHoleId.startsWith('outer-')) {
                // outer-{playerIdx}-{holeIdx} - extract indices
                const parts = destHoleId.split('-');
                destPlayerSection = parseInt(parts[1]);
                const destIdx = parseInt(parts[2]);
                // outer-{p}-0, outer-{p}-1, outer-{p}-2 are at or before entry
                if (destPlayerSection === player.boardPosition && destIdx <= 2) {
                    isOnOrBeforeSafeEntry = true;
                }
            } else if (destHoleId.startsWith('side-left-')) {
                // side-left-{playerIdx}-{holeIdx} - these are BEFORE outer-{p}-0 (clockwise)
                // So they are definitely before the safe zone entry
                const parts = destHoleId.split('-');
                destPlayerSection = parseInt(parts[2]); // ['side', 'left', playerIdx, holeIdx]
                if (destPlayerSection === player.boardPosition) {
                    isOnOrBeforeSafeEntry = true;
                }
            }
            
            // Also check if peg PASSED THROUGH safe zone entry while moving backward
            const pathIncludesSafeEntry = move.path && move.path.includes(safeZoneEntryId);
            
            if (isOnOrBeforeSafeEntry || pathIncludesSafeEntry) {
                peg.eligibleForSafeZone = true;
                console.log(`⬅️🏁 Peg ${peg.id} TOUCHED SAFE ZONE ENTRY from RIGHT (backward 4 card) - now eligible for safe zone!`);
                console.log(`⬅️🏁 Destination: ${move.toHoleId}, isOnOrBeforeSafeEntry: ${isOnOrBeforeSafeEntry}, pathIncludesSafeEntry: ${pathIncludesSafeEntry}`);
                // Note: We do NOT set lockedToSafeZone here - the peg touched from the wrong direction
                // They must still reach the entry from the left (clockwise) to actually enter safe zone
                // But now they ARE eligible, so when they move forward next turn they can enter
            }
        }
        
        // Update holding count
        if (oldHoleType === 'holding') {
            player.pegsInHolding--;
            player.pegsOnBoard++;
        }
        
        // Handle cut
        if (cutPeg) {
            this.sendPegToHolding(cutPeg.player, cutPeg.peg);
        }

        // Check win condition
        if (this.checkWinCondition(player)) {
            this.winner = player;
            this.phase = 'gameOver';
            if (this.onGameOver) {
                this.onGameOver(player);
            }
            return true;
        }

        // Notify move executed with entry flags for UI banners
        if (this.onMoveExecuted) {
            this.onMoveExecuted(move, cutPeg, {
                enteredFasttrack: enteredFasttrack,
                enteredBullseye: enteredBullseye,
                exitedBullseye: exitedBullseye,
                fromHolding: oldHoleType === 'holding'
            });
        }

        // ── SmartPeg: Record move and broadcast state ──
        if (window.gameManager && typeof window.gameManager.recordMove === 'function') {
            window.gameManager.recordMove(player, peg, move, this.currentCard || { rank: '?', movement: 0 });
        }

        // Discard card and end turn
        if (this.currentCard) {
            this.deck.discard(this.currentCard);
            
            // Check for extra turn (6 card)
            if (this.currentCard.extraTurn) {
                this.extraTurnPending = true;
            }
        }
        
        this.currentCard = null;
        this.endTurn();
        
        console.log('[GameEngine.executeMove] Turn ended, phase is now:', this.phase);
        
        return true;
    }

    // Send a peg back to holding
    sendPegToHolding(player, peg) {
        // Find an empty holding hole (0-3, 4 pegs in holding area)
        // Use boardPosition for hole IDs since board creates holes at balanced positions
        let targetHoleId = null;
        let isHomeFallback = false;
        const boardPos = player.boardPosition;
        
        for (let i = 0; i < 4; i++) {
            const holdHoleId = `hold-${boardPos}-${i}`;
            // Check if any peg is already in this hole
            const isOccupied = player.peg.some(p => 
                p.holeId === holdHoleId && p.id !== peg.id
            );
            
            if (!isOccupied) {
                targetHoleId = holdHoleId;
                break;
            }
        }
        
        // If all 4 holding holes are full, send to home hole (5th peg starts there)
        if (!targetHoleId) {
            targetHoleId = `home-${boardPos}`;
            isHomeFallback = true;
            console.log(`🏠 [CUT→HOME] All 4 holding holes full for ${player.name}, sending peg ${peg.id} to home hole: ${targetHoleId}`);
        }
        
        console.log(`📍 [SENDPEGTOHOLDING] Peg ${peg.id}: targetHoleId=${targetHoleId}, isHomeFallback=${isHomeFallback}`);
        
        peg.holeId = targetHoleId;
        
        // VERIFY THE STATE WAS SET CORRECTLY
        console.log(`📍 [SENDPEGTOHOLDING] VERIFY: peg.holeId=${peg.holeId}, peg.holeType BEFORE=${peg.holeType}`);
        
        // If sent to home hole, peg can still move (it's on the board, not in holding)
        // Only pegs in actual holding holes (hold-X-Y) are truly in holding
        if (isHomeFallback) {
            peg.holeType = 'home';
            console.log(`📍 [SENDPEGTOHOLDING] Peg ${peg.id} set to holeType='home' - CAN MOVE NEXT TURN`);
            console.log(`📍 [SENDPEGTOHOLDING] VERIFY AFTER: peg.holeId=${peg.holeId}, peg.holeType=${peg.holeType}`);
            // Don't change pegsInHolding/pegsOnBoard counts - peg is still on board
        } else {
            peg.holeType = 'holding';
            player.pegsInHolding++;
            player.pegsOnBoard--;
        }
        peg.onFasttrack = false;
        peg.inBullseye = false;
        peg.completedCircuit = false;  // Reset circuit completion when sent home
        peg.eligibleForSafeZone = false; // Reset safe zone eligibility when sent home
        peg.lockedToSafeZone = false; // Reset safe zone lock when sent home
        peg.fasttrackEntryTurn = null; // Reset FastTrack entry tracking
        peg.fasttrackEntryHole = null; // Reset FastTrack entry hole tracking
        peg.mustExitFasttrack = false; // Reset FT exit flag
        peg.inHomeStretch = false;     // Reset home stretch flag
        peg.hasExitedBullseye = false; // Reset bullseye exit flag — peg can enter again after being cut
        
        console.log(`${player.name}'s peg sent back to ${targetHoleId}`);
    }

    // ================================================================
    // WIN CONDITION CHECK
    // ================================================================
    // WIN REQUIREMENT:
    // - 4 pegs in safe zone (safe-{playerIdx}-{1-4})
    // - 1 peg in HOME hole with completedCircuit flag set
    // 
    // The 5th peg passes THROUGH the safe zone (when all 4 safe holes are full)
    // and lands back on the HOME hole to complete the circuit.
    // ================================================================
    checkWinCondition(player) {
        // Count pegs in safe zone (must be exactly 4)
        const safeZonePegs = player.peg.filter(p => p.holeType === 'safezone').length;
        
        // Check for peg in HOME hole with completedCircuit flag
        const homeHoleId = `home-${player.boardPosition}`;
        const pegInHomeWithCircuit = player.peg.find(p => p.holeId === homeHoleId && p.completedCircuit === true);
        
        // Debug logging
        console.log(`[WIN CHECK] ${player.name}: safeZonePegs=${safeZonePegs}, homeHoleId=${homeHoleId}`);
        console.log(`[WIN CHECK] Peg in HOME with completedCircuit:`, pegInHomeWithCircuit ? pegInHomeWithCircuit.id : 'none');
        player.peg.forEach(p => {
            console.log(`  - ${p.id}: holeId=${p.holeId}, holeType=${p.holeType}, completedCircuit=${p.completedCircuit}`);
        });
        
        // WIN: 4 pegs in safe zone + 1 peg in HOME with completedCircuit
        if (safeZonePegs === 4 && pegInHomeWithCircuit) {
            console.log(`🏆 ${player.name} WINS! 4 in safe zone + 1 completed circuit in HOME`);
            return true;
        }
        return false;
    }

    // End current turn
    endTurn() {
        // Dispatch event for Mom Daemon
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('turnChanged', { 
                detail: { 
                    previousPlayerIndex: this.currentPlayerIndex,
                    gameState: this 
                } 
            }));
        }
        
        // ════════════════════════════════════════════════════════════
        // FASTTRACK LOSS RULE — enforced at end of turn
        // If the player made a move this turn but did NOT traverse FastTrack,
        // and they have pegs on FastTrack → ALL FT pegs lose their status.
        // This forces players to always prioritize their FT pegs.
        // Exception: card 4 already handled at draw time (mustExitFasttrack).
        // Exception: skipTurn (no move made) does NOT trigger loss.
        // ════════════════════════════════════════════════════════════
        const turningPlayer = this.currentPlayer;
        if (this.madeMoveSinceLastDraw && !this.ftTraversedThisTurn) {
            const ftPegs = turningPlayer.peg.filter(p => p.onFasttrack && !p.mustExitFasttrack);
            if (ftPegs.length > 0) {
                console.log(`⚠️ FT LOSS: ${turningPlayer.name} made non-FT move with ${ftPegs.length} peg(s) on FastTrack — losing all FT status`);
                for (const p of ftPegs) {
                    p.onFasttrack = false;
                    p.fasttrackEntryHole = null;
                    p.fasttrackEntryTurn = null;
                    p.mustExitFasttrack = false;
                    console.log(`  📤 ${p.id} at ${p.holeId} lost FastTrack status`);
                }
            }
        }

        let wasExtraTurn = false;
        if (this.extraTurnPending) {
            // Same player gets another turn
            this.extraTurnPending = false;
            wasExtraTurn = true;
            this.phase = 'draw';
            console.log(`${this.currentPlayer.name} gets an extra turn!`);
        } else {
            // Next player
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerCount;
            this.turnCount++;
            this.phase = 'draw';
            console.log(`Turn ${this.turnCount}: ${this.currentPlayer.name}'s turn`);
        }
        
        // Track if this turn was an extra turn for UI purposes
        this.lastTurnWasExtra = wasExtraTurn;
        
        if (this.onTurnEnd) {
            this.onTurnEnd(this.currentPlayer, wasExtraTurn);
        }
        
        this.notifyStateChange();
    }

    // Skip turn (when no legal moves)
    skipTurn() {
        console.log(`${this.currentPlayer.name} has no legal moves - skipping turn`);
        this.deck.discard(this.currentCard);
        this.currentCard = null;
        this.extraTurnPending = false; // No extra turn if no legal move
        this.endTurn();
    }

    // Notify state change
    notifyStateChange() {
        if (this.onStateChange) {
            this.onStateChange({
                phase: this.phase,
                currentPlayer: this.currentPlayer,
                turnCount: this.turnCount,
                deckRemaining: this.deck.remaining
            });
        }
    }
}

// ============================================================
// SUBSTRATE EVENT INTEGRATION
// ============================================================

// Bridge game engine events to GameEventSubstrate
function linkEngineToSubstrate(gameState) {
    if (typeof GameEventSubstrate === 'undefined') return;
    
    const originalOnCardDrawn = gameState.onCardDrawn;
    gameState.onCardDrawn = function(card) {
        GameEventSubstrate.emit(GameEventSubstrate.types.CARD_DRAWN, {
            player: gameState.currentPlayer,
            card: card
        });
        if (originalOnCardDrawn) originalOnCardDrawn(card);
    };
    
    const originalOnMoveExecuted = gameState.onMoveExecuted;
    gameState.onMoveExecuted = function(move, cutPeg) {
        GameEventSubstrate.emit(GameEventSubstrate.types.MOVE_EXECUTED, {
            player: gameState.currentPlayer,
            move: move,
            cut: cutPeg
        });
        
        if (cutPeg) {
            GameEventSubstrate.emit(GameEventSubstrate.types.PEG_CUT, {
                cutter: gameState.currentPlayer,
                victim: cutPeg.player,
                peg: cutPeg.peg
            });
        }
        
        if (move.type === 'enter') {
            GameEventSubstrate.emit(GameEventSubstrate.types.PEG_ENTERED, {
                player: gameState.currentPlayer,
                pegId: move.pegId
            });
        }
        
        if (move.toHoleId && move.toHoleId.startsWith('ft-')) {
            GameEventSubstrate.emit(GameEventSubstrate.types.FAST_TRACK_USED, {
                player: gameState.currentPlayer,
                move: move
            });
        }
        
        if (originalOnMoveExecuted) originalOnMoveExecuted(move, cutPeg);
    };
    
    const originalOnTurnEnd = gameState.onTurnEnd;
    gameState.onTurnEnd = function(player) {
        GameEventSubstrate.emit(GameEventSubstrate.types.TURN_END, {
            player: player,
            turnCount: gameState.turnCount
        });
        
        if (gameState.extraTurnPending) {
            GameEventSubstrate.emit(GameEventSubstrate.types.EXTRA_TURN, {
                player: player
            });
        }
        
        if (originalOnTurnEnd) originalOnTurnEnd(player);
    };
    
    const originalOnGameOver = gameState.onGameOver;
    gameState.onGameOver = function(winner) {
        GameEventSubstrate.emit(GameEventSubstrate.types.GAME_OVER, {
            winner: winner,
            turnCount: gameState.turnCount
        });
        if (originalOnGameOver) originalOnGameOver(winner);
    };
    
    // Add helper methods for split moves (7 card)
    gameState.calculateDestinationsForPeg = function(peg, steps) {
        // Create a temporary card-like object with the step count
        const tempCard = {
            movement: steps,
            direction: 'clockwise'
        };
        return this.calculateDestinations(peg, tempCard, this.currentPlayer);
    };
    
    gameState.executeMoveWithoutEndingTurn = function(move) {
        const player = this.currentPlayer;
        
        // Find the peg
        const peg = player.peg.find(p => p.id === move.pegId);
        if (!peg) return null;
        
        // Check for cut
        let cutPeg = null;
        for (const otherPlayer of this.players) {
            if (otherPlayer.index === player.index) continue;
            
            const victimPeg = otherPlayer.peg.find(p => p.holeId === move.toHoleId);
            if (victimPeg) {
                cutPeg = { player: otherPlayer, peg: victimPeg };
                // Send to holding using proper function
                this.sendPegToHolding(otherPlayer, victimPeg);
                break;
            }
        }
        
        // Store old state for flag updates
        const oldHoleType = peg.holeType;
        const wasOnFasttrack = peg.onFasttrack;
        const wasInBullseye = peg.inBullseye;
        
        // ── FT traversal tracking (for split sub-moves) ──
        if (wasOnFasttrack || move.isFastTrackEntry) {
            this.ftTraversedThisTurn = true;
        }
        this.madeMoveSinceLastDraw = true;
        
        // Move the peg
        peg.holeId = move.toHoleId;
        // Use normalized holeType for consistency
        const normalizedMoveType = getHoleTypeFromId(move.toHoleId);
        peg.holeType = normalizedMoveType ? normalizedMoveType.id : (move.toHoleType || 'track');
        
        // Handle Bullseye state (same logic as executeMove)
        if (move.toHoleId === 'center' && !wasInBullseye) {
            peg.inBullseye = true;
            if (peg.onFasttrack) {
                peg.onFasttrack = false;
                peg.fasttrackEntryHole = null;
                peg.fasttrackEntryTurn = null;
            }
            if (!peg.eligibleForSafeZone) {
                peg.eligibleForSafeZone = true;
            }
            console.log(`[splitMove] Peg ${peg.id} ENTERED Bullseye`);
        } else if (wasInBullseye && move.toHoleId !== 'center') {
            peg.inBullseye = false;
            peg.hasExitedBullseye = true; // Mark as exited - cannot re-enter!
            peg.onFasttrack = false;
            peg.eligibleForSafeZone = true;
            console.log(`[splitMove] Peg ${peg.id} EXITED Bullseye - can NEVER re-enter!`);
        }
        
        // Update FastTrack flags (same logic as executeMove but simplified for split)
        const targetHole = holeRegistry.get(move.toHoleId);
        if (move.isLeaveFastTrack && wasOnFasttrack) {
            // Player chose to leave FastTrack to perimeter
            peg.onFasttrack = false;
            peg.fasttrackEntryTurn = null;
            peg.fasttrackEntryHole = null;
            peg.mustExitFasttrack = false;
            console.log(`[splitMove] Peg ${peg.id} LEFT FastTrack to perimeter: ${move.toHoleId}`);
            if (move.toHoleId.startsWith('ft-')) {
                const ftHoleIdx = parseInt(move.toHoleId.replace('ft-', ''));
                if (ftHoleIdx === player.boardPosition) {
                    peg.inHomeStretch = true;
                    peg.eligibleForSafeZone = true;
                }
            }
        } else if (targetHole && targetHole.type === 'fasttrack' && move.isFastTrackEntry && !wasOnFasttrack) {
            peg.onFasttrack = true;
            peg.eligibleForSafeZone = true;
            peg.fasttrackEntryTurn = this.turnCount;
            peg.fasttrackEntryHole = move.toHoleId;
            console.log(`[splitMove] Peg ${peg.id} ENTERED FastTrack at ${move.toHoleId}`);
        } else if (targetHole && targetHole.type === 'fasttrack' && wasOnFasttrack) {
            // Stay in fasttrack mode
            const ftHoleIdx = parseInt(move.toHoleId.replace('ft-', ''));
            if (ftHoleIdx === player.boardPosition && peg.fasttrackEntryHole && peg.fasttrackEntryHole !== move.toHoleId) {
                peg.eligibleForSafeZone = true;
                peg.lockedToSafeZone = true;
                console.log(`[splitMove] Peg ${peg.id} reached FT exit - LOCKED TO SAFE ZONE`);
            }
        } else if (wasOnFasttrack && targetHole && targetHole.type !== 'fasttrack') {
            peg.onFasttrack = false;
            peg.fasttrackEntryTurn = null;
            peg.fasttrackEntryHole = null;
        }
        
        // Update safe zone eligibility if path includes safe zone entry (outer-{p}-2)
        const safeZoneEntryId = `outer-${player.boardPosition}-2`;
        if (move.path && move.path.includes(safeZoneEntryId) && oldHoleType !== 'holding') {
            const entryIdx = move.path.indexOf(safeZoneEntryId);
            // Must approach from outer-{p}-1 (clockwise direction)
            if (entryIdx > 0 && move.path[entryIdx - 1] === `outer-${player.boardPosition}-1`) {
                peg.eligibleForSafeZone = true;
                peg.lockedToSafeZone = true;
                console.log(`[splitMove] Peg ${peg.id} passed safe zone entry (${safeZoneEntryId}) - LOCKED TO SAFE ZONE`);
            }
        }
        
        // Handle holdings count
        if (oldHoleType === 'holding') {
            player.pegsInHolding--;
            player.pegsOnBoard++;
        }
        
        // Trigger move event
        if (this.onMoveExecuted) {
            this.onMoveExecuted(move, cutPeg);
        }
        
        return cutPeg;
    };
    
    console.log('Game engine linked to GameEventSubstrate');
}

// ============================================================
// GAME MANAGER - Validates moves, compensates for errors,
// broadcasts state to all players
// ============================================================

class GameManager {
    constructor() {
        this.gameState = null;
        this.moveLog = [];          // Complete audit trail of all moves
        this.stateSnapshots = [];   // Periodic snapshots for rollback
        this.listeners = new Set(); // State change listeners
        this.autoCorrectEnabled = true;
        this.maxSnapshotHistory = 50;
    }

    // Link to the game engine's GameState
    link(gameState) {
        this.gameState = gameState;
        this._wrapCallbacks();
        console.log('[GameManager] Linked to GameState');
        return this;
    }

    // ---- Move Validation ----

    // Validate a move BEFORE execution using hop counting
    validateMove(move) {
        if (!this.gameState) return { valid: false, reason: 'No game state linked' };

        const player = this.gameState.currentPlayer;
        const card = this.gameState.currentCard;
        if (!player || !card) return { valid: false, reason: 'No active player or card' };

        const peg = player.peg.find(p => p.id === move.pegId);
        if (!peg) return { valid: false, reason: `Peg ${move.pegId} not found` };

        // Entry moves (from holding) don't need hop validation
        if (move.type === 'enter') {
            const canEnter = card.canEnter === true;
            return { valid: canEnter, reason: canEnter ? 'OK' : 'Card cannot enter' };
        }

        // Validate hop count against card
        const path = move.path || [];
        const actualHops = path.length > 0 ? path.length - 1 : 0; // path includes start
        const expectedHops = move.steps || card.movement;

        const result = {
            valid: true,
            pegId: move.pegId,
            fromHoleId: move.fromHoleId || peg.holeId,
            toHoleId: move.toHoleId,
            expectedHops,
            actualHops,
            hopMatch: actualHops === expectedHops,
            path: [...path]
        };

        // Hop count mismatch — flag but allow (auto-correct later)
        if (!result.hopMatch && !move.isCenterOption) {
            console.warn(`[GameManager] Hop mismatch for peg ${peg.id}: expected ${expectedHops}, got ${actualHops}`);
            result.warning = 'hop_mismatch';
            if (this.autoCorrectEnabled) {
                result.corrected = true;
                result.correctionNote = `Path has ${actualHops} hops but card says ${expectedHops}. Using path as source of truth.`;
            }
        }

        // Check that destination is reachable (exists in legal moves)
        const legalMoves = this.gameState.calculateLegalMoves();
        const isLegal = legalMoves.some(m =>
            m.pegId === move.pegId &&
            m.toHoleId === move.toHoleId &&
            (m.isFastTrackEntry || false) === (move.isFastTrackEntry || false)
        );
        if (!isLegal) {
            result.valid = false;
            result.reason = `Move to ${move.toHoleId} not in legal moves`;
        }

        return result;
    }

    // Execute a validated move with full audit trail
    executeValidatedMove(move) {
        const validation = this.validateMove(move);

        // Take pre-move snapshot
        this._takeSnapshot('pre-move');

        // Log the move
        this.moveLog.push({
            timestamp: Date.now(),
            turn: this.gameState.turnCount,
            playerIndex: this.gameState.currentPlayerIndex,
            card: this.gameState.currentCard ? { ...this.gameState.currentCard } : null,
            move: { ...move },
            validation
        });

        if (!validation.valid) {
            console.error(`[GameManager] INVALID move rejected:`, validation.reason);
            return { success: false, validation };
        }

        if (validation.warning) {
            console.warn(`[GameManager] Move executed with warning: ${validation.warning}`);
        }

        return { success: true, validation };
    }

    // ---- State Broadcasting ----

    // Subscribe to state changes
    onStateChange(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    // Broadcast current state to all listeners
    broadcastState(eventType, data) {
        const state = this._getStateSnapshot();
        const event = { type: eventType, data, state, timestamp: Date.now() };

        this.listeners.forEach(fn => {
            try { fn(event); } catch (e) { console.error('[GameManager] Listener error:', e); }
        });
    }

    // Get a summary of the current game state (for multiplayer sync)
    getStateSummary() {
        if (!this.gameState) return null;
        return {
            phase: this.gameState.phase,
            currentPlayerIndex: this.gameState.currentPlayerIndex,
            turnCount: this.gameState.turnCount,
            currentCard: this.gameState.currentCard,
            players: this.gameState.players.map(p => ({
                index: p.index,
                name: p.name,
                color: p.color,
                pegsInHolding: p.pegsInHolding,
                pegsOnBoard: p.pegsOnBoard,
                pegsInSafeZone: p.pegsInSafeZone,
                hasWon: p.hasWon,
                pegs: p.peg.map(pg => ({
                    id: pg.id,
                    holeId: pg.holeId,
                    holeType: pg.holeType,
                    onFasttrack: pg.onFasttrack,
                    inBullseye: pg.inBullseye,
                    hasExitedBullseye: pg.hasExitedBullseye,
                    eligibleForSafeZone: pg.eligibleForSafeZone,
                    lockedToSafeZone: pg.lockedToSafeZone,
                    completedCircuit: pg.completedCircuit
                }))
            })),
            moveCount: this.moveLog.length
        };
    }

    // ---- Error Compensation ----

    // Detect and fix stuck states (pegs incorrectly blocked)
    detectAndFixStuckState() {
        if (!this.gameState) return { fixed: false };
        const fixes = [];
        const player = this.gameState.currentPlayer;
        if (!player) return { fixed: false };

        for (const peg of player.peg) {
            if (peg.holeType === 'holding') continue;

            // Fix 1: lockedToSafeZone on a peg that's on the home hole but hasn't circuited
            if (peg.lockedToSafeZone && peg.holeType === 'home' && !peg.completedCircuit && !peg.eligibleForSafeZone) {
                peg.lockedToSafeZone = false;
                fixes.push({ pegId: peg.id, fix: 'unlocked_from_safezone', reason: 'Home peg with no circuit completion' });
            }

            // Fix 2: peg flagged onFasttrack but not on an ft-* or center hole
            if (peg.onFasttrack && !peg.holeId.startsWith('ft-') && peg.holeId !== 'center') {
                peg.onFasttrack = false;
                peg.fasttrackEntryTurn = null;
                peg.fasttrackEntryHole = null;
                fixes.push({ pegId: peg.id, fix: 'cleared_fasttrack_flag', reason: `Peg at ${peg.holeId} not on FT hole` });
            }

            // Fix 3: peg flagged inBullseye but not at center
            if (peg.inBullseye && peg.holeId !== 'center') {
                peg.inBullseye = false;
                fixes.push({ pegId: peg.id, fix: 'cleared_bullseye_flag', reason: `Peg at ${peg.holeId} not at center` });
            }
        }

        if (fixes.length > 0) {
            console.log(`[GameManager] Auto-fixed ${fixes.length} stuck state(s):`, fixes);
            this.broadcastState('auto_fix', { fixes });
        }

        return { fixed: fixes.length > 0, fixes };
    }

    // ---- Internal Methods ----

    _takeSnapshot(label) {
        if (!this.gameState) return;
        if (this.stateSnapshots.length >= this.maxSnapshotHistory) {
            this.stateSnapshots.shift();
        }
        this.stateSnapshots.push({
            label,
            timestamp: Date.now(),
            turn: this.gameState.turnCount,
            state: this._getStateSnapshot()
        });
    }

    _getStateSnapshot() {
        if (!this.gameState) return {};
        return {
            phase: this.gameState.phase,
            currentPlayerIndex: this.gameState.currentPlayerIndex,
            turnCount: this.gameState.turnCount,
            pegs: this.gameState.players.flatMap(p =>
                p.peg.map(pg => ({ id: pg.id, holeId: pg.holeId, holeType: pg.holeType }))
            )
        };
    }

    // Wrap GameState callbacks to broadcast events automatically
    _wrapCallbacks() {
        const gs = this.gameState;
        const self = this;

        const origOnCardDrawn = gs.onCardDrawn;
        const origOnMoveExec = gs.onMoveExecuted;
        const origOnTurnEnd = gs.onTurnEnd;
        const origOnGameOver = gs.onGameOver;

        // We don't override callbacks directly here because 3d.html
        // sets them after engine init. Instead, provide a hook method.
        // The board should call gameManager.onBeforeMove(move) and
        // gameManager.onAfterMove(move, result) in its execution pipeline.
    }

    // Called by 3d.html BEFORE executing a move
    onBeforeMove(move) {
        // Run stuck-state detection before each move
        this.detectAndFixStuckState();

        const validation = this.executeValidatedMove(move);
        this.broadcastState('move_start', { move, validation });
        return validation;
    }

    // Called by 3d.html AFTER a move completes
    onAfterMove(move, result) {
        this._takeSnapshot('post-move');
        this.broadcastState('move_complete', { move, result });
        
        // Ping the music substrate for sound feedback
        if (typeof MusicSubstrate !== 'undefined' && move && move.toHoleId) {
            try {
                // Different ping styles for different move types
                if (move.type === 'capture' || result?.cutPeg) {
                    // Dramatic chord for captures
                    const coords = MusicSubstrate.holeToSubstrate(move.toHoleId);
                    MusicSubstrate.pingChord([
                        { x: coords.x - 10, y: coords.y + 20 },
                        { x: coords.x, y: coords.y },
                        { x: coords.x + 10, y: coords.y + 20 }
                    ], { duration: 0.4, volume: 0.2 });
                } else if (move.toHoleId === 'center') {
                    // Victory-like ascending ping for bullseye
                    MusicSubstrate.pingSequence([
                        { x: 50, y: 50 },
                        { x: 65, y: 65 },
                        { x: 80, y: 80 }
                    ], 100, { duration: 0.3, volume: 0.15 });
                } else if (move.toHoleId.startsWith('safe-')) {
                    // Gentle safe zone ping
                    MusicSubstrate.pingHole(move.toHoleId, { duration: 0.4, volume: 0.12 });
                } else {
                    // Standard move ping
                    MusicSubstrate.pingHole(move.toHoleId, { duration: 0.2, volume: 0.1 });
                }
            } catch (e) {
                console.warn('[onAfterMove] Music ping error:', e);
            }
        }
    }
}

// Create global singleton
const gameManager = new GameManager();

// ============================================================
// EXPORTS (for ES modules or global)
// ============================================================

if (typeof window !== 'undefined') {
    window.FastrackEngine = {
        // Core classes
        GameState,
        Deck,
        GameManager,
        
        // Constants for rule checking
        CARD_TYPES,
        SUITS,
        HOLE_TYPES,
        
        // Helper functions
        getHoleTypeFromId,
        linkEngineToSubstrate,
        
        // Singleton instances
        gameManager,
        
        // Quick access to substrates
        get Substrates() {
            return typeof FastTrackSubstrates !== 'undefined' ? FastTrackSubstrates : null;
        }
    };
    
    // Also expose gameManager directly for easy access
    window.gameManager = gameManager;
    
    // SecuritySubstrate: Seal card definitions and hole types on integrity manifold (z=xy² — φ³)
    if (typeof SecuritySubstrate !== 'undefined') {
        SecuritySubstrate.freezeCardDefinitions(CARD_TYPES);
        SecuritySubstrate.sealObject('SUITS', SUITS);
        SecuritySubstrate.sealObject('HOLE_TYPES', HOLE_TYPES);
    }
    
    console.log('FastrackEngine loaded with GameManager and deterministic rule definitions');
}