"""
substrates/text_to_image.py — Text → Image (0D → 2D)

Model priority (first available wins):
  1. FLUX.1-schnell   (black-forest-labs/FLUX.1-schnell)  — fast, Apache 2.0
  2. SD 3.5 Medium    (stabilityai/stable-diffusion-3.5-medium)
  3. SDXL Base        (stabilityai/stable-diffusion-xl-base-1.0)
  4. Stub             (returns a solid-colour PNG — for development without GPU)

Input fields
------------
  prompt   : str   required
  negative : str   optional — negative prompt
  width    : int   default 1024
  height   : int   default 1024
  steps    : int   default 28
  guidance : float default 3.5  (CFG scale)
  seed     : int   optional — for reproducibility

Output
------
  /static/jobs/<job_id>/image.png
"""

from __future__ import annotations

import os
import struct
import zlib
from pathlib import Path
from typing import Callable

from .base import InferenceSubstrate, Job


class TextToImageSubstrate(InferenceSubstrate):
    dim_in  = 0   # atom: text prompt
    dim_out = 2   # plane: image

    # HuggingFace model IDs in priority order
    _MODEL_PRIORITY = [
        "black-forest-labs/FLUX.1-schnell",
        "stabilityai/stable-diffusion-3.5-medium",
        "stabilityai/stable-diffusion-xl-base-1.0",
    ]

    @classmethod
    def load_model(cls):
        """
        Try to load the best available diffusion pipeline.
        Falls back to None (stub mode) if diffusers / torch not installed.
        """
        try:
            import torch
            from diffusers import DiffusionPipeline, FluxPipeline

            device = "cuda" if torch.cuda.is_available() else "cpu"
            dtype  = torch.float16 if device == "cuda" else torch.float32

            for model_id in cls._MODEL_PRIORITY:
                try:
                    if "FLUX" in model_id:
                        pipe = FluxPipeline.from_pretrained(
                            model_id, torch_dtype=dtype
                        )
                    else:
                        pipe = DiffusionPipeline.from_pretrained(
                            model_id, torch_dtype=dtype
                        )
                    pipe = pipe.to(device)
                    pipe.enable_attention_slicing()
                    print(f"[TextToImage] Loaded {model_id} on {device}")
                    return {"pipe": pipe, "device": device, "model_id": model_id}
                except Exception as e:
                    print(f"[TextToImage] Could not load {model_id}: {e}")
                    continue

        except ImportError:
            print("[TextToImage] diffusers/torch not installed — running in stub mode")

        return None  # stub mode

    def run(self, job: Job, progress_cb: Callable[[float, str], None]) -> Path:
        params  = job.input
        prompt  = str(params.get("prompt", "a manifold surface"))
        neg     = str(params.get("negative", ""))
        width   = int(params.get("width",  1024))
        height  = int(params.get("height", 1024))
        steps   = int(params.get("steps",  28))
        guidance = float(params.get("guidance", 3.5))
        seed    = params.get("seed")

        out_dir  = self.job_dir(job.job_id)
        out_path = out_dir / "image.png"

        progress_cb(0.05, "Starting inference")

        if self.__class__._model is None:
            # Stub: write a solid-colour PNG (no GPU needed)
            _write_stub_png(out_path, width, height, prompt)
            progress_cb(1.0, "Stub image written (no model loaded)")
            return out_path

        pipe   = self.__class__._model["pipe"]
        device = self.__class__._model["device"]

        import torch
        generator = torch.Generator(device=device)
        if seed is not None:
            generator.manual_seed(int(seed))

        def _step_cb(step: int, _ts, _latents):
            progress_cb(step / steps, f"Step {step}/{steps}")

        kwargs: dict = dict(
            prompt=prompt,
            width=width,
            height=height,
            num_inference_steps=steps,
            generator=generator,
            callback=_step_cb,
            callback_steps=1,
        )
        if neg:
            kwargs["negative_prompt"] = neg
        if "FLUX" not in self.__class__._model.get("model_id", ""):
            kwargs["guidance_scale"] = guidance

        progress_cb(0.1, "Running diffusion")
        result = pipe(**kwargs)
        image  = result.images[0]

        image.save(str(out_path), format="PNG")
        progress_cb(1.0, f"Saved {out_path.name}")
        return out_path


# ---------------------------------------------------------------------------
# Stub PNG writer — pure stdlib, no Pillow required
# Writes a minimal valid PNG from the prompt's hash colour.
# ---------------------------------------------------------------------------

def _write_stub_png(path: Path, width: int, height: int, prompt: str) -> None:
    import hashlib
    h = hashlib.sha256(prompt.encode()).digest()
    r, g, b = h[0], h[1], h[2]

    def _chunk(tag: bytes, data: bytes) -> bytes:
        c = tag + data
        return (
            struct.pack(">I", len(data)) + c +
            struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        )

    # IHDR
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    # IDAT — solid colour rows
    raw = b""
    row = b"\x00" + bytes([r, g, b] * width)  # filter byte + RGB pixels
    raw_data = row * height
    idat = zlib.compress(raw_data)

    png = (
        b"\x89PNG\r\n\x1a\n" +
        _chunk(b"IHDR", ihdr) +
        _chunk(b"IDAT", idat) +
        _chunk(b"IEND", b"")
    )
    path.write_bytes(png)
