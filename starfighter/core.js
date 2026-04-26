/**
 * Starfighter Core Logic
 * 6DOF Physics, Entities, AI Waves — Manifold Architecture
 * The SpaceManifold holds all truth. This substrate observes.
 */

const Starfighter = (function () {

    // Core state
    const state = {
        entities: [],
        player: null,
        baseship: null,
        wave: 1,
        score: 0,
        kills: 0,
        running: false,
        paused: false,
        lastTime: 0,
        arenaRadius: 8000,
        phase: 'loading', // 'loading', 'bay-ready', 'launching', 'combat', 'landing', 'land-approach', 'docking'
        launchTimer: 0,
        launchDuration: 8.0, // 5 sec countdown + 3 sec acceleration
        cutsceneCamPos: null, // isolated camera position for launch cutscene
        cutsceneCamQuat: null, // isolated camera rotation for launch cutscene
        cutsceneVelocity: null, // visual velocity for cutscene effects
        commTimer: 0,
        commInterval: 8.0, // seconds between random comms
        landingTimer: 0,
        landingDuration: 28.0, // BFXG-009 Phase 6: 28s docking cutscene
        _briefingShownOnce: false, // first-time auto-deploy of mission panel
        aiWingmen: true, // AI wingmen always present in solo play
        maxLives: 3,
        livesRemaining: 3,
        eliminated: false,     // true when non-leader runs out of lives
        spectating: false,     // true in multiplayer after elimination
        _waveDeaths: 0,        // deaths this wave (resets each new wave in _configureGame)
        _performanceTier: 2,   // 2=clean / 1=one death / 0=two+ deaths — gates debrief shop
        respawnReason: 'HULL INTEGRITY FAIL',
        _replacementVariant: '',
        _replacementBriefing: '',
        // ── Training wave state (wave 1 guided flight training) ──
        _trainingMode: false,     // true during wave 1 training sortie
        _trainingPhase: 0,        // current training step index
        _trainingTimer: 0,        // timer for advancing training steps
        _trainingSkipped: false,  // true if player dismissed training
        _trainingDronesSpawned: false, // ensures wave 1 doesn't sit empty of hostiles
        _trainingControlType: 'keyboard', // 'keyboard', 'gamepad', 'touch'
        callsign: localStorage.getItem('sf_callsign') || '',
        alienBaseSpawned: false, // alien hive base spawned flag
        // Multiplayer state (populated by URL params in init)
        gameMode: 'solo',
        roomCode: null,
        isMultiplayer: false,
        // Kill feed + mission stats
        killFeed: [],        // { text, color, time } — max 6, fades out after 4s
        missionStats: { kills: 0, deaths: 0, accuracy: 0, shotsFired: 0, shotsHit: 0, damageDealt: 0, damageTaken: 0, waveReached: 0, wingmenSaved: 0, wingmenLost: 0, startTime: 0 },
        playerKills: 0,
        clusters: [],           // [{id, label, center:{x,y,z}, total, alive}] active enemy clusters
        _clusterCallTimer: 0,   // countdown to next wingman cluster guidance callout
    };

    // ── Kill Feed ──
    function _addKillFeedEntry(text, color) {
        state.killFeed.push({ text, color: color || '#0ff', time: performance.now() });
        if (state.killFeed.length > 6) state.killFeed.shift();
    }

    function _renderKillFeed() {
        let container = document.getElementById('kill-feed');
        if (!container) {
            container = document.createElement('div');
            container.id = 'kill-feed';
            container.style.cssText = 'position:fixed;top:80px;right:16px;z-index:200;pointer-events:none;font-family:monospace;font-size:11px;text-align:right;';
            document.body.appendChild(container);
        }
        const now = performance.now();
        const FADE_DURATION = 4000;
        container.innerHTML = state.killFeed
            .filter(e => now - e.time < FADE_DURATION)
            .map(e => {
                const age = now - e.time;
                const opacity = Math.max(0, 1 - age / FADE_DURATION);
                return '<div style="color:' + e.color + ';opacity:' + opacity.toFixed(2) + ';margin-bottom:3px;text-shadow:0 0 6px ' + e.color + ';">' + e.text + '</div>';
            }).join('');
    }

    // Communication system — fully reactive, no canned dialog
    // Every message is generated from live game state at the moment it fires.

    const replacementAnnouncements = [
        'Replacement frame online. Pilot transfer underway.',
        'Deck crew reports launch rail clear. New pilot stepping in now.',
        'Reserve squadron activated. Fresh interceptor pilot incoming.',
        'Combat relay synced. Replacement pilot receiving live tactical feed.'
    ];

    function _countActiveHostiles() {
        let hostiles = 0;
        for (let i = 0; i < state.entities.length; i++) {
            const e = state.entities[i];
            if (e.markedForDeletion) continue;
            if (e.type === 'enemy' || e.type === 'interceptor' || e.type === 'bomber' ||
                e.type === 'dreadnought' || e.type === 'alien-baseship' || e.type === 'predator' ||
                e.type === 'egg' || e.type === 'youngling' || e.type === 'hive-queen') {
                hostiles++;
            }
        }
        return hostiles;
    }

    function _makeDynamicBattleBrief() {
        const hostiles = _countActiveHostiles();
        const baseHullPct = Math.max(0, Math.floor(((state.baseship ? state.baseship.hull : 0) / dim('baseship.hull')) * 100));
        const pilotSlot = (state.maxLives - state.livesRemaining + 1);
        const frontline = hostiles > 14 ? 'Frontline is saturated.' : hostiles > 7 ? 'Heavy contact on the perimeter.' : 'Engagement remains containable.';
        return `Pilot ${pilotSlot} of ${state.maxLives}. Wave ${state.wave}. ${hostiles} hostile signatures active. Base hull ${baseHullPct} percent. ${frontline}`;
    }

    // ── Reactive Comm Generator ──
    // Reads live game state and produces a contextual message.
    // No prefab lines — every output reflects the actual situation.

    function _snap() {
        // Snapshot current battle state for comm generation
        const p = state.player;
        const b = state.baseship;
        let enemies = 0, interceptors = 0, bombers = 0, dreadnoughts = 0, predators = 0, hiveQueens = 0;
        let closestDist = Infinity, closestType = '', closestPos = null;
        // Track priority threats with positions for directional comms
        let priorityTarget = null, priorityDist = Infinity, priorityType = '';
        let bomberNearBase = null, bomberBaseDist = Infinity;
        // Track alien-baseship, alien-base (hive), and threats near Resolute
        let alienMothership = null, alienMothershipHullPct = 0;
        let alienHive = null, alienHiveHullPct = 0;
        let threatsNearBase = 0, threatNearBaseDist = Infinity;
        const _dpSnap = M ? M.DiningPhilosophers : null;
        for (let i = 0; i < state.entities.length; i++) {
            const e = state.entities[i];
            if (e.markedForDeletion) continue;
            if (_dpSnap && !_dpSnap.acquire(e.id, 'snap')) continue;
            if (e.type === 'alien-baseship') {
                alienMothership = e;
                const maxHull = e._manifoldDerivation ? (1000 + 500 * state.wave) : 1500;
                alienMothershipHullPct = Math.floor((e.hull / maxHull) * 100);
            }
            if (e.type === 'alien-base') {
                alienHive = e;
                alienHiveHullPct = Math.floor((e.hull / dim('hive.hull')) * 100);
            }
            if (e.type === 'enemy') enemies++;
            else if (e.type === 'interceptor') interceptors++;
            else if (e.type === 'bomber') bombers++;
            else if (e.type === 'dreadnought') dreadnoughts++;
            else if (e.type === 'predator') predators++;
            else if (e.type === 'hive-queen') hiveQueens++;
            else continue;
            if (p && !p.markedForDeletion) {
                const d = e.position.distanceToSquared(p.position);
                if (d < closestDist) { closestDist = d; closestType = e.type; closestPos = e.position; }
                // Priority: dreadnought > predator > bomber > interceptor > drone
                const weight = e.type === 'dreadnought' ? 0.3 : e.type === 'predator' ? 0.5 : e.type === 'bomber' ? 0.6 : e.type === 'interceptor' ? 0.8 : 1.0;
                const pd = d * weight;
                if (pd < priorityDist) { priorityDist = pd; priorityTarget = e; priorityType = e.type; }
            }
            // Track bomber closest to baseship
            if (e.type === 'bomber' && b) {
                const bd = e.position.distanceToSquared(b.position);
                if (bd < bomberBaseDist) { bomberBaseDist = bd; bomberNearBase = e; }
            }
            // Count threats within 2000m of baseship
            if (b) {
                const bd2 = e.position.distanceToSquared(b.position);
                if (bd2 < 2000 * 2000) {
                    threatsNearBase++;
                    if (bd2 < threatNearBaseDist) threatNearBaseDist = bd2;
                }
            }
        }
        if (_dpSnap) _dpSnap.releaseAll('snap');
        const totalHostile = enemies + interceptors + bombers + dreadnoughts + predators + hiveQueens;
        const closestM = Math.floor(Math.sqrt(closestDist));
        const hullPct = p ? Math.floor(p.hull) : 0;
        const shieldPct = p ? Math.floor(p.shields) : 0;
        const basePct = b ? Math.floor((b.hull / dim('baseship.hull')) * 100) : 0;
        const fuelPct = p ? Math.floor(p.fuel) : 0;
        const torpCount = p ? p.torpedoes : 0;
        const speed = p ? Math.floor(p.velocity.length()) : 0;
        return {
            enemies, interceptors, bombers, dreadnoughts, predators, hiveQueens, totalHostile,
            closestM, closestType, closestPos, hullPct, shieldPct, basePct, fuelPct, torpCount, speed,
            priorityTarget, priorityType, bomberNearBase,
            alienMothership, alienMothershipHullPct, threatsNearBase,
            alienHive, alienHiveHullPct
        };
    }

    // Scratch vectors for _bearing — reuse to avoid GC pressure
    const _bFwd = new THREE.Vector3();
    const _bRight = new THREE.Vector3();
    const _bUp = new THREE.Vector3();
    const _bToTarget = new THREE.Vector3();

    // Convert a world position to a clock-position bearing relative to the player's facing
    function _bearing(targetPos) {
        if (!state.player || !targetPos) return '';
        const p = state.player;
        // Get player's forward and right vectors
        _bFwd.set(0, 0, -1).applyQuaternion(p.quaternion);
        _bRight.set(1, 0, 0).applyQuaternion(p.quaternion);
        _bUp.set(0, 1, 0).applyQuaternion(p.quaternion);
        _bToTarget.subVectors(targetPos, p.position);
        const dist = Math.floor(_bToTarget.length());
        _bToTarget.normalize();
        // Project onto player's horizontal plane (fwd/right)
        const dotFwd = _bFwd.dot(_bToTarget);
        const dotRight = _bRight.dot(_bToTarget);
        const dotUp = _bUp.dot(_bToTarget);
        // Clock position from atan2
        let angle = Math.atan2(dotRight, dotFwd); // 0 = 12 o'clock (ahead)
        if (angle < 0) angle += Math.PI * 2;
        const clock = Math.round(angle / (Math.PI / 6)); // 0-12
        const clockStr = clock === 0 || clock === 12 ? '12' : String(clock);
        // Vertical component
        const vert = dotUp > 0.3 ? ' high' : dotUp < -0.3 ? ' low' : '';
        return `${clockStr} o'clock${vert}, ${dist}m`;
    }

    // Bearing string for a specific entity from player
    function _bearingOf(entity) {
        if (!entity || !entity.position) return '';
        return _bearing(entity.position);
    }

    function _generateBaseComm() {
        const s = _snap();
        const pt = s.priorityTarget;
        const ptBearing = pt ? _bearingOf(pt) : '';
        const am = s.alienMothership;
        const amBearing = am ? _bearingOf(am) : '';

        // ── PROTECT BASE: Resolute under critical threat ──
        if (s.basePct < 15 && s.bomberNearBase) {
            return `CRITICAL: Base hull ${s.basePct}%. ${_cs()}, bomber at ${_bearingOf(s.bomberNearBase)} heading for the Resolute. Intercept NOW.`;
        }
        if (s.basePct < 15) return `Base hull critical at ${s.basePct}%. All fighters protect the Resolute immediately.`;
        if (s.basePct < 35 && s.bomberNearBase) {
            return `Base hull ${s.basePct}%. ${_cs()}, bomber at ${_bearingOf(s.bomberNearBase)}. Stop it before it reaches torpedo range.`;
        }
        if (s.basePct < 35) return `Base hull at ${s.basePct}%. Bombers are getting through — tighten the perimeter.`;

        // ── PROTECT BASE: multiple threats closing on Resolute ──
        if (s.threatsNearBase >= 3 && s.basePct < 60) {
            return `${_cs()}, ${s.threatsNearBase} hostiles closing on the Resolute. Base hull ${s.basePct}% — fall back and protect her.`;
        }
        if (s.threatsNearBase >= 4) {
            return `Multiple contacts inside base perimeter. ${_cs()}, the Resolute needs fighter cover — regroup to base.`;
        }

        // ── ATTACK MOTHERSHIP: suggest when conditions are favorable ──
        if (am && s.totalHostile <= 3 && s.basePct > 50) {
            return `${_cs()}, escorts are thinned out. Mothership at ${amBearing}, hull ${s.alienMothershipHullPct}%. Now's your chance — hit her hard.`;
        }
        if (am && s.alienMothershipHullPct < 30) {
            return `Enemy mothership at ${amBearing}, hull critical at ${s.alienMothershipHullPct}%. ${_cs()}, pour it on — she's almost done!`;
        }
        if (am && s.totalHostile <= 5 && s.torpCount >= 2 && s.basePct > 40) {
            return `${_cs()}, you've got ${s.torpCount} torpedoes. Mothership at ${amBearing}. ${s.totalHostile} escorts — clear them and press the attack.`;
        }

        // ── HIGH-VALUE TARGETS ──
        if (s.dreadnoughts > 0 && pt && s.priorityType === 'dreadnought') {
            return `${_cs()}, dreadnought at ${ptBearing}. ${s.totalHostile} total contacts. Focus fire — use torpedoes.`;
        }
        if (s.predators > 0 && s.closestType === 'predator' && s.closestM < 600) {
            return `${_cs()}, Predator Drone at ${_bearing(s.closestPos)}. Evade its plasma — hit the underbelly.`;
        }
        if (s.predators > 0 && pt && s.priorityType === 'predator') {
            return `${_cs()}, predator at ${ptBearing}. Watch for plasma fire.`;
        }
        if (s.bombers > 1 && s.bomberNearBase) {
            return `${_cs()}, ${s.bombers} bombers active. Nearest to base at ${_bearingOf(s.bomberNearBase)}. Intercept.`;
        }
        if (s.interceptors > 2 && pt && s.priorityType === 'interceptor') {
            return `${_cs()}, ${s.interceptors} interceptors. Lead contact at ${ptBearing}. Check your six.`;
        }

        // ── GENERAL TACTICAL ──
        if (s.totalHostile > 10 && pt) return `${s.totalHostile} bogies. ${_cs()}, priority target at ${ptBearing}. Engage.`;
        if (s.totalHostile > 5 && pt) return `${s.totalHostile} contacts. Nearest threat at ${ptBearing}, ${_cs()}.`;
        if (s.totalHostile > 0 && s.closestPos) return `${_cs()}, contact at ${_bearing(s.closestPos)}. ${s.totalHostile} remaining. Weapons free.`;
        if (s.totalHostile > 0) return `${s.totalHostile} contacts remaining this wave. Closest at ${s.closestM}m.`;

        // ── ATTACK HIVE: suggest attacking stationary alien base when wave is clear ──
        const hive = s.alienHive;
        if (hive) {
            const hiveBearing = _bearingOf(hive);
            if (s.alienHiveHullPct < 25) return `The hive is crumbling at ${s.alienHiveHullPct}% hull, ${hiveBearing}. ${_cs()}, finish it off — end this war!`;
            if (s.alienHiveHullPct < 50) return `Hive hull at ${s.alienHiveHullPct}%, ${hiveBearing}. Between waves — press the attack, ${_cs()}!`;
            return `Wave clear. Hive at ${hiveBearing}, hull ${s.alienHiveHullPct}%. ${_cs()}, use this window to hit the hive.`;
        }
        if (state.wave >= 4 && !state.alienBaseSpawned) return `Intel suggests an alien hive structure nearby. One more wave and we'll have its position.`;

        return `Sector reads clear. ${state.kills} confirmed kills. Base hull holding at ${s.basePct}%.`;
    }

    function _generateAllyComm() {
        const s = _snap();
        const callsign = `Alpha-${Math.floor(Math.random() * 3) + 1}`;
        if (s.closestType === 'interceptor' && s.closestM < 400 && s.closestPos) return { sender: callsign, msg: `Interceptor at ${_bearing(s.closestPos)}! Engaging.` };
        if (s.closestType === 'bomber' && s.closestM < 800 && s.closestPos) return { sender: callsign, msg: `Bomber at ${_bearing(s.closestPos)} heading for base. Moving to intercept.` };
        if (s.closestType === 'predator' && s.closestPos) return { sender: callsign, msg: `Predator at ${_bearing(s.closestPos)}. Keeping distance — that plasma is lethal.` };
        if (s.totalHostile > 8 && s.priorityTarget) return { sender: callsign, msg: `Heavy contacts — ${s.totalHostile} bogies. Priority at ${_bearingOf(s.priorityTarget)}. Could use help.` };
        if (s.totalHostile > 3 && s.closestPos) return { sender: callsign, msg: `${s.totalHostile} on radar. Nearest at ${_bearing(s.closestPos)}. Engaging.` };
        if (s.totalHostile > 0 && s.closestPos) return { sender: callsign, msg: `${s.totalHostile} left at ${_bearing(s.closestPos)}. Pushing to clear.` };
        return { sender: callsign, msg: `Sector quiet. Holding formation near base.` };
    }

    function _generateWarningComm() {
        const s = _snap();
        if (s.hullPct < 25) return `${_cs()}, hull at ${s.hullPct}%. Seek medical frigate or RTB.`;
        if (s.shieldPct <= 0 && s.hullPct < 60) return `${_cs()}, shields down. Hull at ${s.hullPct}%. Avoid direct engagement.`;
        if (s.fuelPct < 15) return `${_cs()}, fuel at ${s.fuelPct}%. Conserve afterburner.`;
        if (s.torpCount === 0 && s.dreadnoughts > 0) return `${_cs()}, no torpedoes remaining. Dreadnought still active — resupply needed.`;
        if (s.basePct < 25) return `CRITICAL: Base hull ${s.basePct}%. Protect the Resolute at all costs.`;
        if (s.bombers > 0 && s.basePct < 50 && s.bomberNearBase) return `WARNING: Bomber at ${_bearingOf(s.bomberNearBase)} heading for base. Base hull only ${s.basePct}%.`;
        if (s.bombers > 0 && s.basePct < 50) return `WARNING: ${s.bombers} bombers active. Base hull only ${s.basePct}%.`;
        if (s.totalHostile > 12 && s.priorityTarget) return `CAUTION: ${s.totalHostile} signatures. Priority threat at ${_bearingOf(s.priorityTarget)}.`;
        if (s.totalHostile > 12) return `CAUTION: ${s.totalHostile} bogie signatures. High threat density.`;
        if (s.closestM < 300 && s.closestType && s.closestPos) return `PROXIMITY: ${s.closestType} at ${_bearing(s.closestPos)}. Break if needed.`;
        if (s.predators > 0 && s.priorityTarget && s.priorityType === 'predator') return `WARNING: Predator at ${_bearingOf(s.priorityTarget)}. Avoid close range.`;
        if (s.predators > 0) return `WARNING: Predator Drone active. Avoid close range.`;
        return `Status: ${s.totalHostile} bogies, hull ${s.hullPct}%, base ${s.basePct}%.`;
    }

    // ── CIC Crew Roster ──
    // The Resolute's Combat Information Center is staffed by multiple officers.
    // Different people speak based on their specialty. Natural rotation.
    const _cicCrew = [
        { name: 'Cdr. Vasquez', roles: ['command'] },
        { name: 'XO Tanaka', roles: ['command', 'ops'] },
        { name: 'Lt. Chen', roles: ['tactical', 'command'] },
        { name: 'Sgt. Kozlov', roles: ['tactical'] },
        { name: 'Ens. Park', roles: ['sensor', 'science'] },
        { name: 'Ens. Osei', roles: ['sensor'] },
        { name: 'CPO Okafor', roles: ['deck', 'ops'] },
        { name: 'PO2 Ruiz', roles: ['deck'] },
        { name: 'Lt. Cruz', roles: ['ops', 'tactical'] },
        { name: 'Dr. Hollis', roles: ['science', 'sensor'] },
    ];
    let _cicRotation = 0;
    let _lastCrewName = '';
    function _crew(role) {
        const eligible = _cicCrew.filter(c => c.roles.includes(role));
        if (eligible.length === 0) { _lastCrewName = _cicCrew[0].name; return _lastCrewName; }
        _cicRotation++;
        _lastCrewName = eligible[_cicRotation % eligible.length].name;
        return _lastCrewName;
    }
    // Speak with the voice of the last _crew() call
    function _crewSpeak(text) {
        if (window.SFAudio && SFAudio.speakAs) SFAudio.speakAs(_lastCrewName, text);
        else if (window.SFAudio && SFAudio.speak) SFAudio.speak(text);
    }

    // Player callsign — assigned from military phonetic pool (no user input to prevent abuse)
    const _callsignPool = [
        'VIPER', 'PHOENIX', 'MAVERICK', 'STARDUST', 'RAZOR', 'NOVA', 'ECLIPSE', 'FALCON',
        'TALON', 'SPECTRE', 'BLAZE', 'COMET', 'DAGGER', 'HAWK', 'STORM', 'VALKYRIE',
        'SHADOW', 'TITAN', 'WRAITH', 'ZENITH', 'COBRA', 'DELTA', 'GHOST', 'ROGUE',
        'APEX', 'BOLT', 'CRUCIBLE', 'NOMAD', 'SABER', 'STRIKER'
    ];
    function _assignCallsign() {
        let cs = localStorage.getItem('sf_callsign');
        if (!cs) {
            cs = _callsignPool[Math.floor(Math.random() * _callsignPool.length)];
            localStorage.setItem('sf_callsign', cs);
        }
        state.callsign = cs;
    }
    function _cs() { return state.callsign || 'Pilot'; }

    function _showCallsignPrompt(onReady) {
        // Assign callsign from pool (no user input — prevents abuse)
        _assignCallsign();
        // Auto-assign a random crew voice if not already set
        if (window.SFAudio && SFAudio.getPlayerVoiceMenu && !localStorage.getItem('sf_voice_module')) {
            const menu = SFAudio.getPlayerVoiceMenu();
            const all = [...menu.female, ...menu.male];
            const pick = all[Math.floor(Math.random() * all.length)];
            localStorage.setItem('sf_voice_module', pick.id);
            localStorage.setItem('sf_voice_gender', menu.female.find(v => v.id === pick.id) ? 'female' : 'male');
            SFAudio.setCrewVoiceModule && SFAudio.setCrewVoiceModule('Cdr. Vasquez', pick.id);
            SFAudio.setCrewVoiceModule && SFAudio.setCrewVoiceModule('Resolute Actual', pick.id);
            SFAudio.setVoiceModule && SFAudio.setVoiceModule(pick.id);
        }
        onReady();
    }

    // Event-driven comm generators — every event message reads live state
    function _killComm(type) {
        const s = _snap();
        const left = s.totalHostile;
        const nextDir = s.priorityTarget ? ` Next priority at ${_bearingOf(s.priorityTarget)}.` : '';
        if (left === 0) return `${_cs()}, that's the last one. Sector clear. ${state.kills} kills this wave.`;
        if (type === 'predator') return `${_cs()}, Predator Drone down. ${left} bogie${left !== 1 ? 's' : ''} on scope.${nextDir}`;
        if (type === 'bomber') return `Bomber neutralized, ${_cs()}. Base hull ${s.basePct}%. ${left} remaining.${nextDir}`;
        if (type === 'dreadnought') return `DREADNOUGHT DESTROYED! Outstanding, ${_cs()}. ${left} bogies remain.${nextDir}`;
        if (type === 'hive-queen') return `HIVE QUEEN DESTROYED! Remarkable flying, ${_cs()}. The Hive is leaderless. ${left} contacts remaining.${nextDir}`;
        if (type === 'interceptor') return `Interceptor eliminated, ${_cs()}. ${left} contacts active.${nextDir}`;
        return `Kill confirmed, ${_cs()}. ${left} remaining.${nextDir}`;
    }

    function _waveArrivalComm() {
        const s = _snap();
        const parts = [];
        if (s.enemies > 0) parts.push(`${s.enemies} drone${s.enemies > 1 ? 's' : ''}`);
        if (s.interceptors > 0) parts.push(`${s.interceptors} interceptor${s.interceptors > 1 ? 's' : ''}`);
        if (s.bombers > 0) parts.push(`${s.bombers} bomber${s.bombers > 1 ? 's' : ''}`);
        if (s.predators > 0) parts.push(`${s.predators} predator${s.predators > 1 ? 's' : ''}`);
        if (s.dreadnoughts > 0) parts.push(`${s.dreadnoughts} dreadnought${s.dreadnoughts > 1 ? 's' : ''}`);
        if (s.hiveQueens > 0) parts.push(`HIVE QUEEN`);
        const manifest = parts.length ? parts.join(', ') : `${s.totalHostile} contacts`;
        return `Wave ${state.wave}: ${manifest} on scope. Base hull ${s.basePct}%. All stations combat ready.`;
    }

    function _landingDebriefComm() {
        const s = _snap();
        const hullNote = s.hullPct < 50 ? ` Hull at ${s.hullPct}% — repair crews standing by.` : '';
        return `docking confirmed. ${state.kills} total kills, score ${state.score}.${hullNote}`;
    }

    function _queueAdaptiveLaunchBriefing() {
        const brief = _makeDynamicBattleBrief();
        const deckOfficer = _crew('deck');
        addComm(deckOfficer, brief, 'warning');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // DEBRIS PICKUP SYSTEM
    // Pickups scatter during combat — collected immediately, applied next wave.
    // ══════════════════════════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════════════════════════════════════
    // POWERUP SYSTEM
    // Scattered during combat — collected on contact, applied immediately within the sortie.
    // ══════════════════════════════════════════════════════════════════════════════════════════
    const POWERUPS = [
        // id, label, icon, rarity (higher = rarer), flavour, apply(player)
        { id: 'hull', label: 'Hull Repair', icon: '🔩', rarity: 1.0, flavour: 'Hull plating patched.', apply: p => { p.hull = Math.min(dim('player.hull'), p.hull + 40); } },
        { id: 'shield', label: 'Shield Restore', icon: '🔋', rarity: 1.2, flavour: 'Shield cells recharged.', apply: p => { p.shields = Math.min(dim('player.shields'), p.shields + 35); } },
        { id: 'fuel', label: 'Fuel Pack', icon: '⛽', rarity: 1.4, flavour: 'Fuel tanks topped off.', apply: p => { p.fuel = Math.min(dim('player.fuel'), p.fuel + dim('player.fuel') * 0.4); } },
        { id: 'missile', label: 'Torpedo Pack', icon: '🚀', rarity: 1.6, flavour: 'Torpedo magazine reloaded.', apply: p => { p.torpedoes = Math.min(dim('cap.torpedoes'), p.torpedoes + 3); } },
    ];

    // Weighted random powerup type — rarer items less likely
    function _randomPickupType() {
        const totalW = POWERUPS.reduce((s, p) => s + (1 / p.rarity), 0);
        let roll = Math.random() * totalW;
        for (const p of POWERUPS) {
            roll -= 1 / p.rarity;
            if (roll <= 0) return p;
        }
        return POWERUPS[0];
    }

    // Spawn powerups at random positions around the arena after wave start
    function _spawnDebrisPickups() {
        if (state.wave < 1) return;
        const count = 3 + Math.floor(Math.random() * 4); // 3–6
        const r = 3000 + Math.random() * 4000;
        for (let i = 0; i < count; i++) {
            const theta = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.9;
            const phi = Math.acos(Math.random() * 2 - 1);
            const px = r * Math.sin(phi) * Math.cos(theta);
            const py = r * Math.sin(phi) * Math.sin(theta);
            const pz = r * Math.cos(phi);
            const def = _randomPickupType();
            const pickup = new Entity('pickup', px, py, pz);
            pickup.radius = 120;
            pickup._pickupType = def.id;
            pickup._pickupDef = def;
            pickup._collected = false;
            state.entities.push(pickup);
            if (window.SF3D && SF3D.spawnPickup) SF3D.spawnPickup(pickup);
        }
    }

    // ── Leader detection: Captain rank (index 4) or above plays indefinitely ──
    const _LEADER_RANK_IDX = 4; // captain
    function _isLeader() {
        if (!window.SFProgression) return false;
        const rank = SFProgression.getRank();
        const RANKS = ['ensign', 'ltjg', 'lieutenant', 'ltcmdr', 'captain', 'major', 'colonel', 'commander'];
        return RANKS.indexOf(rank.id) >= _LEADER_RANK_IDX;
    }

    function _onPlayerDestroyed(causeText) {
        if (!state.running || state.respawning) return;

        const reason = causeText || 'HULL INTEGRITY FAIL';

        // Training mode: show death screen but don't actually cost a life
        if (state._trainingMode) {
            state.respawning = true;
            state.respawnTimer = dim('timing.respawn');
            state.respawnReason = reason;
            if (window.SFAudio) {
                SFAudio.playSound('warning');
                SFAudio.stopCockpitHum();
                SFAudio.stopThrustRumble();
                SFAudio.stopStrafeHiss();
            }
            addComm('Hotshot', "Don't sweat it, Ensign — that's what training's for. Get back out there.", 'info');
            _showRespawnScreen();
            return;
        }

        state.livesRemaining = Math.max(0, state.livesRemaining - 1);

        if (state.livesRemaining <= 0) {
            if (_isLeader()) {
                // Leaders never get eliminated — grant a bonus life and keep fighting
                state.livesRemaining = 1;
                state.maxLives = Math.max(state.maxLives, 1);
                if (window.SFAnnouncer) SFAnnouncer.onPlayerDestroyed(reason, 1, state.maxLives);
                if (window.SFAudio) SFAudio.playSound('warning');
                addComm('COMMAND', `${state.callsign ? state.callsign.toUpperCase() : 'LEADER'} — command authority extends your sortie. Press on.`, 'info');
                // Fall through to normal respawn below
            } else {
                if (window.SFAnnouncer) SFAnnouncer.onPlayerDestroyed(reason, 0, state.maxLives);
                if (window.SFAudio) SFAudio.playSound('warning');
                setTimeout(() => _eliminatePlayer(reason), 1200);
                return;
            }
        }

        state._waveDeaths = (state._waveDeaths || 0) + 1; // track deaths for tier + adaptive scenario
        state._replacementBriefing = _makeDynamicBattleBrief();
        state.respawning = true;
        state.respawnTimer = dim('timing.respawn');
        state.respawnReason = reason;

        if (window.SFAnnouncer) SFAnnouncer.onPlayerDestroyed(reason, state.livesRemaining, state.maxLives);

        if (window.SFAudio) {
            SFAudio.playSound('warning');
            SFAudio.stopCockpitHum();
            SFAudio.stopThrustRumble();
            SFAudio.stopStrafeHiss();
        }

        _showRespawnScreen();
    }

    // ── Player elimination (non-leader, all lives exhausted) ──
    function _eliminatePlayer(reason) {
        state.running = false;
        state.eliminated = true;

        // Build AAR identical to gameOver but shown on elimination overlay
        const ms = state.missionStats;
        ms.waveReached = state.wave;
        const elapsed = Math.floor((performance.now() - ms.startTime) / 1000);
        ms.accuracy = ms.shotsFired > 0 ? Math.round((ms.shotsHit / ms.shotsFired) * 100) : 0;
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;

        if (window.SFProgression) {
            SFProgression.endMission({ deaths: state.maxLives, waveReached: ms.waveReached, flightTime: elapsed, score: state.score });
        }

        const rank = window.SFProgression ? SFProgression.getRank() : { icon: '◇', name: 'Ensign' };
        const nextRank = window.SFProgression && SFProgression.getNextRank ? SFProgression.getNextRank() : null;
        const nextMsg = nextRank
            ? `Reach <b>${nextRank.name}</b> for unlimited lives &amp; leaderboard status.`
            : `<span style="color:#ffd700">★ LEADER STATUS ACTIVE — leaderboard eligible</span>`;

        // Broadcast elimination to squad in multiplayer
        if (state.isMultiplayer && window.SFMultiplayer) {
            SFMultiplayer.sendAction('player_eliminated', { wave: state.wave, score: state.score });
        }

        const overlay = document.getElementById('eliminated-overlay');
        if (overlay) {
            overlay.querySelector('#elim-reason').textContent = reason || 'ALL FIGHTERS LOST';
            overlay.querySelector('#elim-wave').textContent = ms.waveReached;
            overlay.querySelector('#elim-kills').textContent = state.kills;
            overlay.querySelector('#elim-score').textContent = state.score.toLocaleString();
            overlay.querySelector('#elim-accuracy').textContent = ms.accuracy + '%';
            overlay.querySelector('#elim-rank').innerHTML = rank.icon + ' ' + rank.name;
            overlay.querySelector('#elim-next').innerHTML = nextMsg;
            overlay.querySelector('#elim-time').textContent = minutes + 'm ' + seconds + 's';
            overlay.style.display = 'flex';
        } else {
            // Fallback: use death screen
            const deathScreen = document.getElementById('death-screen');
            if (deathScreen) {
                document.getElementById('death-reason').innerText = `ELIMINATED — Wave ${ms.waveReached} | Score ${state.score.toLocaleString()}`;
                deathScreen.style.display = 'flex';
            }
        }
        document.getElementById('gameplay-hud').style.display = 'none';
        document.getElementById('radar-overlay').style.display = 'none';

        if (state.isMultiplayer && window.SFMultiplayer) {
            // In multiplayer: shift to spectator — keep world rendering, block input
            state.spectating = true;
            state.running = true; // keep the render loop alive
            const specMsg = document.getElementById('spectator-msg');
            if (specMsg) specMsg.style.display = 'block';
        } else {
            // Solo: 10s countdown then reload
            let _eSecs = 10;
            const _eCdEl = document.getElementById('elim-countdown');
            if (_eCdEl) _eCdEl.textContent = _eSecs;
            const _eTick = setInterval(() => {
                _eSecs--;
                const el = document.getElementById('elim-countdown');
                if (el) el.textContent = _eSecs;
                if (_eSecs <= 0) { clearInterval(_eTick); location.reload(); }
            }, 1000);
        }
    }

    function addComm(sender, message, type) {
        // Audio: comm beep on each message
        if (window.SFAudio) SFAudio.playSound('comm_beep');

        // Voice synthesis — character-specific tactical radio voice (generic bot voice forbidden)
        if (window.SFAudio && SFAudio.speakAnpc) SFAudio.speakAnpc(sender, message);

        // Feed the scrolling marquee ticker at the top of the screen
        const ticker = document.getElementById('comm-ticker-inner');
        if (ticker) {
            const item = document.createElement('span');
            item.className = `comm-item ${type}`;
            item.textContent = `[${sender}] ${message}`;
            ticker.appendChild(item);
            // Keep only last 20 items so the ticker doesn't grow forever
            const items = ticker.querySelectorAll('.comm-item');
            if (items.length > 20) items[0].remove();
            // Reset animation so new messages are visible
            ticker.style.animation = 'none';
            ticker.offsetHeight; // reflow
            ticker.style.animation = '';
        }
        // Also keep the hidden legacy comm-messages element fed (for compat)
        const commEl = document.getElementById('comm-messages');
        if (commEl) {
            const msgEl = document.createElement('div');
            msgEl.className = `comm-message ${type}`;
            msgEl.innerHTML = `<b>${sender}:</b> ${message}`;
            commEl.appendChild(msgEl);
            const messages = commEl.querySelectorAll('.comm-message');
            if (messages.length > 15) messages[0].remove();
        }
    }

    function _setPauseButtonUI(paused) {
        const btn = document.getElementById('btn-pause');
        if (!btn) return;
        btn.classList.toggle('active', paused);
        btn.innerHTML = paused ? '&#9654; PLAY' : '&#10074;&#10074; PAUSE';
    }

    function _setPaused(paused) {
        if (!state.running) return false;
        const next = !!paused;
        if (state.paused === next) return state.paused;
        state.paused = next;

        const cd = document.getElementById('countdown-display');
        if (next) {
            if (document.pointerLockElement) document.exitPointerLock();
            if ('speechSynthesis' in window && speechSynthesis.speaking) speechSynthesis.cancel();
            if (window.SFAudio && SFAudio.pauseAll) SFAudio.pauseAll();
            if (cd) {
                cd.style.display = 'block';
                cd.innerHTML = '<span style="color:#ffd24a">PAUSED</span><br><span style="font-size:0.45em;color:#88ccff">Press PLAY to resume</span>';
                cd.style.fontSize = '2.6em';
                cd.style.color = '#ffd24a';
            }
            if (window.SFAnnouncer) SFAnnouncer.onPause();
            else addComm('System', 'Game paused.', 'info');
        } else {
            if (window.SFAudio && SFAudio.resumeAll) SFAudio.resumeAll();
            if (cd && state.phase === 'combat') cd.style.display = 'none';
            state.lastTime = performance.now();
            if (window.SFAnnouncer) SFAnnouncer.onResume();
            else addComm('System', 'Game resumed.', 'info');
        }
        _setPauseButtonUI(next);
        return state.paused;
    }

    function togglePause() {
        return _setPaused(!state.paused);
    }

    function exitGame() {
        state.running = false;
        if (document.pointerLockElement) document.exitPointerLock();
        if (window.SFAudio && SFAudio.pauseAll) SFAudio.pauseAll();
        if ('speechSynthesis' in window && speechSynthesis.speaking) speechSynthesis.cancel();
        if (window.SFMusic && SFMusic.stop) SFMusic.stop();
        window.location.href = '/lobby/';
    }

    // The Manifold — ground truth for all entity state
    const M = window.SpaceManifold;
    // Dimensional framework — five verbs / presence / intersects / frame clock.
    // Lives on the unified Manifold (js/manifold.js); SpaceManifold.dim is the
    // lens registry, so the two namespaces must not be conflated.
    const MD = (window.Manifold && window.Manifold.dim) || null;

    // Dimensional shorthand — all game constants flow through SpaceManifold.dim()
    const dim = (name) => M.dim(name);

    // Scratch vectors — reuse to avoid GC pressure in hot path
    const _v1 = new THREE.Vector3();
    const _v2 = new THREE.Vector3();
    const _q1 = new THREE.Quaternion();
    let _frameCount = 0; // for throttling HUD updates

    class Entity {
        constructor(type, x, y, z) {
            this.id = Math.random().toString(36).substr(2, 9);
            this.type = type;

            this.position = new THREE.Vector3(x, y, z);
            this.velocity = new THREE.Vector3(0, 0, 0);
            this.quaternion = new THREE.Quaternion();

            this.hull = 100;
            this.shields = 100;
            this.maxSpeed = 100;
            this.radius = 10;
            this.markedForDeletion = false;
            this.age = 0;      // seconds alive — used for projectile expiry
            this.maxAge = 0;   // 0 = no expiry

            if (M) M.place(this);
        }

        takeDamage(amt) {
            // Medical frigate and fuel tanker are indestructible support vessels
            if (this.type === 'tanker' || this.type === 'medic') return;

            if (this.shields > 0) {
                this.shields -= amt;
                if (this.shields < 0) {
                    this.hull += this.shields;
                    this.shields = 0;
                }
            } else {
                this.hull -= amt;
            }
            if (this.type === 'player') state.missionStats.damageTaken += amt;
            if (this.hull <= 0) this.explode();
        }

        explode() {
            if (this.type === 'player') {
                this.markedForDeletion = true;
                if (M) M.remove(this.id);
                if (window.SF3D) SF3D.spawnExplosion(this.position);
                if (window.SFAudio) {
                    SFAudio.playSound('explosion');
                    SFAudio.playSound('shockwave');
                }
                _onPlayerDestroyed('HULL INTEGRITY FAIL');
                return;
            }

            this.markedForDeletion = true;
            if (M) M.remove(this.id);
            // Decrement cluster alive count when a clustered enemy is destroyed
            if (this._clusterId !== undefined) {
                const _cl = state.clusters.find(c => c.id === this._clusterId);
                if (_cl && _cl.alive > 0) { _cl.alive--; _updateClusterHUD(); }
            }
            if (window.SF3D) SF3D.spawnExplosion(this.position);
            if (window.SFAudio) SFAudio.playSound('explosion');
            if (window.SFAudio) SFAudio.playSound('shockwave');

            // ── Wreckage spawning (wave 3+, 40% chance for enemies/predators/bosses) ──
            if (state.wave >= 3 && Math.random() < 0.4) {
                if (this.type === 'enemy' || this.type === 'predator' || this.type === 'dreadnought' ||
                    this.type === 'alien-baseship' || this._isBoss) {
                    _spawnWreckage(this.position, this.type, this._isBoss);
                }
            }

            if (this.type === 'enemy') {
                state.score += dim('score.enemy');
                state.kills++;
                if (this.killedBy === 'player') state.playerKills++;
                _addKillFeedEntry(
                    (this.killedBy === 'player' ? 'You' : (this.killedBy || '?')) + ' → Splash Enemy Drone [' + (this._killedByWeapon || 'Laser') + ']',
                    this.killedBy === 'player' ? '#00ffaa' : '#88aacc'
                );
                if (this.killedBy === 'player' && (state.kills % 3 === 0 || _countActiveHostiles() <= 2)) {
                    if (window.SFAnnouncer) SFAnnouncer.onKill('enemy');
                }
                checkWave();

            } else if (this.type === 'predator') {
                state.score += dim('score.predator');
                state.kills++;
                if (this.killedBy === 'player') state.playerKills++;
                _addKillFeedEntry(
                    (this.killedBy === 'player' ? 'You' : (this.killedBy || '?')) + ' → Splash Predator [' + (this._killedByWeapon || 'Laser') + ']',
                    '#ff4400'
                );
                if (window.SFAnnouncer) SFAnnouncer.onKill('predator');
                checkWave();

            } else if (this.type === 'interceptor') {
                state.score += dim('score.interceptor');
                state.kills++;
                if (this.killedBy === 'player') state.playerKills++;
                _addKillFeedEntry(
                    (this.killedBy === 'player' ? 'You' : (this.killedBy || '?')) + ' → Splash Interceptor [' + (this._killedByWeapon || 'Laser') + ']',
                    this.killedBy === 'player' ? '#00ffcc' : '#88aacc'
                );
                if (window.SFAnnouncer) SFAnnouncer.onKill('interceptor');
                checkWave();

            } else if (this.type === 'bomber') {
                state.score += dim('score.bomber');
                state.kills++;
                if (this.killedBy === 'player') state.playerKills++;
                _addKillFeedEntry(
                    (this.killedBy === 'player' ? 'You' : (this.killedBy || '?')) + ' → Splash Bomber [' + (this._killedByWeapon || 'Torpedo') + ']',
                    '#ff6600'
                );
                if (window.SFAnnouncer) SFAnnouncer.onKill('bomber');
                checkWave();

            } else if (this.type === 'dreadnought') {
                state.score += dim('score.dreadnought');
                state.kills++;
                if (this.killedBy === 'player') state.playerKills++;
                _addKillFeedEntry(
                    (this.killedBy === 'player' ? 'You' : (this.killedBy || '?')) + ' → DREADNOUGHT DESTROYED [' + (this._killedByWeapon || 'Torpedo') + ']',
                    '#ff0044'
                );
                if (window.SFAnnouncer) SFAnnouncer.onKill('dreadnought');
                checkWave();

            } else if (this.type === 'hive-queen') {
                state.score += 10000;
                state.kills++;
                if (this.killedBy === 'player') state.playerKills++;
                _addKillFeedEntry(
                    (this.killedBy === 'player' ? 'You' : (this.killedBy || '?')) + ' → ⚠ HIVE QUEEN DESTROYED [' + (this._killedByWeapon || 'Torpedo') + ']',
                    '#ff00ff'
                );
                if (window.SFAnnouncer) SFAnnouncer.onKill('hive-queen');
                checkWave();

            } else if (this.type === 'tanker' || this.type === 'medic') {
                return;

            } else if (this.type === 'alien-base') {
                state.score += dim('score.victory');
                if (window.SFAnnouncer) SFAnnouncer.onVictory();
                setTimeout(() => gameOver('VICTORY — Enemy Station Destroyed!', true), 2000);

            } else if (this.type === 'military-ship') {
                state.militaryAlive = false;
                if (window.SFAnnouncer) SFAnnouncer.onMilitaryLost();
                if (window.SFAudio) SFAudio.playSound('warning');

            } else if (this.type === 'civilian-station') {
                if (window.SFAnnouncer) SFAnnouncer.onCivilianLost();
                setTimeout(() => gameOver('DEFEAT — Civilian Station Destroyed'), 2000);

            } else if (this.type === 'ally') {
                state.score -= Math.abs(dim('score.friendlyKill'));
                if (window.SFAnnouncer) SFAnnouncer.onAllyDown();
            } else if (this.type === 'wingman') {
                state.missionStats.wingmenLost++;
                const cs = this.callsign || 'Wingman';
                _addKillFeedEntry('✖ ' + cs + ' — KIA', '#ff4444');
                if (this._anpc && window.SFAnpc) {
                    SFAnpc.setState(this._anpcKey, 'DESTROYED');
                    // Morale hit to all surviving wingmen
                    state.entities.forEach(e => {
                        if (e.type === 'wingman' && !e.markedForDeletion && e._anpc) {
                            SFAnpc.adjustMorale(e._anpcKey, -0.15);
                        }
                    });
                }
            }

            // ── Progression: award XP/credits on hostile kills ──
            const HOSTILE_TYPES = ['enemy', 'interceptor', 'bomber', 'predator', 'dreadnought', 'alien-baseship', 'egg', 'youngling', 'hive-queen'];
            if (HOSTILE_TYPES.includes(this.type) && this.killedBy === 'player' && window.SFProgression) {
                const result = SFProgression.awardKill(this.type);
                // Rank-up notification
                if (result.ranked && result.newRank) {
                    const msg = '★ PROMOTED TO ' + result.newRank.name.toUpperCase() + ' ★';
                    _addKillFeedEntry(msg, '#ffdd00');
                    if (window.SFAnnouncer && SFAnnouncer.addComm) {
                        SFAnnouncer.addComm('FLEET', 'Congratulations, pilot. You\'ve been promoted to ' + result.newRank.name + '.', 'base');
                    }
                }
                // Check achievements
                const achievements = SFProgression.checkAchievements();
                for (const a of achievements) {
                    _addKillFeedEntry('🏆 ' + a.name + ' — ' + a.desc, '#ffaa00');
                }
            }
        }
    }

    class Player extends Entity {
        constructor() {
            super('player', 0, -32, 50); // Start inside baseship hangar bay
            this.throttle = 0; // 0 to 1
            // GDD §4.1 Flight Parameters — all from manifold dimensions
            this.maxSpeed = dim('player.maxSpeed');
            this.afterburnerSpeed = dim('player.afterburnerSpeed');
            this.boostSpeed = dim('player.boostSpeed');
            this.pitch = 0;
            this.yaw = 0;
            this.roll = 0;
            this.strafeH = 0;           // horizontal strafe input
            this.strafeV = 0;           // vertical strafe input
            this.torpedoes = dim('player.torpedoes');
            this.fuel = dim('player.fuel');
            this.afterburnerActive = false;
            this.boostActive = false;
            this.boostTimer = 0;         // remaining boost duration
            this.boostCooldown = 0;      // cooldown timer
            this.hyperdriveActive = false;
            this.hyperdriveSpooling = false;
            this.hyperdriveSpoolTimer = 0;
            this.hyperdriveCooldown = 0;
            this.hyperdriveSpeed = dim('player.hyperdriveSpeed');
            this.flightAssist = true;    // GDD §4.1: FA ON by default
            // Weapon selector — cycle with Q
            this.selectedWeapon = 0;     // 0=laser, 1=gun, 2=pulse, 3=torpedo
        }

        // Weapons unlock progressively by wave/level:
        // L1=LASER, L2+=SPREAD, L3+=TORP, L4+=EMP
        static WEAPONS = ['LASER', 'SPREAD', 'TORP', 'EMP'];

        cycleWeapon() {
            const maxSlots = _getUnlockedWeaponCount(state.wave);
            this.selectedWeapon = (this.selectedWeapon + 1) % maxSlots;
            const name = Player.WEAPONS[this.selectedWeapon];
            if (window.SFAudio) SFAudio.playSound('click');
            if (window.SFAnnouncer) SFAnnouncer.onWeaponSwitch(name);
            else addComm(_crew('tactical'), `Weapon: ${name}`, 'base');
        }

        // resolveIntent: pilot controls set velocity and orientation on the manifold point.
        resolveIntent(dt) {
            // GDD §4.1: Pitch 90°/s, Yaw 60°/s, Roll 120°/s (applied as multipliers)
            _q1.setFromEuler(new THREE.Euler(this.pitch * dt, this.yaw * dt, this.roll * dt, 'YXZ'));
            this.quaternion.multiply(_q1);

            _v1.set(0, 0, -1).applyQuaternion(this.quaternion);

            // Determine current max speed
            let currentMax = this.maxSpeed;

            // Hyperdrive spooling
            if (this.hyperdriveSpooling) {
                this.hyperdriveSpoolTimer -= dt;
                if (this.hyperdriveSpoolTimer <= 0) {
                    this.hyperdriveSpooling = false;
                    this.hyperdriveActive = true;
                    if (window.SFAudio) SFAudio.playSound('boost');
                    if (window.SFAnnouncer) SFAnnouncer.addComm && SFAnnouncer.addComm('NAV', 'Hyperdrive engaged.', 'base');
                }
            }

            // Hyperdrive active — burns fuel fast, overrides all other speed modes
            if (this.hyperdriveActive) {
                if (this.fuel > 0) {
                    currentMax = this.hyperdriveSpeed;
                    this.fuel = Math.max(0, this.fuel - dt * dim('player.hyperdriveBurn'));
                    if (this.fuel <= 0) this.disengageHyperdrive();
                } else {
                    this.disengageHyperdrive();
                }
            } else if (this.boostActive && this.boostTimer > 0) {
                currentMax = this.boostSpeed;
                this.boostTimer -= dt;
                if (this.boostTimer <= 0) {
                    this.boostActive = false;
                    this.boostCooldown = dim('player.boostCooldown');
                }
            } else if (this.afterburnerActive && this.fuel > 0) {
                currentMax = this.afterburnerSpeed;
                this.fuel = Math.max(0, this.fuel - dt * dim('player.afterburnerBurn'));
            }

            // Boost cooldown tick
            if (this.boostCooldown > 0) this.boostCooldown -= dt;
            // Hyperdrive cooldown tick
            if (this.hyperdriveCooldown > 0) this.hyperdriveCooldown -= dt;

            // Forward velocity
            const targetVel = _v1.clone().multiplyScalar(this.throttle * currentMax);

            // Strafe — speed from manifold dimension
            if (this.strafeH !== 0 || this.strafeV !== 0) {
                const sSpd = dim('player.strafeSpeed');
                const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
                const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);
                targetVel.add(right.multiplyScalar(this.strafeH * sSpd));
                targetVel.add(up.multiplyScalar(this.strafeV * sSpd));
            }

            if (this.flightAssist) {
                // FA-ON: velocity dampens to zero — damping from manifold dimension
                if (this.throttle < 0.01 && this.strafeH === 0 && this.strafeV === 0) {
                    this.velocity.multiplyScalar(1 - dt / dim('player.faDamping'));
                } else {
                    this.velocity.lerp(targetVel, dim('player.faLerp'));
                }
            } else {
                // GDD §4.1 FA-OFF: Newtonian — add thrust to existing velocity
                _v1.set(0, 0, -1).applyQuaternion(this.quaternion);
                this.velocity.add(_v1.multiplyScalar(this.throttle * currentMax * dt));
                // Clamp to current max
                if (this.velocity.length() > currentMax) {
                    this.velocity.normalize().multiplyScalar(currentMax);
                }
            }

            // Fuel regen when not using afterburner or hyperdrive
            if (!this.afterburnerActive && !this.boostActive && !this.hyperdriveActive) {
                this.fuel = Math.min(dim('player.fuel'), this.fuel + dt * dim('player.fuelRegen'));
            }

            // Input damping — from manifold dimensions
            this.pitch *= dim('player.pitchDamp');
            this.yaw *= dim('player.yawDamp');
            this.roll *= dim('player.rollDamp');
            this.strafeH *= dim('player.strafeHDamp');
            this.strafeV *= dim('player.strafeVDamp');
        }

        // GDD §4.1: Boost — tap to activate, 400 m/s for 3s, costs 25 fuel
        activateBoost() {
            const cost = dim('player.boostFuelCost');
            if (this.boostCooldown > 0 || this.boostActive || this.fuel < cost) return;
            this.boostActive = true;
            this.boostTimer = dim('player.boostDuration');
            this.fuel -= cost;
            if (window.SFAudio) SFAudio.playSound('boost');
        }

        // Hyperdrive — H key to engage/disengage, spools up before activating
        activateHyperdrive() {
            const cost = dim('player.hyperdriveFuelCost');
            if (this.hyperdriveCooldown > 0 || this.hyperdriveActive || this.hyperdriveSpooling || this.fuel < cost) return;
            this.hyperdriveSpooling = true;
            this.hyperdriveSpoolTimer = dim('player.hyperdriveSpoolTime');
            this.fuel -= cost;
            if (window.SFAudio) SFAudio.playSound('boost');
        }

        disengageHyperdrive() {
            this.hyperdriveActive = false;
            this.hyperdriveSpooling = false;
            this.hyperdriveSpoolTimer = 0;
            this.hyperdriveCooldown = dim('player.hyperdriveCooldown');
        }

        // GDD §4.1: Toggle Flight Assist
        toggleFlightAssist() {
            this.flightAssist = !this.flightAssist;
        }
    }

    class Baseship extends Entity {
        constructor() {
            super('baseship', 0, 0, 0);
            this.hull = dim('baseship.hull');
            this.shields = dim('baseship.shields');
            this.radius = dim('baseship.radius');
        }
    }

    function init() {
        state.maxLives = dim('lives.max');
        state.livesRemaining = state.maxLives;
        state.eliminated = false;
        state.spectating = false;
        state.respawning = false;
        state.respawnTimer = 0;
        state.respawnReason = 'HULL INTEGRITY FAIL';
        state._replacementVariant = '';
        state._replacementBriefing = '';

        state.player = new Player();
        state.player.hull = dim('player.hull');
        state.player.shields = dim('player.shields');

        // ── Load career and apply purchased upgrades ──
        if (window.SFProgression) {
            SFProgression.load();
            const career = SFProgression.career();
            // Apply persistent upgrade effects (hull plating, shield cap, etc.)
            SFProgression.applyUpgradesToPlayer(state.player, function (key, addVal) {
                // Additive boost to manifold dimensions
                if (key.startsWith('player.')) {
                    const prop = key.replace('player.', '');
                    if (state.player[prop] !== undefined) {
                        state.player[prop] += addVal;
                    }
                } else if (key.startsWith('weapon.')) {
                    // Weapon upgrades stored for later application at fire-time
                    if (!state._weaponBoosts) state._weaponBoosts = {};
                    state._weaponBoosts[key] = (state._weaponBoosts[key] || 0) + addVal;
                }
            });
            // Set initial rank display
            const rank = SFProgression.getRank();
            state._currentRank = rank;
            console.log('[CAREER] Rank:', rank.name, '| XP:', career.xp, '| Credits:', career.credits, '| Kills:', career.totalKills);
        }

        state.baseship = new Baseship();
        state.entities.push(state.player, state.baseship);
        state.phase = 'loading';
        state.launchTimer = 0;
        state.arenaRadius = dim('arena.radius');

        // Parse URL params: ?ai=0 disables AI wingmen, ?mode=multi/private activates MP
        const params = new URLSearchParams(window.location.search);
        state.aiWingmen = params.get('ai') !== '0';
        state.gameMode = params.get('mode') || 'solo';     // solo | multi | private
        state.roomCode = params.get('code') || null;        // invite code for private games
        state.isMultiplayer = state.gameMode !== 'solo';

        // Connect to multiplayer server if multiplayer mode
        if (state.isMultiplayer && window.SFMultiplayer) {
            const storedCallsign = localStorage.getItem('username') || 'Pilot';
            SFMultiplayer.connect(storedCallsign, function (event, data) {
                if (event === 'game_start') {
                    console.log('[MP] Game started — room:', data.room.id);
                } else if (event === 'remote_fire') {
                    // Spawn visual for remote player fire events
                    if (data.weapon === 'laser' && window.SF3D) {
                        SF3D.spawnLaser({ position: { x: data.x, y: data.y, z: data.z }, quaternion: new THREE.Quaternion() });
                    }
                } else if (event === 'game_over') {
                    console.log('[MP] Game over:', data.result);
                } else if (event === 'comm') {
                    addComm(data.sender, data.message, data.commType);
                } else if (event === 'chat') {
                    addComm(data.callsign, data.message, 'info');
                }
            });

            // Auto-join: private with code, or matchmake
            if (state.gameMode === 'private' && state.roomCode) {
                SFMultiplayer.joinRoom(state.roomCode);
            } else if (state.gameMode === 'multi') {
                SFMultiplayer.matchmake();
            }
        }

        // Init 3D system immediately so models start loading
        if (window.SF3D) {
            SF3D.init(state);
            SF3D.setLaunchPhase(true);
        }
        if (window.SFInput) SFInput.init(state.player);

        // Init autonomous announcer — crew observe and report game state
        if (window.SFAnnouncer) SFAnnouncer.init({
            state, addComm, snap: _snap, crew: _crew, cs: _cs,
            bearing: _bearing, bearingOf: _bearingOf, dim, countHostiles: _countActiveHostiles
        });

        // Init rescue system
        if (window.SFRescue) SFRescue.init(state);

        // Init threat detection & countermeasures system
        if (window.SFThreatSys) SFThreatSys.init();

        // Cockpit always visible — even during loading/bay
        if (window.SF3D) SF3D.showCockpit(true);

        // Gate game start behind asset loading + callsign prompt
        if (window.SF3D && SF3D.onAllModelsReady) {
            SF3D.onAllModelsReady(function () {
                _showCallsignPrompt(() => _startGame());
            });
        } else {
            // Fallback if no loading gate
            _showCallsignPrompt(() => _startGame());
        }
    }

    function _startGame() {
        state.running = true;
        state.paused = false;
        state.phase = 'bay-ready';  // Wait for player to push red launch button
        state._launchAudioPlayed = false;
        state._launchBlastPlayed = false;
        state._paBriefingDone = false;
        state.launchTimer = 0;
        state.launchDuration = 25.0; // Extended: PA narration (16s) + countdown (4s) + launch (3s) + exit (2s)

        // GDD §3.1: Bay ambient audio
        if (window.SFAudio) {
            SFAudio.init();
            // Restore saved voice preference (default au_female for new players)
            const savedVoiceMod = localStorage.getItem('sf_voice_module') || 'au_female';
            if (SFAudio.setVoiceModule) SFAudio.setVoiceModule(savedVoiceMod);
            if (SFAudio.setCrewVoiceModule) {
                SFAudio.setCrewVoiceModule('Cdr. Vasquez', savedVoiceMod);
                SFAudio.setCrewVoiceModule('Resolute Actual', savedVoiceMod);
            }
            SFAudio.startBayAmbience();
        }

        // Procedural orchestral music — ambient intensity in bay
        if (window.SFMusic && window.SFAudio) {
            SFMusic.init(SFAudio.getCtx(), SFAudio.getMasterGain());
            SFMusic.setSection('launch-bay');
            SFMusic.setIntensity(0.18);
            SFMusic.start();
        }

        // Start Loop (renders cockpit/bay scene even in bay-ready)
        state.lastTime = performance.now();
        requestAnimationFrame(gameLoop);

        // Show countdown area, cockpit stays visible during bay for immersion
        document.getElementById('ship-panel').style.display = 'none';
        document.getElementById('crosshair').style.display = 'none';
        document.getElementById('countdown-display').style.display = 'block';
        document.getElementById('countdown-display').innerHTML = '<span style="font-size:0.35em;color:#446688">LAUNCH BAY — STANDING BY</span>';

        if (window.SFAnnouncer) SFAnnouncer.onSecured();
        else addComm(_crew('deck'), `${_cs()}, fighter secured in bay. Wave ${state.wave} standing by.`, 'base');
        _setPauseButtonUI(false);

        // Entry point for round 1 — _configureGame handles all subsequent rounds
        _configureGame(state.player);
    }

    // ══════════════════════════════════════════════════════════════
    // TRAINING WAVE SYSTEM — Wave 1 guided in-flight training
    // Wingman Hotshot (male US) leads player through controls,
    // navigation, radar, and basic combat. Deaths don't cost lives.
    // ══════════════════════════════════════════════════════════════

    // Training comm script — each step fires after a delay from the previous
    // { delay: seconds from previous step, sender: comm name, msg: text, type: comm type }
    const TRAINING_SCRIPT_KB = [
        { delay: 2.0, sender: 'Hotshot', msg: "Hey Ensign, I'm Hotshot — your wingman. Time for your first in-flight training. Let's get you combat ready.", type: 'info' },
        { delay: 5.0, sender: 'Instructor', msg: "Alright Ensign, I'm your flight instructor. First — click anywhere on the screen to capture your mouse. Hit ESCAPE anytime to get your cursor back.", type: 'info' },
        { delay: 7.0, sender: 'Instructor', msg: "Good. Now move your mouse around — that is pitch and yaw. Get a feel for looking around the cockpit.", type: 'info' },
        { delay: 6.0, sender: 'Instructor', msg: "W and S control your throttle — push W to accelerate, S for reverse thrust. Try pushing forward now.", type: 'info' },
        { delay: 6.0, sender: 'Instructor', msg: "A and D bank you left and right. Arrow keys work too. Q and E roll your ship. Try a barrel roll — just for fun.", type: 'info' },
        { delay: 6.0, sender: 'Instructor', msg: "Check your radar — bottom left of your display. Blue blips are wingmen, green are support ships, red are hostiles. The degree markings show your bearing.", type: 'info' },
        { delay: 6.0, sender: 'Instructor', msg: "SHIFT gives you afterburner — burns fuel fast but gets you out of trouble. SPACE fires your weapons.", type: 'info' },
        { delay: 6.0, sender: 'Instructor', msg: "Press T to lock onto a target, or hold your crosshair on a bogie for 2 seconds — it will auto-lock. Press F to cycle targets.", type: 'info' },
        { delay: 6.0, sender: 'Instructor', msg: "One more thing — you will see colored diamonds out there. Those are power-ups. Fly through them to activate — shields, weapons, speed. They last for the round.", type: 'info' },
        { delay: 5.0, sender: 'Scope', msg: "Deploying target drones for live-fire practice. Contacts appearing on scope.", type: 'warning', action: 'spawn_drones' },
        { delay: 5.0, sender: 'Hotshot', msg: "Drones on scope. Line up your crosshair, wait for the lock tone, and light 'em up. Show me what you've got, Ensign.", type: 'info' },
    ];

    const TRAINING_SCRIPT_GAMEPAD = [
        { delay: 2.0, sender: 'Hotshot', msg: "Hey Ensign, I'm Hotshot — your wingman. Time for your first in-flight training. Let's get you combat ready.", type: 'info' },
        { delay: 5.0, sender: 'Instructor', msg: "Alright Ensign, I'm your flight instructor. Use your right stick to look around — that's pitch and yaw. Left stick controls throttle and movement.", type: 'info' },
        { delay: 7.0, sender: 'Instructor', msg: "Push the left stick forward to accelerate. Pull back to slow down. Left and right to bank.", type: 'info' },
        { delay: 6.0, sender: 'Instructor', msg: "Bumpers roll your ship — LB left, RB right. Try a barrel roll.", type: 'info' },
        { delay: 6.0, sender: 'Instructor', msg: "Check your radar — bottom left of your display. Blue blips are wingmen, green are support ships, red are hostiles. The degree markings show your bearing.", type: 'info' },
        { delay: 6.0, sender: 'Instructor', msg: "Right trigger fires your weapons. Left trigger is afterburner — burns fuel but gets you out of trouble fast.", type: 'info' },
        { delay: 6.0, sender: 'Instructor', msg: "Press Y to lock onto a target, or hold your crosshair on a bogie for 2 seconds — it will auto-lock.", type: 'info' },
        { delay: 6.0, sender: 'Instructor', msg: "One more thing — you will see colored diamonds out there. Those are power-ups. Fly through them to activate — shields, weapons, speed. They last for the round.", type: 'info' },
        { delay: 5.0, sender: 'Scope', msg: "Deploying target drones for live-fire practice. Contacts appearing on scope.", type: 'warning', action: 'spawn_drones' },
        { delay: 5.0, sender: 'Hotshot', msg: "Drones on scope. Line up your crosshair, wait for the lock tone, and light 'em up. Show me what you've got, Ensign.", type: 'info' },
    ];

    const TRAINING_SCRIPT_TOUCH = [
        { delay: 2.0, sender: 'Hotshot', msg: "Hey Ensign, I'm Hotshot — your wingman. Time for your first in-flight training. Let's get you combat ready.", type: 'info' },
        { delay: 5.0, sender: 'Instructor', msg: "Alright Ensign, I'm your flight instructor. Drag on the right side of your screen to look around. The left side joystick controls your movement.", type: 'info' },
        { delay: 7.0, sender: 'Instructor', msg: "Push the throttle slider up to accelerate. The joystick handles your banking and movement.", type: 'info' },
        { delay: 6.0, sender: 'Instructor', msg: "Check your radar — bottom left of your display. Blue blips are wingmen, green are support ships, red are hostiles. The degree markings show your bearing.", type: 'info' },
        { delay: 6.0, sender: 'Instructor', msg: "Tap the FIRE button to shoot. Hold on a target for 2 seconds to auto-lock. The BOOST button gives you afterburner.", type: 'info' },
        { delay: 6.0, sender: 'Instructor', msg: "One more thing — you will see colored diamonds out there. Those are power-ups. Fly through them to activate — shields, weapons, speed. They last for the round.", type: 'info' },
        { delay: 5.0, sender: 'Scope', msg: "Deploying target drones for live-fire practice. Contacts appearing on scope.", type: 'warning', action: 'spawn_drones' },
        { delay: 5.0, sender: 'Hotshot', msg: "Drones on scope. Line up your crosshair, wait for the lock tone, and light 'em up. Show me what you've got, Ensign.", type: 'info' },
    ];

    let _trainingTimeouts = []; // track timeouts so skip can clear them

    function _getTrainingScript() {
        if (state._trainingControlType === 'gamepad') return TRAINING_SCRIPT_GAMEPAD;
        if (state._trainingControlType === 'touch') return TRAINING_SCRIPT_TOUCH;
        return TRAINING_SCRIPT_KB;
    }

    function _startTrainingSequence() {
        state._trainingMode = true;
        state._trainingPhase = 0;
        state._trainingSkipped = false;
        state._trainingDronesSpawned = false;
        _trainingTimeouts = [];

        // Show skip-training button
        const skipBtn = document.getElementById('training-skip-btn');
        if (skipBtn) skipBtn.style.display = 'block';

        // Run through the training script with timed comms
        const script = _getTrainingScript();
        let cumDelay = 0;
        for (let i = 0; i < script.length; i++) {
            cumDelay += script[i].delay * 1000;
            const step = script[i];
            const stepIdx = i;
            const tid = setTimeout(() => {
                if (!state._trainingMode) return; // training was skipped
                state._trainingPhase = stepIdx;
                addComm(step.sender, step.msg, step.type);
                if (step.action === 'spawn_drones') _spawnTrainingDrones();
            }, cumDelay);
            _trainingTimeouts.push(tid);
        }

        // Failsafe: don't leave wave 1 with zero hostiles for ~1 minute while the tutorial talks.
        // Spawn the training drones early if they haven't appeared yet.
        const failTid = setTimeout(() => {
            if (!state._trainingMode) return;
            if (state._trainingDronesSpawned) return;
            addComm('Scope', 'Target drones deployed for live-fire practice. Contacts on scope.', 'warning');
            _spawnTrainingDrones();
        }, 15000);
        _trainingTimeouts.push(failTid);
    }

    function _spawnTrainingDrones() {
        // Spawn 4 slow, weak target drones around the player
        if (state._trainingDronesSpawned) return;
        const p = state.player;
        if (!p) return;
        state._trainingDronesSpawned = true;
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(p.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(p.quaternion);
        const offsets = [
            fwd.clone().multiplyScalar(1200).add(right.clone().multiplyScalar(300)),
            fwd.clone().multiplyScalar(1000).add(right.clone().multiplyScalar(-400)),
            fwd.clone().multiplyScalar(1400).add(up.clone().multiplyScalar(200)),
            fwd.clone().multiplyScalar(900).add(up.clone().multiplyScalar(-150)).add(right.clone().multiplyScalar(200)),
        ];
        for (let i = 0; i < offsets.length; i++) {
            const pos = p.position.clone().add(offsets[i]);
            const drone = new Entity('enemy', pos.x, pos.y, pos.z);
            const profile = deriveCombatProfile('enemy', 1, { training: true, speedScale: 0.5 });
            drone.hull = Math.round(profile.hull * 0.5); // fragile training drones
            drone.maxSpeed = Math.round(profile.maxSpeed * 0.4);
            drone._manifoldDerivation = profile.trace;
            drone.callsign = 'DRONE-' + (i + 1);
            drone._isTrainingDrone = true;
            state.entities.push(drone);
        }
    }

    function _skipTraining() {
        if (!state._trainingMode) return;
        // Clear all pending comm timeouts
        for (const tid of _trainingTimeouts) clearTimeout(tid);
        _trainingTimeouts = [];
        state._trainingMode = false;
        state._trainingSkipped = true;

        // Hide skip button
        const skipBtn = document.getElementById('training-skip-btn');
        if (skipBtn) skipBtn.style.display = 'none';

        addComm('Hotshot', "Roger that, Ensign. Skipping the walkthrough — you'll learn on the job. Good luck out there.", 'info');

        // If no enemies remain (drones not spawned yet or already killed), end training wave
        const enemies = state.entities.filter(e =>
            (e.type === 'enemy' || e.type === 'interceptor' || e.type === 'bomber') && !e.markedForDeletion
        );
        if (enemies.length === 0) {
            // Spawn a small batch of real enemies so there's something to fight
            _spawnTrainingDrones();
        }
    }

    function _onTrainingWaveClear() {
        // Training complete — wingman congratulates, transition to real wave 2
        state._trainingMode = false;
        const skipBtn = document.getElementById('training-skip-btn');
        if (skipBtn) skipBtn.style.display = 'none';

        for (const tid of _trainingTimeouts) clearTimeout(tid);
        _trainingTimeouts = [];

        if (!state._trainingSkipped) {
            addComm('Hotshot', "Not bad at all, Ensign! Training complete. Time for your first real sortie — stay sharp out there.", 'info');
        }
    }

    function _showControlTypeDropdown(onSelect) {
        // Create overlay for control type selection before training launch
        const overlay = document.createElement('div');
        overlay.id = 'training-control-overlay';
        overlay.style.cssText = 'position:absolute;inset:0;z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.88);pointer-events:auto;';

        // Auto-detect gamepad
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        let detected = 'keyboard';
        for (const gp of gamepads) {
            if (gp && gp.connected) { detected = 'gamepad'; break; }
        }
        // Detect touch
        if ('ontouchstart' in window && window.innerWidth < 900) detected = 'touch';

        overlay.innerHTML = `
            <div style="max-width:420px;text-align:center;font-family:'Courier New',monospace;">
                <div style="color:#00ffcc;font-size:1.6em;font-weight:bold;margin-bottom:12px;text-shadow:0 0 10px rgba(0,255,200,0.4)">
                    ✦ FLIGHT TRAINING ✦
                </div>
                <div style="color:#88aacc;font-size:0.95em;margin-bottom:24px;">
                    Select your control method to begin guided training.
                </div>
                <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:24px;">
                    <button class="training-ctrl-btn" data-ctrl="keyboard"
                        style="padding:14px 24px;font-size:1.1em;font-family:inherit;background:${detected === 'keyboard' ? 'rgba(0,255,200,0.2)' : 'rgba(255,255,255,0.06)'};border:1px solid ${detected === 'keyboard' ? '#00ffcc' : '#446688'};color:#ddeeff;border-radius:6px;cursor:pointer;transition:all 0.2s;">
                        ⌨ KEYBOARD + MOUSE ${detected === 'keyboard' ? '(detected)' : ''}
                    </button>
                    <button class="training-ctrl-btn" data-ctrl="gamepad"
                        style="padding:14px 24px;font-size:1.1em;font-family:inherit;background:${detected === 'gamepad' ? 'rgba(0,255,200,0.2)' : 'rgba(255,255,255,0.06)'};border:1px solid ${detected === 'gamepad' ? '#00ffcc' : '#446688'};color:#ddeeff;border-radius:6px;cursor:pointer;transition:all 0.2s;">
                        🎮 GAMEPAD / CONTROLLER ${detected === 'gamepad' ? '(detected)' : ''}
                    </button>
                    <button class="training-ctrl-btn" data-ctrl="touch"
                        style="padding:14px 24px;font-size:1.1em;font-family:inherit;background:${detected === 'touch' ? 'rgba(0,255,200,0.2)' : 'rgba(255,255,255,0.06)'};border:1px solid ${detected === 'touch' ? '#00ffcc' : '#446688'};color:#ddeeff;border-radius:6px;cursor:pointer;transition:all 0.2s;">
                        📱 TOUCH / MOBILE ${detected === 'touch' ? '(detected)' : ''}
                    </button>
                </div>
                <div style="color:#446688;font-size:0.8em;">Training can be skipped at any time during flight.</div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Wire button clicks
        overlay.querySelectorAll('.training-ctrl-btn').forEach(btn => {
            btn.addEventListener('mouseover', () => { btn.style.borderColor = '#00ffcc'; btn.style.background = 'rgba(0,255,200,0.15)'; });
            btn.addEventListener('mouseout', () => {
                const isDetected = btn.dataset.ctrl === detected;
                btn.style.borderColor = isDetected ? '#00ffcc' : '#446688';
                btn.style.background = isDetected ? 'rgba(0,255,200,0.2)' : 'rgba(255,255,255,0.06)';
            });
            btn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                const ctrl = btn.dataset.ctrl;
                state._trainingControlType = ctrl;
                // Remove overlay synchronously before pointer lock
                overlay.style.display = 'none';
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                onSelect(ctrl);
            });
        });
    }

    function _showEscapeHint(onDone) {
        const hint = document.createElement('div');
        hint.id = 'escape-hint-overlay';
        hint.style.cssText = 'position:absolute;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);pointer-events:none;';
        hint.innerHTML = '<div style="color:#00ffcc;font-size:1.6em;font-family:\'Courier New\',monospace;text-shadow:0 0 14px rgba(0,255,200,0.5);">Hit Escape to return cursor</div>';
        document.body.appendChild(hint);
        setTimeout(() => {
            hint.style.display = 'none';
            hint.remove();
            onDone();
        }, 2000);
    }

    // ── Tutorial System: guided walkthrough with announcer + practice mode ──
    function _startTutorial() {
        state.phase = 'tutorial';
        state._tutorialStep = 0;
        state._tutorialPractice = false;

        // Detect controller
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        let detectedController = 'keyboard';
        let controllerName = 'Keyboard + Mouse';
        for (const gp of gamepads) {
            if (gp && gp.connected) {
                controllerName = gp.id;
                if (/xbox|xinput/i.test(gp.id)) detectedController = 'xbox';
                else if (/playstation|dualshock|dualsense/i.test(gp.id)) detectedController = 'playstation';
                else if (/hotas|flight|thrustmaster|saitek/i.test(gp.id)) detectedController = 'hotas';
                else detectedController = 'gamepad';
                break;
            }
        }

        const overlay = document.createElement('div');
        overlay.id = 'tutorial-overlay';
        overlay.style.cssText = 'position:absolute;inset:0;z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.92);pointer-events:auto;overflow-y:auto;padding:20px';

        // ── Diagram interaction state (keyboard/gamepad listeners + RAF) ──
        let _diagRAF = null, _diagKbDown = null, _diagKbUp = null;
        let _diagMouseDown = null, _diagMouseMove = null, _diagScroll = null;
        let _lastSpokenAction = '', _lastSpokenTime = 0;

        function _cleanupDiagram() {
            if (_diagRAF) { cancelAnimationFrame(_diagRAF); _diagRAF = null; }
            if (_diagKbDown) { document.removeEventListener('keydown', _diagKbDown, true); _diagKbDown = null; }
            if (_diagKbUp) { document.removeEventListener('keyup', _diagKbUp, true); _diagKbUp = null; }
            if (_diagMouseDown) { document.removeEventListener('mousedown', _diagMouseDown, true); _diagMouseDown = null; }
            if (_diagMouseMove) { document.removeEventListener('mousemove', _diagMouseMove, true); _diagMouseMove = null; }
            if (_diagScroll) { document.removeEventListener('wheel', _diagScroll, true); _diagScroll = null; }
        }

        function _buildKbDiagramHTML() {
            const k = (id, lbl, action, w = 34, h = 34, fs = 10) =>
                `<div id="tut-k-${id}" class="tut-hw-btn" data-action="${action}" style="width:${w}px;height:${h}px;font-size:${fs}px;flex-shrink:0">${lbl}</div>`;
            const sp = (w = 34) => `<div style="width:${w}px;flex-shrink:0"></div>`;
            return `<div style="display:flex;gap:12px;justify-content:center;align-items:flex-start;flex-wrap:wrap;padding:4px 0">
                    <div style="display:inline-flex;flex-direction:column;gap:3px">
                        <div style="display:flex;gap:3px">${k('Digit1', '1', 'Weapon 1 — Laser Cannon')}${k('Digit2', '2', 'Weapon 2 — Plasma Bolt')}${k('Digit3', '3', 'Weapon 3 — Rail Gun')}${k('Digit4', '4', 'Weapon 4 — Scatter')}</div>
                        <div style="display:flex;gap:3px">${k('KeyQ', 'Q', 'Roll Left')}${k('KeyW', 'W', 'Throttle Up')}${k('KeyE', 'E', 'Roll Right')}${k('KeyR', 'R', 'Emergency RTB')}${k('KeyT', 'T', 'Lock Target')}</div>
                        <div style="display:flex;gap:3px">${k('KeyA', 'A', 'Strafe Left')}${k('KeyS', 'S', 'Throttle Down')}${sp()}${k('KeyF', 'F', 'Boost')}${k('KeyG', 'G', 'Request Dock')}${k('KeyH', 'H', 'Hyperdrive')}</div>
                        <div style="display:flex;gap:3px">${k('ShiftLeft', 'SHIFT', 'Afterburner', 55, 34, 8)}${sp(20)}${k('KeyV', 'V', 'Flight Assist Toggle')}${k('Space', 'SPACE', 'Fire Weapon', 98, 34, 8)}</div>
                    </div>
                    <div style="display:inline-flex;flex-direction:column;gap:3px;align-items:center;flex-shrink:0">
                        <div style="font-family:'Courier New';font-size:8px;letter-spacing:2px;color:rgba(0,180,220,0.5);margin-bottom:2px">MOUSE</div>
                        <div style="display:flex;gap:3px">${k('MouseLeft', 'LMB', 'Fire Weapon', 32, 42, 7)}${k('MouseRight', 'RMB', 'Torpedo', 32, 42, 7)}</div>
                        ${k('MouseScroll', 'SCROLL', 'Throttle Up / Down', 68, 24, 7)}
                        ${k('MouseMove', 'MOVE', 'Pitch + Yaw — Steering', 68, 24, 7)}
                    </div>
                </div>`;
        }

        function _buildGpDiagramHTML(controller) {
            const isPS = controller === 'playstation';
            const fa = isPS ? ['✕', '○', '□', '△'] : ['A', 'B', 'X', 'Y'];
            const fc = isPS
                ? ['#5577ee', '#ee4455', '#bb55ee', '#44cc77']
                : ['#44bb66', '#cc3333', '#3366cc', '#ccaa33'];
            let s = `<svg viewBox="0 0 320 185" width="100%" style="max-width:320px;display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">`;
            s += `<defs><filter id="tglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.5" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter></defs>`;
            // Controller body silhouette
            s += `<ellipse cx="75" cy="115" rx="50" ry="58" fill="rgba(0,8,22,0.85)" stroke="rgba(0,130,180,0.3)" stroke-width="1.5"/>`;
            s += `<ellipse cx="245" cy="115" rx="50" ry="58" fill="rgba(0,8,22,0.85)" stroke="rgba(0,130,180,0.3)" stroke-width="1.5"/>`;
            s += `<rect x="75" y="40" width="170" height="88" rx="18" fill="rgba(0,8,22,0.85)" stroke="rgba(0,130,180,0.3)" stroke-width="1.5"/>`;
            // Triggers (LT=btn6, RT=btn7)
            s += `<g id="tut-k-6" class="tut-hw-btn" data-action="Fire Torpedo" style="cursor:default"><rect x="22" y="8" width="56" height="25" rx="5" class="tut-hw-rect" fill="rgba(0,12,30,0.9)" stroke="rgba(0,130,180,0.3)" stroke-width="1"/><text x="50" y="23" font-family="Courier New" font-size="9" fill="#5a7a9a" text-anchor="middle" class="tut-hw-text">LT</text></g>`;
            s += `<g id="tut-k-7" class="tut-hw-btn" data-action="Fire Lasers" style="cursor:default"><rect x="242" y="8" width="56" height="25" rx="5" class="tut-hw-rect" fill="rgba(0,12,30,0.9)" stroke="rgba(0,130,180,0.3)" stroke-width="1"/><text x="270" y="23" font-family="Courier New" font-size="9" fill="#5a7a9a" text-anchor="middle" class="tut-hw-text">RT</text></g>`;
            // Bumpers (LB=btn4, RB=btn5)
            s += `<g id="tut-k-4" class="tut-hw-btn" data-action="Roll Left" style="cursor:default"><rect x="27" y="36" width="50" height="16" rx="4" class="tut-hw-rect" fill="rgba(0,12,30,0.9)" stroke="rgba(0,130,180,0.3)" stroke-width="1"/><text x="52" y="47" font-family="Courier New" font-size="8" fill="#5a7a9a" text-anchor="middle" class="tut-hw-text">LB</text></g>`;
            s += `<g id="tut-k-5" class="tut-hw-btn" data-action="Roll Right" style="cursor:default"><rect x="243" y="36" width="50" height="16" rx="4" class="tut-hw-rect" fill="rgba(0,12,30,0.9)" stroke="rgba(0,130,180,0.3)" stroke-width="1"/><text x="268" y="47" font-family="Courier New" font-size="8" fill="#5a7a9a" text-anchor="middle" class="tut-hw-text">RB</text></g>`;
            // Left stick (btn10) + Right stick (btn11)
            s += `<g id="tut-k-ls" class="tut-hw-btn" data-action="Throttle + Strafe (L-Stick)" style="cursor:default"><circle cx="98" cy="108" r="22" class="tut-hw-rect" fill="rgba(0,12,30,0.9)" stroke="rgba(0,130,180,0.3)" stroke-width="1.5"/><text x="98" y="112" font-family="Courier New" font-size="7" fill="#5a7a9a" text-anchor="middle" class="tut-hw-text">LS</text></g>`;
            s += `<g id="tut-k-rs" class="tut-hw-btn" data-action="Pitch + Yaw (R-Stick)" style="cursor:default"><circle cx="210" cy="122" r="22" class="tut-hw-rect" fill="rgba(0,12,30,0.9)" stroke="rgba(0,130,180,0.3)" stroke-width="1.5"/><text x="210" y="126" font-family="Courier New" font-size="7" fill="#5a7a9a" text-anchor="middle" class="tut-hw-text">RS</text></g>`;
            // D-pad (btns 12-15)
            for (const [x, y, btn, action, sym] of [[160, 52, 12, 'Throttle Up', '▲'], [160, 90, 13, 'Throttle Down', '▼'], [141, 71, 14, 'Strafe Left', '◀'], [179, 71, 15, 'Strafe Right', '▶']]) {
                s += `<g id="tut-k-${btn}" class="tut-hw-btn" data-action="${action}" style="cursor:default"><rect x="${x}" y="${y}" width="18" height="18" rx="2" class="tut-hw-rect" fill="rgba(0,12,30,0.9)" stroke="rgba(0,130,180,0.3)" stroke-width="1"/><text x="${x + 9}" y="${y + 12}" font-family="Courier New" font-size="9" fill="#5a7a9a" text-anchor="middle" class="tut-hw-text">${sym}</text></g>`;
            }
            // Face buttons (A/Cross=0, B/Circle=1, X/Square=2, Y/Triangle=3)
            const fb = [[248, 98, 0, 'Afterburner'], [272, 74, 1, 'Boost'], [224, 74, 2, 'Flight Assist'], [248, 50, 3, 'Lock Target']];
            if (isPS) fb[0][3] = 'Fire Weapon (Cross)';
            for (let i = 0; i < fb.length; i++) {
                const [cx, cy, btn, action] = fb[i];
                s += `<g id="tut-k-${btn}" class="tut-hw-btn" data-action="${action}" style="cursor:default"><circle cx="${cx}" cy="${cy}" r="13" class="tut-hw-rect" fill="rgba(0,12,30,0.9)" stroke="${fc[i]}55" stroke-width="1.5"/><text x="${cx}" y="${cy + 4}" font-family="Courier New" font-size="9" fill="${fc[i]}bb" text-anchor="middle" class="tut-hw-text">${fa[i]}</text></g>`;
            }
            // Select / Start (btn8, btn9)
            s += `<g id="tut-k-8" class="tut-hw-btn" data-action="Comms Menu" style="cursor:default"><rect x="131" y="73" width="22" height="13" rx="3" class="tut-hw-rect" fill="rgba(0,12,30,0.9)" stroke="rgba(0,130,180,0.2)" stroke-width="1"/><text x="142" y="82" font-family="Courier New" font-size="6" fill="#3a5a7a" text-anchor="middle" class="tut-hw-text">SEL</text></g>`;
            s += `<g id="tut-k-9" class="tut-hw-btn" data-action="Pause / Menu" style="cursor:default"><rect x="167" y="73" width="22" height="13" rx="3" class="tut-hw-rect" fill="rgba(0,12,30,0.9)" stroke="rgba(0,130,180,0.2)" stroke-width="1"/><text x="178" y="82" font-family="Courier New" font-size="6" fill="#3a5a7a" text-anchor="middle" class="tut-hw-text">SRT</text></g>`;
            s += `</svg>`;
            return s;
        }

        function _attachDiagramListeners(controller) {
            _cleanupDiagram();
            const callout = document.getElementById('tut-action-callout');
            const isGP = controller !== 'keyboard';

            function _announce(action) {
                if (callout) { callout.textContent = action; callout.style.color = '#0cf'; }
                if (localStorage.getItem('sf_tut_voice_off') === '1') return;
                if (!window.SFAudio || !SFAudio.speak) return;
                const voices = (window.speechSynthesis && speechSynthesis.getVoices) ? speechSynthesis.getVoices() : [];
                if (voices.length === 0) return; // no voices loaded yet — show text only, never bot fallback
                const now = Date.now();
                if (action === _lastSpokenAction && now - _lastSpokenTime < 2800) return;
                _lastSpokenAction = action;
                _lastSpokenTime = now;
                const mod = localStorage.getItem('sf_voice_module') || 'au_female';
                SFAudio.speak(action, { voiceModule: mod });
            }

            function _lit(code, on) {
                const el = document.getElementById(`tut-k-${code}`);
                if (el) el.classList.toggle('active', on);
            }

            if (!isGP) {
                _diagKbDown = (e) => {
                    const el = document.getElementById(`tut-k-${e.code}`);
                    if (el) { e.preventDefault(); _lit(e.code, true); _announce(el.dataset.action || e.code); }
                };
                _diagKbUp = (e) => _lit(e.code, false);
                document.addEventListener('keydown', _diagKbDown, true);
                document.addEventListener('keyup', _diagKbUp, true);

                let _moveTimer = null;
                _diagMouseMove = () => {
                    _lit('MouseMove', true);
                    if (_moveTimer) clearTimeout(_moveTimer);
                    _moveTimer = setTimeout(() => _lit('MouseMove', false), 350);
                    _announce('Pitch + Yaw — Steering');
                };
                document.addEventListener('mousemove', _diagMouseMove, { passive: true, capture: true });

                _diagMouseDown = (e) => {
                    if (e.button === 0) { _lit('MouseLeft', true); _announce('Fire Weapon'); setTimeout(() => _lit('MouseLeft', false), 220); }
                    else if (e.button === 2) { _lit('MouseRight', true); _announce('Torpedo'); setTimeout(() => _lit('MouseRight', false), 220); }
                };
                document.addEventListener('mousedown', _diagMouseDown, true);

                _diagScroll = (e) => {
                    _lit('MouseScroll', true);
                    _announce(e.deltaY < 0 ? 'Throttle Up' : 'Throttle Down');
                    setTimeout(() => _lit('MouseScroll', false), 320);
                };
                document.addEventListener('wheel', _diagScroll, { passive: true, capture: true });
            } else {
                // Gamepad polling via RAF
                const GP_KEY = { 0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'ls', 11: 'rs', 12: '12', 13: '13', 14: '14', 15: '15' };
                const _prev = {};
                function _poll() {
                    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
                    const pad = Array.from(pads).find(p => p && p.connected);
                    if (pad) {
                        pad.buttons.forEach((btn, i) => {
                            const key = GP_KEY[i]; if (!key) return;
                            const el = document.getElementById(`tut-k-${key}`); if (!el) return;
                            const pressed = btn.pressed || btn.value > 0.5;
                            if (pressed && !_prev[i]) { _lit(key, true); _announce(el.dataset.action || `Button ${i}`); }
                            else if (!pressed && _prev[i]) _lit(key, false);
                            _prev[i] = pressed;
                        });
                        // Analog sticks
                        const lActive = Math.hypot(pad.axes[0] || 0, pad.axes[1] || 0) > 0.25;
                        const rActive = Math.hypot(pad.axes[2] || 0, pad.axes[3] || 0) > 0.25;
                        if (lActive && !_prev.ls) { _lit('ls', true); _announce('Throttle + Strafe (L-Stick)'); }
                        else if (!lActive && _prev.ls) _lit('ls', false);
                        if (rActive && !_prev.rs) { _lit('rs', true); _announce('Pitch + Yaw (R-Stick)'); }
                        else if (!rActive && _prev.rs) _lit('rs', false);
                        _prev.ls = lActive; _prev.rs = rActive;
                    }
                    if (document.getElementById('tutorial-overlay')) _diagRAF = requestAnimationFrame(_poll);
                    else _diagRAF = null;
                }
                _diagRAF = requestAnimationFrame(_poll);
            }
        }

        function _buildTutorialHTML(controller) {
            const tutVoiceOff = localStorage.getItem('sf_tut_voice_off') === '1';
            const displayName = { keyboard: 'Keyboard + Mouse', xbox: 'Xbox Controller', playstation: 'PlayStation Controller', gamepad: 'Generic Gamepad', hotas: 'HOTAS / Flight Stick' }[controller] || controllerName;
            const kbControls = `
                <div class="tut-section">
                    <div class="tut-section-title">FLIGHT CONTROLS — KEYBOARD + MOUSE</div>
                    <div class="tut-grid">
                        <div class="tut-key-group">
                            <div class="tut-key-label">MOVEMENT</div>
                            <div class="tut-binding"><span class="tut-key">Mouse</span> Steer (Pitch + Yaw)</div>
                            <div class="tut-binding"><span class="tut-key">Scroll</span> Throttle Up/Down</div>
                            <div class="tut-binding"><span class="tut-key">W</span><span class="tut-key">S</span> Throttle (alt)</div>
                            <div class="tut-binding"><span class="tut-key">A</span><span class="tut-key">D</span> Strafe L/R</div>
                            <div class="tut-binding"><span class="tut-key">Q</span><span class="tut-key">E</span> Roll</div>
                        </div>
                        <div class="tut-key-group">
                            <div class="tut-key-label">WEAPONS</div>
                            <div class="tut-binding"><span class="tut-key">L-Click</span> / <span class="tut-key">Space</span> Fire Selected</div>
                            <div class="tut-binding"><span class="tut-key">R-Click</span> Torpedo</div>
                            <div class="tut-binding"><span class="tut-key">1</span><span class="tut-key">2</span><span class="tut-key">3</span><span class="tut-key">4</span> Select Weapon</div>
                            <div class="tut-binding"><span class="tut-key">T</span> Lock Target</div>
                        </div>
                        <div class="tut-key-group">
                            <div class="tut-key-label">SYSTEMS</div>
                            <div class="tut-binding"><span class="tut-key">Shift</span> Afterburner</div>
                            <div class="tut-binding"><span class="tut-key">F</span> Boost (burst)</div>
                            <div class="tut-binding"><span class="tut-key">H</span> Hyperdrive</div>
                            <div class="tut-binding"><span class="tut-key">V</span> Flight Assist</div>
                            <div class="tut-binding"><span class="tut-key">G</span> Request Dock</div>
                            <div class="tut-binding"><span class="tut-key">R</span> Emergency RTB</div>
                        </div>
                    </div>
                </div>`;
            const gpControls = `
                <div class="tut-section">
                    <div class="tut-section-title">FLIGHT CONTROLS — GAMEPAD</div>
                    <div class="tut-grid">
                        <div class="tut-key-group">
                            <div class="tut-key-label">STICKS</div>
                            <div class="tut-binding"><span class="tut-key">R-Stick</span> Pitch + Yaw</div>
                            <div class="tut-binding"><span class="tut-key">L-Stick</span> Throttle + Strafe</div>
                            <div class="tut-binding"><span class="tut-key">LB</span><span class="tut-key">RB</span> Roll</div>
                        </div>
                        <div class="tut-key-group">
                            <div class="tut-key-label">WEAPONS</div>
                            <div class="tut-binding"><span class="tut-key">RT</span> Lasers</div>
                            <div class="tut-binding"><span class="tut-key">LT</span> Torpedo</div>
                            <div class="tut-binding"><span class="tut-key">Y</span> Lock Target</div>
                        </div>
                        <div class="tut-key-group">
                            <div class="tut-key-label">SYSTEMS</div>
                            <div class="tut-binding"><span class="tut-key">A</span> Afterburner</div>
                            <div class="tut-binding"><span class="tut-key">B</span> Boost</div>
                            <div class="tut-binding"><span class="tut-key">X</span> Flight Assist</div>
                        </div>
                    </div>
                </div>`;

            return `
                <div style="max-width:640px;width:100%">
                    <div style="text-align:center;margin-bottom:20px">
                        <div style="font-size:11px;letter-spacing:4px;color:#446688;margin-bottom:8px">UEDF FLIGHT ORIENTATION</div>
                        <div style="font-size:20px;color:#0ff;text-shadow:0 0 14px rgba(0,255,255,0.4)">PILOT BRIEFING</div>
                        <div style="font-size:11px;color:#88aacc;margin-top:6px">Callsign: ${_cs()} | Controller: ${displayName}</div>
                    </div>

                    <div class="tut-section">
                        <div class="tut-section-title">MISSION OVERVIEW</div>
                        <div style="color:#8cf;font-size:12px;line-height:1.7">
                            You pilot a UEDF Mk-IV Starfighter from the Battleship <span style="color:#48f">Resolute</span>.
                            Alien force <span style="color:#f0f">Hive Sigma</span> attacks in waves of increasing strength.
                            <span style="color:#ff4">Protect the Resolute</span>, destroy all hostiles each wave,
                            and locate the alien hive to end the threat.
                            Your wingmen fly with you — this is a cooperative fight.
                        </div>
                    </div>

                    <div class="tut-section">
                        <div class="tut-section-title">DETECTED INPUT</div>
                        <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
                            <select id="tut-controller-select" class="avtn-select" tabindex="1">
                                <option value="keyboard" ${controller === 'keyboard' ? 'selected' : ''}>Keyboard + Mouse</option>
                                <option value="xbox" ${controller === 'xbox' ? 'selected' : ''}>Xbox Controller</option>
                                <option value="playstation" ${controller === 'playstation' ? 'selected' : ''}>PlayStation Controller</option>
                                <option value="gamepad" ${controller === 'gamepad' ? 'selected' : ''}>Generic Gamepad</option>
                                <option value="hotas" ${controller === 'hotas' ? 'selected' : ''}>HOTAS / Flight Stick</option>
                            </select>
                        </div>
                    </div>

                    <div id="tut-controls-section">
                        ${controller === 'keyboard' ? kbControls : gpControls}
                    </div>

                    <div class="tut-section">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                            <div class="tut-section-title" style="margin-bottom:0">INTERACTIVE HARDWARE TESTER</div>
                            <button id="tut-voice-toggle" class="tut-voice-chip${tutVoiceOff ? '' : ' active'}">${tutVoiceOff ? '🔇 VOICE: OFF' : '🔊 VOICE: ON'}</button>
                        </div>
                        <div id="tut-action-callout" class="tut-action-callout" style="color:#334455">— press any mapped control —</div>
                        <div id="tut-hw-diagram" style="overflow-x:auto;padding:4px 0">
                            ${controller === 'keyboard' ? _buildKbDiagramHTML() : _buildGpDiagramHTML(controller)}
                        </div>
                    </div>

                    <div class="tut-section" style="text-align:center;margin-top:16px">
                        <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
                            <button id="tut-practice" class="avtn-btn avtn-btn-green" tabindex="2">PRACTICE FLIGHT</button>
                            <button id="tut-done" class="avtn-btn avtn-btn-red" tabindex="3">SKIP — LAUNCH MISSION</button>
                        </div>
                        <div style="font-size:10px;color:#334455;letter-spacing:2px;margin-top:10px">TAB TO SELECT &nbsp;·&nbsp; SPACE OR SCROLL WHEEL TO CONFIRM</div>
                    </div>
                </div>`;
        }

        overlay.innerHTML = _buildTutorialHTML(detectedController);
        document.body.appendChild(overlay);

        function _attachTutorialHandlers() {
            const sel = document.getElementById('tut-controller-select');
            if (sel) sel.onchange = () => {
                _cleanupDiagram();
                overlay.innerHTML = _buildTutorialHTML(sel.value);
                _attachTutorialHandlers();
            };
            const practiceBtn = document.getElementById('tut-practice');
            const doneBtn = document.getElementById('tut-done');
            if (practiceBtn) practiceBtn.onclick = () => {
                _cleanupDiagram();
                overlay.remove();
                _startPracticeMode();
            };
            if (doneBtn) doneBtn.onclick = () => {
                _cleanupDiagram();
                overlay.remove();
                if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();
                _beginLaunchSequence();
            };
            const voiceBtn = document.getElementById('tut-voice-toggle');
            if (voiceBtn) voiceBtn.onclick = () => {
                const off = localStorage.getItem('sf_tut_voice_off') === '1';
                const nowOff = !off;
                localStorage.setItem('sf_tut_voice_off', nowOff ? '1' : '0');
                voiceBtn.textContent = nowOff ? '🔇 VOICE: OFF' : '🔊 VOICE: ON';
                voiceBtn.classList.toggle('active', !nowOff);
            };
            // Wire diagram interaction for current controller
            const sel2 = document.getElementById('tut-controller-select');
            const curController = sel2 ? sel2.value : detectedController;
            _attachDiagramListeners(curController);
        }
        _attachTutorialHandlers();

        // Keyboard: Escape to skip
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                _cleanupDiagram();
                overlay.remove();
                if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();
                _beginLaunchSequence();
            }
        }, true);

        setTimeout(() => {
            const f = document.getElementById('tut-controller-select');
            if (f) f.focus();
        }, 100);
    }

    // ── Practice Mode: free flight, no enemies, no damage ──
    function _startPracticeMode() {
        state.phase = 'combat'; // Use combat phase for full controls
        state._practiceMode = true;

        // Spawn player safely
        if (state.player) {
            state.player.position.set(0, 0, -3000);
            state.player.quaternion.set(0, 0, 0, 1);
            state.player.velocity.set(0, 0, 0);
            state.player.hull = dim('player.hull');
            state.player.shields = dim('player.shields');
            state.player.fuel = dim('player.fuel');
            state.player.torpedoes = 99;
        }

        // Show HUD
        document.getElementById('countdown-display').style.display = 'none';
        document.getElementById('ship-panel').style.display = 'block';
        document.getElementById('crosshair').style.display = 'block';
        document.getElementById('gameplay-hud').style.display = 'block';
        document.getElementById('radar-overlay').style.display = 'block';
        if (window.SF3D) {
            SF3D.setLaunchPhase(false);
            SF3D.showCockpit(true);
        }

        // Audio setup
        if (window.SFAudio) {
            SFAudio.stopBayAmbience();
            SFAudio.startCockpitHum();
            SFAudio.startThrustRumble();
        }
        if (window.SFMusic) {
            SFMusic.setSection('exploration');
            SFMusic.setIntensity(0.3);
        }

        // Enter immersive
        if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();

        // Spawn some target dummies far from base
        for (let i = 0; i < 3; i++) {
            const angle = (Math.PI * 2 / 3) * i;
            const r = 800;
            const dummy = new Entity('enemy', Math.cos(angle) * r, 0, -1500 + Math.sin(angle) * r);
            dummy.hull = 50;
            dummy.maxSpeed = 0; // stationary targets
            dummy.velocity.set(0, 0, 0);
            dummy._practiceTarget = true;
            state.entities.push(dummy);
        }

        {
            const s = _snap();
            const waveLine = state.wave > 1 ? ` Wave ${state.wave} is standing by — ${s.totalHostile > 0 ? s.totalHostile + ' contacts on scope' : 'sector quiet'}.` : '';
            if (window.SFAnnouncer) SFAnnouncer.onPracticeStart();
            else addComm(_crew('command'), `${_cs()}, practice range active. Targets deployed. Press Escape when ready.`, 'base');
        }

        // ── Practice Input Wireframe + Command Chart overlay ──
        _showPracticeInputOverlay();

        // Show exit-practice overlay instruction
        let exitHint = document.getElementById('practice-exit-hint');
        if (!exitHint) {
            exitHint = document.createElement('div');
            exitHint.id = 'practice-exit-hint';
            exitHint.style.cssText = 'position:absolute;top:40px;left:50%;transform:translateX(-50%);z-index:65;padding:8px 24px;font-family:monospace;font-size:12px;background:rgba(0,0,0,0.7);color:#ffd24a;border:1px solid rgba(255,210,74,0.3);border-radius:4px;pointer-events:none;text-align:center';
            exitHint.innerHTML = 'PRACTICE MODE — Press <b>Escape</b> or <b>Pause</b> to end practice and launch mission';
            document.body.appendChild(exitHint);
        }
        exitHint.style.display = 'block';

        // Listen for Escape to exit practice
        function _onPracticeEscape(e) {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', _onPracticeEscape);
                _endPracticeMode();
            }
        }
        document.addEventListener('keydown', _onPracticeEscape);
        state._practiceEscapeHandler = _onPracticeEscape;
    }

    // ── Practice Input Wireframe: live-highlighted mouse + keyboard ──
    function _showPracticeInputOverlay() {
        let el = document.getElementById('practice-input-overlay');
        if (el) { el.style.display = 'flex'; return; }

        el = document.createElement('div');
        el.id = 'practice-input-overlay';
        el.style.cssText = 'position:absolute;bottom:60px;left:50%;transform:translateX(-50%);z-index:60;display:flex;gap:20px;pointer-events:none;opacity:0.85';

        // -- SVG wireframe with ID'd keys for highlighting --
        el.innerHTML = `
            <div style="background:rgba(0,8,16,0.75);border:1px solid rgba(0,200,255,0.2);border-radius:6px;padding:14px 18px">
                <div style="font-family:monospace;font-size:9px;letter-spacing:2px;color:#446688;text-align:center;margin-bottom:8px">INPUT ACTIVE</div>
                <svg width="280" height="160" viewBox="0 0 280 160" xmlns="http://www.w3.org/2000/svg" style="display:block">
                    <!-- Mouse body -->
                    <rect x="195" y="8" width="50" height="72" rx="14" fill="rgba(0,255,255,0.04)" stroke="rgba(0,255,255,0.4)" stroke-width="0.8"/>
                    <line x1="220" y1="8" x2="220" y2="38" stroke="rgba(0,255,255,0.3)" stroke-width="0.5"/>
                    <rect id="pk-lmb" x="196" y="9" width="23" height="28" rx="8" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <rect id="pk-rmb" x="221" y="9" width="23" height="28" rx="8" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <rect id="pk-scroll" x="215" y="38" width="10" height="14" rx="5" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="207" y="25" font-family="monospace" font-size="7" fill="#0ff" text-anchor="middle">FIRE</text>
                    <text x="233" y="25" font-family="monospace" font-size="7" fill="#0ff" text-anchor="middle">TORP</text>
                    <text x="220" y="48" font-family="monospace" font-size="5" fill="#0ff" text-anchor="middle">THR</text>
                    <text x="220" y="70" font-family="monospace" font-size="6" fill="#88aacc" text-anchor="middle">STEER</text>
                    <!-- Mouse move indicator -->
                    <circle id="pk-mouse-move" cx="220" cy="94" r="8" fill="none" stroke="rgba(0,255,255,0.25)" stroke-width="0.6"/>
                    <circle cx="220" cy="94" r="2" fill="rgba(0,255,255,0.3)"/>
                    <text x="220" y="112" font-family="monospace" font-size="5" fill="#556677" text-anchor="middle">MOVE TO AIM</text>

                    <!-- Keyboard section -->
                    <rect x="6" y="6" width="170" height="80" rx="5" fill="rgba(0,255,255,0.03)" stroke="rgba(0,255,255,0.3)" stroke-width="0.8"/>
                    <!-- WASD -->
                    <rect id="pk-w" x="42" y="14" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="53" y="26" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">W</text>
                    <rect id="pk-a" x="16" y="36" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="27" y="48" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">A</text>
                    <rect id="pk-s" x="42" y="36" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="53" y="48" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">S</text>
                    <rect id="pk-d" x="68" y="36" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="79" y="48" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">D</text>
                    <!-- QE -->
                    <rect id="pk-q" x="16" y="14" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="27" y="26" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">Q</text>
                    <rect id="pk-e" x="68" y="14" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="79" y="26" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">E</text>
                    <!-- Shift -->
                    <rect id="pk-shift" x="16" y="58" width="40" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="36" y="70" font-family="monospace" font-size="7" fill="#0ff" text-anchor="middle">SHIFT</text>
                    <!-- Space -->
                    <rect id="pk-space" x="62" y="58" width="70" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="97" y="70" font-family="monospace" font-size="7" fill="#0ff" text-anchor="middle">SPACE</text>
                    <!-- F V T -->
                    <rect id="pk-f" x="96" y="14" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="107" y="26" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">F</text>
                    <rect id="pk-v" x="96" y="36" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="107" y="48" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">V</text>
                    <rect id="pk-t" x="122" y="14" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="133" y="26" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">T</text>
                    <!-- R -->
                    <rect id="pk-r" x="148" y="14" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="159" y="26" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">R</text>

                    <!-- Labels row -->
                    <text x="8" y="100" font-family="monospace" font-size="6" fill="#88aacc">W/S Throttle</text>
                    <text x="8" y="110" font-family="monospace" font-size="6" fill="#88aacc">A/D Strafe</text>
                    <text x="8" y="120" font-family="monospace" font-size="6" fill="#88aacc">Q/E Roll</text>
                    <text x="100" y="100" font-family="monospace" font-size="6" fill="#88aacc">SHIFT Afterburner</text>
                    <text x="100" y="110" font-family="monospace" font-size="6" fill="#88aacc">F Boost  V FlightAssist</text>
                    <text x="100" y="120" font-family="monospace" font-size="6" fill="#88aacc">T Lock Target  R RTB</text>
                    <text x="8" y="135" font-family="monospace" font-size="6" fill="#ffd24a">SCROLL = Throttle</text>
                    <text x="8" y="145" font-family="monospace" font-size="6" fill="#ffd24a">L-CLICK / SPACE = Lasers</text>
                    <text x="8" y="155" font-family="monospace" font-size="6" fill="#ffd24a">R-CLICK = Torpedo</text>
                </svg>
            </div>
            <div style="background:rgba(0,8,16,0.75);border:1px solid rgba(0,200,255,0.2);border-radius:6px;padding:14px 16px;min-width:160px">
                <div style="font-family:monospace;font-size:9px;letter-spacing:2px;color:#446688;text-align:center;margin-bottom:10px">COMMANDS</div>
                <table style="font-family:monospace;font-size:10px;color:#99bbcc;border-collapse:collapse;width:100%">
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">Mouse</td><td>Steer ship</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">Scroll</td><td>Throttle ±</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">L-Click</td><td>Fire lasers</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">R-Click</td><td>Fire torpedo</td></tr>
                    <tr style="height:6px"><td></td><td></td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">W / S</td><td>Throttle up/down</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">A / D</td><td>Strafe left/right</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">Q / E</td><td>Roll left/right</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">Shift</td><td>Afterburner</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">F</td><td>Boost burst</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">V</td><td>Flight assist</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">T</td><td>Lock target</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">R</td><td>Return to base</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">Space</td><td>Fire lasers</td></tr>
                    <tr style="height:6px"><td></td><td></td></tr>
                    <tr><td style="color:#ffd24a;padding:2px 8px 2px 0">Esc</td><td style="color:#ffd24a">End practice</td></tr>
                </table>
            </div>`;
        document.body.appendChild(el);

        // ── Live key highlighting system ──
        const keyMap = {
            'KeyW': 'pk-w', 'KeyS': 'pk-s', 'KeyA': 'pk-a', 'KeyD': 'pk-d',
            'KeyQ': 'pk-q', 'KeyE': 'pk-e', 'KeyF': 'pk-f', 'KeyV': 'pk-v',
            'KeyT': 'pk-t', 'KeyR': 'pk-r',
            'ShiftLeft': 'pk-shift', 'ShiftRight': 'pk-shift',
            'Space': 'pk-space'
        };
        const activeColor = 'rgba(0,255,255,0.5)';
        const activeStroke = 'rgba(0,255,255,1)';
        const idleColor = 'rgba(0,255,255,0.06)';
        const idleStroke = 'rgba(0,255,255,0.4)';

        function _hlKey(e) {
            const id = keyMap[e.code];
            if (!id) return;
            const rect = document.getElementById(id);
            if (rect) { rect.setAttribute('fill', activeColor); rect.setAttribute('stroke', activeStroke); }
        }
        function _unhlKey(e) {
            const id = keyMap[e.code];
            if (!id) return;
            const rect = document.getElementById(id);
            if (rect) { rect.setAttribute('fill', idleColor); rect.setAttribute('stroke', idleStroke); }
        }
        function _hlMouse(e) {
            const id = e.button === 0 ? 'pk-lmb' : e.button === 2 ? 'pk-rmb' : null;
            if (!id) return;
            const rect = document.getElementById(id);
            if (rect) { rect.setAttribute('fill', activeColor); rect.setAttribute('stroke', activeStroke); }
        }
        function _unhlMouse(e) {
            const id = e.button === 0 ? 'pk-lmb' : e.button === 2 ? 'pk-rmb' : null;
            if (!id) return;
            const rect = document.getElementById(id);
            if (rect) { rect.setAttribute('fill', idleColor); rect.setAttribute('stroke', idleStroke); }
        }
        function _hlScroll() {
            const rect = document.getElementById('pk-scroll');
            if (rect) {
                rect.setAttribute('fill', activeColor);
                rect.setAttribute('stroke', activeStroke);
                clearTimeout(rect._scrollTimeout);
                rect._scrollTimeout = setTimeout(() => {
                    rect.setAttribute('fill', idleColor);
                    rect.setAttribute('stroke', idleStroke);
                }, 200);
            }
        }
        function _hlMouseMove() {
            const c = document.getElementById('pk-mouse-move');
            if (c) {
                c.setAttribute('stroke', 'rgba(0,255,255,0.8)');
                c.setAttribute('stroke-width', '1.5');
                clearTimeout(c._moveTimeout);
                c._moveTimeout = setTimeout(() => {
                    c.setAttribute('stroke', 'rgba(0,255,255,0.25)');
                    c.setAttribute('stroke-width', '0.6');
                }, 150);
            }
        }

        document.addEventListener('keydown', _hlKey);
        document.addEventListener('keyup', _unhlKey);
        document.addEventListener('mousedown', _hlMouse);
        document.addEventListener('mouseup', _unhlMouse);
        document.addEventListener('wheel', _hlScroll);
        document.addEventListener('mousemove', _hlMouseMove);

        // Store handlers for cleanup
        state._practiceInputHandlers = { _hlKey, _unhlKey, _hlMouse, _unhlMouse, _hlScroll, _hlMouseMove };
    }

    function _hidePracticeInputOverlay() {
        const el = document.getElementById('practice-input-overlay');
        if (el) el.style.display = 'none';
        if (state._practiceInputHandlers) {
            const h = state._practiceInputHandlers;
            document.removeEventListener('keydown', h._hlKey);
            document.removeEventListener('keyup', h._unhlKey);
            document.removeEventListener('mousedown', h._hlMouse);
            document.removeEventListener('mouseup', h._unhlMouse);
            document.removeEventListener('wheel', h._hlScroll);
            document.removeEventListener('mousemove', h._hlMouseMove);
            state._practiceInputHandlers = null;
        }
    }

    function _endPracticeMode() {
        state._practiceMode = false;
        _hidePracticeInputOverlay();
        const hint = document.getElementById('practice-exit-hint');
        if (hint) hint.style.display = 'none';
        if (state._practiceEscapeHandler) {
            document.removeEventListener('keydown', state._practiceEscapeHandler);
            state._practiceEscapeHandler = null;
        }
        // Remove practice targets
        state.entities = state.entities.filter(e => !e._practiceTarget);
        // Reset player to bay for proper launch
        state.phase = 'bay-ready';
        if (window.SF3D) SF3D.setLaunchPhase(true);
        document.getElementById('gameplay-hud').style.display = 'none';
        document.getElementById('radar-overlay').style.display = 'none';
        document.getElementById('crosshair').style.display = 'none';
        document.getElementById('countdown-display').style.display = 'block';
        document.getElementById('countdown-display').innerHTML = '<span style="font-size:0.35em;color:#446688">LAUNCH BAY — PREPARING</span>';
        if (window.SFAudio) {
            SFAudio.stopCockpitHum && SFAudio.stopCockpitHum();
            SFAudio.stopThrustRumble && SFAudio.stopThrustRumble();
            SFAudio.startBayAmbience();
        }
        if (window.SFAnnouncer) SFAnnouncer.onPracticeEnd();
        else addComm(_crew('deck'), `${_cs()}, practice complete. Preparing for combat launch.`, 'base');
        setTimeout(() => {
            if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();
            _beginLaunchSequence();
        }, 2000);
    }

    // ── Re-open tutorial from button (any time) ──
    function openTutorial() {
        const wasPaused = state.paused;
        if (!wasPaused && state.running) _setPaused(true);
        _startTutorial();
        // Patch: when tutorial overlay dismissed, resume if we auto-paused
        const _origBeginLaunch = _beginLaunchSequence;
    }

    function _beginLaunchSequence() {
        const fullBriefing = !state._briefingShownOnce;

        state.phase = 'launching';
        state.launchTimer = 0;
        // Shorter launch — get to the action fast
        state.launchDuration = fullBriefing ? 11.0 : 8.0;

        // Klaxon on launch commit
        if (window.SFAudio) {
            SFAudio.playSound('klaxon');
        }

        // GDD §3: Fanfare on launch — triumphant brass + timpani
        if (window.SFMusic) {
            SFMusic.setSection('opening-theme');
            SFMusic.setIntensity(0.72);
            SFMusic.triggerFanfare();
        }

        // Auto-deploy mission briefing panel (first time only — with backstory)
        if (!state._briefingShownOnce) {
            state._briefingShownOnce = true;
        }

        // Show skip button
        let skipBtn = document.getElementById('skip-launch-btn');
        if (!skipBtn) {
            skipBtn = document.createElement('button');
            skipBtn.id = 'skip-launch-btn';
            skipBtn.innerText = 'SKIP \u25B6\u25B6';
            skipBtn.style.cssText = 'position:absolute;bottom:32px;right:32px;z-index:65;padding:8px 18px;font-family:monospace;font-size:13px;background:rgba(0,255,255,0.1);color:#0ff;border:1px solid rgba(0,255,255,0.3);border-radius:4px;cursor:pointer;pointer-events:auto;transition:background 0.2s';
            skipBtn.onmouseenter = () => skipBtn.style.background = 'rgba(0,255,255,0.25)';
            skipBtn.onmouseleave = () => skipBtn.style.background = 'rgba(0,255,255,0.1)';
            skipBtn.onclick = () => {
                state.launchTimer = state.launchDuration; // Jump to end
            };
            document.body.appendChild(skipBtn);
        }
        skipBtn.style.display = 'block';

        // Autonomous announcer — crew observe game state and report
        if (window.SFAnnouncer) SFAnnouncer.onLaunchStart();
        else addComm(_crew('deck'), `${_cs()}, launching. Wave ${state.wave}.`, 'base');

        // Adaptive briefing (text ticker only — no bot TTS)
        _queueAdaptiveLaunchBriefing();
    }

    function completeLaunch() {
        // ── Cutscene ends: hand off to combat as a separate entity ──
        state.phase = 'combat';
        if (!state.missionStats.startTime) state.missionStats.startTime = performance.now();
        state._replacementVariant = '';
        state._replacementBriefing = '';

        // Close any open console panels on launch
        const missionPanel = document.getElementById('mission-panel');
        const tutorialPanel = document.getElementById('tutorial-panel');
        if (missionPanel) missionPanel.classList.remove('open');
        if (tutorialPanel) tutorialPanel.classList.remove('open');
        const btnMission = document.getElementById('btn-mission');
        const btnTutorial = document.getElementById('btn-tutorial');
        if (btnMission) btnMission.classList.remove('active');
        if (btnTutorial) btnTutorial.classList.remove('active');

        // Auto-close old panel on launch
        if (window.SFInput) SFInput.togglePanel(false);

        // Audio transition: bay silence → vacuum cockpit hum + engine systems
        if (window.SFAudio) {
            SFAudio.stopBayAmbience();
            SFAudio.startCockpitHum();
            SFAudio.startThrustRumble();
            SFAudio.startStrafeHiss();
        }

        // Music: combat cruise intensity
        if (window.SFMusic) {
            SFMusic.setSection('heat-of-battle');
            SFMusic.setIntensity(0.58);
        }

        // Place player at combat starting position: safely outside baseship, facing away
        const launchDir = new THREE.Vector3(0, 0, -1); // default launch direction
        const combatStartPos = state.baseship.position.clone().add(launchDir.clone().multiplyScalar(800));
        state.player.position.copy(combatStartPos);
        state.player.quaternion.set(0, 0, 0, 1); // facing -Z (away from baseship)

        // Carry launch momentum into combat
        const entrySpeed = dim('timing.entrySpeed');
        state.player.throttle = 0.5;
        state.player.velocity.copy(launchDir.clone().multiplyScalar(entrySpeed));

        // Reset rotational inputs
        state.player.pitch = 0;
        state.player.yaw = 0;
        state.player.roll = 0;

        // Clear cutscene camera state
        state.cutsceneCamPos = null;
        state.cutsceneCamQuat = null;
        state.cutsceneVelocity = null;

        document.getElementById('countdown-display').style.display = 'none';
        document.getElementById('launch-prompt').style.display = 'none';
        document.getElementById('launch-overlay').style.display = 'none';
        document.getElementById('ship-panel').style.display = 'block';
        document.getElementById('crosshair').style.display = 'block';
        document.getElementById('gameplay-hud').style.display = 'block';
        document.getElementById('radar-overlay').style.display = 'block';
        if (window.SF3D) {
            SF3D.setLaunchPhase(false); // End launch phase - show baseship
            SF3D.removeLaunchBay();
            SF3D.showCockpit(true); // Show 3D cockpit
        }

        // Spawn enemies BEFORE announcement so announcer sees them on scope
        if (state.wave === 1 && !state._trainingSkipped) {
            // Wave 1 training: spawn support/wingmen but no enemies yet
            // Training script will spawn drones at the appropriate step
            state._trainingMode = true;
            _despawnSupportShips();
            _spawnTanker();
            _spawnMedic();
            _spawnRescueShuttle();
            _spawnScienceVessel();
            // Spawn wingmen (Hotshot introduces himself via training comms)
            if (state.aiWingmen) {
                const ANPC = window.SFAnpc;
                const rosterKeys = ['hotshot', 'ice'];
                for (let i = 0; i < rosterKeys.length; i++) {
                    const offset = new THREE.Vector3(i === 0 ? -150 : 150, 0, 200 + Math.random() * 100);
                    const spawnPos = state.player.position.clone().add(offset);
                    const w = new Entity('wingman', spawnPos.x, spawnPos.y, spawnPos.z);
                    const profile = deriveCombatProfile('wingman', state.wave);
                    w.hull = profile.hull; w.maxSpeed = profile.maxSpeed;
                    w._manifoldDerivation = profile.trace;
                    const key = rosterKeys[i];
                    if (ANPC) {
                        const npc = ANPC.spawn(key);
                        w.callsign = npc.callsign; w._anpc = npc; w._anpcKey = key;
                    } else {
                        w.callsign = ['Alpha-2', 'Alpha-3'][i];
                    }
                    w.quaternion.copy(state.player.quaternion);
                    state.entities.push(w);
                }
            }
            _startTrainingSequence();
        } else {
            spawnWave();
        }

        // Scatter debris pickups 10s into combat — gives players time to engage first
        setTimeout(() => {
            if (state.phase === 'combat') _spawnDebrisPickups();
        }, 10000);

        if (window.SFAnnouncer) SFAnnouncer.onLaunchClear();
        else { const s = _snap(); addComm(_crew('deck'), `${_cs()}, clear of bay. ${s.totalHostile} contacts on scope.`, 'base'); }
    }

    // ── Mission titles per wave (BFXG-008 Progression Bible) ──
    // ══════════════════════════════════════════════════════════════
    // PROCEDURAL MISSION SCENARIO SYSTEM
    // Waves 1-2: Linear tutorial. Wave 3+: Dynamic mix-and-match missions
    // ══════════════════════════════════════════════════════════════

    // Fixed scenarios for tutorial waves
    const FIXED_SCENARIOS = {
        1: { name: 'FIRST FLIGHT', obj: 'Complete flight training. Destroy all target drones and return safely.', type: 'training' },
        2: { name: 'BAPTISM OF FIRE', obj: 'Eliminate Vek Corsair scouts. Boss: RAZOR', type: 'combat', boss: 'RAZOR' },
    };

    // Mission type templates (procedurally mixed after wave 2)
    const MISSION_TYPES = {
        assault: { weight: 1.0, names: ['STRIKE VECTOR', 'HAMMER DOWN', 'LIGHTNING WAR', 'IRON FIST', 'THUNDER RUN'] },
        defense: { weight: 0.8, names: ['SHIELD WALL', 'LAST STAND', 'FORTRESS', 'GUARDIAN', 'BULWARK'] },
        escort: { weight: 0.7, names: ['CONVOY DUTY', 'SAFE PASSAGE', 'SHEPHERD', 'GUARDIAN ANGEL', 'ESCORT PRIME'] },
        reconnaissance: { weight: 0.6, names: ['GHOST PROTOCOL', 'SHADOW RUN', 'DARK HORIZON', 'SILENT WATCH', 'DEEP SCAN'] },
        mining: { weight: 0.5, names: ['SALVAGE OPS', 'WRECKAGE HAUL', 'SCAVENGER', 'CLAIM STAKE', 'DEAD HARVEST'] },
        sabotage: { weight: 0.6, names: ['BLACK OPS', 'SABOTEUR', 'VIPER STRIKE', 'GHOST KNIFE', 'SILENT DEATH'] },
        rescue: { weight: 0.5, names: ['LIFELINE', 'EXTRACTION', 'SEARCH & RESCUE', 'MERCY FLIGHT', 'LAST HOPE'] },
        interception: { weight: 0.9, names: ['INTERCEPT ALPHA', 'CUT THEM OFF', 'BLOCKADE RUN', 'BARRIER PATROL', 'NET CAST'] },
    };

    // Deep space location pool (unlocked progressively)
    const LOCATIONS = {
        nearEarth: ['Lunar Orbit', 'Kessler Belt', 'L4 Lagrange', 'Geosync Station Theta'],
        asteroidBelt: ['Ceres Approach', 'Vesta Mining Zone', 'Pallas Debris Field', 'Hygiea Cluster'],
        mars: ['Phobos Shadow', 'Deimos Outpost', 'Valles Marineris Rift', 'Olympus Mons Approach'],
        jupiter: ['Io Flux Tube', 'Europa Ice Fields', 'Ganymede Crater', 'Callisto Dark Side'],
        saturn: ['Titan Atmosphere', 'Enceladus Geysers', 'Ring Gap Sigma', 'Hyperion Tumble'],
        deepSpace: ['Kuiper Belt Edge', 'Oort Cloud Threshold', 'Interstellar Medium', 'Manifold Rift'],
    };

    // Boss roster - randomly selected per wave
    const BOSS_ROSTER = [
        { name: 'RAZOR', type: 'interceptor', hull: 1.5, speed: 1.3, desc: 'Vek Ace Pilot' },
        { name: 'IRONJAW', type: 'bomber', hull: 2.0, speed: 0.9, desc: 'Vek Assault Frigate' },
        { name: 'THE SHROUD', type: 'predator', hull: 1.8, speed: 1.1, desc: 'Stealth Hunter' },
        { name: 'DREADCLAW', type: 'dreadnought', hull: 3.0, speed: 0.7, desc: 'Raider Warlord' },
        { name: 'MINELORD KETH', type: 'bomber', hull: 2.2, speed: 0.8, desc: 'Mine Controller' },
        { name: 'GRAVITON', type: 'alien-baseship', hull: 4.0, speed: 0.5, desc: 'Gravity Platform' },
        { name: 'QUEEN THORAX', type: 'predator', hull: 2.5, speed: 1.2, desc: 'Hive Matriarch' },
        { name: 'SCRAPJAW', type: 'dreadnought', hull: 3.5, speed: 0.6, desc: 'Salvage Lord' },
        { name: 'WARDEN VOSS', type: 'alien-baseship', hull: 4.5, speed: 0.5, desc: 'Prison Commander' },
        { name: 'THE PATRIARCH', type: 'predator', hull: 3.0, speed: 1.0, desc: 'Ancient One' },
        { name: 'WORLDBREAKER', type: 'dreadnought', hull: 5.0, speed: 0.4, desc: 'Siege Titan' },
        { name: 'ARCHON ZAEL', type: 'alien-baseship', hull: 5.5, speed: 0.6, desc: 'Grand Admiral' },
    ];

    // Wreckage alien tech pool (wave 3+)
    const ALIEN_TECH = [
        { name: 'Vek Shield Capacitor', effect: 'shields', bonus: 25, rarity: 0.3 },
        { name: 'Bio-Armor Plating', effect: 'hull', bonus: 20, rarity: 0.3 },
        { name: 'Plasma Injector', effect: 'damage', bonus: 1.15, rarity: 0.2 },
        { name: 'Ion Thruster Core', effect: 'speed', bonus: 1.1, rarity: 0.25 },
        { name: 'Targeting Matrix', effect: 'accuracy', bonus: 1.2, rarity: 0.15 },
        { name: 'Energy Recycler', effect: 'ammo', bonus: 3, rarity: 0.2 },
        { name: 'Stealth Coating', effect: 'evasion', bonus: 1.15, rarity: 0.1 },
        { name: 'Quantum Radar', effect: 'sensors', bonus: 1.3, rarity: 0.15 },
        { name: 'Manifold Fragment', effect: 'special', bonus: 0, rarity: 0.05 },
    ];

    // Generate procedural mission for wave N
    // ── Evaluate the current pilot/team capability to drive adaptive difficulty ──
    // Returns a profile used by _generateMission() to scale the next scenario.
    // Works equally for solo and multiplayer — more deaths / lower accuracy = easier scenario.
    function _evaluateTeamCapability() {
        const stats = state.missionStats;
        const shots = Math.max(1, stats.shotsFired || 1);
        const accuracy = Math.round(((stats.shotsHit || 0) / shots) * 100);
        const hullMax = (window.dim && dim('player.hull')) || 100;
        const hullPct = state.player ? Math.min(1, state.player.hull / Math.max(1, hullMax)) : 1;
        const deaths = state._waveDeaths || 0;
        const kills = stats.kills || 0;
        const wave = state.wave || 1;

        // Accuracy contribution: 50%+ is baseline; 0% = full penalty, 100% = full bonus
        const accScore = Math.min(1, (accuracy / 100) * 1.4); // 0-1.0+
        // Hull at landing: full hull = no penalty, 10% hull = heavy penalty
        const hullScore = 0.4 + hullPct * 0.6;               // 0.4-1.0
        // Death penalty: each death reduces score by 20%, capped at 60%
        const deathScore = Math.max(0.4, 1 - deaths * 0.2);   // 0.4-1.0
        // Kill volume: up to 20 kills = full score (scales with wave)
        const killScore = Math.min(1, kills / Math.max(10, wave * 2.5)); // 0-1.0

        // Weighted skill index: 0.3 (struggling) → 1.5 (dominating)
        // Weights: accuracy 40%, hull survival 25%, no deaths 25%, kill count 10%
        const skillIndex = Math.max(0.3, Math.min(1.5,
            accScore * 0.40 +
            hullScore * 0.25 +
            deathScore * 0.25 +
            killScore * 0.10
        ));

        // Weapon tier: more purchased upgrades → higher capability
        const upgrades = (window.SFProgression && SFProgression.career().purchasedUpgrades) || [];
        const weaponTier = upgrades.filter(id => id.startsWith('laser') || id.startsWith('torp') || id.startsWith('after')).length;

        return { accuracy, hullPct, deaths, kills, skillIndex, weaponTier };
    }

    function _generateMission(wave, teamProfile) {
        // Waves 1-2: Fixed tutorial
        if (wave <= 2) return FIXED_SCENARIOS[wave];

        // Wave 3+: Procedural
        const types = Object.keys(MISSION_TYPES);
        const weights = types.map(t => MISSION_TYPES[t].weight);
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let roll = Math.random() * totalWeight;
        let selectedType = types[0];
        for (let i = 0; i < types.length; i++) {
            roll -= weights[i];
            if (roll <= 0) { selectedType = types[i]; break; }
        }

        const template = MISSION_TYPES[selectedType];
        const name = template.names[Math.floor(Math.random() * template.names.length)];

        // ── Team-adaptive difficulty scale ──
        // skillIndex > 1.0 → harder scenario; < 0.7 → easier scenario.
        // This is stored on the mission object and consumed by spawnWave().
        const tp = teamProfile || (wave > 2 ? _evaluateTeamCapability() : { skillIndex: 0.75, weaponTier: 0 });
        const diffScale = tp.skillIndex;

        // Bias mission type selection: struggling teams get more defensive/logistic missions;
        // skilled teams get more assault/sabotage pressure.
        if (wave > 2) {
            if (diffScale < 0.6) {
                // Ease off — boost escort/mining/defense weight, suppress assault/interception
                if (MISSION_TYPES.escort) MISSION_TYPES.escort.weight = 2.5;
                if (MISSION_TYPES.mining) MISSION_TYPES.mining.weight = 2.0;
                if (MISSION_TYPES.defense) MISSION_TYPES.defense.weight = 2.0;
                if (MISSION_TYPES.assault) MISSION_TYPES.assault.weight = 0.5;
                if (MISSION_TYPES.interception) MISSION_TYPES.interception.weight = 0.5;
                if (MISSION_TYPES.sabotage) MISSION_TYPES.sabotage.weight = 0.5;
            } else if (diffScale > 1.1) {
                // Push harder — boost assault/interception/sabotage, suppress easy types
                if (MISSION_TYPES.assault) MISSION_TYPES.assault.weight = 2.5;
                if (MISSION_TYPES.interception) MISSION_TYPES.interception.weight = 2.0;
                if (MISSION_TYPES.sabotage) MISSION_TYPES.sabotage.weight = 1.8;
                if (MISSION_TYPES.escort) MISSION_TYPES.escort.weight = 0.6;
                if (MISSION_TYPES.mining) MISSION_TYPES.mining.weight = 0.6;
                if (MISSION_TYPES.defense) MISSION_TYPES.defense.weight = 0.8;
            } else {
                // Near baseline — restore default weights
                if (MISSION_TYPES.assault) MISSION_TYPES.assault.weight = 1.5;
                if (MISSION_TYPES.interception) MISSION_TYPES.interception.weight = 1.2;
                if (MISSION_TYPES.sabotage) MISSION_TYPES.sabotage.weight = 1.0;
                if (MISSION_TYPES.escort) MISSION_TYPES.escort.weight = 1.2;
                if (MISSION_TYPES.mining) MISSION_TYPES.mining.weight = 1.0;
                if (MISSION_TYPES.defense) MISSION_TYPES.defense.weight = 1.0;
            }
        }

        // Location based on wave progression
        let locationPool = 'nearEarth';
        if (wave >= 15) locationPool = 'deepSpace';
        else if (wave >= 12) locationPool = 'saturn';
        else if (wave >= 9) locationPool = 'jupiter';
        else if (wave >= 6) locationPool = 'mars';
        else if (wave >= 4) locationPool = 'asteroidBelt';

        const location = LOCATIONS[locationPool][Math.floor(Math.random() * LOCATIONS[locationPool].length)];

        // Boss every 2-3 waves (after wave 2)
        const hasBoss = wave === 2 || (wave > 2 && Math.random() < 0.4 + (wave * 0.03));
        const boss = hasBoss ? BOSS_ROSTER[Math.floor(Math.random() * Math.min(BOSS_ROSTER.length, 1 + Math.floor(wave / 2)))] : null;

        // Generate objective based on mission type
        const objectives = {
            assault: `Destroy enemy ${boss ? 'command ship' : 'staging area'} in ${location}`,
            defense: `Defend ${location} from ${boss ? 'massive' : 'coordinated'} assault`,
            escort: `Escort convoy through ${location}${boss ? ' — enemy ace spotted' : ''}`,
            reconnaissance: `Scan ${location} for enemy activity${boss ? ' — hostile commander detected' : ''}`,
            mining: `Salvage wreckage in ${location}${boss ? ' — scavenger lord inbound' : ''}`,
            sabotage: `Infiltrate and sabotage enemy installation at ${location}`,
            rescue: `Extract stranded personnel from ${location}${boss ? ' — area heavily defended' : ''}`,
            interception: `Intercept enemy fleet en route to ${location}`,
        };

        return {
            name,
            obj: objectives[selectedType] + (boss ? ` | BOSS: ${boss.name}` : ''),
            type: selectedType,
            location,
            locationPool,
            boss,
            diffScale,   // adaptive difficulty multiplier consumed by spawnWave()
            skillIndex: tp.skillIndex,
        };
    }

    // Get mission for current wave (cached)
    function _getCurrentMission() {
        if (!state._currentMission || state._currentMission.wave !== state.wave) {
            state._currentMission = { wave: state.wave, ...(_generateMission(state.wave) || {}) };
        }
        return state._currentMission;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // _configureGame(player) — single entry point for every round.
    //
    //   Win  path: state.wave is already incremented → _configureGame() → next scenario
    //   Lose path: state.wave unchanged              → _configureGame() → retry same scenario
    //
    // Flow: generate mission → reset bay → briefing comms → auto-launch
    // ══════════════════════════════════════════════════════════════════════════
    function _configureGame(player) {
        // ── 0. Reset per-wave death counter (new wave = fresh performance record) ──
        state._waveDeaths = 0;
        state._performanceTier = 2;

        // ── 1. Generate scenario for this wave using team capability evaluation ──
        const _teamProfile = _evaluateTeamCapability();
        state._currentMission = { wave: state.wave, ...(_generateMission(state.wave, _teamProfile) || {}) };
        const mission = state._currentMission;

        // ── 2. Reset bay state ──
        state.phase = 'bay-ready';
        state.launchTimer = 0;
        state._launchAudioPlayed = false;
        state._launchBlastPlayed = false;
        state._paBriefingDone = false;
        state.cutsceneCamPos = null;
        state.cutsceneCamQuat = null;
        state.cutsceneVelocity = null;

        // Reset per-wave stats
        state.missionStats.kills = 0;
        state.missionStats.shotsFired = 0;
        state.missionStats.shotsHit = 0;
        state.missionStats.damageDealt = 0;
        state.missionStats.damageTaken = 0;
        state.missionStats.wingmenSaved = 0;
        state.missionStats.wingmenLost = 0;
        state.missionStats.startTime = 0;
        state._waveClearKills = null;
        state._waveClearPlayerKills = null;

        // Reset subsystems
        if (window.SFRescue) SFRescue.reset();
        if (window.SFThreatSys) SFThreatSys.reset();

        // Clear any uncollected pickups from previous wave (remove from scene + entity list)
        state.entities = (state.entities || []).filter(e => {
            if (e.type !== 'pickup') return true;
            if (window.SF3D && SF3D.removePickup) SF3D.removePickup(e.id);
            return false;
        });

        // ── 3. Reset player position to bay ──
        if (player) {
            player.position.set(0, -32, 50);
            player.velocity.set(0, 0, 0);
            player.quaternion.set(0, 0, 0, 1);
            player.throttle = 0;
            player.pitch = 0;
            player.yaw = 0;
            player.roll = 0;
        }

        // ── 4. Scene / audio ──
        if (window.SFMusic) SFMusic.setSection('launch-bay');
        if (window.SFAudio) {
            SFAudio.stopCockpitHum();
            SFAudio.stopThrustRumble();
            SFAudio.stopStrafeHiss();
            SFAudio.startBayAmbience();
        }
        if (window.SF3D) { SF3D.setLaunchPhase(true); SF3D.showLaunchBay(); SF3D.showCockpit(true); }

        // ── 5. HUD ──
        const hud = document.getElementById('gameplay-hud');
        if (hud) { hud.style.display = 'block'; hud.style.opacity = '1'; }
        const radar = document.getElementById('radar-overlay');
        if (radar) radar.style.opacity = '1';
        const launchBtn = document.getElementById('launch-btn');
        if (launchBtn) launchBtn.style.display = 'none';
        const shipPanel = document.getElementById('ship-panel');
        if (shipPanel) shipPanel.style.display = 'none';
        document.getElementById('crosshair').style.display = 'none';
        const cd = document.getElementById('countdown-display');
        if (cd) { cd.style.display = 'block'; cd.innerHTML = '<span style="font-size:0.35em;color:#446688">LAUNCH BAY — PREPARING LAUNCH</span>'; }

        // ── 6. Pre-launch briefing comms ──
        const cs = state.callsign || 'Pilot';
        setTimeout(() => {
            addComm('Tactical', `Wave ${state.wave}: ${mission.name || 'Combat Patrol'}. ${mission.obj || 'Engage and destroy all bogies.'}`, 'warning');
        }, 300);
        setTimeout(() => {
            if (window.SFAnnouncer) SFAnnouncer.onBayReady();
        }, 1200);

        // ── 7. Auto-launch ──
        if (state.wave === 1) {
            // Wave 1: Auto-detect controls, then launch training
            setTimeout(() => {
                if (state.phase !== 'bay-ready') return;
                // Auto-detect control type
                const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
                let detected = 'keyboard';
                for (const gp of gamepads) { if (gp && gp.connected) { detected = 'gamepad'; break; } }
                if ('ontouchstart' in window && window.innerWidth < 900) detected = 'touch';
                state._trainingControlType = detected;
                const isElectronApp = !!(window.NativeApp && window.NativeApp.isElectron);
                setTimeout(() => {
                    if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();
                    if (isElectronApp) {
                        _beginLaunchSequence();
                    } else {
                        _showEscapeHint(() => _beginLaunchSequence());
                    }
                }, 50);
            }, 1500);
        } else {
            setTimeout(() => {
                if (state.phase === 'bay-ready') {
                    if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();
                    _beginLaunchSequence();
                }
            }, 3000);
        }
    }

    function completeLanding() {
        // ── Teardown dock cutscene ──
        const dco = document.getElementById('dock-cutscene-overlay');
        if (dco) {
            dco.classList.remove('active');
            dco.style.display = 'none';
            const fadeEl = document.getElementById('dock-fade');
            if (fadeEl) fadeEl.style.opacity = '0';
        }
        state.cutsceneCamPos = null;
        state.cutsceneCamQuat = null;
        state.cutsceneVelocity = null;
        const _hud = document.getElementById('gameplay-hud');
        const _rad = document.getElementById('radar-overlay');
        if (_hud) { _hud.style.opacity = ''; _hud.style.display = 'none'; }
        if (_rad) _rad.style.opacity = '';
        document.getElementById('crosshair').style.display = 'none';
        document.getElementById('ship-panel').style.display = 'none';

        state.phase = 'docking';
        const prevWave = state.wave;
        state.wave++;

        // ── Purge any attached organisms ──
        let purgedOrganisms = false;
        const ents = state.entities;
        for (let i = 0, len = ents.length; i < len; i++) {
            const e = ents[i];
            if (e.type === 'youngling' && e._attachTarget === state.player) {
                e.markedForDeletion = true;
                if (M) M.remove(e.id);
                purgedOrganisms = true;
            }
        }
        if (purgedOrganisms) {
            SFAnnouncer.onDecontamination();
            if (window.SFAudio) SFAudio.playSound('comm_beep');
        }
        state._emergencyRTB = false;
        const rtbBtn = document.getElementById('btn-rtb');
        if (rtbBtn) rtbBtn.style.display = 'none';

        // ── Music to closing theme ──
        if (window.SFMusic) { SFMusic.setSection('closing-theme'); SFMusic.setIntensity(0.1); }

        // ── Snapshot hull before repair, then do full refit ──
        const hullBefore = Math.round(state.player.hull);
        const hullMax = Math.round(dim('player.hull') + 25); // partial repair
        const shldMax = Math.round(dim('player.shields'));
        const fuelMax = Math.round(dim('player.fuel'));
        const torpMax = dim('player.torpedoes');
        state.player.hull = Math.min(dim('player.hull'), state.player.hull + 25);
        state.player.torpedoes = torpMax;
        state.player.shields = shldMax;
        state.player.fuel = fuelMax;
        state.player.boostCooldown = 0;
        state.player.boostActive = false;
        // Resupply baseship
        state.baseship.hull = Math.min(dim('baseship.hull'), state.baseship.hull + dim('baseship.repairHull'));
        state.baseship.shields = Math.min(dim('baseship.shields'), state.baseship.shields + dim('baseship.repairShields'));

        // ── Progression: capture pre-award state, then award ──
        let xpEarned = 0, crEarned = 0, rankedUp = false, newRankName = '';
        let progressBefore = 0, progressAfter = 0, rankCurName = '', rankNextName = '';
        if (window.SFProgression) {
            const cBefore = SFProgression.career();
            const xpBefore = cBefore.xp;
            const crBefore = cBefore.credits;
            progressBefore = SFProgression.getRankProgress();

            // Award events
            const r1 = SFProgression.awardEvent('wave_complete');
            if (state.missionStats.damageTaken === 0) SFProgression.awardEvent('wave_no_damage');

            const cAfter = SFProgression.career();
            xpEarned = cAfter.xp - xpBefore;
            crEarned = cAfter.credits - crBefore;
            progressAfter = SFProgression.getRankProgress();

            const curRank = SFProgression.getRank();
            const nxtRank = SFProgression.getNextRank ? SFProgression.getNextRank() : null;
            rankCurName = curRank ? curRank.name : 'ENSIGN';
            rankNextName = nxtRank ? nxtRank.name : 'MAX RANK';

            rankedUp = r1 && r1.ranked;
            newRankName = r1 && r1.newRank ? r1.newRank.name : rankCurName;
        }

        // ── Weapon unlocks (compare prev wave vs new wave) ──
        const _prevUnlocked = _getUnlockedWeaponCount(prevWave);
        const _newUnlocked = _getUnlockedWeaponCount(state.wave);
        const _wepNames = ['Laser Cannon', 'Spread Shot', 'Proton Torpedo', 'EMP Pulse'];
        const newWeapon = _newUnlocked > _prevUnlocked ? _wepNames[_newUnlocked - 1] : null;

        // ── Accuracy calc ──
        const ms = state.missionStats;
        const acc = ms.shotsFired > 0 ? Math.round((ms.shotsHit / ms.shotsFired) * 100) : 0;
        const flightSec = ms.startTime ? Math.round((performance.now() - ms.startTime) / 1000) : 0;
        const flightMin = Math.floor(flightSec / 60);
        const flightSs = flightSec % 60;

        // ── Populate debrief overlay ──
        const overlay = document.getElementById('bay-debrief');
        if (overlay) {
            // Reset rank-up banner from previous wave
            const bdrRankup = document.getElementById('bdr-rankup');
            if (bdrRankup) bdrRankup.classList.remove('visible');
            // Header
            const mission = _getCurrentMission();
            const el = (id) => document.getElementById(id);
            el('bdr-wave-title').textContent = `WAVE ${prevWave} COMPLETE`;
            el('bdr-mission-name').textContent = mission.name || 'COMBAT PATROL';

            // Callsign acknowledgment
            const cs = state.callsign || 'PILOT';
            const waveKills = state._waveClearKills != null ? state._waveClearKills : state.kills;
            el('bdr-callsign-ack').textContent =
                `${cs.toUpperCase()}, you fulfilled your mission — ${waveKills} hostile${waveKills !== 1 ? 's' : ''} eliminated.`;

            // Stats rows
            el('bdr-stats-rows').innerHTML =
                _bdrStatRow('KILLS', state.kills, state.kills > 10 ? 'green' : '') +
                _bdrStatRow('KILL SCORE', state.score, '') +
                _bdrStatRow('ACCURACY', acc + '%', acc >= 60 ? 'green' : acc >= 30 ? 'yellow' : 'red') +
                _bdrStatRow('HULL ENTERING', hullBefore + '%', hullBefore > 60 ? 'green' : hullBefore > 30 ? 'yellow' : 'red') +
                _bdrStatRow('FLIGHT TIME', `${flightMin}m ${flightSs < 10 ? '0' : ''}${flightSs}s`, '') +
                _bdrStatRow('DAMAGE TAKEN', Math.round(ms.damageTaken), ms.damageTaken === 0 ? 'green' : '');

            // Rank progress bar
            el('bdr-rank-cur').textContent = rankCurName.toUpperCase();
            el('bdr-rank-next').textContent = rankNextName.toUpperCase();
            el('bdr-xp-delta').textContent = `+${xpEarned} XP  this wave`;
            el('bdr-xp-earned').textContent = `+${xpEarned}`;
            el('bdr-cr-earned').textContent = `+₡${crEarned}`;

            if (state.missionStats.damageTaken === 0) {
                el('bdr-bonus-row').style.display = 'flex';
            }

            const career = window.SFProgression ? SFProgression.career() : { credits: 0 };
            el('bdr-cr-balance').textContent = `₡${career.credits}`;
            el('bdr-shop-credits').textContent = `₡${career.credits} AVAILABLE`;

            // Rank-up banner
            if (rankedUp) {
                el('bdr-rankup').classList.add('visible');
                el('bdr-rankup-name').textContent = newRankName.toUpperCase();
                // Announce promotion via announcer
                if (window.SFAnnouncer && SFAnnouncer.onRankPromotion) SFAnnouncer.onRankPromotion(newRankName);
                // Persist rank badge to localStorage for lobby display
                if (window.SFProgression) {
                    const rank = SFProgression.getRank();
                    try {
                        localStorage.setItem('sf_rank_id', rank.id);
                        localStorage.setItem('sf_rank_name', rank.name);
                        localStorage.setItem('sf_rank_abbr', rank.abbr);
                        localStorage.setItem('sf_rank_icon', rank.icon);
                        localStorage.setItem('sf_rank_pips', rank.pips);
                    } catch (e) { /* quota */ }
                }
            }

            // Animate XP bar after short delay
            setTimeout(() => {
                el('bdr-xp-fill').style.width = Math.round(progressAfter * 100) + '%';
            }, 400);

            // Ship status animated bars
            const hullPct = Math.round((state.player.hull / dim('player.hull')) * 100);
            el('bdr-hull-pct').textContent = hullPct + '%';
            el('bdr-shld-pct').textContent = '100%';
            el('bdr-fuel-pct').textContent = '100%';
            el('bdr-torp-val').textContent = torpMax + ' / ' + torpMax;
            setTimeout(() => {
                el('bdr-hull-fill').style.width = hullPct + '%';
                el('bdr-shld-fill').style.width = '100%';
                el('bdr-fuel-fill').style.width = '100%';
                el('bdr-torp-fill').style.width = '100%';
            }, 600);

            // New weapon/ability unlock
            if (newWeapon) {
                const sec = el('bdr-unlocks-section');
                sec.style.display = 'block';
                el('bdr-unlocks-list').innerHTML =
                    `<div class="bdr-unlock-item">
                        <div class="bdr-unlock-icon">⚡</div>
                        <div class="bdr-unlock-text">
                            <div class="bdr-unlock-name">${newWeapon}</div>
                            <div class="bdr-unlock-desc">New weapon unlocked. Cycle weapons with [T].</div>
                        </div>
                        <div class="bdr-unlock-new">NEW</div>
                    </div>`;
            }

            // Next mission card
            const nextMission = _generateMission(state.wave);
            state._currentMission = { wave: state.wave, ...nextMission }; // Cache for next wave
            el('bdr-next-wave-num').textContent = `WAVE ${state.wave}`;
            el('bdr-next-title').textContent = nextMission.name || 'COMBAT PATROL';
            el('bdr-next-objective').textContent = nextMission.obj || 'Engage and destroy all bogies.';
            el('bdr-next-wave-num2').textContent = state.wave;

            // Upgrade shop — gated by wave performance tier
            _bdrRebuildShop(state._performanceTier);

            // Exit pointer lock so user can interact with UI
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }

            // Show the overlay
            overlay.classList.add('active');
        }

        // PA debrief (announcer runs in background)
        SFAnnouncer.onWaveComplete(prevWave);
        if (state.wave >= 2) {
            setTimeout(() => { SFAnnouncer.onNextWaveIntel(); }, 4000);
        }

        // ── Launch handler — triggered by "LAUNCH" button in debrief panel ──
        function _doBayTransition() {
            const overlay = document.getElementById('bay-debrief');
            if (overlay) { overlay.classList.remove('active'); overlay.style.display = 'none'; }

            state.player.position.set(0, -32, 50);
            state.player.velocity.set(0, 0, 0);
            state.player.quaternion.set(0, 0, 0, 1);
            state.player.throttle = 0;
            state.player.pitch = 0;
            state.player.yaw = 0;
            state.player.roll = 0;
            state.phase = 'bay-ready';
            if (window.SFMusic) SFMusic.setSection('launch-bay');
            state.launchTimer = 0;
            state._launchAudioPlayed = false;
            state._launchBlastPlayed = false;
            state._paBriefingDone = false;
            state.cutsceneCamPos = null;
            state.cutsceneCamQuat = null;
            state.cutsceneVelocity = null;

            // Reset rescue uses for new wave
            if (window.SFRescue) SFRescue.reset();

            // Reset countermeasures for new wave
            if (window.SFThreatSys) SFThreatSys.reset();

            if (window.SFAudio) {
                SFAudio.stopCockpitHum();
                SFAudio.stopThrustRumble();
                SFAudio.stopStrafeHiss();
                SFAudio.startBayAmbience();
            }
            if (window.SF3D) { SF3D.setLaunchPhase(true); SF3D.showLaunchBay(); }

            // Skip-training button is wave-1 only
            if (state.wave !== 1) {
                const _skipTrainBtn = document.getElementById('training-skip-btn');
                if (_skipTrainBtn) _skipTrainBtn.style.display = 'none';
            }

            const launchBtn = document.getElementById('launch-btn');
            if (launchBtn) launchBtn.style.display = 'none'; // auto-launch; no manual button
            const cd = document.getElementById('countdown-display');
            if (cd) { cd.style.display = 'block'; cd.innerHTML = '<span style="font-size:0.35em;color:#446688">LAUNCH BAY — PREPARING LAUNCH</span>'; }

            SFAnnouncer.onBayReady();

            // Reset per-wave mission stats
            state.missionStats.kills = 0;
            state.missionStats.shotsFired = 0;
            state.missionStats.shotsHit = 0;
            state.missionStats.damageDealt = 0;
            state.missionStats.damageTaken = 0;
            state.missionStats.wingmenSaved = 0;
            state.missionStats.wingmenLost = 0;
            state.missionStats.startTime = 0;
            // Reset wave-clear snapshot
            state._waveClearKills = null;
            state._waveClearPlayerKills = null;

            // Auto-launch after 3 seconds in bay (player can still press Space to skip)
            setTimeout(() => {
                if (state.phase === 'bay-ready') {
                    if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();
                    _beginLaunchSequence();
                }
            }, 3000);
        }

        // Auto-advance debrief: 8-second countdown then transition to bay
        window._bdrLaunch = null; // clear any stale ref
        let _bdrSecs = 8;
        const _bdrCdEl = document.getElementById('bdr-countdown-secs');
        if (_bdrCdEl) _bdrCdEl.textContent = _bdrSecs;
        const _bdrTick = setInterval(() => {
            if (window._bdrPaused) return;
            _bdrSecs--;
            const el = document.getElementById('bdr-countdown-secs');
            if (el) el.textContent = _bdrSecs;
            if (_bdrSecs <= 0) { clearInterval(_bdrTick); _doBayTransition(); }
        }, 1000);
        // Still allow spacebar or tap to skip the countdown early
        window._bdrLaunch = function () {
            clearInterval(_bdrTick);
            window._bdrLaunch = null;
            _doBayTransition();
        };
    }

    // ── Bay-debrief helper: single stat row HTML ──
    function _bdrStatRow(label, val, cls) {
        return `<div class="bdr-stat-row">
            <span class="bdr-stat-label">${label}</span>
            <span class="bdr-stat-val ${cls}">${val}</span>
        </div>`;
    }

    // ── Bay-debrief: rebuild upgrade shop list (also called after purchase) ──
    // tier 2 = full shop (clean wave)  | tier 1 = hull/shield/fuel only (1 death) | tier 0 = field refit only (2+ deaths)
    // Shop tier config:
    //   Tier 2 (clean wave)  — full shop: all upgrades, sorted by cost, up to 8 slots
    //   Tier 1 (1 death)     — limited supply: cheapest 4 upgrades only
    //   Tier 0 (2+ deaths)   — scarce supply: cheapest 2 upgrades only
    // All tiers always show something so credits are always spendable.
    const _SHOP_SLOTS = [2, 4, 8];   // indexed by tier
    const _SHOP_BANNERS = [
        'SCARCE SUPPLIES — only the basics are available. Fewer casualties next wave means better stock.',
        'LIMITED SUPPLIES — some upgrades held back. Survive cleanly next wave for the full selection.',
        '',  // tier 2: no banner needed
    ];
    function _bdrRebuildShop(tier) {
        if (!window.SFProgression) return;
        const shopList = document.getElementById('bdr-shop-list');
        const shopEmpty = document.getElementById('bdr-shop-empty');
        const shopCr = document.getElementById('bdr-shop-credits');
        const career = SFProgression.career();
        if (shopCr) shopCr.textContent = `₡${career.credits} AVAILABLE`;
        const crBal = document.getElementById('bdr-cr-balance');
        if (crBal) crBal.textContent = `₡${career.credits}`;
        if (!shopList) return;

        const effectiveTier = (tier === undefined || tier === null) ? (state._performanceTier ?? 2) : Math.max(0, Math.min(2, tier));
        const slots = _SHOP_SLOTS[effectiveTier];
        const banner = _SHOP_BANNERS[effectiveTier];

        // Sort all available upgrades cheapest-first so lower tiers always get the most accessible items
        const upgrades = SFProgression.getPurchasableUpgrades()
            .slice()
            .sort((a, b) => a.cost - b.cost)
            .slice(0, slots);

        if (upgrades.length === 0) {
            shopList.innerHTML = banner
                ? `<div style="padding:10px 4px;color:#aa8844;font-size:10px;letter-spacing:1.5px;line-height:1.5;">${banner}</div>`
                : '';
            if (!banner && shopEmpty) shopEmpty.style.display = 'block';
            return;
        }
        if (shopEmpty) shopEmpty.style.display = 'none';
        shopList.innerHTML = (banner
            ? `<div style="padding:6px 4px 10px;color:${effectiveTier === 0 ? '#aa6644' : '#aa8844'};font-size:9px;letter-spacing:1px;line-height:1.4;">${banner}</div>`
            : '')
            + upgrades.map(u => {
                const canAfford = career.credits >= u.cost;
                return `<div class="bdr-shop-item${canAfford ? '' : ' cant-afford'}"
                    onclick="window._sfBayBuy && window._sfBayBuy('${u.id}')">
                    <div class="bdr-shop-item-left">
                        <div class="bdr-shop-item-name">${u.name}</div>
                        <div class="bdr-shop-item-desc">${u.desc}</div>
                    </div>
                    <div class="bdr-shop-item-cost">₡${u.cost}</div>
                </div>`;
            }).join('');
    }

    window._sfBayBuy = function (upgradeId) {
        if (!window.SFProgression) return;
        const result = SFProgression.purchaseUpgrade(upgradeId);
        if (result.success) {
            if (window.SFAudio) SFAudio.playSound('comm_beep');
            SFProgression.applyUpgradesToPlayer(state.player, () => { });
            _bdrRebuildShop();
            const career = SFProgression.career();
            const shopCr = document.getElementById('bdr-shop-credits');
            if (shopCr) shopCr.textContent = `₡${career.credits} AVAILABLE`;
            const crBal = document.getElementById('bdr-cr-balance');
            if (crBal) crBal.textContent = `₡${career.credits}`;
        }
    };

    const MANIFOLD_ARCHETYPES = {
        enemy: { x: 1.1, y: 1.25, waveX: 0.08, waveY: 0.14, hullBase: 12, hullWave: 2, hullField: 1, speedBase: 160, speedWave: 10, speedField: 10, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
        interceptor: { x: 1.45, y: 1.7, waveX: 0.1, waveY: 0.16, hullBase: 25, hullWave: 3, hullField: 2, speedBase: 320, speedWave: 15, speedField: 15, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
        bomber: { x: 1.7, y: 1.2, waveX: 0.12, waveY: 0.11, hullBase: 40, hullWave: 4, hullField: 3, speedBase: 100, speedWave: 6, speedField: 6, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
        predator: { x: 2.2, y: 1.9, waveX: 0.1, waveY: 0.12, hullBase: 500, hullWave: 60, hullField: 20, speedBase: 280, speedWave: 10, speedField: 12, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
        dreadnought: { x: 3.6, y: 2.8, waveX: 0.08, waveY: 0.1, hullBase: 2000, hullWave: 200, hullField: 60, speedBase: 30, speedWave: 2, speedField: 3, shieldsBase: 1000, shieldsWave: 100, shieldsField: 40 },
        'alien-baseship': { x: 3.1, y: 2.4, waveX: 0.09, waveY: 0.11, hullBase: 1000, hullWave: 500, hullField: 80, speedBase: 40, speedWave: 3, speedField: 5, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
        'hive-queen': { x: 4.8, y: 3.6, waveX: 0.09, waveY: 0.07, hullBase: 5000, hullWave: 300, hullField: 120, speedBase: 18, speedWave: 0.5, speedField: 2, shieldsBase: 2500, shieldsWave: 150, shieldsField: 80 },
        wingman: { x: 1.05, y: 1.1, waveX: 0.06, waveY: 0.09, hullBase: 60, hullWave: 5, hullField: 3, speedBase: 180, speedWave: 6, speedField: 8, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
    };

    function deriveCombatProfile(type, wave, opts) {
        const arch = MANIFOLD_ARCHETYPES[type] || MANIFOLD_ARCHETYPES.enemy;
        const o = opts || {};
        const x = arch.x + wave * arch.waveX;
        const y = arch.y + wave * arch.waveY;
        const z = x * y * y;  // z = xy² — manifold projection

        const fieldRaw = (M && M.diamond) ? M.diamond(x * 420, y * 420, z * 420) : Math.sin(z);
        const field = Math.min(1, Math.max(0, Math.abs(fieldRaw)));
        const gradRaw = (M && M.diamondGrad) ? M.diamondGrad(x * 420, y * 420, z * 420) : { x: y, y: x, z: 1 };
        const gradMag = Math.sqrt(gradRaw.x * gradRaw.x + gradRaw.y * gradRaw.y + gradRaw.z * gradRaw.z);

        const trainingScale = o.training ? 0.45 : 1.0;
        const hull = Math.max(1, Math.round((arch.hullBase + (wave * arch.hullWave) + (field * arch.hullField)) * trainingScale));
        const maxSpeed = Math.max(10, Math.round((arch.speedBase + (wave * arch.speedWave) + (Math.min(1.5, gradMag * 0.02) * arch.speedField)) * (o.speedScale || 1)));
        const shields = Math.max(0, Math.round((arch.shieldsBase + (wave * arch.shieldsWave) + (field * arch.shieldsField)) * trainingScale));

        return {
            hull,
            maxSpeed,
            shields,
            trace: {
                type,
                wave,
                lens: 'deriveCombatProfile',
                coords: { x, y, z },
                field,
                gradMag,
                training: !!o.training,
            },
        };
    }

    // ══════════════════════════════════════════════════════════════
    // LEVEL / WEAPON PROGRESSION HELPERS
    // ══════════════════════════════════════════════════════════════

    // Returns number of weapon slots unlocked at a given wave/level:
    //   Level 1 (wave 1): LASER only
    //   Level 2 (wave 2): + SPREAD SHOT
    //   Level 3 (wave 3): + PROTON TORPEDO (can now attack enemy base ships)
    //   Level 4 (wave 4+): + EMP PULSE
    function _getUnlockedWeaponCount(wave) {
        if (wave >= 4) return 4;  // All: LASER, SPREAD, TORP, EMP
        if (wave >= 3) return 3;  // LASER, SPREAD, TORP
        if (wave >= 2) return 2;  // LASER, SPREAD
        return 1;                 // LASER only
    }

    // Enemy base fire cooldown (seconds) — decreases each wave for escalating difficulty
    // Wave 1: very slow (3.5s) → Wave 6+: fast (0.75s)
    function _levelFireCooldown(wave) {
        return Math.max(0.75, 3.5 - (wave - 1) * 0.55);
    }

    // Spawn a tight cluster of enemies around a world-space center point.
    // Enemies share a clusterId so radar / wingman comms can reference them.
    // Formation positions are a phi-spaced spiral in the surface tangent plane
    // at the cluster center — the swarm geometry IS the manifold's signature
    // at that point. Same surface, same formation, every spawn.
    function _spawnCluster(clusterId, clusterLabel, cx, cy, cz, enemyType, count, wave, opts) {
        // Bias the cluster centre toward the nearest asteroid cluster so the
        // ambushers materialise inside cover rather than open space. Only snap
        // when an asteroid cluster is within ambush range (~3500m of intent).
        if (window.SFEnhance && window.SFEnhance.nearestAsteroidCluster) {
            const ac = window.SFEnhance.nearestAsteroidCluster(cx, cy, cz, 3500);
            if (ac) { cx = ac.x; cy = ac.y; cz = ac.z; }
        }
        state.clusters.push({ id: clusterId, label: clusterLabel, center: { x: cx, y: cy, z: cz }, total: count, alive: count });
        const spread = 350;
        const frame = _surfaceFrame(cx, cy, cz);
        const fieldHere = (M && M.diamond) ? M.diamond(cx, cy, cz) : 0;
        const PHI = 1.6180339887498949;
        const goldAngle = Math.PI * 2 / PHI;
        for (let i = 0; i < count; i++) {
            // Sunflower / Fibonacci spiral in the tangent plane (a, b).
            // Radius grows with sqrt(i) so density stays uniform across the disc.
            const r = spread * Math.sqrt((i + 0.5) / Math.max(1, count));
            const theta = i * goldAngle;
            const ca = Math.cos(theta), sa = Math.sin(theta);
            const ax = cx + (frame.a.x * ca + frame.b.x * sa) * r;
            const ay = cy + (frame.a.y * ca + frame.b.y * sa) * r * 0.3;
            const az = cz + (frame.a.z * ca + frame.b.z * sa) * r;
            const e = new Entity(enemyType, ax, ay, az);
            const profile = deriveCombatProfile(enemyType, wave, opts || {});
            e.hull = profile.hull;
            e.maxSpeed = profile.maxSpeed;
            e.shields = profile.shields || 0;
            e._manifoldDerivation = profile.trace;
            e._clusterId = clusterId;
            // Per-level fire rate (harder each wave)
            e._fireCooldownBase = _levelFireCooldown(wave);
            // Wave 3+: interceptors always spread-fire; drones spread when the
            // local field is in the aggressive (positive) lobe. Wave 2 stays
            // single-shot to keep the difficulty ramp readable and the entity
            // count per volley low.
            e._useSpread = wave >= 3 && (enemyType === 'interceptor' || fieldHere > 0);
            // Type-specific setup
            if (enemyType === 'interceptor') {
                e.radius = dim('entity.interceptor.radius');
            } else if (enemyType === 'bomber') {
                e.radius = dim('entity.bomber.radius');
                e._bombCooldown = 0;
                e._bombInterval = dim('enemy.bomber.bombInterval');
            }
            state.entities.push(e);
        }
    }

    // Enemy spread shot — 3-round fan fired by wave 2+ enemies alongside their
    // laser. Pellets fan in a phi-spaced triangle around the centerline; cone
    // width derives from |field| at the firing position so agitated regions of
    // the surface produce wider, less accurate volleys.
    function _fireEnemySpread(entity) {
        if (_countType('laser') + 3 >= dim('cap.lasers')) return;
        const PHI = 1.6180339887498949;
        const goldAngle = Math.PI * 2 / PHI;
        const f = (M && M.diamond) ? M.diamond(entity.position.x, entity.position.y, entity.position.z) : 0;
        const cone = 0.06 + Math.abs(f) * 0.18;
        for (let s = 0; s < 3; s++) {
            const a = s * goldAngle;
            const rx = Math.cos(a) * cone;
            const ry = Math.sin(a) * cone;
            _q1.setFromEuler(new THREE.Euler(rx, ry, 0));
            _v1.set(0, 0, -8).applyQuaternion(entity.quaternion);
            const l = new Entity('laser',
                entity.position.x + _v1.x,
                entity.position.y + _v1.y,
                entity.position.z + _v1.z);
            l.quaternion.copy(entity.quaternion).multiply(_q1);
            _v1.set(0, 0, -dim('weapon.laser.speed') * 0.85).applyQuaternion(l.quaternion);
            l.velocity.copy(_v1);
            l.owner = 'enemy';
            l.radius = dim('weapon.laser.radius');
            l.maxAge = dim('weapon.laser.maxAge') || 2;
            l._spawnTime = state.elapsed;
            l.damage = Math.round(dim('weapon.laser.damage') * 0.55); // reduced per-pellet, compensated by volume
            state.entities.push(l);
            if (window.SF3D) SF3D.spawnLaser(l);
        }
        if (window.SFAudio) SFAudio.playSound('laser');
    }

    // ── Wingman cluster bearing callout ──
    // Announces closest active cluster bearing, range, and bogey count.
    function _wingmanClusterComm() {
        if (!state.player || state.phase !== 'combat') return;
        const activeClusters = state.clusters.filter(cl => cl.alive > 0);
        if (activeClusters.length === 0) return;
        const p = state.player.position;
        let best = activeClusters[0];
        let bestDist = Infinity;
        for (const cl of activeClusters) {
            const d = Math.hypot(cl.center.x - p.x, cl.center.y - p.y, cl.center.z - p.z);
            if (d < bestDist) { bestDist = d; best = cl; }
        }
        const bearing = Math.round(((Math.atan2(best.center.x - p.x, -(best.center.z - p.z)) * 180 / Math.PI) + 360) % 360);
        const rangePretty = Math.round(bestDist / 100) * 100;
        const others = activeClusters.length - 1;
        const tail = others > 0 ? ` ${others} other cluster${others > 1 ? 's' : ''} active.` : ' Last cluster — finish them.';
        const wingmen = state.entities.filter(e => e.type === 'wingman' && !e.markedForDeletion);
        const caller = wingmen.length > 0 ? (wingmen[0].callsign || 'Alpha-2') : 'Alpha-2';
        addComm(caller, `Cluster ${best.label} — bearing ${bearing}°, range ${rangePretty}. ${best.alive} bogey${best.alive !== 1 ? 's' : ''}.${tail}`, 'info');
        _updateClusterHUD();
    }

    // Initial cluster announcement at wave start (fires after launch delay)
    function _clusterStartComm() {
        setTimeout(() => {
            if (state.clusters.length === 0) return;
            const names = state.clusters.map(cl => cl.label).join(', ');
            const total = state.clusters.reduce((s, cl) => s + cl.total, 0);
            addComm(_crew('tactical'), `${state.clusters.length} bogie cluster${state.clusters.length > 1 ? 's' : ''} on scope: ${names}. ${total} bogies total. Engage at will.`, 'warning');
            _updateClusterHUD();
            // Immediately give first bearing call
            state._clusterCallTimer = 3;
        }, 4500);
    }

    // Render active cluster status below radar — shows label + remaining bogeys as dots
    function _updateClusterHUD() {
        let el = document.getElementById('cluster-status');
        if (!el) {
            el = document.createElement('div');
            el.id = 'cluster-status';
            el.style.cssText = 'position:fixed;bottom:155px;right:14px;z-index:200;pointer-events:none;font-family:monospace;font-size:10px;text-align:right;line-height:1.5;';
            document.body.appendChild(el);
        }
        const active = state.clusters.filter(cl => cl.alive > 0);
        if (active.length === 0) { el.innerHTML = ''; return; }
        el.innerHTML = '<div style="color:#556;letter-spacing:1px;margin-bottom:2px;">CLUSTERS</div>' +
            active.map(cl => {
                const alive = '●'.repeat(cl.alive);
                const dead = '<span style="color:#333">' + '○'.repeat(Math.max(0, cl.total - cl.alive)) + '</span>';
                return `<div style="color:#0ff;">${cl.label} <span style="letter-spacing:2px;">${alive}${dead}</span></div>`;
            }).join('');
    }

    // ══════════════════════════════════════════════════════════════
    // CLUSTER-BASED WAVE SPAWNER
    // GDD §9.2 — waves 1-6 explicit, 7+ procedural
    // Each enemy group spawns as a tight cluster 5500-9000 units out.
    // Player is NEVER surrounded at launch — clusters spread around the arena.
    // ══════════════════════════════════════════════════════════════

    function spawnWave() {
        state.clusters = []; // clear previous cluster tracking
        let _nextId = 0;
        const NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
        let _nameIdx = 0;
        const nextLabel = () => ({ id: _nextId++, label: NAMES[_nameIdx++ % NAMES.length] });

        // Helper: compute a cluster center at radial distance r, evenly spread around arena
        const clusterPos = (r, thetaBase, phiOff) => {
            const theta = thetaBase + (Math.random() - 0.5) * 0.5;
            const phi = Math.PI / 2 + (phiOff || 0) + (Math.random() - 0.5) * 0.7;
            return { x: r * Math.sin(phi) * Math.cos(theta), y: r * Math.sin(phi) * Math.sin(theta), z: r * Math.cos(phi) };
        };

        // Shared: spawn support ships and AI wingmen (called for all waves)
        const spawnSupportAndWingmen = () => {
            _despawnSupportShips();
            _spawnTanker();
            _spawnMedic();
            _spawnRescueShuttle();
            _spawnScienceVessel();
            if (state.aiWingmen) {
                const ANPC = window.SFAnpc;
                const rosterKeys = state.wave >= 5
                    ? ['hotshot', 'ice', 'motherhen', 'nightshade']
                    : state.wave >= 3 ? ['hotshot', 'ice', 'motherhen'] : ['hotshot', 'ice'];
                for (let i = 0; i < rosterKeys.length; i++) {
                    const offset = new THREE.Vector3(
                        (i === 0 ? -150 : i === 1 ? 150 : i === 2 ? 0 : -200),
                        (i === 2 ? 80 : i === 3 ? -40 : 0),
                        200 + Math.random() * 100
                    );
                    const spawnPos = state.player.position.clone().add(offset);
                    const w = new Entity('wingman', spawnPos.x, spawnPos.y, spawnPos.z);
                    const profile = deriveCombatProfile('wingman', state.wave);
                    w.hull = profile.hull;
                    w.maxSpeed = profile.maxSpeed;
                    w._manifoldDerivation = profile.trace;
                    const key = rosterKeys[i];
                    if (ANPC) {
                        const npc = ANPC.spawn(key);
                        w.callsign = npc.callsign;
                        w._anpc = npc;
                        w._anpcKey = key;
                        const pers = npc.personality;
                        w.maxSpeed = Math.round(w.maxSpeed * (0.85 + pers.E * 0.3));
                        w.hull = Math.round(w.hull * (0.9 + pers.C * 0.2));
                    } else {
                        w.callsign = ['Alpha-2', 'Alpha-3', 'Alpha-4', 'Alpha-5'][i];
                    }
                    w.quaternion.copy(state.player.quaternion);
                    state.entities.push(w);
                }
            }
        };

        // Helper: spawn alien-baseship as a roaming objective (wave 3+: torpedoes unlock)
        const spawnAlienBaseship = () => {
            const r = 8000 + Math.random() * 3000;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const ab = new Entity('alien-baseship',
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.sin(phi) * Math.sin(theta),
                r * Math.cos(phi));
            const profile = deriveCombatProfile('alien-baseship', state.wave, { speedScale: 1.0 });
            ab.hull = profile.hull;
            ab.maxSpeed = profile.maxSpeed;
            ab._manifoldDerivation = profile.trace;
            ab.radius = dim('entity.alien-baseship.radius');
            state.entities.push(ab);
        };

        // ══════════════════════════════════════════════════════════════
        // MANIFOLD-DRIVEN WAVE COMPOSITION
        // Every wave produces a unique enemy layout using z=xy² manifold math.
        // Wave tier constraints (weapon unlocks) are preserved but composition
        // within each tier is fully randomised — no two waves are alike.
        //
        // x = wave intensity  (0.14 per wave, caps near 1.0)
        // y = chaos seed      (random 0.55–1.0, rolled fresh every wave)
        // z_linear  = x*y     → proportional scaling (cluster count / base size)
        // z_asymm   = x*y²    → escalation factor (harder unit ratios, predator count)
        // ══════════════════════════════════════════════════════════════
        {
            const w = state.wave;
            const _mx = Math.min(1.2, w * 0.14);               // wave intensity
            const _my = 0.55 + Math.random() * 0.45;           // chaos seed — different every wave
            const _mzL = _mx * _my;                             // linear manifold
            const _mzA = _mx * _my * _my;                       // asymmetric manifold (escalation)

            // ── Enemy budget: total enemies this wave ──
            // Wave 1: ~4–6 enemies. Wave 4: ~18–26. Wave 8+: 36+
            // Scaled by adaptive diffScale: struggling pilot gets fewer enemies, dominant pilot gets more.
            const _diffScale = (state._currentMission && state._currentMission.diffScale) || 1.0;
            const budget = Math.round((2 + w * 3.5 + _mzA * w * 5) * _diffScale);

            // ── Cluster count: grows with wave + chaos ──
            // Wave 1: 2. Wave 2–3: 2–3. Wave 4–5: 3–4. Wave 6+: up to 6.
            const rawClusters = 2 + Math.round(_mzL * (w * 0.7));
            const clusterCount = Math.max(2, Math.min(9, rawClusters));

            // ── Enemy type availability per weapon-unlock tier ──
            const canInterceptor = w >= 2;
            const canBomber = w >= 3;

            // Type weights — manifold asymmetric factor biases toward harder types at higher waves.
            // diffScale > 1: more interceptors/bombers; diffScale < 0.7: mostly basic enemies.
            const _ds = (state._currentMission && state._currentMission.diffScale) || 1.0;
            const typeWeights = {
                enemy: 1.0,
                interceptor: canInterceptor ? Math.max(0, (0.25 + _mzL * 0.45) * _ds) : 0,
                bomber: canBomber ? Math.max(0, (0.15 + _mzA * 0.35) * _ds) : 0,
            };
            const tierTypes = Object.keys(typeWeights).filter(t => typeWeights[t] > 0);
            const totalTW = tierTypes.reduce((s, t) => s + typeWeights[t], 0);

            // Distance band: keep early waves closer so fights start quickly.
            // Later waves remain long-range to support multi-cluster engagements.
            const rBase = (w <= 2) ? (2600 + w * 260) : (5500 + w * 180);
            const rSpread = (w <= 2) ? (900 + w * 180) : (1200 + w * 240);

            // Angular base — random each wave so clusters never come from the same direction
            const baseAngle = Math.random() * Math.PI * 2;

            // ── Build cluster list ──
            let remaining = budget;
            for (let c = 0; c < clusterCount; c++) {
                const isLast = c === clusterCount - 1;
                // Per-cluster enemy count: fair share with ±40% random variation
                const fairShare = Math.round(budget / clusterCount * (0.6 + Math.random() * 0.8));
                const count = Math.max(2, Math.min(14, isLast ? remaining : Math.min(remaining - (clusterCount - c - 1), fairShare)));
                remaining = Math.max(0, remaining - count);

                // Pick type by weighted random
                let roll = Math.random() * totalTW;
                let chosenType = 'enemy';
                for (const t of tierTypes) {
                    roll -= typeWeights[t];
                    if (roll <= 0) { chosenType = t; break; }
                }

                // Harder types spawn further out (flanking pressure)
                const rMod = chosenType === 'bomber' ? 1.35 : chosenType === 'interceptor' ? 1.12 : 1.0;
                const r = (rBase + Math.random() * rSpread) * rMod;
                const theta = baseAngle + (Math.PI * 2 / clusterCount) * c + (Math.random() - 0.5) * 0.45;
                const phi = Math.PI / 2 + (Math.random() - 0.5) * 0.75;
                const pos = {
                    x: r * Math.sin(phi) * Math.cos(theta),
                    y: r * Math.sin(phi) * Math.sin(theta),
                    z: r * Math.cos(phi),
                };

                const { id, label } = nextLabel();
                const opts = w === 1 ? { training: true, speedScale: 0.82 } : {};
                _spawnCluster(id, label, pos.x, pos.y, pos.z, chosenType, count, w, opts);
            }

            // ── Solo hunters (roaming, not in clusters) ──
            // Predators: wave 4+, count driven by asymmetric manifold
            if (w >= 4) {
                const predCount = Math.min(3, 1 + Math.floor(_mzA * (w - 3) * 1.8));
                for (let i = 0; i < predCount; i++) {
                    const r = 7500 + Math.random() * 3000;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(Math.random() * 2 - 1);
                    const pred = new Entity('predator', r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
                    const pp = deriveCombatProfile('predator', w);
                    pred.hull = pp.hull; pred.shields = pp.shields; pred.maxSpeed = pp.maxSpeed;
                    pred._manifoldDerivation = pp.trace; pred.radius = dim('entity.predator.radius');
                    pred._turnRate = 0.4; pred._plasmaTimer = 0; pred._plasmaCooldown = dim('enemy.predator.plasmaCooldown');
                    pred._consumeTarget = null; pred._consuming = false; pred._consumeTimer = 0; pred._eggTimer = 8 + Math.random() * 5;
                    state.entities.push(pred);
                }
            }

            // ── Alien capital ships ──
            // Alien baseship (torpedo objective): wave 3+, probability scales with manifold
            if (w >= 3) {
                const baseChance = 0.55 + _mzL * 0.4;    // 55–95% depending on manifold
                if (Math.random() < baseChance) spawnAlienBaseship();
            }

            // Dreadnought boss: wave 6+, escalating frequency
            if (w >= 6 && (w === 6 || (w - 6) % Math.max(2, Math.round(5 - _mzA * 2)) === 0)) {
                const r = 9000 + Math.random() * 3000;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(Math.random() * 2 - 1);
                const dn = new Entity('dreadnought', r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
                const dp = deriveCombatProfile('dreadnought', w - 5);
                dn.hull = dp.hull; dn.shields = dp.shields; dn.maxSpeed = dp.maxSpeed;
                dn._manifoldDerivation = dp.trace; dn.radius = dim('entity.dreadnought.radius');
                dn._turretCooldown = 0; dn._turretInterval = dim('enemy.dreadnought.turretInterval');
                dn._beamCooldown = dim('enemy.dreadnought.beamCooldown'); dn._beamCharging = false;
                state.entities.push(dn);
            }

            // Alien Hive — spawns once at wave 5 (victory objective)
            if (w === 5 && !state.alienBaseSpawned) {
                const baseDir = state.baseship ? state.baseship.position.clone().negate().normalize() : new THREE.Vector3(1, 0, 0);
                const hivePos = baseDir.multiplyScalar(15000);
                const hive = new Entity('alien-base', hivePos.x, hivePos.y + 200, hivePos.z);
                hive.hull = dim('hive.hull'); hive.maxSpeed = 0;
                hive.radius = dim('entity.alien-base.radius');
                hive.velocity.set(0, 0, 0);
                state.entities.push(hive);
                state.alienBaseSpawned = true;
                SFAnnouncer.onHiveDiscovered(hive);
            }

            spawnSupportAndWingmen();
            SFAnnouncer.onWaveStart();
            _clusterStartComm();
        }
    }

    function checkWave() {
        const enemies = state.entities.filter(e => (e.type === 'enemy' || e.type === 'interceptor' || e.type === 'bomber' || e.type === 'dreadnought' || e.type === 'alien-baseship' || e.type === 'predator' || e.type === 'egg' || e.type === 'youngling' || e.type === 'hive-queen') && !e.markedForDeletion);
        if (enemies.length === 0 && state.phase === 'combat') {

            // Training wave clear — special handling
            if (state._trainingMode) {
                _onTrainingWaveClear();
            }

            // Cancel any active support call
            _clearSupport();
            // Capture wave-kill snapshot
            state._waveClearKills = state.kills;
            state._waveClearPlayerKills = state.playerKills;
            state._waveClearAutopilot = true; // flag: show "MISSION COMPLETE" title card
            SFAnnouncer.onWaveClear();
            // GDD §1.6: Victory fanfare (3-4s musical sting)
            if (window.SFAudio) SFAudio.playSound('victory_fanfare');
            // GDD §9.3: Music intensity drops on wave clear, transition to cinematic feel
            if (window.SFMusic) {
                SFMusic.setSection('exploration');
                SFMusic.setIntensity(0.15);
            }
            // Show wave-clear overlay; player clicks "Return to Base" to proceed
            _showWaveClearScreen();
        }
    }

    // ── Wave-clear blue flash overlay ──
    function _showWaveClearScreen() {
        const overlay = document.getElementById('waveclear-overlay');
        if (!overlay) {
            // Fallback: engage autopilot immediately if overlay element missing
            state.phase = 'land-approach';
            state.autopilotActive = true;
            state.autopilotTimer = 0;
            state._returnFlightInit = false;
            return;
        }

        const cs = state.callsign ? state.callsign.toUpperCase() : 'PILOT';
        const kills = state._waveClearKills || state.kills;
        const wave = state.wave;

        overlay.innerHTML = `
            <div class="waveclear-headline">WAVE ${wave} CLEARED</div>
            <div class="waveclear-congrats">CONGRATULATIONS, ${cs}</div>
            <div class="waveclear-kills">${kills} BOGIE${kills !== 1 ? 'S' : ''} DESTROYED THIS SORTIE</div>
            <div class="waveclear-auto-msg" style="margin-top:18px;font-size:12px;letter-spacing:3px;color:#446688">RETURNING TO BASE IN <span id="waveclear-cd">5</span>s</div>
        `;

        // Exit pointer lock
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        overlay.classList.add('active');

        // Pause phase at land-approach (prevents normal game loop from advancing)
        state.phase = 'land-approach';
        state.autopilotActive = false;
        state._returnFlightInit = false;

        const hud = document.getElementById('gameplay-hud');
        if (hud) hud.style.opacity = '0.15';
        const xhair = document.getElementById('crosshair');
        if (xhair) xhair.style.display = 'none';
        const radar = document.getElementById('radar-overlay');
        if (radar) radar.style.opacity = '0';

        // Auto-RTB after 5-second countdown
        let _wcSecs = 5;
        const _wcTick = setInterval(() => {
            if (window._wcPaused) return;
            _wcSecs--;
            const el = document.getElementById('waveclear-cd');
            if (el) el.textContent = _wcSecs;
            if (_wcSecs <= 0) { clearInterval(_wcTick); _doWaveClearRTB(); }
        }, 1000);
    }

    // ── Instant bay return on wave-clear button click ──
    function _doWaveClearRTB() {
        const overlay = document.getElementById('waveclear-overlay');
        if (overlay) overlay.classList.remove('active');

        // Score bonus for returning (same as docking)
        state.score += 500 * state.wave;

        // Restore UI before completeLanding tears it down
        const hud = document.getElementById('gameplay-hud');
        if (hud) hud.style.opacity = '1';
        const radar = document.getElementById('radar-overlay');
        if (radar) radar.style.opacity = '1';

        // Compute performance tier for debrief shop gating
        const _deaths = state._waveDeaths || 0;
        state._performanceTier = _deaths === 0 ? 2 : _deaths === 1 ? 1 : 0;

        // Jump directly to bay debrief (skip 17s autopilot + 28s docking cutscene)
        completeLanding();
    }

    function gameOver(reason, isVictory) {
        state.running = false;
        const deathScreen = document.getElementById('death-screen');
        deathScreen.style.display = 'flex';
        document.getElementById('death-reason').innerText = reason;
        document.getElementById('gameplay-hud').style.display = 'none';
        document.getElementById('radar-overlay').style.display = 'none';

        // ── After-Action Report ──
        const ms = state.missionStats;
        ms.waveReached = state.wave;
        const elapsed = Math.floor((performance.now() - ms.startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        ms.accuracy = ms.shotsFired > 0 ? Math.round((ms.shotsHit / ms.shotsFired) * 100) : 0;

        // Count surviving wingmen
        const wingmenAlive = state.entities.filter(e => e.type === 'wingman' && !e.markedForDeletion).length;
        ms.wingmenSaved = wingmenAlive;

        let aar = document.getElementById('after-action-report');
        if (!aar) {
            aar = document.createElement('div');
            aar.id = 'after-action-report';
            aar.style.cssText = 'margin-top:24px;padding:16px 24px;background:rgba(0,20,40,0.85);border:1px solid rgba(0,255,255,0.2);border-radius:6px;font-family:monospace;font-size:12px;color:#88ccee;max-width:400px;text-align:left;';
            deathScreen.appendChild(aar);
        }
        aar.innerHTML =
            '<div style="font-size:14px;color:#0ff;margin-bottom:10px;letter-spacing:2px;text-transform:uppercase;">'
            + (isVictory ? '★ MISSION COMPLETE ★' : '▸ AFTER-ACTION REPORT') + '</div>'
            + '<table style="width:100%;border-collapse:collapse;">'
            + _aarRow('Waves Survived', ms.waveReached)
            + _aarRow('Total Kills', state.kills)
            + _aarRow('Player Kills', state.playerKills)
            + _aarRow('Score', state.score.toLocaleString())
            + _aarRow('Accuracy', ms.accuracy + '%')
            + _aarRow('Shots Fired', ms.shotsFired)
            + _aarRow('Damage Dealt', Math.round(ms.damageDealt))
            + _aarRow('Damage Taken', Math.round(ms.damageTaken))
            + _aarRow('Wingmen Saved', ms.wingmenSaved + '/' + (ms.wingmenSaved + ms.wingmenLost))
            + _aarRow('Flight Time', minutes + 'm ' + seconds + 's')
            + '</table>';

        // ── Persist career stats ──
        if (window.SFProgression) {
            SFProgression.endMission({
                deaths: 1,
                waveReached: ms.waveReached,
                flightTime: elapsed,
                score: state.score,
            });
            // Show career kill tally on death screen
            const tallyHtml = SFProgression.renderKillTallyHTML();
            const rank = SFProgression.getRank();
            aar.innerHTML += '<div style="margin-top:12px;border-top:1px solid rgba(0,255,255,0.15);padding-top:8px;">'
                + '<div style="color:#ffdd44;font-size:11px;">' + rank.icon + ' ' + rank.name + ' — Career Kills: ' + SFProgression.career().totalKills + '</div>'
                + '<div style="font-size:14px;margin-top:4px;">' + tallyHtml + '</div>'
                + '</div>';
        }

        // Auto-reload after 10 seconds so game always resets without needing a button
        let _goSecs = 10;
        const _goCdEl = document.getElementById('death-countdown');
        if (_goCdEl) _goCdEl.textContent = _goSecs;
        const _goTick = setInterval(() => {
            _goSecs--;
            const el = document.getElementById('death-countdown');
            if (el) el.textContent = _goSecs;
            if (_goSecs <= 0) { clearInterval(_goTick); location.reload(); }
        }, 1000);
    }

    function _aarRow(label, value) {
        return '<tr><td style="padding:2px 0;color:#88aacc;">' + label + '</td>'
            + '<td style="padding:2px 0;color:#0ff;text-align:right;font-weight:bold;">' + value + '</td></tr>';
    }

    // ── Respawn system: button-based fighter-lost overlay ──
    function _showRespawnScreen() {
        const overlay = document.getElementById('respawn-overlay');
        if (!overlay) return;

        // Exit pointer lock so user can click the button
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        const lives = state.livesRemaining;
        const maxLives = state.maxLives;
        const reason = state.respawnReason || 'HULL INTEGRITY FAIL';
        const pips = Array.from({ length: maxLives }, (_, i) =>
            `<span class="lives-pip ${i < lives ? 'active' : 'lost'}">&#9733;</span>`
        ).join('');

        overlay.innerHTML = `
            <div class="respawn-reason-text">${reason}</div>
            <div class="respawn-headline">MISSION FAILED</div>
            <div class="lives-meter-row">${pips}</div>
            <div class="respawn-turns-text">You have <strong>${lives}</strong> turn${lives !== 1 ? 's' : ''} remaining</div>
            <div class="respawn-turns-text" style="font-size:0.85em;color:#446688;margin-top:8px;letter-spacing:2px">RETURNING TO BASE IN <span id="respawn-cd">5</span>s</div>
        `;
        overlay.classList.add('active');

        const hud = document.getElementById('gameplay-hud');
        if (hud) { hud.style.opacity = '0'; hud.style.display = 'none'; }
        const cross = document.getElementById('crosshair');
        if (cross) cross.style.display = 'none';
        const radar = document.getElementById('radar-overlay');
        if (radar) radar.style.opacity = '0';
        const cdEl = document.getElementById('countdown-display');
        if (cdEl) cdEl.style.display = 'none';

        // Auto-launch after 5 seconds countdown
        let _respawnSecs = 5;
        const _respawnTick = setInterval(() => {
            _respawnSecs--;
            const el = document.getElementById('respawn-cd');
            if (el) el.textContent = _respawnSecs;
            if (_respawnSecs <= 0) { clearInterval(_respawnTick); _doRespawnLaunch(); }
        }, 1000);
    }

    function _doRespawnLaunch() {
        const overlay = document.getElementById('respawn-overlay');
        if (overlay) overlay.classList.remove('active');

        state.respawning = false;
        state.respawnTimer = 0;

        // Recreate player
        state.player = new Player();
        state.player.hull = dim('player.hull');
        state.player.shields = dim('player.shields');
        state.entities.push(state.player);
        if (window.SFInput) SFInput.init(state.player);
        if (window.SFProgression) SFProgression.applyUpgradesToPlayer(state.player, () => { });

        // Check if this is the first respawn — trigger rescue frigate mission
        const isFirstRespawn = !state._hasRespawned;
        if (isFirstRespawn) {
            state._hasRespawned = true;
            _initiateRescueMission();
            return; // Rescue mission handles its own launch flow
        }

        // Normal respawn: Reset to main baseship launch bay
        state.phase = 'bay-ready';
        state.launchTimer = 0;
        state._launchAudioPlayed = false;
        state._launchBlastPlayed = false;
        state._paBriefingDone = false;

        if (window.SF3D) { SF3D.setLaunchPhase(true); SF3D.showLaunchBay(); SF3D.showCockpit(true); }
        if (window.SFAudio) {
            SFAudio.stopCockpitHum();
            SFAudio.stopThrustRumble();
            SFAudio.stopStrafeHiss();
            SFAudio.startBayAmbience();
        }

        const hud = document.getElementById('gameplay-hud');
        if (hud) { hud.style.display = 'block'; hud.style.opacity = '1'; }
        const radar = document.getElementById('radar-overlay');
        if (radar) radar.style.opacity = '1';
        const cdEl = document.getElementById('countdown-display');
        if (cdEl) {
            cdEl.style.display = 'block';
            cdEl.style.fontSize = '';
            cdEl.style.color = '';
            cdEl.innerHTML = '<span style="font-size:0.35em;color:#446688">LAUNCH BAY — STANDING BY</span>';
        }
        const launchBtn = document.getElementById('launch-btn');
        if (launchBtn) launchBtn.style.display = 'block';
        const shipPanel = document.getElementById('ship-panel');
        if (shipPanel) shipPanel.style.display = 'none';

        if (window.SFAnnouncer) SFAnnouncer.onRespawnReady();
    }

    // ══════════════════════════════════════════════════════════════
    // RESCUE FRIGATE EMERGENCY MISSION
    // Triggered on first respawn — player launches from medical frigate.
    // Mission: Defend service ships (medic, tanker, station) from enemy
    // mothership's assault fleet. Massive mothership visible in distance.
    // ══════════════════════════════════════════════════════════════
    function _initiateRescueMission() {
        // Position player in rescue frigate bay (compact medical frigate)
        state.phase = 'rescue-ready';
        state.launchTimer = 0;
        state._launchAudioPlayed = false;
        state._launchBlastPlayed = false;
        state._paBriefingDone = false;
        state._rescueMissionActive = true;

        // EMERGENCY WEAPON UNLOCK: Proton Torpedo (Rank 8 Captain unlock)
        state._emergencyWeaponUnlocked = true;
        state.player.torpedoes = 12; // Full torpedo loadout

        // Clear any remaining enemies from previous wave
        for (let i = state.entities.length - 1; i >= 0; i--) {
            const e = state.entities[i];
            if (e.type === 'enemy' || e.type === 'interceptor' || e.type === 'bomber' || e.type === 'laser') {
                state.entities.splice(i, 1);
            }
        }

        // Spawn service ships armada — close together, vulnerable
        _spawnServiceShipsArmada();

        // Spawn extra allied wingmen (more help = more enemies)
        _spawnRescueWingmen();

        // Spawn distant enemy mothership (backdrop, not engageable)
        _spawnDistantMothership();

        // Spawn assault fleet — more enemies than normal due to allied support
        _spawnRescueAssaultFleet();

        // Show rescue frigate bay (compact, hatchback-style medical bay)
        if (window.SF3D) {
            SF3D.setLaunchPhase(true);
            SF3D.showRescueFrigateBay(); // New function to show compact medical bay
            SF3D.showCockpit(true);
        }

        if (window.SFAudio) {
            SFAudio.stopCockpitHum();
            SFAudio.stopThrustRumble();
            SFAudio.stopStrafeHiss();
            SFAudio.startBayAmbience();
        }

        const hud = document.getElementById('gameplay-hud');
        if (hud) { hud.style.display = 'block'; hud.style.opacity = '1'; }
        const radar = document.getElementById('radar-overlay');
        if (radar) radar.style.opacity = '1';
        const cdEl = document.getElementById('countdown-display');
        if (cdEl) {
            cdEl.style.display = 'block';
            cdEl.style.fontSize = '';
            cdEl.style.color = '';
            cdEl.innerHTML = '<span style="font-size:0.35em;color:#ff6644">MEDICAL FRIGATE — EMERGENCY LAUNCH</span>';
        }

        // Show rescue bay interface with weapon unlock + training
        // Release pointer lock so player can click the buttons
        if (document.pointerLockElement) document.exitPointerLock();
        _showRescueBayInterface();

        const shipPanel = document.getElementById('ship-panel');
        if (shipPanel) shipPanel.style.display = 'none';

        // Emergency briefing
        if (window.SFAnnouncer) {
            const cs = state.callsign || 'Pilot';
            setTimeout(() => {
                addComm('Medical Frigate', `${cs}, you're aboard the emergency medical frigate. We've been picked up by a bogie mothership.`, 'warning');
            }, 800);
            setTimeout(() => {
                addComm('Tactical', `Massive bogie contact bearing zero-three-zero. Service ships are at risk. Launch when ready — defend the armada.`, 'warning');
            }, 3500);
        }
    }

    // ══════════════════════════════════════════════════════════════
    // RESCUE BAY INTERFACE
    // Shows weapon unlock, training option, and launch button
    // ══════════════════════════════════════════════════════════════
    function _showRescueBayInterface() {
        let overlay = document.getElementById('rescue-bay-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'rescue-bay-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 500;
                background: linear-gradient(135deg, rgba(10,30,50,0.95), rgba(20,40,60,0.95));
                border: 2px solid #44ffff;
                border-radius: 8px;
                padding: 32px;
                min-width: 480px;
                max-width: 600px;
                box-shadow: 0 0 40px rgba(0,255,255,0.3), inset 0 0 20px rgba(0,255,255,0.1);
                font-family: monospace;
                color: #fff;
                pointer-events: auto;
            `;
            document.body.appendChild(overlay);
        }

        const cs = state.callsign || 'Pilot';
        overlay.innerHTML = `
            <div style="text-align:center;margin-bottom:24px;">
                <div style="font-size:1.8em;color:#ff6644;font-weight:bold;letter-spacing:2px;margin-bottom:8px;">EMERGENCY FRIGATE</div>
                <div style="font-size:0.9em;color:#88aacc;margin-bottom:16px;">Medical Bay • Combat Refit Station</div>
                <div style="border-top:1px solid rgba(68,255,255,0.3);padding-top:16px;margin-top:16px;">
                    <div style="color:#0ff;font-size:1.1em;margin-bottom:8px;">WEAPON UNLOCK</div>
                    <div style="background:rgba(0,255,255,0.1);border:1px solid #0ff;border-radius:4px;padding:16px;margin:12px 0;">
                        <div style="font-size:1.3em;color:#ffaa00;font-weight:bold;margin-bottom:6px;">⚡ PROTON TORPEDO</div>
                        <div style="font-size:0.85em;color:#88aacc;line-height:1.5;">
                            High-yield anti-capital ship weapon. Devastating against large targets.
                            Guided tracking. Limited ammunition (12 rounds).
                        </div>
                        <div style="margin-top:12px;font-size:0.8em;color:#ffaa00;">
                            <strong>Controls:</strong> Press [3] to select &nbsp;·&nbsp; Space to fire
                        </div>
                    </div>
                </div>
            </div>

            <div style="text-align:center;margin-top:24px;">
                <button id="rescue-training-btn" style="
                    background: linear-gradient(135deg, rgba(0,150,200,0.3), rgba(0,100,150,0.3));
                    color: #0ff;
                    border: 2px solid #0ff;
                    border-radius: 6px;
                    padding: 14px 32px;
                    font-size: 1.1em;
                    font-family: monospace;
                    cursor: pointer;
                    margin-right: 16px;
                    transition: all 0.2s;
                    font-weight: bold;
                    letter-spacing: 1px;
                ">WEAPONS TRAINING</button>

                <button id="rescue-launch-btn" style="
                    background: linear-gradient(135deg, rgba(255,100,50,0.5), rgba(200,50,30,0.5));
                    color: #fff;
                    border: 2px solid #ff6644;
                    border-radius: 6px;
                    padding: 14px 32px;
                    font-size: 1.1em;
                    font-family: monospace;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-weight: bold;
                    letter-spacing: 1px;
                ">LAUNCH MISSION ▶</button>
            </div>

            <div style="margin-top:24px;padding-top:20px;border-top:1px solid rgba(68,255,255,0.2);text-align:center;">
                <div style="font-size:0.85em;color:#ff6644;margin-bottom:6px;">⚠ MISSION BRIEFING</div>
                <div style="font-size:0.8em;color:#88aacc;line-height:1.6;text-align:left;">
                    Enemy mothership detected. Service ships under threat.<br>
                    <strong style="color:#ffaa00;">Objective:</strong> Defend Medical Frigate, Fuel Tanker, Supply Station<br>
                    <strong style="color:#ffaa00;">Allied Support:</strong> ${4 + Math.floor(Math.random() * 3)} fighters<br>
                    <strong style="color:#ff6644;">Threat Level:</strong> HIGH — Multiple assault groups inbound
                </div>
            </div>
        `;

        overlay.style.display = 'block';

        // Training button - spawn practice drones
        const trainingBtn = document.getElementById('rescue-training-btn');
        trainingBtn.onmouseenter = () => trainingBtn.style.background = 'linear-gradient(135deg, rgba(0,200,255,0.5), rgba(0,150,200,0.5))';
        trainingBtn.onmouseleave = () => trainingBtn.style.background = 'linear-gradient(135deg, rgba(0,150,200,0.3), rgba(0,100,150,0.3))';
        trainingBtn.onclick = () => {
            _startWeaponsTraining();
        };

        // Launch button - start mission
        const launchBtn = document.getElementById('rescue-launch-btn');
        launchBtn.onmouseenter = () => launchBtn.style.background = 'linear-gradient(135deg, rgba(255,120,70,0.7), rgba(220,70,50,0.7))';
        launchBtn.onmouseleave = () => launchBtn.style.background = 'linear-gradient(135deg, rgba(255,100,50,0.5), rgba(200,50,30,0.5))';
        launchBtn.onclick = () => {
            overlay.style.display = 'none';
            addComm('Deck Officer', `${cs}, all systems green. Proton torpedoes loaded. Launching.`, 'info');
            setTimeout(() => {
                if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();
                _beginLaunchSequence();
            }, 800);
        };
    }

    function _startWeaponsTraining() {
        // Close overlay
        const overlay = document.getElementById('rescue-bay-overlay');
        if (overlay) overlay.style.display = 'none';

        // Spawn training drones in front of player
        const cs = state.callsign || 'Pilot';
        addComm('Training Officer', `${cs}, initiating weapons training. Three target drones deployed. Test your Proton Torpedoes.`, 'info');

        // Spawn 3 stationary target drones
        for (let i = 0; i < 3; i++) {
            const angle = (Math.PI / 4) * (i - 1); // Spread in front
            const r = 1500 + i * 400;
            const drone = new Entity('enemy',
                state.player.position.x + Math.sin(angle) * r,
                state.player.position.y + (i - 1) * 200,
                state.player.position.z - Math.cos(angle) * r
            );
            drone.hull = 200; // Easier to destroy
            drone.shields = 100;
            drone.maxSpeed = 0; // Stationary
            drone.velocity.set(0, 0, 0);
            drone._isTrainingDrone = true;
            drone._noAI = true; // Don't move or shoot
            state.entities.push(drone);
        }

        state._trainingActive = true;
        state._trainingDronesDestroyed = 0;

        // Show instructions
        const cdEl = document.getElementById('countdown-display');
        if (cdEl) {
            cdEl.style.display = 'block';
            cdEl.innerHTML = '<span style="font-size:0.4em;color:#ffaa00">WEAPONS TRAINING<br>Press [3] for Torpedoes • Space to Fire</span>';
        }

        // Return to bay interface after training
        setTimeout(() => {
            addComm('Training Officer', 'Training complete. Return to bay when ready.', 'info');
        }, 2000);
    }

    function _spawnServiceShipsArmada() {
        // Spawn three service ships in tight formation — medic, tanker, station
        const baseX = -2500;
        const baseY = 150;
        const baseZ = -3000;
        const spacing = 600;

        // Medical frigate (player launches from this one)
        const medic = new Entity('medic', baseX - spacing, baseY, baseZ);
        medic.hull = dim('medic.hull') || 800;
        medic.shields = dim('medic.shields') || 400;
        medic.radius = 400;
        medic._isServiceShip = true;
        medic._protected = true; // Mission objective
        state.entities.push(medic);

        // Fuel tanker
        const tanker = new Entity('tanker', baseX, baseY - 100, baseZ + spacing);
        tanker.hull = dim('tanker.hull') || 600;
        tanker.shields = dim('tanker.shields') || 300;
        tanker.radius = 350;
        tanker._isServiceShip = true;
        tanker._protected = true;
        state.entities.push(tanker);

        // Supply station
        const station = new Entity('station', baseX + spacing, baseY + 80, baseZ);
        station.hull = dim('station.hull') || 1200;
        station.shields = dim('station.shields') || 600;
        station.radius = 500;
        station._isServiceShip = true;
        station._protected = true;
        state.entities.push(station);

        // Track service ships for mission success/failure
        state._serviceShipsAlive = 3;
    }

    function _spawnRescueWingmen() {
        // Spawn 4-6 allied fighters (more than normal wave)
        const ANPC = window.SFAnpc;
        const rosterKeys = ['hotshot', 'ice', 'motherhen', 'nightshade', 'viper', 'ghost'];
        const count = 4 + Math.floor(Math.random() * 3); // 4-6 allies

        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i;
            const r = 300 + Math.random() * 150;
            const offset = new THREE.Vector3(
                Math.cos(angle) * r,
                (Math.random() - 0.5) * 100,
                Math.sin(angle) * r + 400
            );
            const spawnPos = state.player.position.clone().add(offset);
            const w = new Entity('wingman', spawnPos.x, spawnPos.y, spawnPos.z);
            const profile = deriveCombatProfile('wingman', state.wave);
            w.hull = profile.hull * 1.2; // Tougher for rescue mission
            w.maxSpeed = profile.maxSpeed;
            w._manifoldDerivation = profile.trace;
            const key = rosterKeys[i % rosterKeys.length];
            if (ANPC) {
                const npc = ANPC.spawn(key);
                w.callsign = npc.callsign;
                w._anpc = npc;
                w._anpcKey = key;
            } else {
                w.callsign = `Alpha-${i + 2}`;
            }
            w.quaternion.copy(state.player.quaternion);
            w._rescueDefender = true;
            state.entities.push(w);
        }
    }

    function _spawnDistantMothership() {
        // Massive enemy mothership — visible backdrop, not engageable
        const r = 45000; // Very far — visible but unreachable
        const theta = Math.PI / 6; // Bearing ~30°
        const phi = Math.PI / 2.2;
        const mothership = new Entity('alien-baseship',
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.sin(phi) * Math.sin(theta),
            r * Math.cos(phi));
        mothership.hull = 999999; // Invulnerable
        mothership.shields = 999999;
        mothership.radius = 5000; // Massive
        mothership.maxSpeed = 5; // Nearly stationary
        mothership._isDistantThreat = true;
        mothership._protected = true; // Don't delete
        state.entities.push(mothership);
        state._distantMothership = mothership;
    }

    function _spawnRescueAssaultFleet() {
        // Spawn more enemies than normal (compensate for extra allies)
        // 3-4 clusters, mixed types, closing on service ships
        state.clusters = [];
        const NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
        const clusterCount = 3 + Math.floor(Math.random() * 2);
        const enemiesPerCluster = 5 + Math.floor(Math.random() * 3); // 5-7 per cluster

        for (let c = 0; c < clusterCount; c++) {
            const clusterId = c;
            const clusterLabel = NAMES[c % NAMES.length];
            const baseAngle = (Math.PI * 2 / clusterCount) * c + Math.random() * 0.8;
            const r = 6000 + Math.random() * 2000;
            const phi = Math.PI / 2 + (Math.random() - 0.5) * 0.6;
            const cx = r * Math.sin(phi) * Math.cos(baseAngle);
            const cy = r * Math.sin(phi) * Math.sin(baseAngle);
            const cz = r * Math.cos(phi);

            // Mix of enemy types
            const types = ['enemy', 'enemy', 'interceptor', 'interceptor', 'bomber'];
            for (let i = 0; i < enemiesPerCluster; i++) {
                const enemyType = types[Math.floor(Math.random() * types.length)];
                const spread = 400;
                const ax = cx + (Math.random() - 0.5) * spread * 2;
                const ay = cy + (Math.random() - 0.5) * spread * 0.6;
                const az = cz + (Math.random() - 0.5) * spread * 2;
                const e = new Entity(enemyType, ax, ay, az);
                const profile = deriveCombatProfile(enemyType, state.wave, {});
                e.hull = profile.hull * 1.3; // Tougher for rescue mission
                e.maxSpeed = profile.maxSpeed;
                e.shields = profile.shields || 0;
                e._manifoldDerivation = profile.trace;
                e._clusterId = clusterId;
                e._fireCooldownBase = 1.2;
                e._useSpread = Math.random() > 0.4;
                if (enemyType === 'interceptor') e.radius = dim('entity.interceptor.radius');
                else if (enemyType === 'bomber') {
                    e.radius = dim('entity.bomber.radius');
                    e._bombCooldown = 0;
                    e._bombInterval = dim('enemy.bomber.bombInterval');
                }
                // Prioritize service ships as targets
                e._priorityTarget = 'service-ship';
                state.entities.push(e);
            }
            state.clusters.push({ id: clusterId, label: clusterLabel, center: { x: cx, y: cy, z: cz }, total: enemiesPerCluster, alive: enemiesPerCluster });
        }

        // Initial cluster announcement
        setTimeout(() => {
            const total = state.clusters.reduce((s, cl) => s + cl.total, 0);
            addComm('Tactical', `${state.clusters.length} assault groups inbound. ${total} bogies. Protect the service ships at all costs.`, 'warning');
            _updateClusterHUD();
        }, 5000);
    }

    function _updateRescueMission(dt) {
        if (!state._rescueMissionActive) return;

        // Check if service ships are destroyed
        const servicesAlive = state.entities.filter(e => e._isServiceShip && !e.markedForDeletion).length;
        if (servicesAlive < state._serviceShipsAlive) {
            state._serviceShipsAlive = servicesAlive;
            if (servicesAlive === 0) {
                // Mission failed — all service ships lost
                addComm('Command', 'All service ships lost. Emergency evacuation failed. RTB immediately.', 'danger');
                state._rescueMissionActive = false;
                // Despawn distant mothership
                if (state._distantMothership) state._distantMothership.markedForDeletion = true;
            } else {
                addComm('Tactical', `Service ship destroyed! ${servicesAlive} remaining. Keep them alive!`, 'danger');
            }
        }

        // Check if all enemies cleared
        const hostiles = state.entities.filter(e => (e.type === 'enemy' || e.type === 'interceptor' || e.type === 'bomber') && !e.markedForDeletion).length;
        if (hostiles === 0 && state._serviceShipsAlive > 0) {
            // Mission success
            addComm('Command', `Assault fleet destroyed. Service ships secured. Well done. Distant mothership retreating.`, 'success');
            state._rescueMissionActive = false;
            // Despawn distant mothership (it "retreats")
            if (state._distantMothership) {
                setTimeout(() => {
                    if (state._distantMothership) state._distantMothership.markedForDeletion = true;
                }, 3000);
            }
            // Return to normal wave progression after 8 seconds
            setTimeout(() => {
                addComm('Command', 'Rejoin the main battle group. Proceeding to next objective.', 'info');
                // Trigger next wave
                state.phase = 'land-approach';
                state.autopilotActive = true;
                state.autopilotTimer = 0;
                state._returnFlightInit = false;
            }, 8000);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // WRECKAGE SPAWNING & ALIEN TECH LOOTING SYSTEM (Wave 3+)
    // ══════════════════════════════════════════════════════════════════════════

    function _spawnWreckage(pos, sourceType, isBoss) {
        const w = new Entity(pos, 'wreckage');
        w.radius = sourceType === 'dreadnought' || sourceType === 'alien-baseship' ? 50 : 25;
        w.hull = 1; // Indestructible
        w.maxHull = 1;
        w.shields = 0;
        w.maxShields = 0;
        w.speed = 0;
        w.maxSpeed = 0;
        w._sourceType = sourceType;
        w._isBoss = isBoss;
        w._lifetime = 120; // 2 minutes before despawn
        w._hasLoot = Math.random() < (isBoss ? 0.7 : 0.25); // Bosses: 70%, normal: 25%
        w._looted = false;

        // Random drift velocity
        w.velocity.x = (Math.random() - 0.5) * 10;
        w.velocity.y = (Math.random() - 0.5) * 10;
        w.velocity.z = (Math.random() - 0.5) * 10;

        state.entities.push(w);
        if (M) M.add(w);
        if (window.SF3D && SF3D.spawnWreckage) SF3D.spawnWreckage(w);

        // Add to wreckage pool for tracking
        if (!state._wreckagePool) state._wreckagePool = [];
        state._wreckagePool.push(w);
    }

    function _updateWreckage(dt) {
        if (!state._wreckagePool || state.phase !== 'combat') return;

        state._wreckagePool = state._wreckagePool.filter(w => {
            if (w.markedForDeletion) return false;

            // Decay lifetime
            w._lifetime -= dt;
            if (w._lifetime <= 0) {
                w.markedForDeletion = true;
                if (M) M.remove(w.id);
                if (window.SF3D && SF3D.removeWreckage) SF3D.removeWreckage(w);
                return false;
            }

            // Looting check: player straifs close to wreckage
            const p = state.player;
            if (!p || p.markedForDeletion || w._looted) return true;

            const dx = p.position.x - w.position.x;
            const dy = p.position.y - w.position.y;
            const dz = p.position.z - w.position.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            const lootRangeSq = (w.radius + 80) * (w.radius + 80); // Close pass required

            if (distSq < lootRangeSq && !w._looted) {
                w._looted = true;
                _attemptLoot(w);
            }

            return true;
        });
    }

    function _attemptLoot(wreckage) {
        if (!wreckage._hasLoot) {
            // No loot
            if (window.SFAnnouncer) {
                SFAnnouncer.onCustom('Wreckage scanned. No salvage detected.', '#888888');
            }
            if (window.SFAudio) SFAudio.playSound('scan'); // TODO: add scan sound
            return;
        }

        // Roll for alien tech from pool
        const lootPool = ALIEN_TECH.filter(tech => {
            // Filter by rarity
            return Math.random() < tech.rarity;
        });

        if (lootPool.length === 0) {
            if (window.SFAnnouncer) {
                SFAnnouncer.onCustom('Salvage corrupted. No usable technology.', '#aa6600');
            }
            return;
        }

        // Pick random tech from filtered pool
        const tech = lootPool[Math.floor(Math.random() * lootPool.length)];
        _applyAlienTech(tech);

        // Visual & audio feedback
        if (window.SF3D && SF3D.spawnLootEffect) SF3D.spawnLootEffect(wreckage.position);
        if (window.SFAudio) SFAudio.playSound('powerup'); // TODO: add loot sound
        if (window.SFAnnouncer) {
            SFAnnouncer.onCustom(`ALIEN TECH ACQUIRED: ${tech.name}`, '#00ffcc');
        }

        // Add to player inventory
        if (!state._alienTechInventory) state._alienTechInventory = [];
        state._alienTechInventory.push(tech);

        // Update HUD notification
        _showAlienTechNotification(tech);
    }

    function _applyAlienTech(tech) {
        const p = state.player;
        if (!p) return;

        switch (tech.effect) {
            case 'shields':
                p.shields = Math.min(p.maxShields, p.shields + tech.bonus);
                p.maxShields += tech.bonus;
                break;
            case 'hull':
                p.hull = Math.min(p.maxHull, p.hull + tech.bonus);
                p.maxHull += tech.bonus;
                break;
            case 'damage':
                if (!state._damageMultiplier) state._damageMultiplier = 1.0;
                state._damageMultiplier *= tech.bonus;
                break;
            case 'speed':
                p.maxSpeed *= tech.bonus;
                break;
            case 'accuracy':
                if (!state._accuracyBonus) state._accuracyBonus = 1.0;
                state._accuracyBonus *= tech.bonus;
                break;
            case 'ammo':
                p.torpedoes += tech.bonus;
                break;
            case 'evasion':
                if (!state._evasionBonus) state._evasionBonus = 1.0;
                state._evasionBonus *= tech.bonus;
                break;
            case 'sensors':
                if (!state._sensorRange) state._sensorRange = 1.0;
                state._sensorRange *= tech.bonus;
                break;
            case 'special':
                // Manifold Fragment: exotic effect (TBD - could unlock special abilities)
                if (window.SFAnnouncer) {
                    SFAnnouncer.onCustom('Manifold Fragment resonating... analyzing...', '#ff00ff');
                }
                break;
        }
    }

    function _showAlienTechNotification(tech) {
        // Create HUD notification overlay
        const notif = document.createElement('div');
        notif.id = 'alien-tech-notif';
        notif.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, rgba(0,255,204,0.2), rgba(0,100,150,0.3));
            border: 2px solid #00ffcc;
            border-radius: 8px;
            padding: 20px 30px;
            font-family: 'Orbitron', monospace;
            font-size: 18px;
            color: #00ffcc;
            text-align: center;
            text-shadow: 0 0 10px rgba(0,255,204,0.8);
            box-shadow: 0 0 30px rgba(0,255,204,0.5);
            z-index: 10000;
            pointer-events: none;
            animation: techPopIn 0.3s ease-out;
        `;

        const effectDesc = {
            shields: `+${tech.bonus} Max Shields`,
            hull: `+${tech.bonus} Max Hull`,
            damage: `+${Math.round((tech.bonus - 1) * 100)}% Weapon Damage`,
            speed: `+${Math.round((tech.bonus - 1) * 100)}% Max Speed`,
            accuracy: `+${Math.round((tech.bonus - 1) * 100)}% Accuracy`,
            ammo: `+${tech.bonus} Torpedoes`,
            evasion: `+${Math.round((tech.bonus - 1) * 100)}% Evasion`,
            sensors: `+${Math.round((tech.bonus - 1) * 100)}% Sensor Range`,
            special: 'Unknown Manifold Effect',
        };

        notif.innerHTML = `
            <div style=\"font-size: 14px; opacity: 0.8; margin-bottom: 8px;\">⚡ ALIEN TECHNOLOGY ACQUIRED ⚡</div>
            <div style=\"font-size: 22px; font-weight: bold; margin-bottom: 5px;\">${tech.name}</div>
            <div style=\"font-size: 16px; color: #88ffcc;\">${effectDesc[tech.effect]}</div>
        `;

        document.body.appendChild(notif);

        // Auto-remove after 4 seconds
        setTimeout(() => {
            if (notif.parentNode) notif.parentNode.removeChild(notif);
        }, 4000);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // END WRECKAGE SYSTEM
    // ══════════════════════════════════════════════════════════════════════════

    function _updateRespawn(dt) {
        if (!state.respawning) return false;
        // Button-based: just keep scene rendering, overlay waits for click
        return true; // signal: still in respawn phase, skip normal game logic
    }

    function gameLoop(time) {
        if (!state.running) return;
        requestAnimationFrame(gameLoop);

        const dt = (time - state.lastTime) / 1000;
        state.lastTime = time;

        // Cap dt to prevent physics explosions on lag
        const safeDt = Math.min(dt, 0.1);

        try {

            // ── Pause gate: freeze simulation updates, keep current frame rendered ──
            if (state.paused) {
                if (window.SF3D) SF3D.render(state);
                _frameCount++;
                return;
            }

            // ── Respawn phase — countdown, render scene, skip combat ──
            if (state.respawning) {
                _updateRespawn(safeDt);
                if (window.SF3D) SF3D.render(state);
                _frameCount++;
                return;
            }

            // ── Bay Ready Phase — player is in bay, waiting to push red LAUNCH button ──
            if (state.phase === 'bay-ready' || state.phase === 'rescue-ready') {
                // Handle ESC during training mode - return to rescue bay interface
                if (state.phase === 'rescue-ready' && state._trainingActive && window.SFInput && SFInput.isKeyDown('Escape')) {
                    state._trainingActive = false;
                    // Clear training drones
                    for (let i = state.entities.length - 1; i >= 0; i--) {
                        if (state.entities[i]._isTrainingDrone) {
                            state.entities.splice(i, 1);
                        }
                    }
                    // Show rescue bay interface again
                    _showRescueBayInterface();
                    addComm('Deck Officer', 'Training terminated. Returning to bay.', 'info');
                }

                // Just render the bay scene, no launch timer advancement
                if (window.SF3D) SF3D.render(state);
                _frameCount++;
                return;
            }

            // ── Launch Cutscene Phase — GDD §3: Four-phase launch ──
            if (state.phase === 'launching') {
                state.launchTimer += safeDt;
                const progress = Math.min(state.launchTimer / state.launchDuration, 1.0);

                // Initialize cutscene camera on first frame (separate from player entity)
                if (!state.cutsceneCamPos) {
                    state.cutsceneCamPos = new THREE.Vector3(0, -32, 50); // hangar bay start
                    state.cutsceneCamQuat = new THREE.Quaternion(); // facing -Z
                    state.cutsceneVelocity = new THREE.Vector3();
                }

                const cdEl = document.getElementById('countdown-display');

                // ── Phase 1: Dock (0-64% = ~16s) — static, dim, PA narration plays, briefing panel open ──
                if (progress < 0.64) {
                    cdEl.style.display = 'block';
                    cdEl.innerHTML = '<span style="font-size:0.35em;color:#446688">SYSTEMS INITIALIZING</span>';
                }
                // ── Phase 2: Pre-Launch Countdown (64-80% = ~4s) — amber lights, turbine, countdown ──
                else if (progress < 0.80) {
                    const preProgress = (progress - 0.64) / 0.16;
                    const secondsLeft = Math.ceil(4 * (1 - preProgress));
                    cdEl.style.display = 'block';
                    cdEl.innerText = secondsLeft;
                    cdEl.style.fontSize = '5em';
                    cdEl.style.color = '#ffff00';

                    // GDD §3.2: Rising turbine whine + HUD power-up sequence
                    if (!state._launchAudioPlayed && window.SFAudio) {
                        SFAudio.playSound('turbine_whine');
                        SFAudio.playSound('hud_power_up');
                        state._launchAudioPlayed = true;
                    }

                    // Launch call — text comm only, no bot TTS
                    if (!state._paBriefingDone && preProgress > 0.85) {
                        addComm(_crew('deck'), `Launch! Launch! Launch!`, 'warning');
                        state._paBriefingDone = true;
                    }
                }
                // ── Phase 3: Launch (80-92% = ~3s) — tube walls streak, G-force ──
                else if (progress < 0.92) {
                    cdEl.style.display = 'none';
                    document.getElementById('launch-prompt').style.display = 'none';
                    document.getElementById('launch-overlay').style.display = 'none';

                    // GDD §3.3: Launch sound at acceleration start
                    if (!state._launchBlastPlayed) {
                        state._launchBlastPlayed = true;
                        if (window.SFAudio) {
                            SFAudio.playSound('launch');
                            SFAudio.playSound('clamp_release');
                        }
                    }

                    const accelProgress = (progress - 0.80) / 0.12;
                    const launchSpeed = accelProgress * accelProgress * 2400;
                    _v1.set(0, 0, -1).applyQuaternion(state.cutsceneCamQuat);
                    state.cutsceneCamPos.addScaledVector(_v1, launchSpeed * safeDt);
                    state.cutsceneVelocity.copy(_v1).multiplyScalar(launchSpeed);
                }
                // ── Phase 4: Bay Exit (92-100% = ~2s) — burst into space ──
                else {
                    cdEl.style.display = 'block';
                    cdEl.innerHTML = '<span style="color:#00ffff;font-size:0.6em">CLEAR OF BAY</span>';
                    cdEl.style.fontSize = '3em';

                    const exitProgress = (progress - 0.92) / 0.08;
                    const exitSpeed = 2400 * (1.0 - exitProgress * 0.5);
                    _v1.set(0, 0, -1).applyQuaternion(state.cutsceneCamQuat);
                    state.cutsceneCamPos.addScaledVector(_v1, exitSpeed * safeDt);
                    state.cutsceneVelocity.copy(_v1).multiplyScalar(exitSpeed);
                }

                // Feed cutscene camera position to player for rendering only
                state.player.position.copy(state.cutsceneCamPos);
                state.player.quaternion.copy(state.cutsceneCamQuat);
                state.player.velocity.copy(state.cutsceneVelocity);

                // Update cinematic launch effects
                if (window.SF3D) {
                    SF3D.updateLaunchCinematic(progress);
                    SF3D.render(state);
                }

                // Cutscene complete -> hand off to combat
                if (state.launchTimer >= state.launchDuration) {
                    // Hide skip button
                    const skipBtn = document.getElementById('skip-launch-btn');
                    if (skipBtn) skipBtn.style.display = 'none';
                    completeLaunch();
                }

                // No entity updates, no collisions, no physics - pure cutscene
                return;
            }

            // ── BFXG-009 §1.6 Phase 5: Mission Complete — Autopilot Return Flight ──
            // 17-second cinematic return. Controls disabled. Player can look around (camera rotation).
            // Autopilot always active — no manual option. AUTOPILOT indicator amber centre-screen.
            if (state.phase === 'land-approach') {
                // ── SPACE key — engage autopilot on manual-dock approach ──
                if (!state.autopilotActive && window.SFInput && SFInput.isKeyDown('Space')) {
                    _engageAutopilotRTB();
                }

                // ── If autopilot not yet engaged, let player fly manually ──
                if (!state.autopilotActive) {
                    // Player controls active — just update the countdown hint
                    const cdEl = document.getElementById('countdown-display');
                    if (cdEl && cdEl.style.display !== 'none') {
                        // Keep the docking hint visible; nothing else to do this frame
                    }
                    // Skip the cinematic autopilot block below
                } else {

                    // ── First-frame init ──
                    if (!state._returnFlightInit) {
                        state._returnFlightInit = true;
                        state.autopilotTimer = 0;

                        // Hide live combat overlays
                        const hud = document.getElementById('gameplay-hud');
                        const rad = document.getElementById('radar-overlay');
                        const xhair = document.getElementById('crosshair');
                        if (hud) hud.style.opacity = '0.15';  // dim but visible
                        if (rad) rad.style.opacity = '0';
                        if (xhair) xhair.style.display = 'none';

                        // Only show "MISSION COMPLETE" title card on wave-clear (not manual mid-wave dock)
                        if (state._waveClearAutopilot) {
                            const dco = document.getElementById('dock-cutscene-overlay');
                            if (dco) {
                                const titleEl = document.getElementById('dock-wave-title');
                                if (titleEl) titleEl.textContent = 'WAVE ' + state.wave + ' CLEARED — RETURNING TO BASE';
                                dco.style.display = 'block';
                                requestAnimationFrame(() => dco.classList.add('active'));
                            }
                            addComm(_crew('command'),
                                'Mission complete! Outstanding work, pilot. Autopilot engaged — returning to base.',
                                'success');
                        } else {
                            addComm(_crew('command'), 'Autopilot engaged. Returning to base.', 'base');
                        }

                        // Fade music to cinematic ambient
                        if (window.SFMusic) { SFMusic.setSection('exploration'); SFMusic.setIntensity(0.1); }
                    }

                    const RETURN_DURATION = 17.0;   // BFXG-009 §1.6: 15-20s return flight
                    state.autopilotTimer += safeDt;
                    const apProgress = Math.min(state.autopilotTimer / RETURN_DURATION, 1.0);

                    // ── AUTOPILOT amber indicator (center screen) ──
                    const cdEl = document.getElementById('countdown-display');
                    if (cdEl) {
                        cdEl.style.display = 'block';
                        cdEl.style.fontSize = '1.8em';
                        cdEl.style.color = '#FFAA00';
                        cdEl.innerHTML = 'AUTOPILOT<br><span style="font-size:0.38em;color:#88ccff">'
                            + 'RETURNING TO BASE — ' + Math.ceil(RETURN_DURATION * (1 - apProgress)) + 's</span>';
                    }

                    // ── Ship flight: bank toward baseship ──
                    const bayApproach = _v1.copy(state.baseship.position).add(_v2.set(0, 0, 450));
                    const toBase = _v2.copy(bayApproach).sub(state.player.position);
                    const distToBase = toBase.length();

                    // Speed profile per BFXG-009: accelerate → cruise → decelerate
                    let apSpeed;
                    if (apProgress < 0.18) {
                        apSpeed = (apProgress / 0.18) * 320;
                    } else if (apProgress < 0.72) {
                        apSpeed = 320;
                    } else {
                        apSpeed = Math.max(35, 320 * (1.0 - (apProgress - 0.72) / 0.28));
                    }

                    if (distToBase > 5) {
                        _q1.setFromUnitVectors(
                            _v1.set(0, 0, -1),
                            _v2.copy(toBase).normalize()
                        );
                        state.player.quaternion.slerp(_q1, safeDt * 1.8);
                    }
                    _v1.set(0, 0, -1).applyQuaternion(state.player.quaternion);
                    state.player.velocity.copy(_v1.multiplyScalar(apSpeed));

                    // ── Cinematic camera — BFXG-009 §1.6 line 44: player can look around ──
                    // We give a slow drifting "cinematic sweep" so the space environment
                    // fills the view — debris from battle, allied ships, Earth below.
                    const WORLD_UP = new THREE.Vector3(0, 1, 0);
                    const shipFwd = _v1.set(0, 0, -1).applyQuaternion(state.player.quaternion);
                    const _mat4 = new THREE.Matrix4();

                    if (!state.cutsceneCamPos) {
                        state.cutsceneCamPos = state.player.position.clone();
                        state.cutsceneCamQuat = state.player.quaternion.clone();
                        state.cutsceneVelocity = new THREE.Vector3();
                    }

                    if (apProgress < 0.35) {
                        // A — Behind and above: classic "hero flying home" chase shot
                        const camPos = state.player.position.clone()
                            .addScaledVector(shipFwd, -180)
                            .addScaledVector(WORLD_UP, 55);
                        state.cutsceneCamPos.lerp(camPos, 0.06);
                        _mat4.lookAt(state.cutsceneCamPos,
                            state.player.position.clone().addScaledVector(shipFwd, 80),
                            WORLD_UP);
                        state.cutsceneCamQuat.setFromRotationMatrix(_mat4);

                    } else if (apProgress < 0.65) {
                        // B — Slow orbit sweep around the ship: shows Earth, debris, stars
                        const sweepAngle = ((apProgress - 0.35) / 0.30) * Math.PI * 0.6;
                        const orbitR = 200;
                        const camPos = state.player.position.clone()
                            .addScaledVector(new THREE.Vector3(Math.sin(sweepAngle), 0, -Math.cos(sweepAngle)), orbitR)
                            .addScaledVector(WORLD_UP, 30);
                        state.cutsceneCamPos.lerp(camPos, 0.04);
                        _mat4.lookAt(state.cutsceneCamPos, state.player.position, WORLD_UP);
                        state.cutsceneCamQuat.setFromRotationMatrix(_mat4);

                    } else {
                        // C — Low-front wide: carrier visible ahead, ship silhouetted against it
                        const T = (apProgress - 0.65) / 0.35;
                        const camPos = state.player.position.clone()
                            .addScaledVector(shipFwd, -260 + T * 80)
                            .addScaledVector(WORLD_UP, 18 - T * 12);
                        state.cutsceneCamPos.lerp(camPos, 0.05);
                        _mat4.lookAt(state.cutsceneCamPos, state.baseship.position, WORLD_UP);
                        state.cutsceneCamQuat.setFromRotationMatrix(_mat4);
                    }

                    // ── Transition to docking cutscene ──
                    if (distToBase < 450 || apProgress >= 1.0) {
                        // BFXG-009 §1.7: Begin Phase 6 — Docking Cut Scene
                        state.phase = 'landing';
                        state.landingTimer = 0;
                        state._returnFlightInit = false;
                        state.cutsceneCamPos = null;
                        state.cutsceneCamQuat = null;
                        state.cutsceneVelocity = null;
                        state._dockAudioFlags = {}; // reset per-shot audio triggers
                        if (window.SFAudio) SFAudio.playSound('klaxon'); // landing lights on
                        SFAnnouncer.onDock();
                        state.score += 500 * state.wave;

                        const cdHide = document.getElementById('countdown-display');
                        if (cdHide) cdHide.style.display = 'none';
                    }

                    // Pass cinematic cam to renderer
                    if (state.cutsceneCamPos) {
                        // Override with cutscene cam rather than player camera
                        state._cutsceneCamOverride = {
                            pos: state.cutsceneCamPos,
                            quat: state.cutsceneCamQuat,
                        };
                    } else {
                        state._cutsceneCamOverride = null;
                    }

                    // Keep projectile AI ticking (shouldn't be any, but safety)
                    for (let i = 0, len = state.entities.length; i < len; i++) {
                        const e = state.entities[i];
                        if (e.markedForDeletion) continue;
                        e.position.x += e.velocity.x * safeDt;
                        e.position.y += e.velocity.y * safeDt;
                        e.position.z += e.velocity.z * safeDt;
                    }
                    for (let i = state.entities.length - 1; i >= 0; i--) {
                        if (state.entities[i].markedForDeletion) {
                            state.entities[i] = state.entities[state.entities.length - 1];
                            state.entities.pop();
                        }
                    }

                    updateHUD();
                    if (window.SF3D) SF3D.render(state);
                } // end autopilotActive else
                return;
            }

            // ── BFXG-009 §1.7 Phase 6: Docking Cut Scene — 28 seconds, 9 shots ──
            if (state.phase === 'landing') {
                state.landingTimer += safeDt;
                const DOCK_DUR = 28.0;   // BFXG-009: ~28s total cutscene
                const progress = Math.min(state.landingTimer / DOCK_DUR, 1.0);
                const elapsed = state.landingTimer;

                // Ensure audio flags map exists
                if (!state._dockAudioFlags) state._dockAudioFlags = {};

                const WORLD_UP = new THREE.Vector3(0, 1, 0);
                const hangarPos = state.baseship.position.clone().add(new THREE.Vector3(0, -30, 60));

                // ── First frame: show letterbox overlay, hide HUD ──
                if (!state.cutsceneCamPos) {
                    state.cutsceneCamPos = state.player.position.clone();
                    state.cutsceneCamQuat = state.player.quaternion.clone();
                    state.cutsceneVelocity = state.player.velocity.clone();

                    const dco = document.getElementById('dock-cutscene-overlay');
                    if (dco) {
                        const titleEl = document.getElementById('dock-wave-title');
                        if (titleEl) titleEl.textContent = 'WAVE ' + state.wave + ' CLEARED';
                        dco.style.display = 'block';
                        requestAnimationFrame(() => dco.classList.add('active'));
                    }
                    const hud = document.getElementById('gameplay-hud');
                    const rad = document.getElementById('radar-overlay');
                    const xhair = document.getElementById('crosshair');
                    const rtbBtn = document.getElementById('rtb-btn');
                    const cdEl = document.getElementById('countdown-display');
                    if (hud) hud.style.opacity = '0';
                    if (rad) rad.style.opacity = '0';
                    if (xhair) xhair.style.display = 'none';
                    if (rtbBtn) rtbBtn.style.display = 'none';
                    if (cdEl) cdEl.style.display = 'none';

                    // BFXG-009 §1.7 line 65: Music transitions to closing theme
                    if (window.SFMusic) { SFMusic.setSection('closing-theme'); SFMusic.setIntensity(0.08); }

                    // BFXG-009 Shot 1 audio: klaxon as landing lights come on
                    if (window.SFAudio) SFAudio.playSound('klaxon');
                    state._dockAudioFlags.klaxon = true;
                }

                // ── BFXG-009 §1.7: Skippable after Round 1 (SPACE key) ──
                if (state.wave > 1 && window.SFInput && SFInput.isKeyDown('Space')) {
                    // Skip: jump straight to completeLanding
                    completeLanding();
                    return;
                }

                // ── Ship smoothly glides into hangar throughout cutscene ──
                const lerpRate = progress < 0.5 ? 0.025 : 0.055;
                state.player.position.lerp(hangarPos, lerpRate);
                const toHangar = hangarPos.clone().sub(state.player.position);
                if (toHangar.lengthSq() > 400) {
                    _q1.setFromUnitVectors(new THREE.Vector3(0, 0, -1), toHangar.normalize());
                    state.player.quaternion.slerp(_q1, 0.035);
                }

                const shipFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(state.player.quaternion);
                const _mat4 = new THREE.Matrix4();

                // ── 9 Camera Shots ──
                // Shot 1 (0-4s = 0–14.3%): External chase, carrier grows ahead
                if (elapsed < 4.0) {
                    const T = elapsed / 4.0;
                    const camPos = state.player.position.clone()
                        .addScaledVector(shipFwd, -260 + T * 40)
                        .addScaledVector(WORLD_UP, 70 - T * 20);
                    state.cutsceneCamPos.lerp(camPos, 0.08);
                    _mat4.lookAt(state.cutsceneCamPos,
                        state.player.position.clone().addScaledVector(shipFwd, 200),
                        WORLD_UP);
                    state.cutsceneCamQuat.setFromRotationMatrix(_mat4);

                    // Shot 2 (4-7s = 14.3–25%): Chase cam slight angle — landing lights blink
                } else if (elapsed < 7.0) {
                    const T = (elapsed - 4.0) / 3.0;
                    const camPos = state.player.position.clone()
                        .addScaledVector(shipFwd, -200)
                        .addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(state.player.quaternion), 60 * T)
                        .addScaledVector(WORLD_UP, 35);
                    state.cutsceneCamPos.lerp(camPos, 0.06);
                    _mat4.lookAt(state.cutsceneCamPos,
                        state.baseship.position.clone().add(new THREE.Vector3(0, 0, 80)),
                        WORLD_UP);
                    state.cutsceneCamQuat.setFromRotationMatrix(_mat4);

                    // Shot 3 (7-10s = 25–35.7%): Cockpit POV — alignment HUD appears
                } else if (elapsed < 10.0) {
                    if (!state._dockAudioFlags.shot3) {
                        state._dockAudioFlags.shot3 = true;
                        if (window.SFAudio) SFAudio.playSound('hud_power_up'); // alignment HUD on
                    }
                    // Cockpit interior: camera is slightly behind and inside the ship
                    const camPos = state.player.position.clone()
                        .addScaledVector(shipFwd, 2)
                        .addScaledVector(WORLD_UP, 5);
                    state.cutsceneCamPos.lerp(camPos, 0.12);
                    // Looking forward through canopy toward carrier
                    _mat4.lookAt(state.cutsceneCamPos,
                        state.baseship.position.clone().add(new THREE.Vector3(0, -15, 0)),
                        WORLD_UP);
                    state.cutsceneCamQuat.setFromRotationMatrix(_mat4);

                    // Shot 4 (10-13s = 35.7–46.4%): Cockpit POV — bay doors open, green guide lights
                } else if (elapsed < 13.0) {
                    if (!state._dockAudioFlags.bayDoor) {
                        state._dockAudioFlags.bayDoor = true;
                        if (window.SFAudio) SFAudio.playSound('klaxon'); // bay door warning klaxon
                    }
                    const camPos = state.player.position.clone()
                        .addScaledVector(shipFwd, 3)
                        .addScaledVector(WORLD_UP, 4);
                    state.cutsceneCamPos.lerp(camPos, 0.1);
                    _mat4.lookAt(state.cutsceneCamPos,
                        state.baseship.position.clone().add(new THREE.Vector3(0, -10, 30)),
                        WORLD_UP);
                    state.cutsceneCamQuat.setFromRotationMatrix(_mat4);

                    // Shot 5 (13-17s = 46.4–60.7%): External side cam inside bay — crew, equipment
                } else if (elapsed < 17.0) {
                    if (!state._dockAudioFlags.bayAmbience) {
                        state._dockAudioFlags.bayAmbience = true;
                        if (window.SFAudio && SFAudio.startBayAmbience) SFAudio.startBayAmbience();
                    }
                    const T = (elapsed - 13.0) / 4.0;
                    const camPos = state.baseship.position.clone()
                        .add(new THREE.Vector3(150 - T * 30, -20 + T * 10, 40));
                    state.cutsceneCamPos.lerp(camPos, 0.05);
                    _mat4.lookAt(state.cutsceneCamPos,
                        state.player.position.clone().add(new THREE.Vector3(0, -15, 0)),
                        WORLD_UP);
                    state.cutsceneCamQuat.setFromRotationMatrix(_mat4);

                    // Shot 6 (17-20s = 60.7–71.4%): Low angle bay floor — landing gear deploys
                } else if (elapsed < 20.0) {
                    if (!state._dockAudioFlags.landingGear) {
                        state._dockAudioFlags.landingGear = true;
                        if (window.SFAudio) SFAudio.playSound('turbine_whine'); // hydraulic/gear sound
                    }
                    const camPos = state.player.position.clone()
                        .addScaledVector(WORLD_UP, -60)       // below the ship — looking up
                        .addScaledVector(shipFwd, 20);
                    state.cutsceneCamPos.lerp(camPos, 0.07);
                    _mat4.lookAt(state.cutsceneCamPos,
                        state.player.position.clone().addScaledVector(WORLD_UP, 8),
                        shipFwd.clone().negate());  // up is forward (looking up at belly)
                    state.cutsceneCamQuat.setFromRotationMatrix(_mat4);

                    // Shot 7 (20-22s = 71.4–78.6%): Close-up docking clamps — mechanical lock + engines down
                } else if (elapsed < 22.0) {
                    if (!state._dockAudioFlags.clamp) {
                        state._dockAudioFlags.clamp = true;
                        if (window.SFAudio) {
                            SFAudio.playSound('clamp_release'); // reuse: clamp mechanism sound
                            setTimeout(() => SFAudio.playSound('comm_beep'), 600); // lock confirmation beep
                        }
                    }
                    const camPos = state.player.position.clone()
                        .addScaledVector(WORLD_UP, -28)
                        .addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(state.player.quaternion), 25);
                    state.cutsceneCamPos.lerp(camPos, 0.1);
                    _mat4.lookAt(state.cutsceneCamPos, state.player.position, WORLD_UP);
                    state.cutsceneCamQuat.setFromRotationMatrix(_mat4);

                    // Shot 8 (22-24s = 78.6–85.7%): Cockpit interior — ambient bay, engines wind down
                } else if (elapsed < 24.0) {
                    if (!state._dockAudioFlags.engineDown) {
                        state._dockAudioFlags.engineDown = true;
                        if (window.SFAudio) SFAudio.playSound('boost'); // reuse: engine power change
                    }
                    const camPos = state.player.position.clone()
                        .addScaledVector(shipFwd, 4)
                        .addScaledVector(WORLD_UP, 6)
                        .addScaledVector(new THREE.Vector3(-1, 0, 0).applyQuaternion(state.player.quaternion), 2);
                    state.cutsceneCamPos.lerp(camPos, 0.15);
                    _mat4.lookAt(state.cutsceneCamPos,
                        state.player.position.clone().addScaledVector(WORLD_UP, 2),
                        WORLD_UP);
                    state.cutsceneCamQuat.setFromRotationMatrix(_mat4);

                    // Shot 9 (24-28s = 85.7–100%): Side tracking cam — rail moves ship to launch tube
                } else {
                    const T = (elapsed - 24.0) / 4.0;
                    const railStart = state.player.position.clone().add(new THREE.Vector3(-180, 0, 0));
                    const railEnd = state.player.position.clone().add(new THREE.Vector3(180, 0, 0));
                    const camPos = railStart.clone().lerp(railEnd, T)
                        .addScaledVector(WORLD_UP, 55);
                    state.cutsceneCamPos.lerp(camPos, 0.06);
                    _mat4.lookAt(state.cutsceneCamPos, state.player.position, WORLD_UP);
                    state.cutsceneCamQuat.setFromRotationMatrix(_mat4);
                }

                // ── Fade to black: last 14.3% of cutscene (last 4 seconds) ──
                if (progress > 0.857) {
                    const fadeEl = document.getElementById('dock-fade');
                    if (fadeEl) fadeEl.style.opacity = String((progress - 0.857) / 0.143);
                }

                // ── Complete docking sequence ──
                if (progress >= 1.0) {
                    completeLanding();
                    return;
                }

                if (window.SF3D) SF3D.render(state);
                return;
            }

            // ── Docking Phase (post-mission briefing) ──
            if (state.phase === 'docking') {
                if (window.SF3D) SF3D.render(state);
                return;
            }

            // ── Combat Phase (normal gameplay) ──

            // Predator plasma disable check — blocks player input when disabled
            _updateDisabledState(safeDt);

            // Egg hatching + youngling bore/attach logic
            _updateEggs(safeDt);
            _updateYounglings(safeDt);

            // Rescue mission tracking (first-death scenario)
            if (state._rescueMissionActive) {
                _updateRescueMission(safeDt);
            }

            // Wreckage looting system (wave 3+)
            _updateWreckage(safeDt);

            if (window.SFInput && !state._playerDisabled && !_isPlayerInSupportAutopilot()) {
                SFInput.update(safeDt);
                SFInput.updateLivePanel();
            }

            if (state.player && state.player.lockedTarget && state.player.lockedTarget.markedForDeletion) {
                state.player.lockedTarget = null;
            }

            // Autonomous announcer — observe game state and generate chatter
            SFAnnouncer.observe(safeDt);

            // Emergency rescue system — button visibility and autopilot
            if (window.SFRescue) SFRescue.update(safeDt, state);

            // Threat detection & countermeasures — radar tracking and alerts
            if (window.SFThreatSys) SFThreatSys.update(safeDt, state);

            // Wingman cluster guidance — bearing callout every 15-23s during combat
            state._clusterCallTimer -= safeDt;
            if (state._clusterCallTimer <= 0 && state.phase === 'combat') {
                _wingmanClusterComm();
                state._clusterCallTimer = 15 + Math.random() * 8;
            }
            state.commTimer += safeDt;
            if (state.commTimer >= state.commInterval) {
                state.commTimer = 0;
                const chat = SFAnnouncer.generateChatter();
                if (chat) addComm(chat.sender, chat.msg, chat.type);
                state.commInterval = 5 + Math.random() * 8;
            }

            // ── INTENT PHASE: entities declare what they want to do ──
            if (state.player && !state.player.markedForDeletion && !_isPlayerInSupportAutopilot()) {
                state.player.resolveIntent(safeDt);
            }

            // ── Multiplayer state sync (20 Hz) ──
            const MP = window.SFMultiplayer;
            if (MP && MP.isMultiplayer && state.player && !state.player.markedForDeletion) {
                MP.sendPlayerState(state.player);

                // Render remote players as wingman entities
                for (const [pid, rp] of MP.remotePlayers) {
                    let remote = state.entities.find(e => e._remotePlayerId === pid);
                    if (!remote) {
                        remote = new Entity('wingman', rp.x, rp.y, rp.z);
                        remote.callsign = rp.callsign || 'Remote';
                        remote._remotePlayerId = pid;
                        remote._isRemotePlayer = true;
                        state.entities.push(remote);
                    }
                    // Interpolate to latest server position
                    remote.position.set(rp.x, rp.y, rp.z);
                    remote.quaternion.set(rp.qx, rp.qy, rp.qz, rp.qw);
                    remote.velocity.set(rp.vx || 0, rp.vy || 0, rp.vz || 0);
                    remote.hull = rp.hull || 100;
                    remote.shields = rp.shields || 100;
                }

                // Remove stale remote players (disconnected)
                for (let i = state.entities.length - 1; i >= 0; i--) {
                    const e = state.entities[i];
                    if (e._isRemotePlayer && !MP.remotePlayers.has(e._remotePlayerId)) {
                        e.markedForDeletion = true;
                        if (M) M.remove(e.id);
                    }
                }
            }

            // Feed engine audio with current thrust state
            if (window.SFAudio && state.player && !state.player.markedForDeletion) {
                SFAudio.setThrustLevel(
                    state.player.throttle,
                    state.player.afterburnerActive,
                    state.player.boostActive
                );
                // Strafe hiss disabled
            }

            // Auto-targeting: crosshair tracks and locks enemies in range + cone
            updateCrosshairTargeting(safeDt);

            // AI sets intent (velocity) on enemies and torpedoes — for loop, no closure
            // 🍴 Fork-guarded: skip entities whose fork was revoked mid-frame
            const _DPe = M ? M.DiningPhilosophers : null;
            const ents = state.entities;
            for (let i = 0, len = ents.length; i < len; i++) {
                const e = ents[i];
                if (_DPe && !_DPe.acquire(e.id, 'ai')) continue;
                // Skip AI for training drones (stationary targets)
                if (e._noAI || e._isTrainingDrone) continue;
                if (e.type === 'predator') updatePredatorAI(e, safeDt);
                else if (e.type === 'tanker') updateTankerAI(e, safeDt);
                else if (e.type === 'medic') updateMedicAI(e, safeDt);
                else if (e.type === 'rescue') _updateRescueOrbit(safeDt);
                else if (e.type === 'science-ship') _updateScienceOrbit(safeDt);
                else if (AI_PROFILES[e.type]) {
                    updateCombatAI(e, safeDt);
                    if (e.type === 'wingman') _updateANPCState(e, safeDt);
                }
                // Torpedo acceleration: 200→350 m/s over 1.5s (GDD §10.1)
                else if (e.type === 'torpedo') {
                    const age = (performance.now() / 1000) - (e.launchTime || 0);
                    const spd = Math.min(350, 200 + (150 * Math.min(age / 1.5, 1)));
                    if (e.target && !e.target.markedForDeletion) {
                        _v1.copy(e.target.position).sub(e.position).normalize();
                        _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
                        e.quaternion.slerp(_q1, safeDt * 1.5);
                    }
                    _v1.set(0, 0, -1).applyQuaternion(e.quaternion);
                    e.velocity.copy(_v1.multiplyScalar(spd));
                }
            }

            // ── EVOLVE PHASE: the manifold advances all points forward in time ──
            if (M) {
                M.evolve(safeDt);
            }
            // Advance the dimensional clock and clear per-frame lens cache
            if (MD) MD.tick(safeDt);
            if (_DPe) _DPe.releaseAll('ai');

            // Apply velocity → position for all entities (3D physics step)
            // The unified Manifold tracks 2D projections; this is the authoritative 3D update
            for (let i = 0, len = ents.length; i < len; i++) {
                const e = ents[i];
                if (e.markedForDeletion) continue;
                if (_DPe && !_DPe.acquire(e.id, 'physics')) continue;
                e.position.x += e.velocity.x * safeDt;
                e.position.y += e.velocity.y * safeDt;
                e.position.z += e.velocity.z * safeDt;
            }
            if (_DPe) _DPe.releaseAll('physics');

            // ── OBSERVE PHASE: read manifold state for game events ──

            // Age-based expiry for projectiles (replaces setTimeout)
            for (let i = 0, len = ents.length; i < len; i++) {
                const e = ents[i];
                if (_DPe && !_DPe.acquire(e.id, 'expiry')) continue;
                if (e.maxAge > 0) {
                    e.age += safeDt;
                    if (e.age >= e.maxAge) {
                        e.markedForDeletion = true;
                        if (M) M.remove(e.id);
                        continue;
                    }
                }
                // Projectile expiry: TTL (maxAge) + range-based
                if (e.type === 'laser' || e.type === 'machinegun' || e.type === 'torpedo') {
                    // Time-based expiry: lasers 2s, machinegun 1.5s, torpedoes 6s
                    if (!e._spawnTime) e._spawnTime = state.elapsed;
                    const age = state.elapsed - e._spawnTime;
                    const maxAge = e.maxAge || (e.type === 'torpedo' ? 6 : e.type === 'machinegun' ? 1.5 : 2);
                    if (age > maxAge) {
                        e.markedForDeletion = true;
                        if (M) M.remove(e.id);
                    }
                    // Also range-based expiry from player
                    if (!e.markedForDeletion && state.player && !state.player.markedForDeletion) {
                        const dx = e.position.x - state.player.position.x;
                        const dy = e.position.y - state.player.position.y;
                        const dz = e.position.z - state.player.position.z;
                        const rr = dim('radar.range');
                        if (dx * dx + dy * dy + dz * dz > rr * rr) {
                            e.markedForDeletion = true;
                            if (M) M.remove(e.id);
                        }
                    }
                }
            }
            if (_DPe) _DPe.releaseAll('expiry');

            if (window.SF3D && SF3D.updatePickups) SF3D.updatePickups(dt);

            // Observe proximity events (collisions) from the manifold
            // 🍴 Dijkstra-ordered fork acquisition prevents stale-ref crashes
            const _DP = M ? M.DiningPhilosophers : null;
            const collisionPairs = M ? M.detectCollisions() : [];
            for (const [a, b] of collisionPairs) {
                if (!a || !b) continue; // guard null refs from manifold reconstruct
                if (a.markedForDeletion || b.markedForDeletion) continue;
                // Acquire forks for both entities — skip pair if either is revoked
                if (_DP && (!_DP.acquire(a.id, 'collision') || !_DP.acquire(b.id, 'collision'))) continue;

                // Skip player-baseship collision during launch phase
                // (shouldn't reach here since launch has early return, but safety net)
                if (state.phase === 'launching' &&
                    ((a.type === 'player' && b.type === 'baseship') ||
                        (a.type === 'baseship' && b.type === 'player'))) {
                    continue;
                }

                // Skip collisions during landing approach (player is safe in landing corridor)
                const _isHostile = (t) => t === 'enemy' || t === 'interceptor' || t === 'bomber' || t === 'dreadnought' || t === 'alien-baseship' || t === 'predator';
                if (state.phase === 'land-approach' &&
                    ((a.type === 'player' && _isHostile(b.type)) ||
                        (_isHostile(a.type) && b.type === 'player'))) {
                    continue;
                }

                // Skip player collisions during support autopilot (protected while docking)
                if (_isPlayerInSupportAutopilot() &&
                    ((a.type === 'player' && _isHostile(b.type)) ||
                        (_isHostile(a.type) && b.type === 'player'))) {
                    continue;
                }

                // Skip player-baseship collision during landing
                if ((state.phase === 'land-approach' || state.phase === 'landing') &&
                    ((a.type === 'player' && b.type === 'baseship') ||
                        (a.type === 'baseship' && b.type === 'player'))) {
                    continue;
                }

                const isAProj = a.type === 'laser' || a.type === 'machinegun' || a.type === 'torpedo';
                const isBProj = b.type === 'laser' || b.type === 'machinegun' || b.type === 'torpedo';

                if (isAProj && isBProj) continue;
                if ((isAProj && a.owner === b.type) || (isBProj && b.owner === a.type)) continue;

                // Friendly fire prevention — player/wingman projectiles skip friendly targets
                const _isFriendlyType = (t) => t === 'player' || t === 'wingman' || t === 'baseship' || t === 'tanker' || t === 'medic' || t === 'station' || t === 'rescue' || t === 'science-ship';
                const _isFriendlyOwner = (o) => o === 'player' || o === 'wingman';
                if (isAProj && _isFriendlyOwner(a.owner) && _isFriendlyType(b.type)) continue;
                if (isBProj && _isFriendlyOwner(b.owner) && _isFriendlyType(a.type)) continue;
                // Enemy projectiles skip other enemies
                if (isAProj && a.owner === 'enemy' && _isHostile(b.type)) continue;
                if (isBProj && b.owner === 'enemy' && _isHostile(a.type)) continue;

                // Presence-based narrow phase via the dimensional framework.
                // intersectsEntities resolves both entities in stack-only locals,
                // allocating zero objects per pair — projectiles manifest as
                // swept segments, everything else as spheres, segment/sphere
                // tests answered uniformly so 1600 m/s lasers don't tunnel.
                // Inline fallback covers builds without MD.
                let _hit;
                if (MD) {
                    _hit = MD.intersectsEntities(a, b, safeDt);
                } else {
                    const _cx = a.position.x - b.position.x;
                    const _cy = a.position.y - b.position.y;
                    const _cz = (a.position.z || 0) - (b.position.z || 0);
                    const rSum = a.radius + b.radius;
                    _hit = (_cx * _cx + _cy * _cy + _cz * _cz) < rSum * rSum;
                }
                if (_hit) {
                    if (a.type === 'pickup' || b.type === 'pickup') {
                        const pick = a.type === 'pickup' ? a : b;
                        const other = a.type === 'pickup' ? b : a;
                        if (!pick._collected && other.type === 'player') {
                            pick._collected = true;
                            pick.markedForDeletion = true;
                            if (window.SF3D && SF3D.removePickup) SF3D.removePickup(pick.id);
                            // Apply immediately — powerups are good for this sortie only
                            pick._pickupDef.apply(state.player);
                            const cs = state.callsign ? state.callsign.toUpperCase() : 'PILOT';
                            addComm('LOADMASTER', `${pick._pickupDef.icon} ${cs} — ${pick._pickupDef.label}. ${pick._pickupDef.flavour}`, 'info');
                            if (window.SF3D) SF3D.spawnExplosion(pick.position);
                            if (window.SFAudio) SFAudio.playSound('comm_beep');
                        }
                        continue;
                    }

                    handleCollision(a, b);
                }
            }

            // 🍴 Release collision forks — philosophers put down forks before cleanup
            if (_DP) _DP.releaseAll('collision');

            // Cleanup — inline filter with swap-remove for O(1) per deletion
            for (let i = state.entities.length - 1; i >= 0; i--) {
                if (state.entities[i].markedForDeletion) {
                    state.entities[i] = state.entities[state.entities.length - 1];
                    state.entities.pop();
                }
            }
            if (M) M.reap();

            // ── Support ship system: autopilot + dock + repair ──
            _updateSupportSystem(safeDt);
            _updateSupportButtons();

            // ── Dynamic music intensity — proximity & threat level ──
            if (window.SFMusic && state.player && !state.player.markedForDeletion) {
                let nearCount = 0;
                let closestDist = Infinity;
                let enemyCount = 0;
                const px = state.player.position.x, py = state.player.position.y, pz = state.player.position.z;
                for (let i = 0, len = state.entities.length; i < len; i++) {
                    const e = state.entities[i];
                    if (e.type !== 'enemy' && e.type !== 'interceptor' && e.type !== 'bomber' && e.type !== 'dreadnought' && e.type !== 'alien-baseship' && e.type !== 'predator') continue;
                    if (e.markedForDeletion) continue;
                    enemyCount++;
                    const dx = e.position.x - px, dy = e.position.y - py, dz = e.position.z - pz;
                    const distSq = dx * dx + dy * dy + dz * dz;
                    if (distSq < 1500 * 1500) nearCount++; // within 1500m
                    if (distSq < closestDist) closestDist = distSq;
                }
                // Intensity formula: base 0.3 in combat, +proximity, +crowd, +baseship danger
                let musicIntensity = 0.3;
                if (closestDist < 1600 * 1600) musicIntensity += 0.3; // fighter very close — urgency
                else if (closestDist < 1500 * 1500) musicIntensity += 0.15;
                if (nearCount > 3) musicIntensity += 0.15; // multiple threats — crescendo
                if (nearCount > 6) musicIntensity += 0.15; // major battle
                const basePct = state.baseship ? state.baseship.hull / dim('baseship.hull') : 1;
                if (basePct < 0.3) musicIntensity += 0.15; // baseship in danger
                SFMusic.setIntensity(Math.min(1, musicIntensity));

                // Dynamic section switching based on combat proximity
                if (state.phase === 'combat') {
                    if (nearCount > 3 || closestDist < 1600 * 1600) {
                        SFMusic.setSection('heat-of-battle');
                    } else if (nearCount > 0 || closestDist < 1500 * 1500) {
                        SFMusic.setSection('enemy-nearby');
                    } else if (enemyCount > 0) {
                        SFMusic.setSection('foreboding');
                    } else {
                        SFMusic.setSection('exploration');
                    }
                }

                if (SFMusic.setManifoldState) {
                    const pxn = px / 2000;
                    const pyn = py / 2000;
                    const pzn = pz / 2000;
                    const waveNorm = Math.min(1, state.wave / 12);
                    const threatNorm = Math.min(1, (nearCount / 8) + (enemyCount / 20));

                    let field = Math.sin(pxn * pyn);
                    let phase = Math.atan2(pyn, pxn);
                    let gradient = Math.sqrt(pxn * pxn + pyn * pyn + pzn * pzn);
                    if (M && M.diamond) field = M.diamond(px, py, pz);
                    if (M && M.helixPhase) phase = M.helixPhase(px, py);
                    if (M && M.diamondGrad) {
                        const g = M.diamondGrad(px, py, pz);
                        gradient = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
                    }

                    SFMusic.setManifoldState({
                        x: pxn,
                        y: pyn,
                        z: pxn * pyn,
                        phase,
                        field,
                        gradient,
                        waveNorm,
                        threatNorm,
                    });
                }
            }

            // Throttle HUD/DOM updates to every 3rd frame (DOM is slow)
            _frameCount++;
            if (_frameCount % 3 === 0) updateHUD();
            if (window.SF3D) SF3D.render(state);

        } catch (err) {
            console.error('Starfighter gameLoop error (recovered):', err);
            // Show first error on-screen so silent freezes never hide bugs
            if (!state._errorShown) {
                state._errorShown = true;
                const cdEl = document.getElementById('countdown-display');
                if (cdEl) {
                    cdEl.style.display = 'block';
                    cdEl.innerHTML = `<span style="color:#ff4444;font-size:0.4em">ERROR: ${err.message}</span>`;
                }
            }
            // Still render so screen doesn't freeze
            try { if (window.SF3D) SF3D.render(state); } catch (_) { }
        }
    }

    // ══════════════════════════════════════════════════════════════
    // COMBAT AI MANIFOLD — Dimensional substrate: z = xy
    // Behavior (z) is the product of movement traits (x) and attack traits (y)
    // One engine, many personalities — compact as a Schwartz diamond surface
    // ══════════════════════════════════════════════════════════════

    // ── AI PROFILES — Derived from Schwartz Diamond stamp, not hardcoded ──
    // stamp(entity) → {u, v, w, m, field, phase}
    //   field: diamond surface value → behavioral regime
    //   phase: angular position → tactical preference (weapon/target mode)
    //   w: z = xy² → power multiplier (quadratic amplifier)
    //   m: xyz → overall intensity
    //
    // Minimal input (entity 3D position) → maximum multiplied output (full combat profile)
    // No state machines. Behavior emerges from position on the surface.

    const _TRAIT_SEEDS = {
        enemy: { baseTraits: ['evade_locked', 'avoid_predator'] },
        interceptor: { baseTraits: ['jink_close'] },
        bomber: { baseTraits: [] },
        dreadnought: { baseTraits: ['heavy_torpedo'] },
        wingman: { baseTraits: ['orbit_idle'] },
        'alien-baseship': { baseTraits: [] },
    };

    function _deriveAIProfile(entity) {
        const s = M.stamp(entity) || { u: 0, v: 0, w: 0, m: 0, field: 0, phase: 0 };
        const absField = Math.abs(s.field);
        const absM = Math.min(Math.abs(s.m), 500);
        const seeds = _TRAIT_SEEDS[entity.type] || { baseTraits: [] };

        // field > 0 → aggressive regime (attack player)
        // field < 0 → defensive regime (attack baseship/structure)
        // field ≈ 0 → transitional (mixed targeting)
        const aggression = (s.field + 1) * 0.5;   // 0..1
        const targetMode = aggression > 0.6 ? 'player'
            : aggression < 0.3 ? 'baseship'
                : entity.type === 'wingman' ? 'nearest_enemy' : 'mixed';

        // phase → weapon preference: 0..π = laser/turret, π..2π = torpedo
        const weaponPhase = (s.phase + Math.PI) / (2 * Math.PI);  // 0..1
        const weapon = entity.type === 'dreadnought' ? 'turret'
            : entity.type === 'bomber' ? 'torpedo'
                : entity.type === 'alien-baseship' ? 'torpedo'
                    : weaponPhase > 0.7 ? 'torpedo' : 'laser';

        // w (z = xy²) → quadratic power multiplier: turnRate, fireRange, cooldown
        const wNorm = Math.min(Math.abs(s.w), 100) / 100;   // 0..1

        // field < 0 → seek cover (Schwarz Diamond inside-lobe), field > 0 → press attack
        const coverSeek = Math.max(0, Math.min(1, -s.field));

        return {
            targetMode,
            turnRate: dim('enemy.turnRate') * (0.6 + absField * 2.0 + wNorm),
            weapon,
            fireRange: dim('enemy.fireRange') * (0.7 + absM * 0.002 + wNorm * 0.5),
            cooldownMul: 1.0 - absField * 0.3,           // more extreme field → faster firing
            traits: seeds.baseTraits,
            jinkDist: 200 + wNorm * 200,
            heavyRange: dim('enemy.heavyRange') || 6000,
            heavyCooldown: dim('enemy.heavyCooldown') || 15,
            coverSeek,
        };
    }

    // Compatibility shim — cache per-entity, refresh every 2s (stamp changes with position)
    function _getAIProfile(entity) {
        const now = performance.now();
        if (!entity._aiProfile || now - (entity._aiProfileTime || 0) > 2000) {
            entity._aiProfile = _deriveAIProfile(entity);
            entity._aiProfileTime = now;
        }
        return entity._aiProfile;
    }

    // Backward-compat: anything that reads AI_PROFILES[type] still works
    const AI_PROFILES = new Proxy({}, {
        get(_, type) { return _TRAIT_SEEDS[type] ? { traits: _TRAIT_SEEDS[type].baseTraits } : undefined; },
        has(_, type) { return type in _TRAIT_SEEDS; }
    });

    // ── Target acquisition dimension ──
    function _acquireTarget(entity, mode) {
        const _playerAlive = state.player && !state.player.markedForDeletion;
        if (mode === 'player') return _playerAlive ? state.player : state.baseship;
        if (mode === 'baseship') return state.baseship;
        if (mode === 'mixed') return (Math.random() > 0.3) ? state.baseship : (_playerAlive ? state.player : state.baseship);
        if (mode === 'nearest_enemy') {
            let best = null, bestD = Infinity;
            for (let i = 0, len = state.entities.length; i < len; i++) {
                const e = state.entities[i];
                if (e.markedForDeletion) continue;
                if (e.type !== 'enemy' && e.type !== 'interceptor' && e.type !== 'bomber' &&
                    e.type !== 'predator' && e.type !== 'alien-baseship' && e.type !== 'dreadnought') continue;
                const dx = e.position.x - entity.position.x;
                const dy = e.position.y - entity.position.y;
                const dz = e.position.z - entity.position.z;
                const d = dx * dx + dy * dy + dz * dz;
                if (d < bestD) { bestD = d; best = e; }
            }
            return best;
        }
        return _playerAlive ? state.player : state.baseship;
    }

    // Manifold-derived orthogonal frame at a position. n is the unit gradient
    // (the "out of surface" direction); a and b span the tangent plane. Used
    // anywhere we need a deterministic perpendicular direction in place of
    // Math.random() — sidesteps, jinks, evades, formations, spread cones.
    // Same position → same frame, every time. The surface IS the source.
    function _surfaceFrame(px, py, pz) {
        const g = (M && M.diamondGrad) ? M.diamondGrad(px, py, pz) : { x: 1, y: 0, z: 0 };
        const gMag = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z) || 1e-9;
        const nx = g.x / gMag, ny = g.y / gMag, nz = g.z / gMag;
        const tx = Math.abs(nx) < 0.9 ? 1 : 0, ty = Math.abs(nx) < 0.9 ? 0 : 1, tz = 0;
        let ax = ny * tz - nz * ty, ay = nz * tx - nx * tz, az = nx * ty - ny * tx;
        const aMag = Math.sqrt(ax * ax + ay * ay + az * az) || 1e-9;
        ax /= aMag; ay /= aMag; az /= aMag;
        const bx = ny * az - nz * ay, by = nz * ax - nx * az, bz = nx * ay - ny * ax;
        return { n: { x: nx, y: ny, z: nz }, a: { x: ax, y: ay, z: az }, b: { x: bx, y: by, z: bz } };
    }

    // ── Evasion dimension: break turn when player has target lock ──
    // Evade direction lies in the tangent plane to the surface — the entity
    // breaks ALONG the surface, not perpendicular to it. Re-stamps every 1.5s
    // using its current position, so the dance follows the surface as it moves.
    function _combatEvade(entity, dt) {
        if (!entity._evading || !entity._evadeDir) {
            entity._evading = true;
            entity._evadeTimer = 0;
            const fr = _surfaceFrame(entity.position.x, entity.position.y, entity.position.z);
            entity._evadeDir = new THREE.Vector3(fr.a.x, fr.a.y, fr.a.z);
        }
        entity._evadeTimer += dt;
        if (entity._evadeTimer > 1.5) {
            entity._evadeTimer = 0;
            // Re-stamp: alternate tangent axis (a → b → -a → -b) for variation
            // driven by the surface, not RNG.
            const fr = _surfaceFrame(entity.position.x, entity.position.y, entity.position.z);
            const phase = ((entity._evadePhase | 0) + 1) & 3;
            entity._evadePhase = phase;
            const v = phase === 0 ? fr.a
                : phase === 1 ? fr.b
                    : phase === 2 ? { x: -fr.a.x, y: -fr.a.y, z: -fr.a.z }
                        : { x: -fr.b.x, y: -fr.b.y, z: -fr.b.z };
            entity._evadeDir.set(v.x, v.y, v.z);
        }
        // Only call setFromUnitVectors when direction is valid (non-zero)
        const edLen = entity._evadeDir.lengthSq();
        if (edLen > 0.001) {
            _q1.setFromUnitVectors(_v2.set(0, 0, -1), entity._evadeDir);
            entity.quaternion.slerp(_q1, dt * 4.0);
        }
        const fwd = _v1.set(0, 0, -1).applyQuaternion(entity.quaternion);
        entity.velocity.copy(fwd).multiplyScalar(entity.maxSpeed * 1.5);
        // Return fire while evading — guard against null player
        if (!entity._fireCooldown) entity._fireCooldown = 0;
        entity._fireCooldown -= dt;
        if (entity._fireCooldown <= 0 && state.player && !state.player.markedForDeletion) {
            const dx = entity.position.x - state.player.position.x;
            const dy = entity.position.y - state.player.position.y;
            const dz = entity.position.z - state.player.position.z;
            if (dx * dx + dy * dy + dz * dz < 640000) {
                fireLaser(entity, 'enemy');
                entity._fireCooldown = entity._fireCooldownBase || dim('enemy.fireCooldown');
            }
        }
    }

    // ── Predator avoidance dimension ──
    // Avoidance triggers when the local field is non-defensive (≥ -0.3) — i.e.
    // the surface is not already hiding the entity in a cover lobe. Field-gated
    // instead of probabilistic.
    function _combatAvoidPredator(entity, dt) {
        const f = (M && M.diamond) ? M.diamond(entity.position.x, entity.position.y, entity.position.z) : 0;
        if (f < -0.3) return false;
        for (let i = 0, len = state.entities.length; i < len; i++) {
            const pred = state.entities[i];
            if (pred.type !== 'predator' || pred.markedForDeletion) continue;
            const dx = pred.position.x - entity.position.x;
            const dy = pred.position.y - entity.position.y;
            const dz = pred.position.z - entity.position.z;
            if (dx * dx + dy * dy + dz * dz < 160000) {
                _v1.set(-dx, -dy, -dz).normalize();
                _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
                entity.quaternion.slerp(_q1, dt * 3.0);
                entity.velocity.copy(_v1).multiplyScalar(entity.maxSpeed * 1.3);
                return true;
            }
        }
        return false;
    }

    // ── Jink dimension: close-range evasive strafe ──
    // Sidestep direction is the tangent vector at the entity's position — the
    // strafe runs ALONG the surface. The choice of axis (a vs b) flips on each
    // re-stamp so jinks alternate naturally without ever touching RNG.
    function _combatJink(entity, dt, fwd) {
        if (!entity._jinxDir) {
            const fr = _surfaceFrame(entity.position.x, entity.position.y, entity.position.z);
            const phase = ((entity._jinxPhase | 0) + 1) & 3;
            entity._jinxPhase = phase;
            const v = phase === 0 ? fr.a
                : phase === 1 ? fr.b
                    : phase === 2 ? { x: -fr.a.x, y: -fr.a.y, z: -fr.a.z }
                        : { x: -fr.b.x, y: -fr.b.y, z: -fr.b.z };
            entity._jinxDir = new THREE.Vector3(v.x, v.y, v.z).normalize();
            entity._jinxTimer = 0;
        }
        entity._jinxTimer += dt;
        if (entity._jinxTimer > 1.2) { entity._jinxDir = null; entity._jinxTimer = 0; }
        if (entity._jinxDir) {
            _q1.setFromUnitVectors(_v2.set(0, 0, -1), entity._jinxDir);
            entity.quaternion.slerp(_q1, dt * 4.0);
        }
        entity.velocity.copy(fwd).multiplyScalar(entity.maxSpeed * 1.3);
    }

    // ── Torpedo fire dimension ──
    function _combatFireTorpedo(entity, target) {
        if (_countType('torpedo') >= dim('cap.torpedoes')) return;
        _v1.set(0, -30, -60).applyQuaternion(entity.quaternion);
        const t = new Entity('torpedo',
            entity.position.x + _v1.x, entity.position.y + _v1.y, entity.position.z + _v1.z);
        t.quaternion.copy(entity.quaternion);
        _v1.set(0, 0, -dim('weapon.torpedo.speed')).applyQuaternion(t.quaternion);
        t.velocity.copy(_v1);
        t.owner = 'enemy';
        t.radius = dim('weapon.torpedo.radius');
        t.target = target;
        t.maxAge = dim('weapon.torpedo.maxAge');
        t.damage = entity.type === 'alien-baseship' ? dim('weapon.torpedo.damage') : 60;
        t.launchTime = performance.now() / 1000;
        state.entities.push(t);
        if (window.SFAudio) SFAudio.playSound('torpedo');
    }

    // ── Heavy torpedo dimension (dreadnought special) ──
    function _combatFireHeavyTorp(entity, target) {
        if (_countType('torpedo') >= dim('cap.torpedoes')) return;
        _v1.set(0, 0, -80).applyQuaternion(entity.quaternion);
        const t = new Entity('torpedo',
            entity.position.x + _v1.x, entity.position.y + _v1.y, entity.position.z + _v1.z);
        t.quaternion.copy(entity.quaternion);
        _v1.set(0, 0, -360).applyQuaternion(t.quaternion);
        t.velocity.copy(_v1);
        t.owner = 'enemy';
        t.radius = 18;
        t.target = target;
        t.maxAge = 25;
        t.damage = 150;
        t.launchTime = performance.now() / 1000;
        state.entities.push(t);
        if (window.SFAudio) SFAudio.playSound('torpedo');
        SFAnnouncer.onHeavyOrdnance();
    }

    // ── The unified combat AI engine: one function, all combat types ──
    function updateCombatAI(entity, dt) {
        const prof = _getAIProfile(entity);
        if (!prof) return;

        // Plasma stun check
        if (entity._plasmaStunned) {
            entity._plasmaStunTimer -= dt;
            entity.velocity.multiplyScalar(0.95);
            if (entity._plasmaStunTimer <= 0) entity._plasmaStunned = false;
            return;
        }

        // Target acquisition
        let target = _acquireTarget(entity, prof.targetMode);

        // No target — orbit baseship if trait active, else drift
        if (!target) {
            if (prof.traits.includes('orbit_idle') && state.baseship) {
                _v1.copy(state.baseship.position).sub(entity.position);
                if (_v1.lengthSq() > 640000) {
                    _v1.normalize();
                    _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
                    entity.quaternion.slerp(_q1, dt * 1.5);
                }
                const fwd = _v2.set(0, 0, -1).applyQuaternion(entity.quaternion);
                entity.velocity.copy(fwd).multiplyScalar(entity.maxSpeed * 0.5);
            }
            return;
        }

        _v1.copy(target.position).sub(entity.position);
        const dist2 = _v1.lengthSq();
        _v1.normalize();

        // Trait: evade when player has lock
        if (prof.traits.includes('evade_locked') && state.player.lockedTarget === entity) {
            entity._evading = true;
            _combatEvade(entity, dt);
            return;
        }
        entity._evading = false;

        // Trait: avoid predator
        if (prof.traits.includes('avoid_predator') && _combatAvoidPredator(entity, dt)) return;

        // Manifold-derived cover seeking: when the symbolic field places this
        // entity in a defensive lobe, hide behind the nearest asteroid (far
        // side from current target). When the rock shatters, the next stamp
        // re-derives coverSeek and exposure resumes.
        if (prof.coverSeek > 0.4 && window.SFEnhance && SFEnhance.nearestCoverAsteroid) {
            const seekR = Math.min(prof.fireRange * 0.8, 1800);
            const cover = SFEnhance.nearestCoverAsteroid(entity.position, seekR);
            if (cover) {
                _v1.copy(cover.position).sub(target.position).normalize();
                _v2.copy(cover.position).addScaledVector(_v1, cover.radius * 1.4);
                _v1.copy(_v2).sub(entity.position).normalize();
            }
        }

        // Pursuit: turn toward target (or cover anchor)
        _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
        entity.quaternion.slerp(_q1, dt * prof.turnRate);
        const fwd = _v2.set(0, 0, -1).applyQuaternion(entity.quaternion);

        // Trait: jink at close range
        if (prof.traits.includes('jink_close') && dist2 < (prof.jinkDist || 300) ** 2) {
            _combatJink(entity, dt, fwd);
        } else {
            entity.velocity.copy(fwd).multiplyScalar(entity.maxSpeed);
        }

        // Primary weapon
        if (!entity._fireCooldown) entity._fireCooldown = 0;
        entity._fireCooldown -= dt;
        if (entity._fireCooldown <= 0 && dist2 < prof.fireRange * prof.fireRange) {
            if (prof.weapon === 'laser') {
                fireLaser(entity, entity.type === 'wingman' ? 'wingman' : 'enemy');
                // Spread shot — wave 2+ enemies fire a burst alongside their laser
                if (entity._useSpread) setTimeout(() => { if (!entity.markedForDeletion) _fireEnemySpread(entity); }, 90);
                entity._fireCooldown = (entity._fireCooldownBase || dim('enemy.fireCooldown')) * prof.cooldownMul + Math.random() * 0.3;
            } else if (prof.weapon === 'torpedo') {
                _combatFireTorpedo(entity, target);
                entity._fireCooldown = entity._bombInterval || dim('enemy.baseship.fireCooldown');
            } else if (prof.weapon === 'turret') {
                for (let s = 0; s < 3; s++) {
                    setTimeout(() => { if (!entity.markedForDeletion) fireLaser(entity, 'enemy'); }, s * 150);
                }
                entity._fireCooldown = entity._turretInterval || 2.0;
            }
        }

        // Trait: heavy torpedo (dreadnought secondary weapon)
        if (prof.traits.includes('heavy_torpedo')) {
            if (!entity._beamCooldown) entity._beamCooldown = prof.heavyCooldown || 15;
            entity._beamCooldown -= dt;
            if (entity._beamCooldown <= 0 && dist2 < (prof.heavyRange || 6000) ** 2) {
                _combatFireHeavyTorp(entity, target);
                entity._beamCooldown = prof.heavyCooldown || 15;
            }
        }
    }

    // ── ANPC Combat State Manager ──
    // Updates combat state, morale, and triggers personality-driven comms
    function _updateANPCState(entity, dt) {
        if (!entity._anpc || !window.SFAnpc) return;
        const ANPC = window.SFAnpc;
        const npc = entity._anpc;
        const hullMax = 100; // wingman baseline
        const hullPct = entity.hull / hullMax;

        // Update combat state based on hull and engagement
        if (entity.markedForDeletion) {
            ANPC.setState(entity._anpcKey, 'DESTROYED');
            return;
        }
        if (hullPct < 0.15) {
            ANPC.setState(entity._anpcKey, 'RETREATING');
        } else if (hullPct < 0.35) {
            if (npc.combatState !== 'DAMAGED' && npc.combatState !== 'RETREATING') {
                ANPC.setState(entity._anpcKey, 'DAMAGED');
                // Personality-driven comms: callout when damaged
                const line = ANPC.speak(entity._anpcKey, 'shields_down');
                if (line) SFAnnouncer.addComm && SFAnnouncer.addComm(npc.callsign, line, npc.voiceTag);
            }
        } else if (entity._evading) {
            ANPC.setState(entity._anpcKey, 'EVASIVE');
        } else if (entity._fireCooldown !== undefined && entity._fireCooldown > 0) {
            ANPC.setState(entity._anpcKey, 'ENGAGED');
        } else {
            ANPC.setState(entity._anpcKey, 'PATROL');
        }

        // Morale drift — proximity to enemies decreases morale, kills increase it
        const nearbyHostiles = state.entities.filter(e =>
            !e.markedForDeletion && (e.type === 'enemy' || e.type === 'predator' || e.type === 'dreadnought') &&
            e.position.distanceToSquared(entity.position) < 2000 * 2000
        ).length;
        const moraleDelta = (nearbyHostiles > 3 ? -0.02 : nearbyHostiles > 0 ? -0.005 : 0.01) * dt;
        ANPC.adjustMorale(entity._anpcKey, moraleDelta);

        // Disposition: if player is nearby and helping, disposition increases
        if (state.player && !state.player.markedForDeletion) {
            const playerDist = entity.position.distanceToSquared(state.player.position);
            if (playerDist < 800 * 800) {
                ANPC.adjustDisposition(entity._anpcKey, 0.002 * dt); // proximity bond
            }
        }
    }

    // Track wingman kills for ANPC splash comms
    function _onWingmanKill(entity, victim) {
        if (!entity._anpc || !window.SFAnpc) return;
        const ANPC = window.SFAnpc;
        const npc = entity._anpc;
        ANPC.adjustMorale(entity._anpcKey, 0.05);
        ANPC.adjustDisposition(entity._anpcKey, 0.01);
        const line = ANPC.speak(entity._anpcKey, 'splash', { target: victim.type });
        if (line) SFAnnouncer.addComm && SFAnnouncer.addComm(npc.callsign, line, npc.voiceTag);
    }

    function updatePredatorAI(pred, dt) {
        // If consuming a kill, stay still and heal
        if (pred._consuming) {
            pred._consumeTimer -= dt;
            pred.velocity.multiplyScalar(0.9); // slow to a stop
            // Heal while consuming (eats what it kills)
            pred.hull = Math.min(pred.hull + dt * 30, 500 + state.wave * 60);
            if (pred._consumeTimer <= 0) {
                pred._consuming = false;
                pred._consumeTarget = null;
            }
            return;
        }

        // Target selection: Predator is indiscriminate — attacks ANYTHING nearby
        // It doesn't know friend from foe. Only ignores baseship/station (too large to damage)
        let target = null;
        let bestDist = Infinity;
        const ents = state.entities;
        for (let i = 0, len = ents.length; i < len; i++) {
            const e = ents[i];
            if (e.markedForDeletion) continue;
            // Skip other predators, plasma, lasers, torpedoes, baseship, alien-baseship, eggs, younglings
            if (e.type === 'predator' || e.type === 'plasma' || e.type === 'laser' || e.type === 'torpedo') continue;
            if (e.type === 'baseship' || e.type === 'alien-baseship') continue; // too strong to damage
            if (e.type === 'egg' || e.type === 'youngling') continue; // own offspring
            const dx = e.position.x - pred.position.x;
            const dy = e.position.y - pred.position.y;
            const dz = e.position.z - pred.position.z;
            const d = dx * dx + dy * dy + dz * dz;
            if (d < bestDist) { bestDist = d; target = e; }
        }
        if (!target) { target = state.player; }
        if (!target) return;

        // Pursuit: fast but slow-turning (turnRate 0.4 vs enemy's 2.0)
        _v1.copy(target.position).sub(pred.position).normalize();
        _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
        pred.quaternion.slerp(_q1, dt * pred._turnRate);

        // Move forward at speed
        const fwd = _v2.set(0, 0, -1).applyQuaternion(pred.quaternion);
        pred.velocity.copy(fwd).multiplyScalar(pred.maxSpeed);

        // Plasma attack — fires when target is roughly ahead and in range (1000m)
        pred._plasmaTimer -= dt;
        if (pred._plasmaTimer <= 0) {
            const toTarget = _v1.copy(target.position).sub(pred.position);
            const dist = toTarget.length();
            if (dist < 1000) { // can spew plasma several hundred meters
                toTarget.normalize();
                const facingDot = fwd.dot(toTarget);
                if (facingDot > 0.7) { // roughly facing target (wider than lasers — it's a spray)
                    _firePlasma(pred, target);
                    pred._plasmaTimer = pred._plasmaCooldown;
                }
            }
        }

        // Egg laying — predators periodically drop eggs from underbelly
        pred._eggTimer -= dt;
        if (pred._eggTimer <= 0) {
            _layEgg(pred);
            pred._eggTimer = 12 + Math.random() * 8; // 12-20s between eggs
        }
    }

    // ── Plasma projectile: distance-based damage, disables on shield hit, consumes on hull breach ──
    function _firePlasma(source, target) {
        if (_countType('plasma') >= dim('cap.plasma')) return;
        // Plasma emits from the underbelly (-Y local) — that's where its vulnerable
        const spawnOffset = _v1.set(0, -45, -30).applyQuaternion(source.quaternion);
        const p = new Entity('plasma',
            source.position.x + spawnOffset.x,
            source.position.y + spawnOffset.y,
            source.position.z + spawnOffset.z);
        p.quaternion.copy(source.quaternion);

        // Aim toward target with slight spread
        const dir = _v2.copy(target.position).sub(p.position).normalize();
        p.velocity.copy(dir.multiplyScalar(500)); // plasma velocity — slower than lasers
        p.owner = 'predator';
        p.radius = 16;
        p.maxAge = 3.0;  // ~1500m max range at 500m/s
        p.damage = 60;   // base damage (reduced with distance)
        p._sourcePos = source.position.clone(); // track origin for falloff
        p._sourceEntity = source; // track which predator fired it
        state.entities.push(p);

        if (window.SF3D) SF3D.spawnPlasma(p);
        if (window.SFAudio) SFAudio.playSound('plasma_spit');
    }

    // ══════════════════════════════════════
    // SUPPORT SHIPS — tanker & medic frigate
    // Call-based system: ships orbit safely, player calls when in need,
    // autopilot flies player TO the ship, repairs/refuels, sends player back.
    // ══════════════════════════════════════

    let _tankerEntity = null;   // live tanker entity (null = not spawned)
    let _medicEntity = null;    // live medic entity (null = not spawned)
    let _rescueEntity = null;   // rescue shuttle entity (null = not spawned)
    let _scienceEntity = null;  // civilian science vessel (null = not spawned)

    // Support call state
    state._supportCall = null;      // 'tanker' | 'medic' | null
    state._supportTarget = null;    // the entity we're flying to
    state._supportPhase = null;     // 'approach' | 'docking' | 'return' | null
    state._supportDockTimer = 0;
    state._supportReturnPos = null; // THREE.Vector3 — where player was when called

    // ── SPAWN: deploy support ship into safe orbit ──

    function _spawnTanker() {
        if (_tankerEntity) return;
        if (!state.baseship) return;
        const orbitDist = dim('entity.tanker.orbitDist');
        const angle = Math.random() * Math.PI * 2;
        const spawnPos = state.baseship.position.clone().add(
            new THREE.Vector3(Math.cos(angle) * orbitDist, (Math.random() - 0.5) * 400, Math.sin(angle) * orbitDist)
        );
        const tk = new Entity('tanker', spawnPos.x, spawnPos.y, spawnPos.z);
        tk.hull = dim('entity.tanker.hull');
        tk.shields = dim('entity.tanker.shields');
        tk.maxSpeed = dim('entity.tanker.maxSpeed');
        tk.radius = dim('entity.tanker.radius');
        tk._orbitAngle = angle;
        tk._orbitTimer = 0;
        tk._evadeTimer = 0;
        tk._evadeDir = new THREE.Vector3(0, 0, 0);
        tk._called = false;
        state.entities.push(tk);
        _tankerEntity = tk;
        SFAnnouncer.onTankerDeploy();
    }

    function _spawnMedic() {
        if (_medicEntity) return;
        if (!state.baseship) return;
        const orbitDist = dim('entity.medic.orbitDist');
        const angle = Math.random() * Math.PI * 2 + Math.PI; // opposite side from tanker
        const spawnPos = state.baseship.position.clone().add(
            new THREE.Vector3(Math.cos(angle) * orbitDist, 80 + (Math.random() - 0.5) * 300, Math.sin(angle) * orbitDist)
        );
        const med = new Entity('medic', spawnPos.x, spawnPos.y, spawnPos.z);
        med.hull = dim('entity.medic.hull');
        med.shields = dim('entity.medic.shields');
        med.maxSpeed = dim('entity.medic.maxSpeed');
        med.radius = dim('entity.medic.radius');
        med._orbitAngle = angle;
        med._orbitTimer = 0;
        med._evadeTimer = 0;
        med._evadeDir = new THREE.Vector3(0, 0, 0);
        med._called = false;
        state.entities.push(med);
        _medicEntity = med;

        const callsigns = ['Mercy', 'Nightingale', 'Caduceus', 'Aegis'];
        med._callsign = callsigns[(state.wave + state.kills) % callsigns.length];

        SFAnnouncer.onMedicDeploy(med._callsign);
    }

    function _spawnRescueShuttle() {
        if (_rescueEntity) return;
        if (!state.baseship) return;
        // Position rescue shuttle close to baseship, slightly above
        const angle = Math.PI * 0.75; // between tanker and medic arcs
        const orbitDist = 3500;
        const spawnPos = state.baseship.position.clone().add(
            new THREE.Vector3(Math.cos(angle) * orbitDist, 200, Math.sin(angle) * orbitDist)
        );
        const rs = new Entity('rescue', spawnPos.x, spawnPos.y, spawnPos.z);
        rs.hull = 2000;
        rs.shields = 1000;
        rs.maxSpeed = 80;
        rs.radius = 30;
        rs._orbitAngle = angle;
        rs._orbitTimer = 0;
        rs._evadeTimer = 0;
        rs._evadeDir = new THREE.Vector3(0, 0, 0);
        rs._isScenery = true; // not callable, just visible
        state.entities.push(rs);
        _rescueEntity = rs;
    }

    function _spawnScienceVessel() {
        if (_scienceEntity) return;
        if (!state.baseship) return;
        // Civilian science ship on a wide orbit — visible backdrop between Earth and Moon
        const angle = Math.PI * 1.5;
        const orbitDist = 7000;
        const spawnPos = state.baseship.position.clone().add(
            new THREE.Vector3(Math.cos(angle) * orbitDist, -400, Math.sin(angle) * orbitDist)
        );
        const sv = new Entity('science-ship', spawnPos.x, spawnPos.y, spawnPos.z);
        sv.hull = 3000;
        sv.shields = 1500;
        sv.maxSpeed = 60;
        sv.radius = 80;
        sv._orbitAngle = angle;
        sv._orbitTimer = 0;
        sv._evadeTimer = 0;
        sv._evadeDir = new THREE.Vector3(0, 0, 0);
        sv._isScenery = true;
        state.entities.push(sv);
        _scienceEntity = sv;
    }

    // ── ORBIT AI: evasive safe-zone orbit, stay clear of fighting ──

    function _updateSupportOrbit(ship, dt, orbitDistKey) {
        if (!state.baseship) return;

        // Evasive jinking every 2-4 seconds
        ship._evadeTimer -= dt;
        if (ship._evadeTimer <= 0) {
            ship._evadeTimer = 2.0 + Math.random() * 2.0;
            ship._evadeDir.set(
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 1.5,
                (Math.random() - 0.5) * 2
            ).normalize();
        }

        // Orbit around baseship at safe distance
        const orbitDist = dim(orbitDistKey);
        ship._orbitAngle += dt * 0.08; // slow orbit
        const targetX = state.baseship.position.x + Math.cos(ship._orbitAngle) * orbitDist;
        const targetY = state.baseship.position.y + ship._evadeDir.y * 200;
        const targetZ = state.baseship.position.z + Math.sin(ship._orbitAngle) * orbitDist;

        _v1.set(targetX, targetY, targetZ).sub(ship.position);
        // Add evasive jink
        _v1.add(_v2.copy(ship._evadeDir).multiplyScalar(150));
        _v1.normalize();

        _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
        ship.quaternion.slerp(_q1, dt * 1.2);

        const fwd = _v2.set(0, 0, -1).applyQuaternion(ship.quaternion);
        ship.velocity.copy(fwd).multiplyScalar(ship.maxSpeed * 0.7);
    }

    function updateTankerAI(tk, dt) {
        if (!tk || tk.markedForDeletion) return;
        // If called and docking → stay alongside player (handled by support dock system)
        if (state._supportPhase === 'docking' && state._supportTarget === tk) {
            _v1.copy(state.player.position).add(_v2.set(40, 10, 30));
            tk.position.lerp(_v1, dt * 2.0);
            tk.velocity.set(0, 0, 0);
            return;
        }
        // Otherwise: evasive orbit
        _updateSupportOrbit(tk, dt, 'entity.tanker.orbitDist');
    }

    function updateMedicAI(med, dt) {
        if (!med || med.markedForDeletion) return;
        // If called and docking → stay alongside player (handled by support dock system)
        if (state._supportPhase === 'docking' && state._supportTarget === med) {
            _v1.copy(state.player.position).add(_v2.set(-45, 15, 25));
            med.position.lerp(_v1, dt * 2.0);
            med.velocity.set(0, 0, 0);
            return;
        }
        // Otherwise: evasive orbit
        _updateSupportOrbit(med, dt, 'entity.medic.orbitDist');
    }

    function _updateRescueOrbit(dt) {
        if (!_rescueEntity || _rescueEntity.markedForDeletion) return;
        _updateSupportOrbit(_rescueEntity, dt, 'entity.tanker.orbitDist'); // reuse tanker orbit dist
    }

    function _updateScienceOrbit(dt) {
        if (!_scienceEntity || _scienceEntity.markedForDeletion) return;
        _updateSupportOrbit(_scienceEntity, dt, 'entity.medic.orbitDist'); // reuse medic orbit dist
    }

    // ── ELIGIBILITY: dire conditions required to call support ──

    function _canCallTanker() {
        if (!_tankerEntity || _tankerEntity.markedForDeletion) return false;
        if (state._supportPhase) return false; // already in a support call
        if (state.phase !== 'combat') return false;
        if (!state.player || state.player.markedForDeletion) return false;
        const p = state.player;
        // Low fuel OR (low hull AND low shields) OR zero torpedoes with hull damage
        if (p.fuel < dim('support.tanker.fuelThreshold')) return true;
        if (p.hull < dim('support.tanker.hullThreshold') && p.shields < dim('support.tanker.shieldThreshold')) return true;
        if (p.torpedoes <= 0 && p.hull < 70) return true;
        return false;
    }

    function _canCallMedic() {
        if (!_medicEntity || _medicEntity.markedForDeletion) return false;
        if (state._supportPhase) return false; // already in a support call
        if (state.phase !== 'combat') return false;
        if (!state.player || state.player.markedForDeletion) return false;
        const p = state.player;
        // Hull critical OR shields gone
        if (p.hull < dim('support.medic.hullThreshold')) return true;
        if (p.shields <= dim('support.medic.shieldThreshold') && p.hull < 70) return true;
        return false;
    }

    // ── CALL: player initiates support request ──

    function _callSupport(type) {
        const canCall = type === 'tanker' ? _canCallTanker() : _canCallMedic();
        if (!canCall) {
            // Denied — not in enough danger
            SFAnnouncer.onSupportDenied(type);
            if (window.SFAudio) SFAudio.playSound('warning');
            return;
        }

        const target = type === 'tanker' ? _tankerEntity : _medicEntity;
        state._supportCall = type;
        state._supportTarget = target;
        state._supportPhase = 'approach';
        state._supportDockTimer = 0;
        state._supportReturnPos = state.player.position.clone();

        const name = type === 'tanker' ? 'Lifeline' : (target._callsign || 'Medic');
        SFAnnouncer.onSupportAccepted(type, name);
        if (window.SFAudio) SFAudio.playSound('comm_beep');

        // Show autopilot HUD
        const cdEl = document.getElementById('countdown-display');
        cdEl.style.display = 'block';
        cdEl.style.fontSize = '2em';
        cdEl.style.color = type === 'tanker' ? '#00ff88' : '#ff6666';
        cdEl.innerHTML = `AUTOPILOT ENGAGED<br><span style="font-size:0.35em;color:#88ccff">En route to ${type === 'tanker' ? 'FUEL TANKER' : 'MEDICAL FRIGATE'}</span>`;
    }

    // ── SUPPORT UPDATE: runs each frame during active support call ──

    function _updateSupportSystem(dt) {
        if (!state._supportPhase) return;
        if (!state.player || state.player.markedForDeletion) {
            _clearSupport();
            return;
        }
        if (!state._supportTarget || state._supportTarget.markedForDeletion) {
            _clearSupport();
            return;
        }

        const target = state._supportTarget;
        const cdEl = document.getElementById('countdown-display');

        // ── APPROACH: autopilot player toward support ship ──
        if (state._supportPhase === 'approach') {
            _v1.copy(target.position).sub(state.player.position);
            const dist = _v1.length();

            // Steer toward target
            _v1.normalize();
            _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
            state.player.quaternion.slerp(_q1, dt * 2.5);

            // Speed profile: accelerate then cruise
            const apSpeed = dim('support.autopilotSpeed');
            const fwd = _v2.set(0, 0, -1).applyQuaternion(state.player.quaternion);
            state.player.velocity.copy(fwd).multiplyScalar(Math.min(apSpeed, dist * 0.5 + 20));

            // HUD distance countdown
            cdEl.style.display = 'block';
            cdEl.innerHTML = `AUTOPILOT<br><span style="font-size:0.35em;color:#88ccff">Distance to ${state._supportCall === 'tanker' ? 'TANKER' : 'MEDIC'}: ${Math.floor(dist)}m</span>`;

            // Dock when in range
            const dockRange = state._supportCall === 'tanker'
                ? dim('entity.tanker.dockRange')
                : dim('entity.medic.dockRange');
            if (dist < dockRange) {
                state._supportPhase = 'docking';
                state._supportDockTimer = 0;
                const name = state._supportCall === 'tanker' ? 'Lifeline' : (target._callsign || 'Medic');
                SFAnnouncer.onSupportDock(state._supportCall, name);
                if (window.SFAudio) SFAudio.playSound('hud_power_up');
            }
            return;
        }

        // ── DOCKING: repair/refuel/rearm while parked alongside ──
        if (state._supportPhase === 'docking') {
            state._supportDockTimer += dt;

            // Player stays alongside support ship
            const offset = state._supportCall === 'tanker'
                ? _v2.set(-30, -5, 10)
                : _v2.set(30, -5, 10);
            _v1.copy(target.position).add(offset);
            state.player.position.lerp(_v1, dt * 3.0);
            state.player.velocity.set(0, 0, 0);

            const duration = state._supportCall === 'tanker'
                ? dim('entity.tanker.dockDuration')
                : dim('entity.medic.dockDuration');
            const progress = Math.min(state._supportDockTimer / duration, 1.0);

            // Apply repairs based on type
            if (state._supportCall === 'tanker') {
                // Tanker: fuel + hull + shields + rearm
                state.player.fuel = Math.min(100, state.player.fuel + dt * dim('entity.tanker.fuelRepairRate'));
                state.player.hull = Math.min(100, state.player.hull + dt * dim('entity.tanker.hullRepairRate'));
                state.player.shields = Math.min(100, state.player.shields + dt * dim('entity.tanker.shieldRepairRate'));
                // Rearm torpedoes gradually
                if (state._supportDockTimer > 1.0 && state.player.torpedoes < 2) {
                    state.player.torpedoes = Math.min(2, state.player.torpedoes + 1);
                }
            } else {
                // Medic: hull + shields only — NO rearm, NO refuel
                state.player.hull = Math.min(100, state.player.hull + dt * dim('entity.medic.hullRepairRate'));
                state.player.shields = Math.min(100, state.player.shields + dt * dim('entity.medic.shieldRepairRate'));
            }

            // HUD progress
            cdEl.style.display = 'block';
            const op = state._supportCall === 'tanker' ? 'RESUPPLY' : 'REPAIR';
            cdEl.style.color = state._supportCall === 'tanker' ? '#00ff88' : '#ff6666';
            cdEl.innerHTML = `${op} IN PROGRESS<br>` +
                `<span style="font-size:0.35em;color:#88ccff">${Math.floor(progress * 100)}% — ` +
                `Hull: ${Math.floor(state.player.hull)}% | Shields: ${Math.floor(state.player.shields)}%` +
                (state._supportCall === 'tanker' ? ` | Fuel: ${Math.floor(state.player.fuel)}%` : '') +
                `</span>`;

            // Periodic status comms
            if (!state._supportLastComm) state._supportLastComm = 0;
            state._supportLastComm -= dt;
            if (state._supportLastComm <= 0) {
                state._supportLastComm = 2.5;
                if (state._supportCall === 'medic') {
                    SFAnnouncer.onMedicProgress(target._callsign || 'Medic');
                }
            }

            // Complete
            if (state._supportDockTimer >= duration) {
                state._supportPhase = 'return';
                const name = state._supportCall === 'tanker' ? 'Lifeline' : (target._callsign || 'Medic');
                if (state._supportCall === 'tanker') {
                    SFAnnouncer.onTankerDone();
                } else {
                    SFAnnouncer.onMedicDone(target._callsign || 'Medic');
                }
                SFAnnouncer.onSupportReturn(state._supportCall);
            }
            return;
        }

        // ── RETURN: autopilot player back to combat zone ──
        if (state._supportPhase === 'return') {
            const returnTo = state._supportReturnPos || state.baseship.position;
            _v1.copy(returnTo).sub(state.player.position);
            const dist = _v1.length();

            _v1.normalize();
            _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
            state.player.quaternion.slerp(_q1, dt * 2.0);

            const retSpeed = dim('support.returnSpeed');
            const fwd = _v2.set(0, 0, -1).applyQuaternion(state.player.quaternion);
            state.player.velocity.copy(fwd).multiplyScalar(Math.min(retSpeed, dist * 0.5 + 20));

            cdEl.style.display = 'block';
            cdEl.style.color = '#00ffff';
            cdEl.innerHTML = `RETURNING TO COMBAT<br><span style="font-size:0.35em;color:#88ccff">Distance: ${Math.floor(dist)}m</span>`;

            // Return control when close or after max time
            if (dist < 300) {
                _clearSupport();
                SFAnnouncer.onSupportComplete();
                if (window.SFAudio) SFAudio.playSound('hud_power_up');
            }
            return;
        }
    }

    function _clearSupport() {
        state._supportCall = null;
        state._supportTarget = null;
        state._supportPhase = null;
        state._supportDockTimer = 0;
        state._supportReturnPos = null;
        state._supportLastComm = 0;
        const cdEl = document.getElementById('countdown-display');
        if (cdEl) cdEl.style.display = 'none';

        // Update button visibility
        _updateSupportButtons();
    }

    function _isPlayerInSupportAutopilot() {
        return state._supportPhase === 'approach' || state._supportPhase === 'docking' || state._supportPhase === 'return';
    }

    // ── BUTTON VISIBILITY: show/hide based on eligibility ──

    function _updateSupportButtons() {
        const btnTanker = document.getElementById('btn-call-tanker');
        const btnMedic = document.getElementById('btn-call-medic');
        const mobTanker = document.getElementById('mob-call-tanker');
        const mobMedic = document.getElementById('mob-call-medic');
        if (btnTanker) {
            const canCall = _canCallTanker();
            btnTanker.style.display = (state.phase === 'combat' && _tankerEntity && !_tankerEntity.markedForDeletion) ? '' : 'none';
            btnTanker.disabled = !canCall;
            btnTanker.style.opacity = canCall ? '1' : '0.4';
            if (canCall) btnTanker.classList.add('pulse-alert');
            else btnTanker.classList.remove('pulse-alert');
        }
        if (btnMedic) {
            const canCall = _canCallMedic();
            btnMedic.style.display = (state.phase === 'combat' && _medicEntity && !_medicEntity.markedForDeletion) ? '' : 'none';
            btnMedic.disabled = !canCall;
            btnMedic.style.opacity = canCall ? '1' : '0.4';
            if (canCall) btnMedic.classList.add('pulse-alert');
            else btnMedic.classList.remove('pulse-alert');
        }
        // Mobile buttons
        if (mobTanker) {
            const canCall = _canCallTanker();
            mobTanker.style.display = (state.phase === 'combat' && _tankerEntity && !_tankerEntity.markedForDeletion) ? '' : 'none';
            mobTanker.disabled = !canCall;
            mobTanker.style.opacity = canCall ? '1' : '0.4';
        }
        if (mobMedic) {
            const canCall = _canCallMedic();
            mobMedic.style.display = (state.phase === 'combat' && _medicEntity && !_medicEntity.markedForDeletion) ? '' : 'none';
            mobMedic.disabled = !canCall;
            mobMedic.style.opacity = canCall ? '1' : '0.4';
        }
    }

    // ── CLEANUP: remove support ships between waves ──

    function _despawnSupportShips() {
        if (_tankerEntity && !_tankerEntity.markedForDeletion) {
            _tankerEntity.markedForDeletion = true;
            if (M) M.remove(_tankerEntity.id);
        }
        if (_medicEntity && !_medicEntity.markedForDeletion) {
            _medicEntity.markedForDeletion = true;
            if (M) M.remove(_medicEntity.id);
        }
        if (_rescueEntity && !_rescueEntity.markedForDeletion) {
            _rescueEntity.markedForDeletion = true;
            if (M) M.remove(_rescueEntity.id);
        }
        if (_scienceEntity && !_scienceEntity.markedForDeletion) {
            _scienceEntity.markedForDeletion = true;
            if (M) M.remove(_scienceEntity.id);
        }
        _tankerEntity = null;
        _medicEntity = null;
        _rescueEntity = null;
        _scienceEntity = null;
        _clearSupport();
    }

    // ══════════════════════════════════════
    // EGG & YOUNGLING SYSTEM — predators lay eggs that hatch into hull-boring younglings
    // ══════════════════════════════════════

    function _layEgg(predator) {
        // Egg drops from underbelly
        const offset = _v1.set(0, -20, 0).applyQuaternion(predator.quaternion);
        const egg = new Entity('egg',
            predator.position.x + offset.x,
            predator.position.y + offset.y,
            predator.position.z + offset.z);
        egg.velocity.set(0, 0, 0); // eggs float in space
        egg.radius = dim('entity.egg.radius');
        egg.hull = dim('entity.egg.hull');
        egg.shields = 0;
        egg._hatchTimer = dim('entity.egg.hatchTime') + Math.random() * dim('entity.egg.hatchRandom');
        egg._parentPredator = predator;
        state.entities.push(egg);
        if (window.SF3D) SF3D.spawnEgg(egg);
    }

    function _updateEggs(dt) {
        const ents = state.entities;
        for (let i = 0, len = ents.length; i < len; i++) {
            const e = ents[i];
            if (e.type !== 'egg' || e.markedForDeletion) continue;
            e._hatchTimer -= dt;
            if (e._hatchTimer <= 0) {
                // Hatch into youngling
                _spawnYoungling(e.position);
                e.markedForDeletion = true;
                if (M) M.remove(e.id);
                if (window.SF3D) SF3D.spawnEggHatch(e.position);
                if (window.SFAudio) SFAudio.playSound('egg_hatch');
            }
        }
    }

    function _spawnYoungling(pos) {
        const y = new Entity('youngling', pos.x, pos.y, pos.z);
        y.velocity.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
        y.radius = dim('entity.youngling.radius');
        y.hull = dim('entity.youngling.hull');
        y.shields = 0;
        y.maxSpeed = dim('entity.youngling.maxSpeed');
        y._attached = false;     // not yet attached to a ship
        y._attachTarget = null;  // which ship it's on
        y._boreProgress = 0;    // 0 = just attached, 1.0 = inside the ship
        y._cockpitProgress = 0; // 0 = hull breach started, 1.0 = reached cockpit
        y._insideShip = false;  // has breached the hull
        state.entities.push(y);
    }

    function _updateYounglings(dt) {
        const ents = state.entities;
        for (let i = 0, len = ents.length; i < len; i++) {
            const e = ents[i];
            if (e.type !== 'youngling' || e.markedForDeletion) continue;

            if (!e._attached) {
                // Seek nearest ship — younglings go for anything
                let target = state.player;
                let bestDist = Infinity;
                for (let j = 0, jlen = ents.length; j < jlen; j++) {
                    const t = ents[j];
                    if (t.type !== 'player' && t.type !== 'enemy' && t.type !== 'wingman') continue;
                    if (t.markedForDeletion) continue;
                    const d = t.position.distanceToSquared(e.position);
                    if (d < bestDist) { bestDist = d; target = t; }
                }
                if (!target) continue;

                // Chase target
                _v1.copy(target.position).sub(e.position).normalize();
                e.velocity.copy(_v1).multiplyScalar(e.maxSpeed);

                // Check if close enough to attach (within 20m)
                if (bestDist < 400) { // 20²
                    e._attached = true;
                    e._attachTarget = target;
                    e._boreProgress = 0;
                    e.velocity.set(0, 0, 0);
                    if (target.type === 'player') {
                        SFAnnouncer.onHullBreach();
                        if (window.SFAudio) SFAudio.playSound('hull_alarm');
                        // Show emergency RTB button
                        const rtbBtn = document.getElementById('btn-rtb');
                        if (rtbBtn) rtbBtn.style.display = '';
                    }
                }
            } else {
                // Attached to ship — bore into the hull
                const target = e._attachTarget;
                if (!target || target.markedForDeletion) {
                    // Target destroyed — youngling detaches and seeks new target
                    e._attached = false;
                    e._attachTarget = null;
                    e._boreProgress = 0;
                    e._insideShip = false;
                    e._cockpitProgress = 0;
                    continue;
                }

                // Follow the ship (stay attached)
                e.position.copy(target.position);

                if (!e._insideShip) {
                    // Boring through hull
                    e._boreProgress += dt * dim('entity.youngling.boreRate');

                    target.hull -= dt * dim('entity.youngling.damageRate');

                    // Player can shake it off with thrust/afterburner
                    if (target.type === 'player') {
                        const isThrusting = state.player.afterburnerActive || state.player.boostActive || state.player.throttle > 0.8;
                        if (isThrusting && e._boreProgress < 0.7) {
                            // Shaking it off — harder the deeper it's bored
                            const shakeChance = (1.0 - e._boreProgress) * dt * 1.5;
                            if (Math.random() < shakeChance) {
                                e._attached = false;
                                e._attachTarget = null;
                                e._boreProgress = 0;
                                // Fling it away
                                const fwd = _v1.set(0, 0, -1).applyQuaternion(state.player.quaternion);
                                e.position.copy(state.player.position).add(fwd.multiplyScalar(-30));
                                e.velocity.copy(fwd).multiplyScalar(-80);
                                SFAnnouncer.onOrganismClear();
                                if (window.SFAudio) SFAudio.playSound('comm_beep');
                                // Hide RTB button if no more attached
                                _checkHideRTBButton();
                                continue;
                            }
                        } else if (e._boreProgress >= 0.7) {
                            // Too deep — can't shake it off anymore
                            if (!e._tooDeepWarned) {
                                SFAnnouncer.onOrganismDeep();
                                if (window.SFAudio) SFAudio.playSound('hull_alarm');
                                e._tooDeepWarned = true;
                            }
                        }

                        // Periodic alarm while attached
                        if (!e._alarmTimer) e._alarmTimer = 0;
                        e._alarmTimer -= dt;
                        if (e._alarmTimer <= 0) {
                            if (window.SFAudio) SFAudio.playSound('hull_alarm');
                            e._alarmTimer = 3.0; // alarm every 3s
                        }
                    }

                    // NPC ships — youngling just bores through and kills (simplified)
                    if (target.type !== 'player' && e._boreProgress >= 1.0) {
                        target.hull = 0;
                        target.explode();
                        e.markedForDeletion = true;
                        if (M) M.remove(e.id);
                        continue;
                    }

                    // Player — breach at 100%
                    if (target.type === 'player' && e._boreProgress >= 1.0) {
                        e._insideShip = true;
                        e._cockpitProgress = 0;
                        SFAnnouncer.onOrganismInside();
                        if (window.SFAudio) SFAudio.playSound('hull_alarm');
                    }
                } else {
                    // Inside the ship — crawling toward cockpit
                    e._cockpitProgress += dt * 0.12; // ~8s to reach cockpit

                    // Periodic alarm escalates
                    if (!e._cockpitAlarmTimer) e._cockpitAlarmTimer = 0;
                    e._cockpitAlarmTimer -= dt;
                    if (e._cockpitAlarmTimer <= 0) {
                        if (window.SFAudio) SFAudio.playSound('hull_alarm');
                        const pct = Math.floor(e._cockpitProgress * 100);
                        SFAnnouncer.onOrganismProgress(pct);
                        e._cockpitAlarmTimer = 2.0; // faster alerts as it gets closer
                    }

                    // Reached cockpit — game over
                    if (e._cockpitProgress >= 1.0) {
                        state.player.velocity.set(0, 0, 0);
                        state.player.throttle = 0;
                        e.markedForDeletion = true;
                        if (M) M.remove(e.id);
                        if (window.SFAudio) SFAudio.playSound('warning');
                        state.player.markedForDeletion = true;
                        if (M) M.remove(state.player.id);
                        _onPlayerDestroyed('HULL INTEGRITY FAIL — COCKPIT BREACHED');
                        return;
                    }

                    // If player lands at baseship, organism is purged
                    // (handled in completeLanding)
                }
            }
        }
    }

    // ── Emergency RTB — panic button, auto-flies to base at max speed ──
    function _triggerEmergencyRTB() {
        if (state.phase !== 'combat') return;
        if (state._emergencyRTB) return; // already active

        state._emergencyRTB = true;
        state.phase = 'land-approach';
        state.autopilotActive = true;
        state.autopilotTimer = 0;
        SFAnnouncer.onEmergencyRTB();
        if (window.SFAudio) SFAudio.playSound('warning');
        if (window.SFMusic) SFMusic.setIntensity(0.9); // high tension

        // Show emergency HUD
        const cdEl = document.getElementById('countdown-display');
        cdEl.style.display = 'block';
        cdEl.innerHTML = '⚠ EMERGENCY RTB ⚠<br><span style="font-size:0.35em;color:#ff4444">ORGANISM ON BOARD — RACING TO BASE</span>';
        cdEl.style.fontSize = '2em';
        cdEl.style.color = '#ff0000';
    }

    // ── Wave-clear autopilot RTB — player presses SPACE or clicks RTB button ──
    function _engageAutopilotRTB() {
        if (state.autopilotActive) return;
        state.autopilotActive = true;
        state.autopilotTimer = 0;
        SFAnnouncer.onAutopilotEngage();
        if (window.SFAudio) SFAudio.playSound('hud_power_up');
        const rtbBtn = document.getElementById('rtb-btn');
        if (rtbBtn) rtbBtn.style.display = 'none';
    }

    // ── Request Dock — manual redock, player flies themselves ──
    function _requestDock() {
        if (state.phase !== 'combat') return;
        state.phase = 'land-approach';
        state.autopilotActive = false;
        state.autopilotTimer = 0;
        state._returnFlightInit = false;
        state._waveClearAutopilot = false; // manual dock — no title card
        SFAnnouncer.onDockRequest();

        const cdEl = document.getElementById('countdown-display');
        cdEl.style.display = 'block';
        cdEl.innerHTML = 'DOCKING REQUESTED<br><span style="font-size:0.4em;color:#00ff88">Fly to base or press <b>SPACE</b> for autopilot</span>';
        cdEl.style.fontSize = '2em';
        cdEl.style.color = '#00ffff';
    }

    function _checkHideRTBButton() {
        // Hide RTB button if no younglings are attached to player
        const hasAttached = state.entities.some(e =>
            e.type === 'youngling' && !e.markedForDeletion && e._attached && e._attachTarget === state.player
        );
        if (!hasAttached) {
            const rtbBtn = document.getElementById('btn-rtb');
            if (rtbBtn) rtbBtn.style.display = 'none';
        }
    }

    // ── Predator directional armor: underbelly is vulnerable, rest is heavily armored ──
    function _predatorArmorDamage(baseDamage, projectile, predator) {
        // Get predator's local DOWN vector (underbelly = -Y in local space)
        const bellyDir = _v1.set(0, -1, 0).applyQuaternion(predator.quaternion).normalize();
        // Get direction projectile is traveling toward predator
        const hitDir = _v2.copy(predator.position).sub(projectile.position).normalize();
        // Dot product: 1.0 = hit from directly below (underbelly), -1.0 = from above (strongest armor)
        const bellyDot = bellyDir.dot(hitDir);

        if (bellyDot > 0.5) {
            // Underbelly hit — full damage (vulnerable spot)
            if (Math.random() < 0.3) { SFAnnouncer.onGoodHit(); }
            return baseDamage;
        } else if (bellyDot > 0.0) {
            // Glancing angle — 50% reduction
            return baseDamage * 0.5;
        } else {
            // Top/side armor — 75% reduction (very strong armor)
            return baseDamage * 0.25;
        }
    }

    // ── Handle plasma hit — special logic: disable, not kill ──
    function _handlePlasmaHit(plasma, victim) {
        // Distance-based damage falloff
        const travelDist = plasma.position.distanceTo(plasma._sourcePos);
        const falloff = Math.max(0.2, 1.0 - (travelDist / 750)); // 100% at source, 20% at max range
        const actualDamage = plasma.damage * falloff;

        if (victim.shields > 0) {
            // Shields absorb plasma but at heavy cost
            victim.shields -= actualDamage * 1.5; // plasma is extra draining on shields
            if (victim.shields < 0) {
                // Overflow damages hull
                const overflow = -victim.shields * 0.5; // shields absorbed some
                victim.shields = 0;
                victim.hull -= overflow;
            }
            // Shield held — ship has time to recover/escape
            if (victim.type === 'player' && victim.shields > 0) {
                SFAnnouncer.onPlasmaHit();
            }
        } else {
            // No shields — plasma hits hull directly
            victim.hull -= actualDamage;

            if (victim.hull <= 0) {
                // Hull breached — predator consumes the pilot (non-gory game over)
                if (victim.type === 'player') {
                    // Disable the ship — controls go dead, screen fades
                    state.player.velocity.set(0, 0, 0);
                    state.player.throttle = 0;
                    victim.markedForDeletion = true;
                    if (M) M.remove(victim.id);
                    SFAnnouncer.onPredatorConsume();
                    if (window.SFAudio) SFAudio.playSound('warning');
                    _onPlayerDestroyed('HULL INTEGRITY FAIL — PREDATOR BOARDING');
                } else {
                    // NPC consumed — predator eats and heals (friend or foe — it doesn't care)
                    victim.markedForDeletion = true;
                    if (M) M.remove(victim.id);
                    if (window.SF3D) SF3D.spawnExplosion(victim.position);
                    // Flavor comms when predator attacks its own side
                    if (victim.type === 'enemy' && Math.random() < 0.5) {
                        SFAnnouncer.onPredatorMalfunction();
                    }
                    // Predator enters consume state
                    if (plasma._sourceEntity && !plasma._sourceEntity.markedForDeletion) {
                        plasma._sourceEntity._consuming = true;
                        plasma._sourceEntity._consumeTimer = 4.0; // 4s eating animation
                        plasma._sourceEntity._consumeTarget = victim;
                    }
                }
                return;
            }

            // Hull damaged but not breached — disable ship temporarily
            if (victim.type === 'player' && !state._playerDisabled) {
                state._playerDisabled = true;
                state._disableTimer = 2.5; // 2.5s of no controls
                SFAnnouncer.onDisabled();
                if (window.SFAudio) SFAudio.playSound('warning');
            } else if (victim.type === 'enemy') {
                // Enemy ships also get stunned — velocity zeroed briefly
                victim.velocity.multiplyScalar(0.1);
                victim._plasmaStunned = true;
                victim._plasmaStunTimer = 2.0;
            }
        }

        plasma.markedForDeletion = true;
        if (M) M.remove(plasma.id);
        if (window.SF3D) SF3D.spawnImpactEffect(plasma.position, 0x44ff00); // green plasma splash
    }

    // ── Player disabled state — tick down in combat loop ──
    function _updateDisabledState(dt) {
        if (!state._playerDisabled) return;
        state._disableTimer -= dt;
        // Zero all controls while disabled
        state.player.throttle = 0;
        state.player.pitch = 0;
        state.player.yaw = 0;
        state.player.roll = 0;
        state.player.strafeH = 0;
        state.player.strafeV = 0;
        state.player.velocity.multiplyScalar(0.95); // drift to stop

        if (state._disableTimer <= 0) {
            state._playerDisabled = false;
            SFAnnouncer.onSystemsRestore();
            if (window.SFAudio) SFAudio.playSound('hud_power_up');
        }
    }

    function tryLockOnTarget(source) {
        let bestTarget = null;
        let bestScore = -Infinity;

        _v1.set(0, 0, -1).applyQuaternion(source.quaternion);

        const ents = state.entities;
        for (let i = 0, len = ents.length; i < len; i++) {
            const e = ents[i];
            if (e.type !== 'enemy' && e.type !== 'interceptor' && e.type !== 'bomber'
                && e.type !== 'dreadnought' && e.type !== 'alien-baseship'
                && e.type !== 'predator' && e.type !== 'hive-queen') continue;
            if (e.markedForDeletion) continue;

            _v2.copy(e.position).sub(source.position);
            const dist = _v2.length();
            if (dist > 4000) continue;

            _v2.multiplyScalar(1 / dist);
            const dot = _v1.dot(_v2);
            if (dot > 0.8) {
                const score = dot * 10000 - dist;
                if (score > bestScore) { bestScore = score; bestTarget = e; }
            }
        }
        source.lockedTarget = bestTarget;
        if (bestTarget && window.SFAudio) SFAudio.playSound('lock_tone');
    }

    // ── Auto-targeting: check if any enemy is in crosshair cone and in range ──
    // Updates crosshair color and auto-locks when target is centered for 2 seconds
    let _crosshairLocked = false;
    let _crosshairTarget = null;
    let _crosshairDwellTime = 0;       // seconds crosshair has been on current target
    let _crosshairDwellEntity = null;   // entity being tracked for dwell lock
    const DWELL_LOCK_TIME = 2.0;        // seconds to dwell before auto-lock

    function updateCrosshairTargeting(dt) {
        const p = state.player;
        const crosshair = document.getElementById('crosshair');
        if (!crosshair || !p) return;

        _v1.set(0, 0, -1).applyQuaternion(p.quaternion); // player forward

        let bestTarget = null;
        let bestDot = -1;
        let bestDist = Infinity;

        const ents = state.entities;
        for (let i = 0, len = ents.length; i < len; i++) {
            const e = ents[i];
            if (e.type !== 'enemy' && e.type !== 'interceptor' && e.type !== 'bomber'
                && e.type !== 'dreadnought' && e.type !== 'alien-baseship'
                && e.type !== 'predator' && e.type !== 'hive-queen') continue;
            if (e.markedForDeletion) continue;

            _v2.copy(e.position).sub(p.position);
            const dist = _v2.length();
            // Only target enemies within rendering range (full 3D model visible)
            const dotThresh = ({ enemy: 1600, interceptor: 1600, bomber: 2000, predator: 2400, dreadnought: 6000, 'alien-baseship': 8000, 'hive-queen': 10000 })[e.type] || 3000;
            if (dist > dotThresh) continue;

            _v2.multiplyScalar(1 / dist);
            const dot = _v1.dot(_v2);

            // ~15° cone for tracking awareness (cos(15°) ≈ 0.966)
            if (dot > 0.966 && dot > bestDot) {
                bestDot = dot;
                bestTarget = e;
                bestDist = dist;
            }
        }

        const wasLocked = _crosshairLocked;

        if (bestTarget) {
            // Track dwell time on the same target
            if (bestTarget === _crosshairDwellEntity) {
                _crosshairDwellTime += dt;
            } else {
                // New target — reset dwell timer
                _crosshairDwellEntity = bestTarget;
                _crosshairDwellTime = 0;
            }

            if (_crosshairDwellTime >= DWELL_LOCK_TIME) {
                // Dwell threshold reached — full lock
                _crosshairLocked = true;
                _crosshairTarget = bestTarget;
                p.lockedTarget = bestTarget;
                crosshair.classList.add('locked');
                crosshair.classList.remove('tracking');
            } else {
                // Tracking (amber) — building toward lock
                _crosshairLocked = false;
                _crosshairTarget = bestTarget;
                crosshair.classList.remove('locked');
                crosshair.classList.add('tracking');
            }
        } else {
            // No target in cone — reset everything
            _crosshairLocked = false;
            _crosshairTarget = null;
            _crosshairDwellEntity = null;
            _crosshairDwellTime = 0;
            crosshair.classList.remove('locked');
            crosshair.classList.remove('tracking');
        }

        // Play lock tone on fresh lock
        if (_crosshairLocked && !wasLocked && window.SFAudio) {
            SFAudio.playSound('lock_tone');
        }
    }

    // GDD §10.1: Pulse cannon fire rate from manifold dimension
    let _lastFireTime = 0;

    function _countType(t) {
        let c = 0;
        for (let i = 0, len = state.entities.length; i < len; i++) {
            if (state.entities[i].type === t && !state.entities[i].markedForDeletion) c++;
        }
        return c;
    }

    function fireLaser(source, ownerType) {
        // Block player firing inside the bay / countdown / tutorial
        if (ownerType === 'player' && state.phase !== 'combat') return;
        const now = performance.now() / 1000;
        if (ownerType === 'player' && now - _lastFireTime < 1 / dim('weapon.laser.fireRate')) return;
        if (ownerType === 'player') {
            _lastFireTime = now;
            const cost = dim('weapon.laser.fuelCost');
            if (source.fuel < cost) return;
            source.fuel -= cost;
        }

        // Cap laser entities to prevent freeze
        if (_countType('laser') >= dim('cap.lasers')) return;

        // GDD §10.1: Dual linked pulse cannons — two bolts fired simultaneously
        _v1.set(0, 0, -10).applyQuaternion(source.quaternion);
        const l = new Entity('laser',
            source.position.x + _v1.x,
            source.position.y + _v1.y,
            source.position.z + _v1.z);
        l.quaternion.copy(source.quaternion);
        // Projectile speed from manifold dimension
        _v1.set(0, 0, -dim('weapon.laser.speed')).applyQuaternion(l.quaternion);
        l.velocity.copy(_v1);
        l.owner = ownerType;
        l._ownerCallsign = source.callsign || ownerType;
        l.radius = dim('weapon.laser.radius');
        l.maxAge = dim('weapon.laser.maxAge') || 2;
        l._spawnTime = state.elapsed;
        l.damage = dim('weapon.laser.damage');
        state.entities.push(l);
        if (ownerType === 'player') state.missionStats.shotsFired++;
        if (window.SF3D) SF3D.spawnLaser(l);
        if (window.SFAudio) SFAudio.playSound('laser');
    }

    function fireTorpedo(source, ownerType) {
        // Block player firing inside the bay / countdown / tutorial
        if (ownerType === 'player' && state.phase !== 'combat') return;
        if (source.torpedoes <= 0) return;
        // Cap torpedo entities to prevent freeze
        if (_countType('torpedo') >= dim('cap.torpedoes')) return;
        if (ownerType === 'player') {
            const cost = dim('weapon.torpedo.fuelCost');
            if (source.fuel < cost) return;
            source.fuel -= cost;
        }
        source.torpedoes--;

        _v1.set(0, -10, -20).applyQuaternion(source.quaternion);
        const t = new Entity('torpedo',
            source.position.x + _v1.x,
            source.position.y + _v1.y,
            source.position.z + _v1.z);
        t.quaternion.copy(source.quaternion);
        // Torpedo speed from manifold dimension
        _v1.set(0, 0, -dim('weapon.torpedo.speed')).applyQuaternion(t.quaternion);
        t.velocity.copy(_v1);
        t.owner = ownerType;
        t._ownerCallsign = source.callsign || ownerType;
        t.radius = dim('weapon.torpedo.radius');
        t.target = source.lockedTarget;
        t.maxAge = dim('weapon.torpedo.maxAge') || 6;
        t._spawnTime = state.elapsed;
        t.damage = dim('weapon.torpedo.damage');
        t.launchTime = performance.now() / 1000;
        state.entities.push(t);
        if (ownerType === 'player') state.missionStats.shotsFired++;
        if (window.SFAudio) SFAudio.playSound('torpedo');
    }

    // ── Machine Gun — rapid spread fire, low damage per round, high volume ──
    let _lastGunFireTime = 0;

    function fireMachineGun(source, ownerType) {
        if (ownerType === 'player' && state.phase !== 'combat') return;
        const now = performance.now() / 1000;
        if (ownerType === 'player' && now - _lastGunFireTime < 1 / dim('weapon.gun.fireRate')) return;
        if (ownerType === 'player') {
            _lastGunFireTime = now;
            const cost = dim('weapon.gun.fuelCost');
            if (source.fuel < cost) return;
            source.fuel -= cost;
        }
        if (_countType('machinegun') >= dim('cap.machinegun')) return;

        _v1.set(0, 0, -10).applyQuaternion(source.quaternion);
        const g = new Entity('machinegun',
            source.position.x + _v1.x,
            source.position.y + _v1.y,
            source.position.z + _v1.z);
        g.quaternion.copy(source.quaternion);
        // Random spread — cone of fire
        const spread = dim('weapon.gun.spread');
        const rx = (Math.random() - 0.5) * spread;
        const ry = (Math.random() - 0.5) * spread;
        _q1.setFromEuler(new THREE.Euler(rx, ry, 0));
        g.quaternion.multiply(_q1);
        _v1.set(0, 0, -dim('weapon.gun.speed')).applyQuaternion(g.quaternion);
        g.velocity.copy(_v1);
        g.owner = ownerType;
        g.radius = dim('weapon.gun.radius');
        g.maxAge = dim('weapon.gun.maxAge') || 1.5;
        g._spawnTime = state.elapsed;
        g.damage = dim('weapon.gun.damage');
        state.entities.push(g);
        if (window.SF3D) SF3D.spawnLaser(g); // reuse laser visual, tinted differently
        if (window.SFAudio) SFAudio.playSound('laser'); // TODO: distinct gun sound
    }

    // ── Pulse EMP — close-range spherical burst, disables enemies, no damage ──
    let _lastPulseFireTime = 0;

    function firePulseEMP(source, ownerType) {
        if (ownerType === 'player' && state.phase !== 'combat') return;
        const now = performance.now() / 1000;
        if (ownerType === 'player' && now - _lastPulseFireTime < 1 / dim('weapon.pulse.fireRate')) return;
        if (ownerType === 'player') {
            _lastPulseFireTime = now;
            const cost = dim('weapon.pulse.fuelCost');
            if (source.fuel < cost) return;
            source.fuel -= cost;
        }

        // Spherical EMP burst — stun all enemies within range
        const pulseRange = dim('weapon.pulse.range');
        const pulseRangeSq = pulseRange * pulseRange;
        const stunDur = dim('weapon.pulse.stunDuration');
        let stunCount = 0;
        for (let i = 0, len = state.entities.length; i < len; i++) {
            const e = state.entities[i];
            if (e === source || e.markedForDeletion) continue;
            if (e.type === 'laser' || e.type === 'machinegun' || e.type === 'torpedo' ||
                e.type === 'baseship' || e.type === 'tanker' || e.type === 'medic' ||
                e.type === 'wingman' || e.type === 'plasma') continue;
            const dx = e.position.x - source.position.x;
            const dy = e.position.y - source.position.y;
            const dz = e.position.z - source.position.z;
            if (dx * dx + dy * dy + dz * dz < pulseRangeSq) {
                e._plasmaStunned = true;
                e._plasmaStunTimer = stunDur;
                stunCount++;
            }
        }
        if (window.SF3D && SF3D.spawnEMPBurst) SF3D.spawnEMPBurst(source.position, pulseRange);
        if (window.SFAudio) SFAudio.playSound('emp');
        SFAnnouncer.onEMP(stunCount, stunDur);
    }

    // ── Fire primary — dispatches based on selected weapon ──
    function firePrimary() {
        const p = state.player;
        if (!p) return;
        if (state.spectating) return; // eliminated players watch only
        // Weapon dispatch — slots unlock by level: 1=laser, 2+=spread, 3+=torp, 4+=EMP
        switch (p.selectedWeapon) {
            case 0: fireLaser(p, 'player'); break;
            case 1: fireMachineGun(p, 'player'); break;
            case 2: fireTorpedo(p, 'player'); break;
            case 3: firePulseEMP(p, 'player'); break;
        }
    }

    // Kinetic ramming damage. Each side absorbs k · mass(other) · |Δv|², so
    // the fighter trading paint with a bomber takes more than the bomber, and
    // a fighter ramming a carrier is suicide. Scrapes below the Δv² floor do
    // nothing — prevents nuisance damage from formation jostling and tractor
    // beams. Mass falls back to a sane default so unknown types still bounce.
    function _kineticMass(entity) {
        const m = dim('mass.' + entity.type);
        return (typeof m === 'number') ? m : dim('mass.default');
    }
    function _kineticImpactDamage(self, other) {
        const ax = self.velocity?.x || 0, ay = self.velocity?.y || 0, az = self.velocity?.z || 0;
        const bx = other.velocity?.x || 0, by = other.velocity?.y || 0, bz = other.velocity?.z || 0;
        const dx = ax - bx, dy = ay - by, dz = az - bz;
        const dvSq = dx * dx + dy * dy + dz * dz;
        if (dvSq < dim('damage.kineticMinDvSq')) return 0;
        const raw = dim('damage.kineticK') * _kineticMass(other) * dvSq;
        return Math.min(dim('damage.kineticMaxPerHit'), raw);
    }

    function handleCollision(a, b) {
        // ── Egg collision — ships hitting eggs take damage (egg's only defense) ──
        if (a.type === 'egg' && b.type !== 'laser' && b.type !== 'torpedo' && b.type !== 'plasma') {
            b.takeDamage(dim('damage.eggSplash'));
            a.markedForDeletion = true;
            if (M) M.remove(a.id);
            if (window.SF3D) SF3D.spawnImpactEffect(a.position, 0x88ff00);
            return;
        }
        if (b.type === 'egg' && a.type !== 'laser' && a.type !== 'torpedo' && a.type !== 'plasma') {
            a.takeDamage(dim('damage.eggSplash'));
            b.markedForDeletion = true;
            if (M) M.remove(b.id);
            if (window.SF3D) SF3D.spawnImpactEffect(b.position, 0x88ff00);
            return;
        }

        // ── Youngling — skip collisions (they attach via proximity in _updateYounglings) ──
        if (a.type === 'youngling' || b.type === 'youngling') {
            // Lasers/torpedoes can destroy them normally (handled below)
            if (a.type !== 'laser' && a.type !== 'torpedo' && b.type !== 'laser' && b.type !== 'torpedo') return;
        }

        // ── Plasma special handling — disable, don't kill directly ──
        if (a.type === 'plasma') {
            if (b.type === 'predator') return; // predators immune to own plasma
            if (b.type === 'baseship' || b.type === 'alien-baseship') return; // too strong for plasma
            if (b.type === 'egg' || b.type === 'youngling') return; // organic — immune to plasma
            _handlePlasmaHit(a, b);
            return;
        }
        if (b.type === 'plasma') {
            if (a.type === 'predator') return;
            if (a.type === 'baseship' || a.type === 'alien-baseship') return; // too strong for plasma
            if (a.type === 'egg' || a.type === 'youngling') return; // organic — immune to plasma
            _handlePlasmaHit(b, a);
            return;
        }

        if (a.type === 'laser' || a.type === 'machinegun' || a.type === 'torpedo') {
            const damage = a.damage || (a.type === 'torpedo' ? 80 : 15);
            const weaponLabel = a.type === 'torpedo' ? 'Torpedo' : a.type === 'machinegun' ? 'MG' : 'Laser';
            if (window.SF3D) {
                const color = a.type === 'torpedo' ? 0x4488ff : a.type === 'machinegun' ? 0xffcc00 : 0x00ffaa;
                SF3D.spawnImpactEffect(a.position, color);
            }
            if (!(b.type === 'player' && state.phase === 'launching')) {
                const effectiveDmg = b.type === 'predator' ? _predatorArmorDamage(damage, a, b) : damage;
                b._killedByWeapon = weaponLabel;
                if (a.owner === 'player') b.killedBy = 'player';
                else if (a.owner === 'wingman') b.killedBy = a._ownerCallsign || 'Wingman';
                else b.killedBy = a.owner || 'Enemy';
                b.takeDamage(effectiveDmg);
                state.missionStats.damageDealt += effectiveDmg;
                if (a.owner === 'player') state.missionStats.shotsHit++;
                // ANPC kill tracking: if a wingman's projectile killed an enemy
                if (b.markedForDeletion && a.owner === 'wingman') {
                    const shooter = state.entities.find(e => e.type === 'wingman' && !e.markedForDeletion && e._anpc);
                    if (shooter) _onWingmanKill(shooter, b);
                }
            }
            a.markedForDeletion = true;
        } else if (b.type === 'laser' || b.type === 'machinegun' || b.type === 'torpedo') {
            const damage = b.damage || (b.type === 'torpedo' ? 80 : 15);
            const weaponLabel = b.type === 'torpedo' ? 'Torpedo' : b.type === 'machinegun' ? 'MG' : 'Laser';
            if (window.SF3D) {
                const color = b.type === 'torpedo' ? 0x4488ff : b.type === 'machinegun' ? 0xffcc00 : 0x00ffaa;
                SF3D.spawnImpactEffect(b.position, color);
            }
            if (!(a.type === 'player' && state.phase === 'launching')) {
                const effectiveDmg = a.type === 'predator' ? _predatorArmorDamage(damage, b, a) : damage;
                a._killedByWeapon = weaponLabel;
                if (b.owner === 'player') a.killedBy = 'player';
                else if (b.owner === 'wingman') a.killedBy = b._ownerCallsign || 'Wingman';
                else a.killedBy = b.owner || 'Enemy';
                a.takeDamage(effectiveDmg);
                state.missionStats.damageDealt += effectiveDmg;
                if (b.owner === 'player') state.missionStats.shotsHit++;

                // Training drone destroyed
                if (a._isTrainingDrone && a.markedForDeletion && state._trainingActive) {
                    state._trainingDronesDestroyed++;
                    const remaining = 3 - state._trainingDronesDestroyed;
                    if (remaining > 0) {
                        addComm('Training Officer', `Target destroyed! ${remaining} drone${remaining > 1 ? 's' : ''} remaining.`, 'success');
                    } else {
                        addComm('Training Officer', 'All targets destroyed! Training complete. Press ESC to return to bay.', 'success');
                        state._trainingActive = false;
                    }
                }

                // ANPC kill tracking
                if (a.markedForDeletion && b.owner === 'wingman') {
                    const shooter = state.entities.find(e => e.type === 'wingman' && !e.markedForDeletion && e._anpc);
                    if (shooter) _onWingmanKill(shooter, a);
                }
            }
            b.markedForDeletion = true;
        } else {
            // Physical crash - skip if player during launch
            if (!(state.phase === 'launching' && (a.type === 'player' || b.type === 'player'))) {
                a.takeDamage(50);
                b.takeDamage(50);

                if (window.SF3D) {
                    SF3D.spawnImpactEffect(a.position.clone().add(b.position).multiplyScalar(0.5), 0xff0088);
                }

                // Bounce
                const n = a.position.clone().sub(b.position).normalize();
                a.velocity.add(n.clone().multiplyScalar(50));
                b.velocity.sub(n.clone().multiplyScalar(50));
            }
        }
    }

    function updateHUD() {
        if (!state.player || state.player.markedForDeletion) return;
        // Kill feed overlay — render every frame for fade animation
        _renderKillFeed();
        const speed = Math.floor(state.player.velocity.length());
        const throttle = Math.floor(state.player.throttle * 100);
        const fuel = Math.floor(state.player.fuel);
        const hullPct = Math.floor((state.player.hull / dim('player.hull')) * 100);
        const shieldPct = Math.floor((state.player.shields / dim('player.shields')) * 100);
        const basePct = Math.floor((state.baseship.hull / dim('baseship.hull')) * 100);
        const maxSpd = state.player.hyperdriveActive ? state.player.hyperdriveSpeed
            : state.player.boostActive ? state.player.boostSpeed
                : state.player.afterburnerActive ? state.player.afterburnerSpeed
                    : state.player.maxSpeed;

        const hudSignature = [
            speed, throttle, fuel, hullPct, shieldPct, basePct,
            maxSpd, state.wave, state.score, state.player.torpedoes, state.kills,
            state.player.boostActive ? 1 : 0,
            Math.ceil(state.player.boostCooldown || 0),
            state.player.flightAssist ? 1 : 0,
            state.player.afterburnerActive ? 1 : 0,
            state.player.hyperdriveActive ? 1 : 0,
            state.player.hyperdriveSpooling ? 1 : 0,
            Math.ceil(state.player.hyperdriveCooldown || 0)
        ].join('|');
        const hudChanged = hudSignature !== _lastHudSignature;
        if (hudChanged) _lastHudSignature = hudSignature;

        // Update HTML gauge elements (kept for compat)
        const ge = id => document.getElementById(id);
        const el = ge('hud-speed');
        if (el && hudChanged) {
            el.innerText = speed;
            ge('hud-throttle').innerText = throttle;
            ge('hud-fuel').innerText = fuel;
            ge('hud-hull').innerText = hullPct;
            ge('hud-shields').innerText = shieldPct;
            ge('hud-base-hull').innerText = basePct;
            ge('hud-wave').innerText = state.wave;
            ge('hud-score').innerText = state.score;
            ge('hud-torpedoes').innerText = state.player.torpedoes;
            ge('gauge-speed').style.width = Math.min(100, (speed / maxSpd) * 100) + '%';
            ge('gauge-throttle').style.width = throttle + '%';
            ge('gauge-fuel').style.width = fuel + '%';
            ge('gauge-hull').style.width = hullPct + '%';
            ge('gauge-shields').style.width = shieldPct + '%';
            ge('gauge-base').style.width = basePct + '%';
            ge('gauge-hull').className = 'gauge-fill ' + (hullPct < 30 ? 'red' : 'blue');
            ge('gauge-shields').className = 'gauge-fill ' + (shieldPct < 30 ? 'orange' : 'blue');
            ge('gauge-base').className = 'gauge-fill ' + (basePct < 20 ? 'red' : basePct < 50 ? 'orange' : 'orange');
        }

        // Flash warning if baseship critical
        let message = 'DEFEND THE BASESHIP';
        if (basePct < 20) {
            message = 'BASESHIP CRITICAL';
            const msg = ge('hud-message');
            if (msg) {
                msg.style.color = msg.style.color === '#ff0000' ? '#ffff00' : '#ff0000';
                msg.innerText = message;
            }
        }

        // ── Feed telemetry to 3D cockpit screens ──
        if (hudChanged && window.SF3D && SF3D.updateTelemetryScreen) {
            SF3D.updateTelemetryScreen({
                speed, maxSpeed: maxSpd, throttle, fuel,
                hull: hullPct, shields: shieldPct, basePct,
                score: state.score, wave: state.wave,
                torpedoes: state.player.torpedoes,
                kills: state.kills,
                message: basePct < 20 ? message : null
            });
        }

        // ── Feed gameplay HUD overlay ──
        const gh = id => document.getElementById(id);
        const gShield = gh('ghud-shield');
        if (gShield && hudChanged) {
            gShield.innerText = shieldPct;
            gShield.className = 'hud-val' + (shieldPct < 25 ? ' warn' : shieldPct < 50 ? ' caution' : '');
            gh('ghud-shield-bar').style.width = shieldPct + '%';
            gh('ghud-hull').innerText = hullPct;
            gh('ghud-hull').className = 'hud-val' + (hullPct < 25 ? ' warn' : hullPct < 50 ? ' caution' : '');
            gh('ghud-hull-bar').style.width = hullPct + '%';
            gh('ghud-fuel').innerText = fuel;
            gh('ghud-fuel').className = 'hud-val' + (fuel < 20 ? ' warn' : fuel < 40 ? ' caution' : '');
            gh('ghud-fuel-bar').style.width = fuel + '%';
            gh('ghud-torpedoes').innerText = state.player.torpedoes;
            gh('ghud-torpedoes').className = 'hud-val' + (state.player.torpedoes === 0 ? ' warn' : '');
            // Weapon selector indicator
            const wpnEl = gh('ghud-weapon');
            if (wpnEl) {
                const wpnNames = ['LASER', 'GUN', 'PULSE', 'TORP'];
                const wpnColors = ['#00ff88', '#ffcc00', '#cc44ff', '#00ccff'];
                const wi = state.player.selectedWeapon || 0;
                wpnEl.innerText = wpnNames[wi];
                wpnEl.style.color = wpnColors[wi];
            }
            gh('ghud-kills').innerText = state.kills;
            gh('ghud-score').innerText = state.score;
            gh('ghud-wave').innerText = state.wave;

            // Lives pips (leaders show ∞ badge instead)
            const livesEl = gh('ghud-lives');
            if (livesEl) {
                if (_isLeader()) {
                    livesEl.textContent = '∞ LEADER';
                    livesEl.style.color = '#ffd700';
                    livesEl.style.fontSize = '10px';
                    livesEl.style.letterSpacing = '2px';
                } else {
                    const pips = Array.from({ length: state.maxLives }, (_, i) =>
                        i < state.livesRemaining ? '★' : '☆'
                    ).join('');
                    livesEl.textContent = pips;
                    livesEl.style.color = state.livesRemaining <= 1 ? '#ff2222'
                        : state.livesRemaining === 2 ? '#ffaa00' : '#ff4444';
                    livesEl.style.fontSize = '';
                    livesEl.style.letterSpacing = '3px';
                }
            }

            // GDD §11: Boost cooldown indicator
            const boostEl = gh('ghud-boost');
            const boostBar = gh('ghud-boost-bar');
            if (boostEl) {
                if (state.player.boostActive) {
                    boostEl.innerText = 'ACTIVE';
                    boostEl.style.color = '#ff8800';
                    boostBar.style.width = ((state.player.boostTimer / 3.0) * 100) + '%';
                    boostBar.style.background = 'linear-gradient(90deg, #ff8800, #ffcc00)';
                } else if (state.player.boostCooldown > 0) {
                    const cdPct = Math.floor((state.player.boostCooldown / 8.0) * 100);
                    boostEl.innerText = Math.ceil(state.player.boostCooldown) + 's';
                    boostEl.style.color = '#ff4444';
                    boostBar.style.width = cdPct + '%';
                    boostBar.style.background = 'linear-gradient(90deg, #882200, #ff4444)';
                } else {
                    boostEl.innerText = 'RDY';
                    boostEl.style.color = '#00ff88';
                    boostBar.style.width = '0%';
                }
            }

            // GDD §11: Flight Assist indicator
            const faEl = gh('ghud-fa');
            if (faEl) {
                faEl.innerText = state.player.flightAssist ? 'ON' : 'OFF';
                faEl.style.color = state.player.flightAssist ? '#00ff88' : '#ff4444';
            }

            // Speed mode indicator
            const modeEl = gh('ghud-speed-mode');
            if (modeEl) {
                if (state.player.hyperdriveActive) {
                    modeEl.innerText = 'HYPERDRIVE';
                    modeEl.style.color = '#ff00ff';
                } else if (state.player.hyperdriveSpooling) {
                    modeEl.innerText = 'SPOOLING...';
                    modeEl.style.color = '#cc44ff';
                } else if (state.player.boostActive) {
                    modeEl.innerText = 'BOOST';
                    modeEl.style.color = '#ff8800';
                } else if (state.player.afterburnerActive) {
                    modeEl.innerText = 'AFTERBURN';
                    modeEl.style.color = '#ffcc00';
                } else if (state.player.hyperdriveCooldown > 0) {
                    modeEl.innerText = 'HYPER CD ' + Math.ceil(state.player.hyperdriveCooldown) + 's';
                    modeEl.style.color = '#884488';
                } else {
                    modeEl.innerText = 'CRUISE';
                    modeEl.style.color = '#0ff';
                }
            }
        }

        // ── Rank insignia + kill tally display ──
        if (hudChanged && window.SFProgression) {
            let rankEl = gh('ghud-rank');
            if (!rankEl) {
                // Create rank + tally container dynamically (bottom-left of HUD)
                const container = document.createElement('div');
                container.id = 'ghud-rank-container';
                container.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:200;pointer-events:none;font-family:monospace;';
                container.innerHTML =
                    '<div id="ghud-rank" style="font-size:11px;color:#ffdd44;text-shadow:0 0 6px #ff8800;margin-bottom:4px;"></div>' +
                    '<div id="ghud-rank-bar" style="width:140px;height:3px;background:rgba(255,255,255,0.1);border-radius:2px;margin-bottom:6px;"><div id="ghud-rank-fill" style="height:100%;border-radius:2px;background:linear-gradient(90deg,#ff8800,#ffdd44);width:0%;"></div></div>' +
                    '<div id="ghud-credits" style="font-size:10px;color:#88ccee;margin-bottom:6px;"></div>' +
                    '<div id="ghud-tally" style="font-size:13px;line-height:1.4;"></div>';
                document.body.appendChild(container);
                rankEl = gh('ghud-rank');
            }
            const rank = SFProgression.getRank();
            const nextRank = SFProgression.getNextRank();
            const progress = SFProgression.getRankProgress();
            const career = SFProgression.career();

            rankEl.innerHTML = rank.icon + ' ' + rank.name + (nextRank ? ' <span style="color:#556;font-size:9px;">→ ' + nextRank.name + '</span>' : ' <span style="color:#ffaa00;font-size:9px;">MAX RANK</span>');
            const fill = gh('ghud-rank-fill');
            if (fill) fill.style.width = (progress * 100) + '%';
            const creditsEl = gh('ghud-credits');
            if (creditsEl) creditsEl.innerText = '₡ ' + career.credits + '  |  XP: ' + career.xp;
            const tallyEl = gh('ghud-tally');
            if (tallyEl) tallyEl.innerHTML = SFProgression.renderKillTallyHTML();
        }

        // Radar delta updates: only when player moved/rotated, lock changed, or budget elapsed.
        const now = performance.now();
        const p = state.player.position;
        const q = state.player.quaternion;
        const lockId = state.player.lockedTarget ? state.player.lockedTarget.id : '';
        const posDeltaSq =
            (p.x - _lastRadarPx) * (p.x - _lastRadarPx) +
            (p.y - _lastRadarPy) * (p.y - _lastRadarPy) +
            (p.z - _lastRadarPz) * (p.z - _lastRadarPz);
        const quatDrift =
            Math.abs(q.x - _lastRadarQx) + Math.abs(q.y - _lastRadarQy) +
            Math.abs(q.z - _lastRadarQz) + Math.abs(q.w - _lastRadarQw);
        const shouldUpdateRadar =
            (now - _lastRadarPushMs) > 40 ||
            posDeltaSq > 9 ||
            quatDrift > 0.0004 ||
            lockId !== _lastRadarLockId;

        if (shouldUpdateRadar) {
            updateRadar();
            if (window.SF3D && SF3D.updateRadarTexture) {
                SF3D.updateRadarTexture();
            }
            _lastRadarPushMs = now;
            _lastRadarPx = p.x; _lastRadarPy = p.y; _lastRadarPz = p.z;
            _lastRadarQx = q.x; _lastRadarQy = q.y; _lastRadarQz = q.z; _lastRadarQw = q.w;
            _lastRadarLockId = lockId;
        }
    }

    // ── 3D Sphere Radar — GDD §7 ──
    // Player at dead center. Forward direction indicated. Entities shown as blips.
    // Elevation ticks show above/below. Base always marked. Targeted entity pulses.
    let radarScene, radarCamera, radarRenderer;
    let radarSphere, radarShipMarker, radarShipWire, radarForwardMarker, radarBaseMarker;
    let radarElevRing;
    let radarLevelRing;      // baseship-orientation horizon
    let radarLevelUp;        // small "up" tick on level ring
    let radarFovCone;        // camera FOV wedge group
    let radarFovEdges;       // wireframe edges of FOV pyramid
    let radarFovFaces;       // semi-transparent faces of FOV pyramid
    let radarFovRangeTicks;  // range tick groups inside FOV cone
    let radarFovRangeLabels; // distance text labels inside FOV cone
    let radarVectorMeter;    // 3-axis orientation gizmo group
    let radarAxisFwd, radarAxisUp, radarAxisRight; // axis arrow meshes
    let radarCardinalLabels; // F/B/U/D/L/R orientation markers on sphere surface
    let radarOrientGroup;    // group that holds cardinal labels (rotates with inverse ship quat)
    let radarBlipPool = [];
    const RADAR_RANGE = dim('radar.range');
    const RADAR_SHIP_OFFSET = 0.35; // player dot offset toward rear (+Z) for depth perception
    let _lastHudSignature = '';
    let _lastRadarPushMs = 0;
    let _lastRadarPx = 0, _lastRadarPy = 0, _lastRadarPz = 0;
    let _lastRadarQx = 0, _lastRadarQy = 0, _lastRadarQz = 0, _lastRadarQw = 1;
    let _lastRadarLockId = '';
    let radarSweepGroup;          // rotating sweep beam group
    let radarRangeRings = [];     // equatorial range ring meshes
    const radarContacts = new Map(); // entity → {t, wx, wy, wz, type, dist}

    function initRadar() {
        const canvas = document.getElementById('radar-canvas');
        if (!canvas) return;

        radarScene = new THREE.Scene();

        // Camera angled from above-behind — tilted to show depth in sphere
        radarCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        radarCamera.position.set(0, 1.6, 2.4);
        radarCamera.lookAt(0, -0.1, 0);

        radarRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        radarRenderer.setSize(324, 324, false);
        radarRenderer.setClearColor(0x000000, 0.3);

        // Wireframe sphere shell (the radar globe)
        const sphereGeo = new THREE.SphereGeometry(1.0, 24, 24);
        const sphereMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.06
        });
        radarSphere = new THREE.Mesh(sphereGeo, sphereMat);
        radarScene.add(radarSphere);

        // Elevation ring (equatorial disc) — shows horizon plane
        const ringGeo = new THREE.RingGeometry(0.98, 1.0, 48);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff, transparent: true, opacity: 0.15, side: THREE.DoubleSide
        });
        radarElevRing = new THREE.Mesh(ringGeo, ringMat);
        radarElevRing.rotation.x = Math.PI / 2;
        radarScene.add(radarElevRing);

        // ── Player ship marker — offset toward rear (+Z) so forward has depth ──
        // Ship sits at 0.35 back from center, giving 0.65 units of forward depth
        const SHIP_OFFSET = 0.35;
        const shipGeo = new THREE.SphereGeometry(0.05, 8, 8);
        const shipMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        radarShipMarker = new THREE.Mesh(shipGeo, shipMat);
        radarShipMarker.position.set(0, 0, SHIP_OFFSET);
        radarScene.add(radarShipMarker);

        // Player wings wireframe — always aligned to the player's bearing.
        // Drawn as line segments so it's readable even when the globe is busy.
        {
            const pts = [
                // wing span
                new THREE.Vector3(-0.16, 0, -0.02), new THREE.Vector3(-0.05, 0, -0.02),
                new THREE.Vector3(0.05, 0, -0.02), new THREE.Vector3(0.16, 0, -0.02),
                // nose struts
                new THREE.Vector3(-0.05, 0, -0.02), new THREE.Vector3(0, 0, -0.14),
                new THREE.Vector3(0.05, 0, -0.02), new THREE.Vector3(0, 0, -0.14),
                // fuselage
                new THREE.Vector3(0, 0, 0.07), new THREE.Vector3(0, 0, -0.14),
                // tail fins
                new THREE.Vector3(0, 0, 0.07), new THREE.Vector3(-0.04, 0, 0.02),
                new THREE.Vector3(0, 0, 0.07), new THREE.Vector3(0.04, 0, 0.02),
            ];
            const wingGeo = new THREE.BufferGeometry().setFromPoints(pts);
            const wingMat = new THREE.LineBasicMaterial({
                color: 0x00ff88,
                transparent: true,
                opacity: 0.55,
                depthTest: false,
            });
            radarShipWire = new THREE.LineSegments(wingGeo, wingMat);
            radarShipWire.position.set(0, 0, SHIP_OFFSET);
            radarShipWire.renderOrder = 50;
            radarShipWire.frustumCulled = false;
            radarScene.add(radarShipWire);
        }

        // GDD §7: Forward direction indicator — small cone pointing where player faces
        const fwdGeo = new THREE.ConeGeometry(0.035, 0.10, 6);
        const fwdMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
        radarForwardMarker = new THREE.Mesh(fwdGeo, fwdMat);
        radarScene.add(radarForwardMarker);

        // ── 3D FOV Pyramid — shows camera viewport as a clipped pyramid inside the sphere ──
        // Built from ship position toward forward (-Z), matching camera FOV
        // Clipped to the sphere surface so it reads as a 3D volume
        const camFOV = 75;
        const aspect = 16 / 9;
        const halfV = THREE.MathUtils.degToRad(camFOV / 2);
        const halfH = Math.atan(Math.tan(halfV) * aspect);
        const wedgeLen = 0.92; // distance from apex to sphere edge
        const farHalfW = Math.tan(halfH) * wedgeLen;
        const farHalfH = Math.tan(halfV) * wedgeLen;
        // Pyramid apex at origin of group (will be positioned at ship marker)
        const fz = -wedgeLen;
        const apex = new THREE.Vector3(0, 0, 0);
        const ftr = new THREE.Vector3(farHalfW, farHalfH, fz);
        const ftl = new THREE.Vector3(-farHalfW, farHalfH, fz);
        const fbl = new THREE.Vector3(-farHalfW, -farHalfH, fz);
        const fbr = new THREE.Vector3(farHalfW, -farHalfH, fz);

        // Clip far corners to sphere surface (radius 1.0 from world origin)
        // Since the group sits at shipOff, clamp so no corner exceeds sphere
        [ftr, ftl, fbl, fbr].forEach(v => {
            const worldPos = v.clone();
            worldPos.z += SHIP_OFFSET; // account for group position
            const len = worldPos.length();
            if (len > 0.98) {
                worldPos.multiplyScalar(0.98 / len);
                v.copy(worldPos);
                v.z -= SHIP_OFFSET;
            }
        });

        radarFovCone = new THREE.Group();
        radarFovCone.position.set(0, 0, SHIP_OFFSET);
        radarScene.add(radarFovCone);

        // Wireframe edges — bright green, clearly visible
        const wedgeEdgeGeo = new THREE.BufferGeometry().setFromPoints([
            apex, ftr, apex, ftl, apex, fbl, apex, fbr,  // 4 edges from apex
            ftr, ftl, ftl, fbl, fbl, fbr, fbr, ftr       // far rectangle
        ]);
        const wedgeEdgeMat = new THREE.LineBasicMaterial({
            color: 0x00ff88, transparent: true, opacity: 0.5
        });
        radarFovEdges = new THREE.LineSegments(wedgeEdgeGeo, wedgeEdgeMat);
        radarFovCone.add(radarFovEdges);

        // Semi-transparent pyramid faces — visible 3D volume
        const wedgeFaceGeo = new THREE.BufferGeometry();
        const verts = new Float32Array([
            // top face
            apex.x, apex.y, apex.z, ftl.x, ftl.y, ftl.z, ftr.x, ftr.y, ftr.z,
            // bottom face
            apex.x, apex.y, apex.z, fbr.x, fbr.y, fbr.z, fbl.x, fbl.y, fbl.z,
            // left face
            apex.x, apex.y, apex.z, fbl.x, fbl.y, fbl.z, ftl.x, ftl.y, ftl.z,
            // right face
            apex.x, apex.y, apex.z, ftr.x, ftr.y, ftr.z, fbr.x, fbr.y, fbr.z,
            // far cap: two triangles
            ftr.x, ftr.y, ftr.z, ftl.x, ftl.y, ftl.z, fbl.x, fbl.y, fbl.z,
            ftr.x, ftr.y, ftr.z, fbl.x, fbl.y, fbl.z, fbr.x, fbr.y, fbr.z,
        ]);
        wedgeFaceGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        wedgeFaceGeo.computeVertexNormals();
        const wedgeFaceMat = new THREE.MeshBasicMaterial({
            color: 0x00ff88, transparent: true, opacity: 0.08,
            side: THREE.DoubleSide, depthWrite: false
        });
        radarFovFaces = new THREE.Mesh(wedgeFaceGeo, wedgeFaceMat);
        radarFovCone.add(radarFovFaces);

        // ── Range Ticks inside FOV Cone ──
        // Small perpendicular marks at 1/3 and 2/3 distance along each FOV edge
        // with distance labels (shows how far objects in your view are)
        radarFovRangeTicks = new THREE.Group();
        radarFovRangeLabels = [];
        {
            const apex = new THREE.Vector3(0, 0, SHIP_OFFSET);
            const halfH = Math.tan(THREE.MathUtils.degToRad(75 / 2));
            const halfW = halfH * 1.5;
            const corners = [
                new THREE.Vector3(-halfW, halfH, SHIP_OFFSET - 0.92),  // top-left
                new THREE.Vector3(halfW, halfH, SHIP_OFFSET - 0.92),   // top-right
                new THREE.Vector3(halfW, -halfH, SHIP_OFFSET - 0.92),  // bottom-right
                new THREE.Vector3(-halfW, -halfH, SHIP_OFFSET - 0.92), // bottom-left
            ];
            const tickMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.5 });

            for (const frac of [0.33, 0.66]) {
                // Draw tick across each edge at this fraction
                const tickPts = [];
                for (const corner of corners) {
                    const pt = apex.clone().lerp(corner, frac);
                    tickPts.push(pt);
                }
                // Connect the 4 tick points to form a rectangle at this distance
                tickPts.push(tickPts[0].clone()); // close the loop
                const tickGeo = new THREE.BufferGeometry().setFromPoints(tickPts);
                const tickLine = new THREE.Line(tickGeo, tickMat);
                radarFovRangeTicks.add(tickLine);

                // Distance label — create a tiny canvas texture for text
                const rangeKm = Math.round(RADAR_RANGE * frac / 1000);
                const labelCanvas = document.createElement('canvas');
                labelCanvas.width = 64;
                labelCanvas.height = 24;
                const lctx = labelCanvas.getContext('2d');
                lctx.fillStyle = '#00ffcc';
                lctx.font = 'bold 16px monospace';
                lctx.textAlign = 'center';
                lctx.fillText(rangeKm + 'km', 32, 16);
                const labelTex = new THREE.CanvasTexture(labelCanvas);
                const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true, opacity: 0.7, depthTest: false });
                const labelSprite = new THREE.Sprite(labelMat);
                // Position at the bottom edge midpoint of this range ring
                const bottomMid = apex.clone().lerp(
                    new THREE.Vector3(0, -halfH, SHIP_OFFSET - 0.92), frac
                );
                labelSprite.position.copy(bottomMid);
                labelSprite.position.y -= 0.04;
                labelSprite.scale.set(0.12, 0.05, 1);
                radarFovRangeTicks.add(labelSprite);
                radarFovRangeLabels.push(labelSprite);
            }
        }
        radarFovCone.add(radarFovRangeTicks);

        // ── Cardinal Orientation Labels (F/B/U/D/L/R) on Sphere Surface ──
        // These rotate with the INVERSE of the ship quaternion, so they show
        // world-space directions. Player always knows which way is "up" in the arena.
        radarOrientGroup = new THREE.Group();
        radarCardinalLabels = {};
        {
            const LABEL_R = 0.97; // just inside sphere surface
            const cardinals = [
                { key: 'F', text: 'FWD', color: '#00ff88', pos: [0, 0, -LABEL_R] },
                { key: 'B', text: 'AFT', color: '#ff4444', pos: [0, 0, LABEL_R] },
                { key: 'U', text: 'UP', color: '#00ccff', pos: [0, LABEL_R, 0] },
                { key: 'D', text: 'DWN', color: '#ff8800', pos: [0, -LABEL_R, 0] },
                { key: 'L', text: 'PRT', color: '#cc88ff', pos: [-LABEL_R, 0, 0] },
                { key: 'R', text: 'STB', color: '#ffcc44', pos: [LABEL_R, 0, 0] },
            ];
            for (const c of cardinals) {
                const cvs = document.createElement('canvas');
                cvs.width = 64;
                cvs.height = 32;
                const ctx = cvs.getContext('2d');
                // Background pill
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.beginPath();
                ctx.roundRect(2, 2, 60, 28, 6);
                ctx.fill();
                // Text
                ctx.fillStyle = c.color;
                ctx.font = 'bold 18px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(c.text, 32, 17);
                const tex = new THREE.CanvasTexture(cvs);
                const mat = new THREE.SpriteMaterial({
                    map: tex, transparent: true, opacity: 0.75,
                    depthTest: false, sizeAttenuation: true
                });
                const sprite = new THREE.Sprite(mat);
                sprite.position.set(c.pos[0], c.pos[1], c.pos[2]);
                sprite.scale.set(0.16, 0.08, 1);
                radarOrientGroup.add(sprite);
                radarCardinalLabels[c.key] = sprite;
            }
        }

        // ── Degree markings around equatorial ring ──
        {
            const DEG_R = 1.03; // just outside equatorial ring
            const degrees = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
            for (const deg of degrees) {
                const rad = deg * Math.PI / 180;
                const cvs = document.createElement('canvas');
                cvs.width = 48;
                cvs.height = 24;
                const ctx = cvs.getContext('2d');
                ctx.fillStyle = (deg % 90 === 0) ? 'rgba(0,255,255,0.8)' : 'rgba(0,255,255,0.45)';
                ctx.font = (deg % 90 === 0) ? 'bold 16px monospace' : '13px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(deg + '°', 24, 13);
                const tex = new THREE.CanvasTexture(cvs);
                const mat = new THREE.SpriteMaterial({
                    map: tex, transparent: true, opacity: 0.7,
                    depthTest: false, sizeAttenuation: true
                });
                const sprite = new THREE.Sprite(mat);
                // Place around equator: X = sin(angle), Z = -cos(angle) so 0° = forward (-Z)
                sprite.position.set(Math.sin(rad) * DEG_R, 0, -Math.cos(rad) * DEG_R);
                sprite.scale.set(0.12, 0.06, 1);
                radarOrientGroup.add(sprite);
            }
            // Small tick marks between degrees at 10° intervals (no label)
            for (let deg = 0; deg < 360; deg += 10) {
                if (deg % 30 === 0) continue; // already have labels
                const rad = deg * Math.PI / 180;
                const tickGeo = new THREE.BoxGeometry(0.005, 0.005, 0.025);
                const tickMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.25 });
                const tick = new THREE.Mesh(tickGeo, tickMat);
                tick.position.set(Math.sin(rad) * 0.99, 0, -Math.cos(rad) * 0.99);
                tick.lookAt(0, 0, 0);
                radarOrientGroup.add(tick);
            }
        }

        radarScene.add(radarOrientGroup);

        // ── 3-Axis Vector Meter — shows ship orientation relative to world frame ──
        // Forward (green), Up (cyan), Right (red) arrows from ship marker
        radarVectorMeter = new THREE.Group();
        radarVectorMeter.position.set(0, 0, SHIP_OFFSET);
        radarScene.add(radarVectorMeter);

        function _makeAxisArrow(color, length) {
            const group = new THREE.Group();
            // Shaft
            const shaftGeo = new THREE.CylinderGeometry(0.012, 0.012, length, 6);
            const shaftMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
            const shaft = new THREE.Mesh(shaftGeo, shaftMat);
            shaft.position.y = length / 2;
            group.add(shaft);
            // Arrowhead
            const headGeo = new THREE.ConeGeometry(0.03, 0.06, 6);
            const headMat = new THREE.MeshBasicMaterial({ color });
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.y = length;
            group.add(head);
            return group;
        }

        // Forward axis — green — points where ship faces
        radarAxisFwd = _makeAxisArrow(0x00ff88, 0.28);
        radarVectorMeter.add(radarAxisFwd);

        // Up axis — cyan — points where ship's roof faces
        radarAxisUp = _makeAxisArrow(0x00ccff, 0.22);
        radarVectorMeter.add(radarAxisUp);

        // Right axis — red/orange — points to ship's starboard
        radarAxisRight = _makeAxisArrow(0xff6644, 0.18);
        radarVectorMeter.add(radarAxisRight);

        // GDD §7: Base marker — always visible, larger blue diamond
        const baseGeo = new THREE.OctahedronGeometry(0.08, 0);
        const baseMat = new THREE.MeshBasicMaterial({ color: 0x4488ff });
        radarBaseMarker = new THREE.Mesh(baseGeo, baseMat);
        radarBaseMarker.visible = false;
        radarScene.add(radarBaseMarker);

        // Entity blip pool — larger blips for visibility
        for (let i = 0; i < 80; i++) {
            const geo = new THREE.SphereGeometry(0.055, 6, 6);
            const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const blip = new THREE.Mesh(geo, mat);
            blip.visible = false;
            radarScene.add(blip);
            radarBlipPool.push(blip);
        }

        // ── Sweep beam — rotating great-circle meridian (3D radar scan line) ──
        radarSweepGroup = new THREE.Group();
        // Full great-circle arc on sphere surface (in YZ plane, rotates around Y)
        const sweepArcPts = [];
        for (let i = 0; i <= 48; i++) {
            const a = (i / 48) * Math.PI * 2;
            sweepArcPts.push(new THREE.Vector3(0, Math.sin(a) * 0.94, Math.cos(a) * 0.94));
        }
        radarSweepGroup.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(sweepArcPts),
            new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.55 })
        ));
        // Sweep disc — transparent scanning plane for 3D depth
        const sweepDiscGeo = new THREE.CircleGeometry(0.94, 48);
        radarSweepGroup.add(new THREE.Mesh(sweepDiscGeo, new THREE.MeshBasicMaterial({
            color: 0x00ff88, transparent: true, opacity: 0.06,
            side: THREE.DoubleSide, depthWrite: false
        })));
        // Radial spoke — center to equatorial rim (clock hand)
        radarSweepGroup.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.94, 0, 0)
            ]),
            new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6 })
        ));
        radarScene.add(radarSweepGroup);

        // ── Range rings — equatorial circles at 1/3 and 2/3 radar range ──
        radarRangeRings = [];
        for (const frac of [0.33, 0.66]) {
            const r = frac * 0.92;
            const rrGeo = new THREE.RingGeometry(r - 0.004, r + 0.004, 48);
            const rrMat = new THREE.MeshBasicMaterial({
                color: 0x00ffff, transparent: true, opacity: 0.08, side: THREE.DoubleSide
            });
            const rr = new THREE.Mesh(rrGeo, rrMat);
            rr.rotation.x = Math.PI / 2;
            radarScene.add(rr);
            radarRangeRings.push(rr);
        }

        // ── Level Ring — baseship's orientation horizon ──
        const lvlGeo = new THREE.RingGeometry(0.96, 0.98, 48);
        const lvlMat = new THREE.MeshBasicMaterial({
            color: 0xff8800, transparent: true, opacity: 0.25, side: THREE.DoubleSide
        });
        radarLevelRing = new THREE.Mesh(lvlGeo, lvlMat);
        radarScene.add(radarLevelRing);

        // Small "up" tick on level ring
        const tickGeo = new THREE.ConeGeometry(0.025, 0.08, 4);
        const tickMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
        radarLevelUp = new THREE.Mesh(tickGeo, tickMat);
        radarScene.add(radarLevelUp);

        radarScene.add(new THREE.AmbientLight(0xffffff, 1));
    }

    function updateRadar() {
        if (!radarScene || !radarRenderer) {
            initRadar();
            if (!radarScene) return;
        }

        const pPos = state.player.position;
        const pQuat = state.player.quaternion;

        // Inverse quaternion — transforms world directions into ship-local space
        // Forward (-Z) is always "ahead" on the radar display
        const invQuat = pQuat.clone().invert();

        // Sphere wireframe doesn't rotate — fixed reference frame
        radarSphere.quaternion.set(0, 0, 0, 1);

        // Ship marker stays at fixed center offset
        const shipOff = new THREE.Vector3(0, 0, RADAR_SHIP_OFFSET);

        // Player wings wireframe stays locked to the ship marker.
        if (radarShipWire) {
            radarShipWire.position.copy(shipOff);
            radarShipWire.quaternion.set(0, 0, 0, 1);
        }

        // Forward marker — fixed position (always points "ahead" in ship-local = -Z)
        const localFwd = new THREE.Vector3(0, 0, -1); // always -Z in ship frame
        radarForwardMarker.position.copy(localFwd).multiplyScalar(1.05);
        radarForwardMarker.lookAt(shipOff);
        radarForwardMarker.rotateX(Math.PI / 2);

        // FOV cone — fixed orientation (always points forward in ship-local space)
        if (radarFovCone) {
            radarFovCone.quaternion.set(0, 0, 0, 1); // identity — forward is -Z
        }

        // Cardinal orientation labels — rotate with INVERSE ship quaternion
        // so they show WORLD-SPACE directions on the sphere surface
        // Player can always see which way is "up" in the arena regardless of roll/pitch
        if (radarOrientGroup) {
            radarOrientGroup.quaternion.copy(invQuat);
        }

        // Vector Meter — show world axes in ship-local space
        if (radarVectorMeter) {
            // World up in ship-local frame
            const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(invQuat);
            const worldFwd = new THREE.Vector3(0, 0, -1); // always local forward
            const worldRight = new THREE.Vector3(1, 0, 0); // always local right

            const upRef = new THREE.Vector3(0, 1, 0);
            radarAxisFwd.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(upRef, worldFwd));
            radarAxisUp.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(upRef, worldUp));
            radarAxisRight.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(upRef, worldRight));
        }

        // Level Ring — baseship's horizon in ship-local space
        if (radarLevelRing && state.baseship) {
            const baseQuat = state.baseship.quaternion || new THREE.Quaternion();
            const baseUp = new THREE.Vector3(0, 1, 0).applyQuaternion(baseQuat).applyQuaternion(invQuat);
            const ringQuat = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, 1), baseUp
            );
            radarLevelRing.quaternion.copy(ringQuat);
            if (radarLevelUp) {
                radarLevelUp.position.copy(baseUp).multiplyScalar(0.97);
                radarLevelUp.lookAt(0, 0, 0);
                radarLevelUp.rotateX(Math.PI);
            }
        }

        // Base marker — transform world direction into ship-local space
        if (state.baseship) {
            const baseRel = state.baseship.position.clone().sub(pPos);
            const baseDist = baseRel.length();
            if (baseDist > 1) {
                // Transform to ship-local
                const baseLocal = baseRel.normalize().applyQuaternion(invQuat);
                const baseT = Math.min(baseDist / RADAR_RANGE, 1.0);
                radarBaseMarker.position.copy(baseLocal).multiplyScalar(baseT * 0.92).add(shipOff);
                radarBaseMarker.visible = true;
                radarBaseMarker.material.opacity = baseT > 0.9 ? 0.5 : 1.0;
                radarBaseMarker.material.transparent = true;
                if (state.phase === 'land-approach') {
                    const pulse = 0.08 + Math.sin(performance.now() * 0.008) * 0.03;
                    radarBaseMarker.scale.setScalar(pulse / 0.08);
                } else {
                    radarBaseMarker.scale.setScalar(1.0);
                }
            } else {
                radarBaseMarker.visible = false;
            }
        }

        // Sweep beam — rotates in ship-local space
        const SWEEP_PERIOD = dim('radar.sweepPeriod');
        const BEAM_HALF = THREE.MathUtils.degToRad(dim('radar.beamWidth') / 2);
        const PERSISTENCE = dim('radar.persistence');
        const nowSec = performance.now() / 1000;
        const sweepAngle = ((nowSec / SWEEP_PERIOD) % 1.0) * Math.PI * 2;
        if (radarSweepGroup) radarSweepGroup.rotation.y = sweepAngle;

        // Sweep detection — check entity azimuth in ship-local space
        const TWO_PI = Math.PI * 2;
        state.entities.forEach(e => {
            if (e === state.player || e.type === 'laser' || e.type === 'machinegun' || e.type === 'baseship') return;
            const rx = e.position.x - pPos.x;
            const ry = e.position.y - pPos.y;
            const rz = e.position.z - pPos.z;
            const dist = Math.sqrt(rx * rx + ry * ry + rz * rz);
            if (dist < 1 || dist > RADAR_RANGE * 1.2) return;

            // Transform to ship-local for azimuth check
            const localDir = new THREE.Vector3(rx, ry, rz).normalize().applyQuaternion(invQuat);
            let az = Math.atan2(localDir.x, -localDir.z); // -Z is forward
            if (az < 0) az += TWO_PI;
            let sw = sweepAngle % TWO_PI;
            if (sw < 0) sw += TWO_PI;
            let diff = Math.abs(az - sw);
            if (diff > Math.PI) diff = TWO_PI - diff;

            if (diff < BEAM_HALF) {
                radarContacts.set(e, {
                    t: nowSec,
                    // Store ship-local direction for rendering
                    lx: localDir.x, ly: localDir.y, lz: localDir.z,
                    type: e.type, dist: dist
                });
            }
        });

        // Render contacts as fading phosphor blips
        radarBlipPool.forEach(b => b.visible = false);
        let blipIdx = 0;
        const lockedTarget = state.player.lockedTarget;
        const _DPr = M ? M.DiningPhilosophers : null;

        // Locked target always tracked (real-time position, not sweep-gated)
        // 🍴 Fork check — skip if target entity was destroyed
        if (lockedTarget && lockedTarget.position && lockedTarget !== state.player &&
            lockedTarget.type !== 'laser' && lockedTarget.type !== 'baseship' &&
            (!_DPr || _DPr.acquire(lockedTarget.id, 'radar'))) {
            const lx = lockedTarget.position.x - pPos.x;
            const ly = lockedTarget.position.y - pPos.y;
            const lz = lockedTarget.position.z - pPos.z;
            const ld = Math.sqrt(lx * lx + ly * ly + lz * lz);
            if (ld > 1) {
                const localDir = new THREE.Vector3(lx, ly, lz).normalize().applyQuaternion(invQuat);
                const existing = radarContacts.get(lockedTarget);
                if (!existing || (nowSec - existing.t) > SWEEP_PERIOD * 0.5) {
                    radarContacts.set(lockedTarget, {
                        t: nowSec,
                        lx: localDir.x, ly: localDir.y, lz: localDir.z,
                        type: lockedTarget.type, dist: ld
                    });
                }
            }
        }

        radarContacts.forEach((c, entity) => {
            const age = nowSec - c.t;
            if (age > SWEEP_PERIOD) { radarContacts.delete(entity); return; }
            if (blipIdx >= radarBlipPool.length) return;

            // Re-compute ship-local direction for live entities (smooth tracking)
            let nx = c.lx, ny = c.ly, nz = c.lz;
            if (entity.position && !entity.markedForDeletion) {
                const dx = entity.position.x - pPos.x;
                const dy = entity.position.y - pPos.y;
                const dz = entity.position.z - pPos.z;
                const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (d > 1) {
                    const live = new THREE.Vector3(dx, dy, dz).normalize().applyQuaternion(invQuat);
                    nx = live.x; ny = live.y; nz = live.z;
                    c.dist = d;
                }
            }

            const t = Math.min(c.dist / RADAR_RANGE, 1.0);
            const radarR = t * 0.92;

            const blip = radarBlipPool[blipIdx++];
            blip.position.set(
                nx * radarR + shipOff.x,
                ny * radarR + shipOff.y,
                nz * radarR + shipOff.z
            );
            blip.visible = true;

            // Phosphor fade
            const sweepFrac = age / SWEEP_PERIOD;
            const fadeAlpha = PERSISTENCE * (1.0 - sweepFrac);

            // IFF color coding (GDD §6)
            if (c.type === 'enemy') {
                blip.material.color.setHex(0xff2222);
                blip.scale.setScalar(1.0);
            } else if (c.type === 'interceptor') {
                blip.material.color.setHex(0xff4444);
                blip.scale.setScalar(0.8);
            } else if (c.type === 'bomber') {
                blip.material.color.setHex(0xff3333);
                blip.scale.setScalar(1.4);
            } else if (c.type === 'dreadnought') {
                blip.material.color.setHex(0xff0044);
                blip.scale.setScalar(2.5);
            } else if (c.type === 'alien-baseship') {
                blip.material.color.setHex(0xff00ff);
                blip.scale.setScalar(2.0);
            } else if (c.type === 'predator') {
                blip.material.color.setHex(0xcc0000);
                blip.scale.setScalar(1.3);
            } else if (c.type === 'torpedo') {
                blip.material.color.setHex(0x00ffff);
                blip.scale.setScalar(0.7);
            } else if (c.type === 'wingman') {
                blip.material.color.setHex(0x4488ff);
                blip.scale.setScalar(1.0);
            } else if (c.type === 'tanker') {
                blip.material.color.setHex(0x00ff88);
                blip.scale.setScalar(1.2);
            } else if (c.type === 'medic') {
                blip.material.color.setHex(0x44ffff);
                blip.scale.setScalar(1.3);
            } else if (c.type === 'rescue') {
                blip.material.color.setHex(0x44ffcc);
                blip.scale.setScalar(1.0);
            } else if (c.type === 'science-ship') {
                blip.material.color.setHex(0xaaddff);
                blip.scale.setScalar(1.5);
            } else {
                blip.material.color.setHex(0x4488ff);
                blip.scale.setScalar(1.0);
            }

            // Locked target — always visible, pulses yellow
            if (lockedTarget && entity === lockedTarget) {
                blip.material.color.setHex(0xffff00);
                const pulse = 1.0 + Math.sin(performance.now() * 0.01) * 0.5;
                blip.scale.multiplyScalar(pulse);
                blip.material.transparent = true;
                blip.material.opacity = Math.max(fadeAlpha, 0.7);
                return;
            }

            // ── Threat highlighting — incoming projectiles and locking enemies ──
            const threatData = window.SFThreatSys ? window.SFThreatSys.getThreats() : null;

            // Incoming threat — bright orange, pulsing rapidly
            if (threatData && threatData.incoming.has(entity)) {
                blip.material.color.setHex(0xff8800);
                const fastPulse = 1.0 + Math.sin(performance.now() * 0.018) * 0.6;
                blip.scale.multiplyScalar(fastPulse);
                blip.material.transparent = true;
                blip.material.opacity = Math.max(fadeAlpha, 0.85);
                return;
            }

            // Enemy locking us — bright red, medium pulse
            if (threatData && threatData.lockedBy.has(entity)) {
                blip.material.color.setHex(0xff0000);
                const medPulse = 1.0 + Math.sin(performance.now() * 0.012) * 0.4;
                blip.scale.multiplyScalar(medPulse);
                blip.material.transparent = true;
                blip.material.opacity = Math.max(fadeAlpha, 0.8);
                return;
            }

            // Countermeasure flare — bright cyan glow
            if (c.type === 'flare') {
                blip.material.color.setHex(0x00ffff);
                const flarePulse = 1.0 + Math.sin(performance.now() * 0.025) * 0.8;
                blip.scale.multiplyScalar(flarePulse * 1.5);
                blip.material.transparent = true;
                blip.material.opacity = Math.max(fadeAlpha, 0.9);
                return;
            }

            blip.material.transparent = true;
            blip.material.opacity = fadeAlpha;

            // FOV highlight — rectangular frustum check in ship-local space
            // Forward is -Z; check horizontal and vertical half-angles separately
            if (nz < 0) { // must be in front of player
                const fwdDist = -nz;
                const halfV = Math.tan(THREE.MathUtils.degToRad(75 / 2));
                const halfH = halfV * (window.innerWidth / window.innerHeight || 16 / 9);
                if (Math.abs(nx) < halfH * fwdDist && Math.abs(ny) < halfV * fwdDist) {
                    blip.material.opacity = Math.min(fadeAlpha + 0.3, 1.0);
                    blip.scale.multiplyScalar(1.2);
                }
            }
        });

        radarRenderer.render(radarScene, radarCamera);

        // 🍴 Release radar forks
        if (_DPr) _DPr.releaseAll('radar');
    }

    return {
        init,
        getState: () => state,
        getPhase: () => state.phase,
        firePrimary,
        fireLaser: () => fireLaser(state.player, 'player'),
        fireTorpedo: () => fireTorpedo(state.player, 'player'),
        fireMachineGun: () => fireMachineGun(state.player, 'player'),
        firePulseEMP: () => firePulseEMP(state.player, 'player'),
        cycleWeapon: () => state.player && state.player.cycleWeapon(),
        tryLockOnTarget: () => tryLockOnTarget(state.player),
        emergencyRTB: _triggerEmergencyRTB,
        engageAutopilotRTB: _engageAutopilotRTB,
        skipDockCutscene: () => { if (state.phase === 'landing') state.landingTimer = state.landingDuration; },
        requestDock: _requestDock,
        callTanker: () => _callSupport('tanker'),
        callMedic: () => _callSupport('medic'),
        togglePause,
        pause: () => _setPaused(true),
        resume: () => _setPaused(false),
        exitGame,
        openTutorial,
        _skipTraining: _skipTraining
    };

})();

window.Starfighter = Starfighter;

// Skip docking cutscene from HTML button onclick
window._skipDockCutscene = function () {
    if (window.Starfighter) Starfighter.skipDockCutscene();
};

// Global upgrade purchase handler (called by between-wave shop onclick)
window._sfBuyUpgrade = function (id) {
    if (!window.SFProgression) return;
    const result = SFProgression.purchaseUpgrade(id);
    if (result.success) {
        if (window.SFAudio) SFAudio.playSound('click');
        // Refresh the shop display
        const shop = document.getElementById('upgrade-shop');
        if (shop) {
            const career = SFProgression.career();
            shop.querySelectorAll('div[onclick]').forEach(function (el) {
                const onclick = el.getAttribute('onclick');
                if (onclick && onclick.includes(id)) {
                    el.style.borderColor = 'rgba(0,255,100,0.5)';
                    el.innerHTML = '<div style="color:#00ff88;font-weight:bold;">' + result.upgrade.name + '</div><div style="color:#00ff88;">✓ Installed</div>';
                }
            });
            // Update credits display
            const creditsDiv = shop.previousElementSibling;
            if (creditsDiv) creditsDiv.textContent = 'Credits: ₡' + career.credits;
        }
    } else {
        if (window.SFAudio) SFAudio.playSound('warning');
    }
};
