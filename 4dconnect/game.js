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
const STAR_VS = `uniform float uTime;attribute float aSize;attribute float aSpeed;attribute float aPhase;attribute vec3 aColor;varying vec3 vColor;varying float vAlpha;void main(){float t=sin(uTime*aSpeed+aPhase)*0.5+0.5;gl_PointSize=aSize*(0.65+0.35*t);vColor=aColor;vAlpha=0.45+0.55*t;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const STAR_FS = `varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-vec2(0.5));if(d>0.5)discard;float a=pow(1.0-d*2.0,2.2)*vAlpha;gl_FragColor=vec4(vColor,a);}`;
function makeStarLayer(count, spread, sizeRange, pFactor) { const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), sz = new Float32Array(count), spd = new Float32Array(count), ph = new Float32Array(count); const SC = [[1, 1, 1], [0.7, 1, 1], [1, 0.95, 0.6], [0.85, 0.92, 1]]; for (let i = 0; i < count; i++) { pos[i * 3] = (TRNG.f() - .5) * spread; pos[i * 3 + 1] = (TRNG.f() - .5) * spread * 0.6; pos[i * 3 + 2] = (TRNG.f() * -spread * 0.9) - 30; const c = TRNG.pick(SC); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; sz[i] = sizeRange[0] + TRNG.f() * (sizeRange[1] - sizeRange[0]); spd[i] = 0.4 + TRNG.f() * 2.5; ph[i] = TRNG.f() * Math.PI * 2; } const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); geo.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1)); geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false }); const pts = new THREE.Points(geo, mat); pts.userData.parallax = pFactor; scene.add(pts); return pts; }
const starLayers = [makeStarLayer(1200, 700, [0.9, 2.2], 0.8), makeStarLayer(600, 400, [1.5, 3.0], 2.5), makeStarLayer(200, 200, [2.5, 4.5], 6.0)];
function makeSaturn() { const g = new THREE.Group(); const bGeo = new THREE.SphereGeometry(5.5, 48, 32); const bCols = new Float32Array(bGeo.attributes.position.count * 3); for (let i = 0; i < bCols.length / 3; i++) { const y = bGeo.attributes.position.getY(i); const band = Math.sin(y * 1.8) * 0.5 + 0.5; bCols[i * 3] = 0.78 + band * .12; bCols[i * 3 + 1] = 0.62 + band * .10; bCols[i * 3 + 2] = 0.32 + band * .08; } bGeo.setAttribute('color', new THREE.BufferAttribute(bCols, 3)); g.add(new THREE.Mesh(bGeo, new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 14 })));[[8, 11, 0.72], [11.5, 14, 0.55], [14.5, 17, 0.38]].forEach(([inn, out, op]) => { const ring = new THREE.Mesh(new THREE.RingGeometry(inn, out, 80), new THREE.MeshBasicMaterial({ color: 0xc8a878, side: THREE.DoubleSide, transparent: true, opacity: op, depthWrite: false })); ring.rotation.x = Math.PI / 2.6; g.add(ring); }); g.position.set(65, 32, -95); g.rotation.z = -0.08; g.scale.setScalar(1.8); scene.add(g); return g; }
const saturn = makeSaturn();
// Procedural gas giant -- replaces jupiter.glb (3.5 MB). Banded vertex colors, same style as makeSaturn.
function makeJupiter() { const g = new THREE.SphereGeometry(7, 48, 32); const cols = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < g.attributes.position.count; i++) { const y = g.attributes.position.getY(i); const band = Math.sin(y * 2.6) * 0.5 + 0.5; const storm = Math.sin(y * 1.1 + Math.cos(y * 5.2) * 1.8) * 0.5 + 0.5; cols[i * 3] = 0.82 + storm * .12 - band * .08; cols[i * 3 + 1] = 0.58 + band * .18; cols[i * 3 + 2] = 0.30 + storm * .10; } g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 10 })); m.position.set(-75, -18, -80); scene.add(m); return m; }
const jupiter = makeJupiter();
// Procedural Schwartz-P shell -- replaces connect4.glb (27.4 MB). IS the Expression m=x*y*z the manifold is named after.
function makeSchwartzShell() { const g = new THREE.IcosahedronGeometry(6, 6), pos = g.attributes.position, k = 0.55; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); const d = 0.45 * (Math.cos(k * x) + Math.cos(k * y) + Math.cos(k * z)) / 3; const r = Math.sqrt(x * x + y * y + z * z) || 1; pos.setXYZ(i, x * (1 + d / r), y * (1 + d / r), z * (1 + d / r)); } g.computeVertexNormals(); const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: 0x1a2255, emissive: 0x08083a, metalness: 0.85, roughness: 0.08, transparent: true, opacity: 0.38, envMap, envMapIntensity: 1.8, side: THREE.DoubleSide, depthWrite: false })); m.renderOrder = -1; m.position.y = -0.5; scene.add(m); return m; }
const glbOverlay = makeSchwartzShell();
const CELL = 2.8, BALL_R = 0.40;
const latticeGroup = new THREE.Group(); scene.add(latticeGroup);
function nodePos(gx, gy, gz) { return new THREE.Vector3((gx - 1.5) * CELL, (gy - 1.5) * CELL * 0.92 + 0.5, (gz - 1.5) * CELL); }
function makeSaddle(segs, scale, flip) { const verts = [], idx = [], N = segs; for (let i = 0; i <= N; i++)for (let j = 0; j <= N; j++) { const x = (i / N * 2 - 1) * scale, z = (j / N * 2 - 1) * scale; verts.push(x, x * z * 0.5 * (flip ? -1 : 1), z); } for (let i = 0; i < N; i++)for (let j = 0; j < N; j++) { const a = i * (N + 1) + j, b = a + 1, c = a + (N + 1), d = c + 1; idx.push(a, b, c, b, d, c); } const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); geo.setIndex(idx); geo.computeVertexNormals(); return geo; }
const SAD_A = makeSaddle(10, 0.72, false), SAD_B = makeSaddle(10, 0.72, true);
const SMATS = [new THREE.MeshPhysicalMaterial({ color: 0x0033aa, emissive: 0x000822, metalness: 0.5, roughness: 0.2, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, envMap }), new THREE.MeshPhysicalMaterial({ color: 0x6600cc, emissive: 0x110033, metalness: 0.5, roughness: 0.2, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, envMap }), new THREE.MeshPhysicalMaterial({ color: 0x004466, emissive: 0x001122, metalness: 0.5, roughness: 0.2, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, envMap })];
const TMAT = new THREE.MeshPhysicalMaterial({ color: 0x112244, emissive: 0x030314, metalness: 0.7, roughness: 0.25, transparent: true, opacity: 0.22, depthWrite: false });
const TGEO = new THREE.CylinderGeometry(0.038, 0.038, 1, 6, 1);
function makeTube(a, b) { const dir = new THREE.Vector3().subVectors(b, a); const len = dir.length(); const m = new THREE.Mesh(TGEO, TMAT); m.scale.y = len; m.position.copy(a).addScaledVector(dir, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()); return m; }
for (let gx = 0; gx < G; gx++)for (let gy = 0; gy < G; gy++)for (let gz = 0; gz < G; gz++) { const pos = nodePos(gx, gy, gz); const par = (gx + gy + gz) % 2; const saddle = new THREE.Mesh(par ? SAD_B : SAD_A, SMATS[(gx + gy + gz) % 3]); saddle.rotation.y = par ? Math.PI * 0.5 : 0; saddle.position.copy(pos); latticeGroup.add(saddle); if (gx < G - 1) latticeGroup.add(makeTube(pos, nodePos(gx + 1, gy, gz))); if (gy < G - 1) latticeGroup.add(makeTube(pos, nodePos(gx, gy + 1, gz))); if (gz < G - 1) latticeGroup.add(makeTube(pos, nodePos(gx, gy, gz + 1))); }
const haloGroup = new THREE.Group(); scene.add(haloGroup);
const HCFGS = [{ r: 9.5, tube: 0.12, color: 0x8800ff, speed: 0.22, tiltX: 0, tiltZ: 0 }, { r: 10.2, tube: 0.08, color: 0x00aaff, speed: -0.15, tiltX: Math.PI / 3, tiltZ: 0.2 }, { r: 9.8, tube: 0.06, color: 0xff00aa, speed: 0.10, tiltX: -Math.PI / 4, tiltZ: 0.4 }];
const haloMeshes = HCFGS.map(cfg => { const geo = new THREE.TorusGeometry(cfg.r, cfg.tube, 12, 90); const mat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.55, depthWrite: false }); const m = new THREE.Mesh(geo, mat); m.rotation.x = cfg.tiltX; m.rotation.z = cfg.tiltZ; m.userData = cfg; haloGroup.add(m); return m; });
const atmoGeo = new THREE.SphereGeometry(12.5, 28, 28);
const atmoMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x4400bb) } }, vertexShader: `varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`, fragmentShader: `uniform vec3 uColor;uniform float uTime;varying vec3 vN;void main(){float rim=1.0-abs(dot(vN,vec3(0.0,0.0,1.0)));float pulse=0.85+0.15*sin(uTime*1.4);float a=pow(rim,2.8)*0.35*pulse;gl_FragColor=vec4(uColor,a);}`, transparent: true, side: THREE.BackSide, depthWrite: false });
scene.add(new THREE.Mesh(atmoGeo, atmoMat));
const BCOLS = { [P1]: { base: 0x1144ee, emissive: 0x0a1a66, glow: 0x2266ff }, [P2]: { base: 0xcc1100, emissive: 0x550800, glow: 0xff2200 } };
const BGEO = new THREE.SphereGeometry(BALL_R, 28, 28), HGEO = new THREE.SphereGeometry(BALL_R * 2.2, 14, 14), RGEO = new THREE.TorusGeometry(BALL_R * 1.55, 0.025, 8, 32), WGEO = new THREE.SphereGeometry(BALL_R * 2.4, 18, 18);
function makeBallMat(p, ei = 0.7) { const c = BCOLS[p]; return new THREE.MeshPhysicalMaterial({ color: c.base, emissive: c.emissive, emissiveIntensity: ei, metalness: 1.0, roughness: 0.04, envMap, envMapIntensity: 2.5 }); }
function makeHaloMat(p, op = 0.18) { return new THREE.MeshBasicMaterial({ color: BCOLS[p].glow, transparent: true, opacity: op, side: THREE.BackSide, depthWrite: false }); }
const placedBalls = [];
function addPlacedBall(gx, gy, gz, p) { const mesh = new THREE.Mesh(BGEO, makeBallMat(p, 0.6)); const halo = new THREE.Mesh(HGEO, makeHaloMat(p, 0.14)); const ring = new THREE.Mesh(RGEO, new THREE.MeshBasicMaterial({ color: BCOLS[p].glow, transparent: true, opacity: 0.45 })); const pos = nodePos(gx, gy, gz);[mesh, halo, ring].forEach(o => { o.position.copy(pos); scene.add(o); }); ring.rotation.x = Math.PI / 2; placedBalls.push({ mesh, halo, ring, gx, gy, gz, p }); }
const winGlows = [];
function showWinGlows(cells) { cells.forEach(([gx, gy, gz]) => { const m = new THREE.Mesh(WGEO, new THREE.MeshBasicMaterial({ color: 0xffee00, transparent: true, opacity: 0.42, side: THREE.BackSide, depthWrite: false })); m.position.copy(nodePos(gx, gy, gz)); scene.add(m); winGlows.push(m); }); }
function clearWinGlows() { winGlows.forEach(m => scene.remove(m)); winGlows.length = 0; }
const GRAV = -28, RESTIT = 0.42, DAMP = 0.72, SETTLE_V = 0.18;
let physBall = null;
function spawnPhysBall(gx, gz, p) { if (physBall) { scene.remove(physBall.mesh); scene.remove(physBall.halo); physBall = null; } const gy = BM.lowestFree(gx, gz); if (gy < 0) return false; const mesh = new THREE.Mesh(BGEO, makeBallMat(p, 0.9)); const halo = new THREE.Mesh(HGEO, makeHaloMat(p, 0.25)); const startY = nodePos(gx, G + 0.5, gz).y, tx = nodePos(gx, 0, gz).x, tz = nodePos(gx, 0, gz).z; mesh.position.set(tx, startY, tz); halo.position.copy(mesh.position); scene.add(mesh); scene.add(halo); physBall = { mesh, halo, py: startY, vy: -1, tx, tz, gy, gx, gz, p, settled: false }; return true; }
const MAX_PARTS = 160, partPos = new Float32Array(MAX_PARTS * 3), partGeo = new THREE.BufferGeometry();
partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
const partMat = new THREE.PointsMaterial({ size: 0.2, color: 0xffffff, transparent: true, opacity: 0.88, depthWrite: false, sizeAttenuation: true });
scene.add(new THREE.Points(partGeo, partMat));
const partPool = Array.from({ length: MAX_PARTS }, (_, i) => ({ i, active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1 }));
function emitParticles(pos, count, color) { partMat.color.setHex(color); let em = 0; for (const p of partPool) { if (!p.active && em < count) { p.active = true; p.x = pos.x; p.y = pos.y; p.z = pos.z; const spd = 2 + TRNG.f() * 5; const th = TRNG.f() * Math.PI * 2, ph = TRNG.f() * Math.PI; p.vx = Math.sin(ph) * Math.cos(th) * spd; p.vy = Math.sin(ph) * Math.sin(th) * spd + 1.5; p.vz = Math.cos(ph) * spd; p.life = 0; p.maxLife = 0.6 + TRNG.f() * 0.5; em++; } } }
function updateParticles(dt) { let any = false; for (const p of partPool) { if (!p.active) { partPos[p.i * 3 + 1] = -9999; continue; } p.life += dt; p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; partPos[p.i * 3] = p.x; partPos[p.i * 3 + 1] = p.y; partPos[p.i * 3 + 2] = p.z; if (p.life >= p.maxLife) { p.active = false; partPos[p.i * 3 + 1] = -9999; } else any = true; } if (any) partGeo.attributes.position.needsUpdate = true; }
const CAM_PRESETS = { A: { pos: new THREE.Vector3(12, 17, 21), target: new THREE.Vector3(0, 3.5, 0) }, B: { pos: new THREE.Vector3(22, 9, 4), target: new THREE.Vector3(0, 2.5, 0) } };
let camFollow = true;
let camRadius = Math.sqrt(12 * 12 + 17 * 17 + 21 * 21), camTheta = Math.atan2(21, 12), camPhi = 0.6;
let camTarget = new THREE.Vector3(0, 3.5, 0);
let camPos = new THREE.Vector3(12, 17, 21), camPosT = new THREE.Vector3(12, 17, 21);
let camLookT = new THREE.Vector3(0, 3.5, 0), camLookC = new THREE.Vector3(0, 3.5, 0);
let cDrag = false, cLX = 0, cLY = 0;
const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
function setCam(p) { document.getElementById('btn-cama').classList.toggle('on', p === 'A'); document.getElementById('btn-camb').classList.toggle('on', p === 'B'); document.getElementById('btn-follow').classList.remove('on'); camFollow = false; camPosT.copy(CAM_PRESETS[p].pos); camLookT.copy(CAM_PRESETS[p].target); }
function toggleFollow() { camFollow = !camFollow; document.getElementById('btn-follow').classList.toggle('on', camFollow); if (camFollow) { document.getElementById('btn-cama').classList.remove('on'); document.getElementById('btn-camb').classList.remove('on'); } }
function resetCam() { setCam('A'); }
canvas.addEventListener('mousedown', e => { if (e.target !== canvas) return; cDrag = true; cLX = e.clientX; cLY = e.clientY; camFollow = false; document.getElementById('btn-follow').classList.remove('on'); });
window.addEventListener('mouseup', () => cDrag = false);
window.addEventListener('mousemove', e => { parallax.tx = (e.clientX / window.innerWidth - .5) * 2; parallax.ty = (e.clientY / window.innerHeight - .5) * 2; if (!cDrag) return; camTheta -= (e.clientX - cLX) * 0.007; cLX = e.clientX; camPhi = Math.max(0.08, Math.min(Math.PI - .08, camPhi + (e.clientY - cLY) * 0.007)); cLY = e.clientY; camPosT.set(camTarget.x + camRadius * Math.sin(camPhi) * Math.sin(camTheta), camTarget.y + camRadius * Math.cos(camPhi), camTarget.z + camRadius * Math.sin(camPhi) * Math.cos(camTheta)); });
canvas.addEventListener('wheel', e => { camRadius = Math.max(10, Math.min(70, camRadius + e.deltaY * 0.04)); e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchstart', e => { cDrag = true; cLX = e.touches[0].clientX; cLY = e.touches[0].clientY; camFollow = false; }, { passive: true });
canvas.addEventListener('touchend', () => cDrag = false);
canvas.addEventListener('touchmove', e => { if (!cDrag) return; camTheta -= (e.touches[0].clientX - cLX) * 0.007; cLX = e.touches[0].clientX; camPhi = Math.max(0.08, Math.min(Math.PI - .08, camPhi + (e.touches[0].clientY - cLY) * 0.007)); cLY = e.touches[0].clientY; camPosT.set(camTarget.x + camRadius * Math.sin(camPhi) * Math.sin(camTheta), camTarget.y + camRadius * Math.cos(camPhi), camTarget.z + camRadius * Math.sin(camPhi) * Math.cos(camTheta)); }, { passive: true });
function aiSim(fn) { const snap = BM.snapshot(); const r = fn(); BM.restore(snap); return r; }
function aiPickColumn() { const cols = BM.openColumns(); if (!cols.length) return null; if (aiDiff === 'easy' || TRNG.f() < 0.18) return TRNG.pick(cols); const opp = currentPlayer === P1 ? P2 : P1; for (const [gx, gz] of TRNG.shuffle(cols)) { if (aiSim(() => { const gy = BM.lowestFree(gx, gz); BM.setCell(gx, gy, gz, currentPlayer); return BM.checkWin(currentPlayer, currentScenario); })) return [gx, gz]; } for (const [gx, gz] of TRNG.shuffle(cols)) { if (aiSim(() => { const gy = BM.lowestFree(gx, gz); BM.setCell(gx, gy, gz, opp); return BM.checkWin(opp, currentScenario); })) return [gx, gz]; } if (aiDiff === 'hard') { const scored = cols.map(([gx, gz]) => { const myT = aiSim(() => { const gy = BM.lowestFree(gx, gz); BM.setCell(gx, gy, gz, currentPlayer); return BM.countThreats(currentPlayer); }); const opT = aiSim(() => { const gy = BM.lowestFree(gx, gz); BM.setCell(gx, gy, gz, opp); return BM.countThreats(opp); }); return { gx, gz, score: myT * 2 + opT * 1.5 + (1.5 - Math.abs(gx - 1.5) * 0.2 - Math.abs(gz - 1.5) * 0.2) + TRNG.f() * 0.4 }; }); scored.sort((a, b) => b.score - a.score); return [scored[0].gx, scored[0].gz]; } const scored = cols.map(([gx, gz]) => ({ gx, gz, score: 4 - Math.abs(gx - 1.5) - Math.abs(gz - 1.5) + TRNG.f() })); scored.sort((a, b) => b.score - a.score); return [scored[0].gx, scored[0].gz]; }
function updateHUD() { const isP1 = currentPlayer === P1; const n1 = document.getElementById('name-p1').textContent, n2 = document.getElementById('name-p2').textContent; document.getElementById('turn-indicator').textContent = `\u25CF ${isP1 ? n1 : n2}`; document.getElementById('turn-indicator').style.color = isP1 ? 'var(--p1)' : 'var(--p2)'; document.getElementById('panel-p1').classList.toggle('active', isP1); document.getElementById('panel-p2').classList.toggle('active', !isP1); document.getElementById('badge-p1').classList.toggle('pulse', isP1); document.getElementById('badge-p2').classList.toggle('pulse', !isP1); document.getElementById('moves-p1').textContent = TS.count(P1); document.getElementById('moves-p2').textContent = TS.count(P2); document.getElementById('streak-p1').textContent = TS.streak(P1); document.getElementById('streak-p2').textContent = TS.streak(P2); document.getElementById('combo-p1').textContent = BM.countThreats(P1); document.getElementById('combo-p2').textContent = BM.countThreats(P2); }
function renderLogs() { for (const p of [P1, P2]) document.getElementById(`log-p${p}`).innerHTML = TS.log(p).map(m => `<div class="log-entry">${m}</div>`).join(''); }
function renderScores() { document.getElementById('score-p1').textContent = TS.score(P1); document.getElementById('score-p2').textContent = TS.score(P2); }
function showResult(title, sub, tally, color) { document.getElementById('result-title').textContent = title; document.getElementById('result-title').style.color = color; document.getElementById('result-line').textContent = sub; document.getElementById('result-tally').textContent = tally; document.getElementById('result-overlay').classList.add('show'); }
function buildColUI() { const rows = document.getElementById('cg-rows'); rows.innerHTML = ''; const isP2 = currentPlayer === P2; for (let gz = 0; gz < G; gz++) { const row = document.createElement('div'); row.className = 'cg-row'; for (let gx = 0; gx < G; gx++) { const btn = document.createElement('button'); btn.className = 'drop-btn' + (isP2 ? ' p2b' : ''); btn.innerHTML = `<span class="da">&darr;</span><span class="dl">X${gx + 1}&middot;Z${gz + 1}</span>`; btn.dataset.gx = gx; btn.dataset.gz = gz; btn.disabled = isDropping || isGameOver || BM.columnFull(gx, gz); btn.onclick = () => dropBall(gx, gz); row.appendChild(btn); } rows.appendChild(row); } }
function refreshColBtns() { const isP2 = currentPlayer === P2; document.querySelectorAll('.drop-btn').forEach(btn => { const gx = +btn.dataset.gx, gz = +btn.dataset.gz; btn.disabled = isDropping || isGameOver || BM.columnFull(gx, gz); btn.className = 'drop-btn' + (isP2 ? ' p2b' : ''); }); }
function startTurnTimer() { if (!currentScenario.timer) return; clearTurnTimer(); timerLeft = currentScenario.timer; const el = document.getElementById('turn-timer'); el.style.color = 'var(--cyan)'; el.textContent = timerLeft + 's'; turnTimer = setInterval(() => { timerLeft--; el.textContent = timerLeft + 's'; if (timerLeft <= 3) el.style.color = '#ff4444'; if (timerLeft <= 0) { clearTurnTimer(); const avail = BM.openColumns(); if (avail.length) { const [gx, gz] = TRNG.pick(avail); dropBall(gx, gz); } } }, 1000); }
function clearTurnTimer() { if (turnTimer) { clearInterval(turnTimer); turnTimer = null; } document.getElementById('turn-timer').textContent = ''; document.getElementById('turn-timer').style.color = 'var(--cyan)'; }
function dropBall(gx, gz) { if (isDropping || isGameOver || BM.columnFull(gx, gz)) return; clearTurnTimer(); isDropping = true; refreshColBtns(); spawnPhysBall(gx, gz, currentPlayer); if (camFollow) { const tp = nodePos(gx, G, gz); camPosT.set(tp.x * 0.5 + 6, nodePos(gx, G, gz).y + 6, tp.z * 0.5 + 12); camLookT.set(tp.x, 3, tp.z); } }
function physStep(dt) { if (!physBall || physBall.settled) return; physBall.vy += GRAV * dt; physBall.py += physBall.vy * dt; const floorY = nodePos(physBall.gx, physBall.gy, physBall.gz).y; if (physBall.py <= floorY + BALL_R) { if (Math.abs(physBall.vy) < SETTLE_V) { physBall.py = floorY; physBall.vy = 0; physBall.settled = true; onBallSettled(); return; } physBall.py = floorY + BALL_R; physBall.vy = -physBall.vy * RESTIT * DAMP; } boardGlow.intensity = Math.max(0, 2 - physBall.py * 0.2); physBall.mesh.position.set(physBall.tx, physBall.py, physBall.tz); physBall.halo.position.set(physBall.tx, physBall.py, physBall.tz); if (camFollow) { camLookT.y += (physBall.py - camLookT.y) * 0.1; camPosT.y += (physBall.py + 7 - camPosT.y) * 0.06; } }
function describeWin(cells, sc) { return sc.special === 'cube' ? 'PERFECT CUBE COMPLETED!' : (BM.dirLabel(cells) || '').toUpperCase(); }
function nameOf(p) { return document.getElementById(`name-p${p}`).textContent; }
function tallyStr() { return `P1: ${TS.score(P1)}  |  P2: ${TS.score(P2)}`; }
function onBallSettled() {
  const { gx, gy, gz, p } = physBall;
  scene.remove(physBall.mesh); scene.remove(physBall.halo); physBall = null;
  boardGlow.intensity = 0;
  BM.setCell(gx, gy, gz, p);
  addPlacedBall(gx, gy, gz, p);
  emitParticles(nodePos(gx, gy, gz), 28, BCOLS[p].glow);
  boardGlow.color.setHex(BCOLS[p].glow); boardGlow.intensity = 4;
  setTimeout(() => { boardGlow.intensity = 0; }, 350);
  const winCells = BM.checkWin(p, currentScenario);
  TS.record({ p, gx, gy, gz, scenarioId: currentScenario.id, isWin: !!winCells, winCells });
  renderLogs();
  if (winCells) {
    isGameOver = true; renderScores(); showWinGlows(winCells);
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
  updateHUD(); buildColUI();
  if (camFollow) setTimeout(() => { camPosT.copy(CAM_PRESETS.A.pos); camLookT.copy(CAM_PRESETS.A.target); }, 600);
  if (vsMode === 'ai' && currentPlayer === P2) {
    setTimeout(() => { if (!isGameOver && !isDropping) { const col = aiPickColumn(); if (col) dropBall(col[0], col[1]); } }, 500 + TRNG.f() * 400);
  } else {
    startTurnTimer();
  }
}
function buildScenarioSelect() { const grid = document.getElementById('ss-grid'); grid.innerHTML = ''; SCENARIOS.forEach((sc, i) => { const card = document.createElement('div'); card.className = 'ss-card' + (i === 0 ? ' sel' : ''); card.innerHTML = `<div class="ss-icon">${sc.icon}</div><div class="ss-name">${sc.name}</div><div class="ss-desc">${sc.desc}</div>`; card.onclick = () => { document.querySelectorAll('.ss-card').forEach(c => c.classList.remove('sel')); card.classList.add('sel'); selectedScenario = sc; }; grid.appendChild(card); }); }
function setVsMode(mode) { vsMode = mode; document.getElementById('pvp-btn').classList.toggle('sel', mode === 'pvp'); document.getElementById('ai-btn').classList.toggle('sel', mode === 'ai'); document.getElementById('diff-row').classList.toggle('show', mode === 'ai'); document.getElementById('name-p2').textContent = mode === 'ai' ? 'AI OPPONENT' : 'PLAYER 2'; }
function setDiff(d) { aiDiff = d; document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('sel')); document.getElementById(d === 'medium' ? 'diff-med' : `diff-${d}`).classList.add('sel'); }
function showScenarioSelect() { document.getElementById('result-overlay').classList.remove('show'); document.getElementById('scenario-select').classList.add('show'); }
function startGame() { currentScenario = selectedScenario; document.getElementById('scenario-select').classList.remove('show'); document.getElementById('scenario-tag').textContent = currentScenario.name; document.querySelectorAll('.panel-mode').forEach(e => e.textContent = currentScenario.name); resetGame(true); }
function rematch() { document.getElementById('result-overlay').classList.remove('show'); resetGame(false); }
function resetGame(resetScores) { BM.reset(); TS.reset({ resetScores }); currentPlayer = P1; isGameOver = false; isDropping = false; clearTurnTimer(); placedBalls.forEach(b => { scene.remove(b.mesh); scene.remove(b.halo); scene.remove(b.ring); }); placedBalls.length = 0; clearWinGlows(); if (physBall) { scene.remove(physBall.mesh); scene.remove(physBall.halo); physBall = null; } boardGlow.intensity = 0; renderScores(); renderLogs(); updateHUD(); buildColUI(); if (camFollow) { camPosT.copy(CAM_PRESETS.A.pos); camLookT.copy(CAM_PRESETS.A.target); } boardGlow.color.setHex(0x4422ff); boardGlow.intensity = 5; setTimeout(() => { boardGlow.intensity = 0; }, 500); if (vsMode === 'ai') document.getElementById('name-p2').textContent = 'AI OPPONENT'; startTurnTimer(); }
let lastT = 0;
function animate(t) { requestAnimationFrame(animate); const dt = Math.min((t - lastT) / 1000, 0.05); lastT = t; const uTime = t * 0.001; parallax.x += (parallax.tx - parallax.x) * 0.04; parallax.y += (parallax.ty - parallax.y) * 0.04; starLayers.forEach(layer => { layer.material.uniforms.uTime.value = uTime; layer.position.x = parallax.x * layer.userData.parallax; layer.position.y = -parallax.y * layer.userData.parallax * 0.5; }); haloMeshes.forEach((m, i) => { m.rotation.y += m.userData.speed * dt; m.material.opacity = 0.35 + 0.25 * Math.sin(uTime * 1.1 + i * 2.1); }); atmoMat.uniforms.uTime.value = uTime; if (saturn) saturn.rotation.y += 0.003 * dt; if (jupiter) jupiter.rotation.y += 0.008 * dt; if (glbOverlay && !isDropping) glbOverlay.rotation.y = Math.sin(uTime * 0.06) * 0.025; if (!isDropping) latticeGroup.rotation.y = Math.sin(uTime * 0.07) * 0.03; placedBalls.forEach((b, i) => { b.halo.material.opacity = 0.12 + 0.06 * Math.sin(uTime * 1.8 + i * 1.3); b.ring.material.opacity = 0.3 + 0.2 * Math.sin(uTime * 2.2 + i * 0.9); }); physStep(dt); updateParticles(dt); camPos.lerp(camPosT, 0.06); camLookC.lerp(camLookT, 0.07); camera.position.copy(camPos); camera.lookAt(camLookC); renderer.render(scene, camera); }
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
function setPreloadProgress(p) { document.getElementById('pre-bar').style.width = p + '%'; }
function finishPreload() { const pre = document.getElementById('preloader'); pre.style.opacity = '0'; setTimeout(() => pre.style.display = 'none', 850); }
// Bootstrap: load scenarios from manifest (attribute), then wire the UI.
camera.position.copy(CAM_PRESETS.A.pos); camera.lookAt(CAM_PRESETS.A.target);
camPos.copy(CAM_PRESETS.A.pos); camPosT.copy(CAM_PRESETS.A.pos);
requestAnimationFrame(animate);
fetch('./manifold.game.json').then(r => r.json()).then(cfg => {
  SCENARIOS = (cfg.attributes && cfg.attributes.scenarios) || [];
  selectedScenario = SCENARIOS[0] || null;
  buildScenarioSelect();
  setPreloadProgress(30);
  setTimeout(() => { setPreloadProgress(100); document.getElementById('pre-msg').textContent = 'READY'; setTimeout(finishPreload, 400); }, 400);
}).catch(err => { console.error('manifold.game.json load failed', err); setPreloadProgress(100); finishPreload(); });
if (typeof ManifoldBridge !== 'undefined') ManifoldBridge.init({ id: '4dtictactoe', version: '2.0.0', x: 4, y: 4, exposes: () => ({ currentPlayer, scores: [TS.score(P1), TS.score(P2)], isGameOver, filled: BM.filled(), scenario: currentScenario && currentScenario.id }) });
