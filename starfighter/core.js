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
        respawnReason: 'HULL INTEGRITY FAIL',
        _replacementVariant: '',
        _replacementBriefing: '',
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
        if (s.totalHostile > 10 && pt) return `${s.totalHostile} hostiles. ${_cs()}, priority target at ${ptBearing}. Engage.`;
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
        if (s.totalHostile > 8 && s.priorityTarget) return { sender: callsign, msg: `Heavy contacts — ${s.totalHostile} hostiles. Priority at ${_bearingOf(s.priorityTarget)}. Could use help.` };
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
        if (s.totalHostile > 12) return `CAUTION: ${s.totalHostile} hostile signatures. High threat density.`;
        if (s.closestM < 300 && s.closestType && s.closestPos) return `PROXIMITY: ${s.closestType} at ${_bearing(s.closestPos)}. Break if needed.`;
        if (s.predators > 0 && s.priorityTarget && s.priorityType === 'predator') return `WARNING: Predator at ${_bearingOf(s.priorityTarget)}. Avoid close range.`;
        if (s.predators > 0) return `WARNING: Predator Drone active. Avoid close range.`;
        return `Status: ${s.totalHostile} hostiles, hull ${s.hullPct}%, base ${s.basePct}%.`;
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
        onReady();
    }

    // Event-driven comm generators — every event message reads live state
    function _killComm(type) {
        const s = _snap();
        const left = s.totalHostile;
        const nextDir = s.priorityTarget ? ` Next priority at ${_bearingOf(s.priorityTarget)}.` : '';
        if (left === 0) return `${_cs()}, that's the last one. Sector clear. ${state.kills} kills this wave.`;
        if (type === 'predator') return `${_cs()}, Predator Drone down. ${left} hostile${left !== 1 ? 's' : ''} on scope.${nextDir}`;
        if (type === 'bomber') return `Bomber neutralized, ${_cs()}. Base hull ${s.basePct}%. ${left} remaining.${nextDir}`;
        if (type === 'dreadnought') return `DREADNOUGHT DESTROYED! Outstanding, ${_cs()}. ${left} hostiles remain.${nextDir}`;
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

    function _onPlayerDestroyed(causeText) {
        if (!state.running || state.respawning) return;

        const reason = causeText || 'HULL INTEGRITY FAIL';
        state.livesRemaining = Math.max(0, state.livesRemaining - 1);

        if (state.livesRemaining <= 0) {
            if (window.SFAnnouncer) SFAnnouncer.onPlayerDestroyed(reason, 0, state.maxLives);
            if (window.SFAudio) SFAudio.playSound('warning');
            setTimeout(() => gameOver(`MISSION FAILED — ${reason}`), 1200);
            return;
        }

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

        // First wave: offer tutorial if player hasn't declined permanently
        if (state.wave === 1 && !localStorage.getItem('sf_no_tutorial')) {
            _showTutorialPrompt();
        } else {
            // Auto-start launch sequence
            setTimeout(() => {
                if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();
                _beginLaunchSequence();
            }, 1500);
        }
    }

    // ── Tutorial Prompt: first-game "Want a tutorial?" overlay (+ wave-1 pilot config) ──
    function _showTutorialPrompt() {
        // ── Build voice picker options from SFAudio if available ──
        const menu = (window.SFAudio && SFAudio.getPlayerVoiceMenu) ? SFAudio.getPlayerVoiceMenu() : null;
        const savedVoice = localStorage.getItem('sf_voice_module') || '';
        const savedGender = localStorage.getItem('sf_voice_gender') || 'female';

        function _voiceOptHTML(list, currentId) {
            return list.map(v =>
                `<option value="${v.id}"${v.id === currentId ? ' selected' : ''}>${v.label}</option>`
            ).join('');
        }

        const fOpts = menu ? _voiceOptHTML(menu.female, savedGender === 'female' ? savedVoice : menu.female[0].id) : '';
        const mOpts = menu ? _voiceOptHTML(menu.male, savedGender === 'male' ? savedVoice : menu.male[0].id) : '';

        const voicePickerHTML = menu ? `
            <div id="voice-config-panel" style="margin-bottom:22px;padding:14px 18px;background:rgba(0,20,40,0.7);border:1px solid rgba(0,255,255,0.18);border-radius:6px;min-width:320px">
              <div style="font-size:10px;letter-spacing:3px;color:#556;margin-bottom:10px">MISSION COMMANDER VOICE</div>
              <div style="display:flex;gap:10px;margin-bottom:10px;justify-content:center">
                <label style="cursor:pointer;display:flex;align-items:center;gap:5px;color:#aaccdd;font-size:12px">
                  <input type="radio" name="vc-gender" id="vc-female" value="female" ${savedGender !== 'male' ? 'checked' : ''}
                    style="accent-color:#00ffcc"> Female
                </label>
                <label style="cursor:pointer;display:flex;align-items:center;gap:5px;color:#aaccdd;font-size:12px">
                  <input type="radio" name="vc-gender" id="vc-male" value="male" ${savedGender === 'male' ? 'checked' : ''}
                    style="accent-color:#00ffcc"> Male
                </label>
              </div>
              <div style="display:flex;gap:8px;align-items:center;justify-content:center">
                <select id="vc-accent" style="background:#0a1a2a;color:#0ff;border:1px solid rgba(0,255,255,0.3);border-radius:4px;padding:5px 8px;font-family:monospace;font-size:11px;cursor:pointer;flex:1">
                  ${savedGender === 'male' ? mOpts : fOpts}
                </select>
                <button id="vc-test" style="padding:5px 12px;background:rgba(0,255,120,0.1);color:#0f8;border:1px solid rgba(0,255,120,0.3);border-radius:4px;font-family:monospace;font-size:11px;cursor:pointer;white-space:nowrap">&#9658; Test</button>
              </div>
            </div>` : '';

        const overlay = document.createElement('div');
        overlay.id = 'tutorial-prompt-overlay';
        overlay.style.cssText = 'position:absolute;inset:0;z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);pointer-events:auto';
        overlay.innerHTML = `
            <div style="text-align:center;max-width:540px">
                <div style="font-size:12px;letter-spacing:4px;color:#446688;margin-bottom:12px">EARTH DEFENSE FORCE</div>
                <div style="font-size:11px;color:#88aacc;margin-bottom:8px">CALLSIGN: <span style="color:#0ff;font-size:14px;letter-spacing:2px">${_cs()}</span></div>
                <div style="font-size:20px;color:#ffd24a;margin-bottom:20px;text-shadow:0 0 12px rgba(255,210,74,0.4)">PILOT CONFIGURATION</div>
                ${voicePickerHTML}
                <div style="font-size:12px;color:#556;letter-spacing:3px;margin-bottom:10px;margin-top:4px">FLIGHT BRIEFING</div>
                <div style="font-size:13px;color:#aaccdd;margin-bottom:24px;line-height:1.5">Would you like a guided tutorial covering flight controls, weapons, and a practice run?</div>
                <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
                    <button id="tut-yes" class="avtn-btn avtn-btn-green" tabindex="1">YES — BRIEF ME</button>
                    <button id="tut-no" class="avtn-btn avtn-btn-red" tabindex="2">NO — LAUNCH NOW</button>
                    <button id="tut-never" class="avtn-btn avtn-btn-dim" tabindex="3" style="font-size:10px">DON'T ASK AGAIN</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        // ── Wire voice picker ──
        if (menu) {
            const fMenuList = menu.female;
            const mMenuList = menu.male;

            function _applyVoiceChoice() {
                const gender = document.querySelector('input[name="vc-gender"]:checked')?.value || 'female';
                const moduleId = document.getElementById('vc-accent')?.value;
                if (!moduleId) return;
                localStorage.setItem('sf_voice_module', moduleId);
                localStorage.setItem('sf_voice_gender', gender);
                if (window.SFAudio) {
                    // Apply to the main command crew voices so backstory uses chosen voice
                    SFAudio.setCrewVoiceModule('Cdr. Vasquez', moduleId);
                    SFAudio.setCrewVoiceModule('Resolute Actual', moduleId);
                    SFAudio.setVoiceModule(moduleId);
                }
            }

            function _rebuildAccentList(gender) {
                const sel = document.getElementById('vc-accent');
                if (!sel) return;
                const list = gender === 'male' ? mMenuList : fMenuList;
                // Try to keep same index if switching
                const curIdx = sel.selectedIndex;
                sel.innerHTML = list.map(v => `<option value="${v.id}">${v.label}</option>`).join('');
                sel.selectedIndex = Math.min(curIdx, list.length - 1);
                _applyVoiceChoice();
            }

            document.querySelectorAll('input[name="vc-gender"]').forEach(r => {
                r.onchange = () => _rebuildAccentList(r.value);
            });
            const accentSel = document.getElementById('vc-accent');
            if (accentSel) accentSel.onchange = _applyVoiceChoice;
            _applyVoiceChoice(); // apply saved preference immediately

            const testBtn = document.getElementById('vc-test');
            if (testBtn) {
                testBtn.onclick = () => {
                    _applyVoiceChoice();
                    if (window.SFAudio && SFAudio.speakAs) {
                        const moduleId = document.getElementById('vc-accent')?.value || 'au_female';
                        const testLine = `Callsign ${_cs()}, this is your mission commander. All systems nominal. Prepare for launch.`;
                        SFAudio.speak(testLine, { voiceModule: moduleId });
                    }
                };
            }
        }

        // Focus first button for keyboard nav
        setTimeout(() => document.getElementById('tut-yes').focus(), 100);

        function _dismiss(launchTutorial, neverAsk) {
            overlay.remove();
            if (neverAsk) localStorage.setItem('sf_no_tutorial', '1');
            if (launchTutorial) {
                _startTutorial();
            } else {
                if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();
                _beginLaunchSequence();
            }
        }

        document.getElementById('tut-yes').onclick = () => _dismiss(true, false);
        document.getElementById('tut-no').onclick = () => _dismiss(false, false);
        document.getElementById('tut-never').onclick = () => _dismiss(false, true);

        // Keyboard nav through buttons
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') _dismiss(false, false);
        });
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
                        <div style="font-size:10px;color:#556677;margin-top:10px">You can revisit this tutorial anytime via the ✦ TUTORIAL button</div>
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
        spawnWave();

        if (window.SFAnnouncer) SFAnnouncer.onLaunchClear();
        else { const s = _snap(); addComm(_crew('deck'), `${_cs()}, clear of bay. ${s.totalHostile} contacts on scope.`, 'base'); }
    }

    // ── Mission titles per wave (BFXG-008 Progression Bible) ──
    const WAVE_TITLES = {
        1: { name: 'FIRST FLIGHT', obj: 'Complete flight training. Destroy all target drones and return safely.' },
        2: { name: 'BAPTISM OF FIRE', obj: 'Eliminate Vek Corsair scouts before they report fleet position.' },
        3: { name: 'THE GAUNTLET', obj: 'Destroy the Vek outpost in the Kessler Belt. Boss: IRONJAW.' },
        4: { name: 'SHIELD WALL', obj: 'Defend the fleet carrier Vanguard from three Vek attack waves. Boss: RAZORWING.' },
        5: { name: 'INTO THE NEBULA', obj: 'Destroy the Vek staging depot hidden inside the Caldera Nebula. Boss: THE SHROUD.' },
        6: { name: 'CONVOY AMBUSH', obj: 'Protect the civilian supply convoy from Vek raiders. Boss: DREADCLAW.' },
        7: { name: 'MINEFIELD', obj: 'Navigate the Shattered Reach and disable the Vek mine control station. Boss: MINELORD KETH.' },
        8: { name: 'CAPITAL STRIKE', obj: 'Destroy the Vek command ship Subjugator before the battle group mobilizes. Boss: THE SUBJUGATOR.' },
        9: { name: 'DARK HORIZON', obj: 'Intercept Vek supply convoy in the Obsidian Corridor. Boss: GRAVITON.' },
        10: { name: 'THE SWARM', obj: 'Survive Skorne first contact. Protect the Meridian Colony comms array. Boss: QUEEN THORAX.' },
        11: { name: 'WRECKAGE AND RUIN', obj: 'Salvage Skorne bio-tech from wrecked hive ships. Watch for both factions. Boss: SCRAPJAW.' },
        12: { name: 'BLACK OMEGA', obj: 'Infiltrate and destroy the Vek weapons research facility. Boss: WARDEN VOSS.' },
        13: { name: 'SIEGE OF MERIDIAN', obj: 'Defend Meridian Colony. Protect 8 evacuation transports. Boss: WORLDBREAKER.' },
        14: { name: 'THE DEEP BLACK', obj: 'Intercept the Skorne carrier group in deep space. Boss: THE PATRIARCH.' },
        15: { name: 'GHOST PROTOCOL', obj: 'Infiltrate Vek command station in the gas giant rings. Classified. Boss: ARCHON ZAEL.' },
        16: { name: 'MANIFOLD RIFT', obj: 'Stabilize the manifold rift before it destabilizes the sector. Boss: THE CONVERGENCE.' },
        17: { name: 'ALLIANCE OF DESPERATION', obj: 'Joint operation with rogue Vek. Destroy Skorne hive nodes in Cygnus Threshold. Boss: THE OVERMIND.' },
        18: { name: 'HEART OF THE HIVE', obj: 'Penetrate the Skorne megastructure and plant the manifold destabilizer at its core. Boss: CORE GUARDIAN.' },
        19: { name: 'TOTAL WAR', obj: 'Lead the allied fleet. Destroy Vek capital ships and Skorne carriers. Protect Vanguard. Dual Boss: KRENN & SKARA.' },
        20: { name: 'SINGULARITY', obj: 'Final confrontation. Defeat the Manifold Architect. Close the rift. Save the universe. Boss: MANIFOLD ARCHITECT (6 phases).' },
    };

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
            const titleInfo = WAVE_TITLES[prevWave] || { name: 'MISSION', obj: 'Sortie complete.' };
            const el = (id) => document.getElementById(id);
            el('bdr-wave-title').textContent = `WAVE ${prevWave} COMPLETE`;
            el('bdr-mission-name').textContent = titleInfo.name;

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
            const nextTitleInfo = WAVE_TITLES[state.wave] || { name: 'COMBAT PATROL', obj: 'Engage and destroy all hostile forces.' };
            el('bdr-next-wave-num').textContent = `WAVE ${state.wave}`;
            el('bdr-next-title').textContent = nextTitleInfo.name;
            el('bdr-next-objective').textContent = nextTitleInfo.obj;
            el('bdr-next-wave-num2').textContent = state.wave;

            // Upgrade shop
            _bdrRebuildShop();

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

            if (window.SFAudio) {
                SFAudio.stopCockpitHum();
                SFAudio.stopThrustRumble();
                SFAudio.stopStrafeHiss();
                SFAudio.startBayAmbience();
            }
            if (window.SF3D) { SF3D.setLaunchPhase(true); SF3D.showLaunchBay(); }

            const launchBtn = document.getElementById('launch-btn');
            if (launchBtn) launchBtn.style.display = 'block';
            const cd = document.getElementById('countdown-display');
            if (cd) { cd.style.display = 'block'; cd.innerHTML = '<span style="font-size:0.35em;color:#446688">LAUNCH BAY — STANDING BY</span>'; }

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
        }

        window._bdrLaunch = function () {
            window._bdrLaunch = null; // one-shot
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
    function _bdrRebuildShop() {
        if (!window.SFProgression) return;
        const upgrades = SFProgression.getPurchasableUpgrades();
        const shopList = document.getElementById('bdr-shop-list');
        const shopEmpty = document.getElementById('bdr-shop-empty');
        const shopCr = document.getElementById('bdr-shop-credits');
        const career = SFProgression.career();
        if (shopCr) shopCr.textContent = `₡${career.credits} AVAILABLE`;
        const crBal = document.getElementById('bdr-cr-balance');
        if (crBal) crBal.textContent = `₡${career.credits}`;
        if (!shopList) return;
        if (upgrades.length === 0) {
            shopList.innerHTML = '';
            if (shopEmpty) shopEmpty.style.display = 'block';
            return;
        }
        if (shopEmpty) shopEmpty.style.display = 'none';
        shopList.innerHTML = upgrades.slice(0, 8).map(u => {
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
        enemy: { x: 1.1, y: 1.25, waveX: 0.08, waveY: 0.14, hullBase: 30, hullWave: 5, hullField: 4, speedBase: 160, speedWave: 10, speedField: 10, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
        interceptor: { x: 1.45, y: 1.7, waveX: 0.1, waveY: 0.16, hullBase: 60, hullWave: 8, hullField: 6, speedBase: 320, speedWave: 15, speedField: 15, shieldsBase: 30, shieldsWave: 5, shieldsField: 5 },
        bomber: { x: 1.7, y: 1.2, waveX: 0.12, waveY: 0.11, hullBase: 80, hullWave: 10, hullField: 8, speedBase: 100, speedWave: 6, speedField: 6, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
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
    function _spawnCluster(clusterId, clusterLabel, cx, cy, cz, enemyType, count, wave, opts) {
        state.clusters.push({ id: clusterId, label: clusterLabel, center: { x: cx, y: cy, z: cz }, total: count, alive: count });
        const spread = 350; // formation spread radius
        for (let i = 0; i < count; i++) {
            const ax = cx + (Math.random() - 0.5) * spread * 2;
            const ay = cy + (Math.random() - 0.5) * spread * 0.6;
            const az = cz + (Math.random() - 0.5) * spread * 2;
            const e = new Entity(enemyType, ax, ay, az);
            const profile = deriveCombatProfile(enemyType, wave, opts || {});
            e.hull = profile.hull;
            e.maxSpeed = profile.maxSpeed;
            e.shields = profile.shields || 0;
            e._manifoldDerivation = profile.trace;
            e._clusterId = clusterId;
            // Per-level fire rate (harder each wave)
            e._fireCooldownBase = _levelFireCooldown(wave);
            // Wave 2+: interceptors always spread-fire, drones 50% chance
            e._useSpread = wave >= 2 && (enemyType === 'interceptor' || Math.random() > 0.5);
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

    // Enemy spread shot — 3-round fan fired by wave 2+ enemies alongside their laser
    function _fireEnemySpread(entity) {
        if (_countType('laser') + 3 >= dim('cap.lasers')) return;
        for (let s = 0; s < 3; s++) {
            const rx = (Math.random() - 0.5) * 0.18;
            const ry = (Math.random() - 0.5) * 0.18;
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
            addComm(_crew('tactical'), `${state.clusters.length} enemy cluster${state.clusters.length > 1 ? 's' : ''} on scope: ${names}. ${total} hostiles total. Engage at will.`, 'warning');
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
            if (state.wave >= 3) _spawnTanker();
            if (state.wave >= 2) _spawnMedic();
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
            const budget = Math.round(2 + w * 3.5 + _mzA * w * 5);

            // ── Cluster count: grows with wave + chaos ──
            // Wave 1: 2. Wave 2–3: 2–3. Wave 4–5: 3–4. Wave 6+: up to 6.
            const rawClusters = 2 + Math.round(_mzL * (w * 0.7));
            const clusterCount = Math.max(2, Math.min(6, rawClusters));

            // ── Enemy type availability per weapon-unlock tier ──
            const canInterceptor = w >= 2;
            const canBomber = w >= 3;

            // Type weights — manifold asymmetric factor biases toward harder types at higher waves
            const typeWeights = {
                enemy: 1.0,
                interceptor: canInterceptor ? (0.25 + _mzL * 0.45) : 0,
                bomber: canBomber ? (0.15 + _mzA * 0.35) : 0,
            };
            const tierTypes = Object.keys(typeWeights).filter(t => typeWeights[t] > 0);
            const totalTW = tierTypes.reduce((s, t) => s + typeWeights[t], 0);

            // Distance band: scales with wave but always well away from the player
            const rBase = 5500 + w * 180;
            const rSpread = 1200 + w * 240;

            // Angular base — random each wave so clusters never come from the same direction
            const baseAngle = Math.random() * Math.PI * 2;

            // ── Build cluster list ──
            let remaining = budget;
            for (let c = 0; c < clusterCount; c++) {
                const isLast = c === clusterCount - 1;
                // Per-cluster enemy count: fair share with ±40% random variation
                const fairShare = Math.round(budget / clusterCount * (0.6 + Math.random() * 0.8));
                const count = Math.max(2, Math.min(5, isLast ? remaining : Math.min(remaining - (clusterCount - c - 1), fairShare)));
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
        const enemies = state.entities.filter(e => (e.type === 'enemy' || e.type === 'interceptor' || e.type === 'bomber' || e.type === 'dreadnought' || e.type === 'alien-baseship' || e.type === 'predator' || e.type === 'egg' || e.type === 'youngling') && !e.markedForDeletion);
        if (enemies.length === 0 && state.phase === 'combat') {
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
            <div class="waveclear-kills">${kills} ENEMY FIGHTER${kills !== 1 ? 'S' : ''} DESTROYED THIS MISSION</div>
            <button class="waveclear-btn" id="waveclear-rtb-btn">RETURN TO BASE</button>
        `;
        overlay.classList.add('active');

        // Pause phase at combat (prevents normal game loop from advancing)
        state.phase = 'land-approach';
        state.autopilotActive = false; // Wait for button click
        state._returnFlightInit = false;

        const hud = document.getElementById('gameplay-hud');
        if (hud) hud.style.opacity = '0.15';
        const xhair = document.getElementById('crosshair');
        if (xhair) xhair.style.display = 'none';
        const radar = document.getElementById('radar-overlay');
        if (radar) radar.style.opacity = '0';

        document.getElementById('waveclear-rtb-btn').addEventListener('click', _doWaveClearRTB);
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
    }

    function _aarRow(label, value) {
        return '<tr><td style="padding:2px 0;color:#88aacc;">' + label + '</td>'
            + '<td style="padding:2px 0;color:#0ff;text-align:right;font-weight:bold;">' + value + '</td></tr>';
    }

    // ── Respawn system: button-based fighter-lost overlay ──
    function _showRespawnScreen() {
        const overlay = document.getElementById('respawn-overlay');
        if (!overlay) return;

        const lives = state.livesRemaining;
        const maxLives = state.maxLives;
        const reason = state.respawnReason || 'HULL INTEGRITY FAIL';
        const pips = Array.from({ length: maxLives }, (_, i) =>
            `<span class="lives-pip ${i < lives ? 'active' : 'lost'}">&#9733;</span>`
        ).join('');

        overlay.innerHTML = `
            <div class="respawn-reason-text">${reason}</div>
            <div class="respawn-headline">FIGHTER LOST</div>
            <div class="lives-meter-row">${pips}</div>
            <div class="respawn-turns-text">You have <strong>${lives}</strong> turn${lives !== 1 ? 's' : ''} remaining</div>
            <button class="respawn-btn" id="respawn-launch-btn">LAUNCH NEW FIGHTER</button>
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

        document.getElementById('respawn-launch-btn').addEventListener('click', _doRespawnLaunch);
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

        // Reset to launch bay
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
            if (state.phase === 'bay-ready') {
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

            if (window.SFInput && !state._playerDisabled && !_isPlayerInSupportAutopilot()) {
                SFInput.update(safeDt);
                SFInput.updateLivePanel();
            }

            if (state.player && state.player.lockedTarget && state.player.lockedTarget.markedForDeletion) {
                state.player.lockedTarget = null;
            }

            // Autonomous announcer — observe game state and generate chatter
            SFAnnouncer.observe(safeDt);
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
                SFAudio.setStrafeLevel(state.player.strafeH, state.player.strafeV);
            }

            // Auto-targeting: crosshair tracks and locks enemies in range + cone
            updateCrosshairTargeting();

            // AI sets intent (velocity) on enemies and torpedoes — for loop, no closure
            // 🍴 Fork-guarded: skip entities whose fork was revoked mid-frame
            const _DPe = M ? M.DiningPhilosophers : null;
            const ents = state.entities;
            for (let i = 0, len = ents.length; i < len; i++) {
                const e = ents[i];
                if (_DPe && !_DPe.acquire(e.id, 'ai')) continue;
                if (e.type === 'predator') updatePredatorAI(e, safeDt);
                else if (e.type === 'tanker') updateTankerAI(e, safeDt);
                else if (e.type === 'medic') updateMedicAI(e, safeDt);
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
                const _isFriendlyType = (t) => t === 'player' || t === 'wingman' || t === 'baseship' || t === 'tanker' || t === 'medic';
                const _isFriendlyOwner = (o) => o === 'player' || o === 'wingman';
                if (isAProj && _isFriendlyOwner(a.owner) && _isFriendlyType(b.type)) continue;
                if (isBProj && _isFriendlyOwner(b.owner) && _isFriendlyType(a.type)) continue;
                // Enemy projectiles skip other enemies
                if (isAProj && a.owner === 'enemy' && _isHostile(b.type)) continue;
                if (isBProj && b.owner === 'enemy' && _isHostile(a.type)) continue;

                // Use inline math so this works whether position is THREE.Vector3 or a plain {x,y,z}
                const _cx = a.position.x - b.position.x;
                const _cy = a.position.y - b.position.y;
                const _cz = (a.position.z || 0) - (b.position.z || 0);
                const distSq = _cx * _cx + _cy * _cy + _cz * _cz;
                const rSum = a.radius + b.radius;
                if (distSq < rSum * rSum) {
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

    // ── Evasion dimension: break turn when player has target lock ──
    function _combatEvade(entity, dt) {
        // Guard: initialise evade state if missing or direction lost
        if (!entity._evading || !entity._evadeDir) {
            entity._evading = true;
            entity._evadeTimer = 0;
            const ex = (Math.random() - 0.5) * 2, ey = (Math.random() - 0.5) * 2, ez = (Math.random() - 0.5);
            const elen = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1;
            entity._evadeDir = new THREE.Vector3(ex / elen, ey / elen, ez / elen);
        }
        entity._evadeTimer += dt;
        if (entity._evadeTimer > 1.5) {
            entity._evadeTimer = 0;
            const ex = (Math.random() - 0.5) * 2, ey = (Math.random() - 0.5) * 2, ez = (Math.random() - 0.5);
            const elen = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1;
            entity._evadeDir.set(ex / elen, ey / elen, ez / elen);
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
    function _combatAvoidPredator(entity, dt) {
        for (let i = 0, len = state.entities.length; i < len; i++) {
            const pred = state.entities[i];
            if (pred.type !== 'predator' || pred.markedForDeletion) continue;
            const dx = pred.position.x - entity.position.x;
            const dy = pred.position.y - entity.position.y;
            const dz = pred.position.z - entity.position.z;
            if (dx * dx + dy * dy + dz * dz < 160000 && Math.random() > 0.3) {
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
    function _combatJink(entity, dt, fwd) {
        if (!entity._jinxDir) {
            entity._jinxDir = new THREE.Vector3(
                (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5)
            ).normalize();
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

        // Pursuit: turn toward target
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
        _tankerEntity = null;
        _medicEntity = null;
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
            if (e.type !== 'enemy' && e.type !== 'interceptor' && e.type !== 'bomber' && e.type !== 'dreadnought' && e.type !== 'alien-baseship' && e.type !== 'predator') continue;
            if (e.markedForDeletion) continue;

            _v2.copy(e.position).sub(source.position);
            const dist = _v2.length();
            if (dist > 4000) continue;

            _v2.multiplyScalar(1 / dist); // normalize without creating new vector
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
    // Updates crosshair color and auto-locks when target is centered
    let _crosshairLocked = false;
    let _crosshairTarget = null;

    function updateCrosshairTargeting() {
        const p = state.player;
        const crosshair = document.getElementById('crosshair');
        if (!crosshair || !p) return;

        _v1.set(0, 0, -1).applyQuaternion(p.quaternion); // player forward

        let bestTarget = null;
        let bestDot = -1;

        const ents = state.entities;
        for (let i = 0, len = ents.length; i < len; i++) {
            const e = ents[i];
            if (e.type !== 'enemy' && e.type !== 'interceptor' && e.type !== 'bomber' && e.type !== 'dreadnought' && e.type !== 'alien-baseship' && e.type !== 'predator') continue;
            if (e.markedForDeletion) continue;

            _v2.copy(e.position).sub(p.position);
            const dist = _v2.length();
            if (dist > 4000) continue; // weapon range — close enough to fire

            _v2.multiplyScalar(1 / dist);
            const dot = _v1.dot(_v2);

            // ~5° cone for precise crosshair alignment (cos(5°) ≈ 0.996)
            // ~15° cone for tracking awareness (cos(15°) ≈ 0.966)
            if (dot > 0.966 && dot > bestDot) {
                bestDot = dot;
                bestTarget = e;
            }
        }

        const wasLocked = _crosshairLocked;

        if (bestTarget && bestDot > 0.993) {
            // Target is centered in crosshair — full lock
            _crosshairLocked = true;
            _crosshairTarget = bestTarget;
            p.lockedTarget = bestTarget;
            crosshair.classList.add('locked');
            crosshair.classList.remove('tracking');
        } else if (bestTarget) {
            // Target near crosshair — tracking (amber)
            _crosshairLocked = false;
            _crosshairTarget = bestTarget;
            crosshair.classList.remove('locked');
            crosshair.classList.add('tracking');
        } else {
            // No target — default green
            _crosshairLocked = false;
            _crosshairTarget = null;
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
        // Weapon dispatch — slots unlock by level: 1=laser, 2+=spread, 3+=torp, 4+=EMP
        switch (p.selectedWeapon) {
            case 0: fireLaser(p, 'player'); break;
            case 1: fireMachineGun(p, 'player'); break;
            case 2: fireTorpedo(p, 'player'); break;
            case 3: firePulseEMP(p, 'player'); break;
        }
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

            // Lives pips
            const livesEl = gh('ghud-lives');
            if (livesEl) {
                const pips = Array.from({ length: state.maxLives }, (_, i) =>
                    i < state.livesRemaining ? '★' : '☆'
                ).join('');
                livesEl.textContent = pips;
                livesEl.style.color = state.livesRemaining <= 1 ? '#ff2222'
                    : state.livesRemaining === 2 ? '#ffaa00' : '#ff4444';
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
    let radarSphere, radarShipMarker, radarForwardMarker, radarBaseMarker;
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
                blip.material.color.setHex(0xff8800);
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
                blip.material.color.setHex(0x44ff44);
                blip.scale.setScalar(1.0);
            } else if (c.type === 'tanker') {
                blip.material.color.setHex(0x00ff88);
                blip.scale.setScalar(1.2);
            } else if (c.type === 'medic') {
                blip.material.color.setHex(0x44ffff);
                blip.scale.setScalar(1.3);
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

            blip.material.transparent = true;
            blip.material.opacity = fadeAlpha;

            // FOV highlight — in ship-local space, forward is -Z, so dot = -nz
            const cosHalfFov = Math.cos(THREE.MathUtils.degToRad(75 / 2));
            if (-nz > cosHalfFov) {
                blip.material.opacity = Math.min(fadeAlpha + 0.3, 1.0);
                blip.scale.multiplyScalar(1.2);
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
        openTutorial
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
