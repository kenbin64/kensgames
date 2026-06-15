# HELIX — Art Brief & Rules

*A KensGames original by Kenneth Bingham / ButterflyFx.*

**One-line pitch:** Translucent gem crystals fall into a wireframe well; roll and tumble them so their saddle and spiral surfaces interlock — connect 3 or more and they burst, scoring on the Fibonacci sequence, with cascades that can collapse the whole stack.

> This game is built from original manifold geometry (the z = x·y saddle and gyroid surfaces) — not derived from any existing title.

---

## 1. Art direction (use this for EVERY image so they match)

- **Mood:** scientific elegance meets gemstone beauty — calm, premium, hypnotic, with an undercurrent of tension. "The essence of the golden ratio made playable."
- **Background:** deep near-black space with a faint blue-violet tint (hex `#04060d`), subtle depth fog, faint starfield or volumetric haze.
- **Crystals:** translucent, glass/gem-like, glowing softly from within. Colors are spaced around the wheel by the **golden angle (137.5°)** — a harmonious spectral set: aqua-cyan, electric blue, violet, magenta, orange, lime, emerald.
- **Signature accents:** neon cyan `#00ffee` and magenta `#ff2299` glow.
- **The "perfect cube":** a bright white diamond-clear cube with a pale-blue inner glow (`#9fd8ff`) — clearly the rare, special piece.
- **Hazard color:** warning red `#ff2244` (the dead-zone line only).
- **Finish:** clearcoat/specular highlights, soft bloom, gentle reflections. No cartoon outlines. Think "cut gemstones lit in a dark museum case."

---

## 2. Logo

### Primary (the living, in-game mark) — the rotating z = x·y saddle

The actual in-game logo is a **single translucent z = x·y saddle surface slowly rotating about its vertical (Y) axis.** As it spins, its sweep traces a luminous **hourglass / double-cone** silhouette, and the saddle's **zero-level node glides up and down** through the pinch in the center — a calm, breathing, hypnotic mark that *is* the game's core geometry. It doubles as the title-screen and loading centerpiece.

**Copy-paste prompt (hero frame of the animated mark):**
> A glowing translucent z = x·y saddle surface (hyperbolic paraboloid) captured mid-rotation about its vertical axis, the rotation sweeping a luminous hourglass / double-cone silhouette with a bright nodal point at the pinch in the center. Faint motion-blur light-trails imply the spin and the node gliding up and down. Glass/gemstone clearcoat material with an aqua-cyan-to-magenta golden-ratio color gradient, glowing from within. Deep near-black background (#04060d) with a subtle blue-violet haze and soft bloom. Beneath it, the word HELIX in a clean, geometric, slightly futuristic sans-serif, evenly letter-spaced, glowing pale cyan. Elegant, scientific, premium. No other text.

*(For a sequence/animation reference, ask the tool for 3–5 frames at 0°, 45°, 90°, 135° of Y-rotation showing the hourglass sweep and the node moving.)*

### Fallback (flat) mark — for favicons, store tiles, anywhere you can't animate

A static symbol of **two translucent saddle crystals interlocking and spiraling into a helix** (one cyan, one magenta, meshing perpendicular).

**Copy-paste prompt (flat mark):**
> A clean game logo symbol: two translucent gemstone saddle-shaped crystals — one aqua-cyan, one magenta — interlocking and spiraling upward into a double-helix, glass-like and glowing from within with clearcoat highlights, on a deep near-black background. Square, bold, readable at small sizes, vector-clean, transparent-friendly. No text.

**Also request:** a **monochrome / single-color** version (white on transparent) for overlays/watermarks, and **horizontal** (mark left of word) + **stacked** (mark above word) lockups.

**Placement note:** keep the fixed brand line *"Powered by ButterflyFx Manifold"* available as a small secondary mark per brand standards.

---

## 3. Key art / cover image (store + itch.io banner)

**Copy-paste prompt:**
> Key art for a puzzle game called HELIX. A tall transparent wireframe cube-shaped well floating in dark blue-violet space, filled with translucent glowing gemstone crystals in golden-ratio-spaced spectral colors (cyan, violet, magenta, orange, lime, emerald). The crystals are saddle-shaped and spiral/helicoid surfaces that interlock into a rising helix. One brilliant white diamond-clear cube glows among them. A few crystals are bursting into sparkling particle "poofs." A faint red horizontal warning line crosses the upper third of the well. Dramatic rim lighting, soft bloom, clearcoat reflections, shallow depth of field. Premium, elegant, hypnotic, scientific-gemstone aesthetic. Title space at top.

**Aspect ratios to generate:** 16:9 (store hero), 1:1 (thumbnail), and a tall 2:3 (poster).

---

## 4. App / store icon

**Copy-paste prompt:**
> A square app icon for a puzzle game. A single pair of translucent gemstone crystals — one cyan, one magenta — interlocking into a small spiral/helix, glowing from within with clearcoat highlights, centered on a deep near-black (#04060d) rounded-square background with a subtle radial blue-violet glow. Minimal, bold, instantly readable at small sizes. No text.

---

## 5. Rules

**Goal:** Keep the well alive as long as possible (and score high) by interlocking falling crystals into clearing clusters before the stack reaches the dead-zone line.

**The well:** a wireframe box, **4 × 4 across and 14 tall**. The bottom **11 rows are playable**; the top **3 rows are a maneuver buffer** so you always have room to position incoming crystals.

**The crystals (piece types):**
| Piece | Look | Interlocks when… |
|---|---|---|
| **Saddle** (z = x·y) | smooth translucent saddle | a neighbor is **perpendicular** to it |
| **Spiral** (gyroid) | chiral spiraling ribbon | a neighbor is **aligned** with it |
| **Perfect cube** (rare, earned) | bright white diamond cube | **always** — connects to *anything* adjacent |

- Saddles and spirals are **different families — they do not interlock with each other.** Only the **perfect cube** bridges families.
- A crystal **spawns in a random orientation** and falls; you **roll/tumble** it to the orientation you want.

**Connecting & clearing:**
- Connections are fully **3D** — up/down, left/right, front/back, and any 3D path.
- When **3 or more** crystals connect through interlocking faces, the whole connected group **bursts** in a particle "poof" and clears.
- A crystal that lands misaligned isn't wasted — you can **redeem** it later by forming a new 3+ around it.

**Scoring — Fibonacci by cluster size** (the more you connect, the *much* more you score):

| Cluster size | 3 | 4 | 5 | 6 | 7 | 8 | 10 |
|---|---|---|---|---|---|---|---|
| Points | 3 | 5 | 8 | 13 | 21 | 34 | 89 |

- Clearing collapses the stack, which can trigger **multi-level cascades** — each cascade wave scores its own Fibonacci payout on top, so one well-placed crystal can detonate a huge combined score.

**The perfect cube (earned, not random):**
- Clear a cluster of **5 or more** → your **next** piece is a perfect cube (one per play).
- It **connects to any adjacent crystal**, **does not tumble**, and **falls faster** — a powerful but high-pressure tool. Drop it next to two stranded crystals and it bridges them into a clear.

**Difficulty:** crystals fall faster as the stack rises and as your level climbs (level up by clearing).

**Game over (the dead zone):** a **red line** runs around the well at the base of the buffer. It is a **hard ceiling — if even one crystal comes to rest at or beyond that line, the game ends immediately.** No last-second clear saves you.

---

## 6. Controls

| Action | Keyboard | (Full game also supports) |
|---|---|---|
| Move crystal | Arrow keys (← → ↑ ↓) | mouse · gamepad · VR |
| Roll about Y | **Q** / **E** | gamepad stick · mouse |
| Tumble about X | **W** / **S** | gamepad stick · mouse |
| Drop fast | **Space** or **click** | trigger / button |
| Soft drop | **Shift** | |
| **Orbit camera** (free 3D view) | **drag** to look · **wheel** to zoom | right stick · VR head/hands |

Crystals tumble with a smooth "dice-roll" motion and **snap to a clean 90° orientation when they land**.

**Presentation:** the arena floats free in 3D space — the player can orbit to any angle. The game opens with a **cinematic intro**: the camera descends a **logarithmic spiral** down the well over a live demo, then settles as the **HELIX** title appears with the **rotating z = x·y logo**. A **Skip** button (or any key/click) jumps straight to play.

---

## 7. Diagrams

These ASCII diagrams are accurate now. Below each is an image-AI prompt to render a polished version, plus a placeholder for a real screenshot.

### 7a. The well, buffer, and dead zone (side view)

```
      ┌──────────────┐   ← top of well · crystals spawn here
      │  ·  ·  ·  ·   │  ┐
      │  ·  ·  ·  ·   │  ├─ MANEUVER BUFFER (3 rows): room to roll & position
      │  ·  ·  ·  ·   │  ┘
      ╞══════════════╡   ← DEAD-ZONE LINE (red) — rest here = GAME OVER
      │  ◆  ·  ◆  ·   │  ┐
      │  ◆  ◆  ·  ◆   │  │
      │  ·  ◆  ◆  ◆   │  ├─ PLAYABLE STACK (11 rows tall)
      │  ◆  ◆  ◆  ◆   │  │
      └──────────────┘  ┘  floor
```
> **Render prompt:** Clean infographic, dark background, a tall transparent wireframe well 4 wide and 14 tall; top 3 rows labeled "maneuver buffer," a glowing red horizontal line labeled "dead zone," and the lower rows filled with colorful translucent gem crystals labeled "playable stack." Elegant, modern, labeled diagram style.

*[SCREENSHOT placeholder: side view of a partly-filled well — capture from `helix-prototype.html`.]*

### 7b. Interlock rules

```
  SADDLES interlock when PERPENDICULAR        SPIRALS interlock when ALIGNED
        ╲   ╱        ╲ ╱                            ⟳   ⟳         ⟳   ⟲
         ╳     +     ╳    →  ✗  (parallel)           same   →  ✓     opposite → ✗
        ╱   ╲     90° rotated → ✓                   handedness        handedness
```
> **Render prompt:** A clean two-panel infographic on a dark background. Left panel: two cyan saddle-shaped gem crystals, one rotated 90° from the other, glowing where they mesh, labeled "saddles — interlock when perpendicular." Right panel: two spiral/helicoid gem crystals aligned the same way and glowing at the join, labeled "spirals — interlock when aligned." Elegant gemstone style with soft glow.

*[SCREENSHOT placeholder: a 3-crystal cluster glowing just before it clears.]*

### 7c. The perfect cube as a bridge

```
   ◐ (saddle, lonely)      ◐ ▣ ◑   →  the white cube ▣ connects BOTH
   ◑ (spiral, lonely)         ◆     →  3 connected → BURST  (+Fibonacci)
```
> **Render prompt:** A bright white diamond-clear glowing cube placed between two differently-colored translucent gem crystals in a dark well, energy/light bridging all three, a burst of sparkling particles beginning. Caption space: "the perfect cube connects to anything."

*[SCREENSHOT placeholder: a cube triggering a cascade — capture once tuned.]*

---

## 8. Strategy notes (for the manual / tooltips)

- Plan two families at once: build a **perpendicular** saddle pocket and an **aligned** spiral run in different corners.
- **Hold the buffer:** the top 3 rows are for positioning — don't let the stack creep into them.
- **Bank toward 5+** to earn a perfect cube; then use the cube to bridge two stranded crystals for a chain.
- **Stack for cascades:** set up clusters that will collapse into *new* clusters — Fibonacci + cascade waves is where the big scores live.

---

*Screenshots: capture from `cubic3d/helix-prototype.html` (open in any browser). Final art replaces the helicoid stand-in spiral with the true gyroid / winki mesh.*
