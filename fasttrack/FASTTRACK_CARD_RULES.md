# FastTrack Card Rules — Single Draw Version

> **Version 2.0** — Derived from FASTTRACK_RULES.md canonical rules.

## Overview

FastTrack uses a **54-card deck** (52 standard + 2 Jokers). Each turn, a player draws **one card** and must make a legal move if one exists. There is no passing.

---

## Card Summary Table

| Card | Moves | Direction | Enter? | Exit Bullseye? | Extra Turn? | Type |
|------|-------|-----------|--------|----------------|-------------|------|
| **A** | 1 | Clockwise | ✅ | ❌ | ✅ | Entry |
| **2** | 2 | Clockwise | ❌ | ❌ | ❌ | Number |
| **3** | 3 | Clockwise | ❌ | ❌ | ❌ | Number |
| **4** | 4 | **Backward** | ❌ | ❌ | ❌ | Special |
| **5** | 5 | Clockwise | ❌ | ❌ | ❌ | Number |
| **6** | 6 / 0 | Clockwise | ✅ | ❌ | ✅ | Entry |
| **7** | 7 | Clockwise | ❌ | ❌ | ❌ | Split |
| **8** | 8 | Clockwise | ❌ | ❌ | ❌ | Number |
| **9** | 9 | Clockwise | ❌ | ❌ | ❌ | Number |
| **10** | 10 | Clockwise | ❌ | ❌ | ❌ | Number |
| **J** | 1 | Clockwise | ❌ | ✅ | ✅ | Royal |
| **Q** | 1 | Clockwise | ❌ | ✅ | ✅ | Royal |
| **K** | 1 | Clockwise | ❌ | ✅ | ✅ | Royal |
| **Joker** | 1 | Clockwise | ✅ | ❌ | ✅ | Wild |

---

## Entry Cards (A, 6, Joker)

Place a peg from **holding** onto the player's **home hole** (diamond marker).

- **Ace** — Enter from holding **or** move an existing peg 1 space. Extra turn.
- **6** — Enter from holding (0 moves, just placement) **or** move 6 spaces. Extra turn either way.
- **Joker** — Enter from holding **or** move an existing peg 1 space. Extra turn.
- Cannot enter if home hole is occupied by your own peg.

---

## Royal Cards — J, Q, K

Move **1 space clockwise**. Grant **extra turn**.

**Bullseye exit:** Only J, Q, K can exit the bullseye.
- ❌ Ace **cannot** exit bullseye
- ❌ Joker **cannot** exit bullseye
- Exit destination: player's own FastTrack hole (`ft-{playerIdx}`)
- If own FT hole is occupied by own peg → exit to previous FT hole

---

## Card 4 — Backward

Move **4 spaces counter-clockwise** (backward).

### Restrictions
| Zone | Can Enter Backward? |
|------|---------------------|
| FastTrack mode | ❌ No |
| Bullseye (center) | ❌ No |
| Safe zone | ❌ No |
| Outer track | ✅ Yes |
| Home holes on perimeter | ✅ Can traverse |

### Safe Zone Eligibility
Moving backward to (or past) the safe zone entry point **satisfies the circuit-completion requirement**. The peg becomes eligible to enter safe zone on the next forward move.

---

## Card 7 — Split

Move **7 spaces total**, optionally split between **2 pegs**.

### Rules
- Both sub-moves are **clockwise** (never backward)
- Need **2+ pegs in play** (not in holding) to split
- Split any way: 1+6, 2+5, 3+4
- Cannot use the same peg twice
- Each sub-move must be independently legal
- If only 1 peg in play, must move the full 7

### FastTrack & Split
- Two FT pegs **can** split with each other
- FT peg + outer-track peg: the FT peg must have **completed its FT circuit** first

### Cutting During Split
- Cuts only happen on the **second** sub-move (not the first)

---

## Movement Restrictions

### Self-Blocking
- Cannot pass through a hole occupied by your own peg
- Cannot land on a hole occupied by your own peg
- Applies everywhere: outer track, FastTrack, safe zone

### Cutting
- Landing on an **opponent's peg** sends it to their holding area
- If opponent's holding is full, cut peg goes to their home hole
- **Cut-safe zones:** holding, bullseye, safe zone
- **Not safe:** home hole, FT holes, outer track

---

## FastTrack Rules

### Entering
- Land exactly on an FT hole as the final step of a move
- Cannot enter FT going backward (Card 4)

### Bullseye Entry from FT
- Any peg on FT can enter bullseye with a **1-step card** (A, J, Q, K, Joker)
- **No waiting period** — can enter bullseye same turn as entering FT

### Bullseye Exit
- **Only J, Q, K** → peg exits to own FT hole
- Peg is stuck until a Royal is drawn

### FT Loss Conditions
| Trigger | Effect |
|---------|--------|
| Draw a 4 | FT peg flagged `mustExitFasttrack` |
| Non-FT move while having FT pegs | **All** FT pegs lose status at end of turn |
| Voluntary exit to outer track | That peg loses FT status |

---

## Winning

1. Fill all **4 safe zone holes** with pegs
2. Land the **5th peg** exactly on the **winner/home hole** (must have completed circuit)
3. First to achieve this wins — game ends immediately

### Safe Zone
- Only your pegs can enter your safe zone
- Forward (clockwise) movement only
- Pegs are protected from cuts
- Exact landing required — cannot overshoot

---

## Quick Reference

| Category | Cards |
|----------|-------|
| **Enter from holding** | A, 6, Joker |
| **Extra turn** | A, 6, Joker, J, Q, K |
| **Exit bullseye** | J, Q, K **only** |
| **1-move cards** | A, J, Q, K, Joker |
| **Backward** | 4 |
| **Split** | 7 |
