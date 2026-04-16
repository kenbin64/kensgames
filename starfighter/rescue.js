// ═══════════════════════════════════════════════════════════
// RESCUE SYSTEM — Emergency Fleet Support
// ═══════════════════════════════════════════════════════════
// Red emergency rescue button autopilots player to rescue fleet
// for fuel, repairs, and shield restoration. 3 uses per mission.
//
// Rescue fleet composition:
// - Rescue Command Ship (leads, coordinates all three)
// - Medical Frigate (repairs hull damage when shields low)
// - Fuel Tanker (refuels)
//
// Fleet constantly moves to stay out of harm's way, repositions
// after each rescue back to original patrol area.
// ═══════════════════════════════════════════════════════════

const SFRescue = (function () {
  'use strict';

  // ── Rescue State ──
  const _state = {
    usesRemaining: 3,      // Player gets 3 rescues per mission
    maxUses: 3,
    inProgress: false,     // Currently in rescue autopilot
    fleetPosition: null,   // Current fleet location {x, y, z}
    fleetOriginalPos: null,// Return position after rescue
    rescueShip: null,      // Reference to rescue command entity
    tanker: null,          // Reference to tanker entity
    medic: null,           // Reference to medical frigate entity
    autopilotTarget: null, // Target position for autopilot
    autopilotSpeed: 0,     // Autopilot velocity
    initialized: false
  };

  // ── Constants ──
  const RESCUE_AUTOPILOT_SPEED = 800;  // Fast transit to rescue fleet
  const RESCUE_DISTANCE = 150;         // Dock within 150 units
  const FLEET_SPACING = 300;           // Distance between ships
  const FLEET_PATROL_SPEED = 40;       // Slow patrol movement
  const DANGER_THRESHOLD = 3000;       // Flee if enemies within 3km
  const SAFE_DISTANCE = 8000;          // Prefer to stay this far from combat

  // ── Eligibility Conditions ──
  function isEligible(player) {
    if (!player || _state.usesRemaining <= 0) return false;
    if (_state.inProgress) return false;

    const fuelPct = player.fuel / player.maxFuel;
    const shieldPct = player.shields / player.maxShields;
    const hullPct = player.hull / player.maxHull;

    // Low fuel (<25%), low shield (<15%), or moderate hull damage when shields low
    return fuelPct < 0.25 || shieldPct < 0.15 || (shieldPct < 0.4 && hullPct < 0.6);
  }

  // ── Initialize Rescue Fleet ──
  function init(gameState) {
    if (_state.initialized) return;
    if (!gameState || !gameState.entities) return;

    // Find existing tanker and medic entities
    _state.tanker = gameState.entities.find(e => e.type === 'tanker');
    _state.medic = gameState.entities.find(e => e.type === 'medic');

    // Create rescue command ship if needed
    const existingRescue = gameState.entities.find(e => e.type === 'rescue');
    if (!existingRescue && _state.tanker && _state.medic) {
      const baseship = gameState.entities.find(e => e.type === 'baseship');
      const basePos = baseship ? baseship.position : new THREE.Vector3(0, 0, -12000);

      // Position rescue fleet away from combat, near home base
      const angle = Math.random() * Math.PI * 2;
      const dist = SAFE_DISTANCE + Math.random() * 2000;
      const fleetX = basePos.x + Math.cos(angle) * dist;
      const fleetY = basePos.y + (Math.random() - 0.5) * 1000;
      const fleetZ = basePos.z + Math.sin(angle) * dist;

      _state.fleetPosition = new THREE.Vector3(fleetX, fleetY, fleetZ);
      _state.fleetOriginalPos = _state.fleetPosition.clone();

      // Position tanker and medic relative to fleet center
      if (_state.tanker) {
        _state.tanker.position.set(fleetX - FLEET_SPACING, fleetY, fleetZ);
        _state.tanker._rescueFleet = true;
      }
      if (_state.medic) {
        _state.medic.position.set(fleetX + FLEET_SPACING, fleetY, fleetZ);
        _state.medic._rescueFleet = true;
      }

      // Create rescue command ship (using ally type as placeholder)
      _state.rescueShip = new gameState.Entity('ally', fleetX, fleetY, fleetZ + FLEET_SPACING);
      _state.rescueShip.callsign = 'RESCUE-1';
      _state.rescueShip.friendly = true;
      _state.rescueShip._rescueFleet = true;
      _state.rescueShip._rescueCommander = true;
      gameState.entities.push(_state.rescueShip);

      _state.initialized = true;
    }
  }

  // ── Reset Rescue Uses (call at mission start) ──
  function reset() {
    _state.usesRemaining = _state.maxUses;
    _state.inProgress = false;
    _state.initialized = false;
    updateButtonUI();
  }

  // ── Update Button UI ──
  function updateButtonUI() {
    const btn = document.getElementById('rescue-btn');
    const usesText = document.getElementById('rescue-uses');

    if (!btn) return;

    const gameState = window.Starfighter && window.Starfighter.getState ? window.Starfighter.getState() : null;
    const player = gameState ? gameState.player : null;
    const eligible = player ? isEligible(player) : false;

    // Show button only during combat and if eligible
    const inCombat = gameState && gameState.phase === 'combat';
    btn.style.display = (inCombat && eligible) ? 'block' : 'none';

    if (eligible && _state.usesRemaining > 0 && !_state.inProgress) {
      btn.classList.remove('disabled');
    } else {
      btn.classList.add('disabled');
    }

    if (usesText) {
      usesText.textContent = `${_state.usesRemaining} USE${_state.usesRemaining === 1 ? '' : 'S'} LEFT`;
    }
  }

  // ── Request Emergency Rescue ──
  function requestRescue() {
    const gameState = window.Starfighter && window.Starfighter.getState ? window.Starfighter.getState() : null;
    if (!gameState || !gameState.player) return;

    const player = gameState.player;

    if (!isEligible(player)) {
      if (window.SFAudio) window.SFAudio.playSound('error');
      if (window.addComm) window.addComm('RESCUE-1', 'Negative. You don\'t meet rescue criteria. RTB if needed.', 'rescue');
      return;
    }

    if (_state.usesRemaining <= 0) {
      if (window.SFAudio) window.SFAudio.playSound('error');
      if (window.addComm) window.addComm('RESCUE-1', 'No rescue uses remaining. Return to base.', 'rescue');
      return;
    }

    // Initialize fleet if needed
    if (!_state.initialized) init(gameState);

    if (!_state.fleetPosition) {
      if (window.SFAudio) window.SFAudio.playSound('error');
      if (window.addComm) window.addComm('BASE', 'Rescue fleet unavailable.', 'base');
      return;
    }

    // Start rescue
    _state.inProgress = true;
    _state.usesRemaining--;
    _state.autopilotTarget = _state.fleetPosition.clone();

    if (window.SFAudio) window.SFAudio.playSound('comm_beep');
    if (window.addComm) {
      window.addComm('RESCUE-1', 'Roger, emergency rescue authorized. Autopilot engaged. ETA 10 seconds.', 'rescue');
    }

    updateButtonUI();
  }

  // ── Update Rescue System (call every frame) ──
  function update(dt, gameState) {
    if (!gameState || !gameState.player) return;

    const player = gameState.player;

    // Update button visibility
    updateButtonUI();

    // Update fleet AI (keep out of danger)
    if (_state.initialized && _state.fleetPosition) {
      _updateFleetPosition(dt, gameState);
    }

    // Handle rescue autopilot
    if (_state.inProgress && _state.autopilotTarget) {
      const dist = player.position.distanceTo(_state.autopilotTarget);

      if (dist < RESCUE_DISTANCE) {
        // Arrived at fleet — perform rescue services
        _performRescue(player, gameState);
      } else {
        // Autopilot to fleet
        const dir = new THREE.Vector3()
          .subVectors(_state.autopilotTarget, player.position)
          .normalize();

        player.velocity.copy(dir).multiplyScalar(RESCUE_AUTOPILOT_SPEED);
        player.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
      }
    }
  }

  // ── Update Fleet Position (avoid danger) ──
  function _updateFleetPosition(dt, gameState) {
    if (!_state.fleetPosition || !_state.rescueShip) return;

    // Find nearest threat
    let nearestThreat = null;
    let nearestDist = Infinity;

    for (const ent of gameState.entities) {
      if (!ent.friendly && ent.type !== 'projectile') {
        const dist = ent.position.distanceTo(_state.fleetPosition);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestThreat = ent;
        }
      }
    }

    // If threat too close, flee in opposite direction
    if (nearestThreat && nearestDist < DANGER_THRESHOLD) {
      const fleeDir = new THREE.Vector3()
        .subVectors(_state.fleetPosition, nearestThreat.position)
        .normalize();

      _state.fleetPosition.add(fleeDir.multiplyScalar(FLEET_PATROL_SPEED * dt));
    } else {
      // Patrol slowly around original position
      const angle = (Date.now() / 30000) * Math.PI * 2; // 30s orbit
      const orbitRadius = 800;
      const targetX = _state.fleetOriginalPos.x + Math.cos(angle) * orbitRadius;
      const targetZ = _state.fleetOriginalPos.z + Math.sin(angle) * orbitRadius;

      const toTarget = new THREE.Vector3(targetX, _state.fleetOriginalPos.y, targetZ);
      const dir = toTarget.sub(_state.fleetPosition).normalize();
      _state.fleetPosition.add(dir.multiplyScalar(FLEET_PATROL_SPEED * dt * 0.3));
    }

    // Update ship positions
    if (_state.rescueShip) {
      _state.rescueShip.position.copy(_state.fleetPosition).add(new THREE.Vector3(0, 0, FLEET_SPACING));
    }
    if (_state.tanker) {
      _state.tanker.position.copy(_state.fleetPosition).add(new THREE.Vector3(-FLEET_SPACING, 0, 0));
    }
    if (_state.medic) {
      _state.medic.position.copy(_state.fleetPosition).add(new THREE.Vector3(FLEET_SPACING, 0, 0));
    }
  }

  // ── Perform Rescue Services ──
  function _performRescue(player, gameState) {
    _state.inProgress = false;
    _state.autopilotTarget = null;

    // Full restoration
    player.fuel = player.maxFuel;
    player.shields = player.maxShields;
    player.hull = player.maxHull;
    player.torpedoes = Math.min(player.torpedoes + 2, player.maxTorpedoes || 6);

    // Stop player velocity
    player.velocity.set(0, 0, 0);

    if (window.SFAudio) {
      window.SFAudio.playSound('powerup');
      window.SFAudio.playSound('comm_beep');
    }

    if (window.addComm) {
      window.addComm('RESCUE-1', 'Rescue complete. All systems restored. Good hunting, pilot.', 'rescue');
      window.addComm('MEDIC', 'Hull integrity restored. Shield generators recharged.', 'support');
      window.addComm('TANKER', 'Fuel tanks topped off. Weapons rearmed.', 'support');
    }

    // Return fleet to original position over time
    setTimeout(() => {
      if (_state.fleetOriginalPos && _state.fleetPosition) {
        _state.fleetPosition.copy(_state.fleetOriginalPos);
      }
    }, 5000);

    updateButtonUI();
  }

  // ── Public API ──
  return {
    init,
    reset,
    update,
    requestRescue,
    isEligible,
    getUsesRemaining: () => _state.usesRemaining
  };
})();

// Expose globally
window.SFRescue = SFRescue;
