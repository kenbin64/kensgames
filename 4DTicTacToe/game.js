'use strict';
// 4D Connect -- thin runtime: input -> substrate -> lens -> render.
// Rules live in manifold.js (BoardManifold 3D + Turns 4D). Config lives in manifold.game.json.
const TRNG = { _b: new Uint32Array(16), _i: 16, _r() { crypto.getRandomValues(this._b); this._i = 0; }, f() { if (this._i >= 16) this._r(); return this._b[this._i++] / 0xFFFFFFFF; }, i(a, b) { return Math.floor(this.f() * (b - a + 1)) + a; }, pick(a) { return a[this.i(0, a.length - 1)]; }, shuffle(a) { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = this.i(0, i);[r[i], r[j]] = [r[j], r[i]]; } return r; } };
const BM = window.BoardManifold, TS = window.Turns;
const G = BM.GRID, P1 = BM.P1, P2 = BM.P2;
const dirsOf = sc => (sc && sc.modes === 'diag') ? BM.DIAG_DIRS : BM.DIRS;
let SCENARIOS = [], PLAYERS = [];
let selectedScenario = null, currentScenario = null;
let vsMode = 'pvp', aiDiff = 'easy';
let currentPlayer = P1, isGameOver = false, isDropping = false;
let turnTimer = null, timerLeft = 0;
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
function makeEnvTex() { const W = 256, H = 128, d = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++)for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; d[i] = 2; d[i + 1] = 1; d[i + 2] = 10; d[i + 3] = 255; const n = Math.sin(x * 7.31 + y * 13.7) * Math.cos(x * 11.1 - y * 5.93); if (n > 0.975) { d[i] = 220; d[i + 1] = 235; d[i + 2] = 255; } else if (n > 0.96) { d[i] = 0; d[i + 1] = 180; d[i + 2] = 230; } else if (n > 0.955) { d[i] = 255; d[i + 1] = 220; d[i + 2] = 80; } const lat = Math.abs((y / H) - 0.5) * 2; d[i + 2] = Math.min(255, d[i + 2] + Math.max(0, 1 - lat * 3.5) * 30); } const tex = new THREE.DataTexture(d, W, H, THREE.RGBAFormat); tex.mapping = THREE.EquirectangularReflectionMapping; tex.needsUpdate = true; return tex; }
const envMap = makeEnvTex();
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
// Procedural 7×7×7 gyroid manifold -- runtime geometry derived from the equation
//   g(x,y,z) = sin(kx)cos(ky) + sin(ky)cos(kz) + sin(kz)cos(kx)
// k chosen so the period tiles 7× across the play volume diameter, giving a 7³ grid
// of interconnected chambers and passageways. The iso=0 surface is built once via
// marching tetrahedra (no examples deps) and used as a translucent visual shell;
// the same equation drives ball-vs-manifold collision (see gyroidGuide / gyroidWall).
const GY_HALF = (G - 1) * 0.5 * 2.8 + 0.18;            // matches PLAY_HX (CELL=2.8, BALL_R=0.18)
const GY_K = (7 * Math.PI) / (2 * GY_HALF);            // 7 surface periods across the diameter
const WALL_THRESHOLD = 0.55;                            // |g| > threshold => inside a wall lobe
function gyroidValue(x, y, z) {
  const sx = Math.sin(GY_K * x), cx = Math.cos(GY_K * x);
  const sy = Math.sin(GY_K * y), cy = Math.cos(GY_K * y);
  const sz = Math.sin(GY_K * z), cz = Math.cos(GY_K * z);
  return sx * cy + sy * cz + sz * cx;
}
function gyroidGrad(x, y, z, out) {
  const k = GY_K;
  const sx = Math.sin(k * x), cx = Math.cos(k * x);
  const sy = Math.sin(k * y), cy = Math.cos(k * y);
  const sz = Math.sin(k * z), cz = Math.cos(k * z);
  out.set(k * (cx * cy - sz * sx), k * (-sx * sy + cy * cz), k * (-sy * sz + cz * cx));
  return out;
}
// Marching tetrahedra over a regular cube grid -> BufferGeometry of the gyroid iso=0 surface.
// Each cube splits into 6 tets sharing the (0,0,0)-(1,1,1) diagonal; per-tet 16-case lookup.
function _gyroidMesh(halfExt, RES) {
  const TE = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
  const TETS = [[0, 1, 3, 7], [0, 3, 2, 7], [0, 2, 6, 7], [0, 6, 4, 7], [0, 4, 5, 7], [0, 5, 1, 7]];
  const MT = [
    [], [0, 1, 2], [0, 3, 4], [1, 2, 4, 1, 4, 3],
    [1, 3, 5], [0, 2, 5, 0, 5, 3], [0, 1, 5, 0, 5, 4], [2, 4, 5],
    [2, 4, 5], [0, 1, 5, 0, 5, 4], [0, 2, 5, 0, 5, 3], [1, 3, 5],
    [1, 2, 4, 1, 4, 3], [0, 3, 4], [0, 1, 2], []
  ];
  const OFF = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const N = RES, S = (2 * halfExt) / N, stride = N + 1, stride2 = stride * stride;
  const grid = new Float32Array(stride * stride * stride);
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) for (let k = 0; k <= N; k++) {
    grid[i * stride2 + j * stride + k] = gyroidValue(-halfExt + i * S, -halfExt + j * S, -halfExt + k * S);
  }
  const positions = [], normals = [], _gn = new THREE.Vector3();
  const cv = new Array(8), cp = new Array(8);
  for (let c = 0; c < 8; c++) cp[c] = [0, 0, 0];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
    for (let c = 0; c < 8; c++) {
      const o = OFF[c];
      cv[c] = grid[(i + o[0]) * stride2 + (j + o[1]) * stride + (k + o[2])];
      cp[c][0] = -halfExt + (i + o[0]) * S;
      cp[c][1] = -halfExt + (j + o[1]) * S;
      cp[c][2] = -halfExt + (k + o[2]) * S;
    }
    for (let t = 0; t < 6; t++) {
      const tet = TETS[t];
      const v0 = cv[tet[0]], v1 = cv[tet[1]], v2 = cv[tet[2]], v3 = cv[tet[3]];
      let idx = 0;
      if (v0 >= 0) idx |= 1; if (v1 >= 0) idx |= 2;
      if (v2 >= 0) idx |= 4; if (v3 >= 0) idx |= 8;
      const tri = MT[idx]; if (!tri.length) continue;
      const pa = cp[tet[0]], pb = cp[tet[1]], pc = cp[tet[2]], pd = cp[tet[3]];
      const vs = [v0, v1, v2, v3], ps = [pa, pb, pc, pd];
      for (let n = 0; n < tri.length; n++) {
        const e = tri[n], a = TE[e][0], b = TE[e][1];
        const va = vs[a], vb = vs[b], denom = vb - va;
        const u = Math.abs(denom) < 1e-8 ? 0.5 : -va / denom;
        const px = ps[a][0] + u * (ps[b][0] - ps[a][0]);
        const py = ps[a][1] + u * (ps[b][1] - ps[a][1]);
        const pz = ps[a][2] + u * (ps[b][2] - ps[a][2]);
        positions.push(px, py, pz);
        gyroidGrad(px, py, pz, _gn); const m = _gn.length() || 1;
        normals.push(-_gn.x / m, -_gn.y / m, -_gn.z / m);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geo;
}
function makeManifoldLattice() {
  const halfExt = GY_HALF;
  const group = new THREE.Group();
  // Translucent gyroid surface -- semi-transparent membrane so the marble is visible inside.
  const meshGeo = _gyroidMesh(halfExt, 40);
  const meshMat = new THREE.MeshPhysicalMaterial({
    color: 0x6699ff, emissive: 0x111a44, emissiveIntensity: 0.32,
    metalness: 0.05, roughness: 0.18,
    transmission: 0.55, thickness: 0.3, ior: 1.32,
    transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    depthWrite: false, envMap, envMapIntensity: 1.4,
    clearcoat: 0.6, clearcoatRoughness: 0.25
  });
  const surfaceMesh = new THREE.Mesh(meshGeo, meshMat); surfaceMesh.renderOrder = -1;
  group.add(surfaceMesh);
  // Inner glow points -- ride the iso surface for a luminous chamber-edge feel.
  const samples = [], colors = [], N = 40;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let q = 0; q < N; q++) {
    const x = (i / (N - 1) - 0.5) * 2 * halfExt;
    const y = (j / (N - 1) - 0.5) * 2 * halfExt;
    const z = (q / (N - 1) - 0.5) * 2 * halfExt;
    if (Math.abs(gyroidValue(x, y, z)) < 0.06) {
      samples.push(x, y, z);
      const t = y / halfExt * 0.5 + 0.5;
      colors.push(0.30 + 0.30 * (1 - t), 0.55 + 0.20 * t, 0.95);
    }
  }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.Float32BufferAttribute(samples, 3));
  pgeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  group.add(new THREE.Points(pgeo, new THREE.PointsMaterial({
    size: 0.07, vertexColors: true, transparent: true, opacity: 0.6,
    depthWrite: false, blending: THREE.AdditiveBlending
  })));
  // Outer cage so the cube silhouette stays legible against the deep starfield.
  const cageE = new THREE.EdgesGeometry(new THREE.BoxGeometry(halfExt * 2, halfExt * 2, halfExt * 2));
  group.add(new THREE.LineSegments(cageE, new THREE.LineBasicMaterial({ color: 0x2244aa, transparent: true, opacity: 0.45 })));
  group.renderOrder = -1;
  boardGroup.add(group);
  group.userData.surfaceMesh = surfaceMesh;
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
// Ball radius is intentionally small relative to the gyroid period so it fits through passages.
// With 7 periods across the diameter (period = 2*GY_HALF/7 ~ 1.25), the passage cross-section
// half-width is roughly 0.32 * period ~ 0.40; BALL_R = 0.18 leaves ~0.22 of clearance per side.
const CELL = 2.8, BALL_R = 0.18;
function nodePos(gx, gy, gz) { return new THREE.Vector3((gx - 1.5) * CELL, (gy - 1.5) * CELL * 0.92 + 0.5, (gz - 1.5) * CELL); }
// Saddle/tube lattice (z=xy surfaces) removed -- the GLB manifold is now the only visible structure.
// nodePositions below still drives invisible per-cell sphere collisions for the falling ball.
const haloGroup = new THREE.Group(); scene.add(haloGroup);
const HCFGS = [{ r: 9.5, tube: 0.12, color: 0x8800ff, speed: 0.22, tiltX: 0, tiltZ: 0 }, { r: 10.2, tube: 0.08, color: 0x00aaff, speed: -0.15, tiltX: Math.PI / 3, tiltZ: 0.2 }, { r: 9.8, tube: 0.06, color: 0xff00aa, speed: 0.10, tiltX: -Math.PI / 4, tiltZ: 0.4 }];
const haloMeshes = HCFGS.map(cfg => { const geo = new THREE.TorusGeometry(cfg.r, cfg.tube, 12, 90); const mat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.55, depthWrite: false }); const m = new THREE.Mesh(geo, mat); m.rotation.x = cfg.tiltX; m.rotation.z = cfg.tiltZ; m.userData = cfg; haloGroup.add(m); return m; });
const atmoGeo = new THREE.SphereGeometry(12.5, 28, 28);
const atmoMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x4400bb) } }, vertexShader: `varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`, fragmentShader: `uniform vec3 uColor;uniform float uTime;varying vec3 vN;void main(){float rim=1.0-abs(dot(vN,vec3(0.0,0.0,1.0)));float pulse=0.85+0.15*sin(uTime*1.4);float a=pow(rim,2.8)*0.35*pulse;gl_FragColor=vec4(uColor,a);}`, transparent: true, side: THREE.BackSide, depthWrite: false });
scene.add(new THREE.Mesh(atmoGeo, atmoMat));
// Jewel-tone palette: ruby red, forest green, deep purple, gold. P1/P2 use the first two; the rest are reserved for AI/team variants.
const BPALETTE = [
  { base: 0x7a0a18, emissive: 0x1a0205, glow: 0xc81a2a }, // ruby red
  { base: 0x0d3a1f, emissive: 0x021008, glow: 0x1f8a4a }, // forest green
  { base: 0x2a0850, emissive: 0x0a0218, glow: 0x6020c8 }, // deep purple
  { base: 0x6a4a08, emissive: 0x1a1002, glow: 0xd9a82a }  // gold
];
const BCOLS = { [P1]: BPALETTE[0], [P2]: BPALETTE[1] };
const BGEO = new THREE.SphereGeometry(BALL_R, 28, 28), HGEO = new THREE.SphereGeometry(BALL_R * 1.7, 14, 14), RGEO = new THREE.TorusGeometry(BALL_R * 1.55, 0.025, 8, 32), WGEO = new THREE.SphereGeometry(BALL_R * 2.4, 18, 18);
// Solid jewel-stone ball, polished and reflective. Used both for the falling ball and for settled balls.
function makeBallMat(p, ei) {
  const c = BCOLS[p];
  return new THREE.MeshPhysicalMaterial({
    color: c.base, emissive: c.emissive, emissiveIntensity: ei != null ? ei : 0.12,
    metalness: 0.25, roughness: 0.04,
    clearcoat: 1.0, clearcoatRoughness: 0.008,
    envMap, envMapIntensity: 3.2, reflectivity: 1.0,
    sheen: 0.4, sheenColor: new THREE.Color(c.glow), sheenRoughness: 0.25
  });
}
function makeFallingBallMat(p) { return makeBallMat(p, 0.18); }
function makeHaloMat(p, op) { return new THREE.MeshBasicMaterial({ color: BCOLS[p].glow, transparent: true, opacity: (op != null ? op : 0.035), side: THREE.BackSide, depthWrite: false }); }
const placedBalls = [];
function addPlacedBall(gx, gy, gz, p) { const mesh = new THREE.Mesh(BGEO, makeBallMat(p, 0.6)); const halo = new THREE.Mesh(HGEO, makeHaloMat(p, 0.07)); const ring = new THREE.Mesh(RGEO, new THREE.MeshBasicMaterial({ color: BCOLS[p].glow, transparent: true, opacity: 0.22 })); const pos = nodePos(gx, gy, gz);[mesh, halo, ring].forEach(o => { o.position.copy(pos); boardGroup.add(o); }); ring.rotation.x = Math.PI / 2; placedBalls.push({ mesh, halo, ring, gx, gy, gz, p }); }
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

const GRAV = -62, RESTIT = 0.28, DAMP = 0.72, SETTLE_V = 0.30, BALL_AIR = 0.992;
// Play volume bounds: clamp tight to the lattice extents so balls never escape the gyroid cube.
// Lattice spans gx,gz in 0..G-1 → world coords (gx-1.5)*CELL ∈ [-4.2, +4.2] for G=4.
const PLAY_HX = (G - 1) * 0.5 * CELL + BALL_R;        // tight x half-extent
const PLAY_HZ = (G - 1) * 0.5 * CELL + BALL_R;        // tight z half-extent
const TOP_Y = nodePos(0, G - 1, 0).y + CELL * 1.2;    // initial ghost-ball hover plane (replaced per-frame by _aimYWorld)
// Y bounds widened so the ball can't escape vertically regardless of which cube face is currently up.
// Spawn happens at _aimYWorld which is just above the rotated cube's highest world-Y vertex; ceiling
// gives a small headroom above that, floor mirrors below.
const Y_CEIL = PLAY_HX + CELL * 1.2 + BALL_R;
const FLOOR_Y = -(PLAY_HX + CELL * 1.2 + BALL_R);
// Gyroid path-following physics: ball "meanders" along the iso=0 surface contours.
// Soft regime: a gradient force pushes the ball out of wall lobes (|g| > WALL_THRESHOLD)
// toward the nearest passage. Hard regime: when the ball is buried deep in a wall lobe
// (|g| > WALL_HARD), reflect velocity along the surface normal so it cannot tunnel
// through. Tangential velocity is preserved with high retention so the ball keeps
// following the gyroid path; spin is updated from (n x v) so visual rotation matches.
const WALL_HARD = 1.55;
const _gyLocal = new THREE.Vector3();
const _gyN = new THREE.Vector3();
function gyroidGuide(dt) {
  if (!physBall || physBall.settled) return;
  _gyLocal.set(physBall.x, physBall.y, physBall.z);
  boardGroup.worldToLocal(_gyLocal);
  if (Math.abs(_gyLocal.x) > GY_HALF || Math.abs(_gyLocal.y) > GY_HALF || Math.abs(_gyLocal.z) > GY_HALF) return;
  const g = gyroidValue(_gyLocal.x, _gyLocal.y, _gyLocal.z);
  const ag = Math.abs(g);
  if (ag < WALL_THRESHOLD) return;
  gyroidGrad(_gyLocal.x, _gyLocal.y, _gyLocal.z, _gyN);
  const gmag = _gyN.length();
  if (gmag < 1e-4) return;
  // Outward normal points from inside the wall toward the iso=0 passage (sign opposite to g).
  _gyN.multiplyScalar(-Math.sign(g) / gmag);
  _gyN.transformDirection(boardGroup.matrixWorld); // local rotation -> world (no scale)
  if (ag < WALL_HARD) {
    // Soft regime: gentle nudge toward passage, scaled by depth into wall.
    const depth = (ag - WALL_THRESHOLD) / (WALL_HARD - WALL_THRESHOLD);
    const F = 95 * depth;
    physBall.vx += _gyN.x * F * dt;
    physBall.vy += _gyN.y * F * dt;
    physBall.vz += _gyN.z * F * dt;
    physBall.spinX += (_gyN.y * physBall.vz - _gyN.z * physBall.vy) * 0.012 * dt;
    physBall.spinY += (_gyN.z * physBall.vx - _gyN.x * physBall.vz) * 0.012 * dt;
    physBall.spinZ += (_gyN.x * physBall.vy - _gyN.y * physBall.vx) * 0.012 * dt;
    return;
  }
  // Hard regime: project ball back to the WALL_HARD shell along the outward normal,
  // then reflect velocity with high tangential retention so the ball rolls along the
  // wall surface rather than dying on impact.
  const overshoot = (ag - WALL_HARD) / gmag;          // local-space distance into wall
  physBall.x += _gyN.x * overshoot;
  physBall.y += _gyN.y * overshoot;
  physBall.z += _gyN.z * overshoot;
  const vn = physBall.vx * _gyN.x + physBall.vy * _gyN.y + physBall.vz * _gyN.z;
  if (vn < 0) {
    Audio4D.onTap(-vn);
    physBall.vx -= (1 + RESTIT) * vn * _gyN.x;
    physBall.vy -= (1 + RESTIT) * vn * _gyN.y;
    physBall.vz -= (1 + RESTIT) * vn * _gyN.z;
    const vAfterN = physBall.vx * _gyN.x + physBall.vy * _gyN.y + physBall.vz * _gyN.z;
    const vtx = physBall.vx - vAfterN * _gyN.x;
    const vty = physBall.vy - vAfterN * _gyN.y;
    const vtz = physBall.vz - vAfterN * _gyN.z;
    physBall.vx = _gyN.x * vAfterN + vtx * 0.97;
    physBall.vy = _gyN.y * vAfterN + vty * 0.97;
    physBall.vz = _gyN.z * vAfterN + vtz * 0.97;
    physBall.spinX += (_gyN.y * vtz - _gyN.z * vty) * 0.07;
    physBall.spinY += (_gyN.z * vtx - _gyN.x * vtz) * 0.07;
    physBall.spinZ += (_gyN.x * vty - _gyN.y * vtx) * 0.07;
  }
}
// Lattice-node sphere obstacles (visible saddle tiles): ball bounces off them.
const NODE_R = CELL * 0.32; // collision radius for each saddle node
// Each node stores its local lattice position (lp) AND a world-space cache (p) that is
// recomputed from the boardGroup matrix whenever a ball is released. Rotation is locked
// during flight, so the world cache stays valid for the entire physics run.
const nodePositions = [];
for (let gx = 0; gx < G; gx++)
  for (let gy = 0; gy < G; gy++)
    for (let gz = 0; gz < G; gz++) { const lp = nodePos(gx, gy, gz); nodePositions.push({ gx, gy, gz, lp, p: lp.clone() }); }
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
const CUBE_CORNERS = (() => { const c = []; for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) c.push(new THREE.Vector3(sx * PLAY_HX, sy * PLAY_HX, sz * PLAY_HZ)); return c; })();
function updateAimPlane() {
  boardGroup.updateMatrixWorld(true);
  let maxY = -Infinity;
  for (let i = 0; i < CUBE_CORNERS.length; i++) { _aimCorner.copy(CUBE_CORNERS[i]).applyMatrix4(boardGroup.matrixWorld); if (_aimCorner.y > maxY) maxY = _aimCorner.y; }
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

function spawnPhysBall(x, y, z, p) {
  if (physBall) { scene.remove(physBall.mesh); scene.remove(physBall.halo); physBall = null; }
  const mesh = new THREE.Mesh(BGEO, makeFallingBallMat(p));
  mesh.renderOrder = 5;
  const halo = new THREE.Mesh(HGEO, makeHaloMat(p, 0.03));
  mesh.position.set(x, y, z); halo.position.copy(mesh.position);
  scene.add(mesh); scene.add(halo);
  physBall = { mesh, halo, x, y, z, vx: 0, vy: -1, vz: 0, p, settled: false, settleTimer: 0, spinX: 0, spinY: 0, spinZ: 0 };
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
function releaseBall() {
  if (!ghostBall || isDropping || isGameOver) return;
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
  spawnPhysBall(spawnW.x, _aimYWorld, spawnW.z, p);
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
function aiPickColumn() { const cols = BM.openColumns(); if (!cols.length) return null; if (aiDiff === 'easy' || TRNG.f() < 0.18) return TRNG.pick(cols); const opp = currentPlayer === P1 ? P2 : P1; for (const [gx, gz] of TRNG.shuffle(cols)) { if (aiSim(() => { const gy = BM.lowestFree(gx, gz); BM.setCell(gx, gy, gz, currentPlayer); return BM.checkWin(currentPlayer, currentScenario); })) return [gx, gz]; } for (const [gx, gz] of TRNG.shuffle(cols)) { if (aiSim(() => { const gy = BM.lowestFree(gx, gz); BM.setCell(gx, gy, gz, opp); return BM.checkWin(opp, currentScenario); })) return [gx, gz]; } if (aiDiff === 'hard') { const scored = cols.map(([gx, gz]) => { const myT = aiSim(() => { const gy = BM.lowestFree(gx, gz); BM.setCell(gx, gy, gz, currentPlayer); return BM.countThreats(currentPlayer); }); const opT = aiSim(() => { const gy = BM.lowestFree(gx, gz); BM.setCell(gx, gy, gz, opp); return BM.countThreats(opp); }); return { gx, gz, score: myT * 2 + opT * 1.5 + (1.5 - Math.abs(gx - 1.5) * 0.2 - Math.abs(gz - 1.5) * 0.2) + TRNG.f() * 0.4 }; }); scored.sort((a, b) => b.score - a.score); return [scored[0].gx, scored[0].gz]; } const scored = cols.map(([gx, gz]) => ({ gx, gz, score: 4 - Math.abs(gx - 1.5) - Math.abs(gz - 1.5) + TRNG.f() })); scored.sort((a, b) => b.score - a.score); return [scored[0].gx, scored[0].gz]; }
function updateHUD() { const isP1 = currentPlayer === P1; const n1 = document.getElementById('name-p1').textContent, n2 = document.getElementById('name-p2').textContent; document.getElementById('turn-indicator').textContent = `\u25CF ${isP1 ? n1 : n2}`; document.getElementById('turn-indicator').style.color = isP1 ? 'var(--p1)' : 'var(--p2)'; document.getElementById('panel-p1').classList.toggle('active', isP1); document.getElementById('panel-p2').classList.toggle('active', !isP1); document.getElementById('badge-p1').classList.toggle('pulse', isP1); document.getElementById('badge-p2').classList.toggle('pulse', !isP1); document.getElementById('moves-p1').textContent = TS.count(P1); document.getElementById('moves-p2').textContent = TS.count(P2); document.getElementById('streak-p1').textContent = TS.streak(P1); document.getElementById('streak-p2').textContent = TS.streak(P2); document.getElementById('combo-p1').textContent = BM.countThreats(P1); document.getElementById('combo-p2').textContent = BM.countThreats(P2); }
function renderLogs() { for (const p of [P1, P2]) document.getElementById(`log-p${p}`).innerHTML = TS.log(p).map(m => `<div class="log-entry">${m}</div>`).join(''); }
function renderScores() { document.getElementById('score-p1').textContent = TS.score(P1); document.getElementById('score-p2').textContent = TS.score(P2); }
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
  const STEPS = 7, hdt = dt / STEPS;
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
  gyroidGuide(dt);
  // Collide against each visible lattice node treated as a sphere obstacle.
  for (let i = 0; i < nodePositions.length; i++) {
    const n = nodePositions[i].p;
    const dx = physBall.x - n.x, dy = physBall.y - n.y, dz = physBall.z - n.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    const minD = NODE_R + BALL_R;
    if (d2 < minD * minD && d2 > 1e-8) {
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d;
      const overlap = minD - d;
      physBall.x += nx * overlap; physBall.y += ny * overlap; physBall.z += nz * overlap;
      const vn = physBall.vx * nx + physBall.vy * ny + physBall.vz * nz;
      if (vn < 0) {
        if (-vn > 4) Audio4D.onTap(-vn);
        physBall.vx -= (1 + RESTIT) * vn * nx;
        physBall.vy -= (1 + RESTIT) * vn * ny;
        physBall.vz -= (1 + RESTIT) * vn * nz;
        physBall.vx *= 0.93; physBall.vz *= 0.93;
      }
    }
  }
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
  // Hard AABB containment: ball can never leave the lattice cube.
  if (physBall.x < -PLAY_HX) { physBall.x = -PLAY_HX; physBall.vx = Math.abs(physBall.vx) * RESTIT; }
  if (physBall.x > PLAY_HX) { physBall.x = PLAY_HX; physBall.vx = -Math.abs(physBall.vx) * RESTIT; }
  if (physBall.z < -PLAY_HZ) { physBall.z = -PLAY_HZ; physBall.vz = Math.abs(physBall.vz) * RESTIT; }
  if (physBall.z > PLAY_HZ) { physBall.z = PLAY_HZ; physBall.vz = -Math.abs(physBall.vz) * RESTIT; }
  if (physBall.y > Y_CEIL) { physBall.y = Y_CEIL; physBall.vy = -Math.abs(physBall.vy) * RESTIT; }
  if (physBall.y < FLOOR_Y) {
    physBall.y = FLOOR_Y;
    physBall.vy = Math.abs(physBall.vy) * RESTIT;
    physBall.vx *= 0.85; physBall.vz *= 0.85;
  }
  const speed2 = physBall.vx * physBall.vx + physBall.vy * physBall.vy + physBall.vz * physBall.vz;
  if (speed2 < SETTLE_V * SETTLE_V) {
    physBall.settleTimer += dt;
    if (physBall.settleTimer > 0.4) { physBall.settled = true; onBallSettled(); }
  } else { physBall.settleTimer = 0; }
}
// Snap a settled world position to the nearest unoccupied lattice cell.
function nearestFreeCell(x, y, z) {
  let best = null, bestD = Infinity;
  for (let i = 0; i < nodePositions.length; i++) {
    const { gx, gy, gz, p } = nodePositions[i];
    if (BM.getCell(gx, gy, gz)) continue;
    const dx = x - p.x, dy = y - p.y, dz = z - p.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) { bestD = d; best = [gx, gy, gz]; }
  }
  return best;
}
function describeWin(cells, sc) { return sc.special === 'cube' ? 'PERFECT CUBE COMPLETED!' : (BM.dirLabel(cells) || '').toUpperCase(); }
function nameOf(p) { return document.getElementById(`name-p${p}`).textContent; }
function tallyStr() { return `P1: ${TS.score(P1)}  |  P2: ${TS.score(P2)}`; }
function onBallSettled() {
  const p = physBall.p;
  const cell = nearestFreeCell(physBall.x, physBall.y, physBall.z);
  Audio4D.onSettle();
  scene.remove(physBall.mesh); scene.remove(physBall.halo); physBall = null;
  boardGlow.intensity = 0;
  if (!cell) { isDropping = false; if (!isGameOver) maybeSpawnTurnBall(); return; }
  const [gx, gy, gz] = cell;
  BM.setCell(gx, gy, gz, p);
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
      const p1L = BM.countAllLines(P1), p2L = BM.countAllLines(P2);
      const winner = p1L > p2L ? P1 : p2L > p1L ? P2 : 0;
      const color = winner === P1 ? '#2255ff' : winner === P2 ? '#ff2200' : '#ffee00';
      if (winner) { TS.awardWin(winner); renderScores(); }
      const wn = winner === 0 ? 'DRAW' : `${nameOf(winner)} WINS`;
      setTimeout(() => showResult(wn, `Lines: P1=${p1L}  P2=${p2L}`, 'TERRITORY WAR COMPLETE', color), 700);
    } else {
      setTimeout(() => showResult('DRAW', 'The lattice is full', tallyStr(), '#ffee00'), 500);
    }
    isDropping = false; refreshColBtns(); updateHUD(); return;
  }
  currentPlayer = currentPlayer === P1 ? P2 : P1;
  isDropping = false;
  updateHUD();
  if (camFollow) setTimeout(() => { camPosT.copy(CAM_PRESETS.A.pos); camLookT.copy(CAM_PRESETS.A.target); }, 600);
  maybeSpawnTurnBall();
}
// Hand control to the next actor: AI auto-drops, a human gets a cursor ball.
function maybeSpawnTurnBall() {
  if (isGameOver) return;
  if (vsMode === 'ai' && currentPlayer === P2) {
    setTimeout(() => {
      if (isGameOver || isDropping) return;
      let col = null;
      try { col = aiPickColumn(); } catch (err) { console.warn('aiPickColumn threw', err); }
      if (!col) {
        // Fallback: pick any free cell directly from the lattice.
        const free = nodePositions.filter(n => !BM.getCell(n.gx, n.gy, n.gz));
        if (free.length) col = [free[(Math.random() * free.length) | 0].gx, free[(Math.random() * free.length) | 0].gz];
      }
      if (col) dropBall(col[0], col[1]);
      else { console.warn('AI: no moves available'); }
    }, 500 + TRNG.f() * 400);
  } else {
    spawnGhostBall(currentPlayer);
    startTurnTimer();
  }
}
function buildScenarioSelect() { const grid = document.getElementById('ss-grid'); grid.innerHTML = ''; SCENARIOS.forEach((sc, i) => { const card = document.createElement('div'); card.className = 'ss-card' + (i === 0 ? ' sel' : ''); card.innerHTML = `<div class="ss-icon">${sc.icon}</div><div class="ss-name">${sc.name}</div><div class="ss-desc">${sc.desc}</div>`; card.onclick = () => { document.querySelectorAll('.ss-card').forEach(c => c.classList.remove('sel')); card.classList.add('sel'); selectedScenario = sc; }; grid.appendChild(card); }); }
function setVsMode(mode) { vsMode = mode; document.getElementById('pvp-btn').classList.toggle('sel', mode === 'pvp'); document.getElementById('ai-btn').classList.toggle('sel', mode === 'ai'); document.getElementById('diff-row').classList.toggle('show', mode === 'ai'); document.getElementById('name-p2').textContent = mode === 'ai' ? 'AI OPPONENT' : 'PLAYER 2'; }
function setDiff(d) { aiDiff = d; document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('sel')); document.getElementById(d === 'medium' ? 'diff-med' : `diff-${d}`).classList.add('sel'); }
function showScenarioSelect() { document.getElementById('result-overlay').classList.remove('show'); document.getElementById('scenario-select').classList.add('show'); }
function startGame() { currentScenario = selectedScenario; document.getElementById('scenario-select').classList.remove('show'); document.getElementById('scenario-tag').textContent = currentScenario.name; document.querySelectorAll('.panel-mode').forEach(e => e.textContent = currentScenario.name); resetGame(true); Audio4D.startMusic(); }
function rematch() { document.getElementById('result-overlay').classList.remove('show'); resetGame(false); Audio4D.startMusic(); }
function resetGame(resetScores) { BM.reset(); TS.reset({ resetScores }); currentPlayer = P1; isGameOver = false; isDropping = false; clearTurnTimer(); placedBalls.forEach(b => { boardGroup.remove(b.mesh); boardGroup.remove(b.halo); boardGroup.remove(b.ring); }); placedBalls.length = 0; clearWinGlows(); if (physBall) { scene.remove(physBall.mesh); scene.remove(physBall.halo); physBall = null; } if (ghostBall) { scene.remove(ghostBall.mesh); scene.remove(ghostBall.halo); ghostBall = null; } boardGroup.quaternion.identity(); boardGlow.intensity = 0; renderScores(); renderLogs(); updateHUD(); if (camFollow) { camPosT.copy(CAM_PRESETS.A.pos); camLookT.copy(CAM_PRESETS.A.target); } boardGlow.color.setHex(0x4422ff); boardGlow.intensity = 5; setTimeout(() => { boardGlow.intensity = 0; }, 500); if (vsMode === 'ai') document.getElementById('name-p2').textContent = 'AI OPPONENT'; maybeSpawnTurnBall(); }
let lastT = 0;
function animate(t) { requestAnimationFrame(animate); const dt = Math.min((t - lastT) / 1000, 0.05); lastT = t; const uTime = t * 0.001; parallax.x += (parallax.tx - parallax.x) * 0.04; parallax.y += (parallax.ty - parallax.y) * 0.04; starLayers.forEach(layer => { layer.material.uniforms.uTime.value = uTime; layer.position.x = parallax.x * layer.userData.parallax; layer.position.y = -parallax.y * layer.userData.parallax * 0.5; }); haloMeshes.forEach((m, i) => { m.rotation.y += m.userData.speed * dt; m.material.opacity = 0.35 + 0.25 * Math.sin(uTime * 1.1 + i * 2.1); }); atmoMat.uniforms.uTime.value = uTime; if (saturn) saturn.rotation.y += 0.003 * dt; if (jupiter) jupiter.rotation.y += 0.008 * dt; updateAimPlane(); syncGhostToCursor(); placedBalls.forEach((b, i) => { b.halo.material.opacity = 0.05 + 0.02 * Math.sin(uTime * 1.8 + i * 1.3); b.ring.material.opacity = 0.16 + 0.08 * Math.sin(uTime * 2.2 + i * 0.9); }); physStep(dt); updateParticles(dt); camPos.lerp(camPosT, 0.06); camLookC.lerp(camLookT, 0.07); camera.position.copy(camPos); camera.lookAt(camLookC); renderer.render(scene, camera); }
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
function setPreloadProgress(p) { document.getElementById('pre-bar').style.width = p + '%'; }
function setPreloadMsg(m) { const el = document.getElementById('pre-msg'); if (el) el.textContent = m; }
function finishPreload() { const pre = document.getElementById('preloader'); pre.style.opacity = '0'; setTimeout(() => pre.style.display = 'none', 850); }
// Bootstrap: load scenarios from manifest, then settle the manifold lattice before fading.
camera.position.copy(CAM_PRESETS.A.pos); camera.lookAt(CAM_PRESETS.A.target);
camPos.copy(CAM_PRESETS.A.pos); camPosT.copy(CAM_PRESETS.A.pos);
requestAnimationFrame(animate);
const manifestReady = fetch('./manifold.game.json').then(r => r.json()).then(cfg => {
  SCENARIOS = (cfg.attributes && cfg.attributes.scenarios) || [];
  selectedScenario = SCENARIOS[0] || null;
  buildScenarioSelect();
  setPreloadProgress(70);
  setPreloadMsg('SETTLING MANIFOLD LATTICE...');
}).catch(err => { console.error('manifold.game.json load failed', err); setPreloadProgress(70); });
Promise.all([manifestReady, glbReady]).then(() => {
  setPreloadProgress(100);
  setPreloadMsg('READY');
  setTimeout(finishPreload, 400);
});
if (typeof ManifoldBridge !== 'undefined') ManifoldBridge.init({ id: '4dconnect', version: '2.0.0', x: 4, y: 4, exposes: () => ({ currentPlayer, scores: [TS.score(P1), TS.score(P2)], isGameOver, filled: BM.filled(), scenario: currentScenario && currentScenario.id }) });
