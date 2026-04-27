/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ROUND 3 SMOKE — substrate lens reversal
 *
 * Verifies that every substrate instantiated through the registry inherits
 * the field / loop / seedLog wiring, and that:
 *
 *   1. extract(coordinate) returns a field view (value, gradient, point)
 *      even when the manifold has nothing stored at that coordinate.
 *   2. Stored data still wins on collisions — back-compat with existing
 *      validators in audio / physics / etc.
 *   3. observe(seed, intent) drives a full observe → solve → collapse →
 *      bloom cycle and the bloom lands in the seed log.
 *   4. The reversal is uniform across all 12 manifold-core substrates.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const path = require('path');
const Manifold = require(path.resolve(__dirname, '../js/manifold.js'));
const SubstrateBase = require(path.resolve(__dirname, '../js/manifold-core/substrate_base.js'));
const Registry = require(path.resolve(__dirname, '../js/manifold-core/substrate_registry.js'));

// Make the base globally visible so the substrate files can extend it
// (their `class X extends SubstrateBase` references the global symbol).
global.SubstrateBase = SubstrateBase;

const SUB_DIR = path.resolve(__dirname, '../js/manifold-core');
const SUBSTRATES = [
  ['ai', 'ai_substrate.js', 'AISubstrate'],
  ['audio', 'audio_substrate.js', 'AudioSubstrate'],
  ['controlmapping', 'controlmapping_substrate.js', 'ControlMappingSubstrate'],
  ['gamelogic', 'gamelogic_substrate.js', 'GameLogicSubstrate'],
  ['graphics', 'graphics_substrate.js', 'GraphicsSubstrate'],
  ['login', 'login_substrate.js', 'LoginSubstrate'],
  ['multiplayer', 'multiplayer_substrate.js', 'MultiplayerSubstrate'],
  ['persistence', 'persistence_substrate.js', 'PersistenceSubstrate'],
  ['physics', 'physics_substrate.js', 'PhysicsSubstrate'],
  ['session', 'session_substrate.js', 'SessionSubstrate'],
  ['ui', 'ui_substrate.js', 'UISubstrate'],
];

let pass = 0, fail = 0;
const log = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); ok ? pass++ : fail++; };
const section = (s) => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 70 - s.length)));

// ── Wire registry to the unified manifold ─────────────────────────────────
section('wire-up');
log(!!Manifold.field, 'Manifold.field present');
log(!!Manifold.loop, 'Manifold.loop present');
log(!!Manifold.seedLog, 'Manifold.seedLog present');

const seedLog = Manifold.seedLog.memory();
Registry.initialize(Manifold, { field: Manifold.field, loop: Manifold.loop, seedLog: seedLog });

// ── Register every manifold-core substrate ────────────────────────────────
section('register');
for (const [name, file, klass] of SUBSTRATES) {
  try {
    const Cls = require(path.join(SUB_DIR, file));
    Registry.register(name, Cls);
    log(true, `registered ${name} (${klass})`);
  } catch (e) {
    log(false, `register ${name}: ${e.message}`);
  }
}

// ── Reversal: observeField is the universal lens — every substrate has it ─
section('observeField — universal lens across all substrates');
const seed = [3, 1, 4, 1, 5, 9];
for (const [name] of SUBSTRATES) {
  let view;
  try { view = Registry.observeField(name, seed); }
  catch (e) { log(false, `${name} observeField: ${e.message}`); continue; }
  const hasPoint = view && view.point && typeof view.point.x === 'number';
  const hasValue = view && typeof view.value === 'number';
  const hasGrad = view && view.gradient && typeof view.gradient.x === 'number';
  log(hasPoint && hasValue && hasGrad,
    `${name}.observeField → point=(${view && view.point ? view.point.x.toFixed(3) : '?'}, …) value=${view && typeof view.value === 'number' ? view.value.toFixed(3) : '?'}`);
}

// ── Consumer adoption: audio + physics extract() now layers the field view ─
section('extract — consumers layer field view on domain transform');
const audioView = Registry.get('audio').extract(seed);
log(audioView && audioView.point && typeof audioView.value === 'number',
  `audio.extract has field point + value (value=${audioView && typeof audioView.value === 'number' ? audioView.value.toFixed(3) : '?'})`);
log(audioView && audioView.music && typeof audioView.masterVolume === 'number',
  'audio.extract still returns domain shape (music, masterVolume)');

const physView = Registry.get('physics').extract(seed);
log(physView && physView.point && typeof physView.value === 'number',
  `physics.extract has field point + value (value=${physView && typeof physView.value === 'number' ? physView.value.toFixed(3) : '?'})`);
log(physView && Array.isArray(physView.bodies) && typeof physView.gravity === 'number',
  'physics.extract still returns domain shape (bodies, gravity)');

// ── Back-compat: stored data still wins on collision via base merge ───────
section('extract — storage overrides field on collision');
Manifold.write(seed, { value: 'STORED_SENTINEL', custom: 42 });
const baseInst = new SubstrateBase(Manifold, { _field: Manifold.field, _loop: Manifold.loop, _seedLog: seedLog });
const overlaid = baseInst.extract(seed);
log(overlaid.value === 'STORED_SENTINEL', `stored .value wins (got ${JSON.stringify(overlaid.value)})`);
log(overlaid.custom === 42, 'stored .custom passed through');
log(overlaid.point && typeof overlaid.point.x === 'number',
  'field .point still present alongside stored fields');

// ── Loop reversal: observe(seed, intent) → bloom on the log ───────────────
section('observe — full loop cycle, bloom appended');
const before = seedLog.count();
const cyc = Registry.observe('physics', [2, 7, 1, 8], [1, 0, -1]);
log(!!cyc, 'cycle returned');
log(cyc && cyc.obs && Array.isArray(cyc.obs.seed), 'cycle.obs has seed');
log(cyc && Array.isArray(cyc.y), 'cycle.y is operator vector');
log(cyc && cyc.z && typeof cyc.z.scalar === 'number', `z.scalar = ${cyc && cyc.z ? cyc.z.scalar.toExponential(3) : '?'}`);
log(cyc && cyc.x && typeof cyc.x.id === 'string', `bloom id = ${cyc && cyc.x ? cyc.x.id : '?'}`);
log(seedLog.count() === before + 1, `seedLog appended (${before} → ${seedLog.count()})`);

// ── Determinism: same seed/intent → same bloom id ─────────────────────────
section('determinism');
const a = Registry.observe('audio', [1, 2, 3], [0, 1, 0]);
const b = Registry.observe('audio', [1, 2, 3], [0, 1, 0]);
log(a && b && a.x.id === b.x.id, `same input → same bloom id (${a && a.x ? a.x.id : '?'})`);

// ── Summary ───────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(74));
console.log(`  ROUND 3: ${pass} passed, ${fail} failed`);
console.log('═'.repeat(74));
process.exit(fail === 0 ? 0 : 1);
