/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 THE MANIFOLD — Dimensional Reducer
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PRIMITIVE: z = x · y²    (two inputs → one derived, quadratic multiplier)
 *      EVAL: m = x · y · z  (three coordinates → one manifold value)
 *
 * PRINCIPLE: Store two numbers. Derive everything.
 *
 * Like E = mc², the equation IS the data. A 100-field object becomes two
 * floats. Position, surface, color, physics, audio — all computed on demand
 * from (x, y) through lenses. Nothing is cached. Nothing is stored.
 * The manifold holds coordinates, not copies.
 *
 * z = xy² means small changes in y produce quadratic change in z.
 * Minimal input → maximum multiplied output. The Schwartz Diamond
 * surface lives at the points where cos(x)sin(y)+cos(y)sin(z)+cos(z)sin(x)=0
 * and every entity's manifold value m = xyz is pure multiplicative coupling.
 *
 * STORAGE: 16 bytes per point (two Float64s in a typed array)
 * SURFACE: Schwarz Diamond + Gyroid blend — computed, never stored
 *   Gyroid is the canonical substrate; Schwartz Diamond is an auxiliary lens.
 *   See docs/SUBSTRATES.md for role split.
 * LENSES:  Pure functions from (x, y, z) → any domain
 *
 * One VPS. One equation. Infinite projections.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const Manifold = (() => {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════════
  // STORAGE — minimal. Two floats per point. That's it.
  //
  // _xy: Float64Array, grows in chunks. Every point = 2 slots [x, y].
  // _ids: maps id → index into _xy (index = slot / 2)
  // _regions: maps regionName → Set of ids
  // Everything else is DERIVED on read.
  // ══════════════════════════════════════════════════════════════════════════

  const CHUNK = 1024;              // grow 1024 points at a time (16 KB)
  let _xy = new Float64Array(CHUNK * 2);
  let _count = 0;
  let _capacity = CHUNK;

  const _ids = new Map();          // id → index (position in _xy = index * 2)
  const _regionSets = new Map();   // regionName → Set<id>
  const _idRegion = new Map();     // id → regionName
  const _lenses = new Map();       // lensName → fn(x, y, z) → value
  const _listeners = [];           // [{ event, region, fn }]

  // Data storage — coordinate-addressed key/value (used by substrates)
  const _data = new Map();         // hash → { coordinate, data, timestamp }

  // Deletion tracking (lazy — avoids array compaction)
  const _free = [];                // recycled indices

  function _grow() {
    _capacity += CHUNK;
    const next = new Float64Array(_capacity * 2);
    next.set(_xy);
    _xy = next;
  }

  function _alloc() {
    if (_free.length) return _free.pop();
    if (_count >= _capacity) _grow();
    return _count++;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SURFACE MATH — pure functions. Zero storage.
  // ══════════════════════════════════════════════════════════════════════════

  const gyroid = (x, y, z) =>
    Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x);

  const diamond = (x, y, z) =>
    Math.cos(x) * Math.cos(y) * Math.cos(z) - Math.sin(x) * Math.sin(y) * Math.sin(z);

  const blend = (x, y, z, t = 0.3) =>
    gyroid(x, y, z) * (1 - t) + diamond(x, y, z) * t;

  const diamondGrad = (x, y, z) => {
    const cx = Math.cos(x), sx = Math.sin(x);
    const cy = Math.cos(y), sy = Math.sin(y);
    const cz = Math.cos(z), sz = Math.sin(z);
    return {
      x: -sx * cy * cz - cx * sy * sz,
      y: -cx * sy * cz - sx * cy * sz,
      z: -cx * cy * sz - sx * sy * cz,
    };
  };

  // ══════════════════════════════════════════════════════════════════════════
  // DERIVE — everything from two numbers
  // These are NOT stored. They are computed every time you ask.
  // ══════════════════════════════════════════════════════════════════════════

  const PI_10 = Math.PI / 10;

  // CORE EQUATIONS
  // z = x · y²   — 2D→3D projection (quadratic multiplier: small y → big z)
  // m = x · y · z — manifold value (full multiplicative coupling of all 3 axes)
  function _z(x, y) { return x * y * y; }
  function _m(x, y, z) { return x * y * z; }

  // COMPOSITION EQUATIONS — z as the sum of its parts
  // zSum: straight sum of parts → whole.
  // zFib: nth Fibonacci value; each whole = sum of the two prior wholes.
  // zFibSeries: the first n Fibonacci wholes, [F(1)..F(n)].
  function _zSum(parts) {
    if (!parts || !parts.length) return 0;
    let s = 0; for (let i = 0; i < parts.length; i++) s += +parts[i] || 0;
    return s;
  }
  function _zFib(n) {
    if (n <= 0) return 0;
    let a = 0, b = 1;
    for (let i = 1; i < n; i++) { const t = a + b; a = b; b = t; }
    return b;
  }
  function _zFibSeries(n) {
    const out = []; let a = 0, b = 1;
    for (let i = 0; i < n; i++) { out.push(b); const t = a + b; a = b; b = t; }
    return out;
  }

  // PROJECTION EQUATIONS — y as the division of x by the whole
  // yLinear:    y = x / z         (linear inverse of z = x·y)
  // yQuadratic: y = √(z / x)      (inverse of z = x·y²; "x divided by z²" framing)
  function _yLinear(x, z) { return z === 0 ? 0 : x / z; }
  function _yQuadratic(x, z) {
    if (x === 0) return 0;
    const r = z / x;
    return r < 0 ? -Math.sqrt(-r) : Math.sqrt(r);
  }

  function _surface(x, y) {
    const z = _z(x, y);
    const sx = (x / 10) * Math.PI;
    const sy = (y / 10) * Math.PI;
    const sz = (z / 100) * Math.PI;
    return {
      gyroid: gyroid(sx, sy, sz),
      diamond: diamond(sx, sy, sz),
      blend: blend(sx, sy, sz),
      m: _m(x, y, z),  // manifold value at this point
    };
  }

  function _position3d(x, y) {
    const z = _z(x, y);
    return {
      x: Math.cos(x * PI_10) * (x * 10),
      y: z / 10,
      z: Math.sin(y * PI_10) * (y * 10),
    };
  }

  function _color(x, y) {
    const z = _z(x, y);
    return `hsl(${Math.abs(_m(x, y, z) * 0.036) % 360}, 80%, 60%)`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REGIONS — namespaced partitions. Config only, no data duplication.
  // ══════════════════════════════════════════════════════════════════════════

  const _regionConfigs = new Map();

  function region(name, config = {}) {
    if (!_regionSets.has(name)) {
      _regionSets.set(name, new Set());
      _regionConfigs.set(name, config);
    }
    // Return compat object for code that reads region properties
    return {
      name,
      config: _regionConfigs.get(name),
      get pointIds() { return _regionSets.get(name); },
      _gridDirty: true,
      _grid: new Map(),
      _cellSize: config.cellSize || 1000,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 🍴 DINING PHILOSOPHERS — Fork-based race condition eliminator
  //
  // Every entity across every app is a "philosopher" at the table. To be
  // read or mutated by ANY subsystem, the entity must hold a valid fork.
  // When an entity is destroyed its fork is revoked — all subsequent
  // acquire() calls return false, making stale references harmless.
  //
  // This lives in the UNIFIED manifold so every game and app gets it
  // automatically — no duplication. Same manifold, same substrates,
  // same fork table.
  //
  // Fork states:
  //   AVAILABLE  — entity alive, fork can be acquired
  //   HELD       — fork currently acquired by a subsystem
  //   REVOKED    — entity dead, fork permanently unavailable
  //
  // Dijkstra ordering: entities closer to the Schwartz Diamond zero-set
  // (|field| → 0) get higher priority, breaking symmetry to prevent
  // deadlock in multi-entity operations (collision pairs, etc.)
  // ══════════════════════════════════════════════════════════════════════════

  const FORK_AVAILABLE = 0;
  const FORK_HELD = 1;
  const FORK_REVOKED = 2;

  const _forks = new Map();     // entityId → { state, holder, priority }
  let _forkGeneration = 0;      // monotonic generation counter for ordering

  const DiningPhilosophers = {

    // Grant a fork to a newly created entity
    grant(entityId, fieldValue) {
      const priority = 1.0 / (Math.abs(fieldValue || 1) + 0.01);
      _forks.set(entityId, {
        state: FORK_AVAILABLE,
        holder: null,
        priority,
        gen: ++_forkGeneration,
      });
    },

    // Acquire a fork — returns true if entity is alive and fork obtained.
    // If revoked, returns false — caller must skip this entity entirely.
    acquire(entityId, subsystem) {
      const fork = _forks.get(entityId);
      if (!fork || fork.state === FORK_REVOKED) return false;
      if (fork.state === FORK_HELD) return true; // re-entrant (cooperative)
      fork.state = FORK_HELD;
      fork.holder = subsystem;
      return true;
    },

    // Release a fork back to the table
    release(entityId) {
      const fork = _forks.get(entityId);
      if (!fork || fork.state === FORK_REVOKED) return;
      fork.state = FORK_AVAILABLE;
      fork.holder = null;
    },

    // Revoke a fork permanently — entity destroyed, no process may touch it
    revoke(entityId) {
      const fork = _forks.get(entityId);
      if (fork) {
        fork.state = FORK_REVOKED;
        fork.holder = null;
      }
    },

    // Batch release all held forks for a subsystem — end of phase
    releaseAll(subsystem) {
      for (const [, fork] of _forks) {
        if (fork.state === FORK_HELD && fork.holder === subsystem) {
          fork.state = FORK_AVAILABLE;
          fork.holder = null;
        }
      }
    },

    // Reap revoked forks — garbage collect dead entries
    reapForks() {
      for (const [id, fork] of _forks) {
        if (fork.state === FORK_REVOKED) _forks.delete(id);
      }
    },

    // Check if entity fork is still valid (not revoked)
    isValid(entityId) {
      const fork = _forks.get(entityId);
      return fork ? fork.state !== FORK_REVOKED : false;
    },

    // Dijkstra ordering — sort by fork priority to prevent deadlock
    ordered(entityIds) {
      return entityIds.slice().sort((a, b) => {
        const fa = _forks.get(a), fb = _forks.get(b);
        if (!fa || !fb) return 0;
        return fb.priority - fa.priority || fa.gen - fb.gen;
      });
    },

    // Stats for diagnostics
    stats() {
      let available = 0, held = 0, revoked = 0;
      for (const [, f] of _forks) {
        if (f.state === FORK_AVAILABLE) available++;
        else if (f.state === FORK_HELD) held++;
        else revoked++;
      }
      return { available, held, revoked, total: _forks.size };
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PLACE / REMOVE — store (x, y). Derive the rest. Grant/revoke forks.
  // ══════════════════════════════════════════════════════════════════════════

  function place(entity, regionName) {
    const rName = regionName || '_global';
    if (!_regionSets.has(rName)) region(rName);

    const id = entity.id;
    let idx;

    if (_ids.has(id)) {
      // Update existing point
      idx = _ids.get(id);
    } else {
      idx = _alloc();
      _ids.set(id, idx);
    }

    // Extract (x, y) from whatever the entity provides
    const x = entity.position?.x ?? entity.manifold?.x ?? entity.x ?? 0;
    const y = entity.position?.y ?? entity.manifold?.y ?? entity.y ?? 0;
    const off = idx * 2;
    _xy[off] = x;
    _xy[off + 1] = y;

    _regionSets.get(rName).add(id);
    _idRegion.set(id, rName);

    // Store velocity/radius/type as compact metadata if entity has them
    // These are the ONLY extra fields games actually mutate at runtime
    if (entity.velocity || entity.radius || entity.type || entity.markedForDeletion !== undefined) {
      _meta.set(id, {
        ref: entity,         // live reference for collision callbacks
        velocity: entity.velocity || null,
        radius: entity.radius || 10,
        type: entity.type || null,
        markedForDeletion: entity.markedForDeletion || false,
      });
    }

    _emit('place', rName, entity);

    // 🍴 Grant fork — compute field value at entity position for Dijkstra priority
    const z = _z(x, y);
    const sx = x * Math.PI / 10, sy = y * Math.PI / 10, sz = z * Math.PI / 100;
    const fieldVal = diamond(sx, sy, sz);
    DiningPhilosophers.grant(id, fieldVal);
  }

  // Runtime-mutable metadata — only for entities that need physics
  const _meta = new Map();

  function remove(id) {
    // 🍴 Revoke fork FIRST — no subsystem can touch this entity after this
    DiningPhilosophers.revoke(id);

    const idx = _ids.get(id);
    if (idx === undefined) return;

    const rName = _idRegion.get(id);
    if (rName) {
      const s = _regionSets.get(rName);
      if (s) s.delete(id);
    }
    _idRegion.delete(id);
    _ids.delete(id);
    _meta.delete(id);
    _free.push(idx); // recycle slot

    _emit('remove', rName, { id });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OBSERVE — reconstruct entity from (x, y) on demand.
  // Nothing is stored. Everything is computed.
  // ══════════════════════════════════════════════════════════════════════════

  function _reconstruct(id) {
    const idx = _ids.get(id);
    if (idx === undefined) return null;
    const off = idx * 2;
    const x = _xy[off];
    const y = _xy[off + 1];
    const z = _z(x, y);
    const m = _meta.get(id);
    const pos = _position3d(x, y);
    return {
      id,
      position: { x, y, z },
      manifold: { x, y, z },
      position3d: pos,
      token: z,
      get surface() { return _surface(x, y); },
      get color() { return _color(x, y); },
      velocity: m?.velocity || null,
      radius: m?.radius || 10,
      type: m?.type || null,
      markedForDeletion: m?.markedForDeletion || false,
    };
  }

  function observe(id) {
    return _reconstruct(id);
  }

  function observeAll(regionName) {
    if (regionName) {
      const s = _regionSets.get(regionName);
      if (!s) return [];
      const result = [];
      for (const id of s) {
        const e = _reconstruct(id);
        if (e && !e.markedForDeletion) result.push(e);
      }
      return result;
    }
    const result = [];
    for (const [id] of _ids) {
      const e = _reconstruct(id);
      if (e && !e.markedForDeletion) result.push(e);
    }
    return result;
  }

  function observeByType(type, regionName) {
    return (regionName ? observeAll(regionName) : observeAll())
      .filter(e => e.type === type);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVOLVE — update (x, y) directly. Velocity changes the coordinates.
  // ══════════════════════════════════════════════════════════════════════════

  function evolve(dt, regionName) {
    const ids = regionName
      ? _regionSets.get(regionName)
      : _ids;
    if (!ids) return;

    for (const id of (ids instanceof Map ? ids.keys() : ids)) {
      const m = _meta.get(id);
      if (!m || !m.velocity || m.markedForDeletion) continue;
      const idx = _ids.get(id);
      const off = idx * 2;
      _xy[off] += m.velocity.x * dt;
      _xy[off + 1] += m.velocity.y * dt;
      // z velocity folds into x,y via the equation — no separate z storage
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COLLISION DETECTION — computed from (x, y) positions
  // ══════════════════════════════════════════════════════════════════════════

  const _pairSet = new Set();
  const _pairs = [];

  // ── Spatial grid for broad-phase collision ──
  const _gridCellSize = 200;  // world units per cell
  const _grid = new Map();    // cellKey → [idx, idx, ...]
  const _cellPool = [];       // recycled arrays

  function _gridKey(x, y) {
    return ((x / _gridCellSize) | 0) + ',' + ((y / _gridCellSize) | 0);
  }

  function _getCell(key) {
    let c = _grid.get(key);
    if (!c) { c = _cellPool.pop() || []; _grid.set(key, c); }
    return c;
  }

  function detectCollisions(regionName) {
    const rName = regionName || '_global';
    const s = _regionSets.get(rName);
    if (!s || s.size < 2) return [];

    _pairSet.clear();
    _pairs.length = 0;

    // Recycle grid cells
    for (const [k, arr] of _grid) { arr.length = 0; _cellPool.push(arr); }
    _grid.clear();

    // Build compact arrays from typed storage — flat, no object allocation
    const n = s.size;
    // Reuse flat arrays across frames
    if (!detectCollisions._ids || detectCollisions._ids.length < n) {
      detectCollisions._ids = new Array(n * 2);
      detectCollisions._xs = new Float64Array(n * 2);
      detectCollisions._ys = new Float64Array(n * 2);
      detectCollisions._rs = new Float64Array(n * 2);
    }
    const ids = detectCollisions._ids;
    const xs = detectCollisions._xs;
    const ys = detectCollisions._ys;
    const rs = detectCollisions._rs;
    let count = 0;

    for (const id of s) {
      const m = _meta.get(id);
      // Check live entity ref for markedForDeletion (stays in sync with game state)
      if (m?.ref?.markedForDeletion || m?.markedForDeletion) continue;
      const idx = _ids.get(id);
      if (idx === undefined) continue;
      const off = idx * 2;
      // Sync stored position from live entity ref (game moves entities in 3D)
      if (m?.ref?.position) {
        _xy[off] = m.ref.position.x;
        _xy[off + 1] = m.ref.position.y;
      }
      ids[count] = id;
      xs[count] = _xy[off];
      ys[count] = _xy[off + 1];
      // Live radius/type from entity ref — radius is set after place() during
      // per-type spawn (e.g. e.radius = dim('entity.bomber.radius')). Reading
      // the stored snapshot leaves every entity at the constructor default of
      // 10, collapsing every span to zero and losing capital-ship pairs.
      rs[count] = (m?.ref?.radius != null) ? m.ref.radius : (m?.radius || 10);
      // Insert into grid cell(s). Projectiles get span=1 so a fast bolt in cell X
      // still meets a target in cell X±1 (fixes the original tunneling bug where
      // lasers passed through enemies on adjacent-cell boundaries). Non-projectile
      // small entities use span=0 — they move slowly enough that next-frame coverage
      // is sufficient. Large entities span proportional to radius, capped to keep
      // capital-ship insertion bounded (radius 5000 → 5×5 = 25 cells, not 17×17).
      const cx = (xs[count] / _gridCellSize) | 0;
      const cy = (ys[count] / _gridCellSize) | 0;
      const r = rs[count];
      const t = m?.ref?.type || m?.type;
      const isProj = t === 'laser' || t === 'torpedo' || t === 'machinegun' || t === 'bomb';
      const span = r > _gridCellSize * 0.5
        ? Math.min(3, Math.ceil(r / _gridCellSize))
        : (isProj ? 1 : 0);
      if (span === 0) {
        _getCell(cx + ',' + cy).push(count);
      } else {
        for (let dx = -span; dx <= span; dx++) {
          for (let dy = -span; dy <= span; dy++) {
            _getCell((cx + dx) + ',' + (cy + dy)).push(count);
          }
        }
      }
      count++;
    }

    // Narrow-phase: only check entities in the same cell
    for (const [, cell] of _grid) {
      const cn = cell.length;
      for (let i = 0; i < cn; i++) {
        const ai = cell[i];
        for (let j = i + 1; j < cn; j++) {
          const bi = cell[j];
          const dx = xs[ai] - xs[bi];
          const dy = ys[ai] - ys[bi];
          const dSq = dx * dx + dy * dy;
          const rSum = rs[ai] + rs[bi];
          if (dSq < rSum * rSum) {
            const key = ids[ai] < ids[bi] ? ids[ai] + ids[bi] : ids[bi] + ids[ai];
            if (!_pairSet.has(key)) {
              _pairSet.add(key);
              // Return actual entity refs when available (preserves Vector3 methods)
              const aRef = _meta.get(ids[ai])?.ref || _reconstruct(ids[ai]);
              const bRef = _meta.get(ids[bi])?.ref || _reconstruct(ids[bi]);
              _pairs.push([aRef, bRef]);
            }
          }
        }
      }
    }
    return _pairs;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REAP — reclaim deleted point slots
  // ══════════════════════════════════════════════════════════════════════════

  function reap(regionName) {
    const targets = regionName ? [regionName] : Array.from(_regionSets.keys());
    for (const rName of targets) {
      const s = _regionSets.get(rName);
      if (!s) continue;
      for (const id of s) {
        const m = _meta.get(id);
        if (m?.markedForDeletion) remove(id); // remove() revokes fork
      }
    }
    // 🍴 Garbage collect dead forks
    DiningPhilosophers.reapForks();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISTANCE — computed from stored (x, y), z derived
  // ══════════════════════════════════════════════════════════════════════════

  function distance(a, b) {
    const dx = (a.position?.x ?? a.x) - (b.position?.x ?? b.x);
    const dy = (a.position?.y ?? a.y) - (b.position?.y ?? b.y);
    const dz = (a.position?.z ?? (a.x * a.y)) - (b.position?.z ?? (b.x * b.y));
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function distanceSq(a, b) {
    const dx = (a.position?.x ?? a.x) - (b.position?.x ?? b.x);
    const dy = (a.position?.y ?? a.y) - (b.position?.y ?? b.y);
    const dz = (a.position?.z ?? (a.x * a.y)) - (b.position?.z ?? (b.x * b.y));
    return dx * dx + dy * dy + dz * dz;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LENSES — pure functions from (x, y, z) → any domain
  // The manifold holds coordinates; lenses interpret them.
  // ══════════════════════════════════════════════════════════════════════════

  function lens(name, projectFn) {
    _lenses.set(name, projectFn);
  }

  function project(lensName, entity) {
    const fn = _lenses.get(lensName);
    if (!fn) return null;
    const x = entity.manifold?.x ?? entity.x ?? 0;
    const y = entity.manifold?.y ?? entity.y ?? 0;
    return fn(x, y, _z(x, y), entity);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INGEST — reduce any data to (x, y). Drop the source.
  //
  // The schema tells us which two dimensions to extract.
  // Everything else is recoverable from z = xy and lenses.
  // The source data is NOT kept. The equation replaces it.
  // ══════════════════════════════════════════════════════════════════════════

  const _resolveArrayExpr = (expr, data) => {
    const [op, ...args] = expr;
    const vs = args.map(a => resolveAxis(a, data));
    const ops = {
      add: vs => vs.reduce((a, b) => a + b, 0),
      subtract: ([a, b]) => a - b,
      multiply: vs => vs.reduce((a, b) => a * b, 1),
      divide: ([a, b]) => a / b,
      pow: ([a, b]) => Math.pow(a, b),
      sqrt: ([a]) => Math.sqrt(a),
      log: ([a]) => Math.log(a),
      abs: ([a]) => Math.abs(a),
      max: vs => Math.max(...vs),
      min: vs => Math.min(...vs),
    };
    return ops[op] ? ops[op](vs) : 0;
  };

  function resolveAxis(expr, data) {
    if (typeof expr === 'number') return expr;
    if (typeof expr === 'function') return expr(data);
    if (Array.isArray(expr)) return _resolveArrayExpr(expr, data);
    if (typeof expr === 'string') {
      if (/[+\-*/()^]|d\./.test(expr)) {
        try { return Function('d', `"use strict"; return (${expr})`)(data); } catch { return 0; }
      }
      return expr.split('.').reduce((obj, k) => obj?.[k], data) ?? 0;
    }
    return 0;
  }

  function ingest(data, schema = {}) {
    const { x: xExpr = 1, y: yExpr = 1, id: schemaId, label: schemaLabel } = schema;
    const mx = resolveAxis(xExpr, data);
    const my = resolveAxis(yExpr, data);
    const mz = _z(mx, my);
    const id = schemaId || data?.id || (Date.now().toString(36) + (Math.random() * 1000 | 0));

    // Return a LIVE object — properties derived on access, not stored
    return {
      id,
      label: schemaLabel || data?.name || data?.title || String(mz),
      manifold: { x: mx, y: my, z: mz },
      get position3d() { return _position3d(mx, my); },
      get surface() { return _surface(mx, my); },
      get color() { return _color(mx, my); },
      get token() { return mz; },
      // Backward compat — old code reads .source; now returns null
      source: null,
      schema: { x: xExpr, y: yExpr },
    };
  }

  function ingestAll(items, schema) { return items.map(item => ingest(item, schema)); }

  function sortByToken(entities) {
    return [...entities].sort((a, b) => {
      const az = a.manifold ? a.manifold.z : (a.token || 0);
      const bz = b.manifold ? b.manifold.z : (b.token || 0);
      return az - bz;
    });
  }

  function nearest(entity, pool, limit = 3) {
    const ep = entity.position3d || _position3d(entity.manifold?.x || 0, entity.manifold?.y || 0);
    return pool.filter(e => e.id !== entity.id)
      .map(e => {
        const p = e.position3d || _position3d(e.manifold?.x || 0, e.manifold?.y || 0);
        const dx = ep.x - p.x, dy = ep.y - p.y, dz = ep.z - p.z;
        return { entity: e, distance: Math.sqrt(dx * dx + dy * dy + dz * dz) };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DATA STORAGE — coordinate-addressed key/value
  // Used by substrates (this.manifold.read/write). Kept because substrates
  // store game state at coordinates, not raw entity data.
  // ══════════════════════════════════════════════════════════════════════════

  // write() chains revisions via `prev` so each coordinate keeps its full
  // delta stack. read() still returns the latest data — callers unchanged.
  function write(coordinate, data) {
    const hash = _coordHash(coordinate);
    const prev = _data.get(hash) || null;
    _data.set(hash, { coordinate, data, timestamp: Date.now(), prev });
    return hash;
  }

  function read(coordinate) {
    const hash = _coordHash(coordinate);
    const entry = _data.get(hash);
    return entry ? entry.data : null;
  }

  function readAll() {
    return Array.from(_data.values());
  }

  // history(coord) → revisions newest-first as [{data, timestamp}, ...]
  function history(coordinate) {
    const out = [];
    let cur = _data.get(_coordHash(coordinate));
    while (cur) { out.push({ data: cur.data, timestamp: cur.timestamp }); cur = cur.prev; }
    return out;
  }

  // at(coord, t) → the data revision active at timestamp t (the newest entry
  // whose timestamp ≤ t). Returns null if t predates the first write.
  function at(coordinate, t) {
    let cur = _data.get(_coordHash(coordinate));
    while (cur) { if (cur.timestamp <= t) return cur.data; cur = cur.prev; }
    return null;
  }

  function queryNearby(center, radius = 10) {
    const cx = Array.isArray(center) ? center : [center.x || 0, center.y || 0, center.z || 0];
    const results = [];
    _data.forEach(entry => {
      const ec = Array.isArray(entry.coordinate) ? entry.coordinate
        : [entry.coordinate.x || 0, entry.coordinate.y || 0, entry.coordinate.z || 0];
      let dSq = 0;
      for (let i = 0; i < Math.max(cx.length, ec.length); i++) {
        const d = (cx[i] || 0) - (ec[i] || 0);
        dSq += d * d;
      }
      const dist = Math.sqrt(dSq);
      if (dist <= radius) results.push({ coordinate: entry.coordinate, data: entry.data, distance: dist });
    });
    return results.sort((a, b) => a.distance - b.distance);
  }

  function _coordHash(coord) {
    if (Array.isArray(coord)) return coord.join(',');
    if (typeof coord === 'object') return Object.values(coord).join(',');
    return String(coord);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVENTS — minimal pub/sub
  // ══════════════════════════════════════════════════════════════════════════

  function on(event, fn, regionName) {
    _listeners.push({ event, region: regionName || null, fn });
  }

  function _emit(event, regionName, data) {
    for (let i = 0, len = _listeners.length; i < len; i++) {
      const l = _listeners[i];
      if (l.event === event && (!l.region || l.region === regionName)) {
        l.fn(data, regionName);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATS — how much the reducer is saving
  // ══════════════════════════════════════════════════════════════════════════

  function stats() {
    const regionStats = {};
    for (const [name, s] of _regionSets) {
      regionStats[name] = s.size;
    }
    const pointCount = _ids.size;
    return {
      totalPoints: pointCount,
      totalData: _data.size,
      regions: regionStats,
      lenses: Array.from(_lenses.keys()),
      // The point: show the reduction
      storedBytes: pointCount * 16,                    // 2 × Float64 per point
      equivalentBytes: pointCount * 280,               // what old ingestor would store
      reductionFactor: pointCount ? (280 / 16).toFixed(1) + 'x' : '∞',
      typedArrayCapacity: _capacity,
      recycledSlots: _free.length,
      forks: DiningPhilosophers.stats(),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DIMENSIONAL FRAMEWORK — the five verbs, seeds, lenses, presences
  //
  // ingest → expand → invoke → collapse → oscillate. Per the dimensional
  // equation: identity rides on the manifold; behavior is plucked, not stored.
  // Frame-indexed clock keeps oscillation deterministic across multiplayer
  // and replays. Per-frame memoization keeps lens calls O(1) amortized.
  // ══════════════════════════════════════════════════════════════════════════

  const Dim = (() => {
    const FIB = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987];
    let _frame = 0;
    let _now = 0;
    let _dt = 1 / 60;
    const _cache = new Map();

    let _nextKind = 1;
    const _kindByName = new Map();
    function kind(name) {
      let k = _kindByName.get(name);
      if (k === undefined) { k = _nextKind++; _kindByName.set(name, k); }
      return k;
    }

    function seed(k, identity, ancestry) {
      return { kind: k, fib: 1, identity: identity, ancestry: ancestry || [] };
    }

    function ingest(k, identity) {
      return seed(typeof k === 'number' ? k : kind(k), identity, []);
    }

    function expand(s, divider) {
      const parts = divider ? divider(s) : [];
      const i = Math.min(s.fib + 1, FIB.length - 1);
      const childFib = FIB[i] || s.fib + 1;
      const ancestry = s.ancestry.concat([s]);
      return {
        seed: s, fib: childFib,
        structure: parts.map(p => ({ kind: s.kind, fib: childFib, identity: p, ancestry })),
      };
    }

    function collapse(b, gatherer) {
      const collapsed = gatherer ? gatherer(b) : (b.seed ? b.seed.identity : b);
      const k = b.seed ? b.seed.kind : b.kind;
      const ancestry = b.seed ? b.seed.ancestry.concat([b.seed]) : [];
      return seed(k, collapsed, ancestry);
    }

    function oscillate(s, period) {
      const fibPeriod = FIB[(s && s.fib != null ? s.fib : 1) % FIB.length] || 1;
      const p = period || fibPeriod;
      return Math.sin(((_frame % p) / p) * Math.PI * 2);
    }

    const _lenses = new Map();
    function defineLens(id, fn) { _lenses.set(id, fn); return id; }
    function observe(s, state, lens) {
      const fn = typeof lens === 'function' ? lens : _lenses.get(lens);
      if (!fn) return undefined;
      const lensTag = typeof lens === 'function' ? (lens.name || '_anon') : lens;
      const idTag = (s && s.identity && s.identity.id) != null
        ? s.identity.id
        : (s && s.identity != null ? s.identity : '_void');
      const key = _frame + '|' + lensTag + '|' + idTag;
      if (_cache.has(key)) return _cache.get(key);
      const v = fn(s, state, Dim);
      _cache.set(key, v);
      return v;
    }

    function invoke(s, lens, state) { return observe(s, state, lens); }

    // Presence: derive an entity's spatial occupancy this frame.
    // Projectiles: swept segment from previous → current position.
    // Other entities: sphere at current position.
    // shape: 0 = sphere, 1 = segment. Pure: allocates one fresh presence.
    // For the hot per-pair narrow phase use intersectsEntities(a, b, dt) — it
    // computes both presences in locals and allocates nothing.
    function presence(e, dt) {
      if (!e || !e.position) return null;
      const r = e.radius != null ? e.radius : 10;
      const t = e.type;
      const isProj = t === 'laser' || t === 'torpedo' || t === 'machinegun' || t === 'bomb';
      const stepDt = dt != null ? dt : _dt;
      const ez = e.position.z || 0;
      if (isProj && e.velocity) {
        return {
          shape: 1, radius: r,
          p0x: e.position.x - e.velocity.x * stepDt,
          p0y: e.position.y - e.velocity.y * stepDt,
          p0z: ez - (e.velocity.z || 0) * stepDt,
          p1x: e.position.x, p1y: e.position.y, p1z: ez,
        };
      }
      return { shape: 0, radius: r, p0x: e.position.x, p0y: e.position.y, p0z: ez };
    }

    // Allocation-free presence resolver. Pure entities → six floats per side.
    // Keeps the narrow phase O(1) garbage in dense scenes (164 rocks * waves).
    function _resolve(e, dt, out) {
      const r = e.radius != null ? e.radius : 10;
      const t = e.type;
      const isProj = t === 'laser' || t === 'torpedo' || t === 'machinegun' || t === 'bomb';
      const stepDt = dt != null ? dt : _dt;
      const ez = e.position.z || 0;
      out.r = r;
      if (isProj && e.velocity) {
        out.shape = 1;
        out.p0x = e.position.x - e.velocity.x * stepDt;
        out.p0y = e.position.y - e.velocity.y * stepDt;
        out.p0z = ez - (e.velocity.z || 0) * stepDt;
        out.p1x = e.position.x; out.p1y = e.position.y; out.p1z = ez;
      } else {
        out.shape = 0;
        out.p0x = e.position.x; out.p0y = e.position.y; out.p0z = ez;
      }
    }
    const _pa = { shape: 0, r: 0, p0x: 0, p0y: 0, p0z: 0, p1x: 0, p1y: 0, p1z: 0 };
    const _pb = { shape: 0, r: 0, p0x: 0, p0y: 0, p0z: 0, p1x: 0, p1y: 0, p1z: 0 };
    function intersectsEntities(a, b, dt) {
      if (!a || !a.position || !b || !b.position) return false;
      _resolve(a, dt, _pa);
      _resolve(b, dt, _pb);
      const rSum = _pa.r + _pb.r;
      const rSumSq = rSum * rSum;
      if (_pa.shape === 0 && _pb.shape === 0) {
        const dx = _pa.p0x - _pb.p0x, dy = _pa.p0y - _pb.p0y, dz = _pa.p0z - _pb.p0z;
        return dx * dx + dy * dy + dz * dz < rSumSq;
      }
      let A = _pa, B = _pb;
      if (A.shape === 0) { A = _pb; B = _pa; }
      const ax = A.p0x, ay = A.p0y, az = A.p0z;
      const dx = A.p1x - ax, dy = A.p1y - ay, dz = A.p1z - az;
      const dLen2 = dx * dx + dy * dy + dz * dz;
      let bx, by, bz;
      if (B.shape === 0) { bx = B.p0x; by = B.p0y; bz = B.p0z; }
      else { bx = (B.p0x + B.p1x) * 0.5; by = (B.p0y + B.p1y) * 0.5; bz = (B.p0z + B.p1z) * 0.5; }
      let t = 0;
      if (dLen2 > 1e-6) {
        t = ((bx - ax) * dx + (by - ay) * dy + (bz - az) * dz) / dLen2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
      }
      const cx = ax + dx * t - bx, cy = ay + dy * t - by, cz = az + dz * t - bz;
      return cx * cx + cy * cy + cz * cz < rSumSq;
    }

    // Swept sphere (segment p0→p1 of radius pr) vs static sphere at (sx,sy,sz)
    // of radius sr. Raw-numbers API so callers iterating typed arrays don't
    // need to synthesize entity objects. Closest point on segment to sphere
    // centre, then sphere-vs-sphere test at that point.
    function intersectsSweptSphere(p0x, p0y, p0z, p1x, p1y, p1z, pr, sx, sy, sz, sr) {
      const dx = p1x - p0x, dy = p1y - p0y, dz = p1z - p0z;
      const dLen2 = dx * dx + dy * dy + dz * dz;
      let t = 0;
      if (dLen2 > 1e-6) {
        t = ((sx - p0x) * dx + (sy - p0y) * dy + (sz - p0z) * dz) / dLen2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
      }
      const cx = p0x + dx * t - sx, cy = p0y + dy * t - sy, cz = p0z + dz * t - sz;
      const rSum = pr + sr;
      return cx * cx + cy * cy + cz * cz < rSum * rSum;
    }

    function intersects(pa, pb) {
      if (!pa || !pb) return false;
      const rSum = pa.radius + pb.radius;
      const rSumSq = rSum * rSum;
      if (pa.shape === 0 && pb.shape === 0) {
        const dx = pa.p0x - pb.p0x, dy = pa.p0y - pb.p0y, dz = pa.p0z - pb.p0z;
        return dx * dx + dy * dy + dz * dz < rSumSq;
      }
      // Ensure A is the segment (or first segment for segment-segment pairs)
      let A = pa, B = pb;
      if (A.shape === 0) { A = pb; B = pa; }
      const ax = A.p0x, ay = A.p0y, az = A.p0z;
      const dx = A.p1x - ax, dy = A.p1y - ay, dz = A.p1z - az;
      const dLen2 = dx * dx + dy * dy + dz * dz;
      let bx, by, bz;
      if (B.shape === 0) { bx = B.p0x; by = B.p0y; bz = B.p0z; }
      else {
        bx = (B.p0x + B.p1x) * 0.5; by = (B.p0y + B.p1y) * 0.5; bz = (B.p0z + B.p1z) * 0.5;
      }
      let t = 0;
      if (dLen2 > 1e-6) {
        t = ((bx - ax) * dx + (by - ay) * dy + (bz - az) * dz) / dLen2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
      }
      const cx = ax + dx * t - bx, cy = ay + dy * t - by, cz = az + dz * t - bz;
      return cx * cx + cy * cy + cz * cz < rSumSq;
    }

    function tick(dt) {
      _frame++;
      const step = dt != null ? dt : 1 / 60;
      _now += step;
      _dt = step;
      _cache.clear();
    }

    function frame() { return _frame; }
    function now() { return _now; }
    function dt() { return _dt; }

    return {
      ingest, expand, collapse, invoke, oscillate,
      seed, kind,
      defineLens, observe,
      presence, intersects, intersectsEntities, intersectsSweptSphere,
      tick, frame, now, dt,
      FIB,
    };
  })();

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API — same surface. 17.5x less memory.
  // ══════════════════════════════════════════════════════════════════════════

  return {
    // Regions
    region,

    // Entity lifecycle
    place,
    remove,
    reap,

    // Observation (reconstructs from x, y on demand)
    observe,
    observeAll,
    observeByType,

    // Physics
    evolve,
    detectCollisions,
    distance,
    distanceSq,

    // Lenses (pure projections from coordinates)
    lens,
    project,

    // Core equations (exposed for game-side derivations)
    z: _z,               // z = xy²  — two inputs, one quadratic output
    m: _m,               // m = xyz  — three inputs, one multiplicative output
    surface: _surface,    // Schwartz Diamond + gyroid + blend at (x,y)
    position3d: _position3d,

    // Composition equations (z as the sum of its parts)
    zSum: _zSum,
    zFib: _zFib,
    zFibSeries: _zFibSeries,

    // Projection equations (y as the division of x by the whole)
    yLinear: _yLinear,
    yQuadratic: _yQuadratic,

    // Ingestion (data → two numbers, source dropped)
    ingest,
    ingestAll,
    sortByToken,
    nearest,
    resolveAxis,

    // Data storage (substrate compat) — write() chains revisions; read() returns latest
    write,
    read,
    readAll,
    history,
    at,
    queryNearby,

    // Surface math (pure functions, zero storage)
    surface: { gyroid, diamond, blend, diamondGrad },

    // TPMS field kernel (Gyroid + Schwartz Diamond + trig). The runtime
    // manifold the four-function loop (observe / solve / collapse / bloom)
    // operates on. Loaded from js/manifold-field.js — same module the
    // server consumes via require(), so client and server share one fabric.
    field: (typeof window !== 'undefined' && window.ManifoldField)
      || (typeof globalThis !== 'undefined' && globalThis.ManifoldField)
      || (typeof require === 'function' ? (() => { try { return require('./manifold-field.js'); } catch (e) { return null; } })() : null),

    // Four-function loop: observe → solve → collapse → bloom. Operates on
    // the field above; consumed by the lobby and per-game lenses.
    loop: (typeof window !== 'undefined' && window.ManifoldLoop)
      || (typeof globalThis !== 'undefined' && globalThis.ManifoldLoop)
      || (typeof require === 'function' ? (() => { try { return require('./manifold-loop.js'); } catch (e) { return null; } })() : null),

    // Append-only seed log — the backup. memory() everywhere, file(path) in Node.
    seedLog: (typeof window !== 'undefined' && window.ManifoldSeedLog)
      || (typeof globalThis !== 'undefined' && globalThis.ManifoldSeedLog)
      || (typeof require === 'function' ? (() => { try { return require('./manifold-seedlog.js'); } catch (e) { return null; } })() : null),

    // 🍴 Dining Philosophers — fork-based race condition eliminator
    // Every app/game shares this. No duplication.
    DiningPhilosophers,

    // Dimensional framework — five verbs, seeds, lenses, presences,
    // deterministic frame clock. Per docs/proposed_rules.md and
    // starfighter/docs/dimensinal_equation.md.
    dim: Dim,

    // Events
    on,

    // Stats (shows the reduction)
    stats,
  };
})();

if (typeof window !== 'undefined') window.Manifold = Manifold;
if (typeof module !== 'undefined') module.exports = Manifold;
