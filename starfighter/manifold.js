/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 SPACE COMBAT MANIFOLD — SCHWARZ DIAMOND HELIX
 * Lens on the unified Manifold — region "starfighter"
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * SURFACE: Schwarz Diamond
 *   cos(x)cos(y)cos(z) − sin(x)sin(y)sin(z) = 0
 *
 * This is NO LONGER a standalone manifold. It delegates to the unified
 * Manifold (window.Manifold) using region "starfighter". Same API.
 * Games that loaded SpaceManifold directly still work — zero breakage.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const SpaceManifold = (function () {

  const REGION = 'starfighter';
  const SCALE = 2000;
  const K = (2 * Math.PI) / SCALE;

  // Ensure region exists on the unified manifold
  const M = window.Manifold;
  if (M) M.region(REGION, { cellSize: 1000 });

  // ════════════════════════════════════════════════════════════════════════════
  // SCHWARZ DIAMOND — game-specific surface math (kept for stamping)
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
  // DELEGATED API — all calls route through unified Manifold
  // ════════════════════════════════════════════════════════════════════════════

  function place(entity) {
    if (M) M.place(entity, REGION);
  }

  function remove(id) {
    if (M) M.remove(id);
  }

  function evolve(dt) {
    if (M) M.evolve(dt, REGION);
  }

  function reap() {
    if (M) M.reap(REGION);
  }

  function observe(id) {
    return M ? M.observe(id) : null;
  }

  function observeAll() {
    return M ? M.observeAll(REGION) : [];
  }

  function observeByType(type) {
    return M ? M.observeByType(type, REGION) : [];
  }

  function observeRelative(observer, target) {
    const invQuat = observer.quaternion.clone().invert();
    return target.position.clone().sub(observer.position).applyQuaternion(invQuat);
  }

  function detectCollisions() {
    return M ? M.detectCollisions(REGION) : [];
  }

  function distance(a, b) {
    return M ? M.distance(a, b) : 0;
  }

  function distanceSq(a, b) {
    return M ? M.distanceSq(a, b) : 0;
  }

  return {
    place,
    remove,
    evolve,
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
