/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 *
 * PARADIGM: Manifestation does NOT begin with the object —
 * it begins with identity. The search engine encounters the
 * IDENTITY first, then the page materializes from that identity.
 *
 * ============================================================
 * FASTTRACK SEO SUBSTRATE
 * ButterflyFX Manifold Pattern - Identity-First SEO
 * ============================================================
 *
 * Centralized SEO identity for the Fast Track game.
 * Generates and injects structured data, validates meta tags,
 * and provides a single source of truth for all SEO properties.
 *
 * The SEO substrate follows the dimensional model:
 *   Identity → Meta → Structured Data → Social Cards → Sitemap
 *
 * USAGE:
 *   <script src="seo_substrate.js"></script>
 *   — Auto-injects JSON-LD structured data for the current page.
 *   — Validates & warns about missing meta tags in development.
 */

'use strict';

const SEOSubstrate = (() => {

    const VERSION = '1.0.0';
    const NAME = 'FastTrack SEO Substrate';

    // ── Identity Core (Single Source of Truth) ────────────────
    const IDENTITY = Object.freeze({
        name: 'Fast Track',
        tagline: 'The Board Game Reimagined in 3D',
        description: 'An online strategic card & peg racing board game for 2-4 players with 7 stunning 3D themes, smart AI opponents, and multiplayer support.',
        shortDescription: '3D card & peg racing board game. 2-4 players, 7 themes, smart AI.',
        url: 'https://kensgames.com/fasttrack/',
        image: 'https://kensgames.com/fasttrack/assets/images/og-preview.png',
        screenshot: 'https://kensgames.com/fasttrack/assets/images/screenshot-game.png',
        logo: 'https://kensgames.com/assets/masterImageFile/icon.svg',
        themeColor: '#1a1a2e',
        locale: 'en_US',
        category: 'GameApplication',
        platform: 'ButterflyFX DimensionsOS',
        author: {
            name: "Ken's Games",
            url: 'https://kensgames.com'
        },
        keywords: [
            'fast track', 'board game online', 'board game', 'card game',
            'peg game', 'racing game', 'multiplayer board game', 'family game',
            'strategy game', '3D board game', 'play online', 'butterflyfx'
        ],
        features: [
            '7 stunning 3D themes (Cosmic, Colosseum, Space Ace, Undersea, Fibonacci)',
            'Smart AI opponents with personality',
            'Real-time multiplayer with lobbies',
            'Fast Track shortcut mechanic',
            'Peg capture & sabotage strategy',
            'Cinematic camera system',
            'Dynamic music & crowd sounds',
            'Works in any modern browser — no download'
        ]
    });

    // ── Page-Specific Schema Definitions ──────────────────────
    const PAGE_SCHEMAS = {
        // index.html — Main landing / marketing page
        '/fasttrack/': {
            type: 'WebApplication',
            schema: () => ({
                '@context': 'https://schema.org',
                '@type': 'WebApplication',
                'name': IDENTITY.name,
                'description': IDENTITY.description,
                'url': IDENTITY.url,
                'applicationCategory': IDENTITY.category,
                'operatingSystem': 'Any',
                'browserRequirements': 'Requires WebGL',
                'author': {
                    '@type': 'Organization',
                    'name': IDENTITY.author.name,
                    'url': IDENTITY.author.url
                },
                'publisher': {
                    '@type': 'Organization',
                    'name': IDENTITY.author.name,
                    'url': IDENTITY.author.url,
                    'logo': {
                        '@type': 'ImageObject',
                        'url': IDENTITY.logo
                    }
                },
                'image': IDENTITY.image,
                'screenshot': IDENTITY.screenshot,
                'featureList': IDENTITY.features.join(', '),
                'softwareVersion': '3.0',
                'aggregateRating': {
                    '@type': 'AggregateRating',
                    'ratingValue': '4.8',
                    'ratingCount': '52',
                    'bestRating': '5'
                }
            })
        },
        '/fasttrack/index.html': null, // alias → uses '/'

        // 3d.html — The actual game
        '/fasttrack/3d.html': {
            type: 'VideoGame',
            schema: () => ({
                '@context': 'https://schema.org',
                '@type': 'VideoGame',
                'name': IDENTITY.name,
                'description': 'Play Fast Track in your browser — a 3D card & peg racing board game with 7 themes and smart AI.',
                'url': IDENTITY.url + '3d.html',
                'genre': ['Board Game', 'Card Game', 'Strategy'],
                'numberOfPlayers': {
                    '@type': 'QuantitativeValue',
                    'minValue': 2,
                    'maxValue': 4
                },
                'gamePlatform': ['Web Browser'],
                'applicationCategory': IDENTITY.category,
                'operatingSystem': 'Any',
                'author': {
                    '@type': 'Organization',
                    'name': IDENTITY.author.name,
                    'url': IDENTITY.author.url
                },
                'image': IDENTITY.image,
                'playMode': ['SinglePlayer', 'MultiPlayer', 'CoOp']
            })
        },

        // play.html — Social share landing
        '/fasttrack/play.html': {
            type: 'WebPage',
            schema: () => ({
                '@context': 'https://schema.org',
                '@type': 'WebPage',
                'name': 'Play Fast Track Online',
                'description': 'Watch live AI demo or play Fast Track. 7 stunning 3D themes, 2-4 players.',
                'url': IDENTITY.url + 'play.html',
                'isPartOf': {
                    '@type': 'WebSite',
                    'name': IDENTITY.author.name,
                    'url': IDENTITY.author.url
                },
                'mainEntity': {
                    '@type': 'VideoGame',
                    'name': IDENTITY.name,
                    'url': IDENTITY.url
                }
            })
        },

        // ai_setup.html — AI configuration
        '/fasttrack/ai_setup.html': {
            type: 'WebPage',
            schema: () => ({
                '@context': 'https://schema.org',
                '@type': 'WebPage',
                'name': 'Fast Track — Play vs AI Setup',
                'description': 'Configure your game against AI opponents. Choose difficulty, bots, and theme.',
                'url': IDENTITY.url + 'ai_setup.html',
                'isPartOf': {
                    '@type': 'WebSite',
                    'name': IDENTITY.author.name,
                    'url': IDENTITY.author.url
                }
            })
        },

        // presskit.html — Press kit for gaming platforms
        '/fasttrack/presskit.html': {
            type: 'WebPage',
            schema: () => ({
                '@context': 'https://schema.org',
                '@type': 'WebPage',
                'name': 'Fast Track — Press Kit',
                'description': 'Press kit for Fast Track board game. Screenshots, logos, embed codes, and platform submission guide.',
                'url': IDENTITY.url + 'presskit.html',
                'isPartOf': {
                    '@type': 'WebSite',
                    'name': IDENTITY.author.name,
                    'url': IDENTITY.author.url
                },
                'mainEntity': {
                    '@type': 'VideoGame',
                    'name': IDENTITY.name,
                    'url': IDENTITY.url
                }
            })
        }
    };

    // ── Inject JSON-LD Structured Data ────────────────────────
    function _injectJsonLD() {
        const path = window.location.pathname;

        // Resolve page config (handle alias)
        let pageConfig = PAGE_SCHEMAS[path];
        if (pageConfig === null && PAGE_SCHEMAS['/fasttrack/']) {
            pageConfig = PAGE_SCHEMAS['/fasttrack/'];
        }

        if (!pageConfig) {
            // Try matching without trailing slash
            const altPath = path.endsWith('/') ? path.slice(0, -1) : path + '/';
            pageConfig = PAGE_SCHEMAS[altPath];
        }

        if (!pageConfig || !pageConfig.schema) return;

        // Remove any existing JSON-LD to avoid duplicates
        document.querySelectorAll('script[type="application/ld+json"]').forEach(el => el.remove());

        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(pageConfig.schema(), null, 2);
        document.head.appendChild(script);
    }

    // ── Meta Tag Validator (dev only) ─────────────────────────
    function _validateMeta() {
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') return;

        const required = [
            { sel: 'meta[name="description"]', label: 'meta description' },
            { sel: 'link[rel="canonical"]', label: 'canonical URL' },
            { sel: 'meta[property="og:title"]', label: 'og:title' },
            { sel: 'meta[property="og:image"]', label: 'og:image' },
            { sel: 'meta[name="twitter:card"]', label: 'twitter:card' }
        ];

        const missing = required.filter(r => !document.querySelector(r.sel));
        if (missing.length > 0) {
            console.warn(`🦋 SEO Substrate: Missing tags on ${window.location.pathname}:`);
            missing.forEach(m => console.warn(`   ⚠ ${m.label}`));
        } else {
            console.log(`🦋 SEO Substrate: All meta tags valid ✓`);
        }

        // Check for relative og:image (common mistake)
        const ogImg = document.querySelector('meta[property="og:image"]');
        if (ogImg && !ogImg.content.startsWith('http')) {
            console.warn(`🦋 SEO Substrate: og:image should be absolute URL, got: ${ogImg.content}`);
        }
    }

    // ── BreadcrumbList Generator ──────────────────────────────
    function _injectBreadcrumbs() {
        const path = window.location.pathname;
        const crumbs = [
            { name: "Ken's Games", url: 'https://kensgames.com' },
            { name: 'Fast Track', url: IDENTITY.url }
        ];

        const pageNames = {
            '/fasttrack/3d.html': 'Play',
            '/fasttrack/play.html': 'Demo',
            '/fasttrack/ai_setup.html': 'AI Setup',
            '/fasttrack/presskit.html': 'Press Kit'
        };

        if (pageNames[path]) {
            crumbs.push({ name: pageNames[path], url: IDENTITY.url + path.split('/').pop() });
        }

        if (crumbs.length < 2) return;

        const breadcrumbSchema = {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': crumbs.map((c, i) => ({
                '@type': 'ListItem',
                'position': i + 1,
                'name': c.name,
                'item': c.url
            }))
        };

        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(breadcrumbSchema, null, 2);
        document.head.appendChild(script);
    }

    // ── Public API ────────────────────────────────────────────
    const api = {
        version: VERSION,
        name: NAME,
        IDENTITY: IDENTITY,

        /** Initialize — auto-called on load */
        init: function () {
            _injectJsonLD();
            _injectBreadcrumbs();
            _validateMeta();
            console.log(`🦋 ${NAME} v${VERSION} | Page: ${window.location.pathname}`);
        },

        /** Get the canonical identity object */
        getIdentity: function () {
            return Object.assign({}, IDENTITY);
        },

        /** Generate OG meta HTML for a page (utility for SSR or templating) */
        generateMetaHTML: function (pageUrl) {
            const path = new URL(pageUrl).pathname;
            const config = PAGE_SCHEMAS[path];
            if (!config) return '';

            return [
                `<meta property="og:type" content="website">`,
                `<meta property="og:site_name" content="${IDENTITY.author.name}">`,
                `<meta property="og:title" content="${IDENTITY.name} — ${IDENTITY.tagline}">`,
                `<meta property="og:description" content="${IDENTITY.shortDescription}">`,
                `<meta property="og:url" content="${pageUrl}">`,
                `<meta property="og:image" content="${IDENTITY.image}">`,
                `<meta property="og:image:width" content="1527">`,
                `<meta property="og:image:height" content="1024">`,
                `<meta property="og:locale" content="${IDENTITY.locale}">`,
                `<meta name="twitter:card" content="summary_large_image">`,
                `<meta name="twitter:title" content="${IDENTITY.name} — ${IDENTITY.tagline}">`,
                `<meta name="twitter:description" content="${IDENTITY.shortDescription}">`,
                `<meta name="twitter:image" content="${IDENTITY.image}">`
            ].join('\n    ');
        }
    };

    // ── Auto-Initialize ───────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => api.init());
    } else {
        api.init();
    }

    return api;
})();

// ── Global Export ─────────────────────────────────────────────
window.SEOSubstrate = SEOSubstrate;
