# Three.js Browser Integration

## Architecture

```
Python engine/          →   browser
────────────────────────────────────────────────────
manifold_core.py        →   (logic stays server-side)
export_three.py         →   static/<name>.json
server_three.py         →   FastAPI serves / and /static/*
viewer.html             →   Three.js loads JSON, renders mesh
```

## File Layout

```
engine/
├── manifold_core.py    Base Manifold, Substrate, NPC, Runtime classes
├── export_three.py     Tessellator → JSON + SHA-256 signing
├── server_three.py     FastAPI server (viewer + static + API)
├── examples.py         Pre-registered example manifolds
├── viewer.html         Three.js interactive viewer
├── requirements.txt    fastapi, uvicorn, pydantic
└── static/             Exported manifold JSON files served here
```

## Quick Start

```bash
cd engine
pip install -r requirements.txt

# Export a surface (res=120 → ~57,600 triangles)
python examples.py mountain

# Start server
uvicorn server_three:app --reload --port 8000
# open http://localhost:8000
```

## Exporting a Manifold

```python
from manifold_core import Manifold
from export_three  import export_to_json

# Define a manifold via DSL string
terrain = Manifold.from_dsl("terrain", "x*y * sin(x)", texture="rock")

# Tessellate and export — signed by default
export_to_json(terrain, path="static/terrain.json", res=120, scale=1.0)
```

Or re-export via HTTP after the server is running:

```http
POST /api/export/mountain
Content-Type: application/json
{"res": 150, "scale": 1.5, "t": 0.0}
```

## JSON Format

```json
{
  "name":      "mountain",
  "vertices":  [[x, y, z], ...],
  "faces":     [[i, j, k], ...],
  "attributes": {"texture": "rock", "sound": "mountain_theme"},
  "hash":      "sha256hex..."
}
```

`vertices` are flat triangle vertices. `faces` are index triples. `hash` is the SHA-256 of the remaining fields in sorted-key compact JSON.

## Security — Hash Verification

The browser verifies `hash` with `crypto.subtle.digest('SHA-256', ...)` before rendering. Any tampered file is rejected.

The server also exposes:
```
GET /api/verify/mountain   → { valid: true, expected: "abc…", actual: "abc…" }
```

## Three.js Viewer Controls

| Control | Action |
|---------|--------|
| Left-drag | Orbit |
| Scroll / pinch | Zoom |
| Right-drag | Pan |
| Wireframe slider | Toggle wireframe |
| Metalness / Roughness | Adjust PBR material |
| JSON path + Load | Load any manifold from `/static/` |

## Expansion Paths

| Feature | Integration |
|---------|-------------|
| Animated manifolds | Call `POST /api/export/{name}` each frame with increasing `t`, stream via WebSocket |
| NPC positions | Export NPC tick positions as JSON array → Three.js `InstancedMesh` |
| Web Audio | Map music manifold output to `AudioContext.createOscillator()` frequencies |
| Post-processing | Add Three.js `EffectComposer` with `BloomPass` and `BokehPass` to `viewer.html` |
| Cinematic paths | Export camera-path manifold as `CatmullRomCurve3` control points |
