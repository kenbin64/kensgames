"""
substrates/mesh_animation.py — Rigged mesh + motion clip → glTF animation (3D+4D → 4D)

Takes:
  - rigged.json from auto_rig.py   (bones + LBS weights)
  - motion.bvh  from text_to_animation.py  (per-frame Euler rotations)
  - optional lipsync.json from lip_sync.py (per-frame ARKit blend shapes)

Produces:
  - /static/jobs/<job_id>/animated.gltf  — binary glTF 2.0 (GL_UNSIGNED_FLOAT)

The glTF can be loaded directly in Three.js (GLTFLoader + AnimationMixer),
Unity (glTF Tools package), Unreal (glTF importer), or Blender.

Input fields
------------
  rig_source     : str   required — URL or path to rigged.json
  motion_source  : str   required — URL or path to motion.bvh
  lipsync_source : str   optional — URL or path to lipsync.json
  loop           : bool  default true — set animation to LOOP in glTF

Output
------
  /static/jobs/<job_id>/animated.gltf
  /static/jobs/<job_id>/animated.bin   (binary buffer)
"""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path
from typing import Callable

from .base import InferenceSubstrate, Job


class MeshAnimationSubstrate(InferenceSubstrate):
    dim_in  = 4   # temporal: rig + motion (combined 4D input)
    dim_out = 4   # temporal: animated scene

    @classmethod
    def load_model(cls):
        # Pure algorithmic — no ML model needed
        return {"backend": "gltf_writer"}

    def run(self, job: Job, progress_cb: Callable[[float, str], None]) -> Path:
        params        = job.input
        rig_source    = str(params.get("rig_source", ""))
        motion_source = str(params.get("motion_source", ""))
        lipsync_src   = str(params.get("lipsync_source", ""))
        loop          = bool(params.get("loop", True))

        out_dir   = self.job_dir(job.job_id)
        gltf_path = out_dir / "animated.gltf"
        bin_path  = out_dir / "animated.bin"

        progress_cb(0.05, "Loading rig")
        rig    = _load_json_asset(rig_source)
        progress_cb(0.15, "Loading motion")
        motion = _load_bvh(motion_source)
        progress_cb(0.25, "Loading lip sync")
        lipsync = _load_json_asset(lipsync_src) if lipsync_src else None

        if rig is None:
            rig = _stub_rig()
        if motion is None:
            motion = _stub_motion(fps=30, duration=2.0)

        progress_cb(0.4, "Computing animation data")
        anim_data = _compute_animation(rig, motion, lipsync)

        progress_cb(0.7, "Writing glTF 2.0")
        _write_gltf(gltf_path, bin_path, rig, anim_data, loop)

        progress_cb(1.0, f"Written {gltf_path.name} + {bin_path.name}")
        return gltf_path


# ---------------------------------------------------------------------------
# BVH loader
# ---------------------------------------------------------------------------

def _load_bvh(source: str) -> dict | None:
    """
    Parse a BVH file into { fps, bones: [{name, channels}], frames: [[floats]] }.
    """
    if not source:
        return None
    data = _read_asset(source)
    if data is None:
        return None

    lines = data.splitlines()
    bones: list[dict] = []
    frames: list[list[float]] = []
    fps    = 30.0
    n_frames = 0

    mode  = "hierarchy"
    bone_stack: list[dict] = []
    current: dict | None = None

    for raw in lines:
        line = raw.strip()
        if mode == "hierarchy":
            if line.startswith("ROOT") or line.startswith("JOINT"):
                name = line.split(None, 1)[1]
                current = {"name": name, "channels": [], "parent": bone_stack[-1]["name"] if bone_stack else None}
                bones.append(current)
            elif line.startswith("{"):
                if current:
                    bone_stack.append(current)
            elif line.startswith("}"):
                if bone_stack:
                    bone_stack.pop()
            elif line.startswith("CHANNELS") and current:
                parts = line.split()
                n = int(parts[1])
                current["channels"] = parts[2: 2 + n]
            elif line == "MOTION":
                mode = "motion_header"
        elif mode == "motion_header":
            if line.startswith("Frames:"):
                n_frames = int(line.split(":")[1].strip())
            elif line.startswith("Frame Time:"):
                ft = float(line.split(":")[1].strip())
                fps = round(1.0 / ft) if ft > 0 else 30
                mode = "motion_data"
        elif mode == "motion_data":
            vals = [float(v) for v in line.split()]
            if vals:
                frames.append(vals)

    return {"fps": fps, "bones": bones, "frames": frames}


# ---------------------------------------------------------------------------
# Animation data builder
# ---------------------------------------------------------------------------

def _compute_animation(rig: dict, motion: dict, lipsync: dict | None) -> dict:
    """
    Map BVH Euler rotations to quaternions per bone per frame.
    Returns { fps, n_frames, tracks: [{bone, rotations: [[qx,qy,qz,qw]...]}] }
    """
    fps      = motion.get("fps", 30)
    bvh_bones = motion.get("bones", [])
    bvh_frames = motion.get("frames", [])
    n_frames  = len(bvh_frames)

    # Channel offset map
    offset = 0
    bone_offsets: list[tuple[dict, int]] = []
    for b in bvh_bones:
        bone_offsets.append((b, offset))
        offset += len(b["channels"])

    tracks = []
    for b, ch_off in bone_offsets:
        ch = b["channels"]
        rot_ch = [(i, c) for i, c in enumerate(ch) if "rotation" in c.lower()]
        if not rot_ch:
            continue
        rotations = []
        for frame in bvh_frames:
            euler = [0.0, 0.0, 0.0]   # ZXY
            for li, c_name in rot_ch:
                idx = ch_off + li
                val = frame[idx] if idx < len(frame) else 0.0
                if   "Zrotation" in c_name: euler[0] = val
                elif "Xrotation" in c_name: euler[1] = val
                elif "Yrotation" in c_name: euler[2] = val
            q = _euler_zxy_to_quat(euler[0], euler[1], euler[2])
            rotations.append(q)
        tracks.append({"bone": b["name"], "rotations": rotations})

    # Blend shape tracks from lipsync
    morph_tracks = []
    if lipsync:
        lipsync_frames = lipsync.get("frames", [])
        # Collect all weight keys
        all_keys: set[str] = set()
        for f in lipsync_frames:
            all_keys.update(f.get("weights", {}).keys())
        for key in sorted(all_keys):
            weights = [f.get("weights", {}).get(key, 0.0) for f in lipsync_frames]
            morph_tracks.append({"name": key, "weights": weights})

    return {
        "fps":         fps,
        "n_frames":    n_frames,
        "tracks":      tracks,
        "morph_tracks": morph_tracks,
    }


def _euler_zxy_to_quat(z_deg: float, x_deg: float, y_deg: float) -> list[float]:
    """Convert ZXY Euler angles (degrees) to quaternion [x, y, z, w]."""
    zr = math.radians(z_deg) * 0.5
    xr = math.radians(x_deg) * 0.5
    yr = math.radians(y_deg) * 0.5
    # Quaternion multiplication: Qz * Qx * Qy (ZXY order)
    qz = (0.0, 0.0, math.sin(zr), math.cos(zr))
    qx = (math.sin(xr), 0.0, 0.0, math.cos(xr))
    qy = (0.0, math.sin(yr), 0.0, math.cos(yr))
    # q = qz * qx
    ax, ay, az, aw = qz
    bx, by, bz, bw = qx
    q1 = (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    )
    # q = q1 * qy
    ax, ay, az, aw = q1
    bx, by, bz, bw = qy
    return [
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ]


# ---------------------------------------------------------------------------
# glTF 2.0 writer
# ---------------------------------------------------------------------------

def _write_gltf(
    gltf_path: Path,
    bin_path:  Path,
    rig:       dict,
    anim_data: dict,
    loop:      bool,
) -> None:
    """
    Write a minimal glTF 2.0 file containing a skeleton animation.
    Binary buffer holds all accessor data (timestamps + quaternions).
    """
    fps      = anim_data["fps"]
    n_frames = anim_data["n_frames"]
    tracks   = anim_data["tracks"]

    if n_frames == 0:
        # Empty scene
        gltf_path.write_text(json.dumps({"asset": {"version": "2.0"}, "scene": 0,
                                          "scenes": [{"nodes": []}], "nodes": [],
                                          "animations": []}, indent=2),
                              encoding="utf-8")
        bin_path.write_bytes(b"")
        return

    dt = 1.0 / fps
    times = [round(i * dt, 6) for i in range(n_frames)]
    duration = times[-1]

    # Pack binary buffer
    buf = bytearray()
    accessors = []
    buffer_views = []

    def _add_float_array(data: list[float], component_type: int = 5126,
                          type_str: str = "SCALAR") -> int:
        """Append floats to buffer, register bufferView + accessor, return accessor index."""
        raw = struct.pack(f"<{len(data)}f", *data)
        bv_start = len(buf)
        buf.extend(raw)
        bv_idx = len(buffer_views)
        buffer_views.append({
            "buffer": 0,
            "byteOffset": bv_start,
            "byteLength": len(raw),
            "target": 34962,   # ARRAY_BUFFER
        })
        acc_idx = len(accessors)
        accessors.append({
            "bufferView": bv_idx,
            "componentType": component_type,
            "count": len(data) // (4 if type_str == "VEC4" else 1),
            "type": type_str,
            "min": [min(data)],
            "max": [max(data)],
        })
        return acc_idx

    # Timestamp accessor (shared by all tracks)
    time_acc = _add_float_array(times)
    accessors[-1]["min"] = [0.0]
    accessors[-1]["max"] = [duration]

    samplers = []
    channels = []

    bones    = rig.get("bones", [])
    bone_map = {b["name"]: i for i, b in enumerate(bones)}

    for track in tracks:
        bone_name = track["bone"]
        bone_idx  = bone_map.get(bone_name)
        if bone_idx is None:
            continue
        rots = track["rotations"]
        flat = [v for q in rots for v in q]   # xyzw × n_frames
        rot_acc = _add_float_array(flat, type_str="VEC4")
        accessors[rot_acc]["count"] = len(rots)
        s_idx = len(samplers)
        samplers.append({"input": time_acc, "output": rot_acc, "interpolation": "LINEAR"})
        channels.append({
            "sampler": s_idx,
            "target": {"node": bone_idx, "path": "rotation"},
        })

    # Nodes from rig bones
    nodes = []
    for b in bones:
        node: dict = {"name": b["name"]}
        head = b.get("head", [0, 0, 0])
        node["translation"] = head
        node["rotation"]    = [0.0, 0.0, 0.0, 1.0]
        child_indices = [i for i, ob in enumerate(bones) if ob.get("parent") == bones.index(b)]
        if child_indices:
            node["children"] = child_indices
        nodes.append(node)

    # Buffer
    bin_path.write_bytes(bytes(buf))

    gltf = {
        "asset": {"version": "2.0", "generator": "Manifold MeshAnimation substrate"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": nodes,
        "animations": [{
            "name": "ManifoldAnim",
            "samplers": samplers,
            "channels":  channels,
        }],
        "accessors":   accessors,
        "bufferViews": buffer_views,
        "buffers": [{
            "uri":        bin_path.name,
            "byteLength": len(buf),
        }],
    }
    gltf_path.write_text(json.dumps(gltf, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# Stub data generators
# ---------------------------------------------------------------------------

def _stub_rig() -> dict:
    from .auto_rig import _biped_bones, _unit_humanoid_verts, _lbs_weights
    verts = _unit_humanoid_verts()
    bones = _biped_bones(lambda tx, ty, tz: [tx, ty, tz])
    weights = _lbs_weights(verts, bones, 2)
    return {"bones": bones, "skin_weights": weights, "mesh_source": "stub"}


def _stub_motion(fps: int = 30, duration: float = 2.0) -> dict:
    """2-second idle bob — uses dimensional z = x·y (period × amplitude)."""
    n = int(fps * duration)
    from .text_to_animation import _SMPL_JOINTS
    bones = [{"name": j[0], "channels": ["Zrotation", "Xrotation", "Yrotation"]}
             for j in _SMPL_JOINTS]
    # Root gets 6 channels
    bones[0]["channels"] = ["Xposition","Yposition","Zposition","Zrotation","Xrotation","Yrotation"]

    n_channels = sum(len(b["channels"]) for b in bones)
    frames = []
    for fi in range(n):
        t = fi / fps
        row = []
        ci = 0
        for b in bones:
            for ch in b["channels"]:
                if "position" in ch:
                    row.append(94.0 if "Y" in ch else 0.0)
                elif ch == "Xrotation" and b["name"] == "Spine":
                    row.append(3.0 * math.sin(2 * math.pi * t * 0.5))
                else:
                    row.append(0.0)
                ci += 1
        frames.append(row)
    return {"fps": fps, "bones": bones, "frames": frames}


# ---------------------------------------------------------------------------
# Asset helpers
# ---------------------------------------------------------------------------

def _read_asset(source: str) -> str | None:
    if not source:
        return None
    if source.startswith("http"):
        try:
            import urllib.request
            return urllib.request.urlopen(source).read().decode("utf-8")  # noqa: S310
        except Exception:
            return None
    if source.startswith("/static/"):
        p = Path(__file__).parent.parent / source.lstrip("/")
    else:
        p = Path(source)
    if not p.exists():
        return None
    return p.read_text(encoding="utf-8")


def _load_json_asset(source: str) -> dict | None:
    data = _read_asset(source)
    if data is None:
        return None
    try:
        return json.loads(data)
    except Exception:
        return None
