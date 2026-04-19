"""
substrates/music_gen.py — Text → Music (0D → 4D)

Generates background music / adaptive game audio from a text description.

Model priority:
  1. MusicGen  (facebook/musicgen-small → medium → large → stereo)
  2. AudioCraft melody conditioning (if reference audio provided)
  3. Stub — procedural music from the phi spiral (no GPU)

Input fields
------------
  prompt    : str   required — "epic orchestral battle theme, 120 bpm"
  duration  : float default 8.0  seconds
  fps       : int   default 32000  sample rate (8k / 16k / 32k / 44100)
  melody    : str   optional — URL to reference audio for melody conditioning
  top_k     : int   default 250
  top_p     : float default 0.0
  temperature : float default 1.0
  seed      : int   optional

Output
------
  /static/jobs/<job_id>/music.wav  (PCM 16-bit, mono or stereo)
"""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path
from typing import Callable

from .base import InferenceSubstrate, Job

# MusicGen model sizes in ascending quality order
_MUSICGEN_MODELS = [
    "facebook/musicgen-small",
    "facebook/musicgen-medium",
    "facebook/musicgen-large",
    "facebook/musicgen-stereo-small",
]


class MusicGenSubstrate(InferenceSubstrate):
    dim_in  = 0   # atom: text prompt
    dim_out = 4   # temporal: audio waveform

    @classmethod
    def load_model(cls):
        try:
            import torch
            from audiocraft.models import MusicGen
            device = "cuda" if torch.cuda.is_available() else "cpu"

            for model_id in _MUSICGEN_MODELS:
                try:
                    name = model_id.split("/")[-1]  # e.g. musicgen-small
                    model = MusicGen.get_pretrained(name)
                    model.to(device)
                    print(f"[MusicGen] Loaded {model_id} on {device}")
                    return {"model": model, "device": device, "model_id": model_id}
                except Exception as e:
                    print(f"[MusicGen] {model_id} unavailable: {e}")

        except ImportError:
            print("[MusicGen] audiocraft not installed — running in stub mode")

        return None

    def run(self, job: Job, progress_cb: Callable[[float, str], None]) -> Path:
        params      = job.input
        prompt      = str(params.get("prompt", "ambient game music"))
        duration    = float(params.get("duration", 8.0))
        sample_rate = int(params.get("fps", 32000))
        melody_src  = str(params.get("melody", ""))
        top_k       = int(params.get("top_k", 250))
        top_p       = float(params.get("top_p", 0.0))
        temperature = float(params.get("temperature", 1.0))
        seed        = params.get("seed")

        out_dir  = self.job_dir(job.job_id)
        out_path = out_dir / "music.wav"

        progress_cb(0.05, "Preparing music generation")

        if self.__class__._model is None:
            _write_stub_wav(out_path, prompt, duration, sample_rate)
            progress_cb(1.0, "Stub procedural music written (no model loaded)")
            return out_path

        import torch
        model  = self.__class__._model["model"]
        device = self.__class__._model["device"]

        model.set_generation_params(
            duration=duration,
            top_k=top_k,
            top_p=top_p,
            temperature=temperature,
            cfg_coef=3.0,
        )

        if seed is not None:
            torch.manual_seed(int(seed))

        progress_cb(0.1, "Generating audio tokens")

        if melody_src:
            # Melody conditioning
            melody_wav = _load_wav_tensor(melody_src, model.sample_rate)
            wav = model.generate_with_chroma(
                descriptions=[prompt],
                melody_wavs=melody_wav,
                melody_sample_rate=model.sample_rate,
                progress=True,
            )
        else:
            wav = model.generate(descriptions=[prompt], progress=True)

        progress_cb(0.85, "Writing WAV")
        # wav shape: (batch, channels, samples)
        _tensor_to_wav(out_path, wav[0], model.sample_rate)
        progress_cb(1.0, "Done")
        return out_path


# ---------------------------------------------------------------------------
# Stub: procedural music from phi spiral harmonics
# Every note frequency is a Fibonacci ratio of the root — z = x·y (dimensional law)
# ---------------------------------------------------------------------------

# Phi-derived interval ratios: each ratio = fib[n+1] / fib[n]
_PHI_RATIOS = [1.0, 1.618, 2.618, 4.236, 6.854, 11.09, 17.94]

# Pentatonic-ish scale derived from phi: root × ratio mod-octave
def _phi_scale(root: float, n: int = 5) -> list[float]:
    freqs = []
    for i in range(n):
        r = _PHI_RATIOS[i % len(_PHI_RATIOS)]
        f = root * r
        while f > root * 4: f /= 2.0
        while f < root:     f *= 2.0
        freqs.append(f)
    return sorted(freqs)


def _write_stub_wav(path: Path, prompt: str, duration: float, sample_rate: int) -> None:
    """
    Procedural music built from phi-scale overtones.
    Each partial is derived from the manifold equation:
        amplitude = 1 / (harmonic_index)     (1/n roll-off)
        frequency = root × phi_ratio[n]      (z = x·y)
    """
    import hashlib
    seed_val = int(hashlib.sha256(prompt.encode()).hexdigest()[:8], 16)

    # Root frequency 110–220 Hz derived from seed
    root = 110.0 + (seed_val % 111)
    scale = _phi_scale(root, 5)

    n_samples = int(duration * sample_rate)
    # 16-bit max amplitude at ~70% to avoid clipping
    amp = 0.70 * 32767

    # Chord progression: 4-bar cycle, each bar = duration/4 seconds
    bar_samples = n_samples // 4
    chord_roots = [scale[0], scale[2], scale[1], scale[3]]

    samples = []
    for i in range(n_samples):
        t = i / sample_rate
        bar  = (i // bar_samples) % 4
        root_f = chord_roots[bar]

        # Sum harmonics: amplitude decays as 1/k, freq = root × k (overtone series)
        v = 0.0
        for k in range(1, 7):
            v += (1.0 / k) * math.sin(2.0 * math.pi * root_f * k * t)

        # Add a second phi-ratio partial for richness
        phi_partial = scale[(bar + 2) % len(scale)]
        v += 0.3 * math.sin(2.0 * math.pi * phi_partial * t)

        # Soft envelope: fade in first 0.05s, fade out last 0.05s of each bar
        bar_pos = (i % bar_samples) / bar_samples
        env = min(bar_pos / 0.05, 1.0, (1.0 - bar_pos) / 0.05)
        samples.append(int(amp * v * env / 4.0))   # /4 for headroom

    _write_wav_pcm(path, samples, sample_rate, n_channels=1)


def _write_wav_pcm(path: Path, samples: list[int], sample_rate: int, n_channels: int = 1) -> None:
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(n_channels)
        wf.setsampwidth(2)   # 16-bit
        wf.setframerate(sample_rate)
        data = struct.pack(f"<{len(samples)}h", *[max(-32768, min(32767, s)) for s in samples])
        wf.writeframes(data)


def _load_wav_tensor(source: str, target_sr: int):
    """Load a WAV/MP3 as a torch tensor for melody conditioning."""
    try:
        import torch
        import torchaudio
        if source.startswith("http"):
            import urllib.request, tempfile, os
            tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            urllib.request.urlretrieve(source, tmp.name)  # noqa: S310
            source = tmp.name
        wav, sr = torchaudio.load(source)
        if sr != target_sr:
            wav = torchaudio.functional.resample(wav, sr, target_sr)
        return wav.unsqueeze(0)   # (1, C, T)
    except Exception:
        return None


def _tensor_to_wav(path: Path, wav_tensor, sample_rate: int) -> None:
    """Write a torch tensor (channels, samples) to a WAV file."""
    try:
        import torchaudio
        torchaudio.save(str(path), wav_tensor.cpu(), sample_rate)
    except Exception:
        # Fallback: convert to int16 PCM manually
        data = wav_tensor[0].cpu().tolist()
        samples = [int(s * 32767) for s in data]
        _write_wav_pcm(path, samples, sample_rate)
