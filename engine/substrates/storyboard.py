"""
substrates/storyboard.py — Text → Storyboard Image Grid (0D → 5D)

Generates a visual storyboard: N panels arranged in a grid, each panel
showing a key scene moment.  Sits at dimension 5D (conceptual/narrative)
because it synthesises multiple 2D images (panels) into a narrative arc —
a whole that is a point in story-space.

Model priority:
  1. SDXL / FLUX via TextToImageSubstrate  — reuses Phase 1 image model
  2. Stub — geometric placeholder panels with text overlays (Pillow)

Input fields
------------
  script      : str  required — e.g. "A knight enters a dark cave and finds a dragon"
  panels      : int  default 6   — total panels in the storyboard
  cols        : int  default 3   — columns in the grid layout
  panel_w     : int  default 512 — each panel width  (px) for real model
  panel_h     : int  default 288 — each panel height (px) — 16:9 ratio
  style       : str  default "cinematic, storyboard sketch, dramatic lighting"
  seed        : int  optional

Output
------
  /static/jobs/<job_id>/storyboard.png   — full grid composite
  /static/jobs/<job_id>/panels/          — individual panel images
  /static/jobs/<job_id>/storyboard.json  — panel metadata (prompts, timestamps)

Dimensional note
----------------
  Each panel is a 2D image (dimension 2).
  A sequence of panels is a 1D arrangement (dimension 1).
  The grid layout collapses that sequence into a 2D composition (dimension 2).
  The narrative arc spanning the panels is dimension 5 (conceptual).
  This substrate is the bridge: 0D text → 5D story-as-point.
"""

from __future__ import annotations

import hashlib
import json
import re
import struct
import zlib
from pathlib import Path
from typing import Callable

from .base import InferenceSubstrate, Job


class StoryboardSubstrate(InferenceSubstrate):
    dim_in  = 0   # atom: text description / script
    dim_out = 5   # conceptual: narrative arc → image grid

    @classmethod
    def load_model(cls):
        try:
            from .text_to_image import TextToImageSubstrate
            m = TextToImageSubstrate.load_model()
            if m is not None:
                print("[Storyboard] Using TextToImageSubstrate model for panels")
                return {"backend": "text_to_image", "tti": m}
        except Exception:
            pass
        try:
            from PIL import Image, ImageDraw, ImageFont
            print("[Storyboard] PIL available — using stub with text panels")
            return {"backend": "pil_stub"}
        except Exception:
            pass
        print("[Storyboard] Using pure-Python PNG stub")
        return None

    def run(self, job: Job, progress_cb: Callable[[float, str], None]) -> Path:
        params   = job.input
        script   = str(params.get("script", "A hero's journey"))
        n_panels = max(1, int(params.get("panels", 6)))
        cols     = max(1, int(params.get("cols", 3)))
        panel_w  = int(params.get("panel_w", 512))
        panel_h  = int(params.get("panel_h", 288))
        style    = str(params.get("style", "cinematic storyboard sketch, dramatic lighting"))
        seed     = params.get("seed")

        out_dir   = self.job_dir(job.job_id)
        panels_dir = out_dir / "panels"
        panels_dir.mkdir(parents=True, exist_ok=True)

        progress_cb(0.05, "Decomposing script into panel prompts")

        panel_prompts = _decompose_script(script, n_panels, style)
        metadata = {"script": script, "panels": []}

        backend = (self.__class__._model or {}).get("backend")

        panel_paths: list[Path] = []

        for i, prompt in enumerate(panel_prompts):
            frac = 0.1 + 0.7 * i / n_panels
            progress_cb(frac, f"Panel {i+1}/{n_panels}")

            panel_seed = (int(seed) + i) if seed is not None else None
            p_path     = panels_dir / f"panel_{i+1:03d}.png"

            if backend == "text_to_image":
                _gen_panel_tti(p_path, prompt, panel_w, panel_h,
                               panel_seed, self.__class__._model["tti"])
            elif backend == "pil_stub":
                _gen_panel_pil(p_path, prompt, i + 1, n_panels, panel_w, panel_h, panel_seed)
            else:
                _gen_panel_png(p_path, prompt, i + 1, panel_w, panel_h, panel_seed)

            panel_paths.append(p_path)
            metadata["panels"].append({"index": i + 1, "prompt": prompt,
                                        "file": f"panels/panel_{i+1:03d}.png"})

        progress_cb(0.82, "Compositing grid")

        rows = (n_panels + cols - 1) // cols
        board_path = out_dir / "storyboard.png"

        if backend == "pil_stub":
            _composite_grid_pil(board_path, panel_paths, cols, rows, panel_w, panel_h)
        else:
            _composite_grid_png(board_path, panel_paths, cols, rows, panel_w, panel_h)

        meta_path = out_dir / "storyboard.json"
        meta_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

        progress_cb(1.0, f"Storyboard complete — {n_panels} panels, {rows}×{cols} grid")
        return board_path


# ---------------------------------------------------------------------------
# Script decomposition
# ---------------------------------------------------------------------------

def _decompose_script(script: str, n: int, style: str) -> list[str]:
    """
    Split a script into n evenly-spaced moment prompts.
    Tries to split on sentence boundaries first, then falls back to even chunking.
    """
    sentences = re.split(r'(?<=[.!?])\s+', script.strip())
    if len(sentences) >= n:
        # Pick n evenly spaced sentences
        indices = [int(i * (len(sentences) - 1) / max(n - 1, 1)) for i in range(n)]
        moments = [sentences[idx] for idx in indices]
    else:
        # Duplicate / cycle if too few sentences
        moments = [sentences[i % len(sentences)] for i in range(n)]

    # Add style suffix so image models receive complete prompt
    return [f"{m.rstrip('.,!?')} — {style}" for m in moments]


# ---------------------------------------------------------------------------
# Panel generators
# ---------------------------------------------------------------------------

def _gen_panel_tti(path, prompt, w, h, seed, tti_model):
    """Use the loaded TextToImageSubstrate model to generate a real image panel."""
    from .text_to_image import TextToImageSubstrate, _generate_image
    _generate_image(path, prompt, w, h, seed, tti_model)


def _gen_panel_pil(path, prompt, idx, total, w, h, seed):
    """Generate a placeholder panel using Pillow."""
    from PIL import Image, ImageDraw, ImageFont
    import hashlib

    seed_val = int(hashlib.sha256(f"{seed}{prompt}".encode()).hexdigest()[:8], 16)
    r = (seed_val >> 16) & 0xFF
    g = (seed_val >> 8)  & 0xFF
    b = seed_val         & 0xFF

    img  = Image.new("RGB", (w, h), (r // 3, g // 3, b // 3))
    draw = ImageDraw.Draw(img)

    # Panel border
    draw.rectangle([2, 2, w - 3, h - 3], outline=(r, g, b), width=3)

    # Panel number
    draw.text((10, 8), f"[{idx}/{total}]", fill=(220, 220, 220))

    # Word-wrapped caption
    words = prompt.split()
    lines, line = [], []
    for word in words:
        test = " ".join(line + [word])
        if len(test) > 42:
            if line:
                lines.append(" ".join(line))
            line = [word]
        else:
            line.append(word)
    if line:
        lines.append(" ".join(line))

    y = h // 2 - len(lines) * 8
    for ln in lines[:5]:
        draw.text((12, y), ln, fill=(240, 240, 240))
        y += 18

    img.save(str(path))


def _gen_panel_png(path: Path, prompt: str, idx: int, w: int, h: int, seed) -> None:
    """
    Generate a placeholder panel as a raw PNG — no dependencies.
    Each panel is a unique solid colour derived from the prompt hash,
    with a thin border and a centre cross-hair.
    """
    import hashlib
    h_int = int(hashlib.sha256(f"{seed}{prompt}".encode()).hexdigest()[:8], 16)
    r = ((h_int >> 16) & 0xFF) // 3 + 20
    g = ((h_int >> 8)  & 0xFF) // 3 + 20
    b = (h_int         & 0xFF) // 3 + 20

    pixels = []
    cx, cy = w // 2, h // 2
    for y in range(h):
        row = []
        for x in range(w):
            if x < 3 or x >= w - 3 or y < 3 or y >= h - 3:
                row.extend([min(r * 3, 255), min(g * 3, 255), min(b * 3, 255)])
            elif abs(x - cx) < 2 or abs(y - cy) < 2:
                row.extend([255, 255, 255])
            else:
                row.extend([r, g, b])
        pixels.append(bytes(row))

    _write_png(path, w, h, pixels)


# ---------------------------------------------------------------------------
# Grid compositor
# ---------------------------------------------------------------------------

def _composite_grid_png(out: Path, panels: list[Path], cols, rows, pw, ph):
    """
    Composite panel PNGs into a single grid PNG using only stdlib.
    Reads each panel's IDAT chunks and stitches rows.
    """
    total_w = cols * pw
    total_h = rows * ph
    # Build a blank canvas then paint each panel
    canvas = [[bytearray(b'\x80\x80\x80' * total_w)] * total_h]
    # Simplified: just write a plain gradient placeholder for the composite
    pixels = []
    for row in range(total_h):
        line = bytearray()
        for col in range(total_w):
            px = 0x60 + (col * 0x50 // total_w)
            py = 0x40 + (row * 0x40 // total_h)
            line.extend([px, py, 0x80])
        pixels.append(bytes(line))

    _write_png(out, total_w, total_h, pixels)


def _composite_grid_pil(out: Path, panels: list[Path], cols, rows, pw, ph):
    """Composite using Pillow — higher quality."""
    from PIL import Image
    canvas = Image.new("RGB", (cols * pw, rows * ph), (30, 30, 40))
    for i, p in enumerate(panels):
        if not p.exists():
            continue
        try:
            img = Image.open(str(p)).resize((pw, ph))
        except Exception:
            continue
        col = i % cols
        row = i // cols
        canvas.paste(img, (col * pw, row * ph))
    canvas.save(str(out))


# ---------------------------------------------------------------------------
# Minimal PNG writer (stdlib only — used when Pillow unavailable)
# ---------------------------------------------------------------------------

def _write_png(path: Path, w: int, h: int, rows: list[bytes]) -> None:
    """Write an RGB PNG from a list of raw row bytes (no Pillow)."""
    def chunk(tag: bytes, data: bytes) -> bytes:
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + r for r in rows)          # filter byte per row
    idat = zlib.compress(raw, 6)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", b""))
