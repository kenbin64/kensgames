// fasttrack-billiard.js
// The billiard room: the pool-hall environment round the board. It is opt-in (set window.FT_BILLIARD_ROOM = true
// before the game scripts load), so it lives in its own file and 3d.html loads it only when switched on: every
// other visit downloads about 65 KB less (measured 2026-10-26: it never ran in a normal game). It uses the game's
// shared names (THREE, scene and the rest), which plain scripts on one page share.
// createHexBilliardTable is kept here with it although nothing calls it at present.

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

