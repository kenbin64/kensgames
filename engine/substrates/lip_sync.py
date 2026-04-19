"""
substrates/lip_sync.py — Audio + face mesh → Lip-synced animation (4D → 4D)

Takes a WAV/MP3 audio file and a face mesh (OBJ) and produces per-frame
jaw/viseme blend shape weights that animate the mouth in sync with speech.

Model priority:
  1. Wav2Lip   (Rudrabha/Wav2Lip)    — phoneme-accurate lip sync
  2. SadTalker (OpenTalker/SadTalker) — head pose + expression from audio
  3. Stub       — rule-based phoneme→viseme from amplitude envelope

Input fields
------------
  audio    : str   required — URL or path to audio file (.wav/.mp3)
  face_src : str   optional — URL or path to face mesh OBJ
  fps      : int   default 30
  smooth   : int   default 3 — temporal smoothing window (frames)

Output
------
  /static/jobs/<job_id>/lipsync.json

lipsync.json schema
-------------------
  {
    "fps": 30,
    "frames": [
      {
        "t": 0.000,
        "viseme": "PP",
        "weights": {
          "jawOpen":   0.72,
          "mouthClose": 0.10,
          "mouthFunnel": 0.05,
          ...
        }
      },
      ...
    ]
  }

Viseme set follows ARKit 52 blend shapes (industry standard for game faces).
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Callable

from .base import InferenceSubstrate, Job

# ARKit viseme blend shapes (subset used for lip sync)
_ARKIT_LIP_SHAPES = [
    "jawOpen", "jawForward", "jawLeft", "jawRight",
    "mouthClose", "mouthFunnel", "mouthPucker", "mouthLeft", "mouthRight",
    "mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft", "mouthFrownRight",
    "mouthDimpleLeft", "mouthDimpleRight", "mouthStretchLeft", "mouthStretchRight",
    "mouthRollLower", "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper",
    "mouthPressLeft", "mouthPressRight", "mouthLowerDownLeft", "mouthLowerDownRight",
    "mouthUpperUpLeft", "mouthUpperUpRight",
]

# Phoneme → primary viseme + ARKit weight map
# Based on Preston Blair viseme set mapped to ARKit
_PHONEME_VISEMES: dict[str, tuple[str, dict[str, float]]] = {
    "PP": ("PP", {"mouthClose": 0.9, "mouthPressLeft": 0.3, "mouthPressRight": 0.3}),
    "FF": ("FF", {"mouthFrownLeft": 0.4, "mouthFrownRight": 0.4, "mouthLowerDownLeft": 0.5, "mouthLowerDownRight": 0.5}),
    "TH": ("TH", {"jawOpen": 0.2, "mouthClose": 0.1, "mouthLowerDownLeft": 0.3, "mouthLowerDownRight": 0.3}),
    "DD": ("DD", {"jawOpen": 0.4, "mouthLowerDownLeft": 0.4, "mouthLowerDownRight": 0.4}),
    "KK": ("KK", {"jawOpen": 0.5, "mouthLowerDownLeft": 0.3, "mouthLowerDownRight": 0.3}),
    "CH": ("CH", {"mouthFunnel": 0.6, "mouthPucker": 0.3, "jawOpen": 0.2}),
    "SS": ("SS", {"mouthSmileLeft": 0.3, "mouthSmileRight": 0.3, "jawOpen": 0.1}),
    "NN": ("NN", {"mouthClose": 0.5, "jawOpen": 0.1}),
    "RR": ("RR", {"mouthFunnel": 0.4, "jawOpen": 0.3}),
    "AA": ("AA", {"jawOpen": 0.9, "mouthLowerDownLeft": 0.6, "mouthLowerDownRight": 0.6}),
    "E":  ("E",  {"jawOpen": 0.6, "mouthSmileLeft": 0.4, "mouthSmileRight": 0.4}),
    "I":  ("I",  {"jawOpen": 0.4, "mouthSmileLeft": 0.6, "mouthSmileRight": 0.6}),
    "O":  ("O",  {"jawOpen": 0.7, "mouthFunnel": 0.5, "mouthPucker": 0.2}),
    "U":  ("U",  {"jawOpen": 0.3, "mouthFunnel": 0.7, "mouthPucker": 0.6}),
    "SIL": ("SIL", {}),
}

_VOWELS = {"AA", "E", "I", "O", "U"}


class LipSyncSubstrate(InferenceSubstrate):
    dim_in  = 4   # temporal: audio stream
    dim_out = 4   # temporal: animation keyframes

    @classmethod
    def load_model(cls):
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"

            # Wav2Lip
            try:
                import sys
                import importlib.util
                spec = importlib.util.find_spec("wav2lip")
                if spec is not None:
                    from wav2lip import Wav2Lip
                    model = Wav2Lip.from_pretrained("Rudrabha/Wav2Lip")
                    model = model.to(device)
                    print(f"[LipSync] Loaded Wav2Lip on {device}")
                    return {"backend": "wav2lip", "model": model, "device": device}
            except Exception as e:
                print(f"[LipSync] Wav2Lip unavailable: {e}")

            # SadTalker fallback
            try:
                from sadtalker import SadTalker
                model = SadTalker.from_pretrained("OpenTalker/SadTalker")
                model = model.to(device)
                print(f"[LipSync] Loaded SadTalker on {device}")
                return {"backend": "sadtalker", "model": model, "device": device}
            except Exception as e:
                print(f"[LipSync] SadTalker unavailable: {e}")

        except ImportError:
            print("[LipSync] torch not installed — running in stub mode")

        print("[LipSync] Using rule-based phoneme→viseme stub")
        return {"backend": "stub"}

    def run(self, job: Job, progress_cb: Callable[[float, str], None]) -> Path:
        params   = job.input
        audio    = str(params.get("audio", ""))
        fps      = int(params.get("fps", 30))
        smooth   = int(params.get("smooth", 3))

        out_dir  = self.job_dir(job.job_id)
        out_path = out_dir / "lipsync.json"

        progress_cb(0.05, "Loading audio")
        audio_data = _load_audio(audio)   # (samples, sample_rate) or None

        backend = (self.__class__._model or {}).get("backend", "stub")

        if backend in ("stub", None) or audio_data is None:
            frames = _stub_lipsync(audio_data, fps, smooth)
        elif backend == "wav2lip":
            frames = self._run_wav2lip(audio_data, fps, smooth, progress_cb)
        elif backend == "sadtalker":
            frames = self._run_sadtalker(audio_data, fps, smooth, progress_cb)
        else:
            frames = _stub_lipsync(audio_data, fps, smooth)

        progress_cb(0.9, f"Writing {len(frames)} frames")
        result = {"fps": fps, "frames": frames}
        out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        progress_cb(1.0, "Done")
        return out_path

    def _run_wav2lip(self, audio_data, fps, smooth, cb):
        samples, sr = audio_data
        cb(0.2, "Wav2Lip inference")
        # Wav2Lip returns per-frame blend shape weights
        result = self.__class__._model["model"].predict_blend_shapes(
            audio=samples, sample_rate=sr, fps=fps
        )
        return _weights_to_frames(result, fps, smooth)

    def _run_sadtalker(self, audio_data, fps, smooth, cb):
        samples, sr = audio_data
        cb(0.2, "SadTalker inference")
        result = self.__class__._model["model"].predict(
            audio=samples, sample_rate=sr, fps=fps
        )
        return _weights_to_frames(result.get("blend_shapes", []), fps, smooth)


# ---------------------------------------------------------------------------
# Rule-based stub — amplitude envelope → jaw open, phoneme cycle
# ---------------------------------------------------------------------------

def _stub_lipsync(
    audio_data,
    fps: int,
    smooth: int,
) -> list[dict]:
    """
    Derive lip sync from the amplitude envelope alone.
    Uses the manifold z = x·y² pattern: amplitude × frequency → jaw height.
    """
    if audio_data is None:
        # Silent — return 2 seconds of closed-mouth frames
        n = fps * 2
        return [{"t": round(i / fps, 4), "viseme": "SIL", "weights": {}} for i in range(n)]

    samples, sr = audio_data
    frame_size = sr // fps

    # Phoneme cycle for stub — cycles through visemes proportional to amplitude
    phoneme_cycle = ["SIL", "AA", "E", "I", "O", "U", "NN", "DD", "KK", "SS", "SIL"]
    raw_frames: list[dict] = []

    for fi in range(len(samples) // frame_size):
        chunk = samples[fi * frame_size: (fi + 1) * frame_size]
        if not chunk:
            break
        amp = math.sqrt(sum(s * s for s in chunk) / len(chunk))   # RMS amplitude

        # Map amplitude → jaw open using z = amplitude × frequency_index (dimensional law)
        jaw = min(1.0, amp * 8.0)

        if jaw < 0.05:
            phoneme = "SIL"
        else:
            cycle_idx = (fi // 4) % len(phoneme_cycle)
            phoneme = phoneme_cycle[cycle_idx]

        _, base_weights = _PHONEME_VISEMES.get(phoneme, _PHONEME_VISEMES["SIL"])
        weights = {k: round(v * jaw, 4) for k, v in base_weights.items()}
        # Always set jawOpen from amplitude
        if phoneme != "SIL":
            weights["jawOpen"] = round(jaw, 4)

        raw_frames.append({"t": round(fi / fps, 4), "viseme": phoneme, "weights": weights})

    # Temporal smoothing
    if smooth > 1 and raw_frames:
        raw_frames = _smooth_frames(raw_frames, smooth)

    return raw_frames


def _smooth_frames(frames: list[dict], window: int) -> list[dict]:
    """Box-filter the weight values across time."""
    out = []
    half = window // 2
    for i, frame in enumerate(frames):
        smoothed: dict[str, float] = {}
        count = 0
        for j in range(max(0, i - half), min(len(frames), i + half + 1)):
            for k, v in frames[j]["weights"].items():
                smoothed[k] = smoothed.get(k, 0.0) + v
            count += 1
        if count > 0:
            smoothed = {k: round(v / count, 4) for k, v in smoothed.items()}
        out.append({"t": frame["t"], "viseme": frame["viseme"], "weights": smoothed})
    return out


def _weights_to_frames(weight_seq, fps: int, smooth: int) -> list[dict]:
    """Convert a model's raw weight array to the lipsync frame format."""
    frames = []
    for fi, w in enumerate(weight_seq):
        if isinstance(w, dict):
            weights = {k: round(float(v), 4) for k, v in w.items()}
        else:
            # Assume array aligned to _ARKIT_LIP_SHAPES
            weights = {_ARKIT_LIP_SHAPES[i]: round(float(v), 4)
                       for i, v in enumerate(w) if i < len(_ARKIT_LIP_SHAPES)}
        jaw = weights.get("jawOpen", 0.0)
        phoneme = "AA" if jaw > 0.5 else ("E" if jaw > 0.2 else "SIL")
        frames.append({"t": round(fi / fps, 4), "viseme": phoneme, "weights": weights})
    if smooth > 1 and frames:
        frames = _smooth_frames(frames, smooth)
    return frames


# ---------------------------------------------------------------------------
# Audio loader — stdlib wave + optional librosa
# ---------------------------------------------------------------------------

def _load_audio(source: str):
    """
    Returns (samples_list, sample_rate) or None.
    Normalises samples to [-1.0, 1.0] floats.
    """
    if not source:
        return None

    # Resolve path
    if source.startswith("/static/"):
        p = Path(__file__).parent.parent / source.lstrip("/")
    elif source.startswith("http"):
        try:
            import urllib.request, tempfile, os
            suffix = ".mp3" if source.endswith(".mp3") else ".wav"
            tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
            urllib.request.urlretrieve(source, tmp.name)  # noqa: S310
            p = Path(tmp.name)
        except Exception:
            return None
    else:
        p = Path(source)

    if not p.exists():
        return None

    # Try stdlib wave (WAV only)
    try:
        import wave
        with wave.open(str(p), "rb") as wf:
            sr     = wf.getframerate()
            n_ch   = wf.getnchannels()
            sw     = wf.getsampwidth()
            frames = wf.readframes(wf.getnframes())
        fmt = {1: "b", 2: "h", 4: "i"}.get(sw, "h")
        import struct
        raw = struct.unpack(f"<{len(frames)//sw}{fmt}", frames)
        # Mix to mono
        if n_ch > 1:
            raw = [sum(raw[i:i+n_ch]) / n_ch for i in range(0, len(raw), n_ch)]
        scale = 2 ** (8 * sw - 1)
        samples = [s / scale for s in raw]
        return (samples, sr)
    except Exception:
        pass

    # Try librosa for MP3 / other formats
    try:
        import librosa
        samples, sr = librosa.load(str(p), sr=None, mono=True)
        return (samples.tolist(), sr)
    except Exception:
        return None
