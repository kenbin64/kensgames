"""
export_three.py — Export a Manifold surface to Three.js-compatible JSON.

Output format
-------------
{
    "name": "terrain",
    "vertices": [[x, y, z], ...],   # flat list of triangle vertices
    "faces":    [[i, j, k], ...],   # index triples
    "attributes": { ... }            # pass-through manifold attributes
}

The exported file is ready for direct consumption by the Three.js viewer
and can be signed by the security substrate before serving.
"""

import json
import hashlib
import math
from pathlib import Path
from typing import Union

from manifold_core import Manifold, ManifoldInstance


# ---------------------------------------------------------------------------
# Core tessellator
# ---------------------------------------------------------------------------

def manifold_to_three(
    manifold: Manifold,
    res: int = 100,
    scale: float = 1.0,
    t: float = 0.0,
) -> dict:
    """
    Tessellate a 2-D manifold surface into a triangle mesh.

    Samples the expression on a (res × res) grid over [-1, 1]² and
    emits two triangles per quad cell.

    Parameters
    ----------
    manifold : Manifold  surface to tessellate
    res      : int       grid resolution (number of steps per axis)
    scale    : float     uniform scale applied to all coordinates
    t        : float     time parameter passed to the expression

    Returns
    -------
    dict with keys: name, vertices, faces, attributes
    """
    vertices: list[list[float]] = []
    faces:    list[list[int]]  = []

    step = 2.0 / res  # step size in [-1, 1] range

    for i in range(res):
        for j in range(res):
            # Four corners of the current quad cell
            x0 = -1.0 + i * step
            y0 = -1.0 + j * step
            x1 = x0 + step
            y1 = y0 + step

            z00 = manifold.evaluate(x0, y0, t)
            z10 = manifold.evaluate(x1, y0, t)
            z01 = manifold.evaluate(x0, y1, t)
            z11 = manifold.evaluate(x1, y1, t)

            base = len(vertices)

            vertices.extend([
                [round(x0 * scale, 6), round(y0 * scale, 6), round(z00 * scale, 6)],
                [round(x1 * scale, 6), round(y0 * scale, 6), round(z10 * scale, 6)],
                [round(x0 * scale, 6), round(y1 * scale, 6), round(z01 * scale, 6)],
                [round(x1 * scale, 6), round(y1 * scale, 6), round(z11 * scale, 6)],
            ])

            # Two triangles: lower-left and upper-right of the quad
            faces.append([base,     base + 1, base + 2])
            faces.append([base + 1, base + 3, base + 2])

    return {
        "name":       manifold.name,
        "vertices":   vertices,
        "faces":      faces,
        "attributes": manifold.attributes,
    }


# ---------------------------------------------------------------------------
# Security substrate — sign the exported payload
# ---------------------------------------------------------------------------

def _sign_payload(data: dict) -> dict:
    """
    Attach a SHA-256 content hash to the exported data.
    The browser viewer verifies this before rendering.
    """
    payload_bytes = json.dumps(
        {k: v for k, v in data.items() if k != "hash"},
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    data["hash"] = hashlib.sha256(payload_bytes).hexdigest()
    return data


# ---------------------------------------------------------------------------
# Public export function
# ---------------------------------------------------------------------------

def export_to_json(
    source: Union[Manifold, ManifoldInstance],
    path: str = "static/manifold.json",
    res: int = 100,
    scale: float = 1.0,
    t: float = 0.0,
    sign: bool = True,
) -> Path:
    """
    Tessellate a manifold and write it to a JSON file for the Three.js viewer.

    Parameters
    ----------
    source : Manifold or ManifoldInstance   source manifold
    path   : str    output path (relative to cwd, default: static/manifold.json)
    res    : int    grid resolution
    scale  : float  uniform scale
    t      : float  time parameter
    sign   : bool   attach SHA-256 content hash (default: True)

    Returns
    -------
    Path to the written file
    """
    manifold = source.manifold if isinstance(source, ManifoldInstance) else source

    data = manifold_to_three(manifold, res=res, scale=scale, t=t)

    if sign:
        data = _sign_payload(data)

    out_path = Path(path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))

    vertex_count = len(data["vertices"])
    face_count   = len(data["faces"])
    print(f"Exported {manifold.name!r} → {out_path}  "
          f"({vertex_count} vertices, {face_count} faces"
          + (f", hash={data['hash'][:12]}…" if sign else "") + ")")

    return out_path


# ---------------------------------------------------------------------------
# CLI convenience
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    import importlib

    # Usage: python export_three.py <module.ManifoldName> [res] [scale]
    # Example: python export_three.py examples.mountain  120  1.0

    if len(sys.argv) < 2:
        print("Usage: python export_three.py <module.attr> [res=100] [scale=1.0]")
        sys.exit(1)

    module_path, _, attr = sys.argv[1].rpartition(".")
    mod = importlib.import_module(module_path)
    obj = getattr(mod, attr)

    res_arg   = int(sys.argv[2])   if len(sys.argv) > 2 else 100
    scale_arg = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0

    export_to_json(obj, path="static/manifold.json", res=res_arg, scale=scale_arg)
