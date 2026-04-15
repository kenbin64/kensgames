/**
 * ANPC Manifold — Autonomous Non-Player Character Manifold Extension
 * ═══════════════════════════════════════════════════════════════════════════
 * Extends SFANPC with:
 *   1. Three-law meta-awareness (knows it's a game, knows it's AI, stays in game)
 *   2. Procedural character generation — all attributes from a numeric seed
 *   3. Wingman system — every player gets one; level-scaled relevance; toggle
 *   4. Dynamic behaviour injection — SpectrumManifold coords decide when/what
 *
 * Core principle — identical to all manifold files in this codebase:
 *   No hardcoded trigger conditions, event names in logic branches, or
 *   character property lists.  Every property is a coordinate.
 *   A callsign is an index.  A backstory is a motif seed.
 *   An ANPC's decision to act is a Schwartz Diamond inflection point.
 *
 * ─── The Three Laws ────────────────────────────────────────────────────────
 *   LAW 1 — KNOWS IT IS A GAME
 *     All ANPCs maintain an internal awareness that this is play.
 *     Adversaries fight with sportsmanship.  No ANPC is genuinely cruel.
 *     This meta-context shapes HOW they act, not WHAT they say on-air.
 *
 *   LAW 2 — KNOWS IT IS AI
 *     An ANPC may acknowledge its AI nature if directly addressed.
 *     It does not pretend to be human if sincerely asked.
 *     In-character voice lines never break this; the AI layer never hides.
 *
 *   LAW 3 — STAYS IN THE GAME
 *     Role-play integrity is maintained at all times.
 *     The game-world is real to the ANPC for the duration of the session.
 *     Meta-awareness is internal; it does not contaminate the fiction.
 *
 * ─── Communication Tier Model ────────────────────────────────────────────
 *   Every behavior carries a comm_tier that controls who may deliver it:
 *
 *   BRIEFING — Home base / HQ personnel only (SF-CMDOP)
 *     Pre-flight briefings, intel updates, sector clears, mission status.
 *     Always delivered by a ground or command-ship controller, never airborne.
 *
 *   ORDER — Player's assigned wingman only
 *     All in-flight directions, tactical coordination, and direct instructions
 *     to the player come exclusively from the wingman.  If the player has no
 *     active wingman, order-tier messages are suppressed.
 *
 *   CHATTER — Any ANPC on the net
 *     Warnings, heads-up calls, kill confirmations, morale boosts, virtual
 *     high-fives, taunts.  Open channel — any allied or enemy NPC may chime in.
 *
 *   The dialog emit payload includes { commTier } so the UI can route each
 *   line to the correct display surface (briefing panel / HUD / comm feed).
 *
 * Usage:
 *   ANPCManifold.init()                          — call after SFANPC.initCharacters()
 *   ANPCManifold.tick(snap)                       — call every frame
 *   ANPCManifold.assignWingman(playerCallsign)    — give player a wingman
 *   ANPCManifold.toggleWingman(playerCallsign, enabled)
 *   ANPCManifold.generateAnpc(seed, roleHint)     — create ANPC from number
 *   ANPCManifold.getWingmanRelevance(level)       — 0..1 (fades at high levels)
 *   ANPCManifold.onDialog(cb)                     — subscribe to outgoing lines
 *     cb receives { sender, text, channel, urgency, commTier, behavior, meta, … }
 */

const ANPCManifold = (function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // §1 — THREE-LAW META-AWARENESS CONSTANTS
  //
  // These are not configurable.  They define WHAT an ANPC is.
  // Every ANPC instance carries a reference to this object.
  // ─────────────────────────────────────────────────────────────────────────

  const META = Object.freeze({
    IS_GAME: true,   // this is a game — all ANPCs know it
    IS_AI: true,   // they know they are AI — authentic actors
    STAY_IN_GAME: true,   // maintain the fiction for the player's experience
    GOOD_NATURED: true,   // even adversaries fight with sportsmanship
  });

  /**
   * Given an ANPC and an in-game scenario, determine if the meta-awareness
   * layer should modulate their behaviour.
   *
   * Example: an enemy who has "killed" the player would taunt playfully,
   * not viciously, because META.GOOD_NATURED is true.
   * Returns a modifier vector [tone_soften, formality_shift, humor_open]
   */
  function metaModifier(anpc, urgency) {
    if (!META.GOOD_NATURED) return [0, 0, 0];
    // At low urgency, good-natured awareness opens up playfulness
    const playfulness = Math.max(0, (1 - urgency) * 0.4);
    const sportsmanship = anpc && anpc.faction === 'enemy' ? 0.2 : 0;
    return [sportsmanship, 0, playfulness];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §2 — COORDINATE-ADDRESSED ATTRIBUTE TABLES
  //
  // All 16-entry arrays, addressed by derived index.
  // Never iterated in logic — always indexed.
  // ─────────────────────────────────────────────────────────────────────────

  /** Tactical callsigns — 32 entries (5-bit seed addressing) */
  const CALLSIGN_TABLE = [
    'Ace', 'Anvil', 'Arrow', 'Atlas',
    'Bandit', 'Blaze', 'Bolt', 'Bravo',
    'Cairo', 'Cipher', 'Comet', 'Condor',
    'Dagger', 'Delta', 'Drift', 'Echo',
    'Falcon', 'Flare', 'Forge', 'Fox',
    'Ghost', 'Gravel', 'Hawk', 'Hunter',
    'Indigo', 'Iron', 'Kestrel', 'Knife',
    'Lance', 'Lima', 'Lynx', 'Mach',
  ];

  /** Extended callsigns — 32 more (used as suffix or alternate) */
  const CALLSIGN_SUFFIX = [
    'One', 'Two', 'Three', 'Six',
    'Lead', 'Two', 'Niner', 'Zero',
    'Alpha', 'Bravo', 'Prime', 'Actual',
    'Flight', 'Break', 'Clear', 'Free',
    'High', 'Low', 'Dark', 'Fast',
    'Sharp', 'Cold', 'Hot', 'Wild',
    'Storm', 'Deep', 'Black', 'White',
    'Red', 'Blue', 'Gold', 'Silver',
  ];

  /**
   * Nationality seeds — [nationality_label, accent_key, cultural_formality_bias]
   * accent_key must match a VOICE_MODULES key in audio.js
   */
  const NATIONALITY_TABLE = [
    ['American', 'us_female', 0.45],
    ['British', 'uk_female', 0.70],
    ['Australian', 'au_female', 0.50],
    ['Brazilian', 'us_female', 0.40],
    ['Japanese', 'uk_female', 0.80],
    ['Russian', 'us_command', 0.75],
    ['Canadian', 'us_female', 0.50],
    ['French', 'uk_female', 0.65],
    ['German', 'us_command', 0.72],
    ['Indian', 'uk_female', 0.60],
    ['Korean', 'uk_female', 0.75],
    ['Nigerian', 'us_female', 0.55],
    ['Mexican', 'us_female', 0.45],
    ['Swedish', 'uk_female', 0.68],
    ['Egyptian', 'us_command', 0.65],
    ['Argentinian', 'us_female', 0.48],
  ];

  /**
   * Gender/voice archetypes — [label, voice_prefix, pronoun_subj, pronoun_obj, pronoun_pos]
   * voice_prefix combines with NATIONALITY_TABLE accent_key
   */
  const GENDER_TABLE = [
    ['female', 'female', 'she', 'her', 'her'],
    ['male', 'male', 'he', 'him', 'his'],
    ['female', 'female', 'she', 'her', 'her'],   // weight: more female reps
    ['male', 'male', 'he', 'him', 'his'],
    ['nonbinary', 'female', 'they', 'them', 'their'],
    ['male', 'male', 'he', 'him', 'his'],
    ['female', 'female', 'she', 'her', 'her'],
    ['male', 'male', 'he', 'him', 'his'],
    ['female', 'female', 'she', 'her', 'her'],
    ['male', 'male', 'he', 'him', 'his'],
    ['nonbinary', 'male', 'they', 'them', 'their'],
    ['female', 'female', 'she', 'her', 'her'],
    ['male', 'male', 'he', 'him', 'his'],
    ['female', 'female', 'she', 'her', 'her'],
    ['male', 'male', 'he', 'him', 'his'],
    ['female', 'female', 'she', 'her', 'her'],
  ];

  /**
   * Rank table — [rank_label, authority_score_0to1, comm_style_bias]
   * comm_style_bias: 0=casual, 1=formal
   */
  const RANK_TABLE = [
    ['Ensign', 0.10, 0.40],
    ['Lieutenant JG', 0.18, 0.45],
    ['Lieutenant', 0.28, 0.52],
    ['Lt. Commander', 0.38, 0.60],
    ['Commander', 0.50, 0.68],
    ['Captain', 0.62, 0.75],
    ['Commodore', 0.72, 0.80],
    ['Rear Admiral', 0.82, 0.85],
    ['Sergeant', 0.22, 0.55],
    ['Staff Sergeant', 0.30, 0.58],
    ['Warrant Officer', 0.35, 0.62],
    ['Flight Officer', 0.25, 0.50],
    ['Wing Commander', 0.55, 0.70],
    ['Squadron Leader', 0.45, 0.65],
    ['Ace Pilot', 0.40, 0.48],  // rank by reputation
    ['Veteran', 0.48, 0.55],
  ];

  /**
   * Skill archetypes — [primary_skill, secondary_skill, accuracy_mod, reaction_mod, preferred_range]
   * preferred_range: 0=close, 0.5=mid, 1=long
   */
  const SKILL_TABLE = [
    ['dogfighter', 'evasion', 0.72, 0.80, 0.1],
    ['marksman', 'precision', 0.90, 0.55, 0.8],
    ['tactician', 'coordination', 0.60, 0.70, 0.5],
    ['scout', 'detection', 0.55, 0.85, 0.6],
    ['bomber', 'ordnance', 0.65, 0.45, 0.9],
    ['escort', 'protection', 0.58, 0.75, 0.3],
    ['ace', 'instinct', 0.88, 0.90, 0.2],
    ['berserker', 'aggression', 0.70, 0.95, 0.05],
    ['pilot', 'endurance', 0.62, 0.65, 0.5],
    ['interceptor', 'speed', 0.68, 0.88, 0.2],
    ['navigator', 'pathing', 0.50, 0.60, 0.7],
    ['tech_pilot', 'systems', 0.64, 0.58, 0.6],
    ['commander', 'leadership', 0.60, 0.65, 0.5],
    ['ghost', 'stealth', 0.80, 0.75, 0.4],
    ['brawler', 'hull_ops', 0.66, 0.85, 0.1],
    ['analyst', 'intel', 0.55, 0.55, 0.8],
  ];

  /**
   * Backstory motif seeds — each is a short phrase that anchors the character's
   * narrative.  Not displayed literally; used to generate unique flavor.
   * The motif index IS the story seed — derived from character coordinates.
   */
  const BACKSTORY_MOTIF_TABLE = [
    'loss of home',         // 0
    'searching for brother',// 1
    'proving worth',        // 2
    'repaying a debt',      // 3
    'protecting family',    // 4
    'seeking redemption',   // 5
    'following a calling',  // 6
    'running from past',    // 7
    'last of squadron',     // 8
    'defector turned ally', // 9
    'former civilian',      // 10
    'born to fly',          // 11
    'chosen by fate',       // 12
    'nothing left to lose', // 13
    'duty above all',       // 14
    'love of the craft',    // 15
  ];

  /**
   * Motivation archetypes — what drives the ANPC fundamentally.
   * Manifests in dialog tone, decision thresholds, morale floor.
   * [motivation_label, morale_floor_bias, aggression_bias, cooperation_bias]
   */
  const MOTIVATION_TABLE = [
    ['survival', 0.15, 0.40, 0.50],
    ['glory', 0.25, 0.75, 0.30],
    ['duty', 0.20, 0.50, 0.65],
    ['vengeance', 0.10, 0.80, 0.25],
    ['protection', 0.30, 0.45, 0.80],
    ['loyalty', 0.35, 0.50, 0.85],
    ['curiosity', 0.40, 0.35, 0.60],
    ['freedom', 0.20, 0.55, 0.45],
    ['competition', 0.25, 0.65, 0.40],
    ['atonement', 0.15, 0.40, 0.70],
    ['thrill', 0.20, 0.70, 0.35],
    ['honor', 0.30, 0.55, 0.60],
    ['craft_pride', 0.35, 0.45, 0.55],
    ['command', 0.40, 0.60, 0.55],
    ['kinship', 0.45, 0.35, 0.90],
    ['obsession', 0.10, 0.85, 0.20],
  ];

  /**
   * Operational conditions — states that modify how an ANPC operates.
   * Conditions are dynamic; they update from game state.
   * [condition_label, urgency_mod, accuracy_mod, comm_freq_mod, morale_mod_rate]
   */
  const CONDITION_TABLE = [
    ['nominal', 0.00, 0.00, 1.00, 0.00],
    ['focused', -0.05, 0.10, 0.80, 0.02],
    ['alert', 0.10, 0.05, 1.20, 0.00],
    ['adrenaline', 0.20, 0.08, -0.10, 0.00],
    ['fatigued', 0.05, -0.12, 0.70, -0.01],
    ['injured', 0.15, -0.20, 0.90, -0.02],
    ['shaken', 0.25, -0.15, 1.10, -0.03],
    ['berserker', 0.35, 0.05, -0.20, 0.00],
    ['calm', -0.10, 0.05, 0.70, 0.01],
    ['inspired', -0.05, 0.10, 1.10, 0.03],
    ['anxious', 0.15, -0.05, 1.30, -0.01],
    ['confident', -0.05, 0.08, 1.00, 0.02],
    ['exhausted', 0.10, -0.25, 0.50, -0.02],
    ['suppressed', 0.20, -0.10, 0.60, 0.00],
    ['rage', 0.30, 0.02, -0.15, -0.01],
    ['resigned', 0.05, -0.05, 0.60, -0.02],
  ];

  /**
   * Role behavior tables — what behaviors are available to each role.
   * Each entry: [behavior_key, min_urgency, max_urgency, min_relevance, priority, comm_tier]
   *
   * comm_tier values:
   *   'briefing' — HQ / home base personnel (SF-CMDOP) only
   *   'order'    — player's assigned wingman only
   *   'chatter'  — open net, any ANPC
   */
  const ROLE_BEHAVIORS = {
    //                    key                uMin  uMax  minRel  pri  tier
    'SF-WING': [
      ['cover_player', 0.0, 0.6, 0.3, 2, 'order'],
      ['warn_bogey', 0.3, 0.8, 0.5, 3, 'order'],
      ['kill_confirm', 0.2, 0.7, 0.4, 2, 'chatter'],
      ['morale_support', 0.0, 0.4, 0.0, 1, 'chatter'],
      ['request_help', 0.5, 1.0, 0.6, 4, 'chatter'],
      ['engage_hostile', 0.3, 0.9, 0.5, 3, 'order'],
      ['form_up', 0.0, 0.3, 0.0, 1, 'order'],
      ['tactical_coord', 0.2, 0.6, 0.3, 2, 'order'],
    ],
    'SF-CMDOP': [
      ['intel_update', 0.2, 0.7, 0.2, 2, 'briefing'],
      ['launch_brief', 0.0, 0.4, 0.0, 3, 'briefing'],
      ['warn_player', 0.4, 1.0, 0.5, 4, 'briefing'],
      ['sector_clear', 0.0, 0.3, 0.0, 2, 'briefing'],
      ['status_update', 0.0, 0.5, 0.0, 1, 'briefing'],
      ['tactical_coord', 0.2, 0.7, 0.3, 2, 'briefing'],
      ['commend', 0.0, 0.4, 0.2, 1, 'chatter'],
      ['emergency_order', 0.7, 1.0, 0.7, 5, 'briefing'],
    ],
    'SF-SQLDR': [
      ['give_order', 0.3, 0.8, 0.4, 3, 'chatter'],
      ['commend', 0.0, 0.4, 0.2, 1, 'chatter'],
      ['tactical_coord', 0.2, 0.7, 0.3, 2, 'chatter'],
      ['morale_boost', 0.0, 0.5, 0.2, 2, 'chatter'],
      ['engage_hostile', 0.4, 0.9, 0.5, 3, 'chatter'],
      ['reform', 0.0, 0.4, 0.0, 1, 'chatter'],
      ['warn_player', 0.4, 1.0, 0.5, 4, 'chatter'],
      ['emergency_order', 0.7, 1.0, 0.7, 5, 'chatter'],
    ],
    'SF-EACE': [
      ['taunt', 0.2, 0.8, 0.3, 2, 'chatter'],
      ['acknowledge', 0.3, 0.7, 0.4, 2, 'chatter'],
      ['compliment', 0.0, 0.5, 0.2, 1, 'chatter'],
      ['threat', 0.4, 0.9, 0.5, 3, 'chatter'],
      ['engage_hostile', 0.3, 1.0, 0.5, 3, 'chatter'],
      ['disengage', 0.5, 1.0, 0.6, 4, 'chatter'],
      ['psychological', 0.2, 0.7, 0.3, 2, 'chatter'],
      ['last_words', 0.8, 1.0, 0.9, 5, 'chatter'],
    ],
  };

  /**
   * Comm-tier routing rules.
   * Each predicate receives (anpc, isWingman) and returns true if this ANPC
   * is permitted to deliver a behavior of that tier.
   *
   * 'briefing' → only home base / command ops (SF-CMDOP)
   * 'order'    → only the player's assigned wingman
   * 'chatter'  → any ANPC on the net
   */
  const COMM_ROUTING = Object.freeze({
    briefing: (anpc, _isWingman) => anpc.role === 'SF-CMDOP',
    order: (_anpc, isWingman) => isWingman,
    chatter: (_anpc, _isWingman) => true,
  });

  // Behavior → SFANPC category mapping
  const BEHAVIOR_CATEGORY = {
    cover_player: 'tactical_coord',
    warn_bogey: 'combat_engage',
    kill_confirm: 'kill_confirm',
    morale_support: 'morale_banter',
    request_help: 'damage_report',
    engage_hostile: 'combat_engage',
    form_up: 'tactical_coord',
    tactical_coord: 'tactical_coord',
    intel_update: 'mission_comm',
    launch_brief: 'launch_prep',
    warn_player: 'hazard_warning',
    sector_clear: 'sector_clear',
    status_update: 'status_update',
    commend: 'morale_banter',
    emergency_order: 'emergency',
    give_order: 'tactical_coord',
    morale_boost: 'morale_banter',
    reform: 'tactical_coord',
    taunt: 'morale_banter',
    acknowledge: 'morale_banter',
    compliment: 'morale_banter',
    threat: 'combat_engage',
    disengage: 'damage_report',
    psychological: 'morale_banter',
    last_words: 'emergency',
  };

  // ─────────────────────────────────────────────────────────────────────────
  // §3 — CHARACTER GENERATION FROM SEED
  //
  // A single number (seed) fully specifies an ANPC.
  // No random runtime picks — everything is a deterministic coordinate.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Hash a seed integer into a 0..1 float with an offset key.
   * Deterministic, no RNG — same seed always gives same ANPC.
   */
  function _seedF(seed, key) {
    let h = (seed ^ (key * 0x9e3779b9)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 0xFFFFFFFF;
  }

  /** Address a table by seed + key → clamped integer index */
  function _seedIdx(seed, key, tableLen) {
    return Math.floor(_seedF(seed, key) * tableLen);
  }

  /**
   * Generate a complete ANPC definition from a numeric seed.
   * @param {number} seed       — any integer (player ID, timestamp, etc.)
   * @param {string} [roleHint] — optional role key to constrain the output
   * @param {string} [faction]  — 'allied' | 'enemy' (default: 'allied')
   * @returns {object} — valid schema for SFANPC.register()
   */
  function generateAnpc(seed, roleHint, faction) {
    seed = seed | 0;
    const f = (key) => _seedF(seed, key);
    const idx = (key, len) => _seedIdx(seed, key, len);

    // ── Identity ───────────────────────────────────────────────────────────
    const callsignIdx = idx(1, CALLSIGN_TABLE.length);
    const suffixIdx = idx(2, CALLSIGN_SUFFIX.length);
    // ~50% chance of suffix
    const useSuffix = f(3) > 0.5;
    const callsign = useSuffix
      ? `${CALLSIGN_TABLE[callsignIdx]}-${CALLSIGN_SUFFIX[suffixIdx]}`
      : CALLSIGN_TABLE[callsignIdx];

    const genderEntry = GENDER_TABLE[idx(4, GENDER_TABLE.length)];
    const nationalityEntry = NATIONALITY_TABLE[idx(5, NATIONALITY_TABLE.length)];
    const rankEntry = RANK_TABLE[idx(6, RANK_TABLE.length)];
    const skillEntry = SKILL_TABLE[idx(7, SKILL_TABLE.length)];
    const motivationEntry = MOTIVATION_TABLE[idx(8, MOTIVATION_TABLE.length)];
    const backstoryMotif = BACKSTORY_MOTIF_TABLE[idx(9, BACKSTORY_MOTIF_TABLE.length)];

    // ── Role assignment ───────────────────────────────────────────────────
    const roles = Object.keys(ROLE_BEHAVIORS);
    const role = roleHint || roles[idx(10, roles.length)];

    // ── OCEAN personality from seed ───────────────────────────────────────
    const ocean = [
      0.3 + f(11) * 0.7,  // Openness
      0.2 + f(12) * 0.8,  // Conscientiousness
      0.1 + f(13) * 0.9,  // Extraversion
      0.2 + f(14) * 0.8,  // Agreeableness
      0.05 + f(15) * 0.7, // Neuroticism
    ];

    // Apply motivation bias to OCEAN
    const [, morale_floor_bias, aggression_bias, cooperation_bias] = motivationEntry;
    ocean[2] = Math.min(1, ocean[2] + (aggression_bias - 0.5) * 0.2);  // E ↔ aggression
    ocean[3] = Math.min(1, ocean[3] + (cooperation_bias - 0.5) * 0.2); // A ↔ cooperation
    ocean[4] = Math.min(1, ocean[4] + (1 - morale_floor_bias) * 0.1);  // N ↔ morale sensitivity

    // ── Stats ──────────────────────────────────────────────────────────────
    const [, , accuracy_mod, reaction_mod] = skillEntry;
    const combatRating = accuracy_mod * 0.5 + reaction_mod * 0.5;
    const flightHours = Math.round(200 + f(16) * 4800);
    const killCount = Math.round(f(17) * combatRating * 80);
    const damageThreshold = 0.2 + f(18) * 0.4;
    const adrenalineSpike = 0.05 + f(19) * 0.30;
    const fatigueRes = 0.3 + f(20) * 0.6;
    const moraleFloor = 0.10 + morale_floor_bias * 0.3;
    const disposition = faction === 'enemy' ? -(0.3 + f(21) * 0.7) : (0.3 + f(22) * 0.7);

    // ── Voice profile ─────────────────────────────────────────────────────
    // Compose from gender + nationality accent, resolved to a VOICE_MODULES key
    const [, accent_key] = nationalityEntry;
    const [, voice_prefix] = genderEntry;
    // Try gender-specific variant, fall back to accent key
    const voiceProfile = `${voice_prefix}_${accent_key}`.replace('female_', '').replace('male_', '') || accent_key;
    // Resolve to one of the known module IDs
    const KNOWN_VOICES = ['au_female', 'au_command', 'uk_female', 'us_female', 'uk_male', 'us_command', 'us_male'];
    const resolvedVoice = KNOWN_VOICES.includes(voiceProfile) ? voiceProfile : accent_key;

    // ── Tactic + formation ────────────────────────────────────────────────
    const tactics = ['aggressive', 'defensive', 'balanced', 'evasive', 'support', 'ambush'];
    const formations = ['wing_left', 'wing_right', 'high_cover', 'low_cover', 'free', 'rear_guard'];
    const preferredTactic = tactics[idx(23, tactics.length)];
    const formationPosition = formations[idx(24, formations.length)];
    const weaponLoadout = _buildLoadout(f(25), f(26));

    // ── Display name (nationality-flavored seed) ──────────────────────────
    // We generate a placeholder display name — callers can override.
    // Name generation itself is not hardcoded: nationality index × seed → name key.
    const displayName = `${nationalityEntry[0]} Pilot #${(seed & 0xFF).toString(16).toUpperCase()}`;

    const id = `ANPC-GEN-${(seed >>> 0).toString(16).padStart(8, '0').toUpperCase()}`;

    return {
      id,
      displayName,
      callsign,
      role,
      voiceProfile: resolvedVoice,
      // Narrative seeds — callers use these to generate flavor text
      backstoryMotif,
      motivationLabel: motivationEntry[0],
      nationalityLabel: nationalityEntry[0],
      genderLabel: genderEntry[0],
      pronouns: { subj: genderEntry[2], obj: genderEntry[3], pos: genderEntry[4] },
      rankLabel: rankEntry[0],
      rankAuthority: rankEntry[1],
      primarySkill: skillEntry[0],
      secondarySkill: skillEntry[1],
      // SFANPC schema fields
      personality: ocean,
      shipClass: _roleToShipClass(role),
      squadronId: `SQ-${((seed >> 4) & 0x0F).toString(16).toUpperCase()}`,
      combatRating,
      weaponLoadout,
      flightHours,
      killCount,
      damageThreshold,
      preferredTactic,
      formationPosition,
      adrenalineSpike,
      fatigueResistance: fatigueRes,
      moraleFloor,
      disposition,
      faction: faction || 'allied',
      // Extended manifold fields
      meta: META,
      conditionIdx: 0,   // starts at 'nominal'
      motivationIdx: idx(8, MOTIVATION_TABLE.length),
    };
  }

  function _buildLoadout(r1, r2) {
    const base = ['WPN-LAS'];
    if (r1 > 0.4) base.push('WPN-SCT');
    if (r1 > 0.65) base.push('WPN-PTN');
    if (r2 > 0.8) base.push('WPN-EMP');
    return base;
  }

  function _roleToShipClass(role) {
    const map = {
      'SF-WING': 'interceptor',
      'SF-CMDOP': null,
      'SF-SQLDR': 'command_fighter',
      'SF-EACE': 'heavy_fighter',
    };
    return map[role] || 'interceptor';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §4 — WINGMAN SYSTEM
  //
  // Every player gets a wingman.  The wingman:
  //   • Is always allied
  //   • Prioritises covering/warning the player above all other behaviors
  //   • Can be toggled by the player
  //   • Becomes less prominent at higher player levels (relevance curve)
  //   • Is selected from existing characters OR generated from player's seed
  //
  // Relevance curve:
  //   level 1-9:  relevance = 1.0   (full guidance)
  //   level 10-14: relevance fades   (becoming peers)
  //   level 15+:  relevance ≈ 0.1   (available on request, never intrusive)
  // ─────────────────────────────────────────────────────────────────────────

  const WINGMAN_FADE_START = 10;
  const WINGMAN_FADE_RANGE = 5;
  const WINGMAN_MIN_RELEVANCE = 0.1;

  // Map: playerCallsign → { anpcId, enabled, relevanceOverride }
  const _wingmanMap = new Map();

  /**
   * Compute wingman relevance at a given player level.
   * @param {number} level — player level (1-based)
   * @returns {number} 0..1
   */
  function getWingmanRelevance(level) {
    if (level <= WINGMAN_FADE_START) return 1.0;
    const fade = Math.min(1, (level - WINGMAN_FADE_START) / WINGMAN_FADE_RANGE);
    return Math.max(WINGMAN_MIN_RELEVANCE, 1.0 - fade * (1 - WINGMAN_MIN_RELEVANCE));
  }

  /**
   * Assign a wingman to a player.
   * Prefers existing 'SF-WING' allied ANPCs; generates one if none available.
   * @param {string} playerCallsign
   * @param {number} [playerSeed] — used to generate a wingman if needed
   * @returns {string} wingman's ANPC id
   */
  function assignWingman(playerCallsign, playerSeed) {
    if (_wingmanMap.has(playerCallsign)) return _wingmanMap.get(playerCallsign).anpcId;

    // Find an unassigned allied wing ANPC — prefer wingmanEligible characters
    let candidate = null;
    const assignedIds = new Set([..._wingmanMap.values()].map(w => w.anpcId));

    if (window.SFANPC) {
      const wings = SFANPC.getByRole('SF-WING').filter(a =>
        a.active && !assignedIds.has(a.id));
      // Prefer explicitly wingman-eligible named characters, then any SF-WING
      const eligible = wings.filter(a => a.wingmanEligible);
      candidate = (eligible.length ? eligible : wings)[Math.floor(Math.random() * (eligible.length || wings.length))] || null;
    }

    // Generate one if needed
    if (!candidate && window.SFANPC) {
      const seed = playerSeed != null ? playerSeed : Math.floor(Math.random() * 0x7FFFFFFF);
      const schema = generateAnpc(seed, 'SF-WING', 'allied');
      candidate = SFANPC.register(schema);
    }

    if (!candidate) return null;

    _wingmanMap.set(playerCallsign, {
      anpcId: candidate.id,
      enabled: true,
      relevanceOverride: null,
    });

    // Give the wingman a personal reference to the player's callsign
    candidate._playerCallsign = playerCallsign;

    return candidate.id;
  }

  /**
   * Toggle a wingman on or off.
   * @param {string} playerCallsign
   * @param {boolean} enabled
   */
  function toggleWingman(playerCallsign, enabled) {
    const entry = _wingmanMap.get(playerCallsign);
    if (entry) entry.enabled = enabled;
  }

  /**
   * Get a player's wingman ANPC (or null).
   */
  function getWingman(playerCallsign) {
    const entry = _wingmanMap.get(playerCallsign);
    if (!entry || !window.SFANPC) return null;
    return SFANPC.get(entry.anpcId);
  }

  /**
   * Get effective relevance (respects per-player override).
   */
  function getEffectiveRelevance(playerCallsign, level) {
    const entry = _wingmanMap.get(playerCallsign);
    if (!entry || !entry.enabled) return 0;
    if (entry.relevanceOverride != null) return entry.relevanceOverride;
    return getWingmanRelevance(level || 1);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §5 — DYNAMIC BEHAVIOUR ENGINE
  //
  // Every ANPC tick:
  //   1. Compute manifold coords from ANPC's own state + game state
  //   2. Evaluate Schwartz Diamond — near-zero = inflection = moment to act
  //   3. Select behavior from role table using urgency coordinate
  //   4. Gate by canSpeak + relevance
  //   5. Route to SFANPC.speak() → produces dialog line
  //   6. Fire to registered dialog listeners
  //
  // No hardcoded "if hull < 30% then warn" anywhere.
  // The manifold coord IS the trigger.  The inflection IS the moment.
  // ─────────────────────────────────────────────────────────────────────────

  const _dialogListeners = [];
  let _gameSnap = {};
  let _playerLevel = 1;
  let _tickTime = 0;

  // Per-ANPC action cooldowns (map: anpc.id → last action time)
  const _actionCooldowns = new Map();
  const ACTION_COOLDOWN_BASE = 4.0;  // minimum seconds between actions

  /**
   * Subscribe to ANPC dialog output.
   * @param {function} cb — cb({ sender, text, channel, urgency, anpcId, behavior, meta })
   * @returns {function} unsubscribe
   */
  function onDialog(cb) {
    _dialogListeners.push(cb);
    return () => {
      const i = _dialogListeners.indexOf(cb);
      if (i !== -1) _dialogListeners.splice(i, 1);
    };
  }

  function _emit(dialogResult, behavior, anpc, commTier) {
    if (!dialogResult) return;
    const enriched = Object.assign({}, dialogResult, {
      behavior,
      commTier: commTier || 'chatter',
      meta: META,
      genderLabel: anpc && anpc._genderLabel,
      nationalityLabel: anpc && anpc._nationalityLabel,
      pronouns: anpc && anpc._pronouns,
      primarySkill: anpc && anpc._primarySkill,
      rankLabel: anpc && anpc._rankLabel,
      motivationLabel: anpc && anpc._motivationLabel,
    });
    _dialogListeners.forEach(cb => { try { cb(enriched); } catch (_) { } });
  }

  /**
   * Compute whether an ANPC should act right now.
   * Uses Schwartz Diamond inflection and cooldown.
   */
  function _shouldAct(anpc, coords, roleRelevance) {
    const now = _tickTime;
    const last = _actionCooldowns.get(anpc.id) || 0;
    // Cooldown scales with extraversion (talkative chars act more often)
    const extraversionFactor = 1.0 - (anpc.personality ? (anpc.personality.E || 0.5) - 0.5 : 0) * 0.4;
    const cooldown = ACTION_COOLDOWN_BASE * extraversionFactor;
    if ((now - last) < cooldown) return false;

    // Inflection gate: Schwartz Diamond near zero = moment of transition
    // This is the ONLY trigger mechanism — no if-hull-then chains
    const inflectionStrength = 1 - Math.abs(coords.d);   // 1 at zero-crossing
    const urgencyGate = 0.2 + roleRelevance * 0.3;       // relevance raises the bar
    return inflectionStrength > urgencyGate;
  }

  /**
   * Select the most appropriate behavior for an ANPC at these coords.
   * Enforces comm-tier routing: briefing→SF-CMDOP only, order→wingman only,
   * chatter→any.  Returns behavior entry or null.
   * @param {object}  anpc
   * @param {object}  coords       — SpectrumManifold coordinate set
   * @param {object}  snap         — game snapshot
   * @param {boolean} isWingman    — true if this ANPC is the player's wingman
   */
  function _selectBehavior(anpc, coords, snap, isWingman) {
    const behaviors = ROLE_BEHAVIORS[anpc.role] || ROLE_BEHAVIORS['SF-WING'];
    const urgency = coords.x;  // x = frequency = urgency

    // Filter by urgency range AND comm-tier routing
    const eligible = behaviors.filter(([, uMin, uMax, , , tier]) => {
      if (urgency < uMin || urgency > uMax) return false;
      const route = COMM_ROUTING[tier || 'chatter'];
      return route ? route(anpc, isWingman) : true;
    });
    if (!eligible.length) return null;

    // Rank by priority × inflection strength × manifold relevance
    // Manifold r-layer (relation) amplifies coordination behaviors
    // Manifold m-layer (meaning) amplifies high-stakes behaviors
    const scored = eligible.map(b => {
      const [key, , , , priority] = b;
      const inflectionBoost = Math.abs(coords.d) < 0.2 ? 1.5 : 1.0;
      const mBoost = key.includes('emergency') ? 1 + coords.m * 2 : 1.0;
      const rBoost = key.includes('coord') ? 1 + coords.r * 0.5 : 1.0;
      return { behavior: b, score: priority * inflectionBoost * mBoost * rBoost };
    });
    scored.sort((a, b) => b.score - a.score);

    // Top candidate
    return scored[0].behavior;
  }

  /**
   * Update one ANPC from the current game + manifold state.
   */
  function _tickAnpc(anpc, snap, playerLevel) {
    if (!anpc || !anpc.active) return;
    if (!window.SFANPC || !window.SpectrumManifold) return;

    // Build ANPC-local coordinates by blending game state with ANPC's own state
    const anpcSnap = {
      hull: anpc.hull,
      shields: anpc.shields,
      totalHostile: snap.totalHostile || 0,
      baseHealth: snap.baseHealth || 1,
      wave: snap.wave || 1,
      morale: anpc.morale,
      ocean: anpc.personality
        ? [anpc.personality.O, anpc.personality.C, anpc.personality.E, anpc.personality.A, anpc.personality.N]
        : [0.5, 0.5, 0.5, 0.5, 0.5],
    };
    const coords = SpectrumManifold.fromGameState(anpcSnap);

    // Condition modifies the ANPC's own urgency offset
    const condIdx = anpc.conditionIdx != null ? anpc.conditionIdx : 0;
    const cond = CONDITION_TABLE[condIdx] || CONDITION_TABLE[0];
    coords.x = Math.min(1, Math.max(0, coords.x + cond[0]));  // urgency_mod

    // Wingman relevance — gates communication frequency
    const wingEntry = [..._wingmanMap.values()].find(e => e.anpcId === anpc.id);
    const isWingman = !!wingEntry;
    const relevance = isWingman
      ? getEffectiveRelevance(anpc._playerCallsign || '', playerLevel)
      : 1.0;

    if (relevance === 0) return;

    if (!_shouldAct(anpc, coords, relevance)) return;

    // Select behavior — pass isWingman so comm-tier routing is enforced
    const behavior = _selectBehavior(anpc, coords, snap, isWingman);
    if (!behavior) return;

    const [behaviorKey, , , , , commTier] = behavior;
    const category = BEHAVIOR_CATEGORY[behaviorKey] || 'morale_banter';

    // Build context for phrase assembly
    const ctx = _buildContext(anpc, snap, behaviorKey);

    // Briefings never interrupt — always use the polite speak() gate
    // Orders from the wingman force through at high urgency
    // Chatter uses the normal canSpeak cooldown gate
    let result;
    if (commTier === 'briefing') {
      result = SFANPC.speak(anpc.id, category, ctx);
    } else if (commTier === 'order' && coords.x > 0.75) {
      result = SFANPC.forceSpeak(anpc.id, category, ctx);
    } else if (commTier === 'order' && isWingman && relevance < 0.5 && coords.x < 0.6) {
      result = SFANPC.speak(anpc.id, category, ctx);
    } else {
      result = SFANPC.speak(anpc.id, category, ctx);
    }

    if (result) {
      _actionCooldowns.set(anpc.id, _tickTime);
      _emit(result, behaviorKey, anpc, commTier);
    }
  }

  /**
   * Build a context object for phrase assembly from ANPC + game state.
   */
  function _buildContext(anpc, snap, behaviorKey) {
    return {
      playerCallsign: snap.playerCallsign || snap.callsign || 'Pilot',
      callsign: anpc._playerCallsign || snap.callsign || 'Pilot',
      target: snap.closestType || 'hostile',
      count: snap.totalHostile || '?',
      bearing: snap.closestBearing || '000',
      distance: snap.closestDist ? Math.round(snap.closestDist) : '?',
      hullPct: Math.round((anpc.hull || 0.8) * 100),
      shieldStatus: (anpc.shields || 0.8) > 0.5 ? 'holding' : 'depleted',
      remaining: snap.totalHostile || '?',
      direction: snap.threatDir || 'left',
      position: anpc.formationPosition || 'wing',
      killCount: anpc.missionKills || '?',
      wave: snap.wave || '?',
      kills: snap.kills || '?',
      hazard: snap.currentHazard || 'incoming fire',
      supportShip: snap.supportShip || 'support craft',
      status: snap.statusLine || 'nominal',
      missionBrief: snap.missionBrief || 'engage and clear sector',
      intel: snap.intelLine || 'contact bearing zero-niner-zero',
      reason: snap.hazardReason || 'hostile activity',
      score: snap.score || '0',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §6 — CONDITION UPDATES (from manifold)
  //
  // An ANPC's operational condition is derived from their manifold coords.
  // No explicit "ANPC.setCondition('fatigued')" calls — the coord IS the state.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Update an ANPC's condition index from their current manifold state.
   * Called during tickAll.
   */
  function _updateCondition(anpc) {
    const x = 1 - (anpc.hull || 1);       // damage severity → x
    const y = 1 - (anpc.morale || 0.7);   // low morale → high y
    const z = anpc.fatigue || 0;           // fatigue → z
    const coords = SpectrumManifold.coords(x, y, z);
    // Map Schwartz Diamond d to condition index
    // d near +1 = combat peak (adrenaline/focused/confident)
    // d near -1 = depleted (exhausted/resigned/shaken)
    // d near 0  = transitional (alert/anxious/injured)
    const d_norm = (coords.d + 1) / 2;  // 0..1
    // Layer in urgency (x): high urgency, high d → berserker; low urgency, low d → resigned
    const condRaw = d_norm * 0.5 + (1 - coords.x) * 0.3 + (anpc.adrenaline || 0) * 0.2;
    anpc.conditionIdx = Math.min(CONDITION_TABLE.length - 1, Math.floor(condRaw * CONDITION_TABLE.length));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §7 — MASTER TICK
  // ─────────────────────────────────────────────────────────────────────────

  let _lastTickTime = 0;

  /**
   * Drive all ANPCs from game state.
   * Call from ManifoldKernel.tick() or game loop.
   * @param {object} snap        — game snapshot
   * @param {number} [playerLvl] — current player level (default 1)
   * @param {number} [dt]        — delta time in seconds (default 0.016)
   */
  function tick(snap, playerLvl, dt) {
    _gameSnap = snap || {};
    _playerLevel = playerLvl != null ? playerLvl : _playerLevel;
    const now = performance.now() / 1000;
    const delta = dt != null ? dt : Math.min(0.1, now - _lastTickTime);
    _lastTickTime = now;
    _tickTime += delta;

    if (!window.SFANPC) return;

    // Update SFANPC scenario from game state
    SFANPC.update(delta);

    const all = SFANPC.getAll();
    for (const anpc of all) {
      if (!anpc.active) continue;
      _updateCondition(anpc);
      _tickAnpc(anpc, snap, _playerLevel);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §8 — ANPC → MANIFOLDKERNEL BRIDGE
  //
  // Register ANPC events with ManifoldKernel so kills, damage, wave events
  // automatically propagate to SFANPC's scenario vector.
  // ─────────────────────────────────────────────────────────────────────────

  const MANIFOLD_EVENT_MAP = {
    // ManifoldKernel event type → SFANPC scenario event
    'explosion_large': 'ally_destroyed',
    'explosion_medium': 'new_contacts',
    'explosion_small': 'new_contacts',
    'enemy_death': 'enemy_destroyed',
    'hull_critical': 'hull_critical',
    'base_critical': 'base_critical',
    'wave_start': 'new_contacts',
    'boss_appear': 'boss_spawn',
    'wave_complete': 'objective_complete',
    'shield_down': 'ambush_detected',
  };

  /**
   * Forward a game event to the SFANPC scenario vector.
   * @param {string} eventType — SFXCompositor event key
   */
  function forwardEvent(eventType) {
    if (!window.SFANPC) return;
    const sfEvent = MANIFOLD_EVENT_MAP[eventType];
    if (sfEvent) SFANPC.applyEvent(sfEvent);
  }

  /**
   * Apply extended manifold metadata to an existing ANPC instance.
   * Attaches generation-derived fields that the base ANPC class doesn't hold.
   */
  function applyMeta(anpc, schema) {
    if (!anpc) return;
    anpc._genderLabel = schema.genderLabel || null;
    anpc._nationalityLabel = schema.nationalityLabel || null;
    anpc._pronouns = schema.pronouns || null;
    anpc._primarySkill = schema.primarySkill || null;
    anpc._rankLabel = schema.rankLabel || null;
    anpc._motivationLabel = schema.motivationLabel || null;
    anpc._backstoryMotif = schema.backstoryMotif || null;
    anpc.conditionIdx = 0;
    anpc.meta = META;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §9 — INITIALISATION
  // ─────────────────────────────────────────────────────────────────────────

  let _initialised = false;

  /**
   * Initialise the ANPC Manifold layer.
   * Call after SFANPC.initCharacters() and ManifoldKernel.init().
   * @param {object} [opts] {
   *   wingmanFadeStart: 10,
   *   wingmanFadeRange: 5,
   *   onDialog: function
   * }
   */
  function init(opts) {
    if (_initialised) return;
    const o = opts || {};

    if (o.wingmanFadeStart != null) {
      Object.defineProperty(window, 'WINGMAN_FADE_START', { value: o.wingmanFadeStart });
    }

    if (o.onDialog) onDialog(o.onDialog);

    // Apply meta to all already-registered ANPCs.
    // Named characters store their extended fields directly on the instance
    // (ANPC constructor copies them from the schema).  Pass the instance itself
    // as the schema so applyMeta picks up genderLabel, nationalityLabel, etc.
    if (window.SFANPC) {
      SFANPC.getAll().forEach(a => {
        if (!a.meta) applyMeta(a, a);
      });
    }

    // Subscribe to ManifoldKernel event forwarding if available
    if (window.ManifoldKernel) {
      const origEvent = ManifoldKernel.event.bind(ManifoldKernel);
      ManifoldKernel.event = function (type, data) {
        forwardEvent(type);
        return origEvent(type, data);
      };
    }

    _initialised = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §10 — PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  return {
    // Three laws (read-only)
    META,

    // Initialisation
    init,

    // Character generation
    generateAnpc,
    applyMeta,

    // Wingman system
    assignWingman,
    toggleWingman,
    getWingman,
    getWingmanRelevance,
    getEffectiveRelevance,

    // Dynamic behaviour
    tick,
    onDialog,
    forwardEvent,

    // Attribute tables (accessible for extension)
    CALLSIGN_TABLE,
    CALLSIGN_SUFFIX,
    NATIONALITY_TABLE,
    GENDER_TABLE,
    RANK_TABLE,
    SKILL_TABLE,
    BACKSTORY_MOTIF_TABLE,
    MOTIVATION_TABLE,
    CONDITION_TABLE,
    ROLE_BEHAVIORS,
    COMM_ROUTING,
    BEHAVIOR_CATEGORY,
  };
})();

window.ANPCManifold = ANPCManifold;
