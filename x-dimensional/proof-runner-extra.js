/* /x-dimensional/proof-runner-extra.js
 * Protocols F4, F6, F7. Loaded after proof-runner.js; registers more
 * functions on window.ProofRunner.protocols. Same scientific contract:
 * every value displayed is a live return value; no copies, no mocks.
 */
(function () {
    'use strict';
    if (!window.ProofRunner) throw new Error('proof-runner.js must load first');
    const P = window.ProofRunner.protocols;
    const J = window.ProofRunner.loadJSON;

    // F4. Manifest is source of truth. For each game, fetch its
    // manifold.game.json and the game JS file, then verify each
    // params.* key appears as a string token in the JS source.
    // (Mirrors tests/manifold-params.test.js but runs in the browser
    // against the live deployed source.)
    P.diff_manifest_params_against_runtime_window_globals = async () => {
        const portal = await J('/manifold.portal.json');
        const rows = [];
        const targets = [
            { id: 'fasttrack', js: '/fasttrack/fasttrack-game-core.js' },
            { id: 'brickbreaker3d', js: '/brickbreaker3d/game.js' },
            { id: '4dtictactoe', js: '/4DTicTacToe/game.js' },
        ];
        for (const t of targets) {
            const g = portal.games.find(x => x.id === t.id);
            if (!g) { rows.push({ id: t.id, pass: false, reason: 'not in portal' }); continue; }
            try {
                const m = await J('/' + g.manifold);
                const src = await (await fetch(t.js, { cache: 'no-store' })).text();
                const params = m.params || {};
                const keys = Object.keys(params);
                const consumed = keys.filter(k => src.includes(k));
                rows.push({
                    id: t.id, params_total: keys.length,
                    consumed: consumed.length, missing: keys.filter(k => !consumed.includes(k)),
                    pass: keys.length > 0 && consumed.length === keys.length,
                });
            } catch (e) {
                rows.push({ id: t.id, pass: false, reason: e.message });
            }
        }
        return { rows, pass: rows.every(r => r.pass),
            summary: `${rows.filter(r => r.pass).length} / ${rows.length} sampled games consume every declared params.* key in their game JS source` };
    };

    // F6. Algebraic invertibility. Generate random (x, y) tuples,
    // compute z under each relation, then extract x and y back from the
    // result. Both must round-trip within EPS.
    P.verify_relation_inverses_over_random_samples = async ({ N = 50 } = {}) => {
        const EPS = 1e-9;
        const ae = (a, b) => Math.abs(a - b) < EPS;
        const denom = (v) => (Number.isFinite(v) && v !== 0) ? v : 1;
        const tests = [
            { name: 'z=xy', forward: (x, y) => x * y,
              recoverX: (z, y) => z / denom(y), recoverY: (z, x) => z / denom(x) },
            { name: 'z=xy^2', forward: (x, y) => x * y * y,
              recoverX: (z, y) => z / (denom(y) * denom(y)),
              recoverY: (z, x) => Math.sign(x) * Math.sqrt(Math.abs(z / denom(x))) },
            { name: 'z=x/y', forward: (x, y) => x / denom(y),
              recoverX: (z, y) => z * denom(y), recoverY: (z, x) => x / denom(z) },
        ];
        const rows = [];
        for (const t of tests) {
            let ok = 0, fail = 0;
            const failures = [];
            for (let i = 0; i < N; i++) {
                const x = (Math.random() - 0.5) * 100;
                const y = ((Math.random() - 0.5) * 10) || 1;
                const z = t.forward(x, y);
                const xr = t.recoverX(z, y);
                const yr = t.recoverY(z, x);
                const passX = ae(xr, x);
                const passY = (t.name === 'z=xy^2') ? ae(yr * yr, y * y) : ae(yr, y);
                if (passX && passY) ok++;
                else { fail++; if (failures.length < 3) failures.push({ x, y, z, xr, yr, passX, passY }); }
            }
            rows.push({ relation: t.name, samples: N, ok, fail, failures, pass: fail === 0 });
        }
        return { rows, pass: rows.every(r => r.pass),
            summary: `${rows.filter(r => r.pass).length} / ${rows.length} relation families round-trip correctly over ${N} random samples each` };
    };

    // F7. Observability of state. SCOPED ADMISSION protocol — does not
    // claim what it cannot prove. For each declared game, report:
    //   - whether substrate observation is testable in-browser (proven)
    //   - whether full state derivation is in scope (admission)
    P.scoped_observation_proof_per_game = async () => {
        const portal = await J('/manifold.portal.json');
        const scope = {
            cubic3d: { full: true, note: 'pure substrate viewer; entire visible state is f(x,y,z) at observer position' },
            fasttrack: { full: false, partial: true,
                note: 'substrate (Schwarz Diamond renderer) observable; lobby/turn state is mediated by server and out of scope here' },
            starfighter: { full: false, partial: true,
                note: 'substrate (manifold lens) observable; AI NPC state and multiplayer sync out of scope here' },
            brickbreaker3d: { full: false, partial: false,
                note: 'not yet instrumented for in-browser substrate observation; substrate code present, observation harness not built' },
            '4dtictactoe': { full: false, partial: false,
                note: 'observation hooks not yet implemented' },
            assemble: { full: false, partial: false,
                note: 'observation hooks not yet implemented' },
        };
        const rows = [];
        let liveProbe = null;
        if (window.Manifold && window.Manifold.surface) {
            liveProbe = {
                gyroid_at_origin: window.Manifold.surface.gyroid(0, 0, 0),
                diamond_at_origin: window.Manifold.surface.diamond(0, 0, 0),
                gyroid_at_pi_halves: window.Manifold.surface.gyroid(Math.PI / 2, Math.PI / 2, Math.PI / 2),
            };
        }
        for (const g of portal.games) {
            const s = scope[g.id] || { full: false, partial: false, note: 'no entry' };
            rows.push({ id: g.id, full_proof: s.full, partial_proof: s.partial, note: s.note });
        }
        const proven = rows.filter(r => r.full_proof).length;
        const partial = rows.filter(r => r.partial_proof).length;
        return {
            rows, live_substrate_probe: liveProbe,
            pass: null,
            summary: `Full proof: ${proven} game(s). Partial: ${partial}. Remainder: not yet instrumented. Status is admission, not theatre.`,
        };
    };
})();
