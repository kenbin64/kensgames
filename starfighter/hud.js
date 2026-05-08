// ═══════════════════════════════════════════════════════════════════════════
// STARFIGHTER — HUD CONTROL RAIL  v1.0
// ═══════════════════════════════════════════════════════════════════════════
// Fixed footer control rail (HR-6.2 compliant).
// • All player-facing buttons/status bars live here — never inside game canvas.
// • Cockpit 3D viewport is untouched; rail sits below it.
// • Speed indicator reacts to throttle / mouse-wheel thrust changes.
// • Weapon inventory shows limited-ammo counts.
// • Wingman voice preference stored in localStorage and fed to ANPC.
// • Gamepad, joystick, and WebXR input detection reported here.
// ═══════════════════════════════════════════════════════════════════════════

const SFHud = (function () {
  'use strict';

  // ── Wingman voice catalogue ──────────────────────────────────────────────
  const VOICE_CATALOGUE = [
    { id: 'female-american', label: 'Female · American', gender: 'female', accent: 'american' },
    { id: 'female-british', label: 'Female · British', gender: 'female', accent: 'british' },
    { id: 'female-australian', label: 'Female · Australian', gender: 'female', accent: 'australian' },
    { id: 'female-canadian', label: 'Female · Canadian', gender: 'female', accent: 'canadian' },
    { id: 'female-irish', label: 'Female · Irish', gender: 'female', accent: 'irish' },
    { id: 'female-scottish', label: 'Female · Scottish', gender: 'female', accent: 'scottish' },
    { id: 'female-indian', label: 'Female · Indian', gender: 'female', accent: 'indian' },
    { id: 'female-japanese', label: 'Female · Japanese', gender: 'female', accent: 'japanese' },
    { id: 'female-brazilian', label: 'Female · Brazilian', gender: 'female', accent: 'brazilian' },
    { id: 'female-french', label: 'Female · French', gender: 'female', accent: 'french' },
    { id: 'female-spanish', label: 'Female · Spanish', gender: 'female', accent: 'spanish' },
    { id: 'female-german', label: 'Female · German', gender: 'female', accent: 'german' },
    { id: 'female-nigerian', label: 'Female · Nigerian', gender: 'female', accent: 'nigerian' },
    { id: 'female-south-african', label: 'Female · South African', gender: 'female', accent: 'south-african' },
    { id: 'male-american', label: 'Male · American', gender: 'male', accent: 'american' },
    { id: 'male-british', label: 'Male · British', gender: 'male', accent: 'british' },
    { id: 'male-australian', label: 'Male · Australian', gender: 'male', accent: 'australian' },
    { id: 'male-canadian', label: 'Male · Canadian', gender: 'male', accent: 'canadian' },
    { id: 'male-irish', label: 'Male · Irish', gender: 'male', accent: 'irish' },
    { id: 'male-scottish', label: 'Male · Scottish', gender: 'male', accent: 'scottish' },
    { id: 'male-indian', label: 'Male · Indian', gender: 'male', accent: 'indian' },
    { id: 'male-japanese', label: 'Male · Japanese', gender: 'male', accent: 'japanese' },
    { id: 'male-brazilian', label: 'Male · Brazilian', gender: 'male', accent: 'brazilian' },
    { id: 'male-french', label: 'Male · French', gender: 'male', accent: 'french' },
    { id: 'male-spanish', label: 'Male · Spanish', gender: 'male', accent: 'spanish' },
    { id: 'male-german', label: 'Male · German', gender: 'male', accent: 'german' },
    { id: 'male-nigerian', label: 'Male · Nigerian', gender: 'male', accent: 'nigerian' },
    { id: 'male-south-african', label: 'Male · South African', gender: 'male', accent: 'south-african' },
    { id: 'generic-neutral', label: 'Generic · Neutral', gender: 'generic', accent: 'neutral' },
    { id: 'generic-robotic', label: 'Generic · Robotic AI', gender: 'generic', accent: 'robotic' },
  ];

  const WINGMAN_VOICE_KEY = 'sf_wingman_voice';

  // ── Internal state ───────────────────────────────────────────────────────
  let _rail = null;         // #sf-rail DOM element
  let _speedVal = 0;        // smoothed displayed speed
  let _speedDir = 0;        // +1 accel, -1 decel, 0 neutral
  let _speedDirTimer = 0;
  let _prevThrottle = 0;
  let _prevRawSpeed = 0;     // for acceleration computation
  let _accelVal = 0;         // smoothed m/s² display value
  let _inputMode = 'mouse'; // 'mouse' | 'gamepad' | 'joystick' | 'touch' | 'vr'
  let _vrSession = null;
  let _rafId = 0;

  // ── Public: get stored voice preference ─────────────────────────────────
  function getWingmanVoice() {
    try {
      const stored = localStorage.getItem(WINGMAN_VOICE_KEY);
      if (stored) {
        const found = VOICE_CATALOGUE.find(v => v.id === stored);
        if (found) return found;
      }
    } catch (_) { }
    return VOICE_CATALOGUE[0]; // default: female american
  }

  function setWingmanVoice(id) {
    try { localStorage.setItem(WINGMAN_VOICE_KEY, id); } catch (_) { }
    // Inform ANPC if it is running
    if (window.SFANPC && typeof SFANPC.setVoiceProfile === 'function') {
      const v = VOICE_CATALOGUE.find(c => c.id === id);
      if (v) SFANPC.setVoiceProfile(v);
    }
  }

  // ── Build the voice selector (used in lobby and in-game setup) ───────────
  function buildVoiceSelector(containerId) {
    const host = typeof containerId === 'string'
      ? document.getElementById(containerId)
      : containerId;
    if (!host) return;

    const current = getWingmanVoice();

    const wrapper = document.createElement('div');
    wrapper.className = 'sf-voice-selector';
    wrapper.innerHTML = [
      '<div class="sf-voice-label">WINGMAN VOICE</div>',
      '<select id="sf-voice-select" class="sf-voice-select">',
      VOICE_CATALOGUE.map(v =>
        `<option value="${v.id}"${v.id === current.id ? ' selected' : ''}>${v.label}</option>`
      ).join(''),
      '</select>',
      '<div class="sf-voice-hint">Your wingman gives warnings, briefings, and encouragement. Not a combat participant.</div>',
    ].join('');
    host.appendChild(wrapper);

    const sel = wrapper.querySelector('#sf-voice-select');
    sel.addEventListener('change', () => setWingmanVoice(sel.value));
  }

  // ── Render the fixed control rail HTML ───────────────────────────────────
  function _buildRail() {
    if (document.getElementById('sf-rail')) return;

    const rail = document.createElement('div');
    rail.id = 'sf-rail';
    rail.innerHTML = [
      // LEFT — status bars
      '<div class="sf-rail-left">',
      '  <div class="sf-stat-row">',
      '    <span class="sf-stat-lbl" title="Shields">SH</span>',
      '    <div class="sf-bar-track"><div id="rail-shield-bar" class="sf-bar-fill sf-bar-shield" style="width:100%"></div></div>',
      '    <span id="rail-shield-val" class="sf-stat-val">100</span>',
      '  </div>',
      '  <div class="sf-stat-row">',
      '    <span class="sf-stat-lbl" title="Hull">HU</span>',
      '    <div class="sf-bar-track"><div id="rail-hull-bar" class="sf-bar-fill sf-bar-hull" style="width:100%"></div></div>',
      '    <span id="rail-hull-val" class="sf-stat-val">100</span>',
      '  </div>',
      '  <div class="sf-stat-row">',
      '    <span class="sf-stat-lbl" title="Fuel">FU</span>',
      '    <div class="sf-bar-track"><div id="rail-fuel-bar" class="sf-bar-fill sf-bar-fuel" style="width:100%"></div></div>',
      '    <span id="rail-fuel-val" class="sf-stat-val">100</span>',
      '  </div>',
      '  <div class="sf-stat-row">',
      '    <span class="sf-stat-lbl" title="Speed">SP</span>',
      '    <div id="rail-speed-bar-wrap" class="sf-bar-track">',
      '      <div id="rail-speed-bar" class="sf-bar-fill sf-bar-speed" style="width:0%"></div>',
      '    </div>',
      '    <span id="rail-speed-val" class="sf-stat-val sf-speed-val">0</span>',
      '    <span id="rail-speed-dir" class="sf-speed-dir"></span>',
      '  </div>',
      '  <!-- Acceleration gauge: center-origin, green=thrust, red=brake -->',
      '  <div class="sf-stat-row">',
      '    <span class="sf-stat-lbl" title="Accel">AC</span>',
      '    <div id="rail-accel-wrap" class="sf-bar-track" style="position:relative">',
      '      <div id="rail-accel-bar" style="position:absolute;top:0;bottom:0;left:50%;width:0%;height:100%;border-radius:3px;transition:left 0.08s linear,width 0.08s linear"></div>',
      '      <div style="position:absolute;top:0;bottom:0;left:calc(50% - 1px);width:1px;background:rgba(0,255,255,0.35);pointer-events:none"></div>',
      '    </div>',
      '    <span id="rail-accel-val" class="sf-stat-val" style="color:#888;min-width:30px">0</span>',
      '  </div>',
      '</div>',

      // CENTRE — action buttons
      '<div class="sf-rail-center">',
      '  <button class="sf-btn sf-btn-fire"       id="rail-btn-fire"      onmousedown="window.Starfighter&&Starfighter.firePrimary()" title="Fire Laser [LMB / Space]">LASER</button>',
      '  <button class="sf-btn sf-btn-missile"    id="rail-btn-missile"   onmousedown="window.Starfighter&&Starfighter.fireTorpedo()" title="Fire Missile [RMB / T-lock]">',
      '    MISSILE <span id="rail-missile-count" class="sf-ammo-count">8</span>',
      '  </button>',
      '  <button class="sf-btn sf-btn-emp"        id="rail-btn-emp"       onmousedown="window.Starfighter&&Starfighter.firePulseEMP()" title="EMP Pulse [E key]" style="display:none">',
      '    EMP <span id="rail-emp-count" class="sf-ammo-count">3</span>',
      '  </button>',
      '  <button class="sf-btn sf-btn-pulse"      id="rail-btn-pulse"     onmousedown="window.Starfighter&&Starfighter.firePulseEMP()" title="Power Pulse [P key]" style="display:none">',
      '    PULSE <span id="rail-pulse-count" class="sf-ammo-count">5</span>',
      '  </button>',
      '  <button class="sf-btn sf-btn-shield"     id="rail-btn-shield"    onmousedown="window.Starfighter&&Starfighter.getState&&(Starfighter.getState().player.shieldActive=true)" onmouseup="window.Starfighter&&Starfighter.getState&&(Starfighter.getState().player.shieldActive=false)" title="Power Shield [Hold S]" style="display:none">SHIELD</button>',
      '  <button class="sf-btn sf-btn-boost"      id="rail-btn-boost"     onmousedown="window.Starfighter&&Starfighter.getState&&(Starfighter.getState().player.throttle=1.0)" title="Boost [B / Wheel-fwd]">BOOST</button>',
      '  <button class="sf-btn sf-btn-ab"         id="rail-btn-ab"        onmousedown="window.Starfighter&&window.Starfighter.getState&&(Starfighter.getState().player.afterburnerActive=true)" onmouseup="window.Starfighter&&window.Starfighter.getState&&(Starfighter.getState().player.afterburnerActive=false)" title="Afterburner [Hold A]">AB</button>',
      '  <button class="sf-btn sf-btn-lock"       id="rail-btn-lock"      onmousedown="window.Starfighter&&Starfighter.tryLockOnTarget()" title="Target Lock [T]">LOCK</button>',
      '  <button class="sf-btn sf-btn-frigate"    id="rail-btn-frigate"   onclick="window.Starfighter&&Starfighter.emergencyRTB()" title="Call Medical Frigate">FRIGATE</button>',
      '  <button class="sf-btn sf-btn-cm"         id="rail-btn-cm"        onclick="window.SFThreatSys&&SFThreatSys.deployCM?SFThreatSys.deployCM():void 0" title="Countermeasures [C]" style="display:none">',
      '    CM <span id="rail-cm-count" class="sf-ammo-count">12</span>',
      '  </button>',
      '</div>',

      // RIGHT — weapon select + game controls + input mode indicator
      '<div class="sf-rail-right">',
      '  <div class="sf-weapon-row" id="rail-weapon-row">',
      '    <span class="sf-stat-lbl">WPN</span>',
      '    <span id="rail-weapon-name" class="sf-weapon-name">LASER</span>',
      '  </div>',
      '  <div class="sf-stat-row">',
      '    <span class="sf-stat-lbl">KILLS</span>',
      '    <span id="rail-kills" class="sf-stat-val">0</span>',
      '    <span class="sf-stat-sep">·</span>',
      '    <span class="sf-stat-lbl">WAVE</span>',
      '    <span id="rail-wave" class="sf-stat-val">1</span>',
      '    <span class="sf-stat-sep">·</span>',
      '    <span id="rail-lives" class="sf-lives">★★★</span>',
      '  </div>',
      '  <div class="sf-game-btns">',
      '    <button class="sf-btn sf-btn-sys" id="rail-btn-pause" onclick="window.Starfighter&&Starfighter.togglePause()" title="Pause [Esc]">⏸</button>',
      '    <button class="sf-btn sf-btn-sys" id="rail-btn-save"  onclick="window.Starfighter&&Starfighter.saveGame()" title="Save">💾</button>',
      '    <button class="sf-btn sf-btn-sys sf-btn-leave" id="rail-btn-leave" onclick="window.Starfighter&&Starfighter.exitGame()" title="Leave">✕</button>',
      '  </div>',
      '  <div id="rail-input-mode" class="sf-input-mode">🖱 MOUSE</div>',
      '</div>',
    ].join('\n');

    document.body.appendChild(rail);
    _rail = rail;
  }

  // ── Update loop — syncs rail values from Starfighter state ───────────────
  function _tick() {
    _rafId = requestAnimationFrame(_tick);

    const SF = window.Starfighter;
    if (!SF || !SF.getState) return;
    const st = SF.getState();
    if (!st || !st.player) return;

    const p = st.player;
    const now = performance.now();

    // ── Status bars — use getDim for correct max values so bars don't shrink with current value ──
    const maxShields = (SF.getDim && SF.getDim('player.shields')) || 200;
    const maxHull = (SF.getDim && SF.getDim('player.hull')) || 100;
    const maxFuel = (SF.getDim && SF.getDim('player.fuel')) || 100;
    _setBar('rail-shield-bar', 'rail-shield-val', p.shields, maxShields, '#4af');
    _setBar('rail-hull-bar', 'rail-hull-val', p.hull, maxHull, '#f84');
    _setBar('rail-fuel-bar', 'rail-fuel-val', p.fuel, maxFuel, '#4f8');

    // ── Speed indicator ──
    const currentSpeed = p.velocity
      ? Math.round(Math.sqrt(p.velocity.x ** 2 + p.velocity.y ** 2 + p.velocity.z ** 2))
      : Math.round(Math.abs((p.throttle || 0) * 250));
    const maxSpeed = (window.Starfighter && SF.getDim ? SF.getDim('player.afterburnerSpeed') : null) || 600;
    _speedVal += (currentSpeed - _speedVal) * 0.12;

    const speedPct = Math.min(100, (_speedVal / maxSpeed) * 100);
    const speedBar = document.getElementById('rail-speed-bar');
    const speedValEl = document.getElementById('rail-speed-val');
    const speedDirEl = document.getElementById('rail-speed-dir');
    if (speedBar) {
      speedBar.style.width = speedPct + '%';
      // Zone coloring: purple=hyperdrive, red=afterburner, yellow=boost, orange=cruise
      if (p.hyperdriveActive) speedBar.style.background = 'linear-gradient(90deg,#cc44ff,#6600cc)';
      else if (p.afterburnerActive) speedBar.style.background = 'linear-gradient(90deg,#ff4444,#aa0000)';
      else if (p.boostActive) speedBar.style.background = 'linear-gradient(90deg,#ffee00,#aa8800)';
      else speedBar.style.background = ''; // default orange from CSS class
    }
    if (speedValEl) speedValEl.textContent = Math.round(_speedVal);

    // ── Acceleration gauge — center-origin bar, green = thrust, red = brake ──
    // Raw accel = speed delta × 60 (converts per-frame delta to m/s²)
    const rawAccel = (currentSpeed - _prevRawSpeed) * 60;
    _prevRawSpeed = currentSpeed;
    _accelVal = _accelVal * 0.72 + rawAccel * 0.28; // EMA smoothing

    const accelBar = document.getElementById('rail-accel-bar');
    const accelValEl = document.getElementById('rail-accel-val');
    const maxAccelDisp = 300; // m/s² at which bar hits full half
    const clampedAccel = Math.max(-maxAccelDisp, Math.min(maxAccelDisp, _accelVal));
    const halfW = Math.abs(clampedAccel / maxAccelDisp) * 50; // 0–50%
    if (accelBar) {
      if (clampedAccel >= 0) {
        accelBar.style.left = '50%';
        accelBar.style.width = halfW + '%';
        accelBar.style.background = 'linear-gradient(90deg,#4f8,#0a4)';
      } else {
        accelBar.style.left = (50 - halfW) + '%';
        accelBar.style.width = halfW + '%';
        accelBar.style.background = 'linear-gradient(90deg,#a22,#f44)';
      }
    }
    if (accelValEl) {
      const av = Math.round(_accelVal);
      accelValEl.textContent = (av > 0 ? '+' : '') + av;
      accelValEl.style.color = av > 20 ? '#4f8' : av < -20 ? '#f84' : '#888';
    }

    // Acceleration direction indicator from throttle delta (▲/▼ arrow)
    const thr = p.throttle || 0;
    const thrDelta = thr - _prevThrottle;
    _prevThrottle = thr;
    if (Math.abs(thrDelta) > 0.01) {
      _speedDir = thrDelta > 0 ? 1 : -1;
      _speedDirTimer = now + 800;
    }
    if (now > _speedDirTimer) _speedDir = 0;
    if (speedDirEl) {
      speedDirEl.textContent = _speedDir > 0 ? '▲' : _speedDir < 0 ? '▼' : '';
      speedDirEl.style.color = _speedDir > 0 ? '#4f8' : _speedDir < 0 ? '#f84' : '#888';
    }

    // ── Weapon / ammo counts ──
    const missileCount = document.getElementById('rail-missile-count');
    const empCount = document.getElementById('rail-emp-count');
    const pulseCount = document.getElementById('rail-pulse-count');
    const cmCount = document.getElementById('rail-cm-count');
    if (missileCount && p.torpedoes != null) missileCount.textContent = p.torpedoes;
    if (empCount && p.empCharges != null) empCount.textContent = p.empCharges;
    if (pulseCount && p.pulseCharges != null) pulseCount.textContent = p.pulseCharges;
    if (cmCount && p.countermeasures != null) cmCount.textContent = p.countermeasures;

    // Show/hide unlocked ability buttons
    _showBtn('rail-btn-emp', !!(p.empCharges != null && p.empCharges > 0 || st.unlocksActive && st.unlocksActive.emp_pulse));
    _showBtn('rail-btn-pulse', !!(p.pulseCharges != null || st.unlocksActive && st.unlocksActive.power_pulse));
    _showBtn('rail-btn-shield', !!(st.unlocksActive && st.unlocksActive.power_shield));
    _showBtn('rail-btn-cm', !!(p.countermeasures != null && p.countermeasures > 0));

    // ── Weapon name ──
    const weapNames = ['LASER', 'MISSILE', 'EMP', 'PULSE', 'PLASMA', 'BEAM', 'NOVA'];
    const railWpn = document.getElementById('rail-weapon-name');
    if (railWpn && p.selectedWeapon != null) {
      railWpn.textContent = weapNames[p.selectedWeapon] || 'LASER';
    }

    // ── Kills / wave / lives ──
    const railKills = document.getElementById('rail-kills');
    const railWave = document.getElementById('rail-wave');
    const railLives = document.getElementById('rail-lives');
    if (railKills) railKills.textContent = st.score != null ? String(st.score) : '0';
    if (railWave) railWave.textContent = st.wave != null ? String(st.wave) : '1';
    if (railLives) {
      const lives = st.lives != null ? st.lives : 3;
      railLives.textContent = '★'.repeat(Math.max(0, lives)) + '☆'.repeat(Math.max(0, 3 - lives));
      railLives.style.color = lives <= 1 ? '#f44' : lives === 2 ? '#fa4' : '#ff8';
    }
  }

  function _setBar(barId, valId, current, max, color) {
    const bar = document.getElementById(barId);
    const val = document.getElementById(valId);
    const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
    if (bar) {
      bar.style.width = pct + '%';
      const r = pct < 25 ? 1 : pct < 50 ? 0.7 : 0;
      const g = pct > 50 ? 1 : pct > 25 ? 0.7 : 0.2;
      // Only override color when danger zone
      if (pct < 25) bar.style.background = 'linear-gradient(90deg,#f44,#a22)';
      else if (pct < 50) bar.style.background = 'linear-gradient(90deg,#fa4,#840)';
      else bar.style.background = '';
    }
    if (val) val.textContent = Math.round(current);
  }

  function _showBtn(id, visible) {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
  }

  // ── Input mode detection ─────────────────────────────────────────────────
  function _detectInput() {
    // Gamepad
    window.addEventListener('gamepadconnected', (e) => {
      const gp = e.gamepad;
      // Distinguish joystick (flight stick) from standard gamepad by axis count
      _inputMode = (gp.axes.length >= 6) ? 'joystick' : 'gamepad';
      _updateInputIndicator();
    });
    window.addEventListener('gamepaddisconnected', () => {
      _inputMode = 'mouse';
      _updateInputIndicator();
    });

    // Touch
    window.addEventListener('touchstart', () => {
      if (_inputMode !== 'vr') { _inputMode = 'touch'; _updateInputIndicator(); }
    }, { passive: true });

    // Mouse movement
    document.addEventListener('mousemove', () => {
      if (_inputMode !== 'vr' && _inputMode !== 'gamepad' && _inputMode !== 'joystick') {
        _inputMode = 'mouse';
        _updateInputIndicator();
      }
    }, { passive: true });

    // WebXR / VR
    if (navigator.xr) {
      navigator.xr.isSessionSupported('immersive-vr').then(supported => {
        if (supported) {
          const vrBtn = document.getElementById('rail-btn-vr');
          if (vrBtn) vrBtn.style.display = '';
        }
      }).catch(() => { });
    }
  }

  function _updateInputIndicator() {
    const el = document.getElementById('rail-input-mode');
    if (!el) return;
    const labels = {
      mouse: '🖱 MOUSE',
      gamepad: '🎮 GAMEPAD',
      joystick: '🕹 JOYSTICK',
      touch: '👆 TOUCH',
      vr: '🥽 VR',
    };
    el.textContent = labels[_inputMode] || '🖱 MOUSE';
  }

  // ── VR session launch ────────────────────────────────────────────────────
  function _enterVR() {
    if (!navigator.xr) return;
    navigator.xr.requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['bounded-floor', 'hand-tracking'],
    }).then(session => {
      _vrSession = session;
      _inputMode = 'vr';
      _updateInputIndicator();
      session.addEventListener('end', () => {
        _vrSession = null;
        _inputMode = 'mouse';
        _updateInputIndicator();
      });
      // Hand off to Three.js renderer if available
      if (window.SF3D && SF3D.renderer) {
        SF3D.renderer.xr.enabled = true;
        SF3D.renderer.xr.setSession(session);
      }
    }).catch(err => console.warn('[HUD] VR session error:', err));
  }

  // ── Phase awareness — show/hide rail in appropriate phases ───────────────
  function _observePhase() {
    const COMBAT_PHASES = new Set(['combat', 'launching', 'respawning', 'land-approach', 'bay-ready']);
    setInterval(() => {
      const SF = window.Starfighter;
      if (!SF || !SF.getPhase) return;
      const phase = SF.getPhase();
      if (_rail) {
        _rail.classList.toggle('sf-rail-combat', COMBAT_PHASES.has(phase));
        _rail.classList.toggle('sf-rail-bay', phase === 'bay-ready');
      }
    }, 200);
  }

  // ── Public API ───────────────────────────────────────────────────────────
  function init() {
    _buildRail();
    _detectInput();
    _observePhase();
    _tick();

    // Apply stored voice preference to ANPC
    const v = getWingmanVoice();
    if (window.SFANPC && typeof SFANPC.setVoiceProfile === 'function') {
      SFANPC.setVoiceProfile(v);
    }
  }

  return {
    init,
    getWingmanVoice,
    setWingmanVoice,
    buildVoiceSelector,
    VOICE_CATALOGUE,
    getInputMode: () => _inputMode,
    enterVR: _enterVR,
  };

})();

if (typeof window !== 'undefined') window.SFHud = SFHud;

// Auto-init after DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => SFHud.init());
} else {
  SFHud.init();
}
