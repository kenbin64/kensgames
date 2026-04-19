"""
substrates/text_to_3d.py — Text → 3D mesh (0D → 3D)

Model priority:
  1. Shap-E latent diffusion  (openai/shap-e)    — text → implicit field → mesh
  2. Point-E                  (openai/point-e)   — text → point cloud → mesh
  3. Stub                      — manifold gyroid  (no GPU)

Input fields
------------
  prompt   : str   required
  guidance : float default 15.0
  steps    : int   default 64
  mc_res   : int   default 128 — marching-cubes resolution for mesh extraction
  seed     : int   optional

Output
------
  /static/jobs/<job_id>/mesh.obj   (+ mesh.mtl)

Combine with image_to_3d.py via /api/pipeline when you want
a text→image→3D chain with finer texture control.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Callable

from .base import InferenceSubstrate, Job
from .image_to_3d import _write_stub_obj


class TextTo3DSubstrate(InferenceSubstrate):
    dim_in  = 0   # atom: text prompt
    dim_out = 3   # volume: mesh

    @classmethod
    def load_model(cls):
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"

            # Shap-E
            try:
                from shap_e.diffusion.sample import sample_latents
                from shap_e.diffusion.gaussian_diffusion import diffusion_from_config
                from shap_e.models.download import load_model as shap_load, load_config
                from shap_e.util.notebooks import decode_latent_mesh

                xm     = shap_load("transmitter", device=device)
                model  = shap_load("text300M", device=device)
                diffusion = diffusion_from_config(load_config("diffusion"))
                print(f"[TextTo3D] Loaded Shap-E on {device}")
                return {
                    "backend":   "shap-e",
                    "device":    device,
                    "xm":        xm,
                    "model":     model,
                    "diffusion": diffusion,
                    "decode_mesh": decode_latent_mesh,
                    "sample_latents": sample_latents,
                }
            except Exception as e:
                print(f"[TextTo3D] Shap-E unavailable: {e}")

            # Point-E fallback
            try:
                from point_e.diffusion.configs import DIFFUSION_CONFIGS, diffusion_from_config
                from point_e.diffusion.sampler import PointCloudSampler
                from point_e.models.download import load_checkpoint
                from point_e.models.configs import MODEL_CONFIGS, model_from_config

                base_name = "base40M-textvec"
                base_model = model_from_config(MODEL_CONFIGS[base_name], device=device)
                base_model.load_state_dict(load_checkpoint(base_name, device))
                upsampler = model_from_config(MODEL_CONFIGS["upsample"], device=device)
                upsampler.load_state_dict(load_checkpoint("upsample", device))
                base_diffusion  = diffusion_from_config(DIFFUSION_CONFIGS[base_name])
                up_diffusion    = diffusion_from_config(DIFFUSION_CONFIGS["upsample"])
                sampler = PointCloudSampler(
                    device=device,
                    models=[base_model, upsampler],
                    diffusions=[base_diffusion, up_diffusion],
                    num_points=[1024, 4096 - 1024],
                    aux_channels=["R", "G", "B"],
                    guidance_scale=[3.0, 0.0],
                )
                print(f"[TextTo3D] Loaded Point-E on {device}")
                return {"backend": "point-e", "device": device, "sampler": sampler}
            except Exception as e:
                print(f"[TextTo3D] Point-E unavailable: {e}")

        except ImportError:
            print("[TextTo3D] torch not installed — running in stub mode")

        return None

    def run(self, job: Job, progress_cb: Callable[[float, str], None]) -> Path:
        params   = job.input
        prompt   = str(params.get("prompt", "a manifold object"))
        guidance = float(params.get("guidance", 15.0))
        steps    = int(params.get("steps", 64))
        mc_res   = int(params.get("mc_res", 128))
        seed     = params.get("seed")

        out_dir  = self.job_dir(job.job_id)
        out_path = out_dir / "mesh.obj"

        progress_cb(0.05, "Starting generation")

        if self.__class__._model is None:
            _write_stub_gyroid_obj(out_path, prompt)
            progress_cb(1.0, "Stub gyroid mesh written (no model loaded)")
            return out_path

        backend = self.__class__._model["backend"]

        if backend == "shap-e":
            return self._run_shape_e(job, out_path, prompt, guidance, steps, seed, progress_cb)
        if backend == "point-e":
            return self._run_point_e(job, out_path, prompt, steps, progress_cb)

        _write_stub_gyroid_obj(out_path, prompt)
        return out_path

    # ── Shap-E ────────────────────────────────────────────────────────────

    def _run_shape_e(self, job: Job, out_path: Path, prompt: str,
                     guidance: float, steps: int, seed, progress_cb) -> Path:
        import torch
        m = self.__class__._model
        device = m["device"]

        gen = torch.Generator(device=device)
        if seed is not None:
            gen.manual_seed(int(seed))

        progress_cb(0.1, "Sampling latents")
        latents = m["sample_latents"](
            batch_size=1,
            model=m["model"],
            diffusion=m["diffusion"],
            guidance_scale=guidance,
            model_kwargs={"texts": [prompt]},
            progress=True,
            clip_denoised=True,
            use_fp16=True,
            use_karras=True,
            karras_steps=steps,
            sigma_min=1e-3,
            sigma_max=160,
            s_churn=0,
            generator=gen,
        )
        progress_cb(0.7, "Decoding mesh")
        tri_mesh = m["decode_mesh"](m["xm"], latents[0], device=device)
        tri_mesh.mesh.export(str(out_path))
        progress_cb(1.0, "Done")
        return out_path

    # ── Point-E ───────────────────────────────────────────────────────────

    def _run_point_e(self, job: Job, out_path: Path, prompt: str,
                     steps: int, progress_cb) -> Path:
        """Convert point cloud to OBJ via alpha-shape or open3d convex hull."""
        import torch
        m = self.__class__._model

        progress_cb(0.1, "Sampling point cloud")
        samples = None
        for i, x in enumerate(m["sampler"].sample_batch_progressive(
                batch_size=1, model_kwargs={"texts": [prompt]})):
            samples = x
            progress_cb(0.1 + 0.6 * (i / steps), f"Step {i}")

        pc = m["sampler"].output_to_point_clouds(samples)[0]
        coords = pc.coords  # (N, 3)

        progress_cb(0.8, "Reconstructing surface")
        try:
            import open3d as o3d
            pcd = o3d.geometry.PointCloud()
            pcd.points = o3d.utility.Vector3dVector(coords)
            pcd.estimate_normals()
            mesh, _  = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(pcd, depth=9)
            o3d.io.write_triangle_mesh(str(out_path), mesh)
        except ImportError:
            # Fallback: write point cloud as OBJ vertices only
            lines = [f"# Point-E output: {prompt}"]
            for (px, py, pz) in coords:
                lines.append(f"v {px:.6f} {py:.6f} {pz:.6f}")
            out_path.write_text("\n".join(lines), encoding="utf-8")

        progress_cb(1.0, "Done")
        return out_path


# ---------------------------------------------------------------------------
# Stub: gyroid isosurface via marching cubes (pure Python, no torch)
# Derives geometry from the manifold surface function z = x · y²
# ---------------------------------------------------------------------------

def _write_stub_gyroid_obj(path: Path, prompt: str = "stub",
                            res: int = 16, scale: float = 2.0) -> None:
    """
    Approximate gyroid surface by sign-change edge sampling.
    Pure Python — no numpy, no torch, no external deps.
    """
    import hashlib

    def gyroid(x: float, y: float, z: float) -> float:
        return (math.sin(x) * math.cos(y) +
                math.sin(y) * math.cos(z) +
                math.sin(z) * math.cos(x))

    step  = 2.0 * scale / res
    verts: list[tuple[float, float, float]] = []
    vert_idx: dict[tuple, int] = {}
    faces: list[tuple[int, int, int]] = []

    def _vert(v: tuple) -> int:
        if v not in vert_idx:
            vert_idx[v] = len(verts) + 1
            verts.append(v)
        return vert_idx[v]

    def _lerp(a, b, va, vb):
        t = va / (va - vb + 1e-12)
        return tuple(a[i] + t * (b[i] - a[i]) for i in range(3))

    for ix in range(res):
        for iy in range(res):
            for iz in range(res):
                cx = -scale + ix * step
                cy = -scale + iy * step
                cz = -scale + iz * step
                corners = [
                    (cx,        cy,        cz),
                    (cx + step, cy,        cz),
                    (cx + step, cy + step, cz),
                    (cx,        cy + step, cz),
                    (cx,        cy,        cz + step),
                    (cx + step, cy,        cz + step),
                    (cx + step, cy + step, cz + step),
                    (cx,        cy + step, cz + step),
                ]
                vals = [gyroid(*c) for c in corners]

                # Surface quad approximation: if any face crosses zero, emit a tri
                face_pairs = [(0,1,2,3),(4,5,6,7),(0,1,5,4),(3,2,6,7),(0,3,7,4),(1,2,6,5)]
                for (a, b, c_, d) in face_pairs:
                    signs = [v > 0 for v in (vals[a], vals[b], vals[c_], vals[d])]
                    if not (all(signs) or not any(signs)):
                        va = _lerp(corners[a], corners[b], vals[a], vals[b])
                        vb = _lerp(corners[b], corners[c_], vals[b], vals[c_])
                        vc_ = _lerp(corners[c_], corners[d], vals[c_], vals[d])
                        i1, i2, i3 = _vert(va), _vert(vb), _vert(vc_)
                        faces.append((i1, i2, i3))

    # Trim if too large for a stub
    faces = faces[:4000]

    label = hashlib.sha256(prompt.encode()).hexdigest()[:8]
    lines = [f"# Manifold stub gyroid — {prompt[:60]} ({label})", "o gyroid_stub"]
    for (vx, vy, vz) in verts:
        lines.append(f"v {vx:.5f} {vy:.5f} {vz:.5f}")
    for (a, b, c_) in faces:
        lines.append(f"f {a} {b} {c_}")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Companion MTL
    mtl = path.parent / "mesh.mtl"
    mtl.write_text(
        "newmtl gyroid_mat\nKd 0.4 0.8 0.6\nKa 0.05 0.1 0.07\nKs 0.2 0.2 0.2\nNs 24\n",
        encoding="utf-8",
    )
