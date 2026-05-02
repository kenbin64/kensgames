'use strict';
// Launch-button fail-safe: inline HTML calls openMultiplayerPanel(). If this file
// partially fails later, keep a global stub so users never see ReferenceError.
window.openMultiplayerPanel = window.openMultiplayerPanel || function () {
  console.warn('[4D] openMultiplayerPanel fallback invoked before full init');
  const overlay = document.getElementById('mp-panel-overlay');
  const host = document.getElementById('mp-panel-host');
  let inviteCode = null;
  try {
    const u = new URL(location.href);
    inviteCode = (u.searchParams.get('code') || '').trim().toUpperCase() || null;
  } catch { /* ignore */ }
  if (overlay && host && typeof KGMultiplayerPanel !== 'undefined') {
    overlay.style.display = 'flex';
    KGGameSetup.mount(host, {
      gameId: '4dtictactoe',
      gameName: '4D Connect',
      supportsSameScreen: true,
      minPlayers: 2,
      maxPlayers: 4,
      inviteCode,
      onLaunch: () => {
        overlay.style.display = 'none';
        if (typeof startGame === 'function') startGame();
      },
    });
    return;
  }
  if (typeof startGame === 'function') startGame();
};
// 4D Connect -- thin runtime: input -> substrate -> lens -> render.
// Rules live in manifold.js (BoardManifold 3D + Turns 4D). Config lives in manifold.game.json.
const TRNG = { _b: new Uint32Array(16), _i: 16, _r() { crypto.getRandomValues(this._b); this._i = 0; }, f() { if (this._i >= 16) this._r(); return this._b[this._i++] / 0xFFFFFFFF; }, i(a, b) { return Math.floor(this.f() * (b - a + 1)) + a; }, pick(a) { return a[this.i(0, a.length - 1)]; }, shuffle(a) { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = this.i(0, i);[r[i], r[j]] = [r[j], r[i]]; } return r; } };
const BM = window.BoardManifold, TS = window.Turns;
let G = BM.GRID;
const P1 = BM.P1, P2 = BM.P2, P3 = BM.P3, P4 = BM.P4;
// Player count <-> recommended grid edge. Solved-game density (cells/player ~16-55) is the
// playable sweet spot; below 16 a 4-in-a-row becomes near-impossible (4 stones must be
// collinear out of 16 placements, much of which gravity dumps onto the bottom layer).
// Defaults; overwritten from manifold.game.json:params at bootstrap (see manifest fetch below).
let GRID_FOR_PLAYERS = { 1: 3, 2: 4, 3: 5, 4: 5 };
function gridForPlayers(n) { return GRID_FOR_PLAYERS[n] || 4; }
const WIN_TARGET = 4;
let numPlayers = 2;
const dirsOf = sc => (sc && sc.modes === 'diag') ? BM.DIAG_DIRS : BM.DIRS;
let SCENARIOS = [], PLAYERS = [];
const PLAYER_META = Array.from({ length: 4 }, (_, i) => ({
  name: `PLAYER ${i + 1}`,
  avatar: String(i + 1),
}));
let selectedScenario = null, currentScenario = null;
let vsMode = 'pvp', aiDiff = 'easy';
let currentPlayer = P1, isGameOver = false, isDropping = false;
let turnTimer = null, timerLeft = 0;
// In-game move relay over the live KGMultiplayer socket carried in by the lobby panel.
// The panel hands us session.client (an authed KGMultiplayer instance) on launch; from then on
// the local actor commits a move locally (full physics), broadcasts the resolved (gx,gy,gz,p)
// via game_action, and remote peers apply the same coordinates by calling finishPlacement
// directly (skipping physics) under the _applying guard so the broadcast does not echo.
const KGSync = {
  online: false, isHost: false, mySlot: 0, client: null, _applying: false, _onAction: null,
  init(session) {
    this.reset();
    if (!session || !session.client) return;
    const players = session.players || [];
    const me = players.find(p => String(p.user_id) === String(session.my_user_id) && !p.is_ai) || null;
    const idx = players.findIndex(p => String(p.user_id) === String(session.my_user_id) && !p.is_ai);
    this.client = session.client; this.online = true;
    this.isHost = !!session.is_host;
    // Slot is the authoritative turn index from the lobby server. Falling back to array index
    // can make every client think it's player 1 when player arrays are personalized per client.
    this.mySlot = (me && Number.isFinite(+me.slot) && (+me.slot) > 0)
      ? (+me.slot)
      : ((idx >= 0) ? (idx + 1) : 0);
    this._onAction = (data) => {
      if (!data || data.action !== 'move' || !data.payload) return;
      const { gx, gy, gz, p } = data.payload;
      if (typeof gx !== 'number' || typeof gy !== 'number' || typeof gz !== 'number') return;
      KGSync._applyRemote(gx, gy, gz, p);
    };
    this.client.on('game_action', this._onAction);
  },
  reset() {
    if (this.client && this._onAction) { try { this.client.off('game_action', this._onAction); } catch { /* ignore */ } }
    this.online = false; this.isHost = false; this.mySlot = 0;
    this.client = null; this._applying = false; this._onAction = null;
  },
  canActLocally() {
    if (!this.online) return true;
    if (vsMode === 'ai' && currentPlayer !== P1) return this.isHost; // AI runs on host only
    return this.mySlot !== 0 && this.mySlot === currentPlayer;
  },
  broadcast(gx, gy, gz, p) {
    if (!this.online || this._applying || !this.client) return;
    try { this.client.sendAction('move', { gx, gy, gz, p }); } catch (e) { console.warn('[KGSync] send fail', e); }
  },
  _applyRemote(gx, gy, gz, p) {
    if (isGameOver || BM.getCell(gx, gy, gz)) return;
    if (ghostBall) { scene.remove(ghostBall.mesh); scene.remove(ghostBall.halo); ghostBall = null; }
    if (physBall) { scene.remove(physBall.mesh); scene.remove(physBall.halo); physBall = null; }
    snapAnim = null; isDropping = true; clearTurnTimer();
    this._applying = true;
    try { finishPlacement(p, [gx, gy, gz]); }
    finally { this._applying = false; }
  },
};
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.physicallyCorrectLights = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000008);
scene.fog = new THREE.FogExp2(0x00000C, 0.007);
const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 900);
function makeEnvTex() { const W = 256, H = 128, d = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++)for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; d[i] = 2; d[i + 1] = 1; d[i + 2] = 10; d[i + 3] = 255; const n = Math.sin(x * 7.31 + y * 13.7) * Math.cos(x * 11.1 - y * 5.93); if (n > 0.975) { d[i] = 220; d[i + 1] = 235; d[i + 2] = 255; } else if (n > 0.96) { d[i] = 0; d[i + 1] = 180; d[i + 2] = 230; } else if (n > 0.955) { d[i] = 255; d[i + 1] = 220; d[i + 2] = 80; } const lat = Math.abs((y / H) - 0.5) * 2; d[i + 2] = Math.min(255, d[i + 2] + Math.max(0, 1 - lat * 3.5) * 30); } const tex = new THREE.DataTexture(d, W, H, THREE.RGBAFormat); tex.mapping = THREE.EquirectangularReflectionMapping; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true; return tex; }
// Pre-process the equirect starfield through PMREMGenerator so it can be used as both
// scene.environment (IBL for every MeshStandardMaterial) and per-material envMap (mirror
// reflections on the cube shell and the ball). PMREM is mandatory in r128 -- a raw
// DataTexture used directly throws "object must have callable @@iterator".
const _pmrem = new THREE.PMREMGenerator(renderer); _pmrem.compileEquirectangularShader();
const _envSrc = makeEnvTex();
const envMap = _pmrem.fromEquirectangular(_envSrc).texture;
_envSrc.dispose(); _pmrem.dispose();
scene.environment = envMap;
scene.add(new THREE.AmbientLight(0x080816, 2.2));
const keyLight = new THREE.DirectionalLight(0x8899ff, 1.4); keyLight.position.set(10, 20, 14); scene.add(keyLight);
const fillPurp = new THREE.PointLight(0xaa00ff, 2.8, 60); fillPurp.position.set(-10, 8, -12); scene.add(fillPurp);
const fillCyan = new THREE.PointLight(0x00ccff, 2.2, 50); fillCyan.position.set(10, 4, 10); scene.add(fillCyan);
const rimLight = new THREE.PointLight(0x4400aa, 1.6, 40); rimLight.position.set(0, -8, -10); scene.add(rimLight);
const boardGlow = new THREE.PointLight(0x6622ff, 0, 20); boardGlow.position.set(0, 3, 0); scene.add(boardGlow);
// Per-face tinted lights -- fixed in world space at the 6 cardinal directions so that whichever
// face of the rotating cube currently faces a direction catches that hue. As the player rotates,
// the gyroid's inflection planes refract these tints into a constantly-shifting palette.
const FACE_LIGHTS = [
  { dir: [14, 0, 0], color: 0xff7733, int: 1.6 }, // +X warm orange
  { dir: [-14, 0, 0], color: 0xff2288, int: 1.6 }, // -X deep magenta
  { dir: [0, 14, 0], color: 0xffeecc, int: 1.4 }, // +Y warm white (sky)
  { dir: [0, -14, 0], color: 0x2244ff, int: 1.6 }, // -Y deep blue (under-glow)
  { dir: [0, 0, 14], color: 0x22ddff, int: 1.6 }, // +Z cyan
  { dir: [0, 0, -14], color: 0x33ee88, int: 1.6 }  // -Z forest green
];
const faceLights = FACE_LIGHTS.map(f => { const L = new THREE.PointLight(f.color, f.int, 38); L.position.set(f.dir[0], f.dir[1], f.dir[2]); scene.add(L); return L; });
// boardGroup: holds the gyroid GLB, the lattice nodes, and all placed balls. The player rotates
// THIS group (not the camera) so the gyroid presents a different face up. Gravity stays world-down,
// containment is enforced in cube-LOCAL space so the ball never escapes regardless of orientation.
const boardGroup = new THREE.Group(); scene.add(boardGroup);
const STAR_VS = `uniform float uTime;attribute float aSize;attribute float aSpeed;attribute float aPhase;attribute vec3 aColor;varying vec3 vColor;varying float vAlpha;void main(){float t=sin(uTime*aSpeed+aPhase)*0.5+0.5;gl_PointSize=aSize*(0.65+0.35*t);vColor=aColor;vAlpha=0.45+0.55*t;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const STAR_FS = `varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-vec2(0.5));if(d>0.5)discard;float a=pow(1.0-d*2.0,2.2)*vAlpha;gl_FragColor=vec4(vColor,a);}`;
function makeStarLayer(count, spread, sizeRange, pFactor) { const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), sz = new Float32Array(count), spd = new Float32Array(count), ph = new Float32Array(count); const SC = [[1, 1, 1], [0.7, 1, 1], [1, 0.95, 0.6], [0.85, 0.92, 1]]; for (let i = 0; i < count; i++) { pos[i * 3] = (TRNG.f() - .5) * spread; pos[i * 3 + 1] = (TRNG.f() - .5) * spread * 0.6; pos[i * 3 + 2] = (TRNG.f() * -spread * 0.9) - 30; const c = TRNG.pick(SC); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; sz[i] = sizeRange[0] + TRNG.f() * (sizeRange[1] - sizeRange[0]); spd[i] = 0.4 + TRNG.f() * 2.5; ph[i] = TRNG.f() * Math.PI * 2; } const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); geo.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1)); geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false }); const pts = new THREE.Points(geo, mat); pts.userData.parallax = pFactor; scene.add(pts); return pts; }
const starLayers = [makeStarLayer(1200, 700, [0.9, 2.2], 0.8), makeStarLayer(600, 400, [1.5, 3.0], 2.5), makeStarLayer(200, 200, [2.5, 4.5], 6.0)];
function makeSaturn() { const g = new THREE.Group(); const bGeo = new THREE.SphereGeometry(5.5, 48, 32); const bCols = new Float32Array(bGeo.attributes.position.count * 3); for (let i = 0; i < bCols.length / 3; i++) { const y = bGeo.attributes.position.getY(i); const band = Math.sin(y * 1.8) * 0.5 + 0.5; bCols[i * 3] = 0.78 + band * .12; bCols[i * 3 + 1] = 0.62 + band * .10; bCols[i * 3 + 2] = 0.32 + band * .08; } bGeo.setAttribute('color', new THREE.BufferAttribute(bCols, 3)); g.add(new THREE.Mesh(bGeo, new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 14 })));[[8, 11, 0.72], [11.5, 14, 0.55], [14.5, 17, 0.38]].forEach(([inn, out, op]) => { const ring = new THREE.Mesh(new THREE.RingGeometry(inn, out, 80), new THREE.MeshBasicMaterial({ color: 0xc8a878, side: THREE.DoubleSide, transparent: true, opacity: op, depthWrite: false })); ring.rotation.x = Math.PI / 2.6; g.add(ring); }); g.position.set(65, 32, -95); g.rotation.z = -0.08; g.scale.setScalar(1.8); scene.add(g); return g; }
const saturn = makeSaturn();
// Procedural gas giant -- replaces jupiter.glb (3.5 MB). Banded vertex colors, same style as makeSaturn.
function makeJupiter() { const g = new THREE.SphereGeometry(7, 48, 32); const cols = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < g.attributes.position.count; i++) { const y = g.attributes.position.getY(i); const band = Math.sin(y * 2.6) * 0.5 + 0.5; const storm = Math.sin(y * 1.1 + Math.cos(y * 5.2) * 1.8) * 0.5 + 0.5; cols[i * 3] = 0.82 + storm * .12 - band * .08; cols[i * 3 + 1] = 0.58 + band * .18; cols[i * 3 + 2] = 0.30 + storm * .10; } g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 10 })); m.position.set(-75, -18, -80); scene.add(m); return m; }
const jupiter = makeJupiter();
// Saddle lattice: GxGxG chambers tiling the play cube. Each chamber holds a single
// z = x*y saddle patch in cell-local coords. Adjacent chambers are rotated 90deg
// (about X for +X steps, about Y for +Y steps, 0 along Z) so the saddle edges meet
// continuously across cell faces -- this is the "Blender array tool" composition rule.
// The membrane surface is f_cell(p_local) = z' - x' * y', with grad (-y', -x', 1).
// |grad| >= 1 everywhere => no critical-point collision singularities (the failure
// mode of the previous Schwartz Diamond field).
// Grid-dependent geometry constants. Recomputed by rebuildWorld(newG) when player count
// changes the grid size. CELL is the chamber edge in world units; the cube is GxGxG chambers.
let GY_HALF = (G - 1) * 0.5 * 2.8 + 0.18;               // play cube half-extent (matches PLAY_HX, BALL_R=0.18)
let SADDLE_CELL = (2 * GY_HALF) / G;                    // saddle chamber edge length
let SADDLE_HALF = SADDLE_CELL * 0.5;                    // saddle chamber half-width
const _cellQ = new THREE.Quaternion(), _cellQInv = new THREE.Quaternion();
const _cellLocal = new THREE.Vector3();
const _qX = new THREE.Quaternion(), _qY = new THREE.Quaternion();
const _xAxis = new THREE.Vector3(1, 0, 0), _yAxis = new THREE.Vector3(0, 1, 0);
function saddleCellCenter(cx, cy, cz, out) {
  return out.set((cx + 0.5 - G * 0.5) * SADDLE_CELL,
    (cy + 0.5 - G * 0.5) * SADDLE_CELL,
    (cz + 0.5 - G * 0.5) * SADDLE_CELL);
}
function saddleCellQuaternion(_cx, _cy, _cz, out) {
  // Winki primitive tiles cleanly with no per-cell rotation -- its built-in folding
  // handles continuity between adjacent chambers. Identity quaternion for every cell.
  return out.set(0, 0, 0, 1);
}
// Saddle field in cell-local coords: f = z - (x*y)/SADDLE_HALF, scaled so |z|_max == SADDLE_HALF
// (the chamber half-width). The "z = xy" primitive is preserved in normalised units (u=x/h, v=y/h).
// |grad f| = sqrt(1 + (x/h)^2 + (y/h)^2) >= 1 everywhere -- collision is well-conditioned.
function saddleSignedDistance(lx, ly, lz) {
  const h = SADDLE_HALF;
  const f = lz - (lx * ly) / h;
  const gMag = Math.sqrt(1 + (lx * lx + ly * ly) / (h * h));
  return f / gMag;
}
function saddleGrad(lx, ly, _lz, out) {
  const h = SADDLE_HALF;
  return out.set(-ly / h, -lx / h, 1);
}
// Visual lattice: load winki.glb (a single z=xy chamber primitive baked in Blender) and
// instance it 4x4x4 with NO rotation. The primitive's built-in geometry handles continuity
// at chamber boundaries, so each cell is just translated to its chamber centre.
// Cached source winki geometry: the GLB only needs to be loaded once, even if the grid is
// resized between games (the InstancedMesh is rebuilt with a fresh count from this source).
let _winkiSrc = null;
function _winkiInstancedMesh(srcMesh) {
  const saddleInstanceCount = G * G * G;
  // Bake the source node's transform into the geometry, then recentre & uniform-scale so
  // the primitive bbox spans exactly one chamber (SADDLE_CELL across each axis).
  const geo = srcMesh.geometry.clone();
  geo.applyMatrix4(srcMesh.matrixWorld);
  geo.computeBoundingBox();
  const bb = geo.boundingBox, size = new THREE.Vector3(); bb.getSize(size);
  const center = new THREE.Vector3(); bb.getCenter(center);
  const recenter = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
  geo.applyMatrix4(recenter);
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = SADDLE_CELL / maxDim;
  geo.applyMatrix4(new THREE.Matrix4().makeScale(scale, scale, scale));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x88bbff, emissive: 0x335577, emissiveIntensity: 0.55,
    metalness: 0.35, roughness: 0.18,
    envMap, envMapIntensity: 1.2,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 0.36,
    depthWrite: false
  });
  const inst = new THREE.InstancedMesh(geo, mat, saddleInstanceCount);
  inst.renderOrder = 1;
  const _m = new THREE.Matrix4(), _t = new THREE.Vector3();
  const _q = new THREE.Quaternion(0, 0, 0, 1), _s = new THREE.Vector3(1, 1, 1);
  let i = 0;
  for (let cz = 0; cz < G; cz++) for (let cy = 0; cy < G; cy++) for (let cx = 0; cx < G; cx++) {
    saddleCellCenter(cx, cy, cz, _t);
    _m.compose(_t, _q, _s);
    inst.setMatrixAt(i++, _m);
  }
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}
function makeManifoldLattice() {
  const group = new THREE.Group();
  // Outer cage -- bright cube silhouette so the saddle lattice bbox reads as a perfect cube.
  const cageE = new THREE.EdgesGeometry(new THREE.BoxGeometry(GY_HALF * 2, GY_HALF * 2, GY_HALF * 2));
  const cageMat = new THREE.LineBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.9, linewidth: 2 });
  const cage = new THREE.LineSegments(cageE, cageMat);
  group.add(cage);
  // 2px-like cage thickness fallback: WebGL often ignores linewidth, so layer a second pass.
  const cagePass2 = new THREE.LineSegments(cageE, new THREE.LineBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.55, linewidth: 2 }));
  cagePass2.scale.setScalar(1.002);
  group.add(cagePass2);
  // Translucent reflective cube shell. BackSide so we see through the front into the
  // chambers but still catch starfield reflections on the inside walls.
  const shellGeo = new THREE.BoxGeometry(GY_HALF * 2, GY_HALF * 2, GY_HALF * 2);
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0x223a66, emissive: 0x081428, emissiveIntensity: 0.35,
    metalness: 0.85, roughness: 0.08,
    envMap, envMapIntensity: 1.4,
    transparent: true, opacity: 0.09, side: THREE.BackSide,
    depthWrite: false
  });
  const shell = new THREE.Mesh(shellGeo, shellMat); shell.renderOrder = 0; group.add(shell);
  boardGroup.add(group);
  // First call fetches winki.glb, caches the source mesh in _winkiSrc, then builds the
  // instanced grid. Subsequent calls (after a grid resize) skip the fetch and rebuild
  // immediately from the cached source.
  const buildInstanced = (srcMesh) => {
    const inst = _winkiInstancedMesh(srcMesh);
    group.add(inst);
    group.userData.surfaceMesh = inst;
    // Register as a raycast collider so the ball bounces off the actual winki surface
    // (motion-path test in collideBallVsGlb + 10-direction safety scan in safetyScanGlb).
    glbColliders.push(inst);
  };
  if (_winkiSrc) {
    buildInstanced(_winkiSrc);
  } else {
    const loader = new THREE.GLTFLoader();
    loader.load('assets/models/winki.glb', (gltf) => {
      let srcMesh = null;
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(o => { if (!srcMesh && o.isMesh) srcMesh = o; });
      if (!srcMesh) return;
      _winkiSrc = srcMesh;
      buildInstanced(srcMesh);
    }, undefined, (err) => { console.warn('winki.glb load failed', err); });
  }
  return group;
}
let glbOverlay = makeManifoldLattice();
// Per-cell sphere obstacles in nodePositions handle the cell-snap collisions; the lattice
// itself is decorative, so the GLB collider arrays stay empty and the bounce/safety helpers no-op.
const glbColliders = [];
const glbRay = new THREE.Raycaster();
const glbDir = new THREE.Vector3();
const glbN = new THREE.Vector3();
const glbNMat = new THREE.Matrix3();
const glbReady = Promise.resolve('procedural');
// Ball diameter = half the chamber edge, so a settled ball fills the centre of one winki
// chamber with chamber/4 of clearance on every side -- enough room to seal cleanly without
// jamming an adjacent chamber's neighbourhood.
// CELL is the chamber edge in world units (kept fixed across grid sizes so the lattice
// reads the same regardless of edge length). BALL_R = chamber/4 -> diameter == half chamber.
let CELL = 2.8, BALL_R = SADDLE_CELL * 0.25;
// Connect-4 cell positions are now identical to winki chamber centres (board-local space).
// This lets a settled ball snap exactly to the chamber it physically came to rest in.
function nodePos(gx, gy, gz) {
  return new THREE.Vector3(
    (gx + 0.5 - G * 0.5) * SADDLE_CELL,
    (gy + 0.5 - G * 0.5) * SADDLE_CELL,
    (gz + 0.5 - G * 0.5) * SADDLE_CELL);
}
// Saddle/tube lattice (z=xy surfaces) removed -- the GLB manifold is now the only visible structure.
// nodePositions below still drives invisible per-cell sphere collisions for the falling ball.
const haloGroup = new THREE.Group(); scene.add(haloGroup);
const HCFGS = [{ r: 9.5, tube: 0.12, color: 0x8800ff, speed: 0.22, tiltX: 0, tiltZ: 0 }, { r: 10.2, tube: 0.08, color: 0x00aaff, speed: -0.15, tiltX: Math.PI / 3, tiltZ: 0.2 }, { r: 9.8, tube: 0.06, color: 0xff00aa, speed: 0.10, tiltX: -Math.PI / 4, tiltZ: 0.4 }];
const haloMeshes = HCFGS.map(cfg => { const geo = new THREE.TorusGeometry(cfg.r, cfg.tube, 12, 90); const mat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.55, depthWrite: false }); const m = new THREE.Mesh(geo, mat); m.rotation.x = cfg.tiltX; m.rotation.z = cfg.tiltZ; m.userData = cfg; haloGroup.add(m); return m; });
// Atmosphere sphere removed -- it was wrapping the cube in a purple haze that hid the
// Schwartz Diamond structure. The faceLights + outer cage already provide the silhouette.
const atmoMat = { uniforms: { uTime: { value: 0 } } };  // animate() still pokes uTime; harmless no-op
// Jewel-tone palette: ruby red, forest green, deep purple, gold. P1/P2 use the first two; the rest are reserved for AI/team variants.
const BPALETTE = [
  { base: 0x7a0a18, emissive: 0x1a0205, glow: 0xc81a2a }, // ruby red
  { base: 0x0d3a1f, emissive: 0x021008, glow: 0x1f8a4a }, // forest green
  { base: 0x2a0850, emissive: 0x0a0218, glow: 0x6020c8 }, // deep purple
  { base: 0x6a4a08, emissive: 0x1a1002, glow: 0xd9a82a }  // gold
];
const BCOLS = { [P1]: BPALETTE[0], [P2]: BPALETTE[1], [P3]: BPALETTE[2], [P4]: BPALETTE[3] };
// Ball/halo/ring/win-glow geometries: rebuilt by rebuildWorld() whenever BALL_R changes
// with the grid size. All consumers (placedBalls, ghostBall, physBall, win glows) read these
// at construction so a fresh size flows through naturally on the next spawn.
let BGEO = new THREE.SphereGeometry(BALL_R, 28, 28),
  HGEO = new THREE.SphereGeometry(BALL_R * 1.7, 14, 14),
  RGEO = new THREE.TorusGeometry(BALL_R * 1.55, 0.025, 8, 32),
  WGEO = new THREE.SphereGeometry(BALL_R * 2.4, 18, 18);
// Solid jewel-stone ball, polished and reflective. Used both for the falling ball and for settled balls.
// Placed balls use the bright glow colour as the emissive to override the muted darker emissive
// from BPALETTE so the stones read as lit jewels instead of dark spheres lost in the cube.
function makeBallMat(p, ei, opts) {
  const c = BCOLS[p], o = opts || {};
  return new THREE.MeshStandardMaterial({
    color: c.base, emissive: o.emissive != null ? o.emissive : c.emissive, emissiveIntensity: ei != null ? ei : 0.12,
    metalness: 0.95, roughness: 0.06,
    envMap, envMapIntensity: 1.6
  });
}
function makeFallingBallMat(p) { return makeBallMat(p, 0.18); }
function makeHaloMat(p, op) { return new THREE.MeshBasicMaterial({ color: BCOLS[p].glow, transparent: true, opacity: (op != null ? op : 0.035), side: THREE.BackSide, depthWrite: false }); }
// Outer corona shell sized between halo and win-glow so the placed stone reads from any angle.
function makeCoronaMat(p, op) { return new THREE.MeshBasicMaterial({ color: BCOLS[p].glow, transparent: true, opacity: (op != null ? op : 0.18), side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending }); }
const placedBalls = [];
function addPlacedBall(gx, gy, gz, p) {
  // Settled stones glow from within (emissive == glow colour, intensity 1.4) and are wrapped
  // in a halo + corona + equatorial ring. The corona uses additive blending so multiple balls
  // packed together stack brightness rather than occluding each other.
  const mesh = new THREE.Mesh(BGEO, makeBallMat(p, 1.4, { emissive: BCOLS[p].glow }));
  const halo = new THREE.Mesh(HGEO, makeHaloMat(p, 0.32));
  const corona = new THREE.Mesh(WGEO, makeCoronaMat(p, 0.18));
  const ring = new THREE.Mesh(RGEO, new THREE.MeshBasicMaterial({ color: BCOLS[p].glow, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  const pos = nodePos(gx, gy, gz);
  [mesh, halo, corona, ring].forEach(o => { o.position.copy(pos); boardGroup.add(o); });
  ring.rotation.x = Math.PI / 2;
  placedBalls.push({ mesh, halo, corona, ring, gx, gy, gz, p });
}
const winGlows = [];
function showWinGlows(cells) { cells.forEach(([gx, gy, gz]) => { const m = new THREE.Mesh(WGEO, new THREE.MeshBasicMaterial({ color: 0xffee00, transparent: true, opacity: 0.42, side: THREE.BackSide, depthWrite: false })); m.position.copy(nodePos(gx, gy, gz)); boardGroup.add(m); winGlows.push(m); }); }
function clearWinGlows() { winGlows.forEach(m => boardGroup.remove(m)); winGlows.length = 0; }
// Audio4D: tactile SFX + section-aware ensemble (piano, bass, drums, marimba, oboe, violin).
// Lazy WebAudio init on first user interaction; section schedule advances every 4 beats.
const Audio4D = (() => {
  let ac = null, master = null, musicGain = null, sfxGain = null, pulseTimer = null;
  let sectionIdx = 0, sectionBar = 0, lastTapT = 0;
  const BPM = 132, SPB = 60 / BPM, SP8 = SPB / 2;
  const SECTIONS = [
    { name: 'verse', bars: 8, marimba: 0, violin: 0, oboe: 1 },
    { name: 'chorus', bars: 8, marimba: 1, violin: 1, oboe: 0 },
    { name: 'bridge', bars: 6, marimba: 1, violin: 1, oboe: 1 },
    { name: 'outro', bars: 4, marimba: 0, violin: 1, oboe: 1 }
  ];
  // Cm pentatonic stack: Cm, Bb, Ab, Gm. Bass walks the roots one octave down.
  const CHORDS = [[261.63, 311.13, 392.00], [233.08, 293.66, 349.23], [220.00, 277.18, 329.63], [196.00, 233.08, 293.66]];
  const BASS = [65.41, 58.27, 55.00, 49.00];
  const MELODY = [392.00, 349.23, 311.13, 392.00, 466.16, 440.00, 349.23, 311.13];
  function ensure() {
    if (ac) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
      musicGain = ac.createGain(); musicGain.gain.value = 0.5; musicGain.connect(master);
      sfxGain = ac.createGain(); sfxGain.gain.value = 0.85; sfxGain.connect(master);
    } catch (_) { ac = null; }
  }
  function envOsc(type, freq, t, dur, vol, dest, attack) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + (attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function piano(f, t, dur, vol) { envOsc('triangle', f, t, dur * 0.7, vol * 0.7); envOsc('sine', f * 2, t, dur * 0.4, vol * 0.3); }
  function bassNote(f, t, dur, vol) { envOsc('sine', f, t, dur, vol * 0.95); envOsc('triangle', f * 2, t, dur * 0.5, vol * 0.2); }
  function marimba(f, t, vol) { envOsc('sine', f, t, 0.3, vol * 0.55, null, 0.002); envOsc('sine', f * 4, t, 0.08, vol * 0.4, null, 0.001); }
  function oboe(f, t, dur, vol) { envOsc('sawtooth', f, t, dur, vol * 0.16); envOsc('square', f, t, dur, vol * 0.08); }
  function violin(f, t, dur, vol) { envOsc('sawtooth', f, t, dur, vol * 0.14, null, 0.05); envOsc('sine', f * 1.5, t, dur, vol * 0.07, null, 0.05); }
  function kick(t, vol) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(vol * 0.85, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.2);
  }
  function noiseBurst(t, dur, hp, vol) {
    if (!ac) return;
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5);
    const s = ac.createBufferSource(); s.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ac.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(musicGain); s.start(t);
  }
  function tickBar() {
    if (!ac) return;
    const t0 = ac.currentTime + 0.06;
    const sec = SECTIONS[sectionIdx];
    const ci = sectionBar % CHORDS.length, ch = CHORDS[ci], bs = BASS[ci];
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * SPB;
      kick(t, 1);
      if (b === 1 || b === 3) noiseBurst(t, 0.12, 1500, 0.4);
      noiseBurst(t, 0.03, 7000, 0.18); noiseBurst(t + SP8, 0.03, 7000, 0.12);
      bassNote(bs, t, SPB * 0.9, 0.3);
      ch.forEach(f => piano(f, t, SPB * 0.85, 0.09));
      if (sec.marimba && (b === 1 || b === 2)) marimba(ch[b % 3] * 2, t + SP8, 0.55);
      if (sec.violin) violin(MELODY[(sectionBar * 4 + b) % MELODY.length], t, SPB * 1.1, 0.5);
      if (sec.oboe && (b === 0 || b === 2)) oboe(ch[0] * 2, t, SPB * 1.2, 0.5);
    }
    sectionBar++;
    if (sectionBar >= sec.bars) { sectionBar = 0; sectionIdx = (sectionIdx + 1) % SECTIONS.length; }
  }
  return {
    init() { ensure(); if (ac && ac.state === 'suspended') ac.resume(); },
    startMusic() {
      ensure(); if (!ac) return;
      if (ac.state === 'suspended') ac.resume();
      this.stopMusic();
      sectionIdx = 0; sectionBar = 0;
      tickBar();
      pulseTimer = setInterval(tickBar, 4 * SPB * 1000);
    },
    stopMusic() { if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; } },
    onTap(speed) {
      ensure(); if (!ac) return;
      const now = ac.currentTime;
      if (now - lastTapT < 0.04) return;
      lastTapT = now;
      const v = Math.min(0.4, 0.04 + speed * 0.01);
      const f = 1100 + Math.random() * 800;
      envOsc('sine', f, now, 0.05, v, sfxGain, 0.001);
      envOsc('triangle', f * 0.5, now, 0.06, v * 0.5, sfxGain, 0.001);
    },
    onRelease() {
      ensure(); if (!ac) return;
      const t = ac.currentTime;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(220, t + 0.4);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.5);
    },
    onSettle() {
      ensure(); if (!ac) return;
      const t = ac.currentTime;
      envOsc('sine', 180, t, 0.18, 0.32, sfxGain, 0.001);
      envOsc('triangle', 90, t, 0.22, 0.28, sfxGain, 0.001);
    },
    onPlace(p) {
      ensure(); if (!ac) return;
      const t = ac.currentTime;
      const f = p === 1 ? 660 : 528;
      envOsc('sine', f, t, 0.25, 0.18, sfxGain, 0.005);
      envOsc('sine', f * 1.5, t + 0.05, 0.2, 0.12, sfxGain, 0.005);
    },
    onWin(p) {
      ensure(); if (!ac) return;
      const t = ac.currentTime;
      const root = p === 1 ? 523.25 : 587.33;
      [0, 0.12, 0.24, 0.36].forEach((d, i) => {
        const f = [root, root * 1.25, root * 1.5, root * 2][i];
        envOsc('triangle', f, t + d, 0.6, 0.32, sfxGain, 0.005);
        envOsc('sine', f * 2, t + d, 0.5, 0.18, sfxGain, 0.005);
      });
    }
  };
})();

// Physics tunables; overwritten from manifold.game.json:params.physics at bootstrap.
let GRAV = -62, RESTIT = 0.28, DAMP = 0.72, SETTLE_V = 0.30, BALL_AIR = 0.992;
// Play volume bounds: clamp tight to the lattice extents so balls never escape the gyroid cube.
// Lattice spans gx,gz in 0..G-1 → world coords (gx-1.5)*CELL ∈ [-4.2, +4.2] for G=4.
let PLAY_HX = (G - 1) * 0.5 * CELL + BALL_R;          // tight x half-extent
let PLAY_HZ = (G - 1) * 0.5 * CELL + BALL_R;          // tight z half-extent
let TOP_Y = nodePos(0, G - 1, 0).y + CELL * 1.2;      // initial ghost-ball hover plane (replaced per-frame by _aimYWorld)
// Y bounds widened so the ball can't escape vertically regardless of which cube face is currently up.
// Spawn happens at _aimYWorld which is just above the rotated cube's highest world-Y vertex; ceiling
// gives a small headroom above that, floor mirrors below.
let Y_CEIL = PLAY_HX + CELL * 1.2 + BALL_R;
let FLOOR_Y = -(PLAY_HX + CELL * 1.2 + BALL_R);
// Saddle-lattice collision. Each substep:
//   1. Hard cube wall in board-local space (handles rotated cubes correctly).
//   2. Per-cell saddle membrane: identify which chamber the ball is in, transform into
//      cell-local frame, evaluate signed distance to f = z' - x'*y' = 0.
//      - If sign vs physBall.side flipped between prev and curr: binary search for the
//        crossing along the board-local segment and reflect the ball back at that t.
//      - Else if |signedDist| < BALL_R: push along grad to the home side.
// |grad(f)|_cell-local = sqrt(1 + x'^2 + y'^2) >= 1 everywhere, so the signed-distance
// approximation is always well-conditioned (no critical-point teleport mode).
const _gyLocal = new THREE.Vector3();
const _gyPrev = new THREE.Vector3();
const _gyN = new THREE.Vector3();
const _gyWorldN = new THREE.Vector3();
const _gyWorldPos = new THREE.Vector3();
const _gyCellIdx = new THREE.Vector3();
const _gyCellCenter = new THREE.Vector3();
const _gyTmp = new THREE.Vector3();
function _saddleCellOf(lx, ly, lz, out) {
  let cx = Math.floor((lx + GY_HALF) / SADDLE_CELL);
  let cy = Math.floor((ly + GY_HALF) / SADDLE_CELL);
  let cz = Math.floor((lz + GY_HALF) / SADDLE_CELL);
  if (cx < 0) cx = 0; else if (cx > G - 1) cx = G - 1;
  if (cy < 0) cy = 0; else if (cy > G - 1) cy = G - 1;
  if (cz < 0) cz = 0; else if (cz > G - 1) cz = G - 1;
  return out.set(cx, cy, cz);
}
// Convert board-local point -> cell-local (for the cell at cellIdx). Reuses _cellQ.
function _toCellLocal(blx, bly, blz, cellIdx, out) {
  saddleCellCenter(cellIdx.x, cellIdx.y, cellIdx.z, _gyCellCenter);
  out.set(blx - _gyCellCenter.x, bly - _gyCellCenter.y, blz - _gyCellCenter.z);
  saddleCellQuaternion(cellIdx.x, cellIdx.y, cellIdx.z, _cellQ);
  _cellQInv.copy(_cellQ).invert();
  return out.applyQuaternion(_cellQInv);
}
// Signed distance to the saddle in the cell containing board-local (blx,bly,blz).
function _saddleSignedAt(blx, bly, blz) {
  _saddleCellOf(blx, bly, blz, _gyCellIdx);
  _toCellLocal(blx, bly, blz, _gyCellIdx, _cellLocal);
  return saddleSignedDistance(_cellLocal.x, _cellLocal.y, _cellLocal.z);
}
function gyroidGuide(dt, pwx, pwy, pwz) {
  if (!physBall || physBall.settled) return;
  _gyLocal.set(physBall.x, physBall.y, physBall.z); boardGroup.worldToLocal(_gyLocal);
  // --- 1. Cube hard wall (axis-aligned in local space). ---
  const lim = GY_HALF - BALL_R;
  let cubeBounced = 0;
  if (_gyLocal.x < -lim) { _gyLocal.x = -lim; cubeBounced |= 1; }
  else if (_gyLocal.x > lim) { _gyLocal.x = lim; cubeBounced |= 1; }
  if (_gyLocal.y < -lim) { _gyLocal.y = -lim; cubeBounced |= 2; }
  else if (_gyLocal.y > lim) { _gyLocal.y = lim; cubeBounced |= 2; }
  if (_gyLocal.z < -lim) { _gyLocal.z = -lim; cubeBounced |= 4; }
  else if (_gyLocal.z > lim) { _gyLocal.z = lim; cubeBounced |= 4; }
  if (cubeBounced) {
    _gyWorldPos.copy(_gyLocal); boardGroup.localToWorld(_gyWorldPos);
    physBall.x = _gyWorldPos.x; physBall.y = _gyWorldPos.y; physBall.z = _gyWorldPos.z;
    if (cubeBounced & 1) { _gyWorldN.set(Math.sign(_gyLocal.x), 0, 0).transformDirection(boardGroup.matrixWorld); reflectVel(_gyWorldN, 0.20); }
    if (cubeBounced & 2) { _gyWorldN.set(0, Math.sign(_gyLocal.y), 0).transformDirection(boardGroup.matrixWorld); reflectVel(_gyWorldN, 0.10); }
    if (cubeBounced & 4) { _gyWorldN.set(0, 0, Math.sign(_gyLocal.z)).transformDirection(boardGroup.matrixWorld); reflectVel(_gyWorldN, 0.20); }
  }
  if (physBall.side === undefined) return;
  // Once the winki GLB collider is loaded, raycast handles the membrane (collideBallVsGlb +
  // safetyScanGlb). The analytic saddle stays as a fallback only while the GLB is loading.
  if (glbColliders.length) return;
  // --- 2. Per-cell saddle membrane. ---
  _gyPrev.set(pwx, pwy, pwz); boardGroup.worldToLocal(_gyPrev);
  const dPrev = _saddleSignedAt(_gyPrev.x, _gyPrev.y, _gyPrev.z);
  const dCurr = _saddleSignedAt(_gyLocal.x, _gyLocal.y, _gyLocal.z);
  const home = physBall.side;
  const tunneled = (home * dPrev) > 0 && (home * dCurr) <= 0;
  if (tunneled) {
    // Binary search for the membrane crossing t in [0,1].
    let lo = 0, hi = 1;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) * 0.5;
      const x = _gyPrev.x + (_gyLocal.x - _gyPrev.x) * mid;
      const y = _gyPrev.y + (_gyLocal.y - _gyPrev.y) * mid;
      const z = _gyPrev.z + (_gyLocal.z - _gyPrev.z) * mid;
      if ((home * _saddleSignedAt(x, y, z)) > 0) lo = mid; else hi = mid;
    }
    _gyLocal.x = _gyPrev.x + (_gyLocal.x - _gyPrev.x) * lo;
    _gyLocal.y = _gyPrev.y + (_gyLocal.y - _gyPrev.y) * lo;
    _gyLocal.z = _gyPrev.z + (_gyLocal.z - _gyPrev.z) * lo;
    // Compute outward normal in board-local: rotate cell-local grad by cell quaternion.
    _saddleCellOf(_gyLocal.x, _gyLocal.y, _gyLocal.z, _gyCellIdx);
    _toCellLocal(_gyLocal.x, _gyLocal.y, _gyLocal.z, _gyCellIdx, _cellLocal);
    saddleGrad(_cellLocal.x, _cellLocal.y, _cellLocal.z, _gyN);
    saddleCellQuaternion(_gyCellIdx.x, _gyCellIdx.y, _gyCellIdx.z, _cellQ);
    _gyN.applyQuaternion(_cellQ).normalize().multiplyScalar(home);
    _gyLocal.x += _gyN.x * BALL_R;
    _gyLocal.y += _gyN.y * BALL_R;
    _gyLocal.z += _gyN.z * BALL_R;
    _gyWorldPos.copy(_gyLocal); boardGroup.localToWorld(_gyWorldPos);
    physBall.x = _gyWorldPos.x; physBall.y = _gyWorldPos.y; physBall.z = _gyWorldPos.z;
    _gyWorldN.copy(_gyN).transformDirection(boardGroup.matrixWorld);
    const vn = physBall.vx * _gyWorldN.x + physBall.vy * _gyWorldN.y + physBall.vz * _gyWorldN.z;
    if (vn < 0) {
      if (-vn > 2) Audio4D.onTap(-vn);
      physBall.vx -= (1 + RESTIT) * vn * _gyWorldN.x;
      physBall.vy -= (1 + RESTIT) * vn * _gyWorldN.y;
      physBall.vz -= (1 + RESTIT) * vn * _gyWorldN.z;
      const vAfter = physBall.vx * _gyWorldN.x + physBall.vy * _gyWorldN.y + physBall.vz * _gyWorldN.z;
      physBall.vx = _gyWorldN.x * vAfter + (physBall.vx - vAfter * _gyWorldN.x) * 0.92;
      physBall.vy = _gyWorldN.y * vAfter + (physBall.vy - vAfter * _gyWorldN.y) * 0.92;
      physBall.vz = _gyWorldN.z * vAfter + (physBall.vz - vAfter * _gyWorldN.z) * 0.92;
    }
    return;
  }
  // --- 3. Thickness collision (ball still on home side, surface within BALL_R). ---
  if ((home * dCurr) >= BALL_R) return;
  const overshoot = BALL_R - home * dCurr;
  _saddleCellOf(_gyLocal.x, _gyLocal.y, _gyLocal.z, _gyCellIdx);
  _toCellLocal(_gyLocal.x, _gyLocal.y, _gyLocal.z, _gyCellIdx, _cellLocal);
  saddleGrad(_cellLocal.x, _cellLocal.y, _cellLocal.z, _gyN);
  saddleCellQuaternion(_gyCellIdx.x, _gyCellIdx.y, _gyCellIdx.z, _cellQ);
  _gyN.applyQuaternion(_cellQ).normalize().multiplyScalar(home);
  _gyLocal.x += _gyN.x * overshoot;
  _gyLocal.y += _gyN.y * overshoot;
  _gyLocal.z += _gyN.z * overshoot;
  _gyWorldPos.copy(_gyLocal); boardGroup.localToWorld(_gyWorldPos);
  physBall.x = _gyWorldPos.x; physBall.y = _gyWorldPos.y; physBall.z = _gyWorldPos.z;
  _gyWorldN.copy(_gyN).transformDirection(boardGroup.matrixWorld);
  const vn = physBall.vx * _gyWorldN.x + physBall.vy * _gyWorldN.y + physBall.vz * _gyWorldN.z;
  if (vn < 0) {
    if (-vn > 2) Audio4D.onTap(-vn);
    physBall.vx -= (1 + RESTIT) * vn * _gyWorldN.x;
    physBall.vy -= (1 + RESTIT) * vn * _gyWorldN.y;
    physBall.vz -= (1 + RESTIT) * vn * _gyWorldN.z;
    const vAfter = physBall.vx * _gyWorldN.x + physBall.vy * _gyWorldN.y + physBall.vz * _gyWorldN.z;
    const vtx = physBall.vx - vAfter * _gyWorldN.x;
    const vty = physBall.vy - vAfter * _gyWorldN.y;
    const vtz = physBall.vz - vAfter * _gyWorldN.z;
    physBall.vx = _gyWorldN.x * vAfter + vtx * 0.96;
    physBall.vy = _gyWorldN.y * vAfter + vty * 0.96;
    physBall.vz = _gyWorldN.z * vAfter + vtz * 0.96;
    physBall.spinX += (_gyWorldN.y * vtz - _gyWorldN.z * vty) * 0.06;
    physBall.spinY += (_gyWorldN.z * vtx - _gyWorldN.x * vtz) * 0.06;
    physBall.spinZ += (_gyWorldN.x * vty - _gyWorldN.y * vtx) * 0.06;
  }
}
function reflectVel(n, restit) {
  const vn = physBall.vx * n.x + physBall.vy * n.y + physBall.vz * n.z;
  if (vn < 0) {
    physBall.vx -= (1 + restit) * vn * n.x;
    physBall.vy -= (1 + restit) * vn * n.y;
    physBall.vz -= (1 + restit) * vn * n.z;
  }
}
// Lattice-node sphere obstacles (visible saddle tiles): ball bounces off them.
// Cell-sphere collision disabled: with the Schwartz Diamond walls now providing the meander,
// a 4x4x4 grid of bumper spheres acts as a "lid" that catches the ball on the top face.
// nodePositions still drives the final cell-snap in nearestFreeCell; only the per-substep
// collision loop is short-circuited by NODE_R = 0.
const NODE_R = 0;
// Each node stores its local lattice position (lp) AND a world-space cache (p) that is
// recomputed from the boardGroup matrix whenever a ball is released. Rotation is locked
// during flight, so the world cache stays valid for the entire physics run.
const nodePositions = [];
// Repopulate nodePositions for the current G. Called at boot and from rebuildWorld() on grid resize.
function rebuildNodePositions() {
  nodePositions.length = 0;
  for (let gx = 0; gx < G; gx++)
    for (let gy = 0; gy < G; gy++)
      for (let gz = 0; gz < G; gz++) { const lp = nodePos(gx, gy, gz); nodePositions.push({ gx, gy, gz, lp, p: lp.clone() }); }
}
rebuildNodePositions();
function refreshNodeWorldCache() { boardGroup.updateMatrixWorld(true); for (let i = 0; i < nodePositions.length; i++) { nodePositions[i].p.copy(nodePositions[i].lp).applyMatrix4(boardGroup.matrixWorld); } }

let physBall = null;       // active falling ball
let ghostBall = null;      // ball stuck to the cursor for the current player
let lastMouseX = window.innerWidth * 0.5, lastMouseY = window.innerHeight * 0.5;

function spawnGhostBall(p) {
  if (ghostBall) { scene.remove(ghostBall.mesh); scene.remove(ghostBall.halo); ghostBall = null; }
  const mesh = new THREE.Mesh(BGEO, makeFallingBallMat(p));
  mesh.renderOrder = 5;
  const halo = new THREE.Mesh(HGEO, makeHaloMat(p, 0.04));
  updateAimPlane();
  mesh.position.set(0, _aimYWorld, 0); halo.position.copy(mesh.position);
  scene.add(mesh); scene.add(halo);
  ghostBall = { mesh, halo, p, x: 0, y: _aimYWorld, z: 0 };
  moveGhostFromClient(lastMouseX, lastMouseY);
}

// Dynamic aim: world-up plane sitting just above the highest world-Y vertex of the rotated cube.
// _aimYWorld is recomputed each frame so the ghost ball always hovers above whichever face is up.
const _aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _aimRay = new THREE.Raycaster();
const _aimHit = new THREE.Vector3();
const _aimNDC = new THREE.Vector2();
const _aimCorner = new THREE.Vector3();
let _aimYWorld = TOP_Y;
// CUBE_CORNERS is repopulated by rebuildWorld() whenever PLAY_HX/HZ change with the grid.
let CUBE_CORNERS = [];
function rebuildCubeCorners() {
  CUBE_CORNERS = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
    CUBE_CORNERS.push(new THREE.Vector3(sx * PLAY_HX, sy * PLAY_HX, sz * PLAY_HZ));
}
rebuildCubeCorners();
// Rebuild every grid-dependent piece of world state for a new edge length. Disposes the old
// glbOverlay (cage + shell + winki instance), clears collider list, recomputes constants, and
// rebuilds geometry caches/lookup tables. Caller (resetGame) is responsible for clearing
// placedBalls / physBall / ghostBall before invoking this.
function rebuildWorld(newG) {
  if (newG === G && glbOverlay) return;          // no-op if size unchanged after first build
  // 1. Tear down the previous lattice. dispose() releases GPU buffers; glbColliders is rebuilt
  //    below from the new InstancedMesh that makeManifoldLattice() will register.
  if (glbOverlay) {
    boardGroup.remove(glbOverlay);
    glbOverlay.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach(x => x.dispose()); }
    });
  }
  glbColliders.length = 0;
  // 2. Update the manifold model and our local mirror, then recompute everything derived from G.
  G = newG | 0;
  BM.setGrid(G);
  GY_HALF = (G - 1) * 0.5 * 2.8 + 0.18;
  SADDLE_CELL = (2 * GY_HALF) / G;
  SADDLE_HALF = SADDLE_CELL * 0.5;
  BALL_R = SADDLE_CELL * 0.25;
  PLAY_HX = (G - 1) * 0.5 * CELL + BALL_R;
  PLAY_HZ = (G - 1) * 0.5 * CELL + BALL_R;
  TOP_Y = nodePos(0, G - 1, 0).y + CELL * 1.2;
  Y_CEIL = PLAY_HX + CELL * 1.2 + BALL_R;
  FLOOR_Y = -(PLAY_HX + CELL * 1.2 + BALL_R);
  // 3. Rebuild ball geometries at the new BALL_R. Old geos are disposed because addPlacedBall /
  //    spawn helpers clone material per-mesh but reuse the shared geometry, so a fresh handle
  //    is required for new balls to render at the correct size.
  BGEO.dispose(); HGEO.dispose(); RGEO.dispose(); WGEO.dispose();
  BGEO = new THREE.SphereGeometry(BALL_R, 28, 28);
  HGEO = new THREE.SphereGeometry(BALL_R * 1.7, 14, 14);
  RGEO = new THREE.TorusGeometry(BALL_R * 1.55, 0.025, 8, 32);
  WGEO = new THREE.SphereGeometry(BALL_R * 2.4, 18, 18);
  // 4. Rebuild lookup caches that index by G.
  rebuildNodePositions();
  rebuildCubeCorners();
  // 5. Build the new lattice; if winki.glb is cached this completes synchronously, otherwise
  //    the InstancedMesh is registered when the loader callback fires.
  glbOverlay = makeManifoldLattice();
}
function updateAimPlane() {
  boardGroup.updateMatrixWorld(true);
  let maxY = -Infinity;
  for (let i = 0; i < CUBE_CORNERS.length; i++) { _aimCorner.copy(CUBE_CORNERS[i]).applyMatrix4(boardGroup.matrixWorld); if (_aimCorner.y > maxY) maxY = _aimCorner.y; }
  // Hover ghost just above the cube so the player can aim, but spawn the actual physics ball
  // INSIDE the top face (see spawnPhysBall) so it immediately enters the Diamond passage system.
  _aimYWorld = maxY + BALL_R + 0.4;
  _aimPlane.constant = -_aimYWorld;
}
// Project mouse ray onto the dynamic aim plane, then clamp to the rotated cube's silhouette by
// converting hit -> local space, clamping to ±PLAY_HX/Z on the two axes perpendicular to the
// current local-up, and converting back to world. Keeps the ghost ball over the active top face.
const _aimLocal = new THREE.Vector3();
const _aimWorldPos = new THREE.Vector3();
const _aimAxes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];
function localUpAxis() {
  // Returns the local-axis index (0..5) whose world-up dot product is highest (i.e., the top face).
  let best = 2, bestDot = -Infinity;
  for (let i = 0; i < 6; i++) { _aimLocal.copy(_aimAxes[i]).applyQuaternion(boardGroup.quaternion); if (_aimLocal.y > bestDot) { bestDot = _aimLocal.y; best = i; } }
  return best;
}
function moveGhostFromClient(clientX, clientY) {
  if (!ghostBall) return;
  _aimNDC.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  _aimRay.setFromCamera(_aimNDC, camera);
  if (!_aimRay.ray.intersectPlane(_aimPlane, _aimHit)) return;
  // Convert world hit -> local box, clamp to cube extents, then back to world.
  _aimLocal.copy(_aimHit); boardGroup.worldToLocal(_aimLocal);
  _aimLocal.x = Math.max(-PLAY_HX, Math.min(PLAY_HX, _aimLocal.x));
  _aimLocal.y = Math.max(-PLAY_HX, Math.min(PLAY_HX, _aimLocal.y));
  _aimLocal.z = Math.max(-PLAY_HZ, Math.min(PLAY_HZ, _aimLocal.z));
  _aimWorldPos.copy(_aimLocal); boardGroup.localToWorld(_aimWorldPos);
  _aimWorldPos.y = _aimYWorld;
  ghostBall.x = _aimWorldPos.x; ghostBall.y = _aimWorldPos.y; ghostBall.z = _aimWorldPos.z;
  ghostBall.mesh.position.set(ghostBall.x, ghostBall.y, ghostBall.z);
  ghostBall.halo.position.copy(ghostBall.mesh.position);
}

function syncGhostToCursor() {
  if (!ghostBall || isDropping || isGameOver) return;
  moveGhostFromClient(lastMouseX, lastMouseY);
}

function spawnPhysBall(x, y, z, p, predicted, dropColumn) {
  if (physBall) { scene.remove(physBall.mesh); scene.remove(physBall.halo); physBall = null; }
  const mesh = new THREE.Mesh(BGEO, makeFallingBallMat(p));
  mesh.renderOrder = 5;
  const halo = new THREE.Mesh(HGEO, makeHaloMat(p, 0.03));
  // Drop the ball into the centre of the saddle chamber under the cursor on the CURRENT
  // WORLD-UP face of the (possibly rotated/snapped) cube:
  //   1. Find which local axis is most aligned with world +Y.
  //   2. Place spawn just inside that face along the face-normal axis.
  //   3. Snap the two in-plane coords to the nearest saddle chamber centre so the ball
  //      enters cleanly above one specific cell rather than near a saddle edge.
  const _spawnLocal = new THREE.Vector3(x, y, z);
  boardGroup.worldToLocal(_spawnLocal);
  const faceIdx = localUpAxis();
  const ax = (faceIdx >> 1);                       // 0=X, 1=Y, 2=Z is the face-normal axis
  const sgn = (faceIdx % 2 === 0) ? +1 : -1;        // +face vs -face
  const inset = GY_HALF - BALL_R * 1.5;
  const slabComp = sgn * inset;
  const inA = (ax === 0) ? 'y' : 'x';
  const inB = (ax === 2) ? 'y' : 'z';
  if (ax === 0) _spawnLocal.x = slabComp;
  else if (ax === 1) _spawnLocal.y = slabComp;
  else _spawnLocal.z = slabComp;
  // Snap in-plane coords to the nearest chamber centre: chamber k spans
  // [-GY_HALF + k*SADDLE_CELL, -GY_HALF + (k+1)*SADDLE_CELL], centre at -GY_HALF + (k+0.5)*SADDLE_CELL.
  const _snap = v => {
    let k = Math.floor((v + GY_HALF) / SADDLE_CELL);
    if (k < 0) k = 0; else if (k > G - 1) k = G - 1;
    return -GY_HALF + (k + 0.5) * SADDLE_CELL;
  };
  _spawnLocal[inA] = _snap(_spawnLocal[inA]);
  _spawnLocal[inB] = _snap(_spawnLocal[inB]);
  const dSpawn = _saddleSignedAt(_spawnLocal.x, _spawnLocal.y, _spawnLocal.z);
  const side = dSpawn >= 0 ? 1 : -1;
  const v0 = -1;                                   // m/s downward in world
  boardGroup.localToWorld(_spawnLocal);
  mesh.position.copy(_spawnLocal); halo.position.copy(mesh.position);
  scene.add(mesh); scene.add(halo);
  physBall = { mesh, halo, x: _spawnLocal.x, y: _spawnLocal.y, z: _spawnLocal.z, vx: 0, vy: v0, vz: 0, p, side, settled: false, settleTimer: 0, spinX: 0, spinY: 0, spinZ: 0, lowY: _spawnLocal.y, stuckTime: 0, predicted: predicted || null, dropColumn: dropColumn || null };
  return true;
}
// Snap the cube's rotation to the nearest cube symmetry so that one local axis aligns to world-up.
// Done at ball release so the falling ball drops cleanly along a lattice column. 24 orientations
// (6 face-up choices x 4 rotations around up) cover every cube symmetry; we pick the closest.
const _snapBest = new THREE.Quaternion();
const _snapTry = new THREE.Quaternion();
const _snapAxisX = new THREE.Vector3(1, 0, 0), _snapAxisY = new THREE.Vector3(0, 1, 0), _snapAxisZ = new THREE.Vector3(0, 0, 1);
const _snapEuler = new THREE.Euler();
const CUBE_ORIENTS = (() => {
  const list = [], seen = new Set();
  const eulers = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) eulers.push([i * Math.PI / 2, j * Math.PI / 2, k * Math.PI / 2]);
  eulers.forEach(([x, y, z]) => { _snapEuler.set(x, y, z, 'XYZ'); const q = new THREE.Quaternion().setFromEuler(_snapEuler); const k = q.x.toFixed(3) + ',' + q.y.toFixed(3) + ',' + q.z.toFixed(3) + ',' + q.w.toFixed(3); if (!seen.has(k)) { seen.add(k); list.push(q); } });
  return list;
})();
function snapBoardRotation() {
  const cur = boardGroup.quaternion;
  let bestDot = -Infinity;
  for (let i = 0; i < CUBE_ORIENTS.length; i++) { const q = CUBE_ORIENTS[i]; const d = Math.abs(cur.x * q.x + cur.y * q.y + cur.z * q.z + cur.w * q.w); if (d > bestDot) { bestDot = d; _snapBest.copy(q); } }
  boardGroup.quaternion.copy(_snapBest);
  boardGroup.updateMatrixWorld(true);
}

// Snap a free-form local-space aim point to the nearest column center on the currently-up face.
// Returns { latA, latB, faceIdx } so the caller can use topFaceWorldPos() for a clean drop.
// Without this, balls released between passages bounce off the top of a gyroid wall and roll
// down the outside of the cube instead of falling through a column.
function snapAimToColumn(aimLocal, faceIdx) {
  const ax = (faceIdx >> 1);                       // 0=X, 1=Y, 2=Z is the face-normal axis
  const inPlane = [0, 1, 2].filter(i => i !== ax); // the two lattice axes on this face
  const half = (G - 1) * 0.5 * CELL;
  const local = [aimLocal.x, aimLocal.y, aimLocal.z];
  const lat = inPlane.map(i => {
    const idx = Math.round((local[i] + half) / CELL);
    return Math.max(0, Math.min(G - 1, idx));
  });
  return { latA: lat[0], latB: lat[1], faceIdx };
}
// Predict where the ball WILL land the instant it's released. Knowing this up-front lets the
// snap animation always glide downward into the target chamber instead of (after-the-fact)
// jumping sideways or upward to whatever empty cell happened to be nearest the rest position.
// Walks the column (latA,latB,faceIdx) from the bottom face upward; first empty cell wins.
//   ax (faceIdx>>1) is the gravity axis, sign tells which end of that axis is "up".
//   sign=+1: top face at +half, bottom at index 0, fill upward (k=0..G-1).
//   sign=-1: top face at -half, bottom at index G-1, fill downward (k=G-1..0).
function predictLanding(latA, latB, faceIdx) {
  const ax = (faceIdx >> 1);
  const sign = (faceIdx % 2 === 0) ? +1 : -1;
  const start = sign === 1 ? 0 : G - 1;
  const end = sign === 1 ? G : -1;
  const step = sign;
  for (let k = start; k !== end; k += step) {
    let gx, gy, gz;
    if (ax === 0) { gx = k; gy = latA; gz = latB; }
    else if (ax === 1) { gx = latA; gy = k; gz = latB; }
    else { gx = latA; gy = latB; gz = k; }
    if (!BM.getCell(gx, gy, gz)) return [gx, gy, gz];
  }
  return null;
}

function columnCells(dropColumn) {
  if (!dropColumn) return [];
  const { latA, latB, faceIdx } = dropColumn;
  const ax = (faceIdx >> 1);
  const sign = (faceIdx % 2 === 0) ? +1 : -1;
  const start = sign === 1 ? 0 : G - 1;
  const end = sign === 1 ? G : -1;
  const step = sign;
  const cells = [];
  for (let k = start; k !== end; k += step) {
    if (ax === 0) cells.push([k, latA, latB]);
    else if (ax === 1) cells.push([latA, k, latB]);
    else cells.push([latA, latB, k]);
  }
  return cells;
}

function nearestFreeNodeInColumn(dropColumn, x, y, z, yLimit) {
  if (!dropColumn) return null;
  const cap = yLimit != null ? yLimit : Infinity;
  let best = null, bestD = Infinity;
  const cells = columnCells(dropColumn);
  for (let i = 0; i < cells.length; i++) {
    const [gx, gy, gz] = cells[i];
    if (BM.getCell(gx, gy, gz)) continue;
    const wp = nodePos(gx, gy, gz);
    boardGroup.localToWorld(wp);
    if (wp.y > cap) continue;
    const dx = x - wp.x, dy = y - wp.y, dz = z - wp.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = { gx, gy, gz, p: wp };
    }
  }
  return best;
}

function nearestFreeCellInColumn(dropColumn, x, y, z, yLimit) {
  const node = nearestFreeNodeInColumn(dropColumn, x, y, z, yLimit);
  return node ? [node.gx, node.gy, node.gz] : null;
}

function segmentIndexFromLocal(v) {
  const idx = Math.floor((v + GY_HALF) / SADDLE_CELL);
  return Math.max(0, Math.min(G - 1, idx));
}

function settledSegmentFromWorld(x, y, z) {
  const local = new THREE.Vector3(x, y, z);
  boardGroup.worldToLocal(local);
  return {
    gx: segmentIndexFromLocal(local.x),
    gy: segmentIndexFromLocal(local.y),
    gz: segmentIndexFromLocal(local.z),
  };
}

function resolveSettledSegmentCell(x, y, z) {
  const seed = settledSegmentFromWorld(x, y, z);
  // Strict mode: only accept the exact segment — no adjacency fallback.
  if (!BM.getCell(seed.gx, seed.gy, seed.gz)) return [seed.gx, seed.gy, seed.gz];
  return null;
}

function settledSegmentTargetNode(x, y, z) {
  const cell = resolveSettledSegmentCell(x, y, z);
  if (!cell) return null;
  const [gx, gy, gz] = cell;
  const wp = nodePos(gx, gy, gz);
  boardGroup.localToWorld(wp);
  return { gx, gy, gz, p: wp };
}

function releaseBall() {
  if (!ghostBall || isDropping || isGameOver) return;
  if (!KGSync.canActLocally()) return;
  // Capture the ghost's current world-space aim point BEFORE we snap, so the ball spawns
  // above the column the player was actually pointing at (re-projected after snap).
  const p = ghostBall.p;
  const aimWorld = new THREE.Vector3(ghostBall.x, ghostBall.y, ghostBall.z);
  scene.remove(ghostBall.mesh); scene.remove(ghostBall.halo); ghostBall = null;
  isDropping = true; clearTurnTimer();
  // Snap cube to nearest 90deg orientation, refresh world-space caches for collisions and aim.
  snapBoardRotation();
  refreshNodeWorldCache();
  updateAimPlane();
  // Re-project the captured aim onto the snapped top face, then snap to the nearest passage
  // column. The ball is then spawned EXACTLY centered above that column so it always falls
  // through the chosen passage rather than landing on top of a wall.
  const aimLocal = aimWorld.clone(); boardGroup.worldToLocal(aimLocal);
  const faceIdx = localUpAxis();
  const col = snapAimToColumn(aimLocal, faceIdx);
  const wp = topFaceWorldPos(col.latA, col.latB, col.faceIdx);
  const spawnW = wp.clone(); boardGroup.localToWorld(spawnW);
  // Predict the landing cell at release. Stored on physBall so onBallSettled can snap straight
  // down into the chosen column instead of searching for whatever cell ended up nearest after
  // the ball bounced through the saddle. If the column is somehow already full (shouldn't
  // happen given the column UI), fall back to the post-hoc nearest-cell search at settle time.
  const predicted = predictLanding(col.latA, col.latB, col.faceIdx);
  spawnPhysBall(spawnW.x, _aimYWorld, spawnW.z, p, predicted, col);
  Audio4D.onRelease();
  if (camFollow) { camLookT.set(spawnW.x, 3, spawnW.z); camPosT.set(spawnW.x * 0.5 + 6, _aimYWorld + 4, spawnW.z * 0.5 + 12); }
}
const MAX_PARTS = 160, partPos = new Float32Array(MAX_PARTS * 3), partGeo = new THREE.BufferGeometry();
partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
const partMat = new THREE.PointsMaterial({ size: 0.2, color: 0xffffff, transparent: true, opacity: 0.88, depthWrite: false, sizeAttenuation: true });
scene.add(new THREE.Points(partGeo, partMat));
const partPool = Array.from({ length: MAX_PARTS }, (_, i) => ({ i, active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1 }));
function emitParticles(pos, count, color) { partMat.color.setHex(color); let em = 0; for (const p of partPool) { if (!p.active && em < count) { p.active = true; p.x = pos.x; p.y = pos.y; p.z = pos.z; const spd = 2 + TRNG.f() * 5; const th = TRNG.f() * Math.PI * 2, ph = TRNG.f() * Math.PI; p.vx = Math.sin(ph) * Math.cos(th) * spd; p.vy = Math.sin(ph) * Math.sin(th) * spd + 1.5; p.vz = Math.cos(ph) * spd; p.life = 0; p.maxLife = 0.6 + TRNG.f() * 0.5; em++; } } }
function updateParticles(dt) { let any = false; for (const p of partPool) { if (!p.active) { partPos[p.i * 3 + 1] = -9999; continue; } p.life += dt; p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; partPos[p.i * 3] = p.x; partPos[p.i * 3 + 1] = p.y; partPos[p.i * 3 + 2] = p.z; if (p.life >= p.maxLife) { p.active = false; partPos[p.i * 3 + 1] = -9999; } else any = true; } if (any) partGeo.attributes.position.needsUpdate = true; }
const CAM_PRESETS = {
  A: { pos: new THREE.Vector3(8.5, 9, 8.5), target: new THREE.Vector3(0, 2.5, 0) },
  B: { pos: new THREE.Vector3(22, 9, 4), target: new THREE.Vector3(0, 2.5, 0) }
};
let camFollow = true;
const _camAOff = new THREE.Vector3().subVectors(CAM_PRESETS.A.pos, CAM_PRESETS.A.target);
let camRadius = _camAOff.length();
let camTheta = Math.atan2(_camAOff.z, _camAOff.x);
let camPhi = Math.acos(Math.max(-1, Math.min(1, _camAOff.y / Math.max(camRadius, 1e-6))));
let camTarget = CAM_PRESETS.A.target.clone();
let camPos = CAM_PRESETS.A.pos.clone(), camPosT = CAM_PRESETS.A.pos.clone();
let camLookT = CAM_PRESETS.A.target.clone(), camLookC = CAM_PRESETS.A.target.clone();
let cDrag = false, cLX = 0, cLY = 0, cDownX = 0, cDownY = 0, cMoved = 0, cBtn = 0;
const ORBIT_SENS = 0.0045;
const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
function setCam(p) { document.getElementById('btn-cama').classList.toggle('on', p === 'A'); document.getElementById('btn-camb').classList.toggle('on', p === 'B'); document.getElementById('btn-follow').classList.remove('on'); camFollow = false; camPosT.copy(CAM_PRESETS[p].pos); camLookT.copy(CAM_PRESETS[p].target); }
function toggleFollow() { camFollow = !camFollow; document.getElementById('btn-follow').classList.toggle('on', camFollow); if (camFollow) { document.getElementById('btn-cama').classList.remove('on'); document.getElementById('btn-camb').classList.remove('on'); } }
function resetCam() { setCam('A'); }
// Right-button drag (or any drag past 6px) ROTATES THE CUBE about world axes. Left-click without
// drag drops the ball. Rotation is locked while a ball is in flight (isDropping) so physics stay
// deterministic; the cube also snaps to the nearest 90deg orientation at release time.
const ROT_SENS = 0.0065;
const _rotQX = new THREE.Quaternion(), _rotQY = new THREE.Quaternion();
const _worldX = new THREE.Vector3(1, 0, 0), _worldY = new THREE.Vector3(0, 1, 0);
function rotateBoard(dx, dy) {
  if (isDropping) return;
  _rotQY.setFromAxisAngle(_worldY, dx * ROT_SENS);
  _rotQX.setFromAxisAngle(_worldX, dy * ROT_SENS);
  boardGroup.quaternion.premultiply(_rotQY).premultiply(_rotQX).normalize();
}
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => { if (e.target !== canvas) return; cDrag = true; cLX = e.clientX; cLY = e.clientY; cDownX = e.clientX; cDownY = e.clientY; cMoved = 0; cBtn = e.button; });
canvas.addEventListener('pointerdown', e => {
  if (e.target !== canvas) return;
  lastMouseX = e.clientX; lastMouseY = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
});
window.addEventListener('mouseup', e => { if (cDrag && cBtn === 0 && cMoved < 6) releaseBall(); cDrag = false; });
canvas.addEventListener('pointerup', e => {
  if (cDrag && cBtn === 0 && cMoved < 6) releaseBall();
  cDrag = false;
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) { }
});
window.addEventListener('mousemove', e => {
  parallax.tx = (e.clientX / window.innerWidth - .5) * 2;
  parallax.ty = (e.clientY / window.innerHeight - .5) * 2;
  lastMouseX = e.clientX; lastMouseY = e.clientY;
  if (!cDrag) return;
  const ddx = e.clientX - cLX, ddy = e.clientY - cLY;
  cMoved += Math.hypot(ddx, ddy);
  if (cBtn !== 2 && cMoved < 6) { cLX = e.clientX; cLY = e.clientY; return; }
  rotateBoard(ddx, ddy);
  cLX = e.clientX; cLY = e.clientY;
});
window.addEventListener('pointermove', e => {
  lastMouseX = e.clientX; lastMouseY = e.clientY;
  syncGhostToCursor();
});
// Mouse wheel pans the camera target front/back along the view direction (XZ plane).
const _wheelFwd = new THREE.Vector3();
canvas.addEventListener('wheel', e => {
  _wheelFwd.subVectors(camTarget, camPos); _wheelFwd.y = 0;
  if (_wheelFwd.lengthSq() < 1e-6) _wheelFwd.set(0, 0, -1); else _wheelFwd.normalize();
  const step = -e.deltaY * 0.02;
  camTarget.addScaledVector(_wheelFwd, step);
  const LIM = CELL * G;
  camTarget.x = Math.max(-LIM, Math.min(LIM, camTarget.x));
  camTarget.z = Math.max(-LIM, Math.min(LIM, camTarget.z));
  camPosT.set(camTarget.x + camRadius * Math.sin(camPhi) * Math.sin(camTheta), camTarget.y + camRadius * Math.cos(camPhi), camTarget.z + camRadius * Math.sin(camPhi) * Math.cos(camTheta));
  camLookT.copy(camTarget);
  camFollow = false; document.getElementById('btn-follow').classList.remove('on');
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchstart', e => { cDrag = true; cLX = e.touches[0].clientX; cLY = e.touches[0].clientY; cDownX = cLX; cDownY = cLY; cMoved = 0; cBtn = 0; moveGhostFromClient(cLX, cLY); }, { passive: true });
canvas.addEventListener('touchend', () => { if (cDrag && cMoved < 8) releaseBall(); cDrag = false; });
canvas.addEventListener('touchmove', e => { if (!cDrag) return; const tx = e.touches[0].clientX, ty = e.touches[0].clientY; const ddx = tx - cLX, ddy = ty - cLY; cMoved += Math.hypot(ddx, ddy); lastMouseX = tx; lastMouseY = ty; if (cMoved < 8) { cLX = tx; cLY = ty; return; } rotateBoard(ddx, ddy); cLX = tx; cLY = ty; }, { passive: true });
// Keyboard / gamepad: space, enter, or any gamepad button releases the ball.
window.addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); releaseBall(); } });
let _gpPrev = false;
function pollGamepad() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  let pressed = false;
  for (const gp of gps) { if (!gp) continue; for (const b of gp.buttons) if (b && b.pressed) { pressed = true; break; } if (pressed) break; }
  if (pressed && !_gpPrev) releaseBall();
  _gpPrev = pressed;
}
setInterval(pollGamepad, 60);
function aiSim(fn) { const snap = BM.snapshot(); const r = fn(); BM.restore(snap); return r; }
// All players except the current one are treated as adversaries -- we block the strongest threat
// among them rather than just the single "other" player from the original 2-player code.
function opponentsOf(p) { const out = []; for (let i = 1; i <= numPlayers; i++) if (i !== p) out.push(i); return out; }
function aiPickColumn() {
  const cols = BM.openColumns(); if (!cols.length) return null;
  if (aiDiff === 'easy' || TRNG.f() < 0.18) return TRNG.pick(cols);
  const opps = opponentsOf(currentPlayer);
  // Win if we can.
  for (const [gx, gz] of TRNG.shuffle(cols)) {
    if (aiSim(() => { const gy = BM.lowestFree(gx, gz); BM.setCell(gx, gy, gz, currentPlayer); return BM.checkWin(currentPlayer, currentScenario); })) return [gx, gz];
  }
  // Block any opponent's immediate win.
  for (const [gx, gz] of TRNG.shuffle(cols)) {
    for (const opp of opps) {
      if (aiSim(() => { const gy = BM.lowestFree(gx, gz); BM.setCell(gx, gy, gz, opp); return BM.checkWin(opp, currentScenario); })) return [gx, gz];
    }
  }
  // Half-cube centre nudges the bias to the middle of whatever G we're playing.
  const mid = (G - 1) * 0.5;
  if (aiDiff === 'hard') {
    const scored = cols.map(([gx, gz]) => {
      const myT = aiSim(() => { const gy = BM.lowestFree(gx, gz); BM.setCell(gx, gy, gz, currentPlayer); return BM.countThreats(currentPlayer); });
      const opT = opps.reduce((s, opp) => s + aiSim(() => { const gy = BM.lowestFree(gx, gz); BM.setCell(gx, gy, gz, opp); return BM.countThreats(opp); }), 0);
      return { gx, gz, score: myT * 2 + opT * 1.5 + (1.5 - Math.abs(gx - mid) * 0.2 - Math.abs(gz - mid) * 0.2) + TRNG.f() * 0.4 };
    });
    scored.sort((a, b) => b.score - a.score); return [scored[0].gx, scored[0].gz];
  }
  const scored = cols.map(([gx, gz]) => ({ gx, gz, score: G - Math.abs(gx - mid) - Math.abs(gz - mid) + TRNG.f() }));
  scored.sort((a, b) => b.score - a.score); return [scored[0].gx, scored[0].gz];
}
// Per-player jewel colours used by the turn indicator. Mirrors BPALETTE order.
const PLAYER_HEX = ['#ff2244', '#22aa44', '#9966ff', '#ddaa33'];
// Track the last player we announced so updateHUD can fire the turn banner only on actual turn
// transitions, not on every HUD refresh (move-count tick, threat recount, etc.).
let _lastAnnouncedPlayer = 0, _turnAnnounceHide = null;
function announceTurn(p) {
  const el = document.getElementById('turn-announce'); if (!el) return;
  const nm = document.getElementById('name-p' + p);
  const colour = PLAYER_HEX[p - 1] || '#fff';
  el.textContent = `${(nm ? nm.textContent : 'PLAYER ' + p)}'S TURN`;
  el.style.color = colour;
  el.style.boxShadow = `0 0 28px ${colour}55`;
  el.classList.add('show');
  if (_turnAnnounceHide) clearTimeout(_turnAnnounceHide);
  _turnAnnounceHide = setTimeout(() => el.classList.remove('show'), 1400);
}
function avatarFor(player, slot) {
  if (player && typeof player.avatar === 'string' && player.avatar.trim()) return player.avatar.trim();
  if (player && typeof player.avatar_emoji === 'string' && player.avatar_emoji.trim()) return player.avatar_emoji.trim();
  if (player && typeof player.avatar_id === 'number') return String.fromCodePoint(0x1F600 + (Math.abs(player.avatar_id) % 80));
  return String(slot);
}
function setPlayerIdentity(slot, name, avatar) {
  const safeName = (name || `PLAYER ${slot}`).toUpperCase();
  const safeAvatar = (avatar || String(slot)).trim().slice(0, 2);
  PLAYER_META[slot - 1] = { name: safeName, avatar: safeAvatar };
  const nameEl = document.getElementById(`name-p${slot}`);
  if (nameEl) nameEl.textContent = safeName;
  const mobName = document.getElementById(`mob-name-p${slot}`);
  if (mobName) mobName.textContent = safeName;
  const mobAvatar = document.getElementById(`mob-avatar-p${slot}`);
  if (mobAvatar) mobAvatar.textContent = safeAvatar;
}
function initMobilePlayerStrip() {
  const strip = document.getElementById('mobile-player-strip');
  const toggle = document.getElementById('mobile-strip-toggle');
  if (!strip || !toggle || toggle.dataset.bound === '1') return;
  toggle.dataset.bound = '1';
  toggle.addEventListener('click', () => {
    const collapsed = strip.classList.toggle('collapsed');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    document.body.classList.toggle('strip-collapsed', collapsed);
  });
  document.body.classList.add('strip-collapsed');
}
function renderMobilePlayers() {
  for (let p = 1; p <= 4; p++) {
    const chip = document.getElementById(`mob-chip-p${p}`);
    if (!chip) continue;
    chip.style.display = (p <= numPlayers) ? '' : 'none';
    const score = TS.score(p);
    const scoreEl = document.getElementById(`mob-score-p${p}`);
    if (scoreEl) scoreEl.textContent = `${Math.min(score, WIN_TARGET)}/${WIN_TARGET}`;
    const winsEl = document.getElementById(`mob-wins-p${p}`);
    if (winsEl) {
      winsEl.innerHTML = Array.from({ length: WIN_TARGET }, (_, i) =>
        `<span class="mob-pip${i < score ? ' filled' : ''}"></span>`
      ).join('');
    }
  }
}
function updateHUD() {
  const name = document.getElementById('name-p' + currentPlayer);
  const ti = document.getElementById('turn-indicator');
  if (name && ti) { ti.textContent = `\u25CF ${name.textContent}`; ti.style.color = PLAYER_HEX[currentPlayer - 1] || '#fff'; }
  for (let p = 1; p <= 4; p++) {
    const isMe = p === currentPlayer, active = p <= numPlayers;
    const panel = document.getElementById('panel-p' + p); if (panel) panel.classList.toggle('active', isMe && active);
    const badge = document.getElementById('badge-p' + p); if (badge) badge.classList.toggle('pulse', isMe && active);
    const mobChip = document.getElementById('mob-chip-p' + p); if (mobChip) mobChip.classList.toggle('active-chip', isMe && active);
    const mobBadge = document.getElementById('mob-avatar-p' + p); if (mobBadge) mobBadge.classList.toggle('pulse', isMe && active);
    const nameEl = document.getElementById('name-p' + p);
    if (nameEl) nameEl.style.color = (isMe && active) ? PLAYER_HEX[p - 1] : '#e0eaff';
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('moves-p' + p, TS.count(p));
    set('streak-p' + p, TS.streak(p));
    set('combo-p' + p, BM.countThreats(p));
  }
  // Fire the turn banner only when control actually moves to a different player and the game
  // is still in progress -- skipping the win/draw moment so the result card isn't stepped on.
  if (!isGameOver && currentPlayer !== _lastAnnouncedPlayer) {
    _lastAnnouncedPlayer = currentPlayer;
    announceTurn(currentPlayer);
  }
}
function renderLogs() { for (let p = 1; p <= numPlayers; p++) { const el = document.getElementById(`log-p${p}`); if (el) el.innerHTML = TS.log(p).map(m => `<div class="log-entry">${m}</div>`).join(''); } }
function renderScores() {
  for (let p = 1; p <= 4; p++) {
    const el = document.getElementById(`score-p${p}`);
    if (el) el.textContent = TS.score(p);
  }
  renderMobilePlayers();
}
function showResult(title, sub, tally, color) { document.getElementById('result-title').textContent = title; document.getElementById('result-title').style.color = color; document.getElementById('result-line').textContent = sub; document.getElementById('result-tally').textContent = tally; document.getElementById('result-overlay').classList.add('show'); }
// (legacy buildColUI / refreshColBtns now defined as no-ops below)
function startTurnTimer() { if (!currentScenario.timer) return; clearTurnTimer(); timerLeft = currentScenario.timer; const el = document.getElementById('turn-timer'); el.style.color = 'var(--cyan)'; el.textContent = timerLeft + 's'; turnTimer = setInterval(() => { timerLeft--; el.textContent = timerLeft + 's'; if (timerLeft <= 3) el.style.color = '#ff4444'; if (timerLeft <= 0) { clearTurnTimer(); const avail = BM.openColumns(); if (avail.length) { const [gx, gz] = TRNG.pick(avail); dropBall(gx, gz); } } }, 1000); }
function buildColUI() { /* legacy column UI replaced by cursor ball */ }
function refreshColBtns() { /* no-op */ }
function clearTurnTimer() { if (turnTimer) { clearInterval(turnTimer); turnTimer = null; } document.getElementById('turn-timer').textContent = ''; document.getElementById('turn-timer').style.color = 'var(--cyan)'; }
// Convert a (latA, latB) column index pair on the currently-up face into a world XYZ above it.
// faceIdx encodes which local axis is up: 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z. The two in-plane lattice
// axes are the remaining two local axes; latA/latB are 0..G-1 indices on those.
const _topLocal = new THREE.Vector3();
function topFaceWorldPos(latA, latB, faceIdx) {
  const half = (G - 1) * 0.5 * CELL;
  const aPos = (latA - (G - 1) * 0.5) * CELL;
  const bPos = (latB - (G - 1) * 0.5) * CELL;
  const sign = (faceIdx % 2 === 0) ? +1 : -1;
  const ax = (faceIdx >> 1);
  if (ax === 0) _topLocal.set(sign * half, aPos, bPos);
  else if (ax === 1) _topLocal.set(aPos, sign * half, bPos);
  else _topLocal.set(aPos, bPos, sign * half);
  boardGroup.localToWorld(_topLocal);
  return _topLocal;
}
// Legacy entry used by AI and turn-timer fallback. Snaps the cube, then drops a ball above the
// (gx, gz)-th column on whichever face is currently up.
function dropBall(gx, gz) {
  if (isDropping || isGameOver) return;
  if (!KGSync.canActLocally()) return;
  clearTurnTimer(); isDropping = true;
  if (ghostBall) { scene.remove(ghostBall.mesh); scene.remove(ghostBall.halo); ghostBall = null; }
  snapBoardRotation();
  refreshNodeWorldCache();
  updateAimPlane();
  // topFaceWorldPos returns a LOCAL position; convert to world through the snapped boardGroup
  // matrix so the ball spawns above the correct world-space column for any cube orientation.
  const wp = topFaceWorldPos(gx, gz, localUpAxis()).clone();
  boardGroup.localToWorld(wp);
  spawnPhysBall(wp.x, _aimYWorld, wp.z, currentPlayer);
  Audio4D.onRelease();
  if (camFollow) { camLookT.set(wp.x, 3, wp.z); camPosT.set(wp.x * 0.5 + 6, _aimYWorld + 4, wp.z * 0.5 + 12); }
}
function physStep(dt) {
  if (!physBall || physBall.settled) return;
  // 16 substeps so each integration step moves the ball less than one ball-diameter even
  // at terminal velocity (roughly 30 m/s). This prevents tunneling through the Diamond
  // membrane in narrow passage segments where the surface curves rapidly.
  const STEPS = 16, hdt = dt / STEPS;
  for (let s = 0; s < STEPS; s++) { if (!physBall || physBall.settled) break; physSubstep(hdt); }
  if (!physBall) return;
  physBall.mesh.position.set(physBall.x, physBall.y, physBall.z);
  physBall.mesh.rotation.x += physBall.spinX * dt;
  physBall.mesh.rotation.y += physBall.spinY * dt;
  physBall.mesh.rotation.z += physBall.spinZ * dt;
  physBall.spinX *= 0.985; physBall.spinY *= 0.985; physBall.spinZ *= 0.985;
  physBall.halo.position.copy(physBall.mesh.position);
  boardGlow.intensity = Math.max(0, 2 - physBall.y * 0.2);
  if (camFollow) {
    camLookT.x += (physBall.x - camLookT.x) * 0.08;
    camLookT.y += (physBall.y - camLookT.y) * 0.08;
    camLookT.z += (physBall.z - camLookT.z) * 0.08;
    camPosT.y += (physBall.y + 8 - camPosT.y) * 0.05;
  }
}
// Safety scan: after every substep, fire 6 axis rays from the ball center outward by BALL_R.
// If any ray hits a GLB face within radius, push the ball back along that face's world normal
// and zero the velocity component into the wall. Catches grazing/tangential contact that the
// motion-path raycast in collideBallVsGlb misses (which is what lets balls slip through walls).
const _scanDirs = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0.7071, -0.7071, 0), new THREE.Vector3(-0.7071, -0.7071, 0),
  new THREE.Vector3(0, -0.7071, 0.7071), new THREE.Vector3(0, -0.7071, -0.7071)
];
const _scanOrigin = new THREE.Vector3();
function safetyScanGlb() {
  if (!glbColliders.length || !physBall) return;
  _scanOrigin.set(physBall.x, physBall.y, physBall.z);
  let contacts = 0;
  for (let i = 0; i < _scanDirs.length; i++) {
    const d = _scanDirs[i];
    glbRay.set(_scanOrigin, d);
    glbRay.near = 0;
    glbRay.far = BALL_R + 0.04;
    const hits = glbRay.intersectObjects(glbColliders, false);
    if (!hits.length) continue;
    const h = hits[0];
    if (!h.face) continue;
    const overlap = (BALL_R + 0.01) - h.distance;
    if (overlap <= 0) continue;
    contacts++;
    glbN.copy(h.face.normal);
    glbNMat.getNormalMatrix(h.object.matrixWorld);
    glbN.applyMatrix3(glbNMat).normalize();
    // Use the inverse of the scan ray as the push direction; this guarantees we move away
    // from the wall regardless of whether the face normal points toward or away from us.
    physBall.x -= d.x * overlap;
    physBall.y -= d.y * overlap;
    physBall.z -= d.z * overlap;
    // Also kill the velocity component into that wall so the ball stops penetrating.
    const vIn = physBall.vx * d.x + physBall.vy * d.y + physBall.vz * d.z;
    if (vIn > 0) {
      physBall.vx -= (1 + RESTIT) * vIn * d.x;
      physBall.vy -= (1 + RESTIT) * vIn * d.y;
      physBall.vz -= (1 + RESTIT) * vIn * d.z;
    }
  }
  // Bleed energy proportional to how pinched the ball is. With contacts on >=2 sides
  // (wedged in a saddle throat), apply heavy tangential damping so residual rattle
  // decays into a settle instead of perpetual oscillation.
  if (contacts >= 2) {
    const k = 0.78;
    physBall.vx *= k; physBall.vy *= k; physBall.vz *= k;
  }
}
function collideBallVsGlb(px, py, pz) {
  if (!glbColliders.length || !physBall) return false;
  glbDir.set(physBall.x - px, physBall.y - py, physBall.z - pz);
  const travel = glbDir.length();
  if (travel < 1e-6) return false;
  glbDir.multiplyScalar(1 / travel);
  glbRay.set(new THREE.Vector3(px, py, pz), glbDir);
  glbRay.near = 0;
  glbRay.far = travel + BALL_R * 1.25;
  const hits = glbRay.intersectObjects(glbColliders, false);
  if (!hits.length) return false;
  const h = hits[0];
  if (!h.face) return false;
  glbN.copy(h.face.normal);
  glbNMat.getNormalMatrix(h.object.matrixWorld);
  glbN.applyMatrix3(glbNMat).normalize();
  // Ensure normal opposes incoming motion.
  const vdotn = physBall.vx * glbN.x + physBall.vy * glbN.y + physBall.vz * glbN.z;
  if (vdotn > 0) glbN.multiplyScalar(-1);
  const push = BALL_R + 0.01;
  physBall.x = h.point.x + glbN.x * push;
  physBall.y = h.point.y + glbN.y * push;
  physBall.z = h.point.z + glbN.z * push;
  const vn = physBall.vx * glbN.x + physBall.vy * glbN.y + physBall.vz * glbN.z;
  if (vn < 0) {
    Audio4D.onTap(-vn);
    // Glassy bounce: slight rebound with strong tangential retention so ball follows passages.
    physBall.vx -= (1 + RESTIT) * vn * glbN.x;
    physBall.vy -= (1 + RESTIT) * vn * glbN.y;
    physBall.vz -= (1 + RESTIT) * vn * glbN.z;
    const vAfterN = physBall.vx * glbN.x + physBall.vy * glbN.y + physBall.vz * glbN.z;
    const vtnx = physBall.vx - vAfterN * glbN.x;
    const vtny = physBall.vy - vAfterN * glbN.y;
    const vtnz = physBall.vz - vAfterN * glbN.z;
    physBall.vx = glbN.x * vAfterN + vtnx * 0.94;
    physBall.vy = glbN.y * vAfterN + vtny * 0.94;
    physBall.vz = glbN.z * vAfterN + vtnz * 0.94;
    const tmag = Math.sqrt(vtnx * vtnx + vtny * vtny + vtnz * vtnz);
    physBall.spinX += (glbN.z * tmag - glbN.y * tmag * 0.3) * 0.08;
    physBall.spinY += (glbN.x * tmag) * 0.06;
    physBall.spinZ += (-glbN.x * tmag + glbN.y * tmag * 0.3) * 0.08;
  }
  return true;
}
function physSubstep(dt) {
  if (!physBall || physBall.settled) return;
  const px = physBall.x, py = physBall.y, pz = physBall.z;
  physBall.vy += GRAV * dt;
  physBall.x += physBall.vx * dt;
  physBall.y += physBall.vy * dt;
  physBall.z += physBall.vz * dt;
  physBall.vx *= BALL_AIR; physBall.vz *= BALL_AIR;
  collideBallVsGlb(px, py, pz);
  safetyScanGlb();
  gyroidGuide(dt, px, py, pz);
  // Lattice node sphere collision intentionally skipped (NODE_R = 0); the saddle membrane
  // provides all the meander, and nodePositions is only used for final cell-snap on settle.
  // Collide against already-placed balls so cells are sealed.
  for (let i = 0; i < placedBalls.length; i++) {
    const b = placedBalls[i].mesh.position;
    const dx = physBall.x - b.x, dy = physBall.y - b.y, dz = physBall.z - b.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    const minD = BALL_R * 2;
    if (d2 < minD * minD && d2 > 1e-8) {
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d;
      const overlap = minD - d;
      physBall.x += nx * overlap; physBall.y += ny * overlap; physBall.z += nz * overlap;
      const vn = physBall.vx * nx + physBall.vy * ny + physBall.vz * nz;
      if (vn < 0) {
        physBall.vx -= (1 + RESTIT) * vn * nx;
        physBall.vy -= (1 + RESTIT) * vn * ny;
        physBall.vz -= (1 + RESTIT) * vn * nz;
      }
    }
  }
  // Cube hard wall is enforced inside gyroidGuide() in local space (handles rotated cubes
  // correctly). The previous world-space AABB clamps were redundant and pinned the ball to
  // the wrong boundary when the cube was rotated, so they have been removed.
  const speed2 = physBall.vx * physBall.vx + physBall.vy * physBall.vy + physBall.vz * physBall.vz;
  // Slow-phase chamber-centre attractor. Once the ball is moving slowly enough that bouncing
  // is essentially over, apply a gentle pull toward the nearest free chamber centre at-or-below
  // the current Y. The pull strength ramps up as speed approaches zero, so fast bounces are
  // unaffected and slow drift is steered into a void centre. By the time the ball satisfies
  // the SETTLE_V/timer condition it is already at (or very near) the chamber centre, making
  // the post-settle snap visually a no-op instead of a teleport/lerp.
  const ATTRACT_GATE = SETTLE_V * 3;            // start nudging once below ~3x settle speed
  const ATTRACT_MAX = 26;                       // m/s^2 at zero speed; gentle compared to GRAV (-62)
  if (speed2 < ATTRACT_GATE * ATTRACT_GATE) {
    const tgt = settledSegmentTargetNode(physBall.x, physBall.y, physBall.z);
    if (tgt) {
      const tx = tgt.p.x;
      const ty = tgt.p.y;
      const tz = tgt.p.z;
      const dx = tx - physBall.x, dy = ty - physBall.y, dz = tz - physBall.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > 1e-3) {
        const slow = 1 - Math.sqrt(speed2) / ATTRACT_GATE;   // 0..1, peak at standstill
        const a = ATTRACT_MAX * slow;
        physBall.vx += (dx / d) * a * dt;
        physBall.vy += (dy / d) * a * dt;
        physBall.vz += (dz / d) * a * dt;
      }
    }
  }
  if (speed2 < SETTLE_V * SETTLE_V) {
    physBall.settleTimer += dt;
    if (physBall.settleTimer > 0.4) { physBall.settled = true; onBallSettled(); return; }
  } else { physBall.settleTimer = 0; }
  // Stuck-detect: a ball wedged between two saddle walls in a tight throat will keep
  // bouncing with non-zero speed forever. If world-Y stops decreasing for a sustained
  // window (ball isn't making progress to the bottom), force a settle so it snaps to
  // the nearest empty cell via nearestFreeCell.
  if (physBall.y < physBall.lowY - 0.05) { physBall.lowY = physBall.y; physBall.stuckTime = 0; }
  else { physBall.stuckTime += dt; }
  if (physBall.stuckTime > 0.9) { physBall.settled = true; onBallSettled(); }
}
// Find the nearest unoccupied lattice node. `yLimit` (optional) excludes nodes whose world-Y
// is above the limit so callers can enforce "no upward motion against gravity". Returns the
// nodePositions entry (with cached world-space `.p`), or null. Shared by the settle-snap and
// the slow-phase chamber-centre attractor so both agree on the destination.
function nearestFreeNode(x, y, z, yLimit) {
  let best = null, bestD = Infinity;
  const cap = yLimit != null ? yLimit : Infinity;
  for (let i = 0; i < nodePositions.length; i++) {
    const n = nodePositions[i];
    if (BM.getCell(n.gx, n.gy, n.gz)) continue;
    if (n.p.y > cap) continue;
    const dx = x - n.p.x, dy = y - n.p.y, dz = z - n.p.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}
function nearestFreeCell(x, y, z, yLimit) {
  const n = nearestFreeNode(x, y, z, yLimit);
  return n ? [n.gx, n.gy, n.gz] : null;
}
function predictedWorldTarget(predictedCell) {
  if (!predictedCell) return null;
  const [gx, gy, gz] = predictedCell;
  if (BM.getCell(gx, gy, gz)) return null;
  const wp = nodePos(gx, gy, gz);
  boardGroup.localToWorld(wp);
  return wp;
}
function describeWin(cells, sc) { return sc.special === 'cube' ? 'PERFECT CUBE COMPLETED!' : (BM.dirLabel(cells) || '').toUpperCase(); }
function nameOf(p) { return document.getElementById(`name-p${p}`).textContent; }
function tallyStr() { const out = []; for (let p = 1; p <= numPlayers; p++) out.push(`P${p}: ${TS.score(p)}`); return out.join('  |  '); }
// Snap-animation state. While non-null, the falling physBall mesh is being lerped from where
// the ball physically rested to the chamber-centre world position. animate() advances `t` and
// fires `onDone` (which runs finishPlacement) when the lerp completes. We keep `physBall` alive
// during the animation so the existing mesh is what the player sees moving -- no flicker.
let snapAnim = null;
const _snapTmp = new THREE.Vector3();
function onBallSettled() {
  const p = physBall.p;
  // Deterministic chamber attach: segment the cube into chamber cells and map the settle point
  // directly to that segment. If occupied, only face-adjacent chambers are considered.
  const cell = resolveSettledSegmentCell(physBall.x, physBall.y, physBall.z);
  Audio4D.onSettle();
  boardGlow.intensity = 0;
  if (!cell) {
    scene.remove(physBall.mesh); scene.remove(physBall.halo); physBall = null;
    isDropping = false; if (!isGameOver) maybeSpawnTurnBall(); return;
  }
  // Compute the chamber-centre in world space (boardGroup may be at a 90deg rotation snap).
  const [gx, gy, gz] = cell;
  const toWorld = nodePos(gx, gy, gz); boardGroup.localToWorld(toWorld);
  snapAnim = {
    mesh: physBall.mesh, halo: physBall.halo,
    from: new THREE.Vector3(physBall.x, physBall.y, physBall.z),
    to: toWorld,
    t: 0, dur: 0.32,                    // ~320ms feels continuous, not teleport-y
    onDone: () => finishPlacement(p, cell)
  };
}
// Advance the active snap animation. Smoothstep easing means the ball decelerates into its
// chamber rather than snapping linearly. Called from animate() once per frame.
function stepSnapAnim(dt) {
  if (!snapAnim) return;
  snapAnim.t += dt;
  const a = Math.min(snapAnim.t / snapAnim.dur, 1);
  const e = a * a * (3 - 2 * a);
  _snapTmp.lerpVectors(snapAnim.from, snapAnim.to, e);
  snapAnim.mesh.position.copy(_snapTmp);
  snapAnim.halo.position.copy(_snapTmp);
  if (a >= 1) { const cb = snapAnim.onDone; snapAnim = null; cb(); }
}
function finishPlacement(p, cell) {
  const [gx, gy, gz] = cell;
  // Now that the visual has arrived at the chamber centre, swap the falling-ball mesh out for
  // the permanent placedBall (with its emissive shells). Keeping the previous mesh until this
  // point avoids a one-frame gap where the ball would disappear before the glowing version pops in.
  if (physBall) { scene.remove(physBall.mesh); scene.remove(physBall.halo); physBall = null; }
  BM.setCell(gx, gy, gz, p);
  KGSync.broadcast(gx, gy, gz, p);
  addPlacedBall(gx, gy, gz, p);
  Audio4D.onPlace(p);
  emitParticles(nodePos(gx, gy, gz), 28, BCOLS[p].glow);
  boardGlow.color.setHex(BCOLS[p].glow); boardGlow.intensity = 4;
  setTimeout(() => { boardGlow.intensity = 0; }, 350);
  const winCells = BM.checkWin(p, currentScenario);
  TS.record({ p, gx, gy, gz, scenarioId: currentScenario.id, isWin: !!winCells, winCells });
  renderLogs();
  if (winCells) {
    isGameOver = true; renderScores(); showWinGlows(winCells);
    Audio4D.onWin(p); Audio4D.stopMusic();
    emitParticles(nodePos(gx, gy, gz), 60, 0xffee00);
    const hex = '#' + BCOLS[p].glow.toString(16).padStart(6, '0');
    setTimeout(() => showResult(`${nameOf(p)} WINS`, describeWin(winCells, currentScenario), tallyStr(), hex), 700);
    if (camFollow) {
      const cx = winCells.reduce((a, [x]) => a + x / winCells.length, 0),
        cy = winCells.reduce((a, [, y]) => a + y / winCells.length, 0),
        cz = winCells.reduce((a, [, , z]) => a + z / winCells.length, 0);
      const wp = nodePos(cx, cy, cz); camLookT.set(wp.x, wp.y, wp.z); camPosT.set(wp.x + 8, wp.y + 8, wp.z + 14);
    }
    isDropping = false; refreshColBtns(); updateHUD(); return;
  }
  if (BM.boardFull()) {
    isGameOver = true;
    Audio4D.stopMusic();
    if (currentScenario.special === 'territory') {
      // Territory mode: highest line count wins. Ties (multiple players sharing the max) are draws.
      const lines = []; for (let p = 1; p <= numPlayers; p++) lines.push({ p, n: BM.countAllLines(p) });
      const max = lines.reduce((m, x) => Math.max(m, x.n), 0);
      const top = lines.filter(x => x.n === max);
      const winner = top.length === 1 ? top[0].p : 0;
      const color = winner ? PLAYER_HEX[winner - 1] : '#ffee00';
      if (winner) { TS.awardWin(winner); renderScores(); }
      const wn = winner === 0 ? 'DRAW' : `${nameOf(winner)} WINS`;
      const breakdown = lines.map(x => `P${x.p}=${x.n}`).join('  ');
      setTimeout(() => showResult(wn, `Lines: ${breakdown}`, 'TERRITORY WAR COMPLETE', color), 700);
    } else {
      setTimeout(() => showResult('DRAW', 'The lattice is full', tallyStr(), '#ffee00'), 500);
    }
    isDropping = false; refreshColBtns(); updateHUD(); return;
  }
  // Cycle through 1..numPlayers (1-player mode just keeps re-spawning P1 -- effectively a sandbox).
  currentPlayer = numPlayers <= 1 ? P1 : ((currentPlayer % numPlayers) + 1);
  isDropping = false;
  updateHUD();
  if (camFollow) setTimeout(() => { camPosT.copy(CAM_PRESETS.A.pos); camLookT.copy(CAM_PRESETS.A.target); }, 600);
  maybeSpawnTurnBall();
}
// Hand control to the next actor: AI auto-drops, a human gets a cursor ball.
// In multiplayer-vs-AI mode the AI controls every slot from P2..numPlayers; humans only control P1.
function isAiTurn() { return vsMode === 'ai' && currentPlayer !== P1; }
function maybeSpawnTurnBall() {
  if (isGameOver) return;
  if (isAiTurn()) {
    if (KGSync.online && !KGSync.isHost) return; // host runs the AI and broadcasts the result
    setTimeout(() => {
      if (isGameOver || isDropping) return;
      let col = null;
      try { col = aiPickColumn(); } catch (err) { console.warn('aiPickColumn threw', err); }
      if (!col) {
        const free = nodePositions.filter(n => !BM.getCell(n.gx, n.gy, n.gz));
        if (free.length) col = [free[(Math.random() * free.length) | 0].gx, free[(Math.random() * free.length) | 0].gz];
      }
      if (col) dropBall(col[0], col[1]);
      else { console.warn('AI: no moves available'); }
    }, 500 + TRNG.f() * 400);
  } else {
    if (KGSync.online && KGSync.mySlot && KGSync.mySlot !== currentPlayer) return; // wait for remote actor
    spawnGhostBall(currentPlayer);
    startTurnTimer();
  }
}
function buildScenarioSelect() {
  const grid = document.getElementById('ss-grid');
  if (!grid) return;
  grid.innerHTML = '';
  SCENARIOS.forEach((sc, i) => {
    const card = document.createElement('div');
    card.className = 'ss-card' + (i === 0 ? ' sel' : '');
    card.innerHTML = `<div class="ss-icon">${sc.icon}</div><div class="ss-name">${sc.name}</div><div class="ss-desc">${sc.desc}</div>`;
    card.onclick = () => {
      document.querySelectorAll('.ss-card').forEach(c => c.classList.remove('sel'));
      card.classList.add('sel');
      selectedScenario = sc;
    };
    grid.appendChild(card);
  });
}
function setVsMode(mode) {
  vsMode = mode;
  const pvpBtn = document.getElementById('pvp-btn');
  const aiBtn = document.getElementById('ai-btn');
  const diffRow = document.getElementById('diff-row');
  if (pvpBtn) pvpBtn.classList.toggle('sel', mode === 'pvp');
  if (aiBtn) aiBtn.classList.toggle('sel', mode === 'ai');
  if (diffRow) diffRow.classList.toggle('show', mode === 'ai');
  document.getElementById('name-p2').textContent = mode === 'ai' ? 'AI OPPONENT' : 'PLAYER 2';
}
function setDiff(d) {
  aiDiff = d;
  document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('sel'));
  const active = document.getElementById(d === 'medium' ? 'diff-med' : `diff-${d}`);
  if (active) active.classList.add('sel');
}
// Pick the player count for the next game. Updates the scenario-select UI and toggles which
// player panels are visible. Actual grid resize happens in startGame() via rebuildWorld().
function setNumPlayers(n) {
  numPlayers = Math.max(1, Math.min(4, n | 0));
  for (let i = 1; i <= 4; i++) {
    const btn = document.getElementById('np-' + i);
    if (btn) btn.classList.toggle('sel', i === numPlayers);
  }
  for (let i = 1; i <= 4; i++) {
    const panel = document.getElementById('panel-p' + i);
    if (panel) panel.style.display = (i <= numPlayers) ? '' : 'none';
  }
  renderMobilePlayers();
}
function showScenarioSelect() {
  document.getElementById('result-overlay').classList.remove('show');
  openMultiplayerPanel();
}
// Open the unified KGMultiplayerPanel; it gates on profile, gathers humans + AI,
// then hands the resolved session here so the existing startGame() runs unchanged.
function openMultiplayerPanel() {
  const overlay = document.getElementById('mp-panel-overlay');
  const host = document.getElementById('mp-panel-host');
  let inviteCode = null;
  try {
    const u = new URL(location.href);
    inviteCode = (u.searchParams.get('code') || '').trim().toUpperCase() || null;
  } catch { /* ignore */ }
  if (!overlay || !host || typeof KGMultiplayerPanel === 'undefined') {
    console.warn('[4D] multiplayer panel unavailable, falling back to local startGame()');
    return startGame();
  }
  overlay.style.display = 'flex';
  KGGameSetup.mount(host, {
    gameId: '4dtictactoe',
    gameName: '4D Connect',
    supportsSameScreen: true,
    minPlayers: 2,
    maxPlayers: 4,
    inviteCode,
    onLaunch: ({ session, players, playerCount, launchMode }) => {
      PLAYERS = Array.isArray(players) ? players : [];
      numPlayers = Math.max(1, Math.min(4, playerCount));
      vsMode = launchMode === 'ai' ? 'ai' : 'pvp';
      for (let i = 0; i < numPlayers; i++) {
        const pl = PLAYERS[i] || null;
        setPlayerIdentity(i + 1, (pl && pl.username) || ('PLAYER ' + (i + 1)), avatarFor(pl, i + 1));
      }
      KGSync.init(session);
      try { KGMultiplayerPanel.unmount(); } catch { /* ignore */ }
      overlay.style.display = 'none';
      startGame();
    },
  });
}
// Ensure inline HTML handlers always resolve this symbol on window.
window.openMultiplayerPanel = openMultiplayerPanel;

function startGame() {
  currentScenario = selectedScenario;
  document.getElementById('scenario-tag').textContent = currentScenario.name;
  document.querySelectorAll('.panel-mode').forEach(e => e.textContent = currentScenario.name);
  // Resize the world to match player count BEFORE resetGame clears state, so the new
  // nodePositions / placement geometry is in place when the first ghost ball spawns.
  rebuildWorld(gridForPlayers(numPlayers));
  setNumPlayers(numPlayers);   // ensure panel visibility reflects current count
  resetGame(true);
  Audio4D.startMusic();
}
function rematch() { document.getElementById('result-overlay').classList.remove('show'); resetGame(false); Audio4D.startMusic(); }
function resetGame(resetScores) { BM.reset(); TS.reset({ resetScores }); currentPlayer = P1; isGameOver = false; isDropping = false; clearTurnTimer(); snapAnim = null; _lastAnnouncedPlayer = 0; placedBalls.forEach(b => { boardGroup.remove(b.mesh); boardGroup.remove(b.halo); if (b.corona) boardGroup.remove(b.corona); boardGroup.remove(b.ring); }); placedBalls.length = 0; clearWinGlows(); if (physBall) { scene.remove(physBall.mesh); scene.remove(physBall.halo); physBall = null; } if (ghostBall) { scene.remove(ghostBall.mesh); scene.remove(ghostBall.halo); ghostBall = null; } boardGroup.quaternion.identity(); boardGlow.intensity = 0; renderScores(); renderLogs(); updateHUD(); if (camFollow) { camPosT.copy(CAM_PRESETS.A.pos); camLookT.copy(CAM_PRESETS.A.target); } boardGlow.color.setHex(0x4422ff); boardGlow.intensity = 5; setTimeout(() => { boardGlow.intensity = 0; }, 500); if (vsMode === 'ai') setPlayerIdentity(2, 'AI OPPONENT', 'AI'); maybeSpawnTurnBall(); }
let lastT = 0;
function animate(t) { requestAnimationFrame(animate); const dt = Math.min((t - lastT) / 1000, 0.05); lastT = t; const uTime = t * 0.001; parallax.x += (parallax.tx - parallax.x) * 0.04; parallax.y += (parallax.ty - parallax.y) * 0.04; starLayers.forEach(layer => { layer.material.uniforms.uTime.value = uTime; layer.position.x = parallax.x * layer.userData.parallax; layer.position.y = -parallax.y * layer.userData.parallax * 0.5; }); haloMeshes.forEach((m, i) => { m.rotation.y += m.userData.speed * dt; m.material.opacity = 0.35 + 0.25 * Math.sin(uTime * 1.1 + i * 2.1); }); atmoMat.uniforms.uTime.value = uTime; if (saturn) saturn.rotation.y += 0.003 * dt; if (jupiter) jupiter.rotation.y += 0.008 * dt; updateAimPlane(); syncGhostToCursor(); placedBalls.forEach((b, i) => { b.halo.material.opacity = 0.28 + 0.12 * Math.sin(uTime * 1.8 + i * 1.3); if (b.corona) b.corona.material.opacity = 0.14 + 0.10 * Math.sin(uTime * 1.3 + i * 0.7); b.ring.material.opacity = 0.45 + 0.20 * Math.sin(uTime * 2.2 + i * 0.9); }); physStep(dt); stepSnapAnim(dt); updateParticles(dt); camPos.lerp(camPosT, 0.06); camLookC.lerp(camLookT, 0.07); camera.position.copy(camPos); camera.lookAt(camLookC); renderer.render(scene, camera); }
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
function setPreloadProgress(p) { document.getElementById('pre-bar').style.width = p + '%'; }
function setPreloadMsg(m) { const el = document.getElementById('pre-msg'); if (el) el.textContent = m; }
function finishPreload() { const pre = document.getElementById('preloader'); pre.style.opacity = '0'; setTimeout(() => pre.style.display = 'none', 850); }
// Bootstrap: load scenarios from manifest, then settle the manifold lattice before fading.
camera.position.copy(CAM_PRESETS.A.pos); camera.lookAt(CAM_PRESETS.A.target);
camPos.copy(CAM_PRESETS.A.pos); camPosT.copy(CAM_PRESETS.A.pos);
requestAnimationFrame(animate);
for (let p = 1; p <= 4; p++) setPlayerIdentity(p, `PLAYER ${p}`, String(p));
initMobilePlayerStrip();
renderMobilePlayers();
let __MANIFEST__ = null;
const manifestReady = fetch('./manifold.game.json').then(r => r.json()).then(cfg => {
  __MANIFEST__ = cfg;
  SCENARIOS = (cfg.attributes && cfg.attributes.scenarios) || [];
  selectedScenario = SCENARIOS[0] || null;
  buildScenarioSelect();
  // Manifold-first: yield tuning constants from params (kept-as-default if absent).
  const p = cfg.params || {};
  if (p.grid_for_players) {
    const gfp = {};
    for (const k of Object.keys(p.grid_for_players)) gfp[+k] = p.grid_for_players[k];
    GRID_FOR_PLAYERS = gfp;
  }
  const ph = p.physics || {};
  if (typeof ph.grav === 'number') GRAV = ph.grav;
  if (typeof ph.restit === 'number') RESTIT = ph.restit;
  if (typeof ph.damp === 'number') DAMP = ph.damp;
  if (typeof ph.settle_v === 'number') SETTLE_V = ph.settle_v;
  if (typeof ph.ball_air === 'number') BALL_AIR = ph.ball_air;
  setPreloadProgress(70);
  setPreloadMsg('SETTLING MANIFOLD LATTICE...');
}).catch(err => { console.error('manifold.game.json load failed', err); setPreloadProgress(70); });
Promise.all([manifestReady, glbReady]).then(() => {
  setPreloadProgress(100);
  setPreloadMsg('READY');
  setTimeout(finishPreload, 400);
  setTimeout(() => {
    try { openMultiplayerPanel(); } catch (e) { console.warn('[4D] panel autostart failed', e); }
  }, 0);
  // Bridge after manifest resolves so dimensions yield from the manifold.
  if (typeof ManifoldBridge !== 'undefined') {
    const m = __MANIFEST__ || {};
    ManifoldBridge.init({
      id: (typeof m.manifold === 'string' ? m.manifold : '4dconnect'),
      version: m.version || '2.0.0',
      x: m.dimension?.x ?? 2,
      y: m.dimension?.y ?? 12,
      exposes: () => ({ currentPlayer, numPlayers, grid: G, scores: Array.from({ length: numPlayers }, (_, i) => TS.score(i + 1)), isGameOver, filled: BM.filled(), scenario: currentScenario && currentScenario.id })
    });
  }
});
