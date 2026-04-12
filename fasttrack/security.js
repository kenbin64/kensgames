/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 *
 * SECURITY SUBSTRATE
 * Every security concern lives on a geometric trust surface:
 *   z = x·y          (Layer 3 — Relation / trust gate)
 *   z = x·y²         (Layer 4 — Form / threat amplifier)
 *
 * Entities (inputs, messages, actions, sessions) are points on
 * these manifolds. Trust is computed as surface height (z).
 * Threats create gradients that flow toward z=0 (rejection).
 *
 * Fibonacci weight spine:  1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89
 * φ (golden ratio) ≈ 1.618033988749895
 *
 * PARADIGM: No duplication. Every security rule exists exactly once.
 * All security logic flows through this substrate.
 * Delta-only: only re-evaluate when state changes.
 *
 * Reusable in: FastTrack, Chess, Blog, any ButterflyFX app
 * ============================================================
 */

'use strict';

const SecuritySubstrate = (() => {

    // ── Manifold Constants ───────────────────────────────────
    const PHI   = 1.618033988749895;
    const FIB   = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

    // ── Surface Evaluation ───────────────────────────────────
    function zxy(x, y)  { return x * y; }
    function zxy2(x, y) { return x * y * y; }
    function evalSurface(type, x, y) {
        return type === 'z=xy2' ? zxy2(x, y) : zxy(x, y);
    }
    function gradient(type, x, y) {
        if (type === 'z=xy2') return { dx: y * y, dy: 2 * x * y };
        return { dx: y, dy: x };
    }

    // ═══════════════════════════════════════════════════════════
    //  TRUST MANIFOLD — every security domain is a sealed point
    // ═══════════════════════════════════════════════════════════

    /**
     * Trust domains with pre-sealed manifold coordinates.
     * z-height = trust level. Higher z = more trusted.
     * Threats reduce x or y → z drops → action blocked.
     */
    const TRUST_DOMAINS = {
        input: {
            label: 'Input Sanitization',
            surface: 'z=xy2', x: 1, y: PHI,       // z = φ² — gate amplifier
            maxLength: 500,
            patterns: /(<script|<\/script|<iframe|<object|<embed|<form|javascript:|on\w+\s*=)/gi,
            controls: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
            ruleText: 'All string inputs flow through this surface. z=0 → reject.'
        },
        message: {
            label: 'WebSocket Message Gate',
            surface: 'z=xy', x: PHI, y: 1,         // z = φ — golden gate
            maxSize: 65536,                          // 64KB max
            ruleText: 'Every WS message must pass type whitelist + size check.'
        },
        rate: {
            label: 'Rate Limiter Surface',
            surface: 'z=xy', x: 1, y: 1,           // z = 1 — baseline
            ruleText: 'Action frequency mapped to surface. Exceeding threshold → z=0.'
        },
        integrity: {
            label: 'Game State Integrity',
            surface: 'z=xy2', x: PHI, y: PHI,      // z = φ³ — maximum protection
            ruleText: 'Frozen objects. Tamper detection via surface hash comparison.'
        },
        storage: {
            label: 'Secure Storage',
            surface: 'z=xy', x: PHI, y: PHI,       // z = φ² — protected
            ruleText: 'Integrity-checked localStorage. Hash mismatch → purge.'
        },
        auth: {
            label: 'Authentication Surface',
            surface: 'z=xy2', x: PHI * PHI, y: PHI, // z = φ⁵ — highest trust required
            ruleText: 'PBKDF2-SHA256 100k iterations. Brute-force lockout.'
        }
    };

    // ═══════════════════════════════════════════════════════════
    //  INPUT SANITIZATION LAYER (z=xy² — quadratic amplifier)
    // ═══════════════════════════════════════════════════════════

    const _inputDomain = TRUST_DOMAINS.input;

    function sanitizeString(input, maxLength) {
        if (typeof input !== 'string') return '';
        const limit = maxLength || _inputDomain.maxLength;
        let clean = input.trim().slice(0, limit);
        clean = clean.replace(_inputDomain.controls, '');
        clean = clean.replace(/&/g, '&amp;')
                     .replace(/</g, '&lt;')
                     .replace(/>/g, '&gt;')
                     .replace(/"/g, '&quot;')
                     .replace(/'/g, '&#x27;');
        return clean;
    }

    function sanitizeHTML(input) {
        if (typeof input !== 'string') return '';
        return input.replace(_inputDomain.patterns, '');
    }

    function isCleanInput(input) {
        if (typeof input !== 'string') return true;
        // Reset regex lastIndex for global patterns
        _inputDomain.patterns.lastIndex = 0;
        return !_inputDomain.patterns.test(input);
    }

    function sanitizeChatMessage(msg) {
        return sanitizeString(msg, 500);
    }

    function sanitizeUsername(name) {
        if (typeof name !== 'string') return '';
        let clean = name.trim().slice(0, 24);
        clean = clean.replace(/[^a-zA-Z0-9_\- ]/g, '');
        return clean || 'Player';
    }

    /**
     * Compute trust score for an input string.
     * Clean input → z = φ² (high trust).
     * Dirty input → z approaches 0 (rejected).
     */
    function inputTrustScore(input) {
        if (typeof input !== 'string') return 0;
        let x = _inputDomain.x;
        let y = _inputDomain.y;
        // Degrade y for each threat indicator found
        _inputDomain.patterns.lastIndex = 0;
        const threats = (input.match(_inputDomain.patterns) || []).length;
        const controlCount = (input.match(_inputDomain.controls) || []).length;
        // Each threat drops y by φ⁻¹, each control by FIB[2]/FIB[5]
        y -= threats * (1 / PHI);
        y -= controlCount * (FIB[2] / FIB[5]);
        if (y < 0) y = 0;
        return evalSurface(_inputDomain.surface, x, y);
    }

    // ═══════════════════════════════════════════════════════════
    //  WEBSOCKET MESSAGE GATE (z=xy — relation / AND-gate)
    // ═══════════════════════════════════════════════════════════

    const ALLOWED_MESSAGE_TYPES = Object.freeze(new Set([
        'register', 'login', 'logout', 'guest_login',
        'update_username', 'update_avatar', 'update_profile', 'get_profile', 'search_users',
        'create_session', 'join_session', 'join_by_code', 'leave_session', 'list_sessions',
        'start_game', 'game_action', 'game_state_sync', 'chat',
        'kick_player', 'update_settings', 'add_ai', 'add_ai_player',
        'request_join', 'approve_player', 'reject_player',
        'late_join_request', 'approve_late_join', 'reject_late_join', 'cancel_join_request',
        'matchmaking_join', 'matchmaking_leave', 'matchmaking_status',
        'create_guild', 'join_guild', 'leave_guild', 'search_guilds', 'get_guild',
        'toggle_ready', 'update_player_info', 'update_session_settings',
        'prestige_action', 'ping', 'pong'
    ]));

    function validateOutgoingMessage(data) {
        if (!data || typeof data !== 'object') return false;
        if (!data.type || typeof data.type !== 'string') return false;
        if (!ALLOWED_MESSAGE_TYPES.has(data.type)) {
            console.warn('[SecuritySubstrate] Blocked unknown WS type:', data.type);
            return false;
        }
        const json = JSON.stringify(data);
        if (json.length > TRUST_DOMAINS.message.maxSize) {
            console.warn('[SecuritySubstrate] Blocked oversized WS message:', json.length);
            return false;
        }
        return true;
    }

    function sanitizeOutgoingMessage(data) {
        if (!data || typeof data !== 'object') return data;
        const clean = {};
        for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'string' && key !== 'password') {
                clean[key] = sanitizeString(value, 500);
            } else {
                clean[key] = value;
            }
        }
        return clean;
    }

    // ═══════════════════════════════════════════════════════════
    //  RATE LIMITER SURFACE (z=xy — baseline flow control)
    //  Delta-only: only prune when window boundary crossed
    // ═══════════════════════════════════════════════════════════

    const _actionTimestamps = {};

    // Rate limits as Fibonacci-weighted thresholds
    const ACTION_LIMITS = Object.freeze({
        chat:        { max: FIB[5],  window: 10000 },  // 5 per 10s
        game_action: { max: FIB[7],  window: 10000 },  // 13 per 10s  (was 20, tightened)
        login:       { max: FIB[3],  window: 60000 },  // 3 per minute
        register:    { max: FIB[2],  window: 60000 },  // 2 per minute
        default:     { max: FIB[8],  window: 10000 }   // 21 per 10s
    });

    function isActionAllowed(actionType) {
        const limit = ACTION_LIMITS[actionType] || ACTION_LIMITS.default;
        const now = Date.now();
        if (!_actionTimestamps[actionType]) _actionTimestamps[actionType] = [];
        // Delta-only prune: remove entries outside window
        _actionTimestamps[actionType] = _actionTimestamps[actionType].filter(t => t > now - limit.window);
        if (_actionTimestamps[actionType].length >= limit.max) {
            console.warn(`[SecuritySubstrate] Rate limit: ${actionType} (${limit.max}/${limit.window}ms)`);
            return false;
        }
        _actionTimestamps[actionType].push(now);
        return true;
    }

    // ═══════════════════════════════════════════════════════════
    //  GAME STATE INTEGRITY (z=xy² — φ³ protection surface)
    //  Freeze + hash fingerprint for tamper detection
    // ═══════════════════════════════════════════════════════════

    const _sealedHashes = new Map(); // name → hash of stringified object

    function deepFreeze(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        Object.keys(obj).forEach(key => {
            const val = obj[key];
            if (val && typeof val === 'object' && !Object.isFrozen(val)) {
                deepFreeze(val);
            }
        });
        return Object.freeze(obj);
    }

    function _fingerprint(obj) {
        const str = JSON.stringify(obj, (_, v) => typeof v === 'function' ? v.toString() : v);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    function sealObject(name, obj) {
        if (!obj || typeof obj !== 'object') return;
        try {
            deepFreeze(obj);
            _sealedHashes.set(name, _fingerprint(obj));
            console.log(`[SecuritySubstrate] Sealed: ${name} (z=${evalSurface('z=xy2', PHI, PHI).toFixed(2)})`);
        } catch (e) {
            console.warn(`[SecuritySubstrate] Could not seal ${name}:`, e.message);
        }
    }

    function freezeGameRules(rulesObj) {
        sealObject('AI_MOVE_RULES', rulesObj);
    }

    function freezeCardDefinitions(cardTypes) {
        sealObject('CARD_TYPES', cardTypes);
    }

    function verifyIntegrity(name, obj) {
        const expected = _sealedHashes.get(name);
        if (!expected) return true; // Not sealed
        const current = _fingerprint(obj);
        if (current !== expected) {
            console.error(`[SecuritySubstrate] TAMPER DETECTED: ${name} hash mismatch!`);
            return false;
        }
        return true;
    }

    // ═══════════════════════════════════════════════════════════
    //  INTEGRITY MONITOR — periodic manifold surface scan
    //  Runs on z=xy² gradient: deviation from sealed hash = threat
    // ═══════════════════════════════════════════════════════════

    let _monitorInterval = null;
    const _criticalFunctions = new Map();

    function registerCriticalFunction(name, fn) {
        if (typeof fn === 'function') {
            _criticalFunctions.set(name, fn.toString().length);
        }
    }

    function startIntegrityMonitor() {
        if (_monitorInterval) return;
        _monitorInterval = setInterval(() => {
            // Check registered functions for tampering
            for (const [name, expectedLen] of _criticalFunctions) {
                try {
                    const fn = window[name];
                    if (typeof fn === 'function' && Math.abs(fn.toString().length - expectedLen) > 50) {
                        console.error(`[SecuritySubstrate] TAMPER: ${name} modified (Δ=${Math.abs(fn.toString().length - expectedLen)})`);
                    }
                } catch (e) { /* no-op */ }
            }
        }, 30000); // Every 30s — lazy evaluation (only when interval fires)
    }

    function stopIntegrityMonitor() {
        if (_monitorInterval) {
            clearInterval(_monitorInterval);
            _monitorInterval = null;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  DOM INJECTION PREVENTION
    // ═══════════════════════════════════════════════════════════

    function safeInnerHTML(element, html) {
        if (!element) return;
        element.innerHTML = sanitizeHTML(html);
    }

    function safeTextContent(element, text) {
        if (!element) return;
        element.textContent = text;
    }

    // ═══════════════════════════════════════════════════════════
    //  SECURE STORAGE (z=xy — φ² integrity-checked)
    // ═══════════════════════════════════════════════════════════

    function secureStorageSet(key, value) {
        try {
            const data = JSON.stringify(value);
            const hash = _fingerprint({ d: data });
            localStorage.setItem(key, `${hash}:${data}`);
        } catch (e) {
            console.warn('[SecuritySubstrate] Storage write failed:', e.message);
        }
    }

    function secureStorageGet(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const idx = raw.indexOf(':');
            if (idx === -1) return JSON.parse(raw); // Legacy
            const storedHash = raw.slice(0, idx);
            const data = raw.slice(idx + 1);
            if (_fingerprint({ d: data }) !== storedHash) {
                console.error(`[SecuritySubstrate] Storage tamper: ${key}`);
                localStorage.removeItem(key);
                return null;
            }
            return JSON.parse(data);
        } catch (e) {
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  THREAT ASSESSMENT — manifold gradient descent
    //  Computes overall threat level from input signals
    // ═══════════════════════════════════════════════════════════

    /**
     * Assess threat for a security event.
     * Returns { trustScore, threatLevel, action }
     * trustScore > φ → safe, < 1 → warn, < 0 → block
     */
    function assessThreat(domain, signals) {
        const d = TRUST_DOMAINS[domain];
        if (!d) return { trustScore: 0, threatLevel: 'unknown', action: 'block' };
        
        let x = d.x;
        let y = d.y;
        
        // Each signal degrades coordinates toward origin
        if (signals.failedAttempts) y -= signals.failedAttempts * (1 / PHI);
        if (signals.rateLimitHits)  x -= signals.rateLimitHits * (FIB[2] / FIB[4]);
        if (signals.xssDetected)    y = 0; // Instant z=0
        if (signals.tamperDetected) { x = 0; y = 0; }
        
        x = Math.max(0, x);
        y = Math.max(0, y);
        
        const z = evalSurface(d.surface, x, y);
        
        let level, action;
        if (z >= PHI)      { level = 'safe';     action = 'allow'; }
        else if (z >= 1)   { level = 'caution';  action = 'allow'; }
        else if (z > 0)    { level = 'warning';  action = 'throttle'; }
        else               { level = 'critical'; action = 'block'; }
        
        return { trustScore: z, threatLevel: level, action };
    }

    // ═══════════════════════════════════════════════════════════
    //  INITIALIZATION
    // ═══════════════════════════════════════════════════════════

    function init() {
        if (window.__SECURITY_SUBSTRATE_INIT__) return;
        window.__SECURITY_SUBSTRATE_INIT__ = true;
        
        startIntegrityMonitor();
        
        // Log trust surface heights for all domains
        const domainInfo = Object.entries(TRUST_DOMAINS).map(([name, d]) => {
            const z = evalSurface(d.surface, d.x, d.y);
            return `${name}:z=${z.toFixed(2)}`;
        }).join(', ');
        
        console.log(`[SecuritySubstrate] Initialized — φ=${PHI.toFixed(4)} — Domains: ${domainInfo}`);
    }

    // ═══════════════════════════════════════════════════════════
    //  PUBLIC API — Sealed substrate surface
    // ═══════════════════════════════════════════════════════════

    const substrate = Object.freeze({
        version: '1.0.0',
        name: 'Security Substrate',

        // Manifold
        PHI, FIB,
        evalSurface, gradient,
        TRUST_DOMAINS,

        // Initialization
        init,

        // Input sanitization (z=xy² surface)
        sanitizeString,
        sanitizeHTML,
        sanitizeChatMessage,
        sanitizeUsername,
        isCleanInput,
        inputTrustScore,

        // WebSocket gate (z=xy surface)
        ALLOWED_MESSAGE_TYPES,
        validateOutgoingMessage,
        sanitizeOutgoingMessage,

        // Rate limiting (Fibonacci-weighted)
        isActionAllowed,
        ACTION_LIMITS,

        // Game state integrity (z=xy² — φ³)
        sealObject,
        freezeGameRules,
        freezeCardDefinitions,
        verifyIntegrity,
        deepFreeze,

        // Integrity monitor
        registerCriticalFunction,
        startIntegrityMonitor,
        stopIntegrityMonitor,

        // DOM safety
        safeInnerHTML,
        safeTextContent,

        // Secure storage
        secureStorageSet,
        secureStorageGet,

        // Threat assessment (gradient descent)
        assessThreat
    });

    return substrate;
})();

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', SecuritySubstrate.init);
} else {
    SecuritySubstrate.init();
}

// Expose globally + backward compatibility alias
if (typeof window !== 'undefined') {
    window.SecuritySubstrate = SecuritySubstrate;
    window.FastTrackSecurity = SecuritySubstrate; // Alias for existing references
}
