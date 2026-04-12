/**
 * ═══════════════════════════════════════════════════════════════════
 * 🜂 FASTTRACK MANIFOLD SUBSTRATE  v1.0
 * Five SubstrateLenses on the Schwarz Diamond surface — z = x · y
 *
 * Every output the game produces (sound power, glow, UI speed, AI
 * move-score, game tension) is a LENS PROJECTION of two normalised
 * game dimensions onto the manifold primitive z = x · y.
 *
 * Lenses:
 *   GameStateLens  (turn_progress  × board_density)  → game_tension
 *   AudioLens      (event_emotion  × game_tension)   → sound_power
 *   GraphicsLens   (peg_advance    × threat_level)   → glow_intensity
 *   UILens         (turn_urgency   × move_complexity)→ animation_speed
 *   LogicLens      (advance_delta  × strategic_val)  → move_priority
 * ═══════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const MI = window.ManifoldIngestor;
  if (!MI) { console.error('🜂 Substrate requires ManifoldIngestor (z=x·y engine)'); return; }

  // ── ManifoldBus — lightweight pub/sub ────────────────────────────
  const _h = new Map();
  const ManifoldBus = {
    emit(name, data) {
      (_h.get(name) || []).forEach(fn => fn(data));
      (_h.get('*')  || []).forEach(fn => fn({ name, ...data }));
    },
    on(name, fn) {
      _h.set(name, [...(_h.get(name) || []), fn]);
      return () => _h.set(name, (_h.get(name) || []).filter(f => f !== fn));
    }
  };

  // ── Live game-state cache (updated by each manifold:state-update) ─
  const Cache = {
    turnNumber: 0, maxTurns: 120,
    pegsInPlay: 0, totalPegs: 10,
    totalPlayers: 2,
    tension: 0,   // running z from GameStateLens — the master scalar
  };

  // ════════════════════════════════════════════════════════════════
  // LENS 1 — GameStateLens: turn_progress × board_density → tension
  // ════════════════════════════════════════════════════════════════
  const GameStateLens = {
    focus(cache) {
      return MI.ingest(cache, {
        x: d => Math.min(1, d.turnNumber / d.maxTurns),
        y: d => Math.min(1, d.pegsInPlay / Math.max(1, d.totalPegs)),
        label: 'game-tension',
        meta: { lens: 'GameStateLens' }
      });
    }
  };

  // ════════════════════════════════════════════════════════════════
  // LENS 2 — AudioLens: event_emotion × game_tension → sound_power
  // ════════════════════════════════════════════════════════════════
  const AUDIO_WEIGHTS = {
    card: 0.2, hop: 0.05, enter: 0.35, cut: 0.8,
    fasttrack: 0.6, bullseye: 1.0, safezone: 0.4, victory: 1.0
  };
  const AudioLens = {
    focus(eventType, tension) {
      const entity = MI.ingest(
        { emotion: AUDIO_WEIGHTS[eventType] || 0.1, tension },
        { x: 'emotion', y: 'tension', label: 'sound-power', meta: { lens: 'AudioLens' } }
      );
      // z → master gain: 0.2 (silence) to 0.9 (peak)
      if (window.ManifoldAudio?.masterGain && window.ManifoldAudio?.ctx) {
        const vol = 0.2 + entity.manifold.z * 0.7;
        ManifoldAudio.masterGain.gain.linearRampToValueAtTime(
          vol, ManifoldAudio.ctx.currentTime + 0.08
        );
      }
      return entity.manifold.z;
    }
  };

  // ════════════════════════════════════════════════════════════════
  // LENS 3 — GraphicsLens: peg_advance × threat → glow_intensity
  // ════════════════════════════════════════════════════════════════
  const GraphicsLens = {
    TRACK_MAX: 90,
    focus(pegData) {
      const entity = MI.ingest({
        advance: Math.min(1, (pegData.boardPos  || 0) / this.TRACK_MAX),
        threat:  Math.min(1, (pegData.threatCount || 0) / 4),
      }, {
        x: 'advance',
        y: d => 0.1 + d.threat * 0.9,   // floor glow even at zero threat
        label: 'glow-intensity',
        meta: { lens: 'GraphicsLens', pegId: pegData.id }
      });
      window.dispatchEvent(new CustomEvent('manifold:glow', {
        detail: { pegId: pegData.id, intensity: entity.manifold.z }
      }));
      return entity.manifold.z;
    }
  };

  // ════════════════════════════════════════════════════════════════
  // LENS 4 — UILens: urgency × complexity → animation_speed
  // ════════════════════════════════════════════════════════════════
  const UILens = {
    focus(isHumanTurn, validMoveCount) {
      const entity = MI.ingest({
        urgency:    isHumanTurn ? 1 : 0,
        complexity: Math.min(1, validMoveCount / 12),
      }, { x: 'urgency', y: 'complexity', label: 'ui-speed', meta: { lens: 'UILens' } });
      const z = entity.manifold.z;
      const btn = document.getElementById('draw-btn');
      if (btn) {
        btn.style.setProperty('--mz-pulse', `${(0.6 + z * 2.2).toFixed(2)}s`);
        btn.style.setProperty('--mz-glow',
          `rgba(0,${Math.floor(z * 200 + 55)},255,${z.toFixed(2)})`);
        btn.classList.toggle('manifold-urgent', z > 0.25);
      }
      return z;
    }
  };

  // ════════════════════════════════════════════════════════════════
  // LENS 5 — LogicLens: advance_delta × strategic_value → move_score
  // z = x · y IS the AI priority.  No other scoring formula needed.
  // ════════════════════════════════════════════════════════════════
  const LogicLens = {
    score(move) {
      const strategic = Math.min(1,
        (move.type === 'enterBullseye'  ? 1.0 : 0) +
        (move.type === 'enterFastTrack' ? 0.7 : 0) +
        (move.type === 'exitBullseye'   ? 0.5 : 0) +
        (move.type === 'exitFastTrack'  ? 0.4 : 0) +
        (move.type === 'enter'          ? 0.35: 0) +
        (move.captures                  ? 0.8 : 0) +
        (move.toSafeZone                ? 0.6 : 0)
      );
      const entity = MI.ingest({
        advance:   Math.min(1, Math.abs(move.steps || move.count || 1) / 14),
        strategic,
      }, { x: 'advance', y: 'strategic', label: 'move-score', meta: { lens: 'LogicLens' } });
      return entity.manifold.z;  // z = x · y IS the move priority
    }
  };

  // ════════════════════════════════════════════════════════════════
  // CENTRAL ROUTER — every game event flows through all five lenses
  // ════════════════════════════════════════════════════════════════
  window.addEventListener('manifold:game-event', (e) => {
    const { type, data = {} } = e.detail || {};
    if (!type) return;

    // 1. GameStateLens — refresh master tension scalar
    Cache.tension = GameStateLens.focus(Cache).manifold.z;

    // 2. AudioLens — modulate master gain around the existing sound
    AudioLens.focus(type, Cache.tension);

    // 3. GraphicsLens — emit per-peg glow event if position known
    if (data.pegId !== undefined || data.boardPos !== undefined) {
      GraphicsLens.focus({
        id: data.pegId, boardPos: data.boardPos || 0, threatCount: data.threatCount || 0
      });
    }

    // 4. UILens — write CSS custom props to draw button
    if (window.FastTrackCore) {
      const ci   = window.FastTrackCore.state.players.get('current') || 0;
      const pList = window.FastTrackCore.state.players.get('list') || [];
      const moves = window.FastTrackCore.state.turn.get('validMoves') || [];
      UILens.focus(pList[ci] && !pList[ci].isBot, moves.length);
    }

    // 5. Forward enriched event to Schwarz Diamond renderer + any observers
    ManifoldBus.emit(type, { ...data, tension: Cache.tension });
  });

  window.addEventListener('manifold:state-update', (e) => Object.assign(Cache, e.detail || {}));

  // ── Public surface ────────────────────────────────────────────────
  window.FastTrackManifoldSubstrate = {
    bus: ManifoldBus,
    lenses: { GameStateLens, AudioLens, GraphicsLens, UILens, LogicLens },
    cache: Cache,
    scoreMove: m => LogicLens.score(m),
  };

  console.log('🜂 FastTrack Manifold Substrate — 5 lenses / Schwarz Diamond / z=x·y');
})();
