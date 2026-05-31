// 3D Schwarz Diamond Manifold Background with Mouse Interaction
// Uses Three.js for raymarching the Schwarz Diamond TPMS
// Formula: cos(x)cos(y)cos(z) - sin(x)sin(y)sin(z) = 0

const canvas = document.getElementById('schwarz-diamond-bg');
if (!canvas) {
  console.error('Schwarz Diamond canvas not found');
} else {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x06060f, 1);
  let width = window.innerWidth;
  let height = window.innerHeight;
  renderer.setSize(width, height);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position.set(0, 0, 40);

  // Schwarz Diamond SDF (Signed Distance Function)
  function schwarzDiamondSDF(p) {
    const x = p.x;
    const y = p.y;
    const z = p.z;
    // Schwarz Diamond formula: cos(x)cos(y)cos(z) - sin(x)sin(y)sin(z) = 0
    return Math.cos(x) * Math.cos(y) * Math.cos(z) - Math.sin(x) * Math.sin(y) * Math.sin(z);
  }

  // Create a mesh representing the Schwarz Diamond
  // Using a high-density point cloud for the manifold surface
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];
  const numPoints = 50000;
  const scale = 8;
  const phi = (1 + Math.sqrt(5)) / 2; // Golden ratio

  for (let i = 0; i < numPoints; i++) {
    // Sample points in 3D space
    const x = (Math.random() - 0.5) * scale;
    const y = (Math.random() - 0.5) * scale;
    const z = (Math.random() - 0.5) * scale;
    
    const p = new THREE.Vector3(x, y, z);
    const d = schwarzDiamondSDF(p);
    
    // Only keep points near the surface (|d| < threshold)
    if (Math.abs(d) < 0.3) {
      positions.push(x, y, z);
      
      // Color based on position (cyan, green, purple, gold palette)
      const t = (Math.sin(x * 0.5) + Math.cos(y * 0.5) + Math.sin(z * 0.5)) / 3;
      const color = new THREE.Color();
      if (t < 0.25) {
        color.setHex(0x2cf0ff); // Cyan
      } else if (t < 0.5) {
        color.setHex(0x4dffb0); // Green
      } else if (t < 0.75) {
        color.setHex(0xc79aff); // Purple
      } else {
        color.setHex(0xffd166); // Gold
      }
      colors.push(color.r, color.g, color.b);
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.15,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  // Add some larger geometric shapes to emphasize the structure
  const wireframeGeometry = new THREE.IcosahedronGeometry(6, 2);
  const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0x2cf0ff,
    wireframe: true,
    transparent: true,
    opacity: 0.15
  });
  const wireframe = new THREE.Mesh(wireframeGeometry, wireframeMaterial);
  scene.add(wireframe);

  // Add a second wireframe with different rotation
  const wireframe2 = new THREE.Mesh(
    new THREE.IcosahedronGeometry(4, 1),
    new THREE.MeshBasicMaterial({
      color: 0xc79aff,
      wireframe: true,
      transparent: true,
      opacity: 0.1
    })
  );
  wireframe2.rotation.x = Math.PI / 4;
  wireframe2.rotation.y = Math.PI / 4;
  scene.add(wireframe2);

  // Mouse interaction
  let mouseX = 0, mouseY = 0;
  let targetRotationX = 0, targetRotationY = 0;

  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / width - 0.5) * 2;
    mouseY = (e.clientY / height - 0.5) * 2;
  });

  // Touch support
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      mouseX = (e.touches[0].clientX / width - 0.5) * 2;
      mouseY = (e.touches[0].clientY / height - 0.5) * 2;
    }
  });

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  const pointLight1 = new THREE.PointLight(0x2cf0ff, 1.5, 100);
  pointLight1.position.set(20, 20, 20);
  scene.add(pointLight1);

  const pointLight2 = new THREE.PointLight(0xffd166, 1.2, 100);
  pointLight2.position.set(-20, -20, 20);
  scene.add(pointLight2);

  const pointLight3 = new THREE.PointLight(0xc79aff, 1.0, 100);
  pointLight3.position.set(0, 20, -20);
  scene.add(pointLight3);

  // Animation
  let time = 0;
  function animate() {
    requestAnimationFrame(animate);
    
    time += 0.005;
    
    // Smooth rotation based on mouse position
    targetRotationY = mouseX * 0.5;
    targetRotationX = mouseY * 0.5;
    
    points.rotation.y += (targetRotationY - points.rotation.y) * 0.05;
    points.rotation.x += (targetRotationX - points.rotation.x) * 0.05;
    
    // Continuous slow rotation
    points.rotation.z += 0.001;
    
    // Wireframe rotations
    wireframe.rotation.x += 0.002;
    wireframe.rotation.y += 0.003;
    wireframe2.rotation.x -= 0.0015;
    wireframe2.rotation.y -= 0.002;
    
    // Pulse effect on points
    const scalePulse = 1 + Math.sin(time * 2) * 0.05;
    points.scale.set(scalePulse, scalePulse, scalePulse);
    
    // Move lights in orbit
    pointLight1.position.x = Math.sin(time) * 25;
    pointLight1.position.z = Math.cos(time) * 25;
    pointLight2.position.y = Math.sin(time * 0.7) * 25;
    pointLight3.position.x = Math.cos(time * 0.5) * 25;
    
    renderer.render(scene, camera);
  }
  animate();

  // Resize handler
  window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
}
