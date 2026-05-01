/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 MANIFOLD CONDUCTOR — game state becomes the parent x of the music
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   x  = the game state vector (per-game lens supplies the components)
 *   y  = the field at the point that vector projects to
 *   z  = the section bloom — bass weight, tempo, density, brightness
 *   x' = the next section's seed (so music walks the manifold by itself)
 *
 * The conductor doesn't know what the numbers in the state vector mean. It
 * only knows that *more = more* — bigger magnitude → more energy. Per-game
 * lenses (`starfighter.js`, `fasttrack.js`, …) decide which signals to feed.
 *
 * Tick the conductor every ~250 ms while the game is live. Each tick observes
 * the current state, blooms one section, and renders one Stream segment via
 * the instrument. Continuous, deterministic, no music director.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function (root, factory) {
  'use strict';
  const C = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  if (root) root.ManifoldConductor = C;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  function _resolve(globalName, modulePath) {
    if (typeof window !== 'undefined' && window[globalName]) return window[globalName];
    if (typeof globalThis !== 'undefined' && globalThis[globalName]) return globalThis[globalName];
    if (typeof require === 'function') {
      try { return require(modulePath); } catch (e) { /* not on Node path */ }
    }
    return null;
  }
  const FIELD = _resolve('ManifoldField',      './manifold-field.js');
  const LOOP  = _resolve('ManifoldLoop',       './manifold-loop.js');
  const INSTR = _resolve('ManifoldInstrument', './manifold-instrument.js');

  // observeIntensity — project a state vector onto a single intensity scalar
  // in [0, 1]. The vector is the parent x; the field at its point is y; the
  // |z| / (1 + |z|) sigmoid normalizes to a usable weight.
  function observeIntensity(stateVector) {
    if (!Array.isArray(stateVector) || !stateVector.length) return 0;
    const obs = LOOP.observe({ seed: stateVector }, { t: 0.5 });
    const z = LOOP.collapse({ seed: stateVector }, LOOP.solve(obs, [1, 1, 1, 1, 1, 1, 1, 1]));
    const a = Math.abs(z.scalar);
    return a / (1 + a);
  }

  // sectionFromState — bloom one music section from the current state.
  // Returns the bloom (so the next tick can chain it) and the parameters
  // a renderer should honor: bpm, density (notes per section), brightness,
  // bass weight. Scale comes from the manifold region the bloom lands in.
  function sectionFromState(parentX, stateVector, opts) {
    const intent = stateVector.slice();
    const log = (opts && opts.log) || null;
    const turn = LOOP.cycle(parentX, intent, log, { t: 0.5 });
    const intensity = observeIntensity(stateVector);
    const scale = INSTR.scaleAt(turn.obs.point, 0.5);
    // Tempo: phi-anchored, intensity widens the range. 70..160 BPM.
    const bpm = Math.round(70 + intensity * 90);
    // Density: how many notes per section (1..16). Field magnitude tilts it.
    const density = 1 + Math.round(intensity * 15);
    // Bass weight: gradient magnitude → low-octave reinforcement.
    const g = turn.obs.grad;
    const bassWeight = Math.min(1, Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z) / 2);
    // Brightness: gyroid-positive lobes are bright (mode index already
    // encodes this; we expose a scalar for renderers that need it).
    const brightness = 0.5 + 0.5 * (turn.obs.value);
    return {
      x: turn.x,
      bpm: bpm,
      density: density,
      bassWeight: bassWeight,
      brightness: Math.max(0, Math.min(1, brightness)),
      scale: scale,
      intensity: intensity,
      obs: turn.obs,
    };
  }

  // Conductor — mutable handle bound to a parent x and a state-vector source.
  // tick() advances one section; play() schedules a Stream on the instrument.
  function create(opts) {
    const o = opts || {};
    let parent = o.parent || { seed: o.seed || [0], dim: 0, id: null };
    const stateFn = (typeof o.stateFn === 'function') ? o.stateFn : (() => [0]);
    const log = o.log || null;
    let lastSection = null;
    return {
      get parent() { return parent; },
      tick() {
        const state = stateFn() || [0];
        const sec = sectionFromState(parent, state, { log: log });
        parent = sec.x;
        lastSection = sec;
        return sec;
      },
      play(segments) {
        const segCount = segments | 0 || 8;
        const sec = lastSection || this.tick();
        // Stream uses the section's parent — its bloom carries the section's
        // mode/scale/intensity through to per-note voicings.
        return INSTR.Stream(parent, {
          segments: segCount,
          segDur: 60 / sec.bpm * 0.25,           // sixteenth-note grid
          octave: sec.bassWeight > 0.5 ? -1 : 0,
          intent: [1, sec.density / 8, sec.brightness],
        });
      },
      lastSection: () => lastSection,
    };
  }

  return { observeIntensity, sectionFromState, create };
});
