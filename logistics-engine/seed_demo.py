from engine import LogisticsEngine


def seed():
    eng = LogisticsEngine("./data/state.json")

    if not eng.state["warehouses"]:
        wh1 = eng.add_warehouse("Dallas Hub", 32.7767, -96.7970)
        wh2 = eng.add_warehouse("Chicago Hub", 41.8781, -87.6298)

        eng.stock_inventory(wh1.id, "SKU-ALPHA", 160)
        eng.stock_inventory(wh1.id, "SKU-BETA", 110)
        eng.stock_inventory(wh2.id, "SKU-ALPHA", 120)
        eng.stock_inventory(wh2.id, "SKU-GAMMA", 90)

        eng.add_vehicle("TX Van 01", wh1.id, 1200, 62)
        eng.add_vehicle("TX Van 02", wh1.id, 800, 54)
        eng.add_vehicle("IL Truck 01", wh2.id, 2400, 68)

    s = eng.create_shipment(
        customer="Acme Retail East",
        destination_lat=33.7488,
        destination_lon=-84.3877,
        items={"SKU-ALPHA": 35, "SKU-BETA": 15},
        weight_kg=520,
        priority="express",
    )

    planned = eng.plan_shipment(s.id)
    eng.update_status(planned.id, "in_transit", "Loaded at dock 7")

    print("Seed complete")
    print(f"Shipment: {planned.id} ETA={planned.eta_at}")
    print("KPIs:", eng.kpi_snapshot())


if __name__ == "__main__":
    seed()
