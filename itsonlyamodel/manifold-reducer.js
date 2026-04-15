import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// --- Global State ---
let scene, camera, renderer, controls;
let originalMeshGroup = new THREE.Group();
let reducedMeshGroup = new THREE.Group();
let originalPolys = 0, reducedPolys = 0;
let currentView = 'split'; // split, original, reduced

// --- UI Elements ---
const overlay = document.getElementById('loading-overlay');
const textLoading = document.getElementById('loading-text');
const btnReduce = document.getElementById('btn-reduce');
const btnExport = document.getElementById('btn-export');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');

init();
animate();

function init() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1f);
    scene.add(originalMeshGroup);
    scene.add(reducedMeshGroup);

    // Camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 5);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0x88bbff, 0.5);
    backLight.position.set(-10, -20, -10);
    scene.add(backLight);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Events
    window.addEventListener('resize', onWindowResize);
    setupDragAndDrop();

    document.getElementById('resolution').addEventListener('input', (e) => {
        document.getElementById('res-val').innerText = e.target.value;
    });

    btnReduce.addEventListener('click', applyManifoldReduction);
    btnExport.addEventListener('click', exportGLB);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentView = e.target.dataset.view;
            updateVisibility();
        });
    });
}

function updateVisibility() {
    if (currentView === 'split') {
        originalMeshGroup.visible = true;
        reducedMeshGroup.visible = true;
        originalMeshGroup.position.x = -0.6;
        reducedMeshGroup.position.x = 0.6;
    } else if (currentView === 'original') {
        originalMeshGroup.visible = true;
        reducedMeshGroup.visible = false;
        originalMeshGroup.position.x = 0;
    } else {
        originalMeshGroup.visible = false;
        reducedMeshGroup.visible = true;
        reducedMeshGroup.position.x = 0;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Drag & Drop ---
function setupDragAndDrop() {
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

    window.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-active');
    });
    window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-active');
    });
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-active');
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });
}

function showLoading(msg) {
    textLoading.innerText = msg;
    overlay.style.display = 'flex';
}

function hideLoading() {
    overlay.style.display = 'none';
}

function handleFile(file) {
    if (!file) return;
    showLoading('Loading Model...');

    const reader = new FileReader();
    reader.onload = (e) => {
        const contents = e.target.result;

        while (originalMeshGroup.children.length > 0) {
            originalMeshGroup.remove(originalMeshGroup.children[0]);
        }
        while (reducedMeshGroup.children.length > 0) {
            reducedMeshGroup.remove(reducedMeshGroup.children[0]);
        }

        const ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'stl') {
            const loader = new STLLoader();
            const geom = loader.parse(contents);
            setupOriginalMesh(geom);
        } else if (ext === 'glb' || ext === 'gltf') {
            const loader = new GLTFLoader();
            loader.parse(contents, '', (gltf) => {
                const meshes = [];
                gltf.scene.traverse(child => { if (child.isMesh) meshes.push(child); });
                if (meshes.length > 0) setupOriginalMesh(meshes[0].geometry);
                else hideLoading();
            });
        }
    };

    reader.readAsArrayBuffer(file);
}

function setupOriginalMesh(geometry) {
    geometry.center();
    geometry.computeBoundingBox();

    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    geometry.scale(1 / maxDim, 1 / maxDim, 1 / maxDim);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        color: 0xcccccc, roughness: 0.4, metalness: 0.1
    });

    const mesh = new THREE.Mesh(geometry, material);
    originalMeshGroup.add(mesh);

    originalPolys = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
    document.getElementById('stat-orig').innerText = originalPolys.toLocaleString();
    document.getElementById('stats').style.display = 'block';

    btnReduce.disabled = false;
    currentView = 'split';
    updateVisibility();

    camera.position.set(0, 0, 1.5);
    controls.target.set(0, 0, 0);
    controls.update();

    hideLoading();
}

function exportGLB() {
    if (reducedMeshGroup.children.length === 0) return;
    showLoading('Exporting Model...');

    const exporter = new GLTFExporter();
    exporter.parse(reducedMeshGroup.children[0], (gltf) => {
        const blob = new Blob([gltf], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'manifold-reduced.glb';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        hideLoading();
    }, { binary: true });
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function applyManifoldReduction() {
    if (originalMeshGroup.children.length === 0) return;
    showLoading('Calculating Manifold...');

    setTimeout(() => {
        const type = document.getElementById('manifold-type').value;
        const res = parseInt(document.getElementById('resolution').value);

        let geometry;
        if (type === 'sphere') {
            geometry = new THREE.SphereGeometry(1, res, res);
        } else if (type === 'cylinder') {
            geometry = new THREE.CylinderGeometry(0.8, 0.8, 1.5, res, Math.max(2, res / 4));
        } else {
            // Saddle z = x*y
            geometry = new THREE.PlaneGeometry(1.5, 1.5, res, res);
            const pos = geometry.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                const y = pos.getY(i);
                // z = x * y
                pos.setZ(i, x * y * 0.5);
            }
            geometry.computeVertexNormals();
        }

        const raycaster = new THREE.Raycaster();
        const positions = geometry.attributes.position;
        const normals = geometry.attributes.normal;
        const center = new THREE.Vector3(0, 0, 0);

        const originalMesh = originalMeshGroup.children[0];

        // Raycast logic to conform manifold to original mesh
        for (let i = 0; i < positions.count; i++) {
            const vertex = new THREE.Vector3().fromBufferAttribute(positions, i);
            const normal = new THREE.Vector3().fromBufferAttribute(normals, i);

            let origin, dir;
            if (type === 'sphere' || type === 'cylinder') {
                origin = vertex.clone().multiplyScalar(2.5); // Start outside
                dir = center.clone().sub(origin).normalize(); // Point inward
            } else {
                // Saddle: Cast inward along negative normal
                origin = vertex.clone().add(normal.clone().multiplyScalar(2));
                dir = normal.clone().multiplyScalar(-1).normalize();
            }

            raycaster.set(origin, dir);
            const intersects = raycaster.intersectObject(originalMesh, false);

            if (intersects.length > 0) {
                positions.setXYZ(i, intersects[0].point.x, intersects[0].point.y, intersects[0].point.z);
            } else if (type === 'saddle') {
                // Try opposite direction
                const oppOrigin = vertex.clone().add(normal.clone().multiplyScalar(-2));
                const oppDir = normal.clone().normalize();
                raycaster.set(oppOrigin, oppDir);
                const oppIntersects = raycaster.intersectObject(originalMesh, false);
                if (oppIntersects.length > 0) {
                    positions.setXYZ(i, oppIntersects[0].point.x, oppIntersects[0].point.y, oppIntersects[0].point.z);
                } else {
                    // Fallback to manifold shape
                }
            }
        }

        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: 0x10B981, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide
        });

        const reducedMesh = new THREE.Mesh(geometry, material);

        while (reducedMeshGroup.children.length > 0) {
            reducedMeshGroup.remove(reducedMeshGroup.children[0]);
        }
        reducedMeshGroup.add(reducedMesh);

        reducedPolys = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
        document.getElementById('stat-red').innerText = reducedPolys.toLocaleString();

        const ratio = Math.round((1 - (reducedPolys / originalPolys)) * 100);
        document.getElementById('stat-ratio').innerText = ratio > 0 ? ratio + '%' : '0%';

        document.getElementById('view-tabs').style.display = 'flex';
        document.getElementById('btn-export').style.display = 'block';

        currentView = 'split';
        document.querySelectorAll('.tab-btn').forEach(b => {
            if (b.dataset.view === 'split') b.classList.add('active');
            else b.classList.remove('active');
        });
        updateVisibility();
        hideLoading();

    }, 50);
}
