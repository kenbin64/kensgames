const campaigns = [
  { id: "FW-301", title: "Family Emergency Surgery", category: "Medical", location: "Austin, TX", goal: 50000, raised: 36750, donors: 628, velocity: 1.28 },
  { id: "FW-302", title: "Community Kitchen Rebuild", category: "Community", location: "Denver, CO", goal: 80000, raised: 61200, donors: 934, velocity: 1.12 },
  { id: "FW-303", title: "STEM Lab for Public School", category: "Education", location: "Atlanta, GA", goal: 42000, raised: 25980, donors: 406, velocity: 1.41 },
  { id: "FW-304", title: "Wildfire Relief Support", category: "Emergency", location: "Sacramento, CA", goal: 120000, raised: 102400, donors: 1432, velocity: 1.05 },
  { id: "FW-305", title: "Small Business Recovery", category: "Business", location: "Chicago, IL", goal: 60000, raised: 31820, donors: 577, velocity: 1.34 },
  { id: "FW-306", title: "Youth Sports Equipment", category: "Youth", location: "Orlando, FL", goal: 18000, raised: 12410, donors: 283, velocity: 1.16 }
];

const $ = id => document.getElementById(id);
const money = n => `$${Math.round(n).toLocaleString()}`;

function renderCampaigns() {
  const list = $("campaignList");
  list.innerHTML = campaigns.map(c => {
    const pct = Math.min(100, (c.raised / c.goal) * 100);
    return `
      <article class="card">
        <div class="meta">${c.id} · ${c.category} · ${c.location}</div>
        <h3>${c.title}</h3>
        <div class="progress"><span style="width:${pct.toFixed(1)}%"></span></div>
        <div class="row meta">
          <span>${money(c.raised)} raised of ${money(c.goal)}</span>
          <span>${pct.toFixed(1)}%</span>
        </div>
        <div class="row meta" style="margin-top:.25rem">
          <span>${c.donors.toLocaleString()} donors</span>
          <span>Momentum ${c.velocity.toFixed(2)}x</span>
        </div>
      </article>
    `;
  }).join("");

  $("campaignSelect").innerHTML = campaigns
    .map(c => `<option value="${c.id}">${c.title}</option>`)
    .join("");

  const raisedToday = campaigns.reduce((s, c) => s + c.raised * 0.035, 0);
  const backers = campaigns.reduce((s, c) => s + c.donors, 0);

  $("kRaised").textContent = money(raisedToday);
  $("kBackers").textContent = backers.toLocaleString();
  $("kCampaigns").textContent = campaigns.length;

  window.dispatchEvent(new CustomEvent("fundwave:data", { detail: campaigns }));
}

function donate() {
  const id = $("campaignSelect").value;
  const amount = Math.max(5, Number($("amount").value || 0));
  const c = campaigns.find(x => x.id === id);
  if (!c) return;
  c.raised += amount;
  c.donors += 1;
  c.velocity = Math.min(1.6, c.velocity + 0.01);
  $("donateMsg").textContent = `Thank you. ${money(amount)} added to ${c.title}.`;
  renderCampaigns();
}

$("donateBtn").addEventListener("click", donate);

(function run3D() {
  if (!window.THREE) return;
  const bgCanvas = $("bg3d");
  const impactCanvas = $("impact3d");
  if (!bgCanvas || !impactCanvas) return;

  /* ── BACKGROUND SCENE (aurora particles) ── */
  const bgRenderer = new THREE.WebGLRenderer({ canvas: bgCanvas, alpha: true, antialias: true });
  const bgScene = new THREE.Scene();
  const bgCamera = new THREE.PerspectiveCamera(55, 1, 0.1, 180);
  bgCamera.position.set(0, 0, 24);

  const starCount = 1200;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const i3 = i * 3;
    starPos[i3] = (Math.random() - 0.5) * 140;
    starPos[i3 + 1] = (Math.random() - 0.5) * 90;
    starPos[i3 + 2] = -110 + Math.random() * 90;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0x00ffc8, size: 0.13, transparent: true, opacity: 0.5
  }));
  bgScene.add(stars);

  /* ── OCEAN WAVE SCENE ── */
  const waveRenderer = new THREE.WebGLRenderer({ canvas: impactCanvas, alpha: true, antialias: true });
  waveRenderer.setClearColor(0x030c14, 1);
  const waveScene = new THREE.Scene();
  waveScene.fog = new THREE.FogExp2(0x030c14, 0.042);

  const waveCamera = new THREE.PerspectiveCamera(58, 1, 0.1, 100);
  waveCamera.position.set(0, 3.5, 10);
  waveCamera.lookAt(0, 0, -2);

  // Lighting
  waveScene.add(new THREE.AmbientLight(0x0a2a40, 1.2));
  const sun = new THREE.DirectionalLight(0x00ffc8, 1.5);
  sun.position.set(-4, 8, 6);
  waveScene.add(sun);
  const rimLight = new THREE.PointLight(0xa855f7, 2.0, 25);
  rimLight.position.set(5, 4, -3);
  waveScene.add(rimLight);
  const yellowLight = new THREE.PointLight(0xfacc15, 1.2, 20);
  yellowLight.position.set(-5, 2, 2);
  waveScene.add(yellowLight);

  // Ocean plane geometry
  const SEG = 80;
  const WAVE_W = 18, WAVE_D = 14;
  const planeGeo = new THREE.PlaneGeometry(WAVE_W, WAVE_D, SEG, SEG);
  planeGeo.rotateX(-Math.PI / 2);
  const posAttr = planeGeo.attributes.position;
  const vertCount = posAttr.count;

  // Store original XZ for displacement
  const baseX = new Float32Array(vertCount);
  const baseZ = new Float32Array(vertCount);
  for (let i = 0; i < vertCount; i++) {
    baseX[i] = posAttr.getX(i);
    baseZ[i] = posAttr.getZ(i);
  }

  const waveMat = new THREE.MeshPhongMaterial({
    color: 0x0066aa,
    emissive: 0x001a33,
    emissiveIntensity: 0.4,
    shininess: 120,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    wireframe: false,
  });

  const waveMesh = new THREE.Mesh(planeGeo, waveMat);
  waveScene.add(waveMesh);

  // Wireframe overlay
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x00ffc8, wireframe: true, transparent: true, opacity: 0.08
  });
  const wireMesh = new THREE.Mesh(new THREE.PlaneGeometry(WAVE_W, WAVE_D, SEG, SEG), wireMat);
  wireMesh.rotateX(-Math.PI / 2);
  waveScene.add(wireMesh);

  // Foam / crest particles
  const foamCount = 300;
  const foamGeo = new THREE.BufferGeometry();
  const foamPos = new Float32Array(foamCount * 3);
  for (let i = 0; i < foamCount; i++) {
    foamPos[i * 3] = (Math.random() - 0.5) * WAVE_W;
    foamPos[i * 3 + 1] = 0;
    foamPos[i * 3 + 2] = (Math.random() - 0.5) * WAVE_D;
  }
  foamGeo.setAttribute("position", new THREE.BufferAttribute(foamPos, 3));
  const foamMesh = new THREE.Points(foamGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.14, transparent: true, opacity: 0.0,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  waveScene.add(foamMesh);

  // Wave cycle state
  let waveT = 0;
  let cycleT = 0;            // 0 → 1, drives the swell
  const CYCLE_SPEED = 0.0028; // seconds per full cycle

  function updateWave(ct, t) {
    // swell amplitude ramps up, crests, then crashes back
    // 0→0.7: building (ease-in), 0.7→0.85: crest, 0.85→1.0: crash
    let amp;
    if (ct < 0.7) {
      amp = (ct / 0.7) * (ct / 0.7) * 3.8; // quadratic build
    } else if (ct < 0.85) {
      const p = (ct - 0.7) / 0.15;
      amp = 3.8 + p * 0.8;                  // overshoot at crest
    } else {
      const p = (ct - 0.85) / 0.15;
      amp = 4.6 * (1 - p * p);              // fast crash
    }

    const freq = 1.2 + ct * 0.6;
    const speed = 1.8;

    for (let i = 0; i < vertCount; i++) {
      const x = baseX[i];
      const z = baseZ[i];
      // Primary swell rolling in from -Z
      const primary = Math.sin(z * freq + t * speed) * amp * 0.55;
      // Secondary chop
      const chop = Math.sin(x * 0.8 + z * 1.5 + t * 2.1) * 0.15 * amp;
      // Lateral ripple
      const ripple = Math.cos(x * 0.45 + t * 1.3) * 0.1 * amp;
      posAttr.setY(i, primary + chop + ripple);

      // Sync wireframe
      wireMesh.geometry.attributes.position.setY(i, primary + chop + ripple);
    }
    posAttr.needsUpdate = true;
    wireMesh.geometry.attributes.position.needsUpdate = true;
    planeGeo.computeVertexNormals();

    // Color shifts: deep blue → cyan → white-foam at crest
    const crestPct = Math.max(0, (ct - 0.65) / 0.35);
    waveMat.color.setRGB(
      0.0 + crestPct * 0.1,
      0.25 + crestPct * 0.55,
      0.5 + crestPct * 0.45
    );
    waveMat.emissiveIntensity = 0.1 + crestPct * 0.9;
    waveMat.emissive.setRGB(0, 0.18 + crestPct * 0.6, 0.22 + crestPct * 0.3);

    // Foam appears at crest
    foamMesh.material.opacity = Math.max(0, crestPct * 0.85);
    const fp = foamGeo.attributes.position;
    for (let i = 0; i < foamCount; i++) {
      const fx = fp.getX(i);
      const fz = fp.getZ(i);
      const fSurf = Math.sin(fz * freq + t * speed) * amp * 0.55
        + Math.sin(fx * 0.8 + fz * 1.5 + t * 2.1) * 0.15 * amp;
      fp.setY(i, fSurf + 0.08 + Math.random() * 0.06);
    }
    fp.needsUpdate = true;

    // Camera bobs gently, rises toward crest
    waveCamera.position.y = 3.5 + Math.sin(t * 0.4) * 0.3 + ct * 0.8;
    waveCamera.position.x = Math.sin(t * 0.22) * 1.5;
    waveCamera.lookAt(0, amp * 0.2, -2);

    // Rim light color cycles
    rimLight.color.setHSL((t * 0.04) % 1, 0.9, 0.6);
  }

  function resize() {
    bgRenderer.setSize(window.innerWidth, window.innerHeight, false);
    bgCamera.aspect = window.innerWidth / window.innerHeight;
    bgCamera.updateProjectionMatrix();

    const rect = impactCanvas.getBoundingClientRect();
    const w = Math.max(320, rect.width);
    const h = Math.max(260, rect.height);
    waveRenderer.setSize(w, h, false);
    waveCamera.aspect = w / h;
    waveCamera.updateProjectionMatrix();
  }

  let t = 0;
  function frame() {
    t += 0.012;
    cycleT = (cycleT + CYCLE_SPEED) % 1;

    stars.rotation.y += 0.00015;
    bgCamera.position.x = Math.sin(t * 0.18) * 1.1;
    bgCamera.lookAt(0, 0, -8);

    updateWave(cycleT, t);

    bgRenderer.render(bgScene, bgCamera);
    waveRenderer.render(waveScene, waveCamera);
    requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener("resize", resize);
  frame();
})();

renderCampaigns();
