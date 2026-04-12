/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 GYROID RENDERER — WebGL live background
 * ═══════════════════════════════════════════════════════════════════════════════
 * sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = 0
 * The manifold IS the interface. The surface breathes. The data lives on it.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
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
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
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
