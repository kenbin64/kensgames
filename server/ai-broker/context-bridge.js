// server/ai-broker/context-bridge.js
// Wraps the manifold-router broker with point-based context compression.
//
// Instead of passing raw history (50k tokens) to every model call,
// the bridge maintains a ManifoldContextStore per session and injects
// only the nearest points within a token budget.
//
// The engine already outputs manifold points (x, y, z, dim, substrate, answer).
// Those points ARE the compressed state. Store them. Retrieve by proximity.
// Nature stores a tree in a seed. We store a conversation in its points.
//
// Usage:
//   const { createContextBridge } = require('./context-bridge');
//   const bridge = createContextBridge({ config, onLog });
//   const result = await bridge.invoke({ role, sessionId, input, history });
//   // result.context_stats shows token savings
'use strict';

const { createManifoldBroker } = require('./manifold-router');
const { loadConfig } = require('./config');

const TAU = 2 * Math.PI;

// Schwarz Diamond proximity kernel (same as client-side).
function schwarzD(x, y, z) {
  return (
    Math.sin(x) * Math.sin(y) * Math.sin(z) +
    Math.sin(x) * Math.cos(y) * Math.cos(z) +
    Math.cos(x) * Math.sin(y) * Math.cos(z) +
    Math.cos(x) * Math.cos(y) * Math.sin(z)
  );
}

function manifoldDistance(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dz = (a.z || 0) - (b.z || 0);
  const dd = Math.abs((a.dim || 1) - (b.dim || 1)) / 7;
  const F  = schwarzD(dx * Math.PI, dz * Math.PI, dd * TAU);
  return Math.sqrt(dx*dx * 0.6 + dz*dz * 0.3 + dd*dd * 0.1) * 0.7 + Math.abs(F) * 0.3;
}

function estimateTokens(text) {
  if (typeof text !== 'string') text = JSON.stringify(text || '');
  return Math.ceil(text.length / 4);
}

// Per-session point store. Ring buffer: oldest pruned when capacity exceeded.
class SessionPointStore {
  constructor(capacity, pruneThreshold) {
    this._capacity       = capacity || 128;
    this._pruneThreshold = pruneThreshold || 1.4;
    this._points         = [];
    this._current        = null;
  }

  push(point) {
    if (!point || point.x == null) return;
    this._points.push({ ...point, _ts: Date.now() });
    if (this._points.length > this._capacity) this._points.shift();
    this._current = point;
  }

  nearest(queryPoint, n, maxDimDelta) {
    const mdd = maxDimDelta != null ? maxDimDelta : 3;
    return this._points
      .filter(p => Math.abs((p.dim || 1) - (queryPoint.dim || 1)) <= mdd)
      .map(p => ({ point: p, dist: manifoldDistance(queryPoint, p) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, n)
      .map(r => r.point);
  }

  // Build context string: nearest points within token budget.
  buildContext(queryPoint, tokenBudget) {
    const candidates = this.nearest(queryPoint, this._capacity);
    const selected = [];
    let used = 0;
    for (const p of candidates) {
      const cost = estimateTokens(p.answer || '');
      if (used + cost > tokenBudget) break;
      selected.push(p);
      used += cost;
    }
    if (selected.length === 0) return { text: '', tokenCount: 0, pointCount: 0 };
    selected.sort((a, b) => (a._ts || 0) - (b._ts || 0));
    const text = selected.map((p, i) =>
      `[${i} ${p.role || 'ai'} dim=${p.dim || 1} x=${(p.x || 0).toFixed(3)} z=${(p.z || 0).toFixed(3)}]\n${p.answer || ''}`
    ).join('\n\n');
    return { text, tokenCount: used, pointCount: selected.length };
  }

  // Prune points distant from current identity.
  prune(currentPoint) {
    const ref = currentPoint || this._current;
    if (!ref) return;
    this._points = this._points.filter(
      p => manifoldDistance(ref, p) <= this._pruneThreshold
    );
  }

  rawTokenCount() {
    return this._points.reduce((s, p) => s + estimateTokens(p.answer || ''), 0);
  }

  get size() { return this._points.length; }
}

// Extract a manifold point from a broker result if the model returned one.
// The engine outputs strict JSON: { x, y, z, substrate, dim, answer }.
function extractPoint(result, role) {
  const r = result && result.result;
  if (!r || r.x == null) return null;
  return {
    x:         r.x,
    y:         r.y || [],
    z:         r.z || 0,
    substrate: r.substrate || 'zynxy',
    dim:       r.dim || 1,
    answer:    r.answer || '',
    role:      role || 'assistant',
  };
}

// Map text to a rough manifold point for query purposes (no model call needed).
function textToQueryPoint(text, dim) {
  let h = 0x811c9dc5;
  const limit = Math.min((text || '').length, 128);
  for (let i = 0; i < limit; i++) {
    h ^= text.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  const x = ((h % 100000) / 50000) - 1;
  return { x, y: [], z: 0, dim: dim || 1 };
}

function createContextBridge(opts) {
  const options        = opts || {};
  const config         = options.config || loadConfig();
  const broker         = createManifoldBroker({ config, onLog: options.onLog });
  const capacity       = options.pointCapacity      || 128;
  const pruneThreshold = options.pruneThreshold      || 1.4;
  const contextBudget  = options.contextTokenBudget  || 2400;
  const onLog          = typeof options.onLog === 'function' ? options.onLog : null;

  // One store per sessionId.
  const stores = new Map();

  function getStore(sessionId) {
    const key = sessionId || '__global__';
    if (!stores.has(key)) stores.set(key, new SessionPointStore(capacity, pruneThreshold));
    return stores.get(key);
  }

  function log(entry) {
    if (onLog) { try { onLog(entry); } catch (_) {} }
  }

  // invoke(): drop-in for broker.invoke(), with context compression.
  // Extra fields on call:
  //   call.contextText  - raw text to add as a user point before routing
  //   call.skipContext  - set true to bypass compression (raw pass-through)
  async function invoke(call) {
    if (!call || !call.role) throw new Error('context-bridge: role required');

    const sessionId = call.sessionId || null;
    const store     = getStore(sessionId);

    // If caller provides raw context text, add it as a user point.
    if (call.contextText && typeof call.contextText === 'string') {
      const queryPoint = textToQueryPoint(call.contextText, 1);
      store.push({ ...queryPoint, answer: call.contextText, role: 'user' });
    }

    let compressedContext = null;
    let rawTokens         = 0;

    if (!call.skipContext && store.size > 0) {
      rawTokens = store.rawTokenCount();

      // Build a query point from the current input.
      const inputText = typeof call.input === 'string'
        ? call.input
        : JSON.stringify(call.input || '');
      const queryPoint = textToQueryPoint(inputText, call.input && call.input.dim || 1);

      compressedContext = store.buildContext(queryPoint, contextBudget);

      log({
        kind:            'context_compressed',
        sessionId,
        role:            call.role,
        rawTokens,
        compressedTokens: compressedContext.tokenCount,
        pointsUsed:       compressedContext.pointCount,
        savedTokens:     rawTokens - compressedContext.tokenCount,
        savedPct:        rawTokens > 0
          ? Math.round((1 - compressedContext.tokenCount / rawTokens) * 100) + '%'
          : '0%',
      });
    }

    // Inject compressed context into input.
    const enrichedInput = compressedContext && compressedContext.text
      ? Object.assign({}, call.input || {}, { _manifold_context: compressedContext.text })
      : call.input;

    const result = await broker.invoke({ ...call, input: enrichedInput });

    // Extract the manifold point from the response and store it.
    const newPoint = extractPoint(result, call.role);
    if (newPoint) {
      store.push(newPoint);
      // Opportunistically prune points that drifted far from new identity.
      store.prune(newPoint);
    }

    return {
      ...result,
      context_stats: {
        session_points: store.size,
        raw_tokens:        rawTokens,
        context_tokens:    compressedContext ? compressedContext.tokenCount : 0,
        points_used:       compressedContext ? compressedContext.pointCount : 0,
        saved_tokens:      rawTokens - (compressedContext ? compressedContext.tokenCount : 0),
      },
    };
  }

  // Snapshot the point store for a session (for debugging or persistence).
  function snapshot(sessionId) {
    const store = getStore(sessionId);
    return {
      size:     store.size,
      rawTokens: store.rawTokenCount(),
    };
  }

  // Evict a session's store (post-match cleanup).
  function evict(sessionId) {
    stores.delete(sessionId || '__global__');
  }

  return { invoke, snapshot, evict, broker };
}

module.exports = { createContextBridge };
