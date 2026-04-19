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
from pathlib import Path
from typing import Union

from manifold_core import Manifold, ManifoldInstance
from manifold_mesh import tessellate


# ---------------------------------------------------------------------------
# Three.js format adapter
# ---------------------------------------------------------------------------

def manifold_to_three(
    manifold: Union[Manifold, ManifoldInstance],
    res: int = 100,
    scale: float = 1.0,
    t: float = 0.0,
) -> dict:
    """
    Return a Three.js-compatible mesh dict from the shared tessellator.

    Three.js only needs vertices + faces (normals/UVs optional here);
    the full mesh is available via manifold_mesh.tessellate() directly.
    """
    mesh = tessellate(manifold, res=res, scale=scale, t=t)
    return {
        "name":       mesh["name"],
        "vertices":   mesh["vertices"],
        "normals":    mesh["normals"],
        "uvs":        mesh["uvs"],
        "faces":      mesh["faces"],
        "attributes": mesh["attributes"],
    }


# ---------------------------------------------------------------------------
# Security substrate — sign the exported payload
# ---------------------------------------------------------------------------

def _sign_payload(data: dict) -> dict:
    """
    Attach a SHA-256 content hash to the exported data.
    The browser viewer verifies this before rendering.
    """
    # Build output as a new dict — avoids mutating the caller's reference.
    payload = {k: v for k, v in data.items() if k != "hash"}
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return {**payload, "hash": hashlib.sha256(payload_bytes).hexdigest()}


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
