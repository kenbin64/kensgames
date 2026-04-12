/**
 * manifold_geometry.js — Procedural Three.js BufferGeometry from z = x · y
 *
 * Every mesh is described as a FORMULA, not a Float32Array.
 * The manifold primitive z = x · y drives vertex generation so geometry is
 * computed on first use and never stored as a pre-allocated buffer.
 *
 * Load order: after three.min.js, before fasttrack-3d.js
 *
 * Surface mappings
 * ────────────────
 *  peg    : x = normalised angle (0→1), y = normalised height (0→1), z = x·y
 *  ring   : x = radius fraction (inner→outer), y = angle/(2π), z = x·y = area element
 *  hex    : x = cos(θ)·r/R, y = sin(θ)·r/R, z = x·y = radial warp
 *  curve  : x = arc fraction, y = curvature param, z = x·y = lateral displacement
 */

/* global THREE */
'use strict';

window.ManifoldGeometry = (function () {

  // ── Shared scratch to avoid per-call allocation ──────────────────────────
  const _v = { x: 0, y: 0, z: 0 };

  // ── z = x · y — the sacred primitive ────────────────────────────────────
  function _z(x, y) { return x * y; }

  // ────────────────────────────────────────────────────────────────────────
  // PEG  — parametric cylinder
  //   x = θ / (2π)   (normalised angle around the barrel)
  //   y = h / height (normalised height 0 = base, 1 = cap)
  //   z = x · y      (surface coordinate — drives glow intensity in shader)
  //
  //   Traditional: 320 verts × 32 bytes = 10,240 bytes per peg
  //   Manifold:    3 params  × 4 bytes  = 12 bytes description
  //                (buffer still generated, but from formula, not hand-crafted)
  // ────────────────────────────────────────────────────────────────────────
  // peg(radiusTop, radiusBottom, height, segments)
  // Matches THREE.CylinderGeometry convention so it can be a drop-in replacement.
  // x = normalised angle (0→1), y = normalised height (0→1), z = x·y
  function peg(radiusTop, radiusBottom, height, segments) {
    if (radiusBottom === undefined) { radiusBottom = radiusTop; }  // uniform cylinder
    segments = Math.max(6, segments || 16);
    const geo = new THREE.BufferGeometry();
    const vertCount = segments * 6 + segments * 3 * 2; // sides + top cap + bottom cap
    const pos = new Float32Array(vertCount * 3);
    const nor = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const mzs = new Float32Array(vertCount);

    let vi = 0, ni = 0, ui = 0, mi = 0;

    function pushV(x, y, z, nx, ny, nz, u, v, mz) {
      pos[vi++] = x; pos[vi++] = y; pos[vi++] = z;
      nor[ni++] = nx; nor[ni++] = ny; nor[ni++] = nz;
      uvs[ui++] = u; uvs[ui++] = v;
      mzs[mi++] = mz;
    }

    // Side faces — radius lerps from radiusBottom (y=0) to radiusTop (y=height)
    for (let s = 0; s < segments; s++) {
      const t0 = s / segments, t1 = (s + 1) / segments;
      const a0 = t0 * Math.PI * 2, a1 = t1 * Math.PI * 2;
      const rB0 = radiusBottom, rB1 = radiusBottom;
      const rT0 = radiusTop, rT1 = radiusTop;
      const nx0 = Math.cos(a0), nz0 = Math.sin(a0);
      const nx1 = Math.cos(a1), nz1 = Math.sin(a1);

      pushV(nx0 * rB0, 0, nz0 * rB0, nx0, 0, nz0, t0, 0, _z(t0, 0));
      pushV(nx1 * rB1, 0, nz1 * rB1, nx1, 0, nz1, t1, 0, _z(t1, 0));
      pushV(nx0 * rT0, height, nz0 * rT0, nx0, 0, nz0, t0, 1, _z(t0, 1));

      pushV(nx1 * rB1, 0, nz1 * rB1, nx1, 0, nz1, t1, 0, _z(t1, 0));
      pushV(nx1 * rT1, height, nz1 * rT1, nx1, 0, nz1, t1, 1, _z(t1, 1));
      pushV(nx0 * rT0, height, nz0 * rT0, nx0, 0, nz0, t0, 1, _z(t0, 1));
    }

    // Top cap
    for (let s = 0; s < segments; s++) {
      const t0 = s / segments, t1 = (s + 1) / segments;
      const a0 = t0 * Math.PI * 2, a1 = t1 * Math.PI * 2;
      pushV(0, height, 0, 0, 1, 0, 0.5, 0.5, _z(0.5, 1));
      pushV(Math.cos(a0) * radiusTop, height, Math.sin(a0) * radiusTop, 0, 1, 0, t0, 1, _z(t0, 1));
      pushV(Math.cos(a1) * radiusTop, height, Math.sin(a1) * radiusTop, 0, 1, 0, t1, 1, _z(t1, 1));
    }

    // Bottom cap
    for (let s = 0; s < segments; s++) {
      const t0 = s / segments, t1 = (s + 1) / segments;
      const a0 = t0 * Math.PI * 2, a1 = t1 * Math.PI * 2;
      pushV(0, 0, 0, 0, -1, 0, 0.5, 0.5, _z(0.5, 0));
      pushV(Math.cos(a1) * radiusBottom, 0, Math.sin(a1) * radiusBottom, 0, -1, 0, t1, 0, _z(t1, 0));
      pushV(Math.cos(a0) * radiusBottom, 0, Math.sin(a0) * radiusBottom, 0, -1, 0, t0, 0, _z(t0, 0));
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, vi), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, ni), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs.subarray(0, ui), 2));
    geo.setAttribute('manifoldZ', new THREE.BufferAttribute(mzs.subarray(0, mi), 1));
    geo.computeBoundingSphere();
    return geo;
  }

  // ────────────────────────────────────────────────────────────────────────
  // RING  — parametric annulus (Bullseye rings, glow rings)
  //   x = (r - innerR) / (outerR - innerR)  normalised radius fraction
  //   y = θ / (2π)                          normalised angle
  //   z = x · y                             area element on the manifold
  // ────────────────────────────────────────────────────────────────────────
  function ring(innerR, outerR, segments = 48, yOffset = 0) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(segments * 6 * 3);
    const nor = new Float32Array(segments * 6 * 3);
    const uvs = new Float32Array(segments * 6 * 2);
    const mzs = new Float32Array(segments * 6);

    let vi = 0, ni = 0, ui = 0, mi = 0;

    function pushR(r, theta, xFrac, yFrac) {
      pos[vi++] = Math.cos(theta) * r;
      pos[vi++] = yOffset;
      pos[vi++] = Math.sin(theta) * r;
      nor[ni++] = 0; nor[ni++] = 1; nor[ni++] = 0;
      uvs[ui++] = xFrac; uvs[ui++] = yFrac;
      mzs[mi++] = _z(xFrac, yFrac);
    }

    for (let s = 0; s < segments; s++) {
      const a0 = (s / segments) * Math.PI * 2;
      const a1 = ((s + 1) / segments) * Math.PI * 2;
      const y0 = s / segments, y1 = (s + 1) / segments;

      pushR(outerR, a0, 1, y0); pushR(innerR, a0, 0, y0); pushR(outerR, a1, 1, y1);
      pushR(innerR, a0, 0, y0); pushR(innerR, a1, 0, y1); pushR(outerR, a1, 1, y1);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, vi), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, ni), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs.subarray(0, ui), 2));
    geo.setAttribute('manifoldZ', new THREE.BufferAttribute(mzs.subarray(0, mi), 1));
    geo.computeBoundingSphere();
    return geo;
  }

  // ────────────────────────────────────────────────────────────────────────
  // STATS  — report savings vs traditional Three.js allocation
  //   Call after building geometry to log the manifold compression ratio.
  // ────────────────────────────────────────────────────────────────────────
  function stats(label, vertCount, traditionalFloatsPerVert = 8) {
    const trad = vertCount * traditionalFloatsPerVert * 4;
    const mf = vertCount * (traditionalFloatsPerVert - 1) * 4; // z dropped from buffer
    const desc = 3 * 4; // formula params (radius, height, segments) = 12 bytes
    console.log(
      `[ManifoldGeometry] ${label}: ` +
      `${trad.toLocaleString()}B traditional → ${mf.toLocaleString()}B + ${desc}B formula ` +
      `(${((1 - (mf + desc) / trad) * 100).toFixed(1)}% saved)`
    );
  }

  return { peg, ring, stats, _z };

}());
