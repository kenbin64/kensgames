"""
server_three.py — FastAPI server for the Manifold Three.js viewer.

Endpoints
---------
GET  /                 → viewer.html
GET  /static/*         → static file assets (manifold JSON, textures, etc.)
GET  /api/manifolds    → list registered manifold names
POST /api/export/{name}→ re-export a registered manifold on demand

Run
---
    uvicorn server_three:app --reload --port 8000
"""

import hashlib
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="Manifold Viewer", version="1.0.0")

BASE_DIR    = Path(__file__).parent
STATIC_DIR  = BASE_DIR / "static"
VIEWER_HTML = BASE_DIR / "viewer.html"

STATIC_DIR.mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ---------------------------------------------------------------------------
# Viewer endpoint
# ---------------------------------------------------------------------------

@app.get("/", response_class=Response)
def index() -> Response:
    if not VIEWER_HTML.exists():
        raise HTTPException(status_code=404, detail="viewer.html not found")
    html = VIEWER_HTML.read_text(encoding="utf-8")
    return Response(content=html, media_type="text/html")


# ---------------------------------------------------------------------------
# Manifold registry API
# ---------------------------------------------------------------------------

@app.get("/api/manifolds")
def list_manifolds() -> dict:
    """Return names of all registered manifolds."""
    try:
        from manifold_core import Manifold
        return {"manifolds": Manifold.list_manifolds()}
    except ImportError:
        return {"manifolds": []}


# ---------------------------------------------------------------------------
# On-demand export API
# ---------------------------------------------------------------------------

class ExportRequest(BaseModel):
    res:   int   = 100
    scale: float = 1.0
    t:     float = 0.0
    sign:  bool  = True


@app.post("/api/export/{name}")
def export_manifold(name: str, req: ExportRequest) -> dict:
    """
    Re-export a registered manifold to static/{name}.json.
    Returns the output path and content hash.
    """
    try:
        from manifold_core import Manifold
        from export_three import export_to_json
    except ImportError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    manifold = Manifold._registry.get(name)
    if manifold is None:
        available = Manifold.list_manifolds()
        raise HTTPException(
            status_code=404,
            detail=f"Manifold '{name}' not found. Available: {available}",
        )

    out_path = export_to_json(
        manifold,
        path=str(STATIC_DIR / f"{name}.json"),
        res=req.res,
        scale=req.scale,
        t=req.t,
        sign=req.sign,
    )

    result: dict = {"path": str(out_path), "url": f"/static/{name}.json"}
    if req.sign:
        data = json.loads(out_path.read_bytes())
        result["hash"] = data.get("hash", "")

    return result


# ---------------------------------------------------------------------------
# Manifest integrity check (browser can call this to verify a JSON file)
# ---------------------------------------------------------------------------

@app.get("/api/verify/{name}")
def verify_manifest(name: str) -> dict:
    """
    Verify the SHA-256 hash embedded in a manifold JSON file.
    Returns {valid: bool, expected: str, actual: str}.
    """
    json_path = STATIC_DIR / f"{name}.json"
    if not json_path.exists():
        raise HTTPException(status_code=404, detail=f"{name}.json not found in static/")

    data = json.loads(json_path.read_bytes())
    stored_hash = data.get("hash", "")

    payload = json.dumps(
        {k: v for k, v in data.items() if k != "hash"},
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    computed = hashlib.sha256(payload).hexdigest()

    return {"valid": computed == stored_hash, "expected": stored_hash, "actual": computed}
