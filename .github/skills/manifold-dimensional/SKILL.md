---
name: manifold-dimensional
description: 'Dimensional Programming Framework — design, build, and extend the Manifold Compiler and its ecosystem. Use when: implementing manifold substrates, writing Dimensional DSL scripts, designing NPC behavior trees, composing procedural music/audio manifolds, deriving world geometry from mathematical expressions (z = xy), building the Manifold Compiler pipeline, integrating AI behavior agents, creating cinematic camera/lighting manifolds, or applying game theory decision manifolds. Core axiom: Manifold = Expression + Attributes + Substrate; z = xy is the universal access rule; everything is a point in a higher dimension and a whole in a lower; recursion happens between dimensions not within them. Covers: dimensional core engine, manifold compiler, reality engine (visual/audio/logical), NPC cognition/motion/emotion substrates, music/foley wave manifolds, cinematic systems, game theory integration, dimensional scripting language (DSL), cryptographic security substrate.'
argument-hint: 'Component to build or concept to explore — e.g. "terrain manifold", "NPC behavior substrate", "music manifold", "DSL compiler", "game theory equilibrium"'
---

# Manifold Dimensional Programming Framework

## Core Philosophy

Everything is a **manifold** — a mathematical object that is simultaneously a *point in a higher dimension* and a *whole in a lower dimension*.

| Axiom | Statement |
|-------|-----------|
| Manifold identity | `Manifold = Expression + Attributes + Substrate` |
| Universal access | `z = xy` — higher dimension contains and derives the lower |
| Substrate role | Rules that extract or derive behavior/data from a manifold |
| Recursion scope | Recursion happens *between* dimensions, never *within* them |
| Compilation target | Meshes, shaders, AI trees, timelines, sound layers |

## Dimensional Layers

| Dimension | Domain | Examples |
|-----------|--------|---------|
| 0D | Atomic value | Pitch, color, parameter |
| 1D | Linearity | Time, melody, camera path |
| 2D | Plane | Textures, sheet music, screens |
| 3D | Volume | Meshes, physical spaces |
| 4D | Temporal | Animation, cinematic motion |
| 5D+ | Conceptual | Storyline, emotion, game theory |

## When to Use

- Writing or interpreting **Dimensional DSL** scripts
- Designing **manifold geometry** (`z = f(x, y, t)` → mesh/shader)
- Implementing **NPC behavior** via cognition/motion/emotion substrates
- Composing **procedural music** using wave manifolds
- Building or extending the **Manifold Compiler** pipeline
- Adding **cinematic** camera or lighting manifolds
- Applying **game theory** decision manifolds for adaptive AI
- Implementing or auditing the **security substrate** (cryptographic signing, sandboxing)

## Step-by-Step Workflow

### 1 — Identify the Dimensional Layer
Determine which dimension(s) the component lives in (see table above).
Ask: *Is this an atomic value, a line, a plane, a volume, or a concept?*

### 2 — Define the Manifold Expression
Write the mathematical or symbolic expression that generates the manifold.

```
manifold terrain(x, y):
    z = x*y * sin(x)
```

Use `t` for time, `n` for index, additional axes for higher-dimensional manifolds.

### 3 — Attach Substrates
Add attributes that give the manifold visual, audio, behavioral, or logical substance.

```
manifold terrain(x, y):
    z = x*y * sin(x)
    texture  = 'rock'
    sound    = 'mountain_theme'
    behavior = 'autonomous'
    light    = 'global_illumination'
```

Substrate types: `texture`, `sound`, `behavior`, `light`, `collision`, `emotion`, `dialogue`.

### 4 — Write the Full DSL Script
Use the [DSL grammar reference](./references/dsl-grammar.md):

```
dimension <name>(params): <expression>
attribute  <key> = <value>
substrate  <type>: <rules>

manifold <object>(x, y, z, t):
    geometry = z = x*y * sin(t)
    texture  = 'marble'
    behavior = 'autonomous'
    sound    = 'choir_waveform'
    light    = 'global_illumination'
end
```

### 5 — Compile to Target Artifacts
The Manifold Compiler emits:

| Input Component | Compiled Output |
|-----------------|-----------------|
| Geometry expression | Procedural 3D mesh + shader maps |
| Texture substrate | Material / UV map |
| Sound substrate | MIDI score / waveform template |
| Behavior substrate | AI behavior tree / NPC logic |
| Light substrate | Lighting pass / shadow maps |
| Game-theory substrate | Payoff matrix / adaptive equilibria |

Follow the [compiler pipeline reference](./references/compiler-pipeline.md) for implementation detail.

### 6 — Integrate into Runtime Engine
Wire compiled artifacts into the target runtime.

**Browser / Three.js pipeline** (implemented in `engine/`):
1. Export: `export_three.py` tessellates the manifold expression → `static/<name>.json`
2. Serve: `server_three.py` (FastAPI) mounts `static/` and serves `viewer.html` at `/`
3. View: `viewer.html` loads the JSON via Three.js `BufferGeometry`, verifies the SHA-256 hash, then renders with orbit controls and live material tweaks.

```bash
# 1 — export a manifold surface
cd engine
python examples.py mountain          # → static/mountain.json

# 2 — start the server
uvicorn server_three:app --reload --port 8000

# 3 — open http://localhost:8000
```

Consult [NPC manifold patterns](./references/npc-manifolds.md) for behavior integration and
[music manifold spec](./references/music-manifolds.md) for audio integration.

### 7 — Apply Security Substrate
- Sign every compiled asset with a cryptographic hash.
- Run AI agents inside WebAssembly sandboxes.
- Encrypt data substrates at rest.

## System Architecture Summary

```
┌─────────────────────────────────────┐
│         Dimensional DSL Script       │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│         Manifold Compiler            │
│  (parses expressions → artifacts)    │
└──┬──────────┬──────────┬────────────┘
   │          │           │
┌──▼───┐ ┌───▼───┐ ┌─────▼──────┐
│Mesh/ │ │Audio  │ │AI Behavior │
│Shader│ │Score  │ │Tree        │
└──────┘ └───────┘ └────────────┘
               │
┌──────────────▼──────────────────────┐
│         Reality Engine               │
│  (Graphics · Physics · Sound · AI)   │
└──────────────────────────────────────┘
```

## Quick Reference Files

| Topic | Reference |
|-------|-----------|
| DSL grammar & examples | [dsl-grammar.md](./references/dsl-grammar.md) |
| Compiler pipeline architecture | [compiler-pipeline.md](./references/compiler-pipeline.md) |
| NPC behavior manifold patterns | [npc-manifolds.md](./references/npc-manifolds.md) |
| Music & audio manifold spec | [music-manifolds.md](./references/music-manifolds.md) |
| Three.js browser integration | [threejs-integration.md](./references/threejs-integration.md) |
