/**
 * Starfighter Audio System — SFAudio
 * Procedural Web Audio API synthesis — zero external files
 * All sounds generated in real-time from oscillators, noise, and filters.
 */

const SFAudio = (function () {
  let ctx = null;
  let masterGain = null;
  let initialized = false;

  // Persistent engine drones (looping)
  let engineDrone = null;
  let bayAmbience = null;
  let cockpitHum = null;

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
    initialized = true;
  }

  // Resume AudioContext on user gesture (required by browsers)
  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
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
    }
  }

  // GDD §10.1: Sci-fi pulse cannon — layered zap with punch
  function _playLaser(t) {
    // Main tone — bright descending zap
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    g.connect(masterGain);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2200, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.1);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + 0.15);

    // Sub-bass thump — muzzle kick felt through hull
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.12, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    subG.connect(masterGain);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(120, t);
    sub.frequency.exponentialRampToValueAtTime(40, t + 0.06);
    sub.connect(subG);
    sub.start(t);
    sub.stop(t + 0.08);

    // Sizzle layer — high-frequency noise burst
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 5000;
    noiseFilter.Q.value = 1.5;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.1, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noise.start(t);
    noise.stop(t + 0.08);

    // Resonant ping — the "pew" character
    const pingG = ctx.createGain();
    pingG.gain.setValueAtTime(0.06, t);
    pingG.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    pingG.connect(masterGain);

    const ping = ctx.createOscillator();
    ping.type = 'sine';
    ping.frequency.setValueAtTime(3200, t);
    ping.frequency.exponentialRampToValueAtTime(800, t + 0.12);
    ping.connect(pingG);
    ping.start(t);
    ping.stop(t + 0.12);
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

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = opts.rate || 0.88;    // measured, deliberate PA cadence
    utter.pitch = opts.pitch || 0.75;  // low, authoritative — airport terminal commander
    utter.volume = opts.volume || 1.0;

    // Find the most natural-sounding deep English voice — PA announcer style
    const voices = speechSynthesis.getVoices();
    const preferred =
      // Top tier: Google UK Male — deep, crisp, authoritative
      voices.find(v => /Google UK English Male/i.test(v.name))
      // Microsoft natural voices — Daniel (UK deep male) or Guy (US deep)
      || voices.find(v => /Microsoft.*Daniel.*Online/i.test(v.name))
      || voices.find(v => /Microsoft.*Guy.*Online/i.test(v.name))
      || voices.find(v => /Microsoft.*Online.*Natural/i.test(v.name) && v.lang.startsWith('en'))
      // Any Google English voice (generally higher quality than espeak)
      || voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
      // Prefer remote/cloud voices over local (usually higher quality)
      || voices.find(v => v.lang.startsWith('en-') && !v.localService)
      // Last resort: any English voice
      || voices.find(v => v.lang.startsWith('en'));
    if (preferred) utter.voice = preferred;

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
    playSound,
    speak,
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
    setStrafeLevel
  };
})();

window.SFAudio = SFAudio;
