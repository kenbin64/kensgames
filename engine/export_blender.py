"""
export_blender.py — Export a Manifold surface to Blender-native formats.

Outputs
-------
  <name>.obj   Wavefront OBJ — importable by Blender, Maya, Houdini, Cinema4D
  <name>.mtl   Material library — basic Phong parameters derived from attributes
  <name>.ply   Stanford PLY (binary little-endian) — ideal for point-cloud /
               sculpting import and re-topology in Blender

Both formats are produced from the shared `manifold_mesh.tessellate()` grid,
so normals, UVs and geometry are always consistent.

Usage
-----
    from engine.manifold_core import Manifold
    from engine.export_blender import export_obj, export_ply

    m = Manifold.from_dsl("terrain", "x*y * sin(x)", texture="rock")
    export_obj(m, "out/terrain")   # → out/terrain.obj + out/terrain.mtl
    export_ply(m, "out/terrain")   # → out/terrain.ply
"""

import math
import struct
import hashlib
import json
from pathlib import Path
from typing import Union

from manifold_core import Manifold, ManifoldInstance
from manifold_mesh import tessellate


# ---------------------------------------------------------------------------
# OBJ / MTL
# ---------------------------------------------------------------------------

def export_obj(
    source: Union[Manifold, ManifoldInstance],
    stem: str = "static/manifold",
    res: int = 100,
    scale: float = 1.0,
    t: float = 0.0,
) -> tuple[Path, Path]:
    """
    Write <stem>.obj and <stem>.mtl.

    Returns
    -------
    (obj_path, mtl_path)
    """
    mesh = tessellate(source, res=res, scale=scale, t=t)
    name = mesh["name"]
    attrs = mesh["attributes"]

    obj_path = Path(stem).with_suffix(".obj")
    mtl_path = Path(stem).with_suffix(".mtl")
    obj_path.parent.mkdir(parents=True, exist_ok=True)

    # ── MTL ────────────────────────────────────────────────────────────
    # Derive material from manifold attributes; fall back to sensible defaults.
    r, g, b = _hex_to_rgb(attrs.get("color", "#88aacc"))
    roughness   = float(attrs.get("roughness", 0.5))
    metallic    = float(attrs.get("metallic",  0.0))
    emit_r, emit_g, emit_b = _hex_to_rgb(attrs.get("emissive", "#000000"))

    shininess = max(1, int((1.0 - roughness) * 128))  # Phong Ns ∈ [1, 128]

    with mtl_path.open("w", encoding="utf-8") as f:
        f.write(f"# Manifold MTL — {name}\n")
        f.write(f"newmtl {name}\n")
        f.write(f"Ka {r:.4f} {g:.4f} {b:.4f}\n")          # ambient
        f.write(f"Kd {r:.4f} {g:.4f} {b:.4f}\n")          # diffuse
        f.write(f"Ks {metallic:.4f} {metallic:.4f} {metallic:.4f}\n")  # specular
        f.write(f"Ke {emit_r:.4f} {emit_g:.4f} {emit_b:.4f}\n")        # emissive
        f.write(f"Ns {shininess}\n")
        f.write("illum 2\n")
        if "texture" in attrs:
            tex = str(attrs["texture"])
            f.write(f"map_Kd {tex}\n")

    # ── OBJ ────────────────────────────────────────────────────────────
    with obj_path.open("w", encoding="utf-8") as f:
        f.write(f"# Manifold OBJ — {name}\n")
        f.write(f"# Expression: z = f(x, y)\n")
        f.write(f"# Vertices: {len(mesh['vertices'])}, Faces: {len(mesh['faces'])}\n")
        f.write(f"mtllib {mtl_path.name}\n")
        f.write(f"o {name}\n\n")

        for vx, vy, vz in mesh["vertices"]:
            f.write(f"v {vx} {vy} {vz}\n")

        f.write("\n")
        for nx, ny, nz in mesh["normals"]:
            f.write(f"vn {nx:.6f} {ny:.6f} {nz:.6f}\n")

        f.write("\n")
        for u, v in mesh["uvs"]:
            f.write(f"vt {u:.6f} {v:.6f}\n")

        f.write(f"\nusemtl {name}\n")
        # OBJ faces are 1-indexed; format: v/vt/vn
        for i, j, k in mesh["faces"]:
            i1, j1, k1 = i + 1, j + 1, k + 1
            f.write(f"f {i1}/{i1}/{i1} {j1}/{j1}/{j1} {k1}/{k1}/{k1}\n")

    vcount = len(mesh["vertices"])
    fcount = len(mesh["faces"])
    print(f"OBJ  {name!r} → {obj_path}  ({vcount}v {fcount}f)")
    print(f"MTL  {name!r} → {mtl_path}")
    return obj_path, mtl_path


# ---------------------------------------------------------------------------
# PLY (binary little-endian)
# ---------------------------------------------------------------------------

def export_ply(
    source: Union[Manifold, ManifoldInstance],
    stem: str = "static/manifold",
    res: int = 100,
    scale: float = 1.0,
    t: float = 0.0,
) -> Path:
    """
    Write <stem>.ply in binary little-endian format.

    PLY is preferred for sculpting workflows (Blender sculpt mode,
    ZBrush import) and for point-cloud pipelines.

    Returns
    -------
    Path to written .ply file
    """
    mesh = tessellate(source, res=res, scale=scale, t=t)
    name = mesh["name"]
    verts  = mesh["vertices"]
    norms  = mesh["normals"]
    uvs    = mesh["uvs"]
    faces  = mesh["faces"]

    ply_path = Path(stem).with_suffix(".ply")
    ply_path.parent.mkdir(parents=True, exist_ok=True)

    n_verts = len(verts)
    n_faces = len(faces)

    # ASCII header, then binary body
    header_lines = [
        "ply",
        "format binary_little_endian 1.0",
        f"comment Manifold surface: {name}",
        f"element vertex {n_verts}",
        "property float x",
        "property float y",
        "property float z",
        "property float nx",
        "property float ny",
        "property float nz",
        "property float s",
        "property float t",
        f"element face {n_faces}",
        "property list uchar int vertex_indices",
        "end_header",
    ]
    header_bytes = ("\n".join(header_lines) + "\n").encode("ascii")

    # Vertex body: 8 floats × 4 bytes = 32 bytes per vertex
    vert_fmt = "<8f"
    vert_size = struct.calcsize(vert_fmt)
    vertex_buffer = bytearray(n_verts * vert_size)
    for idx, ((vx, vy, vz), (nx, ny, nz), (u, v)) in enumerate(zip(verts, norms, uvs)):
        struct.pack_into(vert_fmt, vertex_buffer, idx * vert_size,
                         vx, vy, vz, nx, ny, nz, u, v)

    # Face body: 1 byte (count=3) + 3 ints = 13 bytes per face
    face_fmt = "<B3i"
    face_size = struct.calcsize(face_fmt)
    face_buffer = bytearray(n_faces * face_size)
    for idx, (i, j, k) in enumerate(faces):
        struct.pack_into(face_fmt, face_buffer, idx * face_size, 3, i, j, k)

    with ply_path.open("wb") as f:
        f.write(header_bytes)
        f.write(vertex_buffer)
        f.write(face_buffer)

    print(f"PLY  {name!r} → {ply_path}  ({n_verts}v {n_faces}f, binary LE)")
    return ply_path


# ---------------------------------------------------------------------------
# Colour helper
# ---------------------------------------------------------------------------

def _hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    """Parse '#rrggbb' or 'rrggbb' → (r, g, b) in [0, 1]."""
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = h[0]*2 + h[1]*2 + h[2]*2
    if len(h) != 6:
        return (0.5, 0.5, 0.5)
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return (r, g, b)
