// fork-table.js
// ---------------------------------------------------------------------------
// Dining-philosophers-style mutex registry for the lobby server.
//
// Each "fork" is a named lock keyed by some resource (userId, sessionId, …).
// A request that does not hold the relevant fork is rejected immediately with
// a `fork_denied` envelope (callers may surface this to the user as a toast).
//
// Deadlock-avoidance: a handler that needs more than one fork MUST acquire
// them in this fixed global order. Never the reverse.
//
//   create  →  join  →  end  →  replay  →  turn
//
// Every acquire() carries a TTL so a crashed holder cannot stall the table.
// ---------------------------------------------------------------------------

const FORK_ORDER = ['create', 'join', 'end', 'replay', 'turn'];
const ORDER_INDEX = Object.fromEntries(FORK_ORDER.map((n, i) => [n, i]));

const DEFAULT_TTL_MS = 5000;

class ForkTable {
  constructor() {
    /** Map<forkName, Map<key, { holderId, expiresAt, timer }>> */
    this._forks = new Map();
    for (const name of FORK_ORDER) this._forks.set(name, new Map());
  }

  _table(name) {
    if (!this._forks.has(name)) {
      throw new Error(`fork-table: unknown fork "${name}". Allowed: ${FORK_ORDER.join(', ')}`);
    }
    return this._forks.get(name);
  }

  /**
   * Try to acquire `name` for `key` on behalf of `holderId`.
   * Returns { ok: true } on success, or { ok: false, holder, name, key } if held.
   * The same holder reacquiring the same fork is a no-op success (re-entrant).
   */
  acquire(name, key, holderId, ttlMs = DEFAULT_TTL_MS) {
    const t = this._table(name);
    const k = String(key);
    const now = Date.now();
    const existing = t.get(k);
    if (existing && existing.expiresAt > now && existing.holderId !== holderId) {
      return { ok: false, holder: existing.holderId, name, key: k };
    }
    if (existing && existing.timer) clearTimeout(existing.timer);
    const expiresAt = now + ttlMs;
    const entry = { holderId, expiresAt, timer: null };
    entry.timer = setTimeout(() => {
      const cur = t.get(k);
      if (cur && cur.holderId === holderId && cur.expiresAt <= Date.now()) {
        t.delete(k);
      }
    }, ttlMs + 5);
    if (entry.timer.unref) entry.timer.unref();
    t.set(k, entry);
    return { ok: true };
  }

  /** Release `name` for `key` if `holderId` is the current holder. */
  release(name, key, holderId) {
    const t = this._table(name);
    const k = String(key);
    const cur = t.get(k);
    if (!cur) return false;
    if (holderId != null && cur.holderId !== holderId) return false;
    if (cur.timer) clearTimeout(cur.timer);
    t.delete(k);
    return true;
  }

  /** Return current holder id or null. */
  holder(name, key) {
    const cur = this._table(name).get(String(key));
    if (!cur) return null;
    if (cur.expiresAt <= Date.now()) { this._table(name).delete(String(key)); return null; }
    return cur.holderId;
  }

  /**
   * Release every fork (across all names) currently held by `holderId`.
   * Use on disconnect so crashed clients cannot stall the table.
   */
  releaseAllFor(holderId) {
    if (holderId == null) return 0;
    let n = 0;
    for (const t of this._forks.values()) {
      for (const [k, entry] of t) {
        if (entry.holderId === holderId) {
          if (entry.timer) clearTimeout(entry.timer);
          t.delete(k);
          n++;
        }
      }
    }
    return n;
  }

  /** Wipe a fork table (test/debug). */
  reset() {
    for (const t of this._forks.values()) {
      for (const entry of t.values()) if (entry.timer) clearTimeout(entry.timer);
      t.clear();
    }
  }
}

module.exports = { ForkTable, FORK_ORDER, ORDER_INDEX };
