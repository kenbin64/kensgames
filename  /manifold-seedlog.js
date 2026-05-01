/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 MANIFOLD SEED LOG — append-only backup of the bloom chain
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The manifold is the source of truth (math). This log is its backup (disk).
 * One line per bloom: { id, parent, dim, seed, t }. Replay rebuilds the
 * current frontier of seeds; the field re-derives everything else.
 *
 * Two backends, same interface:
 *   memory()      — works everywhere (browser + Node)
 *   file(path)    — JSONL on disk, hydrates on open, appends on bloom (Node)
 *
 * Interface: { append, replay, latest, latestById, snapshot, count, clear }
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function (root, factory) {
  'use strict';
  const SL = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = SL;
  if (root) root.ManifoldSeedLog = SL;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  let _fs = null, _path = null;
  function _node() {
    if (_fs) return _fs;
    if (typeof require !== 'function') return null;
    try { _fs = require('fs'); _path = require('path'); return _fs; } catch (e) { return null; }
  }

  // ── In-memory log (browser-safe, also the hydration buffer for file()) ──
  function memory() {
    const lines = [];
    return {
      kind: 'memory',
      append: function (seed) { lines.push(seed); return seed; },
      replay: function (fn) { for (let i = 0; i < lines.length; i++) fn(lines[i], i); },
      latest: function () { return lines.length ? lines[lines.length - 1] : null; },
      latestById: function (id) {
        for (let i = lines.length - 1; i >= 0; i--) if (lines[i].id === id) return lines[i];
        return null;
      },
      // Newest-wins-per-id frontier (the live set of seeds).
      snapshot: function () {
        const m = new Map();
        for (let i = 0; i < lines.length; i++) m.set(lines[i].id, lines[i]);
        return Array.from(m.values());
      },
      count: function () { return lines.length; },
      clear: function () { lines.length = 0; },
    };
  }

  // ── File-backed JSONL log (Node only) ───────────────────────────────────
  // Hydrates from disk on open so the in-memory frontier matches the backup
  // immediately. Append is sync — small writes, restart-safe by design.
  function file(path) {
    const fs = _node();
    if (!fs) throw new Error('ManifoldSeedLog.file: fs unavailable in this runtime');
    const dir = _path.dirname(path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(path)) fs.writeFileSync(path, '');
    const log = memory();
    const raw = fs.readFileSync(path, 'utf8');
    if (raw) {
      const lines = raw.split(/\n/);
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        if (!ln) continue;
        try { log.append(JSON.parse(ln)); } catch (e) { /* skip corrupt line */ }
      }
    }
    const memAppend = log.append;
    log.kind = 'file';
    log.path = path;
    log.append = function (seed) {
      memAppend(seed);
      fs.appendFileSync(path, JSON.stringify(seed) + '\n');
      return seed;
    };
    return log;
  }

  return { memory: memory, file: file };
});
