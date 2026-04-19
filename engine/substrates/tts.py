"""
substrates/tts.py — Text → Speech (0D → 4D)

Converts text to natural-sounding speech audio.

Model priority:
  1. Bark      (suno-ai/bark)           — expressive, multilingual, supports [laughs] tags
  2. Coqui TTS (coqui/XTTS-v2)         — fast, voice cloning from reference audio
  3. Kokoro    (hexgrad/Kokoro-82M)     — lightweight, 82M params, 26 voices
  4. Stub      — DTMF-style sine encoding of phonemes (no GPU, always produces WAV)

Input fields
------------
  text        : str   required
  voice       : str   default "v2/en_speaker_6"  (Bark voice preset)
  language    : str   default "en"
  speed       : float default 1.0
  pitch       : float default 1.0   (stub only; models handle internally)
  speaker_wav : str   optional — URL to reference audio for voice cloning (Coqui)
  seed        : int   optional

Output
------
  /static/jobs/<job_id>/speech.wav
"""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path
from typing import Callable

from .base import InferenceSubstrate, Job
from .music_gen import _write_wav_pcm


class TTSSubstrate(InferenceSubstrate):
    dim_in  = 0   # atom: text
    dim_out = 4   # temporal: speech audio

    # Bark voice presets (a subset — user can specify any valid preset)
    BARK_VOICES = [
        "v2/en_speaker_0", "v2/en_speaker_1", "v2/en_speaker_2",
        "v2/en_speaker_3", "v2/en_speaker_4", "v2/en_speaker_5",
        "v2/en_speaker_6", "v2/en_speaker_7", "v2/en_speaker_8",
        "v2/en_speaker_9",
    ]

    @classmethod
    def load_model(cls):
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"

            # Bark
            try:
                from bark import SAMPLE_RATE, generate_audio, preload_models
                preload_models()
                print(f"[TTS] Loaded Bark on {device}")
                return {"backend": "bark", "device": device, "generate": generate_audio,
                        "sample_rate": SAMPLE_RATE}
            except Exception as e:
                print(f"[TTS] Bark unavailable: {e}")

            # Coqui XTTS-v2
            try:
                from TTS.api import TTS as CoquiTTS
                tts = CoquiTTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
                print(f"[TTS] Loaded Coqui XTTS-v2 on {device}")
                return {"backend": "coqui", "model": tts, "device": device, "sample_rate": 24000}
            except Exception as e:
                print(f"[TTS] Coqui unavailable: {e}")

            # Kokoro (lightweight fallback)
            try:
                from kokoro import KPipeline
                pipeline = KPipeline(lang_code="a")   # 'a' = American English
                print(f"[TTS] Loaded Kokoro on {device}")
                return {"backend": "kokoro", "pipeline": pipeline, "device": device,
                        "sample_rate": 24000}
            except Exception as e:
                print(f"[TTS] Kokoro unavailable: {e}")

        except ImportError:
            print("[TTS] torch not installed — running in stub mode")

        print("[TTS] Using phoneme-sine stub")
        return {"backend": "stub"}

    def run(self, job: Job, progress_cb: Callable[[float, str], None]) -> Path:
        params      = job.input
        text        = str(params.get("text", "Hello from the Manifold."))
        voice       = str(params.get("voice", "v2/en_speaker_6"))
        language    = str(params.get("language", "en"))
        speed       = float(params.get("speed", 1.0))
        pitch       = float(params.get("pitch", 1.0))
        speaker_wav = str(params.get("speaker_wav", ""))
        seed        = params.get("seed")

        out_dir  = self.job_dir(job.job_id)
        out_path = out_dir / "speech.wav"

        progress_cb(0.05, "Preparing TTS")

        backend = (self.__class__._model or {}).get("backend", "stub")

        if backend == "bark":
            self._run_bark(out_path, text, voice, seed, progress_cb)
        elif backend == "coqui":
            self._run_coqui(out_path, text, language, speaker_wav, speed, progress_cb)
        elif backend == "kokoro":
            self._run_kokoro(out_path, text, voice, speed, progress_cb)
        else:
            _write_stub_speech(out_path, text, pitch=pitch, speed=speed)
            progress_cb(1.0, "Stub phoneme audio written (no model loaded)")

        return out_path

    def _run_bark(self, out_path, text, voice, seed, cb):
        import numpy as np
        if seed is not None:
            import torch
            torch.manual_seed(int(seed))
        cb(0.1, "Bark inference")
        m = self.__class__._model
        audio = m["generate"](text, history_prompt=voice)
        cb(0.9, "Writing WAV")
        samples = [int(s * 32767) for s in audio.tolist()]
        _write_wav_pcm(out_path, samples, m["sample_rate"])
        cb(1.0, "Done")

    def _run_coqui(self, out_path, text, language, speaker_wav, speed, cb):
        cb(0.1, "Coqui XTTS-v2 inference")
        m = self.__class__._model["model"]
        kw = dict(text=text, language=language, file_path=str(out_path), speed=speed)
        if speaker_wav:
            kw["speaker_wav"] = speaker_wav
        m.tts_to_file(**kw)
        cb(1.0, "Done")

    def _run_kokoro(self, out_path, text, voice, speed, cb):
        import numpy as np
        cb(0.1, "Kokoro inference")
        pipeline = self.__class__._model["pipeline"]
        sr = self.__class__._model["sample_rate"]
        chunks = []
        for _, _, audio in pipeline(text, voice=voice, speed=speed):
            if audio is not None:
                chunks.append(audio)
        if chunks:
            combined = []
            for c in chunks:
                combined.extend(c.tolist())
            samples = [int(s * 32767) for s in combined]
            _write_wav_pcm(out_path, samples, sr)
        cb(1.0, "Done")


# ---------------------------------------------------------------------------
# Stub: phoneme-derived sine encoding
# Maps each character to a frequency band — produces "robotic speech" that
# at least has the right rhythm and duration, useful for timing sync tests.
# ---------------------------------------------------------------------------

# Rough phoneme frequency map (Hz) — based on formant F1 centre frequencies
_CHAR_FREQ: dict[str, float] = {
    'a': 800, 'e': 600, 'i': 300, 'o': 500, 'u': 320,
    'b': 180, 'c': 220, 'd': 200, 'f': 350, 'g': 190,
    'h': 400, 'j': 280, 'k': 210, 'l': 340, 'm': 160,
    'n': 170, 'p': 185, 'q': 240, 'r': 310, 's': 450,
    't': 430, 'v': 370, 'w': 290, 'x': 260, 'y': 270,
    'z': 380, ' ': 0.0,
}


def _write_stub_speech(path: Path, text: str,
                        sample_rate: int = 22050,
                        pitch: float = 1.0,
                        speed: float = 1.0) -> None:
    """
    Each character gets a short sine burst at its formant frequency.
    Silence for spaces. Produces intelligible-duration WAV for sync testing.
    """
    char_dur_ms = max(30, int(80 / speed))   # ms per character
    char_samples = int(sample_rate * char_dur_ms / 1000)
    amp = int(32767 * 0.5)

    all_samples: list[int] = []
    for ch in text.lower():
        freq = _CHAR_FREQ.get(ch, 250.0) * pitch
        if freq == 0.0 or ch == ' ':
            # Silence for space
            all_samples.extend([0] * char_samples)
        else:
            # Sine burst with 10% fade in/out
            fade = max(1, char_samples // 10)
            for i in range(char_samples):
                v = amp * math.sin(2.0 * math.pi * freq * i / sample_rate)
                env = min(i / fade, 1.0, (char_samples - i) / fade)
                all_samples.append(int(v * env))

    _write_wav_pcm(path, all_samples, sample_rate)
