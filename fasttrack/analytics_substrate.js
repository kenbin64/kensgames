/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 *
 * PARADIGM: Objects are dimensions containing points. Each point
 * is an object in a lower dimension containing its own points.
 * All properties, attributes, and behaviors exist as infinite
 * potentials — invoke only when needed. No pre-calculation,
 * no storage. Geometry IS information.
 *
 * ============================================================
 * FASTTRACK ANALYTICS SUBSTRATE
 * ButterflyFX Manifold Pattern - Dimensional User Journey
 * ============================================================
 *
 * Tracks the player's helix journey through 7 dimensional levels:
 *
 *   Level 0  POTENTIAL   — Page load, unknown visitor
 *   Level 1  POINT       — First interaction (CTA click, theme pick)
 *   Level 2  LINE        — Configuration (AI setup, player name)
 *   Level 3  WIDTH       — Game started, cards dealt
 *   Level 4  PLANE       — Active play (captures, fast tracks, turns)
 *   Level 5  VOLUME      — Game complete, winner declared
 *   Level 6  WHOLE       — Share / return → becomes Level 0 of next spiral
 *
 * Each level transition fires a GA4 event with dimensional context.
 * The substrate auto-initializes GA4 and exposes window.FTAnalytics.
 *
 * USAGE:
 *   <script src="analytics_substrate.js"></script>
 *   — That's it. GA4 loads, FTAnalytics is ready.
 *
 * CONFIGURATION:
 *   Set window.BFX_GA_ID before loading to override measurement ID.
 */

'use strict';

const AnalyticsSubstrate = (() => {

    // ── Configuration ─────────────────────────────────────────
    const GA_MEASUREMENT_ID = window.BFX_GA_ID || 'G-0V65GVQ0P6';
    const VERSION = '2.0.0';
    const NAME = 'FastTrack Analytics Substrate';

    // ── Dimensional Level Constants (Fibonacci-mapped) ────────
    const DIM = Object.freeze({
        POTENTIAL: 0,   // Fib 0 — pure possibility
        POINT:     1,   // Fib 1 — first interaction
        LINE:      2,   // Fib 1 — configuration / extension
        WIDTH:     3,   // Fib 2 — game start / multiplication
        PLANE:     4,   // Fib 3 — active play / completeness
        VOLUME:    5,   // Fib 5 — game complete / depth
        WHOLE:     6    // Fib 8 — share / return → next spiral
    });

    const LEVEL_NAMES = ['potential', 'point', 'line', 'width', 'plane', 'volume', 'whole'];

    // ── State ─────────────────────────────────────────────────
    let _currentLevel = DIM.POTENTIAL;
    let _spiral = 0;              // How many complete play-throughs
    let _gameStartTime = null;
    let _turnCount = 0;
    let _sessionId = null;
    let _initialized = false;

    // ── GA4 Bootstrap ─────────────────────────────────────────
    function _bootstrapGA4() {
        // Inject gtag.js if not already present
        if (!document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"]`)) {
            const s = document.createElement('script');
            s.async = true;
            s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
            document.head.appendChild(s);
        }

        window.dataLayer = window.dataLayer || [];
        if (!window.gtag) {
            window.gtag = function() { window.dataLayer.push(arguments); };
        }
        gtag('js', new Date());
        gtag('config', GA_MEASUREMENT_ID, {
            page_title: document.title,
            custom_map: {
                dimension1: 'bfx_level',
                dimension2: 'bfx_spiral'
            }
        });
    }

    // ── Dimensional Transition Engine ─────────────────────────
    function _transitionTo(level, eventName, params) {
        const prevLevel = _currentLevel;
        _currentLevel = Math.max(_currentLevel, level); // levels only ascend within a spiral

        if (_currentLevel > prevLevel) {
            gtag('event', 'bfx_dimension_transition', {
                event_category: 'dimensional_journey',
                from_level: LEVEL_NAMES[prevLevel],
                to_level: LEVEL_NAMES[_currentLevel],
                spiral: _spiral,
                session_id: _sessionId
            });
        }

        // Fire the specific event too
        if (eventName) {
            const fullParams = Object.assign({
                event_category: params?.event_category || 'game',
                bfx_level: LEVEL_NAMES[_currentLevel],
                bfx_spiral: _spiral
            }, params || {});
            gtag('event', eventName, fullParams);
        }
    }

    // ── Generate Session ID ───────────────────────────────────
    function _generateSessionId() {
        return 'bfx_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
    }

    // ── Public API (replaces old FTAnalytics) ─────────────────
    const api = {

        /** Substrate identity */
        version: VERSION,
        name: NAME,
        DIM: DIM,

        /** Initialize — called automatically on load */
        init: function() {
            if (_initialized) return;
            _sessionId = _generateSessionId();
            _bootstrapGA4();
            _initialized = true;

            // Level 0: Potential — visitor has arrived
            _transitionTo(DIM.POTENTIAL, 'page_ready', {
                event_category: 'dimensional_journey',
                page: window.location.pathname
            });

            console.log(`🦋 ${NAME} v${VERSION} | GA4: ${GA_MEASUREMENT_ID} | Session: ${_sessionId}`);
        },

        /** Get current dimensional state */
        getState: function() {
            return {
                level: _currentLevel,
                levelName: LEVEL_NAMES[_currentLevel],
                spiral: _spiral,
                sessionId: _sessionId,
                turnCount: _turnCount,
                gameDuration: _gameStartTime ? Math.round((Date.now() - _gameStartTime) / 1000) : 0
            };
        },

        // ── Level 1: POINT — First meaningful interaction ─────
        ctaClick: function(source) {
            _transitionTo(DIM.POINT, 'cta_click', {
                event_category: 'acquisition',
                cta_source: source || 'unknown'
            });
        },

        themeChange: function(themeName) {
            _transitionTo(DIM.POINT, 'theme_change', {
                event_category: 'engagement',
                theme_name: themeName
            });
        },

        demoView: function() {
            _transitionTo(DIM.POINT, 'demo_view', {
                event_category: 'acquisition'
            });
        },

        // ── Level 2: LINE — Configuration / Setup ─────────────
        setupComplete: function(playerName, botCount, difficulty) {
            _transitionTo(DIM.LINE, 'setup_complete', {
                event_category: 'configuration',
                player_name: playerName || 'Player',
                bot_count: botCount || 3,
                difficulty: difficulty || 'normal'
            });
        },

        // ── Level 3: WIDTH — Game Starts ──────────────────────
        gameStart: function(mode, playerCount, difficulty) {
            _gameStartTime = Date.now();
            _turnCount = 0;
            _transitionTo(DIM.WIDTH, 'game_start', {
                event_category: 'game',
                game_mode: mode || 'solo',
                player_count: playerCount || 4,
                difficulty: difficulty || 'normal'
            });
        },

        // ── Level 4: PLANE — Active Gameplay Events ───────────
        pegCapture: function(attackerName, victimName) {
            _transitionTo(DIM.PLANE, 'peg_capture', {
                event_category: 'gameplay',
                attacker: attackerName,
                victim: victimName
            });
        },

        fastTrackUsed: function(playerName) {
            _transitionTo(DIM.PLANE, 'fast_track_used', {
                event_category: 'gameplay',
                player_name: playerName
            });
        },

        bullseyeEntered: function(playerName) {
            _transitionTo(DIM.PLANE, 'bullseye_entered', {
                event_category: 'gameplay',
                player_name: playerName
            });
        },

        turn: function() {
            _turnCount++;
            // Batch: only fire every 10 turns to avoid noise
            if (_turnCount % 10 === 0) {
                _transitionTo(DIM.PLANE, 'turns_milestone', {
                    event_category: 'engagement',
                    turn_count: _turnCount
                });
            }
        },

        // ── Level 5: VOLUME — Game Complete ───────────────────
        gameEnd: function(winnerName, winnerIsAI, turnCount) {
            const durationSec = _gameStartTime
                ? Math.round((Date.now() - _gameStartTime) / 1000) : 0;
            _transitionTo(DIM.VOLUME, 'game_complete', {
                event_category: 'game',
                winner_name: winnerName || 'Unknown',
                winner_is_ai: winnerIsAI ? 'yes' : 'no',
                turn_count: turnCount || _turnCount,
                duration_seconds: durationSec
            });
            // GA4 engagement time
            gtag('event', 'timing_complete', {
                name: 'game_duration',
                value: durationSec,
                bfx_level: 'volume',
                bfx_spiral: _spiral
            });
        },

        // ── Level 6: WHOLE — Share / Return ───────────────────
        share: function(platform) {
            _transitionTo(DIM.WHOLE, 'game_shared', {
                event_category: 'viral',
                share_platform: platform || 'unknown'
            });
            // WHOLE → POTENTIAL of next spiral
            _spiral++;
            _currentLevel = DIM.POTENTIAL;
            _gameStartTime = null;
            _turnCount = 0;
        },

        returnVisit: function() {
            if (_currentLevel >= DIM.VOLUME) {
                _transitionTo(DIM.WHOLE, 'return_visit', {
                    event_category: 'retention'
                });
                _spiral++;
                _currentLevel = DIM.POTENTIAL;
            }
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

// ── Global Exports ────────────────────────────────────────────
// Backward compatible: window.FTAnalytics still works everywhere
window.FTAnalytics = AnalyticsSubstrate;
window.AnalyticsSubstrate = AnalyticsSubstrate;
