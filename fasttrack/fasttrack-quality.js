/**
 * ═══════════════════════════════════════════════════════════════════════
 * FASTTRACK — DIMENSIONAL QUALITY MANIFOLD   fasttrack/fasttrack-quality.js
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The problem this solves: the game looked great on a strong desktop and went
 * clunky on weak laptops, integrated GPUs, and phones. The old switch was
 * binary — full billiard room, or a stripped "void". Nothing in between.
 *
 * The fix is dimensional, in the literal sense of dimensional-programming.md:
 *
 *   §2  Representation, not compression.
 *       We do NOT store four hand-tuned quality presets as a lookup table.
 *       We store the GENERATOR. One measured capability scalar  c ∈ [0,1]
 *       regenerates the entire settings vector (pixel ratio, shadows, shadow
 *       map size, antialias, particle counts, fog…). The presets were always
 *       derivative; the rule  settingsFor(c)  is primary. Query it at any c,
 *       including values never "stored".
 *
 *   §0/§4  The primitive  z = x·y.
 *       Effective quality is a product, not a sum:  z = capability · demand.
 *       Observe x (the machine, measured once), retrieve y (scene demand),
 *       get z (the quality level) for free. A product means ONE weak factor
 *       collapses the whole — a software GPU drags quality down no matter how
 *       many cores you have. That is the correct physics; a sum would let a
 *       fast CPU paper over a missing GPU. We combine factors by geometric
 *       mean for exactly this reason.
 *
 *   §5  Recursion that survives.
 *       The runtime governor does NOT jump quality around (raw product
 *       recursion is unstable — §5). It writes SMALL residual corrections
 *       toward a frame-time target and renormalises into [floor, ceiling]:
 *           c  ←  c + α·(target − measured),   clamped.
 *       That is the residual-connection-plus-normalisation form, the skeleton
 *       that stays bounded across thousands of frames instead of exploding.
 *
 *   §3  The boundary is where the representative is legitimate.
 *       Below `floor`, we stop degrading. Past that edge the answer would be
 *       fabrication (a scene too poor to be the game). The floor is the
 *       manifold's boundary, stated out loud.
 *
 * Public surface (all reads are cheap, synchronous, allocation-free):
 *   window.FT_QUALITY = {
 *     capability, tier,                       // the scalar and its label
 *     pixelRatio, antialias, shadows,         // generated render settings…
 *     shadowMapSize, spotShadows, detail,
 *     lights, fog, voidMode, env,
 *     settingsFor(c),                         // the generator (pure)
 *     frame(nowMs),                           // governor tick — call per frame
 *     onAdapt(cb),                            // renderer registers live knobs
 *     stats(), set(tier), pinned
 *   }
 *
 * Load order: BEFORE fasttrack-3d.js, so the global exists when init3D runs.
 * Zero dependencies — it builds its own probe canvas and never needs THREE.
 * ═══════════════════════════════════════════════════════════════════════
 */
(function (root) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────
  // 1. CAPABILITY PROBE  —  measure x once.
  //
  // Each factor is normalised to roughly [0,1]. They are combined by a
  // GEOMETRIC mean (a product), not an average: z = x·y geometry says a
  // single near-zero factor must pull the whole down. A software renderer
  // (gpu≈0.15) should cap quality regardless of a 16-core CPU.
  // ─────────────────────────────────────────────────────────────────────

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  // smoothstep — gentle S curve so mid-range machines don't sit on a cliff
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  // Probe the GPU via the WebGL debug-renderer string. This is the single
  // most predictive factor: it separates discrete GPUs from integrated from
  // software rasterisers from phone SoCs.
  function probeGpu() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return 0.2; // no WebGL at all — extremely weak
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const raw = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
      const r = String(raw || '').toLowerCase();
      // Tidy up the probe context so we don't leak a GL context.
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();

      if (!r) return 0.6; // string masked (Firefox/privacy) — assume mid
      // Software rasterisers — the floor of real machines.
      if (/swiftshader|software|llvmpipe|microsoft basic|mesa offscreen/.test(r)) return 0.12;
      // Discrete desktop GPUs — the ceiling.
      if (/rtx|geforce|radeon rx|radeon pro|nvidia|quadro|\bvega\b/.test(r)) return 1.0;
      // Apple Silicon — strong integrated.
      if (/apple m\d|apple gpu/.test(r)) return 0.88;
      // Intel integrated — the broad middle, split by generation.
      if (/iris xe|arc/.test(r)) return 0.66;
      if (/iris/.test(r)) return 0.58;
      if (/intel.*(uhd|hd graphics)|intel\(r\)/.test(r)) return 0.42;
      // Phone / tablet SoCs.
      if (/adreno 7|adreno 8|apple a1[5-9]|mali-g7|mali-g[89]/.test(r)) return 0.5;
      if (/adreno|mali|powervr|apple a\d/.test(r)) return 0.36;
      return 0.6; // unknown but present — assume mid
    } catch (_) {
      return 0.5;
    }
  }

  function probeCapability() {
    const nav = root.navigator || {};
    // deviceMemory (GB) — Chromium only; undefined elsewhere → neutral 0.62.
    const mem = nav.deviceMemory ? clamp(nav.deviceMemory / 8, 0.25, 1) : 0.62;
    // logical cores — undefined → neutral.
    const cpu = nav.hardwareConcurrency ? clamp(nav.hardwareConcurrency / 8, 0.25, 1) : 0.62;
    const gpu = probeGpu();

    // Geometric mean of the three primary axes — the z=x·y product law.
    let c = Math.cbrt(mem * cpu * gpu);

    // Multiplicative penalties (each is a y that can only pull z down):
    const dpr = root.devicePixelRatio || 1;
    const w = (root.screen && root.screen.width) || root.innerWidth || 1280;
    // A high pixel ratio on a small panel (phones) means many more fragments
    // per CSS pixel — real GPU cost. Penalise dense-small, spare dense-large.
    if (dpr >= 2 && w < 900) c *= 0.78;
    // Coarse pointer ⇒ touch device ⇒ usually thermally limited.
    if (root.matchMedia && root.matchMedia('(pointer: coarse)').matches) c *= 0.82;
    // User asked the OS/browser to save data/battery — honour it.
    if (nav.connection && nav.connection.saveData) c *= 0.7;
    if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) c *= 0.85;

    return { capability: clamp(c, 0.05, 1), mem, cpu, gpu, dpr };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. THE GENERATOR  —  settingsFor(c).  Pure. The "congressman".
  //
  // This is the whole point: there is no preset table. Every concrete render
  // setting is a continuous function of the one scalar c. Change c and the
  // entire dressing-room of settings regenerates, including at c values that
  // were never explicitly authored.
  // ─────────────────────────────────────────────────────────────────────

  function tierOf(c) {
    return c < 0.30 ? 'low'
      : c < 0.55 ? 'medium'
      : c < 0.80 ? 'high'
      : 'ultra';
  }

  function settingsFor(c, dpr) {
    c = clamp(c, 0, 1);
    dpr = dpr || root.devicePixelRatio || 1;
    return {
      capability: c,
      tier: tierOf(c),
      // Render resolution: 1.0 on weak machines, scaling up to the device's
      // own ratio (capped at 2) as capability rises. Biggest single lever.
      pixelRatio: clamp(lerp(0.85, Math.min(dpr, 2), smooth(c)), 0.85, 2),
      antialias: c >= 0.45,
      shadows: c >= 0.34,
      // Shadow map resolution steps up the manifold; 2048 is the documented
      // ceiling (the renderer notes 4096 is visually indistinguishable here).
      shadowMapSize: c < 0.34 ? 0 : c < 0.62 ? 1024 : 2048,
      // The three table spotlights each carry a shadow map — only the strong
      // tiers can afford four shadow passes.
      spotShadows: c >= 0.72,
      // Particle / decoration count multiplier (dust motes, stars, accents).
      detail: clamp(lerp(0.25, 1, smooth(c)), 0.2, 1),
      // Optional point-light fullness (wall washes, sconces). Reserved for
      // load-time use; weak machines keep only the key/spot lights.
      lights: clamp(lerp(0.4, 1, smooth(c)), 0.35, 1),
      fog: c >= 0.30,
      env: c >= 0.40,            // environment cubemap reflections
      // Below this boundary the room is stripped to a void (§3 — past the
      // edge of legitimacy the full room is fabrication, not the game).
      voidMode: c < 0.26,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 3. ASSEMBLE THE LIVE OBJECT
  // ─────────────────────────────────────────────────────────────────────

  const probe = probeCapability();

  // Manual override: ?quality=low|medium|high|ultra|auto  or localStorage.
  // A pinned tier disables the governor — the user has made the assignment
  // (§4: which variable is observed vs latent is a choice you impose).
  function readOverride() {
    let v = null;
    try {
      const u = new URLSearchParams(root.location ? root.location.search : '');
      v = u.get('quality') || u.get('q');
    } catch (_) {}
    if (!v) { try { v = root.localStorage && root.localStorage.getItem('ft_quality'); } catch (_) {} }
    return v ? String(v).toLowerCase() : null;
  }

  const TIER_CENTER = { low: 0.20, medium: 0.46, high: 0.68, ultra: 0.92 };

  const override = readOverride();
  const pinned = !!(override && override !== 'auto' && TIER_CENTER[override] !== undefined);
  // The detected ceiling — the governor may degrade below this but never above.
  const ceiling = probe.capability;
  let capability = pinned ? TIER_CENTER[override] : probe.capability;

  const Q = Object.assign({}, settingsFor(capability, probe.dpr), {
    pinned,
    ceiling,
    probe,                       // {mem,cpu,gpu,dpr} — exposed for the docs page
    settingsFor,                 // the generator itself, for the benchmark page
  });

  // ── governor state ──
  let emaMs = 16.7;              // exponential moving average of frame time
  let lastT = 0;
  let frames = 0;
  let cooldown = 0;             // frames to wait after an adaptation
  let degraded = false;
  const adaptCbs = [];

  function regen() {
    const next = settingsFor(capability, probe.dpr);
    Object.assign(Q, next);
    for (let i = 0; i < adaptCbs.length; i++) {
      try { adaptCbs[i](Q); } catch (_) {}
    }
  }

  /**
   * Renderer registers the cheap live knobs it can change every frame
   * without rebuilding geometry: pixel ratio and shadow on/off. Heavier
   * settings (counts, map size) take effect on the next load — we never
   * tear down the scene mid-game.
   */
  Q.onAdapt = function (cb) { if (typeof cb === 'function') adaptCbs.push(cb); return Q; };

  /**
   * Governor tick. Call once per rendered frame with a high-res timestamp.
   * Residual correction toward a frame-time target, clamped to [floor,ceil].
   */
  const FLOOR = 0.12;                 // manifold boundary — never degrade past
  const TARGET_MS = 1000 / 58;        // aim just under 60fps for headroom
  const SLOW_MS = 1000 / 45;          // sustained slower than this ⇒ ease down
  const FAST_MS = 1000 / 59;          // sustained faster than this ⇒ ease up
  const WINDOW = 75;                  // evaluate roughly once per ~1.3s

  Q.frame = function (nowMs) {
    if (Q.pinned) return;             // user pinned the tier — respect it
    if (!nowMs) nowMs = (root.performance && root.performance.now) ? root.performance.now() : 0;
    if (lastT) {
      const dt = nowMs - lastT;
      // Ignore tab-switch / GC spikes (>200ms) so they don't skew the EMA.
      if (dt > 0 && dt < 200) emaMs += 0.06 * (dt - emaMs);
    }
    lastT = nowMs;
    if (cooldown > 0) { cooldown--; return; }
    if (++frames < WINDOW) return;
    frames = 0;

    // Residual step proportional to how far off target we are (§5).
    if (emaMs > SLOW_MS && capability > FLOOR) {
      const err = (emaMs - TARGET_MS) / TARGET_MS;     // normalised overshoot
      capability = clamp(capability - clamp(0.10 * err, 0.03, 0.14), FLOOR, ceiling);
      degraded = true;
      cooldown = WINDOW;             // let the change settle before re-judging
      regen();
    } else if (emaMs < FAST_MS && capability < ceiling) {
      // Recover slowly — only ever back up toward the detected ceiling, and
      // in smaller steps than we cut, so we settle instead of oscillating.
      capability = clamp(capability + 0.03, FLOOR, ceiling);
      cooldown = WINDOW * 2;
      regen();
    }
  };

  /** Force a tier at runtime (also persists). Pins the governor. */
  Q.set = function (tier) {
    tier = String(tier || '').toLowerCase();
    if (tier === 'auto') {
      try { root.localStorage && root.localStorage.removeItem('ft_quality'); } catch (_) {}
      Q.pinned = false; capability = ceiling; regen();
      return Q;
    }
    if (TIER_CENTER[tier] === undefined) return Q;
    try { root.localStorage && root.localStorage.setItem('ft_quality', tier); } catch (_) {}
    Q.pinned = true; capability = TIER_CENTER[tier]; regen();
    return Q;
  };

  /** Live readout for the HUD and the benchmark page. */
  Q.stats = function () {
    return {
      fps: emaMs > 0 ? Math.round(1000 / emaMs) : 0,
      emaMs: Math.round(emaMs * 10) / 10,
      tier: Q.tier,
      capability: Math.round(capability * 1000) / 1000,
      ceiling: Math.round(ceiling * 1000) / 1000,
      degraded,
      pinned: Q.pinned,
    };
  };

  root.FT_QUALITY = Q;

  // One concise line so the choice is auditable in the console.
  try {
    console.log(
      `🜂 Quality manifold: tier=${Q.tier} c=${capability.toFixed(2)} ` +
      `(gpu=${probe.gpu.toFixed(2)} cpu=${probe.cpu.toFixed(2)} mem=${probe.mem.toFixed(2)}) ` +
      `px=${Q.pixelRatio.toFixed(2)} shadows=${Q.shadows} aa=${Q.antialias} void=${Q.voidMode}` +
      (pinned ? ` [PINNED ${override}]` : '')
    );
  } catch (_) {}

}(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this));
