/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 GYROID RENDERER — WebGL live background
 * ═══════════════════════════════════════════════════════════════════════════════
 * sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = 0
 * The manifold IS the interface. The surface breathes. The data lives on it.
 *
 * Directive 2.2 — Progressive Degradation by GPU Tier
 * High  (Desktop GPU)       : 40 steps, 1.0× resolution
 * Mid   (Flagship mobile)   : 24 steps, 0.75× resolution
 * Low   (Budget mobile)     : 16 steps, 0.5× resolution
 * Fallback (WebGL2 missing) : static CSS gradient
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function () {
  const canvas = document.getElementById('gyroid-bg');
  if (!canvas) return;
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

  // ── Fallback: static CSS gradient if WebGL unavailable ──────────────────────
  if (!gl) {
    canvas.style.cssText = 'display:none';
    document.body.style.background =
      'radial-gradient(ellipse at 20% 50%, rgba(0,255,255,0.08) 0%, transparent 60%),' +
      'radial-gradient(ellipse at 80% 30%, rgba(153,0,255,0.06) 0%, transparent 60%),' +
      '#04040C';
    return;
  }

  // ── GPU Tier Detection (Directive 2.2) ──────────────────────────────────────
  function detectGPUTier() {
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL).toUpperCase();
        // High tier: discrete desktop GPUs
        if (/NVIDIA|RADEON|GEFORCE|QUADRO|RX \d|GTX|RTX/.test(renderer)) return 'high';
        // Mid tier: flagship mobile
        if (/ADRENO [6-9]\d\d|MALI-G[7-9]\d|APPLE GPU|M[12] PRO|M[12] MAX/.test(renderer)) return 'mid';
        // Low tier: budget mobile
        if (/ADRENO [3-5]\d\d|MALI-G[3-5]\d|POWERVR/.test(renderer)) return 'low';
      }
    } catch (e) { /* sandboxed — fall through */ }
    // Heuristic: mobile UA → mid, otherwise high
    return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mid' : 'high';
  }

  const GPU_TIERS = {
    high: { steps: 40, scale: 1.0 },
    mid: { steps: 24, scale: 0.75 },
    low: { steps: 16, scale: 0.5 }
  };

  let tier = detectGPUTier();
  let { steps, scale } = GPU_TIERS[tier];

  // Frame time monitor: auto-downgrade if consistently slow (Directive 2.2)
  const FRAME_BUDGET_MS = 33; // 30fps floor
  let frameSamples = [];
  const SAMPLE_WINDOW = 30;
  const COOLDOWN_FRAMES = 180; // 3s at 60fps before re-evaluating
  let cooldown = 0;

  function checkFrameTime(dt) {
    if (cooldown > 0) { cooldown--; return; }
    frameSamples.push(dt);
    if (frameSamples.length < SAMPLE_WINDOW) return;
    const avg = frameSamples.reduce((a, b) => a + b, 0) / frameSamples.length;
    frameSamples = [];
    if (avg > FRAME_BUDGET_MS) {
      if (tier === 'high') { tier = 'mid'; }
      else if (tier === 'mid') { tier = 'low'; }
      steps = GPU_TIERS[tier].steps;
      scale = GPU_TIERS[tier].scale;
      cooldown = COOLDOWN_FRAMES;
    }
  }

  function resize() {
    canvas.width = Math.round(window.innerWidth * scale);
    canvas.height = Math.round(window.innerHeight * scale);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  // Vertex shader — fullscreen quad
  const vsSource = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
      v_uv = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  // Fragment shader — ray-marched gyroid + diamond blend
  // Steps controlled via u_steps uniform (GPU tier adaptive)
  const fsSource = `
    precision highp float;
    varying vec2 v_uv;
    uniform float u_time;
    uniform vec2  u_resolution;
    uniform float u_scroll;
    uniform float u_intensity;
    uniform float u_steps;

    float gyroid(vec3 p) {
      return sin(p.x)*cos(p.y) + sin(p.y)*cos(p.z) + sin(p.z)*cos(p.x);
    }
    float diamond(vec3 p) {
      return cos(p.x)*cos(p.y)*cos(p.z) - sin(p.x)*sin(p.y)*sin(p.z);
    }
    float scene(vec3 p) {
      float g = gyroid(p * 2.5 + u_time * 0.15);
      float d = diamond(p * 1.8 - u_time * 0.1);
      return mix(g, d, 0.3 + 0.2 * sin(u_time * 0.2));
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / min(u_resolution.x, u_resolution.y);
      float camZ = u_time * 0.3 + u_scroll * 0.01;
      vec3 ro = vec3(uv.x * 2.0, uv.y * 2.0 - u_scroll * 0.002, camZ);
      vec3 rd = normalize(vec3(uv, 1.0));

      float t = 0.0;
      float glow = 0.0;
      float stepMax = u_steps;
      for (int i = 0; i < 40; i++) {
        if (float(i) >= stepMax) break;
        vec3 p = ro + rd * t;
        float d = scene(p);
        float absd = abs(d);
        glow += exp(-absd * 8.0) * 0.025;
        if (absd < 0.01) break;
        t += max(absd * 0.5, 0.02);
        if (t > 12.0) break;
      }

      vec3 cyan   = vec3(0.0,  1.0, 1.0);
      vec3 purple = vec3(0.75, 0.0, 1.0);
      vec3 green  = vec3(0.22, 1.0, 0.08);
      float phase = sin(u_time * 0.15) * 0.5 + 0.5;
      vec3 col1 = mix(cyan,   purple, phase);
      vec3 col2 = mix(purple, green,  1.0 - phase);
      vec3 color = mix(col1, col2, glow * 2.0) * glow * u_intensity;
      float vig = 1.0 - length(v_uv - 0.5) * 0.8;
      color *= vig;
      gl_FragColor = vec4(color * 0.6, 1.0);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s)); return null;
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog)); return;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uRes = gl.getUniformLocation(prog, 'u_resolution');
  const uScroll = gl.getUniformLocation(prog, 'u_scroll');
  const uIntensity = gl.getUniformLocation(prog, 'u_intensity');
  const uSteps = gl.getUniformLocation(prog, 'u_steps');

  let scrollY = 0;
  window.addEventListener('scroll', () => { scrollY = window.scrollY; });
  window.gyroidIntensity = 1.0;

  // Expose tier for diagnostics
  window.gyroidTier = () => tier;

  let prevTime = 0;
  function render(time) {
    const dt = time - prevTime;
    prevTime = time;
    if (dt > 0) checkFrameTime(dt);

    // Re-check scale (may have changed via downgrade)
    const newScale = GPU_TIERS[tier].scale;
    if (newScale !== scale) {
      scale = newScale;
      resize();
    }

    gl.uniform1f(uTime, time * 0.001);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uScroll, scrollY);
    gl.uniform1f(uIntensity, window.gyroidIntensity || 1.0);
    gl.uniform1f(uSteps, GPU_TIERS[tier].steps);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
})();

(function () {
  const canvas = document.getElementById('gyroid-bg');
  if (!canvas) return;
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) { console.warn('WebGL not available'); return; }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  // Vertex shader — fullscreen quad
  const vsSource = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
      v_uv = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  // Fragment shader — ray-marched gyroid surface
  const fsSource = `
    precision highp float;
    varying vec2 v_uv;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_scroll;
    uniform float u_intensity;

    // Gyroid: sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x)
    float gyroid(vec3 p) {
      return sin(p.x)*cos(p.y) + sin(p.y)*cos(p.z) + sin(p.z)*cos(p.x);
    }

    // Diamond: cos(x)cos(y)cos(z) - sin(x)sin(y)sin(z)
    float diamond(vec3 p) {
      return cos(p.x)*cos(p.y)*cos(p.z) - sin(p.x)*sin(p.y)*sin(p.z);
    }

    float scene(vec3 p) {
      float g = gyroid(p * 2.5 + u_time * 0.15);
      float d = diamond(p * 1.8 - u_time * 0.1);
      return mix(g, d, 0.3 + 0.2 * sin(u_time * 0.2));
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / min(u_resolution.x, u_resolution.y);

      // Camera
      float camZ = u_time * 0.3 + u_scroll * 0.01;
      vec3 ro = vec3(uv.x * 2.0, uv.y * 2.0 - u_scroll * 0.002, camZ);
      vec3 rd = normalize(vec3(uv, 1.0));

      // Raymarch
      float t = 0.0;
      float glow = 0.0;
      for (int i = 0; i < 40; i++) {
        vec3 p = ro + rd * t;
        float d = scene(p);
        float absd = abs(d);
        // Accumulate glow near the surface
        glow += exp(-absd * 8.0) * 0.025;
        if (absd < 0.01) break;
        t += max(absd * 0.5, 0.02);
        if (t > 12.0) break;
      }

      // Colors: cyan + purple + green (the manifold palette)
      vec3 cyan = vec3(0.0, 1.0, 1.0);
      vec3 purple = vec3(0.75, 0.0, 1.0);
      vec3 green = vec3(0.22, 1.0, 0.08);

      float phase = sin(u_time * 0.15) * 0.5 + 0.5;
      vec3 col1 = mix(cyan, purple, phase);
      vec3 col2 = mix(purple, green, 1.0 - phase);

      vec3 color = mix(col1, col2, glow * 2.0) * glow * u_intensity;

      // Subtle vignette
      float vig = 1.0 - length(v_uv - 0.5) * 0.8;
      color *= vig;

      // Very dark base — this is a background
      gl_FragColor = vec4(color * 0.6, 1.0);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  // Fullscreen quad
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uRes = gl.getUniformLocation(prog, 'u_resolution');
  const uScroll = gl.getUniformLocation(prog, 'u_scroll');
  const uIntensity = gl.getUniformLocation(prog, 'u_intensity');

  let scrollY = 0;
  window.addEventListener('scroll', () => { scrollY = window.scrollY; });

  // Expose intensity control for page transitions
  window.gyroidIntensity = 1.0;

  function render(time) {
    gl.uniform1f(uTime, time * 0.001);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uScroll, scrollY);
    gl.uniform1f(uIntensity, window.gyroidIntensity || 1.0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
})();
