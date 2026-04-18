/**
 * Autonomous Announcer System — Starfighter
 * ──────────────────────────────────────────
 * ANPC-driven dialog system. Every line is produced by the ButterflyFX™
 * ANPC manifold pipeline: personality vectors → scenario vectors →
 * manifold surfaces (z=xy, z=xy²) → 3-tier phrase pools → composite
 * string assembly.
 *
 * Each crew member is a full ANPC with:
 *   - OCEAN personality vector
 *   - Combat state machine (8 states)
 *   - Manifold-driven urgency/tone calculation
 *   - 3-tier phrase selection (Character → Title → Universal)
 *   - Morale with contagion
 *   - Disposition tracking toward player
 *
 * Backwards-compatible: all existing on*() event handlers preserved.
 */

const SFAnnouncer = (function () {

  let _state = null;
  let _addComm = null;
  let _snap = null;
  let _crew = null;
  let _cs = null;
  let _bearing = null;
  let _bearingOf = null;
  let _dim = null;
  let _countHostiles = null;
  let _anpcReady = false; // true once SFANPC system loaded

  // ── Observation memory — what the announcer has seen ──
  const _mem = {
    lastHostileCount: 0,
    lastWave: 0,
    lastPhase: '',
    lastHullPct: 100,
    lastShieldPct: 100,
    lastFuelPct: 100,
    lastBasePct: 100,
    lastKills: 0,
    knownTypes: new Set(),       // enemy types we've already called out
    recentTopics: [],            // last 5 topics announced (avoid repeats)
    phaseAnnounced: {},          // one-shot announcements per phase
    waveTypesAnnounced: new Set(), // enemy types announced this wave
  };

  // ── Cooldown timers per topic ──
  const _cooldowns = {};
  function _onCooldown(topic, duration) {
    if (_cooldowns[topic] && _cooldowns[topic] > 0) return true;
    _cooldowns[topic] = duration;
    return false;
  }
  function _tickCooldowns(dt) {
    for (const k in _cooldowns) {
      if (_cooldowns[k] > 0) _cooldowns[k] -= dt;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § MANIFOLD DIALOG SYSTEM INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════
  // Uses SFPatterns + SFIntents + SFHistory for procedural dialog generation

  /**
   * Generate dialog using manifold system (pattern + intent + history)
   * @param {object} anpc - ANPC personality { role, callsign, temperament, morale }
   * @param {object} trigger - Optional trigger { event, data }
   * @returns {string|null} - Generated dialog or null
   */
  function _generateManifoldDialog(anpc, trigger = {}) {
    // Check if manifold systems are loaded
    if (!window.SFPatterns || !window.SFIntents || !window.SFHistory) {
      return null; // Fall back to legacy system
    }

    // Resolve intent from game state
    const intent = SFIntents.resolveIntent(_state, anpc, trigger);
    if (!intent) return null;

    // Skip if intent was very recently used (within same update cycle)
    if (SFHistory.isIntentRecent(intent)) {
      // Allow only critical intents to repeat
      const criticalIntents = ['ALERT_MISSILE', 'ALERT_LOCK', 'PANIC_DAMAGE'];
      if (!criticalIntents.includes(intent)) return null;
    }

    // Map intent to pattern key
    const patternKey = SFIntents.intentToPattern(intent);

    // Check pattern cooldown/overuse
    if (SFHistory.isPatternOnCooldown(patternKey)) return null;
    if (SFHistory.isPatternOverused(patternKey)) return null;

    // Build context for pattern filling
    const context = SFIntents.buildContext(_state, anpc);

    // Generate multiple candidates and pick best (lowest penalty)
    const candidates = [];
    const maxAttempts = 3;

    for (let i = 0; i < maxAttempts; i++) {
      const text = SFPatterns.generate(patternKey, context);
      if (!text) continue;

      const penalty = SFHistory.calculatePenalty(text, patternKey, intent);
      candidates.push({ text, penalty });
    }

    // No valid candidates
    if (candidates.length === 0) return null;

    // Pick candidate with lowest penalty
    candidates.sort((a, b) => a.penalty - b.penalty);
    const best = candidates[0];

    // Record successful generation
    SFHistory.recordDialog(best.text, patternKey, intent);

    return best.text;
  }

  /**
   * Quick manifold dialog for specific intent (bypasses intent resolution)
   * @param {string} intent - Intent key from SFIntents.INTENTS
   * @param {object} anpc - ANPC data
   * @returns {string|null} - Generated dialog
   */
  function _quickManifoldDialog(intent, anpc) {
    if (!window.SFPatterns || !window.SFHistory) return null;

    const patternKey = intent; // Direct mapping
    if (SFHistory.isPatternOnCooldown(patternKey)) return null;

    const context = window.SFIntents ?
      SFIntents.buildContext(_state, anpc) :
      { callsignSrc: anpc.callsign || 'Wingman', callsignDst: _cs() };

    const text = SFPatterns.generate(patternKey, context);
    if (!text) return null;

    SFHistory.recordDialog(text, patternKey, intent);
    return text;
  }

  // ── Vocabulary pools — word options, never fixed lines ──
  const V = {
    // Picking functions
    contact: ['contact', 'bogey', 'signature', 'return', 'blip'],
    contacts: ['contacts', 'bogeys', 'signatures', 'returns', 'hostiles'],
    detected: ['detected', 'on scope', 'confirmed', 'showing on radar', 'picked up'],
    engaging: ['engaging', 'moving to intercept', 'weapons hot', 'going in', 'on approach'],
    destroyed: ['destroyed', 'neutralized', 'eliminated', 'down', 'splashed', 'confirmed kill'],
    critical: ['critical', 'in the red', 'failing', 'compromised', 'at risk'],
    good: ['solid hit', 'good effect', 'direct hit', 'on target', 'nice shooting'],
    urgent: ['NOW', 'immediately', 'at once', 'this instant'],
    move: ['break off', 'disengage', 'evade', 'get clear', 'pull out'],
    watch: ['watch your six', 'check six', 'stay sharp', 'eyes open', 'heads up'],
    protect: ['cover the base', 'protect the Resolute', 'defend the carrier', 'keep them off her'],
    // Ship-type specific
    drone: ['drone', 'light fighter', 'bogie'],
    interceptor: ['interceptor', 'fast mover', 'flanker'],
    bomber: ['bomber', 'attack ship', 'heavy bomber'],
    predator: ['Predator', 'Predator Drone', 'hunter'],
    dreadnought: ['Dreadnought', 'Hive Throne', 'capital ship'],
    baseship: ['mothership', 'capital ship', 'alien carrier', 'bogie capital'],
    hive: ['the hive', 'alien base', 'hive structure', 'bogie base'],
    hive_queen: ['Hive Queen', 'the Queen', 'alien matriarch', 'primary organism'],
    // Tactical advice
    useTorps: ['use torpedoes', 'switch to torpedoes', 'torps are your best bet', 'heavy ordnance recommended'],
    targetWeak: ['target the underbelly', 'hit the weak point', 'aim for the vents', 'go for their underside'],
    clearEscorts: ['clear the escorts first', 'thin out their fighters', 'deal with the escorts', 'sweep the perimeter'],
    // Status — delegate to SFPhrase if loaded, else local fallback
    hullStatus: (pct) => window.SFPhrase ? SFPhrase.hullStatus(pct) : (pct < 20 ? 'hull critical' : pct < 40 ? 'hull damaged' : pct < 60 ? 'hull holding' : pct < 80 ? 'hull stable' : 'hull strong'),
    shieldStatus: (pct) => window.SFPhrase ? SFPhrase.shieldStatus(pct) : (pct <= 0 ? 'shields down' : pct < 30 ? 'shields failing' : pct < 60 ? 'shields weakened' : 'shields holding'),
    fuelStatus: (pct) => window.SFPhrase ? SFPhrase.fuelStatus(pct) : (pct < 10 ? 'fuel critical' : pct < 25 ? 'fuel low' : pct < 50 ? 'fuel half' : 'fuel nominal'),
    // Launch sequence
    launchReady: ['all systems green', 'boards are green', 'pre-flight nominal', 'launch checks complete', 'all stations report ready'],
    launchGo: ['Launch! Launch! Launch!', 'All ahead — punch it!', 'Light the fires — go go go!', 'Clear the rail — full military!', 'Catapult engaged — godspeed!'],
    launchGodspeed: ['Good hunting.', 'Bring them home.', 'Give them hell.', 'Stay frosty out there.', 'The Resolute is counting on you.'],
    threat: ['threat assessment', 'threat intel', 'tactical picture', 'battlefield report', 'combat intel'],
    sensorReading: ['reading', 'tracking', 'picking up', 'showing', 'registering'],
    combatReady: ['combat ready', 'weapons hot', 'armed and ready', 'standing by for combat', 'all systems nominal'],
  };

  function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function _pickExcluding(arr, exclude) {
    const filtered = arr.filter(x => x !== exclude);
    return filtered.length ? _pick(filtered) : _pick(arr);
  }

  // ── Convenience: derive SFPhrase state from snap ──
  function _phraseState(snap, overrides) {
    if (!window.SFPhrase) return null;
    const urgency = SFPhrase.deriveUrgency(snap);
    const severity = SFPhrase.deriveSeverity(snap);
    return { urgency, severity, morale: (snap ? (snap.hullPct || 100) / 100 : 0.5), ...overrides };
  }

  // ── Compose functions — build natural sentences from state + vocab ──

  function _composeNewContacts(snap, newCount, types) {
    const parts = [];
    if (types.includes('hive-queen')) parts.push(`${_pick(V.hive_queen)}`);
    if (types.includes('dreadnought')) parts.push(`${snap.dreadnoughts} ${_pick(V.dreadnought)}`);
    if (types.includes('predator')) parts.push(`${snap.predators} ${_pick(V.predator)}${snap.predators > 1 ? 's' : ''}`);
    if (types.includes('bomber')) parts.push(`${snap.bombers} ${_pick(V.bomber)}${snap.bombers > 1 ? 's' : ''}`);
    if (types.includes('interceptor')) parts.push(`${snap.interceptors} ${_pick(V.interceptor)}${snap.interceptors > 1 ? 's' : ''}`);
    if (types.includes('enemy')) parts.push(`${snap.enemies} ${_pick(V.drone)}${snap.enemies > 1 ? 's' : ''}`);
    if (types.includes('alien-baseship')) parts.push(`${_pick(V.baseship)}`);
    const manifest = parts.length ? parts.join(', ') : `${newCount} ${_pick(V.contacts)}`;
    return `${manifest} ${_pick(V.detected)}`;
  }

  function _composeKill(type, snap) {
    if (window.SFPhrase) {
      return SFPhrase.killConfirm({
        urgency: SFPhrase.deriveUrgency(snap),
        severity: SFPhrase.deriveSeverity(snap),
        morale: (snap.hullPct || 100) / 100,
        tokens: {
          target: type === 'predator' ? _pick(V.predator)
            : type === 'interceptor' ? _pick(V.interceptor)
              : type === 'bomber' ? _pick(V.bomber)
                : type === 'dreadnought' ? _pick(V.dreadnought)
                  : type === 'alien-baseship' ? _pick(V.baseship)
                    : type === 'hive-queen' ? _pick(V.hive_queen)
                      : _pick(V.drone),
          remaining: snap.totalHostile,
          bearing: snap.priorityTarget ? _bearingOf(snap.priorityTarget) : null,
        }
      });
    }
    // Legacy fallback
    const left = snap.totalHostile;
    const verb = _pick(V.destroyed);
    const typeName = type === 'predator' ? _pick(V.predator)
      : type === 'interceptor' ? _pick(V.interceptor)
        : type === 'bomber' ? _pick(V.bomber)
          : type === 'dreadnought' ? _pick(V.dreadnought)
            : type === 'alien-baseship' ? _pick(V.baseship)
              : type === 'hive-queen' ? _pick(V.hive_queen)
                : _pick(V.drone);
    if (left === 0) return `${typeName} ${verb}. Sector clear. ${_state.kills} kills this wave.`;
    const next = snap.priorityTarget ? ` Next at ${_bearingOf(snap.priorityTarget)}.` : '';
    return `${typeName} ${verb}. ${left} ${left === 1 ? 'hostile' : _pick(V.contacts)} remaining.${next}`;
  }

  function _composeWaveStart(snap) {
    if (window.SFPhrase) {
      const manifest = [];
      if (snap.hiveQueens > 0) manifest.push({ count: snap.hiveQueens, label: _pick(V.hive_queen) });
      if (snap.enemies > 0) manifest.push({ count: snap.enemies, label: _pick(V.drone) });
      if (snap.interceptors > 0) manifest.push({ count: snap.interceptors, label: _pick(V.interceptor) });
      if (snap.bombers > 0) manifest.push({ count: snap.bombers, label: _pick(V.bomber) });
      if (snap.predators > 0) manifest.push({ count: snap.predators, label: _pick(V.predator) });
      if (snap.dreadnoughts > 0) manifest.push({ count: snap.dreadnoughts, label: _pick(V.dreadnought) });
      if (snap.alienMothership) manifest.push({ count: 1, label: _pick(V.baseship) });
      return SFPhrase.waveManifest({
        urgency: SFPhrase.deriveUrgency(snap),
        severity: SFPhrase.deriveSeverity(snap),
        tokens: { manifest, totalHostile: snap.totalHostile, basePct: snap.basePct, wave: _state.wave }
      });
    }
    // Legacy fallback
    const parts = [];
    if (snap.enemies > 0) parts.push(`${snap.enemies} ${_pick(V.drone)}${snap.enemies > 1 ? 's' : ''}`);
    if (snap.interceptors > 0) parts.push(`${snap.interceptors} ${_pick(V.interceptor)}${snap.interceptors > 1 ? 's' : ''}`);
    if (snap.bombers > 0) parts.push(`${snap.bombers} ${_pick(V.bomber)}${snap.bombers > 1 ? 's' : ''}`);
    if (snap.predators > 0) parts.push(`${snap.predators} ${_pick(V.predator)}${snap.predators > 1 ? 's' : ''}`);
    if (snap.dreadnoughts > 0) parts.push(`${snap.dreadnoughts} ${_pick(V.dreadnought)}`);
    if (snap.alienMothership) parts.push(`${_pick(V.baseship)}`);
    const manifest = parts.length ? parts.join(', ') : `${snap.totalHostile} ${_pick(V.contacts)}`;
    return `Wave ${_state.wave}. ${manifest} ${_pick(V.detected)}. Base ${V.hullStatus(snap.basePct)}.`;
  }

  function _composeLaunchClear(snap) {
    const count = snap.totalHostile;
    const close = snap.closestM < 3000 ? ` Nearest ${_pick(V.contact)} ${snap.closestM}m.` : '';
    return `Clear of bay. ${count} ${_pick(V.contacts)} on scope.${close} Weapons free.`;
  }

  function _composeDamageReport(snap, what) {
    if (window.SFPhrase) {
      return SFPhrase.damageReport({
        urgency: SFPhrase.deriveUrgency(snap),
        severity: SFPhrase.deriveSeverity(snap),
        tokens: {
          system: what,
          pct: what === 'hull' ? snap.hullPct : what === 'shields' ? snap.shieldPct : what === 'base' ? snap.basePct : snap.fuelPct,
          callsign: _cs(),
        }
      });
    }
    // Legacy fallback
    if (what === 'hull') return `${_cs()}, ${V.hullStatus(snap.hullPct)} at ${snap.hullPct}%. ${_pick(V.watch)}.`;
    if (what === 'shields') return `${V.shieldStatus(snap.shieldPct)}. Hull ${snap.hullPct}%. ${_pick(V.move)}.`;
    if (what === 'base') return `Base ${V.hullStatus(snap.basePct)} at ${snap.basePct}%. ${_pick(V.protect)}.`;
    return `${_cs()}, hull ${snap.hullPct}%, shields ${snap.shieldPct}%.`;
  }

  function _composePlayerStatus(snap) {
    const parts = [`Hull ${snap.hullPct}%`];
    if (snap.shieldPct < 100) parts.push(`shields ${snap.shieldPct}%`);
    if (snap.fuelPct < 50) parts.push(`fuel ${snap.fuelPct}%`);
    if (snap.torpCount > 0) parts.push(`${snap.torpCount} torpedoes`);
    return parts.join(', ');
  }

  function _composeTacticalAdvice(snap) {
    if (snap.hiveQueens > 0) return `${_pick(V.hive_queen)} on scope. Target weak points — ${_pick(V.targetWeak)}.`;
    if (snap.dreadnoughts > 0 && snap.torpCount > 0) return `${_pick(V.dreadnought)} active. ${_pick(V.useTorps)}.`;
    if (snap.predators > 0) return `${_pick(V.predator)} on scope. ${_pick(V.targetWeak)}.`;
    if (snap.bombers > 0 && snap.basePct < 60) return `${_pick(V.bomber)}s heading for base. ${_pick(V.protect)}.`;
    if (snap.alienMothership && snap.totalHostile <= 4) return `Escorts thinned out. ${_pick(V.baseship)} exposed. Press the attack.`;
    if (snap.alienHive && snap.totalHostile <= 2) return `${_pick(V.hive)} exposed. Use this window.`;
    return null;
  }

  // ── Event handlers — called by core.js when things happen ──

  function onWaveStart() {
    const snap = _snap();
    _mem.lastWave = _state.wave;
    _mem.waveTypesAnnounced.clear();

    // Update scenario vector
    _updateScenario('contacts_hostile');
    _transitionWingmen('hostiles_confirmed');

    // Sensor officer reports what's on scope
    const anpcLine = _anpcSpeak('sensor', 'combat_engage', { count: snap.totalHostile });
    if (anpcLine) {
      _addComm(_crew('sensor'), anpcLine, 'warning');
    } else {
      _addComm(_crew('sensor'), _composeWaveStart(snap), 'warning');
    }

    // Tactical gives advice based on what's out there
    const advice = _composeTacticalAdvice(snap);
    if (advice) _addComm(_crew('tactical'), advice, 'base');

    // Wingman acknowledge
    const wingAck = _wingmanSpeak('mission_comm');
    if (wingAck) _addComm(wingAck.sender, wingAck.msg, wingAck.type);

    _mem.lastHostileCount = snap.totalHostile;
  }

  function onLaunchClear() {
    const snap = _snap();
    _addComm(_crew('deck'), `${_cs()}, ${_composeLaunchClear(snap)}`, 'base');

    // Wingman check-in — ANPC personality-driven
    if (_state.aiWingmen) {
      const wingLine = _wingmanSpeak('tactical_coord');
      if (wingLine) {
        _addComm(wingLine.sender, wingLine.msg, wingLine.type);
      } else {
        const callsign = `Alpha-${Math.floor(Math.random() * 3) + 1}`;
        const close = snap.closestM < 5000 && snap.closestPos
          ? `Contact at ${_bearing(snap.closestPos)}. ${_pick(V.engaging)}.`
          : `${snap.totalHostile} ${_pick(V.contacts)}. Forming up.`;
        _addComm(callsign, close, 'ally');
      }
    }

    // Transition wingmen to alert
    _transitionWingmen('contacts_detected');
  }

  function onKill(type) {
    const snap = _snap();
    _updateScenario('enemy_destroyed');

    // Update wingmen morale on kill
    if (_anpcReady) {
      const wingmen = SFANPC.getByRole('SF-WING');
      for (const w of wingmen) {
        w.adjustMorale(SFANPC.MORALE_MODIFIERS.ally_kill);
      }
    }

    if (snap.totalHostile === 0) {
      // Sector clear — command announces
      _transitionWingmen('hostiles_cleared');

      // Try manifold system first
      const manifoldLine = _quickManifoldDialog('REPORT_KILL', {
        role: 'command',
        callsign: _crew('command')
      });
      const cmdLine = manifoldLine || _anpcSpeak('command', 'tactical_coord', { remaining: 0 });
      _addComm(_crew('command'), cmdLine || _composeKill(type, snap), 'base');

      // Wingman celebration
      const wingCel = _wingmanSpeak('morale_banter');
      if (wingCel) _addComm(wingCel.sender, wingCel.msg, wingCel.type);
    } else if (type === 'dreadnought') {
      // Try manifold kill report
      const manifoldKill = _quickManifoldDialog('REPORT_KILL', {
        role: 'command',
        callsign: _crew('command')
      });
      _addComm(_crew('command'), manifoldKill || _composeKill(type, snap), 'base');

      const sensLine = _anpcSpeak('sensor', 'kill_confirm', { remaining: snap.totalHostile, target: _pick(V.dreadnought) });
      _addComm(_crew('sensor'), sensLine || `${_pick(V.dreadnought)} signal lost. ${snap.totalHostile} ${_pick(V.contacts)} remain.`, 'base');
    } else {
      // Wingman gets kill confirm if ANPC available, otherwise try manifold
      const wingKill = _wingmanSpeak('kill_confirm', { remaining: snap.totalHostile });
      if (wingKill && Math.random() < 0.4) {
        _addComm(wingKill.sender, wingKill.msg, wingKill.type);
      } else {
        const manifoldKill = _quickManifoldDialog('REPORT_KILL', {
          role: 'wingman',
          callsign: _crew('tactical')
        });
        _addComm(_crew('tactical'), manifoldKill || _composeKill(type, snap), 'base');
      }
    }
  }

  function onVictory() {
    const snap = _snap();
    _updateScenario('objective_complete');

    // Boost all morale on victory
    if (_anpcReady) {
      for (const anpc of SFANPC.getAllied()) {
        anpc.adjustMorale(SFANPC.MORALE_MODIFIERS.victory);
      }
    }

    // Commander announces
    const cmdLine = _anpcSpeak('command', 'mission_comm', {
      intel: `all contacts neutralized. Score ${_state.score}. Mission complete`,
      missionBrief: `Hive destroyed. Score ${_state.score}. All ships return to base`
    });
    _addComm(_crew('command'), cmdLine || `${_pick(V.hive)} ${_pick(V.destroyed)}! Score ${_state.score}. Mission complete.`, 'base');

    // Wingman celebration
    const wingCel = _wingmanSpeak('morale_banter');
    if (wingCel) _addComm(wingCel.sender, wingCel.msg, wingCel.type);
  }

  function onMilitaryLost() {
    const snap = _snap();
    _updateScenario('ally_destroyed');
    const line = _anpcSpeak('command', 'emergency', { reason: `military ship lost, base ${V.hullStatus(snap.basePct)}` });
    _addComm(_crew('command'), line || `Military ship lost. Base ${V.hullStatus(snap.basePct)} at ${snap.basePct}%. No resupply available.`, 'base');
  }

  function onCivilianLost() {
    _updateScenario('ally_destroyed');
    const line = _anpcSpeak('command', 'emergency', { reason: `civilian station destroyed, mission failed` });
    _addComm(_crew('command'), line || `Civilian station ${_pick(V.destroyed)}. ${_state.kills} kills, score ${_state.score}. Mission failed.`, 'base');
  }

  function onAllyDown() {
    const snap = _snap();
    _updateScenario('ally_destroyed');

    // Propagate morale loss
    if (_anpcReady) {
      const wingmen = SFANPC.getByRole('SF-WING');
      for (const w of wingmen) {
        w.adjustMorale(SFANPC.MORALE_MODIFIERS.ally_destroyed);
      }
      SFANPC.propagateMorale(wingmen[0], SFANPC.MORALE_MODIFIERS.ally_destroyed);
    }

    // Wingman emergency call
    const wingEmerg = _wingmanSpeak('emergency');
    if (wingEmerg) {
      _addComm(wingEmerg.sender, wingEmerg.msg, wingEmerg.type);
    } else {
      const callsign = `Alpha-${Math.floor(Math.random() * 3) + 1}`;
      _addComm(callsign, `Going down! ${snap.totalHostile} ${_pick(V.contacts)} still active. ${_pick(V.protect)}!`, 'ally');
    }
  }

  function onPlayerDestroyed(reason, livesLeft, maxLives) {
    const snap = _snap();
    const hostiles = _countHostiles();
    _updateScenario('ally_destroyed');

    if (livesLeft <= 0) {
      _addComm(_crew('command'), `Final interceptor lost. ${hostiles} ${_pick(V.contacts)} still active.`, 'warning');
    } else {
      const slot = maxLives - livesLeft;
      _addComm(_crew('command'), `Pilot ${slot} of ${maxLives} lost. ${reason}. Replacement launching.`, 'warning');
      _addComm(_crew('sensor'), `${hostiles} ${_pick(V.contacts)} active. Wave ${_state.wave}. Base ${V.hullStatus(snap.basePct)}.`, 'base');
      // Wingman reacts to player death
      const wingReact = _wingmanSpeak('damage_report');
      if (wingReact) _addComm(wingReact.sender, wingReact.msg, wingReact.type);
    }
  }

  function onRespawnReady() {
    const snap = _snap();
    const hostiles = _countHostiles();
    const line = _anpcSpeak('deck', 'status_update', { status: `replacement on rail, ${hostiles} hostiles active, wave ${_state.wave}` });
    _addComm(_crew('deck'), line || `${_cs()}, replacement on rail. ${hostiles} ${_pick(V.contacts)} active. Wave ${_state.wave}.`, 'base');
  }

  function onWaveClear() {
    const snap = _snap();
    _updateScenario('objective_complete');
    const line = _anpcSpeak('tactical', 'sector_clear', { kills: _state.kills, wave: _state.wave });
    _addComm(_crew('tactical'), line || `${_cs()}, sector clear. ${_state.kills} kills. Return to base.`, 'base');
  }

  function onAutopilotEngage() {
    const snap = _snap();
    const dist = Math.floor(_state.player.position.distanceTo(_state.baseship.position));
    const line = _anpcSpeak('ops', 'status_update', { status: `autopilot engaged, ${dist}m to base` });
    _addComm(_crew('ops'), line || `${_cs()}, autopilot engaged. ${dist}m to base.`, 'base');
  }

  function onDock(who) {
    const snap = _snap();
    const line = _anpcSpeak('deck', 'status_update', { status: `docking confirmed, ${_state.kills} kills, score ${_state.score}, ${V.hullStatus(snap.hullPct)}`, score: _state.score });
    _addComm(_crew('deck'), line || `${_cs()}, docking confirmed. ${_state.kills} kills, score ${_state.score}. ${V.hullStatus(snap.hullPct)}.`, 'base');
  }

  function onTankerDeploy() {
    const snap = _snap();
    const line = _anpcSpeak('ops', 'support_ops', { supportShip: 'tanker', status: `${V.fuelStatus(snap.fuelPct)}, ${V.hullStatus(snap.hullPct)}` });
    _addComm(_crew('ops'), line || `${_cs()}, tanker deployed. ${V.fuelStatus(snap.fuelPct)}, ${V.hullStatus(snap.hullPct)}.`, 'base');
  }

  function onTankerDock() {
    const snap = _snap();
    _addComm('Lifeline', `${_cs()}, docking. Fuel ${snap.fuelPct}%, hull ${snap.hullPct}%. Resupplying.`, 'ally');
  }

  function onTankerDone() {
    const snap = _snap();
    _addComm('Lifeline', `${_cs()}, resupply done. Fuel ${snap.fuelPct}%, hull ${snap.hullPct}%.`, 'ally');
  }

  function onMedicDeploy(callsign) {
    const snap = _snap();
    const line = _anpcSpeak('ops', 'support_ops', { supportShip: `medical frigate '${callsign}'`, status: `${V.hullStatus(snap.hullPct)}, ${V.shieldStatus(snap.shieldPct)}` });
    _addComm(_crew('ops'), line || `${_cs()}, medical frigate '${callsign}' dispatched. ${V.hullStatus(snap.hullPct)}, ${V.shieldStatus(snap.shieldPct)}.`, 'base');
  }

  function onMedicDock(callsign) {
    const snap = _snap();
    _addComm(callsign, `${_cs()}, docking. Hull ${snap.hullPct}%, shields ${snap.shieldPct}%. Beginning repair.`, 'ally');
  }

  function onMedicProgress(callsign) {
    const snap = _snap();
    if (snap.hullPct < 100 || snap.shieldPct < 100) {
      _addComm(callsign, `Hull ${snap.hullPct}%, shields ${snap.shieldPct}%. Repair in progress.`, 'ally');
    }
  }

  function onMedicDone(callsign) {
    const snap = _snap();
    _addComm(callsign, `${_cs()}, repair complete. Hull ${snap.hullPct}%, shields ${snap.shieldPct}%. Returning to station.`, 'ally');
  }

  // ── Support Call System ──

  function onSupportDenied(type) {
    const ship = type === 'tanker' ? 'tanker' : 'medical frigate';
    const line = _anpcSpeak('ops', 'support_ops', { supportShip: ship, reason: 'conditions not critical enough', status: 'request denied' });
    _addComm(_crew('ops'), line || `${_cs()}, ${ship} request denied. Conditions not critical enough. Keep fighting.`, 'base');
  }

  function onSupportAccepted(type, name) {
    const snap = _snap();
    if (type === 'tanker') {
      _addComm(name, `${_cs()}, copy. Fueling and rearm standing by. Engaging your autopilot. ${V.fuelStatus(snap.fuelPct)}.`, 'ally');
    } else {
      _addComm(name, `${_cs()}, acknowledged. Emergency repair authorized. Taking helm control. ${V.hullStatus(snap.hullPct)}.`, 'ally');
    }
  }

  function onSupportDock(type, name) {
    const snap = _snap();
    if (type === 'tanker') {
      _addComm(name, `${_cs()}, hard dock. Beginning fuel transfer and ordnance load. Hull ${snap.hullPct}%, fuel ${snap.fuelPct}%.`, 'ally');
    } else {
      _addComm(name, `${_cs()}, locked on. Hull repair underway. Hull ${snap.hullPct}%, shields ${snap.shieldPct}%.`, 'ally');
    }
  }

  function onSupportReturn(type) {
    const line = _anpcSpeak('ops', 'support_ops', { supportShip: type, status: `${type === 'tanker' ? 'resupply' : 'repair'} complete, returning to combat zone` });
    _addComm(_crew('ops'), line || `${_cs()}, ${type === 'tanker' ? 'resupply' : 'repair'} complete. Autopilot returning you to combat zone.`, 'base');
  }

  function onSupportComplete() {
    const line = _anpcSpeak('ops', 'support_ops', { supportShip: 'support', status: 'controls released' });
    _addComm(_crew('ops'), line || `${_cs()}, controls released. You have the stick. Good hunting.`, 'base');
  }

  function onHeavyOrdnance() {
    const snap = _snap();
    _updateScenario('hull_critical');
    _addComm(_crew('sensor'), `${_cs()}, heavy ordnance incoming! ${_composePlayerStatus(snap)}. Brace!`, 'warning');
    // Wingman warns
    const wingWarn = _wingmanSpeak('tactical_coord', { direction: 'hard' });
    if (wingWarn) _addComm(wingWarn.sender, wingWarn.msg, wingWarn.type);
  }

  function onGoodHit() {
    const snap = _snap();
    // Disposition boost: impressive kill
    if (_anpcReady) SFANPC.shiftDisposition('ANPC-SF-0042', 'impressive_kill');
    _addComm(_crew('tactical'), `${_pick(V.good)}, ${_cs()}! Hull ${snap.hullPct}%.`, 'base');
  }

  function onPlasmaHit() {
    const snap = _snap();
    _updateScenario('hull_critical');
    const line = _anpcSpeak('sensor', 'hazard_warning', { hazard: `plasma impact, ${V.shieldStatus(snap.shieldPct)}` });
    _addComm(_crew('sensor'), line || `${_cs()}, plasma impact! ${V.shieldStatus(snap.shieldPct)}. ${_pick(V.move)}!`, 'warning');
  }

  function onDisabled() {
    const snap = _snap();
    _updateScenario('hull_critical');
    const line = _anpcSpeak('tactical', 'hazard_warning', { hazard: `systems disabled, hull ${snap.hullPct}%` });
    _addComm(_crew('tactical'), line || `${_cs()}, systems disabled! Hull ${snap.hullPct}%. Countermeasures deploying!`, 'warning');
  }

  function onSystemsRestore() {
    const snap = _snap();
    const line = _anpcSpeak('tactical', 'status_update', { status: `systems back online, ${_composePlayerStatus(snap)}` });
    _addComm(_crew('tactical'), line || `${_cs()}, systems back online! ${_composePlayerStatus(snap)}. ${_pick(V.move)}!`, 'base');
  }

  function onHullBreach() {
    const snap = _snap();
    _updateScenario('hull_critical');
    const sLine = _anpcSpeak('sensor', 'hazard_warning', { hazard: `hull breach, organism attached, hull ${snap.hullPct}%` });
    _addComm(_crew('sensor'), sLine || `Hull breach! Organism attached! Hull ${snap.hullPct}%.`, 'warning');
    const tLine = _anpcSpeak('tactical', 'emergency', { reason: `organism on hull — afterburner or RTB` });
    _addComm(_crew('tactical'), tLine || `${_cs()}, afterburner ${_pick(V.urgent)}! Shake it off or RTB!`, 'warning');
  }

  function onOrganismClear() {
    const snap = _snap();
    const line = _anpcSpeak('tactical', 'status_update', { status: `organism clear, hull ${snap.hullPct}%` });
    _addComm(_crew('tactical'), line || `${_cs()}, organism clear! Hull ${snap.hullPct}%. Keep moving!`, 'base');
  }

  function onOrganismDeep() {
    const snap = _snap();
    _updateScenario('hull_critical');
    const line = _anpcSpeak('sensor', 'emergency', { reason: `organism too deep, hull ${snap.hullPct}% — RTB now` });
    _addComm(_crew('sensor'), line || `${_cs()}, too deep to dislodge! Hull ${snap.hullPct}%. RTB ${_pick(V.urgent)}!`, 'warning');
  }

  function onOrganismInside() {
    const snap = _snap();
    _updateScenario('hull_critical');
    const line = _anpcSpeak('sensor', 'emergency', { reason: `hull breached, organism inside the ship, hull ${snap.hullPct}%` });
    _addComm(_crew('sensor'), line || `Hull breached! Organism inside the ship! Hull ${snap.hullPct}%.`, 'warning');
  }

  function onOrganismProgress(pct) {
    _updateScenario('hull_critical');
    if (pct > 80) {
      const line = _anpcSpeak('tactical', 'emergency', { reason: `imminent breach — ${pct}%` });
      _addComm(_crew('tactical'), line || `Imminent breach — ${pct}%! Land ${_pick(V.urgent)}!`, 'warning');
    } else if (pct > 50) {
      const line = _anpcSpeak('sensor', 'hazard_warning', { hazard: `organism at ${pct}%, cockpit seal failing` });
      _addComm(_crew('sensor'), line || `Organism at ${pct}%. Cockpit seal failing.`, 'warning');
    } else {
      const line = _anpcSpeak('sensor', 'hazard_warning', { hazard: `organism in ventilation — ${pct}% to cockpit` });
      _addComm(_crew('sensor'), line || `Organism in ventilation — ${pct}% to cockpit.`, 'warning');
    }
  }

  function onEmergencyRTB() {
    _updateScenario('hull_critical');
    const line = _anpcSpeak('command', 'emergency', { reason: 'emergency RTB, all power to engines' });
    _addComm(_crew('command'), line || `Emergency RTB engaged! All power to engines!`, 'warning');
  }

  function onEMP(count, duration) {
    if (count > 0) {
      const line = _anpcSpeak('tactical', 'tactical_coord', { remaining: count, intel: `EMP — ${count} disabled for ${duration}s` });
      _addComm(_crew('tactical'), line || `EMP — ${count} ${count === 1 ? _pick(V.contact) : _pick(V.contacts)} disabled. ${duration}s.`, 'base');
    } else {
      const line = _anpcSpeak('tactical', 'status_update', { status: `EMP fired, no contacts in range` });
      _addComm(_crew('tactical'), line || `EMP fired — no ${_pick(V.contacts)} in range.`, 'base');
    }
  }

  function onWeaponSwitch(name) {
    const line = _anpcSpeak('tactical', 'status_update', { status: `weapon: ${name}` });
    _addComm(_crew('tactical'), line || `Weapon: ${name}`, 'base');
  }

  function onDockRequest() {
    const snap = _snap();
    const line = _anpcSpeak('ops', 'status_update', { status: `dock request approved, ${_composePlayerStatus(snap)}` });
    _addComm(_crew('ops'), line || `${_cs()}, dock request approved. Fly to base. ${_composePlayerStatus(snap)}.`, 'base');
  }

  function onPredatorConsume() {
    const snap = _snap();
    _updateScenario('ally_destroyed');
    const line = _anpcSpeak('sensor', 'emergency', { reason: `fighter consumed by Predator, pilot lost, ${snap.totalHostile} remain` });
    _addComm(_crew('sensor'), line || `Fighter consumed by ${_pick(V.predator)}. Pilot lost. ${snap.totalHostile} ${_pick(V.contacts)} remain.`, 'warning');
  }

  function onPredatorMalfunction() {
    const snap = _snap();
    const line = _anpcSpeak('science', 'tactical_coord', { intel: `Predator turned on its own — hive control breakdown`, remaining: snap.totalHostile });
    _addComm(_crew('science'), line || `${_pick(V.predator)} turned on its own — hive control breakdown. ${snap.totalHostile} ${_pick(V.contacts)} remain.`, 'base');
  }

  function onHiveDiscovered(hive) {
    _updateScenario('boss_spawn');
    _transitionWingmen('hostiles_confirmed');
    _addComm(_crew('sensor'), `${_pick(V.hive)} ${_pick(V.detected)}! Bearing ${_bearingOf(hive)}.`, 'warning');
    _addComm(_crew('command'), `Primary objective located. ${_pick(V.clearEscorts)}.`, 'warning');
    // Wingman reacts to boss
    const wingReact = _wingmanSpeak('combat_engage');
    if (wingReact) _addComm(wingReact.sender, wingReact.msg, wingReact.type);
  }

  function onDecontamination() {
    const snap = _snap();
    const line = _anpcSpeak('deck', 'status_update', { status: `decontamination complete, hull ${snap.hullPct}%` });
    _addComm(_crew('deck'), line || `Decontamination complete. Hull ${snap.hullPct}%.`, 'base');
  }

  function onBayReady() {
    const snap = _snap();
    const line = _anpcSpeak('deck', 'status_update', { status: `wave ${_state.wave} standing by, ${_composePlayerStatus(snap)}`, wave: _state.wave });
    _addComm(_crew('deck'), line || `${_cs()}, wave ${_state.wave} standing by. ${_composePlayerStatus(snap)}. Launch when ready.`, 'base');

    // Wave 1 only: dramatic backstory narration before launch
    if (_state.wave === 1) {
      _deliverFirstMissionBriefing();
    }
  }

  // ── First mission backstory — narrated by Cdr. Vasquez in the launch bay ──
  function _deliverFirstMissionBriefing() {
    setTimeout(() => {
      _addComm(_crew('command'),
        'Attention all crew. Classified intelligence report — eyes only.',
        'warning');
    }, 1200);

    setTimeout(() => {
      _addComm(_crew('command'),
        'Seventeen months ago, deep-space array Delta-7 went dark. No distress signal. No wreckage. Gone.',
        'base');
    }, 5500);

    setTimeout(() => {
      _addComm(_crew('sensor'),
        'What emerged from that silence we\'ve designated HIVE SIGMA. Organic-metallic hybrid ships — grown, not built. They don\'t communicate. They don\'t negotiate. They consume.',
        'warning');
    }, 11000);

    setTimeout(() => {
      _addComm(_crew('tactical'),
        'HIVE SIGMA has reached Earth orbit. Standard missile defenses are ineffective against their bio-hull. Lasers and proton torpedoes are your only confirmed kill methods.',
        'warning');
    }, 17500);

    setTimeout(() => {
      _addComm(_crew('command'),
        `You launch from UEDF Battleship Resolute — Earth's last active heavy carrier. If she falls, the orbital defense line collapses. There is no fallback position.`,
        'base');
    }, 24000);

    setTimeout(() => {
      _addComm(_crew('command'),
        `Callsign ${_cs()} — you are weapons free. Good hunting. For Earth.`,
        'warning');
    }, 30000);
  }

  function onLaunchStart() {
    const wave = _state.wave;
    const snap = _snap();
    const basePct = snap.basePct;

    // ── Phase 1 (0s): Deck officer — launch commit (ANPC: Lighthouse) ──
    const deckLine = _anpcForceSpeak('deck', 'launch_prep', { wave, status: `launching wave ${wave}` });
    _addComm(_crew('deck'), deckLine || `${_cs()}, ${_pick(V.launchReady)}. Launching wave ${wave}.`, 'base');

    // ── Phase 2 (~1.5s): Command — mission context (ANPC: Resolute Actual) ──
    setTimeout(() => {
      const s = _snap();
      const pilotSlot = Math.max(1, _state.maxLives - _state.livesRemaining + 1);
      const baseNote = basePct < 50 ? ` Resolute hull at ${basePct}% — she needs cover.` : '';
      let brief;
      if (wave === 1) {
        brief = `First sortie — calibrate weapons on initial contacts.${baseNote}`;
      } else {
        const intensity = s.totalHostile > 10 ? 'Heavy resistance expected.' : s.totalHostile > 5 ? 'Moderate opposition.' : 'Manageable numbers.';
        brief = `${intensity}${baseNote}`;
      }
      const cmdLine = _anpcForceSpeak('command', 'launch_prep', { wave, pilotSlot, maxLives: _state.maxLives, missionBrief: brief });
      _addComm(_crew('command'), cmdLine || `Pilot ${pilotSlot} of ${_state.maxLives}, wave ${wave}. ${brief}`, 'base');
    }, 1500);

    // ── Phase 3 (~3.5s): Sensor — threat briefing (ANPC: Scope) ──
    setTimeout(() => {
      const s = _snap();
      let threats, watchLine;
      if (wave >= 2) {
        const tList = [];
        if (wave >= 6 && (wave === 6 || (wave - 6) % 5 === 0)) tList.push(_pick(V.dreadnought));
        if (wave >= 4) tList.push(`${_pick(V.predator)}s`);
        if (wave >= 3) tList.push(`${_pick(V.bomber)}s`);
        if (wave >= 2) tList.push(`${_pick(V.interceptor)}s`);
        tList.push(`${_pick(V.drone)}s`);
        threats = tList.join(', ');
        watchLine = _pick(V.watch);
      } else {
        threats = 'light contacts only';
        watchLine = 'training-weight targets';
      }
      const sensLine = _anpcForceSpeak('sensor', 'threat_brief', { threats, watchPhrase: watchLine });
      _addComm(_crew('sensor'), sensLine || `${_pick(V.threat)}: ${_pick(V.sensorReading)} ${threats}. ${watchLine}.`, wave >= 2 ? 'warning' : 'info');
    }, 3500);

    // ── Phase 4 (~5.5s): Tactical — advice (ANPC: XO Tanaka) ──
    setTimeout(() => {
      let advice;
      if (wave >= 6 && (wave === 6 || (wave - 6) % 5 === 0)) {
        advice = `${_pick(V.dreadnought)} intel on file. ${_pick(V.useTorps)}.`;
      } else if (wave >= 4) {
        advice = `${_pick(V.predator)} expected. ${_pick(V.targetWeak)}.`;
      } else if (wave >= 3) {
        advice = `${_pick(V.bomber)}s will target the Resolute. ${_pick(V.protect)}.`;
      } else if (wave >= 2) {
        advice = `${_pick(V.interceptor)}s inbound — they're fast. ${_pick(V.watch)}.`;
      } else {
        advice = `Weapons free on all targets.`;
      }
      const tacLine = _anpcForceSpeak('tactical', 'tactical_coord', {
        intel: advice, tacticalAdvice: advice, remaining: 0,
      });
      _addComm(_crew('tactical'), tacLine || `${advice} ${_pick(V.combatReady)}.`, wave >= 3 ? 'warning' : 'base');
    }, 5500);

    // ── Phase 5 (~7.5s): XO — launch call (ANPC: Resolute Actual) ──
    setTimeout(() => {
      const goLine = _anpcForceSpeak('command', 'launch_go', {});
      _addComm(_crew('command'), goLine || `${_pick(V.launchGo)}`, 'warning');
    }, 7500);

    // ── Phase 6 (~9s): Command — send-off (ANPC: Resolute Actual) ──
    setTimeout(() => {
      const sendLine = _anpcForceSpeak('command', 'launch_sendoff', {});
      _addComm(_crew('command'), sendLine || `${_pick(V.launchGodspeed)}`, 'base');
    }, 9000);
  }

  function onPracticeStart() {
    const snap = _snap();
    const line = _anpcSpeak('deck', 'status_update', { status: 'practice range active, targets deployed' });
    _addComm(_crew('deck'), line || `${_cs()}, practice range active. Targets deployed. Press Escape when ready.`, 'base');
  }

  function onPracticeEnd() {
    const line = _anpcSpeak('deck', 'status_update', { status: 'practice complete, preparing for launch' });
    _addComm(_crew('deck'), line || `${_cs()}, practice complete. Preparing for launch.`, 'base');
  }

  function onPause() { _addComm('SYSTEM', 'Game paused.', 'base'); }
  function onResume() { _addComm('SYSTEM', 'Game resumed.', 'base'); }

  function onSecured() {
    const line = _anpcSpeak('deck', 'status_update', { status: `fighter secured, wave ${_state.wave} standing by` });
    _addComm(_crew('deck'), line || `${_cs()}, fighter secured. Wave ${_state.wave} standing by.`, 'base');
  }

  function onWaveComplete(prevWave) {
    const snap = _snap();
    _updateScenario('objective_complete');
    const line = _anpcSpeak('command', 'sector_clear', { kills: _state.kills, wave: prevWave });
    _addComm(_crew('command'), line || `Wave ${prevWave} complete. ${_state.kills} kills. Rearming for wave ${_state.wave}.`, 'base');
  }

  function onNextWaveIntel() {
    const snap = _snap();
    const threats = [];
    if (_state.wave >= 6 && (_state.wave === 6 || (_state.wave - 6) % 5 === 0)) threats.push(_pick(V.dreadnought));
    if (_state.wave >= 4) threats.push(_pick(V.predator));
    if (_state.wave >= 3) threats.push(_pick(V.bomber));
    if (_state.wave >= 2) threats.push(_pick(V.baseship));
    const threatStr = threats.length ? threats.join(', ') : 'standard formation';
    const line = _anpcSpeak('sensor', 'threat_brief', { threats: threatStr, watchPhrase: `base ${V.hullStatus(snap.basePct)}` });
    if (line) {
      _addComm(_crew('sensor'), line, 'warning');
    } else {
      const intel = threats.length ? `${threats[0]} signature ${_pick(V.detected)}.` : `Standard formation expected.`;
      _addComm(_crew('sensor'), `Wave ${_state.wave} intel: ${intel} Base ${V.hullStatus(snap.basePct)}.`, 'warning');
    }
  }

  // ── Autonomous observation — runs every frame, watches for changes ──

  function observe(dt) {
    if (!_state || !_state.player || _state.player.markedForDeletion || _state.phase !== 'combat') return;
    _tickCooldowns(dt);

    // Update ANPC system
    if (_anpcReady) SFANPC.update(dt);

    const snap = _snap();

    // ── New enemy types appearing this wave ──
    _observeNewTypes(snap);

    // ── Player taking damage ──
    _observeDamage(snap);

    // ── Fuel warnings ──
    _observeFuel(snap);

    // ── Base under threat ──
    _observeBase(snap);

    // Update memory
    _mem.lastHostileCount = snap.totalHostile;
    _mem.lastHullPct = snap.hullPct;
    _mem.lastShieldPct = snap.shieldPct;
    _mem.lastFuelPct = snap.fuelPct;
    _mem.lastBasePct = snap.basePct;
    _mem.lastKills = _state.kills;
  }

  function _observeNewTypes(snap) {
    // Detect new enemy types that appeared since last check
    const types = [];
    if (snap.interceptors > 0 && !_mem.waveTypesAnnounced.has('interceptor')) { types.push('interceptor'); _mem.waveTypesAnnounced.add('interceptor'); }
    if (snap.bombers > 0 && !_mem.waveTypesAnnounced.has('bomber')) { types.push('bomber'); _mem.waveTypesAnnounced.add('bomber'); }
    if (snap.predators > 0 && !_mem.waveTypesAnnounced.has('predator')) { types.push('predator'); _mem.waveTypesAnnounced.add('predator'); }
    if (snap.dreadnoughts > 0 && !_mem.waveTypesAnnounced.has('dreadnought')) { types.push('dreadnought'); _mem.waveTypesAnnounced.add('dreadnought'); }
    if (snap.alienMothership && !_mem.waveTypesAnnounced.has('alien-baseship')) { types.push('alien-baseship'); _mem.waveTypesAnnounced.add('alien-baseship'); }

    if (types.length > 0 && !_onCooldown('newtype', 3.0)) {
      _updateScenario('new_contacts');

      // ANPC sensor operator reports
      const anpcLine = _anpcSpeak('sensor', 'combat_engage', {
        count: snap.totalHostile - _mem.lastHostileCount,
        target: types[0],
      });
      _addComm(_crew('sensor'), anpcLine || _composeNewContacts(snap, snap.totalHostile - _mem.lastHostileCount, types), 'warning');

      // Tactical advice for dangerous types
      if (types.includes('dreadnought') && snap.torpCount > 0) {
        _addComm(_crew('tactical'), `${_pick(V.dreadnought)} class. ${_pick(V.useTorps)}.`, 'warning');
      }
      if (types.includes('predator')) {
        _addComm(_crew('science'), `${_pick(V.predator)} — heavy armor. ${_pick(V.targetWeak)}.`, 'warning');
      }
      if (types.includes('bomber') && snap.basePct < 70) {
        _addComm(_crew('tactical'), `${_pick(V.bomber)}s heading for the Resolute. ${_pick(V.protect)}.`, 'warning');
      }
    }
  }

  function _observeDamage(snap) {
    // Hull took a big hit
    const hullDrop = _mem.lastHullPct - snap.hullPct;
    if (hullDrop >= 15 && !_onCooldown('hull_warn', 5.0)) {
      _updateScenario('hull_critical');
      const line = _anpcSpeak('ops', 'damage_report', { hullPct: snap.hullPct });
      _addComm(_crew('ops'), line || _composeDamageReport(snap, 'hull'), 'warning');
    }
    // Hull critical threshold
    if (snap.hullPct < 25 && _mem.lastHullPct >= 25 && !_onCooldown('hull_crit', 8.0)) {
      _updateScenario('hull_critical');
      const emergLine = _anpcSpeak('ops', 'emergency', { reason: `hull at ${snap.hullPct}%` });
      _addComm(_crew('ops'), emergLine || `${_cs()}, hull ${snap.hullPct}%! ${_pick(V.critical)}! RTB or seek medical frigate.`, 'warning');
    }
    // Shields just went down
    if (snap.shieldPct <= 0 && _mem.lastShieldPct > 0 && !_onCooldown('shields_down', 6.0)) {
      _updateScenario('hull_critical');
      const line = _anpcSpeak('ops', 'damage_report', { hullPct: snap.hullPct, shieldStatus: 'down' });
      _addComm(_crew('ops'), line || _composeDamageReport(snap, 'shields'), 'warning');
    }
  }

  function _observeFuel(snap) {
    if (snap.fuelPct < 15 && _mem.lastFuelPct >= 15 && !_onCooldown('fuel_warn', 10.0)) {
      const line = _anpcSpeak('ops', 'hazard_warning', { hazard: `fuel critical at ${snap.fuelPct}% — conserve afterburner` });
      _addComm(_crew('ops'), line || `${_cs()}, ${V.fuelStatus(snap.fuelPct)} at ${snap.fuelPct}%. Conserve afterburner.`, 'warning');
    }
  }

  function _observeBase(snap) {
    const baseDrop = _mem.lastBasePct - snap.basePct;
    if (baseDrop >= 10 && !_onCooldown('base_warn', 6.0)) {
      _updateScenario('base_critical');
      const line = _anpcSpeak('command', 'hazard_warning', { hazard: `base hull dropping, ${snap.basePct}%` });
      _addComm(_crew('command'), line || _composeDamageReport(snap, 'base'), 'warning');
    }
    if (snap.basePct < 15 && _mem.lastBasePct >= 15 && !_onCooldown('base_crit', 10.0)) {
      _updateScenario('base_critical');
      const emergLine = _anpcSpeak('command', 'emergency', { reason: 'base hull critical' });
      _addComm(_crew('command'), emergLine || `Base hull ${snap.basePct}%! ${_pick(V.critical)}! All fighters ${_pick(V.protect)} ${_pick(V.urgent)}!`, 'warning');
    }
  }

  // ── Periodic chatter — autonomous situational reports ──

  function generateChatter() {
    if (!_state || !_state.player || _state.phase !== 'combat') return null;
    const snap = _snap();
    const roll = Math.random();

    // Update ANPC system tick
    if (_anpcReady) SFANPC.update(0.1);

    if (roll < 0.3) {
      // Tactical chatter from CIC
      const anpcTac = _anpcSpeak('tactical', 'tactical_coord', { remaining: snap.totalHostile });
      if (anpcTac) return { sender: _crew('tactical'), msg: anpcTac, type: 'base' };
      return { sender: _crew('tactical'), msg: _composeTacticalChatter(snap), type: 'base' };
    } else if (roll < 0.6) {
      // Wingman combat chatter (ANPC personality-driven)
      const wingChat = _wingmanSpeak(Math.random() < 0.5 ? 'combat_engage' : 'morale_banter');
      if (wingChat) return wingChat;
      return _composeAllyChatter(snap);
    } else if (roll < 0.8) {
      // Sensor warnings
      return { sender: _crew('sensor'), msg: _composeWarningChatter(snap), type: 'warning' };
    } else {
      // Enemy ace intercepted comms (rare, only if active)
      const aceChat = _enemyAceSpeak('morale_banter');
      if (aceChat) return { sender: aceChat.sender, msg: aceChat.msg, type: 'warning' };
      // Fallback to ally chatter
      return _composeAllyChatter(snap);
    }
  }

  function _composeTacticalChatter(snap) {
    // Observe the battlefield and report what matters most
    if (snap.basePct < 15 && snap.bomberNearBase) return `Base ${V.hullStatus(snap.basePct)}! ${_pick(V.bomber)} at ${_bearingOf(snap.bomberNearBase)} heading for the Resolute. Intercept ${_pick(V.urgent)}.`;
    if (snap.basePct < 15) return `Base hull ${snap.basePct}%. ${_pick(V.protect)} ${_pick(V.urgent)}.`;
    if (snap.basePct < 35 && snap.bomberNearBase) return `Base ${snap.basePct}%. ${_pick(V.bomber)} at ${_bearingOf(snap.bomberNearBase)}. Stop it.`;
    if (snap.threatsNearBase >= 3 && snap.basePct < 60) return `${snap.threatsNearBase} ${_pick(V.contacts)} closing on the Resolute. Base ${snap.basePct}%. Fall back and ${_pick(V.protect)}.`;
    if (snap.threatsNearBase >= 4) return `Multiple ${_pick(V.contacts)} inside base perimeter. ${_pick(V.protect)}.`;
    if (snap.alienMothership && snap.totalHostile <= 3 && snap.basePct > 50) return `Escorts thinned out. ${_pick(V.baseship)} at ${_bearingOf(snap.alienMothership)}, hull ${snap.alienMothershipHullPct}%. Hit her now.`;
    if (snap.alienMothership && snap.alienMothershipHullPct < 30) return `${_pick(V.baseship)} at ${_bearingOf(snap.alienMothership)}, hull ${snap.alienMothershipHullPct}%. Almost done — pour it on!`;
    if (snap.dreadnoughts > 0 && snap.priorityTarget && snap.priorityType === 'dreadnought') return `${_pick(V.dreadnought)} at ${_bearingOf(snap.priorityTarget)}. ${_pick(V.useTorps)}.`;
    if (snap.predators > 0 && snap.closestType === 'predator' && snap.closestM < 600) return `${_pick(V.predator)} at ${_bearing(snap.closestPos)}. ${_pick(V.move)} — plasma range.`;
    if (snap.bombers > 1 && snap.bomberNearBase) return `${snap.bombers} ${_pick(V.bomber)}s active. Nearest to base at ${_bearingOf(snap.bomberNearBase)}.`;
    if (snap.totalHostile > 10 && snap.priorityTarget) return `${snap.totalHostile} ${_pick(V.contacts)}. Priority at ${_bearingOf(snap.priorityTarget)}.`;
    if (snap.totalHostile > 0 && snap.closestPos) return `${_pick(V.contact)} at ${_bearing(snap.closestPos)}. ${snap.totalHostile} remaining.`;
    // Hive attack window
    if (snap.alienHive) {
      if (snap.alienHiveHullPct < 25) return `${_pick(V.hive)} at ${snap.alienHiveHullPct}%. Finish it!`;
      if (snap.totalHostile <= 2) return `Window open. ${_pick(V.hive)} at ${_bearingOf(snap.alienHive)}. Hit it.`;
      return `${_pick(V.hive)} at ${_bearingOf(snap.alienHive)}, hull ${snap.alienHiveHullPct}%.`;
    }
    return `${snap.totalHostile} ${_pick(V.contacts)} remaining. ${_pick(V.watch)}.`;
  }

  function _composeAllyChatter(snap) {
    // Try ANPC wingman dialog first
    const wingChat = _wingmanSpeak(Math.random() < 0.6 ? 'combat_engage' : 'morale_banter');
    if (wingChat) return wingChat;

    // Legacy fallback
    const callsign = `Alpha-${Math.floor(Math.random() * 3) + 1}`;
    const type = snap.closestType;
    const pos = snap.closestPos;
    if (type === 'interceptor' && snap.closestM < 400 && pos) return { sender: callsign, msg: `${_pick(V.interceptor)} at ${_bearing(pos)}! ${_pick(V.engaging)}.`, type: 'ally' };
    if (type === 'bomber' && snap.closestM < 800 && pos) return { sender: callsign, msg: `${_pick(V.bomber)} at ${_bearing(pos)} heading for base. ${_pick(V.engaging)}.`, type: 'ally' };
    if (type === 'predator' && pos) return { sender: callsign, msg: `${_pick(V.predator)} at ${_bearing(pos)}. Keeping distance.`, type: 'ally' };
    if (snap.totalHostile > 8 && snap.priorityTarget) return { sender: callsign, msg: `Heavy ${_pick(V.contacts)} — ${snap.totalHostile}. Priority at ${_bearingOf(snap.priorityTarget)}. Could use help.`, type: 'ally' };
    if (snap.totalHostile > 0 && pos) return { sender: callsign, msg: `${snap.totalHostile} on scope. ${_pick(V.engaging)}.`, type: 'ally' };
    return { sender: callsign, msg: `Sector quiet. Holding formation.`, type: 'ally' };
  }

  function _composeWarningChatter(snap) {
    if (snap.hullPct < 25) return `${_cs()}, hull ${snap.hullPct}%. Seek repair or RTB.`;
    if (snap.shieldPct <= 0 && snap.hullPct < 60) return `${_cs()}, ${V.shieldStatus(snap.shieldPct)}. Hull ${snap.hullPct}%. Avoid direct engagement.`;
    if (snap.fuelPct < 15) return `${_cs()}, ${V.fuelStatus(snap.fuelPct)} at ${snap.fuelPct}%.`;
    if (snap.torpCount === 0 && snap.dreadnoughts > 0) return `${_cs()}, no torpedoes. ${_pick(V.dreadnought)} still active — resupply needed.`;
    if (snap.basePct < 25) return `Base ${V.hullStatus(snap.basePct)} at ${snap.basePct}%. ${_pick(V.protect)}.`;
    if (snap.bombers > 0 && snap.basePct < 50 && snap.bomberNearBase) return `${_pick(V.bomber)} at ${_bearingOf(snap.bomberNearBase)} heading for base. Base ${snap.basePct}%.`;
    if (snap.predators > 0 && snap.priorityTarget && snap.priorityType === 'predator') return `${_pick(V.predator)} at ${_bearingOf(snap.priorityTarget)}. Avoid close range.`;
    if (snap.closestM < 300 && snap.closestType && snap.closestPos) return `Proximity: ${snap.closestType} at ${_bearing(snap.closestPos)}. ${_pick(V.watch)}.`;
    return `Status: ${snap.totalHostile} ${_pick(V.contacts)}, hull ${snap.hullPct}%, base ${snap.basePct}%.`;
  }

  // ── Init ──

  function init(deps) {
    _state = deps.state;
    _addComm = deps.addComm;
    _snap = deps.snap;
    _crew = deps.crew;
    _cs = deps.cs;
    _bearing = deps.bearing;
    _bearingOf = deps.bearingOf;
    _dim = deps.dim;
    _countHostiles = deps.countHostiles;

    // Initialize ANPC system if available
    if (window.SFANPC) {
      SFANPC.initCharacters();
      _anpcReady = true;
    }

    // Initialize manifold history system
    if (window.SFHistory) {
      SFHistory.reset();
    }
  }

  function resetWave() {
    _mem.waveTypesAnnounced.clear();
    _mem.phaseAnnounced = {};
    if (_anpcReady) {
      // Reset scenario toward patrol between waves
      SFANPC.resetScenario('patrol');
    }

    // Reset dialog history for new wave (new session seed)
    if (window.SFHistory) {
      SFHistory.reset();
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // ANPC-DRIVEN DIALOG LAYER
  // ══════════════════════════════════════════════════════════════════

  /**
   * Map crew role to ANPC character for personality-driven dialog.
   * Falls back to legacy compose system if ANPC unavailable.
   */
  const _roleToAnpc = {
    sensor: 'ANPC-SF-0005', // Ens. Park "Scope"
    command: 'ANPC-SF-0001', // Cdr. Vasquez "Resolute Actual"
    tactical: 'ANPC-SF-0004', // XO Tanaka
    ops: 'ANPC-SF-0003', // Dr. Okafor "Lighthouse"
    deck: 'ANPC-SF-0003', // Lighthouse (base ops)
    science: 'ANPC-SF-0005', // Ens. Park
  };

  /**
   * Try to generate ANPC-driven dialog for a given event category.
   * Returns assembled text or null (falls back to legacy compose).
   */
  function _anpcSpeak(role, category, extraContext) {
    if (!_anpcReady) return null;
    const anpcId = _roleToAnpc[role];
    if (!anpcId) return null;

    const snap = _snap();
    const context = {
      playerCallsign: _cs(),
      target: snap.closestType || 'hostile',
      count: snap.totalHostile || 0,
      bearing: snap.closestPos ? _bearing(snap.closestPos) : '000',
      distance: snap.closestM || '?',
      hullPct: snap.hullPct,
      shieldStatus: V.shieldStatus(snap.shieldPct),
      remaining: snap.totalHostile,
      direction: Math.random() > 0.5 ? 'left' : 'right',
      position: 'wing',
      callsign: _cs(),
      formation: 'V-Formation',
      ...(extraContext || {}),
    };

    const result = SFANPC.speak(anpcId, category, context);
    return result ? result.text : null;
  }

  /**
   * Force ANPC dialog (bypass cooldown). For critical/timed events.
   * Returns assembled text or null.
   */
  function _anpcForceSpeak(role, category, extraContext) {
    if (!_anpcReady) return null;
    const anpcId = _roleToAnpc[role];
    if (!anpcId) return null;

    const snap = _snap();
    const context = {
      playerCallsign: _cs(),
      target: snap.closestType || 'hostile',
      count: snap.totalHostile || 0,
      bearing: snap.closestPos ? _bearing(snap.closestPos) : '000',
      distance: snap.closestM || '?',
      hullPct: snap.hullPct,
      shieldStatus: V.shieldStatus(snap.shieldPct),
      remaining: snap.totalHostile,
      direction: Math.random() > 0.5 ? 'left' : 'right',
      position: 'wing',
      callsign: _cs(),
      formation: 'V-Formation',
      ...(extraContext || {}),
    };

    const result = SFANPC.forceSpeak(anpcId, category, context);
    return result ? result.text : null;
  }

  /**
   * Try wingman ANPC dialog (Hotshot or Frostbite).
   */
  function _wingmanSpeak(category, extraContext) {
    if (!_anpcReady) return null;
    // Alternate between wingmen
    const wingmenIds = ['ANPC-SF-0042', 'ANPC-SF-0043']; // Hotshot, Frostbite
    const pick = wingmenIds[Math.floor(Math.random() * wingmenIds.length)];
    const anpc = SFANPC.get(pick);
    if (!anpc || !anpc.active) return null;

    const snap = _snap();
    const context = {
      playerCallsign: _cs(),
      target: snap.closestType || 'hostile',
      count: snap.totalHostile || 0,
      bearing: snap.closestPos ? _bearing(snap.closestPos) : '000',
      distance: snap.closestM || '?',
      hullPct: Math.round(anpc.hull * 100),
      shieldStatus: anpc.shields > 0 ? 'holding' : 'gone',
      remaining: snap.totalHostile,
      killCount: anpc.missionKills,
      ...(extraContext || {}),
    };

    const result = SFANPC.speak(pick, category, context);
    if (result) {
      return { sender: result.sender, msg: result.text, type: 'ally' };
    }
    return null;
  }

  /**
   * Enemy ace dialog (intercepted comms on CH-ENM).
   */
  function _enemyAceSpeak(category, extraContext) {
    if (!_anpcReady) return null;
    const nightshade = SFANPC.get('ANPC-SF-E-0001');
    if (!nightshade || !nightshade.active) return null;

    const snap = _snap();
    const context = {
      playerCallsign: _cs(),
      target: 'you',
      count: snap.totalHostile,
      hullPct: Math.round(nightshade.hull * 100),
      remaining: snap.totalHostile,
      ...(extraContext || {}),
    };

    const result = SFANPC.forceSpeak('ANPC-SF-E-0001', category, context);
    if (result) {
      return { sender: `[INTERCEPTED] ${result.sender}`, msg: result.text, type: 'enemy' };
    }
    return null;
  }

  /**
   * Update ANPC scenario vector based on game events.
   */
  function _updateScenario(eventName) {
    if (_anpcReady) SFANPC.applyEvent(eventName);
  }

  /**
   * Transition all active wingman ANPCs to a new combat state.
   */
  function _transitionWingmen(condition) {
    if (!_anpcReady) return;
    const wingmen = SFANPC.getByRole('SF-WING');
    for (const w of wingmen) {
      w.transition(condition);
    }
  }

  return {
    init, observe, generateChatter, resetWave,
    // Event signals — core.js calls these instead of hardcoding dialog
    onWaveStart, onLaunchClear, onKill, onVictory,
    onMilitaryLost, onCivilianLost, onAllyDown,
    onPlayerDestroyed, onRespawnReady, onWaveClear,
    onAutopilotEngage, onDock,
    onTankerDeploy, onTankerDock, onTankerDone,
    onMedicDeploy, onMedicDock, onMedicProgress, onMedicDone,
    onSupportDenied, onSupportAccepted, onSupportDock, onSupportReturn, onSupportComplete,
    onHeavyOrdnance, onGoodHit, onPlasmaHit,
    onDisabled, onSystemsRestore,
    onHullBreach, onOrganismClear, onOrganismDeep,
    onOrganismInside, onOrganismProgress, onEmergencyRTB,
    onEMP, onWeaponSwitch, onDockRequest,
    onPredatorConsume, onPredatorMalfunction,
    onHiveDiscovered, onDecontamination, onBayReady,
    onLaunchStart, onPracticeStart, onPracticeEnd,
    onPause, onResume, onSecured,
    onWaveComplete, onNextWaveIntel,
  };

})();

window.SFAnnouncer = SFAnnouncer;
