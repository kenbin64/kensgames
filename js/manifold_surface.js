/**
 * MANIFOLD SURFACE — z = x·y
 * Interactive WebGL hyperbolic paraboloid (saddle surface) renderer.
 * Pure WebGL1, zero dependencies.  Drag to rotate, auto-rotates when idle.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('manifold-surface');
  if (!canvas) return;

  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) { canvas.style.display = 'none'; return; }

  // ── Constants ─────────────────────────────────────────────────────────────
  const N = 50;    // grid resolution
  const S = 1.2;   // x / y spatial extent [-S, S]
  const ZS = 0.65;  // z (= x·y) vertical scale
  const MAXZ = S * S; // maximum |z| value

  // ── Build mesh geometry ───────────────────────────────────────────────────
  const meshPos = [];
  const meshZn = [];

  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x = (i / N - 0.5) * 2 * S;
      const y = (j / N - 0.5) * 2 * S;
      const z = x * y;
      meshPos.push(x, z * ZS, y);
      meshZn.push(z / MAXZ);
    }
  }

  const meshIdx = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * (N + 1) + j;
      meshIdx.push(a, a + (N + 1), a + 1,
        a + 1, a + (N + 1), a + (N + 2));
    }
  }

  // ── Build wireframe iso-line strips ───────────────────────────────────────
  const STEP = 8;
  const lineStrips = [];

  function buildStrips(dir) {
    for (let fi = 0; fi <= N; fi += STEP) {
      const pos = [], zn = [];
      for (let fj = 0; fj <= N; fj++) {
        const i = dir === 0 ? fi : fj;
        const j = dir === 0 ? fj : fi;
        const x = (i / N - 0.5) * 2 * S;
        const y = (j / N - 0.5) * 2 * S;
        const z = x * y;
        pos.push(x, z * ZS, y);
        zn.push(z / MAXZ);
      }
      lineStrips.push({ pos: new Float32Array(pos), zn: new Float32Array(zn) });
    }
  }
  buildStrips(0);
  buildStrips(1);

  // ── Shaders ───────────────────────────────────────────────────────────────
  const vsSrc = [
    'attribute vec3 a_pos;',
    'attribute float a_zn;',
    'uniform float u_rx, u_ry, u_aspect;',
    'varying float v_zn, v_depth;',
    'mat3 rotX(float a) { float c=cos(a),s=sin(a); return mat3(1.,0.,0.,0.,c,-s,0.,s,c); }',
    'mat3 rotY(float a) { float c=cos(a),s=sin(a); return mat3(c,0.,s,0.,1.,0.,-s,0.,c); }',
    'void main() {',
    '  vec3 p = rotX(u_rx) * rotY(u_ry) * a_pos;',
    '  float zv = p.z + 4.0;',
    '  gl_Position = vec4(p.x*2.0/(zv*u_aspect), p.y*2.0/zv, p.z/3.0, 1.0);',
    '  v_zn   = a_zn;',
    '  v_depth = 1.0 - clamp(p.z*0.35, 0.0, 0.6);',
    '}'
  ].join('\n');

  const fsMesh = [
    'precision mediump float;',
    'varying float v_zn, v_depth;',
    'void main() {',
    '  float t = v_zn*0.5+0.5;',
    '  vec3 col = t<0.5 ? mix(vec3(0.55,0.,1.),vec3(0.,1.,1.),t*2.) : mix(vec3(0.,1.,1.),vec3(1.,.9,0.),(t-0.5)*2.);',
    '  gl_FragColor = vec4(col*v_depth, 0.28);',
    '}'
  ].join('\n');

  const fsLine = [
    'precision mediump float;',
    'varying float v_zn, v_depth;',
    'void main() {',
    '  float t = v_zn*0.5+0.5;',
    '  vec3 col = t<0.5 ? mix(vec3(0.55,0.,1.),vec3(0.,1.,1.),t*2.) : mix(vec3(0.,1.,1.),vec3(1.,.9,0.),(t-0.5)*2.);',
    '  gl_FragColor = vec4(col*v_depth, 0.88);',
    '}'
  ].join('\n');

  // ── GL helpers ────────────────────────────────────────────────────────────
  function mkShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s); return s;
  }
  function mkProg(fs) {
    const p = gl.createProgram();
    gl.attachShader(p, mkShader(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, mkShader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p); return p;
  }
  function mkBuf(data) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    return b;
  }
  function mkIBuf(data) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data), gl.STATIC_DRAW);
    return b;
  }

  const progMesh = mkProg(fsMesh);
  const progLine = mkProg(fsLine);

  const meshPosBuf = mkBuf(meshPos);
  const meshZnBuf = mkBuf(meshZn);
  const meshIdxBuf = mkIBuf(meshIdx);

  const lineStripBufs = lineStrips.map(s => ({
    pos: mkBuf(s.pos),
    zn: mkBuf(s.zn),
    count: s.pos.length / 3,
  }));

  // ── Resize ────────────────────────────────────────────────────────────────
  function resize() {
    canvas.width = canvas.offsetWidth || 600;
    canvas.height = canvas.offsetHeight || 400;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  // ── Interaction ───────────────────────────────────────────────────────────
  let rotY = 0.0, rotX = 0.38;
  let drag = false, lastX = 0, lastY = 0;

  canvas.addEventListener('mousedown', e => { drag = true; lastX = e.clientX; lastY = e.clientY; });
  window.addEventListener('mouseup', () => drag = false);
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    rotY += (e.clientX - lastX) * 0.013;
    rotX = Math.max(-1.2, Math.min(1.2, rotX + (e.clientY - lastY) * 0.013));
    lastX = e.clientX; lastY = e.clientY;
  });
  canvas.addEventListener('touchstart', e => {
    drag = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    if (!drag) return;
    rotY += (e.touches[0].clientX - lastX) * 0.013;
    rotX = Math.max(-1.2, Math.min(1.2, rotX + (e.touches[0].clientY - lastY) * 0.013));
    lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', () => drag = false);

  // ── Attribute binder ──────────────────────────────────────────────────────
  function bind(prog, name, b) {
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, name === 'a_zn' ? 1 : 3, gl.FLOAT, false, 0, 0);
  }
  function setUniforms(prog, rx, ry) {
    gl.useProgram(prog);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_rx'), rx);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_ry'), ry);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_aspect'), canvas.width / canvas.height || 1.5);
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  let t0 = null;
  function frame(ts) {
    if (!t0) t0 = ts;
    const elapsed = (ts - t0) * 0.001;
    const ry = rotY + (drag ? 0 : elapsed * 0.20);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);

    // — Mesh —
    setUniforms(progMesh, rotX, ry);
    bind(progMesh, 'a_pos', meshPosBuf);
    bind(progMesh, 'a_zn', meshZnBuf);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshIdxBuf);
    gl.drawElements(gl.TRIANGLES, meshIdx.length, gl.UNSIGNED_SHORT, 0);

    // — Wireframe —
    setUniforms(progLine, rotX, ry);
    for (const s of lineStripBufs) {
      bind(progLine, 'a_pos', s.pos);
      bind(progLine, 'a_zn', s.zn);
      gl.drawArrays(gl.LINE_STRIP, 0, s.count);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
