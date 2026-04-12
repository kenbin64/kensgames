/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BRICKBREAKER 3D - MANIFOLD EDITION
 * Game Coordinator (Single Source of Truth)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This coordinator:
 * 1. Initializes game state on manifold
 * 2. Updates manifold each frame
 * 3. All systems (physics, graphics, audio, logic) read from manifold
 * 4. No redundant code - everything uses shared substrates
 */

class BrickBreaker3DManifold {
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
      lives: 5,
      level: 1
    };
  }

  /**
   * Initialize the game
   */
  async initialize(gameMode = 'solo', playerCount = 1, playerUsername = 'Player') {
    console.log('🌀 Initializing BrickBreaker3D on Manifold...');

    // 1. Load game configuration
    const gameId = gameMode === 'solo' ? 'brickbreaker3d-solo' : 'brickbreaker3d-multiplayer';
    this.gameConfig = GameConfig.load(gameId);

    // 2. Create manifold coordinate
    this.gameCoordinate = this.gameConfig.createCoordinate({
      playerCount,
      playtime: 20,
      skillLevel: 0.5
    });

    console.log(`✓ Game coordinate: ${this.gameCoordinate}`);

    // 3. Initialize manifold with game state
    this.manifold.clear();
    this.manifold.initialize(
      [
        { name: 'playerCount', min: 1, max: 6 },
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

    // 6. Setup Three.js renderer
    this._initializeRenderer();

    console.log('✓ BrickBreaker3D Manifold ready!\n');
  }

  /**
   * Main game loop
   */
  run() {
    this.gameState.isRunning = true;
    const animate = () => {
      requestAnimationFrame(animate);

      if (this.gameState.isPaused) return;

      // 1. Update physics
      this._updatePhysics();

      // 2. Update logic (scoring, conditions)
      this._updateGameLogic();

      // 3. Update manifold with current state
      this._syncToManifold();

      // 4. Render (graphics reads from manifold)
      this._render();

      // 5. Update UI (reads from manifold)
      this._updateUI();
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
   * End game
   */
  endGame() {
    this.gameState.isRunning = false;
    console.log(`Game Over! Final Score: ${this.gameState.score}`);
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
    this.substrates.persistence = this.registry.get('persistence');
    this.substrates.ai = this.registry.get('ai');
  }

  _createInitialGameState(playerUsername) {
    return {
      bodies: [
        {
          id: 'ball',
          model: 'sphere',
          mass: 50,
          position: { x: 0, y: 0, z: 0 },
          velocity: { x: 0.15, y: -0.2, z: 0 },
          radius: 0.5,
          material: { color: 0x00ffcc, emissive: 0x00ffcc }
        },
        {
          id: 'paddle',
          model: 'box',
          mass: 1000,
          position: { x: 0, y: -15, z: 0 },
          isStatic: true,
          scale: { x: 3, y: 0.4, z: 0.75 },
          material: { color: 0x00ffcc, metalness: 0.8, emissive: 0x00ff88 }
        }
      ],
      bricks: this._generateBricks(),
      gravity: 0,
      airResistance: 0.99,
      scene: { background: 0x000000, fog: null, ambientLight: 0x666666 },
      camera: { position: { x: 0, y: 0, z: 30 }, target: { x: 0, y: 0, z: 0 }, fov: 75 },
      lighting: [
        { type: 'ambient', intensity: 0.6, color: 0xffffff },
        { type: 'point', intensity: 0.8, position: { x: 20, y: 20, z: 20 }, color: 0x00ffcc }
      ],
      music: { track: 'game-theme', volume: 0.6, loop: true },
      keyboard: { mousemove: 'paddle-aim' },
      hud: {
        visible: true,
        elements: [
          { id: 'score', value: 0, position: { x: 10, y: 10 } },
          { id: 'lives', value: 5, position: { x: 10, y: 30 } },
          { id: 'level', value: 1, position: { x: 10, y: 50 } }
        ]
      },
      gameState: { isActive: true, isPaused: false, isGameOver: false },
      scoring: { brickBreak: 10, combo: 5, speedBonus: 15 },
      winConditions: [{ condition: 'allBricksDestroyed', reward: 1000 }],
      lossConditions: [{ condition: 'ballDropped', penalty: -100 }],
      user: { id: 'local-user', username: playerUsername },
      stats: { gamesPlayed: 0, gamesWon: 0, totalScore: 0, bestScore: 0 }
    };
  }

  _generateBricks() {
    const bricks = [];
    const colors = [0xff6b9d, 0x22d3ee, 0xffd700, 0x00ff88, 0x8a2be2];
    let id = 0;

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        bricks.push({
          id: `brick-${id++}`,
          model: 'box',
          position: {
            x: -12 + col * 4,
            y: 10 - row * 2,
            z: 0
          },
          scale: { x: 1.8, y: 0.8, z: 1 },
          material: { color: colors[row % colors.length], metalness: 0.6 },
          isStatic: true,
          health: 1
        });
      }
    }

    return bricks;
  }

  _initializeRenderer() {
    const canvas = document.getElementById(this.canvasId);
    const graphics = this.substrates.graphics;

    // Extract graphics config from manifold
    const graphicsConfig = graphics.extract(this.gameCoordinate);

    // Initialize Three.js (simplified)
    console.log('✓ Renderer initialized (graphics substrate ready)');
  }

  _updatePhysics() {
    const current = this.manifold.read(this.gameCoordinate);
    if (!current || !current.bodies) return;

    // Physics substrate handles all physics calculations
    const physics = this.substrates.physics;
    const forces = { ball: { x: 0, y: 0, z: 0 } };

    const updatedBodies = physics.updateVelocities(current.bodies, forces, 0.016);
    const finalBodies = physics.updatePositions(updatedBodies, 0.016);

    // Check collisions
    for (let i = 0; i < finalBodies.length; i++) {
      for (let j = i + 1; j < finalBodies.length; j++) {
        if (physics.checkCollision(finalBodies[i], finalBodies[j])) {
          const resolved = physics.resolveCollision(finalBodies[i], finalBodies[j]);
          finalBodies[i] = resolved.body1;
          finalBodies[j] = resolved.body2;
          this.gameState.score += 10; // Collision bonus
        }
      }
    }

    current.bodies = finalBodies;
    this.manifold.write(this.gameCoordinate, current);
  }

  _updateGameLogic() {
    const current = this.manifold.read(this.gameCoordinate);
    const gamelogic = this.substrates.gamelogic;

    // Check win condition
    const allBricksBroken = !current.bricks || current.bricks.every(b => b.health <= 0);
    if (allBricksBroken && current.bricks && current.bricks.length > 0) {
      console.log('✓ Level complete!');
      this.gameState.lives += 1; // Bonus life
    }

    // Check loss condition (ball dropped)
    const ball = current.bodies?.find(b => b.id === 'ball');
    if (ball && ball.position.y < -25) {
      this.gameState.lives -= 1;
      if (this.gameState.lives <= 0) {
        this.endGame();
      } else {
        // Reset ball
        ball.position = { x: 0, y: 0, z: 0 };
        ball.velocity = { x: 0.15, y: -0.2, z: 0 };
      }
    }
  }

  _syncToManifold() {
    const current = this.manifold.read(this.gameCoordinate);
    current.gameState = {
      isActive: this.gameState.isRunning,
      isPaused: this.gameState.isPaused,
      isGameOver: !this.gameState.isRunning
    };
    current.scoring.currentScore = this.gameState.score;
    current.hud.elements[0].value = this.gameState.score;
    current.hud.elements[1].value = this.gameState.lives;

    this.manifold.write(this.gameCoordinate, current);
  }

  _render() {
    // Graphics substrate extracts rendering config from manifold
    const graphicsData = this.substrates.graphics.extract(this.gameCoordinate);
    // In a real implementation, this would update Three.js scene
    // For now, console log for proof of concept
  }

  _updateUI() {
    const uiData = this.substrates.ui.extract(this.gameCoordinate);
    // Update HUD elements based on manifold data
    const scoreEl = document.getElementById('score-display');
    const livesEl = document.getElementById('lives-display');
    if (scoreEl) scoreEl.textContent = `Score: ${this.gameState.score}`;
    if (livesEl) livesEl.textContent = `Lives: ${this.gameState.lives}`;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BrickBreaker3DManifold;
}
if (typeof window !== 'undefined') {
  window.BrickBreaker3DManifold = BrickBreaker3DManifold;
}
