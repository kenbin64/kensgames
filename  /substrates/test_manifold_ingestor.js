/**
 * Tests for ManifoldIngestor
 * Run: node test_manifold_ingestor.js
 */

const ManifoldIngestor = require('./manifold_ingestor');

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function near(a, b, eps = 0.0001) { return Math.abs(a - b) < eps; }

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n🜂 MANIFOLD INGESTOR TEST SUITE\n');

// ─────────────────────────────────────────────────────────────────────────────
console.log('① PRIMITIVE: z = x · y');
{
  const game = { playerCount: 4, duration: 45 };
  const e = ManifoldIngestor.ingest(game, { x: 'playerCount', y: 'duration' });

  assert('x resolved from property path', e.manifold.x === 4);
  assert('y resolved from property path', e.manifold.y === 45);
  assert('z = x * y (THE PRIMITIVE)', e.manifold.z === 180);
  assert('token === z', e.token === 180);
  assert('source dropped (equation replaces it)', e.source === null);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n② AXIS TYPES — literal, function, expression string, array');
{
  const data = { players: 2, difficulty: 3, duration: 30 };

  // Literal
  const e1 = ManifoldIngestor.ingest(data, { x: 6, y: 10 });
  assert('literal x=6, y=10 → z=60', e1.manifold.z === 60);

  // Function
  const e2 = ManifoldIngestor.ingest(data, {
    x: d => d.players * d.difficulty,
    y: d => d.duration
  });
  assert('function x=players*difficulty=6, y=30 → z=180', e2.manifold.z === 180);

  // Expression string
  const e3 = ManifoldIngestor.ingest(data, {
    x: 'd.players * d.difficulty',
    y: 'duration'
  });
  assert('expression string x=6, y=30 → z=180', e3.manifold.z === 180);

  // Array expression tuple
  const e4 = ManifoldIngestor.ingest(data, {
    x: ['multiply', 'players', 'difficulty'],
    y: ['add', 'duration', 10]
  });
  assert('array expr x=6, y=40 → z=240', e4.manifold.z === 240);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n③ NESTED PROPERTY PATH');
{
  const data = { meta: { score: 5 }, time: 20 };
  const e = ManifoldIngestor.ingest(data, { x: 'meta.score', y: 'time' });
  assert('nested path meta.score=5, time=20 → z=100', e.manifold.z === 100);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n④ SURFACE GEOMETRY — Schwarz Diamond + Gyroid');
{
  const e = ManifoldIngestor.ingest({}, { x: 2, y: 45 });
  assert('gyroid value is a number', typeof e.surface.gyroid === 'number');
  assert('diamond value is a number', typeof e.surface.diamond === 'number');
  assert('blend value is a number', typeof e.surface.blend === 'number');

  // Gyroid formula: sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x)
  const sx = (2 / 10) * Math.PI;
  const sy = (45 / 10) * Math.PI;
  const sz = (90 / 100) * Math.PI;
  const expected = Math.sin(sx) * Math.cos(sy) + Math.sin(sy) * Math.cos(sz) + Math.sin(sz) * Math.cos(sx);
  assert('gyroid formula correct', near(e.surface.gyroid, expected));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑤ 3D POSITION');
{
  const e = ManifoldIngestor.ingest({}, { x: 2, y: 45 });
  assert('position3d.x is a number', typeof e.position3d.x === 'number');
  assert('position3d.y is a number', typeof e.position3d.y === 'number');
  assert('position3d.z is a number', typeof e.position3d.z === 'number');
  assert('position3d.y = z/10 = 9', near(e.position3d.y, 90 / 10));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑥ BATCH INGEST + SORT BY TOKEN');
{
  const games = [
    { name: 'A', players: 1, duration: 20 },
    { name: 'B', players: 4, duration: 45 },
    { name: 'C', players: 2, duration: 15 },
  ];
  const schema = { x: 'players', y: 'duration' };
  const entities = ManifoldIngestor.ingestAll(games, schema);
  const sorted = ManifoldIngestor.sortByToken(entities);

  assert('ingestAll returns 3 entities', entities.length === 3);
  assert('tokens: A=20, B=180, C=30',
    entities[0].token === 20 && entities[1].token === 180 && entities[2].token === 30);
  assert('sortByToken: ascending order',
    sorted[0].token <= sorted[1].token && sorted[1].token <= sorted[2].token);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑦ NEAREST NEIGHBORS');
{
  const schema = { x: 'players', y: 'duration' };
  const pool = ManifoldIngestor.ingestAll([
    { id: 'ft', name: 'FastTrack', players: 2, duration: 45 },
    { id: 'bb', name: 'BrickBreaker', players: 1, duration: 20 },
    { id: 'ft5', name: 'FastTrack5', players: 2, duration: 15 },
  ], schema);

  const target = pool.find(e => e.id === 'ft');
  const nearby = ManifoldIngestor.nearest(target, pool, 2);

  assert('nearest returns 2 results (excl. self)', nearby.length === 2);
  assert('nearest has distance field', typeof nearby[0].distance === 'number');
  assert('nearest[0] is closer than nearest[1]',
    nearby[0].distance <= nearby[1].distance);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑧ SCHEMA VALIDATION');
{
  const v1 = ManifoldIngestor.validateSchema({ x: 1, y: 2 });
  const v2 = ManifoldIngestor.validateSchema({ x: 1 });
  assert('valid schema passes', v1.valid === true);
  assert('missing y fails with message', v2.valid === false && v2.errors.length === 1);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑨ REAL-WORLD: GAME PORTAL USE CASE');
{
  const games = [
    { id: 'fasttrack-v2', title: 'FastTrack', playerCount: 2, duration: 45, difficulty: 3 },
    { id: 'fasttrack-5card', title: 'FastTrack 5 Card', playerCount: 2, duration: 15, difficulty: 2 },
    { id: 'brickbreaker-solo', title: 'BrickBreaker Solo', playerCount: 1, duration: 20, difficulty: 1 },
    { id: 'brickbreaker-multi', title: 'BrickBreaker Multi', playerCount: 3, duration: 25, difficulty: 2 },
  ];

  // x = playerCount, y = duration — simple game portal schema
  const entities = ManifoldIngestor.ingestAll(games, { x: 'playerCount', y: 'duration' });
  const ft = entities.find(e => e.id === 'fasttrack-v2');
  const bb = entities.find(e => e.id === 'brickbreaker-solo');

  assert('FastTrack z=90', ft.token === 90);
  assert('BrickBreaker z=20', bb.token === 20);
  assert('both have surface data', ft.surface.blend !== undefined);

  // Advanced schema: x = playerCount * difficulty (richer signal)
  const richEntities = ManifoldIngestor.ingestAll(games, {
    x: d => d.playerCount * d.difficulty,
    y: 'duration'
  });
  const ftRich = richEntities.find(e => e.id === 'fasttrack-v2');
  assert('rich schema: FastTrack x=6, y=45 → z=270', ftRich.token === 270);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}\n`);

if (failed > 0) process.exit(1);
