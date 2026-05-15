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
  const BLOB_COUNT = 14;
  const WIN_PCT = 75;

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
  const footer = document.getElementById('footer');
  if (footer) {
    footer.innerHTML =
      '<span class="key">MOVE</span> mouse to walk &#9632; ' +
      '<span class="key">HOLD LMB</span> to stake &#9632; ' +
      '<span class="key">RMB</span> orbit &#9632; ' +
      '<span class="key">C</span> inside / outside view';
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

  // OrbitControls — right-button rotate so left button is free for staking.
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.1;
  controls.maxDistance = 40;
  controls.mouseButtons = {
    LEFT: null,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.touches = {
    ONE: null,
    TWO: THREE.TOUCH.DOLLY_ROTATE,
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
  const shell = new THREE.Mesh(shellGeom, shellMaterial);
  scene.add(shell);

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
  scene.add(glow);

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
    scene.add(m);
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

  // ─── Qix entities ────────────────────────────────────────────────────────
  const qixGroup = new THREE.Group();
  scene.add(qixGroup);
  const qix = [];
  const QIX_COLORS = [0xff00ff, 0xff3377, 0xff00aa];
  for (let i = 0; i < QIX_COUNT; i++) {
    const color = QIX_COLORS[i % QIX_COLORS.length];
    const trailLen = 28;
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailLen * 3), 3));
    const trailMat = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const trail = new THREE.Line(trailGeo, trailMat);
    qixGroup.add(trail);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 10),
      new THREE.MeshBasicMaterial({
        color: color,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 1,
      })
    );
    qixGroup.add(head);
    qix.push({
      u: Math.random() * U_MAX,
      v: 0.5 * V_MAX + (Math.random() - 0.5) * V_MAX * 0.4,
      du: (Math.random() - 0.5) * 1.5,
      dv: (Math.random() - 0.5) * 2.5,
      head: head,
      trail: trail,
      trailGeo: trailGeo,
      trailLen: trailLen,
      history: [],
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
  scene.add(claimedMesh);
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
  };

  const playerMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.42, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  scene.add(playerMesh);

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
  scene.add(stakeLine);

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
    player.score += 100 + filledR * 5;
    player.stakePath = [];
    stakeGeo.setDrawRange(0, 0);
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
  let mouseDown = false;
  let cursorCell = null;

  renderer.domElement.addEventListener('pointermove', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  });
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button === 0) mouseDown = true;
  });
  window.addEventListener('pointerup', (e) => {
    if (e.button === 0) {
      mouseDown = false;
      if (player.staking) closeStake();
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

    if (mouseDown) {
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
  function updateQix(dt) {
    const tmp = new THREE.Vector3();
    for (const q of qix) {
      q.du += (Math.random() - 0.5) * 2.4 * dt;
      q.dv += (Math.random() - 0.5) * 4.0 * dt;
      q.du = Math.max(-2.0, Math.min(2.0, q.du));
      q.dv = Math.max(-3.0, Math.min(3.0, q.dv));
      q.u = wrapU(q.u + q.du * dt);
      q.v += q.dv * dt;
      if (q.v < 0) { q.v = 0; q.dv = Math.abs(q.dv); }
      if (q.v > V_MAX) { q.v = V_MAX; q.dv = -Math.abs(q.dv); }

      surfacePoint(q.u, q.v, tmp);
      q.head.position.copy(tmp);
      q.history.unshift(tmp.x); q.history.unshift(tmp.y); q.history.unshift(tmp.z);
      if (q.history.length > q.trailLen * 3) q.history.length = q.trailLen * 3;
      const arr = q.trailGeo.attributes.position.array;
      for (let k = 0; k < q.trailLen; k++) {
        const o = Math.min(k * 3, q.history.length - 3);
        arr[k * 3 + 0] = q.history[o + 0] || 0;
        arr[k * 3 + 1] = q.history[o + 1] || 0;
        arr[k * 3 + 2] = q.history[o + 2] || 0;
      }
      q.trailGeo.attributes.position.needsUpdate = true;

      // collide with active stake path
      if (player.staking && player.stakePath.length) {
        const qi = Math.floor(q.u / U_MAX * U_STEPS) % U_STEPS;
        const qj = Math.floor(q.v / V_MAX * V_STEPS);
        for (const cell of player.stakePath) {
          if (cell.i === qi && cell.j === qj) {
            playerHit();
            return;
          }
        }
      }
    }
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
    if (hudScore) hudScore.textContent = player.score;
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

    if (claimedDirty) {
      rebuildClaimedMesh(t);
      claimedDirty = false;
    }

    // Slow drift of the shell for the lava-lamp feel.
    shell.rotation.y = t * 0.04;
    glow.rotation.y = t * 0.04;

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
