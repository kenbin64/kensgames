(function () {
  const hasThree = typeof window.THREE !== "undefined";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const bgCanvas = document.getElementById("bg3d");
  const heroCanvas = document.getElementById("hero3d");
  const heroStage = document.getElementById("heroStage");

  if (!hasThree || !bgCanvas || !heroCanvas || !heroStage || reduceMotion) {
    heroStage.classList.add("fallback");
    return;
  }

  const pointer = { x: 0, y: 0 };
  window.addEventListener("pointermove", evt => {
    pointer.x = (evt.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (evt.clientY / window.innerHeight) * 2 - 1;
  });

  function makeRenderer(canvas, alpha) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    return renderer;
  }

  const bgRenderer = makeRenderer(bgCanvas, true);
  const bgScene = new THREE.Scene();
  bgScene.fog = new THREE.FogExp2(0x020817, 0.018);

  const bgCamera = new THREE.PerspectiveCamera(55, 1, 0.1, 180);
  bgCamera.position.set(0, 0, 24);

  bgScene.add(new THREE.AmbientLight(0x0b2c44, 0.9));
  const bgDir = new THREE.DirectionalLight(0x22d3ee, 0.45);
  bgDir.position.set(4, 8, 6);
  bgScene.add(bgDir);

  const starGeometry = new THREE.BufferGeometry();
  const starCount = 1400;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const i3 = i * 3;
    starPos[i3] = (Math.random() - 0.5) * 150;
    starPos[i3 + 1] = (Math.random() - 0.5) * 90;
    starPos[i3 + 2] = -120 + Math.random() * 110;
  }
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPos, 3));

  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: 0x7dd3fc,
      size: 0.12,
      transparent: true,
      opacity: 0.65,
      sizeAttenuation: true,
      depthWrite: false,
    })
  );
  bgScene.add(stars);

  const auraMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      uniform float uTime;
      void main() {
        float w1 = sin(vPos.y * 0.07 + uTime * 0.38) * 0.5 + 0.5;
        float w2 = sin(vPos.x * 0.09 - uTime * 0.21) * 0.5 + 0.5;
        vec3 c = vec3(0.01, 0.06, 0.13);
        c += vec3(0.0, 0.35, 0.55) * w1 * 0.18;
        c += vec3(0.20, 0.02, 0.32) * w2 * 0.15;
        gl_FragColor = vec4(c, 0.44);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
  });

  const aura = new THREE.Mesh(new THREE.SphereGeometry(95, 42, 42), auraMat);
  bgScene.add(aura);

  const heroRenderer = makeRenderer(heroCanvas, true);
  const heroScene = new THREE.Scene();
  heroScene.fog = new THREE.FogExp2(0x031224, 0.075);

  const heroCamera = new THREE.PerspectiveCamera(52, 1, 0.1, 80);
  heroCamera.position.set(0, 3, 12.5);

  const hemi = new THREE.HemisphereLight(0x8dd9ff, 0x041124, 0.95);
  const key = new THREE.PointLight(0x22d3ee, 2.2, 30);
  key.position.set(3, 5, 5);
  const fill = new THREE.PointLight(0x0ea5e9, 1.4, 24);
  fill.position.set(-5, 2, 0);
  const rim = new THREE.PointLight(0x7c3aed, 0.9, 18);
  rim.position.set(0, 6, -6);
  heroScene.add(hemi, key, fill, rim);

  const graph = new THREE.Group();
  heroScene.add(graph);

  const axisMat = new THREE.LineBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.6 });

  function axisLine(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    return new THREE.Line(geo, axisMat);
  }

  graph.add(axisLine(new THREE.Vector3(-4.5, -2, 2.8), new THREE.Vector3(4.8, -2, 2.8)));
  graph.add(axisLine(new THREE.Vector3(-4.5, -2, 2.8), new THREE.Vector3(-4.5, 3.3, 2.8)));
  graph.add(axisLine(new THREE.Vector3(-4.5, -2, 2.8), new THREE.Vector3(-4.5, -2, -5.6)));

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(10.2, 7.8),
    new THREE.MeshBasicMaterial({ color: 0x082338, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0.5, -2, -1.4);
  graph.add(plane);

  const grid = new THREE.GridHelper(10, 10, 0x155e75, 0x0b3455);
  grid.position.set(0.5, -1.99, -1.4);
  grid.material.transparent = true;
  grid.material.opacity = 0.3;
  graph.add(grid);

  const routeGroup = new THREE.Group();
  const nodeGroup = new THREE.Group();
  graph.add(routeGroup, nodeGroup);

  const radarRing = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.15, 72),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.38, side: THREE.DoubleSide })
  );
  radarRing.rotation.x = -Math.PI / 2;
  radarRing.position.set(0.5, -1.95, -1.4);
  graph.add(radarRing);

  const defaultPoints = [
    { shipment_id: "SHP-001", customer: "Acme", x_distance_km: 84, y_weight_kg: 32, z_workload: 2688, status: "in_transit" },
    { shipment_id: "SHP-002", customer: "Nova", x_distance_km: 46, y_weight_kg: 19, z_workload: 874, status: "allocated" },
    { shipment_id: "SHP-003", customer: "Titan", x_distance_km: 120, y_weight_kg: 41, z_workload: 4920, status: "scheduled" },
    { shipment_id: "SHP-004", customer: "Orbit", x_distance_km: 35, y_weight_kg: 12, z_workload: 420, status: "created" },
  ];

  let graphNodes = [];
  let totalWorkload = 0;

  function statusColor(status) {
    switch (status) {
      case "delivered":
        return 0x10b981;
      case "in_transit":
      case "out_for_delivery":
        return 0x22d3ee;
      case "scheduled":
      case "allocated":
        return 0x60a5fa;
      case "created":
        return 0xf59e0b;
      default:
        return 0x94a3b8;
    }
  }

  function clearGraphObjects() {
    while (nodeGroup.children.length) {
      const child = nodeGroup.children.pop();
      if (!child) break;
      nodeGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    }
    while (routeGroup.children.length) {
      const route = routeGroup.children.pop();
      if (!route) break;
      routeGroup.remove(route);
      if (route.geometry) route.geometry.dispose();
      if (route.material) route.material.dispose();
    }
  }

  function mapPoint(p, maxDistance, maxWeight, maxWorkload) {
    const nx = Math.max(0, Math.min(1, Number(p.x_distance_km || 0) / maxDistance));
    const ny = Math.max(0, Math.min(1, Number(p.y_weight_kg || 0) / maxWeight));
    const nz = Math.max(0, Math.min(1, Number(p.z_workload || 0) / maxWorkload));

    return new THREE.Vector3(
      -4.1 + nx * 8.2,
      -1.5 + ny * 4.5,
      2.3 - nz * 7.2
    );
  }

  function rebuildGraph(points) {
    const list = points && points.length ? points : defaultPoints;
    const maxDistance = Math.max(1, ...list.map(p => Number(p.x_distance_km || 0)));
    const maxWeight = Math.max(1, ...list.map(p => Number(p.y_weight_kg || 0)));
    const maxWorkload = Math.max(1, ...list.map(p => Number(p.z_workload || 0)));

    clearGraphObjects();
    graphNodes = [];

    list.forEach((p, idx) => {
      const point = mapPoint(p, maxDistance, maxWeight, maxWorkload);
      const color = statusColor(p.status);
      const size = 0.12 + Math.min(0.28, (Number(p.z_workload || 0) / maxWorkload) * 0.24);

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(size, 18, 18),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.55,
          metalness: 0.3,
          roughness: 0.2,
        })
      );
      sphere.position.copy(point);

      const halo = new THREE.Mesh(
        new THREE.RingGeometry(size * 1.5, size * 1.9, 36),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.36, side: THREE.DoubleSide })
      );
      halo.position.copy(point);
      halo.rotation.x = Math.PI / 2;

      nodeGroup.add(sphere, halo);
      graphNodes.push({ sphere, halo, phase: idx * 0.9, point });

      const stem = axisLine(new THREE.Vector3(point.x, -2, point.z), point.clone());
      stem.material = stem.material.clone();
      stem.material.opacity = 0.35;
      nodeGroup.add(stem);
    });

    for (let i = 0; i < graphNodes.length - 1; i += 1) {
      const a = graphNodes[i].point;
      const b = graphNodes[i + 1].point;
      const c1 = a.clone().lerp(b, 0.35).add(new THREE.Vector3(0, 0.6, -0.2));
      const c2 = a.clone().lerp(b, 0.7).add(new THREE.Vector3(0, 0.4, -0.2));
      const curve = new THREE.CubicBezierCurve3(a, c1, c2, b);
      const geo = new THREE.TubeGeometry(curve, 42, 0.035, 8, false);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.62,
        metalness: 0.1,
        roughness: 0.25,
      });
      routeGroup.add(new THREE.Mesh(geo, mat));
    }
  }

  window.addEventListener("manifold:insights", event => {
    const payload = event.detail || {};
    totalWorkload = Number(payload.workloadTotal || 0);
    rebuildGraph(payload.points || []);
  });

  rebuildGraph(defaultPoints);

  function resize() {
    const bw = window.innerWidth;
    const bh = window.innerHeight;
    bgRenderer.setSize(bw, bh, false);
    bgCamera.aspect = bw / Math.max(1, bh);
    bgCamera.updateProjectionMatrix();

    const rect = heroCanvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(260, Math.floor(rect.height));
    heroRenderer.setSize(w, h, false);
    heroCamera.aspect = w / h;
    heroCamera.updateProjectionMatrix();
  }

  resize();
  window.addEventListener("resize", resize);

  const stageLabel = heroStage.querySelector(".stage-label");

  let t = 0;
  function frame() {
    t += 0.007;

    auraMat.uniforms.uTime.value = t;
    stars.rotation.y += 0.0002;
    stars.rotation.x = Math.sin(t * 0.4) * 0.03;

    bgCamera.position.x += ((pointer.x * 1.2) - bgCamera.position.x) * 0.018;
    bgCamera.position.y += ((-pointer.y * 0.8) - bgCamera.position.y) * 0.018;
    bgCamera.lookAt(0, 0, -10);

    radarRing.rotation.z += 0.018;
    radarRing.scale.setScalar(1 + Math.sin(t * 2) * 0.05);

    graphNodes.forEach(n => {
      n.sphere.position.y = n.point.y + Math.sin(t * 2.2 + n.phase) * 0.08;
      n.halo.position.y = n.sphere.position.y;
      n.halo.material.opacity = 0.2 + (Math.sin(t * 3.2 + n.phase) + 1) * 0.14;
      n.halo.rotation.z += 0.02;
    });

    const targetX = Math.sin(t * 0.25) * 1.2 + pointer.x * 0.7;
    const targetY = 2.9 + (-pointer.y * 0.55);
    heroCamera.position.x += (targetX - heroCamera.position.x) * 0.04;
    heroCamera.position.y += (targetY - heroCamera.position.y) * 0.04;
    heroCamera.lookAt(0.5, 0.1, -1.5);

    if (stageLabel) {
      stageLabel.textContent = `MANIFOLD ACTIVE · 3D WORKLOAD GRAPH · Z SUM ${Math.round(totalWorkload)}`;
    }

    bgRenderer.render(bgScene, bgCamera);
    heroRenderer.render(heroScene, heroCamera);
    window.requestAnimationFrame(frame);
  }

  frame();
})();
