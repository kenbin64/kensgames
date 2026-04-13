/**
 * SFWeapons — All four weapon systems for Alien Space Attack
 *
 * LASER CANNON    — accurate single beam, moderate fuel
 * AUTO MACHINE GUN — rapid spread, high fuel burn
 * PULSE EMP       — close range, disables enemies, no kill, friendly immune
 * PROTON TORPEDO  — 2 per load, homing, huge damage, shockwave
 *                   Only hurts enemy base when its shields are DOWN
 */
const SFWeapons = (() => {

    const DEFS = {
        laser:   { label:'LASER',    fuelPerShot:1.2, cooldown:0.14, damage:28,  range:1500, color:0xFF4400 },
        gun:     { label:'AUTO GUN', fuelPerShot:0.6, cooldown:0.06, damage:9,   range:650,  color:0xFFFF44, spread:5, pellets:4 },
        pulse:   { label:'PULSE EMP',fuelPerShot:12,  cooldown:2.2,  damage:0,   range:220,  disableDur:6000, color:0x00FFFF },
        torpedo: { label:'TORPEDO',  fuelPerShot:10,  cooldown:1.2,  damage:900, maxAmmo:2,  color:0xFF00FF },
    };

    let _currentWeapon = 'laser';
    let _cooldowns = { laser:0, gun:0, pulse:0, torpedo:0 };
    let _torpedoAmmo = 2;

    // ── Projectile pool ──
    const projectiles = [];

    function _canFire(player, weapon) {
        const def = DEFS[weapon];
        if (!def) return false;
        if (_cooldowns[weapon] > 0) return false;
        if (player.fuel < def.fuelPerShot) return false;
        if (weapon === 'torpedo' && _torpedoAmmo <= 0) return false;
        return true;
    }

    function _spawnProjectile(scene, THREE, origin, dir, weapon, owner) {
        const def = DEFS[weapon];
        let mesh;

        if (weapon === 'laser') {
            const geo  = new THREE.CylinderGeometry(0.4, 0.4, 28, 5);
            const mat  = new THREE.MeshBasicMaterial({ color: def.color });
            mesh = new THREE.Mesh(geo, mat);
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());

        } else if (weapon === 'gun') {
            const geo = new THREE.SphereGeometry(0.3, 4, 4);
            const mat = new THREE.MeshBasicMaterial({ color: def.color });
            mesh = new THREE.Mesh(geo, mat);

        } else if (weapon === 'pulse') {
            const geo = new THREE.SphereGeometry(1, 8, 8);
            const mat = new THREE.MeshBasicMaterial({ color: def.color, transparent:true, opacity:0.7, wireframe:true });
            mesh = new THREE.Mesh(geo, mat);

        } else if (weapon === 'torpedo') {
            const geo = new THREE.CylinderGeometry(0.6, 0.9, 4, 6);
            const mat = new THREE.MeshBasicMaterial({ color: def.color });
            mesh = new THREE.Mesh(geo, mat);
        }

        mesh.position.copy(origin);
        scene.add(mesh);

        const proj = {
            mesh, weapon, dir: dir.clone().normalize(),
            speed: weapon==='torpedo' ? 280 : weapon==='pulse' ? 180 : weapon==='gun' ? 600 : 900,
            owner, damage: def.damage,
            range: weapon==='torpedo' ? Infinity : def.range,
            traveled: 0,
            alive: true,
            target: null, // for torpedo homing
            expandScale: weapon==='pulse' ? 1 : null,
        };
        projectiles.push(proj);
        return proj;
    }

    return {
        DEFS,
        get currentWeapon() { return _currentWeapon; },
        get torpedoAmmo() { return _torpedoAmmo; },

        setWeapon(w) { if (DEFS[w]) _currentWeapon = w; },
        reloadTorpedoes() { _torpedoAmmo = 2; },
        reloadAll() { _torpedoAmmo = 2; for (const k in _cooldowns) _cooldowns[k] = 0; },

        tick(dt) {
            for (const k in _cooldowns) if (_cooldowns[k] > 0) _cooldowns[k] -= dt;
        },

        canFire(player) { return _canFire(player, _currentWeapon); },

        fire(scene, THREE, player, dir, entities) {
            const weapon = _currentWeapon;
            if (!_canFire(player, weapon)) return null;
            const def = DEFS[weapon];

            player.fuel -= def.fuelPerShot;
            _cooldowns[weapon] = def.cooldown;
            if (weapon === 'torpedo') _torpedoAmmo--;

            // Sound
            if (window.SFAudio) {
                if (weapon === 'laser')   SFAudio.playSound('laser');
                if (weapon === 'gun')     SFAudio.playSound('gun');
                if (weapon === 'pulse')   SFAudio.playSound('pulse');
                if (weapon === 'torpedo') SFAudio.playSound('torpedoLaunch');
            }

            const origin = player.mesh.position.clone().addScaledVector(dir, 6);

            if (weapon === 'gun') {
                // Spread volley
                for (let i = 0; i < def.pellets; i++) {
                    const spread = def.spread * (Math.PI / 180);
                    const sDir = dir.clone()
                        .applyAxisAngle(new THREE.Vector3(0,1,0), (Math.random()-0.5)*spread*2)
                        .applyAxisAngle(new THREE.Vector3(1,0,0), (Math.random()-0.5)*spread);
                    _spawnProjectile(scene, THREE, origin.clone(), sDir, weapon, 'player');
                }
                return 'gun';
            }

            const proj = _spawnProjectile(scene, THREE, origin, dir, weapon, 'player');

            // Torpedo: find nearest enemy to home on
            if (weapon === 'torpedo') {
                let nearest = null, dist = Infinity;
                entities.forEach(e => {
                    if (e.type !== 'enemy' && e.type !== 'alien-base') return;
                    const d = e.mesh.position.distanceTo(origin);
                    if (d < dist) { dist = d; nearest = e; }
                });
                if (nearest) { proj.target = nearest; SFAudio.playSound('lockOn'); }
            }

            return weapon;
        },

        // Fire from AI entity (enemy/ally)
        fireAI(scene, THREE, entity, dir, weapon) {
            const def = DEFS[weapon];
            if (!def) return;
            const origin = entity.mesh.position.clone().addScaledVector(dir, 6);
            _spawnProjectile(scene, THREE, origin, dir, weapon, entity.type);
        },

        updateProjectiles(dt, THREE, entities, scene, onHit) {
            for (let i = projectiles.length - 1; i >= 0; i--) {
                const p = projectiles[i];
                if (!p.alive) { scene.remove(p.mesh); p.mesh.geometry?.dispose(); projectiles.splice(i,1); continue; }

                // Torpedo homing
                if (p.weapon === 'torpedo' && p.target && p.target.hull > 0) {
                    const toTarget = p.target.mesh.position.clone().sub(p.mesh.position).normalize();
                    p.dir.lerp(toTarget, 0.05).normalize();
                }

                // Pulse expand
                if (p.weapon === 'pulse') {
                    p.expandScale += dt * 80;
                    p.mesh.scale.setScalar(p.expandScale);
                    if (p.expandScale > DEFS.pulse.range) { p.alive = false; continue; }
                }

                const step = p.dir.clone().multiplyScalar(p.speed * dt);
                p.mesh.position.add(step);
                p.traveled += step.length();

                if (p.traveled > p.range) { p.alive = false; continue; }

                // Hit detection
                for (const e of entities) {
                    if (!e.mesh || !e.hull || e.hull <= 0) continue;
                    // Friendly fire: player shots don't hit friendly
                    if (p.owner === 'player' && (e.type === 'player' || e.type === 'ally' || e.type === 'civilian-station' || e.type === 'military-ship')) continue;
                    // Enemy shots don't hit enemy
                    if (p.owner === 'enemy' && (e.type === 'enemy' || e.type === 'alien-base')) continue;

                    const hitRadius = e.hitRadius || 20;
                    if (p.mesh.position.distanceTo(e.mesh.position) < hitRadius) {
                        p.alive = false;
                        onHit(p, e);
                        break;
                    }
                }
            }
        },

        getProjectiles() { return projectiles; },
        getCooldownFraction(w) { const def = DEFS[w||_currentWeapon]; return def ? Math.max(0, _cooldowns[w||_currentWeapon] / def.cooldown) : 0; },
    };
})();
