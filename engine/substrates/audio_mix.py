"""
substrates/audio_mix.py — Mix multiple audio tracks into a final WAV (4D → 4D)

No ML model needed — pure DSP in stdlib.
This is the final assembly step of the audio pipeline.

Combines any number of source tracks with:
  - Independent gain (dB or linear)
  - Start offset (seconds)
  - Fade in / fade out (seconds)
  - Optional loop (repeats track until the mix duration)
  - Final limiter to prevent clipping

Input fields
------------
  tracks : list of track objects (see below)
  duration : float   optional — total output duration in seconds
             (defaults to the length of the longest track)
  sample_rate : int  default 44100
  normalize   : bool default true — normalise final mix to -1 dBFS

Track object
------------
  {
    "source"  : str     required — URL or path to WAV file
    "gain_db" : float   default 0.0   — gain in dB (negative = quieter)
    "offset"  : float   default 0.0   — start time in seconds
    "fade_in" : float   default 0.0   — fade-in duration in seconds
    "fade_out": float   default 0.0   — fade-out duration in seconds
    "loop"    : bool    default false — loop until mix duration
  }

Output
------
  /static/jobs/<job_id>/mix.wav  (16-bit PCM, mono or stereo)

Example use — combine music + SFX + speech:
  tracks = [
    { "source": "/static/jobs/abc/music.wav",  "gain_db": -6.0, "loop": true },
    { "source": "/static/jobs/def/sfx.wav",    "gain_db":  0.0, "offset": 1.5 },
    { "source": "/static/jobs/ghi/speech.wav", "gain_db":  3.0, "offset": 0.5 },
  ]
"""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path
from typing import Callable

from .base import InferenceSubstrate, Job
from .music_gen import _write_wav_pcm


class AudioMixSubstrate(InferenceSubstrate):
    dim_in  = 4   # temporal: multiple audio streams
    dim_out = 4   # temporal: single mixed stream

    @classmethod
    def load_model(cls):
        return {"backend": "dsp_mixer"}

    def run(self, job: Job, progress_cb: Callable[[float, str], None]) -> Path:
        params      = job.input
        tracks_cfg  = list(params.get("tracks", []))
        duration    = params.get("duration")
        sample_rate = int(params.get("sample_rate", 44100))
        normalize   = bool(params.get("normalize", True))

        out_dir  = self.job_dir(job.job_id)
        out_path = out_dir / "mix.wav"

        progress_cb(0.05, f"Loading {len(tracks_cfg)} tracks")

        # Load all sources
        loaded: list[dict] = []
        for i, tc in enumerate(tracks_cfg):
            src = str(tc.get("source", ""))
            samples, sr = _load_wav(src) or ([], sample_rate)
            if sr != sample_rate and samples:
                samples = _resample(samples, sr, sample_rate)
            loaded.append({
                "samples":  samples,
                "gain_db":  float(tc.get("gain_db", 0.0)),
                "offset":   float(tc.get("offset",  0.0)),
                "fade_in":  float(tc.get("fade_in",  0.0)),
                "fade_out": float(tc.get("fade_out", 0.0)),
                "loop":     bool(tc.get("loop", False)),
            })
            progress_cb(0.05 + 0.4 * (i + 1) / max(len(tracks_cfg), 1),
                        f"Loaded track {i+1}")

        # Determine mix duration
        if duration is None:
            max_end = 0.0
            for t in loaded:
                if t["samples"]:
                    end = t["offset"] + len(t["samples"]) / sample_rate
                    max_end = max(max_end, end)
            duration = max_end if max_end > 0 else 2.0

        n_out = int(duration * sample_rate)
        progress_cb(0.5, f"Mixing {n_out} samples at {sample_rate} Hz")

        mix = [0.0] * n_out

        for t in loaded:
            src = t["samples"]
            if not src:
                continue

            gain_lin  = 10.0 ** (t["gain_db"] / 20.0)
            offset_n  = int(t["offset"] * sample_rate)
            fade_in_n = int(t["fade_in"]  * sample_rate)
            fade_out_n = int(t["fade_out"] * sample_rate)
            src_len   = len(src)

            pos = offset_n
            src_pos = 0
            while pos < n_out:
                if src_pos >= src_len:
                    if t["loop"]:
                        src_pos = 0
                    else:
                        break

                remaining = min(src_len - src_pos, n_out - pos)
                for j in range(remaining):
                    env = 1.0
                    abs_pos = pos + j - offset_n     # position within this track
                    # Fade in
                    if fade_in_n > 0 and abs_pos < fade_in_n:
                        env *= abs_pos / fade_in_n
                    # Fade out
                    track_total = src_len
                    if fade_out_n > 0 and abs_pos > track_total - fade_out_n:
                        env *= (track_total - abs_pos) / fade_out_n
                    env = max(0.0, min(1.0, env))

                    mix[pos + j] += src[src_pos + j] * gain_lin * env

                pos     += remaining
                src_pos += remaining

        progress_cb(0.85, "Applying limiter")
        if normalize and any(v != 0 for v in mix):
            peak = max(abs(v) for v in mix)
            if peak > 0:
                target = 0.891  # -1 dBFS
                scale  = target / peak
                mix    = [v * scale for v in mix]

        # Soft limiter (tanh)
        out_samples = [int(math.tanh(v) * 32767) for v in mix]

        progress_cb(0.95, "Writing mix.wav")
        _write_wav_pcm(out_path, out_samples, sample_rate)
        progress_cb(1.0, f"Mix complete — {duration:.2f}s")
        return out_path


# ---------------------------------------------------------------------------
# WAV I/O helpers
# ---------------------------------------------------------------------------

def _load_wav(source: str) -> tuple[list[float], int] | None:
    """
    Load a WAV file as normalised float samples.
    Returns (samples_float, sample_rate) or None on failure.
    """
    if not source:
        return None

    if source.startswith("/static/"):
        p = Path(__file__).parent.parent / source.lstrip("/")
    elif source.startswith("http"):
        try:
            import urllib.request, tempfile
            tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            urllib.request.urlretrieve(source, tmp.name)  # noqa: S310
            p = Path(tmp.name)
        except Exception:
            return None
    else:
        p = Path(source)

    if not p.exists():
        return None

    try:
        with wave.open(str(p), "rb") as wf:
            sr      = wf.getframerate()
            n_ch    = wf.getnchannels()
            sw      = wf.getsampwidth()
            raw     = wf.readframes(wf.getnframes())
        fmt    = {1: "b", 2: "h", 4: "i"}.get(sw, "h")
        values = struct.unpack(f"<{len(raw)//sw}{fmt}", raw)
        # Mix to mono
        if n_ch > 1:
            values = [sum(values[i:i+n_ch]) / n_ch for i in range(0, len(values), n_ch)]
        scale   = 2 ** (8 * sw - 1)
        samples = [v / scale for v in values]
        return (samples, sr)
    except Exception:
        return None


def _resample(samples: list[float], from_sr: int, to_sr: int) -> list[float]:
    """
    Linear interpolation resampler — good enough for mixing, not for mastering.
    """
    if from_sr == to_sr:
        return samples
    ratio    = from_sr / to_sr
    n_out    = int(len(samples) * to_sr / from_sr)
    out      = []
    for i in range(n_out):
        src_f = i * ratio
        src_i = int(src_f)
        frac  = src_f - src_i
        a     = samples[src_i] if src_i < len(samples) else 0.0
        b     = samples[src_i + 1] if src_i + 1 < len(samples) else 0.0
        out.append(a + frac * (b - a))
    return out
