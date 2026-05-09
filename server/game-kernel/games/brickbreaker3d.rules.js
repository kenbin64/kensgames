'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 BrickBreaker 3D — server-authoritative GameRules
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * SCOPE (first slice):
 *   - Modes: 'solo' and 'solo_vs_bot'.
 *   - The server owns SCORE, LIVES, LEVEL, WINNER. Physics (ball/paddle) stays
 *     on the client; the client reports outcome events.
 *   - Single source of truth for these values: the action log reduced through
 *     applyAction. State is derived (z = x·y), never the authority.
 *
 * Constants are read from brickbreaker3d.rules.json so the manifold rule
 * sheet remains the one place to tune the game.
 *
 * Wire actions (player → server):
 *   { type: 'brick_hit',   payload: { layer?: 0..3 } }
 *   { type: 'life_lost' }
 *   { type: 'level_clear' }                              // solo only
 *
 * Server → players (via GameMaster.broadcastState):
 *   { type: 'state', state: <visibleState> }
 *   { type: 'game_over' }
 *
 * Mode selection:
 *   meta.mode = 'solo' | 'solo_vs_bot'   (defaults to 'solo')
 *   For 'solo_vs_bot' the players array MUST be exactly [human, ai].
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const path = require('path');
const fs = require('fs');

let _rulesSheet = null;
function loadRulesSheet() {
  if (_rulesSheet) return _rulesSheet;
  const p = path.join(__dirname, '..', '..', '..', 'brickbreaker3d', 'brickbreaker3d.rules.json');
  _rulesSheet = JSON.parse(fs.readFileSync(p, 'utf8'));
  return _rulesSheet;
}

function modeConfig(modeId) {
  const sheet = loadRulesSheet();
  const m = sheet.modes[modeId];
  if (!m) throw new Error(`brickbreaker3d: unknown mode '${modeId}'`);
  return m;
}

function clampLayer(n) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(3, v));
}

const RULES = {
  id: 'brickbreaker3d',

  createInitialState(players, meta) {
    const modeId = (meta && meta.mode) || 'solo';
    const cfg = modeConfig(modeId);

    // Validate player shape vs mode
    if (modeId === 'solo' && players.length !== 1) {
      throw new Error('brickbreaker3d/solo: requires exactly 1 player');
    }
    if (modeId === 'solo_vs_bot') {
      if (players.length !== 2) {
        throw new Error('brickbreaker3d/solo_vs_bot: requires exactly 2 players');
      }
      const aiCount = players.filter((p) => p.isAI).length;
      if (aiCount !== 1) {
        throw new Error('brickbreaker3d/solo_vs_bot: requires exactly 1 AI player');
      }
    }

    const startLives = cfg.lives;
    const scoring = cfg.scoring || {};
    const seats = {};
    for (const p of players) {
      seats[p.id] = {
        score: 0,
        lives: startLives,
        isAI: !!p.isAI,
      };
    }

    return {
      mode: modeId,
      phase: 'playing',
      level: 1,
      seats,                                  // playerId → { score, lives, isAI }
      scoring: {
        brickBase: scoring.brick_break_base || 10,
        levelClearBonus: scoring.level_clear_bonus || 0,
        lifeRemainingBonus: scoring.life_remaining_bonus_per_life || 0,
        opponentLifeLostBonus: scoring.opponent_life_lost_bonus || 0,
      },
      winner: null,                           // playerId | 'draw' | null
      winCondition: cfg.win_condition || null,
      lossCondition: cfg.loss_condition || null,
    };
  },

  validateAction(state, action) {
    if (state.phase !== 'playing') return false;
    if (!action || !action.playerId) return false;
    if (!state.seats[action.playerId]) return false;
    if (state.seats[action.playerId].lives <= 0) return false;

    switch (action.type) {
      case 'brick_hit': return true;
      case 'life_lost': return true;
      case 'level_clear': return state.mode === 'solo';
      default: return false;
    }
  },

  applyAction(state, action) {
    const seats = { ...state.seats };
    const me = { ...seats[action.playerId] };

    let nextLevel = state.level;
    let phase = state.phase;
    let winner = state.winner;

    switch (action.type) {
      case 'brick_hit': {
        const layer = clampLayer(action.payload && action.payload.layer);
        // φ-derived layer multiplier (1, 1.618, 2.618, 4.236) clamped by clampLayer
        const phiMul = [1, 1.618, 2.618, 4.236][layer] || 1;
        me.score += Math.round(state.scoring.brickBase * phiMul);
        seats[action.playerId] = me;
        break;
      }
      case 'life_lost': {
        me.lives = Math.max(0, me.lives - 1);
        seats[action.playerId] = me;
        // Opponent (if any) gets bonus
        if (state.mode === 'solo_vs_bot') {
          for (const otherId of Object.keys(seats)) {
            if (otherId === action.playerId) continue;
            const other = { ...seats[otherId] };
            other.score += state.scoring.opponentLifeLostBonus;
            seats[otherId] = other;
          }
        }
        break;
      }
      case 'level_clear': {
        // Solo only (validated above)
        me.score += state.scoring.levelClearBonus
          + state.scoring.lifeRemainingBonus * me.lives;
        seats[action.playerId] = me;
        nextLevel = state.level + 1;
        break;
      }
    }

    // Resolve win/loss
    if (state.mode === 'solo') {
      if (seats[action.playerId].lives === 0) {
        phase = 'ended';
        winner = null; // solo: no winner, just final score
      }
    } else if (state.mode === 'solo_vs_bot') {
      const ids = Object.keys(seats);
      const alive = ids.filter((id) => seats[id].lives > 0);
      if (alive.length === 1) {
        phase = 'ended';
        winner = alive[0];
      } else if (alive.length === 0) {
        phase = 'ended';
        winner = 'draw';
      }
    }

    return {
      ...state,
      seats,
      level: nextLevel,
      phase,
      winner,
    };
  },

  isGameOver(state) {
    return state.phase === 'ended';
  },

  getVisibleState(state /*, playerId */) {
    // No fog-of-war: scores and lives are public for both modes.
    return {
      mode: state.mode,
      phase: state.phase,
      level: state.level,
      seats: state.seats,
      winner: state.winner,
    };
  },
};

module.exports = RULES;
