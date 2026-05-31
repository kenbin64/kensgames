// Golden-case tests for router.js. Runs in both Node and browser.
// Node:    node router.test.js
// Browser: open routing.html and check the console.

(function () {
  'use strict';
  const R = (typeof require === 'function')
    ? require('./router.js')
    : (typeof window !== 'undefined' ? window.SchwarzRouter : null);
  if (!R) { console.error('router.js not loaded'); return; }

  let pass = 0, fail = 0;
  const log = (typeof console !== 'undefined') ? console : { log: () => {}, error: () => {} };

  function ok(name, cond, extra) {
    if (cond) { pass++; log.log('  PASS  ' + name); }
    else      { fail++; log.error('  FAIL  ' + name + (extra ? '  ' + JSON.stringify(extra) : '')); }
  }

  function approx(a, b, eps) { return Math.abs(a - b) < (eps || 1e-9); }

  // --- Layer 1: Schwarz D math ----------------------------------------------
  ok('schwarzD(0,0,0) = 0  (all terms contain sin(0))',
     approx(R.schwarzD(0, 0, 0), 0, 1e-9));
  ok('schwarzD(π/2, 0, 0) = 1  (only sin(x)·cos·cos survives)',
     approx(R.schwarzD(Math.PI / 2, 0, 0), 1, 1e-9));
  ok('schwarzD is in [-1.6, 1.6] over sampled grid', (() => {
    const N = 8; let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N; j++)
        for (let k = 0; k <= N; k++) {
          const v = R.schwarzD(i * Math.PI / N, j * Math.PI / N, k * Math.PI / N);
          if (v < lo) lo = v; if (v > hi) hi = v;
        }
    return lo > -1.6 && hi < 1.6;
  })());

  // --- Regex pre-filter: cheap deterministic flag inference ----------------
  ok('regex infers kind=embedding from "embed these vectors"',
     R.inferFlagsFromText('please embed these vectors for nearest neighbor lookup', {}).kind === 'embedding');
  ok('regex infers needs_code from a fenced code block',
     R.inferFlagsFromText('fix this:\n```\nfunction foo() { return 1; }\n```', {}).needs_code === true);
  ok('regex infers contains_pii from an SSN pattern',
     R.inferFlagsFromText('user ssn is 123-45-6789, please redact', {}).contains_pii === true);
  ok('regex infers irreversible_action from "deploy to prod"',
     R.inferFlagsFromText('go ahead and deploy to prod', {}).irreversible_action === true);
  ok('caller-supplied flag overrides regex inference',
     R.inferFlagsFromText('embed these vectors', { kind: 'classification' }).kind === 'classification');
  const allTiers = R.DEFAULT_CATALOG;
  const piiRoute = R.route(
     { complexity: 0.3, stakes: 0.4, context: 0.3 }, allTiers,
     { text: 'patient mrn 998877 — summarize chart' });
  ok('route() with PII text → tier supports local or audited_pii',
     piiRoute.model.capabilities.local || piiRoute.model.capabilities.audited_pii);

  // --- Layer 2: logic gates / truth-table constraints -----------------------
  const visionOnly = R.applyConstraints(allTiers, { needs_vision: true });
  ok('vision flag filters out non-vision tiers',
     visionOnly.eligible.every(t => t.capabilities.vision));
  ok('vision flag records violations for non-vision tiers',
     visionOnly.violations.some(v => v.tier === 'nano' && v.rule === 'vision'));
  const offline = R.applyConstraints(allTiers, { must_be_offline: true });
  ok('must_be_offline keeps only local tiers',
     offline.eligible.length > 0 && offline.eligible.every(t => t.capabilities.local));

  // --- Layer 3: decision tree shortcuts -------------------------------------
  const embed = R.route(
    { complexity: 0.5, stakes: 0.5, context: 0.5 },
    allTiers, { flags: { kind: 'embedding' } });
  ok('kind=embedding short-circuits to an embed-capable tier',
     embed.model.capabilities.embed && /tree:/.test(embed.path));
  const triv = R.route(
    { complexity: 0.05, stakes: 0.05, context: 0.05 },
    allTiers, { flags: { kind: 'classification' } });
  ok('trivial classification short-circuits to cheapest eligible',
     /tree:/.test(triv.path) && triv.model.cost_per_1k <= 0.0005);

  // --- Layer 4: manifold demand (Tiresias z = x*y^2) -----------------------
  ok('manifoldDemand(0,0,0) = 0',
     approx(R.manifoldDemand({ complexity: 0, stakes: 0, context: 0 }), 0));
  ok('manifoldDemand(1,1,1) clamped at 1',
     approx(R.manifoldDemand({ complexity: 1, stakes: 1, context: 1 }), 1, 1e-9));
  ok('stakes dominate quadratically (s>>c)',
     R.manifoldDemand({ complexity: 0.2, stakes: 0.9, context: 0 }) >
     R.manifoldDemand({ complexity: 0.9, stakes: 0.2, context: 0 }));

  // --- Layer 5: surface-based tier selection --------------------------------
  const cheap = R.route(
    { complexity: 0.1, stakes: 0.1, context: 0.1 }, allTiers, {});
  ok('low-demand request → low-cost tier (cost <= mid)',
     cheap.model.cost_per_1k <= 0.003);
  const legal = R.route(
    { complexity: 0.9, stakes: 0.95, context: 0.6 }, allTiers, {});
  ok('high-stakes request → large or frontier tier',
     ['large', 'frontier'].includes(legal.model.name));
  const giant = R.route(
    { complexity: 0.7, stakes: 0.5, context: 0.9 }, allTiers,
    { required_context: 500000 });
  ok('required_context > 200k → only frontier qualifies',
     giant.model.name === 'frontier');

  // --- Determination graph: plan() -----------------------------------------
  const p = R.plan(
    { complexity: 0.8, stakes: 0.85, context: 0.7, tokens: 2000,
      flags: { needs_retrieval: true } },
    allTiers);
  ok('plan with needs_retrieval includes a retrieve step',
     p.steps[0].step === 'retrieve');
  ok('plan with high stakes includes a verify step',
     p.steps.some(s => s.step === 'verify'));
  ok('plan total_cost = sum of step costs',
     approx(p.total_cost, p.steps.reduce((s, x) => s + x.route.cost_estimate, 0), 1e-12));

  log.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (typeof process !== 'undefined' && process.exit && fail > 0) process.exit(1);
})();
