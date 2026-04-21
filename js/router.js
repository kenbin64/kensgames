/**
 * Directive 2.1 — Deep-Link URL Routing
 * ButterflyFX™ / KensGames.com
 *
 * History API-based SPA router. Uses pushState / replaceState.
 * No hash routing. No frameworks. No dependencies.
 *
 * On load  : parse pathname → scroll to matching section
 * Scrolling: IntersectionObserver updates URL + meta when section crosses 50% threshold
 * Back/fwd : popstate → scroll to matching section
 * Unknown  : toast notification, replaceState to '/'
 */
(function () {
  'use strict';

  // ─── Route Map ──────────────────────────────────────────────────────────────
  // pathname → { sectionId, title, description, ogImage }
  const ROUTES = {
    '/': {
      sectionId: null,
      title: 'KensGames — Free Arcade Games | kensgames.com',
      description: 'KensGames — Play FastTrack, BrickBreaker 3D, Alien Space Attack, 4D TicTacToe and Assemble. Free browser games, no installs, no ads. Powered by a geometry-driven engine built from scratch.',
      ogImage: '/assets/masterImageFile/logo_thumbnail.png'
    },
    '/games': {
      sectionId: 'games',
      title: 'Free Arcade Games | KensGames',
      description: 'Five free browser games — FastTrack, BrickBreaker 3D, Alien Space Attack, 4D TicTacToe, Assemble. No installs, no ads, no pay-to-win.',
      ogImage: '/assets/masterImageFile/logo_thumbnail.png'
    },
    '/games/fasttrack': {
      sectionId: 'game-fasttrack',
      title: 'Fast Track — Free Racing Game | KensGames',
      description: 'A lightning-fast multiplayer board game. Race your pieces, block opponents, and play your hand right. Free in your browser.',
      ogImage: '/assets/masterImageFile/fasttrack_lobby.png'
    },
    '/games/brickbreaker': {
      sectionId: 'game-brickbreaker',
      title: 'BrickBreaker 3D — Free Brick Game | KensGames',
      description: 'The classic reimagined in full 3D. Walls of bricks stretch into depth, your ball curves through space. Free in your browser.',
      ogImage: '/assets/masterImageFile/brickbreaker3D_landing.png'
    },
    '/games/starfighter': {
      sectionId: 'game-starfighter',
      title: 'Starfighter — Free Space Shooter | KensGames',
      description: 'First-person deep-space combat rendered in real-time 3D. Waves of alien formations advance with tactical intelligence. Free in your browser.',
      ogImage: '/assets/masterImageFile/starfighter_landing.png'
    },
    '/games/tictactoe': {
      sectionId: 'game-tictactoe',
      title: '4D TicTacToe — Free Strategy Game | KensGames',
      description: 'TicTacToe in three and four dimensions. A 3x3x3x3 hypercube with 76 winning lines. Solo or multiplayer. Free in your browser.',
      ogImage: '/assets/masterImageFile/manifold.png'
    },
    '/games/assemble': {
      sectionId: 'game-assemble',
      title: 'Assemble — Free Puzzle Game | KensGames',
      description: 'Build contraptions from 50+ mechanical and electrical parts. If your design is structurally sound, it runs. Free in your browser.',
      ogImage: '/assets/masterImageFile/assembler_landing.png'
    },
    '/engine': {
      sectionId: 'engine',
      title: 'ButterflyFX Engine | KensGames',
      description: 'The ButterflyFX engine — a geometry-driven game substrate built from scratch. 185 production modules, zero event buses, hand-written WebGL2 and GLSL.',
      ogImage: '/assets/masterImageFile/logo_thumbnail.png',
      canonicalOverride: '/engine'
    },
    '/manifold': {
      sectionId: 'manifold',
      title: 'Manifold Substrate — Formal Proofs | KensGames',
      description: 'Formal complexity proofs for the manifold substrate architecture. O(N) coupling reduction, Schwartz Diamond deadlock prevention, grounded inference bounds.',
      ogImage: '/assets/masterImageFile/logo_thumbnail.png'
    },
    '/about': {
      sectionId: 'about',
      title: 'About Kenneth Bingham | KensGames',
      description: 'Kenneth Bingham — sole creator of KensGames.com and the ButterflyFX engine. Kaysville, Utah.',
      ogImage: '/assets/masterImageFile/logo_thumbnail.png'
    },
    '/coming-soon': {
      sectionId: 'upcoming',
      title: 'Coming Soon — New Games | KensGames',
      description: 'Four new titles in development for Q3-Q4 2026. Schwartz Diamond Connect Four, and more. All built on the manifold substrate.',
      ogImage: '/assets/masterImageFile/logo_thumbnail.png'
    },
    '/terms': {
      sectionId: null,           // external page — redirect
      redirect: '/tos/',
      title: 'Terms of Service | KensGames',
      description: 'Terms of Service for KensGames.com.',
      ogImage: '/assets/masterImageFile/logo_thumbnail.png'
    }
  };

  // Reverse map: sectionId → canonical pathname (for scroll-based URL updates)
  const SECTION_TO_ROUTE = {};
  for (const [path, route] of Object.entries(ROUTES)) {
    if (route.sectionId) SECTION_TO_ROUTE[route.sectionId] = path;
  }

  // ─── Meta helpers ───────────────────────────────────────────────────────────
  function setMeta(name, content) {
    let el = document.querySelector(`meta[name="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function setOG(property, content) {
    let el = document.querySelector(`meta[property="${property}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('property', property);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function setCanonical(pathname) {
    let el = document.querySelector('link[rel="canonical"]');
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', 'canonical');
      document.head.appendChild(el);
    }
    el.setAttribute('href', 'https://kensgames.com' + pathname);
  }

  function applyRoute(pathname, pushToHistory) {
    const route = ROUTES[pathname] || null;

    if (!route) {
      // Unknown route — show toast, replaceState to home
      showToast('Route not found. Returning to base.');
      window.history.replaceState(null, '', '/');
      applyRoute('/', false);
      return;
    }

    // Handle redirects (e.g. /terms → /tos/)
    if (route.redirect) {
      window.location.href = route.redirect;
      return;
    }

    // Update document metadata
    document.title = route.title;
    setMeta('description', route.description);
    setOG('og:title', route.title);
    setOG('og:description', route.description);
    setOG('og:url', 'https://kensgames.com' + pathname);
    setOG('og:image', 'https://kensgames.com' + route.ogImage);
    setOG('og:type', 'website');
    setOG('og:site_name', 'KensGames');
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', route.title);
    setMeta('twitter:description', route.description);
    setMeta('twitter:image', 'https://kensgames.com' + route.ogImage);
    setCanonical(pathname);

    if (pushToHistory) {
      window.history.pushState({ pathname }, route.title, pathname);
    }

    // Scroll to section
    if (route.sectionId) {
      const el = document.getElementById(route.sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  // ─── Toast notification ────────────────────────────────────────────────────
  function showToast(message) {
    let toast = document.getElementById('kg-route-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'kg-route-toast';
      toast.style.cssText = [
        'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
        'background:rgba(4,4,20,0.96)', 'border:1px solid #00FFFF',
        'color:#00FFFF', 'font-family:Orbitron,monospace', 'font-size:12px',
        'letter-spacing:.08em', 'padding:10px 20px', 'z-index:9999',
        'opacity:0', 'transition:opacity .3s', 'pointer-events:none',
        'white-space:nowrap'
      ].join(';');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 3000);
  }

  // ─── IntersectionObserver — scroll → URL ──────────────────────────────────
  function attachScrollObserver() {
    const sectionIds = Object.keys(SECTION_TO_ROUTE);
    const sections = sectionIds
      .map(id => document.getElementById(id))
      .filter(Boolean);

    if (!sections.length || !('IntersectionObserver' in window)) return;

    let activeRoute = window.location.pathname;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
          const sectionId = entry.target.id;
          const canonical = SECTION_TO_ROUTE[sectionId];
          if (canonical && canonical !== activeRoute) {
            activeRoute = canonical;
            const route = ROUTES[canonical];
            document.title = route.title;
            setMeta('description', route.description);
            setOG('og:title', route.title);
            setOG('og:description', route.description);
            setOG('og:url', 'https://kensgames.com' + canonical);
            setCanonical(canonical);
            window.history.replaceState({ pathname: canonical }, route.title, canonical);
          }
        }
      }
    }, { threshold: [0.35] });

    for (const section of sections) {
      observer.observe(section);
    }
  }

  // ─── Init ──────────────────────────────────────────────────────────────────
  function init() {
    const pathname = window.location.pathname;

    // Handle cold navigation to a route
    if (pathname !== '/' && ROUTES[pathname]) {
      // Small delay so page renders before scrolling
      setTimeout(() => applyRoute(pathname, false), 120);
    } else if (pathname !== '/' && !ROUTES[pathname]) {
      applyRoute(pathname, false); // triggers toast + replaceState to /
    } else {
      // Set baseline meta for home
      applyRoute('/', false);
    }

    // Back / forward
    window.addEventListener('popstate', (e) => {
      const p = (e.state && e.state.pathname) || window.location.pathname;
      applyRoute(p, false);
    });

    attachScrollObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
