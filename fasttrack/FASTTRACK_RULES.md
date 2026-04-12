# 🎯 FAST TRACK — Official Game Rules

> **Version 2.0** — Canonical rules reflecting the implemented game engine.
> All documentation, substrates, manifolds, and in-game UI derive from this source of truth.

---

## 📦 Components

| Component | Details |
|-----------|---------|
| **Board** | Hexagonal board with outer track (36 holes), fast track (6 inner holes), bullseye (1 center), safe zones (4 per player), home/winner holes |
| **Pegs** | 5 per player × up to 6 players (30 total). Colors: Red, Orange, Green, Blue, Purple, Yellow |
| **Deck** | 54 cards (standard 52 + 2 Jokers) |

---

## 🎮 Setup

- **Players:** 2–6 (recommended 3–4; online supports up to 4 humans + AI bots)
- **Starting position:** 4 pegs in holding area, 1 peg on home hole (diamond marker)
- **First player:** Player 1 (Red) goes first; play proceeds clockwise
- **Deck:** Shuffled face-down in the center

---

## 🎴 Card Reference

### Extra-Turn Cards (draw again after a legal move)

| Card | Moves | Enter from Holding? | Exit Bullseye? | Notes |
|------|-------|---------------------|----------------|-------|
| **Ace** | 1 | ✅ Yes | ❌ No | Entry card. Place on home hole or move 1 |
| **6** | 6 (or 0 on entry) | ✅ Yes | ❌ No | Place on home hole (0 moves) **or** move 6 |
| **Joker** | 1 | ✅ Yes | ❌ No | Wild entry card. Place on home hole or move 1 |
| **Jack** | 1 | ❌ No | ✅ Yes | Royal. Can exit bullseye → own FT hole |
| **Queen** | 1 | ❌ No | ✅ Yes | Royal. Can exit bullseye → own FT hole |
| **King** | 1 | ❌ No | ✅ Yes | Royal. Can exit bullseye → own FT hole |

### Number Cards (no extra turn)

| Card | Moves | Direction | Notes |
|------|-------|-----------|-------|
| **2** | 2 | Clockwise | — |
| **3** | 3 | Clockwise | — |
| **5** | 5 | Clockwise | — |
| **8** | 8 | Clockwise | — |
| **9** | 9 | Clockwise | — |
| **10** | 10 | Clockwise | — |

### Special Cards

| Card | Effect |
|------|--------|
| **4** | Move 4 spaces **BACKWARD** (counter-clockwise). See [Backward Restrictions](#-card-4-backward-movement) |
| **7** | Move 7 **or** split between 2 pegs (e.g. 3+4, 2+5, 1+6). See [Split Rules](#%EF%B8%8F-the-split-card-7) |

---

## 🔄 Turn Structure

1. **Draw** — Draw 1 card from the deck
2. **Play** — Make a legal move (mandatory if one exists). Click a peg, then click its highlighted destination
3. **End** — Turn passes to the next player, **unless** the card grants an extra turn

- If **no legal move** exists, the card is discarded and the turn ends (no extra turn, even for Royals/6)
- When the deck is empty, the discard pile is shuffled to form a new deck

---

## 🚀 Entering the Board

- Pegs in holding can only enter via **Ace, 6, or Joker**
- The peg is placed on the player's **home hole** (diamond marker)
- Cannot enter if home hole is occupied by your own peg
- The 6 enters with **0 movement** (just placement); Ace and Joker enter with **0 movement** as well (the 1-move value is for when moving an on-board peg)

---

## 🏃 Movement Rules

| Rule | Description |
|------|-------------|
| **Clockwise** | All movement is clockwise except Card 4 |
| **No self-blocking** | Cannot pass through or land on your own peg |
| **One peg per hole** | Only one peg per hole (except: any peg stuck in bullseye blocks entry) |
| **Exact landing** | Must land exactly on safe zone holes, winner holes, bullseye, and FT entry |
| **Mandatory move** | Must make a legal move if one exists; cannot voluntarily skip |

---

## ⬅ Card 4 (Backward Movement)

The **4** moves a peg **4 spaces counter-clockwise** (backward).

### Backward Restrictions

| Zone | Can Enter Backward? |
|------|---------------------|
| **Outer track** | ✅ Yes — standard backward movement |
| **FastTrack mode** | ❌ No — cannot activate FT mode going backward |
| **Bullseye (center)** | ❌ No |
| **Safe zone** | ❌ No |
| **Home/winner hole** | ✅ Can traverse home markers on perimeter |

### Backward & Safe Zone Eligibility

If moving backward brings a peg to (or past) its safe zone entrance on the outer track, this **satisfies the circuit-completion requirement**. On the next forward move, that peg can enter its safe zone normally.

---

## ⚡ FastTrack (Inner Ring Shortcut)

### Entering FastTrack
- A peg's move must land **exactly** on an FT hole to activate FastTrack mode
- Cannot enter FastTrack going backward (Card 4)
- Entering FT triggers a celebration animation

### Moving on FastTrack
- Move clockwise around the 6 inner holes (ft-0 → ft-1 → ... → ft-5 → ft-0)
- Must pass **your own color's FT hole** to complete the circuit

### Bullseye Entry from FastTrack
- Any peg on the FastTrack can enter the **bullseye** (center) with a 1-step card (Ace, J, Q, K, Joker)
- The peg must be on an ft-\* hole, and the next hop destination includes "center" as an option
- **No waiting period** — can enter bullseye on the same turn the peg entered FT

### Losing FastTrack Status

FastTrack status is lost in these situations:

| Trigger | Effect |
|---------|--------|
| **Drawing a 4** | Peg gets `mustExitFasttrack` flag; must exit on that move |
| **Non-FT move** | If a player has pegs on FT but moves a **different** (non-FT) peg, all FT pegs lose their FT status at end of turn |
| **Voluntary exit** | Moving a peg off FT to the outer track removes FT status |

> The "non-FT move" penalty means: **you must traverse your FT pegs each turn you have them.** If you make any move that isn't traversing FT, all FT pegs lose status.

---

## 🎯 Bullseye (Center Hole)

### Entering
- Land exactly on the bullseye as the final step of a move
- Typically entered from FastTrack with a 1-step card

### While Inside
- Peg is **stuck** — cannot move with normal cards
- Peg is **safe** — cannot be cut
- Only one peg at a time in the bullseye

### Exiting — **Only J, Q, K**
- ❌ Ace **cannot** exit bullseye
- ❌ Joker **cannot** exit bullseye
- ✅ **Jack, Queen, King** exit to the player's own FT hole (ft-{playerIdx})
- If that FT hole is occupied by own peg, exit to the previous FT hole
- Exiting grants an extra turn (the Royal's natural extra turn)

---

## ✂️ The Split Card (7)

### Basic Split
- Split 7 moves between **two different pegs**: 1+6, 2+5, 3+4
- Both sub-moves are **clockwise** (never backward)
- Each sub-move must be independently legal
- Move peg A first, then peg B (with the remaining steps)
- Cannot use the same peg for both halves

### Split Eligibility
- Need **2+ pegs in play** (not in holding) to split
- If only 1 peg is in play, must move it all 7 spaces
- Two pegs both on FastTrack **can** split with each other
- **FT peg + outer-track peg**: The FT peg must have completed its FT circuit to be eligible for splitting with an outer-track peg

### Cutting During Split
- Cutting (landing on an opponent) can **only** happen on the **second** sub-move of the split
- The first sub-move cannot cut

---

## ⚔️ Cutting Opponents

Landing on an opponent's peg **cuts** them — their peg is sent back to their holding area.

### Cut Rules

| Situation | Result |
|-----------|--------|
| Land on opponent on outer track | ✅ Cut — peg goes to their holding |
| Opponent's holding is full | Peg goes to their home hole instead |
| Cut your own peg | ❌ Impossible — cannot land on own peg |

### Cut-Safe Positions

| Position | Safe from Cuts? |
|----------|-----------------|
| **Holding area** | ✅ Safe |
| **Bullseye (center)** | ✅ Safe |
| **Safe zone** | ✅ Safe |
| **Home hole** | ❌ Can be cut by opponents |
| **FastTrack holes** | ❌ Can be cut |
| **Outer track** | ❌ Can be cut |

---

## 🏠 Safe Zone & Winning

### Safe Zone (4 holes per player)
- Only the **owning player's** pegs can enter their safe zone
- Pegs in safe zone are **safe from cuts**
- Movement is **forward (clockwise) only** — cannot use Card 4 to back in
- Peg must have **completed the circuit** (passed home hole once) to enter
- **Exact landing** required — cannot overshoot

### Win Condition
1. Fill all **4 safe zone holes** with your pegs
2. Land the **5th peg** exactly on the **winner/home hole** (the peg must have `completedCircuit`)
3. **First player** to achieve this wins — game ends immediately

---

## 📋 Quick Reference

### Card Categories
| Category | Cards |
|----------|-------|
| **Entry (from holding)** | A, 6, Joker |
| **Extra turn** | A, 6, Joker, J, Q, K |
| **Exit bullseye** | J, Q, K **only** |
| **Backward** | 4 only |
| **Split** | 7 only |
| **1-move cards** | A, J, Q, K, Joker |

### Zone Access

| Zone | Entry Condition |
|------|----------------|
| **Board (from holding)** | A, 6, or Joker → home hole |
| **FastTrack** | Exact landing on FT hole (clockwise only) |
| **Bullseye** | Exact landing from FT with 1-step card |
| **Safe zone** | Circuit completed + clockwise entry only |
| **Winner hole** | Exact landing + 4 safe zone holes filled |

---

## 🎲 Strategy Tips

1. **Save Royals (J/Q/K)** for escaping the bullseye — they're the only way out!
2. **Use FastTrack** aggressively — the shortcut can save 20+ moves
3. **Block opponents** by positioning pegs on choke points (they can't pass you)
4. **The 7 split** is powerful for advancing two pegs at once or setting up cuts
5. **Card 4 backward** can satisfy safe zone eligibility — a useful shortcut
6. **Cut aggressively** late-game — sending opponents back to holding is devastating
7. **Don't strand pegs on FT** — if you move non-FT pegs, your FT pegs lose status!

---

*Fast Track © ButterflyFX — A Dimensional Game Experience*
