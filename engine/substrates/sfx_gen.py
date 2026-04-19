"""
substrates/sfx_gen.py — Text → Sound Effect (0D → 4D)

Generates short sound effects from text descriptions.

Model priority:
  1. AudioGen  (facebook/audiogen-medium)  — text→audio effects
  2. AudioLDM2 (cvssp/audioldm2)           — latent diffusion audio
  3. Stub       — physics-based procedural SFX synthesis (no GPU)

The stub covers the most common game SFX categories:
  explosion, impact, footstep, laser, pickup, door, wind, water, fire, beep

Input fields
------------
  prompt    : str   required — "a sword clashing on metal armour"
  duration  : float default 2.0  seconds
  sample_rate : int default 16000
  steps     : int   default 50   (diffusion steps; ignored for AudioGen)
  seed      : int   optional

Output
------
  /static/jobs/<job_id>/sfx.wav
"""

from __future__ import annotations

import math
import random
from pathlib import Path
from typing import Callable

from .base import InferenceSubstrate, Job
from .music_gen import _write_wav_pcm


class SFXGenSubstrate(InferenceSubstrate):
    dim_in  = 0   # atom: text description
    dim_out = 4   # temporal: audio

    @classmethod
    def load_model(cls):
        try:
            import torch
            from audiocraft.models import AudioGen
            device = "cuda" if torch.cuda.is_available() else "cpu"
            model = AudioGen.get_pretrained("facebook/audiogen-medium")
            model.to(device)
            print(f"[SFXGen] Loaded AudioGen on {device}")
            return {"backend": "audiogen", "model": model, "device": device}
        except Exception as e:
            print(f"[SFXGen] AudioGen unavailable: {e}")

        try:
            import torch
            from diffusers import AudioLDM2Pipeline
            device = "cuda" if torch.cuda.is_available() else "cpu"
            pipe = AudioLDM2Pipeline.from_pretrained(
                "cvssp/audioldm2",
                torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            ).to(device)
            print(f"[SFXGen] Loaded AudioLDM2 on {device}")
            return {"backend": "audioldm2", "pipe": pipe, "device": device}
        except Exception as e:
            print(f"[SFXGen] AudioLDM2 unavailable: {e}")
            print("[SFXGen] Using procedural stub")

        return None

    def run(self, job: Job, progress_cb: Callable[[float, str], None]) -> Path:
        params      = job.input
        prompt      = str(params.get("prompt", "a short beep"))
        duration    = float(params.get("duration", 2.0))
        sample_rate = int(params.get("sample_rate", 16000))
        steps       = int(params.get("steps", 50))
        seed        = params.get("seed")

        out_dir  = self.job_dir(job.job_id)
        out_path = out_dir / "sfx.wav"

        progress_cb(0.05, "Preparing SFX generation")

        backend = (self.__class__._model or {}).get("backend")

        if backend == "audiogen":
            self._run_audiogen(out_path, prompt, duration, seed, progress_cb)
        elif backend == "audioldm2":
            self._run_audioldm2(out_path, prompt, duration, steps, seed, sample_rate, progress_cb)
        else:
            _write_stub_sfx(out_path, prompt, duration, sample_rate)
            progress_cb(1.0, "Stub procedural SFX written (no model loaded)")

        return out_path

    def _run_audiogen(self, out_path, prompt, duration, seed, cb):
        import torch
        m = self.__class__._model
        if seed is not None:
            torch.manual_seed(int(seed))
        m["model"].set_generation_params(duration=duration)
        cb(0.1, "AudioGen inference")
        wav = m["model"].generate([prompt])   # (1, 1, samples)
        cb(0.85, "Writing WAV")
        samples = [int(s * 32767) for s in wav[0, 0].cpu().tolist()]
        _write_wav_pcm(out_path, samples, m["model"].sample_rate)
        cb(1.0, "Done")

    def _run_audioldm2(self, out_path, prompt, duration, steps, seed, sr, cb):
        import torch
        m = self.__class__._model
        gen = torch.Generator(m["device"])
        if seed is not None:
            gen.manual_seed(int(seed))
        cb(0.1, "AudioLDM2 inference")
        result = m["pipe"](
            prompt,
            num_inference_steps=steps,
            audio_length_in_s=duration,
            generator=gen,
        )
        audio = result.audios[0]   # numpy (samples,)
        cb(0.85, "Writing WAV")
        samples = [int(s * 32767) for s in audio.tolist()]
        _write_wav_pcm(out_path, samples, sr)
        cb(1.0, "Done")


# ---------------------------------------------------------------------------
# Procedural SFX synthesis
# Each category is a small DSP graph — no external deps.
# ---------------------------------------------------------------------------

def _write_stub_sfx(path: Path, prompt: str, duration: float, sample_rate: int) -> None:
    import hashlib
    seed_int = int(hashlib.sha256(prompt.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed_int)
    p = prompt.lower()

    if   any(w in p for w in ("explosion", "blast", "boom", "bang")):
        samples = _sfx_explosion(duration, sample_rate, rng)
    elif any(w in p for w in ("impact", "hit", "punch", "thud", "clash", "sword", "clang")):
        samples = _sfx_impact(duration, sample_rate, rng)
    elif any(w in p for w in ("footstep", "step", "walk", "footfall")):
        samples = _sfx_footstep(duration, sample_rate, rng)
    elif any(w in p for w in ("laser", "ray", "zap", "phaser", "blaster")):
        samples = _sfx_laser(duration, sample_rate, rng)
    elif any(w in p for w in ("pickup", "collect", "coin", "ding", "chime")):
        samples = _sfx_pickup(duration, sample_rate, rng)
    elif any(w in p for w in ("door", "creak", "hinge", "gate")):
        samples = _sfx_door(duration, sample_rate, rng)
    elif any(w in p for w in ("wind", "whoosh", "swish", "air")):
        samples = _sfx_wind(duration, sample_rate, rng)
    elif any(w in p for w in ("water", "splash", "drip", "rain", "river")):
        samples = _sfx_water(duration, sample_rate, rng)
    elif any(w in p for w in ("fire", "flame", "crackle", "burn")):
        samples = _sfx_fire(duration, sample_rate, rng)
    else:
        samples = _sfx_beep(duration, sample_rate, rng)

    _write_wav_pcm(path, samples, sample_rate)


def _n(duration, sr): return int(duration * sr)
def _clamp(v): return max(-32767, min(32767, int(v)))


def _sfx_explosion(dur, sr, rng):
    n = _n(dur, sr)
    samples = []
    for i in range(n):
        t = i / sr
        # Brown noise burst + low rumble
        noise = rng.uniform(-1, 1)
        rumble = math.sin(2 * math.pi * 60 * t) * 0.4
        env = math.exp(-5 * t)
        samples.append(_clamp((noise * 0.6 + rumble) * env * 32767))
    return samples


def _sfx_impact(dur, sr, rng):
    n = _n(min(dur, 0.5), sr)
    samples = []
    for i in range(n):
        t = i / sr
        # Mid-freq transient + noise tail
        tone = math.sin(2 * math.pi * 220 * t) * math.exp(-20 * t)
        noise = rng.uniform(-1, 1) * math.exp(-8 * t) * 0.4
        samples.append(_clamp((tone + noise) * 32767))
    return samples


def _sfx_footstep(dur, sr, rng):
    """Two thumps — left foot then right, separated by half duration."""
    n = _n(dur, sr)
    thump_n = _n(0.08, sr)
    samples = [0] * n
    for start in [0, n // 2]:
        for i in range(min(thump_n, n - start)):
            t = i / sr
            v = math.sin(2 * math.pi * 80 * t) * math.exp(-30 * t)
            v += rng.uniform(-0.2, 0.2) * math.exp(-15 * t)
            samples[start + i] = _clamp(v * 32767)
    return samples


def _sfx_laser(dur, sr, rng):
    n = _n(dur, sr)
    samples = []
    for i in range(n):
        t = i / sr
        # Descending frequency sweep: z = x·y (start_freq × decay_ratio)
        freq = 1800 * math.exp(-4 * t)
        v = math.sin(2 * math.pi * freq * t) * math.exp(-3 * t)
        samples.append(_clamp(v * 32767))
    return samples


def _sfx_pickup(dur, sr, rng):
    """Rising two-tone arpeggio — major third."""
    n = _n(min(dur, 0.4), sr)
    samples = []
    half = n // 2
    for i in range(n):
        t = i / sr
        freq = 880 if i < half else 1109   # A5 → C#6
        env = math.exp(-8 * (t - (0 if i < half else half / sr)))
        v = math.sin(2 * math.pi * freq * t) * env
        samples.append(_clamp(v * 32767 * 0.7))
    return samples


def _sfx_door(dur, sr, rng):
    n = _n(dur, sr)
    samples = []
    for i in range(n):
        t = i / sr
        # Creak: slow frequency wobble
        freq = 300 + 150 * math.sin(2 * math.pi * 3 * t)
        v = math.sin(2 * math.pi * freq * t) * 0.3
        noise = rng.uniform(-0.2, 0.2)
        env = min(t / 0.05, 1.0) * math.exp(-1.5 * t)
        samples.append(_clamp((v + noise) * env * 32767))
    return samples


def _sfx_wind(dur, sr, rng):
    n = _n(dur, sr)
    # Band-pass noise centred around 500 Hz via moving average approximation
    raw = [rng.uniform(-1, 1) for _ in range(n)]
    window = max(1, sr // 500)
    filtered = []
    for i in range(n):
        chunk = raw[max(0, i - window): i + 1]
        filtered.append(sum(chunk) / len(chunk))
    env_mid = n // 2
    return [_clamp(filtered[i] * min(i / (n*0.1), 1.0,
                                     (n - i) / (n*0.1)) * 32767 * 0.8)
            for i in range(n)]


def _sfx_water(dur, sr, rng):
    n = _n(dur, sr)
    samples = []
    for i in range(n):
        t = i / sr
        # Multiple close-frequency tones → beating pattern mimics water
        v = (math.sin(2*math.pi*480*t) +
             math.sin(2*math.pi*483*t) * 0.7 +
             math.sin(2*math.pi*490*t) * 0.5 +
             rng.uniform(-0.3, 0.3))
        samples.append(_clamp(v * 0.2 * 32767))
    return samples


def _sfx_fire(dur, sr, rng):
    n = _n(dur, sr)
    # Pink-ish noise: sum of filtered noise at octave bands
    raw = [rng.uniform(-1, 1) for _ in range(n)]
    samples = []
    for i in range(n):
        t = i / sr
        # Low crackle
        crackle = raw[i] * 0.5
        # Occasional spike for pops
        pop = 32767 * 0.8 if rng.random() < 0.003 else 0
        env = min(t / 0.1, 1.0)
        samples.append(_clamp((crackle * 32767 * 0.6 + pop) * env))
    return samples


def _sfx_beep(dur, sr, rng):
    n = _n(dur, sr)
    freq = 440 + rng.randint(0, 440)
    return [_clamp(math.sin(2*math.pi*freq*i/sr) * math.exp(-3*i/n) * 32767)
            for i in range(n)]
