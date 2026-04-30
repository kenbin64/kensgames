from __future__ import annotations

import json
import math
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple


PRIORITY_SLA_HOURS = {
    "critical": 8,
    "express": 24,
    "standard": 72,
}

STATUS_FLOW = [
    "created",
    "allocated",
    "scheduled",
    "in_transit",
    "out_for_delivery",
    "delivered",
]


@dataclass
class Warehouse:
    id: str
    name: str
    lat: float
    lon: float
    inventory: Dict[str, int] = field(default_factory=dict)


@dataclass
class Vehicle:
    id: str
    name: str
    home_warehouse_id: str
    capacity_kg: float
    speed_kmph: float = 55.0
    active: bool = True


@dataclass
class Shipment:
    id: str
    customer: str
    destination_lat: float
    destination_lon: float
    items: Dict[str, int]
    weight_kg: float
    priority: str = "standard"
    status: str = "created"
    created_at: str = ""
    eta_at: str = ""
    required_by: str = ""
    allocations: List[Dict[str, object]] = field(default_factory=list)
    route: List[Dict[str, object]] = field(default_factory=list)
    vehicle_id: str = ""
    events: List[Dict[str, str]] = field(default_factory=list)


class StateStore:
    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def load(self) -> Dict[str, object]:
        with self._lock:
            if not self.path.exists():
                return {
                    "warehouses": [],
                    "vehicles": [],
                    "shipments": [],
                }
            return json.loads(self.path.read_text(encoding="utf-8"))

    def save(self, state: Dict[str, object]) -> None:
        with self._lock:
            self.path.write_text(json.dumps(state, indent=2), encoding="utf-8")


class LogisticsEngine:
    def __init__(self, state_file: str = "./data/state.json"):
        self.store = StateStore(Path(state_file))
        self.state = self.store.load()

    def _persist(self) -> None:
        self.store.save(self.state)

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(tz=timezone.utc).isoformat()

    @staticmethod
    def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        r = 6371.0
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(math.radians(lat1))
            * math.cos(math.radians(lat2))
            * math.sin(dlon / 2) ** 2
        )
        return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    def _warehouses(self) -> List[Warehouse]:
        return [Warehouse(**w) for w in self.state["warehouses"]]

    def _vehicles(self) -> List[Vehicle]:
        return [Vehicle(**v) for v in self.state["vehicles"]]

    def _shipments(self) -> List[Shipment]:
        return [Shipment(**s) for s in self.state["shipments"]]

    def add_warehouse(self, name: str, lat: float, lon: float) -> Warehouse:
        w = Warehouse(id=f"wh_{uuid.uuid4().hex[:10]}", name=name, lat=lat, lon=lon)
        self.state["warehouses"].append(asdict(w))
        self._persist()
        return w

    def stock_inventory(self, warehouse_id: str, sku: str, qty: int) -> Dict[str, object]:
        for w in self.state["warehouses"]:
            if w["id"] == warehouse_id:
                w.setdefault("inventory", {})
                w["inventory"][sku] = int(w["inventory"].get(sku, 0) + qty)
                self._persist()
                return w
        raise ValueError(f"Warehouse not found: {warehouse_id}")

    def add_vehicle(
        self,
        name: str,
        home_warehouse_id: str,
        capacity_kg: float,
        speed_kmph: float = 55.0,
    ) -> Vehicle:
        if not any(w["id"] == home_warehouse_id for w in self.state["warehouses"]):
            raise ValueError("home_warehouse_id does not exist")
        v = Vehicle(
            id=f"veh_{uuid.uuid4().hex[:10]}",
            name=name,
            home_warehouse_id=home_warehouse_id,
            capacity_kg=capacity_kg,
            speed_kmph=speed_kmph,
        )
        self.state["vehicles"].append(asdict(v))
        self._persist()
        return v

    def _find_shipment(self, shipment_id: str) -> Shipment:
        for s in self._shipments():
            if s.id == shipment_id:
                return s
        raise ValueError(f"Shipment not found: {shipment_id}")

    def _save_shipment(self, updated: Shipment) -> None:
        shipments = self.state["shipments"]
        for i, s in enumerate(shipments):
            if s["id"] == updated.id:
                shipments[i] = asdict(updated)
                self._persist()
                return
        raise ValueError(f"Shipment not found: {updated.id}")

    def create_shipment(
        self,
        customer: str,
        destination_lat: float,
        destination_lon: float,
        items: Dict[str, int],
        weight_kg: float,
        priority: str = "standard",
        required_by: str = "",
    ) -> Shipment:
        if priority not in PRIORITY_SLA_HOURS:
            raise ValueError("priority must be one of critical, express, standard")
        s = Shipment(
            id=f"shp_{uuid.uuid4().hex[:10]}",
            customer=customer,
            destination_lat=destination_lat,
            destination_lon=destination_lon,
            items=items,
            weight_kg=weight_kg,
            priority=priority,
            created_at=self._now_iso(),
            required_by=required_by,
            events=[{"at": self._now_iso(), "status": "created", "note": "Shipment created"}],
        )
        self.state["shipments"].append(asdict(s))
        self._persist()
        return s

    def _allocate_items(self, items: Dict[str, int], destination: Tuple[float, float]) -> List[Dict[str, object]]:
        warehouse_pool = self._warehouses()
        allocations = []
        remaining = dict(items)

        # Distance-prioritized allocation to minimize delivery time and cost.
        warehouse_pool.sort(
            key=lambda w: self._distance_km(w.lat, w.lon, destination[0], destination[1])
        )

        for sku, need in list(remaining.items()):
            for wh in warehouse_pool:
                available = int(wh.inventory.get(sku, 0))
                if available <= 0:
                    continue
                take = min(available, need)
                if take > 0:
                    allocations.append(
                        {
                            "warehouse_id": wh.id,
                            "warehouse_name": wh.name,
                            "sku": sku,
                            "qty": take,
                        }
                    )
                    wh.inventory[sku] = available - take
                    need -= take
                if need == 0:
                    break
            if need > 0:
                raise ValueError(f"Insufficient stock for sku: {sku}")

        # Commit inventory deltas to persisted state.
        warehouse_by_id = {w.id: w for w in warehouse_pool}
        for i, existing in enumerate(self.state["warehouses"]):
            obj = warehouse_by_id.get(existing["id"])
            if obj:
                self.state["warehouses"][i] = asdict(obj)
        self._persist()
        return allocations

    def _select_vehicle(self, warehouse_id: str, weight_kg: float) -> Vehicle:
        candidates = [
            v
            for v in self._vehicles()
            if v.active and v.home_warehouse_id == warehouse_id and v.capacity_kg >= weight_kg
        ]
        if not candidates:
            raise ValueError(f"No available vehicle with capacity for warehouse {warehouse_id}")
        candidates.sort(key=lambda v: (v.capacity_kg, -v.speed_kmph))
        return candidates[0]

    def plan_shipment(self, shipment_id: str) -> Shipment:
        shipment = self._find_shipment(shipment_id)
        if shipment.status not in {"created", "allocated"}:
            return shipment

        allocations = self._allocate_items(
            shipment.items, (shipment.destination_lat, shipment.destination_lon)
        )
        shipment.allocations = allocations
        shipment.status = "allocated"
        shipment.events.append(
            {"at": self._now_iso(), "status": "allocated", "note": "Inventory allocated"}
        )

        main_wh_id = allocations[0]["warehouse_id"]
        main_wh = next(w for w in self._warehouses() if w.id == main_wh_id)
        vehicle = self._select_vehicle(main_wh_id, shipment.weight_kg)
        shipment.vehicle_id = vehicle.id

        km = self._distance_km(
            main_wh.lat, main_wh.lon, shipment.destination_lat, shipment.destination_lon
        )
        drive_hours = km / max(vehicle.speed_kmph, 1)
        handling_hours = 1.2
        sla_hours = PRIORITY_SLA_HOURS[shipment.priority]
        eta_hours = min(sla_hours, drive_hours + handling_hours)

        eta = datetime.now(tz=timezone.utc) + timedelta(hours=eta_hours)
        shipment.eta_at = eta.isoformat()
        shipment.route = [
            {
                "leg": 1,
                "from": {"lat": main_wh.lat, "lon": main_wh.lon, "name": main_wh.name},
                "to": {
                    "lat": shipment.destination_lat,
                    "lon": shipment.destination_lon,
                    "name": shipment.customer,
                },
                "distance_km": round(km, 2),
                "eta_hours": round(eta_hours, 2),
            }
        ]
        shipment.status = "scheduled"
        shipment.events.append(
            {
                "at": self._now_iso(),
                "status": "scheduled",
                "note": f"Assigned vehicle {vehicle.name}",
            }
        )
        self._save_shipment(shipment)
        return shipment

    def update_status(self, shipment_id: str, status: str, note: str = "") -> Shipment:
        if status not in STATUS_FLOW:
            raise ValueError(f"status must be one of: {', '.join(STATUS_FLOW)}")
        shipment = self._find_shipment(shipment_id)
        shipment.status = status
        shipment.events.append(
            {
                "at": self._now_iso(),
                "status": status,
                "note": note or f"Status updated to {status}",
            }
        )
        self._save_shipment(shipment)
        return shipment

    def get_shipment(self, shipment_id: str) -> Shipment:
        return self._find_shipment(shipment_id)

    def list_shipments(self) -> List[Shipment]:
        return self._shipments()

    def optimize_daily_routes(self) -> Dict[str, object]:
        shipments = [s for s in self._shipments() if s.status in {"scheduled", "in_transit"}]
        groups: Dict[str, List[Shipment]] = {}

        for s in shipments:
            wh_id = s.allocations[0]["warehouse_id"] if s.allocations else "unknown"
            groups.setdefault(wh_id, []).append(s)

        summary = []
        total_distance = 0.0

        for wh_id, entries in groups.items():
            entries.sort(key=lambda s: PRIORITY_SLA_HOURS[s.priority])
            route_distance = 0.0
            if len(entries) > 1:
                for i in range(len(entries) - 1):
                    a = entries[i]
                    b = entries[i + 1]
                    route_distance += self._distance_km(
                        a.destination_lat,
                        a.destination_lon,
                        b.destination_lat,
                        b.destination_lon,
                    )
            total_distance += route_distance
            summary.append(
                {
                    "warehouse_id": wh_id,
                    "shipments": [s.id for s in entries],
                    "route_distance_km": round(route_distance, 2),
                }
            )

        return {
            "route_groups": summary,
            "total_estimated_km": round(total_distance, 2),
            "optimized_at": self._now_iso(),
        }

    def inventory_alerts(self, threshold: int = 10) -> List[Dict[str, object]]:
        alerts = []
        for w in self._warehouses():
            for sku, qty in w.inventory.items():
                if qty <= threshold:
                    alerts.append(
                        {
                            "warehouse_id": w.id,
                            "warehouse": w.name,
                            "sku": sku,
                            "qty": qty,
                            "recommended_restock": max(25, threshold * 3),
                        }
                    )
        return alerts

    def kpi_snapshot(self) -> Dict[str, object]:
        shipments = self._shipments()
        delivered = [s for s in shipments if s.status == "delivered"]
        on_time = 0
        for s in delivered:
            if not s.eta_at:
                continue
            delivered_at = next((e["at"] for e in reversed(s.events) if e["status"] == "delivered"), None)
            if delivered_at and delivered_at <= s.eta_at:
                on_time += 1

        return {
            "warehouses": len(self.state["warehouses"]),
            "vehicles": len(self.state["vehicles"]),
            "shipments_total": len(shipments),
            "shipments_active": len([s for s in shipments if s.status not in {"delivered"}]),
            "on_time_delivery_rate": round((on_time / len(delivered)) * 100, 2) if delivered else 0.0,
            "inventory_alerts": len(self.inventory_alerts()),
        }

    def dimensional_insights(self) -> Dict[str, object]:
        """
        X-dimensional score model:
        x = route distance (km)
        y = shipment weight (kg)
        z = x * y workload manifold
        """
        shipments = self._shipments()
        scored = []
        total_z = 0.0
        for s in shipments:
            route_km = float(s.route[0]["distance_km"]) if s.route else 0.0
            x = route_km
            y = float(s.weight_kg)
            z = round(x * y, 2)
            total_z += z
            scored.append(
                {
                    "shipment_id": s.id,
                    "customer": s.customer,
                    "status": s.status,
                    "x_distance_km": round(x, 2),
                    "y_weight_kg": round(y, 2),
                    "z_workload": z,
                    "priority": s.priority,
                }
            )

        scored.sort(key=lambda a: a["z_workload"], reverse=True)
        return {
            "model": "z = x * y",
            "workload_total": round(total_z, 2),
            "top_shipments": scored[:10],
        }

    def seed_demo_if_empty(self) -> Dict[str, object]:
        if self.state["warehouses"] and self.state["vehicles"]:
            return {
                "seeded": False,
                "reason": "Existing operational data present",
                "kpis": self.kpi_snapshot(),
            }

        wh1 = self.add_warehouse("Dallas Hub", 32.7767, -96.7970)
        wh2 = self.add_warehouse("Chicago Hub", 41.8781, -87.6298)

        self.stock_inventory(wh1.id, "SKU-ALPHA", 160)
        self.stock_inventory(wh1.id, "SKU-BETA", 110)
        self.stock_inventory(wh2.id, "SKU-ALPHA", 120)
        self.stock_inventory(wh2.id, "SKU-GAMMA", 90)

        self.add_vehicle("TX Van 01", wh1.id, 1200, 62)
        self.add_vehicle("TX Van 02", wh1.id, 800, 54)
        self.add_vehicle("IL Truck 01", wh2.id, 2400, 68)

        s = self.create_shipment(
            customer="Acme Retail East",
            destination_lat=33.7488,
            destination_lon=-84.3877,
            items={"SKU-ALPHA": 35, "SKU-BETA": 15},
            weight_kg=520,
            priority="express",
        )
        self.plan_shipment(s.id)

        return {"seeded": True, "kpis": self.kpi_snapshot()}
