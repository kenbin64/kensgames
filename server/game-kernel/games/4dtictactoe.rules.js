'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 4D Connect (4DTicTacToe) — server-authoritative GameRules
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * SCOPE (first slice):
 *   - 'classic' scenario only: N-in-a-row win (winLen=4)
 *   - Gravity-assisted drop: pick (col, layer); piece settles at lowest free row
 *   - 2–4 players, board size from rules.json: grid_for_players[N]
 *   - Turn-based with the standard settle handshake:
 *       drop          → stages move, marks unsettled (ball animates client-side)
 *       settle_complete (per-client) → once every player ack's, turn advances
 *
 * Manifold alignment:
 *   x = identity     (active player on this turn)
 *   y = drop         (col, layer)
 *   z = board state  (derived from action log)
 *   m = win checks   (queried, never stored)
 *
 * State shape:
 *   {
 *     phase:    'playing' | 'ended',
 *     scenario: 'classic',
 *     size:     N,                              // board is N × N × N
 *     winLen:   4,
 *     order:    [playerId, ...],                // turn rotation
 *     turnIdx:  0,
 *     // board[layer][row][col] = playerId | null   (row 0 = bottom)
 *     board:    number[][][] | null[][][],
 *     lastMove: { playerId, layer, row, col } | null,
 *     unsettled: boolean,                       // drop in flight
 *     acks:      { playerId: true },            // settle confirmations
 *     winner:   playerId | 'draw' | null,
 *     winLine:  [{layer,row,col}, ...] | null,
 *   }
 *
 * Wire actions:
 *   { type: 'drop', payload: { col, layer } }
 *   { type: 'settle_complete' }
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const path = require('path');
const fs = require('fs');

let _rulesSheet = null;
function loadRulesSheet() {
  if (_rulesSheet) return _rulesSheet;
  const p = path.join(__dirname, '..', '..', '..', '4DTicTacToe', 'rules.json');
  _rulesSheet = JSON.parse(fs.readFileSync(p, 'utf8'));
  return _rulesSheet;
}

function gridForPlayerCount(n) {
  const sheet = loadRulesSheet();
  const map = sheet.lobby.grid_for_players || {};
  return map[String(n)] || 4;
}

function emptyBoard(size) {
  const b = new Array(size);
  for (let l = 0; l < size; l++) {
    b[l] = new Array(size);
    for (let r = 0; r < size; r++) {
      b[l][r] = new Array(size).fill(null);
    }
  }
  return b;
}

// Lowest free row for (col, layer). Returns -1 if column full.
function lowestFreeRow(board, col, layer) {
  const size = board.length;
  for (let r = 0; r < size; r++) {
    if (board[layer][r][col] === null) return r;
  }
  return -1;
}

// 13 unique direction triples (each line scanned in one direction only)
const DIRECTIONS = (() => {
  const out = [];
  for (let dl = -1; dl <= 1; dl++) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dl === 0 && dr === 0 && dc === 0) continue;
        // dedupe opposite direction
        const key = [dl, dr, dc];
        const inv = [-dl, -dr, -dc].join(',');
        if (out.find((d) => d.join(',') === inv)) continue;
        out.push(key);
      }
    }
  }
  return out;
})();

function inBounds(size, l, r, c) {
  return l >= 0 && l < size && r >= 0 && r < size && c >= 0 && c < size;
}

// Find a winning line of length winLen passing through (l0,r0,c0).
function findWinLine(board, l0, r0, c0, winLen) {
  const player = board[l0][r0][c0];
  if (player === null) return null;
  const size = board.length;
  for (const [dl, dr, dc] of DIRECTIONS) {
    const line = [{ layer: l0, row: r0, col: c0 }];
    // forward
    let l = l0 + dl, r = r0 + dr, c = c0 + dc;
    while (inBounds(size, l, r, c) && board[l][r][c] === player) {
      line.push({ layer: l, row: r, col: c });
      l += dl; r += dr; c += dc;
    }
    // backward
    l = l0 - dl; r = r0 - dr; c = c0 - dc;
    while (inBounds(size, l, r, c) && board[l][r][c] === player) {
      line.unshift({ layer: l, row: r, col: c });
      l -= dl; r -= dr; c -= dc;
    }
    if (line.length >= winLen) return line.slice(0, winLen);
  }
  return null;
}

function boardFull(board) {
  const size = board.length;
  for (let l = 0; l < size; l++)
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (board[l][r][c] === null) return false;
  return true;
}

// Deep clone — small boards (≤5³ = 125 cells), JSON is fine
function cloneBoard(board) { return JSON.parse(JSON.stringify(board)); }

const RULES = {
  id: '4dtictactoe',

  createInitialState(players, meta) {
    if (!Array.isArray(players) || players.length < 1 || players.length > 4) {
      throw new Error('4dtictactoe: requires 1–4 players');
    }
    const sheet = loadRulesSheet();
    const scenario = (meta && (meta.scenario || meta.mode))
      || sheet.session.default_scenario || 'classic';
    if (scenario !== 'classic') {
      throw new Error(`4dtictactoe: only 'classic' scenario implemented in this slice (got '${scenario}')`);
    }
    const size = gridForPlayerCount(players.length);
    const winLen = (sheet.session.win_lengths || {})[scenario] || 4;
    return {
      phase: 'playing',
      scenario,
      size,
      winLen,
      order: players.map((p) => p.id),
      turnIdx: 0,
      board: emptyBoard(size),
      lastMove: null,
      unsettled: false,
      acks: {},
      winner: null,
      winLine: null,
    };
  },

  validateAction(state, action) {
    if (state.phase !== 'playing') return false;
    if (!action || !action.playerId) return false;
    if (!state.order.includes(action.playerId)) return false;

    if (action.type === 'settle_complete') {
      // Only meaningful while a drop is in flight
      return state.unsettled === true;
    }
    if (action.type === 'drop') {
      if (state.unsettled) return false;  // wait for settle
      const { col, layer } = action.payload || {};
      if (!Number.isInteger(col) || !Number.isInteger(layer)) return false;
      if (col < 0 || col >= state.size) return false;
      if (layer < 0 || layer >= state.size) return false;
      // Must be in the active player's column.
      if (state.order[state.turnIdx] !== action.playerId) return false;
      return lowestFreeRow(state.board, col, layer) !== -1;
    }
    return false;
  },

  applyAction(state, action) {
    if (action.type === 'drop') {
      const { col, layer } = action.payload;
      const row = lowestFreeRow(state.board, col, layer);
      const board = cloneBoard(state.board);
      board[layer][row][col] = action.playerId;
      const win = findWinLine(board, layer, row, col, state.winLen);
      const lastMove = { playerId: action.playerId, layer, row, col };

      if (win) {
        // Immediate win — game ends with no settle handshake required.
        return {
          ...state,
          board,
          lastMove,
          unsettled: false,
          acks: {},
          phase: 'ended',
          winner: action.playerId,
          winLine: win,
        };
      }
      if (boardFull(board)) {
        return {
          ...state,
          board,
          lastMove,
          unsettled: false,
          acks: {},
          phase: 'ended',
          winner: 'draw',
          winLine: null,
        };
      }
      // Normal drop → unsettled (ball is animating client-side)
      return {
        ...state,
        board,
        lastMove,
        unsettled: true,
        acks: {},
      };
    }

    if (action.type === 'settle_complete') {
      const acks = { ...state.acks, [action.playerId]: true };
      const everyone = state.order.every((id) => acks[id]);
      if (!everyone) return { ...state, acks };
      // All confirmed → advance turn, clear acks/unsettled
      return {
        ...state,
        acks: {},
        unsettled: false,
        turnIdx: (state.turnIdx + 1) % state.order.length,
      };
    }

    return state;
  },

  isGameOver(state) { return state.phase === 'ended'; },

  // Public knowledge — show entire board to every player.
  getVisibleState(state) {
    return {
      scenario: state.scenario,
      phase: state.phase,
      size: state.size,
      winLen: state.winLen,
      order: state.order,
      turnIdx: state.turnIdx,
      board: state.board,
      lastMove: state.lastMove,
      unsettled: state.unsettled,
      acks: state.acks,
      winner: state.winner,
      winLine: state.winLine,
    };
  },

  // ── Turn-authority hooks (kernel-recognized) ───────────────────────────────
  getCurrentTurn(state) {
    if (state.phase !== 'playing') return null;
    return state.order[state.turnIdx];
  },
  isSettled(state) { return !state.unsettled; },
};

module.exports = RULES;
