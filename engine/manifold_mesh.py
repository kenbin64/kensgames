"""
manifold_mesh.py — Shared tessellator for all Manifold export adapters.

Every exporter (Three.js, Blender OBJ, Unity prefab, …) calls
`tessellate()` and receives a format-agnostic mesh dict:

    {
        "name"      : str,
        "vertices"  : [[x, y, z], ...],   # flat list, no duplicates
        "normals"   : [[nx, ny, nz], ...], # per-vertex, unit length
        "uvs"       : [[u, v], ...],       # per-vertex, [0,1]²
        "faces"     : [[i, j, k], ...],    # index triples
        "attributes": { ... },             # pass-through manifold attributes
    }

Design: Schwartz-diamond minimum — store two numbers, derive everything.
Vertices are unique (index-addressed). Normals are computed analytically
from the manifold gradient rather than averaging face normals post-hoc.
"""

import math
from typing import Union
from manifold_core import Manifold, ManifoldInstance


# ---------------------------------------------------------------------------
# Gradient helpers
# ---------------------------------------------------------------------------

_EPS = 1e-5  # finite-difference step


def _gradient(manifold: Manifold, x: float, y: float, t: float) -> tuple[float, float, float]:
    """
    Return the surface normal at (x, y) via central-difference gradient.
    The surface is F(x, y) = z - f(x, y) = 0.
    Normal = (-dz/dx, -dz/dy, 1) normalised.
    """
    dz_dx = (manifold.evaluate(x + _EPS, y, t) - manifold.evaluate(x - _EPS, y, t)) / (2 * _EPS)
    dz_dy = (manifold.evaluate(x, y + _EPS, t) - manifold.evaluate(x, y - _EPS, t)) / (2 * _EPS)
    nx, ny, nz = -dz_dx, -dz_dy, 1.0
    length = math.sqrt(nx * nx + ny * ny + nz * nz)
    if length < _EPS:
        return (0.0, 0.0, 1.0)
    return (nx / length, ny / length, nz / length)


# ---------------------------------------------------------------------------
# Core tessellator
# ---------------------------------------------------------------------------

def tessellate(
    source: Union[Manifold, ManifoldInstance],
    res: int = 100,
    scale: float = 1.0,
    t: float = 0.0,
) -> dict:
    """
    Tessellate a manifold surface into a shared-vertex triangle mesh.

    Samples the expression on a (res × res) grid over [-1, 1]².
    Produces (res+1)² unique vertices — no duplication across quads.
    Each quad cell becomes two triangles.

    Parameters
    ----------
    source : Manifold or ManifoldInstance
    res    : int    grid resolution (steps per axis); total verts = (res+1)²
    scale  : float  uniform scale on all axes
    t      : float  time parameter

    Returns
    -------
    Mesh dict with keys: name, vertices, normals, uvs, faces, attributes
    """
    manifold = source.manifold if isinstance(source, ManifoldInstance) else source

    n_verts = (res + 1) * (res + 1)
    n_faces = res * res * 2

    vertices: list = [None] * n_verts
    normals:  list = [None] * n_verts
    uvs:      list = [None] * n_verts
    faces:    list = [None] * n_faces

    step = 2.0 / res  # step in [-1, 1]

    # Build unique vertex grid row-major: index = row*(res+1) + col
    for row in range(res + 1):
        y = -1.0 + row * step
        v = row / res  # UV [0, 1]
        for col in range(res + 1):
            x = -1.0 + col * step
            z = manifold.evaluate(x, y, t)
            idx = row * (res + 1) + col
            vertices[idx] = [round(x * scale, 6), round(y * scale, 6), round(z * scale, 6)]
            normals[idx]  = list(_gradient(manifold, x, y, t))
            uvs[idx]      = [round(col / res, 6), round(v, 6)]

    # Build faces — two triangles per quad cell
    fi = 0
    for row in range(res):
        for col in range(res):
            tl = row * (res + 1) + col        # top-left
            tr = tl + 1                        # top-right
            bl = (row + 1) * (res + 1) + col  # bottom-left
            br = bl + 1                        # bottom-right
            faces[fi]     = [tl, tr, bl]       # lower-left triangle
            faces[fi + 1] = [tr, br, bl]       # upper-right triangle
            fi += 2

    return {
        "name":       manifold.name,
        "vertices":   vertices,
        "normals":    normals,
        "uvs":        uvs,
        "faces":      faces,
        "attributes": manifold.attributes,
    }
