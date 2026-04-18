# NPC Behavior Manifold Patterns

## Structure

Every NPC is a composite manifold with four sub-substrates:

```
manifold npc(x, y, z, t):
    cognition  = Substrate(goal, drives, memory)
    motion     = Manifold(z = f(x, y, t))
    emotion    = Substrate(state, modifiers)
    dialogue   = Manifold(corpus, style)
end
```

## Python Prototype

```python
class Manifold:
    def __init__(self, expression: str, **kwargs):
        self.expression = expression
        self.attributes = kwargs

class Substrate:
    def __init__(self, **rules):
        self.rules = rules

class NPC(Manifold):
    def __init__(self, name: str):
        super().__init__(expression="z = x*y * sin(t)")
        self.name      = name
        self.cognition = Substrate(goal="explore", drives=["curiosity", "survival"])
        self.motion    = Manifold("z = x*y * sin(t)")
        self.emotion   = Substrate(state="curious", valence=0.7, arousal=0.5)
        self.dialogue  = Substrate(corpus="explorer_corpus", style="terse")

    def tick(self, x, y, t):
        import math
        return x * y * math.sin(t)   # current world-space z
```

## Cognition Substrate

| Field | Type | Description |
|-------|------|-------------|
| `goal` | string | Current top-level objective |
| `drives` | list | Active motivational drives |
| `memory` | list | Recent perceived events |
| `plan` | list | Ordered action steps |

Goal hierarchy (higher dimension → lower):
`Storyline (5D) → Quest (4D) → Task (3D) → Action (2D) → Step (1D)`

## Motion Manifold

The motion manifold defines the NPC's positional trajectory:

```
manifold npc_path(x, y, t):
    geometry = z = x*y * sin(t * speed)
    speed    = 1.5
    avoidance = 'dynamic_obstacle'
end
```

Path generation: sample `z(x, y, t)` at each frame → 3D waypoints → physics integration.

## Emotion Substrate

Russell's circumplex model mapped to 2D:

| Axis | Range | Meaning |
|------|-------|---------|
| `valence` | −1 → +1 | Negative ↔ Positive |
| `arousal` | −1 → +1 | Calm ↔ Excited |

Emotion modulates behavior:
- High arousal + negative valence → aggressive / flee
- High arousal + positive valence → excited / social
- Low arousal + positive valence → content / idle

Emotion can itself be a manifold: `emotion(t) = f(events, memory, t)`.

## Dialogue Manifold

```
manifold dialogue(context, emotion, t):
    corpus = 'explorer_corpus'
    style  = emotion.valence > 0 ? 'friendly' : 'cautious'
    register = 'informal'
end
```

Dialogue substrates connect to LLM inference endpoints or pre-authored corpus trees.

## Behavior Tree Output (BT JSON)

```json
{
  "BehaviorTree": {
    "ID": "explorer_npc",
    "Tree": {
      "Selector": [
        {
          "Sequence": [
            { "Condition": { "ID": "EnemyVisible" } },
            { "Action":    { "ID": "FleeToSafety" } }
          ]
        },
        {
          "Sequence": [
            { "Condition": { "ID": "ObjectiveReached" } },
            { "Action":    { "ID": "UpdateGoal" } }
          ]
        },
        { "Action": { "ID": "Explore", "speed": 1.5 } }
      ]
    }
  }
}
```

## Multi-NPC Coordination

When multiple NPCs share a `crowd_substrate`, their motion manifolds become coupled:

```
z_i = f(x_i, y_i, t) + Σ_j influence(NPC_j, distance_ij)
```

This produces emergent flocking or coordinated group behavior without explicit scripting.
