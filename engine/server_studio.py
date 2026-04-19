"""
server_studio.py — Manifold Creative Studio server.

Extends server_three.py with:
  - Async job queue backed by substrates/
  - WebSocket progress stream per job
  - Pipeline chaining endpoint

Run
---
    uvicorn server_studio:app --reload --port 8001

Endpoints
---------
  GET  /                           studio.html shell
  GET  /static/*                   static assets (models, images, audio)
  GET  /api/manifolds              registered manifold names (from server_three)
  POST /api/generate/{substrate}   submit inference job (returns job_id)
  GET  /api/jobs                   list all jobs
  GET  /api/jobs/{job_id}          job status + output URL
  POST /api/pipeline               run a chained pipeline
  WS   /ws/progress/{job_id}       real-time progress (0.0-1.0 + message)
"""

from __future__ import annotations

import asyncio
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from substrates.base import (
    Job, JobStatus, InferenceSubstrate, get_store
)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="Manifold Creative Studio", version="1.0.0")

BASE_DIR   = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Thread pool for CPU/GPU-bound inference
_executor = ThreadPoolExecutor(max_workers=2)

# Active WebSocket connections keyed by job_id
_ws_connections: dict[str, list[WebSocket]] = {}


# ---------------------------------------------------------------------------
# Studio shell
# ---------------------------------------------------------------------------

@app.get("/", response_class=Response)
def studio_index() -> Response:
    shell = BASE_DIR.parent / "studio.html"
    if shell.exists():
        return Response(content=shell.read_text(encoding="utf-8"), media_type="text/html")
    # Fallback: redirect to viewer
    viewer = BASE_DIR / "viewer.html"
    if viewer.exists():
        return Response(content=viewer.read_text(encoding="utf-8"), media_type="text/html")
    raise HTTPException(status_code=404, detail="studio.html not found")


# ---------------------------------------------------------------------------
# Substrate registry  (auto-discovers engine/substrates/*.py)
# ---------------------------------------------------------------------------

def _load_substrate(name: str) -> InferenceSubstrate:
    """
    Dynamically load a substrate class by name.
    Looks in engine/substrates/<snake_name>.py for class <name>.
    """
    import importlib
    snake = _to_snake(name)
    try:
        mod = importlib.import_module(f"substrates.{snake}")
    except ModuleNotFoundError:
        raise HTTPException(status_code=404, detail=f"Substrate not found: {name}")
    cls = getattr(mod, name, None)
    if cls is None or not issubclass(cls, InferenceSubstrate):
        raise HTTPException(status_code=400, detail=f"{name} is not a valid InferenceSubstrate")
    return cls()


def _to_snake(name: str) -> str:
    """TextToImageSubstrate → text_to_image_substrate"""
    import re
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


# ---------------------------------------------------------------------------
# Inference endpoint
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    input: dict[str, Any]


@app.post("/api/generate/{substrate_name}")
async def generate(substrate_name: str, req: GenerateRequest) -> dict:
    """
    Submit an inference job. Returns immediately with job_id.
    Poll GET /api/jobs/{job_id} or subscribe to WS /ws/progress/{job_id}.
    """
    substrate = _load_substrate(substrate_name)
    loop = asyncio.get_event_loop()

    # Run inference in thread pool so the event loop stays responsive
    job = Job.create(
        substrate.__class__.__name__,
        substrate.dim_in,
        substrate.dim_out,
        req.input,
    )
    get_store().put(job)

    async def _run():
        def _sync_run():
            return substrate.infer(req.input, progress_cb=_make_progress_cb(job.job_id))
        finished_job = await loop.run_in_executor(_executor, _sync_run)
        await _broadcast(finished_job.job_id, {"status": finished_job.status, "progress": 1.0})

    asyncio.create_task(_run())
    return {"job_id": job.job_id, "status": JobStatus.QUEUED}


def _make_progress_cb(job_id: str):
    """Return a progress callback that broadcasts to WebSocket listeners."""
    loop = asyncio.get_event_loop()

    def cb(fraction: float, message: str) -> None:
        job = get_store().get(job_id)
        if job:
            job.updated_at = __import__("time").time()
        try:
            asyncio.run_coroutine_threadsafe(
                _broadcast(job_id, {"progress": fraction, "message": message}), loop
            )
        except Exception:
            pass
    return cb


# ---------------------------------------------------------------------------
# Job status endpoints
# ---------------------------------------------------------------------------

@app.get("/api/jobs")
def list_jobs() -> dict:
    return {"jobs": [j.to_dict() for j in get_store().all()]}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = get_store().get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    return job.to_dict()


# ---------------------------------------------------------------------------
# Pipeline endpoint
# ---------------------------------------------------------------------------

class PipelineStep(BaseModel):
    substrate: str
    input:     dict[str, Any] = {}


class PipelineRequest(BaseModel):
    steps: list[PipelineStep]
    seed_input: dict[str, Any]   # input for the first step


@app.post("/api/pipeline")
async def run_pipeline(req: PipelineRequest) -> dict:
    """
    Chain substrates: output URL of step N becomes 'source' input of step N+1.
    Returns list of job_ids in execution order.
    """
    job_ids = []
    current_input = dict(req.seed_input)

    for step in req.steps:
        substrate = _load_substrate(step.substrate)
        merged_input = {**current_input, **step.input}
        job = substrate.infer(merged_input)
        job_ids.append(job.job_id)

        if job.status == JobStatus.FAILED:
            return {
                "job_ids": job_ids,
                "failed_at": step.substrate,
                "error": job.error,
            }

        # Pass output URL as 'source' for the next step
        current_input = {"source": job.output.get("url", "")}

    return {"job_ids": job_ids, "status": "done"}


# ---------------------------------------------------------------------------
# WebSocket progress stream
# ---------------------------------------------------------------------------

@app.websocket("/ws/progress/{job_id}")
async def ws_progress(websocket: WebSocket, job_id: str) -> None:
    await websocket.accept()
    _ws_connections.setdefault(job_id, []).append(websocket)

    # Send current job state immediately on connect
    job = get_store().get(job_id)
    if job:
        await websocket.send_json({"status": job.status, "progress": 0.0})

    try:
        while True:
            await asyncio.sleep(30)   # keep-alive; updates come via _broadcast
    except WebSocketDisconnect:
        pass
    finally:
        conns = _ws_connections.get(job_id, [])
        if websocket in conns:
            conns.remove(websocket)


async def _broadcast(job_id: str, data: dict) -> None:
    for ws in list(_ws_connections.get(job_id, [])):
        try:
            await ws.send_json(data)
        except Exception:
            _ws_connections[job_id].remove(ws)


# ---------------------------------------------------------------------------
# Manifold registry passthrough (from server_three)
# ---------------------------------------------------------------------------

@app.get("/api/manifolds")
def list_manifolds() -> dict:
    try:
        from manifold_core import Manifold
        return {"manifolds": Manifold.list_manifolds()}
    except Exception:
        return {"manifolds": []}


# ---------------------------------------------------------------------------
# Export passthrough (from server_three)
# ---------------------------------------------------------------------------

class ExportRequest(BaseModel):
    res:   int   = 100
    scale: float = 1.0
    t:     float = 0.0
    sign:  bool  = True


@app.post("/api/export/{name}")
def export_manifold(name: str, req: ExportRequest) -> dict:
    try:
        from manifold_core import Manifold, ManifoldInstance, Runtime
        from export_three import export_to_json
        instance = Runtime.observe(name)
        if instance is None:
            raise HTTPException(status_code=404, detail=f"Manifold not found: {name}")
        out = export_to_json(instance,
                             path=f"static/{name}.json",
                             res=req.res, scale=req.scale,
                             t=req.t, sign=req.sign)
        return {"path": str(out), "name": name}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
