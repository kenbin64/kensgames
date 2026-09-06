// FastTrack 3D - Three.js Board Rendering
// ═══════════════════════════════════════════════════════════════════════════
// Ported from legacy/junkyard/universe/games/fasttrack/3d.html
// Hexagonal board with golden ratio proportions, Light Bright pegs
// ═══════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// GOLDEN RATIO PROPORTIONS (φ = 1.618033988749895)
// ════════════════════════════════════════════════════════════════
const PHI = 1.618033988749895;
const BOARD_RADIUS = 300;
const BOARD_THICKNESS = 21;
const BOARD_BEVEL = 12;
const HOLE_RADIUS = 8;
const TRACK_HOLE_RADIUS = 8;
// Flat-top pegs — shorter, wider, with a disc cap
const PEG_BOTTOM_RADIUS = 9;
const PEG_HEIGHT = Math.round(PEG_BOTTOM_RADIUS * 2 * 1.6180339887); // φ × diameter = 29
const PEG_TOP_RADIUS = 6;        // less tapered
const PEG_DOME_RADIUS = 6;       // flat cap matches top
const LINE_HEIGHT = 13;
const BORDER_HEIGHT = 15;
const BORDER_WIDTH = 13;

// Billiard table dimensions
const TABLE_HEIGHT = 90;              // Height of table from floor
const TABLE_LEG_WIDTH = 25;
const RAIL_HEIGHT = 12;
const RAIL_WIDTH = 35;

// Room dimensions
const ROOM_WIDTH = 1200;
const ROOM_DEPTH = 1000;
const ROOM_HEIGHT = 560;

// Player colors (Board Inventory v2.0.0)
// Billiard ball colors (solids 1–6): Yellow, Blue, Red, Purple, Orange, Green
const RAINBOW_COLORS = [0xFFE000, 0x0050B5, 0xEE0000, 0x4B0082, 0xFF5500, 0x006400];
const COLOR_NAMES = ['Yellow', 'Blue', 'Red', 'Purple', 'Orange', 'Green'];

// Art pieces — ingested onto the manifold via ft:art RepresentationTable
// 2 paintings per wall on all four walls.
// Front wall (z = +ROOM_DEPTH/2) is behind the default camera but visible when orbiting.
const ART_PLACEHOLDERS = [
  // ── Back wall (faces +Z, viewed from default camera position) ──
  {
    wall: 'back', x: -300, y: 280, width: 220, height: 165, file: 'bridge.webp',
    title: 'The Bridge', artist: 'Ken Bingham', medium: 'Oil on Canvas', year: '2021',
    storeUrl: 'https://fineartamerica.com/featured/enchanted-forest-bridge-kenneth-bingham.html'
  },
  {
    wall: 'back', x: 300, y: 280, width: 220, height: 165, file: 'chess.webp',
    title: 'Two Men Playing Chess In Park', artist: 'Ken Bingham', medium: 'Acrylic on Canvas', year: '2020',
    storeUrl: 'https://fineartamerica.com/featured/two-men-playing-chess-in-park-kenneth-bingham.html'
  },
  // ── Left wall ──
  {
    wall: 'left', x: -220, y: 260, width: 200, height: 150, file: 'DrivingTheHerd.webp',
    title: 'Driving The Herd', artist: 'Ken Bingham', medium: 'Oil on Canvas', year: '2019',
    storeUrl: 'https://fineartamerica.com/featured/cowboy-leading-cattle-through-desert-kenneth-bingham.html'
  },
  {
    wall: 'left', x: 120, y: 260, width: 200, height: 150, file: 'lighthouse.webp',
    title: 'The Lighthouse', artist: 'Ken Bingham', medium: 'Oil on Canvas', year: '2022',
    storeUrl: 'https://fineartamerica.com/featured/lighthouse-illuminating-stormy-sea-kenneth-bingham.html'
  },
  // ── Right wall — spread apart to leave room for neon sign in center ──
  {
    wall: 'right', x: -220, y: 260, width: 200, height: 150, file: 'parrot.webp',
    title: 'The Parrot', artist: 'Ken Bingham', medium: 'Acrylic', year: '2026',
    storeUrl: 'https://fineartamerica.com/featured/tropical-paradise-with-parrot-kenneth-bingham.html'
  },
  {
    wall: 'right', x: 280, y: 260, width: 200, height: 150, file: 'pigs.webp',
    title: 'The Pigs', artist: 'Ken Bingham', medium: 'Oil on Canvas', year: '2018',
    storeUrl: 'https://fineartamerica.com/featured/three-little-pigs-in-overalls-kenneth-bingham.html'
  },
  // ── Front wall (orbit camera to see) ──
  {
    wall: 'front', x: -300, y: 280, width: 220, height: 165, file: 'voyage.webp',
    title: 'The Voyage', artist: 'Ken Bingham', medium: 'Oil on Canvas', year: '2020',
    storeUrl: 'https://fineartamerica.com/featured/ship-at-sea-near-majestic-mountain-kenneth-bingham.html'
  },
  {
    wall: 'front', x: 0, y: 280, width: 220, height: 165, file: 'bear.webp',
    title: 'Bear Catching Fish', artist: 'Ken Bingham', medium: 'Oil on Canvas', year: '2023',
    storeUrl: 'https://fineartamerica.com/featured/bear-catching-fish-in-rapids-kenneth-bingham.html'
  },
  {
    wall: 'front', x: 300, y: 280, width: 220, height: 165, file: 'rainedout.webp',
    title: 'Rained Out', artist: 'Ken Bingham', medium: 'Watercolor', year: '2023',
    storeUrl: 'https://fineartamerica.com/featured/baseball-player-on-rainy-field-kenneth-bingham.html'
  },
];

/**
 * Ingest art images onto the manifold (ft:art RepresentationTable).
 * Reads base64 data URLs from the pre-generated ART_DATA global (art-data.js),
 * creates Image elements, and stores them on the manifold.
 * Data URLs are same-origin by definition — no file:// taint.
 * Returns a Promise that resolves when all images are ingested.
 */
function ingestArt() {
  const table = state.art;
  const promises = ART_PLACEHOLDERS.map(art => new Promise((resolve) => {
    const key = art.file;
    // Skip if already ingested (delta cache — O(1) check)
    if (table.has(`${key}|img`)) {
      console.log(`🎨 Manifold cache hit: ${key}`);
      // Still attempt to apply to any meshes that registered before the
      // cache hit was checked.
      _applyArtTextureToMeshes(key);
      return resolve();
    }
    const dataUrl = typeof ART_DATA !== 'undefined' && ART_DATA[key];
    const src = dataUrl || `assets/images/art/${key}`;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      table.set(`${key}|img`, img);
      table.set(`${key}|width`, img.naturalWidth);
      table.set(`${key}|height`, img.naturalHeight);
      console.log(`🎨 Ingested onto manifold: ${key} (${img.naturalWidth}×${img.naturalHeight})`);
      // user_directive_2026-05-18 — art now ingests in the background while
      // the board renders. Retro-apply the texture to any canvas meshes
      // already in the scene as each image lands, so paintings pop in
      // progressively instead of blocking startup for ~50MB of PNG.
      _applyArtTextureToMeshes(key);
      resolve();
    };
    img.onerror = () => {
      console.warn(`🎨 Failed to load art: ${key}`);
      resolve();
    };
    img.src = src;
  }));
  return Promise.all(promises);
}

// Retro-apply an ingested art texture to any artClickMesh already in the scene.
// Called from ingestArt's onload handler so paintings appear as their image
// arrives, without blocking init3D on the full download.
function _applyArtTextureToMeshes(artFile) {
  if (!Array.isArray(artClickMeshes) || artClickMeshes.length === 0) return;
  const tex = materialiseArtTexture(artFile);
  if (!tex) return;
  for (const mesh of artClickMeshes) {
    if (!mesh || !mesh.userData || !mesh.userData.artInfo) continue;
    if (mesh.userData.artInfo.file !== artFile) continue;
    const mat = mesh.material;
    if (!mat) continue;
    mat.map = tex;
    mat.color.set(0xffffff);
    mat.emissive = new THREE.Color(0xffffff);
    mat.emissiveMap = tex;
    mat.emissiveIntensity = 0.35;
    mat.needsUpdate = true;
  }
}

/**
 * Materialise a THREE.Texture from manifold-ingested art.
 * Uses the stored HTMLImageElement (created from data URL — untainted).
 * Returns null if the art is not yet ingested.
 */
function materialiseArtTexture(artName) {
  const table = state.art;
  const img = table.get(`${artName}|img`);
  if (!img) return null;
  const tex = new THREE.Texture(img);
  tex.needsUpdate = true;
  if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
  return tex;
}

// ════════════════════════════════════════════════════════════════
// THREE.JS SCENE GLOBALS
// ════════════════════════════════════════════════════════════════
let scene, camera, renderer, controls;
let boardGroup, pegGroup;
const holeRegistry = new Map();
const pegRegistry = new Map();
// Expose registries on window for the x-code HUD overlay (read-only consumers).
window.holeRegistry = holeRegistry;
window.pegRegistry = pegRegistry;
let boardMesh = null;
let dustMotes = null;  // atmospheric dust particle system
const artClickMeshes = [];  // canvas meshes registered for click → overlay

// ════════════════════════════════════════════════════════════════
// GAME SETTINGS - Configured from lobby
// ════════════════════════════════════════════════════════════════
const GameSettings = {
  cameraMode: 'manual',  // 'manual' (default) or 'auto'
  musicEnabled: true,
  soundEnabled: true,
  showPegNames: true,

  load() {
    try {
      const saved = localStorage.getItem('fasttrack-settings');
      if (saved) {
        const s = JSON.parse(saved);
        this.cameraMode = s.cameraMode || 'manual';
        this.musicEnabled = s.musicEnabled ?? true;
        this.soundEnabled = s.soundEnabled ?? true;
        this.showPegNames = s.showPegNames ?? false;
      }
    } catch (e) { }
  },

  save() {
    localStorage.setItem('fasttrack-settings', JSON.stringify({
      cameraMode: this.cameraMode,
      musicEnabled: this.musicEnabled,
      soundEnabled: this.soundEnabled,
      showPegNames: this.showPegNames
    }));
  }
};

// ════════════════════════════════════════════════════════════════
// MANIFOLD AUDIO ENGINE — Procedural sound & music from z = x·y helix
// ════════════════════════════════════════════════════════════════
// The 7-section helix maps to a heptatonic scale. Each section angle
// produces a frequency via z = x·y where x = cos(θ), y = sin(θ).
// Color ↔ frequency ↔ position are projections of the same manifold.
// ════════════════════════════════════════════════════════════════
// MANIFOLD AUDIO — every sound is the manifold field sampled at audio rate.
// Thin wrapper over ManifoldInstrument (z = x · y at audio rate). Each play*
// method projects its event onto a seed; ManifoldInstrument.Pluck/Burst
// renders PCM by walking the field along the bloom; we route it through the
// SFX bus. Same observation → same waveform. The legacy oscillator engine
// (~900 lines) is replaced; the public surface (ctx, masterGain, _rtGain,
// musicPlaying, _musicVol, playHop, playCardDraw, playEnter, playCut,
// playFastTrack, playBullseye, playSafeZone, playVictory, playFanfare,
// startMusic, stopMusic, startRagtimeAmbience, stopRagtimeAmbience) is kept
// verbatim so 3d.html sliders and game-core callers keep working unchanged.
const ManifoldAudio = {
  ctx: null,
  masterGain: null,
  _rtGain: null,
  _musicTimer: null,
  _rtTimer: null,
  musicPlaying: false,
  _musicVol: 0.6,
  _bar: 0, _beat: 0,
  _rtBar: 0, _rtBeat: 0,
  BPM: 138,
  RT_BPM: 96,

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.7;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 6;
      this.masterGain.connect(comp); comp.connect(this.ctx.destination);
      // Ragtime/music bus — lowpass for vintage warmth, slider-controlled.
      this._rtGain = this.ctx.createGain();
      this._rtGain.gain.value = 0.0;
      const rtFilt = this.ctx.createBiquadFilter();
      rtFilt.type = 'lowpass'; rtFilt.frequency.value = 1100; rtFilt.Q.value = 0.7;
      this._rtGain.connect(rtFilt); rtFilt.connect(this.ctx.destination);
      // Bind ManifoldInstrument worklet for live realtime voices when
      // available; offline PCM render through BufferSource is the fallback.
      if (window.ManifoldInstrument && window.ManifoldInstrument.bind) {
        window.ManifoldInstrument.bind(this.ctx, {
          workletPath: '../../js/manifold-instrument.worklet.js',
          masterGain: 0.6, destination: this.masterGain,
        }).catch(() => { /* worklet optional */ });
      }
      console.log('🎵 ManifoldAudio engine initialized (instrument-driven)');
    } catch (e) { console.warn('Audio not available:', e); }
  },

  // Build a parent x with a domain-tagged deterministic seed.
  _x(domain) {
    const seed = [domain | 0];
    for (let i = 1; i < arguments.length; i++) seed.push(+arguments[i] || 0);
    return { seed: seed, dim: 0 };
  },
  _play(rendered, bus, vol) {
    if (!this.ctx || !rendered) return;
    const buf = this.ctx.createBuffer(1, rendered.pcm.length, rendered.sr || this.ctx.sampleRate);
    buf.getChannelData(0).set(rendered.pcm);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = (vol == null ? 1 : vol);
    src.connect(g); g.connect(bus || this.masterGain);
    src.start();
  },
  _pluck(domain, energy, parts, vol, opts) {
    if (!this.ctx || !window.ManifoldInstrument) return;
    const x = this._x.apply(this, [domain].concat(parts || []));
    this._play(window.ManifoldInstrument.Pluck(x, energy, opts), this.masterGain, vol);
  },
  _burst(domain, energy, parts, vol, opts) {
    if (!this.ctx || !window.ManifoldInstrument) return;
    const x = this._x.apply(this, [domain].concat(parts || []));
    this._play(window.ManifoldInstrument.Burst(x, energy, opts), this.masterGain, vol);
  },

  // ── Sound effects — same names, same call sites, same behavior contract ──
  playHop(section, progress) {
    if (!GameSettings.soundEnabled) return;
    section = section | 0; progress = progress == null ? 0.5 : +progress;
    this._pluck(1, 0.45 + progress * 0.3, [section, (progress * 16) | 0], 0.55, { dur: 0.14, octave: 1 });
  },
  playEnter() {
    if (!GameSettings.soundEnabled) return;
    [0, 2, 4].forEach((s, i) => setTimeout(
      () => this._pluck(2, 0.5 + i * 0.1, [s, i], 0.5, { dur: 0.18 }), i * 60));
  },
  playCardDraw() {
    if (!GameSettings.soundEnabled) return;
    this._burst(3, 0.35, [this._bar & 7], 0.35, { dur: 0.08 });
    setTimeout(() => this._pluck(3, 0.6, [0, 1], 0.5, { dur: 0.12 }), 30);
  },
  playCut() {
    if (!GameSettings.soundEnabled) return;
    this._burst(4, 0.7, [1], 0.5, { dur: 0.18 });
    this._pluck(4, 0.8, [6], 0.5, { dur: 0.18 });
    setTimeout(() => this._pluck(4, 0.5, [0, 4], 0.55, { dur: 0.4 }), 200);
  },
  playFastTrack() {
    if (!GameSettings.soundEnabled) return;
    this._burst(5, 0.55, [0], 0.4, { dur: 0.12 });
    for (let i = 0; i < 7; i++) setTimeout(
      () => this._pluck(5, 0.55, [i], 0.45, { dur: 0.1 }), i * 45);
  },
  playBullseye() {
    if (!GameSettings.soundEnabled) return;
    [0, 2, 4, 0].forEach((s, i) => setTimeout(
      () => this._pluck(6, 0.6 + i * 0.05, [s, i], 0.55, { dur: 0.4, octave: i === 3 ? 2 : 1 }), i * 80));
    setTimeout(() => this._burst(6, 0.85, [9], 0.25, { dur: 0.05 }), 110);
  },
  playSafeZone() {
    if (!GameSettings.soundEnabled) return;
    this._pluck(7, 0.4, [4], 0.45, { dur: 0.5 });
    setTimeout(() => this._pluck(7, 0.45, [0], 0.45, { dur: 0.5 }), 150);
  },
  playVictory() {
    if (!GameSettings.soundEnabled) return;
    for (let i = 0; i < 14; i++) setTimeout(
      () => this._pluck(8, 0.55 + (i / 14) * 0.4, [i % 7, (i / 7) | 0], 0.55,
        { dur: 0.22, octave: 1 + ((i / 7) | 0) }), i * 70);
    [0, 2, 4].forEach(s => setTimeout(
      () => this._pluck(8, 0.7, [s, 99], 0.6, { dur: 0.8, octave: 2 }), 1100));
  },
  playFanfare(type) {
    if (!GameSettings.soundEnabled) return;
    type = type || 'generic';
    const chords = {
      fasttrack: [0, 2, 4, 6], bullseye: [0, 2, 4, 0], cut: [0, 3, 4, 6],
      safeZone: [0, 2, 5], crown: [0, 4, 2, 6, 4], win: [0, 2, 4, 0],
      generic: [0, 2, 4],
    };
    const notes = chords[type] || chords.generic;
    const tag = (type.charCodeAt(0) || 0) + (type.length << 4);
    notes.forEach((s, i) => setTimeout(
      () => this._pluck(9, 0.7, [s, i, tag], 0.55,
        { dur: 0.35, octave: (type === 'win' && i === notes.length - 1) ? 2 : 1 }), i * 50));
    this._burst(9, 0.55, [tag], 0.3, { dur: 0.1 });
  },

  // ── Music engine — beat scheduler driving Pluck on the rt bus ──
  // Each beat is one loop turn; bar/beat seeds keep every measure unique
  // while remaining deterministic for replay.
  startMusic() {
    if (!this.ctx || !GameSettings.musicEnabled || this.musicPlaying) return;
    this.musicPlaying = true; this._bar = 0; this._beat = 0;
    // 🜂 Jazz Speakeasy engine — procedural walking bass + brushed drums +
    // ii-V-I comp chords + bebop melody with verse/chorus/hook form.
    // Falls back to the manifold-pluck scheduler when the module isn't loaded.
    if (window.JazzSpeakeasy && typeof window.JazzSpeakeasy.start === 'function') {
      try {
        window.JazzSpeakeasy.start(this.ctx, {
          gain: 0.6,
          destination: this._rtGain || this.masterGain,
        });
        // Make sure the music bus is audible — the slider scales it from here.
        if (this._rtGain) {
          this._rtGain.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.05);
        }
        console.log('🎷 Jazz Speakeasy engine started');
        return;
      } catch (e) {
        console.warn('JazzSpeakeasy.start failed, falling back to pluck scheduler', e);
      }
    }
    this._scheduleBeat();
    console.log('🎶 Manifold music started (BPM ' + this.BPM + ')');
  },
  stopMusic() {
    this.musicPlaying = false;
    if (window.JazzSpeakeasy && window.JazzSpeakeasy.isRunning && window.JazzSpeakeasy.isRunning()) {
      try { window.JazzSpeakeasy.stop(); } catch (e) { }
    }
    if (this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = null; }
  },
  _scheduleBeat() {
    if (!this.musicPlaying || !window.ManifoldInstrument) return;
    const beatMs = (60 / this.BPM) * 1000;
    const chordTones = [0, 2, 4, 5, 4, 2, 0, 5];
    const tone = chordTones[this._beat % chordTones.length];
    const energy = (this._beat % 4 === 0) ? 0.55 : 0.4;
    const x = this._x(10, this._bar, this._beat, tone);
    const r = window.ManifoldInstrument.Pluck(x, energy, { dur: 0.32, octave: (this._beat % 4 === 0) ? 0 : 1 });
    this._play(r, this._rtGain, this._musicVol);
    this._beat++; if (this._beat >= 8) { this._beat = 0; this._bar++; }
    this._musicTimer = setTimeout(() => this._scheduleBeat(), beatMs);
  },

  // ── Ragtime ambience — Pluck-driven pad on the rt bus, slider scaled ──
  startRagtimeAmbience() {
    if (!this.ctx || this._rtTimer) return;
    // Skip the ambient pad when the Jazz Speakeasy engine is running — the
    // full band already covers the same sonic space and stacking both
    // produces mud.
    if (window.JazzSpeakeasy && window.JazzSpeakeasy.isRunning && window.JazzSpeakeasy.isRunning()) return;
    this._rtBar = 0; this._rtBeat = 0;
    this._scheduleRtBeat();
    console.log('🎹 Ragtime ambience started — manifold-driven');
  },
  stopRagtimeAmbience() {
    if (this._rtTimer) { clearTimeout(this._rtTimer); this._rtTimer = null; }
  },
  _scheduleRtBeat() {
    if (!window.ManifoldInstrument) return;
    const beatMs = (60 / this.RT_BPM) * 1000;
    const x = this._x(11, this._rtBar, this._rtBeat);
    const r = window.ManifoldInstrument.Pluck(x, this._rtBeat === 0 ? 0.5 : 0.32,
      { dur: 0.5, octave: this._rtBeat % 2 ? -1 : 0 });
    this._play(r, this._rtGain, 0.85);
    this._rtBeat++; if (this._rtBeat >= 4) { this._rtBeat = 0; this._rtBar++; }
    this._rtTimer = setTimeout(() => this._scheduleRtBeat(), beatMs);
  },
};


// ════════════════════════════════════════════════════════════════
// CAMERA DIRECTOR - Auto-framing camera system (default: MANUAL)
// ════════════════════════════════════════════════════════════════
const CameraDirector = {
  mode: 'manual',  // Default to manual - user has full control
  _pos: null,
  _look: null,
  _tPos: null,
  _tLook: null,
  _damping: 0.035,         // base damping — smooth, never jerky
  _minHeight: 150,
  _maxHeight: 800,
  _followPegId: null,       // Currently followed peg
  _followMode: null,        // 'peg' | 'split' | 'cut-victim' | 'cut-victor' | null
  _cutsceneLock: false,     // True while cutscene is active — never relinquish
  _splitPegIds: null,       // [peg1Id, peg2Id] for split camera
  _settledCallbacks: [],    // Fired when camera reaches target — a QUEUE, not a
                            // single slot: the turn-enable gate + deferred peg
                            // anims both register and must not clobber each other.
  _activePlayerIdx: -1,     // Current player index for auto-focus

  // Default beginning poses for each fixed mode. All chosen to frame the
  // entire board (BOARD_RADIUS + rails + margin) inside the viewport.
  // Manual is the canonical default — a 3/4 view that shows the whole board.
  DEFAULTS: {
    manual: { pos: [0, 540, 760], look: [0, TABLE_HEIGHT, 0], up: [0, 1, 0] },
    top: { pos: [0, 900, 0.01], look: [0, TABLE_HEIGHT, 0], up: [0, 0, -1] },
    angle: { pos: [560, 460, 560], look: [0, TABLE_HEIGHT, 0], up: [0, 1, 0] },
    // 'auto' has no static pose — it's computed every frame.
  },

  init() {
    // Start at the manual default — frames the full board.
    const d = this.DEFAULTS.manual;
    this._pos = new THREE.Vector3(d.pos[0], d.pos[1], d.pos[2]);
    this._look = new THREE.Vector3(d.look[0], d.look[1], d.look[2]);
    this._tPos = this._pos.clone();
    this._tLook = this._look.clone();
    if (camera) {
      camera.up.set(d.up[0], d.up[1], d.up[2]);
      camera.position.copy(this._pos);
      camera.lookAt(this._look);
    }
    if (controls) controls.target.copy(this._look);
    // Mobile/small viewports default to 'auto' (camera follows the action) —
    // the board is too small to navigate manually with a thumb. Desktop keeps
    // 'manual' as canonical default. Either way, the user can switch from the
    // hamburger camera row and a touch/drag yields immediate manual control
    // (Catan-Universe style — auto resumes after a short idle).
    const isSmallScreen = (typeof window !== 'undefined') &&
      (window.matchMedia && window.matchMedia('(max-width: 760px), (pointer: coarse)').matches);
    const startMode = isSmallScreen ? 'auto' : 'manual';
    this.mode = startMode;
    GameSettings.cameraMode = startMode;
    this._mobileAutoResume = isSmallScreen;   // re-engage auto after idle
    this._autoResumeMs = 6000;                // 6s of no touch = resume auto
    this._autoResumeTimer = null;

    // When the user grabs the OrbitControls (pointerdown / wheel / touch),
    // any non-manual mode auto-switches to manual so the user has full
    // control. OrbitControls' 'start' event fires only on user gestures —
    // it does NOT fire from our internal camera writes.
    if (controls && !this._userInputBound) {
      controls.addEventListener('start', () => {
        // Cutscenes lock the camera — never yield mid-cutscene.
        if (this._cutsceneLock) return;
        if (this.mode !== 'manual') {
          if (typeof setCameraView === 'function') setCameraView('manual');
          else this.setMode('manual');
        }
        // Cancel any pending auto-resume while the user is actively touching.
        if (this._autoResumeTimer) {
          clearTimeout(this._autoResumeTimer);
          this._autoResumeTimer = null;
        }
      });
      // After the user releases, on mobile schedule a return to auto so the
      // camera resumes following the action — like Catan Universe.
      controls.addEventListener('end', () => {
        if (!this._mobileAutoResume) return;
        if (this._cutsceneLock) return;
        if (this._autoResumeTimer) clearTimeout(this._autoResumeTimer);
        this._autoResumeTimer = setTimeout(() => {
          this._autoResumeTimer = null;
          if (this._cutsceneLock) return;
          if (this.mode === 'manual') {
            if (typeof setCameraView === 'function') setCameraView('auto');
            else this.setMode('auto');
          }
        }, this._autoResumeMs);
      });
      this._userInputBound = true;
    }
  },

  // Set which player is active (called from game-core)
  setActivePlayer(playerIdx) {
    this._activePlayerIdx = playerIdx;
    // In auto mode, immediately re-aim so the camera glides to the new player
    // section between turns instead of waiting for the next render frame.
    if (this.mode === 'auto' && this._followMode == null) {
      this._computeAutoTarget();
    }
  },

  // Follow a specific peg during its move
  followPeg(pegId) {
    if (this.mode === 'manual') return;
    this._followPegId = pegId;
    this._followMode = 'peg';
    this._damping = 0.10; // tight follow — peg must never leave viewport
  },

  // Pan out to frame both pegs during a split
  followSplit(pegId1, pegId2) {
    if (this.mode === 'manual') return;
    this._followMode = 'split';
    this._splitPegIds = [pegId1, pegId2];
    this._damping = 0.035;
  },

  // Cut scene camera: first follow victim, then cut to victor
  followCutVictim(victimPegId, victorPegId, onVictimDone) {
    if (this.mode === 'manual') return;
    this._followMode = 'cut-victim';
    this._followPegId = victimPegId;
    this._cutsceneLock = true;
    this._damping = 0.06; // tighter follow on victim
    // After 1.5s, switch to victor
    setTimeout(() => {
      this._followMode = 'cut-victor';
      this._followPegId = victorPegId;
      this._damping = 0.05;
      if (onVictimDone) onVictimDone();
    }, 1500);
  },

  // Lock camera during cutscenes
  lockForCutscene() { this._cutsceneLock = true; },
  unlockCutscene() {
    this._cutsceneLock = false;
    this._followMode = null;
    this._followPegId = null;
    this._splitPegIds = null;
    this._damping = 0.035;
  },

  // Check if camera has settled near its target (within threshold)
  isSettled(threshold) {
    const t = threshold || 5;
    if (!this._pos || !this._tPos) return true;
    return this._pos.distanceTo(this._tPos) < t && this._look.distanceTo(this._tLook) < t;
  },

  // Wait for camera to settle, then call callback
  whenSettled(callback) {
    if (typeof callback !== 'function') return;
    if (this.mode === 'manual' || this.isSettled()) {
      callback();
      return;
    }
    // Queue, never overwrite. A single slot let a later registration clobber an
    // earlier one — e.g. a deferred peg animation overwriting the turn-enable
    // startBlink — which stranded the next turn and froze the game.
    if (!Array.isArray(this._settledCallbacks)) this._settledCallbacks = [];
    this._settledCallbacks.push(callback);
  },

  update(dt) {
    if (!camera) return;

    // Manual mode: OrbitControls owns the camera. Mirror its state into
    // _pos / _look every frame so a later switch to auto/top/angle starts the
    // smooth lerp from exactly where the user left off (no jump).
    if (this.mode === 'manual') {
      this._pos.copy(camera.position);
      this._look.copy(controls.target);
      this._tPos.copy(this._pos);
      this._tLook.copy(this._look);
      return;
    }

    // Choose the target. Cutscene follow modes always win, even when the
    // base mode is 'top'/'angle', so cuts/splits stay continuous.
    if (this._followMode === 'peg' || this._followMode === 'cut-victim' || this._followMode === 'cut-victor') {
      this._computeFollowTarget();
    } else if (this._followMode === 'split') {
      this._computeSplitTarget();
    } else if (this.mode === 'auto') {
      this._computeAutoTarget();
    }
    // 'top' and 'angle' are one-shot poses — _tPos/_tLook are set in setMode
    // and the lerp below carries the camera there smoothly, then holds.

    // Smooth interpolation — never jerky
    const f = 1 - Math.pow(1 - this._damping, (dt || 16) / 16);
    this._pos.lerp(this._tPos, f);
    this._look.lerp(this._tLook, f);

    camera.position.copy(this._pos);
    controls.target.copy(this._look);
    camera.lookAt(this._look);

    // Fire ALL queued settled callbacks (see whenSettled). Snapshot + clear
    // first so a callback that re-registers waits for the NEXT settle.
    if (this._settledCallbacks && this._settledCallbacks.length && this.isSettled()) {
      const cbs = this._settledCallbacks;
      this._settledCallbacks = [];
      for (const cb of cbs) { try { cb(); } catch (e) { console.warn('[CAM] settled cb failed', e); } }
    }
  },

  _computeFollowTarget() {
    const peg = pegRegistry.get(this._followPegId);
    if (!peg || !peg.mesh) { this._computeAutoTarget(); return; }
    const pos = peg.mesh.position;
    // Look at the peg, anchored to table height so framing stays steady as it hops.
    this._tLook.set(pos.x, TABLE_HEIGHT, pos.z);
    // Place camera radially OUTSIDE the peg from board center, so the peg sits
    // between the camera and the board interior — guarantees the peg is always
    // in front of the camera regardless of which side of the board it's on.
    const r = Math.hypot(pos.x, pos.z);
    let ang;
    if (r > 1) {
      ang = Math.atan2(pos.z, pos.x);
    } else {
      // Peg at center (bullseye / new) — keep current camera angle.
      ang = Math.atan2(this._tPos.z || this._pos.z, this._tPos.x || this._pos.x);
      if (!Number.isFinite(ang)) ang = -Math.PI / 2;
    }
    // Distance: enough to keep peg + a margin in frame.
    const isCut = this._followMode === 'cut-victim';
    const camR = Math.max(320, r + (isCut ? 220 : 260));
    const height = isCut ? 220 : 280;
    this._tPos.set(Math.cos(ang) * camR, height, Math.sin(ang) * camR);
  },

  _computeSplitTarget() {
    if (!this._splitPegIds) { this._computeAutoTarget(); return; }
    const p1 = pegRegistry.get(this._splitPegIds[0]);
    const p2 = pegRegistry.get(this._splitPegIds[1]);
    if (!p1?.mesh || !p2?.mesh) { this._computeAutoTarget(); return; }
    const center = p1.mesh.position.clone().add(p2.mesh.position).multiplyScalar(0.5);
    const spread = p1.mesh.position.distanceTo(p2.mesh.position);
    this._tLook.copy(center);
    // Pan outward proportional to spread between pegs
    const height = Math.max(250, 180 + spread * 0.8);
    const dist = Math.max(350, 250 + spread * 0.5);
    this._tPos.set(center.x * 0.2, center.y + height, center.z * 0.2 + dist);
  },

  // Auto target: smoothly frame the active player's section so all of their
  // on-board pegs are visible. Pans out as pegs spread further from center.
  _computeAutoTarget() {
    const positions = [];
    const activeIdx = this._activePlayerIdx;
    let boardPosition = 0;
    let havePlayer = false;

    if (activeIdx >= 0 && window.FastTrackCore) {
      const players = window.FastTrackCore.state.players.get('list') || [];
      const player = players[activeIdx];
      if (player) {
        havePlayer = true;
        boardPosition = player.boardPosition || 0;
        for (const peg of player.pegs) {
          if (peg.holeId === 'holding') continue;
          const regPeg = pegRegistry.get(peg.id);
          if (regPeg && regPeg.mesh && regPeg.mesh.visible) {
            positions.push(regPeg.mesh.position.clone());
          }
        }
      }
    }

    // Fallback: include all visible pegs so the camera never drifts to nothing.
    if (positions.length === 0) {
      pegRegistry.forEach(peg => {
        if (peg.mesh && peg.mesh.visible) positions.push(peg.mesh.position.clone());
      });
    }

    // Compute spread relative to board center (table origin).
    let maxR = 200;
    let cx = 0, cz = 0;
    if (positions.length) {
      for (const p of positions) {
        cx += p.x; cz += p.z;
        const d = Math.hypot(p.x, p.z);
        if (d > maxR) maxR = d;
      }
      cx /= positions.length;
      cz /= positions.length;
    }

    // The look target sits a bit forward of the board origin, biased toward the
    // active player's section so the player feels "behind" their own pegs.
    const sectionAng = (boardPosition / 6) * Math.PI * 2 - Math.PI / 6;
    const lookBias = havePlayer ? 80 : 0;
    this._tLook.set(
      cx * 0.35 + Math.cos(sectionAng) * lookBias,
      TABLE_HEIGHT,
      cz * 0.35 + Math.sin(sectionAng) * lookBias
    );

    // Camera sits radially behind the player section, far enough to keep every
    // on-board peg in frame. Pulls out smoothly when pegs are spread.
    const camR = Math.max(440, maxR + 280);
    const height = Math.max(300, 230 + maxR * 0.4);
    this._tPos.set(
      Math.cos(sectionAng) * camR,
      height,
      Math.sin(sectionAng) * camR
    );
    // Auto mode wants relaxed damping so the pan never feels jerky.
    if (this._followMode == null) this._damping = 0.04;
  },

  setMode(mode) {
    // Sync our internal state with whatever the user / OrbitControls left the
    // camera at, so the lerp into the new mode starts smoothly from there.
    if (camera && controls) {
      this._pos.copy(camera.position);
      this._look.copy(controls.target);
    }
    const prevMode = this.mode;
    this.mode = mode;
    GameSettings.cameraMode = mode;

    const def = this.DEFAULTS[mode];
    if (mode === 'manual') {
      camera.up.set(def.up[0], def.up[1], def.up[2]);
      // If switching INTO manual from another mode, snap targets to where the
      // camera currently is so OrbitControls picks up smoothly. If the user
      // re-presses the Manual button while already in manual, re-snap to the
      // default board-framing pose.
      if (prevMode === 'manual') {
        this._tPos.set(def.pos[0], def.pos[1], def.pos[2]);
        this._tLook.set(def.look[0], def.look[1], def.look[2]);
        // For manual we apply directly (no lerp owner) — OrbitControls reads
        // camera.position / controls.target as ground truth.
        camera.position.copy(this._tPos);
        controls.target.copy(this._tLook);
        this._pos.copy(this._tPos);
        this._look.copy(this._tLook);
      }
      this._damping = 0.035;
    } else if (mode === 'top') {
      camera.up.set(def.up[0], def.up[1], def.up[2]);
      this._tPos.set(def.pos[0], def.pos[1], def.pos[2]);
      this._tLook.set(def.look[0], def.look[1], def.look[2]);
      this._damping = 0.06;
    } else if (mode === 'angle') {
      camera.up.set(def.up[0], def.up[1], def.up[2]);
      this._tPos.set(def.pos[0], def.pos[1], def.pos[2]);
      this._tLook.set(def.look[0], def.look[1], def.look[2]);
      this._damping = 0.06;
    } else if (mode === 'auto') {
      camera.up.set(0, 1, 0);
      this._damping = 0.04;
      // Force-recompute so the first frame already has a target.
      this._computeAutoTarget();
    }
  }
};

// MOBILE STARFIELD (Google Play build only — window.FT_MOBILE === true)
// A starry skydome replaces the speakeasy billiard room. The 3D board is
// untouched; only the surrounding environment changes. Reuses the ceiling's
// colored-star canvas technique ("80s wizard night sky") on an inward-facing
// sphere so stars wrap the board in every direction. Unlit (MeshBasicMaterial)
// so stars stay bright in the void without depending on room lighting.
// ════════════════════════════════════════════════════════════════
function createMobileStarfield() {
  if (typeof THREE === 'undefined' || !scene) return;
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 1024;
  const c = cv.getContext('2d');
  c.fillStyle = '#020108';
  c.fillRect(0, 0, cv.width, cv.height);
  const starColors = ['#00ffff', '#39ff14', '#bf00ff', '#ffee00', '#ffffff'];
  for (let s = 0; s < 1400; s++) {
    const sx = Math.random() * cv.width;
    const sy = Math.random() * cv.height;
    const col = starColors[Math.floor(Math.random() * starColors.length)];
    const r = 0.4 + Math.random() * 1.8;
    c.globalAlpha = 0.3 + Math.random() * 0.7;
    const grad = c.createRadialGradient(sx, sy, 0, sx, sy, r * 4);
    grad.addColorStop(0, col);
    grad.addColorStop(0.3, col);
    grad.addColorStop(1, 'transparent');
    c.fillStyle = grad;
    c.fillRect(sx - r * 4, sy - r * 4, r * 8, r * 8);
    c.globalAlpha = 0.7 + Math.random() * 0.3;
    c.fillStyle = col;
    c.beginPath();
    c.arc(sx, sy, r, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1.0;
  const tex = new THREE.CanvasTexture(cv);
  const geo = new THREE.SphereGeometry(4000, 48, 32);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false });
  const dome = new THREE.Mesh(geo, mat);
  dome.name = 'mobileStarfield';
  scene.add(dome);
}

// ════════════════════════════════════════════════════════════════
// BILLIARD ROOM ENVIRONMENT
// ════════════════════════════════════════════════════════════════
function createBilliardRoom() {
  // ── FLOOR — rich herringbone-style hardwood ──
  const floorGeo = new THREE.PlaneGeometry(ROOM_WIDTH * 1.5, ROOM_DEPTH * 1.5, 1, 1);
  floorGeo.rotateX(-Math.PI / 2);
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 512; floorCanvas.height = 512;
  const fctx = floorCanvas.getContext('2d');
  // Procedural herringbone wood grain
  fctx.fillStyle = '#3a2410';
  fctx.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const shade = 35 + Math.random() * 25;
      fctx.fillStyle = `rgb(${shade + 20}, ${shade + 5}, ${shade - 10})`;
      const x = col * 32, y = row * 32;
      if ((row + col) % 2 === 0) {
        fctx.fillRect(x + 1, y + 1, 30, 14);
        fctx.fillRect(x + 1, y + 17, 30, 14);
      } else {
        fctx.fillRect(x + 1, y + 1, 14, 30);
        fctx.fillRect(x + 17, y + 1, 14, 30);
      }
      // Grain lines
      fctx.strokeStyle = `rgba(0,0,0,0.08)`;
      fctx.lineWidth = 0.5;
      for (let g = 0; g < 3; g++) {
        fctx.beginPath();
        fctx.moveTo(x, y + g * 11 + Math.random() * 5);
        fctx.lineTo(x + 32, y + g * 11 + Math.random() * 5);
        fctx.stroke();
      }
    }
  }
  const floorTex = new THREE.CanvasTexture(floorCanvas);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(6, 5);
  // Normal map for wood plank depth
  const floorNorm = generateNormalMap(floorCanvas, 3.0);
  floorNorm.repeat.copy(floorTex.repeat);
  // Roughness variation map — lighter planks = smoother (worn paths)
  const floorRoughCanvas = document.createElement('canvas');
  floorRoughCanvas.width = 512; floorRoughCanvas.height = 512;
  const frctx = floorRoughCanvas.getContext('2d');
  frctx.fillStyle = '#888';
  frctx.fillRect(0, 0, 512, 512);
  for (let ry = 0; ry < 512; ry += 2) {
    for (let rx = 0; rx < 512; rx += 2) {
      const v = 100 + Math.random() * 80;
      frctx.fillStyle = `rgb(${v},${v},${v})`;
      frctx.fillRect(rx, ry, 2, 2);
    }
  }
  const floorRoughTex = new THREE.CanvasTexture(floorRoughCanvas);
  floorRoughTex.wrapS = floorRoughTex.wrapT = THREE.RepeatWrapping;
  floorRoughTex.repeat.copy(floorTex.repeat);

  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex, normalMap: floorNorm, normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: floorRoughTex, roughness: 0.45, metalness: 0.05, color: 0x4a3020,
    envMapIntensity: 0.4
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = -1;
  floor.receiveShadow = true;
  scene.add(floor);

  // ── CEILING — black void with procedural starfield ──
  // Stars in cyan, green, purple, yellow, white — 80s wizard night sky.
  const ceilGeo = new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH);
  ceilGeo.rotateX(Math.PI / 2);
  const ceilCanvas = document.createElement('canvas');
  ceilCanvas.width = 1024; ceilCanvas.height = 1024;
  const cctx = ceilCanvas.getContext('2d');
  // Pure black void
  cctx.fillStyle = '#020108';
  cctx.fillRect(0, 0, 1024, 1024);
  // Star colours: cyan, green, purple, yellow, white
  const starColors = ['#00ffff', '#39ff14', '#bf00ff', '#ffee00', '#ffffff'];
  for (let s = 0; s < 380; s++) {
    const sx = Math.random() * 1024;
    const sy = Math.random() * 1024;
    const col = starColors[Math.floor(Math.random() * starColors.length)];
    const r = 0.4 + Math.random() * 1.8;
    cctx.globalAlpha = 0.3 + Math.random() * 0.7;
    // Soft glow halo
    const grad = cctx.createRadialGradient(sx, sy, 0, sx, sy, r * 4);
    grad.addColorStop(0, col);
    grad.addColorStop(0.3, col);
    grad.addColorStop(1, 'transparent');
    cctx.fillStyle = grad;
    cctx.fillRect(sx - r * 4, sy - r * 4, r * 8, r * 8);
    // Bright core
    cctx.globalAlpha = 0.7 + Math.random() * 0.3;
    cctx.fillStyle = col;
    cctx.beginPath();
    cctx.arc(sx, sy, r, 0, Math.PI * 2);
    cctx.fill();
  }
  cctx.globalAlpha = 1.0;
  const ceilTex = new THREE.CanvasTexture(ceilCanvas);
  ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping;
  ceilTex.repeat.set(2, 2);
  const ceilMat = new THREE.MeshStandardMaterial({
    map: ceilTex, color: 0xffffff, roughness: 1.0, metalness: 0.0,
    emissive: new THREE.Color(0xffffff), emissiveMap: ceilTex,
    emissiveIntensity: 0.35  // stars glow softly even in dim light
  });
  const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
  ceiling.position.y = ROOM_HEIGHT;
  scene.add(ceiling);

  // ── STARFIELD FADE DOWN WALLS ──
  // Thin plane strips at the top of each wall — starfield texture fading to transparent.
  // Uses an alphaMap with a vertical white→black gradient for the fade.
  const starFadeH = ROOM_HEIGHT * 0.35;  // stars cover top 35% of walls

  // Procedural alphaMap: vertical gradient (white at top → black at bottom)
  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = 4; alphaCanvas.height = 128;
  const actx = alphaCanvas.getContext('2d');
  const alphaGrad = actx.createLinearGradient(0, 0, 0, 128);
  alphaGrad.addColorStop(0.0, '#ffffff');   // top = fully opaque
  alphaGrad.addColorStop(0.6, '#444444');   // mid = fading
  alphaGrad.addColorStop(1.0, '#000000');   // bottom = fully transparent
  actx.fillStyle = alphaGrad;
  actx.fillRect(0, 0, 4, 128);
  const alphaMap = new THREE.CanvasTexture(alphaCanvas);
  alphaMap.wrapS = alphaMap.wrapT = THREE.ClampToEdgeWrapping;

  const starFadeMat = new THREE.MeshStandardMaterial({
    map: ceilTex, color: 0xffffff, roughness: 1.0, metalness: 0.0,
    emissive: new THREE.Color(0xffffff), emissiveMap: ceilTex,
    emissiveIntensity: 0.25,
    transparent: true, depthWrite: false,
    alphaMap: alphaMap,
    side: THREE.DoubleSide
  });

  const addStarFade = (w, pos, rotY) => {
    const geo = new THREE.PlaneGeometry(w, starFadeH);
    const mesh = new THREE.Mesh(geo, starFadeMat);
    mesh.position.copy(pos);
    mesh.rotation.y = rotY || 0;
    scene.add(mesh);
  };
  const fadeY = ROOM_HEIGHT - starFadeH / 2;
  addStarFade(ROOM_WIDTH, new THREE.Vector3(0, fadeY, -ROOM_DEPTH / 2 + 1), 0);
  addStarFade(ROOM_DEPTH, new THREE.Vector3(-ROOM_WIDTH / 2 + 1, fadeY, 0), Math.PI / 2);
  addStarFade(ROOM_DEPTH, new THREE.Vector3(ROOM_WIDTH / 2 - 1, fadeY, 0), -Math.PI / 2);
  addStarFade(ROOM_WIDTH, new THREE.Vector3(0, fadeY, ROOM_DEPTH / 2 - 1), Math.PI);

  // ── WALLS — rich dark wood panelling with procedural texture ──
  const wallPanelColor = 0x251a0c;

  // Walls are split into two zones:
  //   Lower: wood wainscot paneling (handled by addArtDecoPanelling, 0 → WAINSCOT_H=130)
  //   Upper: brick texture (WAINSCOT_H → ROOM_HEIGHT) — where paintings hang
  // The full-height plane provides the structural wall behind both layers.

  // Dark base wall (behind everything — structural)
  const baseWallMat = new THREE.MeshStandardMaterial({
    color: 0x0e0a06, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide
  });
  const makeBaseWall = (w, pos, rotY) => {
    const geo = new THREE.PlaneGeometry(w, ROOM_HEIGHT);
    const mesh = new THREE.Mesh(geo, baseWallMat);
    mesh.position.copy(pos);
    mesh.rotation.y = rotY || 0;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  makeBaseWall(ROOM_WIDTH, new THREE.Vector3(0, ROOM_HEIGHT / 2, -ROOM_DEPTH / 2), 0);
  makeBaseWall(ROOM_DEPTH, new THREE.Vector3(-ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 0), Math.PI / 2);
  makeBaseWall(ROOM_DEPTH, new THREE.Vector3(ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 0), -Math.PI / 2);
  makeBaseWall(ROOM_WIDTH, new THREE.Vector3(0, ROOM_HEIGHT / 2, ROOM_DEPTH / 2), Math.PI);

  // Brick texture — tiled on the upper portion (above the wainscot)
  // Walls are created inside the loader callback so the cloned textures
  // inherit a valid Image (a clone made before load finishes never gets
  // re-flagged with needsUpdate when the source image arrives).
  const WAINSCOT_TOP = 130;  // must match WAINSCOT_H below
  const brickH = ROOM_HEIGHT - WAINSCOT_TOP;
  const brickUrl = 'assets/images/art/' + encodeURIComponent('Brick texture.webp');
  new THREE.TextureLoader().load(brickUrl, (brickTex) => {
    brickTex.wrapS = brickTex.wrapT = THREE.RepeatWrapping;
    brickTex.colorSpace = THREE.SRGBColorSpace;

    const makeBrickWall = (w, pos, rotY) => {
      const geo = new THREE.PlaneGeometry(w, brickH);
      const tilesX = Math.max(1, Math.round(w / 220));
      const tilesY = Math.max(1, Math.round(brickH / 220));
      const tex = brickTex.clone();
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(tilesX, tilesY);
      tex.needsUpdate = true;
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        color: 0xb8957a, roughness: 0.82, metalness: 0.02, side: THREE.DoubleSide,
        envMapIntensity: 0.15
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos.x, WAINSCOT_TOP + brickH / 2, pos.z);
      mesh.rotation.y = rotY || 0;
      mesh.receiveShadow = true;
      scene.add(mesh);
    };
    // Offset 1 unit inward so brick sits in front of base wall (no z-fighting)
    makeBrickWall(ROOM_WIDTH, new THREE.Vector3(0, 0, -ROOM_DEPTH / 2 + 1), 0);
    makeBrickWall(ROOM_DEPTH, new THREE.Vector3(-ROOM_WIDTH / 2 + 1, 0, 0), Math.PI / 2);
    makeBrickWall(ROOM_DEPTH, new THREE.Vector3(ROOM_WIDTH / 2 - 1, 0, 0), -Math.PI / 2);
    makeBrickWall(ROOM_WIDTH, new THREE.Vector3(0, 0, ROOM_DEPTH / 2 - 1), Math.PI);
    console.log('🧱 Brick walls loaded');
  }, undefined, (err) => {
    console.warn('🧱 Brick texture failed to load:', brickUrl, err);
  });

  // ── ART DECO WALL PANELLING — 1920s speakeasy style ──
  // Walnut wainscot plank texture (quarter-sawn grain, warm amber)
  const adWoodCanvas = document.createElement('canvas');
  adWoodCanvas.width = 256; adWoodCanvas.height = 512;
  const adwctx = adWoodCanvas.getContext('2d');
  adwctx.fillStyle = '#2e1600';
  adwctx.fillRect(0, 0, 256, 512);
  for (let gx = 0; gx < 256; gx++) {
    const wave = Math.sin(gx * 0.08) * 6 + Math.sin(gx * 0.23) * 3;
    const lum = 18 + (gx % 40 < 2 ? -8 : 0);  // subtle plank seams
    adwctx.fillStyle = `rgb(${lum + 28},${lum + 10},${lum - 8})`;
    adwctx.fillRect(gx, 0, 1, 512);
    if (gx % 3 === 0) {
      adwctx.fillStyle = `rgba(200,140,40,0.05)`;
      adwctx.fillRect(gx, Math.floor(wave * 8 + 256), 1, 2);
    }
  }
  const adWoodTex = new THREE.CanvasTexture(adWoodCanvas);
  adWoodTex.wrapS = adWoodTex.wrapT = THREE.RepeatWrapping;
  adWoodTex.repeat.set(8, 1);

  // ── ROOM ORNAMENT SUBSTRATE — (x → y → z) recursion ──
  // x = ornament SEED (walls, wainscot height, pilaster spacing, cap step count)
  // y = lens bloomRoomOrnaments(seed): bakes per-element world transforms,
  //     concatenates by material family, returns 4 merged geometries
  // z = the now: 4 meshes added to the scene this tick (was ~120 individual meshes).
  // Identity recursion: the ornament z is fully derived from the seed every init;
  // nothing about the room is stored as an independent z anywhere else.
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xB8860B, roughness: 0.12, metalness: 0.92, envMapIntensity: 1.2 });
  const moldingMat = new THREE.MeshStandardMaterial({ color: 0x2a1c0e, roughness: 0.35, metalness: 0.12, envMapIntensity: 0.5 });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a0f05, roughness: 0.4, metalness: 0.1, envMapIntensity: 0.4 });
  const woodMat = new THREE.MeshStandardMaterial({ map: adWoodTex, color: 0x3a1a00, roughness: 0.38, metalness: 0.10 });
  const WAINSCOT_H = 130;

  const ornamentSeed = {
    walls: [
      { w: ROOM_WIDTH, pos: new THREE.Vector3(0, 0, -ROOM_DEPTH / 2 + 2), rotY: 0, moldOff: new THREE.Vector3(0, 0, 2) },
      { w: ROOM_DEPTH, pos: new THREE.Vector3(-ROOM_WIDTH / 2 + 2, 0, 0), rotY: Math.PI / 2, moldOff: new THREE.Vector3(2, 0, 0) },
      { w: ROOM_DEPTH, pos: new THREE.Vector3(ROOM_WIDTH / 2 - 2, 0, 0), rotY: -Math.PI / 2, moldOff: new THREE.Vector3(-2, 0, 0) },
      { w: ROOM_WIDTH, pos: new THREE.Vector3(0, 0, ROOM_DEPTH / 2 - 2), rotY: Math.PI, moldOff: new THREE.Vector3(0, 0, -2) },
    ],
    wainscotH: WAINSCOT_H,
    pilasterSpacing: 160,
    capSteps: 3,
  };

  const _bake = (geo, pos, quat) => {
    const m = new THREE.Matrix4().compose(pos, quat || new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(m);
    return geo;
  };
  const _merge = (geos) => {
    if (THREE.BufferGeometryUtils && typeof THREE.BufferGeometryUtils.mergeBufferGeometries === 'function') {
      return THREE.BufferGeometryUtils.mergeBufferGeometries(geos, false);
    }
    console.warn('[ft-3d] BufferGeometryUtils missing — ornament z falling back to first geometry only');
    return geos[0];
  };

  const bloomRoomOrnaments = (seed) => {
    const brass = [], wood = [], molding = [], baseboard = [];
    const yQuat = (rotY) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY || 0);

    for (const wall of seed.walls) {
      const q = yQuat(wall.rotY);

      wood.push(_bake(
        new THREE.PlaneGeometry(wall.w - 10, seed.wainscotH),
        new THREE.Vector3(wall.pos.x, seed.wainscotH / 2, wall.pos.z), q
      ));
      brass.push(_bake(
        new THREE.BoxGeometry(wall.w, 5, 5),
        new THREE.Vector3(wall.pos.x, seed.wainscotH, wall.pos.z), q
      ));
      brass.push(_bake(
        new THREE.BoxGeometry(wall.w, 8, 4),
        new THREE.Vector3(wall.pos.x, 4, wall.pos.z), q
      ));

      const stripCount = Math.floor(wall.w / seed.pilasterSpacing);
      for (let si = 0; si < stripCount; si++) {
        const sx = -wall.w / 2 + (si + 1) * (wall.w / (stripCount + 1));
        const stripV = new THREE.Vector3(sx, seed.wainscotH / 2, 0).applyQuaternion(q);
        brass.push(_bake(
          new THREE.BoxGeometry(4, seed.wainscotH, 4),
          new THREE.Vector3(wall.pos.x + stripV.x, stripV.y, wall.pos.z + stripV.z), q
        ));
        for (let step = 0; step < seed.capSteps; step++) {
          const sw = 6 - step * 1.5;
          const sh = 4 - step;
          const sy = seed.wainscotH + step * sh;
          const capV = new THREE.Vector3(sx, sy + sh / 2, 0).applyQuaternion(q);
          brass.push(_bake(
            new THREE.BoxGeometry(sw, sh, sw),
            new THREE.Vector3(wall.pos.x + capV.x, capV.y, wall.pos.z + capV.z), q
          ));
        }
      }

      molding.push(_bake(
        new THREE.BoxGeometry(wall.w, 8, 8),
        new THREE.Vector3(wall.pos.x + wall.moldOff.x, ROOM_HEIGHT - 4, wall.pos.z + wall.moldOff.z), q
      ));
      baseboard.push(_bake(
        new THREE.BoxGeometry(wall.w, 10, 4),
        new THREE.Vector3(wall.pos.x, 5, wall.pos.z), q
      ));
    }

    return {
      brass: new THREE.Mesh(_merge(brass), brassMat),
      wood: new THREE.Mesh(_merge(wood), woodMat),
      molding: new THREE.Mesh(_merge(molding), moldingMat),
      baseboard: new THREE.Mesh(_merge(baseboard), baseMat),
    };
  };

  const _orn = bloomRoomOrnaments(ornamentSeed);
  _orn.brass.name = 'orn:brass';
  _orn.wood.name = 'orn:wood';
  _orn.molding.name = 'orn:molding';
  _orn.baseboard.name = 'orn:baseboard';
  scene.add(_orn.brass, _orn.wood, _orn.molding, _orn.baseboard);

  // ── ART DECO WALL SCONCES — 1930s speakeasy brass torchières ──
  // Each sconce: brass backplate + fan-shaped frosted glass shade + warm PointLight
  {
    const sconceBrass = new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.18, metalness: 0.88 });
    const sconceGlass = new THREE.MeshStandardMaterial({
      color: 0xfff8e0, roughness: 0.30, metalness: 0.0,
      transparent: true, opacity: 0.55,
      emissive: new THREE.Color(0xffcc77), emissiveIntensity: 0.6,
      side: THREE.DoubleSide
    });

    const addSconce = (pos, rotY) => {
      const g = new THREE.Group();

      // Diamond-shaped brass backplate
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0, 10, 24, 4), sconceBrass);
      plate.rotation.z = Math.PI;  // point-up diamond
      plate.position.set(0, 0, 0);
      g.add(plate);

      // Vertical brass arm
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 22, 6), sconceBrass);
      arm.position.set(0, -8, 4);
      g.add(arm);

      // Fan-shaped frosted glass shade (half-cylinder, open top)
      const shade = new THREE.Mesh(
        new THREE.CylinderGeometry(14, 8, 22, 12, 1, true, 0, Math.PI),
        sconceGlass
      );
      shade.rotation.y = Math.PI / 2;
      shade.position.set(0, 0, 8);
      g.add(shade);

      // Brass rim at shade top
      const rim = new THREE.Mesh(new THREE.TorusGeometry(11, 1.2, 6, 24, Math.PI), sconceBrass);
      rim.rotation.y = Math.PI / 2;
      rim.position.set(0, 11, 8);
      g.add(rim);

      // Warm point light
      const sLight = new THREE.PointLight(0xffe8c0, 18, 200, 2);
      sLight.position.set(0, 0, 14);
      sLight._baseIntensity = 18;
      g.add(sLight);

      g.position.copy(pos);
      g.rotation.y = rotY || 0;
      scene.add(g);
    };

    const sY = 260;  // sconce height — between painting tops and crown molding
    // Back wall — two sconces flanking center (between the two paintings)
    addSconce(new THREE.Vector3(0, sY, -ROOM_DEPTH / 2 + 6), 0);
    // Left wall — center sconce between paintings
    addSconce(new THREE.Vector3(-ROOM_WIDTH / 2 + 6, sY, -50), Math.PI / 2);
    // Right wall — center sconce
    addSconce(new THREE.Vector3(ROOM_WIDTH / 2 - 6, sY, 50), -Math.PI / 2);
    // Front wall — center sconce
    addSconce(new THREE.Vector3(0, sY, ROOM_DEPTH / 2 - 6), Math.PI);
    // Additional sconces near corners for fuller illumination
    addSconce(new THREE.Vector3(-350, sY, -ROOM_DEPTH / 2 + 6), 0);
    addSconce(new THREE.Vector3(350, sY, -ROOM_DEPTH / 2 + 6), 0);
    addSconce(new THREE.Vector3(-ROOM_WIDTH / 2 + 6, sY, 250), Math.PI / 2);
    addSconce(new THREE.Vector3(ROOM_WIDTH / 2 - 6, sY, -250), -Math.PI / 2);
  }

  // ── NEON SIGN — left wall, between the two paintings ───────────
  // 1920s speakeasy style: "FAST TRACK" in glowing neon tubes
  {
    const nW = 110, nH = 80;  // sized to fit the ~124 unit gap between paintings
    const nCanvas = document.createElement('canvas');
    nCanvas.width = 512; nCanvas.height = 256;
    const nx = nCanvas.getContext('2d');

    // Black backing board
    nx.fillStyle = '#050210';
    nx.fillRect(0, 0, 512, 256);

    // Helper: draw glowing neon text
    const neonText = (txt, x, y, size, color, glow) => {
      nx.save();
      nx.font = `bold ${size}px "Arial Black", Impact, sans-serif`;
      nx.textAlign = 'center'; nx.textBaseline = 'middle';
      // Outer glow
      nx.shadowColor = glow || color;
      nx.shadowBlur = 28;
      nx.fillStyle = color;
      nx.fillText(txt, x, y);
      // Inner glow pass
      nx.shadowBlur = 12;
      nx.fillText(txt, x, y);
      // Bright core
      nx.shadowBlur = 4;
      nx.fillStyle = '#ffffff';
      nx.globalAlpha = 0.5;
      nx.fillText(txt, x, y);
      nx.restore();
    };

    // ── "FAST" in cyan ──
    neonText('FAST', 256, 80, 45, '#00ffff', '#00aaff');
    // ── "TRACK" in green ──
    neonText('TRACK', 256, 160, 45, '#39ff14', '#22cc00');

    // Decorative neon lines (top and bottom borders)
    nx.save();
    nx.strokeStyle = '#bf00ff'; nx.lineWidth = 3;
    nx.shadowColor = '#bf00ff'; nx.shadowBlur = 16;
    // Top double line
    nx.beginPath(); nx.moveTo(40, 24); nx.lineTo(472, 24); nx.stroke();
    nx.beginPath(); nx.moveTo(60, 34); nx.lineTo(452, 34); nx.stroke();
    // Bottom double line
    nx.beginPath(); nx.moveTo(40, 232); nx.lineTo(472, 232); nx.stroke();
    nx.beginPath(); nx.moveTo(60, 222); nx.lineTo(452, 222); nx.stroke();
    nx.restore();

    // Corner diamonds in yellow
    nx.save();
    nx.fillStyle = '#ffee00'; nx.shadowColor = '#ffee00'; nx.shadowBlur = 14;
    [[36, 29], [476, 29], [36, 227], [476, 227]].forEach(([dx, dy]) => {
      nx.save(); nx.translate(dx, dy); nx.rotate(Math.PI / 4);
      nx.fillRect(-6, -6, 12, 12);
      nx.restore();
    });
    nx.restore();

    // Small star accents in white
    nx.save();
    nx.fillStyle = '#ffffff'; nx.shadowColor = '#ffffff'; nx.shadowBlur = 10;
    [[100, 120], [412, 120], [70, 80], [442, 160]].forEach(([sx, sy]) => {
      nx.beginPath();
      for (let p = 0; p < 5; p++) {
        const a = (p * 4 * Math.PI / 5) - Math.PI / 2;
        const r = p % 2 === 0 ? 8 : 3;
        nx[p === 0 ? 'moveTo' : 'lineTo'](sx + Math.cos(a) * r, sy + Math.sin(a) * r);
      }
      nx.closePath(); nx.fill();
    });
    nx.restore();

    const nTex = new THREE.CanvasTexture(nCanvas);
    const nMat = new THREE.MeshStandardMaterial({
      map: nTex, color: 0xffffff, roughness: 1.0, metalness: 0.0,
      emissive: new THREE.Color(0xffffff), emissiveMap: nTex,
      emissiveIntensity: 1.2,
      side: THREE.DoubleSide
    });

    // Backing board (dark, slightly protruding from wall)
    const backMat = new THREE.MeshStandardMaterial({ color: 0x0a0618, roughness: 0.5, metalness: 0.3 });
    const backBoard = new THREE.Mesh(new THREE.BoxGeometry(nW + 12, nH + 12, 4), backMat);

    // Neon face
    const nFace = new THREE.Mesh(new THREE.PlaneGeometry(nW, nH), nMat);
    nFace.position.z = 2.5;

    const nGroup = new THREE.Group();
    nGroup.add(backBoard);
    nGroup.add(nFace);

    // Glow lights — cyan and green wash
    const nGlow1 = new THREE.PointLight(0x00ffff, 12, 180, 2);
    nGlow1.position.set(0, 20, 30);
    nGlow1._baseIntensity = 12;
    nGroup.add(nGlow1);
    const nGlow2 = new THREE.PointLight(0x39ff14, 10, 160, 2);
    nGlow2.position.set(0, -20, 25);
    nGlow2._baseIntensity = 10;
    nGroup.add(nGlow2);

    // Left wall, centered between the two paintings (z = -50), above center
    nGroup.position.set(-ROOM_WIDTH / 2 + 5, 300, -50);
    nGroup.rotation.y = Math.PI / 2;
    scene.add(nGroup);
  }

  // ── DARTBOARD — right wall, between the two paintings ──────────
  {
    const dbR = 60;  // board radius
    const dbCanvas = document.createElement('canvas');
    dbCanvas.width = 512; dbCanvas.height = 512;
    const dc = dbCanvas.getContext('2d');
    const cx = 256, cy = 256;

    // Standard dartboard colours
    const DB_BLACK = '#1a1a1a', DB_CREAM = '#f5e6c8';
    const DB_RED = '#cc2222', DB_GREEN = '#1a7a3a';

    // Background black circle
    dc.fillStyle = DB_BLACK;
    dc.beginPath(); dc.arc(cx, cy, 250, 0, Math.PI * 2); dc.fill();

    // 20 segments — standard dartboard order
    const order = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
    const segAngle = Math.PI * 2 / 20;
    const drawRing = (rOut, rIn, dark1, dark2) => {
      for (let s = 0; s < 20; s++) {
        const a0 = s * segAngle - Math.PI / 2 - segAngle / 2;
        const a1 = a0 + segAngle;
        dc.fillStyle = (s % 2 === 0) ? dark1 : dark2;
        dc.beginPath();
        dc.arc(cx, cy, rOut, a0, a1); dc.arc(cx, cy, rIn, a1, a0, true);
        dc.closePath(); dc.fill();
      }
    };

    // Outer doubles ring
    drawRing(240, 220, DB_RED, DB_GREEN);
    // Outer singles
    drawRing(220, 160, DB_BLACK, DB_CREAM);
    // Trebles ring
    drawRing(160, 145, DB_RED, DB_GREEN);
    // Inner singles
    drawRing(145, 50, DB_BLACK, DB_CREAM);
    // Outer bull (green)
    dc.fillStyle = DB_GREEN;
    dc.beginPath(); dc.arc(cx, cy, 50, 0, Math.PI * 2); dc.fill();
    // Inner bull (red)
    dc.fillStyle = DB_RED;
    dc.beginPath(); dc.arc(cx, cy, 20, 0, Math.PI * 2); dc.fill();

    // Wire frame circles
    dc.strokeStyle = '#888888'; dc.lineWidth = 1.5;
    [240, 220, 160, 145, 50, 20].forEach(r => {
      dc.beginPath(); dc.arc(cx, cy, r, 0, Math.PI * 2); dc.stroke();
    });
    // Wire segment lines
    for (let s = 0; s < 20; s++) {
      const a = s * segAngle - Math.PI / 2 - segAngle / 2;
      dc.beginPath();
      dc.moveTo(cx + Math.cos(a) * 50, cy + Math.sin(a) * 50);
      dc.lineTo(cx + Math.cos(a) * 240, cy + Math.sin(a) * 240);
      dc.stroke();
    }

    // Number ring (outside the doubles)
    dc.font = 'bold 14px Arial'; dc.textAlign = 'center'; dc.textBaseline = 'middle';
    dc.fillStyle = '#ffffff';
    for (let s = 0; s < 20; s++) {
      const a = s * segAngle - Math.PI / 2;
      const nr = 248;
      dc.fillText(String(order[s]), cx + Math.cos(a) * nr, cy + Math.sin(a) * nr);
    }

    const dbTex = new THREE.CanvasTexture(dbCanvas);
    const dbMat = new THREE.MeshStandardMaterial({
      map: dbTex, roughness: 0.85, metalness: 0.0
    });

    const dbGroup = new THREE.Group();

    // Board disc
    const boardMesh = new THREE.Mesh(new THREE.CylinderGeometry(dbR, dbR, 4, 32), dbMat);
    boardMesh.rotation.x = Math.PI / 2;  // face the plane outward
    boardMesh.rotation.z = Math.PI;       // correct number orientation
    dbGroup.add(boardMesh);

    // Dark surround ring (sisal catchment)
    const surroundMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95, metalness: 0.0 });
    const surround = new THREE.Mesh(new THREE.TorusGeometry(dbR + 6, 8, 8, 32), surroundMat);
    dbGroup.add(surround);

    // Brass mounting bracket at top
    const bracketMat = new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.2, metalness: 0.8 });
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 4), bracketMat);
    bracket.position.set(0, dbR + 10, 0);
    dbGroup.add(bracket);

    // ── DARTS — 3 darts stuck in the board ──
    const dartMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3, metalness: 0.6 });
    const flightColors = [0xff2222, 0x2288ff, 0x22cc44];
    const dartPositions = [
      { x: 12, y: 8, rz: 0.05, rx: -0.08 },   // treble 20 area
      { x: -18, y: -5, rz: -0.06, rx: 0.04 },  // inner single
      { x: 5, y: -22, rz: 0.03, rx: 0.07 },     // outer single
    ];
    dartPositions.forEach((dp, i) => {
      const dart = new THREE.Group();
      // Barrel (metal cylinder)
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.5, 24, 6), dartMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 14;
      dart.add(barrel);
      // Point (sharp cone)
      const point = new THREE.Mesh(new THREE.ConeGeometry(1, 10, 6), dartMat);
      point.rotation.x = -Math.PI / 2;
      point.position.z = 0;
      dart.add(point);
      // Flight (tail fin — two crossed planes)
      const flightMat = new THREE.MeshStandardMaterial({
        color: flightColors[i], roughness: 0.7, metalness: 0.0, side: THREE.DoubleSide
      });
      const fin1 = new THREE.Mesh(new THREE.PlaneGeometry(8, 12), flightMat);
      fin1.position.z = 28;
      dart.add(fin1);
      const fin2 = new THREE.Mesh(new THREE.PlaneGeometry(8, 12), flightMat);
      fin2.position.z = 28;
      fin2.rotation.z = Math.PI / 2;
      dart.add(fin2);

      dart.position.set(dp.x, dp.y, 4);
      dart.rotation.z = dp.rz;
      dart.rotation.x = dp.rx;
      dbGroup.add(dart);
    });

    // Left wall, beyond painting 2 toward the front of the room (z = 360)
    dbGroup.position.set(-ROOM_WIDTH / 2 + 8, 260, 360);
    dbGroup.rotation.y = Math.PI / 2;  // face +X into the room
    scene.add(dbGroup);
  }

  // ── NEON SIGN IMAGE — right wall, between the two paintings ────
  {
    const neonImgLoader = new THREE.TextureLoader();
    const neonImgTex = neonImgLoader.load('assets/images/art/fastTrack_neon.webp');
    neonImgTex.colorSpace = THREE.SRGBColorSpace;

    // Sign dimensions — fits the ~300 unit gap comfortably
    const nsW = 200, nsH = 160;

    // Dark backing board
    const nsBacking = new THREE.Mesh(
      new THREE.BoxGeometry(nsW + 14, nsH + 14, 4),
      new THREE.MeshStandardMaterial({ color: 0x060210, roughness: 0.5, metalness: 0.25 })
    );

    // Neon sign face — emissive so it glows
    const nsFace = new THREE.Mesh(
      new THREE.PlaneGeometry(nsW, nsH),
      new THREE.MeshStandardMaterial({
        map: neonImgTex, color: 0xffffff,
        roughness: 1.0, metalness: 0.0,
        emissive: new THREE.Color(0xffffff),
        emissiveMap: neonImgTex,
        emissiveIntensity: 1.4,
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    nsFace.position.z = 2.5;

    const nsGroup = new THREE.Group();
    nsGroup.add(nsBacking);
    nsGroup.add(nsFace);

    // Neon glow wash on surrounding brick
    const nsGlow = new THREE.PointLight(0x00ffcc, 14, 200, 2);
    nsGlow.position.set(0, 0, 30);
    nsGlow._baseIntensity = 14;
    nsGroup.add(nsGlow);

    // Right wall, centered in the gap between paintings (z = 30)
    nsGroup.position.set(ROOM_WIDTH / 2 - 5, 270, 30);
    nsGroup.rotation.y = -Math.PI / 2;  // face -X into the room
    scene.add(nsGroup);
  }

  // ── FRAMED ART — real paintings with thin redwood picture frames ──
  const frameBorder = 10;  // frame width around the image
  const frameThick = 3;    // how far frame sticks out from wall

  // Redwood material — rich reddish-brown wood
  const redwoodMat = new THREE.MeshStandardMaterial({
    color: 0x6B1C0A, roughness: 0.3, metalness: 0.12,
    emissive: new THREE.Color(0x1a0500), emissiveIntensity: 0.1,
    envMapIntensity: 0.6
  });
  // Inner edge — slightly lighter for depth illusion
  const redwoodInnerMat = new THREE.MeshStandardMaterial({
    color: 0x8B3A1A, roughness: 0.4, metalness: 0.08, envMapIntensity: 0.4
  });

  ART_PLACEHOLDERS.forEach(art => {
    const hw = art.width / 2, hh = art.height / 2;
    const artGroup = new THREE.Group();

    // Frame border — 4 thin box pieces (top, bottom, left, right)
    const topBot = new THREE.BoxGeometry(art.width + frameBorder * 2, frameBorder, frameThick);
    const leftRight = new THREE.BoxGeometry(frameBorder, art.height, frameThick);

    const top = new THREE.Mesh(topBot, redwoodMat);
    top.position.set(0, hh + frameBorder / 2, 0);
    const bot = new THREE.Mesh(topBot, redwoodMat);
    bot.position.set(0, -hh - frameBorder / 2, 0);
    const left = new THREE.Mesh(leftRight, redwoodMat);
    left.position.set(-hw - frameBorder / 2, 0, 0);
    const right = new THREE.Mesh(leftRight, redwoodMat);
    right.position.set(hw + frameBorder / 2, 0, 0);

    artGroup.add(top, bot, left, right);

    // Inner lip — thin strip at the inner edge of the frame
    const lipW = 3;
    const lipTopBot = new THREE.BoxGeometry(art.width + lipW, lipW, frameThick + 0.5);
    const lipLR = new THREE.BoxGeometry(lipW, art.height + lipW, frameThick + 0.5);

    const lt = new THREE.Mesh(lipTopBot, redwoodInnerMat);
    lt.position.set(0, hh - lipW / 2, 0.25);
    const lb = new THREE.Mesh(lipTopBot, redwoodInnerMat);
    lb.position.set(0, -hh + lipW / 2, 0.25);
    const ll = new THREE.Mesh(lipLR, redwoodInnerMat);
    ll.position.set(-hw + lipW / 2, 0, 0.25);
    const lr = new THREE.Mesh(lipLR, redwoodInnerMat);
    lr.position.set(hw - lipW / 2, 0, 0.25);

    artGroup.add(lt, lb, ll, lr);

    // Image canvas — MeshStandardMaterial with emissive boost so paintings
    // punch through the ACES tone mapping with vivid, saturated colors.
    const canvasGeo = new THREE.PlaneGeometry(art.width, art.height);
    const canvasMat = new THREE.MeshStandardMaterial({
      color: 0x2a1a0e, roughness: 0.85, metalness: 0.0,
      envMapIntensity: 0.0  // no reflections on canvas
    });
    const canvasMesh = new THREE.Mesh(canvasGeo, canvasMat);
    canvasMesh.position.z = frameThick / 2 + 0.1; // just in front of the frame
    canvasMesh.userData.artInfo = art;             // store metadata for click overlay
    artClickMeshes.push(canvasMesh);
    artGroup.add(canvasMesh);

    // Materialise texture from manifold-ingested pixel data (ft:art)
    const tex = materialiseArtTexture(art.file);
    if (tex) {
      canvasMat.map = tex;
      canvasMat.color.set(0xffffff);
      canvasMat.emissive = new THREE.Color(0xffffff);
      canvasMat.emissiveMap = tex;
      canvasMat.emissiveIntensity = 0.35;
      canvasMat.needsUpdate = true;
      console.log('🖼️ Materialised from manifold:', art.file);
    } else {
      console.warn('🖼️ Art not on manifold:', art.file);
    }

    // Place flush against wall (offset by half frame thickness)
    const wallOffset = frameThick / 2 + 1;
    if (art.wall === 'back') {
      artGroup.position.set(art.x, art.y, -ROOM_DEPTH / 2 + wallOffset);
    } else if (art.wall === 'left') {
      artGroup.position.set(-ROOM_WIDTH / 2 + wallOffset, art.y, art.x);
      artGroup.rotation.y = Math.PI / 2;
    } else if (art.wall === 'right') {
      artGroup.position.set(ROOM_WIDTH / 2 - wallOffset, art.y, art.x);
      artGroup.rotation.y = -Math.PI / 2;
    } else if (art.wall === 'front') {
      artGroup.position.set(art.x, art.y, ROOM_DEPTH / 2 - wallOffset);
      artGroup.rotation.y = Math.PI;
    }
    scene.add(artGroup);
  });

  // ── WALL SCONCES — warm accent lights ──
  const sconceMat = new THREE.MeshStandardMaterial({ color: 0x8B7535, roughness: 0.3, metalness: 0.8 });
  const sconcePositions = [
    { x: -400, z: -ROOM_DEPTH / 2 + 5, ry: 0 },
    { x: 400, z: -ROOM_DEPTH / 2 + 5, ry: 0 },
    { x: -ROOM_WIDTH / 2 + 5, z: -200, ry: Math.PI / 2 },
    { x: -ROOM_WIDTH / 2 + 5, z: 200, ry: Math.PI / 2 },
    { x: ROOM_WIDTH / 2 - 5, z: -200, ry: -Math.PI / 2 },
    { x: ROOM_WIDTH / 2 - 5, z: 200, ry: -Math.PI / 2 },
    { x: -400, z: ROOM_DEPTH / 2 - 5, ry: Math.PI },
    { x: 400, z: ROOM_DEPTH / 2 - 5, ry: Math.PI },
  ];
  sconcePositions.forEach(sp => {
    // Bracket
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(10, 18, 8), sconceMat);
    bracket.position.set(sp.x, 180, sp.z);
    bracket.rotation.y = sp.ry;
    scene.add(bracket);
    // Shade — ornate wall sconce shade
    const shadeGeo = new THREE.CylinderGeometry(6, 10, 14, 8, 1, true);
    const shadeMat = new THREE.MeshStandardMaterial({
      color: 0xffeedd, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide,
      emissive: new THREE.Color(0xffcc88), emissiveIntensity: 0.15, transparent: true, opacity: 0.6
    });
    const shade = new THREE.Mesh(shadeGeo, shadeMat);
    shade.position.set(sp.x, 192, sp.z);
    shade.rotation.y = sp.ry;
    scene.add(shade);
    // Warm glow light
    const sconceLight = new THREE.PointLight(0xffcc88, 120, 350, 2);
    sconceLight.position.set(sp.x, 190, sp.z);
    scene.add(sconceLight);
  });

  // ── POLISHED WALNUT GRAIN — shared procedural texture for 1920s woodwork ──
  // Quarter-sawn walnut: vertical grain lines, occasional knots & ray flecks.
  // Returns a fresh CanvasTexture so caller can set its own repeat.
  const makeWalnutGrainTexture = (repeatX = 2, repeatY = 1) => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 512;
    const cx = c.getContext('2d');
    // Base — deep walnut brown with vertical gradient (heart→sap)
    const grad = cx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0.0, '#2a1608');
    grad.addColorStop(0.4, '#3a1d0a');
    grad.addColorStop(0.6, '#4a260e');
    grad.addColorStop(1.0, '#2e1808');
    cx.fillStyle = grad;
    cx.fillRect(0, 0, 256, 512);
    // Vertical grain lines — sinusoidal density
    for (let x = 0; x < 256; x++) {
      const wobble = Math.sin(x * 0.07) * 4 + Math.sin(x * 0.21) * 2;
      const dark = (Math.sin(x * 0.5) + 1) * 0.5;
      const a = 0.04 + dark * 0.10;
      cx.strokeStyle = `rgba(0,0,0,${a.toFixed(3)})`;
      cx.lineWidth = 1;
      cx.beginPath();
      cx.moveTo(x, 0);
      for (let y = 0; y <= 512; y += 16) {
        cx.lineTo(x + Math.sin((y + wobble) * 0.012) * 1.6, y);
      }
      cx.stroke();
    }
    // Subtle warm highlights
    for (let i = 0; i < 80; i++) {
      const hx = Math.random() * 256;
      const hy = Math.random() * 512;
      cx.fillStyle = `rgba(180,120,60,${(0.02 + Math.random() * 0.04).toFixed(3)})`;
      cx.fillRect(hx, hy, 1 + Math.random() * 2, 30 + Math.random() * 60);
    }
    // 2-3 knots scattered
    for (let k = 0; k < 3; k++) {
      const kx = 30 + Math.random() * 196;
      const ky = 60 + Math.random() * 392;
      const kr = 6 + Math.random() * 8;
      const kg = cx.createRadialGradient(kx, ky, 1, kx, ky, kr);
      kg.addColorStop(0, 'rgba(20,8,2,0.85)');
      kg.addColorStop(0.6, 'rgba(40,18,6,0.5)');
      kg.addColorStop(1, 'rgba(40,18,6,0)');
      cx.fillStyle = kg;
      cx.beginPath();
      cx.ellipse(kx, ky, kr * 1.4, kr, 0, 0, Math.PI * 2);
      cx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  // ── POOL CUE RACK — wall-mounted on left wall ──
  // Polished walnut: low roughness for the lacquered 1920s sheen.
  const darkWood = new THREE.MeshStandardMaterial({
    map: makeWalnutGrainTexture(1, 2),
    color: 0x6a3818, roughness: 0.22, metalness: 0.18, envMapIntensity: 0.7
  });
  const rackGroup = new THREE.Group();
  // Back plate
  const rackPlate = new THREE.Mesh(new THREE.BoxGeometry(6, 140, 60), darkWood);
  rackGroup.add(rackPlate);
  // Upper holder bar
  const upperBar = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 60), darkWood);
  upperBar.position.set(3, 50, 0);
  rackGroup.add(upperBar);
  // Lower holder bar
  const lowerBar = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 60), darkWood);
  lowerBar.position.set(3, -40, 0);
  rackGroup.add(lowerBar);
  // Cue sticks — 4 cues resting in the rack
  const cueMat = new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.4, metalness: 0.05 });
  const cueTipMat = new THREE.MeshStandardMaterial({ color: 0x1a1a3a, roughness: 0.5 });
  for (let ci = 0; ci < 4; ci++) {
    const cueGroup = new THREE.Group();
    // Shaft
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2, 120, 8), cueMat);
    cueGroup.add(shaft);
    // Tip
    const tip = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), cueTipMat);
    tip.position.y = 60;
    cueGroup.add(tip);
    // Butt cap
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 6, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a0a00, roughness: 0.3, metalness: 0.3 }));
    butt.position.y = -60;
    cueGroup.add(butt);
    cueGroup.position.set(8, 0, -22 + ci * 14);
    cueGroup.rotation.z = -0.05 + ci * 0.02;
    rackGroup.add(cueGroup);
  }
  rackGroup.position.set(-ROOM_WIDTH / 2 + 8, 150, -300);
  rackGroup.rotation.y = 0;
  scene.add(rackGroup);

  // ── BALL TRIANGLE — decorative racked balls on a side table ──
  const sideTableGroup = new THREE.Group();
  // Small side table
  const stTop = new THREE.Mesh(new THREE.CylinderGeometry(35, 35, 4, 16), darkWood);
  stTop.position.y = 70;
  sideTableGroup.add(stTop);
  for (let l = 0; l < 3; l++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 70, 8), darkWood);
    const la = (l / 3) * Math.PI * 2;
    leg.position.set(Math.cos(la) * 25, 35, Math.sin(la) * 25);
    sideTableGroup.add(leg);
  }
  // Triangle rack
  const triMat = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.3, metalness: 0.1 });
  const triShape = new THREE.Shape();
  triShape.moveTo(0, 18); triShape.lineTo(-16, -10); triShape.lineTo(16, -10); triShape.closePath();
  const triHole = new THREE.Path();
  triHole.moveTo(0, 14); triHole.lineTo(-12, -7); triHole.lineTo(12, -7); triHole.closePath();
  triShape.holes.push(triHole);
  const triGeo = new THREE.ExtrudeGeometry(triShape, { depth: 3, bevelEnabled: false });
  const triMesh = new THREE.Mesh(triGeo, triMat);
  triMesh.rotation.x = -Math.PI / 2;
  triMesh.position.y = 73;
  sideTableGroup.add(triMesh);
  // Pool balls inside triangle
  const ballColors = [0xff0000, 0xffff00, 0x0000ff, 0x00aa00, 0xff6600, 0x8800aa, 0xcc0000, 0x000000, 0xffcc00, 0x0088ff];
  let bIdx = 0;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col <= row; col++) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(3.5, 12, 10),
        new THREE.MeshStandardMaterial({ color: ballColors[bIdx % ballColors.length], roughness: 0.2, metalness: 0.05 }));
      ball.position.set(-row * 3.5 + col * 7, 76, -6 + row * 6);
      ball.castShadow = true;
      sideTableGroup.add(ball);
      bIdx++;
    }
  }
  sideTableGroup.position.set(ROOM_WIDTH / 2 - 80, 0, -350);
  scene.add(sideTableGroup);

  // ── UPRIGHT RAGTIME PIANO — back-left corner ──────────────────
  {
    const pianoGroup = new THREE.Group();

    const ebony = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.25, metalness: 0.35 });
    const ivoryM = new THREE.MeshStandardMaterial({ color: 0xfaf6ee, roughness: 0.35, metalness: 0.0 });
    const blackKey = new THREE.MeshStandardMaterial({ color: 0x050402, roughness: 0.2, metalness: 0.1 });
    const brassP = new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.3, metalness: 0.7 });

    // Cabinet body
    const body = new THREE.Mesh(new THREE.BoxGeometry(180, 140, 55), ebony);
    body.position.set(0, 105, 0);
    pianoGroup.add(body);

    // Lid (slightly angled open)
    const lid = new THREE.Mesh(new THREE.BoxGeometry(180, 4, 55), ebony);
    lid.position.set(0, 177, 0);
    lid.rotation.z = 0.08;
    pianoGroup.add(lid);

    // Music stand
    const stand = new THREE.Mesh(new THREE.BoxGeometry(150, 35, 4), ebony);
    stand.position.set(0, 162, -20);
    stand.rotation.x = 0.3;
    pianoGroup.add(stand);

    // Fallboard (keyboard cover — open, resting back)
    const fallboard = new THREE.Mesh(new THREE.BoxGeometry(155, 3, 30), ebony);
    fallboard.position.set(0, 143, -15);
    fallboard.rotation.x = -0.5;
    pianoGroup.add(fallboard);

    // Keyboard shelf
    const keyShelf = new THREE.Mesh(new THREE.BoxGeometry(160, 5, 30), ebony);
    keyShelf.position.set(0, 140, -26);
    pianoGroup.add(keyShelf);

    // White keys (14 visible)
    for (let k = 0; k < 14; k++) {
      const wKey = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 26), ivoryM);
      wKey.position.set(-60 + k * 10, 143, -26);
      pianoGroup.add(wKey);
    }
    // Black keys (8 visible — standard pattern: skip 3rd, 7th, 10th, 14th positions)
    const bkSkip = new Set([2, 6, 9, 13]);
    let bkPos = 0;
    for (let k = 0; k < 14; k++) {
      if (bkSkip.has(k)) continue;
      const bKey = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 16), blackKey);
      bKey.position.set(-55 + k * 10, 146, -19);
      pianoGroup.add(bKey);
      bkPos++;
    }

    // Three legs
    for (let l = 0; l < 3; l++) {
      const lx = l === 0 ? -75 : l === 1 ? 75 : 0;
      const lz = l === 2 ? -20 : 0;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(5, 4, 35, 8), ebony);
      leg.position.set(lx, 17, lz);
      pianoGroup.add(leg);
      // Brass foot cup
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(7, 6, 5, 8), brassP);
      cup.position.set(lx, 2, lz);
      pianoGroup.add(cup);
    }

    // Brass candle holders (period detail — two on top corners)
    [-70, 70].forEach(cx => {
      const holder = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 20, 8), brassP);
      holder.position.set(cx, 189, -10);
      pianoGroup.add(holder);
      // Candle
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 18, 8),
        new THREE.MeshStandardMaterial({ color: 0xfff8e0, roughness: 0.9, metalness: 0.0 }));
      candle.position.set(cx, 207, -10);
      pianoGroup.add(candle);
      // Flame glow
      const flame = new THREE.PointLight(0xffaa44, 8, 80, 2);
      flame.position.set(cx, 220, -10);
      flame._baseIntensity = 8;
      pianoGroup.add(flame);
    });

    // Bench
    const benchTop = new THREE.Mesh(new THREE.BoxGeometry(120, 8, 36), ebony);
    benchTop.position.set(0, 55, -65);
    pianoGroup.add(benchTop);
    // Bench cushion
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(114, 5, 30),
      new THREE.MeshStandardMaterial({ color: 0x5a1a0a, roughness: 0.8, metalness: 0.0 }));
    cushion.position.set(0, 60, -65);
    pianoGroup.add(cushion);
    for (let bl = 0; bl < 4; bl++) {
      const blx = bl % 2 === 0 ? -45 : 45;
      const blz = bl < 2 ? -50 : -80;
      const bleg = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 55, 6), ebony);
      bleg.position.set(blx, 27, blz);
      pianoGroup.add(bleg);
    }

    // Back-left corner, facing the room
    pianoGroup.position.set(-ROOM_WIDTH / 2 + 110, 0, -ROOM_DEPTH / 2 + 100);
    pianoGroup.rotation.y = Math.PI;   // 180° — keyboard & bench face +Z (into the room)
    scene.add(pianoGroup);
  }

  // ── 1930s SPEAKEASY PROPS & ORNAMENTS ──────────────────────────
  {
    // Polished walnut for speakeasy props — shares the grain helper with the cue rack
    const darkWood = new THREE.MeshStandardMaterial({
      map: makeWalnutGrainTexture(2, 1),
      color: 0x5a2e12, roughness: 0.20, metalness: 0.22, envMapIntensity: 0.8
    });
    const brassOr = new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.18, metalness: 0.85 });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x1a6b2a, roughness: 0.75, metalness: 0.0 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xeeffee, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.12
    });

    // Helper: create mesh and position it correctly (never overwrite .position reference)
    const placed = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m;
    };

    // ─ BAR CART — back-right corner ─
    const cart = new THREE.Group();
    // Shelf (lower)
    cart.add(placed(new THREE.BoxGeometry(70, 3, 36), darkWood, 0, 45, 0));
    // Shelf (upper)
    cart.add(placed(new THREE.BoxGeometry(70, 3, 36), darkWood, 0, 85, 0));
    // Brass rails (4 vertical posts)
    [[-32, -15], [32, -15], [-32, 15], [32, 15]].forEach(([cx, cz]) => {
      cart.add(placed(new THREE.CylinderGeometry(1.5, 1.5, 90, 6), brassOr, cx, 47, cz));
    });
    // Wheels
    [[-32, -15], [32, -15], [-32, 15], [32, 15]].forEach(([cx, cz]) => {
      cart.add(placed(new THREE.CylinderGeometry(5, 5, 2, 12), brassOr, cx, 2.5, cz));
    });
    // Liquor bottles (on top shelf)
    const bottleColors = [0x2a4a1a, 0x6b3a0a, 0x0a2a4a, 0x4a1a2a, 0x3a3a0a];
    bottleColors.forEach((col, i) => {
      const bMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.75 });
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 22, 8), bMat);
      bottle.position.set(-24 + i * 13, 99, 0);
      cart.add(bottle);
      // Bottle neck
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 3, 8, 8), bMat);
      neck.position.set(-24 + i * 13, 114, 0);
      cart.add(neck);
    });
    // Crystal decanter (center, lower shelf)
    const decanter = new THREE.Mesh(new THREE.SphereGeometry(7, 10, 8), glassMat);
    decanter.position.set(0, 55, 0);
    cart.add(decanter);
    const dNeck = new THREE.Mesh(new THREE.CylinderGeometry(2, 4, 12, 8), glassMat);
    dNeck.position.set(0, 65, 0);
    cart.add(dNeck);
    cart.position.set(ROOM_WIDTH / 2 - 80, 0, -ROOM_DEPTH / 2 + 60);
    scene.add(cart);

    // ─ POTTED FAN PALM — front-right corner ─
    const palm = new THREE.Group();
    // Ceramic pot
    const potMat = new THREE.MeshStandardMaterial({ color: 0x6a3820, roughness: 0.70, metalness: 0.05 });
    palm.add(placed(new THREE.CylinderGeometry(18, 14, 40, 10), potMat, 0, 20, 0));
    // Pot rim
    palm.add(placed(new THREE.TorusGeometry(18, 2.5, 6, 12), potMat, 0, 40, 0));
    // Trunk
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4020, roughness: 0.85, metalness: 0.0 });
    palm.add(placed(new THREE.CylinderGeometry(4, 6, 80, 8), trunkMat, 0, 80, 0));
    // Fan leaves (6 wide cones radiating out)
    for (let lf = 0; lf < 7; lf++) {
      const lfAng = (lf / 7) * Math.PI * 2 + Math.random() * 0.3;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(25, 50, 4), greenMat);
      leaf.position.set(Math.cos(lfAng) * 18, 125 + Math.random() * 15, Math.sin(lfAng) * 18);
      leaf.rotation.set(0.5 + Math.random() * 0.3, lfAng, Math.random() * 0.2 - 0.1);
      palm.add(leaf);
    }
    palm.position.set(ROOM_WIDTH / 2 - 60, 0, ROOM_DEPTH / 2 - 60);
    scene.add(palm);

    // ─ STANDING GLOBE — left side, near the piano ─
    const globeGrp = new THREE.Group();
    // Stand legs (tripod)
    for (let gl = 0; gl < 3; gl++) {
      const ga = (gl / 3) * Math.PI * 2;
      const gLeg = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 80, 6), darkWood);
      gLeg.position.set(Math.cos(ga) * 14, 40, Math.sin(ga) * 14);
      gLeg.rotation.z = 0.12 * Math.cos(ga);
      gLeg.rotation.x = 0.12 * Math.sin(ga);
      globeGrp.add(gLeg);
    }
    // Vertical column
    globeGrp.add(placed(new THREE.CylinderGeometry(3, 3, 30, 8), brassOr, 0, 90, 0));
    // Globe sphere — procedural equirectangular Earth map (1920s parchment style)
    const globeCanvas = document.createElement('canvas');
    globeCanvas.width = 512; globeCanvas.height = 256;
    const gcx = globeCanvas.getContext('2d');
    // Ocean — aged sepia-blue parchment
    const oceanGrad = gcx.createLinearGradient(0, 0, 0, 256);
    oceanGrad.addColorStop(0, '#3a6b8a');
    oceanGrad.addColorStop(0.5, '#2c5a78');
    oceanGrad.addColorStop(1, '#244e6a');
    gcx.fillStyle = oceanGrad;
    gcx.fillRect(0, 0, 512, 256);
    // Continent silhouettes — rough polygons in equirectangular layout
    // Coords in canvas pixels (x: 0=180°W → 512=180°E, y: 0=90°N → 256=90°S)
    const land = '#7a6038';
    const landDark = '#5a4528';
    gcx.fillStyle = land;
    const polys = [
      // North America
      [[80, 60], [150, 55], [180, 80], [170, 120], [140, 150], [100, 140], [70, 110], [60, 80]],
      // South America
      [[155, 150], [185, 150], [195, 180], [185, 220], [170, 240], [155, 225], [150, 190]],
      // Europe
      [[245, 70], [290, 65], [300, 90], [280, 100], [250, 95]],
      // Africa
      [[250, 110], [295, 105], [310, 140], [300, 180], [280, 210], [260, 200], [245, 160]],
      // Asia
      [[300, 55], [420, 60], [430, 95], [400, 120], [360, 115], [320, 100], [300, 80]],
      // India subcontinent
      [[345, 115], [365, 115], [370, 140], [355, 150], [340, 135]],
      // Australia
      [[400, 180], [450, 180], [460, 205], [430, 215], [405, 205]],
      // Greenland
      [[200, 40], [230, 38], [235, 60], [215, 68], [200, 55]],
      // Antarctica strip
      [[0, 235], [512, 235], [512, 256], [0, 256]]
    ];
    polys.forEach(p => {
      gcx.beginPath();
      gcx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) gcx.lineTo(p[i][0], p[i][1]);
      gcx.closePath();
      gcx.fill();
    });
    // Coast shading — outline darker
    gcx.strokeStyle = landDark; gcx.lineWidth = 1.5;
    polys.forEach(p => {
      gcx.beginPath();
      gcx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) gcx.lineTo(p[i][0], p[i][1]);
      gcx.closePath();
      gcx.stroke();
    });
    // Lat/lon graticule — brass-line every 30°
    gcx.strokeStyle = 'rgba(180,150,90,0.25)'; gcx.lineWidth = 0.5;
    for (let lon = 0; lon <= 512; lon += 512 / 12) {
      gcx.beginPath(); gcx.moveTo(lon, 0); gcx.lineTo(lon, 256); gcx.stroke();
    }
    for (let lat = 0; lat <= 256; lat += 256 / 6) {
      gcx.beginPath(); gcx.moveTo(0, lat); gcx.lineTo(512, lat); gcx.stroke();
    }
    // Equator — bolder
    gcx.strokeStyle = 'rgba(220,180,100,0.5)'; gcx.lineWidth = 1;
    gcx.beginPath(); gcx.moveTo(0, 128); gcx.lineTo(512, 128); gcx.stroke();
    const globeTex = new THREE.CanvasTexture(globeCanvas);
    globeTex.colorSpace = THREE.SRGBColorSpace;
    const globeMat = new THREE.MeshStandardMaterial({
      map: globeTex, color: 0xffffff, roughness: 0.55, metalness: 0.10
    });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(18, 32, 24), globeMat);
    globe.position.y = 118;
    globe.rotation.z = 0.4;  // tilted axis
    globeGrp.add(globe);
    // Brass meridian ring
    const meridian = new THREE.Mesh(new THREE.TorusGeometry(20, 1.2, 6, 32), brassOr);
    meridian.position.y = 118;
    meridian.rotation.x = Math.PI / 2;
    meridian.rotation.z = 0.4;
    globeGrp.add(meridian);
    globeGrp.position.set(-ROOM_WIDTH / 2 + 80, 0, 200);
    scene.add(globeGrp);

    // ─ BRASS SPITTOON — near the side table ─
    const spittoon = new THREE.Group();
    spittoon.add(placed(new THREE.CylinderGeometry(12, 8, 18, 12), brassOr, 0, 9, 0));
    // Flared rim
    spittoon.add(placed(new THREE.TorusGeometry(13, 2, 6, 16), brassOr, 0, 18, 0));
    spittoon.position.set(ROOM_WIDTH / 2 - 60, 0, -280);
    scene.add(spittoon);

    // ─ HAT & COAT RACK — front-left corner ─
    const rack = new THREE.Group();
    // Pole
    rack.add(placed(new THREE.CylinderGeometry(3, 4, 190, 8), darkWood, 0, 95, 0));
    // Base
    rack.add(placed(new THREE.CylinderGeometry(22, 24, 6, 10), darkWood, 0, 3, 0));
    // Hooks (6 brass hooks radiating out at top)
    for (let h = 0; h < 6; h++) {
      const ha = (h / 6) * Math.PI * 2;
      const hook = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 16, 4), brassOr);
      hook.rotation.z = Math.PI / 2;
      hook.position.set(Math.cos(ha) * 12, 185, Math.sin(ha) * 12);
      hook.rotation.y = ha;
      rack.add(hook);
    }
    // Fedora hat hanging on one hook
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x2a2218, roughness: 0.75, metalness: 0.05 });
    rack.add(placed(new THREE.CylinderGeometry(16, 18, 3, 12), hatMat, 14, 176, 0));
    rack.add(placed(new THREE.CylinderGeometry(10, 10, 14, 10), hatMat, 14, 185, 0));
    rack.position.set(-ROOM_WIDTH / 2 + 50, 0, ROOM_DEPTH / 2 - 50);
    scene.add(rack);
  }

  // ── CHANDELIER — ceiling-mounted, long rod hangs arms into mid-room view ──
  // Group sits at ceiling. A 240-unit rod drops the arms to world y≈305,
  // which lands squarely in the default camera FOV.
  const chandelierGroup = new THREE.Group();
  chandelierGroup.name = 'chandelier';

  const brassM = new THREE.MeshStandardMaterial({ color: 0x8B7535, roughness: 0.25, metalness: 0.85 });

  // Ceiling rose (flush against ceiling)
  const cPlate = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 4, 16), brassM);
  cPlate.position.y = -2;
  chandelierGroup.add(cPlate);

  // Long suspension rod — drops chandelier body into visible FOV
  const ROD_LEN = 240;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, ROD_LEN, 8), brassM);
  rod.position.y = -(ROD_LEN / 2 + 4);   // center between ceiling plate and hub
  chandelierGroup.add(rod);

  // Hub at the bottom of the rod
  const hubY = -(ROD_LEN + 4);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(9, 14, 12), brassM);
  hub.position.y = hubY;
  chandelierGroup.add(hub);

  // Six arms with glass shades and warm point lights
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffeedd, roughness: 0.25, metalness: 0.0,
    transparent: true, opacity: 0.45,
    emissive: new THREE.Color(0xffcc88), emissiveIntensity: 0.35,
    side: THREE.DoubleSide
  });
  const ARM_R = 55;
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * Math.PI * 2;
    const ax = Math.cos(ang) * ARM_R;
    const az = Math.sin(ang) * ARM_R;
    const armY = hubY - 6;

    // Horizontal arm
    const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, ARM_R, 6), brassM);
    armMesh.rotation.z = Math.PI / 2;
    armMesh.position.set(ax / 2, armY, az / 2);
    armMesh.rotation.y = -ang;
    chandelierGroup.add(armMesh);

    // Glass shade (open-bottom cone)
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(5, 11, 15, 10, 1, true), glassMat);
    shade.position.set(ax, armY - 9, az);
    chandelierGroup.add(shade);

    // Warm point light — stored base intensity for smooth fade
    const armLight = new THREE.PointLight(0xffeedd, 45, 260, 2);
    armLight.position.set(ax, armY - 4, az);
    armLight._baseIntensity = 45;          // used by fade routine
    chandelierGroup.add(armLight);
  }

  // Crystal drops around hub (two radii, staggered heights)
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.04, metalness: 0.12, transparent: true, opacity: 0.65
  });
  for (let c = 0; c < 16; c++) {
    const cAng = (c / 16) * Math.PI * 2;
    const cr = 28 + (c % 2) * 20;
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(2.8, 0), crystalMat);
    crystal.position.set(
      Math.cos(cAng) * cr,
      hubY - 16 - (c % 3) * 6,
      Math.sin(cAng) * cr
    );
    chandelierGroup.add(crystal);
  }

  // Mount flush against ceiling; arms now hang at world y ≈ ROOM_HEIGHT - ROD_LEN ≈ 314
  chandelierGroup.position.set(0, ROOM_HEIGHT - 2, 0);
  scene.add(chandelierGroup);
}

function createHexBilliardTable() {
  // ── SLATE BED — solid base beneath the felt ──
  const slateShape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI / 3) - Math.PI / 6;
    const x = Math.cos(angle) * (BOARD_RADIUS + RAIL_WIDTH + 5);
    const y = Math.sin(angle) * (BOARD_RADIUS + RAIL_WIDTH + 5);
    if (i === 0) slateShape.moveTo(x, y); else slateShape.lineTo(x, y);
  }
  slateShape.closePath();
  const slateGeo = new THREE.ExtrudeGeometry(slateShape, { depth: 12, bevelEnabled: false });
  slateGeo.rotateX(-Math.PI / 2);
  const slateMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7, metalness: 0.05 });
  const slate = new THREE.Mesh(slateGeo, slateMat);
  slate.position.y = TABLE_HEIGHT - 12;
  slate.receiveShadow = true;
  scene.add(slate);

  // ── GREEN BAIZE FELT — procedural woven texture ──
  const feltShape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI / 3) - Math.PI / 6;
    const x = Math.cos(angle) * (BOARD_RADIUS + RAIL_WIDTH);
    const y = Math.sin(angle) * (BOARD_RADIUS + RAIL_WIDTH);
    if (i === 0) feltShape.moveTo(x, y); else feltShape.lineTo(x, y);
  }
  feltShape.closePath();

  // Procedural felt texture
  const feltCanvas = document.createElement('canvas');
  feltCanvas.width = 256; feltCanvas.height = 256;
  const fctx = feltCanvas.getContext('2d');
  fctx.fillStyle = '#0a6e1e';
  fctx.fillRect(0, 0, 256, 256);
  // Woven fiber noise
  for (let fy = 0; fy < 256; fy++) {
    for (let fx = 0; fx < 256; fx += 2) {
      const noise = Math.random() * 12 - 6;
      const g = 58 + noise;
      fctx.fillStyle = `rgb(${26 + noise * 0.3}, ${g}, ${26 + noise * 0.3})`;
      fctx.fillRect(fx, fy, 2, 1);
    }
  }
  const feltTex = new THREE.CanvasTexture(feltCanvas);
  feltTex.wrapS = feltTex.wrapT = THREE.RepeatWrapping;
  feltTex.repeat.set(4, 4);
  // Felt normal map — gives the woven fiber texture real depth
  const feltNorm = generateNormalMap(feltCanvas, 1.5);
  feltNorm.repeat.copy(feltTex.repeat);

  const tableTopGeo = new THREE.ExtrudeGeometry(feltShape, { depth: 4, bevelEnabled: false });
  tableTopGeo.rotateX(-Math.PI / 2);
  const tableTopMat = new THREE.MeshStandardMaterial({
    map: feltTex, normalMap: feltNorm, normalScale: new THREE.Vector2(0.6, 0.6),
    color: 0x0e7a24, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.05
  });
  const tableTop = new THREE.Mesh(tableTopGeo, tableTopMat);
  tableTop.position.y = TABLE_HEIGHT - 4;
  tableTop.receiveShadow = true;
  scene.add(tableTop);

  // ── CUSHION RAILS — rich mahogany with beveled profile ──
  const railShape = new THREE.Shape();
  const outerR = BOARD_RADIUS + RAIL_WIDTH + 25;
  const innerR = BOARD_RADIUS + RAIL_WIDTH;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI / 3) - Math.PI / 6;
    if (i === 0) railShape.moveTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
    else railShape.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
  }
  railShape.closePath();
  const railHole = new THREE.Path();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI / 3) - Math.PI / 6;
    if (i === 0) railHole.moveTo(Math.cos(a) * innerR, Math.sin(a) * innerR);
    else railHole.lineTo(Math.cos(a) * innerR, Math.sin(a) * innerR);
  }
  railHole.closePath();
  railShape.holes.push(railHole);

  // Procedural wood grain for rails
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = 512; woodCanvas.height = 64;
  const wctx = woodCanvas.getContext('2d');
  wctx.fillStyle = '#5a2a0a';
  wctx.fillRect(0, 0, 512, 64);
  for (let wy = 0; wy < 64; wy++) {
    const grain = Math.sin(wy * 0.8 + Math.random() * 2) * 8;
    wctx.fillStyle = `rgb(${90 + grain}, ${42 + grain * 0.5}, ${10 + grain * 0.2})`;
    wctx.fillRect(0, wy, 512, 1);
  }
  const woodTex = new THREE.CanvasTexture(woodCanvas);
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  woodTex.repeat.set(3, 1);
  // Wood grain normal map for lacquered rail depth
  const woodNorm = generateNormalMap(woodCanvas, 2.5);
  woodNorm.repeat.copy(woodTex.repeat);

  const railGeo = new THREE.ExtrudeGeometry(railShape, {
    depth: RAIL_HEIGHT + 4, bevelEnabled: true, bevelSize: 3, bevelThickness: 2, bevelSegments: 3
  });
  railGeo.rotateX(-Math.PI / 2);
  const railMat = new THREE.MeshStandardMaterial({
    map: woodTex, normalMap: woodNorm, normalScale: new THREE.Vector2(0.7, 0.7),
    color: 0x6a3a10, roughness: 0.25, metalness: 0.2, envMapIntensity: 0.6
  });
  const rail = new THREE.Mesh(railGeo, railMat);
  rail.position.y = TABLE_HEIGHT;
  rail.castShadow = true;
  rail.receiveShadow = true;
  scene.add(rail);

  // ── PLAYER MARKERS — avatar + name sprites on rails (replacing diamond sights) ──
  // These are created as placeholders; updatePlayerMarkers() populates them once game starts
  _playerMarkerSprites = [];
  for (let i = 0; i < 6; i++) {
    const a1 = (i * Math.PI / 3) - Math.PI / 6;
    const a2 = ((i + 1) * Math.PI / 3) - Math.PI / 6;
    const midA = (a1 + a2) / 2;
    const sightR = outerR - 5;
    // Create a blank sprite placeholder at each panel midpoint
    const sprite = createPlayerMarkerSprite('', '#888888', '⬡');
    sprite.position.set(Math.cos(midA) * sightR, TABLE_HEIGHT + RAIL_HEIGHT + 12, Math.sin(midA) * sightR);
    sprite.visible = false; // hidden until a player occupies this panel
    sprite.userData.boardPosition = i;
    scene.add(sprite);
    _playerMarkerSprites.push(sprite);
  }

  // ── APRON SKIRT — beneath the rail, visible from low angles ──
  const apronShape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI / 3) - Math.PI / 6;
    if (i === 0) apronShape.moveTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
    else apronShape.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
  }
  apronShape.closePath();
  const apronInner = new THREE.Path();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI / 3) - Math.PI / 6;
    if (i === 0) apronInner.moveTo(Math.cos(a) * (outerR - 6), Math.sin(a) * (outerR - 6));
    else apronInner.lineTo(Math.cos(a) * (outerR - 6), Math.sin(a) * (outerR - 6));
  }
  apronInner.closePath();
  apronShape.holes.push(apronInner);
  const apronGeo = new THREE.ExtrudeGeometry(apronShape, { depth: 25, bevelEnabled: false });
  apronGeo.rotateX(-Math.PI / 2);
  const apronMat = new THREE.MeshStandardMaterial({
    map: woodTex, normalMap: woodNorm, normalScale: new THREE.Vector2(0.5, 0.5),
    color: 0x5a2a08, roughness: 0.3, metalness: 0.12, envMapIntensity: 0.5
  });
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.position.y = TABLE_HEIGHT - 25;
  apron.castShadow = true;
  scene.add(apron);

  // ── TURNED LEGS — lathe-style with carved profiles ──
  const legMat = new THREE.MeshStandardMaterial({
    map: woodTex, normalMap: woodNorm, normalScale: new THREE.Vector2(0.6, 0.6),
    color: 0x4a1a05, roughness: 0.28, metalness: 0.15, envMapIntensity: 0.5
  });
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI / 3) - Math.PI / 6;
    const legX = Math.cos(angle) * (BOARD_RADIUS * 0.78);
    const legZ = Math.sin(angle) * (BOARD_RADIUS * 0.78);
    const legGroup = new THREE.Group();

    // Main shaft — tapered
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(TABLE_LEG_WIDTH / 2 - 2, TABLE_LEG_WIDTH / 2, TABLE_HEIGHT * 0.7, 12),
      legMat
    );
    shaft.position.y = TABLE_HEIGHT * 0.35;
    legGroup.add(shaft);

    // Decorative bulge (turned detail)
    const bulge = new THREE.Mesh(
      new THREE.SphereGeometry(TABLE_LEG_WIDTH / 2 + 2, 12, 8),
      legMat
    );
    bulge.position.y = TABLE_HEIGHT * 0.55;
    bulge.scale.y = 0.6;
    legGroup.add(bulge);

    // Foot cap — polished brass with reflections
    const footMat = new THREE.MeshStandardMaterial({
      color: 0xb8960c, roughness: 0.15, metalness: 0.9, envMapIntensity: 1.2
    });
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_LEG_WIDTH / 2 + 1, TABLE_LEG_WIDTH / 2 - 1, 8, 12), footMat);
    foot.position.y = 4;
    legGroup.add(foot);

    legGroup.position.set(legX, 0, legZ);
    legGroup.castShadow = true;
    scene.add(legGroup);
  }
}

// ════════════════════════════════════════════════════════════════
// INITIALIZATION
// ════════════════════════════════════════════════════════════════
async function init3D() {
  if (window.KG_BOOTSTRAP_PROMISE) {
    await window.KG_BOOTSTRAP_PROMISE;
  }
  const container = document.getElementById('container');

  // Load settings from lobby config
  GameSettings.load();

  // Initialize manifold audio system
  ManifoldAudio.init();

  // Mobile / coarse-pointer devices strip the billiard-room substrate
  // (walls, floor, ceiling, sconces, fireplace, env reflections) and run
  // a void-only scene with the board + Schwarz Diamond manifold. PBR
  // uniform-light limits on phone GPUs were silently dropping the warm
  // sconce/neon point lights and making the room look unlit; the void
  // mode sidesteps the limit entirely.
  // Quality manifold (fasttrack-quality.js) — one capability scalar drives the
  // whole render-settings vector. Fall back to safe defaults if it failed to load.
  const Q = (typeof window !== 'undefined' && window.FT_QUALITY) || {
    pixelRatio: Math.min((window.devicePixelRatio || 1), 2),
    antialias: true, shadows: true, shadowMapSize: 2048, spotShadows: true,
    detail: 1, fog: true, env: true, voidMode: false, onAdapt() {}, frame() {}
  };

  const FT_MOBILE_VOID = ((typeof window !== 'undefined') &&
    ((window.FT_MOBILE === true) ||   // Google Play build: always void + starry, any screen size
     (window.matchMedia && window.matchMedia('(max-width: 760px), (pointer: coarse)').matches)))
    || Q.voidMode === true;   // very-weak desktops fall into void too (§3 boundary)
  window.FT_MOBILE_VOID = FT_MOBILE_VOID;

  // Scene - rich warm billiard room (desktop) / pure void (mobile)
  scene = new THREE.Scene();
  scene.background = new THREE.Color(FT_MOBILE_VOID ? 0x000000 : 0x0d0a07);
  if (!FT_MOBILE_VOID) scene.fog = new THREE.FogExp2(0x0d0a07, 0.0006);

  // Camera — vertical FOV widens automatically on narrow/portrait viewports
  // so the whole board stays in frame on phones.
  camera = new THREE.PerspectiveCamera(45, (_viewSize().w / _viewSize().h) || 1, 1, 6000);
  fitVerticalFovToAspect(camera);
  camera.position.set(0, 480, 380);
  camera.lookAt(0, TABLE_HEIGHT, 0);
  // Expose for x-code HUD overlay (read-only).
  window.ftCamera = camera;

  // Renderer — photo-realistic PBR
  renderer = new THREE.WebGLRenderer({
    antialias: Q.antialias !== false,
    powerPreference: 'high-performance',
    alpha: false,
    stencil: false
  });
  { const v = _viewSize(); renderer.setSize(v.w, v.h); }
  renderer.setPixelRatio(Q.pixelRatio);
  // Void mode has no floor/walls to receive shadows — skip the 2048² shadow
  // pass and its per-frame cost. Weak tiers drop shadows even with a room.
  renderer.shadowMap.enabled = !FT_MOBILE_VOID && Q.shadows !== false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.physicallyCorrectLights = true;
  container.appendChild(renderer.domElement);

  // ── ADAPTIVE GOVERNOR HOOK (§5 residual feedback) ──
  // The quality manifold may nudge capability down (or back up) at runtime
  // when frame time drifts off target. Only the cheap knobs are live — pixel
  // ratio and shadow on/off. Heavier settings (counts, map size) apply on the
  // next load; we never tear down the scene mid-game.
  if (Q.onAdapt) Q.onAdapt((q) => {
    try {
      renderer.setPixelRatio(q.pixelRatio);
      renderer.shadowMap.enabled = !FT_MOBILE_VOID && q.shadows !== false;
    } catch (_) {}
  });

  // ── ENVIRONMENT MAP — warm room reflections for PBR materials ──
  // Skipped in void mode: no walls to reflect, and the cubemap allocation
  // is one of the heavier GPU costs at init.
  if (!FT_MOBILE_VOID) createEnvironmentMap();

  // Controls - always enabled for manual camera (default)
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = true;
  controls.enableZoom = true;
  // No distance or angle limits — the per-frame cubic room clamp is the only boundary
  controls.target.set(0, TABLE_HEIGHT, 0);   // orbit around board surface, not floor

  // Initialize CameraDirector with mode from settings
  CameraDirector.init();
  console.log(`📷 Camera mode: ${CameraDirector.mode}`);
  // Sync hamburger camera-row active state to whatever init() chose
  // (mobile → 'auto', desktop → 'manual'). Done after DOM is ready.
  try {
    document.querySelectorAll('#hamburger-menu .hm-cam-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-cam') === CameraDirector.mode);
    });
  } catch (_) { }

  // Ingest art images onto the manifold, then create the room.
  // user_directive_2026-05-18 — DO NOT await. The art set is ~50MB of PNG;
  // awaiting it stalled init3D for up to 20 seconds behind a black screen.
  // ingestArt() now applies each texture to its canvas mesh as it lands.
  try { ingestArt(); } catch (e) { console.warn('🎨 Art ingestion error:', e); }
  if (!FT_MOBILE_VOID) createBilliardRoom();
  // Google Play build: starry skydome instead of the speakeasy room (board unchanged).
  else if (typeof window !== 'undefined' && window.FT_MOBILE === true) {
    try { createMobileStarfield(); } catch (e) { console.warn('starfield error:', e); }
  }

  // Lighting (billiard table lamp style)
  setupLighting();

  // Board group (sits on table)
  boardGroup = new THREE.Group();
  boardGroup.name = 'boardGroup';
  boardGroup.position.y = 90;  // Table height
  scene.add(boardGroup);

  // Peg group
  pegGroup = new THREE.Group();
  pegGroup.name = 'pegGroup';
  scene.add(pegGroup);


  // Create hexagonal billiard table
  if (!FT_MOBILE_VOID) createBilliardRoom && createBilliardRoom();

  // ── FEATURE FLAG: Procedural vs. Legacy Board Mesh ──
  // Set window.FT_USE_PROCEDURAL_BOARD = true in console or before load to enable procedural SDF board
  if (window.FT_USE_PROCEDURAL_BOARD) {
    // Load procedural mesh (requires js/procedural_fasttrack.js and THREE.MarchingCubes)
    if (window.createFastTrackBoardMesh && typeof THREE !== 'undefined' && typeof THREE.MarchingCubes === 'function') {
      const mat = new THREE.MeshStandardMaterial({ color: 0x0e7a24, roughness: 0.92, metalness: 0.0 });
      const procBoard = window.createFastTrackBoardMesh({ size: 12, resolution: 64, level: 0, material: mat });
      if (procBoard) {
        procBoard.name = 'proceduralBoardMesh';
        procBoard.position.y = 0; // Table height handled by boardGroup
        boardGroup.add(procBoard);
        window.boardMesh = procBoard;
        console.log('[FT3D] Procedural FastTrack board mesh enabled.');
      } else {
        console.warn('[FT3D] Procedural mesh creation failed, falling back to legacy.');
        createHexagonBoard();
      }
    } else {
      console.warn('[FT3D] Procedural mesh dependencies missing, falling back to legacy.');
      createHexagonBoard();
    }
    createRainbowBorder();
    createGameElements();
  } else {
    // Legacy mesh path (default)
    createHexagonBoard();
    createRainbowBorder();
    createGameElements();
  }

  // Atmospheric dust motes
  createDustMotes();

  // Window resize
  window.addEventListener('resize', onWindowResize);
  // Apply viewport/scissor sizing once immediately now that renderer/camera exist
  onWindowResize();

  // Expose systems globally so game-core can access them
  window.ManifoldAudio = ManifoldAudio;
  window.CameraDirector = CameraDirector;
  window.triggerPegPose = triggerPegPose;
  window.triggerWinCrown = triggerWinCrown;
  window.showGoldenCrown = showGoldenCrown;

  // Resume AudioContext on first user interaction (browser autoplay policy)
  const resumeAudio = () => {
    if (ManifoldAudio.ctx && ManifoldAudio.ctx.state === 'suspended') {
      ManifoldAudio.ctx.resume();
    }
    if (GameSettings.musicEnabled) ManifoldAudio.startMusic();
    // Ragtime ambience is ambient room sound — always starts regardless of music toggle
    ManifoldAudio.startRagtimeAmbience();
  };
  document.addEventListener('click', resumeAudio, { once: true });

  // Wire game logic → 3D renderer
  if (window.FastTrackCore) {
    window.FastTrackCore.setRenderer(renderBoard3D);

    // ── URL params take absolute priority over localStorage config ──
    // ── X-Dimensional Session Bridge (from landing page) ──
    let dimensionalConfig = null;
    if (window.DIMENSIONAL_SESSION && window.DIMENSIONAL_SESSION.extract) {
      const extracted = window.DIMENSIONAL_SESSION.extract();
      if (extracted) {
        dimensionalConfig = {
          humanName: `Player-${extracted.modifiers.inviteCode?.slice(0, 4) || 'P1'}`,
          humanAvatar: extracted.players.mode === 'ranked' ? '🎯' : (extracted.players.mode === 'multiplayer' ? '👥' : '🤖'),
          aiDifficulty: extracted.players.difficulty, // 'easy' | 'medium' | 'hard'
          _dimensionalX: extracted.sessionX,
          _gameBoard: extracted.board
        };
        console.log('[DIMENSIONAL-FT] Initializing from x-dimensional session:', dimensionalConfig);
      }
    }

    // ── X-Dimensional config resolution ──────────────────────────────────
    // KG_Game  { x, mode, code?, playerCount, aiDifficulty }  — game identity
    // KG_Player{ x, name, avatar }                            — player identity
    //
    // Either can be resolved directly by its x without traversing the other.
    // URL params are accepted as a legacy fallback for direct links / dev testing.
    const kgGame = window.KG_Game || null;
    const kgPlayer = window.KG_Player || null;

    // Also read the legacy flat config key for any older callers
    let storedCfg = {};
    try {
      storedCfg = JSON.parse(localStorage.getItem('fasttrack-lobby') || '{}') || {};
    } catch (_) { storedCfg = {}; }

    // URL params — legacy fallback only
    const usp = new URLSearchParams(location.search);

    const gameMode = (kgGame?.mode) || usp.get('mode') || storedCfg.mode || 'solo';
    const inviteCode = ((kgGame?.code) || usp.get('code') || storedCfg.code || '').toUpperCase();
    // URL ?players= must beat cached KG_Game.playerCount so a fresh launch
    // from play.html (or a direct link) reflects the user's current pick
    // instead of whatever was stored from the previous game.
    const playerCount_raw = usp.get('players') || (kgGame?.playerCount) || storedCfg.playerCount || '2';

    let sessionCache = null;
    try {
      const raw = sessionStorage.getItem('kg_session');
      if (raw) sessionCache = JSON.parse(raw);
    } catch (_) {
      sessionCache = null;
    }

    let runtimeCache = null;
    try {
      const rawRuntime = sessionStorage.getItem('kg_fasttrack_runtime');
      if (rawRuntime) runtimeCache = JSON.parse(rawRuntime);
    } catch (_) {
      runtimeCache = null;
    }

    const runtimePlayers = Array.isArray(runtimeCache && runtimeCache.players) ? runtimeCache.players : [];
    const runtimeCode = String((runtimeCache && runtimeCache.game && runtimeCache.game.code) || '').toUpperCase();

    const sessionPlayers = Array.isArray(sessionCache && sessionCache.players) ? sessionCache.players : [];
    const sessionCode = String((sessionCache && sessionCache.session_code) || '').toUpperCase();
    const sameInviteSession = !inviteCode || ((sessionCode && inviteCode === sessionCode) || (runtimeCode && inviteCode === runtimeCode));
    const runtimeHasRoster = runtimePlayers.length >= 2;
    const hasSessionRoster = sessionPlayers.length >= 2;
    // Live multiplayer: private, public, or generic 'multiplayer' all share the
    // same launch path — read the roster the lobby gave us. The previous gate
    // accepted only 'private', which silently dropped public games into a
    // 2-player solo+bot game per browser.
    const isLiveMode = (gameMode === 'private' || gameMode === 'public' || gameMode === 'multiplayer');
    // A runtime roster is authoritative in EVERY mode, not just the live ones.
    // This used to require isLiveMode (private/public/multiplayer), so a solo or
    // ai launch that HAD a full roster in kg_fasttrack_runtime had it ignored,
    // and the game rebuilt a generic table instead of seating the players and
    // bots the setup flow had just resolved. lobby-simple.html launches exactly
    // that way: it persists the runtime with mode 'solo' and navigates to
    // ?launch=1.
    const useRuntimeRoster = sameInviteSession && runtimeHasRoster;
    const useSessionRoster = !useRuntimeRoster && isLiveMode && sameInviteSession && hasSessionRoster;

    // Same-screen: read full roster from runtime or ft_session_players
    let sameScreenPlayers = [];
    if (gameMode === 'same-screen') {
      if (runtimeHasRoster) {
        sameScreenPlayers = runtimePlayers;
      } else {
        try {
          const raw = sessionStorage.getItem('ft_session_players');
          if (raw) sameScreenPlayers = JSON.parse(raw) || [];
        } catch (_) { sameScreenPlayers = []; }
      }
    }
    const useSameScreenRoster = gameMode === 'same-screen' && sameScreenPlayers.length >= 2;

    const rosterPlayers = useRuntimeRoster ? runtimePlayers : (useSameScreenRoster ? sameScreenPlayers : sessionPlayers);

    const playerCount = (useRuntimeRoster || useSessionRoster || useSameScreenRoster)
      ? Math.max(2, Math.min(6, rosterPlayers.length))
      : Math.max(2, Math.min(6, parseInt(playerCount_raw, 10)));
    const humanName = dimensionalConfig?.humanName || kgPlayer?.name || decodeURIComponent(storedCfg.humanName || 'You');
    const humanAvatar = dimensionalConfig?.humanAvatar || kgPlayer?.avatar || decodeURIComponent(storedCfg.humanAvatar || '🎮');
    const aiDifficulty = dimensionalConfig?.aiDifficulty || kgGame?.aiDifficulty || storedCfg.aiDifficulty || 'normal';

    const initConfig = (useRuntimeRoster || useSessionRoster || useSameScreenRoster)
      ? {
        humanName,
        humanAvatar,
        aiDifficulty,
        launchMode: gameMode,
        myUserId: (sessionCache && sessionCache.my_user_id) || (runtimeCache && runtimeCache.session && runtimeCache.session.my_user_id),
        sessionPlayers: rosterPlayers.map((p) => ({
          user_id: p.user_id || p.id,
          username: p.username || p.name || 'Player',
          avatar: p.avatar || (p.avatarObj && (p.avatarObj.glyph || p.avatarObj.emoji)) || '👤',
          avatar_id: p.avatar_id || (p.avatarObj && p.avatarObj.id) || null,
          is_ai: !!(p.is_ai || p.isAI || p.is_bot),
          is_host: !!p.is_host,
          // Bot difficulty. initGame reads this off the session player
          // (`sp.level || sp.aiDifficulty`) and it keys AI_PROFILES in the game
          // core. It was being stripped here, so a difficulty chosen in the
          // lobby never survived the handoff and every bot came up 'normal'.
          level: (p.is_ai || p.isAI || p.is_bot)
            ? (p.level || p.aiDifficulty || p.difficulty || null)
            : null,
        })),
      }
      : { humanName, humanAvatar, aiDifficulty, launchMode: gameMode };

    // Merge dimensional config if present
    if (dimensionalConfig) {
      Object.assign(initConfig, dimensionalConfig);
    }

    // ── Shared deterministic seed (manifold-first, Phase 1) ──────────────────
    // Hand the game the ONE identifier every client in this session already
    // holds — the session code (fallback session id) — so all clients derive
    // the identical deck order instead of each shuffling with a private RNG.
    // Solo / same-screen have no session code, so the core falls back to a
    // stable per-game seed through the same code path. Only set if a seed
    // wasn't already supplied (e.g. by dimensionalConfig).
    if (initConfig.sessionSeed == null) {
      const _seed = sessionCode
        || (sessionCache && sessionCache.session_id)
        || (runtimeCache && runtimeCache.session && runtimeCache.session.session_id)
        || '';
      initConfig.sessionSeed = _seed ? String(_seed) : null;
    }

    const isDevObserver = usp.get('dev_observer') === '1' || kgGame?.devObserver === true;
    if (isDevObserver) {
      console.log('🛠️ DEV OBSERVER MODE: Forcing all AI players.');
      initConfig.sessionPlayers = Array.from({ length: playerCount }, (_, i) => ({
        is_ai: true,
        username: `Observer Bot ${i + 1}`,
        avatar: '🤖',
        level: aiDifficulty
      }));
      if (CameraDirector && CameraDirector.mode !== 'manual') {
        CameraDirector.mode = 'manual';
      }

      // --- DEV RECORDER ---
      const recBtn = document.createElement('button');
      recBtn.innerHTML = '🔴 REC';
      recBtn.style.cssText = 'position:fixed; top:10px; right:10px; z-index:9999; padding:8px 16px; background:red; color:white; font-weight:bold; border:none; border-radius:4px; cursor:pointer;';
      document.body.appendChild(recBtn);

      let mediaRecorder;
      let recordedChunks = [];
      recBtn.onclick = () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          recBtn.innerHTML = '🔴 REC';
          recBtn.style.background = 'red';
        } else {
          try {
            const stream = renderer.domElement.captureStream(30);
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
            mediaRecorder.ondataavailable = e => {
              if (e.data.size > 0) recordedChunks.push(e.data);
            };
            mediaRecorder.onstop = () => {
              const blob = new Blob(recordedChunks, { type: 'video/webm' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `kg_dev_capture_${Date.now()}.webm`;
              a.click();
              URL.revokeObjectURL(url);
              recordedChunks = [];
            };
            mediaRecorder.start();
            recBtn.innerHTML = '⏹ STOP';
            recBtn.style.background = '#666';
          } catch (err) {
            console.error('MediaRecorder error:', err);
            alert('Failed to start recording. See console.');
          }
        }
      };
    }

    // ── NO GAME, NO BOARD ────────────────────────────────────────────────
    // The board must never render unless a game was actually created: players
    // and bots chosen, and the host starting it. Opening 3d.html cold used to
    // fall through to a synthesized 2-player game, so the board came up in a
    // generic state with nobody real in it.
    //
    // A real launch always leaves a roster in sessionStorage, which is per-tab
    // and therefore cannot be a leftover: the lobby writes kg_session or
    // kg_fasttrack_runtime, same-screen and the solo setup write
    // ft_session_players. localStorage keys like KG_Game are NOT an acceptable
    // signal, because they survive across sessions and a stale one would look
    // exactly like a fresh launch.
    //
    // dev_observer is the one deliberate exception: it builds its own all-AI
    // roster above for recording, and is opted into explicitly by URL.
    // A roster is the strongest signal, but not the only legitimate one. The
    // lobby's own Play Solo button navigates to 3d.html?mode=solo&players=N
    // with no roster at all, and that IS an intentional launch. What a cold
    // open looks like is a bare URL with no query string whatsoever, so the
    // presence of launch params is what separates the two.
    // ?launch=1 is this codebase's established launch marker: see
    // js/substrates/game_setup.js consumeRuntime(), which treats its absence as
    // 'no game'. lobby-simple.html and the setup substrate both navigate with
    // it. mode/players/session/code cover the older direct-link contract.
    const launchedExplicitly = usp.get('launch') === '1'
      || usp.has('mode') || usp.has('players')
      || usp.has('session') || usp.has('code');

    const hasRealRoster = useRuntimeRoster || useSessionRoster || useSameScreenRoster
      || (Array.isArray(initConfig.sessionPlayers) && initConfig.sessionPlayers.length >= 2);

    if (!hasRealRoster && !launchedExplicitly && !isDevObserver) {
      console.warn('[ft] No game to render: reached the board without a roster from the lobby.');
      showNoGamePanel();
      return;
    }

    window.FastTrackCore.initGame(playerCount, initConfig);
    window.FastTrackCore.updateUI();
    renderBoard3D();
    publishDimensionalGraph({
      sessionId: sessionCache && sessionCache.session_id,
      mode: gameMode,
      code: sessionCode || inviteCode,
    });
    if (useSessionRoster) {
      console.log(`🎮 Game initialized from invite session: ${playerCount} players | code=${sessionCode || inviteCode}`);
    } else {
      console.log(`🎮 Game initialized: ${playerCount} players | human="${humanName}" ${humanAvatar} | bots=${aiDifficulty}`);
    }

    // ── Live multiplayer relay (private/public/multiplayer modes only) ──
    // The lobby page hands us the resolved roster via sessionStorage, but the
    // live WebSocket is closed by the navigation. Re-open it here so draws,
    // moves, and reshuffles are broadcast to peers via game_action and replayed
    // locally under FastTrackCore's _applying guard.
    const isLiveMpMode = (gameMode === 'private' || gameMode === 'public' || gameMode === 'multiplayer');
    const relayCode = (sessionCode || runtimeCode || inviteCode || '').toUpperCase().trim();
    if (isLiveMpMode && !relayCode) {
      console.warn('[ft-mp] live multiplayer requested without session code; redirecting to lobby');
      window.location.replace('/lobby/?game=fasttrack');
      return;
    }
    if (isLiveMpMode && window.KGMultiplayer && relayCode) {
      try {
        const mp = new window.KGMultiplayer('fasttrack');
        let joinIssued = false;
        let invalidCodeErrors = 0;
        let lastAppliedSeq = 0;
        let lastPublishedState = null;
        let statePublisherTimer = null;
        let colyseusClient = null;
        let colyseusRoom = null;
        let colyseusRoomId = '';
        let colyseusConnectInFlight = false;

        const resolveColyseusEndpoint = () => {
          const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
          return `${proto}//${location.host}/colyseus`;
        };

        const decodeSchemaTable = (tableLike) => {
          const out = {};
          if (!tableLike) return out;
          try {
            if (typeof tableLike.forEach === 'function') {
              tableLike.forEach((v, k) => {
                try { out[k] = JSON.parse(v); } catch (_) { out[k] = v; }
              });
              return out;
            }
            Object.keys(tableLike).forEach((k) => {
              const v = tableLike[k];
              try { out[k] = JSON.parse(v); } catch (_) { out[k] = v; }
            });
          } catch (_) { /* ignore */ }
          return out;
        };

        const applyColyseusState = (schemaState) => {
          // seq=0 is the empty initial Schema — skip to avoid wiping the local board
          if (!schemaState || schemaState.seq === 0) return false;
          if (!window.FastTrackCore || typeof window.FastTrackCore.applyStateSnapshot !== 'function') return false;
          const snapshot = {
            players: decodeSchemaTable(schemaState.players),
            board: decodeSchemaTable(schemaState.board),
            deck: decodeSchemaTable(schemaState.deck),
            turn: decodeSchemaTable(schemaState.turn),
            movement: decodeSchemaTable(schemaState.movement),
            safeZone: decodeSchemaTable(schemaState.safeZone),
            meta: decodeSchemaTable(schemaState.meta),
          };
          return window.FastTrackCore.applyStateSnapshot(snapshot);
        };

        const ensureColyseusConnection = async (roomId) => {
          const nextRoomId = String(roomId || '').trim();
          if (!nextRoomId) return false;
          if (!window.Colyseus || !window.Colyseus.Client) return false;
          if (colyseusConnectInFlight) return false;
          if (colyseusRoom && colyseusRoomId === nextRoomId) return true;

          colyseusConnectInFlight = true;
          try {
            if (!colyseusClient) {
              colyseusClient = new window.Colyseus.Client(resolveColyseusEndpoint());
            }
            if (colyseusRoom && typeof colyseusRoom.leave === 'function') {
              try { await colyseusRoom.leave(); } catch (_) { /* ignore */ }
            }

            const room = await colyseusClient.joinById(nextRoomId, {
              userId: mp.userId || null,
              username: localStorage.getItem('username') || localStorage.getItem('display_name') || 'Player',
              avatarId: (() => {
                try {
                  const av = JSON.parse(localStorage.getItem('kg_avatar') || 'null');
                  return av && (av.id || av.emoji) ? String(av.id || av.emoji) : null;
                } catch (_) { return null; }
              })(),
            });

            colyseusRoom = room;
            colyseusRoomId = nextRoomId;

            const mpBridge = {
              connected: true,
              get isHost() { return !!mp.isHost; },
              userId: mp.userId || null,
              sendAction(action, payload) {
                if (!colyseusRoom) return;
                colyseusRoom.send('game_action', { action, payload: payload || {} });
              },
              sendGameState(state) {
                if (!colyseusRoom) return;
                const frame = state && state.fasttrack ? state.fasttrack : state;
                colyseusRoom.send('push_state', { state: frame });
              }
            };

            room.onStateChange((st) => {
              if (!st) return;
              const seq = Number.isFinite(st.seq) ? st.seq : 0;
              if (seq && seq <= lastAppliedSeq) return;
              const ok = applyColyseusState(st);
              if (ok && seq) lastAppliedSeq = seq;
            });

            room.onMessage('game_action', (msg) => {
              if (!msg || !msg.action) return;
              if (msg.from && mp.userId && String(msg.from) === String(mp.userId)) return;
              try { window.FastTrackCore.applyRemoteAction(msg.action, msg.payload); }
              catch (err) { console.warn('[ft-colyseus] applyRemoteAction failed', msg.action, err); }
            });

            room.onMessage('turn_change', (msg) => {
              if (!msg || !msg.x) return;
              try {
                const isMyTurn = mp.userId && String(msg.x) === String(mp.userId);
                const statusEl = document.getElementById('game-status');
                if (statusEl) statusEl.textContent = isMyTurn ? 'Your turn' : 'Opponent turn';
              } catch (_) { /* ignore */ }
            });

            room.onLeave(() => {
              if (colyseusRoom === room) {
                colyseusRoom = null;
                colyseusRoomId = '';
              }
            });

            window.FastTrackCore.setMultiplayerClient(mpBridge);
            window.__FT_MP__ = mp;
            window.__FT_COLYSEUS_ROOM__ = room;
            if (mpBridge.isHost) {
              publishAuthoritativeState(true);
            }
            console.log('[ft-colyseus] connected room=' + nextRoomId);
            return true;
          } catch (err) {
            console.warn('[ft-colyseus] connect failed, staying on socket relay', err);
            return false;
          } finally {
            colyseusConnectInFlight = false;
          }
        };

        const publishAuthoritativeState = (force = false) => {
          if (!mp || !mp.connected || !mp.isHost) return;
          if (!window.FastTrackCore || typeof window.FastTrackCore.getStateSnapshot !== 'function') return;
          try {
            const snapshot = window.FastTrackCore.getStateSnapshot();
            const encoded = JSON.stringify(snapshot);
            if (!force && encoded === lastPublishedState) return;
            lastPublishedState = encoded;
            if (colyseusRoom) {
              colyseusRoom.send('push_state', { state: snapshot });
            } else {
              mp.sendGameState({ fasttrack: snapshot });
            }
          } catch (err) {
            console.warn('[ft-mp] publish authoritative state failed', err);
          }
        };

        // ── STATE ON EVERY DELTA ────────────────────────────────────────
        // The core fires this after every draw, move and turn rotation. The
        // host answers by publishing the resulting authoritative state, so all
        // seats hold the SAME game rather than each re-simulating and drifting.
        //
        // The earlier objection to publishing this often was that snapshots
        // teleported peer pegs mid-hop. That is no longer true: the receiving
        // side buffers a snapshot while `isPlayResolving()` and flushes it once
        // `waitForAnimations` drains, keeping only the latest frame (see the
        // pending-snapshot buffer below). So state converges immediately while
        // the visuals still finish the hop they were playing.
        //
        // publishAuthoritativeState already no-ops when we are not the host and
        // dedupes on lastPublishedState, so a delta that changed nothing costs
        // one JSON.stringify and no traffic.
        try {
          window.FastTrackCore.setStateCommittedHandler(() => publishAuthoritativeState());
        } catch (err) {
          console.warn('[ft-mp] could not register the state-committed publisher', err);
        }

        const ensurePublisher = () => {
          if (statePublisherTimer) return;
          // Delta-only broadcast: every move/draw/turn_advance already goes
          // out as a `game_action` delta and peers replay it under the
          // _applying guard with full local hop animations. Sending a
          // full-state snapshot on a tight 250 ms cadence was teleporting
          // peer pegs mid-hop. Keep the periodic publisher only as a slow
          // catch-up safety net (5 s) — `lastPublishedState` dedupe means
          // it usually emits nothing.
          // Now only a backstop: the delta hook above is the primary path.
          // Kept so a dropped delta still reconciles within a few seconds.
          statePublisherTimer = setInterval(publishAuthoritativeState, 5000);
        };
        const ensureJoined = () => {
          if (joinIssued) return;
          const activeCode = (mp.session && mp.session.session_code ? String(mp.session.session_code) : '').toUpperCase().trim();
          if (activeCode === relayCode) return;
          joinIssued = true;
          mp.joinByCode(relayCode);
        };

        mp.on('authenticated', ({ userId }) => {
          try { window.FastTrackCore.setMyUserId(userId || null); } catch (_) { /* ignore */ }
          ensureJoined();
        });

        mp.on('game_action', (msg) => {
          if (colyseusRoom) return;
          if (!msg || !msg.action) return;
          // Skip our own echoes — server fans out to all peers including the sender.
          if (msg.from && mp.userId && String(msg.from) === String(mp.userId)) return;
          try {
            // Delta-only: applyRemoteAction replays the move locally with
            // full hop animation. Do NOT immediately re-broadcast a full
            // state snapshot — that snapshot would race the peer's own
            // in-flight hop animation and yank pegs to authoritative
            // positions, producing chaotic motion. The periodic 5 s
            // catch-up publisher (with dedupe) is sufficient.
            window.FastTrackCore.applyRemoteAction(msg.action, msg.payload);
            // applyRemoteAction runs the core, which fires the state-committed
            // hook, which publishes when we are the host. Nothing extra needed
            // here; this comment exists because the old code deliberately did
            // NOT republish and the reason no longer holds.
          }
          catch (err) { console.warn('[ft-mp] applyRemoteAction failed', msg.action, err); }
        });
        // Pending snapshot buffer — if a snapshot arrives while peg-hop
        // animations (or the renderBoard barrier) are in flight, applying
        // it would teleport pegs mid-hop and produce visually chaotic
        // movement. Keep only the latest pending frame and replay it once
        // animations drain.
        let _pendingSnapshotFrame = null;
        let _pendingSnapshotSeq = 0;
        let _pendingSnapshotScheduled = false;
        const flushPendingSnapshot = () => {
          _pendingSnapshotScheduled = false;
          const frame = _pendingSnapshotFrame;
          const seq = _pendingSnapshotSeq;
          _pendingSnapshotFrame = null;
          _pendingSnapshotSeq = 0;
          if (!frame) return;
          // Re-check the barrier in case more animations started while we
          // were waiting; if so, re-defer.
          if (typeof window.isPlayResolving === 'function' && window.isPlayResolving()) {
            _pendingSnapshotFrame = frame;
            _pendingSnapshotSeq = seq;
            if (!_pendingSnapshotScheduled && typeof window.waitForAnimations === 'function') {
              _pendingSnapshotScheduled = true;
              window.waitForAnimations(flushPendingSnapshot);
            }
            return;
          }
          try {
            const ok = window.FastTrackCore && typeof window.FastTrackCore.applyStateSnapshot === 'function'
              ? window.FastTrackCore.applyStateSnapshot(frame)
              : false;
            if (ok && seq) lastAppliedSeq = seq;
          } catch (err) {
            console.warn('[ft-mp] deferred snapshot apply failed', err);
          }
        };
        mp.on('game_state', (msg) => {
          if (colyseusRoom) return;
          if (!msg || !msg.state) return;
          const seq = Number.isFinite(msg.seq) ? msg.seq : 0;
          if (seq && seq <= lastAppliedSeq) return;
          const frame = msg.state && msg.state.fasttrack ? msg.state.fasttrack : msg.state;
          // Defer apply if local hop animations / renderBoard barrier are
          // still in flight — applying mid-hop yanks pegs to authoritative
          // positions and looks chaotic. Always keep only the LATEST frame.
          if (typeof window.isPlayResolving === 'function' && window.isPlayResolving()) {
            // Only overwrite the pending buffer if this snapshot is newer.
            if (!_pendingSnapshotSeq || seq === 0 || seq > _pendingSnapshotSeq) {
              _pendingSnapshotFrame = frame;
              _pendingSnapshotSeq = seq;
            }
            if (!_pendingSnapshotScheduled && typeof window.waitForAnimations === 'function') {
              _pendingSnapshotScheduled = true;
              window.waitForAnimations(flushPendingSnapshot);
            }
            return;
          }
          const ok = window.FastTrackCore && typeof window.FastTrackCore.applyStateSnapshot === 'function'
            ? window.FastTrackCore.applyStateSnapshot(frame)
            : false;
          if (!ok) return;
          if (seq) lastAppliedSeq = seq;
        });
        mp.on('session_update', (session) => {
          if (!session) return;
          // Server auto-resumes our seat on guest_login; capture host status so
          // _isHost() reflects reality for reshuffle authority.
          mp.isHost = session.host_id === mp.userId;
          const activeCode = (session.session_code ? String(session.session_code) : '').toUpperCase().trim();
          if (activeCode && activeCode === relayCode) {
            joinIssued = true;
          }
          try {
            window.FastTrackCore.setMyUserId(mp.userId || null);
            window.FastTrackCore.updateSessionRoster(session.players || []);
            // Always force republish on session_update so late-joining peers
            // get the canonical deck/board even if state hasn't mutated.
            if (mp.isHost) publishAuthoritativeState(true);
          } catch (err) {
            console.warn('[ft-mp] failed to apply authoritative roster', err);
          }

          if (session.colyseus_room_id) {
            ensureColyseusConnection(session.colyseus_room_id);
          }
        });
        mp.on('colyseus_room', (data) => {
          const roomId = data && data.roomId ? String(data.roomId) : '';
          if (roomId) ensureColyseusConnection(roomId);
        });
        mp.on('pm_game_ready', (data) => {
          const roomId = data && data.colyseus_room_id ? String(data.colyseus_room_id) : '';
          if (roomId) ensureColyseusConnection(roomId);
        });
        // Host cancelled the session (or the server tore it down). Drop all
        // cached runtime so a refresh / re-launch can't resurrect the dead
        // game, then bounce back to the lobby.
        mp.on('session_cancelled', (data) => {
          try { window.KGGameCache && KGGameCache.purgeRuntime('mp_session_cancelled'); } catch (_) { }
          try {
            const reason = (data && data.reason) ? String(data.reason) : 'cancelled';
            const msg = (reason === 'host_cancelled')
              ? 'The host cancelled this game.'
              : 'This game was cancelled.';
            if (typeof window.alert === 'function') window.alert(msg);
          } catch (_) { }
          try { window.location.replace('/lobby/?game=fasttrack'); } catch (_) { }
        });
        // Game completed (winner declared by some peer / the server). Wipe
        // cached runtime everywhere so the next launch starts clean.
        mp.on('game_over', () => {
          try { window.KGGameCache && KGGameCache.purgeRuntime('mp_game_over'); } catch (_) { }
        });
        mp.on('error', (message) => {
          if (!message) return;
          const m = String(message).toLowerCase();
          if (m.includes('invalid game code') || m.includes('session not found')) {
            invalidCodeErrors += 1;
            const activeCode = (mp.session && mp.session.session_code ? String(mp.session.session_code) : '').toUpperCase().trim();
            // Retry once before fail-closed redirect to avoid transient reconnect race.
            if (activeCode === relayCode) return;
            if (invalidCodeErrors < 2) {
              joinIssued = false;
              setTimeout(() => ensureJoined(), 800);
              return;
            }
            console.warn('[ft-mp] session attach failed after retry, redirecting to lobby', message);
            window.location.replace('/lobby/?game=fasttrack');
          }
        });
        mp.connect();
        ensurePublisher();
        // If auth arrives late or session resume fails, issue explicit join retry.
        setTimeout(() => ensureJoined(), 1200);

        // Try immediate colyseus attach from cached session/runtime data.
        try {
          const cachedRoom = (sessionCache && sessionCache.colyseus_room_id) ||
            (runtimeCache && runtimeCache.session && runtimeCache.session.colyseus_room_id) || '';
          if (cachedRoom) ensureColyseusConnection(cachedRoom);
        } catch (_) { /* ignore */ }

        window.FastTrackCore.setMultiplayerClient(mp);
        window.__FT_MP__ = mp;
        console.log('🌐 FastTrack multiplayer relay attached | code=' + relayCode);
      } catch (err) {
        console.warn('[ft-mp] failed to attach multiplayer relay', err);
      }
    }
  }

  // 🜂 Expose Three.js scene for Schwarz Diamond renderer and any substrate lens
  window.FT3DScene = scene;
  window.FT3DCamera = camera;
  window.FT3DRenderer = renderer;

  // Pre-compile every shader/material in the scene and force a real first
  // frame BEFORE dismissing the loader. Without this, ft3d:ready fires while
  // the WebGL pipeline is still compiling on the next render() call, and the
  // user sees the loader fade into a black canvas for ~1–2 s.
  try { renderer.compile(scene, camera); } catch (e) { console.warn('renderer.compile failed', e); }
  try { renderer.render(scene, camera); } catch (e) { console.warn('initial render failed', e); }

  // Start animation loop AFTER the first frame is on screen.
  animate3D();

  // Notify Schwarz Diamond renderer (and any other manifold substrates) that
  // 3D is ready. Defer one rAF so the browser commits the first frame to the
  // compositor before the loader begins fading out.
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('ft3d:ready'));
  });

  // Wire painting click handler
  _buildArtOverlay();
  _wireArtClickHandler();

  // Wire pick-on-board handler (desktop: click holes/route to pick a move).
  setupBoardPickHandler();

  console.log('✅ FastTrack 3D Billiard Room initialized | 🜂 manifold surface active');
}

// ════════════════════════════════════════════════════════════════
// PAINTING GALLERY — click overlay + storefront link
// ════════════════════════════════════════════════════════════════

/**
 * Inject the gallery overlay DOM elements once.
 * The overlay sits over the canvas; clicking anywhere dismisses it,
 * the "Purchase" button opens the storefront in a new tab.
 */
function _buildArtOverlay() {
  if (document.getElementById('art-gallery-overlay')) return; // already built

  const overlay = document.createElement('div');
  overlay.id = 'art-gallery-overlay';
  overlay.innerHTML = `
    <div id="ago-backdrop"></div>
    <div id="ago-card">
      <button id="ago-close" title="Close">✕</button>
      <img id="ago-img" alt="painting" />
      <div id="ago-meta">
        <h2 id="ago-title"></h2>
        <p  id="ago-details"></p>
        <button id="ago-store">🛍 Purchase Prints &amp; Merch</button>
      </div>
    </div>`;

  // Styles — injected inline so no separate CSS file is needed
  const style = document.createElement('style');
  style.textContent = `
    #art-gallery-overlay {
      display: none;
      position: fixed; inset: 0; z-index: 9000;
      align-items: center; justify-content: center;
    }
    #art-gallery-overlay.visible { display: flex; }
    #ago-backdrop {
      position: absolute; inset: 0;
      background: rgba(4, 2, 10, 0.88);
      backdrop-filter: blur(6px);
      cursor: pointer;
    }
    #ago-card {
      position: relative; z-index: 1;
      display: flex; flex-direction: column; align-items: center;
      max-width: 88vw; max-height: 92vh;
      background: linear-gradient(160deg, #1a0f05 0%, #0d0a18 100%);
      border: 1px solid rgba(255,180,80,0.25);
      border-radius: 6px;
      box-shadow: 0 0 120px rgba(255,140,30,0.18), 0 0 40px rgba(0,0,0,0.9);
      padding: 28px 32px 24px;
      gap: 20px;
    }
    #ago-close {
      position: absolute; top: 12px; right: 14px;
      background: none; border: none;
      color: rgba(255,255,255,0.45); font-size: 12px;
      cursor: pointer; line-height: 1;
      transition: color 0.2s;
    }
    #ago-close:hover { color: #fff; }
    #ago-img {
      max-height: 58vh; max-width: 78vw;
      object-fit: contain;
      border: 3px solid #6B1C0A;
      box-shadow: 0 0 60px rgba(255,160,60,0.22), 0 8px 32px rgba(0,0,0,0.7);
      border-radius: 2px;
      cursor: pointer;
    }
    #ago-meta {
      text-align: center; color: #f0e8d8;
    }
    #ago-title {
      margin: 0 0 6px;
      font-size: clamp(11px, 1.48vw, 17px);
      font-family: Georgia, serif;
      color: #ffe8b0;
      letter-spacing: 0.04em;
    }
    #ago-details {
      margin: 0 0 16px;
      font-size: clamp(7px, 0.87vw, 10px);
      color: rgba(240,232,216,0.7);
      font-style: italic;
    }
    #ago-store {
      padding: 10px 28px;
      background: linear-gradient(135deg, #8B1a00, #cc4400);
      color: #fff;
      border: none; border-radius: 4px;
      font-size: clamp(8px, 0.93vw, 11px);
      font-weight: 600;
      cursor: pointer;
      letter-spacing: 0.03em;
      transition: transform 0.15s, box-shadow 0.15s;
      box-shadow: 0 4px 18px rgba(200,60,0,0.4);
    }
    #ago-store:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 28px rgba(220,80,0,0.55);
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(overlay);

  // Close on backdrop click
  document.getElementById('ago-backdrop').addEventListener('click', _hideArtOverlay);
  document.getElementById('ago-close').addEventListener('click', _hideArtOverlay);

  // Store button — art-specific URL set when overlay is shown
  document.getElementById('ago-store').addEventListener('click', () => {
    const url = document.getElementById('ago-store').dataset.storeUrl || 'https://kensgames.com/store';
    window.open(url, '_blank', 'noopener');
  });
}

function _showArtOverlay(art) {
  const overlay = document.getElementById('art-gallery-overlay');
  if (!overlay) return;

  // Image source: manifold ART_DATA base64, else direct file path
  const dataUrl = (typeof ART_DATA !== 'undefined') && ART_DATA[art.file];
  document.getElementById('ago-img').src = dataUrl || `assets/images/art/${art.file}`;
  document.getElementById('ago-title').textContent = art.title || art.file.replace(/\.(png|webp|jpe?g)$/i, '');
  document.getElementById('ago-details').textContent =
    `${art.artist || 'Unknown'}  ·  ${art.medium || ''}  ·  ${art.year || ''}`;

  const storeUrl = art.storeUrl || `https://kensgames.com/store?painting=${encodeURIComponent(art.file)}`;
  document.getElementById('ago-store').dataset.storeUrl = storeUrl;

  overlay.classList.add('visible');
  // Pause OrbitControls so mouse drag doesn't fire while overlay is open
  if (controls) controls.enabled = false;
}

function _hideArtOverlay() {
  const overlay = document.getElementById('art-gallery-overlay');
  if (overlay) overlay.classList.remove('visible');
  if (controls) controls.enabled = true;
}

/**
 * Raycaster — fires on every click on the renderer canvas.
 * If a painting canvas mesh is hit, opens the gallery overlay.
 */
function _wireArtClickHandler() {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  renderer.domElement.addEventListener('click', (e) => {
    // Don't fire if the overlay is already visible
    if (document.getElementById('art-gallery-overlay')?.classList.contains('visible')) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(artClickMeshes, false);

    if (hits.length > 0) {
      const art = hits[0].object.userData.artInfo;
      if (art) _showArtOverlay(art);
    }
  });

  // Cursor hint — pointer over paintings
  renderer.domElement.addEventListener('mousemove', (e) => {
    if (document.getElementById('art-gallery-overlay')?.classList.contains('visible')) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(artClickMeshes, false);
    renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : '';
  });
}

// ════════════════════════════════════════════════════════════════
// ENVIRONMENT MAP — warm room reflections via PMREMGenerator
// ════════════════════════════════════════════════════════════════
function createEnvironmentMap() {
  // Build a small procedural "room" scene for reflection capture
  const envScene = new THREE.Scene();

  // Warm ceiling light (dominant reflection source)
  const ceilPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshBasicMaterial({ color: 0xffeedd, side: THREE.DoubleSide })
  );
  ceilPlane.position.y = 100;
  ceilPlane.rotation.x = Math.PI / 2;
  envScene.add(ceilPlane);

  // Dark warm walls
  const wallMat = new THREE.MeshBasicMaterial({ color: 0x1a110a, side: THREE.DoubleSide });
  const addEnvWall = (px, py, pz, rx, ry) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(200, 100), wallMat);
    w.position.set(px, py, pz);
    w.rotation.set(rx || 0, ry || 0, 0);
    envScene.add(w);
  };
  addEnvWall(0, 50, -100, 0, 0);
  addEnvWall(0, 50, 100, 0, Math.PI);
  addEnvWall(-100, 50, 0, 0, Math.PI / 2);
  addEnvWall(100, 50, 0, 0, -Math.PI / 2);

  // Dark floor with slight warmth
  const floorPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshBasicMaterial({ color: 0x0a0705, side: THREE.DoubleSide })
  );
  floorPlane.rotation.x = -Math.PI / 2;
  envScene.add(floorPlane);

  // Warm accent lights in the env scene
  const envLight1 = new THREE.PointLight(0xffcc88, 1.5, 300);
  envLight1.position.set(0, 80, 0);
  envScene.add(envLight1);
  const envLight2 = new THREE.PointLight(0xff9944, 0.5, 200);
  envLight2.position.set(40, 60, 40);
  envScene.add(envLight2);

  // Generate PMREM environment map
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileCubemapShader();
  const envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
  scene.environment = envMap;  // all PBR materials will pick this up
  pmremGenerator.dispose();
  console.log('🌍 Environment map generated');
}

// ════════════════════════════════════════════════════════════════
// PROCEDURAL NORMAL MAP GENERATOR — creates bump detail from canvas
// ════════════════════════════════════════════════════════════════
function generateNormalMap(canvas, strength) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const src = ctx.getImageData(0, 0, w, h).data;
  const nCanvas = document.createElement('canvas');
  nCanvas.width = w; nCanvas.height = h;
  const nCtx = nCanvas.getContext('2d');
  const dst = nCtx.createImageData(w, h);
  const s = strength || 2.0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      // Sample neighbors for height gradient
      const getH = (cx, cy) => {
        const ci = (((cy + h) % h) * w + ((cx + w) % w)) * 4;
        return (src[ci] + src[ci + 1] + src[ci + 2]) / 765.0;
      };
      const dX = (getH(x + 1, y) - getH(x - 1, y)) * s;
      const dY = (getH(x, y + 1) - getH(x, y - 1)) * s;
      // Normal = normalize(-dX, -dY, 1)
      const len = Math.sqrt(dX * dX + dY * dY + 1);
      dst.data[idx] = ((-dX / len) * 0.5 + 0.5) * 255;
      dst.data[idx + 1] = ((-dY / len) * 0.5 + 0.5) * 255;
      dst.data[idx + 2] = ((1.0 / len) * 0.5 + 0.5) * 255;
      dst.data[idx + 3] = 255;
    }
  }
  nCtx.putImageData(dst, 0, 0);
  const tex = new THREE.CanvasTexture(nCanvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ════════════════════════════════════════════════════════════════
// LIGHTING SETUP
// ════════════════════════════════════════════════════════════════
function setupLighting() {
  // ── AMBIENT — low base fill so shadows stay deep and contrasty ──
  const ambient = new THREE.AmbientLight(0xffd4a0, 0.15);
  scene.add(ambient);

  // ── HEMISPHERE — sky/ground color gradient, kept low for shadow depth ──
  const hemi = new THREE.HemisphereLight(0x8090b0, 0x1a1208, 0.18);
  scene.add(hemi);

  // ── KEY LIGHT — warm overhead directional (simulates billiard lamp) ──
  const keyLight = new THREE.DirectionalLight(0xffe8cc, 1.6);
  keyLight.position.set(0, ROOM_HEIGHT - 50, 0);
  keyLight.target.position.set(0, TABLE_HEIGHT, 0);
  keyLight.castShadow = true;
  // 2048² shadow map: visually indistinguishable from 4096² at this scene
  // scale, but ~4× cheaper to allocate, clear, and render on first frame —
  // the dominant cost of init3D. PCFSoft hides any residual aliasing.
  // The quality manifold steps this down to 1024 on weaker machines.
  const _ftKeyShadow = ((window.FT_QUALITY && window.FT_QUALITY.shadowMapSize) || 2048);
  keyLight.shadow.mapSize.width = _ftKeyShadow;
  keyLight.shadow.mapSize.height = _ftKeyShadow;
  keyLight.shadow.camera.left = -400;
  keyLight.shadow.camera.right = 400;
  keyLight.shadow.camera.top = 400;
  keyLight.shadow.camera.bottom = -400;
  keyLight.shadow.camera.near = 50;
  keyLight.shadow.camera.far = 600;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);
  scene.add(keyLight.target);

  // ── SPOT LIGHTS — focused warm pools on the table (like recessed ceiling cans) ──
  const spotPositions = [
    { x: -120, z: -80 },
    { x: 120, z: -80 },
    { x: 0, z: 120 },
  ];
  // The three table spotlights each carry their own shadow map (four shadow
  // passes total with the key light). Only the strong tiers can afford them;
  // below `spotShadows` they still light the table, just without casting.
  const _ftSpotShadows = !window.FT_QUALITY || window.FT_QUALITY.spotShadows !== false;
  spotPositions.forEach(sp => {
    const spot = new THREE.SpotLight(0xffeedd, 150, 500, Math.PI / 5, 0.6, 1.5);
    spot.position.set(sp.x, ROOM_HEIGHT - 20, sp.z);
    spot.target.position.set(sp.x * 0.3, TABLE_HEIGHT, sp.z * 0.3);
    spot.castShadow = _ftSpotShadows;
    spot.shadow.mapSize.width = 1024;
    spot.shadow.mapSize.height = 1024;
    scene.add(spot);
    scene.add(spot.target);
  });

  // ── FILL LIGHT — cool fill from camera direction (reduced for contrast) ──
  const fillLight = new THREE.DirectionalLight(0xc0d0e8, 0.2);
  fillLight.position.set(0, 200, 500);
  scene.add(fillLight);

  // ── RIM LIGHT — back-light for depth separation ──
  const rimLight = new THREE.DirectionalLight(0xffd0a0, 0.15);
  rimLight.position.set(0, 150, -400);
  scene.add(rimLight);

  // ── WALL WASH — subtle uplights to brighten the room walls ──
  const wallWashPositions = [
    { x: 0, z: -ROOM_DEPTH / 2 + 60 },    // back wall
    { x: -ROOM_WIDTH / 2 + 60, z: 0 },     // left wall
    { x: ROOM_WIDTH / 2 - 60, z: 0 },      // right wall
    { x: 0, z: ROOM_DEPTH / 2 - 60 },      // front wall
  ];
  wallWashPositions.forEach(wp => {
    const wash = new THREE.PointLight(0xffe0b0, 60, 400, 2);
    wash.position.set(wp.x, ROOM_HEIGHT - 30, wp.z);
    scene.add(wash);
  });

  // ── PICTURE DISPLAY LIGHTS — warm spotlights above each painting ──
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0x8B7535, roughness: 0.3, metalness: 0.8
  });

  ART_PLACEHOLDERS.forEach(art => {
    // Compute world position of this painting's top-center
    let lx, ly, lz, tx, ty, tz;
    const lightOffset = 40;  // how far in front of wall the light sits
    ly = art.y + art.height / 2 + 30; // above the painting
    ty = art.y;                        // aim at painting center

    if (art.wall === 'back') {
      lx = art.x; lz = -ROOM_DEPTH / 2 + lightOffset;
      tx = art.x; tz = -ROOM_DEPTH / 2 + 5;
    } else if (art.wall === 'left') {
      lx = -ROOM_WIDTH / 2 + lightOffset; lz = art.x;
      tx = -ROOM_WIDTH / 2 + 5; tz = art.x;
    } else if (art.wall === 'right') {
      lx = ROOM_WIDTH / 2 - lightOffset; lz = art.x;
      tx = ROOM_WIDTH / 2 - 5; tz = art.x;
    } else if (art.wall === 'front') {
      lx = art.x; lz = ROOM_DEPTH / 2 - lightOffset;
      tx = art.x; tz = ROOM_DEPTH / 2 - 5;
    }

    // Spotlight aimed at painting
    const picLight = new THREE.SpotLight(0xfff0d4, 120, 300, Math.PI / 6, 0.7, 1.5);
    picLight.position.set(lx, ly, lz);
    picLight.target.position.set(tx, ty, tz);
    scene.add(picLight);
    scene.add(picLight.target);

    // Display light fixture — small brass arm + shade
    const armGeo = new THREE.BoxGeometry(art.width * 0.5, 3, 4);
    const arm = new THREE.Mesh(armGeo, brassMat);
    const shadeGeo = new THREE.CylinderGeometry(3, 5, 6, 8);
    const shade = new THREE.Mesh(shadeGeo, brassMat);

    const fixtureGroup = new THREE.Group();
    fixtureGroup.add(arm);
    shade.position.set(0, -4, 2);
    shade.rotation.x = Math.PI / 6;
    fixtureGroup.add(shade);

    // Position fixture above painting on the wall
    if (art.wall === 'back') {
      fixtureGroup.position.set(art.x, art.y + art.height / 2 + 15, -ROOM_DEPTH / 2 + 6);
    } else if (art.wall === 'left') {
      fixtureGroup.position.set(-ROOM_WIDTH / 2 + 6, art.y + art.height / 2 + 15, art.x);
      fixtureGroup.rotation.y = Math.PI / 2;
    } else if (art.wall === 'right') {
      fixtureGroup.position.set(ROOM_WIDTH / 2 - 6, art.y + art.height / 2 + 15, art.x);
      fixtureGroup.rotation.y = -Math.PI / 2;
    } else if (art.wall === 'front') {
      fixtureGroup.position.set(art.x, art.y + art.height / 2 + 15, ROOM_DEPTH / 2 - 6);
      fixtureGroup.rotation.y = Math.PI;
    }
    scene.add(fixtureGroup);
  });

  // ── BULLSEYE GLOW — warm billiard-lamp amber accent over the center ──
  const centerLight = new THREE.PointLight(0xffcc44, 80, 220, 2);
  centerLight.position.set(0, TABLE_HEIGHT + 40, 0);
  scene.add(centerLight);
}

// ════════════════════════════════════════════════════════════════
// HEXAGON BOARD - Thick beveled base with dark playing surface
// ════════════════════════════════════════════════════════════════
function createHexagonBoard() {
  // --- BOARD BASE (tan/cream beveled box) --- flush against rail inner wall
  const baseShape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI / 3) - Math.PI / 6;
    const x = Math.cos(angle) * (BOARD_RADIUS + RAIL_WIDTH);
    const y = Math.sin(angle) * (BOARD_RADIUS + RAIL_WIDTH);
    if (i === 0) baseShape.moveTo(x, y);
    else baseShape.lineTo(x, y);
  }
  baseShape.closePath();

  const baseSettings = {
    depth: BOARD_THICKNESS,
    bevelEnabled: true,
    bevelSize: BOARD_BEVEL,
    bevelThickness: BOARD_BEVEL * 0.6,
    bevelSegments: 4
  };
  const baseGeometry = new THREE.ExtrudeGeometry(baseShape, baseSettings);
  baseGeometry.rotateX(-Math.PI / 2);
  baseGeometry.translate(0, -BOARD_THICKNESS, 0);

  // Dark mahogany base matching billiard table rails
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a2a08,
    roughness: 0.35,
    metalness: 0.12
  });
  const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
  baseMesh.receiveShadow = true;
  baseMesh.castShadow = true;
  boardGroup.add(baseMesh);

  // --- PLAYING SURFACE (dark black) ---
  const surfaceShape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI / 3) - Math.PI / 6;
    const x = Math.cos(angle) * (BOARD_RADIUS - 5);
    const y = Math.sin(angle) * (BOARD_RADIUS - 5);
    if (i === 0) surfaceShape.moveTo(x, y);
    else surfaceShape.lineTo(x, y);
  }
  surfaceShape.closePath();

  const surfaceGeometry = new THREE.ExtrudeGeometry(surfaceShape, { depth: 3, bevelEnabled: false });
  surfaceGeometry.rotateX(-Math.PI / 2);
  surfaceGeometry.translate(0, 0, 0);

  // ── BILLIARD FELT surface — procedural woven green baize (matches table) ──
  const boardFeltCanvas = document.createElement('canvas');
  boardFeltCanvas.width = 256; boardFeltCanvas.height = 256;
  const bfc = boardFeltCanvas.getContext('2d');
  bfc.fillStyle = '#0a6e1e';
  bfc.fillRect(0, 0, 256, 256);
  for (let fy = 0; fy < 256; fy++) {
    for (let fx = 0; fx < 256; fx += 2) {
      const noise = Math.random() * 10 - 5;
      const g = 42 + noise;
      bfc.fillStyle = `rgb(${18 + noise * 0.2}, ${g}, ${18 + noise * 0.2})`;
      bfc.fillRect(fx, fy, 2, 1);
    }
  }
  const boardFeltTex = new THREE.CanvasTexture(boardFeltCanvas);
  boardFeltTex.wrapS = boardFeltTex.wrapT = THREE.RepeatWrapping;
  boardFeltTex.repeat.set(5, 5);
  const surfaceMaterial = new THREE.MeshStandardMaterial({
    map: boardFeltTex,
    color: 0x0e7a24,
    roughness: 0.92,
    metalness: 0.0
  });
  boardMesh = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
  boardMesh.receiveShadow = true;
  boardGroup.add(boardMesh);

  // --- DECORATIVE STARS (gold stars at FT positions + scattered accents) ---
  createDecorativeStars();
  // Bullseye is created later in createGameElements() via createBullseye()
}

// ════════════════════════════════════════════════════════════════
// RAINBOW BORDER - Thick raised 3D segments
// ════════════════════════════════════════════════════════════════
function createRainbowBorder() {
  for (let i = 0; i < 6; i++) {
    const angle1 = (i * Math.PI / 3) - Math.PI / 6;
    const angle2 = ((i + 1) * Math.PI / 3) - Math.PI / 6;

    const x1 = Math.cos(angle1) * (BOARD_RADIUS + 8);
    const z1 = Math.sin(angle1) * (BOARD_RADIUS + 8);
    const x2 = Math.cos(angle2) * (BOARD_RADIUS + 8);
    const z2 = Math.sin(angle2) * (BOARD_RADIUS + 8);

    const midX = (x1 + x2) / 2;
    const midZ = (z1 + z2) / 2;
    const length = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
    const edgeAngle = Math.atan2(z2 - z1, x2 - x1);

    // Lacquered rail segment — gradient top-light to base-shadow like card backs
    const geometry = new THREE.BoxGeometry(length * 0.92, BORDER_HEIGHT, BORDER_WIDTH, 1, 1, 1);
    const r0 = (RAINBOW_COLORS[i] >> 16) & 0xff;
    const g0 = (RAINBOW_COLORS[i] >> 8) & 0xff;
    const b0 = RAINBOW_COLORS[i] & 0xff;
    const gradCanvas = document.createElement('canvas');
    gradCanvas.width = 4; gradCanvas.height = 32;
    const gctx = gradCanvas.getContext('2d');
    const grd = gctx.createLinearGradient(0, 0, 0, 32);
    grd.addColorStop(0, `rgb(${Math.min(r0 + 80, 255)},${Math.min(g0 + 80, 255)},${Math.min(b0 + 80, 255)})`);
    grd.addColorStop(0.30, `rgb(${r0},${g0},${b0})`);
    grd.addColorStop(1, `rgb(${Math.max(r0 - 70, 0)},${Math.max(g0 - 70, 0)},${Math.max(b0 - 70, 0)})`);
    gctx.fillStyle = grd;
    gctx.fillRect(0, 0, 4, 32);
    const gradTex = new THREE.CanvasTexture(gradCanvas);
    const material = new THREE.MeshStandardMaterial({
      map: gradTex,
      roughness: 0.22,
      metalness: 0.35,
      emissive: new THREE.Color(RAINBOW_COLORS[i]),
      emissiveIntensity: 0.04,
      envMapIntensity: 0.8
    });

    const segment = new THREE.Mesh(geometry, material);
    segment.position.set(midX, BORDER_HEIGHT / 2 + 3, midZ);
    segment.rotation.y = -edgeAngle;
    segment.castShadow = true;
    boardGroup.add(segment);
  }
}

// ════════════════════════════════════════════════════════════════
// DECORATIVE STARS - Gold stars at FT inner-hex vertices + small
//                   accent stars at outer-edge midpoints
// ════════════════════════════════════════════════════════════════
function makeStarShape(outerR, innerR, spikes = 5) {
  const shape = new THREE.Shape();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const sx = Math.cos(a) * r;
    const sy = Math.sin(a) * r;
    if (i === 0) shape.moveTo(sx, sy); else shape.lineTo(sx, sy);
  }
  shape.closePath();
  return shape;
}

function createDecorativeStars() {
  const FT_RADIUS = BOARD_RADIUS * 0.42;
  const OUTER_RADIUS = BOARD_RADIUS * 0.88;

  // ── LARGE GOLD STARS at each of the 6 FT inner-hex vertex positions ──
  const ftStarMat = new THREE.MeshBasicMaterial({
    color: 0xffdd00,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  for (let p = 0; p < 6; p++) {
    const angle = (p / 6) * Math.PI * 2 - Math.PI / 6;
    const fx = Math.cos(angle) * FT_RADIUS;
    const fz = Math.sin(angle) * FT_RADIUS;

    const starGeo = new THREE.ShapeGeometry(makeStarShape(18, 7, 5));
    starGeo.rotateX(-Math.PI / 2);
    const star = new THREE.Mesh(starGeo, ftStarMat);
    star.position.set(fx, LINE_HEIGHT - 5, fz);
    star.renderOrder = 2;
    boardGroup.add(star);
  }

  // ── SMALL WHITE ACCENT STARS at each outer-edge midpoint ──
  const accentMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  for (let p = 0; p < 6; p++) {
    const a1 = (p / 6) * Math.PI * 2 - Math.PI / 6;
    const a2 = ((p + 1) / 6) * Math.PI * 2 - Math.PI / 6;
    const mx = (Math.cos(a1) + Math.cos(a2)) / 2 * OUTER_RADIUS;
    const mz = (Math.sin(a1) + Math.sin(a2)) / 2 * OUTER_RADIUS;

    const aGeo = new THREE.ShapeGeometry(makeStarShape(7, 3, 4));
    aGeo.rotateX(-Math.PI / 2);
    const aStar = new THREE.Mesh(aGeo, accentMat);
    aStar.position.set(mx * 0.55, LINE_HEIGHT - 5, mz * 0.55);
    aStar.renderOrder = 2;
    boardGroup.add(aStar);
  }
}


// ════════════════════════════════════════════════════════════════
// GAME ELEMENTS - 14 holes per player section (84 track + 49 off-track = 133 total)
// Core IDs: ft-{p}, side-left-{p}-{4..1}, outer-{p}-{0..3}, home-{p},
//           side-right-{p}-{1..4}, safe-{p}-{1..4}, hold-{p}-{0..3}
// ════════════════════════════════════════════════════════════════
function createGameElements() {
  const FT_RADIUS = BOARD_RADIUS * 0.42;
  const OUTER_RADIUS = BOARD_RADIUS * 0.88;
  const OUTER_INSET = 15; // inset from outer edge so holes sit on felt
  const sideTrackLength = OUTER_RADIUS - FT_RADIUS;
  const holeSpacing = sideTrackLength / 6; // consistent spacing — 5 outer + 1 for FT gap

  for (let p = 0; p < 6; p++) {
    const cornerAngle = (p / 6) * Math.PI * 2 - Math.PI / 6;
    const nextCornerAngle = ((p + 1) / 6) * Math.PI * 2 - Math.PI / 6;

    // Direction vectors for this wedge
    const wedgeMidAngle = (cornerAngle + nextCornerAngle) / 2;
    const radialDirX = Math.cos(wedgeMidAngle);   // points outward from center
    const radialDirZ = Math.sin(wedgeMidAngle);
    const tangentDirX = -radialDirZ;              // along outer edge (left→right)
    const tangentDirZ = radialDirX;
    const inwardDirX = -radialDirX;               // points toward center
    const inwardDirZ = -radialDirZ;

    // Outer edge center point
    const outerCenterX = radialDirX * (OUTER_RADIUS - OUTER_INSET);
    const outerCenterZ = radialDirZ * (OUTER_RADIUS - OUTER_INSET);

    // FastTrack hole (inner hex vertex)
    const ftX = Math.cos(cornerAngle) * FT_RADIUS;
    const ftZ = Math.sin(cornerAngle) * FT_RADIUS;
    createFastTrackHole(`ft-${p}`, p, ftX, LINE_HEIGHT - 2, ftZ);

    // ── OUTER EDGE: 5 holes centered on outer edge along tangent ──
    // Positions: indices 0..4 → offsets (-2,-1,0,1,2) × holeSpacing
    const outerPositions = [];
    for (let h = 0; h < 5; h++) {
      const offset = (h - 2) * holeSpacing;
      const x = outerCenterX + tangentDirX * offset;
      const z = outerCenterZ + tangentDirZ * offset;
      outerPositions.push({ x, z });

      if (h < 4) {
        // outer-0..3
        createHole(`outer-${p}-${h}`, 'outer', p, x, LINE_HEIGHT - 2, z, null, {
          isOuterTrack: true,
          isSafeZoneEntry: h === 2
        });
      } else {
        // h === 4 → home hole
        createHole(`home-${p}`, 'home', p, x, LINE_HEIGHT - 2, z, 'diamond', {
          isOuterTrack: true, isHome: true
        });
      }
    }

    // Left/right corner positions (outermost outer holes)
    const leftCornerX = outerPositions[0].x;
    const leftCornerZ = outerPositions[0].z;
    const rightCornerX = outerPositions[4].x;
    const rightCornerZ = outerPositions[4].z;

    // ── SIDE-LEFT: 4 holes from left corner TOWARD ft-{p} (contiguous path) ──
    const leftToFtX = ftX - leftCornerX;
    const leftToFtZ = ftZ - leftCornerZ;
    const leftToFtLen = Math.sqrt(leftToFtX * leftToFtX + leftToFtZ * leftToFtZ);
    const leftDirX = leftToFtX / leftToFtLen;
    const leftDirZ = leftToFtZ / leftToFtLen;
    // Space 4 holes in 5 equal steps so FT hole is exactly one step away
    const leftStep = leftToFtLen / 5;
    for (let h = 1; h <= 4; h++) {
      const x = leftCornerX + leftDirX * (h * leftStep);
      const z = leftCornerZ + leftDirZ * (h * leftStep);
      createHole(`side-left-${p}-${h}`, 'side-left', p, x, LINE_HEIGHT - 2, z, null, {
        isOuterTrack: true,
        isFastTrackEntry: h === 4
      });
    }

    // ── SIDE-RIGHT: 4 holes from right corner TOWARD ft-{(p+1)%6} (contiguous path) ──
    const nextFtX = Math.cos(nextCornerAngle) * FT_RADIUS;
    const nextFtZ = Math.sin(nextCornerAngle) * FT_RADIUS;
    const rightToFtX = nextFtX - rightCornerX;
    const rightToFtZ = nextFtZ - rightCornerZ;
    const rightToFtLen = Math.sqrt(rightToFtX * rightToFtX + rightToFtZ * rightToFtZ);
    const rightDirX = rightToFtX / rightToFtLen;
    const rightDirZ = rightToFtZ / rightToFtLen;
    const rightStep = rightToFtLen / 5;
    for (let h = 1; h <= 4; h++) {
      const x = rightCornerX + rightDirX * (h * rightStep);
      const z = rightCornerZ + rightDirZ * (h * rightStep);
      createHole(`side-right-${p}-${h}`, 'side-right', p, x, LINE_HEIGHT - 2, z, null, {
        isOuterTrack: true
      });
    }

    // ── SAFE ZONE: 4 holes inward from outer-2 (center of edge) along radial ──
    const safeCenterX = outerPositions[2].x;
    const safeCenterZ = outerPositions[2].z;
    createSafeZoneEnclosure(p, safeCenterX, safeCenterZ, wedgeMidAngle, holeSpacing);

    for (let s = 1; s <= 4; s++) {
      const x = safeCenterX + inwardDirX * (s * holeSpacing);
      const z = safeCenterZ + inwardDirZ * (s * holeSpacing);
      createHole(`safe-${p}-${s}`, 'safezone', p, x, LINE_HEIGHT - 2, z, null, { isSafeZone: true });
    }

    // ── HOLDING AREA: 4 holes in 2×2 grid, to the left of home hole ──
    // Sits in the empty space between home hole and next section's side-right,
    // shifted along tangent (away from outer track) and slightly inward.
    const homeX = rightCornerX;
    const homeZ = rightCornerZ;
    // Shift left along tangent (into gap between sections) and slightly inward
    const holdCenterX = homeX + tangentDirX * holeSpacing * 1.5 + inwardDirX * holeSpacing * 0.6;
    const holdCenterZ = homeZ + tangentDirZ * holeSpacing * 1.5 + inwardDirZ * holeSpacing * 0.6;
    const holdAngle = Math.atan2(holdCenterZ, holdCenterX);
    const holdRadius = Math.sqrt(holdCenterX * holdCenterX + holdCenterZ * holdCenterZ);
    createHoldingAreaEnclosure(p, holdAngle, holdRadius);

    const holdSpacing = 14;
    const holdOffsets = [
      [-holdSpacing / 2, -holdSpacing / 2],
      [holdSpacing / 2, -holdSpacing / 2],
      [-holdSpacing / 2, holdSpacing / 2],
      [holdSpacing / 2, holdSpacing / 2]
    ];
    for (let h = 0; h < 4; h++) {
      const [localX, localZ] = holdOffsets[h];
      // Rotate grid to align with wedge
      const rotX = localX * tangentDirX + localZ * inwardDirX;
      const rotZ = localX * tangentDirZ + localZ * inwardDirZ;
      createHole(`hold-${p}-${h}`, 'holding', p, holdCenterX + rotX, LINE_HEIGHT - 2, holdCenterZ + rotZ, null, { isHolding: true });
    }
  }

  // Create bullseye (center)
  createBullseye();

  console.log(`✅ Created ${holeRegistry.size} holes (expected 133) for 6 players`);
}

// ════════════════════════════════════════════════════════════════
// SAFE ZONE ENCLOSURE - Colored rounded rectangle
// ════════════════════════════════════════════════════════════════
function createSafeZoneEnclosure(playerIdx, startX, startZ, angle, holeSpacing) {
  // Panel spans ONLY the 4 safe zone holes (s=1..4).
  // Center is at s=2.5 exactly, length tightly wraps those 4 holes.
  const spacing = holeSpacing || 20;
  const color = RAINBOW_COLORS[playerIdx];
  const length = spacing * 3 + 18;  // s=1 to s=4 span + 9px padding each side
  const width = 24;
  const radius = 8;

  // Create rounded rectangle shape
  const shape = new THREE.Shape();
  const hw = width / 2 - radius;
  const hl = length / 2 - radius;

  shape.moveTo(-hw, -hl - radius);
  shape.lineTo(hw, -hl - radius);
  shape.quadraticCurveTo(hw + radius, -hl - radius, hw + radius, -hl);
  shape.lineTo(hw + radius, hl);
  shape.quadraticCurveTo(hw + radius, hl + radius, hw, hl + radius);
  shape.lineTo(-hw, hl + radius);
  shape.quadraticCurveTo(-hw - radius, hl + radius, -hw - radius, hl);
  shape.lineTo(-hw - radius, -hl);
  shape.quadraticCurveTo(-hw - radius, -hl - radius, -hw, -hl - radius);

  const extrudeSettings = { depth: 6, bevelEnabled: true, bevelSize: 2, bevelThickness: 1 };
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geometry.rotateX(-Math.PI / 2);

  // Gradient canvas texture matching panel color (like border segments)
  const r0 = (color >> 16) & 0xff;
  const g0 = (color >> 8) & 0xff;
  const b0 = color & 0xff;
  const szCanvas = document.createElement('canvas');
  szCanvas.width = 4; szCanvas.height = 32;
  const szCtx = szCanvas.getContext('2d');
  const szGrd = szCtx.createLinearGradient(0, 0, 0, 32);
  szGrd.addColorStop(0, `rgb(${Math.min(r0 + 70, 255)},${Math.min(g0 + 70, 255)},${Math.min(b0 + 70, 255)})`);
  szGrd.addColorStop(0.35, `rgb(${r0},${g0},${b0})`);
  szGrd.addColorStop(1, `rgb(${Math.max(r0 - 60, 0)},${Math.max(g0 - 60, 0)},${Math.max(b0 - 60, 0)})`);
  szCtx.fillStyle = szGrd;
  szCtx.fillRect(0, 0, 4, 32);
  const szTex = new THREE.CanvasTexture(szCanvas);

  const material = new THREE.MeshStandardMaterial({
    map: szTex,
    roughness: 0.38,
    metalness: 0.28,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.08,
    transparent: true,
    opacity: 0.92
  });

  const mesh = new THREE.Mesh(geometry, material);

  // Center panel exactly over holes s=1..4 (midpoint = s=2.5)
  const inwardDirX = -Math.cos(angle);
  const inwardDirZ = -Math.sin(angle);
  const centerX = startX + inwardDirX * (2.5 * spacing);
  const centerZ = startZ + inwardDirZ * (2.5 * spacing);

  mesh.position.set(centerX, 5, centerZ);
  mesh.rotation.y = -angle + Math.PI / 2;
  mesh.castShadow = true;
  boardGroup.add(mesh);
}

// ════════════════════════════════════════════════════════════════
// HOLDING AREA ENCLOSURE - Colored circle
// ════════════════════════════════════════════════════════════════
function createHoldingAreaEnclosure(playerIdx, holdAngle, holdRadius) {
  const color = RAINBOW_COLORS[playerIdx];
  const holdX = Math.cos(holdAngle) * holdRadius;
  const holdZ = Math.sin(holdAngle) * holdRadius;

  // Outer circle
  const outerGeo = new THREE.CircleGeometry(28, 32);
  outerGeo.rotateX(-Math.PI / 2);
  const outerMat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.3,
    metalness: 0.5,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.15
  });
  const outer = new THREE.Mesh(outerGeo, outerMat);
  outer.position.set(holdX, 7, holdZ);
  boardGroup.add(outer);

  // Inner dark circle (dark green felt pocket look)
  const innerGeo = new THREE.CircleGeometry(22, 32);
  innerGeo.rotateX(-Math.PI / 2);
  const innerMat = new THREE.MeshStandardMaterial({
    color: 0x071007,
    roughness: 0.9
  });
  const inner = new THREE.Mesh(innerGeo, innerMat);
  inner.position.set(holdX, 7.5, holdZ);
  boardGroup.add(inner);
}

function createHole(id, type, playerIdx, x, y, z, shape, props = {}) {
  const radius = type === 'outer' ? TRACK_HOLE_RADIUS : HOLE_RADIUS;

  // ── HOLE INTERIOR — gold for home holes, dark for all others ──
  const geometry = new THREE.CylinderGeometry(radius, radius, 6, 20);
  const isHome = shape === 'diamond';
  const material = new THREE.MeshStandardMaterial({
    color: isHome ? 0xD4AF37 : 0x080808,
    roughness: isHome ? 0.18 : 0.95,
    metalness: isHome ? 0.78 : 0.0,
    emissive: isHome ? new THREE.Color(0xAA8800) : new THREE.Color(0x000000),
    emissiveIntensity: isHome ? 0.30 : 0.0
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y - 1, z);
  boardGroup.add(mesh);

  // Expanded invisible hit area so hole picking is forgiving.
  const pickGeo = new THREE.CylinderGeometry(radius + 7, radius + 7, 6, 20);
  const pickMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const pickMesh = new THREE.Mesh(pickGeo, pickMat);
  pickMesh.position.set(x, y - 1, z);
  pickMesh.userData.holeId = id;
  boardGroup.add(pickMesh);

  // Add diamond marker for HOME holes — extruded to match hole depth, with center cutout
  if (shape === 'diamond') {
    const dSize = 17;
    const diamondShape = new THREE.Shape();
    diamondShape.moveTo(0, dSize);
    diamondShape.lineTo(dSize * 0.7, 0);
    diamondShape.lineTo(0, -dSize);
    diamondShape.lineTo(-dSize * 0.7, 0);
    diamondShape.closePath();

    // Cut out center circle so the hole remains visible
    const holeCutout = new THREE.Path();
    const cutRadius = HOLE_RADIUS + 0.5;
    for (let a = 0; a <= 64; a++) {
      const ang = (a / 64) * Math.PI * 2;
      const cx = Math.cos(ang) * cutRadius;
      const cz = Math.sin(ang) * cutRadius;
      if (a === 0) holeCutout.moveTo(cx, cz);
      else holeCutout.lineTo(cx, cz);
    }
    holeCutout.closePath();
    diamondShape.holes.push(holeCutout);

    const diamondGeo = new THREE.ExtrudeGeometry(diamondShape, { depth: 5, bevelEnabled: false });
    diamondGeo.rotateX(-Math.PI / 2);
    const diamondMat = new THREE.MeshStandardMaterial({
      color: RAINBOW_COLORS[playerIdx],
      roughness: 0.20,
      metalness: 0.55,
      emissive: new THREE.Color(RAINBOW_COLORS[playerIdx]),
      emissiveIntensity: 0.25
    });
    const diamond = new THREE.Mesh(diamondGeo, diamondMat);
    diamond.position.set(x, y - 2.5, z);
    boardGroup.add(diamond);
  }

  holeRegistry.set(id, { id, type, playerIdx, position: { x, y, z }, mesh, pickMesh, ...props });
  return holeRegistry.get(id);
}

function createFastTrackHole(id, playerIdx, x, y, z) {
  // Pentagon shape (LEVEL_3 = 21)
  const PENTAGON_SIZE = 21;
  const pentShape = new THREE.Shape();
  for (let p = 0; p < 5; p++) {
    const pentAngle = (p * 2 * Math.PI / 5) - Math.PI / 2;
    const px = Math.cos(pentAngle) * PENTAGON_SIZE;
    const pz = Math.sin(pentAngle) * PENTAGON_SIZE;
    if (p === 0) pentShape.moveTo(px, pz);
    else pentShape.lineTo(px, pz);
  }
  pentShape.closePath();

  // Cut hole in center
  const holePath = new THREE.Path();
  for (let h = 0; h < 32; h++) {
    const hAngle = (h * 2 * Math.PI / 32);
    const hx = Math.cos(hAngle) * HOLE_RADIUS;
    const hz = Math.sin(hAngle) * HOLE_RADIUS;
    if (h === 0) holePath.moveTo(hx, hz);
    else holePath.lineTo(hx, hz);
  }
  holePath.closePath();
  pentShape.holes.push(holePath);

  const pentGeo = new THREE.ShapeGeometry(pentShape);
  // FT pentagon: player color marker — hole interior matches player color
  const pentMat = new THREE.MeshStandardMaterial({
    color: RAINBOW_COLORS[playerIdx],
    roughness: 0.22,
    metalness: 0.30,
    emissive: new THREE.Color(RAINBOW_COLORS[playerIdx]),
    emissiveIntensity: 0.12,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });

  const pentagon = new THREE.Mesh(pentGeo, pentMat);
  pentagon.rotation.x = -Math.PI / 2;
  pentagon.position.set(x, 7, z);
  pentagon.renderOrder = 1;
  boardGroup.add(pentagon);

  // Create the actual hole — player color interior with a saturated glow
  const playerColor = RAINBOW_COLORS[playerIdx];
  const holeGeo = new THREE.CylinderGeometry(HOLE_RADIUS, HOLE_RADIUS, 5, 16);
  const holeMat = new THREE.MeshStandardMaterial({
    color: playerColor,
    roughness: 0.15,
    metalness: 0.55,
    emissive: new THREE.Color(playerColor),
    emissiveIntensity: 0.55
  });
  const holeMesh = new THREE.Mesh(holeGeo, holeMat);
  holeMesh.position.set(x, y, z);
  boardGroup.add(holeMesh);

  const pickGeo = new THREE.CylinderGeometry(HOLE_RADIUS + 7, HOLE_RADIUS + 7, 6, 20);
  const pickMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const pickMesh = new THREE.Mesh(pickGeo, pickMat);
  pickMesh.position.set(x, y, z);
  pickMesh.userData.holeId = id;
  boardGroup.add(pickMesh);

  holeRegistry.set(id, { id, type: 'fasttrack', playerIdx, position: { x, y, z }, mesh: holeMesh, pickMesh, isFastTrack: true });
}

function createBullseye() {
  const CENTER_HOLE_RADIUS = 8;
  const RING_WIDTH = 13;

  // Concentric colored rings
  for (let r = 5; r >= 0; r--) {
    const outerR = CENTER_HOLE_RADIUS + RING_WIDTH * (r + 1);
    const innerR = CENTER_HOLE_RADIUS + RING_WIDTH * r;

    // 🜂 ManifoldGeometry.ring: x=radius fraction, y=angle/(2π), z=x·y = area element
    // 65×6 verts from 130-iteration ShapeGeometry loop → 48-segment parametric ring
    // Each ring: ~7,680B Shape loop → ~1,152B formula  (85% saved per ring, ×6 rings)
    const ringGeo = window.ManifoldGeometry
      ? ManifoldGeometry.ring(innerR, outerR, 48)
      : (() => {
        const sh = new THREE.Shape();
        for (let a = 0; a <= 64; a++) {
          const ang = (a / 64) * Math.PI * 2;
          if (a === 0) sh.moveTo(Math.cos(ang) * outerR, Math.sin(ang) * outerR);
          else sh.lineTo(Math.cos(ang) * outerR, Math.sin(ang) * outerR);
        }
        sh.closePath();
        const ih = new THREE.Path();
        for (let a = 0; a <= 64; a++) {
          const ang = (a / 64) * Math.PI * 2;
          if (a === 0) ih.moveTo(Math.cos(ang) * innerR, Math.sin(ang) * innerR);
          else ih.lineTo(Math.cos(ang) * innerR, Math.sin(ang) * innerR);
        }
        ih.closePath(); sh.holes.push(ih);
        return new THREE.ShapeGeometry(sh);
      })();

    const ringMat = new THREE.MeshStandardMaterial({
      color: RAINBOW_COLORS[r],
      roughness: 0.25,
      metalness: 0.45,
      emissive: new THREE.Color(RAINBOW_COLORS[r]),
      emissiveIntensity: 0.55
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    // ManifoldGeometry.ring() is already flat in the XZ plane (normal = +Y).
    // ShapeGeometry is in the XY plane and needs rotating flat.
    if (!window.ManifoldGeometry) ring.rotation.x = -Math.PI / 2;
    ring.position.y = LINE_HEIGHT + 1;
    boardGroup.add(ring);
  }

  // ── CENTER HOLE — dark shaft, visible through the dome ──
  const centerHoleGeo = new THREE.CylinderGeometry(CENTER_HOLE_RADIUS, CENTER_HOLE_RADIUS, 5, 32);
  const centerHoleMat = new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 1.0, metalness: 0 });
  const centerHoleMesh = new THREE.Mesh(centerHoleGeo, centerHoleMat);
  centerHoleMesh.position.set(0, LINE_HEIGHT - 2, 0);
  boardGroup.add(centerHoleMesh);

  // ── TARGET DOME — translucent half-sphere covering ALL six player-color rings ──
  // The rings span from CENTER_HOLE_RADIUS (8) out to CENTER_HOLE_RADIUS + RING_WIDTH*6 (86).
  // The dome must cover the whole target so you can see every color through the glass.
  const fullTargetR = CENTER_HOLE_RADIUS + RING_WIDTH * 6; // = 86
  const domeR = fullTargetR + 2;                     // = 88, just past outermost ring

  // Outer shell — barely-there frosted glass over the whole target
  const domeGeo = new THREE.SphereGeometry(domeR, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  const domeBullMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: new THREE.Color(0xffd0a0),
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.10,          // very see-through — all rings visible beneath
    roughness: 0.0,
    metalness: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const domeBullMesh = new THREE.Mesh(domeGeo, domeBullMat);
  domeBullMesh.position.set(0, LINE_HEIGHT, 0);
  boardGroup.add(domeBullMesh);

  // Inner dome — glows only over the center hole, gives depth without hiding the rings
  const innerDomeGeo = new THREE.SphereGeometry(CENTER_HOLE_RADIUS + 4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const innerDomeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: new THREE.Color(0xff9050),
    emissiveIntensity: 2.0,
    transparent: true,
    opacity: 0.20,
    roughness: 0.0,
    metalness: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const innerDomeMesh = new THREE.Mesh(innerDomeGeo, innerDomeMat);
  innerDomeMesh.position.set(0, LINE_HEIGHT, 0);
  boardGroup.add(innerDomeMesh);

  const bullPickGeo = new THREE.CylinderGeometry(CENTER_HOLE_RADIUS + 8, CENTER_HOLE_RADIUS + 8, 7, 24);
  const bullPickMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const bullPickMesh = new THREE.Mesh(bullPickGeo, bullPickMat);
  bullPickMesh.position.set(0, LINE_HEIGHT - 2, 0);
  bullPickMesh.userData.holeId = 'bullseye';
  boardGroup.add(bullPickMesh);

  holeRegistry.set('bullseye', { id: 'bullseye', type: 'bullseye', playerIdx: -1, position: { x: 0, y: LINE_HEIGHT - 2, z: 0 }, mesh: centerHoleMesh, pickMesh: bullPickMesh });

  // ── FAST TRACK LOGO — procedural text ring around bullseye ──
  const logoRadius = CENTER_HOLE_RADIUS + RING_WIDTH * 6 + 12; // just outside colored rings
  const logoCanvas = document.createElement('canvas');
  logoCanvas.width = 512; logoCanvas.height = 512;
  const lctx = logoCanvas.getContext('2d');

  // Transparent background
  lctx.clearRect(0, 0, 512, 512);
  const cx = 256, cy = 256, r = 220;

  // Outer gold trim ring
  lctx.beginPath();
  lctx.arc(cx, cy, r + 14, 0, Math.PI * 2);
  lctx.arc(cx, cy, r + 6, 0, Math.PI * 2, true);
  lctx.fillStyle = 'rgba(255, 200, 40, 0.7)';
  lctx.fill();

  // Inner gold trim ring
  lctx.beginPath();
  lctx.arc(cx, cy, r - 18, 0, Math.PI * 2);
  lctx.arc(cx, cy, r - 26, 0, Math.PI * 2, true);
  lctx.fillStyle = 'rgba(255, 200, 40, 0.7)';
  lctx.fill();

  // Draw text normally on canvas — the 3D mesh rotation handles orientation

  // Helper: draw text along a circular arc
  function drawArcText(ctx, text, ctrX, ctrY, radius, centerAngle, charSpacing, topSide) {
    ctx.save();
    ctx.font = 'bold 22px "Georgia", serif';
    ctx.fillStyle = '#ffd700';
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const totalSpan = (text.length - 1) * charSpacing;
    const startAngle = centerAngle - totalSpan / 2;
    for (let i = 0; i < text.length; i++) {
      const angle = startAngle + i * charSpacing;
      const tx = ctrX + Math.cos(angle) * radius;
      const ty = ctrY + Math.sin(angle) * radius;
      ctx.save();
      ctx.translate(tx, ty);
      // topSide: letters face outward from top; bottom: letters face outward from bottom
      ctx.rotate(angle + (topSide ? Math.PI / 2 : -Math.PI / 2));
      ctx.strokeText(text[i], 0, 0);
      ctx.fillText(text[i], 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  // Top arc: "✦ FAST TRACK ✦" — centered at -PI/2 (top of circle)
  const topText = '\u2726 F A S T   T R A C K \u2726';
  drawArcText(lctx, topText, cx, cy, r - 8, -Math.PI / 2, 0.085, true);

  // Bottom arc: "★ CHAMPION ★" — centered at PI/2 (bottom of circle)
  const botText = '\u2605 C H A M P I O N \u2605';
  drawArcText(lctx, botText, cx, cy, r - 8, Math.PI / 2, -0.085, false);



  // Small decorative speed lines between text arcs
  lctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
  lctx.lineWidth = 2;
  for (let side = 0; side < 2; side++) {
    const baseAngle = side === 0 ? -Math.PI * 0.22 : Math.PI * 0.78;
    for (let ln = 0; ln < 3; ln++) {
      const a = baseAngle + ln * 0.06;
      lctx.beginPath();
      lctx.moveTo(Math.cos(a) * (r - 20), Math.sin(a) * (r - 20));
      lctx.lineTo(Math.cos(a) * (r + 8), Math.sin(a) * (r + 8));
      lctx.stroke();
    }
  }

  lctx.restore();

  // Create circular plane mesh for the logo
  const logoTex = new THREE.CanvasTexture(logoCanvas);
  const logoGeo = new THREE.CircleGeometry(logoRadius + 16, 64);
  logoGeo.rotateX(-Math.PI / 2);
  const logoMat = new THREE.MeshStandardMaterial({
    map: logoTex,
    transparent: true,
    roughness: 0.3,
    metalness: 0.4,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });
  const logoMesh = new THREE.Mesh(logoGeo, logoMat);
  logoMesh.position.set(0, LINE_HEIGHT + 0.5, 0);
  // no extra rotation — geometry already has rotateX(-PI/2) baked in
  logoMesh.renderOrder = 3;
  boardGroup.add(logoMesh);
}

// ════════════════════════════════════════════════════════════════
// PLAYER MARKER SPRITES — avatar + name on rails
// ════════════════════════════════════════════════════════════════
let _playerMarkerSprites = [];

function createPlayerMarkerSprite(name, color, avatar) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');

  // Measure text to size the pill
  const displayText = `${avatar || '🎮'} ${name}`;
  ctx.font = 'bold 12px Arial';
  const tw = ctx.measureText(displayText).width;
  const pillW = Math.min(tw + 28, 248);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = 18;

  // Rounded-rect pill background with player color border
  ctx.beginPath();
  ctx.moveTo(cx - pillW / 2 + r, cy - r);
  ctx.lineTo(cx + pillW / 2 - r, cy - r);
  ctx.arcTo(cx + pillW / 2, cy - r, cx + pillW / 2, cy, r);
  ctx.arcTo(cx + pillW / 2, cy + r, cx + pillW / 2 - r, cy + r, r);
  ctx.lineTo(cx - pillW / 2 + r, cy + r);
  ctx.arcTo(cx - pillW / 2, cy + r, cx - pillW / 2, cy, r);
  ctx.arcTo(cx - pillW / 2, cy - r, cx - pillW / 2 + r, cy - r, r);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fill();
  ctx.strokeStyle = color || '#ffffff';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Text
  ctx.fillStyle = color || '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(displayText, cx, cy + 1);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(31, 10, 1);
  sprite.renderOrder = 100;
  return sprite;
}

function updatePlayerMarkers() {
  if (!window.FastTrackCore) return;
  const players = window.FastTrackCore.state.players.get('list') || [];

  // Hide all first
  _playerMarkerSprites.forEach(s => { s.visible = false; });

  // For each player, show their marker at their board position
  players.forEach(p => {
    const bp = p.boardPosition;
    if (bp >= 0 && bp < _playerMarkerSprites.length) {
      const oldSprite = _playerMarkerSprites[bp];
      const pos = oldSprite.position.clone();
      // Use player's configured avatar (set from URL ?avatar= param for human)
      const avatar = p.avatar || (p.isBot ? '🤖' : '🎮');

      // Remove old sprite, create new one with player info
      scene.remove(oldSprite);
      if (oldSprite.material) { oldSprite.material.map?.dispose(); oldSprite.material.dispose(); }

      const newSprite = createPlayerMarkerSprite(p.name, p.color, avatar);
      newSprite.position.copy(pos);
      newSprite.visible = true;
      newSprite.userData.boardPosition = bp;
      scene.add(newSprite);
      _playerMarkerSprites[bp] = newSprite;
    }
  });
}

// ── WIN CROWN ────────────────────────────────────────────────────────────────
// A gold crown that floats over home-{p} while that player is on the home stretch:
// all four safe holes filled and the final peg on its run-in (engine crownPresent,
// surfaced as state.meta 'crowns'). It appears the instant that peg reaches the
// stretch and vanishes if the peg is cut or leaves. The crown must be present for
// the win to be awarded, so it doubles as the player's "one landing from winning" tell.
let _crownSprites = {};
function makeCrownSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = '92px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255, 205, 60, 0.95)';   // warm gold glow so it reads on the dark board
  ctx.shadowBlur = 20;
  ctx.fillText('👑', 64, 72);
  ctx.fillText('👑', 64, 72);                      // second pass deepens the glow
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(15, 15, 1);
  sprite.renderOrder = 130;
  return sprite;
}

function updateCrowns() {
  if (!window.FastTrackCore || !boardGroup) return;
  const crowns = window.FastTrackCore.state.meta.get('crowns') || [];
  for (let p = 0; p < 6; p++) {
    const present = !!crowns[p];
    let spr = _crownSprites[p];
    if (present && !spr) {
      const home = holeRegistry.get(`home-${p}`);
      if (!home || !home.position) continue;
      spr = makeCrownSprite();
      // Added to boardGroup so it shares the holes' local space; float it just above the hole.
      spr.position.set(home.position.x, home.position.y + 14, home.position.z);
      boardGroup.add(spr);
      _crownSprites[p] = spr;
    }
    if (spr) spr.visible = present;
  }
}

function blinkPlayerMarker(playerIdx, onDone) {
  if (!window.FastTrackCore) { if (onDone) onDone(); return; }
  const players = window.FastTrackCore.state.players.get('list') || [];
  if (playerIdx < 0 || playerIdx >= players.length) { if (onDone) onDone(); return; }
  const bp = players[playerIdx].boardPosition;
  const sprite = _playerMarkerSprites[bp];
  if (!sprite) { if (onDone) onDone(); return; }

  let count = 0;
  const totalBlinks = 3;
  const interval = setInterval(() => {
    sprite.visible = !sprite.visible;
    count++;
    if (count >= totalBlinks * 2) {
      clearInterval(interval);
      sprite.visible = true; // ensure visible at end
      if (onDone) onDone();
    }
  }, 180);
}

// ════════════════════════════════════════════════════════════════
// PEG NAME TOOLTIPS — floating name labels above pegs
// ════════════════════════════════════════════════════════════════
function createPegNameSprite(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Measure text to size the pill
  ctx.font = '700 20pt Arial';
  const tw = ctx.measureText(name).width;
  const pillW = Math.min(tw + 32, 248);
  const pillH = 80;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = 20;

  // Square rounded-rect background
  ctx.beginPath();
  ctx.moveTo(cx - pillW / 2 + r, cy - pillH / 2);
  ctx.lineTo(cx + pillW / 2 - r, cy - pillH / 2);
  ctx.arcTo(cx + pillW / 2, cy - pillH / 2, cx + pillW / 2, cy - pillH / 2 + r, r);
  ctx.arcTo(cx + pillW / 2, cy + pillH / 2, cx + pillW / 2 - r, cy + pillH / 2, r);
  ctx.lineTo(cx - pillW / 2 + r, cy + pillH / 2);
  ctx.arcTo(cx - pillW / 2, cy + pillH / 2, cx - pillW / 2, cy + pillH / 2 - r, r);
  ctx.arcTo(cx - pillW / 2, cy - pillH / 2, cx - pillW / 2 + r, cy - pillH / 2, r);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Name text
  ctx.font = '700 20pt Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, cx, cy + 1);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(spriteMat);
  // Square world-space tooltip, attenuates with distance.
  sprite.scale.set(72, 72, 1);
  sprite.renderOrder = 100;
  return sprite;
}

function showPegNames(pegNameMap) {
  // pegNameMap: { pegId: nickname, ... }
  // First, hide names for pegs NOT in the map (e.g. bumped back to holding)
  pegRegistry.forEach((peg, id) => {
    if (!pegNameMap[id] && peg.nameSprite) {
      peg.nameSprite.visible = false;
    }
  });
  // Then show/create names for pegs IN the map
  for (const [pegId, name] of Object.entries(pegNameMap)) {
    const peg = pegRegistry.get(pegId);
    if (!peg) continue;
    // Remove old sprite if it exists
    if (peg.nameSprite) {
      peg.mesh.remove(peg.nameSprite);
      if (peg.nameSprite.material.map) peg.nameSprite.material.map.dispose();
      peg.nameSprite.material.dispose();
    }
    const sprite = createPegNameSprite(name);
    sprite.position.y = PEG_HEIGHT + 20;
    sprite.visible = true;
    peg.mesh.add(sprite);
    peg.nameSprite = sprite;
  }
}

function hidePegNames() {
  pegRegistry.forEach(peg => {
    if (peg.nameSprite) {
      peg.nameSprite.visible = false;
    }
  });
}

// ════════════════════════════════════════════════════════════════
// PEG CREATION - Tall Light Bright style with intense glow
// ════════════════════════════════════════════════════════════════
function createPeg(id, playerIndex, holeId, colorIndex = null) {
  const colorIdx = colorIndex !== null ? colorIndex : playerIndex;
  const color = RAINBOW_COLORS[colorIdx];
  const hole = holeRegistry.get(holeId);

  if (!hole) {
    console.warn(`[createPeg] Hole ${holeId} not found`);
    return null;
  }

  const pegGroup = new THREE.Group();

  // ── OUTER SHELL — translucent colored glass ──
  // 🜂 ManifoldGeometry.peg: x=angle, y=height, z=x·y stamped into manifoldZ attribute
  const bodyGeo = window.ManifoldGeometry
    ? ManifoldGeometry.peg(PEG_TOP_RADIUS, PEG_BOTTOM_RADIUS, PEG_HEIGHT, 32)
    : new THREE.CylinderGeometry(PEG_TOP_RADIUS, PEG_BOTTOM_RADIUS, PEG_HEIGHT, 32);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.08,
    metalness: 0.15,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.75,
    envMapIntensity: 1.5
  });

  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = true;
  // ManifoldGeometry.peg is bottom-anchored (y=0 → y=HEIGHT).
  // THREE.CylinderGeometry is centered (y=-HEIGHT/2 → y=+HEIGHT/2) and needs a lift.
  bodyMesh.position.y = window.ManifoldGeometry ? 0 : PEG_HEIGHT / 2;
  // 🜂 Manifold z drives emissiveIntensity: average manifoldZ across all verts
  // z = x·y where x=angle, y=height — surface value = 0.25 average (peak at far corner)
  // This means glow is a function of the manifold surface, not a hardcoded constant.
  if (bodyGeo.attributes.manifoldZ) {
    const mzArr = bodyGeo.attributes.manifoldZ.array;
    let mzSum = 0;
    for (let i = 0; i < mzArr.length; i++) mzSum += mzArr[i];
    const mzAvg = mzSum / mzArr.length;          // ~0.25 for a full cylinder
    bodyMat.emissiveIntensity = 0.2 + mzAvg * 0.6; // range 0.2–0.35 driven by z=x·y
  }
  pegGroup.add(bodyMesh);

  // ── FLAT TOP CAP — disc with slight bevel ──
  const capGeo = window.ManifoldGeometry
    ? ManifoldGeometry.peg(PEG_TOP_RADIUS, PEG_TOP_RADIUS, 2.5, 32)
    : new THREE.CylinderGeometry(PEG_TOP_RADIUS, PEG_TOP_RADIUS, 2.5, 32);
  const domeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.05,
    metalness: 0.1,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.88,
    envMapIntensity: 2.0
  });

  const domeMesh = new THREE.Mesh(capGeo, domeMat);
  domeMesh.position.y = window.ManifoldGeometry ? PEG_HEIGHT : PEG_HEIGHT + 1.25;
  domeMesh.castShadow = true;
  pegGroup.add(domeMesh);

  // ── INNER CORE — bright saturated glow filament ──
  const coreGeo = window.ManifoldGeometry
    ? ManifoldGeometry.peg(PEG_BOTTOM_RADIUS * 0.5, PEG_BOTTOM_RADIUS * 0.35, PEG_HEIGHT * 0.85, 16)
    : new THREE.CylinderGeometry(PEG_BOTTOM_RADIUS * 0.5, PEG_BOTTOM_RADIUS * 0.35, PEG_HEIGHT * 0.85, 16);
  const coreMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.5
  });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.position.y = window.ManifoldGeometry ? 0 : PEG_HEIGHT / 2;
  pegGroup.add(coreMesh);

  // ── NAME SPRITE — created on demand by showPegNames ──

  // Flush with board surface: boardGroup.y + LINE_HEIGHT = 90 + 13 = 103 world units.
  // All holes sit at y = LINE_HEIGHT - 2 inside boardGroup; using LINE_HEIGHT directly
  // puts the peg base exactly at the felt surface regardless of which hole it's on.
  const boardY = boardGroup ? boardGroup.position.y : 90;
  pegGroup.position.set(hole.position.x, boardY + LINE_HEIGHT + 1, hole.position.z);
  pegGroup.name = id;
  pegGroup.userData.pegId = id;
  pegGroup.userData.playerIndex = playerIndex;
  pegGroup.userData.holeId = holeId;
  pegGroup.userData.color = color;
  pegGroup.userData.colorHex = '#' + color.toString(16).padStart(6, '0');

  // Add to scene (pegs render above board)
  scene.add(pegGroup);

  const pegData = {
    id,
    playerIndex,
    holeId,
    color,
    mesh: pegGroup,
    bodyMesh,
    domeMesh,
    nameSprite: null
  };

  pegRegistry.set(id, pegData);
  console.log(`🎯 Created peg ${id} for player ${playerIndex} at ${holeId}`);
  return pegData;
}

function removePeg(id) {
  const peg = pegRegistry.get(id);
  if (peg && peg.mesh) {
    scene.remove(peg.mesh);  // Remove from scene, not pegGroup
    pegRegistry.delete(id);
    console.log(`🗑️ Removed peg ${id}`);
  }
}

// Personality → hop style mapping
const HOP_STYLES = {
  AGGRESSIVE: { arcMult: 0.6, speedMult: 0.7, spinSpeed: 8, bounces: 0, wobble: 0, squash: 0.05 },
  APOLOGETIC: { arcMult: 0.3, speedMult: 1.3, spinSpeed: 0, bounces: 0, wobble: 0.08, squash: 0.1 },
  SMUG: { arcMult: 0.5, speedMult: 1.0, spinSpeed: 2, bounces: 0, wobble: 0, squash: 0.02 },
  TIMID: { arcMult: 0.2, speedMult: 1.5, spinSpeed: 0, bounces: 2, wobble: 0.15, squash: 0.15 },
  CHEERFUL: { arcMult: 0.5, speedMult: 0.9, spinSpeed: 4, bounces: 1, wobble: 0.05, squash: 0.08 },
  DRAMATIC: { arcMult: 0.8, speedMult: 0.8, spinSpeed: 6, bounces: 0, wobble: 0, squash: 0.03 },
};

function movePeg(id, toHoleId, onComplete) {
  const peg = pegRegistry.get(id);
  const toHole = holeRegistry.get(toHoleId);

  if (!peg || !toHole) {
    if (onComplete) onComplete();
    return;
  }

  // Look up personality from game state
  let style = HOP_STYLES.CHEERFUL; // default
  if (window.FastTrackCore) {
    const players = window.FastTrackCore.state.players.get('list') || [];
    for (const pl of players) {
      const found = pl.pegs.find(p => `peg-${pl.color}-${pl.pegs.indexOf(p)}` === id);
      if (found && found.personality && HOP_STYLES[found.personality]) {
        style = HOP_STYLES[found.personality];
        break;
      }
    }
  }

  const startPos = peg.mesh.position.clone();
  const boardY = boardGroup ? boardGroup.position.y : 90;
  const endPos = new THREE.Vector3(toHole.position.x, boardY + LINE_HEIGHT + 1, toHole.position.z);
  const distance = startPos.distanceTo(endPos);
  const arcHeight = Math.min(80, distance * style.arcMult);
  const duration = Math.min(1500, (400 + distance * 2) * style.speedMult);
  const startScale = peg.mesh.scale.clone();

  const startTime = performance.now();
  let hopSoundPlayed = false;

  function animateHop() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(1, elapsed / duration);

    // Easing — personality-dependent
    const eased = 1 - Math.pow(1 - progress, 3);

    // Position with arc
    const x = startPos.x + (endPos.x - startPos.x) * eased;
    const z = startPos.z + (endPos.z - startPos.z) * eased;
    let arcY = Math.sin(progress * Math.PI) * arcHeight;

    // Wobble (lateral sway) for nervous personalities
    const wobbleX = style.wobble * Math.sin(progress * Math.PI * 6) * (1 - progress);
    const wobbleZ = style.wobble * Math.cos(progress * Math.PI * 4) * (1 - progress);

    const y = startPos.y + (endPos.y - startPos.y) * eased + arcY;
    peg.mesh.position.set(x + wobbleX * 10, y, z + wobbleZ * 10);

    // Spin (rotation around Y)
    if (style.spinSpeed > 0) {
      peg.mesh.rotation.y = progress * Math.PI * style.spinSpeed;
    }

    // Squash & stretch
    const stretch = 1 + Math.sin(progress * Math.PI) * style.squash;
    const squash = 1 - Math.sin(progress * Math.PI) * style.squash * 0.5;
    peg.mesh.scale.set(startScale.x * squash, startScale.y * stretch, startScale.z * squash);

    // Play hop sound at apex
    if (!hopSoundPlayed && progress >= 0.45) {
      hopSoundPlayed = true;
      const section = toHoleId ? (toHoleId.charCodeAt(0) + (toHoleId.length > 2 ? toHoleId.charCodeAt(toHoleId.length - 1) : 0)) % 7 : 0;
      ManifoldAudio.playHop(section, progress);
    }

    if (progress < 1) {
      requestAnimationFrame(animateHop);
    } else {
      peg.mesh.position.copy(endPos);
      peg.mesh.scale.copy(startScale);
      peg.mesh.rotation.y = 0;
      peg.holeId = toHoleId;

      // Landing bounce for TIMID / CHEERFUL
      if (style.bounces > 0) {
        let b = 0;
        const bounceInterval = setInterval(() => {
          b++;
          const bh = arcHeight * 0.15 * (1 - b / (style.bounces + 1));
          const bDur = 80;
          const bStart = performance.now();
          function bounce() {
            const bp = Math.min(1, (performance.now() - bStart) / bDur);
            peg.mesh.position.y = endPos.y + Math.sin(bp * Math.PI) * bh;
            if (bp < 1) requestAnimationFrame(bounce);
            else peg.mesh.position.y = endPos.y;
          }
          bounce();
          if (b >= style.bounces) { clearInterval(bounceInterval); if (onComplete) onComplete(); }
        }, 100);
      } else {
        if (onComplete) onComplete();
      }
    }
  }

  animateHop();
}

// ════════════════════════════════════════════════════════════════
// SEQUENTIAL HOP — chain movePeg through each hole in the path
// ════════════════════════════════════════════════════════════════
function movePegAlongPath(pegId, path, onComplete) {
  if (!path || path.length === 0) {
    if (onComplete) onComplete();
    return;
  }
  let idx = 0;
  function hopNext() {
    if (idx >= path.length) {
      if (onComplete) onComplete();
      return;
    }
    const nextHole = path[idx];
    idx++;
    movePeg(pegId, nextHole, hopNext);
  }
  hopNext();
}

// Track which pegs are currently animating (skip teleport for them)
const _animatingPegs = new Set();
let _onAnimsDone = null;
let _moveBarrier = false; // Set true before renderBoard, cleared when all anims done
let _deferredAnimPending = false; // True when animations are deferred via CameraDirector.whenSettled

function _checkAnimsDone() {
  if (_animatingPegs.size === 0 && !_moveBarrier && !_deferredAnimPending) {
    if (_onAnimsDone) { const cb = _onAnimsDone; _onAnimsDone = null; cb(); }
  }
}

// Game-core calls this BEFORE renderBoard to raise the barrier
window.raiseAnimationBarrier = function () {
  _moveBarrier = true;
};

// Called by renderBoard3D after it finishes processing pending anims
function _lowerBarrier() {
  _moveBarrier = false;
  // If no animations were started and none are pending, fire the callback now
  _checkAnimsDone();
}

// Safety timer: if waitForAnimations sets a callback and it doesn't fire
// within 15 seconds, force-fire it so the game doesn't freeze.
let _animTimeout = null;
function _scheduleAnimSafetyTimeout(callback) {
  if (_animTimeout) { clearTimeout(_animTimeout); _animTimeout = null; }
  _animTimeout = setTimeout(() => {
    _animTimeout = null;
    // Force-clear any stuck animation tracking
    _animatingPegs.clear();
    _deferredAnimPending = false;
    _moveBarrier = false;
    console.warn('[SAFETY] Animation barrier timed out — force-advancing turn.');
    if (_onAnimsDone) { const cb = _onAnimsDone; _onAnimsDone = null; cb(); }
  }, 15000);
}
function _clearAnimSafetyTimeout() {
  if (_animTimeout) { clearTimeout(_animTimeout); _animTimeout = null; }
}

// Expose a way for game-core to wait until all hop animations finish
window.waitForAnimations = function (callback) {
  // Always check the condition: if nothing is blocking and no deferred
  // animations are pending, fire immediately.
  if (_animatingPegs.size === 0 && !_moveBarrier && !_deferredAnimPending) {
    callback();
    return;
  }
  _onAnimsDone = callback;
  _scheduleAnimSafetyTimeout(callback);
};

// True while a play is still resolving — pegs hopping or move barrier raised.
// Game-core uses this to block the draw button for redraw / extra-turn cards
// until all motion (and cutscenes that gate on it) has finished.
window.isPlayResolving = function () {
  // Only block if there are real peg animations in progress
  if (_animatingPegs && _animatingPegs.size > 0) return true;
  // Also block if deferred animations are pending and haven't started yet
  if (_deferredAnimPending) return true;
  // Ignore _moveBarrier for instant feedback; only use for true cutscenes
  return false;
};

// ════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
// PEG POSES — triggered during cutscenes
// ════════════════════════════════════════════════════════════════
function triggerPegPose(pegId, poseType) {
  const peg = pegRegistry.get(pegId);
  if (!peg || !peg.mesh) return;

  const mesh = peg.mesh;
  const startTime = performance.now();

  if (poseType === 'protest') {
    // Shake side to side angrily
    const duration = 1200;
    function animateProtest() {
      const t = (performance.now() - startTime) / duration;
      if (t > 1) { mesh.rotation.z = 0; mesh.rotation.x = 0; return; }
      const shake = Math.sin(t * Math.PI * 8) * 0.15 * (1 - t);
      mesh.rotation.z = shake;
      mesh.rotation.x = Math.sin(t * Math.PI * 6) * 0.08 * (1 - t);
      requestAnimationFrame(animateProtest);
    }
    animateProtest();
  } else if (poseType === 'victory') {
    // Triumphant bounce + spin
    const duration = 1500;
    const baseY = mesh.position.y;
    function animateVictory() {
      const t = (performance.now() - startTime) / duration;
      if (t > 1) {
        mesh.position.y = baseY;
        mesh.rotation.y = 0;
        mesh.scale.set(1, 1, 1);
        return;
      }
      // Bounce up
      const bounce = Math.sin(t * Math.PI * 3) * 15 * (1 - t * 0.5);
      mesh.position.y = baseY + Math.max(0, bounce);
      // Slow spin
      mesh.rotation.y = t * Math.PI * 2;
      // Slight scale pulse
      const pulse = 1 + Math.sin(t * Math.PI * 4) * 0.1;
      mesh.scale.set(pulse, pulse, pulse);
      requestAnimationFrame(animateVictory);
    }
    animateVictory();
  } else if (poseType === 'celebrate') {
    // Multi-bounce jumps with quick spins — exuberant victor reaction
    const duration = 1800;
    const baseY = mesh.position.y;
    function animateCelebrate() {
      const t = (performance.now() - startTime) / duration;
      if (t > 1) {
        mesh.position.y = baseY;
        mesh.rotation.y = 0;
        mesh.rotation.z = 0;
        mesh.scale.set(1, 1, 1);
        return;
      }
      // 4 sharp jumps — high amplitude, quick cadence
      const jump = Math.abs(Math.sin(t * Math.PI * 4)) * 22 * (1 - t * 0.4);
      mesh.position.y = baseY + jump;
      // Fast double spin
      mesh.rotation.y = t * Math.PI * 4;
      // Tilt side-to-side at jump apex (arms-out feel)
      mesh.rotation.z = Math.sin(t * Math.PI * 8) * 0.18 * (1 - t * 0.5);
      // Squash on landing, stretch at apex
      const stretch = 1 + Math.sin(t * Math.PI * 4) * 0.18;
      const squash = 1 - Math.cos(t * Math.PI * 4) * 0.08;
      mesh.scale.set(squash, stretch, squash);
      requestAnimationFrame(animateCelebrate);
    }
    animateCelebrate();
  } else if (poseType === 'shame') {
    // Bow forward + slow head shake — vanquished peg reaction
    const duration = 1600;
    const baseY = mesh.position.y;
    function animateShame() {
      const t = (performance.now() - startTime) / duration;
      if (t > 1) {
        mesh.position.y = baseY;
        mesh.rotation.x = 0;
        mesh.rotation.z = 0;
        mesh.rotation.y = 0;
        return;
      }
      // Sink down slightly (slumped posture)
      mesh.position.y = baseY - Math.sin(t * Math.PI) * 4;
      // Bow forward (rotate around X), hold the bow, then return
      const bow = Math.sin(t * Math.PI) * 0.55;
      mesh.rotation.x = bow;
      // Slow side-to-side head shake (no, no, no)
      mesh.rotation.y = Math.sin(t * Math.PI * 3) * 0.35;
      // Subtle lean
      mesh.rotation.z = Math.sin(t * Math.PI * 1.5) * 0.05;
      requestAnimationFrame(animateShame);
    }
    animateShame();
  } else if (poseType === 'dance') {
    // Rhythmic side-to-side hip-shake with light bounce — strategic-move flourish
    const duration = 1300;
    const baseY = mesh.position.y;
    function animateDance() {
      const t = (performance.now() - startTime) / duration;
      if (t > 1) {
        mesh.position.y = baseY;
        mesh.position.x = mesh.position.x; // restore not needed (driven via offset)
        mesh.rotation.y = 0;
        mesh.rotation.z = 0;
        mesh.scale.set(1, 1, 1);
        return;
      }
      // Light bounce (3 small hops)
      const hop = Math.abs(Math.sin(t * Math.PI * 3)) * 8;
      mesh.position.y = baseY + hop;
      // Hip-sway — gentle Z tilt sync'd with bounce
      mesh.rotation.z = Math.sin(t * Math.PI * 6) * 0.22;
      // Quick rhythmic Y-twist (shoulder shimmy feel)
      mesh.rotation.y = Math.sin(t * Math.PI * 4) * 0.4;
      // Subtle scale pulse on the beat
      const pulse = 1 + Math.abs(Math.sin(t * Math.PI * 6)) * 0.08;
      mesh.scale.set(pulse, 1 / Math.sqrt(pulse), pulse);
      requestAnimationFrame(animateDance);
    }
    animateDance();
  } else if (poseType === 'jig') {
    // Victor's celebratory jig — high knee-kicks, full spins, arm-swing tilts.
    // Used after a successful cut. ~2.2s long, more flamboyant than dance/celebrate.
    const duration = 2200;
    const baseY = mesh.position.y;
    function animateJig() {
      const t = (performance.now() - startTime) / duration;
      if (t > 1) {
        mesh.position.y = baseY;
        mesh.rotation.x = 0;
        mesh.rotation.y = 0;
        mesh.rotation.z = 0;
        mesh.scale.set(1, 1, 1);
        return;
      }
      // Big kicks — 5 sharp hops with high amplitude
      const kick = Math.abs(Math.sin(t * Math.PI * 5)) * 26 * (1 - t * 0.25);
      mesh.position.y = baseY + kick;
      // Full triple-spin around Y
      mesh.rotation.y = t * Math.PI * 6;
      // Arm-swing tilt — alternating Z lean on each kick
      mesh.rotation.z = Math.sin(t * Math.PI * 10) * 0.28 * (1 - t * 0.4);
      // Slight forward bow on the beat (knee-up feel)
      mesh.rotation.x = Math.sin(t * Math.PI * 5) * 0.18 * (1 - t * 0.4);
      // Squash-and-stretch on the kicks
      const stretch = 1 + Math.sin(t * Math.PI * 5) * 0.22;
      const squash = 1 - Math.cos(t * Math.PI * 5) * 0.10;
      mesh.scale.set(squash, stretch, squash);
      requestAnimationFrame(animateJig);
    }
    animateJig();
  }
}

// ════════════════════════════════════════════════════════════════
// GOLDEN CROWN — appears on home hole when safe zone is filled
// ════════════════════════════════════════════════════════════════
const _crownMeshes = new Map(); // boardPosition → crown mesh

function showGoldenCrown(boardPosition, playerColor) {
  if (_crownMeshes.has(boardPosition)) return; // Already showing

  const homeHoleId = `home-${boardPosition}`;
  const hole = holeRegistry.get(homeHoleId);
  if (!hole) return;

  const crownGroup = new THREE.Group();
  crownGroup.name = `crown-${boardPosition}`;

  // Crown base ring
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0xFFD700, roughness: 0.15, metalness: 0.9,
    emissive: new THREE.Color(0xFFAA00), emissiveIntensity: 0.4
  });
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(8, 1.5, 8, 16), baseMat);
  baseRing.rotation.x = Math.PI / 2;
  crownGroup.add(baseRing);

  // Crown points (5 prongs)
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const prong = new THREE.Mesh(
      new THREE.ConeGeometry(2, 8, 6),
      baseMat
    );
    prong.position.set(Math.cos(angle) * 7, 5, Math.sin(angle) * 7);
    crownGroup.add(prong);

    // Jewel on each prong
    const jewel = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 8, 6),
      new THREE.MeshStandardMaterial({
        color: playerColor || 0xff0000, roughness: 0.1, metalness: 0.3,
        emissive: new THREE.Color(playerColor || 0xff0000), emissiveIntensity: 0.5
      })
    );
    jewel.position.set(Math.cos(angle) * 7, 9.5, Math.sin(angle) * 7);
    crownGroup.add(jewel);
  }

  // Position above the home hole
  const boardY = boardGroup ? boardGroup.position.y : 90;
  crownGroup.position.set(hole.position.x, boardY + hole.position.y + 25, hole.position.z);

  // Animate in — scale from 0
  crownGroup.scale.set(0, 0, 0);
  scene.add(crownGroup);
  _crownMeshes.set(boardPosition, crownGroup);

  const startTime = performance.now();
  function animateCrownIn() {
    const t = Math.min(1, (performance.now() - startTime) / 800);
    const ease = 1 - Math.pow(1 - t, 3); // ease out cubic
    crownGroup.scale.set(ease, ease, ease);
    crownGroup.rotation.y += 0.02;
    if (t < 1) requestAnimationFrame(animateCrownIn);
  }
  animateCrownIn();

  // Continuous gentle rotation in animate loop
  crownGroup.userData.rotate = true;
  console.log(`👑 Golden crown placed on home-${boardPosition}`);
}

function triggerWinCrown(pegId) {
  // Add a small floating crown above the winning peg
  const peg = pegRegistry.get(pegId);
  if (!peg || !peg.mesh) return;

  const crownMat = new THREE.MeshStandardMaterial({
    color: 0xFFD700, roughness: 0.1, metalness: 0.9,
    emissive: new THREE.Color(0xFFAA00), emissiveIntensity: 0.6
  });
  const crownGroup = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 1, 6, 12), crownMat);
  ring.rotation.x = Math.PI / 2;
  crownGroup.add(ring);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const prong = new THREE.Mesh(new THREE.ConeGeometry(1.5, 5, 5), crownMat);
    prong.position.set(Math.cos(a) * 4.5, 3.5, Math.sin(a) * 4.5);
    crownGroup.add(prong);
  }
  crownGroup.position.set(0, 22, 0);
  peg.mesh.add(crownGroup);

  // Float & spin animation
  const startTime = performance.now();
  function floatCrown() {
    const t = (performance.now() - startTime) / 1000;
    crownGroup.position.y = 22 + Math.sin(t * 2) * 3;
    crownGroup.rotation.y = t * 1.5;
    requestAnimationFrame(floatCrown);
  }
  floatCrown();
}

// RENDER BRIDGE — sync peg meshes with RepresentationTable state
// ════════════════════════════════════════════════════════════════
function renderBoard3D() {
  if (!window.FastTrackCore) return;
  const core = window.FastTrackCore;
  const players = core.state.players.get('list') || [];
  const boardY = boardGroup ? boardGroup.position.y : 90;
  updateCrowns();   // place/clear the home-stretch crown on each render

  // Consume pending hop animation if any
  const pendingAnim = window._pendingHopAnim;
  const pendingAnim2 = window._pendingHopAnim2; // split move second peg
  window._pendingHopAnim = null;
  window._pendingHopAnim2 = null;

  // Tell CameraDirector which player is active
  const currentPlayer = core.state.players.get('current');
  if (currentPlayer != null) CameraDirector.setActivePlayer(currentPlayer);

  // Camera: if this is a split move, pan out to frame both pegs
  if (pendingAnim && pendingAnim2) {
    CameraDirector.followSplit(pendingAnim.pegId, pendingAnim2.pegId);
  }

  // Collect deferred animation starts — we'll fire them after camera settles
  const _deferredAnims = [];

  // Track which peg IDs we've seen (to remove stale ones)
  const activePegIds = new Set();

  players.forEach((player, pi) => {
    // Count holding slot index separately so pegs map to hold-{bp}-0..3
    let holdSlot = 0;
    player.pegs.forEach((peg, pegIdx) => {
      const pegId = peg.id;
      activePegIds.add(pegId);

      const existing = pegRegistry.get(pegId);
      const holeId = peg.holeId;

      if (holeId === 'holding') {
        // Peg in holding — show on holding area holes (4 slots: 0-3)
        const slot = Math.min(holdSlot, 3);
        holdSlot++;
        const holdHoleId = `hold-${player.boardPosition}-${slot}`;
        if (existing) {
          const hole = holeRegistry.get(holdHoleId);
          if (hole) {
            // Cut victim: arc the peg out from the cut hole to its holding slot
            // instead of teleporting. game-core tags `_cutFromHole` in bumpOccupant.
            if (peg._cutFromHole && !_animatingPegs.has(pegId)) {
              const fromHole = holeRegistry.get(peg._cutFromHole);
              if (fromHole) {
                // Snap mesh back to the cut hole so the arc starts there visually.
                existing.mesh.position.set(
                  fromHole.position.x,
                  boardY + LINE_HEIGHT + 1,
                  fromHole.position.z
                );
                existing.mesh.visible = true;
                _animatingPegs.add(pegId);
                _deferredAnims.push({ pegId, path: null, existing, holeId: holdHoleId });
              } else {
                existing.mesh.position.set(hole.position.x, boardY + LINE_HEIGHT + 1, hole.position.z);
                existing.mesh.visible = true;
              }
              // Clear the tag — one-shot.
              delete peg._cutFromHole;
            } else if (!_animatingPegs.has(pegId)) {
              existing.mesh.position.set(hole.position.x, boardY + LINE_HEIGHT + 1, hole.position.z);
              existing.mesh.visible = true;
            }
          }
        } else {
          createPeg(pegId, pi, holdHoleId, player.boardPosition);
        }
      } else {
        // Peg on board
        const hole = holeRegistry.get(holeId);
        if (!hole) return;

        if (existing) {
          if (existing.holeId !== holeId) {
            // Check if this peg has a pending hop animation
            const anim = (pendingAnim && pendingAnim.pegId === pegId) ? pendingAnim
              : (pendingAnim2 && pendingAnim2.pegId === pegId) ? pendingAnim2
                : null;
            if (anim && anim.path && anim.path.length > 0) {
              // Defer animation start until camera is in place
              _animatingPegs.add(pegId);
              CameraDirector.followPeg(pegId);
              _deferredAnims.push({ pegId, path: anim.path, existing, holeId });
            } else if (!_animatingPegs.has(pegId)) {
              // No path — single hop to destination (also deferred)
              _animatingPegs.add(pegId);
              CameraDirector.followPeg(pegId);
              _deferredAnims.push({ pegId, path: null, existing, holeId });
            }
          }
          existing.mesh.visible = true;
        } else {
          createPeg(pegId, pi, holeId, player.boardPosition);
        }
      }
    });
  });

  // ── Start animations only after camera has settled into position ──
  if (_deferredAnims.length > 0) {
    _deferredAnimPending = true;
    const startAllAnims = () => {
      _deferredAnimPending = false;
      for (const da of _deferredAnims) {
        const onDone = () => {
          _animatingPegs.delete(da.pegId);
          _clearAnimSafetyTimeout();
          da.existing.holeId = da.holeId;
          if (_animatingPegs.size === 0) {
            CameraDirector.unlockCutscene();
            if (_onAnimsDone) { const cb = _onAnimsDone; _onAnimsDone = null; cb(); }
          }
        };
        if (da.path) {
          movePegAlongPath(da.pegId, da.path, onDone);
        } else {
          movePeg(da.pegId, da.holeId, onDone);
        }
      }
    };
    // Wait for camera to smoothly arrive, then start hopping
    CameraDirector.whenSettled(startAllAnims);
  }

  // Remove pegs that no longer exist
  pegRegistry.forEach((peg, id) => {
    if (!activePegIds.has(id)) {
      removePeg(id);
    }
  });

  // Peg name labels.
  //
  // Rule (user_directive_2026-05-18 "turn on the next peg nickname once a
  // card is pulled that can activate it"):
  //   ALWAYS show a floating nickname over any peg that has at least one
  //   legal move with the currently drawn card — including pegs still in
  //   holding that an Ace / 6 / Joker can spawn out. This lets the player
  //   match the on-board (or in-home) peg with its button in the peg-bar
  //   before the move is even confirmed.
  //   Additionally, when GameSettings.showPegNames is on, label every
  //   on-board peg (legacy behaviour).
  // Peg name labels removed (user_directive_2026-06-06). The floating
  // nicknames were a remnant of text-based peg identification — players used
  // to pick a peg by reading its name. Pegs are now picked by clicking
  // gold-haloed holes directly on the board, so the labels carry no meaning
  // and only clutter the table. The nickname DATA is still used in text
  // hints / toasts / logs; only the on-board labels are suppressed here.
  hidePegNames();

  // Lower animation barrier — if no anims were started, this fires _onAnimsDone immediately
  _lowerBarrier();
}

// ════════════════════════════════════════════════════════════════
// ATMOSPHERIC DUST MOTES — floating particles in light beams
// ════════════════════════════════════════════════════════════════
function createDustMotes() {
  // Atmospheric particle count scales with the quality manifold's detail
  // multiplier — 400 on strong machines down to ~80 on the weakest.
  const _ftDetail = (window.FT_QUALITY && typeof window.FT_QUALITY.detail === 'number')
    ? window.FT_QUALITY.detail : 1;
  const MOTE_COUNT = Math.max(60, Math.round(400 * _ftDetail));
  const positions = new Float32Array(MOTE_COUNT * 3);
  const velocities = new Float32Array(MOTE_COUNT * 3);
  const sizes = new Float32Array(MOTE_COUNT);
  const opacities = new Float32Array(MOTE_COUNT);
  const phases = new Float32Array(MOTE_COUNT);  // for drift variation

  // Distribute motes in the room volume, concentrated near the table
  for (let i = 0; i < MOTE_COUNT; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * ROOM_WIDTH * 0.7;     // x
    positions[i3 + 1] = TABLE_HEIGHT + Math.random() * (ROOM_HEIGHT - TABLE_HEIGHT) * 0.8; // y: above table
    positions[i3 + 2] = (Math.random() - 0.5) * ROOM_DEPTH * 0.7;     // z

    // Slow random drift
    velocities[i3] = (Math.random() - 0.5) * 0.15;
    velocities[i3 + 1] = (Math.random() - 0.5) * 0.08;
    velocities[i3 + 2] = (Math.random() - 0.5) * 0.15;

    sizes[i] = 1.0 + Math.random() * 2.5;
    opacities[i] = 0.15 + Math.random() * 0.35;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));

  // Soft circular sprite texture
  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = 32; spriteCanvas.height = 32;
  const sctx = spriteCanvas.getContext('2d');
  const grad = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255, 240, 210, 1.0)');
  grad.addColorStop(0.3, 'rgba(255, 235, 200, 0.5)');
  grad.addColorStop(1, 'rgba(255, 230, 190, 0.0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 32, 32);
  const spriteTex = new THREE.CanvasTexture(spriteCanvas);

  const material = new THREE.PointsMaterial({
    map: spriteTex,
    size: 3,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xffeedd
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'dustMotes';
  scene.add(points);

  dustMotes = { points, positions, velocities, sizes, opacities, phases, count: MOTE_COUNT };
  console.log(`✨ ${MOTE_COUNT} atmospheric dust motes created`);
}

function updateDustMotes(time) {
  if (!dustMotes) return;
  const { positions, velocities, phases, count } = dustMotes;
  const posAttr = dustMotes.points.geometry.getAttribute('position');

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const phase = phases[i];

    // Gentle sinusoidal drift (Brownian-like)
    positions[i3] += velocities[i3] + Math.sin(time * 0.3 + phase) * 0.04;
    positions[i3 + 1] += velocities[i3 + 1] + Math.sin(time * 0.2 + phase * 1.5) * 0.02;
    positions[i3 + 2] += velocities[i3 + 2] + Math.cos(time * 0.25 + phase * 0.7) * 0.04;

    // Soft thermal updraft near center (above table lamp)
    const dx = positions[i3];
    const dz = positions[i3 + 2];
    const distFromCenter = Math.sqrt(dx * dx + dz * dz);
    if (distFromCenter < 200) {
      positions[i3 + 1] += 0.03 * (1 - distFromCenter / 200);  // gentle rise
    }

    // Wrap around room bounds
    const hw = ROOM_WIDTH * 0.35, hd = ROOM_DEPTH * 0.35;
    if (positions[i3] > hw) positions[i3] = -hw;
    if (positions[i3] < -hw) positions[i3] = hw;
    if (positions[i3 + 2] > hd) positions[i3 + 2] = -hd;
    if (positions[i3 + 2] < -hd) positions[i3 + 2] = hd;
    // Vertical wrap
    if (positions[i3 + 1] > ROOM_HEIGHT * 0.9) positions[i3 + 1] = TABLE_HEIGHT + 10;
    if (positions[i3 + 1] < TABLE_HEIGHT) positions[i3 + 1] = ROOM_HEIGHT * 0.8;
  }

  posAttr.needsUpdate = true;
}

// ════════════════════════════════════════════════════════════════
// X-DIMENSIONAL GRAPH — embedded has-a / is-a runtime object
// x = game (contains players, board, pegs, holes)
// y = manifold/runtime signals
// z = resolved state projection from x and y
// ════════════════════════════════════════════════════════════════
function buildDimensionalGameObject(ctx = {}) {
  const core = window.FastTrackCore;
  const st = core && core.state;
  if (!st) return null;
  const xdim = window.Manifold && window.Manifold.xdim;
  if (!xdim) return null;

  const players = Array.isArray(st.players.get('list')) ? st.players.get('list') : [];
  const boardEntries = st.board && typeof st.board.keys === 'function'
    ? st.board.keys().map((holeId) => ({ holeId, pegId: st.board.get(holeId) || null }))
    : [];

  const pegNodes = [];
  const playerNodes = players.map((p) => {
    const pegs = Array.isArray(p.pegs) ? p.pegs : [];
    const pegRefs = pegs.map((pg) => {
      const node = xdim.node({
        id: pg.id,
        isA: 'peg',
        level: 'point',
        hasA: {
          position: xdim.node({
            id: `${pg.id}:position`,
            isA: 'position',
            level: 'line',
            attrs: { holeId: pg.holeId, holeType: pg.holeType },
          }),
        },
        attrs: {
          personality: pg.personality,
          mood: pg.mood,
        },
      });
      pegNodes.push(node);
      return node;
    });

    return xdim.node({
      id: p.userId || `player-${p.index}`,
      isA: p.isBot ? 'bot-player' : 'human-player',
      level: 'column',
      hasA: {
        profile: xdim.node({
          id: `${p.userId || `player-${p.index}`}:profile`,
          isA: 'profile',
          level: 'line',
          attrs: { name: p.name, avatar: p.avatar },
        }),
        seat: xdim.node({
          id: `${p.userId || `player-${p.index}`}:seat`,
          isA: 'seat',
          level: 'line',
          attrs: { index: p.index, boardPosition: p.boardPosition, color: p.color },
        }),
        pegs: pegRefs,
      },
    });
  });

  const holeNodes = boardEntries.map((h) => xdim.node({
    id: h.holeId,
    isA: 'hole',
    level: 'point',
    attrs: {
      occupantPegId: h.pegId,
    },
  }));

  const x = xdim.node({
    id: ctx.sessionId || 'fasttrack-local',
    isA: 'game',
    level: 'whole(point)',
    hasA: {
      identity: xdim.node({
        id: `${ctx.sessionId || 'fasttrack-local'}:identity`,
        isA: 'identity',
        level: 'void',
        attrs: {
          gameId: 'fasttrack',
          mode: ctx.mode || 'solo',
          code: ctx.code || '',
        },
      }),
      players: playerNodes,
      board: xdim.node({
        id: `${ctx.sessionId || 'fasttrack-local'}:board`,
        isA: 'board',
        level: 'plane',
        hasA: {
          holes: holeNodes,
          pegs: pegNodes,
        },
      }),
    },
  });

  const y = {
    runtime: {
      phase: st.turn.get('phase') || 'draw',
      currentPlayerIndex: st.players.get('current') || 0,
      currentCard: st.deck.get('currentCard') || null,
      manifoldTime: performance.now(),
    },
  };

  const z = {
    state: {
      playerCount: playerNodes.length,
      pegCount: pegNodes.length,
      occupiedHoles: holeNodes.filter((h) => !!(h.hasA && h.hasA.occupantPegId)).length,
      winner: st.meta.get('winner') || null,
    },
  };

  // y modifies higher-dimensional x nodes at runtime; z resolves x·y outputs.
  xdim.attachY(x, {
    code: 'turn.phase->board',
    targetId: `${ctx.sessionId || 'fasttrack-local'}:board`,
    rule: 'phase-state-transition',
    manifold: y.runtime,
    value: z.state,
  });
  xdim.resolveZ(x);

  return { x, y, z };
}

function publishDimensionalGraph(ctx = {}) {
  const graph = buildDimensionalGameObject(ctx);
  if (!graph) return null;
  window.KGDimensionalGraph = graph;
  window.KGGameObject = graph.x;
  window.KGRuntimeY = graph.y;
  window.KGStateZ = graph.z;

  // Recursive object lookup by id for calling embedded nodes individually.
  window.KGFindObjectById = function KGFindObjectById(targetId, node = graph.x) {
    if (!node || typeof node !== 'object') return null;
    if (node.id === targetId) return node;
    for (const val of Object.values(node)) {
      if (Array.isArray(val)) {
        for (const child of val) {
          const found = window.KGFindObjectById(targetId, child);
          if (found) return found;
        }
      } else if (val && typeof val === 'object') {
        const found = window.KGFindObjectById(targetId, val);
        if (found) return found;
      }
    }
    return null;
  };
  return graph;
}

// ════════════════════════════════════════════════════════════════
// ANIMATION LOOP & UTILITIES
// ════════════════════════════════════════════════════════════════
let _animTime = 0;
// Scratch vector reused every frame by the chandelier fade — hoisted out of
// the loop so the render path allocates nothing per frame (§5 discipline:
// the hot loop must not generate garbage that the GC then has to reclaim).
const _chandelierDir = new THREE.Vector3();

function animate3D() {
  requestAnimationFrame(animate3D);
  _animTime += 0.016;

  // Adaptive quality governor — residual correction toward the frame-time
  // target. Cheap; bails immediately when the tier is pinned.
  if (window.FT_QUALITY && window.FT_QUALITY.frame) {
    window.FT_QUALITY.frame(performance.now());
  }

  // Update atmospheric particles
  updateDustMotes(_animTime);

  // Chandelier fade — disappears when camera is looking straight down over the board.
  // t = 1 → fully visible.  t = 0 → fully hidden.
  // Fades meshes (opacity) AND point lights (intensity) together.
  const chandelier = scene.getObjectByName('chandelier');
  if (chandelier && camera) {
    camera.getWorldDirection(_chandelierDir);
    // downAngle: 0 rad = looking straight down, π/2 = level, π = straight up
    const downAngle = Math.acos(Math.max(-1, Math.min(1, -_chandelierDir.y)));
    // Fade window: fully visible above 38°, fully hidden below 18°
    const t = Math.max(0, Math.min(1, (downAngle - 0.31) / 0.35)); // 0.31 rad≈18°, 0.66 rad≈38°

    if (t < 0.995) {
      // Fading — touch every child
      chandelier.visible = true;
      chandelier.traverse(child => {
        if (child.isMesh && child.material) {
          // Cache original values once
          if (child.material._baseOpacity === undefined) {
            child.material._baseOpacity = child.material.opacity;
            child.material._wasTransparent = child.material.transparent;
          }
          child.material.transparent = true;
          child.material.opacity = child.material._baseOpacity * t;
        }
        // Fade point lights by intensity (not material)
        if (child.isLight && child._baseIntensity !== undefined) {
          child.intensity = child._baseIntensity * t;
        }
      });
      // Hide group entirely when fully transparent (avoids z-sort artifacts)
      chandelier.visible = t > 0.01;
    } else {
      // Fully visible — restore everything
      chandelier.visible = true;
      chandelier.traverse(child => {
        if (child.isMesh && child.material && child.material._baseOpacity !== undefined) {
          child.material.opacity = child.material._baseOpacity;
          child.material.transparent = child.material._wasTransparent ?? false;
        }
        if (child.isLight && child._baseIntensity !== undefined) {
          child.intensity = child._baseIntensity;
        }
      });
    }
  }

  // Rotate golden crowns
  _crownMeshes.forEach(crown => {
    if (crown.userData.rotate) crown.rotation.y += 0.01;
  });

  CameraDirector.update(16);
  controls.update();

  // ── CAMERA CUBIC BOUNDING BOX — stays inside the four walls ──
  {
    const hx = ROOM_WIDTH / 2 - 10;
    const hz = ROOM_DEPTH / 2 - 10;
    const p = camera.position;
    p.x = Math.max(-hx, Math.min(hx, p.x));
    p.z = Math.max(-hz, Math.min(hz, p.z));
    p.y = Math.max(10, Math.min(ROOM_HEIGHT + 80, p.y));
  }

  renderer.render(scene, camera);
}

// Keep the board fully visible regardless of viewport aspect by widening the
// vertical FOV on narrow/portrait screens. Desktop landscape ratios stay at
// the design FOV (45°); phones in portrait grow up to ~80°.
function fitVerticalFovToAspect(cam) {
  const aspect = cam.aspect || (window.innerWidth / window.innerHeight);
  const desiredHFov = 50 * Math.PI / 180;
  const minVFov = 2 * Math.atan(Math.tan(desiredHFov / 2) / Math.max(aspect, 0.35)) * 180 / Math.PI;
  cam.fov = Math.max(45, Math.min(80, minVFov));
}

// The board renders into #container, which CSS insets between the fixed header (deck)
// and footer (controls) bars. Sizing to the container, not the whole window, keeps the
// board entirely in the clear middle band, so a control bar can never cover a hole on any
// screen size. Falls back to the window if the container isn't measurable yet.
function _viewSize() {
  const c = document.getElementById('container');
  const w = (c && c.clientWidth) || window.innerWidth;
  const h = (c && c.clientHeight) || window.innerHeight;
  return { w, h };
}

function onWindowResize() {
  if (!renderer || !camera) return;
  const { w, h } = _viewSize();
  renderer.setSize(w, h);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, w, h);
  camera.aspect = w / h;
  fitVerticalFovToAspect(camera);
  camera.updateProjectionMatrix();
}

function setCameraView(mode) {
  CameraDirector.setMode(mode);

  // Update button states — legacy on-board buttons …
  document.querySelectorAll('.cam-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`.cam-btn[onclick*="${mode}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  // … and the hamburger camera row.
  document.querySelectorAll('#hamburger-menu .hm-cam-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-cam') === mode);
  });
}

// ════════════════════════════════════════════════════════════════
// PATH HIGHLIGHTING — glow destination holes when choices shown
// ════════════════════════════════════════════════════════════════
const highlightMeshes = [];  // track glow rings for cleanup
let highlightAnimFrame = null;
// Original emissive state of any hole mesh we boosted, keyed by holeId.
// Restored in clearHighlights so destination glow doesn't bleed across turns.
const _boostedHoles = new Map(); // holeId -> { color: THREE.Color, intensity: number }

function _restoreBoostedHoles() {
  for (const [hid, prev] of _boostedHoles) {
    const hole = holeRegistry.get(hid);
    if (hole && hole.mesh && hole.mesh.material && hole.mesh.material.emissive) {
      hole.mesh.material.emissive.copy(prev.color);
      hole.mesh.material.emissiveIntensity = prev.intensity;
    }
  }
  _boostedHoles.clear();
}

function _boostHoleEmissive(holeId, hexColor) {
  const hole = holeRegistry.get(holeId);
  if (!hole || !hole.mesh || !hole.mesh.material || !hole.mesh.material.emissive) return;
  if (!_boostedHoles.has(holeId)) {
    _boostedHoles.set(holeId, {
      color: hole.mesh.material.emissive.clone(),
      intensity: hole.mesh.material.emissiveIntensity
    });
  }
  hole.mesh.material.emissive.set(hexColor);
  hole.mesh.material.emissiveIntensity = 1.4;
}

function clearHighlights() {
  for (const mesh of highlightMeshes) {
    if (mesh.parent) mesh.parent.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  }
  highlightMeshes.length = 0;
  _restoreBoostedHoles();
  if (highlightAnimFrame) {
    cancelAnimationFrame(highlightAnimFrame);
    highlightAnimFrame = null;
  }
}

function createGlowRing(holeId, color, isDestination, opts = {}) {
  const hole = holeRegistry.get(holeId);
  if (!hole) return null;

  const pulsing = opts.pulsing !== false;
  // user_directive_2026-05-10: destination rings now larger + thicker so the
  // landable holes pop visibly over the route trail. Trail rings stay subtle.
  const radius = isDestination ? 14.5 : 9.5;
  const thickness = isDestination ? 3.6 : 2.2;
  const ringGeo = new THREE.RingGeometry(radius - thickness, radius, 40);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: pulsing ? (isDestination ? 0.92 : 0.62) : (isDestination ? 0.68 : 0.44),
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(hole.position.x, hole.position.y + 5, hole.position.z);
  ring.renderOrder = 10;
  ring.userData.isDestination = isDestination;
  ring.userData.isDisc = false;
  ring.userData.pulsing = pulsing;
  boardGroup.add(ring);
  highlightMeshes.push(ring);

  const discGeo = new THREE.CircleGeometry(radius - thickness, 40);
  discGeo.rotateX(-Math.PI / 2);
  const discMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: pulsing ? (isDestination ? 0.18 : 0.12) : (isDestination ? 0.26 : 0.18),
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.position.set(hole.position.x, hole.position.y + 4, hole.position.z);
  disc.renderOrder = 9;
  disc.userData.isDestination = isDestination;
  disc.userData.isDisc = true;
  disc.userData.pulsing = pulsing;
  boardGroup.add(disc);
  highlightMeshes.push(disc);

  // user_directive_2026-05-19: cone arrows above destinations removed —
  // they read as "rays of light" that got in the way of the board view.
  // The pulsing ring halo alone is the destination cue now.

  return ring;
}

function createPegHalo(pegId, color, opts = {}) {
  const peg = pegRegistry.get(pegId);
  if (!peg || !peg.mesh) return null;
  const pulsing = opts.pulsing !== false;
  // user_directive_2026-05-10: selected-peg halo is the primary visual cue for
  // split-7 stage 1 (and any single-peg-pick) — much larger ring, brighter
  // material, plus an outer aura ring and a vertical beacon so the chosen peg
  // reads instantly across the whole board.
  const px = peg.mesh.position.x;
  const pz = peg.mesh.position.z;
  const ringY = boardGroup.position.y + LINE_HEIGHT + 0.6;

  // Inner ring (bright primary halo)
  const radius = 20;
  const thickness = 4.0;
  const ringGeo = new THREE.RingGeometry(radius - thickness, radius, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: pulsing ? 1.0 : 0.7,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(px, ringY, pz);
  ring.renderOrder = 10;
  ring.userData.isDestination = true;
  ring.userData.isDisc = false;
  ring.userData.pulsing = pulsing;
  boardGroup.add(ring);
  highlightMeshes.push(ring);

  // Outer aura ring (wider, dimmer, counter-pulses for a "breathing" feel)
  const outerR = 32;
  const outerT = 3.0;
  const auraGeo = new THREE.RingGeometry(outerR - outerT, outerR, 48);
  auraGeo.rotateX(-Math.PI / 2);
  const auraMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });
  const aura = new THREE.Mesh(auraGeo, auraMat);
  aura.position.set(px, ringY + 0.2, pz);
  aura.renderOrder = 10;
  aura.userData.isDestination = false; // counter-pulses
  aura.userData.isDisc = false;
  aura.userData.pulsing = pulsing;
  boardGroup.add(aura);
  highlightMeshes.push(aura);

  // user_directive_2026-05-19: vertical peg beacon cylinder removed — was
  // perceived as an in-the-way "ray of light". The pulsing inner + outer
  // rings (above) are the sole peg-selection cue now.

  return ring;
}

function _activePlayerColorInt() {
  const hex = _activePlayerColorHex();
  const parsed = parseInt(String(hex || '').replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : 0x66ccff;
}

function _drawCommittedSplitPath(vm, color) {
  const choice = _getSplitChoice();
  if (!choice) return;
  const first = vm.find(m => m && m.type === 'split'
    && ((m.pegIdx === choice.pegIdx && m.steps === choice.steps)
      || (m.peg2Idx === choice.pegIdx && m.steps2 === choice.steps)));
  if (!first) return;

  const firstIsLeg1 = first.pegIdx === choice.pegIdx && first.steps === choice.steps;
  const from = firstIsLeg1 ? first.from : first.from2;
  const path = firstIsLeg1 ? first.path : first.path2;
  if (from && from !== 'holding') createGlowRing(from, color, false, { pulsing: false });
  if (Array.isArray(path)) {
    for (const hid of path) createGlowRing(hid, color, hid === (path[path.length - 1]), { pulsing: false });
  }
}

function highlightMovePaths(moves) {
  clearHighlights();
  const vm = moves || (window.FastTrackCore && window.FastTrackCore.state
    ? window.FastTrackCore.state.turn.get('validMoves') || [] : []);
  if (vm.length === 0) return;

  // Gold = a selectable/legal landing hole; green = the first leg the player
  // has already committed (user_directive_2026-06-06). The gold/green palette
  // applies whenever a 7-split is on offer; otherwise destinations keep the
  // active player's colour.
  const GOLD = 0xffd700;
  const GREEN = 0x35ff7a;
  const hasSplits = vm.some(m => m && m.type === 'split');
  const color = hasSplits ? GOLD : _activePlayerColorInt();
  const index = _buildRouteIndex(vm);

  // If split first leg is already chosen, lock it in GREEN (solid glow) while
  // the remaining second-leg choices pulse gold as clickable targets.
  _drawCommittedSplitPath(vm, GREEN);

  // ── BUILD COMMIT-DESTINATION SET ──
  // user_directive_2026-05-10b: when there is a choice, every choice glows
  // by default. The cycle/confirm toolbar narrows the highlight to one when
  // the player steps through previews. A hole/peg is a "choice" if clicking
  // it would stage a commit-level entry (regardless of whether multiple
  // routes share it).
  const commitDests = new Set();
  vm.forEach((m, i) => {
    if (!m) return;
    if (m.type === 'split') {
      const choice = _getSplitChoice();
      if (choice && choice.steps != null) {
        // Stage 2b: second-leg dest is the commit point
        if (m.pegIdx === choice.pegIdx && m.steps === choice.steps) {
          commitDests.add(m.dest2);
        } else if (m.peg2Idx === choice.pegIdx && m.steps2 === choice.steps) {
          commitDests.add(m.dest);
        }
      } else if (choice && choice.steps == null) {
        // Stage 2a: first-leg dest is the commit point
        if (m.pegIdx === choice.pegIdx) commitDests.add(m.dest);
        else if (m.peg2Idx === choice.pegIdx) commitDests.add(m.dest2);
      } else {
        // Stage 1 (hole-first): every first-leg destination of BOTH halves is
        // a clickable gold landing. The 7-hop solo move (a regular 'move')
        // adds its own dest below.
        if (m.dest != null) commitDests.add(m.dest);
        if (m.dest2 != null) commitDests.add(m.dest2);
      }
      return;
    }
    if (m.dest) commitDests.add(m.dest);
  });

  // Pegs that can be picked (split-first-peg or single-peg routes). Any peg
  // that appears as the commitable peg in any entry should halo.
  const commitPegIdxs = new Set();
  for (const [key, entries] of index.entries()) {
    if (!key.startsWith('peg:') || !Array.isArray(entries) || !entries.length) continue;
    commitPegIdxs.add(Number(key.slice(4)));
  }

  const players = (window.FastTrackCore && window.FastTrackCore.state)
    ? window.FastTrackCore.state.players.get('list') || [] : [];
  const ci = (window.FastTrackCore && window.FastTrackCore.state)
    ? window.FastTrackCore.state.players.get('current') || 0 : 0;
  const curPegs = (players[ci] && players[ci].pegs) ? players[ci].pegs : [];

  for (const pegIdx of commitPegIdxs) {
    const peg = curPegs[pegIdx];
    if (peg && peg.id) createPegHalo(peg.id, color, { pulsing: true });
  }
  for (const holeId of commitDests) {
    createGlowRing(holeId, color, true, { pulsing: true });
  }

  function pulseHighlights() {
    const t = performance.now() * 0.0046;
    for (const mesh of highlightMeshes) {
      if (!mesh.userData.pulsing) continue;
      if (mesh.userData.isBeam) {
        // Vertical beacon — gentle pulse, never fully off.
        mesh.material.opacity = 0.42 + Math.sin(t * 2.1) * 0.22;
        const sy = 1 + Math.sin(t * 2.1) * 0.06;
        mesh.scale.set(1, sy, 1);
      } else if (mesh.userData.isArrow) {
        // Downward arrow — bobs vertically + pulses opacity so the "tap here"
        // hint reads unmistakably across the board.
        mesh.material.opacity = 0.85 + Math.sin(t * 2.4) * 0.15;
        const baseY = mesh.userData.baseY != null ? mesh.userData.baseY : mesh.position.y;
        mesh.position.y = baseY + Math.sin(t * 2.4) * 5;
      } else if (mesh.userData.isDisc) {
        mesh.material.opacity = mesh.userData.isDestination
          ? 0.22 + Math.sin(t * 2.1) * 0.16
          : 0.14 + Math.sin(t * 2.1) * 0.10;
      } else if (mesh.userData.isDestination) {
        // Destination ring — strong throb so landable holes pop.
        mesh.material.opacity = 0.9 + Math.sin(t * 2.1) * 0.22;
        const scale = 1 + Math.sin(t * 1.8) * 0.22;
        mesh.scale.set(scale, 1, scale);
      } else {
        // Trail / aura ring — counter-phase so the destination "breathes" out.
        mesh.material.opacity = 0.5 + Math.sin(t * 2.1 + Math.PI) * 0.22;
        const scale = 1 + Math.sin(t * 1.8 + Math.PI) * 0.12;
        mesh.scale.set(scale, 1, scale);
      }
    }
    highlightAnimFrame = requestAnimationFrame(pulseHighlights);
  }
  pulseHighlights();
}

function highlightSinglePath(moveIdx) {
  const vm = window.FastTrackCore && window.FastTrackCore.state
    ? window.FastTrackCore.state.turn.get('validMoves') || [] : [];
  if (moveIdx >= 0 && moveIdx < vm.length) {
    highlightMovePaths([vm[moveIdx]]);
  }
}

// ════════════════════════════════════════════════════════════════
// PICK-ON-BOARD — click (or tap) any hole on a unique route to play.
// Pointer events cover both mouse and touch so the same flow runs
// on desktop and mobile. Ambiguous holes (multiple routes share
// them) are no-ops; the player picks a hole further along the
// route they want.
// ════════════════════════════════════════════════════════════════
let _routeIndex = new Map();   // targetKey(holeId|peg:<idx>) -> [entry, ...]
let _routeIndexHash = '';      // re-build only when valid moves change

// ── Cycle-and-confirm state ────────────────────────────────────
// The footer toolbar is the primary input. ◀ / ▶ cycle through every
// legal commit-level entry; ✓ commits. Board clicks are an optional
// shortcut that simply jumps the cycle to that target.
let _pendingEntry = null;          // entry currently staged for confirmation
let _pendingTargetKey = '';        // last clicked target key (for board cycling)
let _pendingCycleIdx = -1;         // index into entries for that target
let _moveCycle = [];               // flat ordered list of unique commit-level entries
let _moveCycleIdx = -1;            // index into _moveCycle
const _pickRaycaster = (typeof THREE !== 'undefined') ? new THREE.Raycaster() : null;
const _pickMouse = (typeof THREE !== 'undefined') ? new THREE.Vector2() : null;

function _currentValidMoves() {
  return (window.FastTrackCore && window.FastTrackCore.state)
    ? window.FastTrackCore.state.turn.get('validMoves') || [] : [];
}

// Build holeId -> [entry, ...] index from the current valid moves.
// Entries are tagged so click/hover can dispatch the right action:
//   { kind:'move',         moveIdx }                            — regular move
//   { kind:'split-first',  pegIdx, steps, sampleIdx }           — pick a 7-split's first leg
//   { kind:'split-second', moveIdx }                            — complete a 7-split after first leg picked
//
// Dedup rules mirror renderHints:
//   - 'enter' moves collapse to one
//   - non-enter regular moves dedup by dest|pegIdx
//   - split first legs dedup by pegIdx:steps (the path is determined by them)
//   - split second-leg entries are emitted only for splits whose first leg
//     matches the in-progress getSplitChoice(); the OTHER peg's path is exposed
function _getSplitChoice() {
  if (typeof window.getSplitChoice !== 'function') return null;
  const c = window.getSplitChoice();
  if (!c || c.pegIdx == null) return null;
  return {
    pegIdx: Number(c.pegIdx),
    steps: c.steps == null ? null : Number(c.steps)
  };
}

function _buildRouteIndex(moves) {
  const index = new Map();
  const pushEntry = (key, entry) => {
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(entry);
  };
  const seenNon = new Set();
  let seenEnter = false;
  const splitPegSeen = new Set();
  const splitStepSeen = new Set();
  const choice = _getSplitChoice();

  moves.forEach((m, i) => {
    if (!m) return;

    if (m.type === 'split') {
      if (!choice) {
        // Stage 1 (hole-first, user_directive_2026-06-06): every half of every
        // split is a candidate FIRST leg — the player may commit a peg to any
        // hop count 1..6 (the 7-hop solo move is a regular 'move' entry). Each
        // (peg, steps) leg is exposed by its whole path + destination so any
        // gold-haloed hole is directly clickable to pick that first leg. The
        // split-first commit selects (peg, steps) in one go.
        const legs = [
          { pegIdx: m.pegIdx, steps: m.steps, dest: m.dest, path: m.path, from: m.from },
          { pegIdx: m.peg2Idx, steps: m.steps2, dest: m.dest2, path: m.path2, from: m.from2 },
        ];
        for (const leg of legs) {
          if (leg.pegIdx == null || leg.dest == null) continue;
          const legKey = `${leg.pegIdx}:${leg.steps}:${leg.dest}`;
          if (splitStepSeen.has(legKey)) continue;
          splitStepSeen.add(legKey);
          const e = { kind: 'split-first', pegIdx: leg.pegIdx, steps: leg.steps, sampleIdx: i };
          if (leg.from && leg.from !== 'holding') pushEntry(leg.from, e);
          if (Array.isArray(leg.path)) for (const hid of leg.path) pushEntry(hid, e);
          pushEntry(leg.dest, e);
        }
      } else if (choice.steps == null) {
        // Stage 2a: peg chosen, now expose first-leg destination routes.
        let leg = null;
        if (m.pegIdx === choice.pegIdx) {
          leg = { from: m.from, path: m.path, dest: m.dest, steps: m.steps };
        } else if (m.peg2Idx === choice.pegIdx) {
          leg = { from: m.from2, path: m.path2, dest: m.dest2, steps: m.steps2 };
        }
        if (!leg) return;
        const legPathKey = Array.isArray(leg.path) ? leg.path.join('>') : '';
        const legKey = `${choice.pegIdx}:${leg.steps}:${leg.dest}:${legPathKey}`;
        if (splitStepSeen.has(legKey)) return;
        splitStepSeen.add(legKey);
        if (leg.from && leg.from !== 'holding') {
          pushEntry(leg.from, { kind: 'split-first', pegIdx: choice.pegIdx, steps: leg.steps, sampleIdx: i });
        }
        if (Array.isArray(leg.path)) {
          for (const hid of leg.path) {
            pushEntry(hid, { kind: 'split-first', pegIdx: choice.pegIdx, steps: leg.steps, sampleIdx: i });
          }
        }
        pushEntry(leg.dest, { kind: 'split-first', pegIdx: choice.pegIdx, steps: leg.steps, sampleIdx: i });
      } else {
        // Stage 2b: first leg locked; expose only unpicked second-leg route.
        let secondLeg = null;
        if (m.pegIdx === choice.pegIdx && m.steps === choice.steps) {
          secondLeg = { from: m.from2, path: m.path2, dest: m.dest2 };
        } else if (m.peg2Idx === choice.pegIdx && m.steps2 === choice.steps) {
          secondLeg = { from: m.from, path: m.path, dest: m.dest };
        }
        if (!secondLeg) return;
        if (secondLeg.from && secondLeg.from !== 'holding') {
          pushEntry(secondLeg.from, { kind: 'split-second', moveIdx: i });
        }
        if (Array.isArray(secondLeg.path)) {
          for (const hid of secondLeg.path) {
            pushEntry(hid, { kind: 'split-second', moveIdx: i });
          }
        }
        pushEntry(secondLeg.dest, { kind: 'split-second', moveIdx: i });
      }
      return;
    }

    if (m.type === 'enter') {
      if (seenEnter) return;
      seenEnter = true;
    } else {
      const key = (m.dest || '') + '|' + m.pegIdx;
      if (seenNon.has(key)) return;
      seenNon.add(key);
    }

    if (m.from && m.from !== 'holding') {
      pushEntry(m.from, { kind: 'move', moveIdx: i });
    }
    if (Array.isArray(m.path)) {
      for (const hid of m.path) pushEntry(hid, { kind: 'move', moveIdx: i });
    }
    pushEntry(m.dest, { kind: 'move', moveIdx: i });
  });
  return index;
}

function _refreshRouteIndex() {
  const vm = _currentValidMoves();
  const choice = _getSplitChoice();
  const choiceTag = choice ? `${choice.pegIdx}:${choice.steps}` : '';
  const hash = vm.map(m => `${m.type}:${m.pegIdx}:${m.dest}:${m.steps || ''}`).join('|') + '#' + choiceTag;
  if (hash !== _routeIndexHash) {
    _routeIndexHash = hash;
    _routeIndex = _buildRouteIndex(vm);
    // Valid-move set changed (commit, turn end, or split-stage advance):
    // drop any stale pending confirmation so we don't apply it to a new state.
    _pendingEntry = null;
    _pendingTargetKey = '';
    _pendingCycleIdx = -1;
    _rebuildMoveCycle();
    _refreshConfirmBar();
    // user_directive_2026-05-10: if there's exactly one legal option, skip the
    // confirm bar and just play it. This chains through forced split sub-stages
    // (1 peg → 1 steps → 1 dest all auto-execute). Deferred via queueMicrotask
    // so we don't recurse inside the current refresh call.
    _maybeAutoCommitSingle();
  }
  return _routeIndex;
}

// Auto-commit when the move cycle collapses to a single legal entry. Guarded
// with a re-entrancy flag so a chain of forced choices doesn't re-enter the
// scheduler before the previous tick has flushed.
let _autoCommitScheduled = false;
function _maybeAutoCommitSingle() {
  if (_autoCommitScheduled) return;
  if (!_moveCycle || _moveCycle.length !== 1) return;
  const targetEntry = _moveCycle[0];
  // user_directive_2026-05-19 — when there is only ONE legal play, just
  // execute it. Includes terminal moves (previous safeguard reverted per
  // user feedback: "do not require any button pushing when there is only
  // 1 choice"). Card-7 split sub-stages also auto-advance through this.
  _autoCommitScheduled = true;
  queueMicrotask(() => {
    _autoCommitScheduled = false;
    // Verify the entry is still the sole option (state may have shifted).
    if (!_moveCycle || _moveCycle.length !== 1) return;
    if (_entryKey(_moveCycle[0]) !== _entryKey(targetEntry)) return;
    _commitEntry(targetEntry);
  });
}

// Flatten the route index into a unique, ordered list of commit-level entries.
// Order: index-iteration order (which mirrors validMoves order), de-duped by entryKey.
function _rebuildMoveCycle() {
  const seen = new Set();
  const list = [];
  for (const arr of _routeIndex.values()) {
    for (const entry of arr) {
      const key = _entryKey(entry);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push(entry);
    }
  }
  _moveCycle = list;
  _moveCycleIdx = -1;
}

function _entryKey(e) {
  if (!e) return '';
  if (e.kind === 'move' || e.kind === 'split-second') return `${e.kind}:${e.moveIdx}`;
  if (e.kind === 'split-first-peg') return `split-first-peg:${e.pegIdx}`;
  if (e.kind === 'split-first') return `split-first:${e.pegIdx}:${e.steps}`;
  return '';
}

// Highlight just the relevant route for a hover entry.
function _previewEntry(entry, vm) {
  if (!entry) return;
  if (entry.kind === 'move') {
    if (typeof window.highlightSinglePath === 'function') window.highlightSinglePath(entry.moveIdx);
    return;
  }
  if (entry.kind === 'split-first-peg') {
    if (typeof window.highlightMovePaths !== 'function') return;
    const pegSplits = vm.filter(m => m && m.type === 'split'
      && (m.pegIdx === entry.pegIdx || m.peg2Idx === entry.pegIdx));
    window.highlightMovePaths(pegSplits);
    return;
  }
  if (entry.kind === 'split-first') {
    const m = vm[entry.sampleIdx];
    if (!m || typeof window.highlightMovePaths !== 'function') return;
    const isLeg1 = (m.pegIdx === entry.pegIdx && m.steps === entry.steps);
    const synth = {
      type: 'move',
      from: isLeg1 ? m.from : m.from2,
      path: isLeg1 ? m.path : m.path2,
      dest: isLeg1 ? m.dest : m.dest2
    };
    window.highlightMovePaths([synth]);
    return;
  }
  if (entry.kind === 'split-second') {
    const m = vm[entry.moveIdx];
    if (!m || typeof window.highlightMovePaths !== 'function') return;
    const choice = _getSplitChoice();
    if (!choice) return;
    const firstIsLeg1 = (m.pegIdx === choice.pegIdx && m.steps === choice.steps);
    const synth = {
      type: 'move',
      from: firstIsLeg1 ? m.from2 : m.from,
      path: firstIsLeg1 ? m.path2 : m.path,
      dest: firstIsLeg1 ? m.dest2 : m.dest
    };
    window.highlightMovePaths([synth]);
  }
}

function _restoreDefaultHighlight() {
  if (typeof window.highlightMovePaths !== 'function') return;
  const vm = _currentValidMoves();
  const choice = _getSplitChoice();
  if (choice) {
    if (choice.steps == null) {
      const candidates = vm.filter(m => m && m.type === 'split'
        && (m.pegIdx === choice.pegIdx || m.peg2Idx === choice.pegIdx));
      window.highlightMovePaths(candidates);
    } else {
      const candidates = vm.filter(m => m && m.type === 'split'
        && ((m.pegIdx === choice.pegIdx && m.steps === choice.steps)
          || (m.peg2Idx === choice.pegIdx && m.steps2 === choice.steps)));
      window.highlightMovePaths(candidates);
    }
  } else {
    window.highlightMovePaths();
  }
}

function _commitEntry(entry) {
  if (!entry) return;
  // ── x-code commit burst ──
  try {
    if (window.FastTrackXcodeHUD && window.FastTrackXcodeHUD.emitCommitBurst) {
      const path = _resolveEntryHolePath(entry);
      if (path && path.length >= 2) window.FastTrackXcodeHUD.emitCommitBurst(path);
    }
  } catch (e) { /* tolerate */ }
  if (entry.kind === 'move' || entry.kind === 'split-second') {
    if (typeof window.executeMove === 'function') window.executeMove(entry.moveIdx);
    return;
  }
  if (entry.kind === 'split-first-peg') {
    if (typeof window.selectSplitPeg === 'function') window.selectSplitPeg(entry.pegIdx);
    return;
  }
  if (entry.kind === 'split-first') {
    if (typeof window.selectSplitPeg === 'function') window.selectSplitPeg(entry.pegIdx);
    if (typeof window.selectSplitSteps === 'function') window.selectSplitSteps(entry.steps);
    // showMoveHints (called by the selectors) re-highlights candidates for us.
  }
}

// Resolve [fromHoleId, ...via, destHoleId] for the x-code commit-burst overlay.
function _resolveEntryHolePath(entry) {
  const core = window.FastTrackCore;
  if (!core || !entry) return null;
  const players = core.state.players.get('list') || [];
  const ci = core.state.players.get('current') || 0;
  const me = players[ci];
  if (!me) return null;
  const vm = core.state.turn.get('validMoves') || [];
  if (entry.kind === 'move' || entry.kind === 'split-second') {
    const mv = vm[entry.moveIdx]; if (!mv) return null;
    const peg = me.pegs[mv.pegIdx]; if (!peg) return null;
    const path = [peg.holeId];
    if (Array.isArray(mv.path)) for (const id of mv.path) if (id && id !== peg.holeId) path.push(id);
    if (mv.dest && mv.dest !== path[path.length - 1]) path.push(mv.dest);
    return path;
  }
  if (entry.kind === 'split-first') {
    const peg = me.pegs[entry.pegIdx]; if (!peg) return null;
    const mv = vm.find(m => m.type === 'split' && m.pegIdx === entry.pegIdx && m.steps === entry.steps);
    if (!mv) return null;
    const path = [peg.holeId];
    if (Array.isArray(mv.path)) for (const id of mv.path) if (id && id !== peg.holeId) path.push(id);
    if (mv.dest && mv.dest !== path[path.length - 1]) path.push(mv.dest);
    return path;
  }
  return null;
}

function _pegIdxForPegId(pegId) {
  const players = (window.FastTrackCore && window.FastTrackCore.state)
    ? window.FastTrackCore.state.players.get('list') || [] : [];
  const ci = (window.FastTrackCore && window.FastTrackCore.state)
    ? window.FastTrackCore.state.players.get('current') || 0 : 0;
  const cur = players[ci];
  if (!cur || !Array.isArray(cur.pegs)) return null;
  const idx = cur.pegs.findIndex(p => p && p.id === pegId);
  return idx >= 0 ? idx : null;
}

function _pickTargetAtClient(clientX, clientY) {
  if (!_pickRaycaster || !renderer || !camera) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  _pickMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _pickMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _pickRaycaster.setFromCamera(_pickMouse, camera);

  const holeMeshes = [];
  for (const h of holeRegistry.values()) {
    if (h.pickMesh) holeMeshes.push(h.pickMesh);
    else if (h.mesh) holeMeshes.push(h.mesh);
  }
  const holeHits = _pickRaycaster.intersectObjects(holeMeshes, false);
  if (holeHits.length) {
    const holeId = holeHits[0].object && holeHits[0].object.userData
      ? holeHits[0].object.userData.holeId : null;
    if (holeId) return { kind: 'hole', holeId };
  }

  const pegRoots = [];
  for (const peg of pegRegistry.values()) {
    if (peg && peg.mesh) pegRoots.push(peg.mesh);
  }
  const pegHits = _pickRaycaster.intersectObjects(pegRoots, true);
  if (pegHits.length) {
    let n = pegHits[0].object;
    while (n && !n.userData?.pegId) n = n.parent;
    const pegId = n && n.userData ? n.userData.pegId : null;
    if (pegId) {
      const pegIdx = _pegIdxForPegId(pegId);
      if (pegIdx != null) return { kind: 'peg', pegId, pegIdx };
    }
  }

  return null;
}

function _entriesForTarget(target, routeIndex) {
  if (!target || !routeIndex) return [];
  if (target.kind === 'peg') {
    const splitKey = `peg:${target.pegIdx}`;
    const splitMatches = routeIndex.get(splitKey) || [];
    if (splitMatches.length) return splitMatches;
    const peg = pegRegistry.get(target.pegId);
    const holeId = peg && peg.holeId ? peg.holeId : null;
    return holeId ? (routeIndex.get(holeId) || []) : [];
  }
  if (target.kind === 'hole') {
    return routeIndex.get(target.holeId) || [];
  }
  return [];
}

// ── Hover tooltip — single shared bubble used as the hint surface on desktop ──
let _hoverTip = null;

function _ensureHoverTip() {
  if (_hoverTip) return _hoverTip;
  const el = document.createElement('div');
  el.id = 'ft-hover-tip';
  el.style.cssText = [
    'position:fixed', 'pointer-events:none', 'z-index:9999',
    'padding:6px 10px', 'border-radius:8px', 'font:600 13px/1.25 system-ui,sans-serif',
    'box-shadow:0 4px 14px rgba(0,0,0,0.35)', 'border:1px solid rgba(255,255,255,0.18)',
    'background:#101018', 'color:#f4f8ff', 'max-width:260px',
    'opacity:0', 'transition:opacity 80ms linear', 'transform:translate(12px,12px)'
  ].join(';');
  document.body.appendChild(el);
  _hoverTip = el;
  return el;
}

// YIQ contrast — picks dark or light foreground for a given hex bg.
// Threshold 140 matches the FastTrack palette extremes (Snake green edge case).
function _yiqFg(hex) {
  if (!hex) return '#f4f8ff';
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#f4f8ff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? '#0a0a14' : '#f4f8ff';
}

function _showHoverTip(text, bgHex, x, y) {
  const el = _ensureHoverTip();
  el.textContent = text;
  if (bgHex) {
    el.style.background = bgHex;
    el.style.color = _yiqFg(bgHex);
    el.style.borderColor = 'rgba(0,0,0,0.25)';
  } else {
    el.style.background = '#101018';
    el.style.color = '#f4f8ff';
    el.style.borderColor = 'rgba(255,255,255,0.18)';
  }
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.opacity = '1';
}

function _hideHoverTip() {
  if (_hoverTip) _hoverTip.style.opacity = '0';
}

// Resolve the active player's color (hex string) for entries that don't carry
// a peg color of their own (e.g. enter from holding before a peg exists).
function _activePlayerColorHex() {
  const players = (window.FastTrackCore && window.FastTrackCore.state)
    ? window.FastTrackCore.state.players.get('list') || [] : [];
  const ci = (window.FastTrackCore && window.FastTrackCore.state)
    ? window.FastTrackCore.state.players.get('current') || 0 : 0;
  const p = players[ci];
  if (p && p.color) return p.color;
  const c = RAINBOW_COLORS[ci] || 0xffffff;
  return '#' + c.toString(16).padStart(6, '0');
}

// Compact destination glyph for the current move.
//   outer/side  → ±N  (sign by card direction)
//   ft-*        → "ft +N" if peg already on FT, "→ ⚡ ft" if entering
//   safe-*      → "→ 🛡️"
//   home-*      → "→ 🏠"
//   bullseye    → "→ 🎯"
function _compactMoveText(m, pegName, cur) {
  if (!m) return pegName;
  const peg = cur && cur.pegs && cur.pegs[m.pegIdx];
  const dest = m.dest || '';
  const s = Number(m.steps) || 0;

  switch (m.type) {
    case 'enter': return `${pegName} enter board`;
    case 'enterFastTrack':
      return (peg && peg.onFasttrack) ? `${pegName} ft +${s}` : `${pegName} → ⚡ ft`;
    case 'exitFastTrack': return `${pegName} leaves ⚡`;
    case 'enterBullseye': return `${pegName} → 🎯`;
    case 'exitBullseye': return `${pegName} leaves 🎯`;
    case 'move': {
      if (dest.startsWith('safe-')) return `${pegName} → 🛡️`;
      if (dest.startsWith('home-')) return `${pegName} → 🏠`;
      if (dest === 'bullseye') return `${pegName} → 🎯`;
      if (dest.startsWith('ft-')) {
        return (peg && peg.onFasttrack) ? `${pegName} ft +${s}` : `${pegName} → ⚡ ft`;
      }
      const card = (window.FastTrackCore && window.FastTrackCore.state)
        ? window.FastTrackCore.state.deck.get('currentCard') : null;
      const rules = (card && typeof window.getCardRules === 'function')
        ? window.getCardRules(card.value) : null;
      const isBackward = rules && rules.direction === 'backward';
      const sign = isBackward ? '-' : '+';
      return `${pegName} ${sign}${s}`;
    }
    default: return pegName;
  }
}

// Build {text, color} for an entry produced by _buildRouteIndex.
function _describeEntry(entry, vm) {
  if (!entry) return null;
  const players = (window.FastTrackCore && window.FastTrackCore.state)
    ? window.FastTrackCore.state.players.get('list') || [] : [];
  const ci = (window.FastTrackCore && window.FastTrackCore.state)
    ? window.FastTrackCore.state.players.get('current') || 0 : 0;
  const cur = players[ci];
  const colorOf = () => (cur && cur.color) ? cur.color : _activePlayerColorHex();
  const nameOf = (pegIdx) => {
    const p = cur && cur.pegs && cur.pegs[pegIdx];
    return (p && p.nickname) || `Peg ${pegIdx + 1}`;
  };

  if (entry.kind === 'move') {
    const m = vm[entry.moveIdx];
    if (!m) return null;
    const cut = window.cutLabel ? window.cutLabel(m.dest) : '';
    let text = _compactMoveText(m, nameOf(m.pegIdx), cur);
    if (cut) text += ' ✂';
    return { text, color: colorOf() };
  }
  if (entry.kind === 'split-first-peg') {
    return { text: `split: choose ${nameOf(entry.pegIdx)}`, color: colorOf() };
  }
  if (entry.kind === 'split-first') {
    return { text: `split: ${nameOf(entry.pegIdx)} +${entry.steps}`, color: colorOf() };
  }
  if (entry.kind === 'split-second') {
    const m = vm[entry.moveIdx];
    if (!m) return null;
    const choice = (typeof window.getSplitChoice === 'function') ? window.getSplitChoice() : null;
    if (!choice) return { text: `then ${nameOf(m.pegIdx)} +${m.steps || 0}`, color: colorOf() };
    const firstIsLeg1 = (m.pegIdx === choice.pegIdx && m.steps === choice.steps);
    const secondPegIdx = firstIsLeg1 ? m.peg2Idx : m.pegIdx;
    const secondSteps = firstIsLeg1 ? m.steps2 : m.steps;
    const cut = window.cutLabel ? window.cutLabel(firstIsLeg1 ? m.dest2 : m.dest) : '';
    return { text: `then ${nameOf(secondPegIdx)} +${secondSteps}${cut ? ' ✂' : ''}`, color: colorOf() };
  }
  return null;
}

function setupBoardPickHandler() {
  if (!renderer || !renderer.domElement) return;
  const dom = renderer.domElement;
  const artOverlayOpen = () =>
    !!document.getElementById('art-gallery-overlay')?.classList.contains('visible');

  let lastHoverKey = '';

  const clearHover = () => {
    if (lastHoverKey !== '') {
      lastHoverKey = '';
      // Don't disturb a staged preview while a confirmation is pending.
      if (!_pendingEntry) _restoreDefaultHighlight();
    }
    dom.style.cursor = '';
    _hideHoverTip();
  };

  dom.addEventListener('pointermove', (e) => {
    if (artOverlayOpen()) { _hideHoverTip(); return; }
    // Skip while user is rotating/dragging the camera (any mouse button held).
    if (e.buttons !== 0) { _hideHoverTip(); return; }
    const idx = _refreshRouteIndex();
    if (idx.size === 0) { clearHover(); return; }
    const target = _pickTargetAtClient(e.clientX, e.clientY);
    const matches = _entriesForTarget(target, idx);
    const vm = _currentValidMoves();
    if (matches.length === 1) {
      dom.style.cursor = 'pointer';
      const key = _entryKey(matches[0]);
      // Keep the staged preview in place when a confirmation is pending; just
      // show the hover tip so the player can still inspect other routes.
      if (!_pendingEntry && lastHoverKey !== key) {
        lastHoverKey = key;
        _previewEntry(matches[0], vm);
      }
      const desc = _describeEntry(matches[0], vm);
      if (desc) {
        const tip = _pendingEntry
          ? `${desc.text} — click to stage (Confirm to commit)`
          : `${desc.text} — click to stage`;
        _showHoverTip(tip, desc.color, e.clientX, e.clientY);
      } else _hideHoverTip();
    } else if (matches.length > 1) {
      dom.style.cursor = 'pointer';
      // Cycle hint only — actual cycling happens on click.
      const desc = _describeEntry(matches[0], vm);
      const head = desc ? `${desc.text}` : `${matches.length} routes here`;
      _showHoverTip(`${head} — click to cycle (${matches.length} options)`, desc ? desc.color : null, e.clientX, e.clientY);
      if (!_pendingEntry && lastHoverKey !== '') {
        lastHoverKey = '';
        _restoreDefaultHighlight();
      }
    } else {
      clearHover();
    }
  });

  dom.addEventListener('pointerleave', () => { clearHover(); });

  dom.addEventListener('click', (e) => {
    if (artOverlayOpen()) return;
    const idx = _refreshRouteIndex();
    if (idx.size === 0) return;
    const target = _pickTargetAtClient(e.clientX, e.clientY);
    const matches = _entriesForTarget(target, idx);
    if (matches.length === 0) return;
    _hideHoverTip();
    // Board click is a shortcut — sync the cycle to this target.
    const tKey = target ? (target.kind === 'peg' ? `peg:${target.pegIdx}` : `hole:${target.holeId}`) : '';
    let nextIdx = 0;
    if (tKey === _pendingTargetKey) {
      nextIdx = (_pendingCycleIdx + 1) % matches.length;
    }
    _pendingTargetKey = tKey;
    _pendingCycleIdx = nextIdx;
    const entry = matches[nextIdx];
    // Sync the master cycle so ◀/▶ continue from here.
    const cycleIdx = _moveCycle.findIndex(e2 => _entryKey(e2) === _entryKey(entry));
    if (cycleIdx >= 0) _moveCycleIdx = cycleIdx;
    // user_directive_2026-05-19 — "for simple things the player should be
    // able to push destination holes". Unambiguous click (only one route
    // through this target) commits immediately. Multi-route clicks stage;
    // re-clicking the same target after it's already staged commits.
    const isReclick = _pendingEntry && _entryKey(_pendingEntry) === _entryKey(entry);
    _stagePendingEntry(entry);
    if (matches.length === 1 || isReclick) {
      _commitPendingEntry();
    }
  });

  // Footer toolbar buttons — primary input on touch and desktop.
  const okBtn = document.getElementById('ft-confirm-ok');
  const cancelBtn = document.getElementById('ft-confirm-cancel');
  const prevBtn = document.getElementById('ft-confirm-prev');
  const nextBtn = document.getElementById('ft-confirm-next');
  if (okBtn && !okBtn._wired) {
    okBtn._wired = true;
    okBtn.addEventListener('click', () => _commitPendingEntry());
  }
  if (cancelBtn && !cancelBtn._wired) {
    cancelBtn._wired = true;
    cancelBtn.addEventListener('click', () => _clearPendingEntry(true));
  }
  if (prevBtn && !prevBtn._wired) {
    prevBtn._wired = true;
    prevBtn.addEventListener('click', () => _stepMoveCycle(-1));
  }
  if (nextBtn && !nextBtn._wired) {
    nextBtn._wired = true;
    nextBtn.addEventListener('click', () => _stepMoveCycle(+1));
  }
  // Initialize the bar state for whatever moves are currently available.
  _refreshRouteIndex();
  _refreshConfirmBar();
}

// ── Confirmation staging ───────────────────────────────────────
function _stagePendingEntry(entry) {
  if (!entry) {
    _pendingEntry = null;
    if (window.FastTrackXcodeHUD) window.FastTrackXcodeHUD.setPendingEntry(null);
    _restoreDefaultHighlight();
    _refreshConfirmBar();
    return;
  }
  _pendingEntry = entry;
  if (window.FastTrackXcodeHUD) window.FastTrackXcodeHUD.setPendingEntry(entry);
  const vm = _currentValidMoves();
  // _previewEntry highlights the chosen route — only its destination peg/hole pulses.
  _previewEntry(entry, vm);
  _refreshConfirmBar();
}

function _stepMoveCycle(delta) {
  if (!_moveCycle.length) return;
  const n = _moveCycle.length;
  let i = _moveCycleIdx;
  if (i < 0) i = (delta > 0) ? 0 : n - 1;
  else i = (i + delta + n) % n;
  _moveCycleIdx = i;
  _pendingTargetKey = '';
  _pendingCycleIdx = -1;
  _stagePendingEntry(_moveCycle[i]);
}

// user_directive_2026-05-10: Big top-of-viewport instruction banner. Tells the
// player exactly what to tap next, in plain language, at every stage. This is
// the primary "the board is interactive" affordance for new players.
function _refreshInstructionBanner() {
  const banner = document.getElementById('ft-instruction-banner');
  if (!banner) return;
  const textEl = banner.querySelector('.ft-ib-text');
  const iconEl = banner.querySelector('.ft-ib-icon');

  let visible = false;
  let text = '';
  let icon = '👉';
  let accent = '#00c8ff';

  try {
    const core = window.FastTrackCore;
    const isHumanTurn = (() => {
      if (!core || !core.state) return false;
      const players = core.state.players.get('list') || [];
      const ci = core.state.players.get('current') || 0;
      const p = players[ci];
      return !!(p && !p.isBot);
    })();

    if (isHumanTurn && _moveCycle && _moveCycle.length > 0) {
      visible = true;
      const players = core.state.players.get('list') || [];
      const ci = core.state.players.get('current') || 0;
      const p = players[ci];
      if (p && p.color) accent = p.color;

      const kind = _moveCycle[0].kind;
      const total = _moveCycle.length;

      // user_directive_2026-05-12: once a move has been staged (Confirm
      // button is live), swap the "tap a glowing…" prompt for the
      // confirm-move description so the player knows exactly what they
      // are about to commit.
      if (_pendingEntry) {
        const desc = _describeEntry(_pendingEntry, _currentValidMoves());
        if (desc && desc.text) {
          text = `Confirm move: ${desc.text}`;
          icon = '✓';
          if (desc.color) accent = desc.color;
        } else {
          text = 'Confirm move';
          icon = '✓';
        }
      } else if (kind === 'split-first-peg') {
        text = total > 1 ? 'Tap a glowing peg to split your 7' : 'Splitting your 7…';
      } else if (kind === 'split-first') {
        text = total > 1 ? 'Tap a glowing hole — first half of your 7' : 'Placing first half…';
      } else if (kind === 'split-second') {
        text = total > 1 ? 'Tap a glowing hole — second half of your 7' : 'Placing second half…';
      } else {
        text = total > 1 ? 'Tap a glowing peg or hole to choose your move' : 'Playing your move…';
      }
    }
  } catch (err) { /* never let UI hint code break the game loop */ }

  if (visible) {
    if (textEl) textEl.textContent = text;
    if (iconEl) iconEl.textContent = icon;
    banner.style.setProperty('--ft-ib-accent', accent);
    banner.hidden = false;
    requestAnimationFrame(() => banner.classList.add('visible'));
  } else {
    banner.classList.remove('visible');
    setTimeout(() => {
      if (!banner.classList.contains('visible')) banner.hidden = true;
    }, 250);
  }
}

function _refreshConfirmBar() {
  const bar = document.getElementById('ft-confirm-bar');
  if (!bar) return;
  const label = document.getElementById('ft-confirm-label');
  const okBtn = document.getElementById('ft-confirm-ok');
  const cancelBtn = document.getElementById('ft-confirm-cancel');
  const prevBtn = document.getElementById('ft-confirm-prev');
  const nextBtn = document.getElementById('ft-confirm-next');
  const total = _moveCycle.length;
  // Show the bar whenever the move cycle has any entries; hide otherwise.
  // (Bots clear validMoves before they animate, so this never lights up
  // during a bot turn.)
  const shouldShow = total > 0;
  if (shouldShow) {
    bar.removeAttribute('hidden');
    bar.hidden = false;
    bar.style.display = 'flex';
  } else {
    bar.setAttribute('hidden', '');
    bar.hidden = true;
    bar.style.display = 'none';
  }
  // user_directive_2026-05-10: keep the big instruction banner in sync with
  // the confirm bar — it tells the player what to tap next at every stage.
  _refreshInstructionBanner();
  const vm = _currentValidMoves();
  const hasPick = !!_pendingEntry;
  const idxLabel = hasPick && _moveCycleIdx >= 0 ? `${_moveCycleIdx + 1}/${total}` : `–/${total}`;

  // Stage prefix for split flow so the player knows what they're choosing.
  // The cycle's first entry tells us the current stage (all entries in a
  // refreshed cycle share the same kind family for splits).
  const choice = _getSplitChoice();
  let stagePrefix = '';
  if (_moveCycle.length) {
    const k = _moveCycle[0].kind;
    if (k === 'split-first-peg') stagePrefix = 'Split 7 — pick peg: ';
    else if (k === 'split-first') stagePrefix = `Split 7 — pick steps for peg ${(choice && choice.pegIdx != null) ? (choice.pegIdx + 1) : '?'}: `;
    else if (k === 'split-second') stagePrefix = 'Split 7 — pick destination: ';
  }

  let text = `${stagePrefix}Choose move (${idxLabel})`;
  let color = null;
  if (hasPick) {
    const desc = _describeEntry(_pendingEntry, vm);
    if (desc) {
      text = `${stagePrefix}${idxLabel} · ${desc.text}`;
      color = desc.color;
    }
  } else {
    text = `${stagePrefix}Press ▶ to preview moves (${total} legal)`;
  }
  if (label) {
    label.textContent = text;
    label.style.color = color || '#f6f9ff';
  }
  if (okBtn) okBtn.disabled = !hasPick;
  // Cancel is enabled whenever we have a pick OR a split stage to back out of.
  if (cancelBtn) {
    const inSplit = !!(choice && (choice.pegIdx != null || choice.steps != null));
    cancelBtn.disabled = !hasPick && !inSplit;
    cancelBtn.title = inSplit ? 'Back to previous split stage' : 'Clear selection';
  }
  if (prevBtn) prevBtn.disabled = total < 2;
  if (nextBtn) nextBtn.disabled = total < 2;
}

function _clearPendingEntry(restoreHighlights) {
  _pendingEntry = null;
  _pendingTargetKey = '';
  _pendingCycleIdx = -1;
  _moveCycleIdx = -1;
  // If we're mid-split, Cancel walks the split state machine back one stage
  // (steps → peg → no choice) instead of just clearing the preview.
  const choice = _getSplitChoice();
  if (choice && (choice.pegIdx != null || choice.steps != null)) {
    if (choice.steps != null && typeof window.selectSplitSteps === 'function') {
      // Drop step choice — keep peg.
      window.selectSplitSteps(NaN); // any non-finite resets _splitStepChoice to null
    } else if (typeof window.cancelSplitChoice === 'function') {
      window.cancelSplitChoice();
    }
    // showMoveHints() inside the selectors triggers _refreshFastTrackToolbar.
    return;
  }
  if (restoreHighlights) _restoreDefaultHighlight();
  _refreshConfirmBar();
}

function _commitPendingEntry() {
  const entry = _pendingEntry;
  if (!entry) return;
  _pendingEntry = null;
  _moveCycleIdx = -1;
  _pendingTargetKey = '';
  _pendingCycleIdx = -1;
  _commitEntry(entry);
  // _refreshRouteIndex() on the next tick will rebuild the cycle for the new state.
}
window._clearPendingEntry = () => _clearPendingEntry(true);
window._refreshFastTrackToolbar = () => { _refreshRouteIndex(); _refreshConfirmBar(); };

// ════════════════════════════════════════════════════════════════
// 🜂 MANIFOLD SUBSTRATE INTEGRATION
// Expose scene for SchwartzDiamondRenderer and listen for glow events.
// ════════════════════════════════════════════════════════════════

// manifold:glow — GraphicsLens dispatches this after z=x·y computation.
// intensity ∈ [0,1] drives peg glowLight and material emissive.
window.addEventListener('manifold:glow', (e) => {
  const { pegId, intensity } = e.detail || {};
  if (pegId === undefined || !pegRegistry) return;
  const entry = [...pegRegistry.values()].find(p => p.pegId === pegId);
  if (!entry) return;
  const MAX_GLOW = 3.5;
  if (entry.glowLight) entry.glowLight.intensity = intensity * MAX_GLOW;
  if (entry.bodyMesh?.material) {
    entry.bodyMesh.material.emissiveIntensity = 0.05 + intensity * 0.6;
  }
});

// ════════════════════════════════════════════════════════════════
// EXPOSE GLOBALS
// ════════════════════════════════════════════════════════════════
window.init3D = init3D;
window.createPeg = createPeg;
window.removePeg = removePeg;
window.movePeg = movePeg;
window.renderBoard3D = renderBoard3D;
window.holeRegistry = holeRegistry;
window.pegRegistry = pegRegistry;
window.setCameraView = setCameraView;
window.CameraDirector = CameraDirector;
window.highlightMovePaths = highlightMovePaths;
window.highlightSinglePath = highlightSinglePath;
window.clearHighlights = clearHighlights;
window.showPegNames = showPegNames;
window.hidePegNames = hidePegNames;
window.updatePlayerMarkers = updatePlayerMarkers;
window.blinkPlayerMarker = blinkPlayerMarker;

// ── Minimal bridge for the peg control bar (3d-ui.js) ──────────
// Exposes accessors over the move-cycle staging state so the
// peg-button footer can drive the same engine path the (now hidden)
// confirm-bar / instruction-banner used. Additive only — no engine
// behavior change.
window.FastTrack3D = {
  getMoveCycle: () => _moveCycle.slice(),
  getPendingEntry: () => _pendingEntry,
  stagePendingEntry: (entry) => _stagePendingEntry(entry),
  commitPendingEntry: () => _commitPendingEntry(),
  clearPendingEntry: (restore) => _clearPendingEntry(restore !== false),
  getSplitChoice: _getSplitChoice,
};

async function startInit3D() {
  try {
    await init3D();
  } catch (err) {
    console.error('❌ FastTrack 3D init failed:', err);
    window.dispatchEvent(new CustomEvent('ft3d:error', {
      detail: {
        message: err && err.message ? err.message : String(err)
      }
    }));
  }
}

// Auto-initialize when DOM ready
document.addEventListener('DOMContentLoaded', startInit3D);

// Shown instead of the board when someone reaches 3d.html without a game.
// Plain DOM on purpose: this has to work even if three.js or the board never
// initialised, which is exactly the situation it exists for.
function showNoGamePanel() {
  try {
    if (document.getElementById('ft-no-game')) return;
    const wrap = document.createElement('div');
    wrap.id = 'ft-no-game';
    wrap.setAttribute('role', 'alert');
    wrap.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:100000',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:#0d0f14', 'color:#e9edf2',
      'font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif',
      'padding:24px', 'text-align:center',
    ].join(';');
    wrap.innerHTML =
      '<div style="max-width:460px">'
      + '<h1 style="margin:0 0 10px;font-size:1.4rem;font-weight:650">No game to join</h1>'
      + '<p style="margin:0 0 20px;color:#a8b3c1">'
      + 'A FastTrack table is created in the lobby: pick your players and bots, '
      + 'then the host starts the game. Opening the board directly does not make one.'
      + '</p>'
      + '<a href="/lobby/" style="display:inline-block;background:#0f6d94;color:#fff;'
      + 'text-decoration:none;padding:.6rem 1.2rem;border-radius:8px;font-weight:600">'
      + 'Go to the lobby</a>'
      + '</div>';
    document.body.appendChild(wrap);
  } catch (err) {
    console.error('[ft] could not show the no-game panel', err);
  }
}

// ═
// TURN MARQUEE — the seating order, always visible in the footer strip
// ═
// Lists every player in ARRAY ORDER with the one holding isTurn lit up, so the
// current player and who is next are readable at a glance.
//
// Why it exists: a bot turn can resolve in milliseconds, and bots deliberately
// never get the turn banner, so a fast bot turn left NOTHING on screen and was
// indistinguishable from that seat being skipped.
//
// It reads player.isTurn, the same flag the game rotates, so what is on screen
// is the real turn state rather than a second copy that could drift.
function renderTurnMarquee() {
  const track = document.getElementById("ft-turn-marquee-track");
  if (!track || !window.FastTrackCore) return;
  const players = window.FastTrackCore.state.players.get("list") || [];
  if (!players.length) { track.innerHTML = ""; return; }

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const seat = (p, i) => {
    const active = !!p.isTurn;
    const tag = active ? "now playing" : (p.isBot ? "bot" : "you");
    return '<span class="ft-mq-seat' + (active ? " is-turn" : "") + '"'
      + ' style="color:' + esc(active ? "#fff" : (p.color || "#9fb0c4")) + '">'
      + '<span class="ft-mq-dot" style="background:' + esc(p.color || "#9fb0c4") + '"></span>'
      + esc(p.name || ("Seat " + (i + 1)))
      + ' <span class="ft-mq-tag">' + esc(tag) + "</span></span>";
  };

  // Rendered twice so the loop reads continuously rather than snapping back to
  // an empty strip at the end of each pass.
  const once = players.map(seat).join('<span class="ft-mq-sep">\u2022</span>');
  const sep = '<span class="ft-mq-sep">\u2022</span>';
  track.innerHTML = once + sep + once + sep;
}

// Keep it in step with the turn. Polling rather than an event because the turn
// changes from several places (a move resolving, a redraw, a bot forfeit, a
// snapshot from a peer) and a missed subscription would silently show a stale
// seat, which is the exact class of bug this is meant to make visible.
let _marqueeLastKey = "";
function startTurnMarquee() {
  const tick = () => {
    try {
      const C = window.FastTrackCore;
      if (!C) return;
      const players = C.state.players.get("list") || [];
      const key = players.length + "|" + players.map((p) => (p.isTurn ? "1" : "0")).join("")
        + "|" + players.map((p) => p.name).join(",");
      if (key !== _marqueeLastKey) { _marqueeLastKey = key; renderTurnMarquee(); }
    } catch (_) { /* the marquee must never break the game */ }
  };
  tick();
  setInterval(tick, 250);
}
if (typeof window !== "undefined") {
  window.renderTurnMarquee = renderTurnMarquee;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startTurnMarquee);
  } else {
    startTurnMarquee();
  }
}
