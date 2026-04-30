const STATUS_FLOW = [
  "created",
  "allocated",
  "scheduled",
  "in_transit",
  "out_for_delivery",
  "delivered",
];

const $ = id => document.getElementById(id);

function parseItems(raw) {
  const items = {};
  String(raw || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(part => {
      const [sku, qty] = part.split(":").map(x => x.trim());
      if (!sku) return;
      const n = Number(qty || 0);
      if (n > 0) items[sku] = n;
    });
  return items;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "request failed");
  return body;
}

function nextStatus(current) {
  const idx = STATUS_FLOW.indexOf(current);
  if (idx < 0 || idx >= STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[idx + 1];
}

function setResult(message, isError = false) {
  const el = $("actionResult");
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#991b1b" : "#475569";
}

async function loadKpis() {
  try {
    const k = await api("/kpis");
    $("kpiShipments").textContent = String(k.shipments_total ?? 0);
    $("kpiActive").textContent = String(k.shipments_active ?? 0);
    $("kpiOnTime").textContent = `${Number(k.on_time_delivery_rate ?? 0).toFixed(1)}%`;
    $("kpiAlerts").textContent = String(k.inventory_alerts ?? 0);
  } catch (_err) {
    $("kpiShipments").textContent = "-";
    $("kpiActive").textContent = "-";
    $("kpiOnTime").textContent = "-";
    $("kpiAlerts").textContent = "-";
  }
}

function renderWarehouseSelects(warehouses) {
  const html = warehouses
    .map(w => `<option value="${w.id}">${w.name} (${w.id})</option>`)
    .join("");
  $("stockWarehouse").innerHTML = html || "<option value=''>No warehouses</option>";
  $("vehWarehouse").innerHTML = html || "<option value=''>No warehouses</option>";
}

function renderShipments(shipments) {
  const board = $("shipmentsBoard");
  if (!shipments.length) {
    board.innerHTML = '<div class="result-box">No shipments yet. Create one above.</div>';
    return;
  }
  board.innerHTML = shipments
    .map(s => {
      const nxt = nextStatus(s.status);
      const eta = s.eta_at ? new Date(s.eta_at).toLocaleString() : "Pending planning";
      return `
        <article class="shipment-card" data-id="${s.id}" data-priority="${s.priority}">
          <div class="shipment-head">
            <strong>${s.customer}</strong>
            <span class="badge" data-status="${s.status}">${s.status}</span>
          </div>
          <div class="shipment-meta">ID: ${s.id} • Priority: ${s.priority} • Weight: ${s.weight_kg} kg</div>
          <div class="shipment-meta">ETA: ${eta}</div>
          <div class="shipment-actions">
            <button data-action="plan" data-id="${s.id}">Plan</button>
            ${nxt ? `<button data-action="advance" data-status="${nxt}" data-id="${s.id}">Mark ${nxt}</button>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderDimensional(insights) {
  $("dimensionalTotal").textContent = `Total workload (z sum): ${Number(insights.workload_total || 0).toFixed(2)}`;
  const list = insights.top_shipments || [];
  $("dimensionalList").innerHTML = list.length
    ? list
      .map(
        d => `
      <div class="dim-item">
        <strong>${d.customer}</strong>
        <div class="shipment-meta">${d.shipment_id} • ${d.status}</div>
        <div class="shipment-meta">x(distance): ${d.x_distance_km} • y(weight): ${d.y_weight_kg} • z: ${d.z_workload}</div>
      </div>`
      )
      .join("")
    : '<div class="result-box">No dimensional insights yet.</div>';

  // Feed the 3D manifold panel with live workload points.
  window.dispatchEvent(
    new CustomEvent("manifold:insights", {
      detail: {
        workloadTotal: Number(insights.workload_total || 0),
        points: list,
      },
    })
  );
}

async function refreshData() {
  const [warehousesResp, shipmentsResp, dimsResp] = await Promise.all([
    api("/warehouses"),
    api("/shipments"),
    api("/dimensional/insights"),
  ]);
  renderWarehouseSelects(warehousesResp.warehouses || []);
  renderShipments(shipmentsResp.shipments || []);
  renderDimensional(dimsResp || {});
  await loadKpis();
}

function bindTopUi() {
  const navbar = $("navbar");
  if (navbar) {
    const updateNav = () => {
      navbar.classList.toggle("scrolled", window.scrollY > 12);
    };
    window.addEventListener("scroll", updateNav, { passive: true });
    updateNav();
  }

  const tabs = Array.from(document.querySelectorAll(".ftab"));
  const panels = Array.from(document.querySelectorAll(".ftab-panel"));
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const key = tab.getAttribute("data-tab");
      tabs.forEach(t => t.classList.remove("active"));
      panels.forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const panel = $(`ftab-${key}`);
      if (panel) panel.classList.add("active");
    });
  });

  const seedFromHero = async () => {
    try {
      const out = await api("/demo/seed", { method: "POST", body: JSON.stringify({}) });
      setResult(out.seeded ? "Demo data seeded." : out.reason || "Seed skipped.");
      await refreshData();
      const ops = $("operations");
      if (ops) ops.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      setResult(err.message, true);
    }
  };

  const seedHeroBtn = $("seedHeroBtn");
  if (seedHeroBtn) seedHeroBtn.addEventListener("click", seedFromHero);
  const seedHeroBtn2 = $("seedHeroBtn2");
  if (seedHeroBtn2) seedHeroBtn2.addEventListener("click", seedFromHero);
}

function bindEvents() {
  $("warehouseForm").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      await api("/warehouses", {
        method: "POST",
        body: JSON.stringify({
          name: $("whName").value.trim(),
          lat: Number($("whLat").value),
          lon: Number($("whLon").value),
        }),
      });
      e.target.reset();
      setResult("Warehouse created.");
      await refreshData();
    } catch (err) {
      setResult(err.message, true);
    }
  });

  $("stockForm").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      await api("/inventory/stock", {
        method: "POST",
        body: JSON.stringify({
          warehouse_id: $("stockWarehouse").value,
          sku: $("stockSku").value.trim(),
          qty: Number($("stockQty").value),
        }),
      });
      e.target.reset();
      setResult("Inventory stocked.");
      await refreshData();
    } catch (err) {
      setResult(err.message, true);
    }
  });

  $("vehicleForm").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      await api("/vehicles", {
        method: "POST",
        body: JSON.stringify({
          name: $("vehName").value.trim(),
          home_warehouse_id: $("vehWarehouse").value,
          capacity_kg: Number($("vehCapacity").value),
          speed_kmph: Number($("vehSpeed").value),
        }),
      });
      e.target.reset();
      setResult("Vehicle created.");
      await refreshData();
    } catch (err) {
      setResult(err.message, true);
    }
  });

  $("shipmentForm").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      const items = parseItems($("shItems").value);
      if (!Object.keys(items).length) throw new Error("Enter items as SKU:qty,SKU2:qty");
      await api("/shipments", {
        method: "POST",
        body: JSON.stringify({
          customer: $("shCustomer").value.trim(),
          destination_lat: Number($("shLat").value),
          destination_lon: Number($("shLon").value),
          items,
          weight_kg: Number($("shWeight").value),
          priority: $("shPriority").value,
        }),
      });
      e.target.reset();
      setResult("Shipment created.");
      await refreshData();
    } catch (err) {
      setResult(err.message, true);
    }
  });

  $("shipmentsBoard").addEventListener("click", async e => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    const action = btn.getAttribute("data-action");
    try {
      if (action === "plan") {
        await api(`/shipments/${id}/plan`, { method: "POST", body: JSON.stringify({}) });
        setResult(`Shipment ${id} planned.`);
      }
      if (action === "advance") {
        const status = btn.getAttribute("data-status");
        await api(`/shipments/${id}/status`, {
          method: "POST",
          body: JSON.stringify({ status, note: `Moved to ${status} from control tower` }),
        });
        setResult(`Shipment ${id} moved to ${status}.`);
      }
      await refreshData();
    } catch (err) {
      setResult(err.message, true);
    }
  });

  $("seedBtn").addEventListener("click", async () => {
    try {
      const out = await api("/demo/seed", { method: "POST", body: JSON.stringify({}) });
      setResult(out.seeded ? "Demo data seeded." : out.reason || "Seed skipped.");
      await refreshData();
    } catch (err) {
      setResult(err.message, true);
    }
  });

  $("optimizeBtn").addEventListener("click", async () => {
    try {
      const out = await api("/routes/optimize");
      setResult(`Route optimization complete. Total estimated km: ${out.total_estimated_km}`);
    } catch (err) {
      setResult(err.message, true);
    }
  });
}

bindTopUi();
bindEvents();
refreshData().catch(err => setResult(err.message, true));
setInterval(() => {
  refreshData().catch(() => { });
}, 15000);
