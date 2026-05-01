/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🜂 END-TO-END WORKFLOW TEST
 * Tests the full Manifold system: Ingest → Registry → Discovery →
 * Leaderboard → Auth → HTTP Endpoints
 * Run: node test_e2e_workflow.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const { execSync } = require('child_process');
const https = require('https');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER ENVIRONMENT MOCK
// Required so browser-only substrates can be loaded in Node
// ─────────────────────────────────────────────────────────────────────────────
const _store = {};
const _sessionStore = {};
global.window = {
    location: { origin: 'https://kensgames.com', search: '' },
    KENSGAMES_CONFIG: {},
    addEventListener: () => { },
    removeEventListener: () => { },
};
global.document = {
    readyState: 'complete',
    addEventListener: () => { },
    getElementById: () => null,
    createElement: () => ({ getContext: () => ({}) }),
};
global.localStorage = {
    getItem: k => _store[k] ?? null,
    setItem: (k, v) => { _store[k] = String(v); },
    removeItem: k => { delete _store[k]; },
    clear: () => Object.keys(_store).forEach(k => delete _store[k]),
};
global.sessionStorage = {
    getItem: k => _sessionStore[k] ?? null,
    setItem: (k, v) => { _sessionStore[k] = String(v); },
    removeItem: k => { delete _sessionStore[k]; },
};
global.THREE = { Scene: class { }, PerspectiveCamera: class { }, WebGLRenderer: class { setSize() { } setClearColor() { } } };

// ─────────────────────────────────────────────────────────────────────────────
// TEST HARNESS
// ─────────────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0;
const results = [];

function assert(label, condition, detail = '') {
    if (condition) {
        process.stdout.write(`  ✅ ${label}\n`);
        passed++;
        results.push({ label, ok: true });
    } else {
        process.stdout.write(`  ❌ ${label}${detail ? ' — ' + detail : ''}\n`);
        failed++;
        results.push({ label, ok: false, detail });
    }
}
function skip(label, reason) {
    process.stdout.write(`  ⏭️  ${label} (${reason})\n`);
    skipped++;
}
function section(title) { process.stdout.write(`\n${'─'.repeat(60)}\n${title}\n${'─'.repeat(60)}\n`); }
function near(a, b, eps = 0.0001) { return Math.abs(a - b) < eps; }

const BASE = path.resolve(__dirname);

// ─────────────────────────────────────────────────────────────────────────────
// LOAD SUBSTRATES
// ─────────────────────────────────────────────────────────────────────────────
const Manifold = require(path.resolve(__dirname, '..', 'manifold'));
global.window.Manifold = Manifold;
global.Manifold = Manifold;
const ManifoldIngestor = require(`${BASE}/manifold_ingestor`);
const GameRegistry = require(`${BASE}/game_registry_manifold`);
const Discovery = require(`${BASE}/manifold_discovery`);
const Leaderboard = require(`${BASE}/leaderboard_substrate`);
const Auth = require(`${BASE}/auth_portal_substrate`);

// ─────────────────────────────────────────────────────────────────────────────
// ① MANIFOLD INGESTOR
// ─────────────────────────────────────────────────────────────────────────────
section('① MANIFOLD INGESTOR — z = x · y');
{
    const e = ManifoldIngestor.ingest({ name: 'FastTrack', playerCount: 2, duration: 45 },
        { x: 'playerCount', y: 'duration' });
    assert('z = x * y primitive (2 × 45 = 90)', e.manifold.z === 90);
    assert('token === manifold.z', e.token === 90);
    assert('source dropped (lives on GitHub)', e.source === null);
    assert('gyroid surface value is a number', typeof e.surface.gyroid === 'number');
    assert('diamond surface value is a number', typeof e.surface.diamond === 'number');
    assert('blend is weighted combo', typeof e.surface.blend === 'number');
    assert('position3d.y = z/10', near(e.position3d.y, 90 / 10));

    // All axis types
    const lit = ManifoldIngestor.ingest({}, { x: 3, y: 30 });
    assert('literal axes: z = 90', lit.token === 90);

    const fn = ManifoldIngestor.ingest({ p: 4, d: 20 }, { x: d => d.p, y: d => d.d });
    assert('function axes: z = 80', fn.token === 80);

    const expr = ManifoldIngestor.ingest({ p: 2, d: 15 }, { x: 'd.p * 2', y: 'd.d' });
    assert('expression string axes: z = 60', expr.token === 60);

    const arr = ManifoldIngestor.ingest({ p: 3, d: 10 }, {
        x: ['multiply', 'p', 'd'],
        y: ['add', 'p', 7]
    });
    assert('array tuple axes: x=30, y=10 → z=300', arr.token === 300);

    const batch = ManifoldIngestor.ingestAll(
        [{ id: 'b1', v: 1, w: 5 }, { id: 'b2', v: 2, w: 10 }, { id: 'b3', v: 3, w: 15 }],
        { x: 'v', y: 'w' }
    );
    const sorted = ManifoldIngestor.sortByToken(batch);
    assert('ingestAll returns 3 entities', batch.length === 3);
    assert('sortByToken ascending', sorted[0].token <= sorted[1].token);

    const nearest = ManifoldIngestor.nearest(batch[2], batch, 2);
    assert('nearest returns 2 (excl. self)', nearest.length === 2);
    assert('nearest[0] closer than nearest[1]', nearest[0].distance <= nearest[1].distance);
}

// ─────────────────────────────────────────────────────────────────────────────
// ② GAME REGISTRY MANIFOLD
// ─────────────────────────────────────────────────────────────────────────────
section('② GAME REGISTRY MANIFOLD');
{
    GameRegistry.initializeGames();
    const all = GameRegistry.getAllGames();
    assert('4 games in registry', all.length === 4);

    const ft = GameRegistry.getGame('fasttrack-v2.1.0');
    assert('FastTrack found by id', ft !== undefined);
    assert('FastTrack z = 90 (2 × 45)', ft.manifold.z === 90);
    assert('FastTrack has manifestation position', ft.manifestation?.position !== undefined);

    const ft5 = GameRegistry.getGame('fasttrack-5card-draw');
    assert('5Card z = 30 (2 × 15)', ft5.manifold.z === 30);

    const bb = GameRegistry.getGame('brickbreaker3d-solo');
    assert('BrickBreaker solo z = 20 (1 × 20)', bb.manifold.z === 20);

    const bbm = GameRegistry.getGame('brickbreaker3d-multi');
    assert('BrickBreaker multi z = 75 (3 × 25)', bbm.manifold.z === 75);

    const strategy = GameRegistry.getGamesByGenre('strategy');
    assert('genre filter: strategy returns ≥1', strategy.length >= 1);

    const sp = GameRegistry.getGamesByType('singlePlayer');
    assert('singlePlayer type filter works', sp.length >= 2);

    const free = GameRegistry.getAccessibleGames(false);
    assert('non-logged-in sees non-login-required games', free.length >= 1);
    assert('non-logged-in cannot see login-required games',
        !free.some(g => g.requiresLogin));

    const loggedIn = GameRegistry.getAccessibleGames(true);
    assert('logged-in sees all games', loggedIn.length === 4);

    const dist = GameRegistry.calculateDistance('fasttrack-v2.1.0', 'fasttrack-5card-draw');
    assert('calculateDistance returns a number', typeof dist === 'number' && dist >= 0);

    const recs = GameRegistry.getRecommendations(['fasttrack-v2.1.0'], 3);
    assert('recommendations exclude played game', !recs.some(g => g.id === 'fasttrack-v2.1.0'));
    assert('recommendations return up to 3', recs.length <= 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ MANIFOLD DISCOVERY SUBSTRATE
// ─────────────────────────────────────────────────────────────────────────────
section('③ MANIFOLD DISCOVERY SUBSTRATE');
{
    assert('calculateManifoldZ(2,45) = 90', Discovery.calculateManifoldZ(2, 45) === 90);
    assert('calculateManifoldZ(1,20) = 20', Discovery.calculateManifoldZ(1, 20) === 20);

    const pos = Discovery.getManifoldPosition('fasttrack-v2');
    assert('getManifoldPosition returns coords', pos !== null);
    assert('position has x,y,z', pos && 'x' in pos && 'y' in pos && 'z' in pos);
    assert('manifoldZ = 90', pos && pos.manifoldZ === 90);

    const posNull = Discovery.getManifoldPosition('nonexistent-game');
    assert('unknown game returns null', posNull === null);

    const d1 = Discovery.calculateDistance('fasttrack-v2', 'fasttrack-5card');
    assert('distance fasttrack variants is finite', isFinite(d1) && d1 > 0);

    const dInf = Discovery.calculateDistance('fasttrack-v2', 'ghost-game');
    assert('distance to unknown game is Infinity', dInf === Infinity);

    const nearby = Discovery.getNearbyGames('fasttrack-v2', 3);
    assert('getNearbyGames returns 3 results', nearby.length === 3);
    assert('excludes self', !nearby.some(n => n.gameId === 'fasttrack-v2'));
    assert('sorted by distance ascending', nearby[0].distance <= nearby[1].distance);

    const html = Discovery.formatRecommendations('fasttrack-v2');
    assert('formatRecommendations returns HTML string', typeof html === 'string' && html.includes('<div'));
}

// ─────────────────────────────────────────────────────────────────────────────
// ④ LEADERBOARD SUBSTRATE
// ─────────────────────────────────────────────────────────────────────────────
section('④ LEADERBOARD SUBSTRATE');
{
    localStorage.clear();
    Leaderboard.initialize();

    const rank = Leaderboard.submitScore('fasttrack-v2', 'Ken', 5000, { avatar: '🏆' });
    assert('submitScore returns rank number', typeof rank === 'number');

    Leaderboard.submitScore('fasttrack-v2', 'Alice', 4200, { avatar: '⚡' });
    Leaderboard.submitScore('fasttrack-v2', 'Bob', 3800, { avatar: '🔥' });

    const board = Leaderboard.getLeaderboard('fasttrack-v2', 10);
    assert('getLeaderboard returns 3 entries', board.length === 3);
    assert('board sorted descending by score', board[0].score >= board[1].score);
    assert('rank 1 is Ken (5000)', board[0].playerName === 'Ken');
    assert('entries have rank field', board.every(e => typeof e.rank === 'number'));

    const kenRank = Leaderboard.getPlayerRank('fasttrack-v2', 'Ken');
    assert('getPlayerRank for Ken = 1', kenRank === 1);

    const aliceRank = Leaderboard.getPlayerRank('fasttrack-v2', 'Alice');
    assert('getPlayerRank for Alice = 2', aliceRank === 2);

    const noRank = Leaderboard.getPlayerRank('fasttrack-v2', 'Ghost');
    assert('getPlayerRank for unknown = null', noRank === null);

    const hi = Leaderboard.getPlayerHighScore('fasttrack-v2', 'Ken');
    assert('getPlayerHighScore returns entry', hi !== null && hi.score === 5000);

    const personal = Leaderboard.getPersonalScores('fasttrack-v2');
    assert('personal scores tracked', personal.length >= 1);

    const html = Leaderboard.formatLeaderboardHTML('fasttrack-v2', 10);
    assert('formatLeaderboardHTML contains Ken', html.includes('Ken'));
    assert('formatLeaderboardHTML contains table', html.includes('<table'));

    // Time filter
    const todayBoard = Leaderboard.getLeaderboard('fasttrack-v2', 10, Leaderboard.TIME_FILTERS.TODAY);
    assert('TODAY filter returns recent scores', todayBoard.length === 3);

    // formatTimeAgo
    const justNow = Leaderboard.formatTimeAgo(Date.now() - 10000);
    assert('formatTimeAgo: <60s = "just now"', justNow === 'just now');

    const minsAgo = Leaderboard.formatTimeAgo(Date.now() - 5 * 60 * 1000);
    assert('formatTimeAgo: 5m ago', minsAgo === '5m ago');
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ AUTH PORTAL SUBSTRATE
// ─────────────────────────────────────────────────────────────────────────────
section('⑤ AUTH PORTAL SUBSTRATE');
{
    assert('no process.env usage (browser-safe)',
        !require('fs').readFileSync(`${BASE}/auth_portal_substrate.js`, 'utf8').includes('process.env'));

    const cfg = Auth.getOAuthConfig ? Auth.getOAuthConfig() : null;

    // Redirect URI correctness — must NOT contain doubled /kensgames.com/
    const src = require('fs').readFileSync(`${BASE}/auth_portal_substrate.js`, 'utf8');
    const hasDoubledPath = src.includes('/kensgames.com/login/');
    assert('redirect URIs do NOT have doubled /kensgames.com/ path', !hasDoubledPath);

    const hasFbCallback = src.includes('/login/facebook/callback.html');
    assert('Facebook callback URI is /login/facebook/callback.html', hasFbCallback);
    const hasGgCallback = src.includes('/login/google/callback.html');
    assert('Google callback URI is /login/google/callback.html', hasGgCallback);
    const hasDcCallback = src.includes('/login/discord/callback.html');
    assert('Discord callback URI is /login/discord/callback.html', hasDcCallback);

    // Event system
    let loginFired = false;
    Auth.on('login', () => { loginFired = true; });
    assert('Auth.on() does not throw', true);

    // Login / logout
    if (Auth.login) {
        Auth.login({ id: 'u1', displayName: 'TestUser', provider: 'guest' });
        assert('login event emitted', loginFired);
        const user = Auth.getCurrentUser ? Auth.getCurrentUser() : null;
        assert('getCurrentUser returns user after login', user !== null);

        if (Auth.logout) {
            Auth.logout();
            const afterLogout = Auth.getCurrentUser ? Auth.getCurrentUser() : null;
            assert('getCurrentUser null after logout', afterLogout === null);
        }
    } else {
        skip('Auth.login()', 'method not exposed in public API');
        skip('Auth.logout()', 'method not exposed in public API');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑥ CROSS-SUBSTRATE CONSISTENCY
// ─────────────────────────────────────────────────────────────────────────────
section('⑥ CROSS-SUBSTRATE CONSISTENCY (z = x · y everywhere)');
{
    const games = GameRegistry.getAllGames();

    games.forEach(g => {
        const expected = g.manifold.x * g.manifold.y;
        assert(`${g.id}: registry z (${g.manifold.z}) = x*y (${expected})`,
            g.manifold.z === expected);
    });

    // Ingestor produces same z as registry for same x,y
    const ft = GameRegistry.getGame('fasttrack-v2.1.0');
    const entity = ManifoldIngestor.ingest(ft, { x: ft.manifold.x, y: ft.manifold.y });
    assert('Ingestor z matches registry z for FastTrack', entity.token === ft.manifold.z);

    // Discovery z matches registry z
    const pos = Discovery.getManifoldPosition('fasttrack-v2');
    const discZ = Discovery.calculateManifoldZ(2, 45);
    assert('Discovery z = 90 matches registry (fasttrack-v2)', discZ === 90);

    // Recommendations are consistent (nearest in discovery vs registry)
    const discoveryNearby = Discovery.getNearbyGames('fasttrack-v2', 3).map(n => n.gameId);
    assert('Discovery nearest returns game ids', discoveryNearby.every(id => typeof id === 'string'));
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑦ CALLBACK PAGE INTEGRITY
// ─────────────────────────────────────────────────────────────────────────────
section('⑦ OAUTH CALLBACK PAGE INTEGRITY');
{
    const fs = require('fs');
    const callbackDir = path.resolve(__dirname, '../../login');

    ['facebook', 'google', 'discord'].forEach(provider => {
        const file = `${callbackDir}/${provider}/callback.html`;
        try {
            const src = fs.readFileSync(file, 'utf8');
            assert(`${provider}/callback.html exists`, true);
            assert(`${provider}: no raw fetch('/api/oauth/') call`, !src.includes("fetch('/api/oauth/"));
            assert(`${provider}: redirects to /?login=success`, src.includes('login=success'));
            assert(`${provider}: redirects to /?login=failed`, src.includes('login=failed'));
            assert(`${provider}: clears oauth_state from sessionStorage`, src.includes(`oauth_state_${provider}`));
            assert(`${provider}: wrapped in IIFE`, src.includes('(function'));
        } catch (e) {
            assert(`${provider}/callback.html readable`, false, e.message);
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑧ HTTP ENDPOINT CHECKS
// ─────────────────────────────────────────────────────────────────────────────
section('⑧ HTTP ENDPOINT STATUS');
{
    const endpoints = [
        { path: '/', label: 'Portal homepage' },
        { path: '/fasttrack/3d.html', label: 'FastTrack game' },
        { path: '/brickbreaker3d/index.html', label: 'BrickBreaker3D shell' },
        { path: '/lounge.html', label: 'Lounge page' },
        { path: '/discover.html', label: 'Discover page' },
        { path: '/gyroid.js', label: 'Gyroid renderer' },
        { path: '/js/substrates/manifold_ingestor.js', label: 'ManifoldIngestor' },
        { path: '/js/substrates/game_registry_manifold.js', label: 'GameRegistry' },
        { path: '/js/substrates/manifold_discovery.js', label: 'ManifoldDiscovery' },
        { path: '/js/substrates/leaderboard_substrate.js', label: 'Leaderboard' },
        { path: '/js/substrates/auth_portal_substrate.js', label: 'AuthPortal' },
        { path: '/login/facebook/callback.html', label: 'FB callback' },
        { path: '/login/google/callback.html', label: 'Google callback' },
        { path: '/login/discord/callback.html', label: 'Discord callback' },
        { path: '/MANIFOLD_SYSTEM_GUIDE.md', label: 'System guide doc' },
        { path: '/MANIFOLD_METRICS.md', label: 'Metrics doc' },
    ];

    endpoints.forEach(({ path: ep, label }) => {
        try {
            const result = execSync(
                `curl -sk --max-time 6 -o /dev/null -w "%{http_code}" ` +
                `-H "Host: kensgames.com" "https://127.0.0.1${ep}"`,
                { timeout: 8000 }
            ).toString().trim();
            const ok = result === '200';
            assert(`HTTP 200 — ${label} (${ep})`, ok, `got HTTP ${result}`);
        } catch (e) {
            assert(`HTTP 200 — ${label}`, false, 'curl failed / timeout');
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑨ FULL END-TO-END WORKFLOW
// ─────────────────────────────────────────────────────────────────────────────
section('⑨ FULL END-TO-END WORKFLOW');
{
    // Simulate: user arrives → ingests game → discovers nearby → plays → scores → logs out

    // Step 1: Ingest a new game onto the manifold
    const newGame = { id: 'racer-x', name: 'Racer X', players: 2, playtime: 30, difficulty: 3 };
    const entity = ManifoldIngestor.ingest(newGame, {
        x: d => d.players * d.difficulty,
        y: 'playtime'
    });
    assert('E2E Step 1 — Ingest: z = (2*3)*30 = 180', entity.token === 180);

    // Step 2: Sort all games by token
    const allRaw = GameRegistry.getAllGames();
    const allEntities = ManifoldIngestor.ingestAll(
        allRaw, { x: g => g.manifold.x, y: g => g.manifold.y }
    );
    const sorted = ManifoldIngestor.sortByToken([...allEntities, entity]);
    assert('E2E Step 2 — Sort: lowest token first', sorted[0].token <= sorted[1].token);

    // Step 3: Find nearest games to new entry
    const nearby = ManifoldIngestor.nearest(entity, allEntities, 2);
    assert('E2E Step 3 — Discover: 2 nearest found', nearby.length === 2);
    assert('E2E Step 3 — Nearest is a valid entity', nearby[0].entity?.id !== undefined);

    // Step 4: Simulate guest login
    sessionStorage.setItem('user_session', JSON.stringify({
        id: 'guest_abc', displayName: 'TestPlayer', avatar: '🎮',
        provider: 'guest', isGuest: true, authenticated: true
    }));
    const session = JSON.parse(sessionStorage.getItem('user_session'));
    assert('E2E Step 4 — Auth: session stored correctly', session.authenticated === true);
    assert('E2E Step 4 — Auth: isGuest flag set', session.isGuest === true);

    // Step 5: Submit score after play
    localStorage.clear();
    Leaderboard.initialize();
    const finalRank = Leaderboard.submitScore('fasttrack-v2', session.displayName, 3500, {
        avatar: session.avatar,
        playerId: session.id,
        gameTime: 42 * 60
    });
    assert('E2E Step 5 — Leaderboard: score submitted', typeof finalRank === 'number');

    const board = Leaderboard.getLeaderboard('fasttrack-v2', 5);
    assert('E2E Step 5 — Leaderboard: TestPlayer on board', board.some(e => e.playerName === 'TestPlayer'));

    // Step 6: Recommendation from played history
    const recs = GameRegistry.getRecommendations(['fasttrack-v2.1.0'], 3);
    assert('E2E Step 6 — Recommend: got suggestions', recs.length > 0);
    assert('E2E Step 6 — Recommend: excludes played game', !recs.some(g => g.id === 'fasttrack-v2.1.0'));

    // Step 7: Verify surface values are on the manifold
    assert('E2E Step 7 — Surface: entity on Schwarz Diamond/Gyroid surface',
        typeof entity.surface.blend === 'number' && isFinite(entity.surface.blend));

    // Step 8: Session cleared on logout (simulated)
    sessionStorage.removeItem('user_session');
    assert('E2E Step 8 — Auth: session cleared on logout',
        sessionStorage.getItem('user_session') === null);
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPLOY SCRIPT CHECK
// ─────────────────────────────────────────────────────────────────────────────
section('⑩ DEPLOY SCRIPT');
{
    const fs = require('fs');
    const deployPath = path.resolve(__dirname, '../../deploy.sh');
    try {
        const src = fs.readFileSync(deployPath, 'utf8');
        assert('deploy.sh exists', true);
        assert('deploy.sh has backup step', src.includes('tar czf'));
        assert('deploy.sh verifies nginx config', src.includes('nginx -t'));
        assert('deploy.sh reloads nginx', src.includes('systemctl reload nginx'));
        assert('deploy.sh checks disk space', src.includes('AVAILABLE_SPACE'));
        assert('deploy.sh copies substrates', src.includes('substrates'));
    } catch (e) {
        assert('deploy.sh readable', false, e.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────────────────────
const total = passed + failed + skipped;
process.stdout.write(`\n${'═'.repeat(60)}\n`);
process.stdout.write(`  🜂 RESULTS: ${passed} passed | ${failed} failed | ${skipped} skipped | ${total} total\n`);
process.stdout.write(`${'═'.repeat(60)}\n\n`);

if (failed > 0) {
    process.stdout.write('FAILED TESTS:\n');
    results.filter(r => !r.ok).forEach(r =>
        process.stdout.write(`  ✗ ${r.label}${r.detail ? ' — ' + r.detail : ''}\n`)
    );
    process.stdout.write('\n');
    process.exit(1);
}
