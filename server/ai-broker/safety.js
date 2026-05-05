// Safety layer: timeouts, token ceilings, retry/fallback policy.
// A broker outage must never stall a game (HR-21 manager liveness).
'use strict';

function nowMs() { return Date.now(); }

function withTimeout(promise, ms, onTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('ai-broker: call timed out after ' + ms + 'ms');
      err.code = 'AI_TIMEOUT';
      if (typeof onTimeout === 'function') {
        try { onTimeout(); } catch (_) { /* swallow */ }
      }
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function createCeilingTracker(cfg) {
  const sessionTokens = new Map();   // sessionId -> tokens used
  const dayTokens = { date: dayKey(), used: 0 };

  function dayKey() {
    const d = new Date();
    return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
  }

  function rotateDay() {
    const k = dayKey();
    if (k !== dayTokens.date) {
      dayTokens.date = k;
      dayTokens.used = 0;
    }
  }

  function add(sessionId, tokens) {
    rotateDay();
    dayTokens.used += tokens;
    if (sessionId) {
      const prev = sessionTokens.get(sessionId) || 0;
      sessionTokens.set(sessionId, prev + tokens);
    }
  }

  function check(sessionId, projectedTokens) {
    rotateDay();
    if (cfg.perDayTokenCap > 0 && dayTokens.used + projectedTokens > cfg.perDayTokenCap) {
      return { ok: false, reason: 'daily_token_cap_exceeded' };
    }
    if (sessionId && cfg.perSessionTokenCap > 0) {
      const used = sessionTokens.get(sessionId) || 0;
      if (used + projectedTokens > cfg.perSessionTokenCap) {
        return { ok: false, reason: 'session_token_cap_exceeded' };
      }
    }
    return { ok: true };
  }

  function snapshot() {
    rotateDay();
    return {
      day: dayTokens.date,
      dayUsed: dayTokens.used,
      sessions: Array.from(sessionTokens.entries()).map(([id, used]) => ({ sessionId: id, used })),
    };
  }

  function reset() {
    sessionTokens.clear();
    dayTokens.used = 0;
    dayTokens.date = dayKey();
  }

  return { add, check, snapshot, reset };
}

async function callWithFallback(opts) {
  const { primary, fallback, timeoutMs, onPrimaryError } = opts;
  const startedAt = nowMs();
  try {
    const result = await withTimeout(primary(), timeoutMs);
    return { source: 'primary', result, latencyMs: nowMs() - startedAt };
  } catch (err) {
    if (typeof onPrimaryError === 'function') {
      try { onPrimaryError(err); } catch (_) { /* swallow */ }
    }
    if (typeof fallback !== 'function') throw err;
    const result = await fallback(err);
    return { source: 'fallback', result, latencyMs: nowMs() - startedAt, primaryError: err };
  }
}

module.exports = { withTimeout, createCeilingTracker, callWithFallback, nowMs };
