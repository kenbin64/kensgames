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
        aiWingmen: false, // URL param ?ai=1 enables AI wingmen
    };

    // Communication system
    const comms = {
        baseMessages: [
            "Fighter, maintain defensive perimeter.",
            "All wings, report status.",
            "Baseship systems nominal.",
            "Hostile contact detected on radar.",
            "Ammunition supplies adequate.",
            "Incoming fighters, break formation!",
            "Squadron, watch for flanking maneuvers.",
            "Shields holding at current levels.",
        ],
        allyMessages: [
            "Engaging target, vectors locked.",
            "Bogies at 2 o'clock high!",
            "Got one on my six, need support!",
            "Laser cannons hot and ready.",
            "Formation tight, staying together.",
            "Evading enemy fire, pulling up!",
            "Multiple contacts, weapons free.",
        ],
        warningMessages: [
            "WARNING: Capital ship incoming!",
            "ALERT: Alien baseship detected!",
            "CAUTION: High enemy concentration.",
            "Hull breach on deck 7!",
        ]
    };

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

    // The Manifold — ground truth for all entity state
    const M = window.SpaceManifold;

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
            this.markedForDeletion = true;
            if (M) M.remove(this.id);
            if (window.SF3D) SF3D.spawnExplosion(this.position);
            if (window.SFAudio) SFAudio.playSound('explosion');
            if (window.SFAudio) SFAudio.playSound('shockwave');

            if (this.type === 'enemy') {
                state.score += 100;
                state.kills++;
                // Credit kill to the player who fired
                if (this.killedBy === 'player') state.playerKills++;
                checkWave();

            } else if (this.type === 'alien-base') {
                // ── VICTORY ──
                state.score += 5000;
                addComm('Command', 'ENEMY BASE DESTROYED! MISSION COMPLETE!', 'base');
                setTimeout(() => gameOver('VICTORY — Enemy Station Destroyed!', true), 2000);

            } else if (this.type === 'military-ship') {
                // No more fuel — civilian station now undefended
                state.militaryAlive = false;
                addComm('Command', 'MILITARY SHIP LOST — Civilian station undefended! No refuels until repaired!', 'base');
                if (window.SFAudio) SFAudio.playSound('warning');

            } else if (this.type === 'civilian-station') {
                // ── GAME OVER ──
                addComm('Command', 'CIVILIAN STATION DESTROYED — MISSION FAILED', 'base');
                setTimeout(() => gameOver('DEFEAT — Civilian Station Destroyed'), 2000);

            } else if (this.type === 'player') {
                // ── RESPAWN — not game over ──
                addComm('Baseship', 'Fighter down! Scrambling replacement pilot!', 'base');
                if (window.SFAudio) SFAudio.playSound('warning');
                state.respawning = true;
                state.respawnTimer = 5; // 5s countdown
                showRespawnScreen(5);

            } else if (this.type === 'ally') {
                state.score -= 50;
                addComm('Wingman', 'Going down! Cover the base!', 'ally');
            }
        }
    }

    class Player extends Entity {
        constructor() {
            super('player', 0, -32, 50); // Start inside baseship hangar bay
            this.throttle = 0; // 0 to 1
            // GDD §4.1 Flight Parameters
            this.maxSpeed = 120;        // base thrust 120 m/s
            this.afterburnerSpeed = 280; // afterburner max 280 m/s
            this.boostSpeed = 400;       // boost 400 m/s
            this.pitch = 0;
            this.yaw = 0;
            this.roll = 0;
            this.strafeH = 0;           // horizontal strafe input
            this.strafeV = 0;           // vertical strafe input
            this.torpedoes = 8;          // GDD §4.2: 8 torpedo magazine
            this.fuel = 100;
            this.afterburnerActive = false;
            this.boostActive = false;
            this.boostTimer = 0;         // remaining boost duration
            this.boostCooldown = 0;      // cooldown timer
            this.flightAssist = true;    // GDD §4.1: FA ON by default
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
                    this.boostCooldown = 8.0; // GDD §4.1: 8s cooldown
                }
            } else if (this.afterburnerActive && this.fuel > 0) {
                currentMax = this.afterburnerSpeed;
                this.fuel = Math.max(0, this.fuel - dt * 5); // GDD §4.1: 5 units/second
            }

            // Boost cooldown tick
            if (this.boostCooldown > 0) this.boostCooldown -= dt;

            // Forward velocity
            const targetVel = _v1.clone().multiplyScalar(this.throttle * currentMax);

            // Strafe (GDD §4.1: 60 m/s)
            if (this.strafeH !== 0 || this.strafeV !== 0) {
                const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
                const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);
                targetVel.add(right.multiplyScalar(this.strafeH * 60));
                targetVel.add(up.multiplyScalar(this.strafeV * 60));
            }

            if (this.flightAssist) {
                // GDD §4.1 FA-ON: velocity dampens to zero over 2.0s when no input
                if (this.throttle < 0.01 && this.strafeH === 0 && this.strafeV === 0) {
                    this.velocity.multiplyScalar(1 - dt / 2.0); // linear damping
                } else {
                    // Smooth lerp toward target (lerp factor 0.08 per GDD)
                    this.velocity.lerp(targetVel, 0.08);
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
                this.fuel = Math.min(100, this.fuel + dt * 2);
            }

            // Input damping
            this.pitch *= 0.9;
            this.yaw *= 0.9;
            this.roll *= 0.9;
            this.strafeH *= 0.8;
            this.strafeV *= 0.8;
        }

        // GDD §4.1: Boost — tap to activate, 400 m/s for 3s, costs 25 fuel
        activateBoost() {
            if (this.boostCooldown > 0 || this.boostActive || this.fuel < 25) return;
            this.boostActive = true;
            this.boostTimer = 3.0;
            this.fuel -= 25;
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
            this.hull = 5000;
            this.shields = 2000;
            this.radius = 500; // Galactica-scale carrier (~1200m), collision radius
        }
    }

    function init() {
        state.player = new Player();
        state.player.hull = 100;
        state.player.shields = 100;
        state.baseship = new Baseship();
        state.entities.push(state.player, state.baseship);
        state.phase = 'loading'; // Wait for assets before launching
        state.launchTimer = 0;

        // Parse URL params: ?ai=1 enables AI wingmen
        const params = new URLSearchParams(window.location.search);
        state.aiWingmen = params.get('ai') === '1';

        // Init 3D system immediately so models start loading
        if (window.SF3D) {
            SF3D.init(state);
            SF3D.setLaunchPhase(true);
        }
        if (window.SFInput) SFInput.init(state.player);

        // Cockpit always visible — even during loading/bay
        if (window.SF3D) SF3D.showCockpit(true);

        // Gate game start behind asset loading
        if (window.SF3D && SF3D.onAllModelsReady) {
            SF3D.onAllModelsReady(function () {
                _startGame();
            });
        } else {
            // Fallback if no loading gate
            _startGame();
        }
    }

    function _startGame() {
        state.running = true;
        state.phase = 'bay-ready';  // Wait for player to push red launch button
        state._launchAudioPlayed = false;
        state._launchBlastPlayed = false;
        state._paBriefingDone = false;
        state.launchTimer = 0;
        state.launchDuration = 25.0; // Extended: PA narration (16s) + countdown (4s) + launch (3s) + exit (2s)

        // GDD §3.1: Bay ambient audio
        if (window.SFAudio) {
            SFAudio.init();
            SFAudio.startBayAmbience();
        }

        // Start Loop (renders cockpit/bay scene even in bay-ready)
        state.lastTime = performance.now();
        requestAnimationFrame(gameLoop);

        // Show countdown area, cockpit stays visible during bay for immersion
        document.getElementById('ship-panel').style.display = 'none';
        document.getElementById('crosshair').style.display = 'none';
        document.getElementById('countdown-display').style.display = 'block';
        document.getElementById('countdown-display').innerHTML = '<span style="font-size:0.35em;color:#446688">LAUNCH BAY — STANDING BY</span>';

        // Show the red LAUNCH button
        let launchBtn = document.getElementById('launch-btn');
        if (!launchBtn) {
            launchBtn = document.createElement('button');
            launchBtn.id = 'launch-btn';
            launchBtn.innerHTML = '&#9654; LAUNCH';
            launchBtn.style.cssText = 'position:absolute;bottom:50%;left:50%;transform:translate(-50%,50%);z-index:70;' +
                'padding:20px 48px;font-family:"Courier New",monospace;font-size:22px;font-weight:bold;letter-spacing:3px;' +
                'background:linear-gradient(180deg,#cc0000,#880000);color:#fff;border:3px solid #ff3333;border-radius:8px;' +
                'cursor:pointer;pointer-events:auto;text-shadow:0 0 8px #ff0000;box-shadow:0 0 30px rgba(255,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.2);' +
                'transition:all 0.15s ease;text-transform:uppercase';
            launchBtn.onmouseenter = () => {
                launchBtn.style.background = 'linear-gradient(180deg,#ee2222,#aa0000)';
                launchBtn.style.boxShadow = '0 0 50px rgba(255,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.3)';
            };
            launchBtn.onmouseleave = () => {
                launchBtn.style.background = 'linear-gradient(180deg,#cc0000,#880000)';
                launchBtn.style.boxShadow = '0 0 30px rgba(255,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.2)';
            };
            launchBtn.onclick = () => {
                _beginLaunchSequence();
            };
            document.body.appendChild(launchBtn);
        }
        launchBtn.style.display = 'block';

        addComm("Baseship", "Fighter, secure in launch bay. Press LAUNCH when ready.", "base");
    }

    function _beginLaunchSequence() {
        // Hide the red launch button
        const launchBtn = document.getElementById('launch-btn');
        if (launchBtn) launchBtn.style.display = 'none';

        state.phase = 'launching';
        state.launchTimer = 0;

        // Klaxon on launch commit
        if (window.SFAudio) {
            SFAudio.playSound('klaxon');
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

        // GDD §3.1: PA announcer mission briefing — synced with launch phases
        addComm("Baseship", "Launch sequence initiating...", "base");
        if (window.SFAudio && SFAudio.speak) {
            // PA 1: Situational awareness (0.5s — during dock)
            setTimeout(() => {
                SFAudio.speak("Attention all hands. This is Resolute command. Launch operations are now commencing.");
            }, 500);

            // PA 2: Backstory — the threat (4s — during dock)
            setTimeout(() => {
                addComm("Intelligence", "Hive Sigma contact — organic-metallic signatures on approach vector.", "base");
                SFAudio.speak("Intelligence update. Alien force designation Hive Sigma continues advance on Earth orbit. Their ships are organic metallic hybrids. They do not communicate. They do not negotiate. They consume.");
            }, 4000);

            // PA 3: The stakes (9s — during dock)
            setTimeout(() => {
                addComm("Command", "The Resolute is Earth's last heavy carrier. She must not fall.", "base");
                SFAudio.speak("All pilots be advised. The Resolute is one of Earth's last heavy carriers. If she falls, the orbital defense line collapses. Protect her at all costs.");
            }, 9000);

            // PA 4: Mission brief (14s — still in dock, just before countdown starts at 16s)
            setTimeout(() => {
                addComm("Intelligence", `Wave ${state.wave}: ${5 + state.wave * 2} hostile contacts expected.`, "base");
                SFAudio.speak(`Mission briefing. Wave ${state.wave}. Expect ${5 + state.wave * 2} hostile fighters.${state.wave >= 2 ? ' Warning. Enemy capital ship detected in the sector.' : ''} You are cleared for departure in your Mark Four Starfighter. Twin lasers and proton torpedoes are loaded. Good hunting, pilot.`);
            }, 14000);
        }
    }

    function completeLaunch() {
        // ── Cutscene ends: hand off to combat as a separate entity ──
        state.phase = 'combat';

        // Hide launch UI elements
        const launchBtn = document.getElementById('launch-btn');
        if (launchBtn) launchBtn.style.display = 'none';

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

        // Place player at combat starting position: safely outside baseship, facing away
        const launchDir = new THREE.Vector3(0, 0, -1); // default launch direction
        const combatStartPos = state.baseship.position.clone().add(launchDir.clone().multiplyScalar(1500));
        state.player.position.copy(combatStartPos);
        state.player.quaternion.set(0, 0, 0, 1); // facing -Z (away from baseship)

        // Carry launch momentum into combat
        const entrySpeed = 100; // cruising speed exiting the bay
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

        addComm("Baseship", "Fighter, you are clear of bay. Welcome to the fight!", "base");
        addComm("Alpha-1", "New bird on the wing. Form up on me.", "ally");
        addComm("Alpha-2", "Hostiles closing in. Weapons hot!", "ally");

        spawnWave();
    }

    function completeLanding() {
        state.phase = 'docking';
        const prevWave = state.wave;
        state.wave++;
        state.player.torpedoes = 8; // GDD §9.3: Replenish torpedoes between waves

        // GDD §9.3: Shield restores, hull carries, fuel replenished
        state.player.shields = 100;
        state.player.fuel = 100;
        state.player.boostCooldown = 0;
        state.player.boostActive = false;

        // Wave debrief display
        const countdownDisplay = document.getElementById('countdown-display');
        countdownDisplay.style.display = 'block';
        countdownDisplay.style.fontSize = '1.8em';
        countdownDisplay.style.color = '#00ff88';
        countdownDisplay.innerHTML = `WAVE ${prevWave} COMPLETE<br>` +
            `<span style="font-size:0.5em;color:#88ccff">` +
            `Kills: ${state.kills} | Score: ${state.score}<br>` +
            `Hull: ${Math.floor(state.player.hull)}% | Base Hull: ${Math.floor((state.baseship.hull / 5000) * 100)}%` +
            `</span><br>` +
            `<span style="font-size:0.45em;color:#ffaa00">Rearming... Wave ${state.wave} launching in 8s</span>`;

        // PA debrief
        addComm("Baseship", "Excellent landing, Fighter. Rearming and refueling.", "base");
        if (window.SFAudio && SFAudio.speak) {
            SFAudio.speak(`Wave ${prevWave} complete. ${state.kills} confirmed kills. Rearming for wave ${state.wave}.`);
        }

        if (state.wave >= 2) {
            setTimeout(() => {
                addComm("Baseship", "WARNING: Enemy capital ship detected in next wave!", "warning");
                if (window.SFAudio && SFAudio.speak) {
                    SFAudio.speak("Intelligence reports an enemy capital ship inbound. Destroy it before it reaches the Resolute.");
                }
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
            state.player.hull = Math.min(100, state.player.hull + 25); // partial hull repair

            // Resupply baseship if damaged
            state.baseship.hull = Math.min(5000, state.baseship.hull + 1000);
            state.baseship.shields = Math.min(2000, state.baseship.shields + 500);

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

            addComm("Baseship", `Wave ${state.wave} standing by. Press LAUNCH when ready, pilot.`, "base");

            document.getElementById('ship-panel').style.display = 'none';
            document.getElementById('gameplay-hud').style.display = 'none';
            document.getElementById('crosshair').style.display = 'none';
        }, 8000);
    }

    function spawnWave() {
        const count = 5 + state.wave * 2;
        for (let i = 0; i < count; i++) {
            // Spawn far away, but inside the arena
            const r = 4000 + Math.random() * 1000;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            const e = new Entity('enemy', x, y, z);
            e.hull = 50 + state.wave * 10;
            e.maxSpeed = 80 + state.wave * 5;
            state.entities.push(e);
        }

        // Alien Baseship spawns on wave 2+, attacks friendly baseship
        if (state.wave >= 2) {
            const r = 5000 + Math.random() * 1000;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            const ab = new Entity('alien-baseship', x, y, z);
            ab.hull = 1000 + state.wave * 500;
            ab.maxSpeed = 20 + state.wave * 2;
            ab.radius = 350; // Massive alien mothership (~800m)
            state.entities.push(ab);

            addComm("Baseship", "WARNING: Enemy capital ship detected!", "warning");
            addComm("Baseship", "Destroy it before it reaches us!", "warning");
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
                w.hull = 60 + state.wave * 5;
                w.maxSpeed = 90 + state.wave * 3;
                w.callsign = callsigns[i];
                w.quaternion.copy(state.player.quaternion);
                state.entities.push(w);
            }
            addComm("Alpha-2", "Wingmen on station. Engaging hostiles.", "ally");
        }

        addComm("Baseship", "Wave " + state.wave + " incoming. All fighters to combat stations.", "base");
    }

    function checkWave() {
        const enemies = state.entities.filter(e => (e.type === 'enemy' || e.type === 'alien-baseship') && !e.markedForDeletion);
        if (enemies.length === 0 && state.phase === 'combat') {
            // All enemies cleared - time to return to baseship
            state.phase = 'land-approach';
            state.autopilotActive = false; // Reset autopilot for fresh approach
            state.autopilotTimer = 0;
            addComm("Baseship", "All clear, Fighter. Return to base for landing.", "base");
        }
    }

    function gameOver(reason) {
        state.running = false;
        document.getElementById('death-screen').style.display = 'flex';
        document.getElementById('death-reason').innerText = reason;
        document.getElementById('gameplay-hud').style.display = 'none';
        document.getElementById('radar-overlay').style.display = 'none';
    }

    function gameLoop(time) {
        if (!state.running) return;
        requestAnimationFrame(gameLoop);

        const dt = (time - state.lastTime) / 1000;
        state.lastTime = time;

        // Cap dt to prevent physics explosions on lag
        const safeDt = Math.min(dt, 0.1);

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

                // PA: "Launch! Launch! Launch!" at end of countdown
                if (!state._paBriefingDone && preProgress > 0.85 && window.SFAudio && SFAudio.speak) {
                    SFAudio.speak("Launch! Launch! Launch!");
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
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.cutsceneCamQuat);
                const moveVec = forward.clone().multiplyScalar(launchSpeed * safeDt);
                state.cutsceneCamPos.add(moveVec);
                state.cutsceneVelocity.copy(forward.clone().multiplyScalar(launchSpeed));
            }
            // ── Phase 4: Bay Exit (92-100% = ~2s) — burst into space ──
            else {
                cdEl.style.display = 'block';
                cdEl.innerHTML = '<span style="color:#00ffff;font-size:0.6em">CLEAR OF BAY</span>';
                cdEl.style.fontSize = '3em';

                const exitProgress = (progress - 0.92) / 0.08;
                const exitSpeed = 1200 * (1.0 - exitProgress * 0.5);
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.cutsceneCamQuat);
                const moveVec = forward.clone().multiplyScalar(exitSpeed * safeDt);
                state.cutsceneCamPos.add(moveVec);
                state.cutsceneVelocity.copy(forward.clone().multiplyScalar(exitSpeed));
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
                addComm("Baseship", "All clear, Fighter. Autopilot available — press SPACE or fly home.", "base");
            }

            // Check for autopilot activation
            if (!state.autopilotActive && window.SFInput && SFInput.isKeyDown('Space')) {
                state.autopilotActive = true;
                state.autopilotTimer = 0;
                addComm("Baseship", "Autopilot engaged. Sit back, pilot.", "base");
                if (window.SFAudio) SFAudio.playSound('hud_power_up');
            }

            if (state.autopilotActive) {
                // GDD §9.3: 15s autopilot — smoothly fly back to baseship
                state.autopilotTimer += safeDt;
                const apProgress = Math.min(state.autopilotTimer / 12.0, 1.0); // 12s travel, 3s dock

                // Calculate direction and distance to baseship bay entrance
                const bayTarget = state.baseship.position.clone().add(new THREE.Vector3(0, 0, 800));
                const toBase = bayTarget.clone().sub(state.player.position);
                const distToBase = toBase.length();

                // Smoothly turn and fly toward base
                const targetDir = toBase.normalize();
                _q1.setFromUnitVectors(_v2.set(0, 0, -1), targetDir);
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
                    addComm("Baseship", "Landing confirmed. Welcome aboard!", "base");
                    if (window.SFAudio) SFAudio.playSound('comm_beep');
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
                        addComm("Baseship", "Landing confirmed. Welcome aboard!", "base");
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
                if (e.type === 'enemy' || e.type === 'alien-baseship') updateAI(e, safeDt);
                else if (e.type === 'wingman') updateAllyAI(e, safeDt);
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
            const bayPos = new THREE.Vector3(0, -32, 50);
            const targetPos = state.baseship.position.clone().add(bayPos);
            state.player.position.lerp(targetPos, progress * 0.3);

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
        if (window.SFInput) {
            SFInput.update(safeDt);
            SFInput.updateLivePanel();
        }

        if (state.player && state.player.lockedTarget && state.player.lockedTarget.markedForDeletion) {
            state.player.lockedTarget = null;
        }

        // Random communications
        state.commTimer += safeDt;
        if (state.commTimer >= state.commInterval) {
            state.commTimer = 0;
            const commType = Math.random();
            if (commType < 0.4) {
                const msg = comms.baseMessages[Math.floor(Math.random() * comms.baseMessages.length)];
                addComm("Baseship", msg, "base");
            } else if (commType < 0.8) {
                const msg = comms.allyMessages[Math.floor(Math.random() * comms.allyMessages.length)];
                const squadNum = Math.floor(Math.random() * 3) + 1;
                addComm(`Alpha-${squadNum}`, msg, "ally");
            } else {
                const msg = comms.warningMessages[Math.floor(Math.random() * comms.warningMessages.length)];
                addComm("ALERT", msg, "warning");
            }
            state.commInterval = 5 + Math.random() * 8; // Randomize interval
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
            if (e.type === 'enemy' || e.type === 'alien-baseship') updateAI(e, safeDt);
            else if (e.type === 'wingman') updateAllyAI(e, safeDt);
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
            if (e.type === 'laser' || e.type === 'torpedo') {
                const dx = e.position.x - state.player.position.x;
                const dy = e.position.y - state.player.position.y;
                const dz = e.position.z - state.player.position.z;
                if (dx * dx + dy * dy + dz * dz > 25000000) { // 5000²
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
            if (state.phase === 'land-approach' &&
                ((a.type === 'player' && (b.type === 'enemy' || b.type === 'alien-baseship')) ||
                    ((a.type === 'enemy' || a.type === 'alien-baseship') && b.type === 'player'))) {
                continue;
            }

            // Skip player-baseship collision during landing
            if ((state.phase === 'land-approach' || state.phase === 'landing') &&
                ((a.type === 'player' && b.type === 'baseship') ||
                    (a.type === 'baseship' && b.type === 'player'))) {
                continue;
            }

            const isAProj = a.type === 'laser' || a.type === 'torpedo';
            const isBProj = b.type === 'laser' || b.type === 'torpedo';

            if (isAProj && isBProj) continue;
            if ((isAProj && a.owner === b.type) || (isBProj && b.owner === a.type)) continue;

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

        // Throttle HUD/DOM updates to every 3rd frame (DOM is slow)
        _frameCount++;
        if (_frameCount % 3 === 0) updateHUD();
        if (window.SF3D) SF3D.render(state);
    }

    function updateAI(enemy, dt) {
        if (enemy.type === 'alien-baseship') {
            const target = state.baseship;
            if (!target) return;

            _v1.copy(target.position).sub(enemy.position).normalize();
            _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
            enemy.quaternion.slerp(_q1, dt * 0.5);
            enemy.velocity.copy(_v1).multiplyScalar(enemy.maxSpeed);

            if (Math.random() < 0.005) {
                const dx = enemy.position.x - target.position.x;
                const dy = enemy.position.y - target.position.y;
                const dz = enemy.position.z - target.position.z;
                if (dx * dx + dy * dy + dz * dz < 9000000) fireTorpedo(enemy, 'enemy'); // 3000²
            }
        } else {
            // ── Evasion: if player has this enemy locked, break and evade ──
            const isLocked = state.player.lockedTarget === enemy;
            if (isLocked) {
                // Initialize evasion state on lock
                if (!enemy._evading) {
                    enemy._evading = true;
                    enemy._evadeTimer = 0;
                    enemy._evadeDir = new THREE.Vector3(
                        (Math.random() - 0.5) * 2,
                        (Math.random() - 0.5) * 2,
                        (Math.random() - 0.5)
                    ).normalize();
                }
                enemy._evadeTimer += dt;
                // Change evasion direction every 1.5s
                if (enemy._evadeTimer > 1.5) {
                    enemy._evadeTimer = 0;
                    enemy._evadeDir.set(
                        (Math.random() - 0.5) * 2,
                        (Math.random() - 0.5) * 2,
                        (Math.random() - 0.5)
                    ).normalize();
                }
                // Break turn: rotate toward evasion direction at high rate
                _q1.setFromUnitVectors(_v2.set(0, 0, -1), enemy._evadeDir);
                enemy.quaternion.slerp(_q1, dt * 4.0); // fast break turn
                // Boost speed while evading
                const fwd = _v1.set(0, 0, -1).applyQuaternion(enemy.quaternion);
                enemy.velocity.copy(fwd).multiplyScalar(enemy.maxSpeed * 1.5);
                // Still fire back at player if close
                if (Math.random() < 0.015) {
                    const dx = enemy.position.x - state.player.position.x;
                    const dy = enemy.position.y - state.player.position.y;
                    const dz = enemy.position.z - state.player.position.z;
                    if (dx * dx + dy * dy + dz * dz < 640000) fireLaser(enemy, 'enemy');
                }
            } else {
                enemy._evading = false;
                // Normal pursuit AI
                const target = (Math.random() > 0.3) ? state.baseship : state.player;
                if (!target) return;

                _v1.copy(target.position).sub(enemy.position).normalize();
                _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
                enemy.quaternion.slerp(_q1, dt * 2.0);
                enemy.velocity.copy(_v1).multiplyScalar(enemy.maxSpeed);

                if (Math.random() < 0.01) {
                    const dx = enemy.position.x - target.position.x;
                    const dy = enemy.position.y - target.position.y;
                    const dz = enemy.position.z - target.position.z;
                    if (dx * dx + dy * dy + dz * dz < 640000) fireLaser(enemy, 'enemy'); // 800²
                }
            }
        }
    }

    function tryLockOnTarget(source) {
        let bestTarget = null;
        let bestScore = -Infinity;

        _v1.set(0, 0, -1).applyQuaternion(source.quaternion);

        const ents = state.entities;
        for (let i = 0, len = ents.length; i < len; i++) {
            const e = ents[i];
            if (e.type !== 'enemy' && e.type !== 'alien-baseship') continue;
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
            if (e.type !== 'enemy' && e.type !== 'alien-baseship') continue;
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

    // GDD §10.1: Pulse cannons fire at 6 rounds/second (both cannons simultaneously)
    let _lastFireTime = 0;
    const FIRE_INTERVAL = 1 / 6; // 6 rps

    function fireLaser(source, ownerType) {
        const now = performance.now() / 1000;
        if (ownerType === 'player' && now - _lastFireTime < FIRE_INTERVAL) return;
        if (ownerType === 'player') _lastFireTime = now;

        // GDD §10.1: Dual linked pulse cannons — two bolts fired simultaneously
        _v1.set(0, 0, -10).applyQuaternion(source.quaternion);
        const l = new Entity('laser',
            source.position.x + _v1.x,
            source.position.y + _v1.y,
            source.position.z + _v1.z);
        l.quaternion.copy(source.quaternion);
        // GDD §10.1: 800 m/s projectile speed
        _v1.set(0, 0, -800).applyQuaternion(l.quaternion);
        l.velocity.copy(_v1);
        l.owner = ownerType;
        l.radius = 2;
        l.maxAge = 2.5;  // 2000 range / 800 m/s = 2.5s
        l.damage = 15;   // GDD §10.1
        state.entities.push(l);
        if (window.SF3D) SF3D.spawnLaser(l);
        if (window.SFAudio) SFAudio.playSound('laser');
    }

    function fireTorpedo(source, ownerType) {
        if (source.torpedoes <= 0) return;
        source.torpedoes--;

        _v1.set(0, -10, -20).applyQuaternion(source.quaternion);
        const t = new Entity('torpedo',
            source.position.x + _v1.x,
            source.position.y + _v1.y,
            source.position.z + _v1.z);
        t.quaternion.copy(source.quaternion);
        // GDD §10.1: 200 m/s initial, accelerates to 350 m/s over 1.5s
        _v1.set(0, 0, -200).applyQuaternion(t.quaternion);
        t.velocity.copy(_v1);
        t.owner = ownerType;
        t.radius = 8;
        t.target = source.lockedTarget;
        t.maxAge = 20;   // GDD: 4000 range — long enough to reach
        t.damage = 80;   // GDD §10.1
        t.launchTime = performance.now() / 1000;
        state.entities.push(t);
        if (window.SFAudio) SFAudio.playSound('torpedo');
    }

    function handleCollision(a, b) {
        if (a.type === 'laser' || a.type === 'torpedo') {
            const damage = a.damage || (a.type === 'torpedo' ? 80 : 15);
            if (window.SF3D) {
                // GDD §8.3: Pulse = #00FFAA, Torpedo = #4488FF shield flash
                const color = a.type === 'torpedo' ? 0x4488ff : 0x00ffaa;
                SF3D.spawnImpactEffect(a.position, color);
            }
            if (!(b.type === 'player' && state.phase === 'launching')) {
                b.takeDamage(damage);
            }
            a.markedForDeletion = true;
        } else if (b.type === 'laser' || b.type === 'torpedo') {
            const damage = b.damage || (b.type === 'torpedo' ? 80 : 15);
            if (window.SF3D) {
                const color = b.type === 'torpedo' ? 0x4488ff : 0x00ffaa;
                SF3D.spawnImpactEffect(b.position, color);
            }
            if (!(a.type === 'player' && state.phase === 'launching')) {
                a.takeDamage(damage);
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
        const speed = Math.floor(state.player.velocity.length());
        const throttle = Math.floor(state.player.throttle * 100);
        const fuel = Math.floor(state.player.fuel);
        const hullPct = Math.floor((state.player.hull / 100) * 100);
        const shieldPct = Math.floor((state.player.shields / 100) * 100);
        const basePct = Math.floor((state.baseship.hull / 5000) * 100);
        const maxSpd = state.player.boostActive ? state.player.boostSpeed
            : state.player.afterburnerActive ? state.player.afterburnerSpeed
                : state.player.maxSpeed;

        // Update HTML gauge elements (kept for compat)
        const ge = id => document.getElementById(id);
        const el = ge('hud-speed');
        if (el) {
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
        if (window.SF3D && SF3D.updateTelemetryScreen) {
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
        if (gShield) {
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

        // Update radar
        updateRadar();

        // Push radar canvas to 3D texture
        if (window.SF3D && SF3D.updateRadarTexture) {
            SF3D.updateRadarTexture();
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
    const RADAR_RANGE = 5000; // GDD §7: 5000m range
    const RADAR_SHIP_OFFSET = 0.35; // player dot offset toward rear (+Z) for depth perception

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
        const invQuat = pQuat.clone().invert();

        // Sphere wireframe doesn't rotate — fixed reference
        radarSphere.quaternion.set(0, 0, 0, 1);

        // Offset vector — player is at (0,0,OFFSET), everything else is relative to origin
        const shipOff = new THREE.Vector3(0, 0, RADAR_SHIP_OFFSET);

        // GDD §7: Forward direction indicator on sphere edge
        const fwd = new THREE.Vector3(0, 0, -1); // player's forward in local space
        radarForwardMarker.position.copy(fwd).multiplyScalar(1.05);
        radarForwardMarker.lookAt(shipOff);
        radarForwardMarker.rotateX(Math.PI / 2);

        // ── Vector Meter — rotate world axes into player-local space ──
        if (radarVectorMeter) {
            // World forward (0,0,-1), up (0,1,0), right (1,0,0) in player-local space
            const worldFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(invQuat);
            const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(invQuat);
            const worldRight = new THREE.Vector3(1, 0, 0).applyQuaternion(invQuat);

            // Orient each arrow to point along its world axis (arrows built along +Y)
            const upRef = new THREE.Vector3(0, 1, 0);

            const fwdQuat = new THREE.Quaternion().setFromUnitVectors(upRef, worldFwd);
            radarAxisFwd.quaternion.copy(fwdQuat);

            const upQuat = new THREE.Quaternion().setFromUnitVectors(upRef, worldUp);
            radarAxisUp.quaternion.copy(upQuat);

            const rightQuat = new THREE.Quaternion().setFromUnitVectors(upRef, worldRight);
            radarAxisRight.quaternion.copy(rightQuat);
        }

        // ── Level Ring — baseship's horizon plane projected into player-local space ──
        if (radarLevelRing && state.baseship) {
            const baseUp = new THREE.Vector3(0, 1, 0); // baseship's up (identity quat)
            const localUp = baseUp.clone().applyQuaternion(invQuat);
            // Orient ring so its normal aligns with baseship's up in player-local space
            const ringQuat = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, 1), localUp
            );
            radarLevelRing.quaternion.copy(ringQuat);
            // Position the "up" tick at the top of the ring
            if (radarLevelUp) {
                radarLevelUp.position.copy(localUp).multiplyScalar(0.97);
                radarLevelUp.lookAt(0, 0, 0);
                radarLevelUp.rotateX(Math.PI);
            }
        }

        // GDD §7: Base marker — always show where baseship is relative to player
        if (state.baseship) {
            const baseLocal = state.baseship.position.clone().sub(pPos).applyQuaternion(invQuat);
            const baseDist = baseLocal.length();
            if (baseDist > 1) {
                const baseDir = baseLocal.clone().normalize();
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

        // ── Update entity blips ──
        radarBlipPool.forEach(b => b.visible = false);

        let blipIdx = 0;
        const lockedTarget = state.player.lockedTarget;
        // FOV check threshold — half-angle of vertical FOV
        const cosHalfFov = Math.cos(THREE.MathUtils.degToRad(75 / 2));
        const fwdDir = new THREE.Vector3(0, 0, -1); // player forward in local space

        state.entities.forEach(e => {
            if (e === state.player || e.type === 'laser' || e.type === 'baseship') return;
            if (blipIdx >= radarBlipPool.length) return;

            // Relative position in player's local space
            const localPos = e.position.clone().sub(pPos).applyQuaternion(invQuat);
            const dist = localPos.length();

            if (dist < 1) return;

            const normalizedDir = localPos.clone().normalize();
            const t = Math.min(dist / RADAR_RANGE, 1.0);
            const radarR = t * 0.92;

            const blip = radarBlipPool[blipIdx++];
            blip.position.copy(normalizedDir).multiplyScalar(radarR).add(shipOff);
            blip.visible = true;

            // Red = enemy, Magenta = alien baseship, Cyan = torpedo, Blue = ally
            if (e.type === 'enemy') {
                blip.material.color.setHex(0xff2222);
                blip.scale.setScalar(1.0);
            } else if (e.type === 'alien-baseship') {
                blip.material.color.setHex(0xff00ff);
                blip.scale.setScalar(2.0);
            } else if (e.type === 'torpedo') {
                blip.material.color.setHex(0x00ffff);
                blip.scale.setScalar(0.7);
            } else if (e.type === 'ally') {
                blip.material.color.setHex(0x44ff44);
                blip.scale.setScalar(1.0);
            } else {
                blip.material.color.setHex(0x4488ff);
                blip.scale.setScalar(1.0);
            }

            // GDD §7: Locked target pulses on radar
            if (lockedTarget && e === lockedTarget) {
                const pulse = 1.0 + Math.sin(performance.now() * 0.01) * 0.5;
                blip.scale.multiplyScalar(pulse);
                blip.material.color.setHex(0xffff00); // Yellow for locked
            }

            // GDD §7: Edge-pinning at 50% opacity for entities outside range
            if (t >= 1.0) {
                blip.material.transparent = true;
                blip.material.opacity = 0.5;
            } else {
                blip.material.transparent = true;
                blip.material.opacity = 1.0;
            }

            // ── FOV highlight — brighten blips inside camera view ──
            const dot = normalizedDir.dot(fwdDir);
            if (dot > cosHalfFov) {
                // Inside FOV — bright ring effect via emissive-like brightness boost
                blip.material.opacity = 1.0;
                blip.scale.multiplyScalar(1.3);
            } else {
                // Outside FOV — dim slightly
                blip.material.opacity = Math.min(blip.material.opacity, 0.5);
            }
        });

        radarRenderer.render(radarScene, radarCamera);
    }

    return {
        init,
        getState: () => state,
        fireLaser: () => fireLaser(state.player, 'player'),
        fireTorpedo: () => fireTorpedo(state.player, 'player'),
        tryLockOnTarget: () => tryLockOnTarget(state.player)
    };

})();

window.Starfighter = Starfighter;
