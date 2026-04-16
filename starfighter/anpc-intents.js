/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANPC INTENT SYSTEM — Starfighter Dialog Manifold
 * ═══════════════════════════════════════════════════════════════════════════
 * Decision tree and logic gate system for intent selection.
 * Maps game state → communication intent → pattern selection.
 *
 * Core Architecture:
 *   1. State Capture: Extract tactical/strategic/narrative context
 *   2. Logic Gates: Boolean conditions for intent categories
 *   3. Decision Trees: Hierarchical intent resolution
 *   4. Priority System: Resolve competing intents
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SFIntents = (function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // § 1. INTENT DEFINITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const INTENTS = {
    // ── Alerts (highest priority) ──
    ALERT_MISSILE: 'ALERT_MISSILE',
    ALERT_LOCK: 'ALERT_LOCK',
    ALERT_THREAT: 'ALERT_THREAT',

    // ── Panic/emergency ──
    PANIC_DAMAGE: 'PANIC_DAMAGE',
    PANIC_OVERWHELMED: 'PANIC_OVERWHELMED',

    // ── Orders (command → player/wing) ──
    ORDER_ENGAGE: 'ORDER_ENGAGE',
    ORDER_COVER: 'ORDER_COVER',
    ORDER_BREAK: 'ORDER_BREAK',
    ORDER_REGROUP: 'ORDER_REGROUP',
    ORDER_RTB: 'ORDER_RTB',

    // ── Status reports (wing → command) ──
    STATUS_DAMAGE: 'STATUS_DAMAGE',
    STATUS_FUEL: 'STATUS_FUEL',
    STATUS_THREAT: 'STATUS_THREAT',

    // ── Acknowledgments ──
    ACK_SIMPLE: 'ACK_SIMPLE',
    ACK_REPEAT: 'ACK_REPEAT',

    // ── Combat reports ──
    REPORT_KILL: 'REPORT_KILL',
    REPORT_HIT: 'REPORT_HIT',
    REPORT_MISS: 'REPORT_MISS',

    // ── Banter/chatter (low priority) ──
    BANTER_CALM: 'BANTER_CALM',
    BANTER_COMBAT: 'BANTER_COMBAT',

    // ── Briefing/debrief ──
    BRIEFING: 'BRIEFING',
    DEBRIEF: 'DEBRIEF'
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // § 2. THRESHOLD CONSTANTS
  // ═══════════════════════════════════════════════════════════════════════════

  const THRESHOLDS = {
    HULL_CRITICAL: 20,
    HULL_DAMAGED: 40,
    SHIELD_CRITICAL: 15,
    SHIELD_LOW: 40,
    FUEL_CRITICAL: 10,
    FUEL_LOW: 25,
    MORALE_PANIC: 30,
    MORALE_STRESSED: 50,
    THREAT_OVERWHELM: 8,    // More than 8 enemies = overwhelming
    THREAT_HEAVY: 5,        // 5+ enemies = heavy threat
    DISTANCE_CLOSE: 500,    // Enemy within 500m = close range
    DISTANCE_NEAR: 1500,    // Enemy within 1500m = near
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // § 3. STATE CAPTURE LAYER
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extract tactical context from game state
   * @param {object} state - Full game state
   * @param {object} anpc - ANPC personality/role data
   * @returns {object} - Tactical snapshot
   */
  function captureTacticalState(state, anpc) {
    if (!state || !state.player) return {};

    const player = state.player;
    const entities = state.entities || [];

    // Count threats by type
    const hostiles = entities.filter(e => !e.friendly && (
      e.type === 'enemy' || e.type === 'predator' || e.type === 'interceptor' ||
      e.type === 'bomber' || e.type === 'dreadnought' || e.type === 'alien-baseship'
    ));

    const missiles = entities.filter(e =>
      !e.friendly && (e.type === 'torpedo' || e.type === 'plasma')
    );

    // Check if player is locked
    const lockedOnPlayer = hostiles.some(e => e.lockedTarget === player);

    // Check for incoming missiles
    const incomingMissiles = window.SFThreatSys ?
      window.SFThreatSys.getThreats().incoming.size > 0 : false;

    // Find closest threat
    let closestThreat = null;
    let closestDist = Infinity;
    for (const h of hostiles) {
      if (!h.position) continue;
      const dist = h.position.distanceTo(player.position);
      if (dist < closestDist) {
        closestDist = dist;
        closestThreat = h;
      }
    }

    // Calculate percentages
    const hullPct = (player.hull / player.maxHull) * 100;
    const shieldPct = (player.shields / player.maxShields) * 100;
    const fuelPct = (player.fuel / player.maxFuel) * 100;

    return {
      // Threat assessment
      hostileCount: hostiles.length,
      missileCount: missiles.length,
      lockedOnPlayer,
      incomingMissiles,
      closestThreat,
      closestDist,

      // Player status
      hullPct,
      shieldPct,
      fuelPct,
      isWinchester: player.torpedoes <= 0,
      isBingo: fuelPct < THRESHOLDS.FUEL_LOW,

      // Phase info
      phase: state.phase,
      wave: state.wave,

      // Wingman status (if ANPC is wingman)
      wingmanAlive: anpc && anpc.role === 'wingman' ? true : false,

      // ANPC morale (if available)
      morale: anpc ? anpc.morale : 100
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 4. LOGIC GATES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Logic gates - boolean conditions for intent triggering
   */
  const GATES = {
    // ── Panic gates ──
    PANIC: (tac, anpc) => {
      return (
        (tac.hullPct < THRESHOLDS.HULL_CRITICAL && tac.shieldPct < THRESHOLDS.SHIELD_CRITICAL) ||
        (tac.morale < THRESHOLDS.MORALE_PANIC) ||
        (tac.incomingMissiles && tac.hullPct < 50)
      );
    },

    PANIC_OVERWHELMED: (tac, anpc) => {
      return tac.hostileCount >= THRESHOLDS.THREAT_OVERWHELM && tac.morale < THRESHOLDS.MORALE_STRESSED;
    },

    // ── Alert gates ──
    MISSILE_ALERT: (tac, anpc) => {
      return tac.incomingMissiles || tac.missileCount > 0;
    },

    LOCK_ALERT: (tac, anpc) => {
      return tac.lockedOnPlayer && !tac.incomingMissiles; // Lock warning if locked but no missiles yet
    },

    THREAT_ALERT: (tac, anpc) => {
      return tac.hostileCount > 0 && tac.closestDist < THRESHOLDS.DISTANCE_NEAR;
    },

    // ── Order gates (for lead/command ANPCs) ──
    ORDER_ENGAGE: (tac, anpc) => {
      return (
        anpc && (anpc.role === 'lead' || anpc.role === 'command') &&
        tac.hostileCount > 0 &&
        !GATES.PANIC(tac, anpc)
      );
    },

    ORDER_COVER: (tac, anpc) => {
      return (
        anpc && (anpc.role === 'lead' || anpc.role === 'command') &&
        tac.phase === 'combat' &&
        state.baseship && state.baseship.hull < state.baseship.maxHull * 0.7
      );
    },

    ORDER_BREAK: (tac, anpc) => {
      return (
        anpc && (anpc.role === 'lead' || anpc.role === 'command') &&
        (tac.incomingMissiles || tac.lockedOnPlayer)
      );
    },

    ORDER_REGROUP: (tac, anpc) => {
      return (
        anpc && (anpc.role === 'lead' || anpc.role === 'command') &&
        tac.hostileCount < 3 &&
        tac.morale < THRESHOLDS.MORALE_STRESSED
      );
    },

    // ── Status gates (for wingman ANPCs) ──
    STATUS_DAMAGE: (tac, anpc) => {
      return (
        anpc && anpc.role === 'wingman' &&
        (tac.hullPct < THRESHOLDS.HULL_DAMAGED || tac.shieldPct < THRESHOLDS.SHIELD_LOW)
      );
    },

    STATUS_FUEL: (tac, anpc) => {
      return (
        anpc && anpc.role === 'wingman' &&
        tac.isBingo
      );
    },

    STATUS_THREAT: (tac, anpc) => {
      return (
        anpc && anpc.role === 'wingman' &&
        tac.hostileCount >= THRESHOLDS.THREAT_HEAVY
      );
    },

    // ── Banter gates (low stress only) ──
    BANTER_ALLOWED: (tac, anpc) => {
      return (
        tac.hostileCount < 3 &&
        tac.morale > 60 &&
        !tac.incomingMissiles &&
        !tac.lockedOnPlayer &&
        tac.hullPct > 60 &&
        tac.shieldPct > 40
      );
    },

    BANTER_COMBAT: (tac, anpc) => {
      return (
        tac.hostileCount >= 3 &&
        tac.hostileCount < THRESHOLDS.THREAT_HEAVY &&
        tac.morale > 50 &&
        !GATES.PANIC(tac, anpc)
      );
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // § 5. DECISION TREE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Resolve intent from game state using decision tree
   * @param {object} state - Full game state
   * @param {object} anpc - ANPC personality/role
   * @param {object} trigger - Optional trigger context (e.g., kill event)
   * @returns {string|null} - Intent key or null
   */
  function resolveIntent(state, anpc, trigger = {}) {
    const tac = captureTacticalState(state, anpc);

    // ── Priority 1: Alerts (immediate danger) ──
    if (GATES.MISSILE_ALERT(tac, anpc)) return INTENTS.ALERT_MISSILE;
    if (GATES.LOCK_ALERT(tac, anpc)) return INTENTS.ALERT_LOCK;

    // ── Priority 2: Panic (critical damage/stress) ──
    if (GATES.PANIC_OVERWHELMED(tac, anpc)) return INTENTS.PANIC_OVERWHELMED;
    if (GATES.PANIC(tac, anpc)) return INTENTS.PANIC_DAMAGE;

    // ── Priority 3: Event-triggered intents ──
    if (trigger.event === 'kill') return INTENTS.REPORT_KILL;
    if (trigger.event === 'hit') return INTENTS.REPORT_HIT;
    if (trigger.event === 'miss') return INTENTS.REPORT_MISS;

    // ── Priority 4: Orders (if ANPC is lead/command) ──
    if (anpc && (anpc.role === 'lead' || anpc.role === 'command')) {
      if (GATES.ORDER_BREAK(tac, anpc)) return INTENTS.ORDER_BREAK;
      if (GATES.ORDER_COVER(tac, anpc)) return INTENTS.ORDER_COVER;
      if (GATES.ORDER_ENGAGE(tac, anpc)) return INTENTS.ORDER_ENGAGE;
      if (GATES.ORDER_REGROUP(tac, anpc)) return INTENTS.ORDER_REGROUP;
    }

    // ── Priority 5: Status reports (if ANPC is wingman) ──
    if (anpc && anpc.role === 'wingman') {
      if (GATES.STATUS_DAMAGE(tac, anpc)) return INTENTS.STATUS_DAMAGE;
      if (GATES.STATUS_FUEL(tac, anpc)) return INTENTS.STATUS_FUEL;
      if (GATES.STATUS_THREAT(tac, anpc)) return INTENTS.STATUS_THREAT;
    }

    // ── Priority 6: Threat alerts (non-critical) ──
    if (GATES.THREAT_ALERT(tac, anpc)) return INTENTS.ALERT_THREAT;

    // ── Priority 7: Banter (low-stress only) ──
    if (GATES.BANTER_COMBAT(tac, anpc)) return INTENTS.BANTER_COMBAT;
    if (GATES.BANTER_ALLOWED(tac, anpc)) {
      // Only allow banter occasionally
      if (Math.random() < 0.15) return INTENTS.BANTER_CALM;
    }

    // ── No intent triggered ──
    return null;
  }

  /**
   * Map intent to pattern key
   * @param {string} intent - Intent constant
   * @returns {string} - Pattern key for SFPatterns.generate()
   */
  function intentToPattern(intent) {
    // Direct mapping - intent names match pattern names
    return intent;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 6. CONTEXT BUILDER
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Build context object for pattern filling
   * @param {object} state - Game state
   * @param {object} anpc - ANPC data
   * @returns {object} - Context for SFPatterns.fillPattern()
   */
  function buildContext(state, anpc) {
    const playerCallsign = state.player && state.player.callsign ? state.player.callsign : 'Ghost';
    const anpcCallsign = anpc && anpc.callsign ? anpc.callsign : 'Wingman';

    return {
      callsignSrc: anpcCallsign,
      callsignDst: playerCallsign,
      role: anpc ? anpc.role : 'wingman',
      tone: anpc ? anpc.tone : 'neutral'
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 7. PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    INTENTS,
    THRESHOLDS,
    GATES,

    // Core functions
    captureTacticalState,
    resolveIntent,
    intentToPattern,
    buildContext
  };
})();

// Expose globally
window.SFIntents = SFIntents;
