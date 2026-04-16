/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANPC PATTERN LIBRARY — Starfighter Dialog Manifold
 * ═══════════════════════════════════════════════════════════════════════════
 * Lexical pools and structural patterns for procedural dialog generation.
 * Implements the NPC Dialog Rubric specification.
 *
 * Core principle: NO FIXED LINES — only patterns + pools that recombine.
 *
 * Architecture:
 *   1. Lexical Pools (POS-aware: nouns, verbs, adjectives, interjections)
 *   2. Pattern Graphs (structural templates with slot types)
 *   3. Selection Functions (filtered by role, tone, severity, personality)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SFPatterns = (function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // § 1. LEXICAL POOLS — Organized by Part-of-Speech and Semantic Function
  // ═══════════════════════════════════════════════════════════════════════════

  const CALLSIGNS = {
    player: ['Viper', 'Ghost', 'Talon', 'Reaper', 'Halo', 'Raven', 'Nomad', 'Specter'],
    wingman: ['Echo', 'Frost', 'Blade', 'Phoenix', 'Dagger', 'Razor', 'Striker', 'Condor'],
    command: ['Overlord', 'Watchtower', 'Skyfather', 'Iron Crown', 'Command', 'Tower'],
    boss: ['Black King', 'Widow', 'Tempest', 'Warlord', 'Seraph', 'Nightmare', 'Apex']
  };

  const NOUNS = {
    // Tactical entities
    threats: ['bandit', 'bogey', 'hostile', 'contact', 'target', 'enemy', 'threat'],
    threats_plural: ['bandits', 'bogeys', 'hostiles', 'contacts', 'targets', 'enemies', 'threats'],
    missiles: ['missile', 'missile lock', 'inbound', 'fox-three', 'seeker', 'rocket'],
    missiles_plural: ['missiles', 'inbounds', 'seekers', 'rockets', 'ordnance'],
    radar: ['radar', 'scope', 'screen', 'returns', 'picture', 'signature'],

    // Ship status
    fuel: ['fuel', 'gas', 'reserves', 'bingo state', 'tanks'],
    damage: ['damage', 'casualties', 'systems', 'hydraulics', 'avionics', 'engine'],
    shields: ['shields', 'deflectors', 'barrier', 'screen', 'protection'],
    hull: ['hull', 'armor', 'plating', 'structure', 'integrity'],

    // Tactical concepts
    formation: ['formation', 'element', 'flight', 'package', 'section', 'division'],
    vector: ['vector', 'heading', 'bearing', 'course', 'track', 'approach'],
    waypoint: ['waypoint', 'nav point', 'checkpoint', 'rally point', 'marker'],

    // Mission objectives
    objectives: ['objective', 'target', 'package', 'primary', 'mission goal'],
    targets: ['target', 'objective point', 'hot zone', 'strike area', 'attack point'],

    // Narrative elements
    artifacts: ['artifact', 'prototype', 'warhead', 'data core', 'relay', 'device'],
    structures: ['gate', 'fortress', 'flagship', 'citadel', 'installation', 'facility'],

    // Locations
    zones: ['zone', 'area', 'sector', 'quadrant', 'region', 'space'],
    positions: ['position', 'location', 'coordinates', 'grid', 'point', 'station']
  };

  const VERBS = {
    // Orders (imperative)
    engage: ['engage', 'commit on', 'prosecute', 'push on', 'attack', 'strike'],
    cover: ['cover', 'defend', 'protect', 'screen', 'shield', 'guard'],
    break: ['break', 'evade', 'jink', 'defensive', 'get clear', 'maneuver'],
    hold: ['hold', 'maintain', 'stay on', 'keep', 'anchor', 'secure'],
    divert: ['divert', 'redirect', 'reorient', 'shift to', 'retask'],
    abort: ['abort', 'disengage', 'break off', 'pull out', 'RTB', 'bug out'],
    regroup: ['regroup', 'reform', 'rally', 'consolidate', 'collect'],

    // Status (active/continuous)
    taking: ['taking', 'receiving', 'under', 'absorbing', 'sustaining'],
    losing: ['losing', 'bleeding', 'dropping', 'declining', 'failing'],
    tracking: ['tracking', 'painting', 'locking', 'acquiring', 'marking'],
    evading: ['evading', 'maneuvering', 'jinking', 'defensive', 'breaking'],

    // Mission verbs
    secure: ['secure', 'capture', 'take', 'control', 'seize'],
    extract: ['extract', 'retrieve', 'recover', 'pull out', 'evacuate'],
    neutralize: ['neutralize', 'eliminate', 'destroy', 'take out', 'kill'],
    intercept: ['intercept', 'cut off', 'block', 'head off', 'stop'],

    // Observation verbs
    detect: ['detect', 'spot', 'identify', 'confirm', 'acquire', 'pick up'],
    lose: ['lose', 'lost contact with', 'can\'t see', 'negative contact'],
    visual: ['have visual', 'tally', 'eyes on', 'see', 'confirm visual']
  };

  const ADJECTIVES = {
    // Intensity/density
    intensity: ['heavy', 'light', 'moderate', 'intense', 'thick', 'sparse'],
    heat: ['hot', 'warm', 'cold', 'active', 'quiet', 'clean', 'dirty'],
    saturation: ['saturated', 'clear', 'dense', 'empty', 'crowded'],

    // Quality/status
    quality: ['hostile', 'friendly', 'unknown', 'neutral', 'allied'],
    priority: ['priority', 'secondary', 'critical', 'urgent', 'routine'],
    condition: ['damaged', 'intact', 'compromised', 'stable', 'unstable'],

    // Tactical descriptors
    range: ['close', 'near', 'far', 'distant', 'immediate', 'short-range', 'long-range'],
    speed: ['fast', 'slow', 'high-speed', 'rapid', 'quick', 'sluggish'],
    size: ['large', 'small', 'massive', 'tiny', 'big', 'little']
  };

  const ADVERBS = {
    // Manner
    manner: ['aggressively', 'carefully', 'quickly', 'slowly', 'smoothly', 'hard'],
    urgency: ['now', 'immediately', 'ASAP', 'at once', 'urgently', 'stat'],
    quality: ['clean', 'tight', 'wide', 'high', 'low', 'close'],

    // Spatial
    direction: ['ahead', 'behind', 'above', 'below', 'port', 'starboard', 'forward', 'aft'],

    // Certainty
    certainty: ['definitely', 'probably', 'maybe', 'possibly', 'certainly', 'likely']
  };

  const INTERJECTIONS = {
    // Acknowledgments
    ack: ['Copy', 'Roger', 'Wilco', 'Affirm', 'Affirmative', 'Acknowledged', 'Understood'],
    neg: ['Negative', 'No joy', 'Unable', 'Can\'t comply', 'Negative contact'],

    // Alerts
    alerts: ['Check six', 'Break break', 'Heads up', 'Watch it', 'Incoming'],

    // Combat calls
    weapons: ['Fox One', 'Fox Two', 'Fox Three', 'Rifle', 'Guns guns guns', 'Firing'],
    hits: ['Splash', 'Kill', 'Got him', 'Confirmed', 'Target destroyed'],

    // Status
    status: ['Winchester', 'Bingo', 'Joker', 'Feet wet', 'Feet dry', 'On station'],

    // Requests
    requests: ['Say again', 'Stand by', 'Repeat', 'Clarify', 'Confirm']
  };

  const CONDITION_CLAUSES = {
    fuel: ['if you\'re Winchester', 'when you hit bingo', 'when fuel gets critical', 'if tanks run dry'],
    threat: ['if you\'re spiked', 'when missiles launch', 'if they lock on', 'when threat level spikes'],
    mission: ['once the package is off target', 'when objectives complete', 'after strike confirmed', 'when mission accomplished'],
    boss: ['when the boss shows', 'if their leader engages', 'when capital arrives', 'if the big one appears'],
    formation: ['unless formation breaks', 'if we lose cohesion', 'when element splits', 'if wingman goes down'],
    damage: ['if shields fail', 'when hull breaches', 'if systems go red', 'when integrity drops']
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // § 2. PATTERN GRAPHS — Structural Templates with Slot Types
  // ═══════════════════════════════════════════════════════════════════════════

  const PATTERNS = {
    // ── Order patterns (lead → wing) ──
    ORDER_ENGAGE: [
      '[CALLSIGN_DST], [VERB_ENGAGE] [NOUN_THREATS] [ADVERB_URGENCY]',
      '[CALLSIGN_SRC] to [CALLSIGN_DST]: [VERB_ENGAGE] [ADJECTIVE_PRIORITY] [NOUN_THREATS]',
      '[VERB_ENGAGE] [ADJECTIVE_RANGE] [NOUN_THREATS], [CALLSIGN_DST] — [ADVERB_URGENCY]',
      '[CALLSIGN_DST], you are cleared [VERB_ENGAGE] [NOUN_THREATS] [ADVERB_MANNER]',
      '[VERB_ENGAGE] those [NOUN_THREATS] [ADVERB_MANNER], [CALLSIGN_DST]'
    ],

    ORDER_COVER: [
      '[CALLSIGN_DST], [VERB_COVER] [NOUN_OBJECTIVES]',
      '[CALLSIGN_SRC] to [CALLSIGN_DST]: [VERB_COVER] [ADJECTIVE_PRIORITY] [NOUN_OBJECTIVES] [ADVERB_URGENCY]',
      '[VERB_COVER] the [NOUN_OBJECTIVES], [CALLSIGN_DST] — don\'t let them through',
      '[CALLSIGN_DST], stay on [NOUN_OBJECTIVES] — [VERB_COVER] at all costs'
    ],

    ORDER_BREAK: [
      '[CALLSIGN_DST], [VERB_BREAK] [ADVERB_URGENCY]!',
      '[INTERJECTION_ALERT]! [CALLSIGN_DST], [VERB_BREAK]!',
      '[VERB_BREAK] [ADVERB_DIRECTION], [CALLSIGN_DST] — [NOUN_MISSILES_PLURAL] inbound!',
      '[CALLSIGN_DST], defensive maneuvers — [VERB_BREAK] [ADVERB_MANNER]!'
    ],

    ORDER_REGROUP: [
      '[CALLSIGN_DST], [VERB_REGROUP] on me',
      'All [NOUN_FORMATION], [VERB_REGROUP] at [NOUN_WAYPOINT]',
      '[VERB_REGROUP] [ADVERB_MANNER], [CALLSIGN_DST] — re-establish [NOUN_FORMATION]',
      '[CALLSIGN_DST], [VERB_HOLD] position and [VERB_REGROUP]'
    ],

    // ── Status reports (wing → lead) ──
    STATUS_DAMAGE: [
      '[CALLSIGN_SRC]: [VERB_TAKING] [NOUN_DAMAGE] — [ADJECTIVE_CONDITION]',
      '[CALLSIGN_SRC]: [NOUN_SHIELDS] [ADJECTIVE_CONDITION], [NOUN_HULL] [VERB_LOSING] integrity',
      '[CALLSIGN_SRC] to [CALLSIGN_DST]: [VERB_TAKING] hits — [NOUN_DAMAGE] [ADJECTIVE_CONDITION]',
      '[CALLSIGN_SRC]: systems [ADJECTIVE_CONDITION] — need support'
    ],

    STATUS_FUEL: [
      '[CALLSIGN_SRC]: [INTERJECTION_STATUS] — [NOUN_FUEL] [ADJECTIVE_PRIORITY]',
      '[CALLSIGN_SRC] to [CALLSIGN_DST]: approaching [INTERJECTION_STATUS]',
      '[CALLSIGN_SRC]: [NOUN_FUEL] state [ADJECTIVE_CONDITION]',
      '[CALLSIGN_SRC]: [VERB_LOSING] [NOUN_FUEL] — may need to RTB'
    ],

    STATUS_THREAT: [
      '[CALLSIGN_SRC]: [VERB_TRACKING] [ADJECTIVE_INTENSITY] [NOUN_THREATS_PLURAL]',
      '[CALLSIGN_SRC]: [NOUN_RADAR] shows [ADJECTIVE_INTENSITY] [NOUN_THREATS_PLURAL] [ADVERB_DIRECTION]',
      '[CALLSIGN_SRC] to [CALLSIGN_DST]: [VERB_DETECT] [ADJECTIVE_RANGE] [NOUN_THREATS_PLURAL]',
      '[CALLSIGN_SRC]: multiple [NOUN_THREATS_PLURAL] — [ADJECTIVE_HEAT] [NOUN_ZONES]'
    ],

    // ── Acknowledgments ──
    ACK_SIMPLE: [
      '[CALLSIGN_DST]: [INTERJECTION_ACK]',
      '[CALLSIGN_DST]: [INTERJECTION_ACK], [VERB_ENGAGE]',
      '[CALLSIGN_DST]: [INTERJECTION_ACK] — on it',
      '[INTERJECTION_ACK], [CALLSIGN_SRC]'
    ],

    ACK_REPEAT: [
      '[CALLSIGN_DST]: [INTERJECTION_ACK], [VERB_ENGAGE] [NOUN_THREATS]',
      '[CALLSIGN_DST]: [INTERJECTION_ACK] — [VERB_ENGAGE] [ADVERB_MANNER]',
      '[INTERJECTION_ACK], [VERB_COVER] [NOUN_OBJECTIVES]',
      '[CALLSIGN_DST]: understood, [VERB_ENGAGE] [ADJECTIVE_PRIORITY] [NOUN_THREATS]'
    ],

    // ── Alert patterns ──
    ALERT_MISSILE: [
      '[INTERJECTION_ALERT]! [NOUN_MISSILES_PLURAL] — [CALLSIGN_DST], [VERB_BREAK]!',
      '[CALLSIGN_DST], [NOUN_MISSILES] lock — [VERB_EVADING] [ADVERB_URGENCY]!',
      '[CALLSIGN_SRC] to [CALLSIGN_DST]: [NOUN_MISSILES_PLURAL] inbound your position!',
      'Missile warning! [CALLSIGN_DST], defensive!'
    ],

    ALERT_LOCK: [
      '[CALLSIGN_DST], you\'re spiked — [VERB_BREAK] [ADVERB_URGENCY]!',
      '[INTERJECTION_ALERT], [CALLSIGN_DST] — radar lock detected!',
      '[CALLSIGN_DST]: [VERB_TAKING] lock tone — [VERB_EVADING]',
      '[CALLSIGN_SRC] to [CALLSIGN_DST]: hostile lock on your six!'
    ],

    ALERT_THREAT: [
      '[CALLSIGN_DST], [ADJECTIVE_RANGE] [NOUN_THREATS_PLURAL] closing!',
      '[INTERJECTION_ALERT]! [ADJECTIVE_INTENSITY] [NOUN_THREATS_PLURAL] [ADVERB_DIRECTION]!',
      '[CALLSIGN_SRC]: [VERB_DETECT] [ADJECTIVE_PRIORITY] [NOUN_THREATS] — [CALLSIGN_DST], engage!',
      'New [NOUN_THREATS_PLURAL] on [NOUN_RADAR] — [CALLSIGN_DST], heads up!'
    ],

    // ── Combat reports ──
    REPORT_KILL: [
      '[CALLSIGN_SRC]: [INTERJECTION_HIT] — [NOUN_THREATS] down',
      '[INTERJECTION_HIT]! [CALLSIGN_SRC] confirms kill',
      '[CALLSIGN_SRC]: [VERB_NEUTRALIZE] [NOUN_THREATS] — good effect on target',
      '[CALLSIGN_SRC] to [CALLSIGN_DST]: [NOUN_THREATS] [ADJECTIVE_CONDITION] — splash one'
    ],

    REPORT_HIT: [
      '[CALLSIGN_SRC]: solid hit on [NOUN_THREATS]',
      '[CALLSIGN_SRC]: good effect — [NOUN_THREATS] [VERB_LOSING] [NOUN_SHIELDS]',
      '[CALLSIGN_SRC] to [CALLSIGN_DST]: direct hit, [NOUN_THREATS] damaged',
      '[CALLSIGN_SRC]: [NOUN_THREATS] hit — [ADJECTIVE_CONDITION]'
    ],

    REPORT_MISS: [
      '[CALLSIGN_SRC]: negative hit — [VERB_EVADING]',
      '[CALLSIGN_SRC]: missed — repositioning',
      '[CALLSIGN_SRC] to [CALLSIGN_DST]: no joy on that pass',
      '[CALLSIGN_SRC]: [NOUN_THREATS] evaded — coming around'
    ],

    // ── Banter/Chatter (low-stress only) ──
    BANTER_CALM: [
      '[CALLSIGN_SRC]: This is supposed to be the easy part',
      '[CALLSIGN_SRC] to [CALLSIGN_DST]: You sure this is just a milk run?',
      '[CALLSIGN_SRC]: I\'ve seen cleaner skies over a warzone',
      '[CALLSIGN_SRC]: [NOUN_RADAR] is [ADJECTIVE_HEAT] — maybe too quiet',
      '[CALLSIGN_SRC] to [CALLSIGN_DST]: Enjoying the view up here?'
    ],

    BANTER_COMBAT: [
      '[CALLSIGN_SRC]: Now it\'s a party',
      '[CALLSIGN_SRC]: Here they come — time to earn our pay',
      '[CALLSIGN_SRC] to [CALLSIGN_DST]: Just like the sims, right?',
      '[CALLSIGN_SRC]: This is what we trained for',
      '[CALLSIGN_SRC]: Let\'s show them how it\'s done'
    ],

    // ── Panic/Stress patterns ──
    PANIC_DAMAGE: [
      '[CALLSIGN_SRC]: I\'m hit bad — systems failing!',
      '[CALLSIGN_SRC] to [CALLSIGN_DST]: Can\'t shake them — need help!',
      '[CALLSIGN_SRC]: [NOUN_SHIELDS] gone — [NOUN_HULL] critical!',
      '[CALLSIGN_SRC]: Mayday mayday — [VERB_TAKING] heavy damage!'
    ],

    PANIC_OVERWHELMED: [
      '[CALLSIGN_SRC]: Too many — can\'t keep up!',
      '[CALLSIGN_SRC] to [CALLSIGN_DST]: They\'re everywhere!',
      '[CALLSIGN_SRC]: I\'m outnumbered — requesting support!',
      '[CALLSIGN_SRC]: Can\'t hold them — falling back!'
    ]
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // § 3. SELECTION FUNCTIONS — Filter and Pick from Pools
  // ═══════════════════════════════════════════════════════════════════════════

  function _pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Fill pattern slots with lexical choices
   * @param {string} pattern - Pattern string with [SLOT_TYPE] markers
   * @param {object} context - { callsignSrc, callsignDst, role, tone, ... }
   * @returns {string} - Filled pattern
   */
  function fillPattern(pattern, context = {}) {
    let result = pattern;

    // Callsigns
    result = result.replace(/\[CALLSIGN_SRC\]/g, context.callsignSrc || _pick(CALLSIGNS.wingman));
    result = result.replace(/\[CALLSIGN_DST\]/g, context.callsignDst || _pick(CALLSIGNS.player));

    // Nouns
    result = result.replace(/\[NOUN_THREATS\]/g, _pick(NOUNS.threats));
    result = result.replace(/\[NOUN_THREATS_PLURAL\]/g, _pick(NOUNS.threats_plural));
    result = result.replace(/\[NOUN_MISSILES\]/g, _pick(NOUNS.missiles));
    result = result.replace(/\[NOUN_MISSILES_PLURAL\]/g, _pick(NOUNS.missiles_plural));
    result = result.replace(/\[NOUN_RADAR\]/g, _pick(NOUNS.radar));
    result = result.replace(/\[NOUN_FUEL\]/g, _pick(NOUNS.fuel));
    result = result.replace(/\[NOUN_DAMAGE\]/g, _pick(NOUNS.damage));
    result = result.replace(/\[NOUN_SHIELDS\]/g, _pick(NOUNS.shields));
    result = result.replace(/\[NOUN_HULL\]/g, _pick(NOUNS.hull));
    result = result.replace(/\[NOUN_FORMATION\]/g, _pick(NOUNS.formation));
    result = result.replace(/\[NOUN_VECTOR\]/g, _pick(NOUNS.vector));
    result = result.replace(/\[NOUN_WAYPOINT\]/g, _pick(NOUNS.waypoint));
    result = result.replace(/\[NOUN_OBJECTIVES\]/g, _pick(NOUNS.objectives));
    result = result.replace(/\[NOUN_ZONES\]/g, _pick(NOUNS.zones));

    // Verbs
    result = result.replace(/\[VERB_ENGAGE\]/g, _pick(VERBS.engage));
    result = result.replace(/\[VERB_COVER\]/g, _pick(VERBS.cover));
    result = result.replace(/\[VERB_BREAK\]/g, _pick(VERBS.break));
    result = result.replace(/\[VERB_HOLD\]/g, _pick(VERBS.hold));
    result = result.replace(/\[VERB_REGROUP\]/g, _pick(VERBS.regroup));
    result = result.replace(/\[VERB_TAKING\]/g, _pick(VERBS.taking));
    result = result.replace(/\[VERB_LOSING\]/g, _pick(VERBS.losing));
    result = result.replace(/\[VERB_TRACKING\]/g, _pick(VERBS.tracking));
    result = result.replace(/\[VERB_EVADING\]/g, _pick(VERBS.evading));
    result = result.replace(/\[VERB_DETECT\]/g, _pick(VERBS.detect));
    result = result.replace(/\[VERB_NEUTRALIZE\]/g, _pick(VERBS.neutralize));

    // Adjectives
    result = result.replace(/\[ADJECTIVE_INTENSITY\]/g, _pick(ADJECTIVES.intensity));
    result = result.replace(/\[ADJECTIVE_HEAT\]/g, _pick(ADJECTIVES.heat));
    result = result.replace(/\[ADJECTIVE_PRIORITY\]/g, _pick(ADJECTIVES.priority));
    result = result.replace(/\[ADJECTIVE_CONDITION\]/g, _pick(ADJECTIVES.condition));
    result = result.replace(/\[ADJECTIVE_RANGE\]/g, _pick(ADJECTIVES.range));

    // Adverbs
    result = result.replace(/\[ADVERB_MANNER\]/g, _pick(ADVERBS.manner));
    result = result.replace(/\[ADVERB_URGENCY\]/g, _pick(ADVERBS.urgency));
    result = result.replace(/\[ADVERB_DIRECTION\]/g, _pick(ADVERBS.direction));

    // Interjections
    result = result.replace(/\[INTERJECTION_ACK\]/g, _pick(INTERJECTIONS.ack));
    result = result.replace(/\[INTERJECTION_ALERT\]/g, _pick(INTERJECTIONS.alerts));
    result = result.replace(/\[INTERJECTION_HIT\]/g, _pick(INTERJECTIONS.hits));
    result = result.replace(/\[INTERJECTION_STATUS\]/g, _pick(INTERJECTIONS.status));

    return result;
  }

  /**
   * Generate dialog from pattern category
   * @param {string} patternKey - Key from PATTERNS object
   * @param {object} context - Context for slot filling
   * @returns {string} - Generated dialog line
   */
  function generate(patternKey, context = {}) {
    const patterns = PATTERNS[patternKey];
    if (!patterns || patterns.length === 0) {
      console.warn(`No patterns found for key: ${patternKey}`);
      return '';
    }

    const pattern = _pick(patterns);
    return fillPattern(pattern, context);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 4. PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    // Lexical access
    CALLSIGNS,
    NOUNS,
    VERBS,
    ADJECTIVES,
    ADVERBS,
    INTERJECTIONS,
    CONDITION_CLAUSES,

    // Pattern access
    PATTERNS,

    // Generation functions
    generate,
    fillPattern,
    pick: _pick
  };
})();

// Expose globally
window.SFPatterns = SFPatterns;
