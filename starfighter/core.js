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
        phase: 'launching', // 'launching', 'combat', 'landing', 'land-approach'
        launchTimer: 0,
        launchDuration: 8.0, // 5 sec countdown + 3 sec acceleration
        cutsceneCamPos: null, // isolated camera position for launch cutscene
        cutsceneCamQuat: null, // isolated camera rotation for launch cutscene
        cutsceneVelocity: null, // visual velocity for cutscene effects
        commTimer: 0,
        commInterval: 8.0, // seconds between random comms
        landingTimer: 0,
        landingDuration: 5.0, // landing sequence duration
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

            if (this.type === 'enemy') {
                state.score += 100;
                state.kills++;
                checkWave();
            } else if (this.type === 'alien-baseship') {
                state.score += 1000;
                state.kills++;
                checkWave();
            } else if (this.type === 'player' || this.type === 'baseship') {
                gameOver(this.type === 'baseship' ? 'Baseship Destroyed' : 'Hull Integrity Failed');
            }
        }
    }

    class Player extends Entity {
        constructor() {
            super('player', 0, -32, 50); // Start inside baseship hangar bay
            this.throttle = 0; // 0 to 1
            this.maxSpeed = 200;
            this.pitch = 0;
            this.yaw = 0;
            this.roll = 0;
            this.torpedoes = 2;
            this.fuel = 100;
            this.turboActive = false;
        }

        // resolveIntent: pilot controls set velocity and orientation on the manifold point.
        // Position is NOT changed here — the manifold evolves that.
        resolveIntent(dt) {
            _q1.setFromEuler(new THREE.Euler(this.pitch * dt, this.yaw * dt, this.roll * dt, 'YXZ'));
            this.quaternion.multiply(_q1);

            _v1.set(0, 0, -1).applyQuaternion(this.quaternion);

            if (this.turboActive && this.fuel > 0) {
                this.fuel = Math.max(0, this.fuel - dt * 25);
                this.velocity.copy(_v1).multiplyScalar(this.throttle * this.maxSpeed * 4);
            } else {
                this.fuel = Math.min(100, this.fuel + dt * 5);
                this.velocity.copy(_v1).multiplyScalar(this.throttle * this.maxSpeed);
            }

            this.pitch *= 0.9;
            this.yaw *= 0.9;
            this.roll *= 0.9;
        }
    }

    class Baseship extends Entity {
        constructor() {
            super('baseship', 0, 0, 0);
            this.hull = 5000;
            this.shields = 2000;
            this.radius = 200;
        }
    }

    function init() {
        state.player = new Player();
        state.player.hull = 100;
        state.player.shields = 100;
        state.baseship = new Baseship();
        state.entities.push(state.player, state.baseship);
        state.running = true;
        state.phase = 'launching';
        state.launchTimer = 0;

        // Start Loop
        state.lastTime = performance.now();
        requestAnimationFrame(gameLoop);

        // Init 3D and Input
        if (window.SF3D) {
            SF3D.init(state);
            SF3D.setLaunchPhase(true); // Tell 3D engine we're in launch phase - hides baseship
        }
        if (window.SFInput) SFInput.init(state.player);

        // Show countdown, hide cockpit during launch
        document.getElementById('ship-panel').style.display = 'none';
        document.getElementById('crosshair').style.display = 'none';
        if (window.SF3D) SF3D.showCockpit(false);
        document.getElementById('countdown-display').style.display = 'block';

        addComm("Baseship", "Fighter, secure in launch bay. Ready for departure.", "base");
        addComm("Baseship", "Launch sequence initiating...", "base");
    }

    function completeLaunch() {
        // ── Cutscene ends: hand off to combat as a separate entity ──
        state.phase = 'combat';

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
        state.phase = 'docking'; // New state for post-landing sequence
        state.wave++;
        state.player.torpedoes = 2; // Replenish torpedoes

        // Show success message and new wave info
        const countdownDisplay = document.getElementById('countdown-display');
        countdownDisplay.style.display = 'block';
        countdownDisplay.innerText = `MISSION COMPLETE\n\nWAVE ${state.wave} BRIEFING\nEnemies: ${5 + state.wave * 2}`;
        countdownDisplay.style.fontSize = '2em';
        countdownDisplay.style.color = '#00ff00';

        addComm("Baseship", "Excellent landing, Fighter. Rearming and refueling.", "base");

        if (state.wave >= 2) {
            addComm("Baseship", "WARNING: Enemy capital ship detected in next wave!", "warning");
            addComm("Intelligence", "Alien baseship will attempt to strike us. You must intercept and destroy it!", "base");
        }

        addComm("Baseship", `Wave ${state.wave} incoming in 5 seconds.`, "base");

        // Wait 5 seconds for briefing, then launch next wave
        setTimeout(() => {
            state.player.position.set(0, -32, 50);
            state.player.velocity.set(0, 0, 0);
            state.player.quaternion.set(0, 0, 0, 1);
            state.player.throttle = 0;
            state.player.pitch = 0;
            state.player.yaw = 0;
            state.player.roll = 0;
            state.phase = 'launching';
            state.launchTimer = 0;
            state.cutsceneCamPos = null; // reset cutscene camera for fresh launch
            state.cutsceneCamQuat = null;
            state.cutsceneVelocity = null;
            state.player.hull = 100;
            state.player.shields = 100;

            // Resupply baseship if damaged
            state.baseship.hull = Math.min(5000, state.baseship.hull + 1000);
            state.baseship.shields = Math.min(2000, state.baseship.shields + 500);

            // Setup for next launch
            if (window.SF3D) {
                SF3D.setLaunchPhase(true); // Hide baseship for launch cutscene
                SF3D.showLaunchBay();
            }

            addComm("Baseship", "Launch sequence initiating...", "base");
            document.getElementById('countdown-display').style.display = 'block';
            document.getElementById('ship-panel').style.display = 'none';

            // Note: spawnWave() is called in completeLaunch(), not here
        }, 5000);
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
            ab.radius = 150;
            state.entities.push(ab);

            addComm("Baseship", "WARNING: Enemy capital ship detected!", "warning");
            addComm("Baseship", "Destroy it before it reaches us!", "warning");
        }

        addComm("Baseship", "Wave " + state.wave + " incoming. All fighters to combat stations.", "base");
    }

    function checkWave() {
        const enemies = state.entities.filter(e => (e.type === 'enemy' || e.type === 'alien-baseship') && !e.markedForDeletion);
        if (enemies.length === 0 && state.phase === 'combat') {
            // All enemies cleared - time to return to baseship
            state.phase = 'land-approach';
            addComm("Baseship", "All clear, Fighter. Return to base for landing.", "base");
            addComm("Baseship", "Approach the bay slowly and align with the tube.", "base");
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

        // ── Launch Cutscene Phase (isolated from combat) ──
        if (state.phase === 'launching') {
            state.launchTimer += safeDt;
            const t = state.launchTimer / state.launchDuration;
            const progress = Math.min(t, 1.0);

            // Initialize cutscene camera on first frame (separate from player entity)
            if (!state.cutsceneCamPos) {
                state.cutsceneCamPos = new THREE.Vector3(0, -32, 50); // hangar bay start
                state.cutsceneCamQuat = new THREE.Quaternion(); // facing -Z
                state.cutsceneVelocity = new THREE.Vector3();
            }

            // Stage 1: Countdown (0 - 0.625 = 5 seconds)
            if (progress < 0.625) {
                const secondsLeft = Math.ceil(5 * (1 - progress / 0.625));
                const cdEl = document.getElementById('countdown-display');
                cdEl.innerText = secondsLeft;
                cdEl.style.display = 'block';
            } else {
                document.getElementById('countdown-display').style.display = 'none';
                document.getElementById('launch-prompt').style.display = 'none';
                document.getElementById('launch-overlay').style.display = 'none';
            }

            // Stage 2: Acceleration (after countdown) - moves cutscene camera only
            if (progress > 0.625) {
                const accelProgress = (progress - 0.625) / 0.375;
                const launchSpeed = accelProgress * accelProgress * 1200;
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.cutsceneCamQuat);
                const moveVec = forward.clone().multiplyScalar(launchSpeed * safeDt);
                state.cutsceneCamPos.add(moveVec);
                state.cutsceneVelocity.copy(forward.multiplyScalar(launchSpeed));
            }

            // Feed cutscene camera position to player for rendering only
            // (player entity state is irrelevant during cutscene)
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
                completeLaunch();
            }

            // No entity updates, no collisions, no physics - pure cutscene
            return;
        }

        // ── Landing Approach Phase ──
        if (state.phase === 'land-approach') {
            if (window.SFInput) SFInput.update(safeDt);

            // Hide hangar obstruction for safe landing approach
            if (window.SF3D) SF3D.hideHangarBay();

            // Check if player is close enough to baseship and slow enough to land
            const distToBaseship = state.player.position.distanceTo(state.baseship.position);
            const playerSpeed = state.player.velocity.length();

            // Show landing prompt when close enough
            if (distToBaseship < 500 && playerSpeed < 50) {
                const landPrompt = document.getElementById('countdown-display');
                landPrompt.style.display = 'block';
                landPrompt.innerText = 'PRESS SPACE TO LAND';
                landPrompt.style.fontSize = '2em';
                landPrompt.style.color = '#00ff00';

                // Check if player tries to land
                if (window.SFInput && SFInput.isKeyDown('Space')) {
                    // Successfully landed!
                    state.phase = 'landing';
                    state.landingTimer = 0;
                    landPrompt.style.display = 'none';
                    addComm("Baseship", "Landing confirmed. Welcome aboard!", "base");
                    state.score += 500 * state.wave; // Bonus for successful wave
                }
            } else {
                const landPrompt = document.getElementById('countdown-display');
                landPrompt.style.display = 'block';
                landPrompt.innerText = `APPROACH BASE\nDistance: ${Math.floor(distToBaseship)}m\nSpeed: ${Math.floor(playerSpeed)}m/s`;
                landPrompt.style.fontSize = '1.2em';
            }

            // Process combat updates in case more enemies appear
            for (let i = 0, len = state.entities.length; i < len; i++) {
                const e = state.entities[i];
                if (e.type === 'enemy' || e.type === 'alien-baseship') updateAI(e, safeDt);
                else if (e.type === 'torpedo' && e.target && !e.target.markedForDeletion) {
                    _v1.copy(e.target.position).sub(e.position).normalize();
                    _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
                    e.quaternion.slerp(_q1, safeDt * 1.5);
                    e.velocity.copy(_v1).multiplyScalar(150);
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
        if (window.SFInput) SFInput.update(safeDt);

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

        // AI sets intent (velocity) on enemies and torpedoes — for loop, no closure
        const ents = state.entities;
        for (let i = 0, len = ents.length; i < len; i++) {
            const e = ents[i];
            if (e.type === 'enemy' || e.type === 'alien-baseship') updateAI(e, safeDt);
            else if (e.type === 'torpedo' && e.target && !e.target.markedForDeletion) {
                _v1.copy(e.target.position).sub(e.position).normalize();
                _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
                e.quaternion.slerp(_q1, safeDt * 1.5);
                e.velocity.copy(_v1).multiplyScalar(150);
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
    }

    function fireLaser(source, ownerType) {
        _v1.set(0, 0, -10).applyQuaternion(source.quaternion);
        const l = new Entity('laser',
            source.position.x + _v1.x,
            source.position.y + _v1.y,
            source.position.z + _v1.z);
        l.quaternion.copy(source.quaternion);
        _v1.set(0, 0, -500).applyQuaternion(l.quaternion);
        l.velocity.copy(_v1);
        l.owner = ownerType;
        l.radius = 2;
        l.maxAge = 3;  // expires after 3 seconds (age-based, no setTimeout)
        state.entities.push(l);
        if (window.SF3D) SF3D.spawnLaser(l);
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
        _v1.set(0, 0, -150).applyQuaternion(t.quaternion);
        t.velocity.copy(_v1);
        t.owner = ownerType;
        t.radius = 8;
        t.target = source.lockedTarget;
        t.maxAge = 8;  // expires after 8 seconds
        state.entities.push(t);
    }

    function handleCollision(a, b) {
        if (a.type === 'laser' || a.type === 'torpedo') {
            const damage = a.type === 'torpedo' ? 500 : 20;
            if (window.SF3D) {
                const color = a.type === 'torpedo' ? 0x00ffff : 0x00ff00;
                SF3D.spawnImpactEffect(a.position, color);
            }
            // Skip damage if target is player during launch
            if (!(b.type === 'player' && state.phase === 'launching')) {
                b.takeDamage(damage);
            }
            a.markedForDeletion = true;
        } else if (b.type === 'laser' || b.type === 'torpedo') {
            const damage = b.type === 'torpedo' ? 500 : 20;
            if (window.SF3D) {
                const color = b.type === 'torpedo' ? 0x00ffff : 0x00ff00;
                SF3D.spawnImpactEffect(b.position, color);
            }
            // Skip damage if target is player during launch
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
        const maxSpd = state.player.turboActive ? state.player.maxSpeed * 4 : state.player.maxSpeed;

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
        }

        // Update radar
        updateRadar();

        // Push radar canvas to 3D texture
        if (window.SF3D && SF3D.updateRadarTexture) {
            SF3D.updateRadarTexture();
        }
    }

    // ── 3D Sphere Radar — miniature of the space sphere ──
    // Player is always at dead center. Entities are blips positioned relative
    // to the player and rotated by inverse quaternion so "forward" stays consistent.
    let radarScene, radarCamera, radarRenderer;
    let radarSphere, radarShipMarker;
    let radarBlipPool = [];
    const RADAR_RANGE = 6000;

    function initRadar() {
        const canvas = document.getElementById('radar-canvas');
        if (!canvas) return;

        radarScene = new THREE.Scene();

        radarCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        radarCamera.position.set(0, 0, 3.0);
        radarCamera.lookAt(0, 0, 0);

        radarRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        radarRenderer.setSize(400, 400, false); // false = don't set CSS size
        radarRenderer.setClearColor(0x000000, 0.3);

        // Wireframe sphere shell (the radar globe)
        const sphereGeo = new THREE.SphereGeometry(1.0, 16, 16);
        const sphereMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.08
        });
        radarSphere = new THREE.Mesh(sphereGeo, sphereMat);
        radarScene.add(radarSphere);

        // Player marker at dead center (bright dot)
        const shipGeo = new THREE.SphereGeometry(0.06, 8, 8);
        const shipMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        radarShipMarker = new THREE.Mesh(shipGeo, shipMat);
        radarScene.add(radarShipMarker);

        // Entity blip pool — larger blips for visibility
        for (let i = 0; i < 60; i++) {
            const geo = new THREE.SphereGeometry(0.055, 6, 6);
            const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const blip = new THREE.Mesh(geo, mat);
            blip.visible = false;
            radarScene.add(blip);
            radarBlipPool.push(blip);
        }

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

        // ── Update entity blips ──
        radarBlipPool.forEach(b => b.visible = false);

        let blipIdx = 0;
        state.entities.forEach(e => {
            if (e === state.player || e.type === 'laser') return;
            if (blipIdx >= radarBlipPool.length) return;

            // Relative position in player's local space
            const localPos = e.position.clone().sub(pPos).applyQuaternion(invQuat);
            const dist = localPos.length();

            if (dist < 1) return;

            const normalizedDir = localPos.clone().normalize();
            const t = Math.min(dist / RADAR_RANGE, 1.0);
            const radarR = t * 0.92;

            const blip = radarBlipPool[blipIdx++];
            blip.position.copy(normalizedDir).multiplyScalar(radarR);
            blip.visible = true;

            // Red = enemy, Blue = friendly, Magenta = alien baseship, Cyan = torpedo
            if (e.type === 'enemy') {
                blip.material.color.setHex(0xff2222);
                blip.scale.setScalar(1.0);
            } else if (e.type === 'alien-baseship') {
                blip.material.color.setHex(0xff00ff);
                blip.scale.setScalar(2.0);
            } else if (e.type === 'baseship') {
                blip.material.color.setHex(0x4488ff);
                blip.scale.setScalar(1.8);
            } else if (e.type === 'torpedo') {
                blip.material.color.setHex(0x00ffff);
                blip.scale.setScalar(0.7);
            } else {
                blip.material.color.setHex(0x4488ff);
                blip.scale.setScalar(1.0);
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
