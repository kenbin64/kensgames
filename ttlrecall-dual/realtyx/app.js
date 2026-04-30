const listings = [
  { id: "RX-101", title: "Skyline Loft", hood: "Core", beds: 2, baths: 2, sqft: 1380, price: 780000, days: 8, score: 1.22 },
  { id: "RX-102", title: "Garden Estate", hood: "North", beds: 4, baths: 3, sqft: 2850, price: 1450000, days: 14, score: 1.08 },
  { id: "RX-103", title: "Glass Villa", hood: "Waterfront", beds: 5, baths: 4, sqft: 3960, price: 2650000, days: 5, score: 1.34 },
  { id: "RX-104", title: "Tech Townhome", hood: "West", beds: 3, baths: 2, sqft: 1960, price: 970000, days: 10, score: 1.16 },
  { id: "RX-105", title: "Micro Penthouse", hood: "Core", beds: 1, baths: 1, sqft: 880, price: 620000, days: 6, score: 1.28 },
  { id: "RX-106", title: "Family Hub", hood: "North", beds: 4, baths: 3, sqft: 2440, price: 1090000, days: 18, score: 1.11 },
  { id: "RX-107", title: "Marina Loft", hood: "Waterfront", beds: 2, baths: 2, sqft: 1520, price: 1210000, days: 7, score: 1.19 },
  { id: "RX-108", title: "Horizon Residence", hood: "West", beds: 3, baths: 2, sqft: 1880, price: 880000, days: 11, score: 1.14 },
  { id: "RX-109", title: "Riverline Condo", hood: "Core", beds: 2, baths: 2, sqft: 1260, price: 740000, days: 9, score: 1.2 },
  { id: "RX-110", title: "North Maple House", hood: "North", beds: 3, baths: 2, sqft: 2100, price: 960000, days: 12, score: 1.13 }
];

const $ = id => document.getElementById(id);
const money = n => `$${Math.round(n).toLocaleString()}`;

let activeHood = "all";

function filteredData() {
  const q = $("search").value.trim().toLowerCase();
  const maxPrice = Number($("maxPrice").value);
  const minBeds = Number($("minBeds").value);

  return listings
    .filter(l => l.price <= maxPrice)
    .filter(l => l.beds >= minBeds)
    .filter(l => activeHood === "all" || l.hood === activeHood)
    .filter(l => {
      if (!q) return true;
      return [l.title, l.hood, l.id].some(v => String(v).toLowerCase().includes(q));
    })
    .map(l => ({
      ...l,
      rank: (Math.max(0.2, 1 - l.price / maxPrice) * l.beds * l.score)
    }))
    .sort((a, b) => b.rank - a.rank);
}

function render() {
  const data = filteredData();

  $("maxPriceVal").textContent = money($("maxPrice").value);
  $("minBedsVal").textContent = $("minBeds").value;

  $("sListings").textContent = data.length;
  $("sAvg").textContent = data.length ? money(data.reduce((s, x) => s + x.price, 0) / data.length) : "$0";
  $("sHot").textContent = new Set(data.filter(x => x.rank > 1.2).map(x => x.hood)).size;

  $("resultMeta").textContent = `${data.length} homes matched`;

  $("listings").innerHTML = data.map((l, idx) => `
    <article class="listing">
      <div class="thumb" style="background:linear-gradient(135deg, hsl(${200 + idx * 9},80%,92%), hsl(${180 + idx * 7},90%,94%));"></div>
      <div class="body">
        <div class="price">${money(l.price)}</div>
        <div class="title">${l.title}</div>
        <div class="meta">${l.beds} bd · ${l.baths} ba · ${l.sqft.toLocaleString()} sqft · ${l.hood}</div>
        <div class="badges">
          <span class="badge">${l.id}</span>
          <span class="badge">${l.days} days on market</span>
          <span class="badge">Rank ${l.rank.toFixed(2)}</span>
        </div>
      </div>
    </article>
  `).join("") || '<article class="listing"><div class="body">No homes matched this filter.</div></article>';

  window.dispatchEvent(new CustomEvent("realtyx:data", { detail: data }));
}

$("search").addEventListener("input", render);
$("searchBtn").addEventListener("click", render);
$("maxPrice").addEventListener("input", render);
$("minBeds").addEventListener("input", render);

document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    activeHood = chip.getAttribute("data-hood") || "all";
    render();
  });
});

(function run3D() {
  if (!window.THREE) return;
  const bgCanvas = $("bg3d");
  const mapCanvas = $("hero3d");
  if (!bgCanvas || !mapCanvas) return;

  /* ── BACKGROUND SCENE (golden dusk stars) ── */
  const bgRenderer = new THREE.WebGLRenderer({ canvas: bgCanvas, alpha: true, antialias: true });
  const bgScene = new THREE.Scene();
  const bgCamera = new THREE.PerspectiveCamera(55, 1, 0.1, 180);
  bgCamera.position.set(0, 0, 24);

  const starCount = 1000;
  const sp = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    sp[i * 3] = (Math.random() - 0.5) * 140;
    sp[i * 3 + 1] = (Math.random() - 0.5) * 90;
    sp[i * 3 + 2] = -110 + Math.random() * 90;
  }
  const starsGeo = new THREE.BufferGeometry();
  starsGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starsGeo, new THREE.PointsMaterial({
    color: 0xfacc15, size: 0.13, transparent: true, opacity: 0.45
  }));
  bgScene.add(stars);

  /* ── NEIGHBORHOOD SCENE ── */
  const r = new THREE.WebGLRenderer({ canvas: mapCanvas, alpha: true, antialias: true });
  r.setClearColor(0x0d1a0a, 1);
  r.shadowMap.enabled = true;

  const s = new THREE.Scene();
  s.fog = new THREE.Fog(0x0d1a0a, 28, 55);
  s.background = new THREE.Color(0x0d1a0a);

  const c = new THREE.PerspectiveCamera(52, 1, 0.1, 80);
  c.position.set(0, 5, 16);
  c.lookAt(0, 0, 0);

  // Sky gradient (hemisphere)
  s.add(new THREE.HemisphereLight(0x1a4a0a, 0x0d1a0a, 0.7));

  // Golden hour sun
  const sun = new THREE.DirectionalLight(0xffc850, 2.2);
  sun.position.set(-12, 14, 8);
  sun.castShadow = true;
  s.add(sun);

  // Warm fill
  const fill = new THREE.PointLight(0xff9900, 1.2, 40);
  fill.position.set(8, 6, 4);
  s.add(fill);

  // Cool sky fill
  const sky = new THREE.PointLight(0x22c55e, 0.8, 35);
  sky.position.set(-6, 10, -5);
  s.add(sky);

  // ── STREET ──
  const streetMat = new THREE.MeshLambertMaterial({ color: 0x1a1a22 });
  const street = new THREE.Mesh(new THREE.BoxGeometry(30, 0.08, 3.5), streetMat);
  street.position.set(0, -0.04, 0);
  s.add(street);

  // Yellow center line
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  for (let i = -6; i <= 6; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.12), lineMat);
    dash.position.set(i * 2, 0.05, 0);
    s.add(dash);
  }

  // ── LAWN (ground) ──
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x1a4a12 });
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(40, 22), grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.08;
  s.add(grass);

  // ── HELPER: build a house ──
  function makeHouse(x, z, side, houseColor, roofColor, scale) {
    const group = new THREE.Group();
    const w = 2.6 * scale, h = 2.0 * scale, d = 2.2 * scale;

    // Body
    const bodyMat = new THREE.MeshLambertMaterial({ color: houseColor });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    body.position.y = h / 2;
    group.add(body);

    // Roof (pyramid via ConeGeometry with 4 segments)
    const roofMat = new THREE.MeshLambertMaterial({ color: roofColor });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.82, h * 0.7, 4), roofMat);
    roof.position.y = h + (h * 0.35);
    roof.rotation.y = Math.PI / 4;
    group.add(roof);

    // Door
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
    const door = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, h * 0.42, 0.05), doorMat);
    door.position.set(0, h * 0.21, d / 2 + 0.01);
    group.add(door);

    // Windows (2)
    const winMat = new THREE.MeshLambertMaterial({ color: 0xffc850, emissive: 0xffc850, emissiveIntensity: 0.35 });
    [-0.32, 0.32].forEach(wx => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.18, h * 0.22, 0.05), winMat);
      win.position.set(wx * w, h * 0.55, d / 2 + 0.01);
      group.add(win);
    });

    // Chimney
    const chimneyMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(w * 0.13, h * 0.55, w * 0.13), chimneyMat);
    chimney.position.set(w * 0.28, h + h * 0.4, -d * 0.15);
    group.add(chimney);

    // Porch / steps
    const porchMat = new THREE.MeshLambertMaterial({ color: 0xc8a87a });
    const porch = new THREE.Mesh(new THREE.BoxGeometry(w * 0.35, 0.12, 0.5), porchMat);
    porch.position.set(0, 0.06, d / 2 + 0.25);
    group.add(porch);

    group.position.set(x, 0, z);
    if (side < 0) group.rotation.y = Math.PI; // face street
    s.add(group);
    return group;
  }

  // ── HELPER: tree ──
  function makeTree(x, z, h) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, h * 0.5, 7),
      new THREE.MeshLambertMaterial({ color: 0x5c3a1e })
    );
    trunk.position.y = h * 0.25;
    g.add(trunk);
    const foliage = new THREE.Mesh(
      new THREE.ConeGeometry(h * 0.42, h * 0.75, 7),
      new THREE.MeshLambertMaterial({ color: 0x22863a })
    );
    foliage.position.y = h * 0.7;
    g.add(foliage);
    g.position.set(x, 0, z);
    s.add(g);
    return g;
  }

  // ── HELPER: mailbox ──
  function makeMailbox(x, z) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.8, 5),
      new THREE.MeshLambertMaterial({ color: 0x888888 })
    );
    post.position.y = 0.4;
    g.add(post);
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.16, 0.32),
      new THREE.MeshLambertMaterial({ color: 0xcc2222 })
    );
    box.position.y = 0.86;
    g.add(box);
    g.position.set(x, 0, z);
    s.add(g);
  }

  // ── HELPER: fence section ──
  function makeFence(x, z, len, rot) {
    const g = new THREE.Group();
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.06, 0.04),
      new THREE.MeshLambertMaterial({ color: 0xeeeeee })
    );
    rail.position.y = 0.55;
    g.add(rail.clone());
    const rail2 = rail.clone(); rail2.position.y = 0.35; g.add(rail2);
    const pickets = Math.floor(len / 0.28);
    for (let i = 0; i < pickets; i++) {
      const pk = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.72, 0.04),
        new THREE.MeshLambertMaterial({ color: 0xf5f5f5 })
      );
      pk.position.set(-len / 2 + i * 0.28 + 0.14, 0.36, 0);
      g.add(pk);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rot || 0;
    s.add(g);
  }

  // House palette
  const houses = [
    { color: 0xe8d5a3, roof: 0x8b3a3a, scale: 1.05 },
    { color: 0xd4e8d0, roof: 0x3a5c3a, scale: 0.92 },
    { color: 0xd0dcea, roof: 0x2a3f6a, scale: 1.1 },
    { color: 0xf0e0d0, roof: 0x6a3a22, scale: 0.98 },
    { color: 0xe8e0f0, roof: 0x4a3a6a, scale: 1.02 },
    { color: 0xf5e8d5, roof: 0x7a3a28, scale: 0.95 },
  ];

  const houseGroups = [];
  const xPositions = [-11, -6.5, -2, 2, 6.5, 11];

  xPositions.forEach((hx, i) => {
    // North side (z = -4.5, facing south)
    const h1 = makeHouse(hx, -4.8, -1, houses[i].color, houses[i].roof, houses[i].scale);
    houseGroups.push(h1);
    // South side (z = 4.5, facing north)
    const h2 = makeHouse(hx, 4.8, 1, houses[(i + 3) % 6].color, houses[(i + 3) % 6].roof, houses[(i + 3) % 6].scale);
    houseGroups.push(h2);

    // Mailboxes
    makeMailbox(hx - 0.9, -2.2);
    makeMailbox(hx - 0.9, 2.2);

    // Fences
    makeFence(hx, -3.1, 2.2, 0);
    makeFence(hx, 3.1, 2.2, 0);

    // Trees
    makeTree(hx + 1.5, -5.8, 1.8 + Math.random() * 0.6);
    makeTree(hx + 1.5, 5.8, 1.8 + Math.random() * 0.6);
  });

  // Street lamps
  [-9, -4, 0, 4, 9].forEach(lx => {
    [-1.6, 1.6].forEach(lz => {
      const lampPost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, 3.5, 6),
        new THREE.MeshLambertMaterial({ color: 0x444444 })
      );
      lampPost.position.set(lx, 1.75, lz);
      s.add(lampPost);
      const lampHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0xfffacd, emissive: 0xffc850, emissiveIntensity: 0.9 })
      );
      lampHead.position.set(lx, 3.5, lz);
      s.add(lampHead);
      // Point light per lamp
      const lp = new THREE.PointLight(0xffc850, 0.6, 7);
      lp.position.set(lx, 3.3, lz);
      s.add(lp);
    });
  });

  // "Realize the American Dream" banner (floating text via sprite)
  // Represented as a glowing arch above the scene
  const archMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.7 });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(12, 0.12, 8, 40, Math.PI), archMat);
  arch.position.set(0, 0.1, -8);
  arch.rotation.x = -Math.PI / 2;
  s.add(arch);

  // Camera path: slow pan along the street
  let camT = 0;

  function resize() {
    bgRenderer.setSize(window.innerWidth, window.innerHeight, false);
    bgCamera.aspect = window.innerWidth / window.innerHeight;
    bgCamera.updateProjectionMatrix();

    const rect = mapCanvas.getBoundingClientRect();
    const w = Math.max(320, rect.width);
    const h = Math.max(260, rect.height);
    r.setSize(w, h, false);
    c.aspect = w / h;
    c.updateProjectionMatrix();
  }

  let t = 0;
  function frame() {
    t += 0.008;
    camT += 0.0015;

    stars.rotation.y += 0.0002;
    bgCamera.position.x = Math.sin(t * 0.18) * 1.1;
    bgCamera.lookAt(0, 0, -8);

    // Camera floats and pans slowly, occasionally sweeping across street
    c.position.x = Math.sin(camT * 0.7) * 7;
    c.position.y = 4.5 + Math.sin(camT * 0.4) * 0.8;
    c.position.z = 14 + Math.sin(camT * 0.3) * 2;
    c.lookAt(Math.sin(camT * 0.5) * 2, 1.5, 0);

    // Windows flicker warmly
    houseGroups.forEach((hg, idx) => {
      hg.traverse(child => {
        if (child.isMesh && child.material.emissiveIntensity > 0) {
          child.material.emissiveIntensity = 0.28 + Math.sin(t * 1.4 + idx * 0.8) * 0.12;
        }
      });
    });

    // Arch slow pulse
    arch.material.opacity = 0.45 + Math.sin(t * 0.9) * 0.25;
    arch.rotation.z += 0.002;

    bgRenderer.render(bgScene, bgCamera);
    r.render(s, c);
    requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener("resize", resize);
  frame();
})();
render();
