// ═══════════════════════════════════════════════════════════════════════════
// STARFIGHTER — SHIP PAINTER (manifold substrate)
// ═══════════════════════════════════════════════════════════════════════════
// The GLB on disk is the artist's reference painting. This substrate is the
// painter — given the codex silhouette as a seed (x), it composes the now (z)
// from primitives, parametric surfaces, and emissive seams. No GLB needed.
//
//   x = seed   (palette, dimensions, feature flags drawn from codex)
//   y = lens   (paint*() composer functions below)
//   z = group  (a fully-detailed THREE.Group ready for the scene)
//
// Exposes window.ShipPainter.paint(type, opts?) → THREE.Group
// Loaded BEFORE bundle.js so createEntityMesh's fallback path can call it.
// ───────────────────────────────────────────────────────────────────────────
(function () {
  if (typeof window === 'undefined' || !window.THREE) return;
  const T = window.THREE;
  const Utils = T.BufferGeometryUtils || null;

  const _merge = (geos) => {
    if (Utils && typeof Utils.mergeBufferGeometries === 'function') {
      return Utils.mergeBufferGeometries(geos, false);
    }
    const g = new T.BufferGeometry();
    return geos[0] || g;
  };
  const _xform = (g, tx, ty, tz, sx, sy, sz, rx, ry, rz) => {
    if (rx) g.applyMatrix4(new T.Matrix4().makeRotationX(rx));
    if (ry) g.applyMatrix4(new T.Matrix4().makeRotationY(ry));
    if (rz) g.applyMatrix4(new T.Matrix4().makeRotationZ(rz));
    if (sx !== undefined) g.applyMatrix4(new T.Matrix4().makeScale(sx, sy ?? sx, sz ?? sx));
    g.applyMatrix4(new T.Matrix4().makeTranslation(tx || 0, ty || 0, tz || 0));
    return g;
  };

  // ── Hive Drone Fighter ───────────────────────────────────────────────────
  // Codex: "Compact organic-metallic hybrid. Chitinous wing panels, paired
  // engine vents, soft bioluminescent emerald glow along the spine."
  function paintHiveDrone(opts) {
    opts = opts || {};
    const L = opts.length || 50;          // total fuselage length (units)
    const W = opts.wingspan || 56;        // tip-to-tip wingspan
    const P = opts.palette || {
      hull: 0x18261c, chitin: 0x0a140d, vein: 0x44ff66, glass: 0x041008,
    };

    const mats = {
      hull:   new T.MeshStandardMaterial({ color: P.hull,   metalness: 0.55, roughness: 0.45 }),
      chitin: new T.MeshStandardMaterial({ color: P.chitin, metalness: 0.65, roughness: 0.35 }),
      vein:   new T.MeshStandardMaterial({ color: 0x000000, emissive: P.vein, emissiveIntensity: 1.6 }),
      glass:  new T.MeshStandardMaterial({ color: P.glass, metalness: 0.0, roughness: 0.08,
                transparent: true, opacity: 0.78, emissive: P.vein, emissiveIntensity: 0.25 }),
      core:   new T.MeshBasicMaterial({ color: 0xaaffcc, transparent: true,
                opacity: 0.9, blending: T.AdditiveBlending }),
    };

    const group = new T.Group();
    group.name = 'painted:drone';

    // Fuselage: lathe with insectoid taper (nose → thorax → engine ring)
    const profile = [[0.0,-L*0.55],[1.6,-L*0.52],[3.2,-L*0.42],[5.0,-L*0.22],
                     [6.0, L*0.00],[5.7, L*0.16],[4.2, L*0.30],
                     [6.6, L*0.40],[5.0, L*0.46]].map(p => new T.Vector2(p[0], p[1]));
    const fuselage = new T.Mesh(new T.LatheGeometry(profile, 28), mats.hull);
    fuselage.rotation.x = Math.PI / 2;
    group.add(fuselage);

    // Dorsal chitin plates — 5 segmented elytra panels along the spine
    const chitinGeos = [];
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const z = -L * 0.42 + t * L * 0.82;
      const r = 5.6 - Math.abs(t - 0.4) * 4.2;
      chitinGeos.push(_xform(new T.BoxGeometry(r * 1.25, 1.3, L * 0.14, 1, 1, 3),
                              0, r * 0.82, z));
    }

    // Wings: extruded elytra profile, mirrored, plus chitin overlay strakes
    const ws = new T.Shape();
    ws.moveTo(0, 0);
    ws.bezierCurveTo(W*0.10, -2.5, W*0.32, -3.0, W*0.48, -2.0);
    ws.bezierCurveTo(W*0.40,  3.5, W*0.18,  5.5, 0, 3.6);
    ws.lineTo(0, 0);
    const wingGeo = new T.ExtrudeGeometry(ws, { depth: 1.4, bevelEnabled: true,
      bevelSize: 0.4, bevelThickness: 0.4, bevelSegments: 1, steps: 1 });
    wingGeo.translate(0, 0, -0.7);
    chitinGeos.push(_xform(wingGeo.clone(),  3.5, -1.0,  L*0.04));
    chitinGeos.push(_xform(wingGeo.clone(), -3.5, -1.0,  L*0.04, -1, 1, 1));

    // Wing strakes (chitin ribs) — 3 per side
    for (const side of [1, -1]) {
      for (let s = 0; s < 3; s++) {
        chitinGeos.push(_xform(new T.BoxGeometry(W*0.42, 0.55, 0.9),
                                side * (W*0.21 + 3.5), -0.55, L*0.02 + (s-1)*1.2));
      }
    }
    group.add(new T.Mesh(_merge(chitinGeos), mats.chitin));

    // Emissive vein network — dorsal spine + wing veins + leading-edge glow
    const veinGeos = [];
    veinGeos.push(_xform(new T.BoxGeometry(0.9, 0.5, L*0.78), 0, 6.5, 0));
    for (const side of [1, -1]) {
      veinGeos.push(_xform(new T.BoxGeometry(W*0.45, 0.35, 0.4),
                            side * (W*0.22 + 3.5), 0.35, L*0.04));
      veinGeos.push(_xform(new T.BoxGeometry(0.4, 0.35, W*0.22),
                            side * (W*0.20 + 3.5), 0.35, L*0.10, 0, 0, 0, 0, Math.PI/2, 0));
    }
    group.add(new T.Mesh(_merge(veinGeos), mats.vein));

    // Cockpit: faceted dark canopy at the bow
    const canopy = new T.Mesh(new T.IcosahedronGeometry(3.4, 1), mats.glass);
    canopy.position.set(0, 3.2, -L * 0.42);
    canopy.scale.set(1.0, 0.7, 1.4);
    group.add(canopy);

    // Twin engine vents — outer chitin nacelle + hot additive core
    for (const side of [1, -1]) {
      const nac = new T.Mesh(new T.CylinderGeometry(2.2, 1.6, 7, 14, 1, true), mats.chitin);
      nac.rotation.x = Math.PI / 2; nac.position.set(side * 3.4, -0.5, L * 0.45);
      group.add(nac);
      const core = new T.Mesh(new T.CylinderGeometry(1.6, 1.2, 6, 12), mats.core);
      core.rotation.x = Math.PI / 2; core.position.set(side * 3.4, -0.5, L * 0.46);
      group.add(core);
    }

    // Antennas — two thin dorsal whiskers, slightly back-swept
    for (const side of [1, -1]) {
      const ant = new T.Mesh(new T.CylinderGeometry(0.18, 0.05, 8, 6), mats.chitin);
      ant.position.set(side * 1.4, 7.5, L * 0.12);
      ant.rotation.x = -0.35; ant.rotation.z = side * 0.18;
      group.add(ant);
    }

    // Wingtip glow spots (mirrored bioluminescent caps)
    for (const side of [1, -1]) {
      const tip = new T.Mesh(new T.SphereGeometry(1.1, 10, 8), mats.core);
      tip.position.set(side * (W * 0.46 + 3.5), 0.4, L * 0.04);
      group.add(tip);
    }

    return group;
  }

  window.ShipPainter = {
    paint(type, opts) {
      if (type === 'enemy' || type === 'drone') return paintHiveDrone(opts);
      return null;
    },
    _internal: { paintHiveDrone, _merge, _xform },
  };
})();
