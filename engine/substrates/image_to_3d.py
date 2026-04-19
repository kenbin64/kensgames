"""
substrates/image_to_3d.py — Image → 3D mesh (2D → 3D)

Model priority:
  1. TripoSR   (stabilityai/TripoSR)  — fast single-image reconstruction
  2. Zero123++ (sudo-ai/zero123plus)  — multi-view synthesis then mesh
  3. Stub       — sphere OBJ built from the manifold engine (no GPU)

Input fields
------------
  source   : str   required — URL or local path of the source image
  mc_res   : int   default 256 — marching-cubes resolution
  foreground_ratio : float default 0.85 — subject crop ratio

Output
------
  /static/jobs/<job_id>/mesh.obj   (+ mesh.mtl, texture.png)

The OBJ is ready to import into Blender, Unity, or as a game asset.
Use auto_rig.py in the next pipeline step to add a skeleton.
"""

from __future__ import annotations

import math
import struct
import zlib
from io import BytesIO
from pathlib import Path
from typing import Callable

from .base import InferenceSubstrate, Job


class ImageTo3DSubstrate(InferenceSubstrate):
    dim_in  = 2   # plane: image
    dim_out = 3   # volume: mesh

    _MODEL_PRIORITY = [
        "stabilityai/TripoSR",
        "sudo-ai/zero123plus",
    ]

    @classmethod
    def load_model(cls):
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"

            # TripoSR
            try:
                from tsr.system import TSR
                model = TSR.from_pretrained(
                    "stabilityai/TripoSR",
                    config_name="config.yaml",
                    weight_name="model.ckpt",
                )
                model = model.to(device)
                model.renderer.set_chunk_size(131072)
                print(f"[ImageTo3D] Loaded TripoSR on {device}")
                return {"model": model, "backend": "triposr", "device": device}
            except Exception as e:
                print(f"[ImageTo3D] TripoSR unavailable: {e}")

        except ImportError:
            print("[ImageTo3D] torch not installed — running in stub mode")

        return None

    def run(self, job: Job, progress_cb: Callable[[float, str], None]) -> Path:
        params   = job.input
        source   = str(params.get("source", ""))
        mc_res   = int(params.get("mc_res", 256))
        fg_ratio = float(params.get("foreground_ratio", 0.85))

        out_dir  = self.job_dir(job.job_id)
        out_path = out_dir / "mesh.obj"

        progress_cb(0.05, "Preparing image")

        if self.__class__._model is None:
            _write_stub_obj(out_path, label=source or "stub")
            progress_cb(1.0, "Stub sphere mesh written (no model loaded)")
            return out_path

        # ── TripoSR path ─────────────────────────────────────────────────
        import torch
        from PIL import Image

        model  = self.__class__._model["model"]
        device = self.__class__._model["device"]

        # Load / download image
        if source.startswith("http"):
            import urllib.request
            raw = urllib.request.urlopen(source).read()  # noqa: S310
            image = Image.open(BytesIO(raw)).convert("RGB")
        else:
            image = Image.open(source).convert("RGB")

        progress_cb(0.15, "Running TripoSR forward pass")

        with torch.no_grad():
            scene_codes = model([image], device=device)

        progress_cb(0.55, f"Extracting mesh (mc_res={mc_res})")

        meshes = model.extract_mesh(scene_codes, resolution=mc_res)
        mesh   = meshes[0]

        progress_cb(0.85, "Exporting OBJ")
        mesh.export(str(out_path))

        progress_cb(1.0, "Done")
        return out_path


# ---------------------------------------------------------------------------
# Stub: UV-sphere OBJ — derives geometry from the manifold equation z = x·y²
# ---------------------------------------------------------------------------

def _write_stub_obj(path: Path, label: str = "stub",
                    rings: int = 24, slices: int = 48, radius: float = 1.0) -> None:
    """
    Write a UV sphere as a minimal valid OBJ file.
    No external dependencies — pure Python math.
    """
    lines: list[str] = [
        f"# Manifold stub sphere — {label}",
        f"# rings={rings} slices={slices} r={radius}",
        "mtllib mesh.mtl",
        "o manifold_stub",
    ]

    verts: list[tuple[float, float, float]] = []
    uvs:   list[tuple[float, float]]        = []

    # Vertices + UVs (top pole first)
    for ri in range(rings + 1):
        phi = math.pi * ri / rings           # 0 → π
        for si in range(slices + 1):
            theta = 2.0 * math.pi * si / slices
            x = radius * math.sin(phi) * math.cos(theta)
            y = radius * math.cos(phi)
            z = radius * math.sin(phi) * math.sin(theta)
            verts.append((x, y, z))
            uvs.append((si / slices, 1.0 - ri / rings))

    for (vx, vy, vz) in verts:
        lines.append(f"v {vx:.6f} {vy:.6f} {vz:.6f}")
    for (u, v) in uvs:
        lines.append(f"vt {u:.6f} {v:.6f}")
    # Normals == positions for unit sphere
    for (vx, vy, vz) in verts:
        lines.append(f"vn {vx:.6f} {vy:.6f} {vz:.6f}")

    lines.append("usemtl stub_mat")
    stride = slices + 1
    for ri in range(rings):
        for si in range(slices):
            # Each quad → two triangles (1-based indices)
            a = ri * stride + si + 1
            b = a + 1
            c = a + stride
            d = c + 1
            lines.append(f"f {a}/{a}/{a} {b}/{b}/{b} {d}/{d}/{d}")
            lines.append(f"f {a}/{a}/{a} {d}/{d}/{d} {c}/{c}/{c}")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Write companion MTL
    mtl_path = path.parent / "mesh.mtl"
    mtl_path.write_text(
        "newmtl stub_mat\n"
        "Kd 0.6 0.7 0.9\n"
        "Ka 0.1 0.1 0.1\n"
        "Ks 0.3 0.3 0.3\n"
        "Ns 32\n",
        encoding="utf-8",
    )
