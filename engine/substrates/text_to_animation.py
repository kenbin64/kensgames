"""
substrates/text_to_animation.py — Text → Motion clip (0D → 4D)

Produces a BVH motion capture file from a text description of an action.
BVH is the universal exchange format — imports directly into Blender,
Unity (via BVH importer), Unreal, and can be applied to any rigged mesh
by mesh_animation.py.

Model priority:
  1. MotionDiffuse  (mingyuan-motion/MotionDiffuse)  — SMPL-based text→motion
  2. MDM            (GuyTevet/motion-diffusion-model) — HumanML3D-trained
  3. Stub           — looping walk cycle from Fourier components (no GPU)

Input fields
------------
  prompt   : str   required — action description ("a person walks forward slowly")
  duration : float default 4.0  — seconds
  fps      : int   default 30
  seed     : int   optional

Output
------
  /static/jobs/<job_id>/motion.bvh

BVH joint order follows BVH standard for SMPL-H 22-joint skeleton.
mesh_animation.py accepts the BVH and a rigged.json to produce glTF.
"""

from __future__ import annotations

import math
import struct
from pathlib import Path
from typing import Callable

from .base import InferenceSubstrate, Job

# SMPL-H 22-joint hierarchy (name, parent_index, default_offset_cm)
_SMPL_JOINTS = [
    ("Hips",          -1, (  0.0,  94.0,   0.0)),
    ("LeftUpLeg",      0, ( -9.0,  -3.5,   0.0)),
    ("RightUpLeg",     0, (  9.0,  -3.5,   0.0)),
    ("Spine",          0, (  0.0,   9.0,   0.0)),
    ("LeftLeg",        1, (  0.0, -38.0,   0.5)),
    ("RightLeg",       2, (  0.0, -38.0,   0.5)),
    ("Spine1",         3, (  0.0,  12.0,   0.0)),
    ("LeftFoot",       4, (  0.0, -38.0,  -1.0)),
    ("RightFoot",      5, (  0.0, -38.0,  -1.0)),
    ("Spine2",         6, (  0.0,  12.0,   0.0)),
    ("LeftToeBase",    7, (  0.0,  -5.0,   8.0)),
    ("RightToeBase",   8, (  0.0,  -5.0,   8.0)),
    ("Neck",           9, (  0.0,  20.0,   0.0)),
    ("LeftShoulder",   9, (-10.0,  16.0,   0.0)),
    ("RightShoulder",  9, ( 10.0,  16.0,   0.0)),
    ("Head",          12, (  0.0,  10.0,   0.0)),
    ("LeftArm",       13, (-14.0,   0.0,   0.0)),
    ("RightArm",      14, ( 14.0,   0.0,   0.0)),
    ("LeftForeArm",   16, (-26.0,   0.0,   0.0)),
    ("RightForeArm",  17, ( 26.0,   0.0,   0.0)),
    ("LeftHand",      18, (-23.0,   0.0,   0.0)),
    ("RightHand",     19, ( 23.0,   0.0,   0.0)),
]


class TextToAnimationSubstrate(InferenceSubstrate):
    dim_in  = 0   # atom: text prompt
    dim_out = 4   # temporal: motion clip

    @classmethod
    def load_model(cls):
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"

            # MotionDiffuse
            try:
                from motion_diffuse import MotionDiffuseModel
                model = MotionDiffuseModel.from_pretrained("mingyuan-motion/MotionDiffuse")
                model = model.to(device)
                print(f"[TextToAnimation] Loaded MotionDiffuse on {device}")
                return {"backend": "motion_diffuse", "model": model, "device": device}
            except Exception as e:
                print(f"[TextToAnimation] MotionDiffuse unavailable: {e}")

            # MDM fallback
            try:
                from mdm.model.mdm import MDM
                from mdm.diffusion import gaussian_diffusion as gd
                model = MDM.from_pretrained("GuyTevet/motion-diffusion-model")
                model = model.to(device)
                print(f"[TextToAnimation] Loaded MDM on {device}")
                return {"backend": "mdm", "model": model, "device": device}
            except Exception as e:
                print(f"[TextToAnimation] MDM unavailable: {e}")

        except ImportError:
            print("[TextToAnimation] torch not installed — running in stub mode")

        return None

    def run(self, job: Job, progress_cb: Callable[[float, str], None]) -> Path:
        params   = job.input
        prompt   = str(params.get("prompt", "a person walks forward"))
        duration = float(params.get("duration", 4.0))
        fps      = int(params.get("fps", 30))
        seed     = params.get("seed")

        out_dir  = self.job_dir(job.job_id)
        out_path = out_dir / "motion.bvh"

        progress_cb(0.05, "Preparing motion generation")

        if self.__class__._model is None:
            _write_stub_bvh(out_path, prompt, duration, fps)
            progress_cb(1.0, "Stub walk cycle written (no model loaded)")
            return out_path

        backend = self.__class__._model["backend"]

        if backend == "motion_diffuse":
            return self._run_motion_diffuse(out_path, prompt, duration, fps, seed, progress_cb)
        if backend == "mdm":
            return self._run_mdm(out_path, prompt, duration, fps, seed, progress_cb)

        _write_stub_bvh(out_path, prompt, duration, fps)
        return out_path

    def _run_motion_diffuse(self, out_path, prompt, duration, fps, seed, cb):
        import torch
        m = self.__class__._model
        n_frames = int(duration * fps)
        gen = torch.Generator(m["device"])
        if seed is not None:
            gen.manual_seed(int(seed))
        cb(0.1, "Sampling motion")
        motion = m["model"].generate(
            text=[prompt], n_frames=n_frames, generator=gen
        )  # (1, n_frames, 22, 3) Euler angles in degrees
        cb(0.8, "Writing BVH")
        _pose_seq_to_bvh(out_path, motion[0], fps)
        cb(1.0, "Done")
        return out_path

    def _run_mdm(self, out_path, prompt, duration, fps, seed, cb):
        import torch
        m = self.__class__._model
        n_frames = int(duration * fps)
        cb(0.1, "Sampling (MDM)")
        output = m["model"].sample(texts=[prompt], n_frames=n_frames)
        pose_seq = output["motion"][0]  # (n_frames, 22, 3)
        cb(0.8, "Writing BVH")
        _pose_seq_to_bvh(out_path, pose_seq, fps)
        cb(1.0, "Done")
        return out_path


# ---------------------------------------------------------------------------
# BVH writer
# ---------------------------------------------------------------------------

def _pose_seq_to_bvh(
    path: Path,
    pose_seq,    # array-like (n_frames, n_joints, 3) — Euler ZXY degrees
    fps: int,
) -> None:
    """Write a pose sequence to a BVH file. pose_seq may be a list or numpy array."""
    n_frames = len(pose_seq)
    n_joints = min(len(_SMPL_JOINTS), len(pose_seq[0]))
    lines = _bvh_header(fps)
    lines.append("MOTION")
    lines.append(f"Frames: {n_frames}")
    lines.append(f"Frame Time: {1.0/fps:.6f}")
    for frame in pose_seq:
        # Root: 6 channels (tx ty tz rx ry rz); rest: 3 (rx ry rz)
        root_rot  = frame[0]
        root_tx   = [0.0, 94.0, 0.0]  # static root position
        vals = [f"{root_tx[0]:.4f}", f"{root_tx[1]:.4f}", f"{root_tx[2]:.4f}",
                f"{float(root_rot[2]):.4f}", f"{float(root_rot[0]):.4f}", f"{float(root_rot[1]):.4f}"]
        for ji in range(1, n_joints):
            r = frame[ji] if ji < len(frame) else [0.0, 0.0, 0.0]
            vals += [f"{float(r[2]):.4f}", f"{float(r[0]):.4f}", f"{float(r[1]):.4f}"]
        lines.append(" ".join(vals))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _bvh_header(fps: int) -> list[str]:
    """Build the HIERARCHY section for the 22-joint SMPL skeleton."""
    lines = ["HIERARCHY"]
    depth_stack: list[int] = []

    for ji, (name, parent, offset) in enumerate(_SMPL_JOINTS):
        indent = "  " * len(depth_stack)

        if parent == -1:
            lines.append(f"{indent}ROOT {name}")
        else:
            # Find how many levels to close before opening this joint
            while depth_stack and depth_stack[-1] >= parent:
                depth_stack.pop()
                prev_indent = "  " * len(depth_stack)
                lines.append(f"{prev_indent}}}")
            indent = "  " * len(depth_stack)
            lines.append(f"{indent}JOINT {name}")

        depth_stack.append(ji)
        indent2 = "  " * len(depth_stack)
        lines.append(f"{indent}{{"
                     if False else f"{indent}{{")
        lines[-1] = indent + "{"
        ox, oy, oz = offset
        lines.append(f"{indent2}OFFSET {ox:.4f} {oy:.4f} {oz:.4f}")

        if parent == -1:
            lines.append(f"{indent2}CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation")
        else:
            lines.append(f"{indent2}CHANNELS 3 Zrotation Xrotation Yrotation")

    # Is this a leaf? Add End Site for every terminal joint
    # (We close everything at the end)
    leaf_set = set(range(len(_SMPL_JOINTS))) - {j[1] for j in _SMPL_JOINTS if j[1] >= 0}
    for ji in sorted(leaf_set, reverse=True):
        if ji < len(depth_stack):
            indent2 = "  " * (ji + 1)
            indent1 = "  " * ji
            lines.append(f"{indent2}End Site")
            lines.append(f"{indent2}{{")
            lines.append(f"{indent2}  OFFSET 0.0000 0.0000 0.0000")
            lines.append(f"{indent2}}}")

    while depth_stack:
        depth_stack.pop()
        indent = "  " * len(depth_stack)
        lines.append(f"{indent}}}")

    return lines


def _write_stub_bvh(path: Path, prompt: str, duration: float, fps: int) -> None:
    """
    Generate a procedural walk cycle using Fourier components.
    No GPU — pure math. Each joint gets a phase-shifted sinusoid
    derived from the dimensional equation z = x·y (period × amplitude).
    """
    import hashlib
    seed_val = int(hashlib.sha256(prompt.encode()).hexdigest()[:8], 16)
    rng_state = [seed_val]

    def _rng() -> float:
        rng_state[0] = (rng_state[0] * 1664525 + 1013904223) & 0xFFFFFFFF
        return (rng_state[0] / 0xFFFFFFFF) * 2.0 - 1.0

    n_frames  = max(1, int(duration * fps))
    n_joints  = len(_SMPL_JOINTS)

    # Walk-cycle base parameters per joint (amplitude degrees, period frames)
    walk_params = {
        "Hips":         (2.0,  fps),
        "Spine":        (3.0,  fps),
        "Spine1":       (2.0,  fps),
        "Spine2":       (1.5,  fps),
        "LeftUpLeg":   (25.0,  fps),
        "RightUpLeg":  (25.0,  fps),
        "LeftLeg":     (20.0,  fps),
        "RightLeg":    (20.0,  fps),
        "LeftFoot":    (10.0,  fps),
        "RightFoot":   (10.0,  fps),
        "LeftArm":     (15.0,  fps),
        "RightArm":    (15.0,  fps),
        "LeftForeArm": ( 8.0,  fps),
        "RightForeArm":( 8.0,  fps),
    }

    # Build pose sequence: list of (n_joints × 3) frames
    frames = []
    for fi in range(n_frames):
        t = fi / fps
        frame_poses = []
        for ji, (jname, _, _) in enumerate(_SMPL_JOINTS):
            amp, period = walk_params.get(jname, (1.0, fps))
            phase_offset = math.pi if "Right" in jname else 0.0
            # X-axis (sagittal swing)
            rx = amp * math.sin(2.0 * math.pi * t / (period / fps) + phase_offset)
            ry = 0.0
            rz = (amp * 0.15) * math.sin(4.0 * math.pi * t / (period / fps) + phase_offset)
            frame_poses.append([rx, ry, rz])
        frames.append(frame_poses)

    _pose_seq_to_bvh(path, frames, fps)
