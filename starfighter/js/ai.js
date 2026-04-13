/**
 * SFAI — AI system for Alien Space Attack
 * Fighter FSM: patrol → engage → evade → refuel → disabled
 * Base AI: turret tracking + fire
 * Ally AI: escort player → intercept threats → refuel
 */
const SFAI = (() => {

    const STATES = { PATROL:'patrol', ENGAGE:'engage', EVADE:'evade', REFUEL:'refuel', DOCKING:'docking', DISABLED:'disabled', DEAD:'dead' };
    const FUEL_RETURN_THRESHOLD = 18; // % fuel remaining before returning
    const DISABLE_DURATION = 6000;    // ms

    // ── Shared math helpers ──
    function _steerToward(entity, targetPos, dt, turnRate) {
        const dir = targetPos.clone().sub(entity.mesh.position).normalize();
        entity.velocity = entity.velocity || new THREE.Vector3();
        entity.velocity.lerp(dir.multiplyScalar(entity.speed || 80), turnRate * dt);
    }

    function _nearest(entity, entities, types) {
        let best = null, bestDist = Infinity;
        for (const e of entities) {
            if (!types.includes(e.type) || e.hull <= 0) continue;
            const d = entity.mesh.position.distanceTo(e.mesh.position);
            if (d < bestDist) { bestDist = d; best = e; }
        }
        return { entity: best, dist: bestDist };
    }

    // ── Enemy fighter AI ──
    function updateFighterAI(enemy, dt, entities, scene) {
        if (enemy.aiState === STATES.DEAD) return;

        // Handle disabled state (pulse EMP)
        if (enemy.aiState === STATES.DISABLED) {
            enemy.disabledTimer = (enemy.disabledTimer || 0) - dt * 1000;
            if (enemy.disabledTimer <= 0) {
                enemy.aiState = STATES.PATROL;
                enemy.shields = Math.min(enemy.shields, enemy.maxShields * 0.3); // partial shield recovery
            }
            // Drift slowly
            if (enemy.mesh && enemy.velocity) enemy.mesh.position.addScaledVector(enemy.velocity, dt * 0.05);
            return;
        }

        // Fuel check — return to alien base
        const fuelPct = (enemy.fuel / enemy.maxFuel) * 100;
        if (fuelPct < FUEL_RETURN_THRESHOLD && enemy.aiState !== STATES.REFUEL && enemy.aiState !== STATES.DOCKING) {
            enemy.aiState = STATES.REFUEL;
        }

        const base = entities.find(e => e.type === 'alien-base');

        switch (enemy.aiState || STATES.PATROL) {
            case STATES.PATROL: {
                enemy.fuel -= dt * 0.4;
                if (!enemy.patrolTarget || enemy.mesh.position.distanceTo(enemy.patrolTarget) < 30) {
                    enemy.patrolTarget = new THREE.Vector3(
                        (Math.random()-0.5)*1200, (Math.random()-0.5)*300, (Math.random()-0.5)*1200
                    );
                }
                _steerToward(enemy, enemy.patrolTarget, dt, 2.0);
                // Detect player/ally
                const { entity: threat, dist } = _nearest(enemy, entities, ['player','ally']);
                if (threat && dist < 700) enemy.aiState = STATES.ENGAGE;
                break;
            }
            case STATES.ENGAGE: {
                enemy.fuel -= dt * 0.9;
                const { entity: target, dist } = _nearest(enemy, entities, ['player','ally']);
                if (!target || dist > 1000) { enemy.aiState = STATES.PATROL; break; }
                _steerToward(enemy, target.mesh.position, dt, 3.5);
                // Fire laser if lined up and not on cooldown
                enemy.fireCooldown = (enemy.fireCooldown || 0) - dt;
                if (dist < 650 && enemy.fireCooldown <= 0) {
                    const dir = target.mesh.position.clone().sub(enemy.mesh.position).normalize();
                    if (window.SFWeapons) SFWeapons.fireAI(scene, THREE, enemy, dir, 'laser');
                    enemy.fireCooldown = 0.55 + Math.random() * 0.4;
                    enemy.fuel -= 1.2;
                }
                // Evade if hull low
                if ((enemy.hull / enemy.maxHull) < 0.25) enemy.aiState = STATES.EVADE;
                break;
            }
            case STATES.EVADE: {
                enemy.fuel -= dt * 1.1;
                const awayDir = enemy.mesh.position.clone().normalize();
                _steerToward(enemy, enemy.mesh.position.clone().addScaledVector(awayDir, 500), dt, 4.0);
                enemy.evadeTimer = (enemy.evadeTimer || 0) + dt;
                if (enemy.evadeTimer > 3) { enemy.evadeTimer = 0; enemy.aiState = STATES.PATROL; }
                break;
            }
            case STATES.REFUEL: {
                if (!base || base.hull <= 0) { enemy.aiState = STATES.PATROL; break; }
                enemy.fuel -= dt * 0.2;
                _steerToward(enemy, base.mesh.position, dt, 2.5);
                const dist = enemy.mesh.position.distanceTo(base.mesh.position);
                if (dist < 60) {
                    enemy.aiState = STATES.DOCKING;
                    enemy.dockTimer = 4;
                }
                break;
            }
            case STATES.DOCKING: {
                enemy.dockTimer -= dt;
                enemy.velocity = enemy.velocity || new THREE.Vector3();
                enemy.velocity.multiplyScalar(0.95); // slow to stop
                if (enemy.dockTimer <= 0) {
                    enemy.fuel = enemy.maxFuel;
                    enemy.shields = Math.min(enemy.maxShields, enemy.shields + enemy.maxShields * 0.6);
                    SFWeapons?.reloadAll?.();
                    enemy.aiState = STATES.PATROL;
                }
                break;
            }
        }

        // Apply velocity
        if (!enemy.velocity) enemy.velocity = new THREE.Vector3();
        enemy.mesh.position.addScaledVector(enemy.velocity, dt);
        if (enemy.velocity.lengthSq() > 0.001) {
            const lookDir = enemy.velocity.clone().normalize();
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1), lookDir);
            enemy.mesh.quaternion.slerp(q, 0.08);
        }
        enemy.fuel = Math.max(0, enemy.fuel);
    }

    // ── Enemy Base Station AI (stationary — turrets fire at nearby players) ──
    function updateBaseAI(base, dt, entities, scene) {
        if (!base || base.hull <= 0) return;
        base.turretCooldown = (base.turretCooldown || 0) - dt;
        base.shieldRechargeTimer = (base.shieldRechargeTimer || 0) + dt;

        // Shield slow recharge (if not recently hit)
        if (base.lastHitTime && Date.now() - base.lastHitTime > 8000 && base.shields < base.maxShields) {
            base.shields = Math.min(base.maxShields, base.shields + dt * 5);
        }

        // Rotate slowly (station axis spin)
        if (base.mesh) base.mesh.rotation.y += dt * 0.05;

        // Fire at nearest player
        const { entity: target, dist } = _nearest(base, entities, ['player','ally','military-ship']);
        if (!target || dist > 900) return;

        if (base.turretCooldown <= 0) {
            const dir = target.mesh.position.clone().sub(base.mesh.position).normalize();
            if (window.SFWeapons) SFWeapons.fireAI(scene, THREE, base, dir, 'laser');
            base.turretCooldown = 1.2 + Math.random() * 0.8;
        }
    }

    // ── Allied AI fighter (escorts player, attacks threats) ──
    function updateAllyAI(ally, dt, entities, scene) {
        if (!ally || ally.hull <= 0) return;
        const fuelPct = (ally.fuel / ally.maxFuel) * 100;
        const base = entities.find(e => e.type === 'military-ship' && e.hull > 0);

        if (fuelPct < FUEL_RETURN_THRESHOLD && ally.aiState !== 'refuel_ally') {
            ally.aiState = 'refuel_ally';
        }

        switch (ally.aiState || 'escort') {
            case 'escort': {
                ally.fuel -= dt * 0.4;
                const { entity: threat, dist: td } = _nearest(ally, entities, ['enemy']);
                if (threat && td < 600) { ally.aiTarget = threat; ally.aiState = 'attack'; break; }
                // Follow nearest player
                const { entity: player } = _nearest(ally, entities, ['player']);
                if (player) {
                    const offset = new THREE.Vector3(40, 15, -40);
                    _steerToward(ally, player.mesh.position.clone().add(offset), dt, 2.5);
                }
                break;
            }
            case 'attack': {
                ally.fuel -= dt * 0.8;
                const tgt = ally.aiTarget;
                if (!tgt || tgt.hull <= 0) { ally.aiState = 'escort'; break; }
                _steerToward(ally, tgt.mesh.position, dt, 3.5);
                ally.fireCooldown = (ally.fireCooldown || 0) - dt;
                const dist = ally.mesh.position.distanceTo(tgt.mesh.position);
                if (dist < 550 && ally.fireCooldown <= 0) {
                    const dir = tgt.mesh.position.clone().sub(ally.mesh.position).normalize();
                    SFWeapons?.fireAI?.(scene, THREE, ally, dir, dist < 180 ? 'pulse' : 'laser');
                    ally.fireCooldown = 0.6;
                    ally.fuel -= 1.5;
                }
                if (dist > 900) ally.aiState = 'escort';
                break;
            }
            case 'refuel_ally': {
                if (!base) { ally.aiState = 'escort'; break; }
                _steerToward(ally, base.mesh.position, dt, 2.5);
                if (ally.mesh.position.distanceTo(base.mesh.position) < 70) {
                    ally.fuel = ally.maxFuel;
                    ally.shields = ally.maxShields;
                    ally.aiState = 'escort';
                }
                break;
            }
        }
        ally.velocity = ally.velocity || new THREE.Vector3();
        ally.mesh.position.addScaledVector(ally.velocity, dt);
        ally.fuel = Math.max(0, ally.fuel);
    }

    // ── Military Battleship AI (stays near civilian station, fires at enemies) ──
    function updateMilitaryAI(ship, dt, entities, scene) {
        if (!ship || ship.hull <= 0) return;
        const civilian = entities.find(e => e.type === 'civilian-station');
        if (!civilian) return;
        // Orbit civilian station slowly
        ship.orbitAngle = (ship.orbitAngle || 0) + dt * 0.04;
        const orbitR = 220;
        const target = civilian.mesh.position.clone().add(new THREE.Vector3(
            Math.cos(ship.orbitAngle) * orbitR, 30, Math.sin(ship.orbitAngle) * orbitR
        ));
        _steerToward(ship, target, dt, 1.5);
        ship.mesh.position.addScaledVector(ship.velocity || new THREE.Vector3(), dt);
        // Fire at nearby enemies
        ship.fireCooldown = (ship.fireCooldown || 0) - dt;
        const { entity: enemy, dist } = _nearest(ship, entities, ['enemy','alien-base']);
        if (enemy && dist < 800 && ship.fireCooldown <= 0) {
            const dir = enemy.mesh.position.clone().sub(ship.mesh.position).normalize();
            SFWeapons?.fireAI?.(scene, THREE, ship, dir, 'laser');
            ship.fireCooldown = 1.5;
        }
    }

    // ── Scale difficulty by player count ──
    function getDifficultyConfig(playerCount) {
        const n = Math.max(1, Math.min(6, playerCount));
        return {
            enemyFighterCount: [5, 8, 12, 16, 20, 24][n - 1],
            enemyBaseCount:    [1, 1,  2,  2,  3,  3][n - 1],
            enemyBaseHP:       [800, 1000, 1200, 1500, 1800, 2200][n - 1],
            enemyBaseShields:  [400, 500,  650,  800,  950, 1100][n - 1],
            allyFighterCount:  [1, 1,  2,  2,  3,  3][n - 1],
        };
    }

    // ── Apply pulse disable to entity ──
    function applyDisable(entity) {
        entity.aiState = STATES.DISABLED;
        entity.disabledTimer = DISABLE_DURATION;
        entity.shields = 0;
        if (window.SFAudio) SFAudio.playSound('disabled');
    }

    return { updateFighterAI, updateBaseAI, updateAllyAI, updateMilitaryAI, getDifficultyConfig, applyDisable, STATES };
})();
