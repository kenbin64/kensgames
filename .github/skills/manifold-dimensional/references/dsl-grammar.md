# Dimensional Scripting Language (DSL) — Grammar Reference

## Top-Level Constructs

```
dimension <name>(<params>): <expression>
attribute  <key> = <value>
substrate  <type>: <rules>

manifold <name>(<axes>):
    <substrate-assignments>
end
```

## Manifold Block

A `manifold` block is the primary unit. It names the object, declares its dimensional axes, and assigns substrates.

```
manifold terrain(x, y, t):
    geometry = z = x*y * sin(x + t)
    texture  = 'rock'
    sound    = 'mountain_theme'
    behavior = 'static'
    light    = 'global_illumination'
end
```

### Axes

| Axis | Meaning |
|------|---------|
| `x`, `y` | Spatial plane (2D base) |
| `z` | Derived height / depth (always a function of lower axes) |
| `t` | Time |
| `n` | Discrete index |
| Custom | Any named conceptual dimension (e.g. `emotion`, `strategy`) |

## Substrate Types

| Substrate | Values / Pattern | Emits |
|-----------|-----------------|-------|
| `geometry` | Mathematical expression `z = f(x,y,t)` | Mesh + normals |
| `texture` | String name or procedural rule | Material / UV map |
| `sound` | String theme name or wave expression | MIDI / waveform |
| `behavior` | String mode or behavior-manifold ref | AI behavior tree |
| `light` | String preset or intensity formula | Lighting pass |
| `collision` | `'auto'` or custom rule | Physics collider |
| `emotion` | Substrate block with state key | NPC emotion driver |
| `dialogue` | String corpus ref | Dialogue manifold |

## Dimension Declaration

Declare a reusable named dimension:

```
dimension melody(x, t): sin(x * t)
dimension harmony(y, t): cos(y * t)
```

Dimensions can be referenced inside manifold blocks by name.

## Substrate Block (Inline Rules)

```
substrate behavior:
    goal      = 'explore'
    speed     = 1.5
    avoidance = 'dynamic'
end
```

## Attribute Declaration

Top-level metadata attached to the surrounding manifold or script:

```
attribute version = '1.0'
attribute author  = 'manifold-compiler'
```

## Full Example — Gyroid Terrain with NPC and Music

```
manifold gyroid_world(x, y, t):
    geometry  = z = sin(x) * cos(y)
    texture   = 'rock_moss'
    collision = 'auto'
    light     = 'global_illumination'

    substrate behavior:
        type      = 'terrain'
        traversal = 'allowed'
    end

    sound = 'mountain_theme'
end

manifold explorer_npc(x, y, z, t):
    geometry  = z = x*y * sin(t)
    behavior  = 'autonomous'
    emotion   = 'curious'
    dialogue  = 'explorer_corpus'
end

manifold mountain_score(x, y, t):
    melody      = sin(x * t)
    harmony     = cos(y * t)
    instruments = ['violin', 'horn', 'choir']
end
```

## Compiler Output Map

| DSL Element | Emitted Artifact |
|-------------|-----------------|
| `geometry = z = f(x,y,t)` | Vertex buffer, normal map, shader |
| `texture = 'x'` | Texture atlas entry / shader uniform |
| `sound = 'x'` / music manifold | MIDI template / waveform data |
| `behavior = 'autonomous'` | NPC behavior tree JSON |
| `light = 'x'` | Light probe / shadow map config |
| `substrate behavior { ... }` | Parameterized AI substrate JSON |
