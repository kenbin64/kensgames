from __future__ import annotations

import mimetypes
import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from engine import LogisticsEngine


BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR / "web"
THREE_FILE = BASE_DIR.parent / "lib" / "three" / "three.min.js"
ENGINE = LogisticsEngine(str(BASE_DIR / "data" / "state.json"))


def _json(handler: BaseHTTPRequestHandler, status: int, payload: dict):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):
    def _serve_static(self, path: str):
        if path == "/":
            path = "/index.html"
        file_path = (WEB_DIR / path.lstrip("/")).resolve()
        if WEB_DIR.resolve() not in file_path.parents and file_path != WEB_DIR.resolve():
            return _json(self, HTTPStatus.FORBIDDEN, {"error": "Forbidden"})
        if not file_path.exists() or not file_path.is_file():
            return _json(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})

        content = file_path.read_bytes()
        mime, _ = mimetypes.guess_type(str(file_path))
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mime or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_OPTIONS(self):
        _json(self, HTTPStatus.OK, {"ok": True})

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/health":
                return _json(self, HTTPStatus.OK, {"ok": True, "service": "logistics-engine"})

            if parsed.path == "/lib/three/three.min.js" and THREE_FILE.exists():
                content = THREE_FILE.read_bytes()
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "application/javascript")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return

            if parsed.path == "/kpis":
                return _json(self, HTTPStatus.OK, ENGINE.kpi_snapshot())

            if parsed.path == "/warehouses":
                return _json(self, HTTPStatus.OK, {"warehouses": [w.__dict__ for w in ENGINE._warehouses()]})

            if parsed.path == "/vehicles":
                return _json(self, HTTPStatus.OK, {"vehicles": [v.__dict__ for v in ENGINE._vehicles()]})

            if parsed.path == "/shipments":
                out = [s.__dict__ for s in ENGINE.list_shipments()]
                return _json(self, HTTPStatus.OK, {"shipments": out})

            if parsed.path.startswith("/shipments/"):
                sid = parsed.path.split("/")[-1]
                shipment = ENGINE.get_shipment(sid)
                return _json(self, HTTPStatus.OK, {"shipment": shipment.__dict__})

            if parsed.path == "/inventory/alerts":
                q = parse_qs(parsed.query)
                threshold = int(q.get("threshold", ["10"])[0])
                return _json(self, HTTPStatus.OK, {"alerts": ENGINE.inventory_alerts(threshold)})

            if parsed.path == "/routes/optimize":
                return _json(self, HTTPStatus.OK, ENGINE.optimize_daily_routes())

            if parsed.path == "/dimensional/insights":
                return _json(self, HTTPStatus.OK, ENGINE.dimensional_insights())

            return self._serve_static(parsed.path)
        except Exception as err:
            return _json(self, HTTPStatus.BAD_REQUEST, {"error": str(err)})

    def do_POST(self):
        try:
            parsed = urlparse(self.path)
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length > 0 else b"{}"
            data = json.loads(raw.decode("utf-8") or "{}")

            if parsed.path == "/warehouses":
                w = ENGINE.add_warehouse(data["name"], float(data["lat"]), float(data["lon"]))
                return _json(self, HTTPStatus.CREATED, {"warehouse": w.__dict__})

            if parsed.path == "/inventory/stock":
                out = ENGINE.stock_inventory(data["warehouse_id"], data["sku"], int(data["qty"]))
                return _json(self, HTTPStatus.OK, {"warehouse": out})

            if parsed.path == "/demo/seed":
                result = ENGINE.seed_demo_if_empty()
                return _json(self, HTTPStatus.OK, result)

            if parsed.path == "/vehicles":
                v = ENGINE.add_vehicle(
                    data["name"],
                    data["home_warehouse_id"],
                    float(data["capacity_kg"]),
                    float(data.get("speed_kmph", 55.0)),
                )
                return _json(self, HTTPStatus.CREATED, {"vehicle": v.__dict__})

            if parsed.path == "/shipments":
                s = ENGINE.create_shipment(
                    customer=data["customer"],
                    destination_lat=float(data["destination_lat"]),
                    destination_lon=float(data["destination_lon"]),
                    items=data["items"],
                    weight_kg=float(data["weight_kg"]),
                    priority=data.get("priority", "standard"),
                    required_by=data.get("required_by", ""),
                )
                return _json(self, HTTPStatus.CREATED, {"shipment": s.__dict__})

            if parsed.path.startswith("/shipments/") and parsed.path.endswith("/plan"):
                sid = parsed.path.split("/")[2]
                s = ENGINE.plan_shipment(sid)
                return _json(self, HTTPStatus.OK, {"shipment": s.__dict__})

            if parsed.path.startswith("/shipments/") and parsed.path.endswith("/status"):
                sid = parsed.path.split("/")[2]
                s = ENGINE.update_status(sid, data["status"], data.get("note", ""))
                return _json(self, HTTPStatus.OK, {"shipment": s.__dict__})

            return _json(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
        except Exception as err:
            return _json(self, HTTPStatus.BAD_REQUEST, {"error": str(err)})


def run(host: str = "0.0.0.0", port: int = 8090):
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"logistics-engine listening on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
