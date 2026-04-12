/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SPACE COMBAT - MANIFOLD EDITION
 * Game Coordinator (Single Source of Truth)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This coordinator:
 * 1. Initializes game state on manifold
 * 2. Updates manifold each frame
 * 3. All systems (physics, graphics, audio, logic) read from manifold
 * 4. No redundant code - everything uses shared substrates
 */

class SpaceCombatManifold {
  constructor(canvasId = 'canvas') {
    this.canvasId = canvasId;
    this.manifold = ManifoldSurface;
    this.registry = SubstrateRegistry;
    this.gameConfig = null;
    this.gameCoordinate = null;
    this.substrates = {};
    this.gameState = {
      isRunning: false,
      isPaused: false,
      score: 0,
      wave: 1,
      maxWaves: 10,
      starbaseHealth: 100,
      enemiesDefeated: 0,
      throttle: 0,
      pitch: 0,
      yaw: 0,
      roll: 0
    };
    this.input = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      mouseX: 0,
      mouseY: 0,
      firing: false
    };
  }

  /**
   * Initialize the game
   */
  async initialize(gameMode = 'solo', playerCount = 1, playerUsername = 'Pilot') {
    console.log('⚔️ Initializing Space Combat on Manifold...');

    // 1. Load game configuration
    const gameId = gameMode === 'solo' ? 'space-combat-solo' : 'space-combat-multiplayer';
    this.gameConfig = GameConfig.load(gameId);

    // 2. Create manifold coordinate
    this.gameCoordinate = this.gameConfig.createCoordinate({
      playerCount,
      playtime: 30,
      skillLevel: 0.5
    });

    console.log(`✓ Game coordinate: ${this.gameCoordinate}`);

    // 3. Initialize manifold with game state
    this.manifold.clear();
    this.manifold.initialize(
      [
        { name: 'playerCount', min: 1, max: 4 },
        { name: 'playtime', min: 5, max: 180 }
      ],
      {}
    );

    // 4. Write initial game state to manifold
    const initialState = this._createInitialGameState(playerUsername);
    this.manifold.write(this.gameCoordinate, initialState);
    console.log('✓ Initial game state written to manifold');

    // 5. Initialize substrates
    this.registry.initialize(this.manifold);
    this._registerSubstrates();
    this._loadSubstrates();

    console.log('✓ All substrates loaded');

    // 6. Setup input handling
    this._setupInputHandling();

    console.log('✓ Space Combat Manifold ready!\n');
  }

  /**
   * Main game loop
   */
  run() {
    this.gameState.isRunning = true;
    const animate = () => {
      requestAnimationFrame(animate);

      if (this.gameState.isPaused || !this.gameState.isRunning) return;

      // 1. Process input and update controls
      this._updateControls();

      // 2. Update physics (flight dynamics, collision, missiles)
      this._updatePhysics();

      // 3. Update enemies (AI, wave progression)
      this._updateEnemies();

      // 4. Update logic (scoring, win/loss conditions)
      this._updateGameLogic();

      // 5. Update manifold with current state
      this._syncToManifold();

      // 6. Render (graphics reads from manifold)
      this._render();

      // 7. Update UI (reads from manifold)
      this._updateUI();

      // 8. Update audio (reads from manifold)
      this._updateAudio();
    };

    animate();
  }

  /**
   * Pause/unpause game
   */
  togglePause() {
    this.gameState.isPaused = !this.gameState.isPaused;
  }

  /**
   * End game (mission failed)
   */
  missionFailed() {
    this.gameState.isRunning = false;
    console.log(`Mission Failed! Final Score: ${this.gameState.score}`);
    document.getElementById('final-stats').innerHTML = `
      <div>Waves Survived: ${this.gameState.wave - 1}/10</div>
      <div>Enemies Destroyed: ${this.gameState.enemiesDefeated}</div>
      <div id="final-score">Final Score: ${this.gameState.score}</div>
    `;
    document.getElementById('game-over').classList.remove('hidden');
  }

  /**
   * End game (mission complete)
   */
  missionComplete() {
    this.gameState.isRunning = false;
    console.log(`Mission Complete! Final Score: ${this.gameState.score}`);
    document.getElementById('victory-stats').innerHTML = `
      <div>All 10 Waves Defeated!</div>
      <div>Total Enemies: ${this.gameState.enemiesDefeated}</div>
      <div id="victory-score">Final Score: ${this.gameState.score}</div>
    `;
    document.getElementById('victory').classList.remove('hidden');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  _registerSubstrates() {
    this.registry.register('physics', PhysicsSubstrate);
    this.registry.register('graphics', GraphicsSubstrate);
    this.registry.register('audio', AudioSubstrate);
    this.registry.register('gamelogic', GameLogicSubstrate);
    this.registry.register('controlmapping', ControlMappingSubstrate);
    this.registry.register('ui', UISubstrate);
    this.registry.register('multiplayer', MultiplayerSubstrate);
    this.registry.register('persistence', PersistenceSubstrate);
    this.registry.register('ai', AISubstrate);
  }

  _loadSubstrates() {
    this.substrates.physics = this.registry.get('physics');
    this.substrates.graphics = this.registry.get('graphics');
    this.substrates.audio = this.registry.get('audio');
    this.substrates.gamelogic = this.registry.get('gamelogic');
    this.substrates.controlmapping = this.registry.get('controlmapping');
    this.substrates.ui = this.registry.get('ui');
    this.substrates.multiplayer = this.registry.get('multiplayer');
    this.substrates.persistence = this.registry.get('persistence');
    this.substrates.ai = this.registry.get('ai');
  }

  _createInitialGameState(playerUsername) {
    return {
      // Player ship (cockpit view)
      ship: {
        id: 'player-ship',
        mass: 500,
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        maxSpeed: 50,
        acceleration: 0.3,
        material: { color: 0x00ffcc, emissive: 0x00ff88 }
      },
      // Starbase to defend (static)
      starbase: {
        id: 'starbase',
        position: { x: 100, y: 50, z: 200 },
        health: 100,
        maxHealth: 100,
        radius: 20,
        material: { color: 0x00ff00, emissive: 0x00aa00 }
      },
      // Enemy fighters (spawned per wave)
      enemies: [],
      // Missiles fired by player
      missiles: [],
      // Asteroids in space
      asteroids: [],
      // Physics parameters for space
      gravity: 0,
      airResistance: 0.98,
      scene: { background: 0x000011, fog: null, ambientLight: 0x333333 },
      camera: { position: { x: 0, y: 2, z: -5 }, target: { x: 0, y: 0, z: 100 }, fov: 75 },
      lighting: [
        { type: 'ambient', intensity: 0.5, color: 0xffffff },
        { type: 'point', intensity: 1.2, position: { x: 200, y: 100, z: 300 }, color: 0x00ffff }
      ],
      // Audio
      music: { track: 'space-theme', volume: 0.5, loop: true },
      soundEffects: [],
      // UI
      hud: {
        visible: true,
        elements: [
          { id: 'wave', value: 1, position: { x: 10, y: 10 } },
          { id: 'enemies', value: 0, position: { x: 10, y: 30 } },
          { id: 'shield', value: 100, position: { x: 10, y: 50 } },
          { id: 'score', value: 0, position: { x: 10, y: 70 } },
          { id: 'throttle', value: 0, position: { x: 10, y: 90 } }
        ]
      },
      // Game state
      gameState: {
        isActive: true,
        isPaused: false,
        isGameOver: false,
        wave: 1,
        maxWaves: 10,
        waveStartTime: 0
      },
      // Scoring
      scoring: {
        enemyKill: 50,
        asteroidDodge: 10,
        waveComplete: 100,
        starbaseHit: -100,
        timeBonus: 1
      },
      // Win/loss conditions
      winConditions: [{ condition: 'waveComplete', wave: 10 }],
      lossConditions: [{ condition: 'starbaseDestroyed', health: 0 }],
      // Player info
      user: { id: 'local-user', username: playerUsername },
      stats: { gamesPlayed: 0, gamesWon: 0, wavesReached: 0, totalScore: 0, bestScore: 0 }
    };
  }

  _setupInputHandling() {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyW') this.input.forward = true;
      if (e.code === 'KeyA') this.input.left = true;
      if (e.code === 'KeyS') this.input.backward = true;
      if (e.code === 'KeyD') this.input.right = true;
      if (e.code === 'Space') this.input.firing = true;
    });

    document.addEventListener('keyup', (e) => {
      if (e.code === 'KeyW') this.input.forward = false;
      if (e.code === 'KeyA') this.input.left = false;
      if (e.code === 'KeyS') this.input.backward = false;
      if (e.code === 'KeyD') this.input.right = false;
      if (e.code === 'Space') this.input.firing = false;
    });

    document.addEventListener('mousemove', (e) => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      this.input.mouseX = (e.clientX - centerX) / centerX;
      this.input.mouseY = (e.clientY - centerY) / centerY;
    });
  }

  _updateControls() {
    // Apply throttle
    if (this.input.forward) {
      this.gameState.throttle = Math.min(100, this.gameState.throttle + 2);
    } else if (this.input.backward) {
      this.gameState.throttle = Math.max(0, this.gameState.throttle - 2);
    } else {
      this.gameState.throttle = Math.max(0, this.gameState.throttle - 1);
    }

    // Apply pitch/yaw from mouse
    this.gameState.pitch = this.input.mouseY * 45; // ±45 degrees
    this.gameState.yaw = this.input.mouseX * 45; // ±45 degrees
  }

  _updatePhysics() {
    const current = this.manifold.read(this.gameCoordinate);
    if (!current || !current.ship) return;

    const physics = this.substrates.physics;
    const ship = current.ship;

    // Calculate thrust force based on throttle
    const thrustMagnitude = (this.gameState.throttle / 100) * 2;
    const forces = {
      [ship.id]: {
        x: Math.sin(this.gameState.yaw * Math.PI / 180) * thrustMagnitude,
        y: 0,
        z: Math.cos(this.gameState.yaw * Math.PI / 180) * thrustMagnitude
      }
    };

    // Update ship physics
    const updatedShip = physics.updateVelocities([ship], forces, 0.016)[0];
    const finalShip = physics.updatePositions([updatedShip], 0.016)[0];

    current.ship = finalShip;

    // Check missile collisions
    if (current.missiles && current.enemies) {
      for (let i = current.missiles.length - 1; i >= 0; i--) {
        const missile = current.missiles[i];
        for (let j = current.enemies.length - 1; j >= 0; j--) {
          const enemy = current.enemies[j];
          if (physics.checkCollision(missile, enemy)) {
            enemy.health = (enemy.health || 1) - 1;
            current.missiles.splice(i, 1);
            this.gameState.score += 50;
            this.gameState.enemiesDefeated += 1;
            break;
          }
        }
      }
    }

    // Check starbase collisions
    if (current.enemies) {
      for (const enemy of current.enemies) {
        if (physics.checkCollision(enemy, current.starbase)) {
          current.starbase.health -= 5;
          this.gameState.score -= 100;
        }
      }
    }

    // Remove dead enemies
    if (current.enemies) {
      current.enemies = current.enemies.filter(e => e.health > 0);
    }

    this.manifold.write(this.gameCoordinate, current);
  }

  _updateEnemies() {
    const current = this.manifold.read(this.gameCoordinate);
    if (!current) return;

    const ai = this.substrates.ai;

    // Spawn enemies based on wave
    const enemyCount = Math.min(3 + this.gameState.wave, 12);
    const currentEnemyCount = (current.enemies || []).length;

    if (currentEnemyCount < enemyCount && this.gameState.wave <= 10) {
      // Spawn new enemy
      const angle = Math.random() * Math.PI * 2;
      const distance = 80 + Math.random() * 40;
      const newEnemy = {
        id: `enemy-${Date.now()}-${Math.random()}`,
        position: {
          x: current.starbase.position.x + Math.cos(angle) * distance,
          y: current.starbase.position.y + (Math.random() - 0.5) * 40,
          z: current.starbase.position.z + Math.sin(angle) * distance
        },
        velocity: { x: 0, y: 0, z: 0 },
        health: 1,
        difficulty: Math.floor(this.gameState.wave / 3) || 'easy',
        ai: ai.createBot(`enemy-${this.gameState.wave}-${currentEnemyCount}`, 'easy')
      };
      current.enemies.push(newEnemy);
    }

    // Update enemy AI
    if (current.enemies) {
      for (const enemy of current.enemies) {
        // Simple AI: move toward starbase
        const dx = current.starbase.position.x - enemy.position.x;
        const dy = current.starbase.position.y - enemy.position.y;
        const dz = current.starbase.position.z - enemy.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist > 0.01) {
          enemy.velocity.x = (dx / dist) * 15;
          enemy.velocity.y = (dy / dist) * 15;
          enemy.velocity.z = (dz / dist) * 15;
        }

        // Move
        enemy.position.x += enemy.velocity.x * 0.016;
        enemy.position.y += enemy.velocity.y * 0.016;
        enemy.position.z += enemy.velocity.z * 0.016;
      }
    }

    this.manifold.write(this.gameCoordinate, current);
  }

  _updateGameLogic() {
    const current = this.manifold.read(this.gameCoordinate);
    if (!current) return;

    // Fire missiles
    if (this.input.firing && (!current.fireLastFrame || Date.now() - current.fireLastFrame > 100)) {
      const missile = {
        id: `missile-${Date.now()}`,
        position: { ...current.ship.position },
        velocity: {
          x: Math.sin(this.gameState.yaw * Math.PI / 180) * 60,
          y: 0,
          z: Math.cos(this.gameState.yaw * Math.PI / 180) * 60
        },
        radius: 0.2,
        lifetime: 5000
      };
      current.missiles.push(missile);
      current.fireLastFrame = Date.now();
    }

    // Remove old missiles
    if (current.missiles) {
      current.missiles = current.missiles.filter(m => Date.now() - m.spawnTime < 5000);
    }

    // Check wave complete
    if (current.enemies.length === 0 && this.gameState.wave < 10) {
      this.gameState.wave += 1;
      this.gameState.score += 100;
      console.log(`✓ Wave ${this.gameState.wave - 1} complete!`);
    }

    // Check victory
    if (this.gameState.wave === 10 && current.enemies.length === 0) {
      this.missionComplete();
      this.manifold.write(this.gameCoordinate, current);
      return;
    }

    // Check defeat
    if (current.starbase.health <= 0) {
      this.missionFailed();
      this.manifold.write(this.gameCoordinate, current);
      return;
    }

    this.manifold.write(this.gameCoordinate, current);
  }

  _syncToManifold() {
    const current = this.manifold.read(this.gameCoordinate);
    current.gameState = {
      isActive: this.gameState.isRunning,
      isPaused: this.gameState.isPaused,
      isGameOver: !this.gameState.isRunning,
      wave: this.gameState.wave,
      maxWaves: this.gameState.maxWaves
    };
    current.hud.elements[0].value = this.gameState.wave;
    current.hud.elements[1].value = current.enemies ? current.enemies.length : 0;
    current.hud.elements[2].value = current.starbase.health;
    current.hud.elements[3].value = this.gameState.score;
    current.hud.elements[4].value = Math.round(this.gameState.throttle);

    this.manifold.write(this.gameCoordinate, current);
  }

  _render() {
    const graphicsData = this.substrates.graphics.extract(this.gameCoordinate);
    // In a real implementation, this would update Three.js scene
    // For now, this serves as validator that graphics substrate reads manifold
  }

  _updateUI() {
    const waveEl = document.getElementById('wave-display');
    const enemiesEl = document.getElementById('enemies-display');
    const healthEl = document.getElementById('health-display');
    const scoreEl = document.getElementById('score-display');
    const throttleEl = document.getElementById('throttle-display');

    if (waveEl) waveEl.textContent = `Wave: ${this.gameState.wave}/${this.gameState.maxWaves}`;
    if (enemiesEl) {
      const current = this.manifold.read(this.gameCoordinate);
      enemiesEl.textContent = `Enemies: ${current && current.enemies ? current.enemies.length : 0}`;
    }
    if (healthEl) {
      const current = this.manifold.read(this.gameCoordinate);
      const health = current && current.starbase ? current.starbase.health : 100;
      healthEl.textContent = `Shield: ${health}%`;
    }
    if (scoreEl) scoreEl.textContent = `Score: ${this.gameState.score}`;
    if (throttleEl) throttleEl.textContent = `Throttle: ${Math.round(this.gameState.throttle)}%`;
  }

  _updateAudio() {
    const audioData = this.substrates.audio.extract(this.gameCoordinate);
    // Audio substrate handles sound playback from manifold
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpaceCombatManifold;
}
if (typeof window !== 'undefined') {
  window.SpaceCombatManifold = SpaceCombatManifold;
}
