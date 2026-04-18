"""
examples.py — pre-registered manifolds for quick testing.

Run the server then open http://localhost:8000
Export any manifold with:

    python -c "import examples; from export_three import export_to_json; export_to_json(examples.mountain, path='static/mountain.json', res=120)"
"""

import math
from manifold_core import Manifold, Runtime
from export_three  import export_to_json

# ---------------------------------------------------------------------------
# Terrain manifolds
# ---------------------------------------------------------------------------

mountain = Manifold.register(
    "mountain",
    expression=lambda x, y, t=0.0: x * y * math.sin(x + t),
    texture="rock",
    sound="mountain_theme",
)

gyroid = Manifold.register(
    "gyroid",
    expression=lambda x, y, t=0.0: (
        math.sin(x * math.pi) * math.cos(y * math.pi) +
        math.sin(y * math.pi) * math.cos(x * math.pi)
    ),
    texture="rock_moss",
    collision="auto",
)

ripple = Manifold.register(
    "ripple",
    expression=lambda x, y, t=0.0: (
        math.sin(math.sqrt(x**2 + y**2) * 6 - t * 2) * 0.25
    ),
    texture="water",
)

saddle = Manifold.register(
    "saddle",
    expression=lambda x, y, t=0.0: x * y,
    texture="stone",
)

wave = Manifold.register(
    "wave",
    expression=lambda x, y, t=0.0: math.sin(x * 3 + t) * math.cos(y * 3),
    texture="sand",
)


# ---------------------------------------------------------------------------
# CLI: export all examples to static/
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys
    names = sys.argv[1:] or list(Manifold._registry.keys())
    for name in names:
        instance = Runtime.observe(name)
        export_to_json(instance, path=f"static/{name}.json", res=120, scale=1.0)
