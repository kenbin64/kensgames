/**
 * game.js — Chomp! Wally the Cairns Crocodile Adventure
 * 3D engine: Three.js r152.2
 *
 * Architecture (dimensional):
 *   0D — constants from wally_manifold.js
 *   1D — input streams, prey spawn queues
 *   2D — level terrain mesh generation (heightmap + UV)
 *   3D — Three.js scene graph (world volume)
 *   4D — game loop: physics + AI + animation timeline
 */

'use strict';

/* ── Globals ─────────────────────────────────────────────────────── */
let scene, camera, renderer;
let wally, wallyMesh, wallyGroup, jawMesh, tailBones;
let preyObjects = [];
let worldObjects = [];
let waterMesh, waterUniforms;
let particles = [];
let gameActive = false, gamePaused = false, gameOver = false;
let score = 0, health = 100, hunger = 100, chompStreak = 0;
let lastTime = 0;
let chompComboTimer = 0;
let levelData = null;
let tideT = 0;

/* ── Input state ─────────────────────────────────────────────────── */
const keys = {};
let touchInput = { x: 0, z: 0, chomp: false };

/* ── Camera smoothing ────────────────────────────────────────────── */
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
let camYaw = 0, camPitch = 0.35;

/* ── Colour palette (from manifold) ─────────────────────────────── */
const C = WALLY.C;
const W = WALLY;

/* ════════════════════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════════════════════ */
function init() {
  const canvas = document.getElementById('canvas');

  /* Scene */
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d3d52);

  /* Camera */
  camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.1, 600);
  camPos.set(0, C.CAM_HEIGHT, C.CAM_DISTANCE);
  camera.position.copy(camPos);

  /* Renderer */
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  /* Lights */
  buildLights();

  /* Parse level from URL */
  const params = new URLSearchParams(location.search);
  const levelId = Math.max(1, Math.min(8, parseInt(params.get('level') || '1')));
  levelData = W.LEVELS.find(l => l.id === levelId) || W.LEVELS[0];

  /* Build world */
  buildWorld(levelData);
  buildWally();
  spawnPreyMeshes(levelData);

  /* HUD */
  updateHUD();

  /* Input */
  setupInput();

  /* Resize */
  window.addEventListener('resize', onResize);

  /* Bridge */
  wally = W.createWally();
  window.__MANIFOLD__ = W.buildBridge(wally, levelData);

  /* Start */
  gameActive = true;
  document.getElementById('loading').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

/* ════════════════════════════════════════════════════════════════════
   LIGHTS
   ════════════════════════════════════════════════════════════════════ */
function buildLights() {
  // Ambient — warm sky scatter
  const amb = new THREE.AmbientLight(0x5080a0, 0.55);
  scene.add(amb);

  // Sun directional
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.4);
  sun.position.set(60, 80, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 400;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -120;
  sun.shadow.camera.right = sun.shadow.camera.top = 120;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // Water caustics — point light below water
  const caustic = new THREE.PointLight(0x40c0ff, 1.8, 30);
  caustic.position.set(0, -3, 0);
  scene.add(caustic);
  caustic.userData.isCaustic = true;

  // Hemisphere for gentle ground bounce
  const hemi = new THREE.HemisphereLight(0x80c0ff, 0x4a7c3f, 0.4);
  scene.add(hemi);
}

/* ════════════════════════════════════════════════════════════════════
   WORLD BUILDING (2D → 3D)
   ════════════════════════════════════════════════════════════════════ */
function buildWorld(level) {
  const [lw, lh] = level.size;

  // ── Scene fog + background ───────────────────────────────────────
  scene.fog = new THREE.Fog(level.fogColor, level.fogNear, level.fogFar);
  scene.background = new THREE.Color(level.ambientColor);

  // ── Water surface ────────────────────────────────────────────────
  const wGeo = new THREE.PlaneGeometry(lw, lh, 64, 64);
  const wMat = buildWaterMaterial(level);
  waterMesh = new THREE.Mesh(wGeo, wMat);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.y = C.WATER_LEVEL;
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);
  worldObjects.push(waterMesh);

  // ── Sea floor / mud ──────────────────────────────────────────────
  const floorGeo = new THREE.PlaneGeometry(lw, lh, 32, 32);
  const posArr = floorGeo.attributes.position.array;
  for (let i = 2; i < posArr.length; i += 3) {
    posArr[i] += (Math.random() - 0.5) * 0.6;        // Y (after rotation)
  }
  floorGeo.computeVertexNormals();
  const floorMat = new THREE.MeshLambertMaterial({
    color: biomeFloorColor(level.biome),
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -level.waterDepth;
  floor.receiveShadow = true;
  scene.add(floor);
  worldObjects.push(floor);

  // ── Terrain features per biome ───────────────────────────────────
  buildBiomeFeatures(level, lw, lh);

  // ── Boundary walls (invisible) ───────────────────────────────────
  worldObjects.push({ isBoundary: true, hw: lw / 2, hd: lh / 2 });
}

function biomeFloorColor(biome) {
  const map = {
    estuary: 0x8b6914,
    mangrove: 0x3a2a10,
    mudflat: 0x7a6520,
    river: 0x6a5010,
    reef: 0x8fbfef,
    boardwalk: 0x8b7060,
    drain: 0x404040,
    sea: 0x102040,
  };
  return map[biome] || 0x8b6914;
}

function buildWaterMaterial(level) {
  // ShaderMaterial for animated water
  waterUniforms = {
    uTime: { value: 0 },
    uColor1: { value: new THREE.Color(level.ambientColor) },
    uColor2: { value: new THREE.Color(level.fogColor) },
    uDepth: { value: level.waterDepth },
  };
  return new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: true,
    opacity: 0.82,
    side: THREE.FrontSide,
    vertexShader: `
      uniform float uTime;
      varying vec2  vUv;
      varying float vWave;
      void main(){
        vUv = uv;
        vec3 p = position;
        float w = sin(p.x*0.15 + uTime*1.2)*0.4
                + sin(p.y*0.22 + uTime*0.9)*0.25;
        p.z += w;
        vWave = w;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }
    `,
    fragmentShader: `
      uniform vec3  uColor1;
      uniform vec3  uColor2;
      uniform float uTime;
      varying vec2  vUv;
      varying float vWave;
      void main(){
        float t = clamp(vUv.y + vWave*0.3, 0.0, 1.0);
        vec3  c = mix(uColor2, uColor1, t);
        // specular flash
        float spec = pow(max(0.0, sin(vUv.x*20.0 + uTime*3.0)*sin(vUv.y*20.0 + uTime*2.0)), 6.0)*0.3;
        c += vec3(spec);
        gl_FragColor = vec4(c, 0.82);
      }
    `,
  });
}

function buildBiomeFeatures(level, lw, lh) {
  const rng = mulberry32(level.id * 97);

  if (level.biome === 'mangrove' || level.biome === 'estuary') {
    // Mangrove trees
    const count = level.biome === 'mangrove' ? 60 : 20;
    for (let i = 0; i < count; i++) {
      addMangrove(
        (rng() - 0.5) * lw * 0.9,
        C.WATER_LEVEL,
        (rng() - 0.5) * lh * 0.9,
        1.5 + rng() * 3
      );
    }
  }

  if (level.biome === 'reef') {
    // Coral formations
    for (let i = 0; i < 40; i++) {
      addCoral((rng() - 0.5) * lw * 0.85, -level.waterDepth * 0.5, (rng() - 0.5) * lh * 0.85, rng());
    }
  }

  if (level.biome === 'mudflat') {
    // Mud mounds
    for (let i = 0; i < 30; i++) {
      const geo = new THREE.SphereGeometry(0.4 + rng() * 1.2, 6, 4);
      const mat = new THREE.MeshLambertMaterial({ color: 0x7a6520 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set((rng() - 0.5) * lw * 0.9, C.WATER_LEVEL - 0.3, (rng() - 0.5) * lh * 0.9);
      m.scale.y = 0.4;
      scene.add(m);
    }
  }

  if (level.biome === 'boardwalk') {
    // Tourist boardwalk
    addBoardwalk(lw);
    // Tourists (decorative NPCs)
    for (let i = 0; i < 8; i++) {
      addTouristDecor((rng() - 0.5) * lw * 0.5, C.WATER_LEVEL + 0.05, (rng() - 0.5) * lh * 0.4);
    }
  }

  if (level.biome === 'drain') {
    // Concrete tunnel walls
    addDrainWalls(lw, lh);
  }

  // Rocks (all biomes)
  for (let i = 0; i < 12; i++) {
    const s = 0.5 + rng() * 2.5;
    const geo = new THREE.DodecahedronGeometry(s, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x556655 });
    const r = new THREE.Mesh(geo, mat);
    r.position.set((rng() - 0.5) * lw * 0.8, C.WATER_LEVEL - s * 0.6, (rng() - 0.5) * lh * 0.8);
    r.rotation.set(rng() * 2, rng() * 2, rng() * 2);
    r.castShadow = r.receiveShadow = true;
    scene.add(r);
  }

  // Sky dome
  const skyGeo = new THREE.SphereGeometry(400, 16, 8);
  const skyMat = new THREE.MeshBasicMaterial({
    color: level.ambientColor, side: THREE.BackSide
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
}

function addMangrove(x, y, z, h) {
  // Trunk
  const tGeo = new THREE.CylinderGeometry(0.08, 0.15, h, 5);
  const tMat = new THREE.MeshLambertMaterial({ color: 0x3a2a10 });
  const t = new THREE.Mesh(tGeo, tMat);
  t.position.set(x, y + h / 2 - 0.5, z);
  t.castShadow = true;
  scene.add(t);
  // Canopy
  const cGeo = new THREE.SphereGeometry(h * 0.4, 7, 5);
  const cMat = new THREE.MeshLambertMaterial({ color: C.COLOR_MANGROVE });
  const c = new THREE.Mesh(cGeo, cMat);
  c.position.set(x, y + h * 0.8, z);
  c.scale.y = 0.7;
  c.castShadow = true;
  scene.add(c);
  // Aerial roots (stilt roots)
  for (let i = 0; i < 4; i++) {
    const ang = i * Math.PI / 2;
    const rGeo = new THREE.CylinderGeometry(0.03, 0.05, h * 0.5, 4);
    const r = new THREE.Mesh(rGeo, tMat);
    r.position.set(x + Math.cos(ang) * 0.4, y + h * 0.15, z + Math.sin(ang) * 0.4);
    r.rotation.z = Math.cos(ang) * 0.3;
    r.rotation.x = Math.sin(ang) * 0.3;
    scene.add(r);
  }
}

function addCoral(x, y, z, rng) {
  const colors = [0xff6644, 0xff88aa, 0xffee44, 0x44aaff, 0xaa44ff];
  const col = colors[Math.floor(rng * colors.length)];
  const h = 0.5 + rng * 2;
  const geo = new THREE.ConeGeometry(0.2 + rng * 0.4, h, 5 + Math.floor(rng * 4));
  const mat = new THREE.MeshLambertMaterial({ color: col });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y + h / 2, z);
  m.rotation.z = (rng - 0.5) * 0.4;
  scene.add(m);
}

function addBoardwalk(lw) {
  // Deck planks
  const geo = new THREE.BoxGeometry(lw * 0.6, 0.15, 4);
  const mat = new THREE.MeshLambertMaterial({ color: 0x8b6040 });
  const bw = new THREE.Mesh(geo, mat);
  bw.position.set(0, C.WATER_LEVEL + 0.55, 0);
  bw.castShadow = bw.receiveShadow = true;
  scene.add(bw);
  // Railings
  for (let side of [-1, 1]) {
    const rGeo = new THREE.BoxGeometry(lw * 0.6, 0.8, 0.08);
    const r = new THREE.Mesh(rGeo, mat);
    r.position.set(0, C.WATER_LEVEL + 1.1, side * 2.0);
    scene.add(r);
  }
}

function addTouristDecor(x, y, z) {
  // Capsule-style figure
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 0.8, 4, 6),
    new THREE.MeshLambertMaterial({ color: C.COLOR_TOURIST })
  );
  body.position.set(x, y + 0.9, z);
  body.castShadow = true;
  scene.add(body);
  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xf4c090 })
  );
  head.position.set(x, y + 1.85, z);
  scene.add(head);
  // Hat
  const hat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.32, 0.2, 8),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  );
  hat.position.set(x, y + 2.1, z);
  scene.add(hat);
}

function addDrainWalls(lw, lh) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x505060 });
  const walls = [
    { size: [lw, 12, 0.8], pos: [0, 5, -lh / 2] },
    { size: [lw, 12, 0.8], pos: [0, 5, lh / 2] },
    { size: [0.8, 12, lh], pos: [-lw / 2, 5, 0] },
    { size: [0.8, 12, lh], pos: [lw / 2, 5, 0] },
  ];
  walls.forEach(w => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...w.size), mat);
    m.position.set(...w.pos);
    m.receiveShadow = true;
    scene.add(m);
  });
}

/* ════════════════════════════════════════════════════════════════════
   WALLY MESH — procedural crocodile geometry
   ════════════════════════════════════════════════════════════════════ */
function buildWally() {
  wallyGroup = new THREE.Group();

  const bodyMat = new THREE.MeshPhongMaterial({
    color: C.COLOR_WALLY_BODY,
    specular: 0x334433,
    shininess: 28,
  });
  const bellyMat = new THREE.MeshPhongMaterial({
    color: C.COLOR_WALLY_BELLY,
  });

  // ── Body (tapered box) ───────────────────────────────────────────
  const bodyGeo = new THREE.BoxGeometry(C.WALLY_LENGTH * 0.55, C.WALLY_HEIGHT, C.WALLY_WIDTH);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  wallyGroup.add(body);

  // ── Belly plate ──────────────────────────────────────────────────
  const belly = new THREE.Mesh(
    new THREE.BoxGeometry(C.WALLY_LENGTH * 0.5, 0.04, C.WALLY_WIDTH * 0.6),
    bellyMat
  );
  belly.position.set(0, -C.WALLY_HEIGHT / 2, 0);
  wallyGroup.add(belly);

  // ── Head (wider snout) ───────────────────────────────────────────
  const headGeo = new THREE.BoxGeometry(1.8, C.WALLY_HEIGHT * 0.85, C.WALLY_WIDTH * 0.9);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(C.WALLY_LENGTH * 0.34, 0, 0);
  head.castShadow = true;
  wallyGroup.add(head);

  // Upper jaw
  const upperJaw = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.18, C.WALLY_WIDTH * 0.75),
    bodyMat
  );
  upperJaw.position.set(C.WALLY_LENGTH * 0.47, C.WALLY_HEIGHT * 0.15, 0);
  wallyGroup.add(upperJaw);

  // Lower jaw (animates for chomp)
  jawMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.14, C.WALLY_WIDTH * 0.65),
    bodyMat
  );
  jawMesh.position.set(C.WALLY_LENGTH * 0.47, -C.WALLY_HEIGHT * 0.2, 0);
  wallyGroup.add(jawMesh);

  // Teeth (upper row)
  const toothMat = new THREE.MeshPhongMaterial({ color: 0xfffde8 });
  for (let t = 0; t < 6; t++) {
    const tooth = new THREE.Mesh(
      new THREE.ConeGeometry(0.055, 0.22, 4),
      toothMat
    );
    tooth.position.set(
      C.WALLY_LENGTH * 0.38 + t * 0.18,
      -C.WALLY_HEIGHT * 0.28,
      (t % 2 === 0 ? 0.25 : -0.25)
    );
    tooth.rotation.z = Math.PI;
    wallyGroup.add(tooth);
  }

  // ── Eyes ─────────────────────────────────────────────────────────
  const eyeMat = new THREE.MeshPhongMaterial({ color: C.COLOR_WALLY_EYE, emissive: 0x604000 });
  const pupilMat = new THREE.MeshPhongMaterial({ color: 0x111100 });
  for (let side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), eyeMat);
    eye.position.set(C.WALLY_LENGTH * 0.32, C.WALLY_HEIGHT * 0.58, side * C.WALLY_WIDTH * 0.44);
    wallyGroup.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), pupilMat);
    pupil.position.set(C.WALLY_LENGTH * 0.325, C.WALLY_HEIGHT * 0.58, side * C.WALLY_WIDTH * 0.44);
    wallyGroup.add(pupil);
  }

  // ── Osteoderms (ridged back scales) ──────────────────────────────
  const ridgeMat = new THREE.MeshPhongMaterial({ color: 0x2e5c25 });
  for (let r = 0; r < 10; r++) {
    const ridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.2, 0.12),
      ridgeMat
    );
    ridge.position.set(-C.WALLY_LENGTH * 0.2 + r * 0.26, C.WALLY_HEIGHT * 0.5, 0);
    ridge.rotation.z = (r % 2 === 0 ? 0.1 : -0.1);
    wallyGroup.add(ridge);
  }

  // ── Legs ─────────────────────────────────────────────────────────
  const legMat = new THREE.MeshPhongMaterial({ color: 0x3a5c30 });
  const legPositions = [
    [0.5, -C.WALLY_HEIGHT * 0.45, C.WALLY_WIDTH * 0.55],
    [0.5, -C.WALLY_HEIGHT * 0.45, -C.WALLY_WIDTH * 0.55],
    [-0.8, -C.WALLY_HEIGHT * 0.45, C.WALLY_WIDTH * 0.55],
    [-0.8, -C.WALLY_HEIGHT * 0.45, -C.WALLY_WIDTH * 0.55],
  ];
  legPositions.forEach(lp => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.6, 5), legMat);
    leg.position.set(...lp);
    leg.rotation.z = Math.PI / 2 * (lp[2] > 0 ? 0.4 : -0.4);
    wallyGroup.add(leg);
  });

  // ── Tail (segmented) ─────────────────────────────────────────────
  tailBones = [];
  let prevGroup = wallyGroup;
  for (let i = 0; i < C.TAIL_SEGMENTS; i++) {
    const taper = 1 - i / C.TAIL_SEGMENTS;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(
        C.WALLY_WIDTH * 0.38 * taper * 0.8,
        C.WALLY_WIDTH * 0.38 * taper,
        0.35, 5
      ),
      bodyMat
    );
    seg.rotation.z = Math.PI / 2;
    const segGroup = new THREE.Group();
    segGroup.position.x = i === 0 ? -C.WALLY_LENGTH * 0.3 : -0.35;
    segGroup.add(seg);
    prevGroup.add(segGroup);
    tailBones.push(segGroup);
    prevGroup = segGroup;
  }

  scene.add(wallyGroup);
}

/* ════════════════════════════════════════════════════════════════════
   PREY MESHES
   ════════════════════════════════════════════════════════════════════ */
function spawnPreyMeshes(level) {
  const preyData = W.spawnPrey(level, level.preyCount);

  preyData.forEach(p => {
    const def = p.def;
    const mesh = buildPreyMesh(p.type, def);
    mesh.position.set(p.x, p.y, p.z);
    mesh.userData.prey = p;
    scene.add(mesh);
    preyObjects.push({ data: p, mesh });
  });
}

function buildPreyMesh(type, def) {
  const s = def.size;
  const mat = new THREE.MeshPhongMaterial({ color: def.color });
  let geo;

  if (def.swim) {
    // Fish shape: elongated sphere
    const g = new THREE.SphereGeometry(s * 0.45, 8, 5);
    const m = new THREE.Mesh(g, mat);
    m.scale.x = 2.0;
    m.scale.y = 0.65;
    m.castShadow = true;
    // Tail fin
    const fin = new THREE.Mesh(
      new THREE.ConeGeometry(s * 0.3, s * 0.5, 3),
      mat
    );
    fin.rotation.z = Math.PI / 2;
    fin.position.x = -s * 0.8;
    m.add(fin);
    return m;
  } else if (type === 'tourist') {
    return buildTouristMesh();
  } else if (type === 'mud_crab') {
    const g = new THREE.BoxGeometry(s * 1.4, s * 0.3, s * 0.9);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    return m;
  } else {
    // Generic creature
    geo = new THREE.CapsuleGeometry(s * 0.3, s * 0.6, 4, 6);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  }
}

function buildTouristMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({ color: C.COLOR_TOURIST });
  const headMat = new THREE.MeshPhongMaterial({ color: 0xf4c090 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.7, 3, 6), bodyMat);
  body.position.y = 0.8;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), headMat);
  head.position.y = 1.75;
  g.add(body); g.add(head);
  g.castShadow = true;
  return g;
}

/* ════════════════════════════════════════════════════════════════════
   INPUT
   ════════════════════════════════════════════════════════════════════ */
function setupInput() {
  document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space') { e.preventDefault(); triggerChomp(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') triggerTailSweep();
    if (e.code === 'Escape') togglePause();
  });
  document.addEventListener('keyup', e => { keys[e.code] = false; });

  // Mouse drag for camera
  let mouseDown = false, lastMX = 0, lastMY = 0;
  const cv = document.getElementById('canvas');
  cv.addEventListener('mousedown', e => { mouseDown = true; lastMX = e.clientX; lastMY = e.clientY; });
  cv.addEventListener('mouseup', () => { mouseDown = false; });
  cv.addEventListener('mousemove', e => {
    if (!mouseDown) return;
    camYaw -= (e.clientX - lastMX) * 0.005;
    camPitch = Math.max(0.1, Math.min(1.1, camPitch - (e.clientY - lastMY) * 0.005));
    lastMX = e.clientX; lastMY = e.clientY;
  });

  // Touch / virtual joystick
  setupTouchInput();

  // Chomp button
  const btnChomp = document.getElementById('btn-chomp');
  if (btnChomp) {
    btnChomp.addEventListener('touchstart', e => { e.preventDefault(); triggerChomp(); });
    btnChomp.addEventListener('mousedown', () => triggerChomp());
  }
  const btnSweep = document.getElementById('btn-sweep');
  if (btnSweep) {
    btnSweep.addEventListener('touchstart', e => { e.preventDefault(); triggerTailSweep(); });
    btnSweep.addEventListener('mousedown', () => triggerTailSweep());
  }
}

function setupTouchInput() {
  const joystick = document.getElementById('joystick');
  const knob = document.getElementById('joystick-knob');
  if (!joystick || !knob) return;

  let jStart = null, jMax = 44;

  joystick.addEventListener('touchstart', e => {
    e.preventDefault();
    jStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: false });
  joystick.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!jStart) return;
    const dx = e.touches[0].clientX - jStart.x;
    const dy = e.touches[0].clientY - jStart.y;
    const mag = Math.min(jMax, Math.sqrt(dx * dx + dy * dy));
    const ang = Math.atan2(dy, dx);
    knob.style.transform = `translate(${Math.cos(ang) * mag}px, ${Math.sin(ang) * mag}px)`;
    touchInput.x = dx / jMax;
    touchInput.z = dy / jMax;
  }, { passive: false });
  joystick.addEventListener('touchend', () => {
    jStart = null;
    knob.style.transform = '';
    touchInput.x = touchInput.z = 0;
  });
}

/* ════════════════════════════════════════════════════════════════════
   GAME LOOP (4D temporal substrate)
   ════════════════════════════════════════════════════════════════════ */
function loop(now) {
  requestAnimationFrame(loop);
  if (!gameActive || gamePaused) return;

  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  tideT += dt;

  updateWally(dt);
  updateCamera(dt);
  updatePreyAI(dt);
  updateChomp(now);
  updateParticles(dt);
  updateWater(now);
  updateHUD();

  // Check win / lose
  checkLevelEnd();

  renderer.render(scene, camera);
}

/* ── Wally physics ──────────────────────────────────────────────── */
function updateWally(dt) {
  const w = wally;

  // Inputs
  const moveForward = keys['KeyW'] || keys['ArrowUp'] || touchInput.z < -0.15;
  const moveBack = keys['KeyS'] || keys['ArrowDown'] || touchInput.z > 0.15;
  const turnLeft = keys['KeyA'] || keys['ArrowLeft'] || touchInput.x < -0.15;
  const turnRight = keys['KeyD'] || keys['ArrowRight'] || touchInput.x > 0.15;
  const sprint = keys['ShiftLeft'] || keys['ShiftRight'];

  // Turn
  const turnRate = C.TURN_SPEED * (moveForward || moveBack ? 1 : 0.6);
  if (turnLeft) w.rotY += turnRate * dt;
  if (turnRight) w.rotY -= turnRate * dt;

  // Touch steer
  if (Math.abs(touchInput.x) > 0.15) {
    w.rotY -= touchInput.x * turnRate * dt;
  }

  // Speed
  const speed = sprint ? w.swimSpeed * C.SPRINT_MULT : w.swimSpeed;
  const drag = w.isSubmerged ? C.WATER_DRAG : C.MUD_DRAG;

  if (moveForward) {
    w.vx += Math.sin(w.rotY) * speed * dt * 6;
    w.vz += Math.cos(w.rotY) * speed * dt * 6;
  }
  if (moveBack) {
    w.vx -= Math.sin(w.rotY) * speed * dt * 3;
    w.vz -= Math.cos(w.rotY) * speed * dt * 3;
  }

  // Dive / surface
  if (keys['KeyQ'] || keys['KeyF']) {
    w.vy -= C.DIVE_SPEED * dt;
  }
  if (keys['KeyE'] || keys['KeyR']) {
    w.vy += C.DIVE_SPEED * dt;
  }

  // Drag
  w.vx *= 1 - drag * dt * 8;
  w.vz *= 1 - drag * dt * 8;
  w.vy *= 1 - 0.3 * dt * 8;

  // Integrate
  w.x += w.vx * dt;
  w.z += w.vz * dt;
  w.y = Math.max(-(levelData?.waterDepth || 6),
    Math.min(W.getTideLevel(tideT) + 0.1, w.y + w.vy * dt));
  w.isSubmerged = w.y < W.getTideLevel(tideT) - 0.2;

  // Boundary
  const [lw, lh] = levelData ? levelData.size : [120, 80];
  const hw = lw / 2 - 2, hd = lh / 2 - 2;
  if (w.x > hw) { w.x = hw; w.vx *= -0.5; }
  if (w.x < -hw) { w.x = -hw; w.vx *= -0.5; }
  if (w.z > hd) { w.z = hd; w.vz *= -0.5; }
  if (w.z < -hd) { w.z = -hd; w.vz *= -0.5; }

  // Tail wave animation
  w.tailPhase += dt * 4 * (moveForward ? 1 : 0.3);
  animateTail(w);

  // Jaw chomp animation
  if (w.isChomping) {
    w.chompAnimT = Math.min(1, w.chompAnimT + dt * 8);
    const jawOpen = Math.sin(w.chompAnimT * Math.PI) * 0.45;
    if (jawMesh) jawMesh.rotation.z = -jawOpen;
    if (w.chompAnimT >= 1) { w.isChomping = false; w.chompAnimT = 0; }
  } else if (jawMesh) {
    jawMesh.rotation.z *= 0.85;
  }

  // Apply to mesh
  if (wallyGroup) {
    wallyGroup.position.set(w.x, w.y, w.z);
    wallyGroup.rotation.y = w.rotY;
    // Pitch with velocity
    wallyGroup.rotation.z = Math.atan2(w.vy, Math.sqrt(w.vx * w.vx + w.vz * w.vz)) * 0.5;
    // Breathe/surface idle bob
    wallyGroup.position.y += Math.sin(tideT * 1.5) * 0.04;
  }

  // Hunger
  w.hunger = Math.max(0, w.hunger - C.HUNGER_DECAY_RATE * dt);
  if (w.hunger <= 0) {
    w.health = Math.max(0, w.health - 2 * dt);
    health = Math.round(w.health);
  }

  // Combo timeout
  chompComboTimer -= dt;
  if (chompComboTimer <= 0 && w.chompStreak > 0) {
    w.chompStreak = 0;
    chompStreak = 0;
    setComboLabel('');
  }

  score = w.score;
  hunger = Math.round(w.hunger);
  health = Math.round(w.health);
}

function animateTail(w) {
  if (!tailBones) return;
  for (let i = 0; i < tailBones.length; i++) {
    const lag = i * 0.3;
    const wave = Math.sin(w.tailPhase - lag) * (0.12 + i * 0.015);
    tailBones[i].rotation.y = wave;
  }
}

/* ── Camera ──────────────────────────────────────────────────────── */
function updateCamera(dt) {
  const lag = C.CAM_LAG;
  // Target = Wally + offset in camera-relative space
  camTarget.set(wally.x, wally.y + 1.5, wally.z);

  const dist = C.CAM_DISTANCE;
  const px = wally.x + Math.sin(camYaw) * Math.cos(camPitch) * dist;
  const py = wally.y + Math.sin(camPitch) * dist;
  const pz = wally.z + Math.cos(camYaw) * Math.cos(camPitch) * dist;

  camPos.lerp(new THREE.Vector3(px, py, pz), 1 - Math.pow(lag, dt * 60));
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
}

/* ── Prey AI tick ────────────────────────────────────────────────── */
function updatePreyAI(dt) {
  const live = preyObjects.filter(p => p.data.alive);
  W.updatePreyAI(live.map(p => p.data), wally.x, wally.z, dt);

  preyObjects.forEach(p => {
    if (!p.data.alive) {
      if (p.mesh.visible) {
        p.mesh.visible = false;
        spawnChompParticles(p.mesh.position.clone(), p.data.def.color);
      }
      return;
    }
    p.mesh.position.set(p.data.x, p.data.y, p.data.z);
    p.mesh.rotation.y = p.data.rotY - Math.PI / 2;
    // Idle swim bob for fish
    if (p.data.def.swim) {
      p.mesh.position.y += Math.sin(tideT * 2 + p.data.id) * 0.08;
    }
  });
}

/* ── Chomp trigger ───────────────────────────────────────────────── */
function triggerChomp() {
  if (!gameActive || gamePaused) return;
  wally.isChomping = true;
  wally.chompAnimT = 0;
}

function updateChomp(now) {
  const result = W.tryChomp(wally, preyObjects.map(p => p.data), now);
  if (!result) return;

  chompStreak = result.combo;
  chompComboTimer = 3.0;
  score = wally.score;

  // Combo feedback
  const label = W.Scoring.comboLabel(result.combo);
  if (label) setComboLabel(label);

  // Screen flash
  flashScreen();
}

function triggerTailSweep() {
  if (!gameActive || gamePaused) return;
  const stunned = W.tryTailSweep(wally, preyObjects.map(p => p.data));
  if (stunned.length > 0) {
    flashScreen(0x40c0ff, 0.25);
  }
}

/* ── Particles ───────────────────────────────────────────────────── */
function spawnChompParticles(pos, color) {
  for (let i = 0; i < 14; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08 + Math.random() * 0.12, 4, 3),
      new THREE.MeshBasicMaterial({ color })
    );
    mesh.position.copy(pos);
    const spd = 2 + Math.random() * 4;
    const ang = Math.random() * Math.PI * 2;
    const elev = (Math.random() - 0.5) * Math.PI;
    mesh.userData.vel = new THREE.Vector3(
      Math.cos(ang) * Math.cos(elev) * spd,
      Math.sin(elev) * spd,
      Math.sin(ang) * Math.cos(elev) * spd
    );
    mesh.userData.life = 0.8 + Math.random() * 0.5;
    mesh.userData.maxLife = mesh.userData.life;
    scene.add(mesh);
    particles.push(mesh);
  }

  // Water splash rings
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3 + i * 0.4, 0.4 + i * 0.4, 12),
      new THREE.MeshBasicMaterial({ color: 0xaaddcc, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos);
    ring.position.y = C.WATER_LEVEL;
    ring.userData.vel = new THREE.Vector3(0, 0, 0);
    ring.userData.scale = 1 + i * 0.6;
    ring.userData.life = 0.7;
    ring.userData.maxLife = 0.7;
    ring.userData.isRing = true;
    scene.add(ring);
    particles.push(ring);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.userData.life -= dt;
    if (p.userData.life <= 0) {
      scene.remove(p);
      p.geometry.dispose();
      p.material.dispose();
      particles.splice(i, 1);
      continue;
    }
    const t = 1 - p.userData.life / p.userData.maxLife;
    if (p.userData.isRing) {
      const s = 1 + t * p.userData.scale * 3;
      p.scale.set(s, s, s);
      p.material.opacity = (1 - t) * 0.5;
    } else {
      p.userData.vel.y -= 9.8 * dt;
      p.position.addScaledVector(p.userData.vel, dt);
      const s = 1 - t * 0.7;
      p.scale.set(s, s, s);
    }
  }
}

/* ── Water animation ────────────────────────────────────────────── */
function updateWater(now) {
  if (waterUniforms) {
    waterUniforms.uTime.value = now * 0.001;
  }
  const tide = W.getTideLevel(tideT);
  if (waterMesh) waterMesh.position.y = tide;
}

/* ── Screen flash ────────────────────────────────────────────────── */
function flashScreen(col = 0xffdd00, alpha = 0.35) {
  const f = document.getElementById('flash');
  if (!f) return;
  const hex = '#' + col.toString(16).padStart(6, '0');
  f.style.background = hex;
  f.style.opacity = alpha;
  setTimeout(() => { f.style.opacity = 0; }, 120);
}

/* ── Level end ───────────────────────────────────────────────────── */
function checkLevelEnd() {
  if (gameOver) return;
  if (health <= 0) {
    endGame(false);
    return;
  }
  const allEaten = preyObjects.every(p => !p.data.alive);
  const reachedTarget = wally.score >= (levelData?.targetScore || 500);
  if (allEaten || reachedTarget) {
    endGame(true);
  }
}

function endGame(win) {
  gameOver = true;
  gameActive = false;
  const grade = W.Scoring.getGrade(wally.score, levelData?.targetScore || 500);
  document.getElementById('end-overlay').style.display = 'flex';
  document.getElementById('end-title').textContent = win ? 'LEVEL CLEAR!' : 'GAME OVER';
  document.getElementById('end-score').textContent = `Score: ${wally.score}`;
  document.getElementById('end-grade').textContent = `Grade: ${grade}`;
  document.getElementById('end-next').style.display = win ? 'inline-block' : 'none';
  const nextLevel = (levelData?.id || 1) + 1;
  document.getElementById('end-next').onclick = () => {
    location.href = `game.html?level=${nextLevel}`;
  };
}

function togglePause() {
  if (gameOver) return;
  gamePaused = !gamePaused;
  document.getElementById('pause-overlay').style.display = gamePaused ? 'flex' : 'none';
}

/* ── HUD ─────────────────────────────────────────────────────────── */
function updateHUD() {
  setText('hud-score', score);
  setText('hud-health', health);
  setText('hud-hunger', hunger);
  setText('hud-streak', chompStreak > 1 ? `×${chompStreak}` : '');
  // Bar fill
  setBarWidth('bar-health', health);
  setBarWidth('bar-hunger', hunger);
  setBarWidth('bar-score', Math.min(100, (score / (levelData?.targetScore || 500)) * 100));
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}
function setBarWidth(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.width = pct + '%';
}
function setComboLabel(txt) {
  const el = document.getElementById('combo-label');
  if (el) {
    el.textContent = txt;
    el.style.opacity = txt ? '1' : '0';
  }
}

/* ── Misc ────────────────────────────────────────────────────────── */
function onResize() {
  const canvas = document.getElementById('canvas');
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
}

/** Mulberry32 seeded RNG — deterministic level layout */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ── Boot ────────────────────────────────────────────────────────── */
window.addEventListener('load', init);
window.triggerChomp = triggerChomp;
window.triggerTailSweep = triggerTailSweep;
window.togglePause = togglePause;
