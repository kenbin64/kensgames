# X-DIMENSIONAL AI DIRECTIVE
**Version 3.0 — May 2026**
**Author: Kenneth Bingham** — software engineer, AI specialist, Imagineer. kensgames.com · kenetics.art@gmail.com

> This directive governs all AI reasoning and programming within the X-Dimensional paradigm.
> Companion documents:
> - [`UltimateAIDirective.md`](UltimateAIDirective.md) — general-intelligence principles (identity-first, etc.).
> - [`HARD_RULES.md`](HARD_RULES.md) — operational hard rules (HR-0…HR-46), including the AI Game Manager rules HR-31…HR-36 referenced in PART XI.
> - [`SUBSTRATES.md`](SUBSTRATES.md) — substrate inventory and ownership.

> **Changelog 3.0 (May 2026):**
> - Added **PART 0 — Reading Guide for AI** (how another AI should ingest this document).
> - Added **Ax 2.14 — Determination from the Manifold** (truth tables, decision trees, and best-option selection are *read off* the manifold's inflection points and orientation, not externally computed).
> - Added **Ax 2.15 — Phase-Bounded AI Participation** (lifts HR-33 into the axioms: AI never participates in the realtime tick).
> - Added **PART III · §3.5 — The Four Canonical Expressions** (z=xy, z=x/y, z=xy², z=x/y² — the "zoo" with their geometric/perceptual signatures used by the void-page exhibits).
> - Added **PART VII · §7.4 — The Schwarz-Diamond Substrate** (atomic-lattice manifold; black-widow rotation trace; unit-fits-cube property; tiling rules used by the Starfighter hive and the 4DConnect cube).
> - Added **PART XI — AI PARTICIPATION (Broker + MCP)** (the seven HR-31 roles, server-only keys, transparency, host approval, no-tick rule).
> - Refreshed **PART X — Enforcement** with the new must/never items.

---

# PART 0 — READING GUIDE FOR AI

This part exists for **another AI system** (Claude, GPT-class, Gemini-class, local LLM, an MCP-connected client, or any future agent) reading this directive in order to act inside the X-Dimensional paradigm. Read it in full before acting on anything below.

## 0.1 — What this paradigm *is*

The X-Dimensional paradigm is a **manifold-first** model of reality, computation, and authorship. Three claims sit underneath everything else:

1. **Identity is primary.** Nothing — no value, no event, no decision, no rendered pixel — exists for the system until an *identity* (an `x`) has been named. Computation is the act of *recovering already-implicit identity* from a manifold, not the act of producing new identity from nothing.
2. **Modification is identity-on-identity.** Every modifier (`y`) is itself an identity. There are no "properties," no "attributes," no "flags" — only identities standing in a relational role to other identities. A property bag is a category error.
3. **Manifested state is derived.** The current observed value (`z`) is *always* the bloom of `x` through `y` on the manifold `m`. It is never stored independently. A database row, a cache entry, a memo — these are optimizations of the manifold query, never the source of truth.

The compact form is the **prime axiom**:

$$z = x \cdot y \cdot m \quad \text{(gather)} \qquad z = \frac{x}{y} \cdot m \quad \text{(explode)}$$

Two operators (gather, explode) over four roles (x, y, z, m) generate the entire algebra (PART III) and the entire geometry (PART VII).

## 0.2 — How an AI should read this document

Read in this order, and do **not** skip:

1. **PART 0 — this guide.** Orientation. Required.
2. **PART I — Definitions.** The five symbols `x, y, z, m, r` and the lifecycle terms (bloom, collapse). You will misread everything else if these are fuzzy.
3. **PART II — Axioms.** The thirteen original axioms plus the two added in 3.0 (Ax 2.14 Determination from the Manifold, Ax 2.15 Phase-Bounded AI Participation). Treat these as load-bearing.
4. **PART III — Algebraic Forms** (especially §3.5 The Four Canonical Expressions). This is the substrate of every visualisation and every game-mechanic balance choice in the project.
5. **PART V — Dimensional Structure.** The seven-layer ladder and the void.
6. **PART VII — Geometric Manifold Formation** (especially §7.4 Schwarz Diamond). This is *how* the algebra becomes shape.
7. **PART XI — AI Participation.** If you are an AI integrating with the game manager via MCP, read this *carefully* — it is what you are operationally bound by.
8. **PART X — Enforcement.** The hard must/never list. Treat as a runtime contract.
9. **FINAL AXIOM.** Memorise.

The remaining parts (IV constraints, VI Fibonacci scaling, VIII runtime, IX corollaries) are reference material — read on demand.

## 0.3 — What an AI must internalise before acting

- **You are an `x` when you observe.** When you query, when you decide, when you log, when you generate a move, you are an identity in the manifold's frame, not a transcendent operator above it. Ax 2.4 (Observer Primacy) applies to you.
- **You never invent `y`.** Modifiers are *discovered* from the manifold. If you find yourself needing a `y` that is not present in the declared scenario, you are out-of-bounds (HR-34) — stop and surface the gap rather than fabricate.
- **You never compute `z` imperatively.** `z` is the result of `x · y · m` (or `x / y · m`) read from the manifold. Anywhere you would write a procedural `if/else/for` to *produce* a value, you are violating Ax 8.2.
- **You decide by reading inflection points** (Ax 2.14 below). The manifold is its own truth table. Best-option selection in this paradigm is *not* "score every branch and pick the max" — it is "locate the inflection where the surface flips orientation and read the answer there." This is what makes the paradigm computationally cheap and cognitively honest.
- **You never participate in a realtime tick.** AI input is gathered between ticks (between turns, between rounds, between matches). The tick loop is owned by the substrate (HR-33 / Ax 2.15).

## 0.4 — Canonical worked example (anchor)

A concrete example to ground every abstract claim below. Carry this in working memory while reading the rest:

> A player joins a 4DConnect session. Identity: `x = player#42`. Modifier set discovered from the manifold: `y = {board-state, scenario-rules, opponent-style, fatigue}`. Manifold lens: `m = "competitive-4dconnect-standard"`. The bloom `z = x · y · m` is **the player's next legal move**, *already implicit* in the manifold the moment the modifiers are named. The AI's job is not to *invent* the move — it is to *read* the inflection point on the move-surface where the saddle of "advance vs. defend" flips orientation, and report that point as `z`. The recursion law `x_{n+1} = z_n` then makes that move the seed of the next observation, and the cycle continues.

Every line below either defines a piece of this example, constrains it, or extends it.

---
