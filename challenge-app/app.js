const STORAGE_KEY = "dealforge.v1";

const STAGE_WEIGHTS = {
  lead: 0.1,
  qualified: 0.35,
  proposal: 0.6,
  negotiation: 0.8,
  closed: 1,
};

const STAGE_LABEL = {
  lead: "Lead",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  closed: "Closed",
};

const state = {
  quoteItems: [],
  discountPct: 0,
  taxPct: 0,
  deliveryCost: 0,
  deals: [],
  roi: {
    clientCost: 0,
    clientSavings: 0,
    months: 12,
  },
};

const $ = id => document.getElementById(id);
const currency = n =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number.isFinite(n) ? n : 0);
const pct = n => `${(n * 100).toFixed(1)}%`;

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      Object.assign(state, parsed);
    }
  } catch (err) {
    console.warn("Unable to parse saved state", err);
  }
}

function quoteTotals() {
  const subtotal = state.quoteItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const discount = subtotal * (state.discountPct / 100);
  const discounted = Math.max(0, subtotal - discount);
  const tax = discounted * (state.taxPct / 100);
  const total = discounted + tax;
  const profit = total - state.deliveryCost;
  const margin = total > 0 ? profit / total : 0;
  return { subtotal, discount, discounted, tax, total, profit, margin };
}

function pipelineTotals() {
  const total = state.deals.reduce((sum, d) => sum + d.value, 0);
  const weighted = state.deals.reduce((sum, d) => sum + d.value * (STAGE_WEIGHTS[d.stage] || 0), 0);
  const winRate = total > 0 ? weighted / total : 0;
  return { total, weighted, winRate };
}

function renderQuoteRows() {
  const tbody = $("quoteRows");
  tbody.innerHTML = "";
  state.quoteItems.forEach((item, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.qty}</td>
      <td>${currency(item.unitPrice)}</td>
      <td>${currency(item.qty * item.unitPrice)}</td>
      <td><button class="remove" data-remove-quote="${i}">Remove</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderQuoteKpis() {
  const { subtotal, total, profit, margin } = quoteTotals();
  $("subtotalKpi").textContent = currency(subtotal);
  $("totalKpi").textContent = currency(total);
  $("profitKpi").textContent = currency(profit);
  $("marginKpi").textContent = pct(margin);
}

function renderDeals() {
  const list = $("dealList");
  list.innerHTML = "";
  state.deals.forEach((deal, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <strong>${deal.name}</strong>
        <div class="muted">${currency(deal.value)} • <span class="badge">${STAGE_LABEL[deal.stage]}</span></div>
      </div>
      <button class="remove" data-remove-deal="${i}">Delete</button>
    `;
    list.appendChild(li);
  });
}

function renderPipelineKpis() {
  const totals = pipelineTotals();
  $("pipeTotal").textContent = currency(totals.total);
  $("pipeWeighted").textContent = currency(totals.weighted);
  $("winRate").textContent = pct(totals.winRate);
  $("activeDeals").textContent = String(state.deals.length);
}

function renderRoi() {
  const quote = quoteTotals();
  const months = Math.max(1, Number(state.roi.months || 12));
  const savings = Math.max(0, Number(state.roi.clientSavings || 0));
  const investment = quote.total;
  const gain = Math.max(0, savings * months - investment);
  const roiValue = investment > 0 ? gain / investment : 0;
  const paybackMonths = savings > 0 ? investment / savings : Infinity;

  const output = Number.isFinite(paybackMonths)
    ? `Projected gain over ${months} months: ${currency(gain)}. ROI: ${pct(roiValue)}. Payback period: ${paybackMonths.toFixed(1)} months.`
    : "No monthly savings entered yet, so payback period cannot be computed.";

  $("roiOutput").textContent = output;
}

function renderAll() {
  renderQuoteRows();
  renderQuoteKpis();
  renderDeals();
  renderPipelineKpis();
  renderRoi();
  persist();
}

function seedDemoData() {
  state.quoteItems = [
    { name: "Onboarding Sprint", qty: 1, unitPrice: 2400 },
    { name: "Automation Workflow Build", qty: 2, unitPrice: 1800 },
    { name: "Monthly Optimization Retainer", qty: 3, unitPrice: 1200 },
  ];
  state.discountPct = 7;
  state.taxPct = 8;
  state.deliveryCost = 3200;
  state.deals = [
    { name: "Northwind RevOps", value: 15000, stage: "proposal" },
    { name: "Bayside Logistics", value: 9000, stage: "qualified" },
    { name: "Evergreen Medical", value: 22000, stage: "negotiation" },
  ];
  state.roi = {
    clientCost: 18000,
    clientSavings: 3200,
    months: 12,
  };
  syncInputs();
  renderAll();
}

function syncInputs() {
  $("discount").value = state.discountPct;
  $("tax").value = state.taxPct;
  $("cost").value = state.deliveryCost;
  $("clientCost").value = state.roi.clientCost;
  $("clientSavings").value = state.roi.clientSavings;
  $("roiMonths").value = state.roi.months;
}

function bindEvents() {
  $("quoteForm").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("quoteName").value.trim();
    const qty = Number($("quoteQty").value);
    const unitPrice = Number($("quotePrice").value);
    if (!name || qty <= 0 || unitPrice < 0) return;
    state.quoteItems.push({ name, qty, unitPrice });
    e.target.reset();
    $("quoteQty").value = 1;
    renderAll();
  });

  ["discount", "tax", "cost"].forEach(id => {
    $(id).addEventListener("input", e => {
      const v = Number(e.target.value || 0);
      if (id === "discount") state.discountPct = Math.max(0, v);
      if (id === "tax") state.taxPct = Math.max(0, v);
      if (id === "cost") state.deliveryCost = Math.max(0, v);
      renderAll();
    });
  });

  ["clientCost", "clientSavings", "roiMonths"].forEach(id => {
    $(id).addEventListener("input", e => {
      const v = Number(e.target.value || 0);
      if (id === "clientCost") state.roi.clientCost = Math.max(0, v);
      if (id === "clientSavings") state.roi.clientSavings = Math.max(0, v);
      if (id === "roiMonths") state.roi.months = Math.max(1, v);
      renderAll();
    });
  });

  $("quoteRows").addEventListener("click", e => {
    const idx = e.target.getAttribute("data-remove-quote");
    if (idx == null) return;
    state.quoteItems.splice(Number(idx), 1);
    renderAll();
  });

  $("dealForm").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("dealName").value.trim();
    const value = Number($("dealValue").value);
    const stage = $("dealStage").value;
    if (!name || value < 0 || !STAGE_WEIGHTS[stage]) return;
    state.deals.push({ name, value, stage });
    e.target.reset();
    renderAll();
  });

  $("dealList").addEventListener("click", e => {
    const idx = e.target.getAttribute("data-remove-deal");
    if (idx == null) return;
    state.deals.splice(Number(idx), 1);
    renderAll();
  });

  $("seedBtn").addEventListener("click", seedDemoData);

  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dealforge-data.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  $("importInput").addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") return;
      Object.assign(state, parsed);
      syncInputs();
      renderAll();
    } catch (err) {
      alert("Could not import that file.");
    }
  });
}

load();
syncInputs();
bindEvents();
renderAll();
