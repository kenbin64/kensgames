# Fast Track Dimensional Programming - Implementation Plan

## Project Overview
Build the Fast Track board game using ButterflyFX Dimensional Programming paradigm - treating game entities as complete Objects with 7-level dimensional states, token signatures, and the helix kernel operations.

## Information Gathered

### Dimensional Kernel (helix/dimensional_kernel.py)
- **7 Layers**: SPARK(1) → MIRROR(2) → RELATION(3) → FORM(4) → LIFE(5) → MIND(6) → COMPLETION(7)
- **Operations**: lift, map, bind, navigate, transform, merge, resolve
- **Helix State**: (spiral, level) coordinates
- **Token Signatures**: Which levels a token can inhabit
- **Materialization**: μ - filter tokens by current helix state

### Fast Track Game Rules
- 2-6 players, hexagonal board with 36 outer holes, 6 FastTrack holes, 1 bullseye
- Card deck (54 cards), pegs, movement rules, cutting, safe zones, winning

### Key Deficiencies to Address (from car_sim evaluation)
- Missing Helix state machine
- No INVOKE/SPIRAL/COLLAPSE operations
- No token signatures for level compatibility
- Mutable state (should be immutable)
- No materialization function μ

## Implementation Plan

### Phase 1: Core Dimensional Foundation
1. **DimensionalGameObject class** - Base class for all game entities
   - Helix state (spiral, level)
   - Substrate with token signatures
   - INVOKE(level), SPIRAL_UP(), SPIRAL_DOWN(), COLLAPSE()
   - Materialization function μ

2. **Token Schema**
   ```javascript
   {
     value: any,
     signature: [1,2,3,4,5,6],  // Which levels can see this
     relations: [],
     metadata: { created, lastMaterialized, materializationCount }
   }
   ```

### Phase 2: Game Entity Objects
3. **DimensionalPeg** - Each game peg
   - Position token (level 1-2)
   - Movement token (level 3-4)
   - State tokens (level 5-6): onFasttrack, inBullseye, completedCircuit
   - Full state at level 7

4. **DimensionalPlayer** - Player with 5 pegs
   - Identity tokens (level 1): name, color, avatar
   - Peg array (level 2-3)
   - Game state tokens (level 4-5): pegsInHolding, safeZoneCount
   - Victory tokens (level 6-7)

5. **DimensionalCard** - Playing card
   - Rank/suit (level 1)
   - Movement value (level 2)
   - Special abilities (level 3-4): canEnterFromHolding, canExitBullseye, canSplit
   - Full rules at level 5+

6. **DimensionalHole** - Board hole position
   - Hole ID (level 1)
   - Type (level 2): holding, home, outer, fasttrack, center, safezone
   - Adjacency (level 3-4): next holes in each direction
   - Owner info (level 5-6)

### Phase 3: Game State & Operations
7. **DimensionalGameState** - Complete game state
   - Player array (level 2+)
   - Current turn tokens (level 3+)
   - Deck tokens (level 4+)
   - Full state at completion

8. **Game Operations** (as dimensional transforms)
   - DRAW_CARD: Materialize card at current level
   - MOVE_PEG: Transform peg position through levels
   - CUT_OPPONENT: Merge/cut operations
   - WIN_CHECK: Resolve at completion level

### Phase 4: UI Integration
9. **DimensionalRenderer** - Level-aware rendering
   - Level 1: Show player names/colors only
   - Level 2: Show peg positions (abstract)
   - Level 3-4: Show movement options
   - Level 5-6: Full game state
   - Level 7: Complete with animations

10. **Demo/Play HTML** - Interactive game

## Files to Create
- `web/games/fasttrack/dimensional_fasttrack.js` - Core dimensional game
- `web/games/fasttrack/dimensional/dimensional_kernel.js` - Kernel (copy/modify from helix)
- `web/games/fasttrack/dimensional/game_objects.js` - Peg, Player, Card, Hole objects
- `web/games/fasttrack/dimensional/game_state.js` - Game state management
- `web/games/fasttrack/dimensional_fasttrack.html` - Playable demo

## Follow-up Steps
1. Create dimensional kernel subset for browser
2. Implement token schema
3. Build dimensional game objects
4. Create playable HTML demo
5. Test with multiple players

