// qixoid/game.js — 3D Qix on a parametric twisted shell
// Surface (Blender source):
//   x = cos(v) * (1 + cos(u)) * sin(v/8)
//   y = sin(u) * sin(v/8) + cos(v/8) * 1.5
//   z = sin(v) * (1 + cos(u)) * sin(v/8)
//   u ∈ [0, 2π], 32 steps    v ∈ [0, 4π], 128 steps
//
// Mechanics:
//   - Move: cursor pulls the player along the (u,v) grid on the shell.
//   - Stake: hold LEFT mouse while moving from claimed into unclaimed.
//     Release / re-enter claimed to close. Right-of-path floods.
//   - Orbit: RIGHT mouse drag.  Toggle inside/outside view: C.
//   - Win at 75% claimed.

(function () {
  'use strict';

  // ─── Config ──────────────────────────────────────────────────────────────
  const U_STEPS = 32;
  const V_STEPS = 128;
  const U_MAX = Math.PI * 2;
  const V_MAX = Math.PI * 4;
  const SHELL_SCALE = 3.0;       // ~6-unit shell
  const QIX_COUNT = 3;
  const QIX_TENTACLES = 6;        // tentacles per Qix
  const QIX_TENTACLE_SEGS = 14;   // segments per tentacle
  const QIX_TENTACLE_REACH = 1.1; // world-space reach in shell units
  const BLOB_COUNT = 14;
  const WIN_PCT = 80;

  // Palette: cyan / green / purple / amber
  const PALETTE = [
    new THREE.Color(0x00ffff),
    new THREE.Color(0x00ff41),
    new THREE.Color(0x9900ff),
    new THREE.Color(0xffb000),
  ];

  // ─── Parametric surface ──────────────────────────────────────────────────
  function surfacePoint(u, v, out) {
    const r = 1 + Math.cos(u);
    const sv8 = Math.sin(v / 8);
    const cv8 = Math.cos(v / 8);
    out.x = Math.cos(v) * r * sv8 * SHELL_SCALE;
    out.y = (Math.sin(u) * sv8 + cv8 * 1.5) * SHELL_SCALE;
    out.z = Math.sin(v) * r * sv8 * SHELL_SCALE;
    return out;
  }

  const _np = new THREE.Vector3();
  const _npu = new THREE.Vector3();
  const _npv = new THREE.Vector3();
  function surfaceNormal(u, v, out) {
    const eps = 1e-3;
    surfacePoint(u, v, _np);
    surfacePoint(u + eps, v, _npu).sub(_np);
    surfacePoint(u, v + eps, _npv).sub(_np);
    out.crossVectors(_npu, _npv);
    if (out.lengthSq() < 1e-10) out.set(0, 1, 0);
    else out.normalize();
    return out;
  }

  // ─── DOM hooks ───────────────────────────────────────────────────────────
  const stage = document.getElementById('stage');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('start-btn');
  const hudClaimed = document.getElementById('hud-claimed');
  const hudLives = document.getElementById('hud-lives');
  const hudScore = document.getElementById('hud-score');
  const hudStake = document.getElementById('hud-stake');
  const footer = document.getElementById('footer');
  if (footer) {
    footer.innerHTML =
      '<span class="key">LMB DRAG</span> rotate &#9632; ' +
      '<span class="key">RMB DRAG</span> pan &#9632; ' +
      '<span class="key">WHEEL</span> zoom &#9632; ' +
      '<span class="key">G</span> Whorl grid &#9632; ' +
      '<span class="key">WASD/Arrows</span> paint edge &#9632; ' +
      '<span class="key">C</span> inside view';
  }

  // ─── Three.js bootstrap ──────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04040c);
  scene.fog = new THREE.FogExp2(0x04040c, 0.035);

  const camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.05, 200
  );
  camera.position.set(0, 4, 14);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  stage.appendChild(renderer.domElement);

  // OrbitControls — used only for zooming (wheel/middle) and panning the view
  // (right button). LEFT button rotates the SHELL ITSELF (handled below) so
  // the player sees the model move, not the camera orbit around it.
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableRotate = false;                // shell drag does rotation
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.screenSpacePanning = true;
  controls.panSpeed = 0.9;
  controls.zoomSpeed = 0.9;
  controls.minDistance = 0.1;
  controls.maxDistance = 40;
  controls.mouseButtons = {
    LEFT: null,                                 // reserved for shell drag
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.touches = {
    ONE: null,                                  // reserved for shell drag
    TWO: THREE.TOUCH.DOLLY_PAN,
  };

  // ─── Lighting ────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x223344, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(8, 12, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6688ff, 0.25);
  rim.position.set(-6, -4, -8);
  scene.add(rim);

  // Inner colored point lights — these refract through the translucent shell
  // and are the "lava lamp" core. They drift on the surface like the blobs.
  const innerLights = [];
  for (let i = 0; i < 4; i++) {
    const L = new THREE.PointLight(PALETTE[i].getHex(), 2.4, 14, 1.6);
    scene.add(L);
    innerLights.push({
      light: L,
      u: Math.random() * U_MAX,
      v: Math.random() * V_MAX,
      du: (Math.random() - 0.5) * 0.7,
      dv: (Math.random() - 0.5) * 1.4,
      base: 2.0 + Math.random() * 1.2,
    });
  }

  // ─── Shell geometry ──────────────────────────────────────────────────────
  function buildShellGeometry() {
    const cols = V_STEPS + 1;
    const rows = U_STEPS + 1;
    const positions = new Float32Array(rows * cols * 3);
    const colors = new Float32Array(rows * cols * 3);
    const uvs = new Float32Array(rows * cols * 2);
    const indices = [];
    const tmp = new THREE.Vector3();
    let p = 0;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const u = (i / U_STEPS) * U_MAX;
        const v = (j / V_STEPS) * V_MAX;
        surfacePoint(u, v, tmp);
        positions[p * 3 + 0] = tmp.x;
        positions[p * 3 + 1] = tmp.y;
        positions[p * 3 + 2] = tmp.z;

        // gradient along v through the four palette colors
        const phase = (j / V_STEPS) * PALETTE.length;
        const a = PALETTE[Math.floor(phase) % PALETTE.length];
        const b = PALETTE[(Math.floor(phase) + 1) % PALETTE.length];
        const t = phase - Math.floor(phase);
        colors[p * 3 + 0] = a.r * (1 - t) + b.r * t;
        colors[p * 3 + 1] = a.g * (1 - t) + b.g * t;
        colors[p * 3 + 2] = a.b * (1 - t) + b.b * t;

        uvs[p * 2 + 0] = i / U_STEPS;
        uvs[p * 2 + 1] = j / V_STEPS;
        p++;
      }
    }
    for (let i = 0; i < U_STEPS; i++) {
      for (let j = 0; j < V_STEPS; j++) {
        const a = i * cols + j;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(indices);
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  }

  const shellGeom = buildShellGeometry();

  // Translucent + reflective glass shell.
  const shellMaterial = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    transmission: 0.65,
    thickness: 0.9,
    roughness: 0.18,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    ior: 1.45,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0x111133),
    emissiveIntensity: 0.45,
    envMapIntensity: 1.0,
  });
  // World group — everything that lives ON the shell goes in here so a single
  // rotation moves the shell, its glow, the claimed overlay, blobs, player
  // and the Qix together. Lights stay in world space.
  const world = new THREE.Group();
  scene.add(world);

  const shell = new THREE.Mesh(shellGeom, shellMaterial);
  world.add(shell);

  // Inner additive glow gives the lava-lamp interior its colored haze.
  const glowMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(shellGeom, glowMat);
  glow.scale.setScalar(0.96);
  world.add(glow);

  // ─── Lava-lamp blobs ─────────────────────────────────────────────────────
  const blobs = [];
  const blobGeo = new THREE.SphereGeometry(0.18, 16, 12);
  for (let i = 0; i < BLOB_COUNT; i++) {
    const idx = i % PALETTE.length;
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE[idx].clone(),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const m = new THREE.Mesh(blobGeo, mat);
    world.add(m);
    blobs.push({
      mesh: m,
      mat: mat,
      u: Math.random() * U_MAX,
      v: Math.random() * V_MAX,
      du: (Math.random() - 0.5) * 0.7,
      dv: (Math.random() - 0.5) * 1.4,
      phase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.5 + Math.random() * 1.0,
      size: 0.7 + Math.random() * 0.8,
      colorPhase: Math.random() * PALETTE.length,
      colorSpeed: 0.08 + Math.random() * 0.12,
    });
  }

  // ─── Qix entities (meandering plasmas with writhing tentacles) ───────────
  const qixGroup = new THREE.Group();
  world.add(qixGroup);
  const qix = [];
  const QIX_COLORS = [0xff00ff, 0xff3377, 0xff00aa];
  const QIX_PUFFS = 6; // sphere puffs per cloud
  for (let i = 0; i < QIX_COUNT; i++) {
    const color = QIX_COLORS[i % QIX_COLORS.length];

    // Cloud-like core: several offset puff spheres that drift and breathe
    // independently around a shared centroid. Together they read as a
    // soft amorphous plasma rather than a solid ball.
    const puffs = [];
    for (let p = 0; p < QIX_PUFFS; p++) {
      const mat = new THREE.MeshBasicMaterial({
        color: color,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.55,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), mat);
      qixGroup.add(mesh);
      puffs.push({
        mesh: mesh,
        mat: mat,
        // each puff orbits the centroid on its own little path
        phase: Math.random() * Math.PI * 2,
        freq: 0.6 + Math.random() * 1.8,
        radius: 0.08 + Math.random() * 0.22,
        sizeBase: 0.18 + Math.random() * 0.18,
        sizePhase: Math.random() * Math.PI * 2,
        sizeFreq: 0.7 + Math.random() * 2.0,
        // axes of orbit (random unit vector pair)
        ax: Math.random() * Math.PI * 2,
        ay: Math.random() * Math.PI * 2,
      });
    }

    // Soft outer halo
    const haloMat = new THREE.MeshBasicMaterial({
      color: color,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.22,
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), haloMat);
    qixGroup.add(halo);

    // Writhing tentacles: each is a polyline of QIX_TENTACLE_SEGS points.
    const tentacles = [];
    for (let t = 0; t < QIX_TENTACLES; t++) {
      const tGeo = new THREE.BufferGeometry();
      const tPos = new Float32Array(QIX_TENTACLE_SEGS * 3);
      tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
      const tMat = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });
      const line = new THREE.Line(tGeo, tMat);
      qixGroup.add(line);

      // Glowing tip
      const tipMat = new THREE.MeshBasicMaterial({
        color: color,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 1.0,
      });
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), tipMat);
      qixGroup.add(tip);

      tentacles.push({
        geo: tGeo,
        pos: tPos,
        line: line,
        tip: tip,
        tipMat: tipMat,
        // randomized motion params per tentacle
        phase: Math.random() * Math.PI * 2,
        freq: 1.2 + Math.random() * 2.0,
        twist: 0.6 + Math.random() * 1.8,
        baseAngle: (t / QIX_TENTACLES) * Math.PI * 2,
        wobble: 0.4 + Math.random() * 0.9,
        // last computed tip cell — used for filament collision
        tipI: -1,
        tipJ: -1,
      });
    }

    qix.push({
      u: Math.random() * U_MAX,
      v: 0.5 * V_MAX + (Math.random() - 0.5) * V_MAX * 0.4,
      du: (Math.random() - 0.5) * 1.5,
      dv: (Math.random() - 0.5) * 2.5,
      puffs: puffs,
      halo: halo,
      haloMat: haloMat,
      tentacles: tentacles,
      // Slow stretch envelope drives global size: 0 = compact ball,
      // 1 = sprawling cloud. Multiple sin waves + occasional spike.
      stretchPhase: Math.random() * Math.PI * 2,
      stretchSpike: 0,        // brief 0..1 spike, decays
      nextSpikeAt: 2 + Math.random() * 4, // seconds until next spike
      stretch: 0.5,           // current 0..1 envelope
    });
  }

  // ─── Claimed grid ────────────────────────────────────────────────────────
  const claimed = new Array(U_STEPS);
  for (let i = 0; i < U_STEPS; i++) claimed[i] = new Uint8Array(V_STEPS);
  let claimedCount = 0;
  const totalCells = U_STEPS * V_STEPS;

  // Visualization mesh for claimed cells.
  const claimedGeo = new THREE.BufferGeometry();
  const claimedPos = new Float32Array(totalCells * 6 * 3);
  const claimedCol = new Float32Array(totalCells * 6 * 3);
  claimedGeo.setAttribute('position', new THREE.BufferAttribute(claimedPos, 3));
  claimedGeo.setAttribute('color', new THREE.BufferAttribute(claimedCol, 3));
  claimedGeo.setDrawRange(0, 0);
  const claimedMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const claimedMesh = new THREE.Mesh(claimedGeo, claimedMat);
  claimedMesh.frustumCulled = false;
  world.add(claimedMesh);
  let claimedDirty = true;

  function rebuildClaimedMesh(time) {
    const c00 = new THREE.Vector3(), c10 = new THREE.Vector3();
    const c01 = new THREE.Vector3(), c11 = new THREE.Vector3();
    let p = 0, c = 0;
    for (let i = 0; i < U_STEPS; i++) {
      for (let j = 0; j < V_STEPS; j++) {
        if (!claimed[i][j]) continue;
        const u0 = (i / U_STEPS) * U_MAX, u1 = ((i + 1) / U_STEPS) * U_MAX;
        const v0 = (j / V_STEPS) * V_MAX, v1 = ((j + 1) / V_STEPS) * V_MAX;
        surfacePoint(u0, v0, c00);
        surfacePoint(u1, v0, c10);
        surfacePoint(u0, v1, c01);
        surfacePoint(u1, v1, c11);
        // shrink toward centroid for a tile gap
        const cx = (c00.x + c10.x + c01.x + c11.x) * 0.25;
        const cy = (c00.y + c10.y + c01.y + c11.y) * 0.25;
        const cz = (c00.z + c10.z + c01.z + c11.z) * 0.25;
        const k = 0.88;
        const corners = [c00, c10, c01, c11];
        for (let q = 0; q < 4; q++) {
          corners[q].x = cx + (corners[q].x - cx) * k;
          corners[q].y = cy + (corners[q].y - cy) * k;
          corners[q].z = cz + (corners[q].z - cz) * k;
        }
        const phase = ((j / V_STEPS) * PALETTE.length + time * 0.3)
          % PALETTE.length;
        const a = PALETTE[Math.floor(phase) % PALETTE.length];
        const b = PALETTE[(Math.floor(phase) + 1) % PALETTE.length];
        const t = phase - Math.floor(phase);
        const cr = a.r * (1 - t) + b.r * t;
        const cg = a.g * (1 - t) + b.g * t;
        const cb = a.b * (1 - t) + b.b * t;
        // 2 triangles: (00,01,10), (10,01,11)
        const order = [c00, c01, c10, c10, c01, c11];
        for (let k2 = 0; k2 < 6; k2++) {
          claimedPos[p++] = order[k2].x;
          claimedPos[p++] = order[k2].y;
          claimedPos[p++] = order[k2].z;
          claimedCol[c++] = cr;
          claimedCol[c++] = cg;
          claimedCol[c++] = cb;
        }
      }
    }
    claimedGeo.setDrawRange(0, p / 3);
    claimedGeo.attributes.position.needsUpdate = true;
    claimedGeo.attributes.color.needsUpdate = true;
    claimedGeo.computeBoundingSphere();
  }

  // ─── Player + stake ──────────────────────────────────────────────────────
  const player = {
    u: Math.PI,
    v: 0.05,
    speed: 5.0,             // (u,v)-units per second
    staking: false,
    stakePath: [],
    lastOnClaimed: true,
    lives: 3,
    score: 0,
    lastFillCells: 0,
    lastFillAward: 0,
    lastFillFlashUntil: 0,
  };

  const playerMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.42, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  world.add(playerMesh);

  const stakeGeo = new THREE.BufferGeometry();
  const STAKE_MAX = 512;
  const stakePos = new Float32Array(STAKE_MAX * 3);
  stakeGeo.setAttribute('position', new THREE.BufferAttribute(stakePos, 3));
  stakeGeo.setDrawRange(0, 0);
  const stakeLine = new THREE.Line(
    stakeGeo,
    new THREE.LineBasicMaterial({
      color: 0xffffaa,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    })
  );
  world.add(stakeLine);

  function refreshStakeLine() {
    const len = Math.min(player.stakePath.length, STAKE_MAX);
    const tmp = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let k = 0; k < len; k++) {
      const cell = player.stakePath[k];
      const u = ((cell.i + 0.5) / U_STEPS) * U_MAX;
      const v = ((cell.j + 0.5) / V_STEPS) * V_MAX;
      surfacePoint(u, v, tmp);
      surfaceNormal(u, v, n).multiplyScalar(0.1);
      stakePos[k * 3 + 0] = tmp.x + n.x;
      stakePos[k * 3 + 1] = tmp.y + n.y;
      stakePos[k * 3 + 2] = tmp.z + n.z;
    }
    stakeGeo.setDrawRange(0, len);
    stakeGeo.attributes.position.needsUpdate = true;

    // Filament heats up as the stake grows: yellow → orange → red.
    // The longer the stake, the more visible the risk.
    const t = Math.min(1, len / 80);
    const r = 1.0;
    const g = 1.0 - t * 0.85;
    const b = 0.6 - t * 0.6;
    stakeLine.material.color.setRGB(r, Math.max(0, g), Math.max(0, b));
    stakeLine.material.opacity = 0.85 + t * 0.15;

    // Live risk readout in the HUD: roughly what closing the stake right
    // now would award if the smaller side has ~ this many cells.
    if (hudStake) {
      if (len < 2) {
        hudStake.textContent = '—';
        hudStake.style.color = '';
      } else {
        // Heuristic: assume the enclosed pocket is ~ len cells; payouts use
        // the same power curve as closeStake().
        const projected = 100 + Math.round(Math.pow(len, 1.4) * 5);
        hudStake.textContent = '+' + projected;
        // Color the readout the same temperature as the filament.
        const cr = Math.round(255);
        const cg = Math.round(Math.max(0, g) * 255);
        const cb = Math.round(Math.max(0, b) * 255);
        hudStake.style.color = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
      }
    }
  }

  function startStake() {
    player.staking = true;
    player.stakePath = [];
  }

  function addToStake(i, j) {
    const last = player.stakePath[player.stakePath.length - 1];
    if (last && last.i === i && last.j === j) return;
    player.stakePath.push({ i: i, j: j });
    if (player.stakePath.length >= STAKE_MAX) closeStake();
    else refreshStakeLine();
  }

  function closeStake() {
    if (!player.staking) return;
    player.staking = false;
    const path = player.stakePath;
    if (path.length < 2) {
      player.stakePath = [];
      stakeGeo.setDrawRange(0, 0);
      return;
    }
    // Mark the path itself as claimed.
    for (const cell of path) {
      if (!claimed[cell.i][cell.j]) {
        claimed[cell.i][cell.j] = 1;
        claimedCount++;
      }
    }
    // Right-side flood (right = right-perpendicular of average path tangent
    // in the (i,j) grid).
    let dx = 0, dy = 0;
    for (let k = 1; k < path.length; k++) {
      let di = path[k].i - path[k - 1].i;
      // wrap shorter way for u (closed)
      if (di > U_STEPS / 2) di -= U_STEPS;
      if (di < -U_STEPS / 2) di += U_STEPS;
      dx += di;
      dy += path[k].j - path[k - 1].j;
    }
    const px = Math.sign(dy);
    const py = -Math.sign(dx);
    const mid = path[Math.floor(path.length / 2)];
    let filledR = floodFill(mid.i + px, mid.j + py);
    if (filledR === 0) {
      // fall back to opposite side if right side was already enclosed.
      filledR = floodFill(mid.i - px, mid.j - py);
    }
    // Risk-rewarding payout: power curve so big fills pay disproportionately
    // more than small ones. 10 cells ≈ +225, 50 cells ≈ +1265, 200 cells ≈ +7340.
    const fillBonus = Math.round(Math.pow(filledR, 1.4) * 5);
    const award = 100 + fillBonus;
    player.score += award;
    player.lastFillCells = filledR;
    player.lastFillAward = award;
    player.lastFillFlashUntil = performance.now() + 1400;
    player.stakePath = [];
    stakeGeo.setDrawRange(0, 0);
    if (hudStake) { hudStake.textContent = '—'; hudStake.style.color = ''; }
    claimedDirty = true;
    updateHUD();
  }

  function floodFill(startI, startJ) {
    const wi0 = ((startI % U_STEPS) + U_STEPS) % U_STEPS;
    if (startJ < 0 || startJ >= V_STEPS) return 0;
    if (claimed[wi0][startJ]) return 0;
    const stack = [[wi0, startJ]];
    let count = 0;
    const cap = totalCells;
    while (stack.length) {
      const [i, j] = stack.pop();
      if (j < 0 || j >= V_STEPS) continue;
      const wi = ((i % U_STEPS) + U_STEPS) % U_STEPS;
      if (claimed[wi][j]) continue;
      claimed[wi][j] = 1;
      claimedCount++;
      count++;
      if (count > cap) break;
      stack.push([wi + 1, j]);
      stack.push([wi - 1, j]);
      stack.push([wi, j + 1]);
      stack.push([wi, j - 1]);
    }
    return count;
  }

  // ─── Mouse / raycast ─────────────────────────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let stakeHeld = false;          // Space-bar held to stake
  let dragging = false;           // LMB held to rotate the shell
  let dragLastX = 0, dragLastY = 0;
  const SHELL_ROT_SPEED = 0.008;  // radians per pixel
  let cursorCell = null;

  renderer.domElement.addEventListener('pointermove', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    if (dragging) {
      const dx = e.clientX - dragLastX;
      const dy = e.clientY - dragLastY;
      dragLastX = e.clientX;
      dragLastY = e.clientY;
      // Rotate the world group: horizontal drag = yaw, vertical drag = pitch.
      world.rotation.y += dx * SHELL_ROT_SPEED;
      world.rotation.x += dy * SHELL_ROT_SPEED;
    }
  });
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button === 0) {
      dragging = true;
      dragLastX = e.clientX;
      dragLastY = e.clientY;
      try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) { }
    }
  });
  window.addEventListener('pointerup', (e) => {
    if (e.button === 0) {
      dragging = false;
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) { }
    }
  });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  // ─── Player update ───────────────────────────────────────────────────────
  function clampV(v) { return Math.max(0, Math.min(V_MAX - 1e-4, v)); }
  function wrapU(u) { return ((u % U_MAX) + U_MAX) % U_MAX; }

  function updatePlayer(dt) {
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(shell, false);
    if (hits.length) {
      const vIdx = hits[0].face.a;
      const cols = V_STEPS + 1;
      let i = Math.floor(vIdx / cols);
      let j = vIdx % cols;
      if (i >= U_STEPS) i = U_STEPS - 1;
      if (j >= V_STEPS) j = V_STEPS - 1;
      cursorCell = { i: i, j: j };
    }

    if (cursorCell) {
      const tu = ((cursorCell.i + 0.5) / U_STEPS) * U_MAX;
      const tv = ((cursorCell.j + 0.5) / V_STEPS) * V_MAX;
      let du = tu - player.u;
      if (du > Math.PI) du -= U_MAX;
      if (du < -Math.PI) du += U_MAX;
      const dv = tv - player.v;
      const dist = Math.hypot(du, dv);
      if (dist > 0.005) {
        const step = Math.min(dist, player.speed * dt);
        player.u = wrapU(player.u + (du / dist) * step);
        player.v = clampV(player.v + (dv / dist) * step);
      }
    }

    const pi = Math.floor(player.u / U_MAX * U_STEPS) % U_STEPS;
    const pj = Math.max(0, Math.min(V_STEPS - 1,
      Math.floor(player.v / V_MAX * V_STEPS)));
    const onClaimed = !!claimed[pi][pj];

    if (stakeHeld) {
      if (!player.staking && !onClaimed && player.lastOnClaimed) {
        startStake();
      }
      if (player.staking) {
        if (onClaimed && player.stakePath.length > 1) {
          closeStake();
        } else if (!onClaimed) {
          addToStake(pi, pj);
        }
      }
    } else if (player.staking) {
      // Space released while still staking — close the loop.
      closeStake();
    }
    player.lastOnClaimed = onClaimed;

    const tmp = new THREE.Vector3();
    const n = new THREE.Vector3();
    surfacePoint(player.u, player.v, tmp);
    surfaceNormal(player.u, player.v, n);
    playerMesh.position.copy(tmp).addScaledVector(n, 0.18);
    playerMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  }

  // ─── Qix update ──────────────────────────────────────────────────────────
  // Each Qix is a meandering plasma core with QIX_TENTACLES writhing arms.
  // The core wanders on the (u,v) shell; tentacles wave in 3-space around it
  // and their tips are pulled back onto the shell so they can collide with
  // an in-progress filament.
  let qixTime = 0;
  const _qHead = new THREE.Vector3();
  const _qN = new THREE.Vector3();
  const _qT1 = new THREE.Vector3();
  const _qT2 = new THREE.Vector3();
  const _qOff = new THREE.Vector3();
  const _qSeg = new THREE.Vector3();

  // Build a tangent frame at (u,v) by sampling neighbours on the shell.
  function tangentFrame(u, v, outT1, outT2, outN) {
    const eps = 0.01;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    surfacePoint(u, v, a);
    surfacePoint(u + eps, v, b);
    surfacePoint(u, v + eps, c);
    outT1.copy(b).sub(a).normalize();
    outT2.copy(c).sub(a).normalize();
    surfaceNormal(u, v, outN);
  }

  // Project a world-space point back to the nearest (u,v) cell on the shell.
  // Cheap approximation: search a small (u,v) neighbourhood around the head.
  function nearestCell(worldP, cu, cv, outIJ) {
    let best = Infinity;
    let bi = 0, bj = 0;
    const tmp = new THREE.Vector3();
    const RU = 4, RV = 6;
    const ci = Math.floor(cu / U_MAX * U_STEPS);
    const cj = Math.floor(cv / V_MAX * V_STEPS);
    for (let di = -RU; di <= RU; di++) {
      for (let dj = -RV; dj <= RV; dj++) {
        const i = ((ci + di) % U_STEPS + U_STEPS) % U_STEPS;
        const j = cj + dj;
        if (j < 0 || j >= V_STEPS) continue;
        const u = ((i + 0.5) / U_STEPS) * U_MAX;
        const v = ((j + 0.5) / V_STEPS) * V_MAX;
        surfacePoint(u, v, tmp);
        const d = tmp.distanceToSquared(worldP);
        if (d < best) { best = d; bi = i; bj = j; }
      }
    }
    outIJ.i = bi;
    outIJ.j = bj;
  }

  const _ij = { i: 0, j: 0 };

  function updateQix(dt) {
    qixTime += dt;
    let hit = false;

    for (const q of qix) {
      // Meander the plasma core
      q.du += (Math.random() - 0.5) * 2.4 * dt;
      q.dv += (Math.random() - 0.5) * 4.0 * dt;
      q.du = Math.max(-2.0, Math.min(2.0, q.du));
      q.dv = Math.max(-3.0, Math.min(3.0, q.dv));
      q.u = wrapU(q.u + q.du * dt);
      q.v += q.dv * dt;
      if (q.v < 0) { q.v = 0; q.dv = Math.abs(q.dv); }
      if (q.v > V_MAX) { q.v = V_MAX; q.dv = -Math.abs(q.dv); }

      surfacePoint(q.u, q.v, _qHead);
      q.halo.position.copy(_qHead);

      // ── Stretch envelope: 0 = compact ball, 1 = sprawling cloud ────────
      // Two slow sin waves blended; occasional spike makes it suddenly bloom.
      q.stretchPhase += dt;
      const slow = 0.5 + 0.5 * Math.sin(q.stretchPhase * 0.4);
      const wob = 0.5 + 0.5 * Math.sin(q.stretchPhase * 1.1 + 1.7);
      let env = 0.45 * slow + 0.25 * wob; // 0..0.7
      q.nextSpikeAt -= dt;
      if (q.nextSpikeAt <= 0) {
        q.stretchSpike = 1.0;
        q.nextSpikeAt = 2.5 + Math.random() * 5.0;
      }
      q.stretchSpike *= Math.exp(-dt * 0.9);
      env += q.stretchSpike * 0.5;
      q.stretch = Math.min(1, env);                          // 0..1
      const cloudScale = 0.5 + q.stretch * 1.5;              // 0.5..2.0

      // Halo follows stretch
      q.halo.scale.setScalar(0.7 + q.stretch * 1.6);
      q.haloMat.opacity = 0.12 + q.stretch * 0.28;

      // Tangent frame for tentacle waving and puff drift
      tangentFrame(q.u, q.v, _qT1, _qT2, _qN);

      // ── Drive cloud puffs ──────────────────────────────────────────────
      for (const P of q.puffs) {
        const a = P.ax + qixTime * P.freq * 0.6;
        const b = P.ay + qixTime * P.freq * 0.4;
        const r = P.radius * cloudScale;
        // Position on a noisy lissajous around centroid in the tangent frame
        const lx = Math.sin(a) * r;
        const ly = Math.cos(b) * r;
        const lz = Math.sin(a + b) * r * 0.6;
        _qSeg.copy(_qHead)
          .addScaledVector(_qT1, lx)
          .addScaledVector(_qT2, ly)
          .addScaledVector(_qN, lz);
        P.mesh.position.copy(_qSeg);
        const breathe = 0.7 + 0.5 * Math.sin(qixTime * P.sizeFreq + P.sizePhase);
        P.mesh.scale.setScalar(P.sizeBase * breathe * (0.7 + cloudScale * 0.6));
        P.mat.opacity = 0.45 + 0.25 * breathe;
      }

      // Head cell for collision (use centroid)
      const qi = Math.floor(q.u / U_MAX * U_STEPS) % U_STEPS;
      const qj = Math.max(0, Math.min(V_STEPS - 1,
        Math.floor(q.v / V_MAX * V_STEPS)));

      // Drive tentacles — reach grows with the stretch envelope
      for (const T of q.tentacles) {
        const arr = T.pos;
        const ang = T.baseAngle + qixTime * T.twist * 0.4;
        const dirX = Math.cos(ang);
        const dirY = Math.sin(ang);
        const reachMax = QIX_TENTACLE_REACH * (0.55 + q.stretch * 1.1);
        for (let s = 0; s < QIX_TENTACLE_SEGS; s++) {
          const t = s / (QIX_TENTACLE_SEGS - 1);
          const reach = reachMax * t;
          const wobAmp = T.wobble * (0.6 + q.stretch * 0.8);
          const wob = Math.sin(qixTime * T.freq + T.phase + t * Math.PI * 2.4)
            * wobAmp * t;
          const lx = dirX * reach + (-dirY) * wob * 0.35;
          const ly = dirY * reach + (dirX) * wob * 0.35;
          const lz = Math.sin(t * Math.PI) * 0.18
            + Math.cos(qixTime * T.freq * 0.5 + T.phase) * 0.05 * t;
          _qSeg.copy(_qHead)
            .addScaledVector(_qT1, lx)
            .addScaledVector(_qT2, ly)
            .addScaledVector(_qN, lz);
          arr[s * 3 + 0] = _qSeg.x;
          arr[s * 3 + 1] = _qSeg.y;
          arr[s * 3 + 2] = _qSeg.z;
        }
        T.geo.attributes.position.needsUpdate = true;

        // Glowing tip mesh sits on the last segment
        const lastIdx = (QIX_TENTACLE_SEGS - 1) * 3;
        T.tip.position.set(arr[lastIdx], arr[lastIdx + 1], arr[lastIdx + 2]);
        T.tip.scale.setScalar(0.7 + q.stretch * 0.8);
        T.tipMat.opacity = 0.7 + 0.3 * Math.sin(qixTime * T.freq * 1.3 + T.phase);

        // Collide tentacle TIP cell against active stake path
        if (player.staking && player.stakePath.length && !hit) {
          _qOff.set(arr[lastIdx], arr[lastIdx + 1], arr[lastIdx + 2]);
          nearestCell(_qOff, q.u, q.v, _ij);
          T.tipI = _ij.i; T.tipJ = _ij.j;
          for (const cell of player.stakePath) {
            const di = ((cell.i - T.tipI + U_STEPS) % U_STEPS);
            const wrap = Math.min(di, U_STEPS - di);
            if (wrap <= 1 && Math.abs(cell.j - T.tipJ) <= 1) {
              hit = true;
              break;
            }
          }
        }
      }

      // Collide cloud core against active stake path — radius grows with stretch
      if (player.staking && player.stakePath.length && !hit) {
        const coreR = 1 + Math.floor(q.stretch * 1.5); // 1..2 cells
        for (const cell of player.stakePath) {
          const di = ((cell.i - qi + U_STEPS) % U_STEPS);
          const wrap = Math.min(di, U_STEPS - di);
          if (wrap <= coreR && Math.abs(cell.j - qj) <= coreR) {
            hit = true;
            break;
          }
        }
      }
    }

    if (hit) playerHit();
  }

  function playerHit() {
    player.lives--;
    player.staking = false;
    player.stakePath = [];
    stakeGeo.setDrawRange(0, 0);
    updateHUD();
    if (player.lives <= 0) gameOver();
  }

  // ─── Lava-lamp blob update ───────────────────────────────────────────────
  function updateBlobs(dt, time) {
    const tmp = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (const b of blobs) {
      b.u = wrapU(b.u + b.du * dt);
      b.v += b.dv * dt;
      if (b.v < 0) { b.v = 0; b.dv = Math.abs(b.dv); }
      if (b.v > V_MAX) { b.v = V_MAX; b.dv = -Math.abs(b.dv); }
      surfacePoint(b.u, b.v, tmp);
      surfaceNormal(b.u, b.v, n).multiplyScalar(-0.45);
      tmp.add(n);
      b.mesh.position.copy(tmp);
      const pulse = 0.7 + 0.3 * Math.sin(time * b.pulseSpeed + b.phase);
      b.mesh.scale.setScalar(b.size * pulse);

      // color cycle through palette
      b.colorPhase = (b.colorPhase + b.colorSpeed * dt) % PALETTE.length;
      const ca = PALETTE[Math.floor(b.colorPhase) % PALETTE.length];
      const cb = PALETTE[(Math.floor(b.colorPhase) + 1) % PALETTE.length];
      const tt = b.colorPhase - Math.floor(b.colorPhase);
      b.mat.color.setRGB(
        ca.r * (1 - tt) + cb.r * tt,
        ca.g * (1 - tt) + cb.g * tt,
        ca.b * (1 - tt) + cb.b * tt
      );
      b.mat.opacity = 0.6 + 0.3 * pulse;
    }
    for (const L of innerLights) {
      L.u = wrapU(L.u + L.du * dt * 0.4);
      L.v += L.dv * dt * 0.4;
      if (L.v < 0) { L.v = 0; L.dv = Math.abs(L.dv); }
      if (L.v > V_MAX) { L.v = V_MAX; L.dv = -Math.abs(L.dv); }
      surfacePoint(L.u, L.v, tmp);
      surfaceNormal(L.u, L.v, n).multiplyScalar(-0.6);
      tmp.add(n);
      L.light.position.copy(tmp);
      L.light.intensity = L.base + Math.sin(time * 0.7 + L.u) * 0.6;
    }
  }

  // ─── HUD + manifold bridge ──────────────────────────────────────────────
  window.__MANIFOLD__ = {
    schema_version: '1.0',
    claimedPercent: 0,
    lives: player.lives,
    score: player.score,
    qixPosition: [],
  };

  function updateHUD() {
    const pct = Math.floor(100 * claimedCount / totalCells);
    if (hudClaimed) hudClaimed.textContent = pct + '%';
    if (hudLives) hudLives.textContent = player.lives;

    // Score area flashes the bonus from the last fill so the risk
    // payoff is felt visually for ~1.4 s after closing a big stake.
    if (hudScore) {
      const flashing = performance.now() < player.lastFillFlashUntil;
      if (flashing && player.lastFillAward > 0) {
        hudScore.textContent = player.score + '  (+' + player.lastFillAward + ')';
        hudScore.style.color = (player.lastFillCells > 60) ? '#ff4080' : '';
      } else {
        hudScore.textContent = player.score;
        hudScore.style.color = '';
      }
    }
    window.__MANIFOLD__.claimedPercent = pct;
    window.__MANIFOLD__.lives = player.lives;
    window.__MANIFOLD__.score = player.score;
    window.__MANIFOLD__.qixPosition = qix.map((q) => ({ u: q.u, v: q.v }));
    if (pct >= WIN_PCT && !won && started) winGame();
  }

  // ─── Game state ──────────────────────────────────────────────────────────
  let started = false;
  let won = false;

  function setOverlay(title, sub, btnText) {
    overlay.classList.remove('hidden');
    const panel = overlay.querySelector('.panel');
    panel.querySelector('h1').textContent = title;
    panel.querySelector('.sub').textContent = sub;
    startBtn.textContent = btnText;
  }

  function gameOver() {
    started = false;
    setOverlay('GAME OVER',
      'CLAIMED ' + Math.floor(100 * claimedCount / totalCells) + '%',
      '\u25B6 RESTART');
  }
  function winGame() {
    started = false;
    won = true;
    setOverlay('YOU WIN',
      'CLAIMED ' + Math.floor(100 * claimedCount / totalCells) + '%',
      '\u25B6 PLAY AGAIN');
  }

  function resetGame() {
    for (let i = 0; i < U_STEPS; i++) claimed[i].fill(0);
    claimedCount = 0;
    // Pre-claim a starter strip along v=0 so closed loops have a boundary.
    for (let i = 0; i < U_STEPS; i++) {
      claimed[i][0] = 1;
      claimedCount++;
    }
    claimedDirty = true;
    player.lives = 3;
    player.score = 0;
    player.u = Math.PI;
    player.v = 0.5 * (V_MAX / V_STEPS);
    player.staking = false;
    player.stakePath = [];
    player.lastOnClaimed = true;
    stakeGeo.setDrawRange(0, 0);
    won = false;
    updateHUD();
  }

  function start() {
    if (won || player.lives <= 0 || claimedCount === 0) resetGame();
    overlay.classList.add('hidden');
    started = true;
  }
  startBtn.addEventListener('click', start);

  // ─── Camera toggle ───────────────────────────────────────────────────────
  let insideView = false;
  function toggleCamera() {
    insideView = !insideView;
    if (insideView) {
      // Inside the shell, near the central column.
      camera.position.set(0.0, 4.0, 0.0);
      controls.target.set(0.01, 4.0, 0.01);
      camera.fov = 95;
      camera.near = 0.05;
      controls.minDistance = 0.05;
      controls.maxDistance = 8;
    } else {
      camera.position.set(0, 4, 14);
      controls.target.set(0, 0, 0);
      camera.fov = 60;
      camera.near = 0.05;
      controls.minDistance = 0.1;
      controls.maxDistance = 40;
    }
    camera.updateProjectionMatrix();
    controls.update();
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'c' || e.key === 'C') toggleCamera();
    if (e.code === 'Space') { stakeHeld = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { stakeHeld = false; e.preventDefault(); }
  });

  // ─── Whorl mode: edge-painting grid ──────────────────────────────────────
  // A coarse grid of vertices laid on the shell surface. The player snaps to
  // a vertex, steps with arrows / WASD to a neighbour, and the traversed edge
  // is painted. Press G to toggle Whorl mode on/off.
  const GU = 16;                       // vertex columns around u (wraps)
  const GV = 32;                       // vertex rows along v (clamped)
  const EDGE_OFFSET = 0.12;            // lift painted edges off the surface

  // Edge state lookups: separate maps for u-edges and v-edges so we can flip
  // them independently when painted.
  // uEdge[i][j] = edge from vertex (i,j) to ((i+1)%GU, j)
  // vEdge[i][j] = edge from vertex (i,j) to (i, j+1)
  const uEdge = [], vEdge = [];
  for (let i = 0; i < GU; i++) {
    uEdge.push(new Uint8Array(GV + 1));
    vEdge.push(new Uint8Array(GV));
  }

  // Build a single LineSegments mesh for the entire grid; we recolor segments
  // in-place when an edge is painted. Two segments per cell-edge.
  function gridVertexPos(i, j, out) {
    const u = (i / GU) * U_MAX;
    const v = (j / GV) * V_MAX;
    return surfacePoint(u, v, out);
  }
  function gridVertexLifted(i, j, out, tmpN) {
    gridVertexPos(i, j, out);
    const u = (i / GU) * U_MAX;
    const v = (j / GV) * V_MAX;
    surfaceNormal(u, v, tmpN);
    out.addScaledVector(tmpN, EDGE_OFFSET);
    return out;
  }

  const totalEdges = GU * (GV + 1) + GU * GV;  // u-edges + v-edges
  const gridGeo = new THREE.BufferGeometry();
  const gridPos = new Float32Array(totalEdges * 2 * 3);
  const gridCol = new Float32Array(totalEdges * 2 * 3);
  gridGeo.setAttribute('position', new THREE.BufferAttribute(gridPos, 3));
  gridGeo.setAttribute('color', new THREE.BufferAttribute(gridCol, 3));
  const gridMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const gridMesh = new THREE.LineSegments(gridGeo, gridMat);
  gridMesh.visible = false;
  world.add(gridMesh);

  // Per-segment offsets so we can index into the attribute arrays.
  // u-edges first: segIdx = i*(GV+1) + j
  // v-edges next:  segIdx = GU*(GV+1) + i*GV + j
  const U_BASE = 0;
  const V_BASE = GU * (GV + 1);

  const COL_OPEN = new THREE.Color(0x224466);
  const COL_PAINTED = new THREE.Color(0xffe800);
  function writeSegColor(segIdx, color) {
    const p = segIdx * 6;
    gridCol[p + 0] = color.r; gridCol[p + 1] = color.g; gridCol[p + 2] = color.b;
    gridCol[p + 3] = color.r; gridCol[p + 4] = color.g; gridCol[p + 5] = color.b;
    gridGeo.attributes.color.needsUpdate = true;
  }
  function writeSegPos(segIdx, a, b) {
    const p = segIdx * 6;
    gridPos[p + 0] = a.x; gridPos[p + 1] = a.y; gridPos[p + 2] = a.z;
    gridPos[p + 3] = b.x; gridPos[p + 4] = b.y; gridPos[p + 5] = b.z;
  }
  (function buildGrid() {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < GU; i++) {
      for (let j = 0; j <= GV; j++) {
        gridVertexLifted(i, j, a, n);
        gridVertexLifted((i + 1) % GU, j, b, n);
        writeSegPos(U_BASE + i * (GV + 1) + j, a, b);
        writeSegColor(U_BASE + i * (GV + 1) + j, COL_OPEN);
      }
    }
    for (let i = 0; i < GU; i++) {
      for (let j = 0; j < GV; j++) {
        gridVertexLifted(i, j, a, n);
        gridVertexLifted(i, j + 1, b, n);
        writeSegPos(V_BASE + i * GV + j, a, b);
        writeSegColor(V_BASE + i * GV + j, COL_OPEN);
      }
    }
    gridGeo.attributes.position.needsUpdate = true;
  })();

  // Vertex cursor — a small bright sphere snapped to grid vertices.
  const cursor = {
    i: 0, j: Math.floor(GV / 2),
    mesh: new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe800 })
    ),
  };
  cursor.mesh.visible = false;
  world.add(cursor.mesh);
  function placeCursor() {
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    gridVertexLifted(cursor.i, cursor.j, p, n);
    cursor.mesh.position.copy(p);
  }
  placeCursor();

  let whorlMode = false;
  function toggleWhorl() {
    whorlMode = !whorlMode;
    gridMesh.visible = whorlMode;
    cursor.mesh.visible = whorlMode;
    whorlFillMesh.visible = whorlMode;
    if (whorlMode) { playerMesh.visible = false; updateWhorlHUD(); }
    else playerMesh.visible = true;
  }

  function paintUEdge(i, j) {
    if (uEdge[i][j]) return;
    uEdge[i][j] = 1;
    writeSegColor(U_BASE + i * (GV + 1) + j, COL_PAINTED);
  }
  function paintVEdge(i, j) {
    if (vEdge[i][j]) return;
    vEdge[i][j] = 1;
    writeSegColor(V_BASE + i * GV + j, COL_PAINTED);
  }

  function stepCursor(di, dj) {
    if (!whorlMode) return;
    const ni = ((cursor.i + di) % GU + GU) % GU;          // wrap u
    const nj = Math.max(0, Math.min(GV, cursor.j + dj));  // clamp v
    if (ni === cursor.i && nj === cursor.j) return;       // hit v boundary
    if (di !== 0) {
      // u-edge: from min(i,ni) outgoing, but with wrap we use cursor.i if di>0
      const ei = di > 0 ? cursor.i : ni;
      paintUEdge(ei, cursor.j);
    } else {
      const ej = dj > 0 ? cursor.j : nj;
      paintVEdge(cursor.i, ej);
    }
    cursor.i = ni; cursor.j = nj;
    placeCursor();
    runClosure();
  }

  // ─── Closure / flood fill ───────────────────────────────────────────────
  // closedCell[i][j] = 1 once enclosed by painted edges.
  const closedCell = [];
  for (let i = 0; i < GU; i++) closedCell.push(new Uint8Array(GV));
  let closedCount = 0;
  const TOTAL_CELLS = GU * GV;

  // Pre-allocate a closed-cell mesh — 6 verts per cell, vertex coloured.
  const whorlFillGeo = new THREE.BufferGeometry();
  const whorlFillPos = new Float32Array(TOTAL_CELLS * 6 * 3);
  const whorlFillCol = new Float32Array(TOTAL_CELLS * 6 * 3);
  whorlFillGeo.setAttribute('position', new THREE.BufferAttribute(whorlFillPos, 3));
  whorlFillGeo.setAttribute('color', new THREE.BufferAttribute(whorlFillCol, 3));
  whorlFillGeo.setDrawRange(0, 0);
  const whorlFillMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const whorlFillMesh = new THREE.Mesh(whorlFillGeo, whorlFillMat);
  whorlFillMesh.frustumCulled = false;
  whorlFillMesh.visible = false;
  world.add(whorlFillMesh);

  // HUD percent / score reuse Qixoid's elements when in Whorl mode.
  const PHI = 1.6180339887;
  function whorlScore(p) { return Math.floor(1000 * Math.pow(p, PHI)); }

  function rebuildWhorlFill() {
    const c00 = new THREE.Vector3(), c10 = new THREE.Vector3();
    const c01 = new THREE.Vector3(), c11 = new THREE.Vector3();
    const n = new THREE.Vector3();
    let p = 0, c = 0;
    for (let i = 0; i < GU; i++) {
      for (let j = 0; j < GV; j++) {
        if (!closedCell[i][j]) continue;
        gridVertexLifted(i, j, c00, n);
        gridVertexLifted((i + 1) % GU, j, c10, n);
        gridVertexLifted(i, j + 1, c01, n);
        gridVertexLifted((i + 1) % GU, j + 1, c11, n);
        // shrink slightly toward centroid so painted edges remain visible
        const cx = (c00.x + c10.x + c01.x + c11.x) * 0.25;
        const cy = (c00.y + c10.y + c01.y + c11.y) * 0.25;
        const cz = (c00.z + c10.z + c01.z + c11.z) * 0.25;
        const k = 0.92;
        const corners = [c00, c10, c01, c11];
        for (let q = 0; q < 4; q++) {
          corners[q].x = cx + (corners[q].x - cx) * k;
          corners[q].y = cy + (corners[q].y - cy) * k;
          corners[q].z = cz + (corners[q].z - cz) * k;
        }
        // color: phi-cycled palette pulled from existing palette
        const phase = ((j / GV) * PALETTE.length) % PALETTE.length;
        const a = PALETTE[Math.floor(phase) % PALETTE.length];
        const b = PALETTE[(Math.floor(phase) + 1) % PALETTE.length];
        const tt = phase - Math.floor(phase);
        const cr = a.r * (1 - tt) + b.r * tt;
        const cg = a.g * (1 - tt) + b.g * tt;
        const cb = a.b * (1 - tt) + b.b * tt;
        const order = [c00, c01, c10, c10, c01, c11];
        for (let k2 = 0; k2 < 6; k2++) {
          whorlFillPos[p++] = order[k2].x;
          whorlFillPos[p++] = order[k2].y;
          whorlFillPos[p++] = order[k2].z;
          whorlFillCol[c++] = cr;
          whorlFillCol[c++] = cg;
          whorlFillCol[c++] = cb;
        }
      }
    }
    whorlFillGeo.setDrawRange(0, p / 3);
    whorlFillGeo.attributes.position.needsUpdate = true;
    whorlFillGeo.attributes.color.needsUpdate = true;
    whorlFillGeo.computeBoundingSphere();
  }

  // Flood fill from the v=0 and v=GV boundaries through OPEN cells, treating
  // painted edges as walls. Any open cell not reached is enclosed → close it.
  function runClosure() {
    const visited = [];
    for (let i = 0; i < GU; i++) visited.push(new Uint8Array(GV));
    const stack = [];
    // Seed from both v-boundaries; any cell already closed acts as a wall.
    for (let i = 0; i < GU; i++) {
      if (!closedCell[i][0]) { visited[i][0] = 1; stack.push(i, 0); }
      if (!closedCell[i][GV - 1]) {
        if (!visited[i][GV - 1]) { visited[i][GV - 1] = 1; stack.push(i, GV - 1); }
      }
    }
    while (stack.length) {
      const j = stack.pop();
      const i = stack.pop();
      // neighbour −j across uEdge[i][j]
      if (j > 0 && !visited[i][j - 1] && !closedCell[i][j - 1] && !uEdge[i][j]) {
        visited[i][j - 1] = 1; stack.push(i, j - 1);
      }
      // neighbour +j across uEdge[i][j+1]
      if (j < GV - 1 && !visited[i][j + 1] && !closedCell[i][j + 1] && !uEdge[i][j + 1]) {
        visited[i][j + 1] = 1; stack.push(i, j + 1);
      }
      // neighbour −i across vEdge[i][j]
      const im = (i - 1 + GU) % GU;
      if (!visited[im][j] && !closedCell[im][j] && !vEdge[i][j]) {
        visited[im][j] = 1; stack.push(im, j);
      }
      // neighbour +i across vEdge[(i+1)%GU][j]
      const ip = (i + 1) % GU;
      if (!visited[ip][j] && !closedCell[ip][j] && !vEdge[ip][j]) {
        visited[ip][j] = 1; stack.push(ip, j);
      }
    }
    // Any unvisited, currently open cell is enclosed.
    let newlyClosed = 0;
    for (let i = 0; i < GU; i++) {
      for (let j = 0; j < GV; j++) {
        if (!closedCell[i][j] && !visited[i][j]) {
          closedCell[i][j] = 1;
          newlyClosed++;
        }
      }
    }
    if (newlyClosed > 0) {
      closedCount += newlyClosed;
      rebuildWhorlFill();
      updateWhorlHUD();
    }
  }

  function updateWhorlHUD() {
    if (!whorlMode) return;
    const p = closedCount / TOTAL_CELLS;
    const pct = (p * 100).toFixed(0);
    if (hudClaimed) hudClaimed.textContent = pct + '%';
    if (hudScore) hudScore.textContent = String(whorlScore(p));
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'g' || e.key === 'G') { toggleWhorl(); return; }
    if (!whorlMode) return;
    switch (e.key) {
      case 'ArrowRight': case 'd': case 'D': stepCursor(+1, 0); break;
      case 'ArrowLeft': case 'a': case 'A': stepCursor(-1, 0); break;
      case 'ArrowUp': case 'w': case 'W': stepCursor(0, +1); break;
      case 'ArrowDown': case 's': case 'S': stepCursor(0, -1); break;
      default: return;
    }
    e.preventDefault();
  });

  // ─── Resize ──────────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ─── Initial state ───────────────────────────────────────────────────────
  resetGame();

  // ─── Loop ────────────────────────────────────────────────────────────────
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    if (started) {
      updatePlayer(dt);
      updateQix(dt);
    }
    updateBlobs(dt, t);

    // Keep the score-bonus flash visible for the full ~1.4s window.
    if (player.lastFillFlashUntil > now) {
      updateHUD();
    } else if (player.lastFillFlashUntil > 0 && player.lastFillFlashUntil <= now) {
      player.lastFillFlashUntil = 0;
      updateHUD();
    }

    if (claimedDirty) {
      rebuildClaimedMesh(t);
      claimedDirty = false;
    }

    // Shell rotation is now driven entirely by the user's LMB drag — no auto-spin.

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
