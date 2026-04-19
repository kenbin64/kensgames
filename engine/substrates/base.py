"""
substrates/base.py — InferenceSubstrate base class.

All AI substrates extend this. The pattern:

    class TextToImageSubstrate(InferenceSubstrate):
        dim_in  = 0   # consumes a prompt (0D atom)
        dim_out = 2   # produces an image (2D plane)
        model_id = "black-forest-labs/FLUX.1-schnell"

        def load_model(self): ...
        def run(self, job: Job) -> Path: ...

Design: minimum input, maximum output.
The base class owns job lifecycle, file I/O, signing, and progress events.
The subclass owns only model loading and inference.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any, Callable

# ---------------------------------------------------------------------------
# Job model
# ---------------------------------------------------------------------------

class JobStatus(str, Enum):
    QUEUED  = "queued"
    RUNNING = "running"
    DONE    = "done"
    FAILED  = "failed"


@dataclass
class Job:
    """A single inference request — the manifold coordinate for an asset."""
    job_id:    str
    substrate: str
    dim_in:    int
    dim_out:   int
    input:     dict[str, Any]
    status:    JobStatus = JobStatus.QUEUED
    output:    dict[str, Any] = field(default_factory=dict)
    error:     str = ""
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    @classmethod
    def create(cls, substrate: str, dim_in: int, dim_out: int, input_data: dict) -> "Job":
        job_id = _content_id(substrate, input_data)
        return cls(
            job_id=job_id,
            substrate=substrate,
            dim_in=dim_in,
            dim_out=dim_out,
            input=input_data,
        )

    def to_dict(self) -> dict:
        d = asdict(self)
        d["status"] = self.status.value
        return d

    def sign(self) -> dict:
        """Return a SHA-256 signed job record."""
        payload = {k: v for k, v in self.to_dict().items() if k != "hash"}
        payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
        return {**payload, "hash": hashlib.sha256(payload_bytes).hexdigest()}


def _content_id(substrate: str, data: dict) -> str:
    """Deterministic job ID from substrate name + input content."""
    raw = json.dumps({"substrate": substrate, "input": data}, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Job store  (in-memory; swap for Redis/SQLite in production)
# ---------------------------------------------------------------------------

class JobStore:
    """Coordinate-addressed job store — mirrors manifold.write/read pattern."""

    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._listeners: list[Callable[[Job], None]] = []

    def put(self, job: Job) -> None:
        job.updated_at = time.time()
        self._jobs[job.job_id] = job
        for fn in self._listeners:
            try: fn(job)
            except Exception: pass

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def all(self) -> list[Job]:
        return list(self._jobs.values())

    def on_update(self, fn: Callable[[Job], None]) -> None:
        self._listeners.append(fn)


# Singleton store shared across all substrates
_store = JobStore()


def get_store() -> JobStore:
    return _store


# ---------------------------------------------------------------------------
# InferenceSubstrate base class
# ---------------------------------------------------------------------------

class InferenceSubstrate(ABC):
    """
    Abstract base for every AI inference step.

    Subclasses set class attributes and implement `load_model()` + `run()`.
    The base class handles:
      - job directory creation
      - status lifecycle (queued → running → done/failed)
      - SHA-256 output signing
      - progress callback forwarding
    """

    dim_in:   int = 0   # dimensional layer consumed
    dim_out:  int = 0   # dimensional layer produced
    model_id: str = ""  # HuggingFace model ID or local path

    _model = None  # lazy-loaded; shared across instances of the same class

    # ── Output directory ──────────────────────────────────────────────────

    @property
    def static_dir(self) -> Path:
        base = Path(__file__).parent.parent / "static" / "jobs"
        base.mkdir(parents=True, exist_ok=True)
        return base

    def job_dir(self, job_id: str) -> Path:
        d = self.static_dir / job_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    # ── Model lifecycle ───────────────────────────────────────────────────

    @classmethod
    def ensure_model(cls) -> None:
        """Load model once; subsequent calls are no-ops."""
        if cls._model is None:
            cls._model = cls.load_model()  # type: ignore[attr-defined]

    @classmethod
    def load_model(cls):
        """Override to load and return the model object."""
        raise NotImplementedError(f"{cls.__name__} must implement load_model()")

    # ── Inference entry point ─────────────────────────────────────────────

    def infer(self, input_data: dict,
              progress_cb: Callable[[float, str], None] | None = None) -> Job:
        """
        Submit and immediately run a job synchronously.
        For async use, call `submit()` then poll `get_store().get(job_id)`.
        """
        job = Job.create(self.__class__.__name__, self.dim_in, self.dim_out, input_data)
        store = get_store()
        store.put(job)

        job.status = JobStatus.RUNNING
        store.put(job)

        try:
            self.ensure_model()
            out_path = self.run(job, progress_cb=progress_cb or _noop_progress)
            job.output = self._record_output(job.job_id, out_path)
            job.status = JobStatus.DONE
        except Exception as exc:
            job.error  = str(exc)
            job.status = JobStatus.FAILED

        store.put(job)
        return job

    @abstractmethod
    def run(self, job: Job, progress_cb: Callable[[float, str], None]) -> Path:
        """
        Run inference. Return the Path to the primary output file.
        Call progress_cb(fraction, message) to report progress.
        """

    # ── Output recording ─────────────────────────────────────────────────

    def _record_output(self, job_id: str, out_path: Path) -> dict:
        """Build signed output record and write manifest.json alongside asset."""
        rel = f"/static/jobs/{job_id}/{out_path.name}"
        record = {
            "url":  rel,
            "path": str(out_path),
            "size": out_path.stat().st_size,
            "hash": _file_sha256(out_path),
        }
        manifest_path = out_path.parent / "manifest.json"
        manifest_path.write_text(
            json.dumps(record, indent=2), encoding="utf-8"
        )
        return record


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _noop_progress(fraction: float, message: str) -> None:
    pass
