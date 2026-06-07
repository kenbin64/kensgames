# Logical Logistics Engine

**A complete logistics engine in pure Python. Warehouses, fleet, shipments, allocation, ETAs, and live KPIs, running entirely on your own machine with zero dependencies.**

## The problem

Logistics and inventory software is usually heavyweight SaaS: you upload your operational data to a vendor's cloud, pay per seat, and cannot see how allocation, routing, or ETA decisions are actually made. For learning, prototyping, or running a small operation, that is overkill, opaque, and a privacy risk. The logic that decides where your stock goes and when it arrives is the one thing you cannot inspect.

## The solution

A working logistics engine you run locally:

- Warehouse and inventory management
- Vehicle fleet management
- Shipment creation and planning
- Inventory allocation to the nearest feasible warehouse
- ETA and SLA-aware scheduling
- Tracking event timeline, route-optimization summary, and inventory alerts
- A live KPI HTTP API and a web dashboard

## Why you need this

- **A real, inspectable reference.** See exactly how allocation, ETA, and SLA logic work in readable Python ([engine.py](engine.py)), not a black-box API.
- **No vendor, no account, no per-seat cost.** It runs on a laptop.
- **Your operational data stays yours,** in a plain JSON file you can open, read, and back up.

## Why trust this

- **Pure Python standard library.** The engine ([engine.py](engine.py)) and API ([api.py](api.py)) import only stdlib (`json`, `http.server`, `math`, `datetime`, and friends). No third-party packages to vet, nothing to install, nothing phoning home.
- **It runs only on your machine.** The HTTP server is a local listener, and the dashboard talks only to that local engine. No outbound data, no telemetry, no accounts.
- **Your data is a file you control.** All state lives in [data/state.json](data/state.json). Open it, read it, back it up, or delete it.
- **Honest note:** the optional 3D dashboard ([web/index.html](web/index.html)) loads the Three.js library and a web font from public CDNs for visuals only. The engine and API need neither, and every number you see comes from your local engine. Vendor those two files locally to run the dashboard fully offline.
- **Open to inspect.** Every line is readable Python and JavaScript. Nothing is compiled or hidden.

## Run it

```bash
# from this folder
cd logistics-engine
python seed_demo.py     # create demo warehouses, stock, vehicles, and shipments
python api.py           # start the local engine + dashboard
# then open http://localhost:8090/
```

## Core API

- `GET /health`
- `GET /kpis`
- `GET /shipments`
- `GET /shipments/{id}`
- `GET /inventory/alerts?threshold=10`
- `GET /routes/optimize`
- `POST /warehouses`
- `POST /inventory/stock`
- `POST /vehicles`
- `POST /shipments`
- `POST /shipments/{id}/plan`
- `POST /shipments/{id}/status`

## Example shipment flow

1. Create warehouse(s)
2. Stock inventory SKU quantities
3. Add vehicles bound to warehouses
4. Create a shipment with customer, items, and destination
5. Plan the shipment to allocate stock, assign a vehicle, and calculate ETA
6. Update status through the transit lifecycle

## Data storage

All state is persisted to a single file you own: `logistics-engine/data/state.json`.

## Note

This is a portfolio demonstration of a clean, self-contained, dependency-free engine with transparent decision logic, not a commercial product. The point is that you can read exactly how every logistics decision is made.
