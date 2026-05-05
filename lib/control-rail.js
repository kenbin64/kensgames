/* ─────────────────────────────────────────────────────────────────────────
 * control-rail.js — HR-6.2 Fixed Control Rail toolkit
 * ─────────────────────────────────────────────────────────────────────────
 * Pairs with /lib/control-rail.css. Provides two singletons on window:
 *
 *   KGRail   — the fixed footer (always present)
 *   KGHeader — the optional fixed header
 *
 * Both auto-mount their DOM on first call so host pages don't have to
 * include the <aside id="kg-rail"> / <header id="kg-header"> tags
 * themselves (though they may, and the existing nodes will be reused).
 *
 * API
 *   KGRail.set(htmlOrNode [, handlers])  → returns the rail element
 *   KGRail.clear()                       → empties the rail (height kept)
 *   KGRail.hide() / KGRail.show()        → collapses/restores the rail height
 *   KGRail.tall(boolean)                 → expanded 2-row mode (--kg-rail-h-tall)
 *   KGRail.height(px)                    → override --kg-rail-h on this page
 *   KGRail.el                            → the live DOM node (read-only)
 *
 *   KGHeader.set(htmlOrNode [, handlers]) → activates header, returns element
 *   KGHeader.clear()                      → empties + collapses header
 *   KGHeader.el                           → the live DOM node
 *
 * `handlers` (optional) is a map of `data-act` → fn. After set() injects
 * the HTML, every `[data-act="key"]` element gets a click listener bound
 * to handlers[key], saving callers from doing the wiring by hand.
 * ──────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  function ensureNode(id, tag) {
    var n = document.getElementById(id);
    if (n) return n;
    n = document.createElement(tag);
    n.id = id;
    // Rail goes at end of body; header goes at start.
    if (id === 'kg-header') {
      if (document.body.firstChild) document.body.insertBefore(n, document.body.firstChild);
      else document.body.appendChild(n);
    } else {
      document.body.appendChild(n);
    }
    return n;
  }

  function bindHandlers(root, handlers) {
    if (!handlers) return;
    Object.keys(handlers).forEach(function (key) {
      root.querySelectorAll('[data-act="' + key + '"]').forEach(function (el) {
        el.addEventListener('click', function (ev) { handlers[key](ev, el); });
      });
    });
  }

  function setContent(node, content) {
    if (content == null) {
      node.innerHTML = '';
    } else if (typeof content === 'string') {
      node.innerHTML = content;
    } else if (content instanceof Node) {
      node.innerHTML = '';
      node.appendChild(content);
    } else {
      throw new TypeError('KGRail/KGHeader: content must be a string or Node');
    }
  }

  function makeMount(id, tag, opts) {
    opts = opts || {};
    var bodyClassWhenActive = opts.bodyClassWhenActive;
    var api = {
      get el() { return ensureNode(id, tag); },
      set: function (content, handlers) {
        var n = ensureNode(id, tag);
        setContent(n, content);
        bindHandlers(n, handlers);
        if (bodyClassWhenActive) document.body.classList.add(bodyClassWhenActive);
        return n;
      },
      clear: function () {
        var n = ensureNode(id, tag);
        n.innerHTML = '';
        if (bodyClassWhenActive) document.body.classList.remove(bodyClassWhenActive);
      },
    };
    return api;
  }

  // ── KGRail (footer) ──────────────────────────────────────────────────
  var rail = makeMount('kg-rail', 'aside');
  rail.el.setAttribute && rail.el.setAttribute('role', 'toolbar');
  rail.el.setAttribute && rail.el.setAttribute('aria-label', 'Controls');

  rail.hide = function () { document.body.classList.add('kg-rail-hidden'); };
  rail.show = function () { document.body.classList.remove('kg-rail-hidden'); };
  rail.tall = function (on) {
    var n = ensureNode('kg-rail', 'aside');
    n.classList.toggle('kg-rail-tall', !!on);
  };
  rail.height = function (px) {
    var v = (typeof px === 'number') ? (px + 'px') : String(px);
    document.documentElement.style.setProperty('--kg-rail-h', v);
  };

  // ── KGHeader (top bar) ───────────────────────────────────────────────
  var header = makeMount('kg-header', 'header', {
    bodyClassWhenActive: 'kg-header-active',
  });
  header.el.setAttribute && header.el.setAttribute('role', 'banner');

  // Export
  global.KGRail = rail;
  global.KGHeader = header;
})(window);
