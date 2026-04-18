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

import { PORT, PARTS, PART_MAP, MAT } from './parts.js?v=8';

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
    const customParts = (globalThis && globalThis.ASSEMBLE_CUSTOM_PART_MAP) ? globalThis.ASSEMBLE_CUSTOM_PART_MAP : null;
    this.partDef = PART_MAP[partId] || (customParts ? customParts[partId] : undefined);
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
      [PORT.WIRE, PORT.SOCKET],
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
  on(evt, fn) {
    if (!this._listeners[evt]) this._listeners[evt] = [];
    this._listeners[evt].push(fn);
  }
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
    // Dedupe identical connections (either direction)
    for (const conn of this.connections.values()) {
      const sameDir = conn.nodeA.id === nodeAId && conn.portIdxA === portIdxA && conn.nodeB.id === nodeBId && conn.portIdxB === portIdxB;
      const oppDir = conn.nodeA.id === nodeBId && conn.portIdxA === portIdxB && conn.nodeB.id === nodeAId && conn.portIdxB === portIdxA;
      if (sameDir || oppDir) return conn;
    }

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

    // Penetrators (nails/screws/etc) create a "hole" record in the target part.
    // (No mesh boolean op yet — this is metadata for future geometry tooling.)
    this._maybeRecordHole(conn);
    return conn;
  }

  getWorldPortPos(nodeId, portIdx) {
    const node = this.nodes.get(nodeId);
    if (!node) return null;
    const portDef = node.ports[portIdx];
    if (!portDef) return null;
    return worldPortPos(node, portDef);
  }

  _maybeRecordHole(conn) {
    const aPen = !!(conn.nodeA.simProps && conn.nodeA.simProps.penetrates);
    const bPen = !!(conn.nodeB.simProps && conn.nodeB.simProps.penetrates);
    if (!aPen && !bPen) return;

    // Determine penetrator and target
    const penetrator = aPen ? conn.nodeA : conn.nodeB;
    const target = aPen ? conn.nodeB : conn.nodeA;
    const penPort = aPen ? conn.portA : conn.portB;
    const targetPort = aPen ? conn.portB : conn.portA;
    const targetNodeId = target.id;

    // Only treat SNAP/THREAD/socket as "penetration" targets.
    if (!['snap', 'thread', 'socket'].includes(targetPort.type)) return;

    if (!target.simProps) target.simProps = {};
    if (!Array.isArray(target.simProps.holes)) target.simProps.holes = [];

    const diameter = penetrator.simProps && penetrator.simProps.holeDiameter ? penetrator.simProps.holeDiameter : 0.1;
    const wp = worldPortPos(target, targetPort);
    const key = `${penetrator.id}:${diameter.toFixed(3)}:${wp.x.toFixed(3)}:${wp.y.toFixed(3)}:${wp.z.toFixed(3)}`;
    if (target.simProps.holes.some(h => h && h._key === key)) return;
    target.simProps.holes.push({
      _key: key,
      from: penetrator.partDef ? penetrator.partDef.id : null,
      diameter,
      at: { x: wp.x, y: wp.y, z: wp.z },
      via: { type: penPort.type, targetType: targetPort.type },
      connectionId: conn.id,
    });
    this.emit('holeCreated', { targetNodeId, hole: target.simProps.holes[target.simProps.holes.length - 1] });
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
          peer.powered = Math.abs(peer.rpm) > 0.001;
        } else if (conn.type === PORT.WIRE || conn.type === PORT.SOCKET) {
          peer.voltage = cur.voltage;
          peer.current = cur.current;
          peer.powered = cur.voltage > 0;
          // Motors convert voltage into shaft rpm (but require a rotor if configured).
          if (peer.behavior === 'motor') {
            const requiresRotor = !!(peer.simProps && peer.simProps.requiresRotor);
            const hasRotor = requiresRotor ? this._motorHasRotor(peer) : true;
            const rpmPerVolt = (peer.simProps && peer.simProps.rpmPerVolt) ? peer.simProps.rpmPerVolt : 100;
            const maxRpm = (peer.simProps && peer.simProps.maxRpm) ? peer.simProps.maxRpm : 3000;
            peer.rpm = (peer.voltage > 0 && hasRotor) ? Math.min(maxRpm, peer.voltage * rpmPerVolt) : 0;
            peer.powered = Math.abs(peer.rpm) > 0.001;
          }
        } else if (conn.type === PORT.PIPE || conn.type === PORT.HOSE) {
          peer.pressure = cur.pressure * 0.98; // small loss
          peer.flow = cur.flow || 1;
          peer.powered = true;
        } else if (conn.type === PORT.BELT) {
          const r1 = cur.simProps.radius || 0.5;
          const r2 = peer.simProps.radius || 0.5;
          peer.rpm = cur.rpm * (r1 / r2);
          peer.powered = Math.abs(peer.rpm) > 0.001;
        }

        visited.add(peer.id);
        queue.push(peer);
      }
    }
  }

  _motorHasRotor(motorNode) {
    for (const conn of this.connections.values()) {
      if (!conn.active) continue;
      const isMotor = conn.nodeA.id === motorNode.id || conn.nodeB.id === motorNode.id;
      if (!isMotor) continue;
      const other = conn.nodeA.id === motorNode.id ? conn.nodeB : conn.nodeA;
      if (!other || !other.partDef) continue;
      if (conn.type !== PORT.SHAFT && conn.type !== PORT.GEAR) continue;
      if (other.partDef.id === 'motor_rotor') return true;
    }
    return false;
  }

  // ── Motion update ───────────────────────────────────────────
  _updateMotion(dt) {
    for (const node of this.nodes.values()) {
      if (!node.mesh) continue;
      node.age += dt;

      if (node.behavior === 'rotate' && node.powered) {
        const shaftPort = node.partDef.ports.find(p => p.type === PORT.SHAFT);
        const axis = (shaftPort && shaftPort.axis) ? shaftPort.axis : [0, 1, 0];
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
    // Tear down current world with proper events so renderers stay in sync
    for (const id of [...this.nodes.keys()]) {
      this.removeNode(id);
    }
    this.nodes.clear();
    this.connections.clear();

    // Rebuild nodes with stable IDs BEFORE emitting nodeAdded
    for (const nd of (data.nodes || [])) {
      const node = new DimensionNode(nd.partId, nd.position, nd.rotation);
      node.id = nd.id;
      node.matKey = nd.matKey;
      node.color = nd.color;
      node.label = nd.label || '';
      node.simProps = nd.simProps || node.simProps;
      this.nodes.set(node.id, node);
      this.emit('nodeAdded', node);
    }

    // Rebuild connections with stable IDs BEFORE emitting connectionAdded
    for (const cd of (data.connections || [])) {
      const nA = this.nodes.get(cd.nodeAId);
      const nB = this.nodes.get(cd.nodeBId);
      if (!nA || !nB) continue;
      const conn = new Connection(nA, cd.portIdxA, nB, cd.portIdxB);
      if (!conn.isCompatible()) {
        this.emit('connectionFailed', { reason: 'incompatible', conn });
        continue;
      }
      conn.id = cd.id;
      this.connections.set(conn.id, conn);
      this.emit('connectionAdded', conn);
    }

    this.emit('loaded', data);
  }

  // ── Stats ────────────────────────────────────────────────────
  stats() {
    const nodes = [...this.nodes.values()];
    const sources = nodes.filter(n => n.behavior === 'source');
    const functional = new Set(['motor', 'rotate', 'slide', 'load', 'logic']);
    const activeNodes = nodes.filter(n => functional.has(n.behavior));
    const spinning = nodes.filter(n => n.behavior === 'rotate' && n.powered && Math.abs(n.rpm) > 0.1).length;
    return {
      total: nodes.length,
      powered: nodes.filter(n => n.powered).length,
      sourcesPowered: sources.filter(n => n.powered).length,
      activePowered: activeNodes.filter(n => n.powered).length,
      spinning,
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
    this.gridHelper = null;     // Store reference to grid
    this.gridHelperTop = null;  // Top grid (lavender)

    window.addEventListener('resize', () => this._onResize());
  }

  _buildScene() {
    // Bottom grid (light green)
    this.gridHelper = new THREE.GridHelper(40, 80, 0x3fb950, 0x1a2a1a);
    this.gridHelper.position.y = -0.01;
    this.scene.add(this.gridHelper);

    // Top grid (lavender, above ground)
    this.gridHelperTop = new THREE.GridHelper(40, 80, 0x9966cc, 0x2a1a3a);
    this.gridHelperTop.position.y = 4;
    this.gridHelperTop.material.transparent = true;
    this.gridHelperTop.material.opacity = 0.3;
    this.scene.add(this.gridHelperTop);

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

    // Model parts load asynchronously — create a placeholder group now.
    if (def.geo && def.geo.type === 'model') {
      const group = new THREE.Group();
      group.userData.isModelGroup = true;
      const placeholder = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.6, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x334455, metalness: 0.2, roughness: 0.8 })
      );
      placeholder.castShadow = true;
      placeholder.receiveShadow = true;
      group.add(placeholder);
      return group;
    }

    // Build geometry
    const g = def.geo;

    const buildPrimitive = (geoDesc) => {
      if (!geoDesc || !geoDesc.type) return new THREE.BoxGeometry(0.5, 0.5, 0.5);
      switch (geoDesc.type) {
        case 'box': return new THREE.BoxGeometry(...geoDesc.args);
        case 'cylinder': return new THREE.CylinderGeometry(...geoDesc.args);
        case 'sphere': return new THREE.SphereGeometry(...geoDesc.args);
        case 'torus': return new THREE.TorusGeometry(...geoDesc.args);
        default: return new THREE.BoxGeometry(0.5, 0.5, 0.5);
      }
    };

    const buildMaterial = (matKey, colorOverride) => {
      const d = MAT[matKey] || matD;
      const matParams = {
        color: (colorOverride !== null && colorOverride !== undefined) ? colorOverride : ((node.color !== null && node.color !== undefined) ? node.color : d.color),
        metalness: d.metalness,
        roughness: d.roughness,
      };
      if (d.transparent) {
        matParams.transparent = true;
        matParams.opacity = d.opacity;
      }
      return new THREE.MeshStandardMaterial(matParams);
    };

    if (g && g.type === 'group' && Array.isArray(g.children)) {
      const group = new THREE.Group();
      for (const child of g.children) {
        if (!child || !child.geo) continue;
        const childGeo = buildPrimitive(child.geo);
        const childMat = buildMaterial(child.matKey || node.matKey, child.color);
        const childMesh = new THREE.Mesh(childGeo, childMat);
        childMesh.castShadow = true;
        childMesh.receiveShadow = true;
        const p = child.pos || [0, 0, 0];
        const r = child.rot || [0, 0, 0];
        childMesh.position.set(p[0] || 0, p[1] || 0, p[2] || 0);
        childMesh.rotation.set(r[0] || 0, r[1] || 0, r[2] || 0);
        group.add(childMesh);
      }
      return group;
    }

    let geo = buildPrimitive(g);

    // Material
    const mat = buildMaterial(node.matKey, node.color);

    // Hollow pipe look: render a dark inner shell.
    const hollow = def.simProps && def.simProps.hollow;
    if (hollow && (g.type === 'cylinder' || g.type === 'torus')) {
      const wall = (def.simProps && def.simProps.wall) ? def.simProps.wall : 0.03;
      const group = new THREE.Group();
      const outer = new THREE.Mesh(geo, mat);
      outer.castShadow = true;
      outer.receiveShadow = true;
      group.add(outer);

      let innerGeo = null;
      if (g.type === 'cylinder') {
        const args = g.args;
        const rt = args[0], rb = args[1], h = args[2];
        const segs = args[3] || 12;
        innerGeo = new THREE.CylinderGeometry(
          Math.max(0.001, rt - wall),
          Math.max(0.001, rb - wall),
          Math.max(0.001, h - wall * 2),
          segs
        );
      } else if (g.type === 'torus') {
        const args = g.args;
        const R = args[0], r = args[1];
        const tsegs = args[2] || 12;
        const segs = args[3] || 8;
        innerGeo = new THREE.TorusGeometry(
          R,
          Math.max(0.001, r - wall),
          tsegs,
          segs
        );
      }

      if (innerGeo) {
        const innerMat = new THREE.MeshStandardMaterial({
          color: 0x0b0f14,
          metalness: 0.0,
          roughness: 0.95,
          side: THREE.BackSide,
        });
        const inner = new THREE.Mesh(innerGeo, innerMat);
        inner.castShadow = false;
        inner.receiveShadow = false;
        group.add(inner);
      }

      return group;
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  _addMesh(node) {
    const mesh = this._buildMesh(node);
    mesh.userData.nodeId = node.id;
    mesh.position.set(node.position.x, node.position.y, node.position.z);
    // Rotation is already in radians
    mesh.rotation.set(
      node.rotation.x || 0,
      node.rotation.y || 0,
      node.rotation.z || 0,
    );
    this.scene.add(mesh);
    this.meshMap.set(node.id, mesh);
    node.mesh = mesh;

    // If this is a model part, swap in the loaded GLTF scene.
    if (node.partDef.geo && node.partDef.geo.type === 'model' && node.partDef.geo.url) {
      this._loadModelInto(node, mesh, node.partDef.geo.url);
    }

    // Port dot indicators
    node.ports.forEach(p => {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 6, 6),
        new THREE.MeshBasicMaterial({ color: portColor(p.type), transparent: true, opacity: 0.7 })
      );
      dot.position.set(...p.pos);
      dot.userData.isPortDot = true;
      dot.userData.nodeId = node.id;
      mesh.add(dot);
    });
    return mesh;
  }

  _loadModelInto(node, rootObj, url) {
    if (!THREE.GLTFLoader) {
      console.warn('GLTFLoader not found; cannot load model part:', url);
      return;
    }
    if (!this._modelCache) this._modelCache = new Map();
    const cached = this._modelCache.get(url);
    const attach = (gltf) => {
      // Remove any placeholder children
      while (rootObj.children.length) rootObj.remove(rootObj.children[0]);
      const model = gltf.scene || gltf.scenes && gltf.scenes[0];
      if (!model) return;
      model.traverse(obj => {
        obj.userData.nodeId = node.id;
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      // Normalize scale: fit into ~1m box
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = 1.0 / maxDim;
      model.scale.set(scale, scale, scale);
      // Put model on origin
      const box2 = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      box2.getCenter(center);
      model.position.sub(center);
      rootObj.add(model);
    };

    if (cached && cached.gltf) {
      attach(cached.gltf);
      return;
    }

    const loader = new THREE.GLTFLoader();
    loader.load(url, (gltf) => {
      this._modelCache.set(url, { gltf });
      attach(gltf);
    }, undefined, (err) => {
      console.warn('Failed to load model:', url, err);
    });
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
    // Rotation is already in radians (set by rotation sphere or converted from properties)
    mesh.rotation.set(
      node.rotation.x || 0,
      node.rotation.y || 0,
      node.rotation.z || 0,
    );
  }

  updateGrid(gridSize) {
    // Update grid divisions based on grid size
    const size = 40;
    const divisions = Math.round(size / gridSize);

    // Remove old grids
    if (this.gridHelper) this.scene.remove(this.gridHelper);
    if (this.gridHelperTop) this.scene.remove(this.gridHelperTop);

    // Create new grids with updated divisions
    this.gridHelper = new THREE.GridHelper(size, divisions, 0x3fb950, 0x1a2a1a);
    this.gridHelper.position.y = -0.01;
    this.scene.add(this.gridHelper);

    this.gridHelperTop = new THREE.GridHelper(size, divisions, 0x9966cc, 0x2a1a3a);
    this.gridHelperTop.position.y = 4;
    this.gridHelperTop.material.transparent = true;
    this.gridHelperTop.material.opacity = 0.3;
    this.scene.add(this.gridHelperTop);
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
    const hits = ray.intersectObjects(meshes, true);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj) {
      if (obj.userData && obj.userData.nodeId) return obj.userData.nodeId;
      obj = obj.parent;
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
    ['pipe', 'hose'], ['shaft', 'gear'], ['wire', 'socket'],
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
