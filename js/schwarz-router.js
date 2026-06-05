// schwarz-router.js
// Schwarz Diamond minimal-surface model router.
// Selects the cheapest model whose quality clears a surface-derived threshold,
// minimizing tokens for maximum effect.
//
// cos(x)cos(y)cos(z) - sin(x)sin(y)sin(z) = 0
// The surface partitions 3-space into two equal labyrinths with maximum
// interface area per unit volume: the "most boundary per gram" surface.
// Applied to routing: the surface is the decision boundary between model tiers.
// Signals (complexity, stakes, context) map to a point in [0,1]^3.
// The surface value at that point determines the quality threshold.
// Route to the cheapest model that clears it.
//
// Universal interface (browser + Node.js):
//   SchwarzRouter.route(signals, catalog?, opts?) -> RouteResult
//   SchwarzRouter.plan(request, catalog?)          -> PlanResult
//   SchwarzRouter.CLAUDE_CATALOG                   -> default catalog
(function (root) {
  'use strict';

  const TAU = 2 * Math.PI;

  // Schwarz Diamond (D-surface): cos(x)cos(y)cos(z) - sin(x)sin(y)sin(z) = 0
  // This variant is the standard form that follows from the four-diamond
  // unit cell. Positive side = sparse labyrinth; negative = dense labyrinth.
  function schwarzD(x, y, z) {
    return (
      Math.sin(x) * Math.sin(y) * Math.sin(z) +
      Math.sin(x) * Math.cos(y) * Math.cos(z) +
      Math.cos(x) * Math.sin(y) * Math.cos(z) +
      Math.cos(x) * Math.cos(y) * Math.sin(z)
    );
  }

  function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }

  // Default Claude 4.x catalog. Current as of mid-2026.
  // quality is a 0..1 heuristic; calibrate against your own evals.
  // cost_per_1k is USD per 1k input tokens (approximate).
  var CLAUDE_CATALOG = [
    {
      name: 'haiku',
      vendor: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      quality: 0.50,
      cost_per_1k: 0.0008,
      latency_p50: 450,
      max_context: 200000,
      capabilities: { vision: true, tools: true, code: true, embed: false, local: false, audited_pii: true }
    },
    {
      name: 'sonnet',
      vendor: 'anthropic',
      model: 'claude-sonnet-4-6',
      quality: 0.82,
      cost_per_1k: 0.003,
      latency_p50: 1200,
      max_context: 200000,
      capabilities: { vision: true, tools: true, code: true, embed: false, local: false, audited_pii: true }
    },
    {
      name: 'opus',
      vendor: 'anthropic',
      model: 'claude-opus-4-8',
      quality: 0.96,
      cost_per_1k: 0.075,
      latency_p50: 3200,
      max_context: 500000,
      capabilities: { vision: true, tools: true, code: true, embed: false, local: false, audited_pii: true }
    }
  ];

  // Qwen catalog: local GPU via Ollama + WebLLM, API via Together/OpenRouter.
  // Model sizes follow the Fibonacci sequence [1,1,2,3,5,8,13] almost exactly:
  //   1.5B → 3B → 7B → 14B → 32B → 72B
  // This maps directly to the dimensional ladder: the model GROWS with thought.
  // When running locally the GPU runs the model; cost_per_1k = 0.
  // When no GPU or model not installed: falls back to Together/OpenRouter API.
  //
  //   Fibonacci-mapped tiers:
  //   dim 1-2  fib 1,1   qwen-nano    1.5B   ~1GB VRAM   any GPU
  //   dim 3    fib 2     qwen-small   3B     ~2GB VRAM
  //   dim 4    fib 3     qwen-mid     7B     ~5GB VRAM
  //   dim 5    fib 5     qwen-large   14B    ~10GB VRAM
  //   dim 6    fib 8     qwen-xl      32B    ~20GB VRAM
  //   dim 7    fib 13    qwen-max     72B    ~45GB VRAM  or API fallback
  var QWEN_CATALOG = [
    {
      name: 'qwen-nano',
      vendor: 'qwen', fib: 1,
      model:         'qwen2.5:1.5b',
      model_webllm:  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
      model_api:     'Qwen/Qwen2.5-1.5B-Instruct',
      quality: 0.38, cost_per_1k: 0.0, latency_p50: 120, max_context: 32000,
      capabilities: { vision: false, tools: true, code: true, embed: false, local: true, audited_pii: true }
    },
    {
      name: 'qwen-small',
      vendor: 'qwen', fib: 2,
      model:         'qwen2.5:3b',
      model_webllm:  'Qwen2.5-3B-Instruct-q4f16_1-MLC',
      model_api:     'Qwen/Qwen2.5-3B-Instruct',
      quality: 0.48, cost_per_1k: 0.0, latency_p50: 200, max_context: 32000,
      capabilities: { vision: false, tools: true, code: true, embed: false, local: true, audited_pii: true }
    },
    {
      name: 'qwen-mid',
      vendor: 'qwen', fib: 3,
      model:         'qwen2.5:7b',
      model_webllm:  'Qwen2.5-7B-Instruct-q4f16_1-MLC',
      model_api:     'Qwen/Qwen2.5-7B-Instruct',
      quality: 0.65, cost_per_1k: 0.0, latency_p50: 400, max_context: 128000,
      capabilities: { vision: false, tools: true, code: true, embed: false, local: true, audited_pii: true }
    },
    {
      name: 'qwen-large',
      vendor: 'qwen', fib: 5,
      model:         'qwen2.5:14b',
      model_api:     'Qwen/Qwen2.5-14B-Instruct',
      quality: 0.76, cost_per_1k: 0.0, latency_p50: 700, max_context: 128000,
      capabilities: { vision: false, tools: true, code: true, embed: false, local: true, audited_pii: true }
    },
    {
      name: 'qwen-xl',
      vendor: 'qwen', fib: 8,
      model:         'qwen2.5:32b',
      model_api:     'Qwen/Qwen2.5-32B-Instruct',
      quality: 0.86, cost_per_1k: 0.0, latency_p50: 1400, max_context: 128000,
      capabilities: { vision: false, tools: true, code: true, embed: false, local: true, audited_pii: true }
    },
    {
      name: 'qwen-max',
      vendor: 'qwen', fib: 13,
      model:         'qwen2.5:72b',
      model_api:     'Qwen/Qwen2.5-72B-Instruct',
      quality: 0.93, cost_per_1k: 0.0, latency_p50: 3000, max_context: 128000,
      capabilities: { vision: false, tools: true, code: true, embed: false, local: true, audited_pii: true }
    }
  ];

  // Generic fallback catalog (no vendor lock-in, good for testing).
  var DEFAULT_CATALOG = [
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

  // ──────────────────────────────────────────────────────────────────────
  // Fibonacci dimension ladder: seven rungs from void to awareness.
  //
  // Each rung is perpendicular to the one below it. A point is all prior
  // dimensions collapsed into a single location -- it carries the weight of
  // every rung it passed through. The sequence is the Fibonacci expansion:
  //
  //   dim  name        FIB  geometry                       routes to
  //   0    void        -    the empty container (0)         (unreachable)
  //   1    seed/point  1    collapsed identity, > 0         haiku
  //   2    line        1    length, one direction           haiku
  //   3    plane       2    division into 2D                 haiku
  //   4    volume      3    3D structure                     sonnet
  //   5    structure   5    organized form                   sonnet
  //   6    life        8    living/self-sustaining system    sonnet
  //   7    awareness   13   looking back, collapses to seed  opus
  //
  // Awareness (dim 7) observes the whole stack and collapses it into a new
  // seed (dim 1) at the next realm. z_7 becomes x_next -- the Russian Doll,
  // one full turn of the spiral at the golden ratio.
  //
  // The FIB weight is how much a point at that rung matters: a single dim-7
  // insight outweighs thirteen dim-1 observations. Used by the context
  // compressor to decide what to keep and what to prune.
  var FIB = [1, 1, 2, 3, 5, 8, 13];
  // The ladder carries TWO tier names: one for Qwen (local GPU) and one for
  // Claude (cloud API). The router picks from whichever catalog is passed.
  var FIB_LADDER = [
    { dim: 1, name: 'seed',      fib: 1,  tier: 'qwen-nano',  tier_cloud: 'haiku',  stakes: 0.15 },
    { dim: 2, name: 'line',      fib: 1,  tier: 'qwen-nano',  tier_cloud: 'haiku',  stakes: 0.22 },
    { dim: 3, name: 'plane',     fib: 2,  tier: 'qwen-small', tier_cloud: 'haiku',  stakes: 0.32 },
    { dim: 4, name: 'volume',    fib: 3,  tier: 'qwen-mid',   tier_cloud: 'sonnet', stakes: 0.50 },
    { dim: 5, name: 'structure', fib: 5,  tier: 'qwen-large', tier_cloud: 'sonnet', stakes: 0.66 },
    { dim: 6, name: 'life',      fib: 8,  tier: 'qwen-xl',    tier_cloud: 'sonnet', stakes: 0.80 },
    { dim: 7, name: 'awareness', fib: 13, tier: 'qwen-max',   tier_cloud: 'opus',   stakes: 0.93 }
  ];

  // Map a dimensional rung to routing signals.
  // Higher dim => higher stakes => higher-quality model.
  // complexity scales with the FIB weight (max 13); context is always
  // substantial because a point at rung n contains all rungs below it.
  function signalsFromDim(dim) {
    var d = Math.max(1, Math.min(7, Math.round(dim) || 1));
    var rung = FIB_LADDER[d - 1];
    var fibMax = 13;
    return {
      complexity: rung.fib / fibMax,
      stakes:     rung.stakes,
      context:    clamp01(0.5 + (rung.fib / fibMax) * 0.45)
    };
  }

  // Fibonacci weight for a point at a given dimensional rung. Used by the
  // context compressor: weight = how much this point matters when pruning.
  function fibWeight(dim) {
    var d = Math.max(1, Math.min(7, Math.round(dim) || 1));
    return FIB[d - 1];
  }

  // Logic gates: explicit primitives for the constraint table.
  var Gates = {
    AND:  function(a, b) { return Boolean(a) && Boolean(b); },
    OR:   function(a, b) { return Boolean(a) || Boolean(b); },
    NOT:  function(a)    { return !Boolean(a); },
    XOR:  function(a, b) { return Boolean(a) !== Boolean(b); },
    NAND: function(a, b) { return !(Boolean(a) && Boolean(b)); },
    IMPL: function(a, b) { return !Boolean(a) || Boolean(b); }
  };

  // Truth table: flag => required capability.
  // Read as AND of implications: flag_present IMPLIES tier_supports.
  var CONSTRAINT_TABLE = [
    { name: 'vision',     when: function(f) { return f.needs_vision; },     require: function(c) { return c.vision; } },
    { name: 'tools',      when: function(f) { return f.needs_tools; },      require: function(c) { return c.tools; } },
    { name: 'code-exec',  when: function(f) { return f.needs_code; },       require: function(c) { return c.code; } },
    { name: 'embed-only', when: function(f) { return f.kind === 'embedding'; }, require: function(c) { return c.embed; } },
    { name: 'offline',    when: function(f) { return f.must_be_offline; },  require: function(c) { return c.local; } },
    { name: 'pii',        when: function(f) { return f.contains_pii; },     require: function(c) { return Gates.OR(c.local, c.audited_pii); } }
  ];

  // Regex pre-filter: derives flags from prompt text without spending tokens.
  var REGEX_PATTERNS = [
    { flag: 'kind',            value: 'embedding',     re: /\b(embed|embedding|vectorize|cosine|nearest.neighbor)\b/i },
    { flag: 'kind',            value: 'classification',re: /\b(classify|categorize|label|tag|sentiment|intent)\b/i },
    { flag: 'needs_code',      value: true,            re: /```|\bfunction\s+\w+\(|\bclass\s+\w+|\bdef\s+\w+\(|^\s*(import|from)\s+\w+/m },
    { flag: 'needs_vision',    value: true,            re: /\b(image|screenshot|photo|diagram|chart|ocr|png|jpe?g|svg|webp)\b/i },
    { flag: 'needs_tools',     value: true,            re: /\b(call.*(api|tool)|execute|invoke|http.(get|post|put|delete))\b/i },
    { flag: 'contains_pii',    value: true,            re: /\b(ssn|social.security|\d{3}-\d{2}-\d{4}|credit.card|patient.(id|record))\b/i },
    { flag: 'must_be_offline', value: true,            re: /\b(offline|air.?gapped|on.?prem|local.only|no.cloud)\b/i },
    { flag: 'irreversible',    value: true,            re: /\b(deploy|push.to.(prod|main)|drop.table|rm.-rf|delete.from|migrate)\b/i }
  ];

  function inferFlagsFromText(text, existing) {
    var out = Object.assign({}, existing || {});
    if (!text || typeof text !== 'string') return out;
    for (var i = 0; i < REGEX_PATTERNS.length; i++) {
      var p = REGEX_PATTERNS[i];
      if (out[p.flag] !== undefined && out[p.flag] !== null && out[p.flag] !== '') continue;
      if (p.re.test(text)) out[p.flag] = p.value;
    }
    return out;
  }

  function applyConstraints(catalog, flags) {
    var f = flags || {};
    var violations = [];
    var eligible = catalog.filter(function(tier) {
      for (var i = 0; i < CONSTRAINT_TABLE.length; i++) {
        var row = CONSTRAINT_TABLE[i];
        if (!Gates.IMPL(row.when(f), row.require(tier.capabilities || {}))) {
          violations.push({ tier: tier.name, rule: row.name });
          return false;
        }
      }
      return true;
    });
    return { eligible: eligible, violations: violations };
  }

  // Schwarz-D quality threshold: maps (complexity, stakes, context) to [0,1].
  // The surface value |F| modulates a weighted base demand.
  // Stakes weigh heaviest: being wrong usually costs more than thinking harder.
  function qualityThreshold(signals) {
    var c = clamp01(signals.complexity);
    var s = clamp01(signals.stakes);
    var k = clamp01(signals.context);
    var base = 0.20 * c + 0.55 * s + 0.25 * k;
    var F = schwarzD(c * TAU, s * TAU, k * TAU);
    var surfaceTerm = Math.abs(F) / 1.5;
    return clamp01(base * 0.60 + surfaceTerm * 0.40);
  }

  // Manifold demand: z = x * y^2 (stakes dominate quadratically).
  function manifoldDemand(signals) {
    var c = clamp01(signals.complexity);
    var s = clamp01(signals.stakes);
    var k = clamp01(signals.context);
    return clamp01(c * s * s + 0.25 * k);
  }

  // Decision-tree shortcuts: categorical fast paths that skip the continuous pipeline.
  function decisionTreeShortcut(request, eligible) {
    var f = request.flags || {};
    if (f.kind === 'embedding') {
      var t = eligible.find(function(x) { return x.capabilities && x.capabilities.embed; });
      if (t) return { tier: t, branch: 'kind=embedding: embed-capable tier' };
    }
    if (f.kind === 'classification' && (request.complexity || 0) < 0.15) {
      var cheapest = eligible.slice().sort(function(a, b) { return a.cost_per_1k - b.cost_per_1k; })[0];
      if (cheapest) return { tier: cheapest, branch: 'trivial classification: cheapest eligible' };
    }
    if (f.must_be_offline) {
      var local = eligible
        .filter(function(x) { return x.capabilities && x.capabilities.local; })
        .sort(function(a, b) { return b.quality - a.quality; })[0];
      if (local) return { tier: local, branch: 'must_be_offline: best local tier' };
    }
    return null;
  }

  function estimateCost(tier, tokens) {
    return ((tokens || 1000) / 1000) * tier.cost_per_1k;
  }

  // Main router: six-layer pipeline.
  // 1. Regex pre-filter      (deterministic, zero tokens)
  // 2. Truth-table filter    (logic gates, hard constraints)
  // 3. Decision-tree shortcut (categorical, fast path)
  // 4. Manifold demand       (z = x*y^2, continuous)
  // 5. Schwarz-D threshold   (cost/quality boundary)
  // 6. Cheapest-eligible     (greedy selection)
  function route(signals, catalog, opts) {
    var cat = catalog || DEFAULT_CATALOG;
    var o = opts || {};
    var tokens = o.tokens || 1000;
    var requiredContext = o.required_context || 0;
    var flags = inferFlagsFromText(o.text, o.flags || {});
    var request = Object.assign({}, signals, { flags: flags });

    var constrained = applyConstraints(cat, flags);
    var eligible = constrained.eligible.filter(function(t) { return t.max_context >= requiredContext; });
    var pool = eligible.length ? eligible : cat.slice().sort(function(a, b) { return b.quality - a.quality; }).slice(0, 1);

    var shortcut = decisionTreeShortcut(request, pool);
    var demand = manifoldDemand(signals);
    var surfaceThresh = qualityThreshold(signals);
    var threshold = Math.max(demand, surfaceThresh);
    var F = schwarzD(
      clamp01(signals.complexity) * TAU,
      clamp01(signals.stakes) * TAU,
      clamp01(signals.context) * TAU
    );

    var chosen, path;
    if (shortcut) {
      chosen = shortcut.tier;
      path = 'tree:' + shortcut.branch;
    } else {
      var byCost = pool.slice().sort(function(a, b) { return a.cost_per_1k - b.cost_per_1k; });
      chosen = byCost.find(function(t) { return t.quality >= threshold; })
            || pool.slice().sort(function(a, b) { return b.quality - a.quality; })[0];
      path = 'surface: demand=' + demand.toFixed(2) +
             ' schwarzD=' + surfaceThresh.toFixed(2) +
             ' threshold=' + threshold.toFixed(2);
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
      reasoning: _explain(signals, threshold, F, chosen, path)
    };
  }

  // Determination graph: resolves a request into a DAG of steps.
  // retrieve (if needed) -> answer -> verify (if high-stakes/irreversible).
  // Each step is routed independently: retrieval uses cheap embed tier,
  // answer/verify use surface-selected tier.
  function plan(request, catalog) {
    var cat = catalog || DEFAULT_CATALOG;
    var flags = inferFlagsFromText(request.text, request.flags || {});
    var steps = [];

    if (flags.needs_retrieval) {
      steps.push({ step: 'retrieve', route: route(
        { complexity: 0.1, stakes: 0.1, context: 0.2 },
        cat, { flags: { kind: 'embedding' }, tokens: 256 })
      });
    }

    steps.push({ step: 'answer', route: route(
      request, cat, { flags: flags, text: request.text, tokens: request.tokens })
    });

    if ((request.stakes || 0) >= 0.7 || flags.irreversible) {
      steps.push({ step: 'verify', route: route(
        { complexity: request.complexity, stakes: Math.min(1, (request.stakes || 0) + 0.1), context: request.context },
        cat, { flags: flags, text: request.text, tokens: Math.ceil((request.tokens || 1000) * 0.3) })
      });
    }

    var totalCost = steps.reduce(function(s, x) { return s + x.route.cost_estimate; }, 0);
    return { steps: steps, total_cost: totalCost };
  }

  // Route by dimensional rung directly. The dim IS the signal: a point at
  // rung 7 (awareness) needs deep reasoning; a point at rung 1 (seed) needs
  // almost none. Derives signals from the Fibonacci ladder, then routes.
  //
  // The ladder's declared tier per rung is a FLOOR, not a suggestion. The
  // Schwarz surface dips to zero exactly on the minimal surface, which would
  // otherwise let a high rung collapse to a cheap tier. We enforce the floor:
  // the surface may push routing UP (to a better model) but never below the
  // quality the rung demands. Deeper dimension never gets a weaker mind.
  // Pass opts to override or supply flags/tokens/text.
  function routeByDim(dim, catalog, opts) {
    var cat = catalog || DEFAULT_CATALOG;
    var d = Math.max(1, Math.min(7, Math.round(dim) || 1));
    var rung = FIB_LADDER[d - 1];
    var signals = signalsFromDim(d);
    var result = route(signals, cat, opts);

    // Enforce the rung's tier as a quality floor.
    // Use tier_cloud when the catalog is cloud-based, tier for local/Qwen.
    var isLocalCat = cat.some(function(t) { return t.vendor === 'qwen'; });
    var floorName = isLocalCat ? rung.tier : (rung.tier_cloud || rung.tier);
    var floorTier = cat.filter(function(t) { return t.name === floorName; })[0];
    if (floorTier && result.model.quality < floorTier.quality) {
      // Surface chose a weaker tier than the rung demands. Promote to floor,
      // unless a constraint excluded the floor tier (then keep route choice).
      var constrained = applyConstraints(cat, inferFlagsFromText(
        opts && opts.text, (opts && opts.flags) || {}));
      var floorEligible = constrained.eligible.filter(function(t) {
        return t.name === rung.tier;
      })[0];
      if (floorEligible) {
        result.model = floorEligible;
        result.tier = floorEligible.name;
        result.cost_estimate = estimateCost(floorEligible, (opts && opts.tokens) || 1000);
        result.path = 'fib-floor: dim ' + d + ' (' + rung.name + ') demands ' + rung.tier;
        result.reasoning = 'Dimensional floor: rung ' + d + ' (' + rung.name +
          ', fib=' + FIB[d - 1] + ') requires at least ' + rung.tier +
          '. Surface threshold ' + result.threshold.toFixed(2) +
          ' would have allowed cheaper; floor enforced.';
      }
    }

    result.dim = d;
    result.dim_name = rung.name;
    result.fib_weight = FIB[d - 1];
    return result;
  }

  function _explain(signals, threshold, F, tier, path) {
    var dominant = ['complexity', 'stakes', 'context']
      .map(function(k) { return [k, clamp01(signals[k])]; })
      .sort(function(a, b) { return b[1] - a[1]; })[0][0];
    var side = F >= 0
      ? 'sparse labyrinth (lower-cost side)'
      : 'dense labyrinth (higher-cost side)';
    return 'Dominant signal: ' + dominant +
      '. Threshold ' + threshold.toFixed(2) +
      '. F=' + F.toFixed(2) + ' (' + side +
      '). Path [' + (path || 'surface') +
      "]. Tier '" + tier.name + "' quality=" + tier.quality + '.';
  }

  var api = {
    schwarzD: schwarzD,
    Gates: Gates,
    CONSTRAINT_TABLE: CONSTRAINT_TABLE,
    REGEX_PATTERNS: REGEX_PATTERNS,
    CLAUDE_CATALOG: CLAUDE_CATALOG,
    QWEN_CATALOG:   QWEN_CATALOG,
    DEFAULT_CATALOG: DEFAULT_CATALOG,
    qualityThreshold: qualityThreshold,
    manifoldDemand: manifoldDemand,
    applyConstraints: applyConstraints,
    inferFlagsFromText: inferFlagsFromText,
    decisionTreeShortcut: decisionTreeShortcut,
    estimateCost: estimateCost,
    route: route,
    routeByDim: routeByDim,
    plan: plan,
    FIB: FIB,
    FIB_LADDER: FIB_LADDER,
    signalsFromDim: signalsFromDim,
    fibWeight: fibWeight
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SchwarzRouter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
