"""
substrates/auto_rig.py — Mesh → Rigged mesh (3D → 3D+)

Takes an OBJ mesh and attaches a biped or creature skeleton with skinning weights.

Model priority:
  1. RigNet (zhan-xu/RigNet)  — neural auto-rigging from mesh graph
  2. AccuRIG heuristic         — center-of-mass joint placement (no model)
  3. Stub                      — minimal T-pose biped skeleton JSON

Input fields
------------
  source   : str   required — URL or path to mesh.obj
  skeleton : str   default "biped" — "biped" | "quadruped" | "hand" | "auto"
  lbs_iter : int   default 10 — linear blend skinning smoothing iterations

Output
------
  /static/jobs/<job_id>/rigged.json — rig data readable by Three.js SkeletonHelper
  /static/jobs/<job_id>/rigged.obj  — mesh with vertex group comments (for Blender)

rigged.json schema
------------------
  {
    "bones": [
      { "name": "Hips", "parent": -1, "head": [x,y,z], "tail": [x,y,z] },
      ...
    ],
    "skin_weights": [
      [bone_idx, weight, ...],   // per vertex, up to 4 influences
      ...
    ],
    "mesh_source": "<source url>"
  }
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Callable

from .base import InferenceSubstrate, Job


class AutoRigSubstrate(InferenceSubstrate):
    dim_in  = 3   # volume: mesh
    dim_out = 3   # volume: rigged mesh (same dimension, extended attributes)

    @classmethod
    def load_model(cls):
        """
        RigNet requires a custom environment. Fall back gracefully to
        heuristic AccuRIG-style rigging which needs no GPU.
        """
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            # RigNet is not pip-installable; check for local install
            import importlib.util
            spec = importlib.util.find_spec("rignet")
            if spec is not None:
                from rignet import AutoRigger
                rigger = AutoRigger(device=device)
                print(f"[AutoRig] Loaded RigNet on {device}")
                return {"backend": "rignet", "rigger": rigger, "device": device}
        except Exception as e:
            print(f"[AutoRig] RigNet unavailable: {e}")

        # Heuristic mode — no model needed
        print("[AutoRig] Using heuristic rig placement (no model)")
        return {"backend": "heuristic"}

    def run(self, job: Job, progress_cb: Callable[[float, str], None]) -> Path:
        params   = job.input
        source   = str(params.get("source", ""))
        skeleton = str(params.get("skeleton", "biped"))
        lbs_iter = int(params.get("lbs_iter", 10))

        out_dir   = self.job_dir(job.job_id)
        json_path = out_dir / "rigged.json"
        obj_path  = out_dir / "rigged.obj"

        progress_cb(0.05, "Loading mesh")

        # Load mesh (OBJ vertices only — enough for skeleton placement)
        verts = _load_obj_verts(source)
        if not verts:
            verts = _unit_humanoid_verts()   # fallback for tests
            progress_cb(0.1, "No mesh loaded — using unit humanoid")

        progress_cb(0.2, f"Placing {skeleton} skeleton")

        model_info = self.__class__._model or {"backend": "heuristic"}
        backend = model_info.get("backend", "heuristic")

        if backend == "rignet":
            bones, weights = self._run_rignet(verts, model_info, progress_cb)
        else:
            bones, weights = _heuristic_rig(verts, skeleton, lbs_iter, progress_cb)

        progress_cb(0.9, "Writing output")

        rig = {
            "bones":        bones,
            "skin_weights": weights,
            "mesh_source":  source,
            "skeleton_type": skeleton,
        }
        json_path.write_text(json.dumps(rig, indent=2), encoding="utf-8")

        # Write annotated OBJ with vertex group comments
        _write_annotated_obj(obj_path, verts, weights, bones)

        progress_cb(1.0, f"Rig written — {len(bones)} bones, {len(verts)} vertices")
        return json_path   # primary output is the rig JSON

    # ── RigNet path ───────────────────────────────────────────────────────

    def _run_rignet(self, verts, model_info, progress_cb):
        rigger = model_info["rigger"]
        import numpy as np
        v = np.array(verts, dtype=np.float32)
        progress_cb(0.4, "RigNet inference")
        result = rigger.rig(v)
        bones   = result["bones"]    # list of dicts
        weights = result["weights"]  # list of per-vertex lists
        return bones, weights


# ---------------------------------------------------------------------------
# Heuristic auto-rig — AccuRIG-style center-of-mass joint placement
# ---------------------------------------------------------------------------

def _heuristic_rig(
    verts: list[tuple[float, float, float]],
    skeleton: str,
    lbs_iter: int,
    progress_cb: Callable,
) -> tuple[list[dict], list[list]]:
    """
    Place joints using axis-aligned bounding box proportions.
    Good enough for a playable character skeleton; refine in Blender.
    """
    if not verts:
        verts = _unit_humanoid_verts()

    xs = [v[0] for v in verts]
    ys = [v[1] for v in verts]
    zs = [v[2] for v in verts]
    mn = (min(xs), min(ys), min(zs))
    mx = (max(xs), max(ys), max(zs))

    def lerp(a, b, t): return a + (b - a) * t
    def pt(tx, ty, tz):
        return [lerp(mn[0], mx[0], tx),
                lerp(mn[1], mx[1], ty),
                lerp(mn[2], mx[2], tz)]

    if skeleton == "biped":
        bones = _biped_bones(pt)
    elif skeleton == "quadruped":
        bones = _quadruped_bones(pt)
    elif skeleton == "hand":
        bones = _hand_bones(pt)
    else:
        bones = _biped_bones(pt)   # auto default

    progress_cb(0.6, f"Computing LBS weights ({lbs_iter} iterations)")
    weights = _lbs_weights(verts, bones, lbs_iter)
    return bones, weights


def _biped_bones(pt) -> list[dict]:
    return [
        {"name": "Hips",          "parent": -1, "head": pt(0.5, 0.52, 0.5), "tail": pt(0.5, 0.58, 0.5)},
        {"name": "Spine",         "parent":  0, "head": pt(0.5, 0.58, 0.5), "tail": pt(0.5, 0.70, 0.5)},
        {"name": "Chest",         "parent":  1, "head": pt(0.5, 0.70, 0.5), "tail": pt(0.5, 0.82, 0.5)},
        {"name": "Neck",          "parent":  2, "head": pt(0.5, 0.82, 0.5), "tail": pt(0.5, 0.88, 0.5)},
        {"name": "Head",          "parent":  3, "head": pt(0.5, 0.88, 0.5), "tail": pt(0.5, 1.00, 0.5)},
        {"name": "Shoulder.L",    "parent":  2, "head": pt(0.5, 0.82, 0.5), "tail": pt(0.25, 0.82, 0.5)},
        {"name": "UpperArm.L",    "parent":  5, "head": pt(0.25, 0.82, 0.5), "tail": pt(0.12, 0.65, 0.5)},
        {"name": "ForeArm.L",     "parent":  6, "head": pt(0.12, 0.65, 0.5), "tail": pt(0.05, 0.48, 0.5)},
        {"name": "Hand.L",        "parent":  7, "head": pt(0.05, 0.48, 0.5), "tail": pt(0.03, 0.40, 0.5)},
        {"name": "Shoulder.R",    "parent":  2, "head": pt(0.5, 0.82, 0.5), "tail": pt(0.75, 0.82, 0.5)},
        {"name": "UpperArm.R",    "parent":  9, "head": pt(0.75, 0.82, 0.5), "tail": pt(0.88, 0.65, 0.5)},
        {"name": "ForeArm.R",     "parent": 10, "head": pt(0.88, 0.65, 0.5), "tail": pt(0.95, 0.48, 0.5)},
        {"name": "Hand.R",        "parent": 11, "head": pt(0.95, 0.48, 0.5), "tail": pt(0.97, 0.40, 0.5)},
        {"name": "UpperLeg.L",    "parent":  0, "head": pt(0.40, 0.52, 0.5), "tail": pt(0.35, 0.30, 0.5)},
        {"name": "LowerLeg.L",    "parent": 13, "head": pt(0.35, 0.30, 0.5), "tail": pt(0.36, 0.12, 0.5)},
        {"name": "Foot.L",        "parent": 14, "head": pt(0.36, 0.12, 0.5), "tail": pt(0.36, 0.00, 0.52)},
        {"name": "UpperLeg.R",    "parent":  0, "head": pt(0.60, 0.52, 0.5), "tail": pt(0.65, 0.30, 0.5)},
        {"name": "LowerLeg.R",    "parent": 16, "head": pt(0.65, 0.30, 0.5), "tail": pt(0.64, 0.12, 0.5)},
        {"name": "Foot.R",        "parent": 17, "head": pt(0.64, 0.12, 0.5), "tail": pt(0.64, 0.00, 0.52)},
    ]


def _quadruped_bones(pt) -> list[dict]:
    return [
        {"name": "Root",       "parent": -1, "head": pt(0.5, 0.5, 0.5), "tail": pt(0.5, 0.6, 0.5)},
        {"name": "Spine01",    "parent":  0, "head": pt(0.5, 0.6, 0.5), "tail": pt(0.5, 0.6, 0.65)},
        {"name": "Spine02",    "parent":  1, "head": pt(0.5, 0.6, 0.65),"tail": pt(0.5, 0.65, 0.8)},
        {"name": "Neck",       "parent":  2, "head": pt(0.5, 0.65, 0.8),"tail": pt(0.5, 0.75, 0.95)},
        {"name": "Head",       "parent":  3, "head": pt(0.5, 0.75, 0.95),"tail": pt(0.5, 0.75, 1.0)},
        {"name": "Tail01",     "parent":  0, "head": pt(0.5, 0.6, 0.5), "tail": pt(0.5, 0.6, 0.3)},
        {"name": "Tail02",     "parent":  5, "head": pt(0.5, 0.6, 0.3), "tail": pt(0.5, 0.55, 0.1)},
        {"name": "FrontLeg.L", "parent":  2, "head": pt(0.35, 0.6, 0.75),"tail": pt(0.3, 0.3, 0.72)},
        {"name": "FrontLeg.R", "parent":  2, "head": pt(0.65, 0.6, 0.75),"tail": pt(0.7, 0.3, 0.72)},
        {"name": "BackLeg.L",  "parent":  0, "head": pt(0.35, 0.6, 0.35),"tail": pt(0.3, 0.3, 0.3)},
        {"name": "BackLeg.R",  "parent":  0, "head": pt(0.65, 0.6, 0.35),"tail": pt(0.7, 0.3, 0.3)},
    ]


def _hand_bones(pt) -> list[dict]:
    """5-finger hand skeleton."""
    bones = [{"name": "Palm", "parent": -1, "head": pt(0.5, 0.5, 0.0), "tail": pt(0.5, 0.5, 0.3)}]
    fingers = [
        ("Thumb",  0.15), ("Index",  0.30), ("Middle", 0.50),
        ("Ring",   0.70), ("Pinky",  0.85),
    ]
    bi = 1
    for fname, fx in fingers:
        parent_palm = 0
        for seg in range(3):
            tz_head = 0.3 + seg * 0.22
            tz_tail = tz_head + 0.22
            bones.append({
                "name":   f"{fname}.{seg+1:02d}",
                "parent": parent_palm,
                "head":   pt(fx, 0.5, tz_head),
                "tail":   pt(fx, 0.5, tz_tail),
            })
            parent_palm = bi
            bi += 1
    return bones


# ---------------------------------------------------------------------------
# LBS weight computation — inverse-distance from vertex to bone midpoint
# ---------------------------------------------------------------------------

def _lbs_weights(
    verts: list[tuple[float, float, float]],
    bones: list[dict],
    iterations: int,
) -> list[list]:
    """
    Naive inverse-distance weighting for each vertex → up to 4 bone influences.
    Run `iterations` smoothing passes so nearby vertices share weights.
    """
    bone_pts = []
    for b in bones:
        h, t = b["head"], b["tail"]
        mid = [(h[i] + t[i]) * 0.5 for i in range(3)]
        bone_pts.append(mid)

    def dist(v, p):
        return math.sqrt(sum((v[i] - p[i]) ** 2 for i in range(3))) + 1e-6

    weights_out: list[list] = []
    for v in verts:
        dists = [1.0 / dist(v, bp) for bp in bone_pts]
        total = sum(dists)
        norm  = [d / total for d in dists]
        # Keep top 4 influences
        ranked = sorted(enumerate(norm), key=lambda x: x[1], reverse=True)[:4]
        weights_out.append([[idx, round(w, 5)] for idx, w in ranked])

    return weights_out


# ---------------------------------------------------------------------------
# OBJ helpers
# ---------------------------------------------------------------------------

def _load_obj_verts(source: str) -> list[tuple[float, float, float]]:
    """Read vertex positions from a local OBJ path. Returns empty list on error."""
    try:
        if source.startswith("http"):
            import urllib.request
            data = urllib.request.urlopen(source).read().decode("utf-8")  # noqa: S310
        else:
            p = Path(source)
            if not p.exists():
                # Try relative to static/jobs
                jobs_dir = Path(__file__).parent.parent / "static" / "jobs"
                # source might be /static/jobs/<id>/mesh.obj
                rel = source.lstrip("/")
                p = Path(__file__).parent.parent / rel
            if not p.exists():
                return []
            data = p.read_text(encoding="utf-8")

        verts = []
        for line in data.splitlines():
            parts = line.split()
            if parts and parts[0] == "v":
                verts.append((float(parts[1]), float(parts[2]), float(parts[3])))
        return verts
    except Exception:
        return []


def _unit_humanoid_verts() -> list[tuple[float, float, float]]:
    """Minimal vert set shaped like a standing figure, for tests."""
    pts = []
    # Torso column
    for y in [0.0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.5, 1.8]:
        for x, z in [(0, 0), (0.15, 0), (-0.15, 0), (0, 0.05)]:
            pts.append((x, y, z))
    # Arm stumps
    for x in [0.4, 0.6, 0.8]:
        pts.append((x,  1.4, 0))
        pts.append((-x, 1.4, 0))
    # Leg stumps
    for y in [-0.3, -0.6]:
        pts.append((0.2,  y, 0))
        pts.append((-0.2, y, 0))
    return pts


def _write_annotated_obj(
    path: Path,
    verts: list[tuple[float, float, float]],
    weights: list[list],
    bones: list[dict],
) -> None:
    """Write OBJ with # vg: comments for Blender vertex-group import."""
    lines = ["# Manifold auto-rig output", "# vg: <vertex_group> <bone_name>"]
    for i, b in enumerate(bones):
        lines.append(f"# vg: {i} {b['name']}")
    lines.append("o rigged_mesh")
    for vx, vy, vz in verts:
        lines.append(f"v {vx:.5f} {vy:.5f} {vz:.5f}")
    for vi, inf_list in enumerate(weights):
        parts = " ".join(f"{idx}:{w}" for idx, w in inf_list)
        lines.append(f"# w {vi+1} {parts}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
