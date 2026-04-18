/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  MANIFOLD REALITY ENGINE  ·  Dimensional WebGL Renderer                 ║
 * ║  Schwartz Diamond · Gyroid · z = x·y Saddle Manifold                   ║
 * ║                                                                          ║
 * ║  Manifold = Expression + Attributes + Substrate                         ║
 * ║  z = x·y  — universal access axiom: every point is a higher dimension  ║
 * ║             rendered whole in a lower                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 *  Surfaces rendered:
 *    SCHWARTZ DIAMOND  cos(x) + cos(y) + cos(z) = 0     crystal lattice
 *    GYROID            sin(x)cos(y)+sin(y)cos(z)+sin(z)cos(x) = 0  labyrinth
 *    SADDLE (z=x·y)    z - x·y = 0                      fundamental manifold
 *
 *  The three are blended, time-animated, and compiled live in WebGL2.
 *
 *  Usage:
 *    <!-- set theme on <body> -->
 *    <body data-mtheme="cyan">   <!-- cyan | purple | green | gold -->
 *    <canvas id="gyroid-bg"></canvas>
 *    <script src="/js/manifold_reality.js" defer></script>
 *
 *  API:
 *    window.ManifoldReality.setTheme('purple')
 *    window.ManifoldReality.setIntensity(0.7)
 */

(function () {
  'use strict';

  const THEMES = {
    cyan: { a: [0.00, 1.00, 1.00], b: [0.75, 0.00, 1.00] },
    purple: { a: [0.75, 0.00, 1.00], b: [0.00, 1.00, 1.00] },
    green: { a: [0.22, 1.00, 0.08], b: [0.00, 1.00, 1.00] },
    gold: { a: [1.00, 0.75, 0.00], b: [0.75, 0.00, 1.00] },
  };

  // ── Vertex shader — full-screen quad ────────────────────────────────────
  const VS = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
      v_uv = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  // ── Fragment shader ──────────────────────────────────────────────────────
  const FS = `
    precision highp float;

    varying  vec2  v_uv;
    uniform  float u_time;
    uniform  vec2  u_res;
    uniform  vec2  u_mouse;    /* normalized [0,1] */
    uniform  float u_scroll;
    uniform  vec3  u_col_a;    /* theme primary   */
    uniform  vec3  u_col_b;    /* theme secondary */
    uniform  float u_compile;  /* 0→1 boot anim   */
    uniform  float u_intensity;

    #define PI    3.14159265358979
    #define TWO_PI 6.28318530717959
    #define MAX_STEPS 96
    #define MAX_DIST  20.0
    #define SURF_DIST 0.004

    /* ── Manifold Surface Equations ──────────────────────────────────────── */

    /* Schwartz Diamond TPMS — creates a crystal lattice of intersecting tunnels
       Forms the "skeleton" of the Diamond cubic structure found in nature.      */
    float schwartz_diamond(vec3 p) {
      return cos(p.x) + cos(p.y) + cos(p.z);
    }

    /* Gyroid TPMS — spiraling labyrinthine minimal surface
       No straight lines or flat planes anywhere on this surface.               */
    float gyroid(vec3 p) {
      return sin(p.x)*cos(p.y) + sin(p.y)*cos(p.z) + sin(p.z)*cos(p.x);
    }

    /* z = x·y  — the universal manifold access axiom
       The saddle surface that links every game, every dimension.               */
    float saddle_zxy(vec3 p) {
      return p.z - p.x * p.y;
    }

    /* Data extraction: extract the z=x*y dimensional value at any 3D point.
       Used to modulate color, glow, and dimensional weight across the scene.   */
    float dim_extract(vec3 p) {
      return abs(sin(p.x * p.y * PI + u_time * 0.4)) *
             abs(cos(p.y * p.z * PI * 0.7 - u_time * 0.3));
    }

    /* ── Composite Scene SDF ──────────────────────────────────────────────── */
    float scene(vec3 p) {
      /* Dimensional scale: 2.4 puts us inside the crystal lattice */
      float sc = 2.4;
      vec3 q = p * sc;

      /* Time-evolving blend: diamond ↔ gyroid cycle (period ~52s) */
      float t_blend = sin(u_time * 0.12) * 0.5 + 0.5;
      float primary = mix(schwartz_diamond(q), gyroid(q), t_blend);

      /* The saddle manifold z=x·y warps the composite surface spatially.
         This is the "access equation" bending space around the viewer.         */
      float warp = saddle_zxy(p * 0.6) * 0.18;

      return primary + warp;
    }

    /* Central-differences surface normal */
    vec3 surf_normal(vec3 p) {
      float e = 0.006;
      return normalize(vec3(
        scene(p + vec3(e,0,0)) - scene(p - vec3(e,0,0)),
        scene(p + vec3(0,e,0)) - scene(p - vec3(0,e,0)),
        scene(p + vec3(0,0,e)) - scene(p - vec3(0,0,e))
      ));
    }

    /* ── Camera ──────────────────────────────────────────────────────────── */
    mat3 look_at(vec3 ro, vec3 target, float roll) {
      vec3 ww = normalize(target - ro);
      vec3 uu = normalize(cross(ww, vec3(sin(roll), cos(roll), 0.0)));
      vec3 vv = cross(uu, ww);
      return mat3(uu, vv, ww);
    }

    /* ── Grid overlay (z=x·y dimensional data field) ─────────────────────── */
    float data_grid(vec2 uv) {
      /* Compute z=x*y at screen-UV scale — reveals the saddle geometry */
      float z = uv.x * uv.y;
      /* Fine grid lines where z passes through integer multiples */
      float gx = abs(sin(uv.x * PI * 10.0)) * 0.008;
      float gy = abs(sin(uv.y * PI * 10.0)) * 0.008;
      /* Saddle-surface iso-contours: z = 0, ±0.5, ±1.0 ... */
      float gz = abs(sin(z * PI * 6.0 - u_time * 0.8)) * 0.015;
      return (gx + gy + gz) * smoothstep(1.2, 0.3, length(uv));
    }

    /* ── Main ──────────────────────────────────────────────────────────────── */
    void main() {
      vec2 fc    = gl_FragCoord.xy;
      vec2 res   = u_res;
      vec2 fragN = fc / res;                                /* [0,1]  */
      vec2 uv    = (fc - res * 0.5) / min(res.x, res.y);   /* aspect-corrected */

      /* Mouse parallax: subtle camera drift follows cursor */
      vec2 mOff = (u_mouse - 0.5) * vec2(1.4, 0.9);

      /* Slow orbital camera + mouse lean */
      float orb = u_time * 0.038;
      vec3 ro = vec3(
        sin(orb) * 1.9 + mOff.x * 0.5,
        0.3 + mOff.y * 0.35 + sin(u_time * 0.07) * 0.4,
        cos(orb) * 1.9 - u_scroll * 0.004
      );
      vec3 target = vec3(mOff.x * 0.3, mOff.y * 0.2, 0.0);

      float roll = sin(u_time * 0.05) * 0.04;
      mat3  cam  = look_at(ro, target, roll);
      vec3  rd   = cam * normalize(vec3(uv, 1.7));

      /* ── Raymarching ─────────────────────────────────────────────────── */
      float t       = 0.08;
      float glow    = 0.0;   /* tight surface proximity glow */
      float halo    = 0.0;   /* wide atmospheric halo */
      float hit     = 0.0;
      float hitDist = 0.0;
      vec3  hitNorm = vec3(0.0);
      vec3  hitP    = vec3(0.0);

      for (int i = 0; i < MAX_STEPS; i++) {
        vec3  p    = ro + rd * t;
        float d    = scene(p);
        float absd = abs(d);

        /* Accumulate volumetric glow — two decay rates for depth */
        glow += exp(-absd * 7.5)  * 0.038;
        halo += exp(-absd * 2.2)  * 0.010;

        if (absd < SURF_DIST && hit < 0.5) {
          hit     = 1.0;
          hitDist = t;
          hitNorm = surf_normal(p);
          hitP    = p;
        }

        t += max(absd * 0.40, 0.010);
        if (t > MAX_DIST) break;
      }

      /* ── Lighting ────────────────────────────────────────────────────── */
      /* Two orbiting light sources at different orbital speeds */
      vec3 L1 = normalize(vec3(sin(u_time * 0.22) * 2.0,  1.6, cos(u_time * 0.22) * 2.0));
      vec3 L2 = normalize(vec3(-cos(u_time * 0.15) * 1.5, 0.8, sin(u_time * 0.15) * 1.5));

      float diff1  = max(dot(hitNorm, L1), 0.0);
      float diff2  = max(dot(hitNorm, L2), 0.0) * 0.45;
      float diffuse = diff1 + diff2;

      /* Blinn-Phong specular */
      vec3  hv   = normalize(L1 - rd);
      float spec = pow(max(dot(hitNorm, hv), 0.0), 48.0);

      /* Fresnel rim light — surfaces facing away glow with secondary color */
      float nDotV  = max(dot(-rd, hitNorm), 0.0);
      float fresnel = pow(1.0 - nDotV, 4.0);

      /* ── z=x·y Dimensional Data Extraction ──────────────────────────── */
      /* At every surface hit, extract the manifold z=x*y value.
         This "reads" the dimensional data encoded at that point.           */
      float zxy_val   = hitP.x * hitP.y;
      float zxy_pulse = abs(sin(zxy_val * 3.0 + u_time * 0.6));

      /* Dimensional extraction depth: how many "layers" deep are we? */
      float dim_data  = dim_extract(hitP);

      /* ── Color Composition ───────────────────────────────────────────── */
      /* Surface color: blend theme colors by dimensional data value        */
      vec3 surfBase  = mix(u_col_a * 0.55, u_col_b * 0.4, zxy_pulse * 0.7 + dim_data * 0.3);
      vec3 surfColor = surfBase * (0.22 + diffuse * 0.65)
                     + u_col_a  * spec    * 0.9
                     + u_col_b  * fresnel * 0.55;

      /* Subsurface scatter-like warmth in the tunnels */
      float sss = exp(-diffuse * 3.0) * 0.12;
      surfColor += u_col_b * sss;

      /* Atmospheric depth: surfaces further away fade */
      if (hit > 0.5) surfColor *= exp(-hitDist * 0.055);

      /* Volumetric glow: emanates from the crystal network */
      float glowPhase = sin(u_time * 0.18) * 0.5 + 0.5;
      vec3  glowColor = mix(u_col_a, u_col_b, glowPhase) * glow * 2.8;
      vec3  haloColor = u_col_a * halo * 0.6;

      /* z=x·y data field overlay: faint saddle-surface contours in bg    */
      float grid  = data_grid(uv);
      float fwave = abs(sin(uv.x * uv.y * 8.0 - u_time * 1.2)) * 0.5 + 0.5;
      vec3  gridC = u_col_a * grid * fwave * (1.0 - hit * 0.85);

      /* Screen-space dimensional pulse: z=x·y broadcast across the frame  */
      float scrZXY = abs(sin(uv.x * uv.y * 14.0 - u_time * 0.35)) * 0.028;
      vec3  scrPulse = u_col_b * scrZXY * (1.0 - hit * 0.9);

      /* Compose */
      vec3 color = surfColor * hit + glowColor + haloColor + gridC + scrPulse;

      /* ── Post-Processing ─────────────────────────────────────────────── */
      /* Vignette — darkens the frame edges, focuses attention to center   */
      float vig = 1.0 - pow(length(uv) * 0.52, 2.4);
      color *= clamp(vig, 0.0, 1.0);

      /* Subtle film grain — adds cinematic texture */
      float grain = fract(sin(dot(fc + u_time * 0.1, vec2(127.1, 311.7))) * 43758.5) * 0.018;
      color += grain * (1.0 - length(uv) * 0.4);

      /* ── Manifold Compile Boot Sequence ──────────────────────────────── */
      /* Phase 1 (u_compile 0.0→0.4): scanline sweep from bottom
         Phase 2 (u_compile 0.4→1.0): fade in fully
         The frontier line emits a bright flash of the primary color.       */
      float cp      = u_compile;
      float scanPos = cp * 1.08 - 0.04;
      float scan    = smoothstep(scanPos - 0.018, scanPos, fragN.y)
                    * (1.0 - smoothstep(scanPos, scanPos + 0.003, fragN.y));
      float reveal  = smoothstep(0.0, 0.02, fragN.y - (scanPos - 0.04));

      color = mix(
        vec3(0.0),
        color,
        mix(reveal * step(0.0, fragN.y - (scanPos - 0.05)), 1.0, cp * cp)
      );

      /* Frontier scan flash */
      color += u_col_a * scan * 5.0 * (1.0 - cp) * u_intensity;

      /* Data compile noise in unrendered region */
      float noise = fract(sin(dot(fc * 0.01 + u_time, vec2(92.3, 17.7))) * 8371.2);
      float preReveal = 1.0 - reveal;
      color += u_col_a * noise * preReveal * 0.04 * (1.0 - cp);

      /* Final intensity */
      color *= u_intensity;

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  // ── Shader compilation helper ──────────────────────────────────────────
  function compileShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[ManifoldReality] Shader error:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  // ── Init ───────────────────────────────────────────────────────────────
  function init() {
    const canvas = document.getElementById('gyroid-bg');
    if (!canvas) return;

    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) { console.warn('[ManifoldReality] WebGL not available'); return; }

    // Detect theme from <body data-mtheme="...">
    let themeName = document.body.dataset.mtheme || 'cyan';
    if (!THEMES[themeName]) themeName = 'cyan';
    let theme = THEMES[themeName];
    let intensity = 1.0;

    // Resize
    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize, { passive: true });
    resize();

    // Build program
    const vs = compileShader(gl, gl.VERTEX_SHADER, VS);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[ManifoldReality] Link error:', gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    // Full-screen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');
    const uScroll = gl.getUniformLocation(prog, 'u_scroll');
    const uColA = gl.getUniformLocation(prog, 'u_col_a');
    const uColB = gl.getUniformLocation(prog, 'u_col_b');
    const uCompile = gl.getUniformLocation(prog, 'u_compile');
    const uIntensity = gl.getUniformLocation(prog, 'u_intensity');

    // State
    let scrollY = 0;
    let mouseX = 0.5;
    let mouseY = 0.5;
    let compileVal = 0.0;
    let compileStartTime = null;
    const COMPILE_DURATION = 1800; // ms

    window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });
    window.addEventListener('mousemove', e => {
      mouseX = e.clientX / window.innerWidth;
      mouseY = 1.0 - (e.clientY / window.innerHeight);
    }, { passive: true });

    // Render loop
    function render(timestamp) {
      // Compile boot animation
      if (compileStartTime === null) compileStartTime = timestamp;
      const elapsed = timestamp - compileStartTime;
      compileVal = Math.min(elapsed / COMPILE_DURATION, 1.0);

      const t = timestamp * 0.001;

      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, mouseX, mouseY);
      gl.uniform1f(uScroll, scrollY);
      gl.uniform3fv(uColA, theme.a);
      gl.uniform3fv(uColB, theme.b);
      gl.uniform1f(uCompile, compileVal);
      gl.uniform1f(uIntensity, intensity);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);

    // ── Public API ───────────────────────────────────────────────────────
    window.ManifoldReality = {
      setTheme(name) {
        if (THEMES[name]) { theme = THEMES[name]; themeName = name; }
      },
      setIntensity(v) { intensity = Math.max(0, Math.min(2, v)); },
      getTheme() { return themeName; },
      recompile() { compileStartTime = null; },
    };

    // Backward-compatibility with gyroid.js intensity API
    Object.defineProperty(window, 'gyroidIntensity', {
      set: v => { intensity = v; },
      get: () => intensity,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
