"""
engine/pipeline_manifold.py — Preset Pipeline Chains

A pipeline is an ordered list of substrate jobs where each output URL
feeds as `source` into the next job's input.  This module defines
first-class preset pipelines for common creative workflows.

Usage (from Python):
    from pipeline_manifold import get_pipeline, run_pipeline
    result = run_pipeline("character_creation", {"prompt": "a dwarf warrior"})

Usage (via server_studio.py REST API):
    POST /api/pipeline
    {
      "preset": "character_creation",
      "input": { "prompt": "a dwarf warrior" }
    }

Architecture:
    0D text → image (2D) → mesh (3D) → rig (3D) → animation (4D) → audio (4D) → storyboard (5D)
    Each step is a manifold point collapsing one dimension down or expanding one up.
    z = x·y — the output of dimension n is the substrate of dimension n+1.
"""

from __future__ import annotations

import importlib
import sys
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from substrates.base import Job, get_store


# ---------------------------------------------------------------------------
# Pipeline step definition
# ---------------------------------------------------------------------------

@dataclass
class PipelineStep:
    """
    substrate  : PascalCase class name, e.g. "TextToImageSubstrate"
    input_map  : dict mapping job-input keys to either:
                   - a literal value  ("duration": 3.0)
                   - "$input.<key>"   — top-level pipeline input field
                   - "$prev"          — URL of the previous step's output file
                   - "$prev.<key>"    — a key from the previous step's output manifest
    """
    substrate : str
    input_map : dict[str, Any] = field(default_factory=dict)


@dataclass
class Pipeline:
    name        : str
    description : str
    steps       : list[PipelineStep]


# ---------------------------------------------------------------------------
# Preset registry
# ---------------------------------------------------------------------------

_PRESETS: dict[str, Pipeline] = {}


def register(pipeline: Pipeline) -> Pipeline:
    _PRESETS[pipeline.name] = pipeline
    return pipeline


def get_pipeline(name: str) -> Pipeline:
    if name not in _PRESETS:
        raise KeyError(f"Unknown pipeline preset: '{name}'. "
                       f"Available: {list(_PRESETS)}")
    return _PRESETS[name]


def list_pipelines() -> list[dict]:
    return [{"name": p.name, "description": p.description,
             "steps": [s.substrate for s in p.steps]}
            for p in _PRESETS.values()]


# ---------------------------------------------------------------------------
# Preset: Character Creation  (0D → 2D → 3D → 3D → 4D)
#   text → portrait image → 3D mesh → rigged mesh → idle animation
# ---------------------------------------------------------------------------

register(Pipeline(
    name="character_creation",
    description="Generate a fully rigged, animated 3D character from a text prompt.",
    steps=[
        PipelineStep("TextToImageSubstrate", {
            "prompt": "$input.prompt",
            "width":  512,
            "height": 512,
        }),
        PipelineStep("ImageTo3DSubstrate", {
            "source":  "$prev",
            "format":  "obj",
        }),
        PipelineStep("AutoRigSubstrate", {
            "source":   "$prev",
            "skeleton": "$input.skeleton",   # biped / quadruped / hand
        }),
        PipelineStep("TextToAnimationSubstrate", {
            "prompt":   "$input.animation_prompt",
            "rig":      "$prev",
            "duration": "$input.duration",
        }),
    ],
))


# ---------------------------------------------------------------------------
# Preset: Scene Audio  (0D → 4D → 4D → 4D → 4D)
#   scene text → music + TTS narration + SFX → final mix
# ---------------------------------------------------------------------------

register(Pipeline(
    name="scene_audio",
    description="Compose music, narration, and SFX for a scene, then mix them.",
    steps=[
        PipelineStep("MusicGenSubstrate", {
            "prompt":   "$input.scene",
            "duration": "$input.duration",
        }),
        PipelineStep("TTSSubstrate", {
            "text":     "$input.narration",
            "voice":    "$input.voice",
        }),
        PipelineStep("SFXGenSubstrate", {
            "prompt":   "$input.sfx_prompt",
            "duration": "$input.sfx_duration",
        }),
        PipelineStep("AudioMixSubstrate", {
            "tracks": [
                {"source": "$steps.0", "gain_db": -6.0, "loop": True},
                {"source": "$steps.1", "gain_db":  0.0, "offset": "$input.narration_offset"},
                {"source": "$steps.2", "gain_db":  0.0, "offset": "$input.sfx_offset"},
            ],
            "normalize": True,
        }),
    ],
))


# ---------------------------------------------------------------------------
# Preset: Storyboard  (0D → 5D)
#   full pipeline: script → storyboard panels
# ---------------------------------------------------------------------------

register(Pipeline(
    name="storyboard",
    description="Generate a visual storyboard from a narrative script.",
    steps=[
        PipelineStep("StoryboardSubstrate", {
            "script":   "$input.script",
            "panels":   "$input.panels",
            "cols":     "$input.cols",
            "style":    "$input.style",
        }),
    ],
))


# ---------------------------------------------------------------------------
# Preset: Full Character+Audio  (0D → 5D end-to-end)
#   text → character → animation → voice → SFX → mix → storyboard
# ---------------------------------------------------------------------------

register(Pipeline(
    name="full_production",
    description="End-to-end: character mesh + animation + voiced narration + SFX + storyboard.",
    steps=[
        # Phase 1+2: character
        PipelineStep("TextToImageSubstrate", {"prompt": "$input.character_prompt"}),
        PipelineStep("ImageTo3DSubstrate",   {"source": "$prev"}),
        PipelineStep("AutoRigSubstrate",     {"source": "$prev", "skeleton": "biped"}),
        PipelineStep("TextToAnimationSubstrate", {
            "prompt": "$input.animation_prompt",
            "rig":    "$prev",
        }),
        # Phase 4: audio
        PipelineStep("MusicGenSubstrate", {
            "prompt":   "$input.music_prompt",
            "duration": "$input.duration",
        }),
        PipelineStep("TTSSubstrate", {
            "text":  "$input.narration",
        }),
        PipelineStep("SFXGenSubstrate", {
            "prompt":   "$input.sfx_prompt",
            "duration": 2.0,
        }),
        PipelineStep("AudioMixSubstrate", {
            "tracks": [
                {"source": "$steps.4", "gain_db": -8.0, "loop": True},
                {"source": "$steps.5", "gain_db":  0.0},
                {"source": "$steps.6", "gain_db": -3.0, "offset": 1.0},
            ],
        }),
        # Phase 5: storyboard
        PipelineStep("StoryboardSubstrate", {
            "script": "$input.narration",
            "panels": 6,
            "cols":   3,
        }),
    ],
))


# ---------------------------------------------------------------------------
# Pipeline runner
# ---------------------------------------------------------------------------

def _load_substrate(name: str):
    """Dynamically load a substrate class by PascalCase name."""
    import re
    snake = re.sub(r"(?<!^)(?=[A-Z])", "_", name.replace("Substrate", "")).lower()
    module_name = f"substrates.{snake}_substrate".replace("__", "_")
    # Try the direct module name pattern used by the project
    for mod_path in [module_name,
                     f"substrates.{snake}",
                     f"substrates.{snake.replace('_substrate', '')}"]:
        try:
            mod = importlib.import_module(mod_path)
            return getattr(mod, name)
        except (ImportError, AttributeError):
            continue
    raise ImportError(f"Cannot load substrate class '{name}'")


def _resolve_value(val: Any, pipeline_input: dict, step_outputs: list[str]) -> Any:
    """
    Resolve a $input.key, $prev, or $steps.N reference.
    """
    if not isinstance(val, str):
        return val
    if val == "$prev":
        return step_outputs[-1] if step_outputs else None
    if val.startswith("$input."):
        key = val[7:]
        return pipeline_input.get(key, None)
    if val.startswith("$steps."):
        idx = int(val[7:])
        return step_outputs[idx] if idx < len(step_outputs) else None
    return val


def _resolve_input(input_map: dict, pipeline_input: dict,
                   step_outputs: list[str]) -> dict:
    result = {}
    for k, v in input_map.items():
        if isinstance(v, list):
            resolved = []
            for item in v:
                if isinstance(item, dict):
                    resolved.append({ik: _resolve_value(iv, pipeline_input, step_outputs)
                                      for ik, iv in item.items()})
                else:
                    resolved.append(_resolve_value(item, pipeline_input, step_outputs))
            result[k] = resolved
        else:
            result[k] = _resolve_value(v, pipeline_input, step_outputs)
    # Drop None values that come from missing $input references
    return {k: v for k, v in result.items() if v is not None}


def run_pipeline(
    name_or_pipeline: str | Pipeline,
    pipeline_input: dict,
    progress_cb: Callable[[int, str, float, str], None] | None = None,
) -> list[dict]:
    """
    Run a pipeline synchronously.

    progress_cb(step_idx, substrate_name, frac, message)

    Returns a list of output dicts (one per step), each with:
      { "step": int, "substrate": str, "output": Path, "job_id": str }
    """
    pipeline = (get_pipeline(name_or_pipeline)
                if isinstance(name_or_pipeline, str)
                else name_or_pipeline)

    step_outputs: list[str] = []   # URL strings
    results: list[dict]     = []

    for idx, step in enumerate(pipeline.steps):
        cls          = _load_substrate(step.substrate)
        instance     = cls()
        resolved     = _resolve_input(step.input_map, pipeline_input, step_outputs)
        job          = Job.create(step.substrate, instance.dim_in, instance.dim_out, resolved)
        get_store().put(job)

        def _cb(frac, msg, _idx=idx, _name=step.substrate):
            if progress_cb:
                progress_cb(_idx, _name, frac, msg)

        output_path = instance.run(job, _cb)
        url = f"/static/jobs/{job.job_id}/{output_path.name}"
        step_outputs.append(url)
        results.append({
            "step":      idx,
            "substrate": step.substrate,
            "output":    output_path,
            "job_id":    job.job_id,
            "url":       url,
        })

    return results


# ---------------------------------------------------------------------------
# CLI entry point — python pipeline_manifold.py <preset> [key=value ...]
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json

    args = sys.argv[1:]
    if not args:
        print("Available presets:")
        for p in list_pipelines():
            print(f"  {p['name']:25s} — {p['description']}")
            print(f"    steps: {' → '.join(p['steps'])}")
        sys.exit(0)

    preset_name   = args[0]
    pipeline_args = {}
    for a in args[1:]:
        if "=" in a:
            k, v = a.split("=", 1)
            try:
                v = json.loads(v)
            except Exception:
                pass
            pipeline_args[k] = v

    def cli_progress(step, substrate, frac, msg):
        bar = "=" * int(frac * 20)
        print(f"  [{bar:<20s}] step {step+1} {substrate}: {msg}")

    print(f"Running pipeline '{preset_name}'...")
    outputs = run_pipeline(preset_name, pipeline_args, cli_progress)
    print("\nPipeline complete:")
    for r in outputs:
        print(f"  step {r['step']+1}: {r['substrate']} → {r['url']}")
