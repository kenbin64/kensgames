# Manifold Compiler — Pipeline Architecture

## Overview

The Manifold Compiler takes a Dimensional DSL script and emits executable runtime artifacts.

```
DSL Script
    │
    ▼
[Lexer / Parser]          → AST (manifold nodes, substrate nodes, dimension nodes)
    │
    ▼
[Semantic Resolver]       → resolves named dimensions, validates axis consistency
    │
    ▼
[Substrate Expander]      → instantiates each substrate type with its rules
    │
    ▼
[Code Generators]
    ├── GeometryGen       → mesh data, normals, UV layout
    ├── ShaderGen         → GLSL / WGSL / HLSL shader programs
    ├── AudioGen          → MIDI score, waveform synthesis params
    ├── BehaviorGen       → AI behavior tree (JSON / BT format)
    ├── LightGen          → light probe configs, shadow map settings
    └── MetadataGen       → JSON-LD manifold descriptor, version hash
    │
    ▼
[Security Layer]
    ├── Sign each artifact with BLAKE3 hash
    └── Encrypt sensitive substrates (behavior keys, auth tokens)
    │
    ▼
Runtime Artifacts
```

## Technology Map

| Stage | Recommended Tool |
|-------|-----------------|
| Lexer/Parser | Rust (`nom` or `pest`) or Python (`lark`) |
| AST/IR | Custom Rust structs or Python dataclasses |
| Geometry generation | `ndarray` (Python) / custom C++ extension |
| Shader generation | Template-based GLSL/WGSL emission |
| Audio generation | SuperCollider OSC / JUCE MIDI writer |
| Behavior generation | JSON behavior-tree format (BehaviorTree.CPP compatible) |
| Runtime target | Unreal Engine 5, Unity, Godot 4, or custom Vulkan renderer |
| Security | WebAssembly sandbox (Wasmtime), BLAKE3 signing |

## Geometry Generator

Evaluates `z = f(x, y, t)` over a parametric grid:

```python
import numpy as np

def evaluate_geometry(expr_fn, x_range, y_range, resolution=64, t=0.0):
    xs = np.linspace(*x_range, resolution)
    ys = np.linspace(*y_range, resolution)
    X, Y = np.meshgrid(xs, ys)
    Z = expr_fn(X, Y, t)
    return X, Y, Z   # → vertex buffer
```

Output: vertex buffer (N×3), normal buffer (N×3), UV buffer (N×2), index buffer.

## Behavior Generator

Emits a behavior tree JSON compatible with BehaviorTree.CPP:

```json
{
  "BehaviorTree": {
    "ID": "explorer_npc",
    "Tree": {
      "Sequence": [
        { "Action": { "ID": "Navigate", "goal": "explore", "speed": 1.5 } },
        { "Condition": { "ID": "ObstacleAhead" } },
        { "Action": { "ID": "Avoid", "mode": "dynamic" } }
      ]
    }
  }
}
```

## Audio Generator

Maps music manifolds to MIDI:

| Manifold Element | MIDI Mapping |
|-----------------|-------------|
| `melody = sin(x*t)` | Note pitch derived from sin envelope |
| `harmony = cos(y*t)` | Chord voicing offset |
| `instruments = [...]` | MIDI channel / program assignment |
| Amplitude envelope | Velocity curve from manifold gradient |

## Security Substrate

Every compiled artifact bundle receives:
1. **Content hash**: BLAKE3 digest of raw bytes
2. **Signature**: Ed25519 signature by the compiler's private key
3. **Manifest**: JSON-LD descriptor listing all sub-artifacts and their hashes

AI agents executing substrates run inside **WebAssembly sandboxes** — no host filesystem or network access by default. Capabilities are granted explicitly via the substrate `permissions` attribute.

## Incremental Compilation

The compiler tracks a content-addressed cache keyed on `hash(expression + substrate-params)`. Unchanged manifolds are not re-evaluated, only their dependents.
