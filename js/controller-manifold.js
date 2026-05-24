/**
 * controller-manifold.js  —  KensGames unified input layer  (v1.0)
 *
 * Architecture:  z = x · y
 *   x = physical signal  (device + button / axis identifier)
 *   y = game action-map  (registered per-game binding table)
 *   z = semantic action  (fired as named callback)
 *
 * Supported devices:
 *   • Keyboard   — attaches own keydown / keyup listeners
 *   • Mouse      — wheel + modifier combos for extra rotation axes
 *   • Gamepad    — Web Gamepad API; call M.poll(timestamp) each frame
 *   • VR         — WebXR immersive-vr; call M.enterVR(renderer)
 *
 * Usage (any KensGames game):
 *   const M = new ControllerManifold(canvas);
 *   M.on('hard_drop',  () => { … });
 *   M.on('rotate_z+',  () => { … });
 *   // game loop:
 *   M.poll(timestamp);
 *
 * Per-game key re-binding:
 *   M.bind('KeyZ', 'rotate_x+');   // override any default
 */
(function (global) {
  'use strict';

  // ── Default keyboard → action map ──────────────────────────────────
  const KB_DEFAULTS = {
    ArrowLeft: 'move_left',
    ArrowRight: 'move_right',
    ArrowUp: 'move_fwd',
    ArrowDown: 'move_back',
    KeyA: 'rotate_y-',
    KeyD: 'rotate_y+',
    KeyW: 'rotate_x-',
    KeyS: 'rotate_x+',
    KeyQ: 'rotate_z-',
    KeyE: 'rotate_z+',
    Space: 'hard_drop',
    KeyP: 'pause',
    KeyM: 'mute',
    KeyF: 'fullscreen',
  };

  // ── Default gamepad → action map  (Xbox / PS layout) ───────────────
  // Buttons: 0=A/Cross  1=B/Circle  2=X/Square  3=Y/Triangle
  //          4=LB  5=RB  6=LT  7=RT  9=Start  12=DUp 13=DDown 14=DLeft 15=DRight
  const GP_DEFAULTS = {
    0: 'hard_drop',
    1: 'soft_drop',
    2: 'rotate_y-',
    3: 'rotate_x-',
    4: 'rotate_z-',
    5: 'rotate_z+',
    6: 'rotate_y+',
    7: 'rotate_x+',
    9: 'pause',
    12: 'move_fwd',
    13: 'move_back',
    14: 'move_left',
    15: 'move_right',
  };

  // ── Default VR button maps  (WebXR gamepad on controller) ──────────
  // Right hand:  0=trigger 1=grip 4=A 5=B
  // Left hand:   0=trigger 1=grip 4=X 5=Y
  const XR_RIGHT = { 0: 'hard_drop', 4: 'rotate_y+', 5: 'rotate_x+' };
  const XR_LEFT = { 0: 'soft_drop', 4: 'rotate_z-', 5: 'rotate_z+' };

  // ── ControllerManifold ─────────────────────────────────────────────
  class ControllerManifold {
    constructor(canvas) {
      this._canvas = canvas;
      this._actions = {};       // action → handler fn
      this._keys = {};       // keyCode → bool (live state)
      this._kbMap = { ...KB_DEFAULTS };
      this._gpMap = { ...GP_DEFAULTS };
      this._gpPrev = {};       // padIndex → { btnIdx: bool }
      this._gpAxisCool = 0;        // timestamp of last stick-move fire
      this._xrSession = null;
      this._xrCtrl = [];       // live XRInputSource list
      this._xrPrevBtn = {};       // hand → { btnIdx: bool }
      this._xrAxisCool = 0;

      this._attachKeyboard();
      this._attachMouseWheel();
    }

    // ── Public API ────────────────────────────────────────────────────

    /** Register a handler for a semantic action. */
    on(action, fn) { this._actions[action] = fn; return this; }

    /** Override or add a keyboard binding. */
    bind(keyCode, action) { this._kbMap[keyCode] = action; return this; }

    /** Fire a semantic action programmatically. */
    emit(action, data) { const fn = this._actions[action]; if (fn) fn(data); }

    /** Check whether a key is currently held (useful for hold-to-soft-drop). */
    isKeyDown(code) { return !!this._keys[code]; }

    /** Poll gamepad (and VR frame events not covered by WebXR loop).
     *  Call once per render frame: M.poll(timestamp). */
    poll(t) {
      this._pollGamepad(t);
    }

    // ── Keyboard ──────────────────────────────────────────────────────
    _attachKeyboard() {
      document.addEventListener('keydown', e => {
        if (e.repeat) return;
        this._keys[e.code] = true;
        const action = this._kbMap[e.code];
        if (!action) return;
        // Let Space preventDefault to stop page scroll; others pass through
        if (e.code === 'Space') e.preventDefault();
        this.emit(action);
      });
      document.addEventListener('keyup', e => {
        this._keys[e.code] = false;
      });
    }

    // ── Mouse wheel (modifier combos → rotation axes) ─────────────────
    // Plain scroll  → zoom (not intercepted here; handled by game's own wheel listener)
    // Shift+scroll  → rotate_x±
    // Alt+scroll    → rotate_z±
    // Ctrl+scroll   → rotate_y±
    _attachMouseWheel() {
      if (!this._canvas) return;
      this._canvas.addEventListener('wheel', e => {
        if (!e.shiftKey && !e.altKey && !e.ctrlKey) return; // let game handle plain zoom
        e.preventDefault();
        const sign = e.deltaY > 0 ? 1 : -1;
        if (e.shiftKey) this.emit(sign > 0 ? 'rotate_x+' : 'rotate_x-');
        else if (e.altKey) this.emit(sign > 0 ? 'rotate_z+' : 'rotate_z-');
        else if (e.ctrlKey) this.emit(sign > 0 ? 'rotate_y+' : 'rotate_y-');
      }, { passive: false });
    }

    // ── Gamepad ───────────────────────────────────────────────────────
    _pollGamepad(t) {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const pad of pads) {
        if (!pad || !pad.connected) continue;
        const id = pad.index;
        if (!this._gpPrev[id]) this._gpPrev[id] = {};

        // Buttons — fire on press-edge only
        pad.buttons.forEach((btn, i) => {
          const pressed = btn.pressed;
          if (pressed && !this._gpPrev[id][i]) {
            const action = this._gpMap[i];
            if (action) this.emit(action);
          }
          this._gpPrev[id][i] = pressed;
        });

        // Left stick (axes 0/1) → directional move with dead-zone + cooldown
        const DEAD = 0.35, COOL = 190;
        const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
        if (t - this._gpAxisCool > COOL) {
          if (ax > DEAD) { this.emit('move_right'); this._gpAxisCool = t; }
          else if (ax < -DEAD) { this.emit('move_left'); this._gpAxisCool = t; }
          else if (ay < -DEAD) { this.emit('move_fwd'); this._gpAxisCool = t; }
          else if (ay > DEAD) { this.emit('move_back'); this._gpAxisCool = t; }
        }

        // Right stick (axes 2/3) → orbit camera (game registers orbit_dx / orbit_dy)
        const rx = pad.axes[2] ?? 0, ry = pad.axes[3] ?? 0;
        if (Math.abs(rx) > 0.12) this.emit('orbit_dx', rx * 0.022);
        if (Math.abs(ry) > 0.12) this.emit('orbit_dy', ry * 0.018);
      }
    }

    // ── WebXR / VR Controller ─────────────────────────────────────────

    /**
     * Request an immersive-vr session and wire the renderer.
     * Returns { ok: true } on success or { ok: false, reason: '…' }.
     *
     * @param {THREE.WebGLRenderer} renderer  Three.js renderer instance
     */
    async enterVR(renderer) {
      if (!navigator.xr)
        return { ok: false, reason: 'WebXR API not available in this browser' };

      let supported = false;
      try { supported = await navigator.xr.isSessionSupported('immersive-vr'); }
      catch (_) { }
      if (!supported)
        return { ok: false, reason: 'immersive-vr mode not supported on this device' };

      try {
        const session = await navigator.xr.requestSession('immersive-vr', {
          requiredFeatures: ['local-floor'],
          optionalFeatures: ['hand-tracking'],
        });

        this._xrSession = session;
        renderer.xr.enabled = true;
        renderer.xr.setSession(session);

        session.addEventListener('end', () => {
          this._xrSession = null;
          this._xrCtrl = [];
          this._xrPrevBtn = {};
          renderer.xr.enabled = false;
          this.emit('vr_end');
        });

        session.addEventListener('inputsourceschange', () => {
          this._xrCtrl = Array.from(session.inputSources);
          this._xrPrevBtn = {};
        });

        // Plug into Three.js XR animation loop — fires per frame in VR
        renderer.setAnimationLoop((time, frame) => {
          if (frame) this._pollXR(time);
          // The game's normal tick() is paused during VR; renderer.render is
          // driven by the XR loop instead. Games that want custom VR rendering
          // should listen to 'vr_frame' and call renderer.render themselves.
          this.emit('vr_frame', { time, frame });
        });

        this.emit('vr_start');
        return { ok: true };

      } catch (err) {
        return { ok: false, reason: err.message };
      }
    }

    /** End the current VR session gracefully. */
    exitVR() {
      if (this._xrSession) this._xrSession.end();
    }

    // Per-frame XR controller polling (called from inside the XR animation loop)
    _pollXR(t) {
      for (const src of this._xrCtrl) {
        const gp = src.gamepad;
        if (!gp) continue;
        const hand = src.handedness;           // 'left' | 'right' | 'none'
        const btnMap = hand === 'right' ? XR_RIGHT : XR_LEFT;
        const prev = this._xrPrevBtn[hand] || (this._xrPrevBtn[hand] = {});

        // Buttons — press-edge
        gp.buttons.forEach((btn, i) => {
          if (btn.pressed && !prev[i]) {
            const action = btnMap[i];
            if (action) this.emit(action);
          }
          prev[i] = btn.pressed;
        });

        // Right thumbstick (axes 2/3 on XR gamepad) → move
        if (hand === 'right') {
          const ax = gp.axes[2] ?? 0, ay = gp.axes[3] ?? 0;
          const DEAD = 0.38, COOL = 210;
          if (t - this._xrAxisCool > COOL) {
            if (ax > DEAD) { this.emit('move_right'); this._xrAxisCool = t; }
            else if (ax < -DEAD) { this.emit('move_left'); this._xrAxisCool = t; }
            else if (ay < -DEAD) { this.emit('move_fwd'); this._xrAxisCool = t; }
            else if (ay > DEAD) { this.emit('move_back'); this._xrAxisCool = t; }
          }
        }

        // Left thumbstick Y → rotate_z (dice-roll gesture in VR)
        if (hand === 'left') {
          const ty = gp.axes[3] ?? 0;
          const COOL = 270;
          if (t - this._xrAxisCool > COOL) {
            if (ty < -0.5) { this.emit('rotate_z-'); this._xrAxisCool = t; }
            else if (ty > 0.5) { this.emit('rotate_z+'); this._xrAxisCool = t; }
          }
        }
      }
    }
  }

  global.ControllerManifold = ControllerManifold;

})(window);
