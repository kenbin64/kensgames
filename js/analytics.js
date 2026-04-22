/**
 * KensGames Privacy Analytics — Directive 2.6
 * ─────────────────────────────────────────────
 * First-party analytics. No PII. No cookies. No external scripts.
 * No fingerprinting. No user identifiers of any kind.
 *
 * Tracks:
 *   - Section scroll depth  (which named sections the user saw)
 *   - Game launches         (clicks on .btn-play / [data-game-id])
 *   - Session duration      (seconds from page load to page unload)
 *
 * Data is batched in memory and flushed via navigator.sendBeacon to
 * POST /api/analytics on page unload. If sendBeacon is unavailable,
 * data is silently discarded — analytics are best-effort, never
 * blocking and never retried.
 */
(function () {
  'use strict';

  var _sessionStart = Date.now();
  var _events = [];   // { t: type, d: data, ts: offset_ms }

  function record(type, data) {
    _events.push({ t: type, d: data, ts: Date.now() - _sessionStart });
  }

  // ── Section scroll depth ──────────────────────────────────────────────────
  // Observe all page-section elements. Fire once per section per session.
  if (typeof IntersectionObserver !== 'undefined') {
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var id = entry.target.id || entry.target.className.split(' ')[0];
          record('section_view', { id: id });
          sectionObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    document.querySelectorAll('.page-section, .engine-section').forEach(function (el) {
      sectionObserver.observe(el);
    });
  }

  // ── Game launches ─────────────────────────────────────────────────────────
  // Listen for clicks on play buttons and game cards. Extract game name from
  // nearest [data-game-id], the href path, or a parent section id.
  document.addEventListener('click', function (ev) {
    var target = ev.target;
    // Walk up to find a play-button or game card anchor
    var node = target;
    for (var i = 0; i < 6; i++) {
      if (!node) break;
      var cls = node.className || '';
      var href = node.href || '';
      if (cls.indexOf('btn-play') !== -1 || node.getAttribute('data-game-id')) {
        var gameId = node.getAttribute('data-game-id') || '';
        if (!gameId && href) {
          // Extract game name from URL path segment
          var m = href.match(/\/(fasttrack|brickbreaker|starfighter|4dconnect|4dtictactoe|assemble|chomp)/i);
          gameId = m ? m[1].toLowerCase() : 'unknown';
        }
        record('game_launch', { game: gameId });
        break;
      }
      node = node.parentElement;
    }
  }, { passive: true });

  // ── Session duration + flush ──────────────────────────────────────────────
  function flush() {
    if (!_events.length) return;
    var payload = JSON.stringify({
      duration_ms: Date.now() - _sessionStart,
      events: _events
    });
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/analytics', new Blob([payload], { type: 'application/json' }));
    }
    _events = [];
  }

  // Flush on page hide (covers mobile background-tab close)
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });

  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
})();

