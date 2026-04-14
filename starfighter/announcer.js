/**
 * Autonomous Announcer System — Starfighter
 * ──────────────────────────────────────────
 * Zero hardcoded dialog. Every line is composed from vocabulary pools
 * and live game state observation. Crew members observe their domain
 * and report what they actually see — no scripts, no canned lines.
 *
 * Each crew role has:
 *   - observation domain (what they watch)
 *   - vocabulary pools (word options for variety)
 *   - compose functions (build sentences from state + vocab)
 *   - cooldowns (don't spam)
 *   - memory (track what's been said to avoid repetition)
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
    drone: ['drone', 'light fighter', 'enemy fighter'],
    interceptor: ['interceptor', 'fast mover', 'flanker'],
    bomber: ['bomber', 'attack ship', 'heavy bomber'],
    predator: ['Predator', 'Predator Drone', 'hunter'],
    dreadnought: ['Dreadnought', 'Hive Throne', 'capital ship'],
    baseship: ['mothership', 'capital ship', 'alien carrier', 'enemy capital'],
    hive: ['the hive', 'alien base', 'hive structure', 'enemy base'],
    // Tactical advice
    useTorps: ['use torpedoes', 'switch to torpedoes', 'torps are your best bet', 'heavy ordnance recommended'],
    targetWeak: ['target the underbelly', 'hit the weak point', 'aim for the vents', 'go for their underside'],
    clearEscorts: ['clear the escorts first', 'thin out their fighters', 'deal with the escorts', 'sweep the perimeter'],
    // Status
    hullStatus: (pct) => pct < 20 ? 'hull critical' : pct < 40 ? 'hull damaged' : pct < 60 ? 'hull holding' : pct < 80 ? 'hull stable' : 'hull strong',
    shieldStatus: (pct) => pct <= 0 ? 'shields down' : pct < 30 ? 'shields failing' : pct < 60 ? 'shields weakened' : 'shields holding',
    fuelStatus: (pct) => pct < 10 ? 'fuel critical' : pct < 25 ? 'fuel low' : pct < 50 ? 'fuel half' : 'fuel nominal',
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

  // ── Compose functions — build natural sentences from state + vocab ──

  function _composeNewContacts(snap, newCount, types) {
    const parts = [];
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
    const left = snap.totalHostile;
    const verb = _pick(V.destroyed);
    const typeName = type === 'predator' ? _pick(V.predator)
      : type === 'interceptor' ? _pick(V.interceptor)
        : type === 'bomber' ? _pick(V.bomber)
          : type === 'dreadnought' ? _pick(V.dreadnought)
            : type === 'alien-baseship' ? _pick(V.baseship)
              : _pick(V.drone);
    if (left === 0) return `${typeName} ${verb}. Sector clear. ${_state.kills} kills this wave.`;
    const next = snap.priorityTarget ? ` Next at ${_bearingOf(snap.priorityTarget)}.` : '';
    return `${typeName} ${verb}. ${left} ${left === 1 ? 'hostile' : _pick(V.contacts)} remaining.${next}`;
  }

  function _composeWaveStart(snap) {
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

    // Sensor officer reports what's on scope
    _addComm(_crew('sensor'), _composeWaveStart(snap), 'warning');

    // Tactical gives advice based on what's out there
    const advice = _composeTacticalAdvice(snap);
    if (advice) _addComm(_crew('tactical'), advice, 'base');

    _mem.lastHostileCount = snap.totalHostile;
  }

  function onLaunchClear() {
    const snap = _snap();
    _addComm(_crew('deck'), `${_cs()}, ${_composeLaunchClear(snap)}`, 'base');

    // Wingman check-in — they report what they see
    if (_state.aiWingmen) {
      const callsign = `Alpha-${Math.floor(Math.random() * 3) + 1}`;
      const close = snap.closestM < 5000 && snap.closestPos
        ? `Contact at ${_bearing(snap.closestPos)}. ${_pick(V.engaging)}.`
        : `${snap.totalHostile} ${_pick(V.contacts)}. Forming up.`;
      _addComm(callsign, close, 'ally');
    }
  }

  function onKill(type) {
    const snap = _snap();
    if (snap.totalHostile === 0) {
      // Sector clear — command announces
      _addComm(_crew('command'), _composeKill(type, snap), 'base');
    } else if (type === 'dreadnought') {
      _addComm(_crew('command'), _composeKill(type, snap), 'base');
      _addComm(_crew('sensor'), `${_pick(V.dreadnought)} signal lost. ${snap.totalHostile} ${_pick(V.contacts)} remain.`, 'base');
    } else {
      _addComm(_crew('tactical'), _composeKill(type, snap), 'base');
    }
  }

  function onVictory() {
    const snap = _snap();
    _addComm(_crew('command'), `${_pick(V.hive)} ${_pick(V.destroyed)}! Score ${_state.score}. Mission complete.`, 'base');
  }

  function onMilitaryLost() {
    const snap = _snap();
    _addComm(_crew('command'), `Military ship lost. Base ${V.hullStatus(snap.basePct)} at ${snap.basePct}%. No resupply available.`, 'base');
  }

  function onCivilianLost() {
    _addComm(_crew('command'), `Civilian station ${_pick(V.destroyed)}. ${_state.kills} kills, score ${_state.score}. Mission failed.`, 'base');
  }

  function onAllyDown() {
    const snap = _snap();
    const callsign = `Alpha-${Math.floor(Math.random() * 3) + 1}`;
    _addComm(callsign, `Going down! ${snap.totalHostile} ${_pick(V.contacts)} still active. ${_pick(V.protect)}!`, 'ally');
  }

  function onPlayerDestroyed(reason, livesLeft, maxLives) {
    const snap = _snap();
    const hostiles = _countHostiles();
    if (livesLeft <= 0) {
      _addComm(_crew('command'), `Final interceptor lost. ${hostiles} ${_pick(V.contacts)} still active.`, 'warning');
    } else {
      const slot = maxLives - livesLeft;
      _addComm(_crew('command'), `Pilot ${slot} of ${maxLives} lost. ${reason}. Replacement launching.`, 'warning');
      _addComm(_crew('sensor'), `${hostiles} ${_pick(V.contacts)} active. Wave ${_state.wave}. Base ${V.hullStatus(snap.basePct)}.`, 'base');
    }
  }

  function onRespawnReady() {
    const snap = _snap();
    const hostiles = _countHostiles();
    _addComm(_crew('deck'), `${_cs()}, replacement on rail. ${hostiles} ${_pick(V.contacts)} active. Wave ${_state.wave}.`, 'base');
  }

  function onWaveClear() {
    const snap = _snap();
    _addComm(_crew('tactical'), `${_cs()}, sector clear. ${_state.kills} kills. Return to base.`, 'base');
  }

  function onAutopilotEngage() {
    const snap = _snap();
    const dist = Math.floor(_state.player.position.distanceTo(_state.baseship.position));
    _addComm(_crew('ops'), `${_cs()}, autopilot engaged. ${dist}m to base.`, 'base');
  }

  function onDock(who) {
    const snap = _snap();
    _addComm(_crew('deck'), `${_cs()}, docking confirmed. ${_state.kills} kills, score ${_state.score}. ${V.hullStatus(snap.hullPct)}.`, 'base');
  }

  function onTankerDeploy() {
    const snap = _snap();
    _addComm(_crew('ops'), `${_cs()}, tanker deployed. ${V.fuelStatus(snap.fuelPct)}, ${V.hullStatus(snap.hullPct)}.`, 'base');
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
    _addComm(_crew('ops'), `${_cs()}, medical frigate '${callsign}' dispatched. ${V.hullStatus(snap.hullPct)}, ${V.shieldStatus(snap.shieldPct)}.`, 'base');
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
    _addComm(_crew('ops'), `${_cs()}, ${ship} request denied. Conditions not critical enough. Keep fighting.`, 'base');
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
    _addComm(_crew('ops'), `${_cs()}, ${type === 'tanker' ? 'resupply' : 'repair'} complete. Autopilot returning you to combat zone.`, 'base');
  }

  function onSupportComplete() {
    _addComm(_crew('ops'), `${_cs()}, controls released. You have the stick. Good hunting.`, 'base');
  }

  function onHeavyOrdnance() {
    const snap = _snap();
    _addComm(_crew('sensor'), `${_cs()}, heavy ordnance incoming! ${_composePlayerStatus(snap)}. Brace!`, 'warning');
  }

  function onGoodHit() {
    const snap = _snap();
    _addComm(_crew('tactical'), `${_pick(V.good)}, ${_cs()}! Hull ${snap.hullPct}%.`, 'base');
  }

  function onPlasmaHit() {
    const snap = _snap();
    _addComm(_crew('sensor'), `${_cs()}, plasma impact! ${V.shieldStatus(snap.shieldPct)}. ${_pick(V.move)}!`, 'warning');
  }

  function onDisabled() {
    const snap = _snap();
    _addComm(_crew('tactical'), `${_cs()}, systems disabled! Hull ${snap.hullPct}%. Countermeasures deploying!`, 'warning');
  }

  function onSystemsRestore() {
    const snap = _snap();
    _addComm(_crew('tactical'), `${_cs()}, systems back online! ${_composePlayerStatus(snap)}. ${_pick(V.move)}!`, 'base');
  }

  function onHullBreach() {
    const snap = _snap();
    _addComm(_crew('sensor'), `Hull breach! Organism attached! Hull ${snap.hullPct}%.`, 'warning');
    _addComm(_crew('tactical'), `${_cs()}, afterburner ${_pick(V.urgent)}! Shake it off or RTB!`, 'warning');
  }

  function onOrganismClear() {
    const snap = _snap();
    _addComm(_crew('tactical'), `${_cs()}, organism clear! Hull ${snap.hullPct}%. Keep moving!`, 'base');
  }

  function onOrganismDeep() {
    const snap = _snap();
    _addComm(_crew('sensor'), `${_cs()}, too deep to dislodge! Hull ${snap.hullPct}%. RTB ${_pick(V.urgent)}!`, 'warning');
  }

  function onOrganismInside() {
    const snap = _snap();
    _addComm(_crew('sensor'), `Hull breached! Organism inside the ship! Hull ${snap.hullPct}%.`, 'warning');
  }

  function onOrganismProgress(pct) {
    if (pct > 80) _addComm(_crew('tactical'), `Imminent breach — ${pct}%! Land ${_pick(V.urgent)}!`, 'warning');
    else if (pct > 50) _addComm(_crew('sensor'), `Organism at ${pct}%. Cockpit seal failing.`, 'warning');
    else _addComm(_crew('sensor'), `Organism in ventilation — ${pct}% to cockpit.`, 'warning');
  }

  function onEmergencyRTB() {
    _addComm(_crew('command'), `Emergency RTB engaged! All power to engines!`, 'warning');
  }

  function onEMP(count, duration) {
    if (count > 0) _addComm(_crew('tactical'), `EMP — ${count} ${count === 1 ? _pick(V.contact) : _pick(V.contacts)} disabled. ${duration}s.`, 'base');
    else _addComm(_crew('tactical'), `EMP fired — no ${_pick(V.contacts)} in range.`, 'base');
  }

  function onWeaponSwitch(name) {
    _addComm(_crew('tactical'), `Weapon: ${name}`, 'base');
  }

  function onDockRequest() {
    const snap = _snap();
    _addComm(_crew('ops'), `${_cs()}, dock request approved. Fly to base. ${_composePlayerStatus(snap)}.`, 'base');
  }

  function onPredatorConsume() {
    const snap = _snap();
    _addComm(_crew('sensor'), `Fighter consumed by ${_pick(V.predator)}. Pilot lost. ${snap.totalHostile} ${_pick(V.contacts)} remain.`, 'warning');
  }

  function onPredatorMalfunction() {
    const snap = _snap();
    _addComm(_crew('science'), `${_pick(V.predator)} turned on its own — hive control breakdown. ${snap.totalHostile} ${_pick(V.contacts)} remain.`, 'base');
  }

  function onHiveDiscovered(hive) {
    _addComm(_crew('sensor'), `${_pick(V.hive)} ${_pick(V.detected)}! Bearing ${_bearingOf(hive)}.`, 'warning');
    _addComm(_crew('command'), `Primary objective located. ${_pick(V.clearEscorts)}.`, 'warning');
  }

  function onDecontamination() {
    const snap = _snap();
    _addComm(_crew('deck'), `Decontamination complete. Hull ${snap.hullPct}%.`, 'base');
  }

  function onBayReady() {
    const snap = _snap();
    _addComm(_crew('deck'), `${_cs()}, wave ${_state.wave} standing by. ${_composePlayerStatus(snap)}. Launch when ready.`, 'base');
  }

  function onLaunchStart() {
    const wave = _state.wave;
    const snap = _snap();
    const basePct = snap.basePct;

    // ── Phase 1 (0s): Deck officer — launch commit ──
    _addComm(_crew('deck'), `${_cs()}, ${_pick(V.launchReady)}. Launching wave ${wave}.`, 'base');

    // ── Phase 2 (~1.5s): Command — mission context ──
    setTimeout(() => {
      const s = _snap();
      const pilotSlot = Math.max(1, _state.maxLives - _state.livesRemaining + 1);
      const baseNote = basePct < 50 ? ` Resolute hull at ${basePct}% — she needs cover.` : '';
      if (wave === 1) {
        _addComm(_crew('command'), `Pilot ${pilotSlot} of ${_state.maxLives}, wave ${wave}. First sortie — calibrate weapons on initial ${_pick(V.contacts)}.${baseNote}`, 'base');
      } else {
        const intensity = s.totalHostile > 10 ? 'Heavy resistance expected.' : s.totalHostile > 5 ? 'Moderate opposition.' : 'Manageable numbers.';
        _addComm(_crew('command'), `Pilot ${pilotSlot} of ${_state.maxLives}, wave ${wave}. ${intensity}${baseNote}`, 'base');
      }
    }, 1500);

    // ── Phase 3 (~3.5s): Sensor — threat briefing (what's out there) ──
    setTimeout(() => {
      const s = _snap();
      // Build threat manifest from previous wave knowledge for waves 2+
      if (wave >= 2) {
        const threats = [];
        if (wave >= 6 && (wave === 6 || (wave - 6) % 5 === 0)) threats.push(_pick(V.dreadnought));
        if (wave >= 4) threats.push(`${_pick(V.predator)}s`);
        if (wave >= 3) threats.push(`${_pick(V.bomber)}s`);
        if (wave >= 2) threats.push(`${_pick(V.interceptor)}s`);
        threats.push(`${_pick(V.drone)}s`);
        const manifest = threats.join(', ');
        _addComm(_crew('sensor'), `${_pick(V.threat)}: ${_pick(V.sensorReading)} ${manifest}. ${_pick(V.watch)}.`, 'warning');
      } else {
        _addComm(_crew('sensor'), `Scope shows light contacts only. Training-weight targets for initial calibration.`, 'info');
      }
    }, 3500);

    // ── Phase 4 (~5.5s): Tactical — advice for this wave's threats ──
    setTimeout(() => {
      if (wave >= 6 && (wave === 6 || (wave - 6) % 5 === 0)) {
        _addComm(_crew('tactical'), `${_pick(V.dreadnought)} intel on file. ${_pick(V.useTorps)}. ${_pick(V.combatReady)}.`, 'warning');
      } else if (wave >= 4) {
        _addComm(_crew('tactical'), `${_pick(V.predator)} expected. ${_pick(V.targetWeak)}. ${_pick(V.combatReady)}.`, 'warning');
      } else if (wave >= 3) {
        _addComm(_crew('tactical'), `${_pick(V.bomber)}s will target the Resolute. ${_pick(V.protect)}. ${_pick(V.combatReady)}.`, 'warning');
      } else if (wave >= 2) {
        _addComm(_crew('tactical'), `${_pick(V.interceptor)}s inbound — they're fast. ${_pick(V.watch)}. ${_pick(V.combatReady)}.`, 'base');
      } else {
        _addComm(_crew('tactical'), `Weapons free on all targets. ${_pick(V.combatReady)}.`, 'base');
      }
    }, 5500);

    // ── Phase 5 (~7.5s): XO — launch call ──
    setTimeout(() => {
      _addComm(_crew('command'), `${_pick(V.launchGo)}`, 'warning');
    }, 7500);

    // ── Phase 6 (~9s): Command — send-off ──
    setTimeout(() => {
      _addComm(_crew('command'), `${_pick(V.launchGodspeed)}`, 'base');
    }, 9000);
  }

  function onPracticeStart() {
    const snap = _snap();
    _addComm(_crew('deck'), `${_cs()}, practice range active. Targets deployed. Press Escape when ready.`, 'base');
  }

  function onPracticeEnd() {
    _addComm(_crew('deck'), `${_cs()}, practice complete. Preparing for launch.`, 'base');
  }

  function onPause() { _addComm('SYSTEM', 'Game paused.', 'base'); }
  function onResume() { _addComm('SYSTEM', 'Game resumed.', 'base'); }

  function onSecured() {
    _addComm(_crew('deck'), `${_cs()}, fighter secured. Wave ${_state.wave} standing by.`, 'base');
  }

  function onWaveComplete(prevWave) {
    const snap = _snap();
    _addComm(_crew('command'), `Wave ${prevWave} complete. ${_state.kills} kills. Rearming for wave ${_state.wave}.`, 'base');
  }

  function onNextWaveIntel() {
    const snap = _snap();
    const threats = [];
    if (_state.wave >= 6 && (_state.wave === 6 || (_state.wave - 6) % 5 === 0)) threats.push(_pick(V.dreadnought));
    if (_state.wave >= 4) threats.push(_pick(V.predator));
    if (_state.wave >= 3) threats.push(_pick(V.bomber));
    if (_state.wave >= 2) threats.push(_pick(V.baseship));
    const intel = threats.length ? `${threats[0]} signature ${_pick(V.detected)}.` : `Standard formation expected.`;
    _addComm(_crew('sensor'), `Wave ${_state.wave} intel: ${intel} Base ${V.hullStatus(snap.basePct)}.`, 'warning');
  }

  // ── Autonomous observation — runs every frame, watches for changes ──

  function observe(dt) {
    if (!_state || !_state.player || _state.player.markedForDeletion || _state.phase !== 'combat') return;
    _tickCooldowns(dt);

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
      _addComm(_crew('sensor'), _composeNewContacts(snap, snap.totalHostile - _mem.lastHostileCount, types), 'warning');
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
      _addComm(_crew('ops'), _composeDamageReport(snap, 'hull'), 'warning');
    }
    // Hull critical threshold
    if (snap.hullPct < 25 && _mem.lastHullPct >= 25 && !_onCooldown('hull_crit', 8.0)) {
      _addComm(_crew('ops'), `${_cs()}, hull ${snap.hullPct}%! ${_pick(V.critical)}! RTB or seek medical frigate.`, 'warning');
    }
    // Shields just went down
    if (snap.shieldPct <= 0 && _mem.lastShieldPct > 0 && !_onCooldown('shields_down', 6.0)) {
      _addComm(_crew('ops'), _composeDamageReport(snap, 'shields'), 'warning');
    }
  }

  function _observeFuel(snap) {
    if (snap.fuelPct < 15 && _mem.lastFuelPct >= 15 && !_onCooldown('fuel_warn', 10.0)) {
      _addComm(_crew('ops'), `${_cs()}, ${V.fuelStatus(snap.fuelPct)} at ${snap.fuelPct}%. Conserve afterburner.`, 'warning');
    }
  }

  function _observeBase(snap) {
    const baseDrop = _mem.lastBasePct - snap.basePct;
    if (baseDrop >= 10 && !_onCooldown('base_warn', 6.0)) {
      _addComm(_crew('command'), _composeDamageReport(snap, 'base'), 'warning');
    }
    if (snap.basePct < 15 && _mem.lastBasePct >= 15 && !_onCooldown('base_crit', 10.0)) {
      _addComm(_crew('command'), `Base hull ${snap.basePct}%! ${_pick(V.critical)}! All fighters ${_pick(V.protect)} ${_pick(V.urgent)}!`, 'warning');
    }
  }

  // ── Periodic chatter — autonomous situational reports ──

  function generateChatter() {
    if (!_state || !_state.player || _state.phase !== 'combat') return null;
    const snap = _snap();
    const roll = Math.random();
    if (roll < 0.4) {
      return { sender: _crew('tactical'), msg: _composeTacticalChatter(snap), type: 'base' };
    } else if (roll < 0.8) {
      return _composeAllyChatter(snap);
    } else {
      return { sender: _crew('sensor'), msg: _composeWarningChatter(snap), type: 'warning' };
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
  }

  function resetWave() {
    _mem.waveTypesAnnounced.clear();
    _mem.phaseAnnounced = {};
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
