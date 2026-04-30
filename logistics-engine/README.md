# Logical Logistics Engine

Complete logistics engine with:

- Warehouse and inventory management
- Vehicle fleet management
- Shipment creation and planning
- Inventory allocation by nearest feasible warehouse
- ETA and SLA-aware scheduling
- Tracking event timeline
- Route optimization summary
- Inventory alerting
- Live KPI API and professional web front-end

## Quick start

```bash
cd /home/butterfly/apps/kensgames-portal/logistics-engine
python3 seed_demo.py
python3 api.py
```

Open in browser:

- http://localhost:8090/

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
4. Create shipment with customer, items, destination
5. Plan shipment to allocate stock + assign vehicle + calculate ETA
6. Update status through transit lifecycle

## Data storage

State is persisted to:

- `logistics-engine/data/state.json`
