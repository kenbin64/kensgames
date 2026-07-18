# Card 7: the split (the hardest move)

The authoritative algorithm for playing a 7, captured from Ken plus the rules.json CARD_7_*
rules, so the port matches it exactly.

## What a 7 can be
- **One peg takes all 7** (no split). This is just an ordinary forward move with movement = 7.
- **A split across two pegs:** a + b = 7, with a in 1..6 and b = 7 - a. Both halves move forward.

## The safe enumeration (commit nothing until the whole 7 is legal)
1. Choose the **first peg**. Offer all of its forward partial moves for step counts 1..7.
2. A partial of a < 7 is a **legal first choice as long as the remainder (7 - a) can be completed
   by a second peg.** So a peg that can only go 2 or 3 is still a valid first pick, because
   another peg takes the rest.
3. Once the first peg's a is chosen and a < 7, the **second peg must complete the remaining
   b = 7 - a**, forward and legal.
4. **Atomic, all-or-nothing:** no motion is committed on either peg until a full, legal 7 is
   found. If the first peg cannot take all 7 and no second peg can complete the remainder for
   any split, then **no peg moves and the turn is relinquished.** The engine must validate the
   entire 7 before applying anything (never half-apply).

## Who can participate
- **Forward only.** A 7 never moves backward. Pegs in **holding cannot participate** (a 7 does
  not enter from holding). At least one peg in play must be able to make a forward-legal hop, or
  the card is forfeited.
- **Safe-zone pegs can participate** in the split (a safe-zone peg may take a partial, forward,
  exact-landing within the zone).
- A peg may take all 7 alone.

## Fast track in a split
- A split half on a peg that **starts on fast track must complete its fast-track traversal**
  (reach its own ft-{bp}) to keep fast-track status. If it does not, and another (non-FT) peg is
  the one moved, **all of the player's FT pegs lose fast-track status.**
- It is fine to **move off** the fast track, but the **move must start on** the fast track
  (a non-FT peg cannot enter FT mid-split, and never going backward).

## Guards (from rules.json)
- **CARD_7_FORWARD_ONLY, CARD_7_FT_PRIORITY:** the two rules above.
- **SPLIT_ANTI_TUNNELING:** a split is illegal if its only purpose is to evade an own-peg
  blockade a direct 7 could not cross; the second half must have its own justification (a cut,
  a legal safe landing, completing the circuit, a bullseye entry).
- **MOV_NO_PASS_OWN / MOV_NO_LAND_OWN** apply to each half (with the ft gateway pass-through
  exemption already reconciled).

## Port shape (build order)
The split composes the per-peg partial-move generators, so it is built AFTER the fast-track exit
(it needs perimeter, safe-zone, and fast-track partials all available):
1. `partialMoves(state, R, peg, k)` -> the legal forward destinations for exactly k steps, for a
   peg anywhere (perimeter, safe zone, or fast track).
2. The 7 generator: emit the single-peg all-7, then for a in 1..6 pair every (pegA at a) with
   every (pegB at 7 - a) where both are legal, applying the FT and anti-tunneling guards; emit a
   `split` event only when the full 7 is completable. If none is, emit nothing (forfeit).
