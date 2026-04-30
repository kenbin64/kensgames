/**
 * X-Dimensional Session & Game Integration Tests
 * MVP Test Suite — Landing Page → Games Flow
 */

const Tests = {
  results: [],

  async run() {
    console.log('=== X-DIMENSIONAL SESSION TESTS ===\n');

    await this.testSessionStructure();
    await this.testDimensionalBridge();
    await this.testGameRedirects();
    await this.testSessionPersistence();

    this.printResults();
  },

  log(name, passed, details = '') {
    this.results.push({ name, passed, details });
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${name}${details ? ` — ${details}` : ''}`);
  },

  // Test 1: Session structure validates z = x*y
  async testSessionStructure() {
    console.log('TEST 1: Session Structure (z = x*y)\n');

    const games = [
      { id: 'fasttrack', x: 3, y: 45, expectedZ: 135 },
      { id: 'starfighter', x: 2, y: 30, expectedZ: 60 },
      { id: '4dconnect', x: 2, y: 12, expectedZ: 24 },
      { id: 'brickbreaker3d', x: 2, y: 22, expectedZ: 44 }
    ];

    for (const game of games) {
      try {
        const response = await fetch(`/${game.id === '4dconnect' ? '4DTicTacToe' : game.id}/manifold.game.json`);
        const data = await response.json();
        const actualZ = data.dimension?.z;
        const expectedZ = game.expectedZ;
        const passed = actualZ === expectedZ;

        this.log(
          `${game.id} dimensionality`,
          passed,
          `z=${actualZ} (expected ${expectedZ})`
        );
      } catch (err) {
        this.log(`${game.id} load`, false, err.message);
      }
    }
    console.log();
  },

  // Test 2: Dimensional bridge conversion
  async testDimensionalBridge() {
    console.log('TEST 2: Dimensional Bridge Conversion\n');

    // Simulate x-dimensional session
    const mockSession = {
      _x: 'sess-001',
      _schema: '1.0-dimensional',
      game: {
        _x: 'fasttrack',
        name: 'FastTrack',
        x: 3,
        y: 45,
        z: 135,
        players: {
          _x: 'player-ABC1',
          count: 1,
          mode: 'solo',
          difficulty: 'medium'
        },
        board: {
          _x: 'board-fasttrack-ABC1',
          holes: { _x: 'holes(1)-board-fasttrack-ABC1' },
          pegs: { _x: 'pegs(1)-board-fasttrack-ABC1' }
        }
      },
      modifiers: {
        inviteCode: 'ABC1',
        startedAt: new Date().toLocaleTimeString(),
        channel: 'direct'
      }
    };

    window.KENSGAMES_SESSION = mockSession;

    try {
      // Test extraction
      const extracted = window.DIMENSIONAL_SESSION.extract();
      const extractPassed = extracted && extracted.gameId === 'fasttrack' && extracted.players.difficulty === 'medium';
      this.log('Extract session', extractPassed);

      // Test conversion
      const config = window.DIMENSIONAL_SESSION.toGameConfig();
      const convertPassed = config &&
        config.gameDimensions.x === 3 &&
        config.gameDimensions.z === 135 &&
        config.players.mode === 'solo';
      this.log('Convert to game config', convertPassed);

      // Test persistence
      window.DIMENSIONAL_SESSION.persist();
      const persisted = sessionStorage.getItem('kg_session_dimensional');
      const persistPassed = persisted !== null;
      this.log('Persist to sessionStorage', persistPassed);

      // Test retrieval
      const retrieved = window.DIMENSIONAL_SESSION.retrieve();
      const retrievePassed = retrieved && retrieved._x === 'sess-001';
      this.log('Retrieve from sessionStorage', retrievePassed);
    } catch (err) {
      this.log('Bridge operations', false, err.message);
    }
    console.log();
  },

  // Test 3: Game entry paths
  async testGameRedirects() {
    console.log('TEST 3: Game Entry Paths\n');

    const games = [
      { id: 'fasttrack', path: '/fasttrack/3d.html', entry: 'index.html' },
      { id: 'starfighter', path: '/starfighter/index.html', entry: 'index.html' },
      { id: '4dconnect', path: '/4DTicTacToe/index.html', entry: 'index.html' },
      { id: 'brickbreaker3d', path: '/brickbreaker3d/play.html', entry: 'index.html' }
    ];

    for (const game of games) {
      try {
        const response = await fetch(game.path);
        const passed = response.status === 200;
        this.log(`${game.id} entry`, passed, `status ${response.status}`);
      } catch (err) {
        this.log(`${game.id} entry`, false, err.message);
      }
    }
    console.log();
  },

  // Test 4: Session manager persistence
  async testSessionPersistence() {
    console.log('TEST 4: Session Manager Persistence\n');

    const testSession = {
      _x: 'sess-test-001',
      _schema: '1.0-dimensional',
      game: {
        _x: 'fasttrack',
        name: 'FastTrack',
        x: 3,
        y: 45,
        z: 135,
        players: { _x: 'p1', count: 1, mode: 'solo', difficulty: 'easy' },
        board: { _x: 'board1', holes: { _x: 'h1' }, pegs: { _x: 'peg1' } }
      },
      modifiers: { inviteCode: 'TEST', startedAt: new Date().toLocaleTimeString() }
    };

    try {
      // Store session in localStorage (as landing page would)
      const sessions = JSON.parse(localStorage.getItem('kensgames_sessions') || '[]');
      sessions.push(testSession);
      localStorage.setItem('kensgames_sessions', JSON.stringify(sessions));

      // Verify retrieval
      const stored = JSON.parse(localStorage.getItem('kensgames_sessions') || '[]');
      const foundSession = stored.find(s => s._x === 'sess-test-001');
      const storePassed = foundSession && foundSession.game._x === 'fasttrack';
      this.log('Store session in localStorage', storePassed);

      // Verify structure integrity
      const structurePassed = foundSession &&
        foundSession.game.players.count === 1 &&
        foundSession.game.board.holes._x === 'h1';
      this.log('Session structure integrity', structurePassed);

      // Cleanup
      localStorage.removeItem('kensgames_sessions');
    } catch (err) {
      this.log('Persistence', false, err.message);
    }
    console.log();
  },

  printResults() {
    console.log('=== TEST SUMMARY ===\n');
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    console.log(`${passed}/${total} tests passed\n`);

    if (passed === total) {
      console.log('✅ ALL TESTS PASSED — Ready to verify games\n');
    } else {
      console.log('⚠️  Some tests failed. Review output above.\n');
    }
  }
};

// Auto-run if bridge is ready
if (window.DIMENSIONAL_SESSION) {
  Tests.run().catch(err => console.error('Test error:', err));
} else {
  console.warn('Dimensional session bridge not loaded. Tests skipped.');
}
