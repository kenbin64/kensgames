/**
 * Game Launcher
 * ═══════════════════════════════════════════════════════════════════════════
 * Manages game instance lifecycle, iframe sandboxing, and player communication
 */

const GameLauncher = (() => {
  let _activeGame = null;
  let _gameFrame = null;
  let _listeners = new Map();

  // ═══════════════════════════════════════════════════════════════════════════
  // Game States
  // ═══════════════════════════════════════════════════════════════════════════

  const GAME_STATE = {
    UNINITIALIZED: 'uninitialized',
    LOADING: 'loading',
    READY: 'ready',
    PLAYING: 'playing',
    PAUSED: 'paused',
    ENDED: 'ended',
    ERROR: 'error'
  };

  let _currentState = GAME_STATE.UNINITIALIZED;

  // ═══════════════════════════════════════════════════════════════════════════
  // Launch Game
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Launch a game with optional configuration
   * @param {string} gameId - Game identifier
   * @param {object} config - Player name, avatar, AI opponents, etc
   */
  const launch = async (gameId, config = {}) => {
    const game = GameRegistryManifold.getGame(gameId);

    if (!game) {
      emit('error', { message: `Game not found: ${gameId}` });
      return false;
    }

    _activeGame = game;
    _currentState = GAME_STATE.LOADING;
    emit('stateChanged', { newState: _currentState });

    try {
      // Create iframe container if not exists
      if (!_gameFrame) {
        _gameFrame = createGameFrame();
      }

      // Load game with config
      const url = new URL(game.entryPoint, window.location.origin);

      // Pass player configuration as query params
      if (config.playerName) url.searchParams.set('name', config.playerName);
      if (config.avatarId) url.searchParams.set('avatar', config.avatarId);
      if (config.aiBots) url.searchParams.set('ai', config.aiBots);
      if (config.difficulty) url.searchParams.set('difficulty', config.difficulty);

      // Load iframe
      _gameFrame.src = url.toString();

      // Wait for game to signal ready
      await waitForGameReady(5000);  // 5 second timeout

      _currentState = GAME_STATE.READY;
      emit('stateChanged', { newState: _currentState });
      emit('launched', { gameId, config });

      return true;
    } catch (error) {
      _currentState = GAME_STATE.ERROR;
      emit('error', { message: error.message });
      return false;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Iframe Setup & Communication
  // ═══════════════════════════════════════════════════════════════════════════

  const createGameFrame = () => {
    const container = document.getElementById('game-container') ||
      document.querySelector('[data-game-container]');

    if (!container) {
      throw new Error('Game container not found in DOM');
    }

    container.innerHTML = '';  // Clear previous content

    const frame = document.createElement('iframe');
    frame.id = 'game-frame';
    frame.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      display: block;
      background: #000;
    `;

    // Sandbox attributes for security
    frame.setAttribute('sandbox', [
      'allow-same-origin',
      'allow-scripts',
      'allow-popups',
      'allow-forms',
      'allow-pointer-lock'
    ].join(' '));

    container.appendChild(frame);

    // Listen for messages from game
    window.addEventListener('message', handleGameMessage);

    return frame;
  };

  const waitForGameReady = (timeout = 5000) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Game failed to signal ready'));
      }, timeout);

      const readyListener = () => {
        clearTimeout(timer);
        off(readyListener);
        resolve();
      };

      on('gameReady', readyListener);

      // Send ready signal to game
      if (_gameFrame && _gameFrame.contentWindow) {
        _gameFrame.contentWindow.postMessage(
          { type: 'PORTAL_READY' },
          '*'
        );
      }
    });
  };

  const handleGameMessage = (event) => {
    // Only accept messages from our game frame
    if (event.source !== _gameFrame?.contentWindow) return;

    const { type, data } = event.data;

    switch (type) {
      case 'GAME_READY':
        emit('gameReady', data);
        _currentState = GAME_STATE.PLAYING;
        break;

      case 'GAME_STARTED':
        emit('gameStarted', data);
        break;

      case 'GAME_STATE_UPDATE':
        emit('gameStateUpdated', data);
        break;

      case 'GAME_ENDED':
        handleGameEnd(data);
        break;

      case 'SCORE_UPDATE':
        emit('scoreUpdated', data);
        break;

      case 'ERROR':
        _currentState = GAME_STATE.ERROR;
        emit('error', data);
        break;

      default:
        console.warn('Unknown message type from game:', type);
    }
  };

  const handleGameEnd = (data) => {
    _currentState = GAME_STATE.ENDED;

    // Request score submission from auth substrate
    const { gameId, score, metadata } = data;
    if (AuthPortalSubstrate && AuthPortalSubstrate.getCurrentUser()) {
      AuthPortalSubstrate.submitGameResults(gameId, score, metadata);
    }

    emit('gameEnded', data);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Game Control
  // ═══════════════════════════════════════════════════════════════════════════

  const sendMessage = (type, data = {}) => {
    if (!_gameFrame || !_gameFrame.contentWindow) {
      console.warn('Game frame not ready');
      return;
    }

    _gameFrame.contentWindow.postMessage({ type, data }, '*');
  };

  const pause = () => {
    if (_currentState !== GAME_STATE.PLAYING) return;
    sendMessage('PAUSE_GAME');
    _currentState = GAME_STATE.PAUSED;
    emit('stateChanged', { newState: _currentState });
  };

  const resume = () => {
    if (_currentState !== GAME_STATE.PAUSED) return;
    sendMessage('RESUME_GAME');
    _currentState = GAME_STATE.PLAYING;
    emit('stateChanged', { newState: _currentState });
  };

  const exit = () => {
    sendMessage('EXIT_GAME');
    _currentState = GAME_STATE.ENDED;
    emit('stateChanged', { newState: _currentState });

    // Clean up frame
    setTimeout(() => {
      if (_gameFrame && _gameFrame.parentElement) {
        _gameFrame.parentElement.removeChild(_gameFrame);
        _gameFrame = null;
      }
      _activeGame = null;
    }, 500);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // State Queries
  // ═══════════════════════════════════════════════════════════════════════════

  const getState = () => _currentState;
  const getActiveGame = () => _activeGame;
  const isGameRunning = () => _currentState === GAME_STATE.PLAYING;

  // ═══════════════════════════════════════════════════════════════════════════
  // Event System
  // ═══════════════════════════════════════════════════════════════════════════

  const on = (event, callback) => {
    if (!_listeners.has(event)) {
      _listeners.set(event, []);
    }
    const id = Math.random().toString(36);
    _listeners.get(event).push({ id, callback });
    return id;
  };

  const off = (handler) => {
    for (const [event, handlers] of _listeners) {
      _listeners.set(event, handlers.filter(h => h.callback !== handler));
    }
  };

  const emit = (event, data) => {
    if (_listeners.has(event)) {
      _listeners.get(event).forEach(({ callback }) => callback(data));
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    // Constants
    GAME_STATE,

    // Launch
    launch,

    // Control
    pause,
    resume,
    exit,
    sendMessage,

    // State
    getState,
    getActiveGame,
    isGameRunning,

    // Events
    on,
    off,
    emit
  };
})();
