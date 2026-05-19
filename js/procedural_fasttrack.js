// js/procedural_fasttrack.js
// Procedural SDF-based FastTrack board and asset generator for Three.js
// All geometry is emergent from math, not GLB files.
// Requires a marching cubes implementation for mesh extraction.

// --- SDF Primitives ---
function sdfHexBoard(x, y, z, r = 5, thickness = 0.5) {
  // 2D hex distance
  const qx = Math.abs(x) * 0.8660254 + y * 0.5;
  const qy = y;
  const d = Math.max(Math.abs(qx), Math.abs(qy), Math.abs(-qx - qy)) - r;
  // Extrude in z for thickness
  return Math.max(d, Math.abs(z) - thickness / 2);
}

function sdfHole(x, y, z, hx, hy, hz, radius = 0.3, depth = 0.6) {
  const dx = x - hx, dy = y - hy, dz = z - hz;
  const dxy = Math.sqrt(dx * dx + dy * dy) - radius;
  return Math.max(dxy, Math.abs(dz) - depth / 2);
}

function sdfPeg(x, y, z, px, py, pz, radius = 0.2) {
  const dx = x - px, dy = y - py, dz = z - pz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - radius;
}

// --- SDF Operations ---
function sdfUnion(a, b) { return Math.min(a, b); }
function sdfSubtract(a, b) { return Math.max(a, -b); }
function sdfIntersect(a, b) { return Math.max(a, b); }

// --- FastTrack Board SDF (with 6 holes in a ring) ---
function sdfFastTrackBoard(x, y, z) {
  let d = sdfHexBoard(x, y, z, 5, 0.5);
  // Subtract holes at each position (6 holes in a ring)
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 * i) / 6;
    const hx = Math.cos(angle) * 3.5;
    const hy = Math.sin(angle) * 3.5;
    d = sdfSubtract(d, sdfHole(x, y, z, hx, hy, 0, 0.35, 0.7));
  }
  return d;
}

// --- Marching Cubes Field Generator ---
function generateFastTrackField({ size = 12, resolution = 64, sdf = sdfFastTrackBoard } = {}) {
  const field = [];
  const half = size / 2;
  for (let x = 0; x < resolution; x++) {
    for (let y = 0; y < resolution; y++) {
      for (let z = 0; z < resolution; z++) {
        const fx = (x / (resolution - 1)) * size - half;
        const fy = (y / (resolution - 1)) * size - half;
        const fz = (z / (resolution - 1)) * size - half;
        field.push(sdf(fx, fy, fz));
      }
    }
  }
  return field;
}

// --- Three.js Mesh Creator (requires THREE.MarchingCubes) ---
function createFastTrackBoardMesh({ size = 12, resolution = 64, level = 0, material = null } = {}) {
  if (typeof THREE.MarchingCubes !== 'function') {
    console.error('THREE.MarchingCubes not found. Please include a marching cubes implementation.');
    return null;
  }
  const field = generateFastTrackField({ size, resolution });
  const effect = new THREE.MarchingCubes(resolution, material || new THREE.MeshStandardMaterial({ color: 0xffcc00 }), true, true);
  effect.field = field;
  effect.isolation = level;
  effect.position.set(0, 0, 0);
  effect.scale.set(size, size, size);
  return effect;
}

// --- Export helpers ---
window.sdfHexBoard = sdfHexBoard;
window.sdfHole = sdfHole;
window.sdfPeg = sdfPeg;
window.sdfFastTrackBoard = sdfFastTrackBoard;
window.generateFastTrackField = generateFastTrackField;
window.createFastTrackBoardMesh = createFastTrackBoardMesh;
