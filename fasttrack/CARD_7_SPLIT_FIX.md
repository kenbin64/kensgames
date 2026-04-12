# Card 7 Split - Implementation Fix

## Problem
The Card 7 split functionality was broken because it generated all possible moves (1-7 steps) for all eligible pegs upfront, creating a confusing UX where players couldn't clearly understand they needed to make exactly **2 moves with 2 different pegs totaling 7 steps**.

## Solution

### **Two-Step Interactive Flow**

The Card 7 split now uses a clear, guided process:

1. **Select First Peg** → Player taps any eligible peg
2. **Select First Move** → Player chooses destination (1-6 steps, showing remaining)
3. **Select Second Peg** → Player taps a different eligible peg
4. **Select Second Move** → Player moves exactly the remaining steps (auto-calculated)

### **Key Constraints**

- **Exactly 2 pegs** must be used (cannot use same peg twice)
- **Total of 7 steps** across both moves
- **First move: 1-6 steps** (if you use all 7, no second peg needed)
- **Second move: remaining steps** (automatically calculated)
- Both moves must be **clockwise** (never backward)
- Each move must be **independently legal**

### **Code Changes**

#### 1. Game Engine (`game_engine.js`)

**Before:** Generated all possible `split_first` moves (1-7 steps for each peg)
```javascript
// OLD CODE - Generated hundreds of moves
for (const peg of pegsEligibleForSplit) {
    for (let steps = 1; steps <= 7; steps++) {
        // Generate move for each step count
        splitMoves.push({
            type: 'split_first',
            pegId: peg.id,
            steps: steps,
            remainingSteps: 7 - steps,
            // ...
        });
    }
}
```

**After:** Returns a single `split_mode` marker
```javascript
// NEW CODE - Let UI handle interactive selection
if (pegsEligibleForSplit.length >= 2) {
    legalMoves.length = 0;
    legalMoves.push({
        type: 'split_mode',
        eligiblePegs: pegsEligibleForSplit.map(p => p.id),
        description: '7 Card Split: Select 2 pegs to move (total 7 steps)'
    });
}
```

#### 2. UI Handler (`board_3d.html`)

**Before:** Checked `card.canSplit` flag
```javascript
if (card.canSplit && !isAIPlayer(playerIdx)) {
    startSplitMoveMode();
}
```

**After:** Checks for `split_mode` type
```javascript
if (legalMoves.length > 0 && legalMoves[0].type === 'split_mode' && !isAIPlayer(playerIdx)) {
    startSplitMoveMode();
}
```

### **User Experience**

#### Human Players
1. Card 7 is drawn
2. UI shows: "✂️ 7 Split: Tap peg (#1, #2, #3)"
3. Player taps first peg
4. UI shows: "Peg #1: Choose steps (1-7)" with highlighted destinations
5. Player taps destination (e.g., 3 steps used)
6. UI shows: "Tap peg (#2, #3) for 4" (remaining steps)
7. Player taps second peg
8. UI shows: "Peg #2: Tap destination" (exactly 4 steps)
9. Player taps destination
10. Turn ends

#### AI Players
- AI uses `aiExecute7CardSplit()` function
- Evaluates all possible split combinations
- Uses ManifoldAI geometric scoring if available
- Selects best split based on strategic value
- Executes both moves automatically

### **Split Eligibility Rules**

A peg is eligible for Card 7 split if:
- ❌ NOT in holding area
- ❌ NOT in bullseye (center)
- ❌ NOT completed circuit (in safe zone)
- ✅ On outer track OR FastTrack (with conditions)

**FastTrack Special Rules:**
- A single FT peg must complete its FT circuit before splitting with outer-track pegs
- **Exception:** Two pegs both on FT can split with each other
- Peg has "completed FT" when it reaches its own `ft-{playerIdx}` hole

### **Cutting Rules**

- Cuts can **only** happen on the **second** sub-move
- First sub-move cannot cut opponents
- This prevents abuse of the split mechanic

### **Edge Cases Handled**

1. **Only 1 active peg** → Moves all 7 spaces normally (no split)
2. **First move uses all 7** → Turn ends immediately (no second peg)
3. **No valid second moves** → Turn ends after first move
4. **Opponent blocking** → Validates opponent can receive cut before allowing move

### **Testing Checklist**

- [ ] 2+ pegs on outer track → Split mode activates
- [ ] 1 peg on outer track → Moves 7 spaces normally
- [ ] First move 1-6 steps → Second peg selection appears
- [ ] First move 7 steps → Turn ends immediately
- [ ] Cannot select same peg twice
- [ ] Second move uses exact remaining steps
- [ ] FT peg + outer peg → FT must complete circuit first
- [ ] 2 FT pegs → Can split with each other
- [ ] AI executes split intelligently
- [ ] Cutting only on second move

### **Files Modified**

1. `/opt/butterflyfx/dimensionsos/web/games/fasttrack/game_engine.js`
   - Lines 1311-1371: Changed split move generation logic

2. `/opt/butterflyfx/dimensionsos/web/games/fasttrack/board_3d.html`
   - Lines 6743-6755: Updated human player split detection
   - Lines 6757-6772: Updated AI player split detection

### **Related Functions**

- `startSplitMoveMode()` - Initiates interactive split mode
- `handleSplitPegClick()` - Handles peg selection during split
- `calculateMovesForPegRange()` - Calculates valid moves for a peg
- `executeSplitMoveFirst()` - Executes first sub-move
- `executeSplitMoveSecond()` - Executes second sub-move
- `aiExecute7CardSplit()` - AI split decision logic

### **Visual Indicators**

- **Green glow** on selectable pegs
- **Peg numbers** shown above selectable pegs
- **Split indicator** at top: "✂️ 7 Split: [instruction] | X left"
- **Highlighted destinations** for selected peg
- **Card popup** showing "7 - SPLIT"

---

## Summary

The Card 7 split is now a **guided, two-step process** that clearly communicates to the player:
1. Which pegs can be selected
2. How many steps they're choosing for the first move
3. How many steps remain for the second move
4. Which peg must be selected second

This eliminates confusion and ensures players understand the "2 pegs, 2 moves, 7 total steps" constraint.
