// 3D Golden Spiral with Parallax and Glow (Three.js)
const canvas = document.getElementById('spiral-bg');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x0a0a1a, 0.95);
let width = window.innerWidth;
let height = window.innerHeight;
renderer.setSize(width, height);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
camera.position.set(0, 0, 60);

// Golden spiral points
const points = [];
const numPoints = 400;
const phi = (1 + Math.sqrt(5)) / 2;
const a = 1.2;
for (let i = 0; i < numPoints; i++) {
  const theta = i * 0.25;
  const r = a * Math.pow(phi, theta / (2 * Math.PI));
  const x = r * Math.cos(theta);
  const y = r * Math.sin(theta);
  const z = 0.22 * i * Math.sin(i * 0.09);
  points.push(new THREE.Vector3(x, y, z));
}
const curve = new THREE.CatmullRomCurve3(points);
const geometry = new THREE.TubeGeometry(curve, 500, 0.7, 24, false);
const material = new THREE.MeshPhysicalMaterial({
  color: 0xffd166,
  roughness: 0.18,
  metalness: 0.8,
  transmission: 0.7,
  thickness: 1.5,
  clearcoat: 0.8,
  clearcoatRoughness: 0.1,
  emissive: 0x06d6a0,
  emissiveIntensity: 0.18,
  side: THREE.DoubleSide
});
const spiral = new THREE.Mesh(geometry, material);
scene.add(spiral);

// Glow effect (bloom)
const bloom = new THREE.PointLight(0xffd166, 1.5, 120);
bloom.position.set(0, 0, 40);
scene.add(bloom);

// Parallax and camera movement
let mouseX = 0, mouseY = 0;
document.addEventListener('mousemove', (e) => {
  mouseX = (e.clientX / width - 0.5) * 2;
  mouseY = (e.clientY / height - 0.5) * 2;
});

// Floating particles
const particleCount = 220;
const particleGeometry = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i++) {
  const t = Math.random() * numPoints;
  const theta = t * 0.25;
  const r = a * Math.pow(phi, theta / (2 * Math.PI)) * (0.9 + 0.2 * Math.random());
  particlePositions[i * 3] = r * Math.cos(theta) + (Math.random() - 0.5) * 3;
  particlePositions[i * 3 + 1] = r * Math.sin(theta) + (Math.random() - 0.5) * 3;
  particlePositions[i * 3 + 2] = 0.22 * t * Math.sin(t * 0.09) + (Math.random() - 0.5) * 2.5;
}
particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
const particleMaterial = new THREE.PointsMaterial({ color: 0x06d6a0, size: 1.1, opacity: 0.6, transparent: true });
const particles = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particles);

// Lighting
const ambient = new THREE.AmbientLight(0xffffff, 0.38);
scene.add(ambient);

// Animation
function animate() {
  requestAnimationFrame(animate);
  spiral.rotation.z += 0.0015;
  spiral.rotation.x += 0.0008;
  particles.rotation.z -= 0.0005;
  // Parallax camera
  camera.position.x += (mouseX * 10 - camera.position.x) * 0.08;
  camera.position.y += (mouseY * 8 - camera.position.y) * 0.08;
  camera.lookAt(0, 0, 0);
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
