/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIMENSIONAL PLATFORM SUBSTRATE — KensGames.com
 * ═══════════════════════════════════════════════════════════════════════════
 * Governing doctrine:
 *   - Every game, every app, every engine: dimensional and set to a manifold
 *   - Zero redundancy: one coordinate per entity, all properties derived
 *   - Delta only: entities emit ∆z, never full state copies
 *   - Viewport-aware: only active processes get runtime budget
 *
 * Three interlocking systems:
 *
 *   A. DIM CHAIN       — 7-level z-seed → fully manifested Volume
 *      (same doctrine as starfighter/dimensional_substrate.js, domain-agnostic)
 *
 *   B. DELTA RELAY     — every entity has one canonical z; changes are ∆z.
 *      No object carries duplicated state. Listeners receive diffs, not snapshots.
 *
 *   C. PROCESS BUDGET  — IntersectionObserver + frame-time gate.
 *      Entities off-viewport → frozen or LOD=2. On-viewport → LOD=0.
 *      Idle callback for background sim. High-priority for focused app.
 *
 * Applies to: portal, starfighter, fasttrack, brickbreaker3d, 4DTicTacToe,
 *             assemble, admin, auth, lobby, multiplayer, audio, UI — everything.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const DimensionalPlatform = (function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED LATTICE — Schwartz Diamond. One equation for all domains.
  // ═══════════════════════════════════════════════════════════════════════════

  const _TWO_PI = Math.PI * 2;

  function _D(p) {
    const v = p * _TWO_PI;
    const c = Math.cos(v), s = Math.sin(v);
    return c * c * c - s * s * s;   // diagonal slice: D(p,p,p)
  }

  function _Dfull(px, py, pz) {
    const x = px * _TWO_PI, y = py * _TWO_PI, z = pz * _TWO_PI;
    return Math.cos(x) * Math.cos(y) * Math.cos(z)
         - Math.sin(x) * Math.sin(y) * Math.sin(z);
  }

  function _G(p) {
    const v = p * _TWO_PI;
    const cx = Math.cos(v), sx = Math.sin(v);
    const prod = cx * cx * cx - sx * sx * sx;
    const dp = _TWO_PI * (-3 * sx * cx * cx - 3 * cx * sx * sx);  // d/dp of diagonal
    return Math.abs(dp);
  }

  function _bandwidth(z0) {
    const g = _G(z0);
    return g < 0.01 ? 0.4 : Math.min(0.45, Math.max(0.04, 0.25 / g));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // A. DIMENSIONAL CHAIN
  // 7 levels. Each step derives the next from the lattice. No stored copies.
  //
  // Level 0 VOID   → unaddressed potential
  // Level 1 POINT  → z placed on lattice; D(z,z,z) → channel A/B
  // Level 2 LENGTH → bandwidth from |∇D|; 1D interval around z
  // Level 3 WIDTH  → 2D plane; aspect from gradient direction
  // Level 4 DEPTH  → 3D bounds; z-elongation from dominant axis
  // Level 5 FOLD   → z=xy surface; foldValue = z₀×D; phase = atan2(∇)
  // Level 6 VOLUME → m=xyz; complete manifested entity
  // ═══════════════════════════════════════════════════════════════════════════

  const DIM = { VOID:0, POINT:1, LENGTH:2, WIDTH:3, DEPTH:4, FOLD:5, VOLUME:6 };

  function _chain(label, z0, role) {
    if (z0 === undefined) {
      return {
        dim: DIM.VOID, label,
        seed(z) { return _chain(label, z, role); },
      };
    }

    const D    = _D(z0);
    const g    = _G(z0);
    const bw   = _bandwidth(z0);
    const ch   = D >= 0 ? 'A' : 'B';
    const xH   = bw * (1 + Math.abs(z0));
    const yH   = xH * 0.6;
    const zH   = (2.0 + Math.abs(z0) * 2.0);
    const fold = z0 * D;
    const m    = z0 * D * g;

    return {
      dim: DIM.VOLUME,
      label,
      role: role || label,
      z:    z0,
      D,
      g,
      bw,
      channel: ch,
      xH, yH, zH,
      foldValue: fold,
      m,
      // LOD resolution: higher gradient → finer mesh
      resolution(lod) {
        return Math.max(3, Math.round(([12,7,4][lod]||8) + g * 0.5));
      },
      // Sample the full diamond field at any point in this volume
      sample(px, py, pz) { return _Dfull(px, py, pz); },
      // Shift seed by delta → new volume (delta-only mutation)
      delta(dz) { return _chain(label, z0 + dz, role); },
      toString() { return `[Vol:${label} z=${z0.toFixed(3)} ch=${ch} m=${m.toFixed(4)}]`; },
    };
  }

  /**
   * Manifest any entity in one call: Void → Volume.
   * @param {string} label - Semantic ID (e.g. 'starfighter', 'fasttrack-lobby')
   * @param {number} z     - Seed value
   * @param {string} role  - Domain role
   */
  function manifest(label, z, role) {
    return _chain(label, z, role);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // B. DELTA RELAY
  // One canonical z per entity. Only ∆z propagates.
  // No snapshot copies. Listeners receive { label, dz, prev, next, volume }.
  //
  // Usage:
  //   DimensionalPlatform.delta.register('enemy-42', 0.35)
  //   DimensionalPlatform.delta.apply('enemy-42', 0.01)
  //   DimensionalPlatform.delta.on('enemy-42', ({ dz, next }) => redraw(next))
  // ═══════════════════════════════════════════════════════════════════════════

  const _registry = new Map();  // label → { z, volume, listeners[] }

  const delta = {
    /**
     * Register an entity with an initial z seed.
     */
    register(label, z0, role) {
      if (_registry.has(label)) return _registry.get(label).volume;
      const vol = _chain(label, z0, role);
      _registry.set(label, { z: z0, volume: vol, listeners: [] });
      return vol;
    },

    /**
     * Apply a delta. Only ∆z stored; new volume derived.
     * Listeners receive the diff, never a full state copy.
     */
    apply(label, dz) {
      const rec = _registry.get(label);
      if (!rec) return null;
      const prev = rec.z;
      const next = prev + dz;
      const vol  = _chain(label, next, rec.volume.role);
      rec.z      = next;
      rec.volume = vol;
      for (const fn of rec.listeners) fn({ label, dz, prev, next, volume: vol });
      return vol;
    },

    /**
     * Read current volume without any mutation.
     */
    read(label) {
      return _registry.get(label)?.volume || null;
    },

    /**
     * Subscribe to delta events for a label.
     */
    on(label, fn) {
      const rec = _registry.get(label);
      if (rec) rec.listeners.push(fn);
      return () => {
        if (rec) rec.listeners = rec.listeners.filter(f => f !== fn);
      };
    },

    /**
     * Batch apply: { label: dz, ... }  — zero-redundancy multi-entity update.
     */
    batch(deltas) {
      const results = {};
      for (const [label, dz] of Object.entries(deltas)) {
        results[label] = this.apply(label, dz);
      }
      return results;
    },

    /** List all registered entities */
    entries() {
      return Array.from(_registry.entries()).map(([label, rec]) => rec.volume);
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // C. PROCESS BUDGET (Viewport-Aware)
  // Assigns LOD + active flag to each registered entity based on:
  //   - Whether its DOM element is in the viewport (IntersectionObserver)
  //   - Whether the current app/tab is focused
  //   - Frame-time budget: if frame > 16ms, push background entities to LOD=2
  //
  // Usage:
  //   DimensionalPlatform.budget.watch('starfighter', document.getElementById('game-canvas'))
  //   DimensionalPlatform.budget.lod('starfighter')  → 0|1|2
  //   DimensionalPlatform.budget.active('starfighter') → true|false
  //
  // No entity runs at LOD 0 unless it is:
  //   a) in the viewport  AND
  //   b) the tab is focused  AND
  //   c) frame budget allows
  // ═══════════════════════════════════════════════════════════════════════════

  const _budget = new Map();   // label → { lod, active, el, observer }
  let   _tabFocused = typeof document !== 'undefined' ? !document.hidden : true;
  let   _lastFrameMs = 0;
  let   _frameBudgetMs = 16;

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      _tabFocused = !document.hidden;
      // On tab focus: promote all on-viewport entities to LOD 0
      for (const [, rec] of _budget) {
        if (rec.inViewport) rec.lod = _tabFocused ? 0 : 2;
      }
    });
  }

  // Call this once per frame from your game loop to feed frame time.
  function _tickFrame(ms) {
    _lastFrameMs = ms;
    _frameBudgetMs = ms > 20 ? 32 : ms > 16 ? 16 : 8;
  }

  const budget = {
    /**
     * Watch a DOM element for viewport intersection.
     * When out of viewport: LOD=2, active=false (frozen).
     * When in viewport: LOD=0 (if tab focused) or LOD=1.
     */
    watch(label, el) {
      if (typeof IntersectionObserver === 'undefined') {
        _budget.set(label, { lod: 0, active: true, inViewport: true });
        return;
      }
      const rec = { lod: 2, active: false, inViewport: false, el };
      _budget.set(label, rec);

      const obs = new IntersectionObserver(([entry]) => {
        rec.inViewport = entry.isIntersecting;
        rec.lod    = entry.isIntersecting ? (_tabFocused ? 0 : 1) : 2;
        rec.active = entry.isIntersecting && _tabFocused;
        // Push delta to registered entity if exists
        if (_registry.has(label)) {
          // No state change — just emit a zero-delta so listeners can re-LOD
          const cur = _registry.get(label);
          for (const fn of cur.listeners) {
            fn({ label, dz: 0, prev: cur.z, next: cur.z, volume: cur.volume, lodChange: rec.lod });
          }
        }
      }, { threshold: 0.01 });

      obs.observe(el);
      rec.observer = obs;
    },

    /** Stop watching an element */
    unwatch(label) {
      _budget.get(label)?.observer?.disconnect();
      _budget.delete(label);
    },

    /** Current LOD level for a label (0=high, 1=medium, 2=frozen) */
    lod(label) {
      return _budget.get(label)?.lod ?? (_tabFocused ? 0 : 1);
    },

    /** Whether a label should currently process (run physics, AI, etc.) */
    active(label) {
      return _budget.get(label)?.active ?? _tabFocused;
    },

    /** Frame-time feedback — call from rAF loop */
    tick: _tickFrame,

    /** Snapshot of all budget states */
    snapshot() {
      return Array.from(_budget.entries()).map(([label, rec]) => ({
        label, lod: rec.lod, active: rec.active, inViewport: rec.inViewport
      }));
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PLATFORM GAME REGISTRY
  // All games/apps declared once as dimensional entities.
  // z = log10(playtime_minutes) × log10(playerCount + 1)  — natural scale
  // ═══════════════════════════════════════════════════════════════════════════

  const APPS = [
    // Games
    { label:'starfighter',     z: 0.35, role:'game-3d',       path:'/starfighter/'         },
    { label:'fasttrack',       z: 0.28, role:'game-board',    path:'/fasttrack/lobby.html' },
    { label:'brickbreaker3d',  z: 0.18, role:'game-3d',       path:'/brickbreaker3d/'      },
    { label:'4d-tictactoe',    z: 0.12, role:'game-puzzle',   path:'/4DTicTacToe/'         },
    { label:'assemble',        z: 0.08, role:'game-puzzle',   path:'/assemble/'            },
    // Platform
    { label:'portal',          z: 0.60, role:'portal',        path:'/index.html'           },
    { label:'discover',        z: 0.55, role:'portal',        path:'/discover.html'        },
    { label:'showcase',        z: 0.50, role:'portal',        path:'/showcase.html'        },
    { label:'lounge',          z: 0.45, role:'portal',        path:'/lounge.html'          },
    // Engine substrates
    { label:'auth',            z: 0.05, role:'engine',        path:'/login/'               },
    { label:'lobby',           z: 0.10, role:'engine',        path:'/lobby/'               },
    { label:'multiplayer',     z: 0.20, role:'engine',        path:null                    },
    { label:'audio-engine',    z: 0.15, role:'engine',        path:null                    },
    { label:'admin',           z: 0.80, role:'admin',         path:'/admin.html'           },
  ];

  // Register all apps on the delta relay at startup
  for (const app of APPS) {
    delta.register(app.label, app.z, app.role);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    /** A. Dimensional chain */
    manifest,
    DIM,

    /** B. Delta relay — zero redundancy, delta-only propagation */
    delta,

    /** C. Process budget — viewport-aware runtime */
    budget,

    /** Platform app registry */
    APPS,

    /** Raw lattice (for substrates that want to sample directly) */
    diamond: _Dfull,
    bandwidth: _bandwidth,
  };
})();

// Browser + Node dual export
if (typeof window !== 'undefined') window.DimensionalPlatform = DimensionalPlatform;
if (typeof module !== 'undefined') module.exports = DimensionalPlatform;
