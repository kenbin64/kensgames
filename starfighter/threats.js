// ═══════════════════════════════════════════════════════════
// THREAT DETECTION & COUNTERMEASURES SYSTEM
// ═══════════════════════════════════════════════════════════
// Real true-to-life incoming threat detection on spherical radar:
// - Incoming missiles/torpedoes highlighted in orange
// - Lock-on warning when enemy has player targeted
// - Countermeasures (flares/chaff) to break locks
// - Visual and audio alerts for threats
// ═══════════════════════════════════════════════════════════

const SFThreatSys = (function () {
  'use strict';

  // ── State ──
  const _state = {
    countermeasures: 12,      // Total countermeasures available
    maxCountermeasures: 12,   // Max capacity
    reloadRate: 0.2,          // Reloads per second (1 every 5 seconds)
    lastDeployTime: 0,        // Timestamp of last deployment
    deployCooldown: 2000,     // 2s cooldown between deployments
    activeFlares: [],         // Active countermeasure entities
    incomingThreats: new Set(), // Torpedoes/plasma heading toward player
    lockedOnBy: new Set(),    // Enemies that have player locked
    lastLockWarning: 0,       // Timestamp of last lock warning sound
    lastThreatWarning: 0      // Timestamp of last incoming warning
  };

  // ── Constants ──
  const THREAT_ANGLE_THRESHOLD = 25; // degrees - cone of "incoming" detection
  const THREAT_DISTANCE = 2500;      // Max distance to warn about incoming
  const LOCK_CHECK_DISTANCE = 4000;  // Max distance for lock detection
  const FLARE_LIFETIME = 8000;       // Flares last 8 seconds
  const FLARE_EFFECTIVENESS = 0.85;  // 85% chance to break lock
  const CHAFF_LIFETIME = 6000;       // Chaff lasts 6 seconds
  const WARNING_INTERVAL = 3000;     // 3s between repeated warnings

  // ── Initialize ──
  function init() {
    _state.countermeasures = _state.maxCountermeasures;
    updateGauge();

    // Make countermeasures button work
    const btn = document.getElementById('cm-deploy-btn');
    if (btn) {
      btn.addEventListener('click', deployCM);
    }
  }

  // ── Reset (call at wave start) ──
  function reset() {
    _state.countermeasures = _state.maxCountermeasures;
    _state.activeFlares = [];
    _state.incomingThreats.clear();
    _state.lockedOnBy.clear();
    updateGauge();
    hideAlerts();
  }

  // ── Update Threat Detection (call every frame) ──
  function update(dt, gameState) {
    if (!gameState || !gameState.player || gameState.phase !== 'combat') {
      hideAlerts();
      return;
    }

    const player = gameState.player;
    const entities = gameState.entities;
    const now = performance.now();

    // Reload countermeasures over time
    if (_state.countermeasures < _state.maxCountermeasures) {
      const reloadAmount = _state.reloadRate * dt;
      _state.countermeasures = Math.min(_state.maxCountermeasures, _state.countermeasures + reloadAmount);
      updateGauge();
    }

    // Update active flares/chaff
    _updateActiveFlares(dt, now, gameState);

    // Detect incoming threats (torpedoes/plasma heading toward player)
    _detectIncomingThreats(player, entities, now);

    // Detect enemy locks (enemies targeting player)
    _detectEnemyLocks(player, entities, now);

    // Update radar highlighting for threats
    _updateRadarThreats();

    // Update alerts and warnings
    _updateAlerts(now);

    // Update button state
    updateButton();
  }

  // ── Detect Incoming Projectiles ──
  function _detectIncomingThreats(player, entities, now) {
    _state.incomingThreats.clear();

    for (const e of entities) {
      // Only check hostile projectiles
      if (e.friendly || (e.type !== 'torpedo' && e.type !== 'plasma')) continue;
      if (!e.position || !e.velocity) continue;

      const toPlayer = new THREE.Vector3()
        .subVectors(player.position, e.position);
      const dist = toPlayer.length();

      // Too far to be a threat
      if (dist > THREAT_DISTANCE) continue;

      // Check if projectile is heading toward player
      const velDir = e.velocity.clone().normalize();
      const toPlayerDir = toPlayer.normalize();
      const angle = velDir.angleTo(toPlayerDir);
      const angleDeg = THREE.MathUtils.radToDeg(angle);

      // If angle < threshold, it's heading toward us
      if (angleDeg < THREAT_ANGLE_THRESHOLD) {
        _state.incomingThreats.add(e);
      }
    }

    // Play warning if we have incoming threats
    if (_state.incomingThreats.size > 0 && now - _state.lastThreatWarning > WARNING_INTERVAL) {
      _state.lastThreatWarning = now;
      if (window.SFAudio) {
        window.SFAudio.playSound('warning');
      }
    }
  }

  // ── Detect Enemy Locks ──
  function _detectEnemyLocks(player, entities, now) {
    _state.lockedOnBy.clear();

    for (const e of entities) {
      // Only check hostile entities
      if (e.friendly || e.type === 'projectile') continue;
      if (!e.position || !e.lockedTarget) continue;

      const dist = e.position.distanceTo(player.position);
      if (dist > LOCK_CHECK_DISTANCE) continue;

      // Check if enemy has player locked
      if (e.lockedTarget === player) {
        _state.lockedOnBy.add(e);
      }
    }

    // Play lock warning tone if locked
    if (_state.lockedOnBy.size > 0 && now - _state.lastLockWarning > WARNING_INTERVAL) {
      _state.lastLockWarning = now;
      if (window.SFAudio) {
        window.SFAudio.playSound('lock_warning');
      }
    }
  }

  // ── Update Active Flares ──
  function _updateActiveFlares(dt, now, gameState) {
    for (let i = _state.activeFlares.length - 1; i >= 0; i--) {
      const flare = _state.activeFlares[i];
      const age = now - flare.deployTime;

      // Remove expired flares
      if (age > flare.lifetime) {
        if (flare.entity && gameState.entities) {
          flare.entity.markedForDeletion = true;
        }
        _state.activeFlares.splice(i, 1);
        continue;
      }

      // Update flare position (drift with initial velocity)
      if (flare.entity && flare.entity.position) {
        flare.entity.velocity.multiplyScalar(0.96); // Slow down
        flare.entity.position.add(
          flare.entity.velocity.clone().multiplyScalar(dt)
        );
      }

      // Deflect incoming threats
      if (Math.random() < FLARE_EFFECTIVENESS * dt) {
        _deflectNearbyThreats(flare, gameState);
      }
    }
  }

  // ── Deflect Nearby Threats ──
  function _deflectNearbyThreats(flare, gameState) {
    if (!flare.entity || !flare.entity.position) return;

    const DEFLECT_RANGE = 150;

    for (const threat of _state.incomingThreats) {
      if (!threat.position || !threat.velocity || threat.markedForDeletion) continue;

      const dist = threat.position.distanceTo(flare.entity.position);
      if (dist < DEFLECT_RANGE) {
        // Redirect threat toward flare
        const toFlare = new THREE.Vector3()
          .subVectors(flare.entity.position, threat.position)
          .normalize();

        // Gradually turn toward flare
        threat.velocity.lerp(
          toFlare.multiplyScalar(threat.velocity.length()),
          0.3
        );

        // Mark as deflected
        threat._deflectedByFlare = true;
      }
    }

    // Break enemy locks
    for (const enemy of _state.lockedOnBy) {
      if (!enemy.position || enemy.markedForDeletion) continue;

      const dist = enemy.position.distanceTo(flare.entity.position);
      if (dist < DEFLECT_RANGE * 2) {
        // Break lock
        if (enemy.lockedTarget) {
          enemy.lockedTarget = null;
          enemy._lockBrokenByFlare = true;
        }
      }
    }
  }

  // ── Deploy Countermeasures ──
  function deployCM() {
    const now = performance.now();

    // Check cooldown
    if (now - _state.lastDeployTime < _state.deployCooldown) {
      if (window.SFAudio) window.SFAudio.playSound('error');
      return;
    }

    // Check availability
    if (_state.countermeasures < 1) {
      if (window.SFAudio) window.SFAudio.playSound('error');
      if (window.addComm) {
        window.addComm('SYSTEM', 'Countermeasures depleted. Reloading...', 'warning');
      }
      return;
    }

    const gameState = window.Starfighter && window.Starfighter.getState ? window.Starfighter.getState() : null;
    if (!gameState || !gameState.player) return;

    // Deploy flare
    _state.countermeasures -= 1;
    _state.lastDeployTime = now;

    const player = gameState.player;

    // Create flare entity behind player
    const deployPos = player.position.clone();
    const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(player.quaternion);
    deployPos.add(backward.multiplyScalar(30)); // 30m behind

    // Initial velocity: player velocity + small random spread
    const flareVel = player.velocity.clone();
    flareVel.add(new THREE.Vector3(
      (Math.random() - 0.5) * 50,
      (Math.random() - 0.5) * 50,
      (Math.random() - 0.5) * 50
    ));

    // Create flare entity (visible decoy)
    const flareEntity = {
      id: `flare_${now}_${Math.random()}`,
      type: 'flare',
      position: deployPos,
      velocity: flareVel,
      quaternion: new THREE.Quaternion(),
      friendly: true,
      radius: 2,
      markedForDeletion: false
    };

    gameState.entities.push(flareEntity);

    _state.activeFlares.push({
      entity: flareEntity,
      deployTime: now,
      lifetime: FLARE_LIFETIME
    });

    // Visual/audio feedback
    if (window.SFAudio) {
      window.SFAudio.playSound('flare_deploy');
    }
    if (window.addComm) {
      window.addComm('SYSTEM', 'Countermeasures deployed.', 'info');
    }
    if (window.SF3D && window.SF3D.spawnFlareEffect) {
      window.SF3D.spawnFlareEffect(deployPos);
    }

    updateGauge();
    updateButton();
  }

  // ── Update Radar Threat Highlighting ──
  function _updateRadarThreats() {
    // This is called by the main radar update
    // Expose incoming threats for radar to highlight
    return {
      incoming: _state.incomingThreats,
      lockedBy: _state.lockedOnBy
    };
  }

  // ── Update Alerts and Warnings ──
  function _updateAlerts(now) {
    const lockAlert = document.getElementById('lock-alert');
    const incomingAlert = document.getElementById('incoming-alert');

    // Lock warning
    if (lockAlert) {
      if (_state.lockedOnBy.size > 0) {
        lockAlert.style.display = 'block';
        lockAlert.textContent = `⚠ LOCK WARNING - ${_state.lockedOnBy.size} HOSTILE${_state.lockedOnBy.size > 1 ? 'S' : ''}`;
        // Pulse animation
        const pulse = Math.sin(now * 0.01) * 0.3 + 0.7;
        lockAlert.style.opacity = pulse;
      } else {
        lockAlert.style.display = 'none';
      }
    }

    // Incoming warning
    if (incomingAlert) {
      if (_state.incomingThreats.size > 0) {
        incomingAlert.style.display = 'block';
        incomingAlert.textContent = `⚠ INCOMING - ${_state.incomingThreats.size} THREAT${_state.incomingThreats.size > 1 ? 'S' : ''}`;
        // Pulse animation
        const pulse = Math.sin(now * 0.012) * 0.3 + 0.7;
        incomingAlert.style.opacity = pulse;
      } else {
        incomingAlert.style.display = 'none';
      }
    }
  }

  // ── Hide Alerts ──
  function hideAlerts() {
    const lockAlert = document.getElementById('lock-alert');
    const incomingAlert = document.getElementById('incoming-alert');
    if (lockAlert) lockAlert.style.display = 'none';
    if (incomingAlert) incomingAlert.style.display = 'none';
  }

  // ── Update Countermeasures Gauge ──
  function updateGauge() {
    const fill = document.getElementById('cm-gauge-fill');
    const count = document.getElementById('cm-count');

    if (fill) {
      const pct = (_state.countermeasures / _state.maxCountermeasures) * 100;
      fill.style.width = pct + '%';

      // Color based on availability
      if (pct < 25) {
        fill.style.background = 'linear-gradient(90deg, #aa0000, #ff0000)';
      } else if (pct < 50) {
        fill.style.background = 'linear-gradient(90deg, #aa6600, #ff8800)';
      } else {
        fill.style.background = 'linear-gradient(90deg, #00aa44, #00ff66)';
      }
    }

    if (count) {
      count.textContent = Math.floor(_state.countermeasures);
    }
  }

  // ── Update Deploy Button State ──
  function updateButton() {
    const btn = document.getElementById('cm-deploy-btn');
    if (!btn) return;

    const now = performance.now();
    const onCooldown = now - _state.lastDeployTime < _state.deployCooldown;
    const available = _state.countermeasures >= 1;

    if (onCooldown || !available) {
      btn.classList.add('disabled');
    } else {
      btn.classList.remove('disabled');
    }

    // Show during combat only
    const gameState = window.Starfighter && window.Starfighter.getState ? window.Starfighter.getState() : null;
    const inCombat = gameState && gameState.phase === 'combat';
    btn.style.display = inCombat ? 'block' : 'none';
  }

  // ── Get Threat Data (for radar integration) ──
  function getThreats() {
    return {
      incoming: _state.incomingThreats,
      lockedBy: _state.lockedOnBy,
      activeFlares: _state.activeFlares
    };
  }

  // ── Public API ──
  return {
    init,
    reset,
    update,
    deployCM,
    getThreats,
    isIncoming: (entity) => _state.incomingThreats.has(entity),
    isLockingUs: (entity) => _state.lockedOnBy.has(entity)
  };
})();

// Expose globally
window.SFThreatSys = SFThreatSys;
