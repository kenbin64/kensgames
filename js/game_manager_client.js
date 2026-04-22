/**
 * KGGameManager — thin client for the manifold-backed Game Manager.
 *
 * Usage:
 *   const mgr = KGGameManager.init({
 *     gameId: '4dconnect',
 *     send: (msg) => lobby.sendRaw(msg),   // or direct ws.send
 *     on:   (type, handler) => lobby.on(type, handler),
 *     onScenarios: (list) => renderScenarios(list),
 *     onGameCreated: (session) => startGame(session),
 *     onActionApplied: (res) => renderProgress(res),
 *     onGameWon: (win) => showWin(win),
 *   });
 *
 *   mgr.listScenarios();
 *   mgr.createGame('4dconnect.classic', { maxPlayers: 2 });
 *   mgr.applyAction({ action: 'drop', atom: 'own', cell: [2,0,1], score: 1 });
 *
 * All server-side state lives on the TetracubeDB manifold; this client only
 * sends intent and renders results.
 */
(function (root) {
  'use strict';

  const KGGameManager = {
    init: function (opts) {
      opts = opts || {};
      const self = Object.create(null);
      const GAME_ID = opts.gameId || null;
      const send = opts.send || function () { throw new Error('KGGameManager: send() not provided'); };
      const on = opts.on || function () { };

      let currentSessionId = opts.sessionId || null;

      on('scenarios_list', function (msg) {
        if (opts.onScenarios) opts.onScenarios(msg.scenarios || [], msg.game_id);
      });
      on('game_created', function (msg) {
        if (msg.session) currentSessionId = msg.session.session_id;
        if (opts.onGameCreated) opts.onGameCreated(msg.session);
      });
      on('action_applied', function (msg) {
        if (opts.onActionApplied) opts.onActionApplied(msg);
        if (msg.win && opts.onGameWon) opts.onGameWon(msg.win);
      });
      on('game_won', function (msg) {
        if (opts.onGameWon) opts.onGameWon(msg.win);
      });
      on('error', function (msg) {
        if (opts.onError) opts.onError(msg.message);
      });

      self.listScenarios = function (gameId) {
        send({ type: 'list_scenarios', game_id: gameId || GAME_ID });
      };

      self.createGame = function (scenarioId, extra) {
        extra = extra || {};
        send({
          type: 'create_game',
          game_id: GAME_ID,
          scenario_id: scenarioId,
          max_players: extra.maxPlayers,
          settings: extra.settings || {},
        });
      };

      self.setSessionId = function (sid) { currentSessionId = sid; };
      self.getSessionId = function () { return currentSessionId; };

      self.applyAction = function (action) {
        if (!currentSessionId) {
          if (opts.onError) opts.onError('No active session');
          return;
        }
        send({
          type: 'apply_action',
          session_id: currentSessionId,
          action: action.action,
          atom: action.atom,
          cell: action.cell,
          score: action.score,
          payload: action.payload,
        });
      };

      return self;
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = KGGameManager;
  else root.KGGameManager = KGGameManager;
})(typeof window !== 'undefined' ? window : globalThis);
