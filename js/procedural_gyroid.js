// js/procedural_gyroid.js
// Procedural Gyroid/Helix/Cubic Lattice Geometry Generator for Three.js
// Generates geometry from math, no GLB required.
// Usage: const mesh = createGyroidMesh({size: 10, resolution: 48, k: 1});

// Gyroid Signed Distance Function (SDF)
function gyroidSDF(x, y, z, k = 1) {
  return Math.sin(k * x) * Math.cos(k * y) +
    Math.sin(k * y) * Math.cos(k * z) +
    Math.sin(k * z) * Math.cos(k * x);
}

// Generate a scalar field for marching cubes
function generateGyroidField({ size = 10, resolution = 48, k = 1 } = {}) {
  const field = [];
  const half = size / 2;
  const step = size / resolution;
  for (let x = 0; x < resolution; x++) {
    for (let y = 0; y < resolution; y++) {
      for (let z = 0; z < resolution; z++) {
        const fx = (x / (resolution - 1)) * size - half;
        const fy = (y / (resolution - 1)) * size - half;
        const fz = (z / (resolution - 1)) * size - half;
        field.push(gyroidSDF(fx, fy, fz, k));
      }
    }
  }
  return field;
}

// Create a Three.js mesh from the gyroid field using marching cubes
// Requires THREE.MarchingCubes or similar implementation
function createGyroidMesh({ size = 10, resolution = 48, k = 1, level = 0, material = null } = {}) {
  // You must include a marching cubes implementation, e.g. https://github.com/mrdoob/three.js/blob/master/examples/jsm/objects/MarchingCubes.js
  // This is a placeholder for integration:
  if (typeof THREE.MarchingCubes !== 'function') {
    console.error('THREE.MarchingCubes not found. Please include a marching cubes implementation.');
    return null;
  }
  const field = generateGyroidField({ size, resolution, k });
  const effect = new THREE.MarchingCubes(resolution, material || new THREE.MeshStandardMaterial({ color: 0x00ffcc }), true, true);
  effect.field = field;
  effect.isolation = level;
  effect.position.set(0, 0, 0);
  effect.scale.set(size, size, size);
  return effect;
}

// Utility: Create three orthogonal z=xy planes for cubic lattice
function createCubicLatticePlanes({ size = 10, segments = 64, material = null } = {}) {
  const planes = [];
  const mat = material || new THREE.MeshStandardMaterial({ color: 0xff00cc, side: THREE.DoubleSide, wireframe: true });
  // z = x y (xy-plane)
  const xy = new THREE.Mesh(new THREE.PlaneGeometry(size, size, segments, segments), mat);
  xy.rotation.x = Math.PI / 2;
  planes.push(xy);
  // x = y z (yz-plane)
  const yz = new THREE.Mesh(new THREE.PlaneGeometry(size, size, segments, segments), mat);
  yz.rotation.y = Math.PI / 2;
  planes.push(yz);
  // y = z x (zx-plane)
  const zx = new THREE.Mesh(new THREE.PlaneGeometry(size, size, segments, segments), mat);
  zx.rotation.z = Math.PI / 2;
  planes.push(zx);
  return planes;
}

// Export helpers for use in other scripts
window.createGyroidMesh = createGyroidMesh;
window.createCubicLatticePlanes = createCubicLatticePlanes;
window.gyroidSDF = gyroidSDF;
window.generateGyroidField = generateGyroidField;
