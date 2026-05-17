// 3D Fibonacci Spiral using Three.js
const canvas = document.getElementById('spiral-bg');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x0a0a1a, 1);
let width = window.innerWidth;
let height = window.innerHeight;
renderer.setSize(width, height);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
camera.position.set(0, 0, 60);

// Fibonacci spiral points
const points = [];
const numPoints = 300;
const a = 1.5;
const b = 2.2;
for (let i = 0; i < numPoints; i++) {
  const theta = i * 0.25;
  const r = a * Math.pow(b, theta / (2 * Math.PI));
  const x = r * Math.cos(theta);
  const y = r * Math.sin(theta);
  const z = 0.18 * i * Math.sin(i * 0.09);
  points.push(new THREE.Vector3(x, y, z));
}
const curve = new THREE.CatmullRomCurve3(points);
const geometry = new THREE.TubeGeometry(curve, 400, 0.45, 16, false);
const material = new THREE.MeshPhysicalMaterial({
  color: 0xffd166,
  roughness: 0.25,
  metalness: 0.7,
  transmission: 0.5,
  thickness: 1.2,
  clearcoat: 0.7,
  clearcoatRoughness: 0.2,
  emissive: 0x06d6a0,
  emissiveIntensity: 0.12,
  side: THREE.DoubleSide
});
const spiral = new THREE.Mesh(geometry, material);
scene.add(spiral);

// Subtle particles
const particleCount = 180;
const particleGeometry = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i++) {
  const t = Math.random() * numPoints;
  const theta = t * 0.25;
  const r = a * Math.pow(b, theta / (2 * Math.PI)) * (0.9 + 0.2 * Math.random());
  particlePositions[i * 3] = r * Math.cos(theta) + (Math.random() - 0.5) * 2;
  particlePositions[i * 3 + 1] = r * Math.sin(theta) + (Math.random() - 0.5) * 2;
  particlePositions[i * 3 + 2] = 0.18 * t * Math.sin(t * 0.09) + (Math.random() - 0.5) * 1.5;
}
particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
const particleMaterial = new THREE.PointsMaterial({ color: 0x06d6a0, size: 0.7, opacity: 0.7, transparent: true });
const particles = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particles);

// Lighting
const ambient = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambient);
const pointLight = new THREE.PointLight(0xffd166, 1.2, 200);
pointLight.position.set(20, 30, 40);
scene.add(pointLight);

// Animation
function animate() {
  requestAnimationFrame(animate);
  spiral.rotation.z += 0.002;
  spiral.rotation.x += 0.0012;
  particles.rotation.z -= 0.0007;
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  width = window.innerWidth;
  height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});
