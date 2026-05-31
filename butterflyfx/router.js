// AI Model Router — Schwarz D minimal surface decision boundary.
// Maps request signals (complexity, stakes, context) to a model tier in a
// catalog, choosing the cheapest tier whose quality clears a surface-derived
// threshold. Plain script: attaches to window.SchwarzRouter in the browser
// and exports for CommonJS in Node.
(function (root) {
  'use strict';

  const TAU = 2 * Math.PI;

  // Schwarz D triply-periodic minimal surface.
  // F(x,y,z) = 0 partitions 3-space into two congruent labyrinths of equal
  // volume with maximum interface area per unit volume — the canonical
  // "most boundary per gram of material" surface in topology optimization.
  // Range over a unit cell: roughly [-1.5, 1.5].
  function schwarzD(x, y, z) {
    return (
      Math.sin(x) * Math.sin(y) * Math.sin(z) +
      Math.sin(x) * Math.cos(y) * Math.cos(z) +
      Math.cos(x) * Math.sin(y) * Math.cos(z) +
      Math.cos(x) * Math.cos(y) * Math.sin(z)
    );
  }

  // Generic tier catalog. Replace with named models in production
  // (see catalog.example.json).
  // capabilities: vision, tools, code, embed, local, audited_pii.
  const DEFAULT_CATALOG = [
    { name: 'nano',     quality: 0.20, cost_per_1k: 0.0001, latency_p50: 200,  max_context: 8000,
      capabilities: { vision: false, tools: false, code: false, embed: true,  local: true,  audited_pii: false } },
    { name: 'small',    quality: 0.40, cost_per_1k: 0.0005, latency_p50: 400,  max_context: 32000,
      capabilities: { vision: false, tools: true,  code: true,  embed: false, local: false, audited_pii: true  } },
    { name: 'mid',      quality: 0.60, cost_per_1k: 0.003,  latency_p50: 800,  max_context: 128000,
      capabilities: { vision: true,  tools: true,  code: true,  embed: false, local: false, audited_pii: true  } },
    { name: 'large',    quality: 0.80, cost_per_1k: 0.015,  latency_p50: 1600, max_context: 200000,
      capabilities: { vision: true,  tools: true,  code: true,  embed: false, local: false, audited_pii: true  } },
    { name: 'frontier', quality: 0.95, cost_per_1k: 0.075,  latency_p50: 3200, max_context: 1000000,
      capabilities: { vision: true,  tools: true,  code: true,  embed: false, local: false, audited_pii: true  } }
  ];

  function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }

  // Compute a required quality in [0,1] from three normalized signals via
  // the Schwarz D surface. Signals map to angles in [0, TAU]; F is evaluated;
  // |F| (distance "into" a lobe) modulates a weighted base demand.
  // Stakes weigh heaviest — being wrong is usually more expensive than
  // thinking harder.
  function qualityThreshold(signals) {
    const c = clamp01(signals.complexity);
    const s = clamp01(signals.stakes);
    const k = clamp01(signals.context);

    const base = 0.20 * c + 0.55 * s + 0.25 * k;
    const F = schwarzD(c * TAU, s * TAU, k * TAU);
    const surfaceTerm = Math.abs(F) / 1.5;

    return clamp01(base * 0.6 + surfaceTerm * 0.4);
  }

  function estimateCost(tier, tokens) {
    const n = tokens || 1000;
    return (n / 1000) * tier.cost_per_1k;
  }

  // --- Logic gates -------------------------------------------------------
  // Primitive booleans the constraint table is built from. Kept explicit
  // so the truth-table rows below read like a circuit diagram.
  const Gates = {
    AND:  (a, b) => Boolean(a) && Boolean(b),
    OR:   (a, b) => Boolean(a) || Boolean(b),
    NOT:  (a)    => !Boolean(a),
    XOR:  (a, b) => Boolean(a) !== Boolean(b),
    NAND: (a, b) => !(Boolean(a) && Boolean(b)),
    IMPL: (a, b) => !Boolean(a) || Boolean(b)  // a → b
  };

  // --- Truth table: flag → required tier capability ----------------------
  // Each row is (predicate over flags) → (predicate over tier.capabilities).
  // The constraint filter accepts a tier iff every row evaluates to true.
  // Read as an AND of implications: flag_present → tier_supports.
  const CONSTRAINT_TABLE = [
    { name: 'vision',     when: f => f.needs_vision,    require: c => c.vision },
    { name: 'tools',      when: f => f.needs_tools,     require: c => c.tools },
    { name: 'code-exec',  when: f => f.needs_code,      require: c => c.code },
    { name: 'embed-only', when: f => f.kind === 'embedding', require: c => c.embed },
    { name: 'offline',    when: f => f.must_be_offline, require: c => c.local },
    { name: 'pii',        when: f => f.contains_pii,    require: c => Gates.OR(c.local, c.audited_pii) }
  ];

  // Apply the truth table as a chain of AND'd implications.
  // Returns { eligible, violations } where eligible is the filtered catalog.
  function applyConstraints(catalog, flags) {
    const f = flags || {};
    const violations = [];
    const eligible = catalog.filter(tier => {
      for (const row of CONSTRAINT_TABLE) {
        if (!Gates.IMPL(row.when(f), row.require(tier.capabilities || {}))) {
          violations.push({ tier: tier.name, rule: row.name });
          return false;
        }
      }
      return true;
    });
    return { eligible, violations };
  }

  // --- Regex pre-filter: cheap deterministic classifier ------------------
  // Runs before any model is consulted. When the caller passes raw request
  // text, these patterns infer flags (kind, needs_code, needs_vision,
  // needs_tools, contains_pii) without spending a single token on an LLM.
  // Explicit caller-supplied flags always win; regex only fills gaps.
  const REGEX_PATTERNS = [
    { flag: 'kind',         value: 'embedding',     re: /\b(embed|embedding|vector(ize)?|cosine|nearest neighbor)\b/i },
    { flag: 'kind',         value: 'classification',re: /\b(classify|categorize|label|tag|sentiment|intent)\b/i },
    { flag: 'needs_code',   value: true,            re: /```|\bfunction\s+\w+\(|\bclass\s+\w+|\bdef\s+\w+\(|^\s*(import|from)\s+\w+/m },
    { flag: 'needs_vision', value: true,            re: /\b(image|screenshot|photo|diagram|chart|ocr|png|jpe?g|svg|webp)\b/i },
    { flag: 'needs_tools',  value: true,            re: /\b(call (the )?api|run (the )?tool|execute|invoke|http (get|post|put|delete))\b/i },
    { flag: 'contains_pii', value: true,            re: /\b(ssn|social security|\d{3}-\d{2}-\d{4}|credit card|\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4}|patient (id|record)|mrn)\b/i },
    { flag: 'must_be_offline', value: true,         re: /\b(offline|air[ -]?gapped|on[ -]?prem|local only|no cloud)\b/i },
    { flag: 'irreversible_action', value: true,     re: /\b(deploy|push to (prod|main)|drop table|rm -rf|delete from|migrate)\b/i }
  ];

  // Returns a flags object inferred from text. Caller-supplied flags
  // override any inference. Empty/missing text → returns existing flags.
  function inferFlagsFromText(text, existing) {
    const out = Object.assign({}, existing || {});
    if (!text || typeof text !== 'string') return out;
    for (const p of REGEX_PATTERNS) {
      if (out[p.flag] !== undefined && out[p.flag] !== null && out[p.flag] !== '') continue;
      if (p.re.test(text)) out[p.flag] = p.value;
    }
    return out;
  }

  // --- Decision tree: categorical shortcuts ------------------------------
  // Hard yes/no questions that short-circuit the continuous pipeline when
  // the answer is obvious. Each node returns either a tier name (terminal)
  // or null (descend to the next layer).
  function decisionTreeShortcut(request, eligible) {
    const f = request.flags || {};
    if (f.kind === 'embedding') {
      const t = eligible.find(x => x.capabilities && x.capabilities.embed);
      if (t) return { tier: t, branch: 'kind=embedding → embed-capable tier' };
    }
    if (f.kind === 'classification' && (request.complexity || 0) < 0.15) {
      const cheapest = [...eligible].sort((a, b) => a.cost_per_1k - b.cost_per_1k)[0];
      if (cheapest) return { tier: cheapest, branch: 'trivial classification → cheapest eligible' };
    }
    if (f.must_be_offline) {
      const local = eligible
        .filter(x => x.capabilities && x.capabilities.local)
        .sort((a, b) => b.quality - a.quality)[0];
      if (local) return { tier: local, branch: 'must_be_offline → best local tier' };
    }
    return null;
  }

  // --- Manifold demand (Tiresias z = x·y²) -------------------------------
  // Continuous demand score on the y=stakes² manifold from the doctrine.
  // Stakes dominate quadratically; complexity is the linear modulator;
  // context is folded in as an additive load term.
  function manifoldDemand(signals) {
    const c = clamp01(signals.complexity);
    const s = clamp01(signals.stakes);
    const k = clamp01(signals.context);
    return clamp01(c * s * s + 0.25 * k);
  }

  // --- Main router: integrated six-layer pipeline ------------------------
  // 1. regex pre-filter                (cheap deterministic flag inference)
  // 2. truth-table constraint filter   (logic gates, hard)
  // 3. decision-tree shortcut          (categorical, terminal-or-pass)
  // 4. manifold demand                 (Tiresias z = x·y², continuous)
  // 5. Schwarz-D surface threshold     (cost/quality boundary)
  // 6. cheapest-eligible selection     (greedy on filtered candidates)
  function route(signals, catalog, opts) {
    const cat = catalog || DEFAULT_CATALOG;
    const o = opts || {};
    const tokens = o.tokens || 1000;
    const required_context = o.required_context || 0;
    const flags = inferFlagsFromText(o.text, o.flags || {});
    const request = Object.assign({}, signals, { flags: flags });

    const constrained = applyConstraints(cat, flags);
    const eligible = constrained.eligible.filter(t => t.max_context >= required_context);
    const pool = eligible.length ? eligible : [...cat].sort((a, b) => b.quality - a.quality).slice(0, 1);

    const shortcut = decisionTreeShortcut(request, pool);
    const demand = manifoldDemand(signals);
    const surfaceThresh = qualityThreshold(signals);
    const threshold = Math.max(demand, surfaceThresh);
    const F = schwarzD(
      clamp01(signals.complexity) * TAU,
      clamp01(signals.stakes) * TAU,
      clamp01(signals.context) * TAU
    );

    let chosen, path;
    if (shortcut) {
      chosen = shortcut.tier;
      path = 'tree:' + shortcut.branch;
    } else {
      const byCost = [...pool].sort((a, b) => a.cost_per_1k - b.cost_per_1k);
      chosen = byCost.find(t => t.quality >= threshold)
            || [...pool].sort((a, b) => b.quality - a.quality)[0];
      path = 'surface: manifold=' + demand.toFixed(2) +
             ' schwarzD=' + surfaceThresh.toFixed(2) +
             ' → threshold=' + threshold.toFixed(2);
    }

    return {
      tier: chosen.name,
      model: chosen,
      threshold: threshold,
      manifold_demand: demand,
      F_value: F,
      path: path,
      violations: constrained.violations,
      cost_estimate: estimateCost(chosen, tokens),
      reasoning: explain(signals, threshold, F, chosen, path)
    };
  }

  // --- Determination graph: ordered execution plan -----------------------
  // Resolves a request into a DAG of steps (retrieve → answer → verify).
  // Each step is routed independently so retrieval can use a cheap embed
  // tier while answer/verify use the surface-selected tier.
  function plan(request, catalog) {
    const cat = catalog || DEFAULT_CATALOG;
    const flags = inferFlagsFromText(request.text, request.flags || {});
    const text = request.text;
    const steps = [];
    if (flags.needs_retrieval) {
      steps.push({ step: 'retrieve', route: route(
        { complexity: 0.1, stakes: 0.1, context: 0.2 },
        cat, { flags: { kind: 'embedding' }, tokens: 256 })
      });
    }
    steps.push({ step: 'answer', route: route(request, cat, { flags: flags, text: text, tokens: request.tokens }) });
    if ((request.stakes || 0) >= 0.7 || flags.irreversible_action) {
      steps.push({ step: 'verify', route: route(
        { complexity: request.complexity, stakes: Math.min(1, (request.stakes || 0) + 0.1), context: request.context },
        cat, { flags: flags, text: text, tokens: Math.ceil((request.tokens || 1000) * 0.3) })
      });
    }
    const total = steps.reduce((s, x) => s + x.route.cost_estimate, 0);
    return { steps: steps, total_cost: total };
  }

  function explain(signals, threshold, F, tier, path) {
    const dominant = ['complexity', 'stakes', 'context']
      .map(k => [k, clamp01(signals[k])])
      .sort((a, b) => b[1] - a[1])[0][0];
    const side = F >= 0
      ? 'sparse labyrinth (lower-cost side of the surface)'
      : 'dense labyrinth (higher-cost side of the surface)';
    return 'Dominant signal: ' + dominant +
      '. Threshold ' + threshold.toFixed(2) +
      '. Schwarz-D F=' + F.toFixed(2) + ' → ' + side +
      ". Path [" + (path || 'surface') +
      "]. Selected tier '" + tier.name + "' (quality " + tier.quality + ').';
  }

  const api = {
    schwarzD, DEFAULT_CATALOG, Gates, CONSTRAINT_TABLE, REGEX_PATTERNS,
    qualityThreshold, manifoldDemand, applyConstraints, inferFlagsFromText,
    decisionTreeShortcut, estimateCost, route, plan
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SchwarzRouter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
