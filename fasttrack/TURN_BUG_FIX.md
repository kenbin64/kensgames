# Turn Skipping Bug Analysis and Fix

## Symptoms
- Human players being skipped, only AI players take turns
- Occasionally a human gets a turn but turn order is inconsistent
- Not going around the board in proper rotation

## Root Cause

The bug has multiple interacting causes:

### 1. Race condition in `waitForAnimations` callback registration

In `executeMove()`, the sequence is:
1. `raiseAnimationBarrier()` → `_moveBarrier = true`
2. `renderBoard()` → `renderBoard3D()` → `_lowerBarrier()` → calls `_checkAnimsDone()` (finds `_onAnimsDone === null`, does nothing)
3. `waitForAnimations(callback)` → stores `_onAnimsDone = callback`

When animations ARE triggered (`_deferredAnims.length > 0`):
- `_lowerBarrier()` runs at end of `renderBoard3D()` → `_animatingPegs.size === 0` (animations haven't started yet, they're deferred by `CameraDirector.whenSettled`)
- `_animatingPegs.size === 0 && !_moveBarrier` → `waitForAnimations` fires the callback IMMEDIATELY (step 3)
- The turn advances via the callback → cutscenes → `advanceTurn` → `endTurn`
- LATER, the camera settles → animations start → `_animatingPegs` gets populated
- When animations complete → `_onAnimsDone` fires → but `_onAnimsDone` was already cleared by step 3's immediate fire!

This means: **the turn advances before animations even begin.** The next player's turn starts while the previous player's peg is still mid-hop. This causes visual jank but isn't the main gameplay bug.

### 2. The REAL gameplay bug: Animations that never complete

When `_deferredAnims.length === 0` (no position changes, e.g., enter holding):
- `_lowerBarrier()` fires → `_animatingPegs.size === 0` → `_onAnimsDone === null` → nothing
- `waitForAnimations()` sees `_animatingPegs.size === 0 && !_moveBarrier` → fires callback immediately → correct

But when `_deferredAnims.length > 0` AND `waitForAnimations` fires immediately (because animations haven't started yet):
- The callback fires → `advanceTurn` → `endTurn` → game state advances
- Later, animations start → they might get stuck mid-way (e.g., a peg moves to a hole that doesn't exist in registry, or the animation completion callback chain breaks)
- `_animatingPegs` is never cleared → `isPlayResolving()` always returns true
- On the NEXT turn's `drawCard()`, the human can't draw because `isPlayResolving()` blocks it
- The watchdog eventually auto-passes the human's turn
- Turn rotation becomes unpredictable

### 3. The cutscene drain race

The `CutsceneManager.whenDrained` uses a single `_onQueueDrained` callback. If cutscenes are drained and fire the callback, then MORE cutscenes are queued before the next `whenDrained` call, the callback fires early and the game advances before all cutscenes play.

## Fix

1. **`waitForAnimations` in fasttrack-3d.js**: When animations are deferred (will start later via `whenSettled`), don't fire immediately. Instead, set `_onAnimsDone` and wait for animations to complete.

2. **`executeMove` in fasttrack-game-core.js**: Split the `waitForAll` → cutscene → advanceTurn chain so that turn advancement is properly gated by both animations AND cutscenes.

3. **Add a safety timeout**: If animations or cutscenes don't complete within 15 seconds, force advance the turn.
