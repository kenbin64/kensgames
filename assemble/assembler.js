/**
 * ASSEMBLE — Simulation Engine
 *
 * Dimensional model:
 *   Every placed part IS a dimension.
 *   Every connection IS a point shared between two dimensions.
 *   The simulation traverses the dimension graph, propagating
 *   power/torque/flow from sources through connections to loads.
 *
 * Layers resolved in order:
 *   1. Power sources  → emit shaft/wire/pipe energy
 *   2. Transmissions  → gears/belts/shafts propagate rotation
 *   3. Logic          → switches/sensors gate signals
 *   4. Loads          → motors/lights/gauges consume energy
 *   5. Structural     → check joints, detect overloads / failures
 */

'use strict';

import { PORT, PARTS, PART_MAP, MAT } from './parts.js';

// ─── Simulation constants ─────────────────────────────────────
const SNAP_DIST = 0.35;   // world units — auto-snap distance
const GRID_SIZE = 0.5;    // grid snapping increment
const MAX_STRESS = 50;     // kN — failure threshold
const OVERLOAD_RPM = 6000;   // rpm — over-speed failure
const FAIL_SPARKS = true;   // show spark particles on electrical failure

// ─── Failure modes ────────────────────────────────────────────
export const FAIL = {
  NONE: 'none',
  OVERLOAD: 'overload',
  OVERSPEED: 'overspeed',
  SHORT: 'short',
  FRACTURE: 'fracture',
  BURNOUT: 'burnout',
  STALL: 'stall',
};

// ═══════════════════════════════════════════════════════════════
// DimensionNode — one placed part in the world
// ═══════════════════════════════════════════════════════════════
export class DimensionNode {
  constructor(partId, position, rotation) {
    this.id = crypto.randomUUID();
    this.partDef = PART_MAP[partId];
    if (!this.partDef) throw new Error(`Unknown part: ${partId}`);
    this.position = { ...position };   // {x,y,z}
    this.rotation = { ...rotation };   // {x,y,z} euler degrees
    this.matKey = this.partDef.defaultMat;
    this.color = null;              // override color (hex)
    this.label = '';
    this.mesh = null;              // THREE.Object3D (set by renderer)
    // live simulation state
    this.rpm = 0;
    this.torque = 0;
    this.voltage = 0;
    this.current = 0;
    this.pressure = 0;
    this.flow = 0;
    this.powered = false;
    this.failure = FAIL.NONE;
    this.age = 0;                 // sim time since placed
    // simProps clone (mutable per-instance)
    this.simProps = this.partDef.simProps ? { ...this.partDef.simProps } : {};
  }

  get behavior() { return this.partDef.behavior; }
  get ports() { return this.partDef.ports; }
  get mass() { return this.partDef.mass; }
  get layer() { return this.partDef.layer; }
}

// ═══════════════════════════════════════════════════════════════
// Connection — a shared point between two DimensionNodes
// ═══════════════════════════════════════════════════════════════
export class Connection {
  constructor(nodeA, portIdxA, nodeB, portIdxB) {
    this.id = crypto.randomUUID();
    this.nodeA = nodeA;
    this.portA = nodeA.ports[portIdxA];
    this.portIdxA = portIdxA;
    this.nodeB = nodeB;
    this.portB = nodeB.ports[portIdxB];
    this.portIdxB = portIdxB;
    this.type = this.portA.type;
    this.active = true;
    this.line = null;   // THREE.Line for wires/pipes
  }

  isCompatible() {
    const a = this.portA.type, b = this.portB.type;
    if (a === b) return true;
    // cross-compatible pairs
    const compat = [
      [PORT.PIPE, PORT.HOSE],
      [PORT.SHAFT, PORT.GEAR],
    ];
    return compat.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
  }
}

// ═══════════════════════════════════════════════════════════════
// AssembleEngine — manages the world graph and simulation
// ═══════════════════════════════════════════════════════════════
export class AssembleEngine {
  constructor() {
    this.nodes = new Map();       // id → DimensionNode
    this.connections = new Map();       // id → Connection
    this.running = false;
    this.simTime = 0;
    this._listeners = {};
  }

  // ── Event bus ───────────────────────────────────────────────
  on(evt, fn) { (this._listeners[evt] ??= []).push(fn); }
  off(evt, fn) { this._listeners[evt] = (this._listeners[evt] || []).filter(f => f !== fn); }
  emit(evt, data) { (this._listeners[evt] || []).forEach(fn => fn(data)); }

  // ── Node management ─────────────────────────────────────────
  addNode(partId, position = { x: 0, y: 0, z: 0 }, rotation = { x: 0, y: 0, z: 0 }) {
    const node = new DimensionNode(partId, position, rotation);
    this.nodes.set(node.id, node);
    this.emit('nodeAdded', node);
    return node;
  }

  removeNode(id) {
    // remove all connections involving this node
    for (const [cid, conn] of this.connections) {
      if (conn.nodeA.id === id || conn.nodeB.id === id) {
        this.connections.delete(cid);
        this.emit('connectionRemoved', conn);
      }
    }
    const node = this.nodes.get(id);
    this.nodes.delete(id);
    if (node) this.emit('nodeRemoved', node);
  }

  // ── Connection management ────────────────────────────────────
  connect(nodeAId, portIdxA, nodeBId, portIdxB) {
    const nA = this.nodes.get(nodeAId);
    const nB = this.nodes.get(nodeBId);
    if (!nA || !nB) return null;
    const conn = new Connection(nA, portIdxA, nB, portIdxB);
    if (!conn.isCompatible()) {
      this.emit('connectionFailed', { reason: 'incompatible', conn });
      return null;
    }
    this.connections.set(conn.id, conn);
    this.emit('connectionAdded', conn);
    return conn;
  }

  disconnect(connectionId) {
    const conn = this.connections.get(connectionId);
    if (conn) {
      this.connections.delete(connectionId);
      this.emit('connectionRemoved', conn);
    }
  }

  // ── Snap helper: find nearest compatible port ────────────────
  findSnapTarget(dragNode, dragPortIdx, threshold = SNAP_DIST) {
    const dp = dragNode.ports[dragPortIdx];
    const wp = worldPortPos(dragNode, dp);
    let best = null, bestDist = threshold;
    for (const node of this.nodes.values()) {
      if (node.id === dragNode.id) continue;
      node.ports.forEach((p, i) => {
        const tp = worldPortPos(node, p);
        const d = dist3(wp, tp);
        if (d < bestDist && portsCompatible(dp.type, p.type)) {
          bestDist = d; best = { node, portIdx: i, dist: d };
        }
      });
    }
    return best;
  }

  // ── Grid snap ───────────────────────────────────────────────
  snapToGrid(pos) {
    return {
      x: Math.round(pos.x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(pos.y / GRID_SIZE) * GRID_SIZE,
      z: Math.round(pos.z / GRID_SIZE) * GRID_SIZE,
    };
  }

  // ── Simulation ──────────────────────────────────────────────
  start() {
    if (this.running) return;
    this.running = true;
    // Reset all node states
    for (const node of this.nodes.values()) {
      node.rpm = 0; node.voltage = 0; node.current = 0;
      node.pressure = 0; node.flow = 0; node.powered = false;
      node.failure = FAIL.NONE;
    }
    this._propagate();
    this.emit('simStarted', {});
  }

  stop() {
    this.running = false;
    this.emit('simStopped', {});
  }

  step(dt) {
    if (!this.running) return;
    this.simTime += dt;
    this._propagate();
    this._updateMotion(dt);
    this._checkFailures();
    this.emit('simStep', { dt, time: this.simTime });
  }

  // ── Propagation: traverse the dimension graph ────────────────
  _propagate() {
    // Reset non-source nodes
    for (const node of this.nodes.values()) {
      if (node.behavior !== 'source') {
        node.rpm = 0; node.voltage = 0; node.pressure = 0; node.powered = false;
      }
    }

    // BFS from sources
    const visited = new Set();
    const queue = [];

    for (const node of this.nodes.values()) {
      if (node.behavior === 'source' && node.failure === FAIL.NONE) {
        node.powered = true;
        if (node.simProps.outputType === 'shaft') node.rpm = node.simProps.rpm || 1200;
        if (node.simProps.outputType === 'wire') node.voltage = node.simProps.voltage || 12;
        if (node.simProps.outputType === 'pipe') node.pressure = node.simProps.pressure || 2;
        queue.push(node);
        visited.add(node.id);
      }
    }

    while (queue.length) {
      const cur = queue.shift();
      // Find all connections from this node
      for (const conn of this.connections.values()) {
        if (!conn.active) continue;
        let peer = null;
        if (conn.nodeA.id === cur.id) peer = conn.nodeB;
        else if (conn.nodeB.id === cur.id) peer = conn.nodeA;
        if (!peer || visited.has(peer.id)) continue;

        // Transmit by connection type
        if (conn.type === PORT.SHAFT || conn.type === PORT.GEAR) {
          const ratio = gearRatio(cur, peer, conn);
          peer.rpm = cur.rpm * ratio;
          peer.torque = cur.torque / (ratio || 1);
          peer.powered = true;
        } else if (conn.type === PORT.WIRE || conn.type === PORT.SOCKET) {
          peer.voltage = cur.voltage;
          peer.current = cur.current;
          peer.powered = cur.voltage > 0;
          // If the peer is a motor, derive rpm from voltage
          if (peer.behavior === 'source' || peer.behavior === 'rotate') {
            peer.rpm = peer.voltage * (peer.simProps.rpmPerVolt || 100);
          }
        } else if (conn.type === PORT.PIPE || conn.type === PORT.HOSE) {
          peer.pressure = cur.pressure * 0.98; // small loss
          peer.flow = cur.flow || 1;
          peer.powered = true;
        } else if (conn.type === PORT.BELT) {
          const r1 = cur.simProps.radius || 0.5;
          const r2 = peer.simProps.radius || 0.5;
          peer.rpm = cur.rpm * (r1 / r2);
          peer.powered = true;
        }

        visited.add(peer.id);
        queue.push(peer);
      }
    }
  }

  // ── Motion update ───────────────────────────────────────────
  _updateMotion(dt) {
    for (const node of this.nodes.values()) {
      if (!node.mesh) continue;
      node.age += dt;

      if (node.behavior === 'rotate' && node.powered) {
        const axis = node.partDef.ports.find(p => p.type === PORT.SHAFT)?.axis || [0, 1, 0];
        const rad = (node.rpm / 60) * 2 * Math.PI * dt;
        applyAxisRotation(node.mesh, axis, rad);
      }
      if (node.behavior === 'slide' && node.powered) {
        const stroke = node.simProps.stroke || 1;
        const speed = (node.rpm / 60) * stroke;
        node.mesh.position.y += Math.sin(node.age * speed) * 0.01;
      }
    }
  }

  // ── Failure detection ────────────────────────────────────────
  _checkFailures() {
    for (const node of this.nodes.values()) {
      if (node.failure !== FAIL.NONE) continue;

      if (node.rpm > OVERLOAD_RPM) {
        node.failure = FAIL.OVERSPEED;
        this.emit('failure', { node, mode: FAIL.OVERSPEED });
      }
      if (node.behavior === 'logic' && node.voltage > (node.simProps.maxVoltage || 24)) {
        node.failure = FAIL.BURNOUT;
        this.emit('failure', { node, mode: FAIL.BURNOUT });
      }
      // Check structural stress on rigid parts
      if (node.behavior === 'rigid') {
        const connCount = [...this.connections.values()]
          .filter(c => c.nodeA.id === node.id || c.nodeB.id === node.id).length;
        const stress = (node.mass * 9.8 * connCount);
        if (stress > MAX_STRESS) {
          node.failure = FAIL.FRACTURE;
          this.emit('failure', { node, mode: FAIL.FRACTURE });
        }
      }
    }
  }

  // ── Serialise / load ─────────────────────────────────────────
  serialise() {
    return {
      version: 1,
      nodes: [...this.nodes.values()].map(n => ({
        id: n.id, partId: n.partDef.id,
        position: n.position, rotation: n.rotation,
        matKey: n.matKey, color: n.color, label: n.label,
        simProps: n.simProps,
      })),
      connections: [...this.connections.values()].map(c => ({
        id: c.id,
        nodeAId: c.nodeA.id, portIdxA: c.portIdxA,
        nodeBId: c.nodeB.id, portIdxB: c.portIdxB,
      })),
    };
  }

  load(data) {
    this.nodes.clear();
    this.connections.clear();
    const nodeMap = {};
    for (const nd of data.nodes) {
      const node = this.addNode(nd.partId, nd.position, nd.rotation);
      // Preserve saved id so connections resolve correctly
      this.nodes.delete(node.id);
      node.id = nd.id;
      this.nodes.set(node.id, node);
      node.matKey = nd.matKey;
      node.color = nd.color;
      node.label = nd.label || '';
      node.simProps = nd.simProps || node.simProps;
      nodeMap[nd.id] = node;
    }
    for (const cd of data.connections) {
      this.connect(cd.nodeAId, cd.portIdxA, cd.nodeBId, cd.portIdxB);
    }
    this.emit('loaded', data);
  }

  // ── Stats ────────────────────────────────────────────────────
  stats() {
    const nodes = [...this.nodes.values()];
    return {
      total: nodes.length,
      powered: nodes.filter(n => n.powered).length,
      failed: nodes.filter(n => n.failure !== FAIL.NONE).length,
      connections: this.connections.size,
      totalMass: nodes.reduce((s, n) => s + n.mass, 0).toFixed(2),
      structurallySound: nodes.every(n => n.failure === FAIL.NONE),
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// RENDERER — THREE.js scene management for Assemble
// ═══════════════════════════════════════════════════════════════
export class AssembleRenderer {
  constructor(canvas, engine) {
    this.engine = engine;
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1117);
    this.scene.fog = new THREE.FogExp2(0x0d1117, 0.025);

    this.camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.05, 400);
    this.camera.position.set(8, 10, 14);
    this.camera.lookAt(0, 2, 0);

    this.controls = new THREE.OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;

    this._buildScene();
    this._bindEngine();

    this.meshMap = new Map(); // nodeId → THREE.Mesh
    this.connLineMap = new Map(); // connId → THREE.Line
    this.snapIndicator = null;
    this.selected = null;     // nodeId
    this.hoveredPort = null;
    this.ghostMesh = null;
    this.particles = [];

    window.addEventListener('resize', () => this._onResize());
  }

  _buildScene() {
    // Grid floor
    const grid = new THREE.GridHelper(40, 80, 0x1a2a3a, 0x111820);
    grid.position.y = -0.01;
    this.scene.add(grid);

    // Ground plane (for shadows)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshLambertMaterial({ color: 0x080d12, transparent: true, opacity: 0.6 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Ambient
    this.scene.add(new THREE.AmbientLight(0x223344, 1.2));

    // Key light
    const key = new THREE.DirectionalLight(0x88aacc, 1.5);
    key.position.set(8, 14, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 60;
    key.shadow.camera.left = key.shadow.camera.bottom = -20;
    key.shadow.camera.right = key.shadow.camera.top = 20;
    this.scene.add(key);

    // Fill light
    const fill = new THREE.PointLight(0x4466aa, 0.8, 60);
    fill.position.set(-10, 6, -8);
    this.scene.add(fill);

    // Accent
    const acc = new THREE.PointLight(0x00ccff, 0.5, 40);
    acc.position.set(4, 2, -12);
    this.scene.add(acc);
  }

  _bindEngine() {
    this.engine.on('nodeAdded', n => this._addMesh(n));
    this.engine.on('nodeRemoved', n => this._removeMesh(n));
    this.engine.on('connectionAdded', c => this._addConnLine(c));
    this.engine.on('connectionRemoved', c => this._removeConnLine(c));
    this.engine.on('failure', ev => this._showFailure(ev));
    this.engine.on('simStep', ev => this._animateRunning(ev));
  }

  _buildMesh(node) {
    const def = node.partDef;
    const matD = MAT[node.matKey] || MAT.STEEL;

    // Build geometry
    let geo;
    const g = def.geo;
    switch (g.type) {
      case 'box': geo = new THREE.BoxGeometry(...g.args); break;
      case 'cylinder': geo = new THREE.CylinderGeometry(...g.args); break;
      case 'sphere': geo = new THREE.SphereGeometry(...g.args); break;
      case 'torus': geo = new THREE.TorusGeometry(...g.args); break;
      default: geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    }

    // Material
    const matParams = {
      color: node.color ?? matD.color,
      metalness: matD.metalness,
      roughness: matD.roughness,
    };
    if (matD.transparent) {
      matParams.transparent = true;
      matParams.opacity = matD.opacity;
    }
    const mat = new THREE.MeshStandardMaterial(matParams);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  _addMesh(node) {
    const mesh = this._buildMesh(node);
    mesh.position.set(node.position.x, node.position.y, node.position.z);
    mesh.rotation.set(
      node.rotation.x * Math.PI / 180,
      node.rotation.y * Math.PI / 180,
      node.rotation.z * Math.PI / 180,
    );
    this.scene.add(mesh);
    this.meshMap.set(node.id, mesh);
    node.mesh = mesh;

    // Port dot indicators
    node.ports.forEach(p => {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 6, 6),
        new THREE.MeshBasicMaterial({ color: portColor(p.type), transparent: true, opacity: 0.7 })
      );
      dot.position.set(...p.pos);
      dot.userData.isPortDot = true;
      mesh.add(dot);
    });
    return mesh;
  }

  _removeMesh(node) {
    const mesh = this.meshMap.get(node.id);
    if (mesh) { this.scene.remove(mesh); mesh.geometry.dispose(); }
    this.meshMap.delete(node.id);
    if (node.mesh === mesh) node.mesh = null;
  }

  _addConnLine(conn) {
    const posA = worldPortPos(conn.nodeA, conn.portA);
    const posB = worldPortPos(conn.nodeB, conn.portB);
    const pts = [
      new THREE.Vector3(posA.x, posA.y, posA.z),
      new THREE.Vector3(posB.x, posB.y, posB.z),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: portColor(conn.type), linewidth: 2 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.connLineMap.set(conn.id, line);
    conn.line = line;
  }

  _removeConnLine(conn) {
    const line = this.connLineMap.get(conn.id);
    if (line) { this.scene.remove(line); line.geometry.dispose(); }
    this.connLineMap.delete(conn.id);
  }

  _showFailure({ node, mode }) {
    const mesh = this.meshMap.get(node.id);
    if (!mesh) return;
    mesh.material.color.setHex(0xff2200);
    mesh.material.emissive.setHex(0x441100);
    mesh.material.emissiveIntensity = 0.8;
    if (mode === FAIL.BURNOUT || mode === FAIL.SHORT) {
      this._spawnSparks(mesh.position);
    }
  }

  _spawnSparks(pos) {
    const N = 30;
    const pts = [];
    for (let i = 0; i < N; i++) pts.push(pos.clone());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.PointsMaterial({ color: 0xffaa00, size: 0.12, transparent: true });
    const sparks = new THREE.Points(geo, mat);
    sparks.userData.vels = Array.from({ length: N }, () => new THREE.Vector3(
      (Math.random() - 0.5) * 3, Math.random() * 4, (Math.random() - 0.5) * 3
    ));
    sparks.userData.life = 1.0;
    this.scene.add(sparks);
    this.particles.push(sparks);
  }

  _animateRunning({ dt }) {
    // Pulse powered parts
    for (const [id, mesh] of this.meshMap) {
      const node = this.engine.nodes.get(id);
      if (!node) continue;
      if (node.powered && node.failure === FAIL.NONE) {
        // Subtle emissive pulse
        const t = Date.now() / 1000;
        mesh.material.emissiveIntensity = 0.05 + 0.04 * Math.sin(t * 4 + node.rpm * 0.001);
      }
    }
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.userData.life -= dt * 1.5;
      if (p.userData.life <= 0) {
        this.scene.remove(p); p.geometry.dispose();
        this.particles.splice(i, 1); continue;
      }
      const pos = p.geometry.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        const v = p.userData.vels[j];
        v.y -= 9.8 * dt;
        pos.setXYZ(j, pos.getX(j) + v.x * dt, pos.getY(j) + v.y * dt, pos.getZ(j) + v.z * dt);
      }
      pos.needsUpdate = true;
      p.material.opacity = p.userData.life;
    }
  }

  // Show a ghost (translucent preview) of a part about to be placed
  showGhost(partId, position, rotation) {
    this.hideGhost();
    const tmpNode = { partDef: PART_MAP[partId], ports: PART_MAP[partId].ports, matKey: PART_MAP[partId].defaultMat, color: null };
    const mesh = this._buildMesh(tmpNode);
    mesh.material.transparent = true; mesh.material.opacity = 0.35;
    mesh.position.set(position.x, position.y, position.z);
    if (rotation) mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    this.scene.add(mesh);
    this.ghostMesh = mesh;
  }

  hideGhost() {
    if (this.ghostMesh) { this.scene.remove(this.ghostMesh); this.ghostMesh = null; }
  }

  // Highlight a node
  select(nodeId) {
    if (this.selected) this._setOutline(this.selected, false);
    this.selected = nodeId;
    if (nodeId) this._setOutline(nodeId, true);
  }

  _setOutline(nodeId, on) {
    const mesh = this.meshMap.get(nodeId);
    if (!mesh) return;
    mesh.material.emissive.setHex(on ? 0x3366ff : 0x000000);
    mesh.material.emissiveIntensity = on ? 0.4 : 0;
  }

  updateMeshTransform(node) {
    const mesh = this.meshMap.get(node.id);
    if (!mesh) return;
    mesh.position.set(node.position.x, node.position.y, node.position.z);
    mesh.rotation.set(
      node.rotation.x * Math.PI / 180,
      node.rotation.y * Math.PI / 180,
      node.rotation.z * Math.PI / 180,
    );
  }

  updateConnLine(conn) {
    this._removeConnLine(conn);
    this._addConnLine(conn);
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // Raycast pick from mouse position
  pick(mouseX, mouseY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((mouseX - rect.left) / rect.width) * 2 - 1,
      -((mouseY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const meshes = [...this.meshMap.values()];
    const hits = ray.intersectObjects(meshes, false);
    if (!hits.length) return null;
    // Map mesh back to nodeId
    for (const [id, mesh] of this.meshMap) {
      if (mesh === hits[0].object) return id;
    }
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════
function dist3(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function worldPortPos(node, portDef) {
  // Simplified: ignores rotation for now (TODO: apply node quaternion)
  return {
    x: node.position.x + portDef.pos[0],
    y: node.position.y + portDef.pos[1],
    z: node.position.z + portDef.pos[2],
  };
}

function portsCompatible(a, b) {
  if (a === b) return true;
  const pairs = [
    ['pipe', 'hose'], ['shaft', 'gear'],
  ];
  return pairs.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

function gearRatio(driver, driven, conn) {
  const ta = driver.simProps.teeth || driver.simProps.radius || 1;
  const tb = driven.simProps.teeth || driven.simProps.radius || 1;
  // For belts: ratio = r1/r2
  if (conn.type === 'belt') return ta / tb;
  // Gears: inverse
  return ta / tb;
}

function applyAxisRotation(mesh, axis, rad) {
  const a = new THREE.Vector3(...axis).normalize();
  const q = new THREE.Quaternion().setFromAxisAngle(a, rad);
  mesh.quaternion.multiplyQuaternions(q, mesh.quaternion);
}

function portColor(type) {
  const colors = {
    snap: 0x888888, shaft: 0xffaa00, gear: 0xff6600,
    belt: 0xcc4400, pipe: 0x0088ff, wire: 0xffee00,
    hose: 0x0044cc, rope: 0xaa8833, thread: 0xaaaaaa,
    socket: 0x88ff88, hinge: 0xcc44ff, ball: 0xff44cc,
    slide: 0x44ffcc,
  };
  return colors[type] || 0x666666;
}
