/**
 * SFPhrase — Dimensional Phrase Compositor
 * ═══════════════════════════════════════════════════════════════════════
 * Implements simulated autonomy via dimensional programming.
 *
 * Architecture:
 *   Game state → Manifold coordinates (z=xy, z=xy², m=xyz, Schwartz Diamond)
 *   → Dimensional address → Fragment → Composed sentence
 *
 * No iteration. Every point in phrase-space is addressed directly.
 * A word is a point. A sentence is a coordinate in a higher dimension.
 * Short fragments + mix/match = millions of natural combinations.
 *
 * Dimensions:
 *   DIM 0 — opener/interjection     (urgency axis)
 *   DIM 1 — subject reference       (context axis)
 *   DIM 2 — verb / state predicate  (intent axis)
 *   DIM 3 — adjective / qualifier   (severity axis)
 *   DIM 4 — adverb / manner         (personality axis)
 *   DIM 5 — locative / spatial ref  (spatial axis)
 *   DIM 6 — coda / closer           (morale axis)
 *   DIM 7 — interjection override   (z=xy² form layer — sentence shape)
 */

const SFPhrase = (function () {
  'use strict';

  // ── Dimensional Fragment Pools ──────────────────────────────────────
  // Each pool is an array of fragments. The dimensional address is an index
  // derived from game state — no enumeration required.

  // DIM 0: opener — urgency [0..1] → index
  const D0 = [
    // low urgency  ← index 0–3
    'Confirmed.',
    'Copy.',
    'Solid.',
    'Understood.',
    // moderate urgency ← 4–7
    'Alert.',
    'Attention.',
    'Heads up.',
    'Be advised.',
    // high urgency ← 8–11
    'Warning!',
    'Break away!',
    'Evasive action!',
    'Hard break!',
    // critical ← 12–15
    'Mayday!',
    'Critical!',
    'Emergency!',
    'Brace!',
  ];

  // DIM 1: subject noun phrase — context bitmask → index
  const D1 = [
    // player systems ← 0–4
    'hull',
    'shields',
    'fuel reserves',
    'ordnance load',
    'propulsion',
    // enemy ← 5–9
    'hostile',
    'bogey',
    'contact',
    'enemy fighter',
    'heavy target',
    // base/carrier ← 10–14
    'the Resolute',
    'base structure',
    'carrier hull',
    'flight deck',
    'hangar bay',
    // spatial ← 15–19
    'sector',
    'perimeter',
    'bearing',
    'zone',
    'intercept vector',
  ];

  // DIM 2: verb / predicate — intent axis
  const D2 = [
    // status ← 0–4
    'holding',
    'nominal',
    'stable',
    'confirmed',
    'green',
    // degraded ← 5–9
    'weakening',
    'failing',
    'compromised',
    'at risk',
    'critical',
    // action ← 10–14
    'detected',
    'locked',
    'engaging',
    'neutralized',
    'splashed',
    // spatial ← 15–19
    'closing',
    'bearing',
    'clear',
    'inbound',
    'on approach',
  ];

  // DIM 3: adjective — severity axis
  const D3 = [
    // minimal ← 0–3
    'minor',
    'light',
    'partial',
    'slight',
    // moderate ← 4–7
    'significant',
    'heavy',
    'moderate',
    'multiple',
    // severe ← 8–11
    'critical',
    'severe',
    'extreme',
    'catastrophic',
    // numeric descriptors ← 12–15
    'single',
    'paired',
    'triple',
    'massed',
  ];

  // DIM 4: adverb — personality/manner axis (openness × conscientiousness)
  const D4 = [
    // low openness, high conscientiousness (Frostbite style)
    'immediately',
    'at once',
    'now',
    'without delay',
    // high openness, moderate conscientiousness (Hotshot style)
    'fast',
    'quick',
    'sharp',
    'clean',
    // measured/analytical (Lighthouse / Vasquez style)
    'steadily',
    'rapidly',
    'carefully',
    'precisely',
    // calm/reporting
    'confirmed',
    'observed',
    'on record',
    'tracked',
  ];

  // DIM 5: locative / spatial — spatial context
  const D5 = [
    'on your six',
    'at your three',
    'at your nine',
    'dead ahead',
    'high and right',
    'low and left',
    'on approach vector',
    'at bearing',
    'inside the perimeter',
    'outside sensor range',
    'at close range',
    'at extreme range',
    'in sector alpha',
    'in sector bravo',
    'in sector delta',
    'on intercept heading',
  ];

  // DIM 6: coda / closer — morale axis [0..1] → index
  const D6 = [
    // low morale ← 0–3
    'Stay alive.',
    'RTB if needed.',
    'Conserve hull.',
    'Keep options open.',
    // moderate morale ← 4–7
    'Keep it tight.',
    'Watch your spacing.',
    'Stay on target.',
    'Hold formation.',
    // high morale ← 8–11
    'Good hunting.',
    'We have the advantage.',
    'Press the attack.',
    'Well done.',
    // victory/celebration ← 12–15
    'Outstanding.',
    'Sector clear.',
    'All contacts neutralized.',
    'Mission accomplished.',
  ];

  // DIM 7: sentence form — shape layer (z=xy²)
  // Controls how the sentence is structured: short/clipped vs full/expository
  const D7_FORMS = [
    (parts) => parts.filter(Boolean).join(' '),                         // flat: "Warning! hull failing."
    (parts) => { const p = parts.filter(Boolean); return p[0] + ' — ' + p.slice(1).join(' '); }, // em-dash
    (parts) => { const p = parts.filter(Boolean); return p.join(', ') + '.'; },                  // comma-list
    (parts) => parts.filter(Boolean).reverse().join(' '),               // inverted: coda first
  ];

  // ── Manifold coordinate derivation ─────────────────────────────────
  // Layer 3: z = x·y         (urgency × severity → tone)
  // Layer 4: z = x·y²        (form: how the sentence bends)
  // Layer 7: m = x·y·z       (consciousness: full sentence meaning)
  // Schwartz Diamond: zero-crossings → transition moments

  /**
   * Derive dimensional addresses from game state.
   * All values normalised 0..1.
   * Returns integer indices per dimension.
   */
  function _coords(state) {
    const urgency = _clamp01(state.urgency || 0);
    const severity = _clamp01(state.severity || 0);
    const morale = _clamp01(state.morale || 0.5);
    const open = _clamp01(state.openness || 0.5);   // OCEAN openness from ANPC
    const consc = _clamp01(state.conscientiousness || 0.5);
    const spatial = _clamp01(state.spatialFactor || 0);

    // Layer 3: z = urgency × severity
    const z3 = urgency * severity;

    // Layer 4: form modifier z = urgency × severity²
    const z4 = urgency * severity * severity;

    // Layer 7: full consciousness m = urgency × severity × z3
    const m7 = urgency * severity * z3;

    // Schwartz Diamond field value — used for transition/inflection moments
    // cos(u)cos(v)cos(w) - sin(u)sin(v)sin(w) where u,v,w ∈ π×[0,1]
    const u = urgency * Math.PI, v = severity * Math.PI, w = morale * Math.PI;
    const diamond = Math.cos(u) * Math.cos(v) * Math.cos(w) - Math.sin(u) * Math.sin(v) * Math.sin(w);
    const nearZero = Math.abs(diamond) < 0.25; // near zero-crossing → inflection moment

    return {
      dim0: _addrN(urgency, D0.length),    // opener by urgency
      dim1: _addrN(state.subjectCtx || 0, D1.length), // subject by context
      dim2: _addrN(state.intentCtx || 0, D2.length), // verb by intent
      dim3: _addrN(severity, D3.length),    // adjective by severity
      dim4: _addrN(open * (1 - consc * 0.3), D4.length), // adverb by personality
      dim5: _addrN(spatial, D5.length),    // locative by spatial factor
      dim6: _addrN(morale, D6.length),    // coda by morale
      dim7: Math.floor(z4 * D7_FORMS.length) % D7_FORMS.length, // form by z=xy²
      z3, z4, m7, diamond, nearZero,
    };
  }

  // Direct address: n ∈ [0,1] → integer index without iteration
  function _addrN(n, len) {
    return Math.min(Math.floor(_clamp01(n) * len), len - 1);
  }

  function _clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // ── Primary composition API ─────────────────────────────────────────

  /**
   * Compose a sentence from game state.
   * state: {
   *   urgency: 0-1, severity: 0-1, morale: 0-1,
   *   openness: 0-1, conscientiousness: 0-1, spatialFactor: 0-1,
   *   subjectCtx: 0-1 (subject pool selector),
   *   intentCtx: 0-1  (verb pool selector),
   *   tokens: {}       (named tokens to inject: {callsign, bearing, count, ...})
   * }
   */
  function compose(state) {
    const c = _coords(state);
    const tok = state.tokens || {};

    // Select fragments from each dimension
    const opener = D0[c.dim0];
    const subject = tok.subject || D1[c.dim1];
    const verb = tok.verb || D2[c.dim2];
    const adj = tok.adj || D3[c.dim3];
    const adverb = D4[c.dim4];
    const locative = tok.locative || D5[c.dim5];
    const coda = D6[c.dim6];

    // ── Core phrase — depends on z3 (urgency × severity) ──
    let core;
    if (c.z3 < 0.1) {
      // Very low: status report "hull nominal"
      core = `${subject} ${verb}`;
    } else if (c.z3 < 0.3) {
      // Low: qualified status "hull holding, shields stable"
      core = tok.count
        ? `${tok.count} ${subject} ${verb}`
        : `${subject} ${verb}`;
    } else if (c.z3 < 0.55) {
      // Moderate: "heavy contact detected at bearing"
      core = tok.bearing
        ? `${adj} ${subject} ${verb} at ${tok.bearing}`
        : `${adj} ${subject} ${verb}`;
    } else if (c.z3 < 0.78) {
      // High: "Multiple contacts closing — break away immediately"
      core = `${adj} ${D1[c.dim1]} ${verb} ${locative} — ${adverb}`;
    } else {
      // Critical: "CRITICAL! hull failing now — mayday"
      core = `${subject} ${verb} — ${adverb}`;
    }

    // ── Inject named tokens ──
    let result = core;
    if (tok.callsign) result = `${tok.callsign}, ${result}`;
    if (tok.count && !core.includes(tok.count)) result += ` (${tok.count})`;
    if (tok.pct !== undefined) result += ` ${tok.pct}%`;

    // ── Apply form (D7 / z=xy²) ──
    const parts = [opener, result, coda];
    const formed = D7_FORMS[c.dim7](parts);

    // ── Schwartz Diamond inflection: near zero-crossing → sentence inverts (reveal / twist) ──
    if (c.nearZero && Math.random() < 0.35) {
      return `${coda} — ${result}`;
    }

    return formed;
  }

  /**
   * Compose a short tactical callout (no opener/coda).
   * Use for high-frequency in-combat lines.
   */
  function callout(state) {
    const c = _coords(state);
    const tok = state.tokens || {};
    const subject = tok.subject || D1[c.dim1];
    const verb = tok.verb || D2[c.dim2];
    const locative = tok.locative || D5[c.dim5];
    if (c.z3 < 0.4) return `${subject} ${verb}.`;
    if (c.z3 < 0.7) return tok.bearing ? `${subject} ${verb} at ${tok.bearing}.` : `${subject} ${verb} ${locative}.`;
    return `${D3[c.dim3]} ${subject} ${verb} ${locative} — ${D4[c.dim4]}!`;
  }

  /**
   * Compose a status report line (opening + body only).
   * Use for wave start, docking, post-combat.
   */
  function status(state) {
    const c = _coords(state);
    const tok = state.tokens || {};
    const opener = D0[c.dim0];
    const subject = tok.subject || D1[c.dim1];
    const verb = tok.verb || D2[c.dim2];
    const coda = D6[c.dim6];
    if (tok.pct !== undefined) return `${opener} ${tok.callsign ? tok.callsign + ', ' : ''}${subject} ${verb} at ${tok.pct}%. ${coda}`;
    if (tok.count !== undefined) return `${opener} ${tok.count} ${subject} ${verb}. ${coda}`;
    return `${opener} ${subject} ${verb}. ${coda}`;
  }

  /**
   * Build a kill-confirm line.
   * state.tokens: { target, remaining, bearing? }
   */
  function killConfirm(state) {
    const c = _coords(state);
    const tok = state.tokens || {};
    const destroyedWords = ['neutralized', 'splashed', 'destroyed', 'down', 'eliminated', 'confirmed kill'];
    const destroyed = destroyedWords[Math.floor(c.m7 * destroyedWords.length) % destroyedWords.length];
    const target = tok.target || D1[c.dim1];
    const remaining = tok.remaining;
    const coda = D6[c.dim6];
    if (remaining === 0) return `${target} ${destroyed}. Sector clear. ${coda}`;
    const nextPart = tok.bearing ? ` Next at ${tok.bearing}.` : '';
    return `${target} ${destroyed}. ${remaining} ${remaining === 1 ? 'hostile' : 'contacts'} remaining.${nextPart}`;
  }

  /**
   * Compose a wave-start manifest from a contact list.
   * state.tokens: { manifest: [{type, count}], totalHostile, basePct }
   */
  function waveManifest(state) {
    const c = _coords(state);
    const tok = state.tokens || {};
    const items = tok.manifest || [];
    const detectedWords = ['detected', 'on scope', 'confirmed', 'showing', 'bearing'];
    const detected = detectedWords[c.dim2 % detectedWords.length];
    const parts = items.map(({ count, label }) => `${count} ${label}${count > 1 ? 's' : ''}`);
    const manifest = parts.length ? parts.join(', ') : `${tok.totalHostile || '?'} contacts`;
    const baseStr = tok.basePct !== undefined ? ` Base ${_hullStatus(tok.basePct)}.` : '';
    return `Wave ${tok.wave || '?'}. ${manifest} ${detected}.${baseStr}`;
  }

  /**
   * Build a dynamic damage-report string.
   * state.tokens: { system: 'hull'|'shields'|'fuel'|'base', pct, callsign, bearing? }
   */
  function damageReport(state) {
    const c = _coords(state);
    const tok = state.tokens || {};
    const sys = tok.system || 'hull';
    const pct = tok.pct !== undefined ? tok.pct : 100;
    const adviceWords = ['Disengage', 'Break off', 'Evade', 'Pull back', 'Take cover'];
    const watchWords = ['Watch your six', 'Stay sharp', 'Eyes open', 'Heads up', 'Check six'];
    const protectWords = ['Protect the Resolute', 'Cover the base', 'Defend the carrier', 'Keep them off her'];
    const advice = adviceWords[c.dim4 % adviceWords.length];
    const watch = watchWords[c.dim4 % watchWords.length];
    const protect = protectWords[c.dim6 % protectWords.length];
    const cs = tok.callsign ? `${tok.callsign}, ` : '';
    if (sys === 'hull') return `${cs}${_hullStatus(pct)} at ${pct}%. ${watch}.`;
    if (sys === 'shields') return `${_shieldStatus(pct)}. Hull ${pct}%. ${advice}.`;
    if (sys === 'base') return `Base ${_hullStatus(pct)} at ${pct}%. ${protect}.`;
    if (sys === 'fuel') return `${cs}${_fuelStatus(pct)} at ${pct}%.`;
    return `${cs}${sys} at ${pct}%. ${watch}.`;
  }

  // ── Status helpers ──────────────────────────────────────────────────
  // Manifold: pct maps onto a 1-dimensional status space — no if/else chains

  const _HULL_THRESHOLDS = [20, 40, 60, 80];
  const _HULL_LABELS = ['hull critical', 'hull damaged', 'hull holding', 'hull stable', 'hull strong'];
  const _SHIELD_THRESHOLDS = [0, 30, 60];
  const _SHIELD_LABELS = ['shields down', 'shields failing', 'shields weakened', 'shields holding'];
  const _FUEL_THRESHOLDS = [10, 25, 50];
  const _FUEL_LABELS = ['fuel critical', 'fuel low', 'fuel half', 'fuel nominal'];

  function _levelLookup(thresholds, labels, pct) {
    // Traverse the threshold dimension directly — no iteration in spirit,
    // but JS requires it; complexity is O(len) = O(4) ≈ constant
    for (let i = 0; i < thresholds.length; i++) {
      if (pct <= thresholds[i]) return labels[i];
    }
    return labels[labels.length - 1];
  }

  function _hullStatus(pct) { return _levelLookup(_HULL_THRESHOLDS, _HULL_LABELS, pct); }
  function _shieldStatus(pct) { return _levelLookup(_SHIELD_THRESHOLDS, _SHIELD_LABELS, pct); }
  function _fuelStatus(pct) { return _levelLookup(_FUEL_THRESHOLDS, _FUEL_LABELS, pct); }

  // ── Sentence Trait System ───────────────────────────────────────────
  // Personality traits modulate which pools are accessed.
  // An ANPC OCEAN vector [O, C, E, A, N] each [0,1] maps to:
  //   openness      → DIM 7 form variety (high O = more exotic forms)
  //   conscientiousness → DIM 4 manner (high C = precise adverbs)
  //   extraversion  → DIM 0 opener expressiveness
  //   agreeableness → DIM 6 coda warmth
  //   neuroticism   → DIM 0 urgency shift (+N raises urgency index)

  function fromPersonality(ocean, gameState) {
    const [O, C, E, A, N] = ocean;
    return compose({
      urgency: _clamp01((gameState.urgency || 0) + N * 0.2),
      severity: gameState.severity || 0,
      morale: _clamp01(A * 0.4 + (gameState.morale || 0.5) * 0.6),
      openness: O,
      conscientiousness: C,
      spatialFactor: gameState.spatialFactor || 0,
      subjectCtx: gameState.subjectCtx || 0,
      intentCtx: gameState.intentCtx || 0,
      tokens: gameState.tokens || {},
    });
  }

  // ── Logic Gate Layer ────────────────────────────────────────────────
  // Game state predicates used to derive urgency/severity without hardcoding scenarios

  const LOGIC = {
    // Logic gates — combine boolean state into scalar [0,1]
    and: (...vs) => vs.every(Boolean) ? 1 : 0,
    or: (...vs) => vs.some(Boolean) ? 1 : 0,
    xor: (a, b) => (!!a !== !!b) ? 1 : 0,
    nand: (...vs) => vs.every(Boolean) ? 0 : 1,

    // Decision tree — returns index of first true branch
    branch: (...pairs) => {
      for (let i = 0; i < pairs.length - 1; i += 2) {
        if (pairs[i]) return pairs[i + 1];
      }
      return pairs[pairs.length - 1] || 0; // default
    },

    // Graph traversal — given adjacency list, traverse from node → value
    traverse: (graph, start, steps = 1) => {
      let node = start;
      for (let i = 0; i < steps; i++) {
        const next = graph[node];
        if (next === undefined) break;
        node = next;
      }
      return node;
    },
  };

  /**
   * Derive urgency scalar from game state using logic gates.
   * No hardcoded scenarios — pure state composition.
   */
  function deriveUrgency(snap) {
    if (!snap) return 0;
    const hullCrit = snap.hullPct < 25 ? 1 : 0;
    const shieldDown = snap.shieldPct <= 0 ? 1 : 0;
    const fuelCrit = snap.fuelPct < 15 ? 1 : 0;
    const baseCrit = snap.basePct < 25 ? 1 : 0;
    const heavyEnemy = (snap.dreadnoughts > 0 || snap.alienMothership) ? 1 : 0;
    const massAttack = snap.totalHostile > 10 ? 1 : 0;
    const bomberBase = snap.bombers > 0 && snap.basePct < 50 ? 1 : 0;

    // Logic gate: any critical system → high urgency
    const criticalSystem = LOGIC.or(hullCrit, shieldDown, fuelCrit, baseCrit);
    // Logic gate: combat pressure
    const combatPressure = LOGIC.or(heavyEnemy, massAttack, bomberBase);

    // Decision tree: resolve urgency level
    return LOGIC.branch(
      LOGIC.and(criticalSystem, combatPressure), 1.0,   // both → maximum urgency
      criticalSystem, 0.75,  // systems only → very high
      combatPressure, 0.55,  // combat only → high
      snap.totalHostile > 5, 0.35,  // many enemies → moderate
      snap.totalHostile > 0, 0.2,   // some enemies → low
      0.05                                              // quiet → minimal
    );
  }

  /**
   * Derive severity scalar from snap state.
   */
  function deriveSeverity(snap) {
    if (!snap) return 0;
    const invHull = 1 - _clamp01((snap.hullPct || 100) / 100);
    const invShields = 1 - _clamp01((snap.shieldPct || 100) / 100);
    const invBase = 1 - _clamp01((snap.basePct || 100) / 100);
    const enemyRatio = _clamp01((snap.totalHostile || 0) / 15);
    // z = xy: hull degradation × base degradation is the key severity product
    const z3 = invHull * invBase;
    // Blend: manifold z3 + shield factor + enemy pressure
    return _clamp01(z3 * 0.5 + invShields * 0.2 + enemyRatio * 0.3);
  }

  // ── Public API ──────────────────────────────────────────────────────

  return {
    compose,
    callout,
    status,
    killConfirm,
    waveManifest,
    damageReport,
    fromPersonality,
    deriveUrgency,
    deriveSeverity,
    hullStatus: _hullStatus,
    shieldStatus: _shieldStatus,
    fuelStatus: _fuelStatus,
    LOGIC,
    D0, D1, D2, D3, D4, D5, D6,   // exposed for tests
    _coords,                        // exposed for tests
  };
})();

window.SFPhrase = SFPhrase;
