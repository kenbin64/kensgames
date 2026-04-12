/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FASTTRACK v2.1.0 - MANIFOLD EDITION
 * Game Coordinator (Strategic Board Game)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This coordinator:
 * 1. Initializes game state on manifold
 * 2. Manages board tiles and player positions
 * 3. Orchestrates turn-based gameplay
 * 4. All systems (UI, logic, multiplayer, AI) read from manifold
 */

class FastTrackManifold {
  constructor() {
    this.manifold = ManifoldSurface;
    this.registry = SubstrateRegistry;
    this.gameConfig = null;
    this.gameCoordinate = null;
    this.substrates = {};
    this.gameState = {
      isRunning: false,
      isPaused: false,
      round: 1,
      maxRounds: 12,
      currentPlayer: 0,
      playerCount: 1,
      gameOver: false
    };
    this.boardState = null;
  }

  /**
   * Initialize the game
   */
  async initialize(playerCount = 1, playerUsername = 'Player') {
    console.log('🏁 Initializing FastTrack on Manifold...');

    // 1. Load game configuration
    const gameId = playerCount === 1 ? 'fasttrack-solo' : 'fasttrack-multiplayer';
    this.gameConfig = GameConfig.load(gameId);

    // 2. Create manifold coordinate
    this.gameCoordinate = this.gameConfig.createCoordinate({
      playerCount,
      playtime: 45,
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
    const initialState = this._createInitialGameState(playerCount, playerUsername);
    this.manifold.write(this.gameCoordinate, initialState);
    console.log('✓ Initial game state written to manifold');

    // 5. Initialize substrates
    this.registry.initialize(this.manifold);
    this._registerSubstrates();
    this._loadSubstrates();

    console.log('✓ All substrates loaded');
    console.log('✓ FastTrack Manifold ready!\n');
  }

  /**
   * Main game loop
   */
  run() {
    this.gameState.isRunning = true;
    const animate = () => {
      requestAnimationFrame(animate);

      if (this.gameState.isPaused || !this.gameState.isRunning) return;

      // 1. Process game logic (turn management, tile allocation)
      this._processGameLogic();

      // 2. Update manifold with current state
      this._syncToManifold();

      // 3. Render UI (reads from manifold)
      this._updateUI();

      // 4. Update audio (reads from manifold)
      this._updateAudio();
    };

    animate();
  }

  /**
   * Player action: Claim a tile
   */
  claimTile(tileIndex) {
    const current = this.manifold.read(this.gameCoordinate);
    if (!current.board.tiles[tileIndex]) return;

    const tile = current.board.tiles[tileIndex];
    if (tile.claimed || tile.locked) return;

    const player = current.players[this.gameState.currentPlayer];
    tile.claimed = true;
    tile.ownerId = player.id;
    tile.ownerIndex = this.gameState.currentPlayer;

    // Apply tile modifier (resource, points, or lockdown)
    this._applyTileModifier(player, tile);

    player.tilesClaimmed = (player.tilesClaimed || 0) + 1;
    player.movesRemaining = (player.movesRemaining || 1) - 1;

    current.board.tiles[tileIndex] = tile;

    // Auto-advance turn if player out of moves
    if (player.movesRemaining <= 0) {
      this._advanceTurn(current);
    }

    this.manifold.write(this.gameCoordinate, current);
  }

  /**
   * Pause/unpause game
   */
  togglePause() {
    this.gameState.isPaused = !this.gameState.isPaused;
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

  _createInitialGameState(playerCount, playerUsername) {
    // Create 36 tiles (6x6 board)
    const tiles = [];
    const tileTypes = ['resource', 'position', 'lockdown', 'bonus'];
    const tileValues = [1, 2, 3, 4, 5];

    for (let i = 0; i < 36; i++) {
      tiles.push({
        id: `tile-${i}`,
        index: i,
        type: tileTypes[Math.floor(i / 9) % tileTypes.length],
        value: tileValues[i % tileValues.length],
        claimed: false,
        locked: false,
        ownerId: null,
        ownerIndex: null
      });
    }

    // Create players
    const players = [];
    const colors = ['#00ffcc', '#ff00ff', '#ffaa00', '#00ff88'];
    for (let i = 0; i < playerCount; i++) {
      players.push({
        id: `player-${i}`,
        index: i,
        name: `${playerUsername} ${i + 1}`,
        color: colors[i],
        score: 0,
        tilesClaimed: 0,
        resources: 0,
        movesRemaining: 4,
        position: { x: i, y: 0 },
        stats: { gamesPlayed: 0, gamesWon: 0, totalScore: 0 }
      });
    }

    return {
      // Board state
      board: {
        width: 6,
        height: 6,
        tiles: tiles,
        totalTiles: 36
      },

      // Player states
      players: players,

      // Game flow
      gameState: {
        isActive: true,
        isPaused: false,
        isGameOver: false,
        round: 1,
        maxRounds: 12,
        currentPlayer: 0,
        turnOrder: Array.from({ length: playerCount }, (_, i) => i)
      },

      // UI
      hud: {
        visible: true,
        elements: [
          { id: 'round', value: 1 },
          { id: 'current-player', value: 0 },
          { id: 'available-moves', value: 4 },
          { id: 'game-status', value: 'In Progress' }
        ]
      },

      // Audio
      music: { track: 'board-game-theme', volume: 0.5, loop: true },

      // Scoring system
      scoring: {
        tileValue: 1,
        resourceBonus: 10,
        positionBonus: 5,
        lockdownPenalty: -15,
        roundWinner: 100
      },

      // Rules
      rules: {
        movesPerTurn: 4,
        roundsPerGame: 12,
        tiebreaker: 'resources'
      },

      // User info
      user: { id: 'local-user', username: playerUsername },
      stats: { gamesPlayed: 0, gamesWon: 0, totalScore: 0, bestScore: 0 }
    };
  }

  _processGameLogic() {
    const current = this.manifold.read(this.gameCoordinate);
    if (!current || this.gameState.gameOver) return;

    // Check if round complete (all players used all moves)
    const allPlayersUsedMoves = current.players.every(p => p.movesRemaining <= 0);
    if (allPlayersUsedMoves && current.gameState.round < current.gameState.maxRounds) {
      this._completeRound(current);
    }

    // Check if game complete (all rounds done)
    if (current.gameState.round > current.gameState.maxRounds) {
      this._endGame(current);
    }

    this.manifold.write(this.gameCoordinate, current);
  }

  _completeRound(current) {
    const gamelogic = this.substrates.gamelogic;

    // Calculate round results
    let roundWinner = null;
    let maxScore = -1;

    for (const player of current.players) {
      // Round score = tiles claimed * base value + resource modifier
      const roundScore = gamelogic.applyScore(player.tilesClaimed * 10, player.resources * 5);
      player.score += roundScore;

      if (roundScore > maxScore) {
        maxScore = roundScore;
        roundWinner = player;
      }
    }

    // Apply round winner bonus
    if (roundWinner) {
      roundWinner.score += 100;
    }

    // Reset for next round
    current.gameState.round += 1;
    current.gameState.currentPlayer = 0;
    for (const player of current.players) {
      player.movesRemaining = 4;
      player.tilesClaimed = 0;
      player.resources = 0;
    }

    this.gameState.round = current.gameState.round;
    this.gameState.currentPlayer = 0;

    console.log(`✓ Round ${current.gameState.round - 1} complete. Next: Round ${current.gameState.round}`);
  }

  _endGame(current) {
    // Determine winner (highest total score)
    let winner = current.players[0];
    for (const player of current.players) {
      if (player.score > winner.score) {
        winner = player;
      }
    }

    this.gameState.gameOver = true;
    this.gameState.isRunning = false;

    console.log(`Game Complete! Winner: ${winner.name} (${winner.score} points)`);

    // Display final scores
    const leaderboard = current.players
      .sort((a, b) => b.score - a.score)
      .map((p, idx) => `${idx + 1}. ${p.name}: ${p.score} points`)
      .join('<br>');

    document.getElementById('winner-display').textContent = `${winner.name} Wins with ${winner.score} points!`;
    document.getElementById('final-scores').innerHTML = leaderboard;
    document.getElementById('game-over').classList.remove('hidden');
  }

  _advanceTurn(current) {
    current.gameState.currentPlayer = (current.gameState.currentPlayer + 1) % current.gameState.maxRounds;
    this.gameState.currentPlayer = current.gameState.currentPlayer;

    // Reset moves for new player
    current.players[this.gameState.currentPlayer].movesRemaining = 4;
  }

  _applyTileModifier(player, tile) {
    switch (tile.type) {
      case 'resource':
        player.resources += tile.value;
        break;
      case 'position':
        player.score += tile.value * 5;
        break;
      case 'lockdown':
        // Temporarily lock a neighboring tile
        player.score -= 15;
        break;
      case 'bonus':
        player.score += tile.value * 10;
        break;
    }
  }

  _syncToManifold() {
    const current = this.manifold.read(this.gameCoordinate);
    current.gameState.round = this.gameState.round;
    current.gameState.currentPlayer = this.gameState.currentPlayer;

    const player = current.players[this.gameState.currentPlayer];
    if (player) {
      current.hud.elements[1].value = player.name;
      current.hud.elements[2].value = player.movesRemaining;
    }

    current.hud.elements[0].value = this.gameState.round;
    current.hud.elements[3].value = this.gameState.gameOver ? 'Complete' : 'In Progress';

    this.manifold.write(this.gameCoordinate, current);
  }

  _updateUI() {
    const current = this.manifold.read(this.gameCoordinate);
    if (!current) return;

    // Update round display
    const roundEl = document.getElementById('round-display');
    if (roundEl) roundEl.textContent = `${this.gameState.round}/${this.gameState.maxRounds}`;

    // Update turn display
    const turnEl = document.getElementById('turn-display');
    const player = current.players[this.gameState.currentPlayer];
    if (turnEl && player) turnEl.textContent = player.name;

    // Update moves display
    const movesEl = document.getElementById('moves-display');
    if (movesEl && player) movesEl.textContent = player.movesRemaining;

    // Update status display
    const statusEl = document.getElementById('status-display');
    if (statusEl) statusEl.textContent = this.gameState.gameOver ? 'Complete' : 'In Progress';

    // Render board tiles
    this._renderBoard(current);

    // Render player info
    this._renderPlayerInfo(current);
  }

  _renderBoard(current) {
    const boardEl = document.getElementById('board');
    if (!boardEl) return;

    // Clear existing tiles
    boardEl.innerHTML = '';

    // Create tile elements
    for (let i = 0; i < current.board.tiles.length; i++) {
      const tile = current.board.tiles[i];
      const tileEl = document.createElement('div');
      tileEl.className = 'tile';
      if (tile.claimed) tileEl.classList.add('occupied');
      if (tile.locked) tileEl.classList.add('locked');

      const tileValue = document.createElement('div');
      tileValue.className = 'tile-value';
      tileValue.textContent = tile.value;

      const tileType = document.createElement('div');
      tileType.className = 'tile-content';
      tileType.style.fontSize = '10px';
      tileType.textContent = tile.type.substring(0, 3).toUpperCase();

      tileEl.appendChild(tileValue);
      tileEl.appendChild(tileType);

      if (tile.claimed && tile.ownerIndex !== null) {
        const ownerColor = current.players[tile.ownerIndex].color;
        const piece = document.createElement('div');
        piece.className = 'player-piece';
        piece.style.backgroundColor = ownerColor;
        tileEl.appendChild(piece);
      }

      tileEl.addEventListener('click', () => {
        if (!tile.claimed && !tile.locked && this.gameState.isRunning) {
          this.claimTile(i);
        }
      });

      boardEl.appendChild(tileEl);
    }
  }

  _renderPlayerInfo(current) {
    const hudEl = document.getElementById('hud');
    if (!hudEl) return;

    hudEl.innerHTML = '';

    for (let i = 0; i < current.players.length; i++) {
      const player = current.players[i];
      const playerDiv = document.createElement('div');
      playerDiv.className = 'player-info';
      if (i === this.gameState.currentPlayer) playerDiv.classList.add('active');

      const nameDiv = document.createElement('div');
      nameDiv.className = 'player-name';
      nameDiv.style.color = player.color;
      nameDiv.textContent = player.name;

      const statsDiv = document.createElement('div');
      statsDiv.className = 'player-stats';
      statsDiv.textContent = `Score: ${player.score} | Resources: ${player.resources} | Tiles: ${player.tilesClaimed}`;

      playerDiv.appendChild(nameDiv);
      playerDiv.appendChild(statsDiv);
      hudEl.appendChild(playerDiv);
    }
  }

  _updateAudio() {
    const audioData = this.substrates.audio.extract(this.gameCoordinate);
    // Audio substrate handles sound playback from manifold
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FastTrackManifold;
}
if (typeof window !== 'undefined') {
  window.FastTrackManifold = FastTrackManifold;
}
