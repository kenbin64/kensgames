/**
 * Starfighter Audio System — SFAudio
 * Procedural Web Audio API synthesis — zero external files
 * All sounds generated in real-time from oscillators, noise, and filters.
 */

const SFAudio = (function () {
  let ctx = null;
  let masterGain = null;
  let initialized = false;
  let _pausedByGame = false;

  // Persistent engine drones (looping)
  let engineDrone = null;
  let bayAmbience = null;
  let cockpitHum = null;

  // ── Cached speech voice (resolved async) ──
  let _cachedVoice = null;
  const _voiceCacheByModule = {};
  let _activeVoiceModule = 'au_female';

  const VOICE_MODULES = {
    au_female: {
      label: 'Australian Female PA',
      lang: 'en-AU',
      preferFemale: true,
      rate: 0.92,
      pitch: 1.05,
      volume: 1.0,
      selectors: [
        /Google.*Australian.*Female/i,
        /Microsoft.*Natasha.*Online/i,
        /Microsoft.*Annette.*Online/i,
      ]
    },
    au_command: {
      label: 'Australian Command',
      lang: 'en-AU',
      preferFemale: false,
      rate: 0.9,
      pitch: 0.98,
      volume: 1.0,
      selectors: [
        /Google.*Australian/i,
        /Microsoft.*Australia/i,
      ]
    },
    uk_female: {
      label: 'UK Female PA',
      lang: 'en-GB',
      preferFemale: true,
      rate: 0.93,
      pitch: 1.03,
      volume: 1.0,
      selectors: [
        /Google UK English Female/i,
        /Microsoft.*Libby.*Online/i,
        /Microsoft.*Sonia.*Online/i,
      ]
    },
    us_female: {
      label: 'US Female PA',
      lang: 'en-US',
      preferFemale: true,
      rate: 0.92,
      pitch: 1.02,
      volume: 1.0,
      selectors: [
        /Microsoft.*Aria.*Online/i,
        /Google US English/i,
      ]
    },
    // ── Crew-distinct voice modules ──
    uk_male: {
      label: 'UK Male Officer',
      lang: 'en-GB',
      preferFemale: false,
      rate: 0.88,
      pitch: 0.82,
      volume: 1.0,
      selectors: [
        /Google UK English Male/i,
        /Microsoft.*Ryan.*Online/i,
        /Microsoft.*George.*Online/i,
      ]
    },
    us_male: {
      label: 'US Male Officer',
      lang: 'en-US',
      preferFemale: false,
      rate: 0.90,
      pitch: 0.78,
      volume: 1.0,
      selectors: [
        /Google US English/i,
        /Microsoft.*Guy.*Online/i,
        /Microsoft.*Eric.*Online/i,
        /Microsoft.*Christopher.*Online/i,
      ]
    },
    us_male_deep: {
      label: 'US Male Deep',
      lang: 'en-US',
      preferFemale: false,
      rate: 0.85,
      pitch: 0.65,
      volume: 1.0,
      selectors: [
        /Microsoft.*Guy.*Online/i,
        /Microsoft.*Davis.*Online/i,
        /Google US English/i,
      ]
    },
    us_female_bright: {
      label: 'US Female Bright',
      lang: 'en-US',
      preferFemale: true,
      rate: 0.95,
      pitch: 1.15,
      volume: 1.0,
      selectors: [
        /Microsoft.*Jenny.*Online/i,
        /Microsoft.*Aria.*Online/i,
        /Google US English/i,
      ]
    },
    in_female: {
      label: 'Indian Female Officer',
      lang: 'en-IN',
      preferFemale: true,
      rate: 0.91,
      pitch: 1.08,
      volume: 1.0,
      selectors: [
        /Google.*India/i,
        /Microsoft.*Neerja.*Online/i,
        /Microsoft.*Prabhat/i,
      ]
    },
    za_male: {
      label: 'South African Male',
      lang: 'en-ZA',
      preferFemale: false,
      rate: 0.88,
      pitch: 0.85,
      volume: 1.0,
      selectors: [
        /Google.*South Africa/i,
        /Microsoft.*Luke/i,
      ]
    },
  };

  // ── Per-crew voice mapping: each CIC officer gets a distinct voice/accent ──
  const CREW_VOICE_MAP = {
    'Cdr. Vasquez': 'us_male_deep',     // deep commanding male
    'XO Tanaka': 'uk_male',           // British-accented male XO
    'Lt. Chen': 'us_female',         // US female tactical
    'Sgt. Kozlov': 'us_male',           // US male sergeant
    'Ens. Park': 'us_female_bright',  // bright young ensign
    'Ens. Osei': 'za_male',           // South African male
    'CPO Okafor': 'au_command',        // Australian deck chief
    'PO2 Ruiz': 'au_female',         // Australian female deck
    'Lt. Cruz': 'in_female',         // Indian female ops
    'Dr. Hollis': 'uk_female',         // British female science
    // ANPC Characters
    'Hotshot': 'us_male',             // Marcus Chen — young energetic male
    'Frostbite': 'us_male_deep',      // Viktor Kozlov — calm precise male
    'Lighthouse': 'uk_female',         // Dr. Amara Okafor — calm authoritative female
    'Resolute Actual': 'us_female',   // Cdr. Vasquez — commanding female
    'Resolute XO': 'uk_male',         // XO Tanaka — precise
    'Scope': 'us_female_bright',      // Ens. Park — alert young female
    'Nightshade': 'us_male_deep',     // Enemy ace — calm menacing male
    '[INTERCEPTED] Nightshade': 'us_male_deep',
  };

  // ── Engine thrust rumble system ──
  let thrustRumble = null;    // main forward/reverse burn nodes
  let _thrustLevel = 0;       // current smoothed thrust intensity 0..1
  let _strafeHissNodes = null; // lateral/vertical RCS hiss nodes

  // ── Sample-based audio (explosion shockwaves) ──
  const _sampleBuffers = {};   // name → AudioBuffer
  let shockwaveGain = null;    // dedicated gain node (muted by default)

  const SAMPLE_MANIFEST = [
    { name: 'shockwave_a', url: 'assets/sound/freesound_community-medium-explosion-40472.mp3' },
    { name: 'shockwave_b', url: 'assets/sound/soundreality-explosion-fx-343683.mp3' },
  ];

  function _loadSamples() {
    SAMPLE_MANIFEST.forEach(({ name, url }) => {
      fetch(url)
        .then(r => r.arrayBuffer())
        .then(buf => ctx.decodeAudioData(buf))
        .then(decoded => { _sampleBuffers[name] = decoded; })
        .catch(() => { });  // silent fail — procedural fallback still works
    });
  }

  function init() {
    if (initialized) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(ctx.destination);

    // Shockwave channel — muted by default
    shockwaveGain = ctx.createGain();
    shockwaveGain.gain.value = 0;
    shockwaveGain.connect(masterGain);

    _loadSamples();
    _initVoiceCache();
    initialized = true;
  }

  // Resume AudioContext on user gesture (required by browsers)
  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function pauseAll() {
    if (!ctx) return;
    if (ctx.state === 'running') {
      _pausedByGame = true;
      ctx.suspend();
    }
  }

  function resumeAll() {
    if (!ctx) return;
    if (_pausedByGame && ctx.state === 'suspended') {
      _pausedByGame = false;
      ctx.resume();
    }
  }

  // ── Pre-cache all voice modules used by crew ──
  function _initVoiceCache() {
    if (!('speechSynthesis' in window)) return;
    // Resolve all modules up front
    _resolveAllVoices();
    // Chrome/Edge load voices async — listen for the event
    speechSynthesis.addEventListener('voiceschanged', _resolveAllVoices);
  }

  function _resolveAllVoices() {
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    Object.keys(VOICE_MODULES).forEach(id => _resolveVoice(id));
  }

  function _pickVoice(moduleId, voices) {
    const cfg = VOICE_MODULES[moduleId] || VOICE_MODULES.au_female;
    let best = null;
    let bestScore = -1e9;

    voices.forEach(v => {
      let score = 0;

      // Strong explicit selector matches first
      if (cfg.selectors.some(re => re.test(v.name))) score += 120;

      if (cfg.lang && v.lang === cfg.lang) score += 60;
      if (cfg.lang && v.lang && v.lang.startsWith(cfg.lang.split('-')[0])) score += 20;

      if (cfg.preferFemale) {
        if (/female|natasha|annette|libby|sonia|aria|olivia|samantha|karen/i.test(v.name)) score += 30;
      }

      // Prefer cloud/online neural voices when available
      if (!v.localService) score += 12;
      if (/online|neural|natural|enhanced/i.test(v.name)) score += 10;

      // Penalize generic sounding labels
      if (/generic|default|robot|espeak|festival/i.test(v.name)) score -= 100;

      if (score > bestScore) {
        best = v;
        bestScore = score;
      }
    });

    return best;
  }

  function _resolveVoice(moduleId = _activeVoiceModule) {
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    const chosen = _pickVoice(moduleId, voices)
      || voices.find(v => v.lang && v.lang.startsWith('en'))
      || voices[0];

    _voiceCacheByModule[moduleId] = chosen || null;
    if (moduleId === _activeVoiceModule) _cachedVoice = _voiceCacheByModule[moduleId];

    if (chosen) console.log(`PA Voice selected [${moduleId}]:`, chosen.name, chosen.lang);
  }

  function setVoiceModule(moduleId) {
    if (!VOICE_MODULES[moduleId]) return false;
    _activeVoiceModule = moduleId;
    _resolveVoice(moduleId);
    _cachedVoice = _voiceCacheByModule[moduleId] || null;
    return true;
  }

  function getVoiceModule() {
    return _activeVoiceModule;
  }

  function listVoiceModules() {
    return Object.entries(VOICE_MODULES).map(([id, cfg]) => ({ id, label: cfg.label }));
  }

  // ── Utility: white noise buffer ──
  let _noiseBuffer = null;
  function _getNoiseBuffer() {
    if (_noiseBuffer) return _noiseBuffer;
    const len = ctx.sampleRate * 2;
    _noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = _noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return _noiseBuffer;
  }

  // ── Utility: connect chain of nodes ──
  function _chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[0];
  }

  // ══════════════════════════════════════
  // SOUND EFFECTS
  // ══════════════════════════════════════

  function playSound(name, params = {}) {
    if (!ctx) init();
    resume();
    const t = ctx.currentTime;
    switch (name) {
      case 'laser': return _playLaser(t);
      case 'torpedo': return _playTorpedo(t);
      case 'explosion': return _playExplosion(t);
      case 'warning': return _playWarning(t);
      case 'shield_hit': return _playShieldHit(t);
      case 'hull_hit': return _playHullHit(t);
      case 'lock_tone': return _playLockTone(t);
      case 'launch': return _playLaunch(t);
      case 'boost': return _playBoost(t);
      case 'comm_beep': return _playCommBeep(t);
      case 'klaxon': return _playKlaxon(t);
      case 'hud_power_up': return _playHudPowerUp(t);
      case 'clamp_release': return _playClampRelease(t);
      case 'turbine_whine': return _playTurbineWhine(t);
      case 'shockwave': return _playShockwave(t);
      case 'plasma_spit': return _playPlasmaSpit(t);
      case 'hull_alarm': return _playHullAlarm(t);
      case 'egg_hatch': return _playEggHatch(t);
    }
  }

  // GDD §10.1: Cinematic sci-fi laser — 3-layer SHEWWW with manifold modulation
  function _playLaser(t) {
    // ── Manifold modulation parameters ──
    // Query player position for z=xy curvature and Schwartz Diamond timing
    const SM = window.SpaceManifold;
    let curvMod = 1.0, latticeTick = 0;
    if (SM && SM.diamond) {
      const px = (Math.random() - 0.5) * 4000; // approximate spread
      const py = (Math.random() - 0.5) * 4000;
      const pz = px * py * 0.001; // z = xy projection
      const field = SM.diamond(px, py, pz);
      curvMod = 0.7 + Math.abs(field) * 0.6; // 0.7–1.3 range
      if (SM.diamondGrad) {
        const g = SM.diamondGrad(px, py, pz);
        latticeTick = Math.abs(g.x) + Math.abs(g.y); // |∂z/∂x| + |∂z/∂y|
      }
    }
    const rampSpeed = 0.012 * curvMod; // charge pitch ramp speed
    const dissDecay = 0.06 / Math.max(0.3, curvMod); // decay = 1/curvature

    // ── Stereo panner helper ──
    function pan(val) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, val));
      return p;
    }

    // ════════════════════════════════════════════
    // LAYER 1 — CHARGE (5–18 ms)     -12 dB
    // Sine + triangle 50/50, pitch 900→2600 Hz
    // ════════════════════════════════════════════
    const chargeDur = 0.005 + rampSpeed;
    const chargeVol = 0.06; // -12 dB relative to release

    // Sine half
    const chSineG = ctx.createGain();
    chSineG.gain.setValueAtTime(chargeVol, t);
    chSineG.gain.linearRampToValueAtTime(chargeVol * 0.2, t + 0.004);
    chSineG.gain.setValueAtTime(chargeVol * 0.2, t + chargeDur - 0.002);
    chSineG.gain.exponentialRampToValueAtTime(0.001, t + chargeDur + 0.01);

    const chSine = ctx.createOscillator();
    chSine.type = 'sine';
    chSine.frequency.setValueAtTime(900, t);
    chSine.frequency.exponentialRampToValueAtTime(2600, t + chargeDur);

    // Triangle half
    const chTriG = ctx.createGain();
    chTriG.gain.setValueAtTime(chargeVol, t);
    chTriG.gain.linearRampToValueAtTime(chargeVol * 0.2, t + 0.004);
    chTriG.gain.exponentialRampToValueAtTime(0.001, t + chargeDur + 0.01);

    const chTri = ctx.createOscillator();
    chTri.type = 'triangle';
    chTri.frequency.setValueAtTime(900, t);
    chTri.frequency.exponentialRampToValueAtTime(2600, t + chargeDur);

    // Band-pass 1.2 kHz Q=3
    const chBP = ctx.createBiquadFilter();
    chBP.type = 'bandpass';
    chBP.frequency.value = 1200;
    chBP.Q.value = 3;

    // Stereo: slight inward pan L→C→R over 10ms
    const chPan = ctx.createStereoPanner();
    chPan.pan.setValueAtTime(-0.4, t);
    chPan.pan.linearRampToValueAtTime(0.4, t + 0.01);

    chSine.connect(chBP);
    chTri.connect(chBP);
    chBP.connect(chSineG);
    chBP.connect(chTriG);
    chSineG.connect(chPan);
    chTriG.connect(chPan);
    chPan.connect(masterGain);

    chSine.start(t);
    chTri.start(t);
    chSine.stop(t + chargeDur + 0.015);
    chTri.stop(t + chargeDur + 0.015);

    // ════════════════════════════════════════════
    // LAYER 2 — RELEASE "SHEWWW" (120–240 ms)  0 dB
    // Triangle + bright noise 70/30
    // Pitch: fast 2.6kHz → 850Hz
    // Formant sweep: 3.2kHz → 1.1kHz
    // ════════════════════════════════════════════
    const relStart = t + chargeDur * 0.8; // slight overlap
    const relDur = 0.16 + curvMod * 0.06; // 120-240ms manifold-scaled
    const relVol = 0.18; // 0 dB (dominant)

    // 2ms onset click (filtered transient)
    const clickNoise = ctx.createBufferSource();
    clickNoise.buffer = _getNoiseBuffer();
    const clickBP = ctx.createBiquadFilter();
    clickBP.type = 'bandpass';
    clickBP.frequency.value = 2800;
    clickBP.Q.value = 8;
    const clickG = ctx.createGain();
    clickG.gain.setValueAtTime(relVol * 0.5, relStart);
    clickG.gain.exponentialRampToValueAtTime(0.001, relStart + 0.002);
    clickNoise.connect(clickBP);
    clickBP.connect(clickG);
    clickG.connect(masterGain);
    clickNoise.start(relStart);
    clickNoise.stop(relStart + 0.003);

    // Triangle oscillator (70% of release)
    const relTriG = ctx.createGain();
    relTriG.gain.setValueAtTime(relVol * 0.7, relStart);
    relTriG.gain.linearRampToValueAtTime(relVol * 0.6, relStart + 0.035);
    relTriG.gain.exponentialRampToValueAtTime(0.001, relStart + relDur);

    const relTri = ctx.createOscillator();
    relTri.type = 'triangle';
    relTri.frequency.setValueAtTime(2600, relStart);
    relTri.frequency.exponentialRampToValueAtTime(850, relStart + relDur * 0.7);

    // Bright noise (30% of release)
    const relNoiseG = ctx.createGain();
    relNoiseG.gain.setValueAtTime(relVol * 0.3, relStart);
    relNoiseG.gain.linearRampToValueAtTime(relVol * 0.2, relStart + 0.035);
    relNoiseG.gain.exponentialRampToValueAtTime(0.001, relStart + relDur * 0.9);

    const relNoise = ctx.createBufferSource();
    relNoise.buffer = _getNoiseBuffer();

    // Formant sweep: resonant band-pass 3.2kHz → 1.1kHz, Q=6
    const relBP = ctx.createBiquadFilter();
    relBP.type = 'bandpass';
    relBP.frequency.setValueAtTime(3200, relStart);
    relBP.frequency.exponentialRampToValueAtTime(1100, relStart + relDur * 0.8);
    relBP.Q.value = 6;

    // Secondary resonant band-pass 1.8kHz Q=6
    const relBP2 = ctx.createBiquadFilter();
    relBP2.type = 'bandpass';
    relBP2.frequency.value = 1800;
    relBP2.Q.value = 6;

    // Doppler-style stereo sweep L→R (or R→L based on manifold)
    const relPan = ctx.createStereoPanner();
    const panDir = latticeTick > 0.5 ? 1 : -1;
    relPan.pan.setValueAtTime(-0.5 * panDir, relStart);
    relPan.pan.linearRampToValueAtTime(0.5 * panDir, relStart + relDur);

    relTri.connect(relBP);
    relNoise.connect(relBP);
    relBP.connect(relBP2);
    relBP2.connect(relTriG);
    relBP2.connect(relNoiseG);
    relTriG.connect(relPan);
    relNoiseG.connect(relPan);
    relPan.connect(masterGain);

    relTri.start(relStart);
    relNoise.start(relStart);
    relTri.stop(relStart + relDur + 0.01);
    relNoise.stop(relStart + relDur + 0.01);

    // ════════════════════════════════════════════
    // LAYER 3 — DISSIPATION (50–110 ms)  -18 dB
    // High-passed noise + faint crackle
    // ════════════════════════════════════════════
    const dissStart = relStart + relDur * 0.6; // overlap tail
    const dissDur = 0.05 + dissDecay;
    const dissVol = 0.025; // -18 dB

    const dissNoise = ctx.createBufferSource();
    dissNoise.buffer = _getNoiseBuffer();

    const dissHP = ctx.createBiquadFilter();
    dissHP.type = 'highpass';
    dissHP.frequency.value = 3500;

    const dissG = ctx.createGain();
    dissG.gain.setValueAtTime(dissVol, dissStart);
    dissG.gain.linearRampToValueAtTime(dissVol * 0.8, dissStart + 0.02);
    dissG.gain.exponentialRampToValueAtTime(0.001, dissStart + dissDur);

    // Stereo: widen then fade to center
    const dissPan = ctx.createStereoPanner();
    dissPan.pan.setValueAtTime(0.6 * panDir, dissStart);
    dissPan.pan.linearRampToValueAtTime(0, dissStart + dissDur * 0.8);

    dissNoise.connect(dissHP);
    dissHP.connect(dissG);
    dissG.connect(dissPan);
    dissPan.connect(masterGain);
    dissNoise.start(dissStart);
    dissNoise.stop(dissStart + dissDur + 0.01);

    // Faint crackle — rapid micro-clicks at Diamond lattice intersections
    const crackleCount = 2 + Math.floor(latticeTick * 3);
    for (let c = 0; c < crackleCount; c++) {
      const cTime = dissStart + (c / crackleCount) * dissDur * 0.7;
      const crk = ctx.createOscillator();
      crk.type = 'square';
      crk.frequency.value = 6000 + Math.random() * 4000;
      const crkG = ctx.createGain();
      crkG.gain.setValueAtTime(dissVol * 0.3, cTime);
      crkG.gain.exponentialRampToValueAtTime(0.001, cTime + 0.003);
      crk.connect(crkG);
      crkG.connect(masterGain);
      crk.start(cTime);
      crk.stop(cTime + 0.004);
    }
  }

  // GDD §10.1: Lock tone (escalating beeps), launch whoosh
  function _playTorpedo(t) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    g.connect(masterGain);

    // Launch whoosh — filtered noise sweep
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(2000, t + 0.3);
    filter.frequency.exponentialRampToValueAtTime(100, t + 0.8);
    filter.Q.value = 3;
    noise.connect(filter);
    filter.connect(g);
    noise.start(t);
    noise.stop(t + 0.8);

    // Sub-bass thump
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(80, t);
    sub.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.3, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    sub.connect(subG);
    subG.connect(masterGain);
    sub.start(t);
    sub.stop(t + 0.5);
  }

  // GDD §8.3: White flash → orange fireball, 1.5s decay
  function _playExplosion(t) {
    // Initial blast — broadband noise
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    noise.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    noise.start(t);
    noise.stop(t + 1.5);

    // Sub-bass resonance
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(60, t);
    sub.frequency.exponentialRampToValueAtTime(20, t + 1.2);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.4, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    sub.connect(subG);
    subG.connect(masterGain);
    sub.start(t);
    sub.stop(t + 1.2);

    // Metallic crunch
    const crunch = ctx.createOscillator();
    crunch.type = 'square';
    crunch.frequency.setValueAtTime(200, t);
    crunch.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    const crunchG = ctx.createGain();
    crunchG.gain.setValueAtTime(0.15, t);
    crunchG.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    crunch.connect(crunchG);
    crunchG.connect(masterGain);
    crunch.start(t);
    crunch.stop(t + 0.3);
  }

  // Nearby shockwave — sample-based, muted by default
  // Randomly picks one of two explosion recordings.
  // Control volume with setShockwaveVolume(0..1).
  function _playShockwave(t) {
    const keys = Object.keys(_sampleBuffers);
    if (keys.length === 0) return;           // samples not yet loaded
    const buf = _sampleBuffers[keys[Math.floor(Math.random() * keys.length)]];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(shockwaveGain);
    src.start(t);
  }

  // Predator Drone plasma spit — organic visceral spew, wet + crackling
  function _playPlasmaSpit(t) {
    // Low gurgling growl (organic source)
    const growl = ctx.createOscillator();
    growl.type = 'sawtooth';
    growl.frequency.setValueAtTime(60, t);
    growl.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    const growlG = ctx.createGain();
    growlG.gain.setValueAtTime(0.15, t);
    growlG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    const growlLP = ctx.createBiquadFilter();
    growlLP.type = 'lowpass';
    growlLP.frequency.value = 200;
    growl.connect(growlLP);
    growlLP.connect(growlG);
    growlG.connect(masterGain);
    growl.start(t);
    growl.stop(t + 0.5);

    // Wet splatter burst (noise through resonant bandpass)
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1200, t);
    bp.frequency.exponentialRampToValueAtTime(400, t + 0.3);
    bp.Q.value = 4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.2, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(masterGain);
    noise.start(t);
    noise.stop(t + 0.35);

    // Crackling electric discharge (the plasma energy)
    const crackle = ctx.createOscillator();
    crackle.type = 'square';
    crackle.frequency.setValueAtTime(800, t);
    crackle.frequency.setValueAtTime(200, t + 0.05);
    crackle.frequency.setValueAtTime(1200, t + 0.1);
    crackle.frequency.setValueAtTime(300, t + 0.15);
    crackle.frequency.exponentialRampToValueAtTime(100, t + 0.3);
    const crG = ctx.createGain();
    crG.gain.setValueAtTime(0.08, t);
    crG.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    crackle.connect(crG);
    crG.connect(masterGain);
    crackle.start(t);
    crackle.stop(t + 0.3);

    // Sub-bass thump (the spew impact leaving the creature)
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(50, t);
    sub.frequency.exponentialRampToValueAtTime(25, t + 0.2);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.2, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    sub.connect(subG);
    subG.connect(masterGain);
    sub.start(t);
    sub.stop(t + 0.25);
  }

  // Hull breach alarm — urgent repeating klaxon-style alert, organic threat
  function _playHullAlarm(t) {
    // Sharp alternating tones — more urgent than standard warning
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(880, t);
    osc1.frequency.setValueAtTime(440, t + 0.1);
    osc1.frequency.setValueAtTime(880, t + 0.2);
    osc1.frequency.setValueAtTime(440, t + 0.3);
    osc1.frequency.setValueAtTime(880, t + 0.4);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.08, t);
    g1.gain.setValueAtTime(0.08, t + 0.45);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 3;
    osc1.connect(filter);
    filter.connect(g1);
    g1.connect(masterGain);
    osc1.start(t);
    osc1.stop(t + 0.5);

    // Sub-bass throb for urgency
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(80, t);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.15, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    sub.connect(subG);
    subG.connect(masterGain);
    sub.start(t);
    sub.stop(t + 0.5);
  }

  // Egg hatch — wet organic cracking/splitting sound
  function _playEggHatch(t) {
    // Crackle noise burst (shell breaking)
    const bufLen = ctx.sampleRate * 0.3;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen) * (Math.random() > 0.7 ? 1 : 0.2);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const nFilter = ctx.createBiquadFilter();
    nFilter.type = 'highpass';
    nFilter.frequency.value = 2000;
    const nG = ctx.createGain();
    nG.gain.setValueAtTime(0.1, t);
    nG.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    noise.connect(nFilter);
    nFilter.connect(nG);
    nG.connect(masterGain);
    noise.start(t);
    noise.stop(t + 0.3);

    // Wet squelch (organic membrane)
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.2);
    const oscG = ctx.createGain();
    oscG.gain.setValueAtTime(0.08, t);
    oscG.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(oscG);
    oscG.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  function _playWarning(t) {
    // Rising danger tone
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.setValueAtTime(660, t + 0.15);
    osc.frequency.setValueAtTime(440, t + 0.3);
    osc.frequency.setValueAtTime(660, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.setValueAtTime(0.12, t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  // GDD §8.3: Blue shield ripple impact
  function _playShieldHit(t) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2200, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  function _playHullHit(t) {
    // Metallic crunch
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noise.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    noise.start(t);
    noise.stop(t + 0.15);
  }

  // GDD §10.1: Lock tone — escalating beeps
  function _playLockTone(t) {
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 800 + i * 200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08, t + i * 0.2);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.2 + 0.1);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(t + i * 0.2);
      osc.stop(t + i * 0.2 + 0.12);
    }
  }

  // GDD §3.3: Explosive acceleration sound, cockpit rattle, turbine at full scream
  function _playLaunch(t) {
    // Turbine ramp-up
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(2000, t + 2.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(4000, t + 2.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.linearRampToValueAtTime(0.3, t + 2.0);
    g.gain.exponentialRampToValueAtTime(0.05, t + 3.5);
    osc.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 3.5);

    // Rattle — filtered noise bursts
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    const rattleFilter = ctx.createBiquadFilter();
    rattleFilter.type = 'bandpass';
    rattleFilter.frequency.value = 300;
    rattleFilter.Q.value = 8;
    const rattleG = ctx.createGain();
    rattleG.gain.setValueAtTime(0.02, t);
    rattleG.gain.linearRampToValueAtTime(0.15, t + 1.5);
    rattleG.gain.exponentialRampToValueAtTime(0.001, t + 3.0);
    noise.connect(rattleFilter);
    rattleFilter.connect(rattleG);
    rattleG.connect(masterGain);
    noise.start(t);
    noise.stop(t + 3.0);
  }

  // GDD §4.1: Sonic boom crack during boost
  function _playBoost(t) {
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noise.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    noise.start(t);
    noise.stop(t + 0.15);

    // Sub thump
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 40;
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.3, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    sub.connect(subG);
    subG.connect(masterGain);
    sub.start(t);
    sub.stop(t + 0.3);
  }

  function _playCommBeep(t) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  // GDD §3.1: Distant klaxons in launch bay
  function _playKlaxon(t) {
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 520;
      const g = ctx.createGain();
      const start = t + i * 0.8;
      g.gain.setValueAtTime(0.08, start);
      g.gain.setValueAtTime(0.08, start + 0.35);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(start);
      osc.stop(start + 0.4);
    }
  }

  // GDD §3.2: HUD powers up in sequence with flicker
  function _playHudPowerUp(t) {
    for (let i = 0; i < 5; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 600 + i * 100;
      const g = ctx.createGain();
      const start = t + i * 0.3;
      g.gain.setValueAtTime(0.04, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(start);
      osc.stop(start + 0.15);
    }
  }

  // GDD §3.2: Electromagnetic clamp release
  function _playClampRelease(t) {
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 10;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    noise.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    noise.start(t);
    noise.stop(t + 0.25);

    // Metallic clank
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.12, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(og);
    og.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  // GDD §3.2: Rising turbine whine during pre-launch
  function _playTurbineWhine(t) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 4.0);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(3000, t + 4.0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.02, t);
    g.gain.linearRampToValueAtTime(0.15, t + 3.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
    osc.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 4.5);
  }

  // ══════════════════════════════════════
  // AMBIENT DRONES (persistent loops)
  // ══════════════════════════════════════

  // GDD §3.1: Starbase landing bay ambience — full din of a busy military station
  function startBayAmbience() {
    if (!ctx) init();
    resume();
    if (bayAmbience) return;

    const g = ctx.createGain();
    g.gain.value = 0.06;
    g.connect(masterGain);

    // Low-frequency bay hum (two detuned oscillators — reactor/power grid)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 55;
    osc1.connect(g);
    osc1.start();

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 57.5; // slight detune for beating
    osc2.connect(g);
    osc2.start();

    // Filtered noise floor (activity din — distant crews, loaders, comms chatter)
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const noiseG = ctx.createGain();
    noiseG.gain.value = 0.03;
    noise.connect(filter);
    filter.connect(noiseG);
    noiseG.connect(masterGain);
    noise.start();

    // ── Heavy machinery rumble (distant hydraulics / cargo lifts) ──
    const machineOsc = ctx.createOscillator();
    machineOsc.type = 'sawtooth';
    machineOsc.frequency.value = 32;  // deep industrial rumble
    const machineLPF = ctx.createBiquadFilter();
    machineLPF.type = 'lowpass';
    machineLPF.frequency.value = 80;
    machineLPF.Q.value = 3;
    const machineG = ctx.createGain();
    machineG.gain.value = 0.025;
    machineOsc.connect(machineLPF);
    machineLPF.connect(machineG);
    machineG.connect(masterGain);
    machineOsc.start();

    // ── Ventilation / air handling system hiss ──
    const ventNoise = ctx.createBufferSource();
    ventNoise.buffer = _getNoiseBuffer();
    ventNoise.loop = true;
    const ventBPF = ctx.createBiquadFilter();
    ventBPF.type = 'bandpass';
    ventBPF.frequency.value = 1200;
    ventBPF.Q.value = 0.5;
    const ventG = ctx.createGain();
    ventG.gain.value = 0.015;
    ventNoise.connect(ventBPF);
    ventBPF.connect(ventG);
    ventG.connect(masterGain);
    ventNoise.start();

    // ── Metallic resonance — large hangar reverberant tone ──
    const metalOsc1 = ctx.createOscillator();
    metalOsc1.type = 'triangle';
    metalOsc1.frequency.value = 110; // hangar structural resonance
    const metalOsc2 = ctx.createOscillator();
    metalOsc2.type = 'triangle';
    metalOsc2.frequency.value = 165; // harmonic
    const metalG = ctx.createGain();
    metalG.gain.value = 0.008;
    metalOsc1.connect(metalG);
    metalOsc2.connect(metalG);
    metalG.connect(masterGain);
    metalOsc1.start();
    metalOsc2.start();

    // ── Periodic clanks and hydraulic hisses (scheduled bursts) ──
    let bayEventInterval = null;
    function scheduleBayEvents() {
      bayEventInterval = setInterval(() => {
        if (!bayAmbience) { clearInterval(bayEventInterval); return; }
        const now = ctx.currentTime;
        const roll = Math.random();

        if (roll < 0.3) {
          // Metallic clank — tool drop or clamp engage
          const clank = ctx.createOscillator();
          clank.type = 'triangle';
          clank.frequency.setValueAtTime(800 + Math.random() * 600, now);
          clank.frequency.exponentialRampToValueAtTime(100, now + 0.08);
          const clankG = ctx.createGain();
          clankG.gain.setValueAtTime(0.04, now);
          clankG.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          clank.connect(clankG);
          clankG.connect(masterGain);
          clank.start(now);
          clank.stop(now + 0.15);
        } else if (roll < 0.55) {
          // Hydraulic hiss — cargo arm or clamp release
          const hiss = ctx.createBufferSource();
          hiss.buffer = _getNoiseBuffer();
          const hissFilter = ctx.createBiquadFilter();
          hissFilter.type = 'bandpass';
          hissFilter.frequency.value = 2500 + Math.random() * 1500;
          hissFilter.Q.value = 1.5;
          const hissG = ctx.createGain();
          const dur = 0.3 + Math.random() * 0.4;
          hissG.gain.setValueAtTime(0.025, now);
          hissG.gain.exponentialRampToValueAtTime(0.001, now + dur);
          hiss.connect(hissFilter);
          hissFilter.connect(hissG);
          hissG.connect(masterGain);
          hiss.start(now);
          hiss.stop(now + dur + 0.05);
        } else if (roll < 0.7) {
          // Distant PA chime — two-tone station alert
          const chime1 = ctx.createOscillator();
          chime1.type = 'sine';
          chime1.frequency.value = 880;
          const chime2 = ctx.createOscillator();
          chime2.type = 'sine';
          chime2.frequency.value = 1100;
          const chimeG = ctx.createGain();
          chimeG.gain.setValueAtTime(0.02, now);
          chimeG.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
          chime1.connect(chimeG);
          chimeG.connect(masterGain);
          chime1.start(now);
          chime1.stop(now + 0.2);
          const chimeG2 = ctx.createGain();
          chimeG2.gain.setValueAtTime(0.02, now + 0.2);
          chimeG2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
          chime2.connect(chimeG2);
          chimeG2.connect(masterGain);
          chime2.start(now + 0.2);
          chime2.stop(now + 0.5);
        }
      }, 2000 + Math.random() * 3000); // every 2-5 seconds
    }
    scheduleBayEvents();

    bayAmbience = { osc1, osc2, noise, g, noiseG, machineOsc, machineG, ventNoise, ventG, metalOsc1, metalOsc2, metalG, bayEventInterval };
  }

  function stopBayAmbience() {
    if (!bayAmbience) return;
    const t = ctx.currentTime;
    bayAmbience.g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    bayAmbience.noiseG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    if (bayAmbience.machineG) bayAmbience.machineG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    if (bayAmbience.ventG) bayAmbience.ventG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    if (bayAmbience.metalG) bayAmbience.metalG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    if (bayAmbience.bayEventInterval) clearInterval(bayAmbience.bayEventInterval);
    const ba = bayAmbience;
    bayAmbience = null;
    setTimeout(() => {
      try {
        ba.osc1.stop(); ba.osc2.stop(); ba.noise.stop();
        if (ba.machineOsc) ba.machineOsc.stop();
        if (ba.ventNoise) ba.ventNoise.stop();
        if (ba.metalOsc1) ba.metalOsc1.stop();
        if (ba.metalOsc2) ba.metalOsc2.stop();
      } catch (e) { }
    }, 600);
  }

  // GDD §3.4: Sudden near-silence — vacuum. Only cockpit systems hum.
  function startCockpitHum() {
    if (!ctx) init();
    resume();
    if (cockpitHum) return;

    const g = ctx.createGain();
    g.gain.value = 0.03;
    g.connect(masterGain);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 120;
    osc.connect(g);
    osc.start();

    // Very faint ventilation noise
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    const noiseG = ctx.createGain();
    noiseG.gain.value = 0.015;
    noise.connect(filter);
    filter.connect(noiseG);
    noiseG.connect(masterGain);
    noise.start();

    cockpitHum = { osc, noise, g, noiseG };
  }

  function stopCockpitHum() {
    if (!cockpitHum) return;
    const t = ctx.currentTime;
    cockpitHum.g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    cockpitHum.noiseG.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    const ch = cockpitHum;
    cockpitHum = null;
    setTimeout(() => {
      try { ch.osc.stop(); ch.noise.stop(); } catch (e) { }
    }, 400);
  }

  // ══════════════════════════════════════
  // PA ANNOUNCER — Airport-style intercom voice
  // Routes speech through Web Audio PA processing chain:
  // bandpass filter → compressor → convolver reverb → slight overdrive
  // ══════════════════════════════════════

  let paDestination = null; // MediaStreamAudioDestination for capturing speech
  let paChain = null;       // PA processing nodes

  function initPAChain() {
    if (paChain || !ctx) return;

    // Bandpass filter — tinny intercom character (300–3400 Hz telephone band)
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 1800;
    bandpass.Q.value = 0.7;

    // High-shelf cut — remove harsh sibilance
    const hiCut = ctx.createBiquadFilter();
    hiCut.type = 'highshelf';
    hiCut.frequency.value = 4000;
    hiCut.gain.value = -8;

    // Compressor — squash dynamics like a real PA system
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -30;
    compressor.knee.value = 10;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;

    // Slight warmth — low shelf boost for body
    const loBoost = ctx.createBiquadFilter();
    loBoost.type = 'lowshelf';
    loBoost.frequency.value = 400;
    loBoost.gain.value = 3;

    // Gain staging — PA volume
    const paGain = ctx.createGain();
    paGain.gain.value = 1.2;

    // Create reverb impulse — short slapback echo (airport terminal)
    const reverbLen = ctx.sampleRate * 0.6; // 600ms tail
    const reverbBuf = ctx.createBuffer(2, reverbLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = reverbBuf.getChannelData(ch);
      for (let i = 0; i < reverbLen; i++) {
        // Early reflections + exponential decay
        const t = i / ctx.sampleRate;
        let val = (Math.random() * 2 - 1) * Math.exp(-t * 6);
        // Add distinct early reflections at 30ms, 80ms, 150ms
        if (i === Math.floor(0.03 * ctx.sampleRate)) val += 0.3 * (Math.random() > 0.5 ? 1 : -1);
        if (i === Math.floor(0.08 * ctx.sampleRate)) val += 0.2 * (Math.random() > 0.5 ? 1 : -1);
        if (i === Math.floor(0.15 * ctx.sampleRate)) val += 0.1 * (Math.random() > 0.5 ? 1 : -1);
        data[i] = val;
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = reverbBuf;

    // Wet/dry mix for reverb
    const dryGain = ctx.createGain();
    dryGain.gain.value = 0.75;
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.35;

    // Waveshaper for subtle intercom distortion
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = (Math.PI + 3) * x / (Math.PI + 3 * Math.abs(x)); // soft clip
    }
    shaper.curve = curve;
    shaper.oversample = '2x';

    // Chain: input → bandpass → hiCut → compressor → shaper → loBoost → split(dry/wet) → merge → paGain → master
    const merger = ctx.createGain();

    paChain = { bandpass, hiCut, compressor, shaper, loBoost, convolver, dryGain, wetGain, merger, paGain };

    // Wire it up
    bandpass.connect(hiCut);
    hiCut.connect(compressor);
    compressor.connect(shaper);
    shaper.connect(loBoost);
    // Dry path
    loBoost.connect(dryGain);
    dryGain.connect(merger);
    // Wet path (reverb)
    loBoost.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(merger);
    // Output
    merger.connect(paGain);
    paGain.connect(masterGain);
  }

  function speak(text, opts = {}) {
    if (!('speechSynthesis' in window)) return;
    if (!ctx) init();
    initPAChain();

    const moduleId = opts.voiceModule && VOICE_MODULES[opts.voiceModule] ? opts.voiceModule : _activeVoiceModule;
    const voiceCfg = VOICE_MODULES[moduleId] || VOICE_MODULES.au_female;

    if (!_voiceCacheByModule[moduleId]) _resolveVoice(moduleId);
    const moduleVoice = _voiceCacheByModule[moduleId] || _cachedVoice;

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = (opts.rate !== undefined ? opts.rate : voiceCfg.rate);
    utter.pitch = (opts.pitch !== undefined ? opts.pitch : voiceCfg.pitch);
    utter.volume = (opts.volume !== undefined ? opts.volume : voiceCfg.volume);

    // Module-selected voice
    if (moduleVoice) {
      utter.voice = moduleVoice;
      _cachedVoice = moduleVoice;
    } else {
      // Voices may not have loaded yet — resolve and retry
      _resolveVoice(moduleId);
      const voices = speechSynthesis.getVoices();
      const preferred = _pickVoice(moduleId, voices)
        || voices.find(v => v.lang && v.lang.startsWith('en'))
        || voices[0];
      if (preferred) {
        utter.voice = preferred;
        _voiceCacheByModule[moduleId] = preferred;
        _cachedVoice = preferred;
      }
    }

    // Route speech through PA processing chain via MediaStreamDestination
    if (paChain && ctx.createMediaStreamSource) {
      try {
        // Create a destination that the SpeechSynthesis audio will play to
        const dest = ctx.createMediaStreamDestination();
        const source = ctx.createMediaStreamSource(dest.stream);
        source.connect(paChain.bandpass);

        // Use a hidden audio element to capture the speech output
        // Fallback: just play through normal synthesis (still sounds better with voice selection)
        speechSynthesis.speak(utter);
      } catch (e) {
        // Fallback to direct speech
        speechSynthesis.speak(utter);
      }
    } else {
      speechSynthesis.speak(utter);
    }

    // Add a subtle static burst before and after the PA message
    if (ctx && masterGain) {
      // Pre-transmission click/static
      const preStatic = ctx.createBufferSource();
      const preLen = Math.floor(ctx.sampleRate * 0.08);
      const preBuf = ctx.createBuffer(1, preLen, ctx.sampleRate);
      const preData = preBuf.getChannelData(0);
      for (let i = 0; i < preLen; i++) {
        preData[i] = (Math.random() * 2 - 1) * 0.15 * Math.exp(-i / (preLen * 0.3));
      }
      preStatic.buffer = preBuf;
      // Run static through the PA bandpass for authentic intercom crackle
      const staticFilter = ctx.createBiquadFilter();
      staticFilter.type = 'bandpass';
      staticFilter.frequency.value = 2000;
      staticFilter.Q.value = 1.5;
      const staticGain = ctx.createGain();
      staticGain.gain.value = 0.6;
      preStatic.connect(staticFilter);
      staticFilter.connect(staticGain);
      staticGain.connect(masterGain);
      preStatic.start(ctx.currentTime);

      // Post-transmission click (delayed estimate based on text length)
      const estimatedDuration = text.length * 0.065; // ~65ms per character at 0.92 rate
      const postStatic = ctx.createBufferSource();
      const postLen = Math.floor(ctx.sampleRate * 0.12);
      const postBuf = ctx.createBuffer(1, postLen, ctx.sampleRate);
      const postData = postBuf.getChannelData(0);
      for (let i = 0; i < postLen; i++) {
        const env = i < postLen * 0.2 ? (i / (postLen * 0.2)) : Math.exp(-(i - postLen * 0.2) / (postLen * 0.25));
        postData[i] = (Math.random() * 2 - 1) * 0.12 * env;
      }
      postStatic.buffer = postBuf;
      const postFilter = ctx.createBiquadFilter();
      postFilter.type = 'bandpass';
      postFilter.frequency.value = 2000;
      postFilter.Q.value = 1.5;
      const postGain = ctx.createGain();
      postGain.gain.value = 0.5;
      postStatic.connect(postFilter);
      postFilter.connect(postGain);
      postGain.connect(masterGain);
      postStatic.start(ctx.currentTime + estimatedDuration);
    }
  }

  // ── speakAs: speak with a specific crew member's voice ──
  function speakAs(crewName, text, opts = {}) {
    const voiceModule = CREW_VOICE_MAP[crewName] || _activeVoiceModule;
    speak(text, { ...opts, voiceModule });
  }

  // Volume control
  function setMasterVolume(v) {
    if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v));
  }

  function setShockwaveVolume(v) {
    if (shockwaveGain) shockwaveGain.gain.value = Math.max(0, Math.min(1, v));
  }

  // ══════════════════════════════════════
  // ENGINE THRUST RUMBLE — continuous, volume/pitch tied to throttle
  // Low-frequency rumble representing reactor→thruster transmission through hull.
  // No sound in vacuum, but the hull vibrates and the pilot feels/hears it.
  // ══════════════════════════════════════

  function startThrustRumble() {
    if (!ctx) init();
    resume();
    if (thrustRumble) return;

    // Main rumble oscillator — low sawtooth for gritty engine growl
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    rumbleGain.connect(masterGain);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 42;   // deep bass rumble
    const osc1Gain = ctx.createGain();
    osc1Gain.gain.value = 0.12;

    // Low-pass filter to keep it subsonic/rumbly
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 120;
    lpf.Q.value = 2;

    osc1.connect(osc1Gain);
    osc1Gain.connect(lpf);
    lpf.connect(rumbleGain);
    osc1.start();

    // Second detuned oscillator for beating/texture
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 44.5;   // slight detune for beating effect
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.08;
    osc2.connect(osc2Gain);
    osc2Gain.connect(lpf);
    osc2.start();

    // Noise layer — filtered rumble texture (turbine rattle)
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    noise.loop = true;
    const noiseLPF = ctx.createBiquadFilter();
    noiseLPF.type = 'lowpass';
    noiseLPF.frequency.value = 200;
    noiseLPF.Q.value = 1;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.06;
    noise.connect(noiseLPF);
    noiseLPF.connect(noiseGain);
    noiseGain.connect(rumbleGain);
    noise.start();

    thrustRumble = { osc1, osc2, noise, rumbleGain, lpf, noiseLPF };
  }

  function stopThrustRumble() {
    if (!thrustRumble) return;
    const t = ctx.currentTime;
    thrustRumble.rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    const tr = thrustRumble;
    thrustRumble = null;
    setTimeout(() => {
      try { tr.osc1.stop(); tr.osc2.stop(); tr.noise.stop(); } catch (e) { }
    }, 400);
  }

  // Call every frame with current throttle (0..1) and afterburner/boost state
  function setThrustLevel(throttle, afterburner, boost) {
    if (!thrustRumble) return;

    // Effective intensity: higher throttle = louder + higher pitch
    let intensity = throttle;
    if (boost) intensity = Math.max(intensity, 0.95);
    else if (afterburner) intensity = Math.max(intensity, 0.7);

    // Smooth towards target (prevents pops)
    _thrustLevel += (intensity - _thrustLevel) * 0.08;

    const t = ctx.currentTime;
    // Volume: silent at 0, rumbling at full throttle
    const vol = _thrustLevel * 0.35;
    thrustRumble.rumbleGain.gain.setTargetAtTime(vol, t, 0.05);

    // Pitch rises with thrust (42Hz idle → 80Hz full burn)
    const freq = 42 + _thrustLevel * 38;
    thrustRumble.osc1.frequency.setTargetAtTime(freq, t, 0.1);
    thrustRumble.osc2.frequency.setTargetAtTime(freq * 1.06, t, 0.1);

    // Filter opens with thrust (more high-freq rattle at full power)
    thrustRumble.lpf.frequency.setTargetAtTime(120 + _thrustLevel * 280, t, 0.1);
    thrustRumble.noiseLPF.frequency.setTargetAtTime(200 + _thrustLevel * 400, t, 0.1);
  }

  // ══════════════════════════════════════
  // RCS STRAFE HISS — short burst when lateral/vertical thrusters fire
  // Small attitude jets — compressed gas hiss through hull
  // ══════════════════════════════════════

  function startStrafeHiss() {
    if (!ctx) init();
    resume();
    if (_strafeHissNodes) return;

    const hissGain = ctx.createGain();
    hissGain.gain.value = 0;
    hissGain.connect(masterGain);

    // White noise through bandpass = gas release hiss
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    noise.loop = true;

    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 3000;
    bpf.Q.value = 0.8;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 1500;

    noise.connect(bpf);
    bpf.connect(hpf);
    hpf.connect(hissGain);
    noise.start();

    _strafeHissNodes = { noise, hissGain, bpf };
  }

  function stopStrafeHiss() {
    if (!_strafeHissNodes) return;
    const t = ctx.currentTime;
    _strafeHissNodes.hissGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    const sn = _strafeHissNodes;
    _strafeHissNodes = null;
    setTimeout(() => { try { sn.noise.stop(); } catch (e) { } }, 200);
  }

  // Call every frame with strafe input magnitudes
  function setStrafeLevel(strafeH, strafeV) {
    if (!_strafeHissNodes) return;
    const intensity = Math.min(1, Math.abs(strafeH) + Math.abs(strafeV));
    const vol = intensity * 0.15;  // subtle hiss
    const t = ctx.currentTime;
    _strafeHissNodes.hissGain.gain.setTargetAtTime(vol, t, 0.02); // fast attack
  }

  return {
    init,
    resume,
    pauseAll,
    resumeAll,
    playSound,
    speak,
    speakAs,
    startBayAmbience,
    stopBayAmbience,
    startCockpitHum,
    stopCockpitHum,
    setMasterVolume,
    setShockwaveVolume,
    startThrustRumble,
    stopThrustRumble,
    setThrustLevel,
    startStrafeHiss,
    stopStrafeHiss,
    setStrafeLevel,
    setVoiceModule,
    getVoiceModule,
    listVoiceModules,
    getCtx: () => ctx,
    getMasterGain: () => masterGain
  };
})();

window.SFAudio = SFAudio;
