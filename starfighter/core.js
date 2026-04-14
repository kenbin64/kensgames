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
        landingDuration: 5.0, // landing sequence duration
        _briefingShownOnce: false, // first-time auto-deploy of mission panel
        aiWingmen: true, // AI wingmen always present in solo play
        maxLives: 3,
        livesRemaining: 3,
        respawnReason: 'HULL INTEGRITY FAIL',
        _replacementVariant: '',
        _replacementBriefing: '',
        callsign: localStorage.getItem('sf_callsign') || '',
        alienBaseSpawned: false, // alien hive base spawned flag
    };

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
                e.type === 'egg' || e.type === 'youngling') {
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
        let enemies = 0, interceptors = 0, bombers = 0, dreadnoughts = 0, predators = 0;
        let closestDist = Infinity, closestType = '', closestPos = null;
        // Track priority threats with positions for directional comms
        let priorityTarget = null, priorityDist = Infinity, priorityType = '';
        let bomberNearBase = null, bomberBaseDist = Infinity;
        // Track alien-baseship, alien-base (hive), and threats near Resolute
        let alienMothership = null, alienMothershipHullPct = 0;
        let alienHive = null, alienHiveHullPct = 0;
        let threatsNearBase = 0, threatNearBaseDist = Infinity;
        for (let i = 0; i < state.entities.length; i++) {
            const e = state.entities[i];
            if (e.markedForDeletion) continue;
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
        const totalHostile = enemies + interceptors + bombers + dreadnoughts + predators;
        const closestM = Math.floor(Math.sqrt(closestDist));
        const hullPct = p ? Math.floor(p.hull) : 0;
        const shieldPct = p ? Math.floor(p.shields) : 0;
        const basePct = b ? Math.floor((b.hull / dim('baseship.hull')) * 100) : 0;
        const fuelPct = p ? Math.floor(p.fuel) : 0;
        const torpCount = p ? p.torpedoes : 0;
        const speed = p ? Math.floor(p.velocity.length()) : 0;
        return {
            enemies, interceptors, bombers, dreadnoughts, predators, totalHostile,
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
            if (window.SF3D) SF3D.spawnExplosion(this.position);
            if (window.SFAudio) SFAudio.playSound('explosion');
            if (window.SFAudio) SFAudio.playSound('shockwave');

            if (this.type === 'enemy') {
                state.score += dim('score.enemy');
                state.kills++;
                if (this.killedBy === 'player') state.playerKills++;
                if (this.killedBy === 'player' && (state.kills % 3 === 0 || _countActiveHostiles() <= 2)) {
                    if (window.SFAnnouncer) SFAnnouncer.onKill('enemy');
                }
                checkWave();

            } else if (this.type === 'predator') {
                state.score += dim('score.predator');
                state.kills++;
                if (this.killedBy === 'player') state.playerKills++;
                if (window.SFAnnouncer) SFAnnouncer.onKill('predator');
                checkWave();

            } else if (this.type === 'interceptor') {
                state.score += dim('score.interceptor');
                state.kills++;
                if (this.killedBy === 'player') state.playerKills++;
                if (window.SFAnnouncer) SFAnnouncer.onKill('interceptor');
                checkWave();

            } else if (this.type === 'bomber') {
                state.score += dim('score.bomber');
                state.kills++;
                if (this.killedBy === 'player') state.playerKills++;
                if (window.SFAnnouncer) SFAnnouncer.onKill('bomber');
                checkWave();

            } else if (this.type === 'dreadnought') {
                state.score += dim('score.dreadnought');
                state.kills++;
                if (this.killedBy === 'player') state.playerKills++;
                if (window.SFAnnouncer) SFAnnouncer.onKill('dreadnought');
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
            this.flightAssist = true;    // GDD §4.1: FA ON by default
            // Weapon selector — cycle with Q
            this.selectedWeapon = 0;     // 0=laser, 1=gun, 2=pulse, 3=torpedo
        }

        static WEAPONS = ['LASER', 'GUN', 'PULSE', 'TORP'];

        cycleWeapon() {
            this.selectedWeapon = (this.selectedWeapon + 1) % Player.WEAPONS.length;
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
            if (this.boostActive && this.boostTimer > 0) {
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

            // Fuel regen when not using afterburner
            if (!this.afterburnerActive && !this.boostActive) {
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
        state.baseship = new Baseship();
        state.entities.push(state.player, state.baseship);
        state.phase = 'loading';
        state.launchTimer = 0;
        state.arenaRadius = dim('arena.radius');

        // Parse URL params: ?ai=0 disables AI wingmen (on by default)
        const params = new URLSearchParams(window.location.search);
        state.aiWingmen = params.get('ai') !== '0';

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
            if (SFAudio.setVoiceModule) SFAudio.setVoiceModule('au_female');
            SFAudio.startBayAmbience();
        }

        // Procedural orchestral music — ambient intensity in bay
        if (window.SFMusic && window.SFAudio) {
            SFMusic.init(SFAudio.getCtx(), SFAudio.getMasterGain());
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

    // ── Tutorial Prompt: first-game "Want a tutorial?" overlay ──
    function _showTutorialPrompt() {
        const overlay = document.createElement('div');
        overlay.id = 'tutorial-prompt-overlay';
        overlay.style.cssText = 'position:absolute;inset:0;z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);pointer-events:auto';
        overlay.innerHTML = `
            <div style="text-align:center;max-width:480px">
                <div style="font-size:12px;letter-spacing:4px;color:#446688;margin-bottom:12px">EARTH DEFENSE FORCE</div>
                <div style="font-size:11px;color:#88aacc;margin-bottom:8px">CALLSIGN: <span style="color:#0ff;font-size:14px;letter-spacing:2px">${_cs()}</span></div>
                <div style="font-size:20px;color:#ffd24a;margin-bottom:24px;text-shadow:0 0 12px rgba(255,210,74,0.4)">FLIGHT ORIENTATION BRIEFING</div>
                <div style="font-size:13px;color:#aaccdd;margin-bottom:28px;line-height:1.5">Would you like a guided tutorial covering flight controls, weapons, and a practice run?</div>
                <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
                    <button id="tut-yes" class="avtn-btn avtn-btn-green" tabindex="1">YES — BRIEF ME</button>
                    <button id="tut-no" class="avtn-btn avtn-btn-red" tabindex="2">NO — LAUNCH NOW</button>
                    <button id="tut-never" class="avtn-btn avtn-btn-dim" tabindex="3" style="font-size:10px">DON'T ASK AGAIN</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

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

        function _buildTutorialHTML(controller) {
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
                        <div style="font-size:11px;color:#88aacc;margin-top:6px">Callsign: ${_cs()} | Controller: ${controllerName}</div>
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

        // Controller dropdown changes displayed controls
        const select = document.getElementById('tut-controller-select');
        select.onchange = () => {
            const section = document.getElementById('tut-controls-section');
            const val = select.value;
            if (val === 'keyboard') section.innerHTML = _buildTutorialHTML(val).match(/<div id="tut-controls-section">([\s\S]*?)<\/div>\s*<div class="tut-section" style="text-align/)[0] || '';
            // Simpler: just rebuild the whole overlay
            overlay.innerHTML = _buildTutorialHTML(val);
            // Re-attach handlers
            _attachTutorialHandlers();
        };

        function _attachTutorialHandlers() {
            const sel = document.getElementById('tut-controller-select');
            if (sel) sel.onchange = () => {
                overlay.innerHTML = _buildTutorialHTML(sel.value);
                _attachTutorialHandlers();
            };
            const practiceBtn = document.getElementById('tut-practice');
            const doneBtn = document.getElementById('tut-done');
            if (practiceBtn) practiceBtn.onclick = () => {
                overlay.remove();
                _startPracticeMode();
            };
            if (doneBtn) doneBtn.onclick = () => {
                overlay.remove();
                if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();
                _beginLaunchSequence();
            };
        }
        _attachTutorialHandlers();

        // Announcer narrates the briefing — game-state aware (text only, no bot TTS)
        // The tutorial overlay itself provides all the controls info visually

        // Keyboard: Escape to skip
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();
                _beginLaunchSequence();
            }
        });

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
            state.player.position.set(0, 0, -1500);
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
        if (window.SFMusic) SFMusic.setIntensity(0.3);

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
        if (window.SFMusic) SFMusic.setIntensity(0.58);

        // Place player at combat starting position: safely outside baseship, facing away
        const launchDir = new THREE.Vector3(0, 0, -1); // default launch direction
        const combatStartPos = state.baseship.position.clone().add(launchDir.clone().multiplyScalar(1500));
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

    function completeLanding() {
        state.phase = 'docking';
        const prevWave = state.wave;
        state.wave++;
        state.player.torpedoes = dim('player.torpedoes');

        // GDD §9.3: Shield restores, hull carries, fuel replenished
        state.player.shields = dim('player.shields');
        state.player.fuel = dim('player.fuel');
        state.player.boostCooldown = 0;
        state.player.boostActive = false;

        // ── Purge any attached organisms on landing (baseship decontamination) ──
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
        state._emergencyRTB = false; // reset emergency state
        const rtbBtn = document.getElementById('btn-rtb');
        if (rtbBtn) rtbBtn.style.display = 'none';

        // Wave debrief display
        const countdownDisplay = document.getElementById('countdown-display');
        countdownDisplay.style.display = 'block';
        countdownDisplay.style.fontSize = '1.8em';
        countdownDisplay.style.color = '#00ff88';
        countdownDisplay.innerHTML = `WAVE ${prevWave} COMPLETE<br>` +
            `<span style="font-size:0.5em;color:#88ccff">` +
            `Kills: ${state.kills} | Score: ${state.score}<br>` +
            `Hull: ${Math.floor(state.player.hull)}% | Base Hull: ${Math.floor((state.baseship.hull / dim('baseship.hull')) * 100)}%` +
            `</span><br>` +
            `<span style="font-size:0.45em;color:#ffaa00">Rearming... Wave ${state.wave} launching in 8s</span>`;

        // PA debrief
        SFAnnouncer.onWaveComplete(prevWave);

        // GDD §9.3: Music intensity drops to ambient, rebuilds next wave
        if (window.SFMusic) SFMusic.setIntensity(0.1);

        if (state.wave >= 2) {
            setTimeout(() => {
                SFAnnouncer.onNextWaveIntel();
            }, 3000);
        }

        // GDD §9.3: 8s docked, then show launch button for next wave
        setTimeout(() => {
            state.player.position.set(0, -32, 50);
            state.player.velocity.set(0, 0, 0);
            state.player.quaternion.set(0, 0, 0, 1);
            state.player.throttle = 0;
            state.player.pitch = 0;
            state.player.yaw = 0;
            state.player.roll = 0;
            state.phase = 'bay-ready';  // Wait for player to push launch button again
            state.launchTimer = 0;
            state._launchAudioPlayed = false;
            state._launchBlastPlayed = false;
            state._paBriefingDone = false;
            state.cutsceneCamPos = null;
            state.cutsceneCamQuat = null;
            state.cutsceneVelocity = null;
            state.player.hull = Math.min(dim('player.hull'), state.player.hull + 25); // partial hull repair

            // Resupply baseship if damaged
            state.baseship.hull = Math.min(dim('baseship.hull'), state.baseship.hull + dim('baseship.repairHull'));
            state.baseship.shields = Math.min(dim('baseship.shields'), state.baseship.shields + dim('baseship.repairShields'));

            // Audio transition back to bay
            if (window.SFAudio) {
                SFAudio.stopCockpitHum();
                SFAudio.stopThrustRumble();
                SFAudio.stopStrafeHiss();
                SFAudio.startBayAmbience();
            }

            // Setup for next launch
            if (window.SF3D) {
                SF3D.setLaunchPhase(true);
                SF3D.showLaunchBay();
            }

            // Show red launch button for next wave
            const launchBtn = document.getElementById('launch-btn');
            if (launchBtn) launchBtn.style.display = 'block';
            document.getElementById('countdown-display').style.display = 'block';
            document.getElementById('countdown-display').innerHTML = '<span style="font-size:0.35em;color:#446688">LAUNCH BAY — STANDING BY</span>';

            SFAnnouncer.onBayReady();

            document.getElementById('ship-panel').style.display = 'none';
            document.getElementById('gameplay-hud').style.display = 'none';
            document.getElementById('crosshair').style.display = 'none';
        }, 8000);
    }

    const MANIFOLD_ARCHETYPES = {
        enemy: { x: 1.1, y: 1.25, waveX: 0.08, waveY: 0.14, hullBase: 30, hullWave: 5, hullField: 4, speedBase: 80, speedWave: 5, speedField: 6, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
        interceptor: { x: 1.45, y: 1.7, waveX: 0.1, waveY: 0.16, hullBase: 60, hullWave: 8, hullField: 6, speedBase: 160, speedWave: 8, speedField: 10, shieldsBase: 30, shieldsWave: 5, shieldsField: 5 },
        bomber: { x: 1.7, y: 1.2, waveX: 0.12, waveY: 0.11, hullBase: 80, hullWave: 10, hullField: 8, speedBase: 50, speedWave: 3, speedField: 4, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
        predator: { x: 2.2, y: 1.9, waveX: 0.1, waveY: 0.12, hullBase: 500, hullWave: 60, hullField: 20, speedBase: 160, speedWave: 5, speedField: 8, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
        dreadnought: { x: 3.6, y: 2.8, waveX: 0.08, waveY: 0.1, hullBase: 2000, hullWave: 200, hullField: 60, speedBase: 15, speedWave: 1, speedField: 2, shieldsBase: 1000, shieldsWave: 100, shieldsField: 40 },
        'alien-baseship': { x: 3.1, y: 2.4, waveX: 0.09, waveY: 0.11, hullBase: 1000, hullWave: 500, hullField: 80, speedBase: 20, speedWave: 2, speedField: 3, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
        wingman: { x: 1.05, y: 1.1, waveX: 0.06, waveY: 0.09, hullBase: 60, hullWave: 5, hullField: 3, speedBase: 90, speedWave: 3, speedField: 4, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
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

    function spawnWave() {
        // ── Wave 1: Training wave — gentle introduction for new players ──
        if (state.wave === 1) {
            for (let i = 0; i < 3; i++) {
                const r = 1200 + Math.random() * 600; // spawn close — immediate action
                const theta = (Math.PI * 2 / 3) * i + Math.random() * 0.4; // spread evenly, slight jitter
                const phi = Math.PI / 2 + (Math.random() - 0.5) * 0.6; // cluster near horizon, easier to spot
                const x = r * Math.sin(phi) * Math.cos(theta);
                const y = r * Math.sin(phi) * Math.sin(theta);
                const z = r * Math.cos(phi);

                const e = new Entity('enemy', x, y, z);
                const profile = deriveCombatProfile('enemy', state.wave, { training: true, speedScale: 0.9 });
                e.hull = profile.hull;
                e.maxSpeed = profile.maxSpeed;
                e._manifoldDerivation = profile.trace;
                state.entities.push(e);
            }
            SFAnnouncer.onWaveStart();
            return; // skip all advanced enemy types for wave 1
        }

        const count = 5 + state.wave * 2;
        // Drones (basic enemies)
        const droneCount = Math.max(2, count - Math.floor(state.wave * 0.5));
        for (let i = 0; i < droneCount; i++) {
            const r = 1200 + Math.random() * 800;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            const e = new Entity('enemy', x, y, z);
            const profile = deriveCombatProfile('enemy', state.wave);
            e.hull = profile.hull;
            e.maxSpeed = profile.maxSpeed;
            e._manifoldDerivation = profile.trace;
            state.entities.push(e);
        }

        // Interceptors spawn wave 2+ — fast flankers, target the player
        if (state.wave >= 2) {
            const intCount = Math.min(4, Math.floor(state.wave / 2));
            for (let i = 0; i < intCount; i++) {
                const r = 1500 + Math.random() * 800;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos((Math.random() * 2) - 1);
                const x = r * Math.sin(phi) * Math.cos(theta);
                const y = r * Math.sin(phi) * Math.sin(theta);
                const z = r * Math.cos(phi);

                const int = new Entity('interceptor', x, y, z);
                const profile = deriveCombatProfile('interceptor', state.wave);
                int.hull = profile.hull;
                int.shields = profile.shields;
                int.maxSpeed = profile.maxSpeed;
                int._manifoldDerivation = profile.trace;
                int.radius = dim('entity.interceptor.radius');
                state.entities.push(int);
            }
        }

        // Bombers spawn wave 3+ — slow, beeline for baseship
        if (state.wave >= 3) {
            const bombCount = Math.min(4, Math.floor((state.wave - 2) / 1));
            for (let i = 0; i < bombCount; i++) {
                const r = 2000 + Math.random() * 800;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos((Math.random() * 2) - 1);
                const x = r * Math.sin(phi) * Math.cos(theta);
                const y = r * Math.sin(phi) * Math.sin(theta);
                const z = r * Math.cos(phi);

                const bm = new Entity('bomber', x, y, z);
                const profile = deriveCombatProfile('bomber', state.wave, { speedScale: 0.98 });
                bm.hull = profile.hull;
                bm.shields = profile.shields;
                bm.maxSpeed = profile.maxSpeed;
                bm._manifoldDerivation = profile.trace;
                bm.radius = dim('entity.bomber.radius');
                bm._bombCooldown = 0;
                bm._bombInterval = dim('enemy.bomber.bombInterval');
                state.entities.push(bm);
            }
        }

        // Alien Baseship spawns on wave 2+, attacks friendly baseship
        if (state.wave >= 2) {
            const r = 2500 + Math.random() * 1000;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            const ab = new Entity('alien-baseship', x, y, z);
            const profile = deriveCombatProfile('alien-baseship', state.wave, { speedScale: 1.0 });
            ab.hull = profile.hull;
            ab.maxSpeed = profile.maxSpeed;
            ab._manifoldDerivation = profile.trace;
            ab.radius = dim('entity.alien-baseship.radius');
            state.entities.push(ab);
        }

        // Predator Drones spawn on wave 4+ — fast, armored, plasma-spewing hunters
        if (state.wave >= 4) {
            const predCount = Math.min(3, Math.floor((state.wave - 3) / 2) + 1); // 1 at wave 4, 2 at wave 6, 3 at wave 8+
            for (let i = 0; i < predCount; i++) {
                const r = 2000 + Math.random() * 1000;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos((Math.random() * 2) - 1);
                const x = r * Math.sin(phi) * Math.cos(theta);
                const y = r * Math.sin(phi) * Math.sin(theta);
                const z = r * Math.cos(phi);

                const pred = new Entity('predator', x, y, z);
                const profile = deriveCombatProfile('predator', state.wave);
                pred.hull = profile.hull;
                pred.shields = profile.shields;
                pred.maxSpeed = profile.maxSpeed;
                pred._manifoldDerivation = profile.trace;
                pred.radius = dim('entity.predator.radius');
                pred._turnRate = 0.4;                 // slow turn rate (not nimble)
                pred._plasmaTimer = 0;                // cooldown between plasma bursts
                pred._plasmaCooldown = dim('enemy.predator.plasmaCooldown');
                pred._consumeTarget = null;           // entity it's trying to eat
                pred._consuming = false;              // currently consuming a kill
                pred._consumeTimer = 0;
                pred._eggTimer = 8 + Math.random() * 5; // time until first egg lay
                state.entities.push(pred);
            }
        }

        // Dreadnought spawns on wave 6+ (boss wave) — GDD: every 5th wave after W6
        if (state.wave >= 6 && (state.wave === 6 || (state.wave - 6) % 5 === 0)) {
            const r = 3000 + Math.random() * 1000;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            const dn = new Entity('dreadnought', x, y, z);
            const profile = deriveCombatProfile('dreadnought', state.wave - 5);
            dn.hull = profile.hull;
            dn.shields = profile.shields;
            dn.maxSpeed = profile.maxSpeed;
            dn._manifoldDerivation = profile.trace;
            dn.radius = dim('entity.dreadnought.radius');
            dn._turretCooldown = 0;
            dn._turretInterval = dim('enemy.dreadnought.turretInterval');
            dn._beamCooldown = dim('enemy.dreadnought.beamCooldown');
            dn._beamCharging = false;
            state.entities.push(dn);
        }

        // Alien Hive Base — stationary enemy structure, cooperative objective
        // Spawns once at wave 5, persists until destroyed (VICTORY condition)
        if (state.wave === 5 && !state.alienBaseSpawned) {
            // Place far from the Resolute, opposite side of the arena
            const baseDir = state.baseship ? state.baseship.position.clone().negate().normalize() : new THREE.Vector3(1, 0, 0);
            const hivePos = baseDir.multiplyScalar(5000);
            const hive = new Entity('alien-base', hivePos.x, hivePos.y + 200, hivePos.z);
            hive.hull = dim('hive.hull');
            hive.maxSpeed = 0; // stationary
            hive.radius = dim('entity.alien-base.radius');
            hive.velocity.set(0, 0, 0);
            state.entities.push(hive);
            state.alienBaseSpawned = true;

            SFAnnouncer.onHiveDiscovered(hive);
        }

        // Fuel Tanker — friendly support, spawns between waves 3+ to resupply player
        if (state.wave >= 3 && state.wave % 2 === 1) { // odd waves from 3+
            _spawnTanker();
        }

        // AI Wingmen: spawn 2-3 allies if enabled (they fight enemies for you)
        if (state.aiWingmen) {
            const wingmenCount = 2 + (state.wave >= 3 ? 1 : 0);
            const callsigns = ['Alpha-2', 'Alpha-3', 'Alpha-4'];
            for (let i = 0; i < wingmenCount; i++) {
                const offset = new THREE.Vector3(
                    (i === 0 ? -80 : i === 1 ? 80 : 0),
                    (i === 2 ? 40 : 0),
                    100 + Math.random() * 50
                );
                const spawnPos = state.player.position.clone().add(offset);
                const w = new Entity('wingman', spawnPos.x, spawnPos.y, spawnPos.z);
                const profile = deriveCombatProfile('wingman', state.wave);
                w.hull = profile.hull;
                w.maxSpeed = profile.maxSpeed;
                w._manifoldDerivation = profile.trace;
                w.callsign = callsigns[i];
                w.quaternion.copy(state.player.quaternion);
                state.entities.push(w);
            }
        }

        SFAnnouncer.onWaveStart();
    }

    function checkWave() {
        const enemies = state.entities.filter(e => (e.type === 'enemy' || e.type === 'interceptor' || e.type === 'bomber' || e.type === 'dreadnought' || e.type === 'alien-baseship' || e.type === 'predator' || e.type === 'egg' || e.type === 'youngling') && !e.markedForDeletion);
        if (enemies.length === 0 && state.phase === 'combat') {
            // All enemies cleared - time to return to baseship
            state.phase = 'land-approach';
            state.autopilotActive = false; // Reset autopilot for fresh approach
            state.autopilotTimer = 0;
            SFAnnouncer.onWaveClear();

            // GDD §9.3: Music intensity drops on wave clear
            if (window.SFMusic) SFMusic.setIntensity(0.2);
        }
    }

    function gameOver(reason) {
        state.running = false;
        document.getElementById('death-screen').style.display = 'flex';
        document.getElementById('death-reason').innerText = reason;
        document.getElementById('gameplay-hud').style.display = 'none';
        document.getElementById('radar-overlay').style.display = 'none';
    }

    // ── Respawn system: countdown overlay, then reset player into bay ──
    function _showRespawnScreen() {
        const cdEl = document.getElementById('countdown-display');
        if (cdEl) {
            cdEl.style.display = 'block';
            cdEl.style.fontSize = '3em';
            cdEl.style.color = '#ff4444';
            cdEl.style.textShadow = '0 0 16px rgba(255, 40, 40, 0.75)';
        }
        // Hide gameplay HUD during respawn countdown
        const hud = document.getElementById('gameplay-hud');
        if (hud) hud.style.opacity = '0.3';
        const cross = document.getElementById('crosshair');
        if (cross) cross.style.display = 'none';
    }

    function _updateRespawn(dt) {
        if (!state.respawning) return false;
        state.respawnTimer -= dt;

        const cdEl = document.getElementById('countdown-display');
        if (cdEl) {
            const sec = Math.max(0, Math.ceil(state.respawnTimer));
            const currentLife = Math.max(1, state.maxLives - state.livesRemaining);
            const nextLife = Math.min(state.maxLives, currentLife + 1);
            const inBriefPhase = state.respawnTimer <= 3.8;

            if (!inBriefPhase) {
                cdEl.innerHTML = `<span style="color:#ff3030">${state.respawnReason || 'HULL INTEGRITY FAIL'}</span><br>` +
                    `<span style="font-size:0.44em;color:#ffaa44">SHIP DESTROYED — LIFE ${currentLife}/${state.maxLives} LOST</span><br>` +
                    `<span style="font-size:0.38em;color:#ffdd99">INITIATING PILOT ${nextLife}/${state.maxLives}...</span>`;
            } else {
                cdEl.innerHTML = `<span style="color:#ff8844">${state._replacementVariant || 'Replacement frame online.'}</span><br>` +
                    `<span style="font-size:0.36em;color:#aee8ff">${state._replacementBriefing || _makeDynamicBattleBrief()}</span><br>` +
                    `<span style="font-size:0.34em;color:#ffdd99">LAUNCH BAY SYNC IN ${sec}s</span>`;
            }
        }

        if (state.respawnTimer <= 0) {
            state.respawning = false;
            // Recreate player
            state.player = new Player();
            state.player.hull = dim('player.hull');
            state.player.shields = dim('player.shields');
            state.entities.push(state.player);
            if (M) M.add(state.player);
            if (window.SFInput) SFInput.init(state.player);

            // Reset to launch bay
            state.phase = 'bay-ready';
            state.launchTimer = 0;
            state._launchAudioPlayed = false;
            state._launchBlastPlayed = false;
            state._paBriefingDone = false;

            if (window.SF3D) {
                SF3D.setLaunchPhase(true);
                SF3D.showLaunchBay();
                SF3D.showCockpit(true);
            }
            if (window.SFAudio) {
                SFAudio.stopCockpitHum();
                SFAudio.stopThrustRumble();
                SFAudio.stopStrafeHiss();
                SFAudio.startBayAmbience();
            }

            // Restore UI
            const hud = document.getElementById('gameplay-hud');
            if (hud) hud.style.opacity = '1';
            const cdEl2 = document.getElementById('countdown-display');
            if (cdEl2) {
                cdEl2.style.display = 'block';
                cdEl2.innerHTML = '<span style="font-size:0.35em;color:#446688">LAUNCH BAY — STANDING BY</span>';
            }
            const launchBtn = document.getElementById('launch-btn');
            if (launchBtn) launchBtn.style.display = 'block';
            document.getElementById('ship-panel').style.display = 'none';

            SFAnnouncer.onRespawnReady();
        }
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
                    const launchSpeed = accelProgress * accelProgress * 1200;
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
                    const exitSpeed = 1200 * (1.0 - exitProgress * 0.5);
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

            // ── Landing Approach Phase — GDD §9.3: Auto-pilot return ──
            if (state.phase === 'land-approach') {
                // Initialize autopilot on first frame
                if (!state.autopilotActive) {
                    state.autopilotActive = false;
                    state.autopilotTimer = 0;
                    // Show autopilot prompt
                    const cdEl = document.getElementById('countdown-display');
                    cdEl.style.display = 'block';
                    cdEl.innerHTML = 'WAVE CLEAR!<br><span style="font-size:0.4em;color:#00ff88">Press <b>SPACE</b> to engage autopilot<br>or fly manually to base</span>';
                    cdEl.style.fontSize = '2.5em';
                    cdEl.style.color = '#00ffff';
                    SFAnnouncer.onWaveClear();
                }

                // Check for autopilot activation
                if (!state.autopilotActive && window.SFInput && SFInput.isKeyDown('Space')) {
                    state.autopilotActive = true;
                    state.autopilotTimer = 0;
                    SFAnnouncer.onAutopilotEngage();
                    if (window.SFAudio) SFAudio.playSound('hud_power_up');
                }

                if (state.autopilotActive) {
                    // GDD §9.3: 15s autopilot — smoothly fly back to baseship
                    state.autopilotTimer += safeDt;
                    const apProgress = Math.min(state.autopilotTimer / 12.0, 1.0); // 12s travel, 3s dock

                    // Calculate direction and distance to baseship bay entrance
                    _v1.copy(state.baseship.position).add(_v2.set(0, 0, 800));
                    _v2.copy(_v1).sub(state.player.position);
                    const distToBase = _v2.length();

                    // Smoothly turn and fly toward base
                    _v2.normalize();
                    _q1.setFromUnitVectors(_v1.set(0, 0, -1), _v2);
                    state.player.quaternion.slerp(_q1, safeDt * 2.0);

                    // Speed profile: accelerate, cruise, decelerate
                    let apSpeed;
                    if (apProgress < 0.2) {
                        apSpeed = apProgress / 0.2 * 150; // accelerate
                    } else if (apProgress < 0.7) {
                        apSpeed = 150; // cruise
                    } else {
                        apSpeed = 150 * (1.0 - (apProgress - 0.7) / 0.3); // decelerate
                        apSpeed = Math.max(20, apSpeed);
                    }

                    _v1.set(0, 0, -1).applyQuaternion(state.player.quaternion);
                    state.player.velocity.copy(_v1.multiplyScalar(apSpeed));

                    // Show distance countdown
                    const cdEl = document.getElementById('countdown-display');
                    cdEl.style.display = 'block';
                    cdEl.innerHTML = `AUTOPILOT<br><span style="font-size:0.35em;color:#88ccff">Distance: ${Math.floor(distToBase)}m</span>`;
                    cdEl.style.fontSize = '2em';
                    cdEl.style.color = '#00ff88';

                    // Auto-dock when close enough or timer expires
                    if (distToBase < 800 || state.autopilotTimer >= 15.0) {
                        state.phase = 'landing';
                        state.landingTimer = 0;
                        state.autopilotActive = false;
                        cdEl.style.display = 'none';
                        SFAnnouncer.onDock();
                        state.score += 500 * state.wave;
                    }
                } else {
                    // Manual approach — allow player input
                    if (window.SFInput) SFInput.update(safeDt);

                    // Hide hangar obstruction for safe landing approach
                    if (window.SF3D) SF3D.hideHangarBay();

                    const distToBaseship = state.player.position.distanceTo(state.baseship.position);
                    const playerSpeed = state.player.velocity.length();

                    // Manual dock when close and slow
                    if (distToBaseship < 800 && playerSpeed < 50) {
                        const landPrompt = document.getElementById('countdown-display');
                        landPrompt.style.display = 'block';
                        landPrompt.innerHTML = 'PRESS <b>SPACE</b> TO LAND';
                        landPrompt.style.fontSize = '2em';
                        landPrompt.style.color = '#00ff00';

                        if (window.SFInput && SFInput.isKeyDown('Space')) {
                            state.phase = 'landing';
                            state.landingTimer = 0;
                            landPrompt.style.display = 'none';
                            SFAnnouncer.onDock();
                            state.score += 500 * state.wave;
                        }
                    } else {
                        const landPrompt = document.getElementById('countdown-display');
                        landPrompt.style.display = 'block';
                        landPrompt.innerHTML = `APPROACH BASE<br><span style="font-size:0.8em">Distance: ${Math.floor(distToBaseship)}m  Speed: ${Math.floor(playerSpeed)}m/s</span><br><span style="font-size:0.6em;color:#00ff88">Press SPACE for autopilot</span>`;
                        landPrompt.style.fontSize = '1.2em';
                    }
                }

                // Process combat updates in case more enemies appear
                for (let i = 0, len = state.entities.length; i < len; i++) {
                    const e = state.entities[i];
                    if (e.type === 'predator') updatePredatorAI(e, safeDt);
                    else if (e.type === 'tanker') updateTankerAI(e, safeDt);
                    else if (e.type === 'medic') updateMedicAI(e, safeDt);
                    else if (AI_PROFILES[e.type]) updateCombatAI(e, safeDt);
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

                // Apply velocity → position (3D physics) during approach
                for (let i = 0, len = state.entities.length; i < len; i++) {
                    const e = state.entities[i];
                    if (e.markedForDeletion) continue;
                    e.position.x += e.velocity.x * safeDt;
                    e.position.y += e.velocity.y * safeDt;
                    e.position.z += e.velocity.z * safeDt;
                }

                checkWave();
                updateHUD();
                if (window.SF3D) SF3D.render(state);
                return;
            }

            // ── Landing Phase (cinematic return to bay) ──
            if (state.phase === 'landing') {
                state.landingTimer += safeDt;
                const t = state.landingTimer / state.landingDuration;
                const progress = Math.min(t, 1.0);

                // Move player toward baseship hangar
                _v1.copy(state.baseship.position).add(_v2.set(0, -32, 50));
                state.player.position.lerp(_v1, progress * 0.3);


                // Dock the player to baseship on completion
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

            if (window.SFInput && !state._playerDisabled) {
                SFInput.update(safeDt);
                SFInput.updateLivePanel();
            }

            if (state.player && state.player.lockedTarget && state.player.lockedTarget.markedForDeletion) {
                state.player.lockedTarget = null;
            }

            // Autonomous announcer — observe game state and generate chatter
            SFAnnouncer.observe(safeDt);
            state.commTimer += safeDt;
            if (state.commTimer >= state.commInterval) {
                state.commTimer = 0;
                const chat = SFAnnouncer.generateChatter();
                if (chat) addComm(chat.sender, chat.msg, chat.type);
                state.commInterval = 5 + Math.random() * 8;
            }

            // ── INTENT PHASE: entities declare what they want to do ──
            state.player.resolveIntent(safeDt);

            // Feed engine audio with current thrust state
            if (window.SFAudio) {
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
            const ents = state.entities;
            for (let i = 0, len = ents.length; i < len; i++) {
                const e = ents[i];
                if (e.type === 'predator') updatePredatorAI(e, safeDt);
                else if (e.type === 'tanker') updateTankerAI(e, safeDt);
                else if (e.type === 'medic') updateMedicAI(e, safeDt);
                else if (AI_PROFILES[e.type]) updateCombatAI(e, safeDt);
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

            // Apply velocity → position for all entities (3D physics step)
            // The unified Manifold tracks 2D projections; this is the authoritative 3D update
            for (let i = 0, len = ents.length; i < len; i++) {
                const e = ents[i];
                if (e.markedForDeletion) continue;
                e.position.x += e.velocity.x * safeDt;
                e.position.y += e.velocity.y * safeDt;
                e.position.z += e.velocity.z * safeDt;
            }

            // ── OBSERVE PHASE: read manifold state for game events ──

            // Age-based expiry for projectiles (replaces setTimeout)
            for (let i = 0, len = ents.length; i < len; i++) {
                const e = ents[i];
                if (e.maxAge > 0) {
                    e.age += safeDt;
                    if (e.age >= e.maxAge) {
                        e.markedForDeletion = true;
                        if (M) M.remove(e.id);
                        continue;
                    }
                }
                // Range-based expiry for projectiles far from player
                if (e.type === 'laser' || e.type === 'machinegun' || e.type === 'torpedo') {
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

            // Observe proximity events (collisions) from the manifold
            const collisionPairs = M ? M.detectCollisions() : [];
            for (const [a, b] of collisionPairs) {
                if (a.markedForDeletion || b.markedForDeletion) continue;

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

                const distSq = a.position.distanceToSquared(b.position);
                const rSum = a.radius + b.radius;
                if (distSq < rSum * rSum) {
                    handleCollision(a, b);
                }
            }

            // Cleanup — inline filter with swap-remove for O(1) per deletion
            for (let i = state.entities.length - 1; i >= 0; i--) {
                if (state.entities[i].markedForDeletion) {
                    state.entities[i] = state.entities[state.entities.length - 1];
                    state.entities.pop();
                }
            }
            if (M) M.reap();

            // ── Auto-dispatch support ships when player is in trouble ──
            _checkMedicDispatch(safeDt);

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
                if (closestDist < 800 * 800) musicIntensity += 0.3; // fighter very close — urgency
                else if (closestDist < 1500 * 1500) musicIntensity += 0.15;
                if (nearCount > 3) musicIntensity += 0.15; // multiple threats — crescendo
                if (nearCount > 6) musicIntensity += 0.15; // major battle
                const basePct = state.baseship ? state.baseship.hull / dim('baseship.hull') : 1;
                if (basePct < 0.3) musicIntensity += 0.15; // baseship in danger
                SFMusic.setIntensity(Math.min(1, musicIntensity));

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
            heavyRange: dim('enemy.heavyRange') || 3000,
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
        if (!entity._evading) {
            entity._evading = true;
            entity._evadeTimer = 0;
            entity._evadeDir = new THREE.Vector3(
                (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5)
            ).normalize();
        }
        entity._evadeTimer += dt;
        if (entity._evadeTimer > 1.5) {
            entity._evadeTimer = 0;
            entity._evadeDir.set(
                (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5)
            ).normalize();
        }
        _q1.setFromUnitVectors(_v2.set(0, 0, -1), entity._evadeDir);
        entity.quaternion.slerp(_q1, dt * 4.0);
        const fwd = _v1.set(0, 0, -1).applyQuaternion(entity.quaternion);
        entity.velocity.copy(fwd).multiplyScalar(entity.maxSpeed * 1.5);
        // Return fire while evading
        if (!entity._fireCooldown) entity._fireCooldown = 0;
        entity._fireCooldown -= dt;
        if (entity._fireCooldown <= 0) {
            const dx = entity.position.x - state.player.position.x;
            const dy = entity.position.y - state.player.position.y;
            const dz = entity.position.z - state.player.position.z;
            if (dx * dx + dy * dy + dz * dz < 640000) {
                fireLaser(entity, 'enemy');
                entity._fireCooldown = dim('enemy.fireCooldown');
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
        _v1.set(0, -10, -20).applyQuaternion(entity.quaternion);
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
        _v1.set(0, 0, -40).applyQuaternion(entity.quaternion);
        const t = new Entity('torpedo',
            entity.position.x + _v1.x, entity.position.y + _v1.y, entity.position.z + _v1.z);
        t.quaternion.copy(entity.quaternion);
        _v1.set(0, 0, -180).applyQuaternion(t.quaternion);
        t.velocity.copy(_v1);
        t.owner = 'enemy';
        t.radius = 12;
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
                entity._fireCooldown = dim('enemy.fireCooldown') * prof.cooldownMul + Math.random() * 0.3;
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
            if (entity._beamCooldown <= 0 && dist2 < (prof.heavyRange || 3000) ** 2) {
                _combatFireHeavyTorp(entity, target);
                entity._beamCooldown = prof.heavyCooldown || 15;
            }
        }
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

        // Plasma attack — fires when target is roughly ahead and in range (300m)
        pred._plasmaTimer -= dt;
        if (pred._plasmaTimer <= 0) {
            const toTarget = _v1.copy(target.position).sub(pred.position);
            const dist = toTarget.length();
            if (dist < 500) { // can spew plasma several hundred meters
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
        const spawnOffset = _v1.set(0, -15, -10).applyQuaternion(source.quaternion);
        const p = new Entity('plasma',
            source.position.x + spawnOffset.x,
            source.position.y + spawnOffset.y,
            source.position.z + spawnOffset.z);
        p.quaternion.copy(source.quaternion);

        // Aim toward target with slight spread
        const dir = _v2.copy(target.position).sub(p.position).normalize();
        p.velocity.copy(dir.multiplyScalar(250)); // plasma velocity — slower than lasers
        p.owner = 'predator';
        p.radius = 8;
        p.maxAge = 3.0;  // ~750m max range at 250m/s
        p.damage = 60;   // base damage (reduced with distance)
        p._sourcePos = source.position.clone(); // track origin for falloff
        p._sourceEntity = source; // track which predator fired it
        state.entities.push(p);

        if (window.SF3D) SF3D.spawnPlasma(p);
        if (window.SFAudio) SFAudio.playSound('plasma_spit');
    }

    // ══════════════════════════════════════
    // FUEL TANKER — friendly resupply ship, docks with player
    // ══════════════════════════════════════

    function _spawnTanker() {
        // Spawn from behind the baseship
        if (!state.baseship) return;
        const spawnPos = state.baseship.position.clone().add(
            new THREE.Vector3((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 200, 500)
        );
        const tk = new Entity('tanker', spawnPos.x, spawnPos.y, spawnPos.z);
        tk.hull = dim('entity.tanker.hull');
        tk.shields = dim('entity.tanker.shields');
        tk.maxSpeed = dim('entity.tanker.maxSpeed');
        tk.radius = dim('entity.tanker.radius');
        tk._docked = false;
        tk._dockTimer = 0;
        tk._dockDuration = 5.0;  // 5s to resupply
        tk._resupplied = false;
        state.entities.push(tk);
        SFAnnouncer.onTankerDeploy();
    }

    function updateTankerAI(tk, dt) {
        if (!state.player || state.player.markedForDeletion) {
            // Player dead — RTB immediately
            tk._docked = false;
            tk._resupplied = true;
        }
        if (tk._docked) {
            // Stay with player during dock
            tk._dockTimer += dt;
            _v1.copy(state.player.position).add(new THREE.Vector3(40, 10, 30));
            tk.position.lerp(_v1, dt * 2.0);
            tk.velocity.set(0, 0, 0);

            // Resupply over time
            if (!tk._resupplied) {
                state.player.fuel = Math.min(100, state.player.fuel + dt * dim('entity.tanker.fuelRepairRate'));
                state.player.torpedoes = Math.min(8, state.player.torpedoes + (dt > 0.5 ? 1 : 0));
                state.player.hull = Math.min(100, state.player.hull + dt * dim('entity.tanker.hullRepairRate'));
                state.player.shields = Math.min(100, state.player.shields + dt * dim('entity.tanker.shieldRepairRate'));
            }

            if (tk._dockTimer >= tk._dockDuration) {
                tk._resupplied = true;
                tk._docked = false;
                SFAnnouncer.onTankerDone();
            }
            return;
        }

        if (tk._resupplied) {
            // RTB — fly back to baseship and despawn
            if (state.baseship) {
                _v1.copy(state.baseship.position).sub(tk.position);
                if (_v1.lengthSq() < 160000) { // within 400m of baseship
                    tk.markedForDeletion = true;
                    if (M) M.remove(tk.id);
                    return;
                }
                _v1.normalize();
                _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
                tk.quaternion.slerp(_q1, dt * 1.5);
            }
            const fwd = _v2.set(0, 0, -1).applyQuaternion(tk.quaternion);
            tk.velocity.copy(fwd).multiplyScalar(tk.maxSpeed);
            return;
        }

        // Approach player for docking
        _v1.copy(state.player.position).sub(tk.position);
        const dist2 = _v1.lengthSq();

        if (dist2 < dim('entity.tanker.dockRange') ** 2) {
            tk._docked = true;
            tk._dockTimer = 0;
            SFAnnouncer.onTankerDock();
            if (window.SFAudio) SFAudio.playSound('comm_beep');
            return;
        }

        _v1.normalize();
        _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
        tk.quaternion.slerp(_q1, dt * 1.5);

        const fwd = _v2.set(0, 0, -1).applyQuaternion(tk.quaternion);
        tk.velocity.copy(fwd).multiplyScalar(tk.maxSpeed);
    }

    // ══════════════════════════════════════
    // MEDICAL FRIGATE — indestructible, dispatched when player hull/shields critical
    // Repairs hull + shields on docking. Autonomous: reacts to real-time damage.
    // ══════════════════════════════════════

    let _medicActive = false; // only one medic in the field at a time
    let _medicCooldownTimer = 0; // prevent spam-dispatching

    function _spawnMedic() {
        if (_medicActive) return;
        if (!state.baseship || !state.player || state.player.markedForDeletion) return;
        _medicActive = true;

        const spawnPos = state.baseship.position.clone().add(
            new THREE.Vector3((Math.random() - 0.5) * 300, 80 + Math.random() * 100, 400)
        );
        const med = new Entity('medic', spawnPos.x, spawnPos.y, spawnPos.z);
        med.hull = dim('entity.medic.hull');
        med.shields = dim('entity.medic.shields');
        med.maxSpeed = dim('entity.medic.maxSpeed');
        med.radius = dim('entity.medic.radius');
        med._docked = false;
        med._dockTimer = 0;
        med._dockDuration = 6.0; // 6s heal cycle
        med._healed = false;
        state.entities.push(med);

        const callsigns = ['Mercy', 'Nightingale', 'Caduceus', 'Aegis'];
        med._callsign = callsigns[(state.wave + state.kills) % callsigns.length];

        SFAnnouncer.onMedicDeploy(med._callsign);
    }

    function updateMedicAI(med, dt) {
        if (!state.player || state.player.markedForDeletion) {
            med._docked = false;
            med._healed = true;
        }

        if (med._docked) {
            med._dockTimer += dt;
            // Stay alongside player
            _v1.copy(state.player.position).add(_v2.set(-45, 15, 25));
            med.position.lerp(_v1, dt * 2.0);
            med.velocity.set(0, 0, 0);

            if (!med._healed) {
                state.player.hull = Math.min(100, state.player.hull + dt * dim('entity.medic.hullRepairRate'));
                state.player.shields = Math.min(100, state.player.shields + dt * dim('entity.medic.shieldRepairRate'));

                // Periodic status comms
                if (!med._lastCommTime) med._lastCommTime = 0;
                med._lastCommTime -= dt;
                if (med._lastCommTime <= 0) {
                    med._lastCommTime = 2.5;
                    SFAnnouncer.onMedicProgress(med._callsign);
                }
            }

            if (med._dockTimer >= med._dockDuration) {
                med._healed = true;
                med._docked = false;
                SFAnnouncer.onMedicDone(med._callsign);
            }
            return;
        }

        if (med._healed) {
            // RTB — fly back to baseship and despawn
            if (state.baseship) {
                _v1.copy(state.baseship.position).sub(med.position);
                if (_v1.lengthSq() < 160000) {
                    med.markedForDeletion = true;
                    if (M) M.remove(med.id);
                    _medicActive = false;
                    _medicCooldownTimer = 30; // 30s before another can dispatch
                    return;
                }
                _v1.normalize();
                _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
                med.quaternion.slerp(_q1, dt * 1.5);
            }
            const fwd = _v2.set(0, 0, -1).applyQuaternion(med.quaternion);
            med.velocity.copy(fwd).multiplyScalar(med.maxSpeed);
            return;
        }

        // Approach player for docking
        _v1.copy(state.player.position).sub(med.position);
        const dist2 = _v1.lengthSq();

        if (dist2 < dim('entity.medic.dockRange') ** 2) {
            med._docked = true;
            med._dockTimer = 0;
            SFAnnouncer.onMedicDock(med._callsign);
            if (window.SFAudio) SFAudio.playSound('comm_beep');
            return;
        }

        _v1.normalize();
        _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
        med.quaternion.slerp(_q1, dt * 1.5);

        const fwd = _v2.set(0, 0, -1).applyQuaternion(med.quaternion);
        med.velocity.copy(fwd).multiplyScalar(med.maxSpeed);
    }

    // Auto-dispatch: check during combat if player needs medical aid
    function _checkMedicDispatch(dt) {
        if (state.phase !== 'combat') return;
        if (_medicActive) return;
        if (!state.player || state.player.markedForDeletion) return;

        _medicCooldownTimer = Math.max(0, _medicCooldownTimer - dt);
        if (_medicCooldownTimer > 0) return;

        // Dispatch when hull < 40% or shields gone and hull < 60%
        const hullPct = state.player.hull;
        const shieldPct = state.player.shields;
        if (hullPct < 40 || (shieldPct <= 0 && hullPct < 60)) {
            _spawnMedic();
        }
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

    // ── Request Dock — manual redock, player flies themselves ──
    function _requestDock() {
        if (state.phase !== 'combat') return;
        state.phase = 'land-approach';
        state.autopilotActive = false;
        state.autopilotTimer = 0;
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
            if (dist > 2000) continue; // weapon range — close enough to fire

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
        l.radius = dim('weapon.laser.radius');
        l.maxAge = dim('weapon.laser.maxAge');
        l.damage = dim('weapon.laser.damage');
        state.entities.push(l);
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
        t.radius = dim('weapon.torpedo.radius');
        t.target = source.lockedTarget;
        t.maxAge = dim('weapon.torpedo.maxAge');
        t.damage = dim('weapon.torpedo.damage');
        t.launchTime = performance.now() / 1000;
        state.entities.push(t);
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
        g.maxAge = dim('weapon.gun.maxAge');
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
        switch (p.selectedWeapon) {
            case 0: fireLaser(p, 'player'); break;
            case 1: fireMachineGun(p, 'player'); break;
            case 2: firePulseEMP(p, 'player'); break;
            case 3: fireTorpedo(p, 'player'); break;
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
            if (window.SF3D) {
                // GDD §8.3: Pulse = #00FFAA, Torpedo = #4488FF shield flash
                const color = a.type === 'torpedo' ? 0x4488ff : a.type === 'machinegun' ? 0xffcc00 : 0x00ffaa;
                SF3D.spawnImpactEffect(a.position, color);
            }
            if (!(b.type === 'player' && state.phase === 'launching')) {
                const effectiveDmg = b.type === 'predator' ? _predatorArmorDamage(damage, a, b) : damage;
                b.takeDamage(effectiveDmg);
            }
            a.markedForDeletion = true;
        } else if (b.type === 'laser' || b.type === 'machinegun' || b.type === 'torpedo') {
            const damage = b.damage || (b.type === 'torpedo' ? 80 : 15);
            if (window.SF3D) {
                const color = b.type === 'torpedo' ? 0x4488ff : b.type === 'machinegun' ? 0xffcc00 : 0x00ffaa;
                SF3D.spawnImpactEffect(b.position, color);
            }
            if (!(a.type === 'player' && state.phase === 'launching')) {
                const effectiveDmg = a.type === 'predator' ? _predatorArmorDamage(damage, b, a) : damage;
                a.takeDamage(effectiveDmg);
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
        const speed = Math.floor(state.player.velocity.length());
        const throttle = Math.floor(state.player.throttle * 100);
        const fuel = Math.floor(state.player.fuel);
        const hullPct = Math.floor((state.player.hull / dim('player.hull')) * 100);
        const shieldPct = Math.floor((state.player.shields / dim('player.shields')) * 100);
        const basePct = Math.floor((state.baseship.hull / dim('baseship.hull')) * 100);
        const maxSpd = state.player.boostActive ? state.player.boostSpeed
            : state.player.afterburnerActive ? state.player.afterburnerSpeed
                : state.player.maxSpeed;

        const hudSignature = [
            speed, throttle, fuel, hullPct, shieldPct, basePct,
            maxSpd, state.wave, state.score, state.player.torpedoes, state.kills,
            state.player.boostActive ? 1 : 0,
            Math.ceil(state.player.boostCooldown || 0),
            state.player.flightAssist ? 1 : 0,
            state.player.afterburnerActive ? 1 : 0
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
                if (state.player.boostActive) {
                    modeEl.innerText = 'BOOST';
                    modeEl.style.color = '#ff8800';
                } else if (state.player.afterburnerActive) {
                    modeEl.innerText = 'AFTERBURN';
                    modeEl.style.color = '#ffcc00';
                } else {
                    modeEl.innerText = 'CRUISE';
                    modeEl.style.color = '#0ff';
                }
            }
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
    let radarVectorMeter;    // 3-axis orientation gizmo group
    let radarAxisFwd, radarAxisUp, radarAxisRight; // axis arrow meshes
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
        radarRenderer.setSize(400, 400, false);
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
        const playerForwardWorld = new THREE.Vector3(0, 0, -1).applyQuaternion(pQuat).normalize();

        // Sphere wireframe doesn't rotate — fixed reference
        radarSphere.quaternion.set(0, 0, 0, 1);

        // Offset vector — player is at (0,0,OFFSET), everything else is relative to origin
        const shipOff = new THREE.Vector3(0, 0, RADAR_SHIP_OFFSET);

        // GDD §7: Forward direction indicator on sphere edge
        radarForwardMarker.position.copy(playerForwardWorld).multiplyScalar(1.05);
        radarForwardMarker.lookAt(shipOff);
        radarForwardMarker.rotateX(Math.PI / 2);

        // Viewport indicator rotates with player heading in world-referenced radar space.
        if (radarFovCone) {
            const coneQuat = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, -1),
                playerForwardWorld
            );
            radarFovCone.quaternion.copy(coneQuat);
        }

        // ── Vector Meter — rotate world axes into player-local space ──
        if (radarVectorMeter) {
            // Player frame axes in world radar space.
            const playerFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(pQuat);
            const playerUp = new THREE.Vector3(0, 1, 0).applyQuaternion(pQuat);
            const playerRight = new THREE.Vector3(1, 0, 0).applyQuaternion(pQuat);

            // Orient each arrow to point along its world axis (arrows built along +Y)
            const upRef = new THREE.Vector3(0, 1, 0);

            const fwdQuat = new THREE.Quaternion().setFromUnitVectors(upRef, playerFwd);
            radarAxisFwd.quaternion.copy(fwdQuat);

            const upQuat = new THREE.Quaternion().setFromUnitVectors(upRef, playerUp);
            radarAxisUp.quaternion.copy(upQuat);

            const rightQuat = new THREE.Quaternion().setFromUnitVectors(upRef, playerRight);
            radarAxisRight.quaternion.copy(rightQuat);
        }

        // ── Level Ring — baseship's horizon plane projected into player-local space ──
        if (radarLevelRing && state.baseship) {
            const baseQuat = state.baseship.quaternion || new THREE.Quaternion();
            const baseUp = new THREE.Vector3(0, 1, 0).applyQuaternion(baseQuat);
            // Orient ring so its normal aligns with baseship's up in world radar space.
            const ringQuat = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, 1), baseUp
            );
            radarLevelRing.quaternion.copy(ringQuat);
            // Position the "up" tick at the top of the ring
            if (radarLevelUp) {
                radarLevelUp.position.copy(baseUp).multiplyScalar(0.97);
                radarLevelUp.lookAt(0, 0, 0);
                radarLevelUp.rotateX(Math.PI);
            }
        }

        // GDD §7: Base marker — always show where baseship is relative to player
        if (state.baseship) {
            const baseRel = state.baseship.position.clone().sub(pPos);
            const baseDist = baseRel.length();
            if (baseDist > 1) {
                const baseDir = baseRel.clone().normalize();
                const baseT = Math.min(baseDist / RADAR_RANGE, 1.0);
                radarBaseMarker.position.copy(baseDir).multiplyScalar(baseT * 0.92).add(shipOff);
                radarBaseMarker.visible = true;
                // Dim if far, bright if close
                radarBaseMarker.material.opacity = baseT > 0.9 ? 0.5 : 1.0;
                radarBaseMarker.material.transparent = true;
                // Pulse when in landing approach
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

        // ── Rotating sweep — 3D radar scan beam ──
        const SWEEP_PERIOD = dim('radar.sweepPeriod');
        const BEAM_HALF = THREE.MathUtils.degToRad(dim('radar.beamWidth') / 2);
        const PERSISTENCE = dim('radar.persistence');
        const nowSec = performance.now() / 1000;
        const sweepAngle = ((nowSec / SWEEP_PERIOD) % 1.0) * Math.PI * 2;
        if (radarSweepGroup) radarSweepGroup.rotation.y = sweepAngle;

        // ── Sweep detection — paint contacts when beam passes their azimuth ──
        const TWO_PI = Math.PI * 2;
        state.entities.forEach(e => {
            if (e === state.player || e.type === 'laser' || e.type === 'machinegun' || e.type === 'baseship') return;
            const rx = e.position.x - pPos.x;
            const ry = e.position.y - pPos.y;
            const rz = e.position.z - pPos.z;
            const dist = Math.sqrt(rx * rx + ry * ry + rz * rz);
            if (dist < 1 || dist > RADAR_RANGE * 1.2) return;

            // Azimuth of entity in world XZ plane
            let az = Math.atan2(rx, rz);
            if (az < 0) az += TWO_PI;
            let sw = sweepAngle % TWO_PI;
            if (sw < 0) sw += TWO_PI;
            let diff = Math.abs(az - sw);
            if (diff > Math.PI) diff = TWO_PI - diff;

            if (diff < BEAM_HALF) {
                radarContacts.set(e, {
                    t: nowSec,
                    wx: e.position.x, wy: e.position.y, wz: e.position.z,
                    type: e.type, dist: dist
                });
            }
        });

        // ── Render contacts as fading phosphor blips ──
        radarBlipPool.forEach(b => b.visible = false);
        let blipIdx = 0;
        const lockedTarget = state.player.lockedTarget;
        const cosHalfFov = Math.cos(THREE.MathUtils.degToRad(75 / 2));
        const fwdDir = playerForwardWorld;

        // Locked target always tracked (not subject to sweep gating)
        if (lockedTarget && lockedTarget !== state.player &&
            lockedTarget.type !== 'laser' && lockedTarget.type !== 'baseship') {
            const lx = lockedTarget.position.x - pPos.x;
            const ly = lockedTarget.position.y - pPos.y;
            const lz = lockedTarget.position.z - pPos.z;
            const ld = Math.sqrt(lx * lx + ly * ly + lz * lz);
            if (ld > 1) {
                const existing = radarContacts.get(lockedTarget);
                if (!existing || (nowSec - existing.t) > SWEEP_PERIOD * 0.5) {
                    radarContacts.set(lockedTarget, {
                        t: nowSec,
                        wx: lockedTarget.position.x, wy: lockedTarget.position.y,
                        wz: lockedTarget.position.z,
                        type: lockedTarget.type, dist: ld
                    });
                }
            }
        }

        radarContacts.forEach((c, entity) => {
            const age = nowSec - c.t;
            if (age > SWEEP_PERIOD) { radarContacts.delete(entity); return; }
            if (blipIdx >= radarBlipPool.length) return;

            // Direction from current player pos to last-known world pos
            const dx = c.wx - pPos.x, dy = c.wy - pPos.y, dz = c.wz - pPos.z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d < 1) return;
            const inv = 1 / d;
            const nx = dx * inv, ny = dy * inv, nz = dz * inv;
            const t = Math.min(c.dist / RADAR_RANGE, 1.0);
            const radarR = t * 0.92;

            const blip = radarBlipPool[blipIdx++];
            blip.position.set(
                nx * radarR + shipOff.x,
                ny * radarR + shipOff.y,
                nz * radarR + shipOff.z
            );
            blip.visible = true;

            // Phosphor fade — bright on detection, dims over sweep period
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

            // FOV highlight — brighten contacts inside camera view
            const dot = nx * fwdDir.x + ny * fwdDir.y + nz * fwdDir.z;
            if (dot > cosHalfFov) {
                blip.material.opacity = Math.min(fadeAlpha + 0.3, 1.0);
                blip.scale.multiplyScalar(1.2);
            }
        });

        radarRenderer.render(radarScene, radarCamera);
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
        requestDock: _requestDock,
        togglePause,
        pause: () => _setPaused(true),
        resume: () => _setPaused(false),
        exitGame,
        openTutorial
    };

})();

window.Starfighter = Starfighter;
