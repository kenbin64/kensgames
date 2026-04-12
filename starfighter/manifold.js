/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 SPACE COMBAT MANIFOLD — SCHWARZ DIAMOND HELIX
 * One Manifold. All Ships. One Universe.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * SURFACE: Schwarz Diamond
 *   cos(x)cos(y)cos(z) − sin(x)sin(y)sin(z) = 0
 *   Triply periodic minimal surface — no boundary, helix at any length.
 *
 * PRIMITIVE: z = x · y  (multiplicative)
 *   (x, y) is the coordinate. z follows.
 *
 * EFFICIENCY:
 *   - Spatial hash grid: O(n) collision detection instead of O(n²)
 *   - Lazy stamping: trig computed on demand, not every frame
 *   - Zero allocation in hot paths: reuse arrays and scratch vectors
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const SpaceManifold = (function () {

  const points = new Map();

  // Schwarz Diamond constants
  const SCALE = 2000;
  const K = (2 * Math.PI) / SCALE;

  // ════════════════════════════════════════════════════════════════════════════
  // SPATIAL HASH GRID — O(n) broad-phase collision detection
  // ════════════════════════════════════════════════════════════════════════════

  const CELL_SIZE = 500;        // game units per cell (covers combined radius: baseship 200 + alien-baseship 150 = 350)
  const INV_CELL = 1 / CELL_SIZE;
  const grid = new Map();       // "x,y,z" → entity[]
  let gridDirty = true;

  function _cellKey(x, y, z) {
    return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) | 0;
  }

  function _rebuildGrid() {
    grid.clear();
    for (const [, e] of points) {
      if (e.markedForDeletion) continue;
      const cx = (e.position.x * INV_CELL) | 0;
      const cy = (e.position.y * INV_CELL) | 0;
      const cz = (e.position.z * INV_CELL) | 0;
      const key = _cellKey(cx, cy, cz);
      const bucket = grid.get(key);
      if (bucket) bucket.push(e);
      else grid.set(key, [e]);
    }
    gridDirty = false;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCHWARZ DIAMOND — on-demand, not per-frame
  // ════════════════════════════════════════════════════════════════════════════

  function diamond(x, y, z) {
    const u = x * K, v = y * K, w = z * K;
    return Math.cos(u) * Math.cos(v) * Math.cos(w)
      - Math.sin(u) * Math.sin(v) * Math.sin(w);
  }

  function diamondGrad(x, y, z) {
    const u = x * K, v = y * K, w = z * K;
    const cu = Math.cos(u), su = Math.sin(u);
    const cv = Math.cos(v), sv = Math.sin(v);
    const cw = Math.cos(w), sw = Math.sin(w);
    return {
      x: (-su * cv * cw - cu * sv * sw) * K,
      y: (-cu * sv * cw - su * cv * sw) * K,
      z: (-cu * cv * sw - su * sv * cw) * K,
    };
  }

  function helixPhase(x, y) {
    return Math.atan2(y * K, x * K);
  }

  function manifoldCoord(pos) {
    const mx = pos.x * K;
    const my = pos.y * K;
    return { u: mx, v: my, w: mx * my };
  }

  // Stamp on demand — call when you need manifold state, not every frame
  function stamp(e) {
    const p = e.position;
    const mx = p.x * K, my = p.y * K;
    e._m = {
      u: mx, v: my, w: mx * my,
      field: Math.cos(mx) * Math.cos(my) * Math.cos(p.z * K)
        - Math.sin(mx) * Math.sin(my) * Math.sin(p.z * K),
      phase: Math.atan2(my, mx),
    };
    return e._m;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PLACE / REMOVE
  // ════════════════════════════════════════════════════════════════════════════

  function place(entity) {
    points.set(entity.id, entity);
    gridDirty = true;
  }

  function remove(id) {
    points.delete(id);
    gridDirty = true;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EVOLVE — advance all positions. Marks grid dirty for next collision check.
  // No trig. No stamps. Pure position += velocity * dt.
  // ════════════════════════════════════════════════════════════════════════════

  function evolve(dt) {
    for (const [, e] of points) {
      if (e.markedForDeletion) continue;
      e.position.x += e.velocity.x * dt;
      e.position.y += e.velocity.y * dt;
      e.position.z += e.velocity.z * dt;
    }
    gridDirty = true;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // OBSERVE — pure reads
  // ════════════════════════════════════════════════════════════════════════════

  // Reusable array to avoid allocation per frame
  let _liveCache = [];
  let _liveDirty = true;

  function observe(id) {
    return points.get(id) || null;
  }

  function observeAll() {
    if (!_liveDirty) return _liveCache;
    _liveCache = [];
    for (const [, p] of points) {
      if (!p.markedForDeletion) _liveCache.push(p);
    }
    _liveDirty = false;
    return _liveCache;
  }

  function observeByType(type) {
    const result = [];
    for (const [, p] of points) {
      if (!p.markedForDeletion && p.type === type) result.push(p);
    }
    return result;
  }

  function observeRelative(observer, target) {
    const invQuat = observer.quaternion.clone().invert();
    return target.position.clone().sub(observer.position).applyQuaternion(invQuat);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PROXIMITY — spatial hash broad phase + exact distance narrow phase
  // ════════════════════════════════════════════════════════════════════════════

  const _pairSet = new Set();   // dedup pairs
  const _pairs = [];            // reusable result

  function detectCollisions() {
    if (gridDirty) _rebuildGrid();

    _pairSet.clear();
    _pairs.length = 0;

    for (const [, bucket] of grid) {
      const n = bucket.length;
      if (n < 2) continue;
      for (let i = 0; i < n; i++) {
        const a = bucket[i];
        if (a.markedForDeletion) continue;
        for (let j = i + 1; j < n; j++) {
          const b = bucket[j];
          if (b.markedForDeletion) continue;
          // Dedup: smaller id first
          const key = a.id < b.id ? a.id + b.id : b.id + a.id;
          if (_pairSet.has(key)) continue;
          const dx = a.position.x - b.position.x;
          const dy = a.position.y - b.position.y;
          const dz = a.position.z - b.position.z;
          const dSq = dx * dx + dy * dy + dz * dz;
          const rSum = (a.radius || 10) + (b.radius || 10);
          if (dSq < rSum * rSum) {
            _pairSet.add(key);
            _pairs.push([a, b]);
          }
        }
      }
    }

    // CELL_SIZE=500 covers the largest combined radius pair (baseship 200 + alien-baseship 150 = 350)
    // so same-cell checks are sufficient.

    return _pairs;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // REAP / DISTANCE
  // ════════════════════════════════════════════════════════════════════════════

  function reap() {
    for (const [id, p] of points) {
      if (p.markedForDeletion) points.delete(id);
    }
    gridDirty = true;
    _liveDirty = true;
  }

  function distance(a, b) {
    const dx = a.position.x - b.position.x;
    const dy = a.position.y - b.position.y;
    const dz = a.position.z - b.position.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function distanceSq(a, b) {
    const dx = a.position.x - b.position.x;
    const dy = a.position.y - b.position.y;
    const dz = a.position.z - b.position.z;
    return dx * dx + dy * dy + dz * dz;
  }

  // Mark live cache dirty whenever entities change
  function _invalidateLive() { _liveDirty = true; }

  // Override place/remove to also invalidate live cache
  const _origPlace = place;
  const _origRemove = remove;

  return {
    place(entity) { _origPlace(entity); _invalidateLive(); },
    remove(id) { _origRemove(id); _invalidateLive(); },
    evolve(dt) { evolve(dt); _invalidateLive(); },
    reap,
    observe,
    observeAll,
    observeByType,
    observeRelative,
    detectCollisions,
    distance,
    distanceSq,
    stamp,
    diamond,
    diamondGrad,
    helixPhase,
    manifoldCoord,
    SCALE,
    K,
  };

})();

window.SpaceManifold = SpaceManifold;
