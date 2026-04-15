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
    patrol: [0.2, 0.3, 0.5, 0.2, 0.1],
    escort: [0.4, 0.2, 0.3, 0.6, 0.3],
    assault: [0.7, 0.6, 0.2, 0.4, 0.5],
    defense: [0.6, 0.2, 0.3, 0.7, 0.7],
    recon: [0.3, 0.5, 0.7, 0.1, 0.2],
    boss: [0.9, 0.4, 0.1, 0.5, 0.8],
  };

  // Dynamic event modifiers: [dT, dO, dA, dS, dTP]
  const EVENT_MODIFIERS = {
    new_contacts: [+0.1, 0, +0.2, 0, 0],
    contacts_hostile: [+0.3, 0, -0.2, +0.1, +0.2],
    ambush_detected: [+0.4, 0, -0.3, +0.1, +0.3],
    ally_destroyed: [+0.2, -0.1, 0, +0.2, +0.1],
    enemy_destroyed: [-0.1, +0.2, -0.1, 0, -0.05],
    hull_critical: [+0.1, -0.2, 0, +0.1, +0.3],
    base_critical: [+0.3, -0.1, 0, +0.4, +0.4],
    reinforcements: [-0.2, +0.3, -0.1, -0.1, -0.1],
    boss_spawn: [+0.4, +0.2, -0.2, +0.2, +0.3],
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
    const p = anpc.personality;
    if (!p) return { x: 0.5, y: 0.5 };
    const baseAggression = 1.0 - p.A;
    const extraversionBoost = (p.E - 0.5) * 0.2;
    const conscientiousnessControl = (p.C - 0.5) * -0.15;
    let x = baseAggression + extraversionBoost + conscientiousnessControl;

    // y derives from scenario: weighted combination of vector components
    // Threat and TimePressure drive urgency; Opportunity opens action space
    if (!scenario) return { x: Math.max(0, Math.min(1, x)), y: 0.5 };
    let y = (scenario.threat || 0) * 0.4 + (scenario.opportunity || 0) * 0.3 +
      (scenario.timePressure || 0) * 0.2 + (scenario.socialPressure || 0) * 0.1;

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
    kill_scored: +0.10,
    ally_kill: +0.05,
    ally_destroyed: -0.15,
    taking_fire: -0.02, // per second
    heavy_damage: -0.10,
    outnumbered: -0.05, // per second when outnumbered
    reinforcements: +0.15,
    leader_down: -0.25,
    player_saves: +0.15,
    order_received: +0.05,
    victory: +0.20,
  };

  // Contagion factor: how much one ANPC's morale affects nearby allies
  const MORALE_CONTAGION = 0.3;

  // ══════════════════════════════════════════════════════════════════
  // §6 — TONE VECTOR SYSTEM
  // ══════════════════════════════════════════════════════════════════

  /**
   * Tone vector: [Formality, Warmth, Humor, Aggression]
   * Derived from OCEAN personality × manifold surfaces.
   * z_linear modulates warmth/formality (proportional response).
   * z_asymmetric modulates aggression/humor (escalation response).
   * Personality sets the base; manifold amplifies or dampens.
   */
  function computeToneVector(anpc) {
    const p = anpc.personality;
    if (!p) return { formality: 0.5, warmth: 0.5, humor: 0.3, aggression: 0.3 };
    const moraleNorm = anpc.morale || 0.5;
    const m = anpc.getManifoldValues(_scenario);

    // Formality: high C + low E → formal; dampened by z_linear (high intensity → less formal)
    const formality = Math.max(0, Math.min(1,
      (p.C * 0.6 + (1 - p.E) * 0.4) * (1 - m.linear * 0.3)));

    // Warmth: high A + high E → warm; amplified by low z_asymmetric (calm = warmer)
    const warmth = Math.max(0, Math.min(1,
      (p.A * 0.5 + p.E * 0.3 + moraleNorm * 0.2) * (1 - m.asymmetric * 0.4)));

    // Humor: high O + high E + high morale; suppressed by z_asymmetric (escalation kills humor)
    const humor = Math.max(0, Math.min(1,
      (p.O * 0.3 + p.E * 0.3 + moraleNorm * 0.3) * (1 - m.asymmetric * 0.6)));

    // Aggression: low A + manifold escalation; z_asymmetric directly amplifies aggression
    const aggression = Math.max(0, Math.min(1,
      (1 - p.A) * 0.4 + m.asymmetric * 0.4 + (1 - moraleNorm) * 0.2));

    return { formality, warmth, humor, aggression };
  }

  /**
   * Compute urgency via manifold z-surfaces.
   * z_linear (z=xy) = proportional response intensity
   * z_asymmetric (z=xy²) = escalation/panic intensity
   * Urgency = weighted blend of both surfaces + combat state offset.
   *
   * This is THE core manifold decision: personality × scenario → intensity.
   */
  function computeUrgency(anpc, scenario) {
    const m = anpc.getManifoldValues(scenario);

    // Blend: 60% linear (proportional) + 40% asymmetric (escalation)
    let urgency = m.linear * 0.6 + m.asymmetric * 0.4;

    // Combat state adds manifold-weighted offset (not raw addition)
    // Higher z amplifies the state contribution — manifold modulates everything
    const stateWeight = {
      [COMBAT_STATES.PATROL]: 0,
      [COMBAT_STATES.ALERT]: 0.08,
      [COMBAT_STATES.ENGAGED]: 0.15,
      [COMBAT_STATES.EVASIVE]: 0.25,
      [COMBAT_STATES.DAMAGED]: 0.30,
      [COMBAT_STATES.RETREATING]: 0.20,
      [COMBAT_STATES.DISABLED]: 0.40,
      [COMBAT_STATES.DESTROYED]: 0,
    };
    urgency += (stateWeight[anpc.combatState] || 0) * (1 + m.asymmetric);

    // Hull crisis amplified by asymmetric surface (z=xy² → panic escalation)
    if (anpc.hull < 0.25) urgency += 0.15 * (1 + m.asymmetric);
    else if (anpc.hull < 0.5) urgency += 0.08 * (1 + m.linear);

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
    launch_prep: [
      { id: 'UNI-LP-001', template: 'All boards green. Wave {wave} standing by.', urgMin: 0.0, urgMax: 0.4 },
      { id: 'UNI-LP-002', template: 'Pre-flight complete. Ready to launch.', urgMin: 0.0, urgMax: 0.3 },
      { id: 'UNI-LP-003', template: 'Launch checklist nominal. {callsign}, you are go.', urgMin: 0.0, urgMax: 0.4 },
    ],
    hazard_warning: [
      { id: 'UNI-HW-001', template: '{callsign}, {hazard}! Evasive action!', urgMin: 0.6, urgMax: 1.0 },
      { id: 'UNI-HW-002', template: '{hazard}. Take action immediately.', urgMin: 0.5, urgMax: 0.9 },
      { id: 'UNI-HW-003', template: 'Warning — {hazard}!', urgMin: 0.7, urgMax: 1.0 },
    ],
    status_update: [
      { id: 'UNI-SU-001', template: '{callsign}, {status}. Standing by.', urgMin: 0.0, urgMax: 0.4 },
      { id: 'UNI-SU-002', template: '{status}. All stations nominal.', urgMin: 0.0, urgMax: 0.3 },
      { id: 'UNI-SU-003', template: 'Confirmed. {status}.', urgMin: 0.0, urgMax: 0.5 },
    ],
    support_ops: [
      { id: 'UNI-SO-001', template: '{supportShip} dispatched. {status}.', urgMin: 0.2, urgMax: 0.6 },
      { id: 'UNI-SO-002', template: 'Support authorized. {supportShip} en route.', urgMin: 0.2, urgMax: 0.5 },
      { id: 'UNI-SO-003', template: '{supportShip} returning to station. {status}.', urgMin: 0.1, urgMax: 0.4 },
      { id: 'UNI-SO-004', template: '{callsign}, {supportShip} request denied. Conditions not met.', urgMin: 0.3, urgMax: 0.6 },
    ],
    sector_clear: [
      { id: 'UNI-SC-001', template: 'Sector clear. {kills} kills. Return to base.', urgMin: 0.0, urgMax: 0.3 },
      { id: 'UNI-SC-002', template: 'All hostiles neutralized. Well done.', urgMin: 0.0, urgMax: 0.3 },
      { id: 'UNI-SC-003', template: 'Wave {wave} complete. {kills} confirmed kills. Rearming.', urgMin: 0.0, urgMax: 0.3 },
    ],
    launch_go: [
      { id: 'UNI-LG-001', template: 'Launch! Launch! Launch!', urgMin: 0.3, urgMax: 0.7 },
      { id: 'UNI-LG-002', template: 'All ahead — punch it!', urgMin: 0.3, urgMax: 0.7 },
      { id: 'UNI-LG-003', template: 'Clear the rail — full military!', urgMin: 0.3, urgMax: 0.7 },
    ],
    launch_sendoff: [
      { id: 'UNI-LS-001', template: 'Good hunting.', urgMin: 0.0, urgMax: 0.3 },
      { id: 'UNI-LS-002', template: 'Bring them home.', urgMin: 0.0, urgMax: 0.3 },
      { id: 'UNI-LS-003', template: 'The Resolute is counting on you.', urgMin: 0.0, urgMax: 0.3 },
    ],
    threat_brief: [
      { id: 'UNI-TB-001', template: 'Threat assessment: {threats}. {watchPhrase}.', urgMin: 0.2, urgMax: 0.6 },
      { id: 'UNI-TB-002', template: 'Scope shows {threats}. Stay sharp.', urgMin: 0.2, urgMax: 0.5 },
      { id: 'UNI-TB-003', template: 'Intel reports {threats} in sector.', urgMin: 0.2, urgMax: 0.6 },
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
      launch_prep: [
        { id: 'SF-CO-LP-001', template: 'Pilot {pilotSlot} of {maxLives}, wave {wave}. {missionBrief}', urgMin: 0.0, urgMax: 0.4 },
        { id: 'SF-CO-LP-002', template: 'Wave {wave}. {missionBrief} {callsign}, you are cleared hot.', urgMin: 0.1, urgMax: 0.5 },
      ],
      launch_go: [
        { id: 'SF-CO-LG-001', template: 'Launch! Launch! Launch!', urgMin: 0.3, urgMax: 0.7 },
        { id: 'SF-CO-LG-002', template: 'All ahead — punch it!', urgMin: 0.3, urgMax: 0.7 },
        { id: 'SF-CO-LG-003', template: 'Catapult engaged — godspeed!', urgMin: 0.3, urgMax: 0.7 },
      ],
      launch_sendoff: [
        { id: 'SF-CO-LS-001', template: 'Good hunting, {callsign}.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'SF-CO-LS-002', template: 'Bring them home.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'SF-CO-LS-003', template: 'The Resolute is counting on you.', urgMin: 0.0, urgMax: 0.3 },
      ],
      sector_clear: [
        { id: 'SF-CO-SC-001', template: 'Wave {wave} complete. {kills} confirmed. Outstanding work.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'SF-CO-SC-002', template: 'All contacts neutralized. {kills} kills. Return to base.', urgMin: 0.0, urgMax: 0.3 },
      ],
      hazard_warning: [
        { id: 'SF-CO-HW-001', template: '{callsign}, {hazard}! All hands brace!', urgMin: 0.7, urgMax: 1.0 },
        { id: 'SF-CO-HW-002', template: 'CIC — {hazard}! {callsign}, take evasive action!', urgMin: 0.7, urgMax: 1.0 },
      ],
      support_ops: [
        { id: 'SF-CO-SO-001', template: '{supportShip} dispatched. {status}. Engaging autopilot.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'SF-CO-SO-002', template: '{callsign}, support request denied. {reason}. Keep fighting.', urgMin: 0.3, urgMax: 0.6 },
        { id: 'SF-CO-SO-003', template: 'Support complete. Controls released. Good hunting.', urgMin: 0.1, urgMax: 0.4 },
      ],
      status_update: [
        { id: 'SF-CO-SU-001', template: '{callsign}, {status}. Standing by for orders.', urgMin: 0.0, urgMax: 0.4 },
        { id: 'SF-CO-SU-002', template: 'Dock confirmed. {status}. Score {score}.', urgMin: 0.0, urgMax: 0.3 },
      ],
      threat_brief: [
        { id: 'SF-CO-TB-001', template: 'Threat intel: {threats}. {tacticalAdvice}. Stay sharp.', urgMin: 0.2, urgMax: 0.6 },
        { id: 'SF-CO-TB-002', template: 'Scope shows {threats}. Recommend {tacticalAdvice}.', urgMin: 0.2, urgMax: 0.5 },
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
      launch_prep: [
        { id: 'LH-LP-001', template: '{callsign}, all systems green. Launching wave {wave}. Lighthouse standing by.', urgMin: 0.0, urgMax: 0.4 },
        { id: 'LH-LP-002', template: 'Catapult charged. {callsign}, you are cleared for launch.', urgMin: 0.0, urgMax: 0.3 },
      ],
      status_update: [
        { id: 'LH-SU-001', template: '{callsign}, {status}. Lighthouse monitors all bands. You\'re in good hands.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'LH-SU-002', template: 'Docking confirmed. {status}. Welcome home, {callsign}.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'LH-SU-003', template: 'Decontamination complete. {status}. All clear.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'LH-SU-004', template: 'Wave {wave} standing by. {status}. Launch when ready, {callsign}.', urgMin: 0.0, urgMax: 0.3 },
      ],
      support_ops: [
        { id: 'LH-SO-001', template: '{supportShip} dispatched. {status}. Autopilot engaged.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'LH-SO-002', template: '{callsign}, {supportShip} request denied. {reason}. Keep fighting, you\'re doing well.', urgMin: 0.3, urgMax: 0.5 },
        { id: 'LH-SO-003', template: 'Support complete. Controls released. Good hunting, {callsign}.', urgMin: 0.1, urgMax: 0.3 },
      ],
      hazard_warning: [
        { id: 'LH-HW-001', template: '{callsign}, {hazard}! Lighthouse concurs — break off immediately!', urgMin: 0.7, urgMax: 1.0 },
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
    low: ['', '', ''],  // low urgency: often no opener
    mid: ['{callsign}, ', 'Heads up — ', 'Be advised — ', ''],
    high: ['{callsign}! ', 'Warning! ', '', 'Break! '],
    crit: ['MAYDAY — ', '{callsign}! ', ''],
  };

  // Modifiers by tone
  const MODIFIERS = {
    formal: [' Over.', ' Acknowledge.', ' Copy?', ''],
    warm: [' Stay safe.', ' We\'ve got you.', ' You\'re doing great.', ''],
    humor: [' Easy money.', ' Almost too easy.', ''],
    aggro: [' No mercy.', ' Make them pay.', ' End them.', ''],
    neutral: ['', '', ''],
  };

  /**
   * Assemble a composite string from phrase template + context.
   * Structure: [Opener] + Core + [Modifier]
   * All selection driven by manifold z-surfaces:
   *   - Opener intensity: z_asymmetric (escalation surface)
   *   - Modifier tone: z_linear (proportional surface) × personality tone vector
   */
  function assemblePhrase(phrase, context, anpc, urgency) {
    // Get manifold values for this ANPC
    let zLinear = urgency, zAsymmetric = urgency;
    if (anpc) {
      const m = anpc.getManifoldValues(_scenario);
      zLinear = m.linear;
      zAsymmetric = m.asymmetric;
    }

    // Opener: driven by z_asymmetric (escalation surface = panic/urgency)
    let opener = '';
    if (zAsymmetric >= 0.6 || urgency >= 0.8) opener = _pick(OPENERS.crit);
    else if (zAsymmetric >= 0.35 || urgency >= 0.5) opener = _pick(OPENERS.high);
    else if (zAsymmetric >= 0.15 || urgency >= 0.25) opener = _pick(OPENERS.mid);
    else opener = _pick(OPENERS.low);

    // Core: fill template variables
    let core = phrase.template;
    core = _fillTemplate(core, context);

    // Modifier: driven by z_linear (proportional surface) × tone vector
    // Higher z_linear intensifies the dominant tone axis
    let modifier = '';
    if (anpc) {
      const tone = computeToneVector(anpc) || { formality: 0.5, warmth: 0.5, humor: 0.3, aggression: 0.3 };
      // Scale tone axes by z_linear — manifold modulates which tone dominates
      const scaledHumor = tone.humor * (1 + zLinear);
      const scaledWarmth = tone.warmth * (1 + zLinear * 0.5);
      const scaledAggro = tone.aggression * (1 + zLinear);
      const scaledFormal = tone.formality * (1 + zLinear * 0.3);

      // Only add modifier when z_asymmetric is low (not in escalation)
      if (zAsymmetric < 0.4) {
        if (scaledHumor > 0.8) modifier = _pick(MODIFIERS.humor);
        else if (scaledWarmth > 0.7) modifier = _pick(MODIFIERS.warm);
        else if (scaledAggro > 0.8) modifier = _pick(MODIFIERS.aggro);
        else if (scaledFormal > 0.7) modifier = _pick(MODIFIERS.formal);
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

      // Wingman / manifold-extension fields
      this.wingmanEligible = schema.wingmanEligible || false;
      this.genderLabel = schema.genderLabel || null;
      this.nationalityLabel = schema.nationalityLabel || null;
      this.rankLabel = schema.rankLabel || null;
      this.primarySkill = schema.primarySkill || null;
      this.motivationLabel = schema.motivationLabel || null;
      this.backstoryMotif = schema.backstoryMotif || null;
      this.pronouns = schema.pronouns || null;
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

    // ── Communication frequency (manifold-driven) ──
    // Doc #2 §6.3: comm frequency driven by manifold z, not raw thresholds
    canSpeak(now, urgency, scenario) {
      if (!this.active) return false;
      // Use manifold linear surface to modulate comm interval
      // High z = high personality×scenario product = more talkative
      const m = scenario ? this.getManifoldValues(scenario) : null;
      const zLinear = m ? m.linear : urgency; // fallback to urgency if no scenario
      // Extraversion directly modulates: high-E characters speak more often
      const extraversionMod = 1.0 - (this.personality.E - 0.5) * 0.4;
      // Base interval: inverse of z_linear. z=0 → 18s, z=1 → 1.5s
      const minInterval = Math.max(1.5, (1 - zLinear) * 18) * extraversionMod;
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
   *
   * Filtering uses BOTH manifold surfaces:
   *   - z_linear gates phrase eligibility (urgency range matching)
   *   - z_asymmetric biases toward escalated phrases when escalation is high
   * This ensures personality × scenario → which phrases are reachable.
   */
  function selectPhrase(anpc, category, urgency) {
    // Manifold z-values for escalation bias
    const m = anpc.getManifoldValues(_scenario);
    const zEsc = m.asymmetric; // escalation surface

    // Tier 1: Character Pool
    const charPool = CHARACTER_POOLS[anpc.callsign];
    if (charPool && charPool[category]) {
      const match = _filterByManifold(charPool[category], urgency, zEsc, anpc.lastPhraseIds);
      if (match) return match;
    }

    // Tier 2: Title Pool (role-specific)
    const titlePool = TITLE_POOLS[anpc.role];
    if (titlePool && titlePool[category]) {
      const match = _filterByManifold(titlePool[category], urgency, zEsc, anpc.lastPhraseIds);
      if (match) return match;
    }

    // Tier 3: Universal Pool
    if (UNIVERSAL_POOL[category]) {
      const match = _filterByManifold(UNIVERSAL_POOL[category], urgency, zEsc, anpc.lastPhraseIds);
      if (match) return match;
    }

    return null;
  }

  /**
   * Filter phrases using manifold-derived values.
   * z_escalation biases selection toward higher-urgMax phrases
   * when the asymmetric surface is elevated — personality-driven escalation.
   */
  function _filterByManifold(phrases, urgency, zEscalation, recentIds) {
    // Primary: filter by urgency range, exclude recent
    const eligible = phrases.filter(p =>
      urgency >= p.urgMin && urgency <= p.urgMax &&
      !recentIds.includes(p.id)
    );

    if (eligible.length > 0) {
      // When escalation surface is high, bias toward higher-urgMax phrases
      // This makes aggressive personalities reach for more intense lines
      if (zEscalation > 0.3 && eligible.length > 1) {
        // Weight by proximity to urgMax × escalation
        const weighted = eligible.map(p => ({
          phrase: p,
          weight: 1 + (p.urgMax * zEscalation * 2),
        }));
        const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
        let roll = Math.random() * totalWeight;
        for (const w of weighted) {
          roll -= w.weight;
          if (roll <= 0) return w.phrase;
        }
        return weighted[weighted.length - 1].phrase;
      }
      return _pick(eligible);
    }

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
    player_saves: +0.15,
    cooperative_kill: +0.04,
    survived_together: +0.03,
    player_ignores_danger: -0.08,
    friendly_fire: -0.20,
    follows_order: +0.05,
    ignores_order: -0.10,
    reckless_play: -0.05,
    impressive_kill: +0.06,
  };

  function shiftDisposition(anpcId, reason) {
    const anpc = _registry.get(anpcId);
    if (!anpc) return;
    const delta = DISPOSITION_DELTAS[reason] || 0;
    anpc.disposition = Math.max(-1, Math.min(1, anpc.disposition + delta));
  }

  // ── Generate a line of dialog from an ANPC ──
  // Full manifold pipeline: personality × scenario → z-surfaces → urgency →
  // phrase selection (z-weighted) → composite assembly (z-modulated tone)
  function speak(anpcId, category, context) {
    const anpc = _registry.get(anpcId);
    if (!anpc || !anpc.active) return null;

    // Step 1: Manifold-derived urgency (z=xy + z=xy² blend)
    const urgency = computeUrgency(anpc, _scenario);

    // Step 2: Manifold-driven communication frequency check
    if (!anpc.canSpeak(_gameTime, urgency, _scenario)) return null;

    // Step 3: Manifold-weighted phrase selection (z_asymmetric biases intensity)
    const phrase = selectPhrase(anpc, category, urgency);
    if (!phrase) return null;

    // Step 4: Manifold-modulated composite assembly (z-surfaces drive opener/modifier)
    const assembled = assemblePhrase(phrase, context || {}, anpc, urgency);

    // Step 5: Record and return
    anpc.markSpoke(_gameTime, phrase.id);
    const m = anpc.getManifoldValues(_scenario);

    return {
      sender: anpc.callsign || anpc.displayName,
      text: assembled,
      channel: anpc.faction === 'enemy' ? CHANNELS.ENEMY : CHANNELS.SQUADRON,
      urgency,
      zLinear: m.linear,
      zAsymmetric: m.asymmetric,
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
    const m = anpc.getManifoldValues(_scenario);

    return {
      sender: anpc.callsign || anpc.displayName,
      text: assembled,
      channel: anpc.faction === 'enemy' ? CHANNELS.ENEMY : CHANNELS.SQUADRON,
      urgency,
      zLinear: m.linear,
      zAsymmetric: m.asymmetric,
      anpcId: anpc.id,
    };
  }

  // ── Difficulty scaling ──
  const DIFFICULTY_SCALES = {
    allied: {
      easy: { accuracy: 0.70, reaction: 0.3, evasion: 0.70, moraleSens: 0.7, damageThreshold: 0.25, aggrMult: 1.2, commFreq: 1.3 },
      normal: { accuracy: 0.60, reaction: 0.5, evasion: 0.50, moraleSens: 1.0, damageThreshold: 0.35, aggrMult: 1.0, commFreq: 1.0 },
      hard: { accuracy: 0.50, reaction: 0.7, evasion: 0.35, moraleSens: 1.3, damageThreshold: 0.45, aggrMult: 0.8, commFreq: 0.8 },
      veteran: { accuracy: 0.40, reaction: 1.0, evasion: 0.25, moraleSens: 1.6, damageThreshold: 0.55, aggrMult: 0.7, commFreq: 0.6 },
    },
    enemy: {
      easy: { accuracy: 0.30, reaction: 1.2, evasion: 0.20, moraleSens: 1.5, aggrMult: 0.7, formTight: 0.3 },
      normal: { accuracy: 0.50, reaction: 0.7, evasion: 0.40, moraleSens: 1.0, aggrMult: 1.0, formTight: 0.5 },
      hard: { accuracy: 0.70, reaction: 0.4, evasion: 0.60, moraleSens: 0.7, aggrMult: 1.3, formTight: 0.7 },
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
      // Wingman / manifold-extension metadata
      wingmanEligible: true,
      genderLabel: 'male',
      nationalityLabel: 'American',
      rankLabel: 'Lieutenant',
      primarySkill: 'dogfighter',
      motivationLabel: 'glory',
      backstoryMotif: 'proving worth',
      pronouns: { subj: 'he', obj: 'him', pos: 'his' },
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
      // Wingman / manifold-extension metadata
      wingmanEligible: true,
      genderLabel: 'male',
      nationalityLabel: 'Russian',
      rankLabel: 'Lieutenant',
      primarySkill: 'marksman',
      motivationLabel: 'duty',
      backstoryMotif: 'duty above all',
      pronouns: { subj: 'he', obj: 'him', pos: 'his' },
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
      // Wingman / manifold-extension metadata
      wingmanEligible: false,
      genderLabel: 'female',
      nationalityLabel: 'Nigerian',
      rankLabel: 'Commander',
      primarySkill: 'analyst',
      motivationLabel: 'protection',
      backstoryMotif: 'following a calling',
      pronouns: { subj: 'she', obj: 'her', pos: 'her' },
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
      // Wingman / manifold-extension metadata
      wingmanEligible: false,
      genderLabel: 'female',
      nationalityLabel: 'Mexican',
      rankLabel: 'Commander',
      primarySkill: 'commander',
      motivationLabel: 'duty',
      backstoryMotif: 'duty above all',
      pronouns: { subj: 'she', obj: 'her', pos: 'her' },
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
      // Wingman / manifold-extension metadata
      wingmanEligible: false,
      genderLabel: 'male',
      nationalityLabel: 'Unknown',
      rankLabel: 'Ace Pilot',
      primarySkill: 'ghost',
      motivationLabel: 'obsession',
      backstoryMotif: 'running from past',
      pronouns: { subj: 'he', obj: 'him', pos: 'his' },
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
      // Wingman / manifold-extension metadata
      wingmanEligible: false,
      genderLabel: 'female',
      nationalityLabel: 'Japanese',
      rankLabel: 'Lt. Commander',
      primarySkill: 'tactician',
      motivationLabel: 'duty',
      backstoryMotif: 'chosen by fate',
      pronouns: { subj: 'she', obj: 'her', pos: 'her' },
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
      // Wingman / manifold-extension metadata
      wingmanEligible: false,
      genderLabel: 'female',
      nationalityLabel: 'Korean',
      rankLabel: 'Ensign',
      primarySkill: 'scout',
      motivationLabel: 'curiosity',
      backstoryMotif: 'proving worth',
      pronouns: { subj: 'she', obj: 'her', pos: 'her' },
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
