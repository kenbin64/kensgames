/* /x-dimensional/proof-runner.js
 * Bloom engine for the X-Dimensional Paradigm proof.
 * Reads /x-dimensional/manifold.proof.json (the seed) and runs each
 * claim's protocol live in the browser. Imports the actual production
 * substrate code (window.Manifold from /js/manifold.js) — no copies.
 *
 * Every value displayed on a proof page is the return value of the
 * protocol function called at page-load time. There is no pre-baking
 * and no mock data.
 */
(function () {
    'use strict';

    const SEED_URL = '/x-dimensional/manifold.proof.json';
    const REGISTRY_URL = '/js/manifold.registry.json';
    const PORTAL_URL = '/manifold.portal.json';

    async function loadJSON(url) {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error('fetch ' + url + ' -> ' + r.status);
        return r.json();
    }

    // ── PROTOCOLS ─────────────────────────────────────────────────────
    const protocols = {};

    // F1. Universal Access. Fetch every game manifest the portal lists,
    // compute z = x*y from declared (x,y), compare against declared z.
    protocols.fetch_each_game_manifest_and_check_axiom = async () => {
        const portal = await loadJSON(PORTAL_URL);
        const rows = [];
        for (const g of portal.games) {
            try {
                const m = await loadJSON('/' + g.manifold);
                const dim = m.dimension || g.dimension || {};
                const { x, y, z } = dim;
                const computed = x * y;
                rows.push({ id: g.id, x, y, z, computed, pass: computed === z });
            } catch (e) {
                rows.push({ id: g.id, error: e.message, pass: false });
            }
        }
        const failed = rows.filter(r => !r.pass);
        return { rows, pass: failed.length === 0, summary:
            `${rows.length - failed.length} / ${rows.length} games satisfy z = x*y` };
    };

    // F2. Substrate purity. Call each substrate N times at the same point;
    // every result must equal the first.
    protocols.call_each_substrate_n_times_check_identity = async ({ N = 1000, points = null } = {}) => {
        if (!window.Manifold || !window.Manifold.surface) {
            throw new Error('window.Manifold.surface missing — /js/manifold.js did not load');
        }
        const S = window.Manifold.surface;
        const samplePoints = points || [
            [0, 0, 0], [0.5, 0.7, 1.2], [Math.PI / 2, Math.PI / 2, Math.PI / 2],
            [-1.3, 2.7, 0.4], [Math.PI, Math.PI, Math.PI],
        ];
        const subs = { gyroid: S.gyroid, diamond: S.diamond };
        const rows = [];
        for (const [name, fn] of Object.entries(subs)) {
            for (const p of samplePoints) {
                const first = fn(...p);
                let identical = true;
                for (let i = 1; i < N; i++) {
                    if (fn(...p) !== first) { identical = false; break; }
                }
                rows.push({ substrate: name, point: p, value: first, calls: N, pass: identical });
            }
        }
        return { rows, pass: rows.every(r => r.pass),
            summary: `${rows.filter(r => r.pass).length} / ${rows.length} (substrate × point) sets are identity-stable across ${N} calls` };
    };

    // F3. Determinism across reload. First visit persists baseline; every
    // subsequent visit recomputes and compares against the persisted bytes.
    protocols.compare_fresh_eval_to_persisted_first_visit = async () => {
        if (!window.Manifold || !window.Manifold.surface) throw new Error('Manifold not loaded');
        const S = window.Manifold.surface;
        const probes = [
            { name: 'gyroid(0.5,0.7,1.2)', fn: () => S.gyroid(0.5, 0.7, 1.2) },
            { name: 'diamond(0.5,0.7,1.2)', fn: () => S.diamond(0.5, 0.7, 1.2) },
            { name: 'gyroid(PI/2,PI/2,PI/2)', fn: () => S.gyroid(Math.PI / 2, Math.PI / 2, Math.PI / 2) },
        ];
        const KEY = 'proof_f3_baseline_v1';
        let baseline = null;
        try { baseline = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { }
        const fresh = probes.map(p => ({ name: p.name, value: p.fn() }));
        let firstVisit = false;
        if (!baseline) {
            baseline = { recordedAt: new Date().toISOString(), values: fresh };
            try { localStorage.setItem(KEY, JSON.stringify(baseline)); } catch (_) { }
            firstVisit = true;
        }
        const rows = fresh.map((f, i) => ({
            name: f.name, fresh: f.value,
            baseline: baseline.values[i] ? baseline.values[i].value : null,
            pass: baseline.values[i] && f.value === baseline.values[i].value,
        }));
        return { rows, baseline_recorded_at: baseline.recordedAt, first_visit: firstVisit,
            pass: rows.every(r => r.pass),
            summary: firstVisit
                ? 'First visit — baseline persisted. Reload this page to verify cross-reload determinism.'
                : `${rows.filter(r => r.pass).length} / ${rows.length} probes match the baseline recorded at ${baseline.recordedAt}` };
    };

    // F5. Registry / source agreement. Compare js/manifold.registry.json
    // against each game's source manifold.game.json, dimension by dimension.
    protocols.diff_registry_against_each_source_manifest = async () => {
        const reg = await loadJSON(REGISTRY_URL);
        const portal = await loadJSON(PORTAL_URL);
        const rows = [];
        for (const g of portal.games) {
            const r = reg.games.find(x => x.id === g.id);
            if (!r) { rows.push({ id: g.id, pass: false, reason: 'absent from registry' }); continue; }
            try {
                const src = await loadJSON('/' + g.manifold);
                const sd = src.dimension || g.dimension || {};
                const rd = r.dimension || {};
                const drift = ['x', 'y', 'z'].filter(k => sd[k] !== rd[k]);
                rows.push({ id: g.id, source: sd, registry: rd, pass: drift.length === 0,
                    drift: drift.length ? drift : null });
            } catch (e) {
                rows.push({ id: g.id, pass: false, reason: e.message });
            }
        }
        return { rows, pass: rows.every(r => r.pass),
            summary: `${rows.filter(r => r.pass).length} / ${rows.length} games agree between registry and source` };
    };

    // Public API
    window.ProofRunner = {
        loadSeed: () => loadJSON(SEED_URL),
        loadJSON,
        protocols,
        run: async (claimId, opts) => {
            const seed = await loadJSON(SEED_URL);
            const claim = seed.claims.find(c => c.id === claimId);
            if (!claim) throw new Error('unknown claim ' + claimId);
            const proto = protocols[claim.protocol];
            if (!proto) return { claim, not_implemented: true,
                pass: null, summary: 'protocol "' + claim.protocol + '" not yet implemented in proof-runner.js' };
            const t0 = performance.now();
            const result = await proto(opts);
            const ms = (performance.now() - t0).toFixed(2);
            return { claim, ran_at: new Date().toISOString(), elapsed_ms: ms, ...result };
        },
    };
})();
