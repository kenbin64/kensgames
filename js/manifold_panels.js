/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  MANIFOLD PANELS  ·  3D Interactive Substrate                           ║
 * ║                                                                          ║
 * ║  Applies the manifold z = x·y access axiom to HTML panels:              ║
 * ║    • Cursor position (x, y) normalized to [-1, 1] within each card     ║
 * ║    • z = x·y  → dimensional lift value at that cursor location         ║
 * ║    • Panels tilt, glow, and shimmer based on the derived z value        ║
 * ║    • Click triggers a "dimensional fold" ripple from the manifold       ║
 * ║    • Particles spawned at cursor are colored by the theme manifold      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Auto-activates on:
 *   .feat-card  .panel  .about-card  .invite-box  .stat-box
 *   .lobby-panel  .m-panel  [data-manifold]
 *
 * No dependencies. Reads theme from ManifoldReality.getTheme() or
 * document.body.dataset.mtheme.
 */

(function () {
  'use strict';

  // ── Theme color table (RGB 0-255) ────────────────────────────────────────
  const THEME_RGB = {
    cyan: [0, 255, 255],
    purple: [191, 0, 255],
    green: [57, 255, 20],
    gold: [255, 191, 0],
  };

  function getTheme() {
    if (window.ManifoldReality && window.ManifoldReality.getTheme) {
      return window.ManifoldReality.getTheme();
    }
    return document.body.dataset.mtheme || 'cyan';
  }

  function themeRGB() {
    return THEME_RGB[getTheme()] || THEME_RGB.cyan;
  }

  function themeCSS(alpha) {
    const [r, g, b] = themeRGB();
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ── Selector list ────────────────────────────────────────────────────────
  const SELECTORS = [
    '.feat-card',
    '.panel',
    '.about-card',
    '.invite-box',
    '.stat-box',
    '.lobby-panel',
    '.m-panel',
    '[data-manifold]',
  ].join(', ');

  // ── Install global CSS ───────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('manifold-panel-css')) return;
    const style = document.createElement('style');
    style.id = 'manifold-panel-css';
    style.textContent = `
      /* ── Manifold 3D Panel Base ────────────────────────────────────── */
      .m-3d-wrap {
        perspective: 900px;
        perspective-origin: 50% 50%;
        /* Must wrap the panel element for CSS 3D to work correctly */
      }

      .feat-card,
      .panel,
      .about-card,
      .invite-box,
      .stat-box,
      .lobby-panel,
      .m-panel,
      [data-manifold] {
        transform-style: preserve-3d;
        transition:
          transform  0.18s cubic-bezier(0.23, 1, 0.32, 1),
          box-shadow 0.18s cubic-bezier(0.23, 1, 0.32, 1),
          border-color 0.18s ease;
        will-change: transform;
        position: relative;
        overflow: visible !important;
        cursor: default;
      }

      /* ── Shine overlay (follows cursor via CSS vars --mx --my) ──────── */
      .feat-card::after,
      .panel::after,
      .about-card::after,
      .invite-box::after,
      .stat-box::after,
      .lobby-panel::after,
      .m-panel::after,
      [data-manifold]::after {
        content: '';
        position: absolute;
        inset: -1px;
        border-radius: inherit;
        background: radial-gradient(
          circle at var(--mx, 50%) var(--my, 50%),
          rgba(255,255,255,0.11) 0%,
          rgba(255,255,255,0.04) 30%,
          transparent 65%
        );
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.25s ease;
        z-index: 10;
      }

      .feat-card:hover::after,
      .panel:hover::after,
      .about-card:hover::after,
      .invite-box:hover::after,
      .stat-box:hover::after,
      .lobby-panel:hover::after,
      .m-panel:hover::after,
      [data-manifold]:hover::after {
        opacity: 1;
      }

      /* ── Dimensional edge glow (z=x·y derived intensity) ───────────── */
      .feat-card::before,
      .panel::before,
      .about-card::before,
      .invite-box::before,
      .stat-box::before,
      .lobby-panel::before,
      .m-panel::before,
      [data-manifold]::before {
        content: '';
        position: absolute;
        inset: -1px;
        border-radius: inherit;
        border: 1px solid transparent;
        background: linear-gradient(
          var(--m-glow-angle, 135deg),
          var(--m-glow-color, rgba(0,255,255,0.5)) 0%,
          transparent 50%,
          var(--m-glow-color2, rgba(191,0,255,0.4)) 100%
        ) border-box;
        -webkit-mask:
          linear-gradient(#fff 0 0) padding-box,
          linear-gradient(#fff 0 0);
        -webkit-mask-composite: destination-out;
        mask-composite: exclude;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease;
        z-index: 9;
      }

      .feat-card:hover::before,
      .panel:hover::before,
      .about-card:hover::before,
      .invite-box:hover::before,
      .stat-box:hover::before,
      .lobby-panel:hover::before,
      .m-panel:hover::before,
      [data-manifold]:hover::before {
        opacity: 1;
      }

      /* ── Click dimensional fold ─────────────────────────────────────── */
      @keyframes m-fold-press {
        0%   { transform: var(--m-tilt-base, none) scale(1); }
        40%  { transform: var(--m-tilt-base, none) scale(0.955) translateZ(-10px); }
        100% { transform: var(--m-tilt-base, none) scale(1); }
      }
      .m-pressing {
        animation: m-fold-press 0.28s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
      }

      /* ── Ripple ─────────────────────────────────────────────────────── */
      .m-ripple {
        position: absolute;
        border-radius: 50%;
        pointer-events: none;
        transform: scale(0);
        opacity: 0.7;
        animation: m-ripple-expand 0.55s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        z-index: 20;
      }
      @keyframes m-ripple-expand {
        to { transform: scale(4); opacity: 0; }
      }

      /* ── Manifold particles ─────────────────────────────────────────── */
      .m-particle {
        position: fixed;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        pointer-events: none;
        z-index: 9999;
        animation: m-particle-float var(--dur, 1.2s) ease-out forwards;
      }
      @keyframes m-particle-float {
        0%   { transform: translate(0, 0)    scale(1);   opacity: 0.9; }
        100% { transform: translate(var(--dx,0), var(--dy,-60px)) scale(0); opacity: 0; }
      }

      /* ── Dimensional data readout (corner label on hover) ───────────── */
      .m-dim-label {
        position: absolute;
        bottom: 6px;
        right: 8px;
        font-family: 'Press Start 2P', monospace;
        font-size: 0.28rem;
        letter-spacing: 1px;
        color: var(--m-glow-color, rgba(0,255,255,0.6));
        opacity: 0;
        transition: opacity 0.3s 0.1s;
        pointer-events: none;
        z-index: 15;
        text-shadow: 0 0 6px currentColor;
      }
      .feat-card:hover .m-dim-label,
      .panel:hover      .m-dim-label,
      .about-card:hover .m-dim-label,
      .stat-box:hover   .m-dim-label {
        opacity: 0.85;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Wrap element in a perspective container ──────────────────────────────
  function wrapPerspective(el) {
    if (el.parentElement && el.parentElement.classList.contains('m-3d-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'm-3d-wrap';
    // Copy display so grid/flex parents aren't disrupted
    const cs = window.getComputedStyle(el);
    wrap.style.display = cs.display === 'block' ? 'block' : cs.display;
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);
  }

  // ── Attach 3D interaction to a single element ────────────────────────────
  function attachPanel(el) {
    if (el.dataset.manifoldAttached) return;
    el.dataset.manifoldAttached = 'true';

    wrapPerspective(el);

    // Inject dim label
    const label = document.createElement('div');
    label.className = 'm-dim-label';
    label.textContent = 'z=x·y';
    el.appendChild(label);

    const MAX_TILT = 12;  // degrees
    const MAX_LIFT = 28;  // px translateZ

    function onMove(e) {
      const rect = el.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / rect.width;   // [0,1]
      const cy = (e.clientY - rect.top) / rect.height;  // [0,1]
      const nx = cx * 2 - 1;   // [-1, 1]
      const ny = cy * 2 - 1;   // [-1, 1]

      /* The Manifold Access Axiom: z = x · y
         At cursor (nx, ny), the dimensional lift z = nx * ny.
         Near the center z ≈ 0 (flat).  Near diagonal corners z → ±1 (max lift). */
      const z = nx * ny;
      const zAbs = Math.abs(z);

      const rotY = nx * MAX_TILT;
      const rotX = -ny * MAX_TILT;
      const lift = zAbs * MAX_LIFT;

      el.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(${lift}px)`;

      /* Shine overlay follows cursor */
      el.style.setProperty('--mx', `${cx * 100}%`);
      el.style.setProperty('--my', `${cy * 100}%`);

      /* Edge glow: angle and color derived from z = x·y */
      const angle = Math.atan2(ny, nx) * (180 / Math.PI) + 90;
      const [r, g, b] = themeRGB();
      const alpha1 = 0.3 + zAbs * 0.55;
      const alpha2 = 0.25 + zAbs * 0.4;
      el.style.setProperty('--m-glow-angle', `${angle}deg`);
      el.style.setProperty('--m-glow-color', `rgba(${r},${g},${b},${alpha1})`);
      el.style.setProperty('--m-glow-color2', `rgba(${r / 2},${g / 4},${b / 2 + 128},${alpha2})`);

      /* Shadow: depth of shadow tied to z value */
      const shadowSize = 8 + zAbs * 30;
      el.style.boxShadow = `0 ${lift * 0.6}px ${shadowSize}px rgba(${r},${g},${b},${0.1 + zAbs * 0.2}), 0 ${lift}px ${shadowSize * 2}px rgba(0,0,0,0.35)`;

      /* Update dim label */
      label.textContent = `z=${nx.toFixed(2)}·${ny.toFixed(2)}=${z.toFixed(3)}`;
    }

    function onLeave() {
      el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
      el.style.boxShadow = '';
      el.style.setProperty('--mx', '50%');
      el.style.setProperty('--my', '50%');
      label.textContent = 'z=x·y';
    }

    function onClick(e) {
      /* Dimensional fold: brief press-in animation */
      el.classList.remove('m-pressing');
      void el.offsetWidth; // reflow
      el.classList.add('m-pressing');
      el.addEventListener('animationend', () => el.classList.remove('m-pressing'), { once: true });

      /* Ripple: circle expanding from click point */
      const rect = el.getBoundingClientRect();
      const ripple = document.createElement('div');
      ripple.className = 'm-ripple';
      const size = Math.max(rect.width, rect.height) * 0.5;
      const [r, g, b] = themeRGB();
      ripple.style.cssText = `
        width:  ${size}px;
        height: ${size}px;
        left:   ${e.clientX - rect.left - size / 2}px;
        top:    ${e.clientY - rect.top - size / 2}px;
        background: radial-gradient(circle, rgba(${r},${g},${b},0.5) 0%, transparent 70%);
      `;
      el.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());

      /* Particles from click point */
      spawnParticles(e.clientX, e.clientY, 8);
    }

    el.addEventListener('mousemove', onMove, { passive: true });
    el.addEventListener('mouseleave', onLeave, { passive: true });
    el.addEventListener('mousedown', onClick);
  }

  // ── Spawn manifold particles ─────────────────────────────────────────────
  function spawnParticles(x, y, count) {
    const [r, g, b] = themeRGB();
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'm-particle';
      /* z = x·y: each particle's trajectory derived from manifold axiom */
      const angle = (Math.random() - 0.5) * Math.PI * 1.8;
      const speed = 30 + Math.random() * 60;
      const dx = Math.cos(angle) * speed;
      const dy = -(20 + Math.random() * 80);
      const dur = 0.7 + Math.random() * 0.8;
      /* Particle color: theme with slight hue offset via z=x·y value */
      const hoff = Math.random() * 40 - 20;
      p.style.cssText = `
        left: ${x - 2}px;
        top:  ${y - 2}px;
        --dx: ${dx}px;
        --dy: ${dy}px;
        --dur: ${dur}s;
        background: rgba(${Math.min(255, r + hoff)},${Math.min(255, g + hoff)},${Math.min(255, b + hoff)},0.9);
        box-shadow: 0 0 6px rgba(${r},${g},${b},0.8);
        animation-delay: ${i * 0.04}s;
      `;
      document.body.appendChild(p);
      p.addEventListener('animationend', () => p.remove());
    }
  }

  // ── Hover particles (subtle ambient, not click burst) ────────────────────
  let hoverTimer = null;
  function installHoverParticles(el) {
    el.addEventListener('mouseenter', () => {
      hoverTimer = setInterval(() => {
        if (!el.matches(':hover')) { clearInterval(hoverTimer); return; }
        const rect = el.getBoundingClientRect();
        /* Random point on element boundary, biased to edges */
        const side = Math.floor(Math.random() * 4);
        let px, py;
        if (side === 0) { px = rect.left + Math.random() * rect.width; py = rect.top; }
        else if (side === 1) { px = rect.right; py = rect.top + Math.random() * rect.height; }
        else if (side === 2) { px = rect.left + Math.random() * rect.width; py = rect.bottom; }
        else { px = rect.left; py = rect.top + Math.random() * rect.height; }
        spawnParticles(px, py, 1);
      }, 300);
    }, { passive: true });

    el.addEventListener('mouseleave', () => {
      clearInterval(hoverTimer);
    }, { passive: true });
  }

  // ── Attach to all matching panels ────────────────────────────────────────
  function attachAll() {
    document.querySelectorAll(SELECTORS).forEach(el => {
      attachPanel(el);
      installHoverParticles(el);
    });
  }

  // ── Observe for dynamically added panels ────────────────────────────────
  function observe() {
    const obs = new MutationObserver(mutations => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.matches && node.matches(SELECTORS)) {
            attachPanel(node);
            installHoverParticles(node);
          }
          node.querySelectorAll && node.querySelectorAll(SELECTORS).forEach(el => {
            attachPanel(el);
            installHoverParticles(el);
          });
        });
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  function boot() {
    injectCSS();
    attachAll();
    observe();

    /* Global click particles for free-form dimensional interaction */
    document.addEventListener('click', e => {
      if (!e.target.closest(SELECTORS)) return; // panels handle their own
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Public API
  window.ManifoldPanels = {
    refresh: attachAll,
    spawnParticles: spawnParticles,
  };
})();
