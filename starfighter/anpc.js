/**
 * ANPC System — Starfighter
 * ─────────────────────────────────────────────────────────────────
 * ButterflyFX™ ANPC Implementation
 * Two-surface manifold: z=xy (linear), z=xy² (asymmetric escalation)
 * OCEAN personality model, 8-state combat state machine, 3-tier phrase pools,
 * composite string assembly, morale with contagion, disposition tracking.
 *
 * Document #1: General ANPC Guideline
 * Document #2: Starfighter ANPC Guideline
 */

const SFANPC = (function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════
  // §1 — CONSTANTS & ENUMERATIONS
  // ══════════════════════════════════════════════════════════════════

  const COMBAT_STATES = {
    PATROL: 'patrol',
    ALERT: 'alert',
    ENGAGED: 'engaged',
    EVASIVE: 'evasive',
    DAMAGED: 'damaged',
    RETREATING: 'retreating',
    DISABLED: 'disabled',
    DESTROYED: 'destroyed',
  };

  const CHANNELS = {
    SQUADRON: 'ch-sqd',
    FLEET: 'ch-flt',
    PRIVATE: 'ch-pvt',
    ENEMY: 'ch-enm',
  };

  const ROE = {
    FREE: 'weapons-free',
    TIGHT: 'weapons-tight',
    HOLD: 'weapons-hold',
  };

  const DIFFICULTY = {
    EASY: 'easy',
    NORMAL: 'normal',
    HARD: 'hard',
    VETERAN: 'veteran',
  };

  // ══════════════════════════════════════════════════════════════════
  // §2 — SCENARIO VECTOR SYSTEM
  // ══════════════════════════════════════════════════════════════════

  // Scenario vector: [Threat, Opportunity, Ambiguity, SocialPressure, TimePressure]
  const MISSION_TEMPLATES = {
    patrol:       [0.2, 0.3, 0.5, 0.2, 0.1],
    escort:       [0.4, 0.2, 0.3, 0.6, 0.3],
    assault:      [0.7, 0.6, 0.2, 0.4, 0.5],
    defense:      [0.6, 0.2, 0.3, 0.7, 0.7],
    recon:        [0.3, 0.5, 0.7, 0.1, 0.2],
    boss:         [0.9, 0.4, 0.1, 0.5, 0.8],
  };

  // Dynamic event modifiers: [dT, dO, dA, dS, dTP]
  const EVENT_MODIFIERS = {
    new_contacts:       [+0.1, 0,    +0.2, 0,    0   ],
    contacts_hostile:   [+0.3, 0,    -0.2, +0.1, +0.2],
    ambush_detected:    [+0.4, 0,    -0.3, +0.1, +0.3],
    ally_destroyed:     [+0.2, -0.1, 0,    +0.2, +0.1],
    enemy_destroyed:    [-0.1, +0.2, -0.1, 0,    -0.05],
    hull_critical:      [+0.1, -0.2, 0,    +0.1, +0.3],
    base_critical:      [+0.3, -0.1, 0,    +0.4, +0.4],
    reinforcements:     [-0.2, +0.3, -0.1, -0.1, -0.1],
    boss_spawn:         [+0.4, +0.2, -0.2, +0.2, +0.3],
    objective_complete: [-0.3, +0.1, -0.2, -0.2, -0.3],
  };

  class ScenarioVector {
    constructor(template = 'patrol') {
      this.raw = [...(MISSION_TEMPLATES[template] || MISSION_TEMPLATES.patrol)];
      this.smoothed = [...this.raw];
      this.decay = 0.85; // EMA decay factor
      this.rateLimit = 0.4; // max change per second
      this._lastUpdate = 0;
    }

    applyEvent(eventName) {
      const mod = EVENT_MODIFIERS[eventName];
      if (!mod) return;
      for (let i = 0; i < 5; i++) {
        this.raw[i] = Math.max(0, Math.min(1, this.raw[i] + mod[i]));
      }
    }

    update(dt) {
      // EMA smoothing: smoothed = decay * smoothed + (1-decay) * raw
      for (let i = 0; i < 5; i++) {
        const target = this.raw[i];
        const diff = target - this.smoothed[i];
        const maxDelta = this.rateLimit * dt;
        const clamped = Math.abs(diff) > maxDelta ? Math.sign(diff) * maxDelta : diff;
        this.smoothed[i] += clamped * (1 - this.decay) + diff * (1 - this.decay);
        this.smoothed[i] = Math.max(0, Math.min(1, this.smoothed[i]));
      }
    }

    get threat() { return this.smoothed[0]; }
    get opportunity() { return this.smoothed[1]; }
    get ambiguity() { return this.smoothed[2]; }
    get socialPressure() { return this.smoothed[3]; }
    get timePressure() { return this.smoothed[4]; }

    reset(template = 'patrol') {
      this.raw = [...(MISSION_TEMPLATES[template] || MISSION_TEMPLATES.patrol)];
      this.smoothed = [...this.raw];
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // §3 — MANIFOLD DECISION PIPELINE
  // ══════════════════════════════════════════════════════════════════

  /**
   * Linear manifold: z = x * y
   * Used for proportional response (communication, tactical decisions)
   */
  function manifoldLinear(x, y) {
    return Math.max(0, Math.min(1, x * y));
  }

  /**
   * Asymmetric manifold: z = x * y²
   * Used for escalation (aggression, weapon selection, panic)
   */
  function manifoldAsymmetric(x, y) {
    return Math.max(0, Math.min(1, x * y * y));
  }

  /**
   * Compute manifold inputs from personality + scenario
   * x = personality-driven base impulse
   * y = scenario-driven environmental intensity
   */
  function computeManifoldXY(anpc, scenario) {
    // x derives from personality: base aggression = 1.0 - Agreeableness
    // Modified by Extraversion (amplifies) and Conscientiousness (dampens impulse)
    const baseAggression = 1.0 - anpc.personality.A;
    const extraversionBoost = (anpc.personality.E - 0.5) * 0.2;
    const conscientiousnessControl = (anpc.personality.C - 0.5) * -0.15;
    let x = baseAggression + extraversionBoost + conscientiousnessControl;

    // y derives from scenario: weighted combination of vector components
    // Threat and TimePressure drive urgency; Opportunity opens action space
    let y = scenario.threat * 0.4 + scenario.opportunity * 0.3 +
            scenario.timePressure * 0.2 + scenario.socialPressure * 0.1;

    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }

  // ══════════════════════════════════════════════════════════════════
  // §4 — COMBAT STATE MACHINE
  // ══════════════════════════════════════════════════════════════════

  // Transition table: [fromState][condition] → toState
  const STATE_TRANSITIONS = {
    [COMBAT_STATES.PATROL]: {
      contacts_detected: COMBAT_STATES.ALERT,
      taking_fire: COMBAT_STATES.ENGAGED,
      heavy_damage: COMBAT_STATES.DAMAGED,
    },
    [COMBAT_STATES.ALERT]: {
      hostiles_confirmed: COMBAT_STATES.ENGAGED,
      contacts_cleared: COMBAT_STATES.PATROL,
      heavy_damage: COMBAT_STATES.DAMAGED,
    },
    [COMBAT_STATES.ENGAGED]: {
      taking_heavy_fire: COMBAT_STATES.EVASIVE,
      heavy_damage: COMBAT_STATES.DAMAGED,
      hostiles_cleared: COMBAT_STATES.PATROL,
      morale_broken: COMBAT_STATES.RETREATING,
    },
    [COMBAT_STATES.EVASIVE]: {
      threat_clear: COMBAT_STATES.ENGAGED,
      heavy_damage: COMBAT_STATES.DAMAGED,
      morale_broken: COMBAT_STATES.RETREATING,
    },
    [COMBAT_STATES.DAMAGED]: {
      stabilized: COMBAT_STATES.RETREATING,
      systems_failed: COMBAT_STATES.DISABLED,
      destroyed: COMBAT_STATES.DESTROYED,
    },
    [COMBAT_STATES.RETREATING]: {
      reached_safety: COMBAT_STATES.PATROL,
      intercepted: COMBAT_STATES.ENGAGED,
      heavy_damage: COMBAT_STATES.DISABLED,
    },
    [COMBAT_STATES.DISABLED]: {
      destroyed: COMBAT_STATES.DESTROYED,
    },
    [COMBAT_STATES.DESTROYED]: {},
  };

  // ══════════════════════════════════════════════════════════════════
  // §5 — MORALE SYSTEM
  // ══════════════════════════════════════════════════════════════════

  const MORALE_MODIFIERS = {
    kill_scored:         +0.10,
    ally_kill:           +0.05,
    ally_destroyed:      -0.15,
    taking_fire:         -0.02, // per second
    heavy_damage:        -0.10,
    outnumbered:         -0.05, // per second when outnumbered
    reinforcements:      +0.15,
    leader_down:         -0.25,
    player_saves:        +0.15,
    order_received:      +0.05,
    victory:             +0.20,
  };

  // Contagion factor: how much one ANPC's morale affects nearby allies
  const MORALE_CONTAGION = 0.3;

  // ══════════════════════════════════════════════════════════════════
  // §6 — TONE VECTOR SYSTEM
  // ══════════════════════════════════════════════════════════════════

  /**
   * Tone vector: [Formality, Warmth, Humor, Aggression]
   * Derived from OCEAN personality + combat state + morale
   */
  function computeToneVector(anpc) {
    const p = anpc.personality;
    const moraleNorm = anpc.morale;
    const inCombat = anpc.combatState === COMBAT_STATES.ENGAGED ||
                     anpc.combatState === COMBAT_STATES.EVASIVE;

    // Formality: high C + low E → formal; low C + high E → informal
    const formality = Math.max(0, Math.min(1, p.C * 0.6 + (1 - p.E) * 0.4));

    // Warmth: high A + high E → warm; low A + low E → cold
    const warmth = Math.max(0, Math.min(1, p.A * 0.5 + p.E * 0.3 + moraleNorm * 0.2));

    // Humor: high O + high E + high morale → humorous
    const humor = Math.max(0, Math.min(1,
      p.O * 0.3 + p.E * 0.3 + moraleNorm * 0.3 - (inCombat ? 0.2 : 0)));

    // Aggression: low A + high scenario threat + combat state
    const aggression = Math.max(0, Math.min(1,
      (1 - p.A) * 0.4 + (inCombat ? 0.3 : 0) + (1 - moraleNorm) * 0.2));

    return { formality, warmth, humor, aggression };
  }

  /**
   * Compute urgency from scenario + combat state
   * Range: 0.0 (casual) to 1.0 (emergency)
   */
  function computeUrgency(anpc, scenario) {
    let urgency = scenario.threat * 0.4 + scenario.timePressure * 0.3;

    // Combat state escalation
    switch (anpc.combatState) {
      case COMBAT_STATES.PATROL: urgency += 0; break;
      case COMBAT_STATES.ALERT: urgency += 0.1; break;
      case COMBAT_STATES.ENGAGED: urgency += 0.25; break;
      case COMBAT_STATES.EVASIVE: urgency += 0.4; break;
      case COMBAT_STATES.DAMAGED: urgency += 0.5; break;
      case COMBAT_STATES.RETREATING: urgency += 0.35; break;
      case COMBAT_STATES.DISABLED: urgency += 0.6; break;
    }

    // Hull state
    if (anpc.hull < 0.25) urgency += 0.2;
    else if (anpc.hull < 0.5) urgency += 0.1;

    return Math.max(0, Math.min(1, urgency));
  }

  // ══════════════════════════════════════════════════════════════════
  // §7 — 3-TIER PHRASE POOL SYSTEM
  // ══════════════════════════════════════════════════════════════════

  // Universal Pool (Document #1 §8) — generic fallbacks
  const UNIVERSAL_POOL = {
    combat_engage: [
      { id: 'UNI-CE-001', template: 'Engaging {target}.', urgMin: 0.3, urgMax: 0.7 },
      { id: 'UNI-CE-002', template: 'Weapons free on {target}.', urgMin: 0.4, urgMax: 0.8 },
      { id: 'UNI-CE-003', template: 'In range. Firing.', urgMin: 0.3, urgMax: 0.6 },
      { id: 'UNI-CE-004', template: 'Fox {foxType}, {target}.', urgMin: 0.5, urgMax: 0.9 },
    ],
    kill_confirm: [
      { id: 'UNI-KC-001', template: 'Splash one {target}.', urgMin: 0.3, urgMax: 0.7 },
      { id: 'UNI-KC-002', template: '{target} destroyed.', urgMin: 0.2, urgMax: 0.6 },
      { id: 'UNI-KC-003', template: 'Good kill.', urgMin: 0.2, urgMax: 0.5 },
    ],
    damage_report: [
      { id: 'UNI-DR-001', template: 'Taking fire.', urgMin: 0.4, urgMax: 0.8 },
      { id: 'UNI-DR-002', template: 'Hit. Hull at {hullPct}%.', urgMin: 0.5, urgMax: 0.9 },
      { id: 'UNI-DR-003', template: 'Shields gone.', urgMin: 0.6, urgMax: 1.0 },
    ],
    tactical_coord: [
      { id: 'UNI-TC-001', template: 'Break {direction}!', urgMin: 0.6, urgMax: 1.0 },
      { id: 'UNI-TC-002', template: 'On your six.', urgMin: 0.5, urgMax: 0.9 },
      { id: 'UNI-TC-003', template: 'Form up.', urgMin: 0.2, urgMax: 0.5 },
      { id: 'UNI-TC-004', template: 'Covering your {direction}.', urgMin: 0.3, urgMax: 0.7 },
    ],
    morale_banter: [
      { id: 'UNI-MB-001', template: 'Good hunting.', urgMin: 0.0, urgMax: 0.3 },
      { id: 'UNI-MB-002', template: 'Stay sharp.', urgMin: 0.1, urgMax: 0.4 },
      { id: 'UNI-MB-003', template: 'Watch your spacing.', urgMin: 0.1, urgMax: 0.4 },
    ],
    mission_comm: [
      { id: 'UNI-MC-001', template: 'Copy that.', urgMin: 0.0, urgMax: 0.5 },
      { id: 'UNI-MC-002', template: 'Acknowledged.', urgMin: 0.0, urgMax: 0.6 },
      { id: 'UNI-MC-003', template: 'Roger.', urgMin: 0.0, urgMax: 0.5 },
    ],
    emergency: [
      { id: 'UNI-EM-001', template: 'Mayday, mayday!', urgMin: 0.8, urgMax: 1.0 },
      { id: 'UNI-EM-002', template: 'Going down!', urgMin: 0.9, urgMax: 1.0 },
      { id: 'UNI-EM-003', template: 'Eject, eject!', urgMin: 0.9, urgMax: 1.0 },
    ],
  };

  // Title Pool — role-specific phrases (§7.1)
  const TITLE_POOLS = {
    'SF-WING': { // Wingman
      combat_engage: [
        { id: 'SF-CE-001', template: 'Tally {count}! {target} at {bearing}.', urgMin: 0.3, urgMax: 0.7 },
        { id: 'SF-CE-002', template: 'Bogey at {bearing}, {distance}m. {engaging}.', urgMin: 0.3, urgMax: 0.6 },
        { id: 'SF-CE-003', template: 'Guns, guns, guns!', urgMin: 0.5, urgMax: 0.9 },
        { id: 'SF-CE-004', template: 'Fox {foxType}!', urgMin: 0.5, urgMax: 0.9 },
        { id: 'SF-CE-005', template: '{callsign}, bogey at {clock} o\'clock {altitude}, {distance} meters, over.', urgMin: 0.3, urgMax: 0.6 },
      ],
      kill_confirm: [
        { id: 'SF-KC-001', template: 'Splash one! {remaining} remaining.', urgMin: 0.3, urgMax: 0.7 },
        { id: 'SF-KC-002', template: 'That\'s a kill. {remaining} left.', urgMin: 0.3, urgMax: 0.6 },
        { id: 'SF-KC-003', template: 'He\'s down. Next.', urgMin: 0.3, urgMax: 0.6 },
      ],
      damage_report: [
        { id: 'SF-DR-001', template: 'Hit! Hull {hullPct}%. Still in it.', urgMin: 0.4, urgMax: 0.8 },
        { id: 'SF-DR-002', template: 'Taking hits. Shields {shieldStatus}.', urgMin: 0.5, urgMax: 0.8 },
        { id: 'SF-DR-003', template: 'Heavy damage. Might need to break off.', urgMin: 0.7, urgMax: 1.0 },
      ],
      tactical_coord: [
        { id: 'SF-TC-001', template: 'I\'ve got your {position}. You\'re clear.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'SF-TC-002', template: 'Break {direction}! I\'ll cover.', urgMin: 0.6, urgMax: 1.0 },
        { id: 'SF-TC-003', template: 'On your wing.', urgMin: 0.1, urgMax: 0.4 },
        { id: 'SF-TC-004', template: 'Forming on your {position}.', urgMin: 0.1, urgMax: 0.4 },
      ],
      morale_banter: [
        { id: 'SF-MB-001', template: 'Nice flying, {playerCallsign}.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'SF-MB-002', template: 'That\'s how it\'s done.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'SF-MB-003', template: 'Keep it up.', urgMin: 0.0, urgMax: 0.3 },
      ],
    },
    'SF-CMDOP': { // Command Base Operator
      combat_engage: [
        { id: 'SF-CO-CE-001', template: '{count} contacts bearing {bearing}, range {distance}.', urgMin: 0.2, urgMax: 0.6 },
        { id: 'SF-CO-CE-002', template: 'New signatures on scope. {count} at bearing {bearing}.', urgMin: 0.2, urgMax: 0.6 },
      ],
      kill_confirm: [
        { id: 'SF-CO-KC-001', template: 'Confirm kill. {remaining} hostiles on scope.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'SF-CO-KC-002', template: 'Signal lost. Well done. {remaining} remain.', urgMin: 0.2, urgMax: 0.5 },
      ],
      damage_report: [
        { id: 'SF-CO-DR-001', template: '{callsign}, telemetry shows hull at {hullPct}%. Recommend RTB.', urgMin: 0.5, urgMax: 0.9 },
        { id: 'SF-CO-DR-002', template: 'Warning — {callsign} hull integrity dropping. {hullPct}%.', urgMin: 0.6, urgMax: 1.0 },
      ],
      tactical_coord: [
        { id: 'SF-CO-TC-001', template: 'All ships, form {formation}. Acknowledge.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'SF-CO-TC-002', template: '{callsign}, vector {bearing} for intercept.', urgMin: 0.3, urgMax: 0.7 },
        { id: 'SF-CO-TC-003', template: 'Hostiles clear. Reform on flight leader.', urgMin: 0.1, urgMax: 0.4 },
      ],
      mission_comm: [
        { id: 'SF-CO-MC-001', template: 'All ships, {callsign} actual. {missionBrief}. {callsign} out.', urgMin: 0.1, urgMax: 0.4 },
        { id: 'SF-CO-MC-002', template: 'Intel update: {intel}. Adjust accordingly.', urgMin: 0.2, urgMax: 0.6 },
      ],
      emergency: [
        { id: 'SF-CO-EM-001', template: '{callsign}, get out of there! {reason}!', urgMin: 0.8, urgMax: 1.0 },
        { id: 'SF-CO-EM-002', template: 'Emergency — all ships break {direction}! {reason}!', urgMin: 0.9, urgMax: 1.0 },
      ],
    },
    'SF-EACE': { // Enemy Ace
      combat_engage: [
        { id: 'SF-EA-CE-001', template: '...Interesting.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'SF-EA-CE-002', template: 'Let\'s see what you\'re made of.', urgMin: 0.3, urgMax: 0.6 },
        { id: 'SF-EA-CE-003', template: 'You fly well. It won\'t save you.', urgMin: 0.3, urgMax: 0.7 },
      ],
      kill_confirm: [
        { id: 'SF-EA-KC-001', template: 'One less.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'SF-EA-KC-002', template: 'They always break the same way.', urgMin: 0.2, urgMax: 0.5 },
      ],
      damage_report: [
        { id: 'SF-EA-DR-001', template: '...Not bad.', urgMin: 0.4, urgMax: 0.7 },
        { id: 'SF-EA-DR-002', template: 'You\'re the first to land that.', urgMin: 0.5, urgMax: 0.8 },
      ],
      morale_banter: [
        { id: 'SF-EA-MB-001', template: 'You\'re better than the others.', urgMin: 0.0, urgMax: 0.4 },
        { id: 'SF-EA-MB-002', template: 'Almost impressive.', urgMin: 0.0, urgMax: 0.4 },
      ],
      emergency: [
        { id: 'SF-EA-EM-001', template: '...You\'re the first. Well fought.', urgMin: 0.9, urgMax: 1.0 },
      ],
    },
    'SF-SQLDR': { // Squadron Leader
      tactical_coord: [
        { id: 'SF-SL-TC-001', template: 'All wings, {formation} formation. Execute.', urgMin: 0.2, urgMax: 0.6 },
        { id: 'SF-SL-TC-002', template: '{callsign}, break and engage. I\'ll coordinate.', urgMin: 0.4, urgMax: 0.8 },
        { id: 'SF-SL-TC-003', template: 'Hostiles cleared. Good work, everyone. Reform.', urgMin: 0.1, urgMax: 0.3 },
      ],
      combat_engage: [
        { id: 'SF-SL-CE-001', template: 'Weapons free. Engage at will.', urgMin: 0.4, urgMax: 0.8 },
        { id: 'SF-SL-CE-002', template: 'All ships — fight\'s on. Give them hell.', urgMin: 0.5, urgMax: 0.9 },
      ],
      morale_banter: [
        { id: 'SF-SL-MB-001', template: 'Outstanding work, {callsign}. Keep it up.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'SF-SL-MB-002', template: 'That\'s the spirit. Stay aggressive.', urgMin: 0.0, urgMax: 0.4 },
      ],
    },
  };

  // Character Pool — individual ANPC overrides (§7.2)
  const CHARACTER_POOLS = {
    'Hotshot': {
      combat_engage: [
        { id: 'HS-CE-001', template: 'Watch this!', urgMin: 0.4, urgMax: 0.9 },
        { id: 'HS-CE-002', template: 'Here I come!', urgMin: 0.4, urgMax: 0.8 },
        { id: 'HS-CE-003', template: 'Target locked — eat this!', urgMin: 0.5, urgMax: 0.9 },
      ],
      kill_confirm: [
        { id: 'HS-KC-001', template: 'Boom! That\'s how it\'s done! {killCount} and counting!', urgMin: 0.3, urgMax: 0.7 },
        { id: 'HS-KC-002', template: 'Another one bites the dust! Add it to the board!', urgMin: 0.3, urgMax: 0.6 },
        { id: 'HS-KC-003', template: 'Too easy! Who\'s next?', urgMin: 0.2, urgMax: 0.5 },
      ],
      damage_report: [
        { id: 'HS-DR-001', template: 'Ow! That tickled. Hull {hullPct}%.', urgMin: 0.4, urgMax: 0.7 },
        { id: 'HS-DR-002', template: 'Alright, that one hurt. Still in this.', urgMin: 0.5, urgMax: 0.8 },
        { id: 'HS-DR-003', template: 'They got lucky. Won\'t happen again.', urgMin: 0.4, urgMax: 0.7 },
      ],
      morale_banter: [
        { id: 'HS-MB-001', template: 'Ha! Who buys drinks tonight?', urgMin: 0.0, urgMax: 0.3 },
        { id: 'HS-MB-002', template: 'Is that all they\'ve got?', urgMin: 0.0, urgMax: 0.3 },
        { id: 'HS-MB-003', template: 'Keep up, {playerCallsign}! Don\'t let me show you up!', urgMin: 0.0, urgMax: 0.3 },
        { id: 'HS-MB-004', template: 'My sister would\'ve loved this fight.', urgMin: 0.0, urgMax: 0.2 },
      ],
      tactical_coord: [
        { id: 'HS-TC-001', template: 'On your left! I got you!', urgMin: 0.3, urgMax: 0.7 },
        { id: 'HS-TC-002', template: 'Break right — I\'ll handle this one!', urgMin: 0.5, urgMax: 0.9 },
      ],
      emergency: [
        { id: 'HS-EM-001', template: 'No no no — not today! Punching out!', urgMin: 0.9, urgMax: 1.0 },
      ],
    },
    'Frostbite': {
      combat_engage: [
        { id: 'FB-CE-001', template: 'Engaging.', urgMin: 0.3, urgMax: 0.7 },
        { id: 'FB-CE-002', template: 'Target acquired.', urgMin: 0.3, urgMax: 0.7 },
        { id: 'FB-CE-003', template: 'Firing.', urgMin: 0.4, urgMax: 0.8 },
      ],
      kill_confirm: [
        { id: 'FB-KC-001', template: 'Kill confirmed.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'FB-KC-002', template: 'Down.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'FB-KC-003', template: 'Next.', urgMin: 0.2, urgMax: 0.4 },
      ],
      damage_report: [
        { id: 'FB-DR-001', template: 'Shields gone.', urgMin: 0.5, urgMax: 0.8 },
        { id: 'FB-DR-002', template: 'Hull {hullPct}%. Functional.', urgMin: 0.4, urgMax: 0.7 },
        { id: 'FB-DR-003', template: 'Damage sustained. Continuing.', urgMin: 0.4, urgMax: 0.7 },
      ],
      morale_banter: [
        { id: 'FB-MB-001', template: 'Adequate.', urgMin: 0.0, urgMax: 0.2 },
        { id: 'FB-MB-002', template: '...Noted.', urgMin: 0.0, urgMax: 0.2 },
      ],
      tactical_coord: [
        { id: 'FB-TC-001', template: 'Covering.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'FB-TC-002', template: 'Right side clear.', urgMin: 0.2, urgMax: 0.4 },
      ],
      emergency: [
        { id: 'FB-EM-001', template: 'Critical. Withdrawing.', urgMin: 0.8, urgMax: 1.0 },
      ],
    },
    'Lighthouse': {
      combat_engage: [
        { id: 'LH-CE-001', template: '{count} hostile contacts, bearing {bearing}, contact in {eta} seconds.', urgMin: 0.2, urgMax: 0.6 },
        { id: 'LH-CE-002', template: 'Lighthouse confirms — {count} hostiles, combat rating {rating}. No additional on long-range.', urgMin: 0.2, urgMax: 0.6 },
      ],
      kill_confirm: [
        { id: 'LH-KC-001', template: 'Signal confirmed lost. {remaining} on scope. Well done.', urgMin: 0.2, urgMax: 0.5 },
      ],
      tactical_coord: [
        { id: 'LH-TC-001', template: 'Recommend vector {bearing} for optimal engagement.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'LH-TC-002', template: 'All contacts neutralized. Sector clear. Return to base.', urgMin: 0.1, urgMax: 0.3 },
      ],
      mission_comm: [
        { id: 'LH-MC-001', template: 'All ships, this is Lighthouse. {missionBrief}. Lighthouse out.', urgMin: 0.1, urgMax: 0.4 },
        { id: 'LH-MC-002', template: 'Lighthouse to patrol group — {intel}. Good work. Lighthouse out.', urgMin: 0.1, urgMax: 0.3 },
      ],
      morale_banter: [
        { id: 'LH-MB-001', template: '{playerCallsign}, well flown. The squadron is lucky to have you.', urgMin: 0.0, urgMax: 0.2 },
      ],
      emergency: [
        { id: 'LH-EM-001', template: '{callsign}, get out NOW! {reason}!', urgMin: 0.9, urgMax: 1.0 },
      ],
    },
    'Nightshade': {
      combat_engage: [
        { id: 'NS-CE-001', template: '...Interesting.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'NS-CE-002', template: 'Let\'s see what you\'re made of.', urgMin: 0.3, urgMax: 0.6 },
        { id: 'NS-CE-003', template: 'You have my attention. That\'s rarely a good thing.', urgMin: 0.3, urgMax: 0.6 },
      ],
      kill_confirm: [
        { id: 'NS-KC-001', template: 'Predictable.', urgMin: 0.2, urgMax: 0.4 },
        { id: 'NS-KC-002', template: 'They always break the same way.', urgMin: 0.2, urgMax: 0.4 },
      ],
      damage_report: [
        { id: 'NS-DR-001', template: '...Not bad.', urgMin: 0.4, urgMax: 0.7 },
        { id: 'NS-DR-002', template: 'You\'re the first to land that in a long time.', urgMin: 0.5, urgMax: 0.8 },
      ],
      morale_banter: [
        { id: 'NS-MB-001', template: 'You\'re better than the others. That makes this... interesting.', urgMin: 0.0, urgMax: 0.4 },
        { id: 'NS-MB-002', template: 'Keep flying like that. I\'d hate for this to be boring.', urgMin: 0.0, urgMax: 0.4 },
      ],
      emergency: [
        { id: 'NS-EM-001', template: '...You\'re the first. Well fought.', urgMin: 0.9, urgMax: 1.0 },
      ],
    },
  };

  // ══════════════════════════════════════════════════════════════════
  // §8 — COMPOSITE STRING ASSEMBLY
  // ══════════════════════════════════════════════════════════════════

  // Opener stems by urgency range
  const OPENERS = {
    low:  ['', '', ''],  // low urgency: often no opener
    mid:  ['{callsign}, ', 'Heads up — ', 'Be advised — ', ''],
    high: ['{callsign}! ', 'Warning! ', '', 'Break! '],
    crit: ['MAYDAY — ', '{callsign}! ', ''],
  };

  // Modifiers by tone
  const MODIFIERS = {
    formal: [' Over.', ' Acknowledge.', ' Copy?', ''],
    warm:   [' Stay safe.', ' We\'ve got you.', ' You\'re doing great.', ''],
    humor:  [' Easy money.', ' Almost too easy.', ''],
    aggro:  [' No mercy.', ' Make them pay.', ' End them.', ''],
    neutral: ['', '', ''],
  };

  /**
   * Assemble a composite string from phrase template + context
   * Structure: [Opener] + Core + [Modifier]
   */
  function assemblePhrase(phrase, context, anpc, urgency) {
    // Pick opener based on urgency
    let opener = '';
    if (urgency >= 0.8) opener = _pick(OPENERS.crit);
    else if (urgency >= 0.5) opener = _pick(OPENERS.high);
    else if (urgency >= 0.25) opener = _pick(OPENERS.mid);
    else opener = _pick(OPENERS.low);

    // Core: fill template variables
    let core = phrase.template;
    core = _fillTemplate(core, context);

    // Modifier based on dominant tone
    let modifier = '';
    if (anpc) {
      const tone = computeToneVector(anpc);
      if (urgency < 0.5) { // only add modifier in non-urgent situations
        if (tone.humor > 0.6) modifier = _pick(MODIFIERS.humor);
        else if (tone.warmth > 0.6) modifier = _pick(MODIFIERS.warm);
        else if (tone.aggression > 0.6) modifier = _pick(MODIFIERS.aggro);
        else if (tone.formality > 0.6) modifier = _pick(MODIFIERS.formal);
        else modifier = _pick(MODIFIERS.neutral);
      }
    }

    // Substitute callsign in opener
    opener = opener.replace('{callsign}', context.playerCallsign || 'Pilot');

    return (opener + core + modifier).trim();
  }

  function _fillTemplate(template, ctx) {
    return template
      .replace(/{target}/g, ctx.target || 'hostile')
      .replace(/{count}/g, ctx.count || '?')
      .replace(/{bearing}/g, ctx.bearing || '000')
      .replace(/{distance}/g, ctx.distance || '?')
      .replace(/{hullPct}/g, ctx.hullPct || '?')
      .replace(/{shieldStatus}/g, ctx.shieldStatus || 'unknown')
      .replace(/{remaining}/g, ctx.remaining || '?')
      .replace(/{direction}/g, ctx.direction || 'left')
      .replace(/{position}/g, ctx.position || 'wing')
      .replace(/{callsign}/g, ctx.callsign || 'Flight')
      .replace(/{playerCallsign}/g, ctx.playerCallsign || 'Pilot')
      .replace(/{formation}/g, ctx.formation || 'V-Formation')
      .replace(/{clock}/g, ctx.clock || '12')
      .replace(/{altitude}/g, ctx.altitude || 'level')
      .replace(/{foxType}/g, ctx.foxType || '2')
      .replace(/{engaging}/g, ctx.engaging || 'Engaging')
      .replace(/{killCount}/g, ctx.killCount || '?')
      .replace(/{rating}/g, ctx.rating || 'unknown')
      .replace(/{eta}/g, ctx.eta || '?')
      .replace(/{missionBrief}/g, ctx.missionBrief || 'standard patrol')
      .replace(/{intel}/g, ctx.intel || 'no change')
      .replace(/{reason}/g, ctx.reason || 'danger');
  }

  // ══════════════════════════════════════════════════════════════════
  // §9 — ANPC ENTITY
  // ══════════════════════════════════════════════════════════════════

  class ANPC {
    constructor(schema) {
      // Base identity (Document #1 §3)
      this.id = schema.id;
      this.displayName = schema.displayName;
      this.callsign = schema.callsign;
      this.role = schema.role;
      this.voiceProfile = schema.voiceProfile || 'default';
      this.backstory = schema.backstory || '';

      // OCEAN personality vector (Document #1 §4)
      this.personality = {
        O: schema.personality[0], // Openness
        C: schema.personality[1], // Conscientiousness
        E: schema.personality[2], // Extraversion
        A: schema.personality[3], // Agreeableness
        N: schema.personality[4], // Neuroticism
      };

      // Starfighter extended fields (Doc #2 §3.1)
      this.shipClass = schema.shipClass || 'interceptor';
      this.squadronId = schema.squadronId || 'SQ-01';
      this.combatRating = schema.combatRating || 0.5;
      this.weaponLoadout = schema.weaponLoadout || ['WPN-LAS'];
      this.flightHours = schema.flightHours || 0;
      this.killCount = schema.killCount || 0;
      this.loyaltyScore = schema.loyaltyScore || null;
      this.damageThreshold = schema.damageThreshold || 0.35;
      this.preferredTactic = schema.preferredTactic || 'balanced';
      this.formationPosition = schema.formationPosition || 'free';

      // Manifold parameters
      this.adrenalineSpike = schema.adrenalineSpike || 0.15;
      this.fatigueResistance = schema.fatigueResistance || 0.5;
      this.moraleFloor = schema.moraleFloor || 0.15;

      // Runtime state
      this.combatState = COMBAT_STATES.PATROL;
      this.morale = 0.7; // baseline morale
      this.hull = 1.0;
      this.shields = 1.0;
      this.disposition = schema.disposition || 0.5; // toward player
      this.adrenaline = 0; // decays over time
      this.fatigue = 0;
      this.missionKills = 0;

      // Communication state
      this.lastCommTime = 0;
      this.commCooldown = 0;
      this.lastPhraseIds = []; // avoid immediate repeats

      // Alive/active
      this.active = true;
      this.faction = schema.faction || 'allied'; // allied | enemy
    }

    // ── State transitions ──
    transition(condition) {
      const transitions = STATE_TRANSITIONS[this.combatState];
      if (transitions && transitions[condition]) {
        const newState = transitions[condition];
        if (newState !== this.combatState) {
          const oldState = this.combatState;
          this.combatState = newState;
          return { from: oldState, to: newState };
        }
      }
      return null;
    }

    // ── Morale ──
    adjustMorale(delta) {
      this.morale = Math.max(this.moraleFloor, Math.min(1, this.morale + delta));
      if (this.morale <= this.moraleFloor + 0.05) {
        this.transition('morale_broken');
      }
    }

    // ── Manifold lookup ──
    getManifoldValues(scenario) {
      const { x, y } = computeManifoldXY(this, scenario);
      // Apply adrenaline spike to x
      const xBoosted = Math.min(1, x + this.adrenaline);
      return {
        x: xBoosted,
        y,
        linear: manifoldLinear(xBoosted, y),
        asymmetric: manifoldAsymmetric(xBoosted, y),
      };
    }

    // ── Weapon selection via manifold z-ranges (Doc #2 §5.3) ──
    selectWeapon(scenario) {
      const m = this.getManifoldValues(scenario);
      const z = m.asymmetric; // use escalation surface for weapon choice
      if (z < 0.15) return 'WPN-LAS'; // Lasers — probing
      if (z < 0.35) return 'WPN-LAS'; // Lasers — sustained
      if (z < 0.55) return 'WPN-SCT'; // Scatter Shot
      if (z < 0.75) return 'WPN-PTN'; // Proton Torpedoes
      return 'WPN-EMP'; // EMP Burst — maximum escalation
    }

    // ── Communication frequency (based on urgency) ──
    canSpeak(now, urgency) {
      if (!this.active) return false;
      // Higher urgency → shorter cooldown
      const minInterval = urgency > 0.7 ? 2.0 :
                          urgency > 0.4 ? 4.0 :
                          urgency > 0.2 ? 8.0 : 15.0;
      return (now - this.lastCommTime) >= minInterval;
    }

    markSpoke(now, phraseId) {
      this.lastCommTime = now;
      this.lastPhraseIds.push(phraseId);
      if (this.lastPhraseIds.length > 5) this.lastPhraseIds.shift();
    }

    // ── Update per tick ──
    update(dt) {
      // Decay adrenaline
      if (this.adrenaline > 0) {
        this.adrenaline = Math.max(0, this.adrenaline - dt / 30); // 30s full decay
      }
      // Accumulate fatigue in combat
      if (this.combatState === COMBAT_STATES.ENGAGED ||
          this.combatState === COMBAT_STATES.EVASIVE) {
        this.fatigue = Math.min(1, this.fatigue + dt * (1 - this.fatigueResistance) * 0.01);
      }
    }

    // ── Reset for new mission ──
    resetMission() {
      this.combatState = COMBAT_STATES.PATROL;
      this.morale = 0.7;
      this.hull = 1.0;
      this.shields = 1.0;
      this.adrenaline = 0;
      this.fatigue = 0;
      this.missionKills = 0;
      this.lastCommTime = 0;
      this.lastPhraseIds = [];
      this.active = true;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // §10 — PHRASE SELECTION ENGINE
  // ══════════════════════════════════════════════════════════════════

  /**
   * Select a phrase from the 3-tier system:
   * Character Pool → Title Pool → Universal Pool
   * Filtered by urgency range match
   */
  function selectPhrase(anpc, category, urgency) {
    // Tier 1: Character Pool
    const charPool = CHARACTER_POOLS[anpc.callsign];
    if (charPool && charPool[category]) {
      const match = _filterByUrgency(charPool[category], urgency, anpc.lastPhraseIds);
      if (match) return match;
    }

    // Tier 2: Title Pool (role-specific)
    const titlePool = TITLE_POOLS[anpc.role];
    if (titlePool && titlePool[category]) {
      const match = _filterByUrgency(titlePool[category], urgency, anpc.lastPhraseIds);
      if (match) return match;
    }

    // Tier 3: Universal Pool
    if (UNIVERSAL_POOL[category]) {
      const match = _filterByUrgency(UNIVERSAL_POOL[category], urgency, anpc.lastPhraseIds);
      if (match) return match;
    }

    return null;
  }

  function _filterByUrgency(phrases, urgency, recentIds) {
    // Filter by urgency range, exclude recent IDs
    const eligible = phrases.filter(p =>
      urgency >= p.urgMin && urgency <= p.urgMax &&
      !recentIds.includes(p.id)
    );
    if (eligible.length > 0) return _pick(eligible);
    // Fallback: include recent if nothing else matches
    const fallback = phrases.filter(p => urgency >= p.urgMin && urgency <= p.urgMax);
    return fallback.length > 0 ? _pick(fallback) : null;
  }

  // ══════════════════════════════════════════════════════════════════
  // §11 — ANPC REGISTRY & MANAGER
  // ══════════════════════════════════════════════════════════════════

  const _registry = new Map(); // id → ANPC
  let _scenario = new ScenarioVector('patrol');
  let _difficulty = DIFFICULTY.NORMAL;
  let _gameTime = 0;
  let _lastManifoldCalc = 0;
  const MANIFOLD_INTERVAL_COMBAT = 0.25; // seconds
  const MANIFOLD_INTERVAL_PATROL = 1.0;

  function register(schema) {
    const anpc = new ANPC(schema);
    _registry.set(anpc.id, anpc);
    return anpc;
  }

  function get(id) { return _registry.get(id); }

  function getByCallsign(callsign) {
    for (const anpc of _registry.values()) {
      if (anpc.callsign === callsign) return anpc;
    }
    return null;
  }

  function getByRole(role) {
    const result = [];
    for (const anpc of _registry.values()) {
      if (anpc.role === role && anpc.active) result.push(anpc);
    }
    return result;
  }

  function getAllied() {
    const result = [];
    for (const anpc of _registry.values()) {
      if (anpc.faction === 'allied' && anpc.active) result.push(anpc);
    }
    return result;
  }

  function getEnemies() {
    const result = [];
    for (const anpc of _registry.values()) {
      if (anpc.faction === 'enemy' && anpc.active) result.push(anpc);
    }
    return result;
  }

  function getAll() {
    return [..._registry.values()];
  }

  // ── Update all ANPCs (called from game loop) ──
  function update(dt) {
    _gameTime += dt;
    _scenario.update(dt);

    // Determine manifold calculation interval
    const anyInCombat = [..._registry.values()].some(a =>
      a.active && (a.combatState === COMBAT_STATES.ENGAGED ||
                   a.combatState === COMBAT_STATES.EVASIVE));
    const interval = anyInCombat ? MANIFOLD_INTERVAL_COMBAT : MANIFOLD_INTERVAL_PATROL;

    const shouldCalcManifold = (_gameTime - _lastManifoldCalc) >= interval;
    if (shouldCalcManifold) _lastManifoldCalc = _gameTime;

    for (const anpc of _registry.values()) {
      if (!anpc.active) continue;
      anpc.update(dt);
    }
  }

  // ── Scenario vector control ──
  function applyEvent(eventName) {
    _scenario.applyEvent(eventName);
  }

  function getScenario() { return _scenario; }

  function resetScenario(template) {
    _scenario.reset(template || 'patrol');
  }

  // ── Morale contagion ──
  function propagateMorale(sourceAnpc, delta) {
    for (const anpc of _registry.values()) {
      if (anpc === sourceAnpc || !anpc.active) continue;
      if (anpc.faction === sourceAnpc.faction) {
        anpc.adjustMorale(delta * MORALE_CONTAGION);
      }
    }
  }

  // ── Disposition shifts ──
  const DISPOSITION_DELTAS = {
    player_saves:          +0.15,
    cooperative_kill:      +0.04,
    survived_together:     +0.03,
    player_ignores_danger: -0.08,
    friendly_fire:         -0.20,
    follows_order:         +0.05,
    ignores_order:         -0.10,
    reckless_play:         -0.05,
    impressive_kill:       +0.06,
  };

  function shiftDisposition(anpcId, reason) {
    const anpc = _registry.get(anpcId);
    if (!anpc) return;
    const delta = DISPOSITION_DELTAS[reason] || 0;
    anpc.disposition = Math.max(-1, Math.min(1, anpc.disposition + delta));
  }

  // ── Generate a line of dialog from an ANPC ──
  function speak(anpcId, category, context) {
    const anpc = _registry.get(anpcId);
    if (!anpc || !anpc.active) return null;

    const urgency = computeUrgency(anpc, _scenario);

    // Check communication cooldown
    if (!anpc.canSpeak(_gameTime, urgency)) return null;

    // Select phrase from 3-tier system
    const phrase = selectPhrase(anpc, category, urgency);
    if (!phrase) return null;

    // Assemble composite string
    const assembled = assemblePhrase(phrase, context || {}, anpc, urgency);

    // Mark as spoken
    anpc.markSpoke(_gameTime, phrase.id);

    return {
      sender: anpc.callsign || anpc.displayName,
      text: assembled,
      channel: anpc.faction === 'enemy' ? CHANNELS.ENEMY : CHANNELS.SQUADRON,
      urgency,
      anpcId: anpc.id,
    };
  }

  // ── Force speak (bypass cooldown, for critical events) ──
  function forceSpeak(anpcId, category, context) {
    const anpc = _registry.get(anpcId);
    if (!anpc || !anpc.active) return null;

    const urgency = computeUrgency(anpc, _scenario);
    const phrase = selectPhrase(anpc, category, urgency);
    if (!phrase) return null;

    const assembled = assemblePhrase(phrase, context || {}, anpc, urgency);
    anpc.markSpoke(_gameTime, phrase.id);

    return {
      sender: anpc.callsign || anpc.displayName,
      text: assembled,
      channel: anpc.faction === 'enemy' ? CHANNELS.ENEMY : CHANNELS.SQUADRON,
      urgency,
      anpcId: anpc.id,
    };
  }

  // ── Difficulty scaling ──
  const DIFFICULTY_SCALES = {
    allied: {
      easy:    { accuracy: 0.70, reaction: 0.3, evasion: 0.70, moraleSens: 0.7, damageThreshold: 0.25, aggrMult: 1.2, commFreq: 1.3 },
      normal:  { accuracy: 0.60, reaction: 0.5, evasion: 0.50, moraleSens: 1.0, damageThreshold: 0.35, aggrMult: 1.0, commFreq: 1.0 },
      hard:    { accuracy: 0.50, reaction: 0.7, evasion: 0.35, moraleSens: 1.3, damageThreshold: 0.45, aggrMult: 0.8, commFreq: 0.8 },
      veteran: { accuracy: 0.40, reaction: 1.0, evasion: 0.25, moraleSens: 1.6, damageThreshold: 0.55, aggrMult: 0.7, commFreq: 0.6 },
    },
    enemy: {
      easy:    { accuracy: 0.30, reaction: 1.2, evasion: 0.20, moraleSens: 1.5, aggrMult: 0.7, formTight: 0.3 },
      normal:  { accuracy: 0.50, reaction: 0.7, evasion: 0.40, moraleSens: 1.0, aggrMult: 1.0, formTight: 0.5 },
      hard:    { accuracy: 0.70, reaction: 0.4, evasion: 0.60, moraleSens: 0.7, aggrMult: 1.3, formTight: 0.7 },
      veteran: { accuracy: 0.85, reaction: 0.2, evasion: 0.80, moraleSens: 0.5, aggrMult: 1.6, formTight: 0.9 },
    },
  };

  function setDifficulty(level) {
    _difficulty = level;
  }

  function getDifficultyScale(faction) {
    return DIFFICULTY_SCALES[faction]?.[_difficulty] || DIFFICULTY_SCALES[faction]?.normal;
  }

  // ── Compliance model (Doc #2 §9.1) ──
  function computeCompliance(anpc, orderDangerLevel) {
    return anpc.disposition * (1.0 - orderDangerLevel) * anpc.morale;
  }

  // ── Reset all for new mission ──
  function resetAll(missionTemplate) {
    for (const anpc of _registry.values()) {
      anpc.resetMission();
    }
    _scenario.reset(missionTemplate || 'patrol');
    _gameTime = 0;
    _lastManifoldCalc = 0;
  }

  // ── Utility ──
  function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ══════════════════════════════════════════════════════════════════
  // §12 — CHARACTER DEFINITIONS
  // ══════════════════════════════════════════════════════════════════

  const CHARACTER_SCHEMAS = {
    hotshot: {
      id: 'ANPC-SF-0042',
      displayName: 'Marcus Chen',
      callsign: 'Hotshot',
      role: 'SF-WING',
      voiceProfile: 'young_male_energetic',
      backstory: 'Marcus Chen grew up on a frontier colony racing skimmers through canyons. Reckless skill caught military attention. Graduated mid-class academically but top of flight group. Lost his sister in an early campaign. Channels grief into aggressive prove-something energy.',
      personality: [0.55, 0.40, 0.85, 0.45, 0.35], // O, C, E, A, N
      shipClass: 'interceptor',
      squadronId: 'SQ-07',
      combatRating: 0.72,
      weaponLoadout: ['WPN-LAS', 'WPN-SCT', 'WPN-PTN'],
      flightHours: 1847,
      killCount: 38,
      damageThreshold: 0.35,
      preferredTactic: 'aggressive',
      formationPosition: 'wing_left',
      adrenalineSpike: 0.25,
      fatigueResistance: 0.7,
      moraleFloor: 0.20,
      disposition: 0.65,
      faction: 'allied',
    },
    frostbite: {
      id: 'ANPC-SF-0043',
      displayName: 'Viktor Kozlov',
      callsign: 'Frostbite',
      role: 'SF-WING',
      voiceProfile: 'mature_male_calm_precise',
      backstory: 'Former test pilot with 3000+ hours. Speaks in clipped military efficiency. Ice-cold focus under fire. Methodical where Hotshot is instinctive. Trusts data over gut.',
      personality: [0.40, 0.85, 0.25, 0.50, 0.15], // O, C, E, A, N
      shipClass: 'interceptor',
      squadronId: 'SQ-07',
      combatRating: 0.78,
      weaponLoadout: ['WPN-LAS', 'WPN-SCT', 'WPN-PTN'],
      flightHours: 3200,
      killCount: 52,
      damageThreshold: 0.45,
      preferredTactic: 'defensive',
      formationPosition: 'wing_right',
      adrenalineSpike: 0.10,
      fatigueResistance: 0.85,
      moraleFloor: 0.10,
      disposition: 0.45,
      faction: 'allied',
    },
    lighthouse: {
      id: 'ANPC-SF-0003',
      displayName: 'Dr. Amara Okafor',
      callsign: 'Lighthouse',
      role: 'SF-CMDOP',
      voiceProfile: 'mature_female_calm_authoritative',
      backstory: 'Stellar cartographer turned military intelligence. Reads sensor data and predicts enemy movements. Never fired a weapon but has guided more pilots home than any other operator. Takes every loss personally. Steady, guiding, a promise the shore is close.',
      personality: [0.75, 0.90, 0.40, 0.70, 0.10], // O, C, E, A, N
      shipClass: null,
      squadronId: 'CMD-01',
      combatRating: null,
      weaponLoadout: [],
      flightHours: 0,
      killCount: 0,
      damageThreshold: null,
      preferredTactic: 'support',
      formationPosition: null,
      adrenalineSpike: 0.05,
      fatigueResistance: 0.90,
      moraleFloor: 0.25,
      disposition: 0.70,
      faction: 'allied',
    },
    vasquez: {
      id: 'ANPC-SF-0001',
      displayName: 'Cdr. Elena Vasquez',
      callsign: 'Resolute Actual',
      role: 'SF-SQLDR',
      voiceProfile: 'mature_female_commanding',
      backstory: 'Twenty-year veteran who earned command of the Resolute through exemplary tactical leadership. Direct, unflinching, but deeply invested in her crews\' safety. Carries the weight of every decision.',
      personality: [0.50, 0.85, 0.55, 0.55, 0.20], // O, C, E, A, N
      shipClass: null,
      squadronId: 'CMD-01',
      combatRating: null,
      weaponLoadout: [],
      flightHours: 0,
      killCount: 0,
      damageThreshold: null,
      preferredTactic: 'balanced',
      formationPosition: null,
      adrenalineSpike: 0.10,
      fatigueResistance: 0.85,
      moraleFloor: 0.15,
      disposition: 0.60,
      faction: 'allied',
    },
    nightshade: {
      id: 'ANPC-SF-E-0001',
      displayName: 'Unknown',
      callsign: 'Nightshade',
      role: 'SF-EACE',
      voiceProfile: 'mature_male_calm_menacing',
      backstory: 'A ghost in enemy intelligence files. Appeared three years ago in a matte-black Heavy Fighter. 100+ confirmed kills. Operates outside standard chain of command. Rumored defector. Fights with surgical precision. Speaks only to pilots who impress him.',
      personality: [0.65, 0.85, 0.30, 0.15, 0.20], // O, C, E, A, N
      shipClass: 'heavy_fighter',
      squadronId: 'SQ-X',
      combatRating: 0.94,
      weaponLoadout: ['WPN-LAS', 'WPN-SCT', 'WPN-PTN', 'WPN-EMP'],
      flightHours: 12000,
      killCount: 100,
      damageThreshold: 0.15,
      preferredTactic: 'ambush',
      formationPosition: 'free_roam',
      adrenalineSpike: 0.05,
      fatigueResistance: 0.95,
      moraleFloor: 0.10,
      disposition: -0.60,
      faction: 'enemy',
    },
    tanaka: {
      id: 'ANPC-SF-0004',
      displayName: 'XO Yuki Tanaka',
      callsign: 'Resolute XO',
      role: 'SF-CMDOP',
      voiceProfile: 'young_female_precise',
      backstory: 'Brilliant tactical analyst who rose fast through the ranks. Excels at multitasking under pressure. Covers for Vasquez during split-second decisions. Cool and efficient.',
      personality: [0.60, 0.80, 0.50, 0.60, 0.25], // O, C, E, A, N
      shipClass: null,
      squadronId: 'CMD-01',
      combatRating: null,
      weaponLoadout: [],
      flightHours: 0,
      killCount: 0,
      damageThreshold: null,
      preferredTactic: 'support',
      formationPosition: null,
      adrenalineSpike: 0.10,
      fatigueResistance: 0.80,
      moraleFloor: 0.20,
      disposition: 0.55,
      faction: 'allied',
    },
    park: {
      id: 'ANPC-SF-0005',
      displayName: 'Ens. Ji-Yeon Park',
      callsign: 'Scope',
      role: 'SF-CMDOP',
      voiceProfile: 'young_female_alert',
      backstory: 'Youngest sensor operator on the Resolute. Exceptional pattern recognition and spatial awareness. Gets excited when she spots something first. Eager to prove herself.',
      personality: [0.70, 0.65, 0.60, 0.65, 0.40], // O, C, E, A, N
      shipClass: null,
      squadronId: 'CMD-01',
      combatRating: null,
      weaponLoadout: [],
      flightHours: 0,
      killCount: 0,
      damageThreshold: null,
      preferredTactic: 'support',
      formationPosition: null,
      adrenalineSpike: 0.20,
      fatigueResistance: 0.55,
      moraleFloor: 0.25,
      disposition: 0.60,
      faction: 'allied',
    },
  };

  // ── Initialize default characters ──
  function initCharacters() {
    for (const key in CHARACTER_SCHEMAS) {
      register(CHARACTER_SCHEMAS[key]);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // §13 — PUBLIC API
  // ══════════════════════════════════════════════════════════════════

  return {
    // Constants
    COMBAT_STATES,
    CHANNELS,
    ROE,
    DIFFICULTY,

    // Registry
    register,
    get,
    getByCallsign,
    getByRole,
    getAllied,
    getEnemies,
    getAll,
    initCharacters,

    // Core systems
    update,
    speak,
    forceSpeak,
    applyEvent,
    getScenario,
    resetScenario,
    resetAll,

    // Manifold
    manifoldLinear,
    manifoldAsymmetric,
    computeManifoldXY,
    computeToneVector,
    computeUrgency,

    // Morale & Disposition
    propagateMorale,
    shiftDisposition,
    MORALE_MODIFIERS,

    // Phrase system
    selectPhrase,
    assemblePhrase,

    // Difficulty
    setDifficulty,
    getDifficultyScale,

    // Compliance
    computeCompliance,

    // Character schemas (for external reference)
    CHARACTER_SCHEMAS,
  };

})();

window.SFANPC = SFANPC;
