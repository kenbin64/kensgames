/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 MANIFOLD INGESTOR
 * Universal Adapter — Anything → Manifold Surface
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PRIMITIVE: z = x · y
 *
 * x and y are not just values — they are EXPRESSIONS.
 * They can be literals, property paths, functions, or math expressions.
 * z is the output. The runtime reads z. Minimal input, maximum output.
 *
 * Surface Geometry (Schwarz Diamond + Gyroid blend):
 *   Gyroid:  sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = 0
 *   Diamond: cos(x)cos(y)cos(z) − sin(x)sin(y)sin(z) = 0
 *
 * Usage:
 *   ManifoldIngestor.ingest(data, { x: 'playerCount', y: 'duration' })
 *   ManifoldIngestor.ingest(data, { x: d => d.players * d.difficulty, y: 45 })
 *   ManifoldIngestor.ingest(data, { x: ['multiply','players','difficulty'], y: 'duration' })
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const ManifoldIngestor = (() => {

  // ════════════════════════════════════════════════════════════════════════════
  // AXIS RESOLVER
  // x and y can be: number | string path | function | expression string | array
  // ════════════════════════════════════════════════════════════════════════════

  const _resolveArrayExpr = (expr, data) => {
    const [op, ...args] = expr;
    const vs = args.map(a => resolveAxis(a, data));
    const ops = {
      add:      vs => vs.reduce((a, b) => a + b, 0),
      subtract: ([a, b]) => a - b,
      multiply: vs => vs.reduce((a, b) => a * b, 1),
      divide:   ([a, b]) => a / b,
      pow:      ([a, b]) => Math.pow(a, b),
      sqrt:     ([a]) => Math.sqrt(a),
      log:      ([a]) => Math.log(a),
      abs:      ([a]) => Math.abs(a),
      max:      vs => Math.max(...vs),
      min:      vs => Math.min(...vs),
    };
    return ops[op] ? ops[op](vs) : 0;
  };

  const resolveAxis = (expr, data) => {
    if (typeof expr === 'number')   return expr;
    if (typeof expr === 'function') return expr(data);
    if (Array.isArray(expr))        return _resolveArrayExpr(expr, data);
    if (typeof expr === 'string') {
      // Expression string: contains operators, parens, or 'd.'
      if (/[+\-*/()^]|d\./.test(expr)) {
        try { return Function('d', `"use strict"; return (${expr})`)(data); } catch { return 0; }
      }
      // Dot-notation property path: 'a.b.c'
      return expr.split('.').reduce((obj, k) => obj?.[k], data) ?? 0;
    }
    return 0;
  };

  // ════════════════════════════════════════════════════════════════════════════
  // SURFACE GEOMETRY — Schwarz Diamond + Gyroid
  // ════════════════════════════════════════════════════════════════════════════

  const gyroidValue  = (x, y, z) =>
    Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x);

  const diamondValue = (x, y, z) =>
    Math.cos(x) * Math.cos(y) * Math.cos(z) - Math.sin(x) * Math.sin(y) * Math.sin(z);

  // Default blend: 70% gyroid + 30% diamond (matches gyroid.js renderer)
  const surfaceBlend = (x, y, z, t = 0.3) =>
    gyroidValue(x, y, z) * (1 - t) + diamondValue(x, y, z) * t;

  // ════════════════════════════════════════════════════════════════════════════
  // 3D PROJECTION — Maps manifold coords into visualization space
  // ════════════════════════════════════════════════════════════════════════════

  const projectTo3D = (mx, my, mz) => {
    const S = 10;
    const angle = Math.PI / 10;
    return {
      x: Math.cos(mx * angle) * (mx * S),
      y: mz / S,
      z: Math.sin(my * angle) * (my * S),
    };
  };

  // ════════════════════════════════════════════════════════════════════════════
  // DISTANCE — Euclidean in 3D projection space
  // ════════════════════════════════════════════════════════════════════════════

  const distance = (e1, e2) => {
    const dx = e1.position3d.x - e2.position3d.x;
    const dy = e1.position3d.y - e2.position3d.y;
    const dz = e1.position3d.z - e2.position3d.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };

  // ════════════════════════════════════════════════════════════════════════════
  // INGEST — THE CORE
  // Takes any data + axis schema → returns a manifold entity
  // ════════════════════════════════════════════════════════════════════════════

  const ingest = (data, schema = {}) => {
    const { x: xExpr = 1, y: yExpr = 1, id, label, color, meta = {} } = schema;

    const mx = resolveAxis(xExpr, data);
    const my = resolveAxis(yExpr, data);
    const mz = mx * my;                     // THE PRIMITIVE — z = x · y

    // Scale to surface parameter space (π-normalized)
    const sx = (mx / 10) * Math.PI;
    const sy = (my / 10) * Math.PI;
    const sz = (mz / 100) * Math.PI;

    const pos3d = projectTo3D(mx, my, mz);

    return {
      source:     data,
      schema:     { x: xExpr, y: yExpr },

      manifold: {
        x: mx,
        y: my,
        z: mz,   // Runtime reads this
      },

      surface: {
        gyroid:  gyroidValue(sx, sy, sz),
        diamond: diamondValue(sx, sy, sz),
        blend:   surfaceBlend(sx, sy, sz),
      },

      position3d: pos3d,
      token:      mz,    // What interpreters read

      id:    id    || data?.id    || String(Date.now().toString(36)),
      label: label || data?.name  || data?.title || String(mz),
      color: color || `hsl(${Math.abs(mz * 3.6) % 360}, 80%, 60%)`,
      meta,
      ingestedAt: Date.now(),
    };
  };

  // ════════════════════════════════════════════════════════════════════════════
  // BATCH / QUERY HELPERS
  // ════════════════════════════════════════════════════════════════════════════

  const ingestAll   = (items, schema) => items.map(item => ingest(item, schema));
  const sortByToken = entities => [...entities].sort((a, b) => a.token - b.token);
  const nearest     = (entity, pool, limit = 3) =>
    pool
      .filter(e => e.id !== entity.id)
      .map(e => ({ entity: e, distance: distance(entity, e) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

  const validateSchema = schema => {
    const errors = [];
    if (schema.x === undefined) errors.push('schema.x is required');
    if (schema.y === undefined) errors.push('schema.y is required');
    return { valid: errors.length === 0, errors };
  };

  // ════════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ════════════════════════════════════════════════════════════════════════════

  return {
    ingest,
    ingestAll,
    sortByToken,
    nearest,
    distance,
    validateSchema,
    resolveAxis,         // Exposed so schemas can be tested standalone
    surface: { gyroidValue, diamondValue, surfaceBlend, projectTo3D },
  };

})();

// Browser + Node dual export
if (typeof window !== 'undefined') window.ManifoldIngestor = ManifoldIngestor;
if (typeof module !== 'undefined') module.exports = ManifoldIngestor;
