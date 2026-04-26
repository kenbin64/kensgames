/**
 * ASSEMBLE — Part Library
 * Dimensional Programming: every part IS a dimension.
 * Each part is a point in the "available parts" dimension,
 * but contains its own full dimension of properties, connectors, behaviors.
 *
 * Categories follow the 7-layer DP Helix:
 *   1. Spark    — power sources
 *   2. Mirror   — conductors, wires, channels
 *   3. Relation — connectors, joints, fasteners
 *   4. Form     — structural shapes, panels, beams
 *   5. Life     — moving parts, actuators, engines
 *   6. Mind     — logic, sensors, electronics
 *   7. Whole    — assemblies, skins, decorative
 */

'use strict';

// ─── Connector port types ─────────────────────────────────────
// Parts declare which port types they expose.
// Two ports snap together only if their types are compatible.
export const PORT = {
  SNAP: 'snap',     // mechanical rigid join (bolt, weld, glue)
  SHAFT: 'shaft',    // rotational axle passthrough
  GEAR: 'gear',     // gear mesh
  BELT: 'belt',     // belt/chain loop
  PIPE: 'pipe',     // fluid flow
  WIRE: 'wire',     // electrical
  HOSE: 'hose',     // flexible fluid
  ROPE: 'rope',     // tension
  THREAD: 'thread',   // screw/bolt thread
  SOCKET: 'socket',   // plug / prong
  HINGE: 'hinge',    // pivot joint
  BALL: 'ball',     // ball joint
  SLIDE: 'slide',    // linear rail
};

// ─── Material definitions ─────────────────────────────────────
export const MAT = {
  STEEL: { color: 0x8899aa, metalness: 0.9, roughness: 0.2, density: 7.8 },
  CHROME: { color: 0xccddee, metalness: 1.0, roughness: 0.05, density: 7.8 },
  IRON: { color: 0x556677, metalness: 0.85, roughness: 0.4, density: 7.2 },
  ALUMINUM: { color: 0xaabbcc, metalness: 0.8, roughness: 0.25, density: 2.7 },
  COPPER: { color: 0xcc7744, metalness: 0.9, roughness: 0.2, density: 8.9 },
  PLASTIC: { color: 0x2244aa, metalness: 0.0, roughness: 0.7, density: 1.2 },
  RUBBER: { color: 0x222222, metalness: 0.0, roughness: 0.95, density: 1.4 },
  WOOD_2X4: { color: 0xbb8844, metalness: 0.0, roughness: 0.85, density: 0.6 },
  WOOD_BOARD: { color: 0xcc9955, metalness: 0.0, roughness: 0.8, density: 0.5 },
  GLASS: { color: 0xaaccff, metalness: 0.1, roughness: 0.05, density: 2.5, transparent: true, opacity: 0.35 },
  CONCRETE: { color: 0x888888, metalness: 0.0, roughness: 0.95, density: 2.3 },
  BRICK: { color: 0xaa5533, metalness: 0.0, roughness: 0.9, density: 1.9 },
  LEATHER: { color: 0x7a4f2a, metalness: 0.0, roughness: 0.75, density: 0.95 },
  GOLD: { color: 0xffcc44, metalness: 1.0, roughness: 0.1, density: 19.3 },
  CIRCUIT: { color: 0x225522, metalness: 0.4, roughness: 0.5, density: 1.5 },
  SILICONE: { color: 0xddddcc, metalness: 0.0, roughness: 0.6, density: 1.1 },
  BRASS: { color: 0xc8a85a, metalness: 0.85, roughness: 0.3, density: 8.5 },
  BRONZE: { color: 0xa07040, metalness: 0.85, roughness: 0.35, density: 8.8 },
  SILVER: { color: 0xdddde0, metalness: 1.0, roughness: 0.1, density: 10.5 },
  TITANIUM: { color: 0xb0b4b8, metalness: 0.9, roughness: 0.25, density: 4.5 },
  NYLON: { color: 0xeeeeee, metalness: 0.0, roughness: 0.7, density: 1.15 },
  FOAM: { color: 0xddccaa, metalness: 0.0, roughness: 0.95, density: 0.05 },
  FIBER: { color: 0xc8b070, metalness: 0.0, roughness: 0.8, density: 1.45 },
  FABRIC: { color: 0x6688aa, metalness: 0.0, roughness: 0.9, density: 0.4 },
  CERAMIC: { color: 0xeeeeee, metalness: 0.05, roughness: 0.4, density: 2.4 },
  GRAPHITE: { color: 0x222222, metalness: 0.3, roughness: 0.6, density: 2.2 },
  LITHIUM: { color: 0xddddee, metalness: 0.7, roughness: 0.4, density: 0.53 },
  WATER: { color: 0x3399cc, metalness: 0.0, roughness: 0.05, density: 1.0, transparent: true, opacity: 0.55 },
  OIL: { color: 0x553311, metalness: 0.0, roughness: 0.2, density: 0.88, transparent: true, opacity: 0.7 },
  ALCOHOL: { color: 0xddeeff, metalness: 0.0, roughness: 0.1, density: 0.79, transparent: true, opacity: 0.45 },
  GLYCOL: { color: 0x66dd99, metalness: 0.0, roughness: 0.15, density: 1.11, transparent: true, opacity: 0.6 },
  GREASE: { color: 0xccaa77, metalness: 0.05, roughness: 0.5, density: 0.92 },
};

// ─── Part geometry builders ───────────────────────────────────
// Each returns { geometry, pivotOffset }
// pivotOffset: where the part's local origin is relative to its center
// so that snap points sit precisely at connection faces.

function box(w, h, d) {
  return { type: 'box', args: [w, h, d], pivot: [0, 0, 0] };
}
function cyl(r, h, segs = 16) {
  return { type: 'cylinder', args: [r, r, h, segs], pivot: [0, 0, 0] };
}
function cylTapered(rt, rb, h, segs = 16) {
  return { type: 'cylinder', args: [rt, rb, h, segs], pivot: [0, 0, 0] };
}
function sphere(r, segs = 16) {
  return { type: 'sphere', args: [r, segs, segs], pivot: [0, 0, 0] };
}
function torus(R, r, segs = 24, tsegs = 12) {
  return { type: 'torus', args: [R, r, tsegs, segs], pivot: [0, 0, 0] };
}

function group(children) {
  return { type: 'group', children: children || [], pivot: [0, 0, 0] };
}

// ─── Connector helper ─────────────────────────────────────────
// pos: [x,y,z] local to part center
// dir: [x,y,z] outward normal
// type: PORT.xxx
// axis: optional rotation axis for shaft ports
function port(type, pos, dir, axis) {
  return { type, pos, dir: dir || [0, 1, 0], axis: axis || [0, 1, 0] };
}

// ═══════════════════════════════════════════════════════════════
// PART LIBRARY
// id           unique string key
// label        display name
// category     UI grouping
// layer        DP layer 1-7
// geo          geometry descriptor
// defaultMat   key into MAT
// mass         kg (approx, can be overridden per instance)
// ports        array of connector ports
// behavior     simulation role: 'rigid'|'rotate'|'slide'|'flex'|'source'|'load'|'logic'|'fluid'
// simProps     behavior parameters (rpm, voltage, torque, flowRate, etc.)
// icon         emoji for palette
// ═══════════════════════════════════════════════════════════════
export const PARTS = [

  // ════════════════════════════════════════════════
  // TOOLS (fabrication stations)
  // Note: currently visual/organizational only; geometry-mod ops come later.
  // ════════════════════════════════════════════════
  {
    id: 'tool_drill_press', label: 'Drill Press', category: 'Tools', layer: 7, icon: '🛠',
    geo: box(1.2, 2.2, 1.0), defaultMat: 'STEEL', mass: 120.0,
    behavior: 'rigid',
    simProps: { toolType: 'drill' },
    ports: [
      port(PORT.SNAP, [0, -1.1, 0], [0, -1, 0]),
      port(PORT.SHAFT, [0, 0.85, 0], [0, 1, 0], [0, 1, 0]),
    ],
  },
  {
    id: 'tool_lathe', label: 'Lathe', category: 'Tools', layer: 7, icon: '⚙️',
    geo: box(3.0, 0.9, 1.1), defaultMat: 'STEEL', mass: 220.0,
    behavior: 'rigid',
    simProps: { toolType: 'lathe' },
    ports: [
      port(PORT.SNAP, [0, -0.45, 0], [0, -1, 0]),
      port(PORT.SHAFT, [-1.4, 0.2, 0], [-1, 0, 0], [1, 0, 0]),
      port(PORT.SHAFT, [1.4, 0.2, 0], [1, 0, 0], [1, 0, 0]),
    ],
  },
  {
    id: 'tool_fabric_former', label: 'Fabric Former', category: 'Tools', layer: 7, icon: '🧵',
    geo: box(1.8, 1.2, 1.2), defaultMat: 'STEEL', mass: 140.0,
    behavior: 'rigid',
    simProps: { toolType: 'former' },
    ports: [
      port(PORT.SNAP, [0, -0.6, 0], [0, -1, 0]),
      port(PORT.SNAP, [0.9, 0, 0], [1, 0, 0]),
      port(PORT.SNAP, [-0.9, 0, 0], [-1, 0, 0]),
    ],
  },

  // ════════════════════════════════════════════════
  // LAYER 4 — FORM (structural)
  // ════════════════════════════════════════════════
  {
    id: 'beam_steel', label: '3" Steel Beam', category: 'Structure', layer: 4, icon: '▬',
    geo: box(0.5, 3.0, 0.5), defaultMat: 'STEEL', mass: 0.6,
    behavior: 'rigid',
    ports: [
      port(PORT.SNAP, [0, 1.5, 0], [0, 1, 0]),
      port(PORT.SNAP, [0, -1.5, 0], [0, -1, 0]),
      port(PORT.SNAP, [0.25, 0, 0], [1, 0, 0]),
      port(PORT.SNAP, [-0.25, 0, 0], [-1, 0, 0]),
    ],
  },
  {
    id: 'beam_long', label: '6" Steel Beam', category: 'Structure', layer: 4, icon: '▬',
    geo: box(0.5, 6.0, 0.5), defaultMat: 'STEEL', mass: 1.2,
    behavior: 'rigid',
    ports: [
      port(PORT.SNAP, [0, 3, 0], [0, 1, 0]),
      port(PORT.SNAP, [0, -3, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'panel_steel', label: 'Steel Panel (1×1)', category: 'Structure', layer: 4, icon: '▪',
    geo: box(2.0, 0.1, 2.0), defaultMat: 'STEEL', mass: 3.0,
    behavior: 'rigid',
    ports: [
      port(PORT.SNAP, [0, 0.05, 0], [0, 1, 0]),
      port(PORT.SNAP, [0, -0.05, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'panel_glass', label: 'Glass Panel', category: 'Structure', layer: 4, icon: '▫',
    geo: box(2.0, 0.08, 2.0), defaultMat: 'GLASS', mass: 1.5,
    behavior: 'rigid',
    ports: [
      port(PORT.SNAP, [0, 0.04, 0], [0, 1, 0]),
    ],
  },
  {
    id: 'wood_2x4', label: '2×4 Board', category: 'Structure', layer: 4, icon: '🪵',
    geo: box(0.38, 3.5, 0.89), defaultMat: 'WOOD_2X4', mass: 0.4,
    behavior: 'rigid',
    ports: [
      port(PORT.SNAP, [0, 1.75, 0], [0, 1, 0]),
      port(PORT.SNAP, [0, -1.75, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'wood_board', label: 'Wood Board (1×1)', category: 'Structure', layer: 4, icon: '🟫',
    geo: box(2.0, 0.12, 1.0), defaultMat: 'WOOD_BOARD', mass: 0.7,
    behavior: 'rigid',
    ports: [
      port(PORT.SNAP, [0, 0.06, 0], [0, 1, 0]),
      port(PORT.SNAP, [0, -0.06, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'block_brick', label: 'Brick', category: 'Structure', layer: 4, icon: '🧱',
    geo: box(0.9, 0.45, 0.45), defaultMat: 'BRICK', mass: 2.0,
    behavior: 'rigid',
    ports: [
      port(PORT.SNAP, [0, 0.225, 0], [0, 1, 0]),
      port(PORT.SNAP, [0, -0.225, 0], [0, -1, 0]),
      port(PORT.SNAP, [0.45, 0, 0], [1, 0, 0]),
    ],
  },
  {
    id: 'pipe_straight', label: 'Pipe (straight)', category: 'Fluid', layer: 2, icon: '━',
    geo: cyl(0.15, 3.0, 12), defaultMat: 'STEEL', mass: 0.8,
    behavior: 'rigid',
    simProps: { hollow: true, wall: 0.03 },
    ports: [
      port(PORT.PIPE, [0, 1.5, 0], [0, 1, 0]),
      port(PORT.PIPE, [0, -1.5, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'pipe_elbow', label: 'Pipe Elbow', category: 'Fluid', layer: 2, icon: '┘',
    geo: torus(0.4, 0.15, 12, 8), defaultMat: 'STEEL', mass: 0.3,
    behavior: 'rigid',
    simProps: { hollow: true, wall: 0.03 },
    ports: [
      port(PORT.PIPE, [0.4, 0, 0], [1, 0, 0]),
      port(PORT.PIPE, [0, 0, -0.4], [0, 0, -1]),
    ],
  },
  {
    id: 'hose_flex', label: 'Flex Hose (1m)', category: 'Fluid', layer: 2, icon: '〰',
    geo: cyl(0.1, 2.0, 8), defaultMat: 'RUBBER', mass: 0.2,
    behavior: 'flex',
    ports: [
      port(PORT.HOSE, [0, 1.0, 0], [0, 1, 0]),
      port(PORT.HOSE, [0, -1.0, 0], [0, -1, 0]),
    ],
  },

  // ════════════════════════════════════════════════
  // LAYER 3 — RELATION (fasteners, joints)
  // ════════════════════════════════════════════════
  {
    id: 'bolt_hex', label: 'Hex Bolt', category: 'Fasteners', layer: 3, icon: '🔩',
    geo: cyl(0.12, 0.6, 6), defaultMat: 'STEEL', mass: 0.05,
    behavior: 'rigid',
    ports: [
      port(PORT.THREAD, [0, -0.3, 0], [0, -1, 0]),
      port(PORT.SNAP, [0, 0.3, 0], [0, 1, 0]),
    ],
  },
  {
    id: 'screw_wood', label: 'Wood Screw', category: 'Fasteners', layer: 3, icon: '🪛',
    geo: cyl(0.08, 0.8, 10), defaultMat: 'STEEL', mass: 0.03,
    behavior: 'rigid',
    simProps: { penetrates: true, holeDiameter: 0.16 },
    ports: [
      port(PORT.SNAP, [0, -0.4, 0], [0, -1, 0]),
      port(PORT.SNAP, [0, 0.4, 0], [0, 1, 0]),
    ],
  },
  {
    id: 'nail_steel', label: 'Steel Nail', category: 'Fasteners', layer: 3, icon: '📌',
    geo: cyl(0.05, 0.9, 8), defaultMat: 'STEEL', mass: 0.02,
    behavior: 'rigid',
    simProps: { penetrates: true, holeDiameter: 0.10 },
    ports: [
      port(PORT.SNAP, [0, -0.45, 0], [0, -1, 0]),
      port(PORT.SNAP, [0, 0.45, 0], [0, 1, 0]),
    ],
  },
  {
    id: 'nut_hex', label: 'Hex Nut', category: 'Fasteners', layer: 3, icon: '⬡',
    geo: cyl(0.18, 0.12, 6), defaultMat: 'STEEL', mass: 0.02,
    behavior: 'rigid',
    ports: [
      port(PORT.THREAD, [0, 0, 0], [0, 1, 0]),
    ],
  },

  // ════════════════════════════════════════════════
  // LAYER 3 — RELATION (joints)
  // ════════════════════════════════════════════════
  {
    id: 'u_joint', label: 'U-Joint', category: 'Joints', layer: 3, icon: '⛓',
    geo: box(0.35, 0.35, 0.35), defaultMat: 'STEEL', mass: 0.15,
    behavior: 'rigid',
    ports: [
      // Input shaft (Y axis)
      port(PORT.SHAFT, [0, 0.25, 0], [0, 1, 0], [0, 1, 0]),
      // Output shaft (X axis)
      port(PORT.SHAFT, [0.25, 0, 0], [1, 0, 0], [1, 0, 0]),
      port(PORT.SNAP, [0, -0.175, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'hinge_joint', label: 'Hinge Joint', category: 'Joints', layer: 3, icon: '🚪',
    geo: box(0.35, 0.55, 0.20), defaultMat: 'STEEL', mass: 0.12,
    behavior: 'rigid',
    ports: [
      port(PORT.HINGE, [0, 0.275, 0], [0, 1, 0]),
      port(PORT.HINGE, [0, -0.275, 0], [0, -1, 0]),
      port(PORT.SNAP, [0, 0, 0.10], [0, 0, 1]),
    ],
  },
  {
    id: 'ball_joint', label: 'Ball Joint', category: 'Joints', layer: 3, icon: '⚪',
    geo: sphere(0.22), defaultMat: 'STEEL', mass: 0.10,
    behavior: 'rigid',
    ports: [
      port(PORT.BALL, [0, 0.22, 0], [0, 1, 0]),
      port(PORT.BALL, [0, -0.22, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'slide_rail', label: 'Slide Rail', category: 'Joints', layer: 3, icon: '➜',
    geo: box(0.25, 1.8, 0.25), defaultMat: 'STEEL', mass: 0.35,
    behavior: 'rigid',
    ports: [
      port(PORT.SLIDE, [0, 0.9, 0], [0, 1, 0]),
      port(PORT.SLIDE, [0, -0.9, 0], [0, -1, 0]),
      port(PORT.SNAP, [0, -0.9, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'rivet', label: 'Rivet', category: 'Fasteners', layer: 3, icon: '⬤',
    geo: cyl(0.08, 0.3, 8), defaultMat: 'ALUMINUM', mass: 0.01,
    behavior: 'rigid',
    ports: [
      port(PORT.SNAP, [0, -0.15, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'hinge', label: 'Door Hinge', category: 'Fasteners', layer: 3, icon: '🔗',
    geo: box(0.3, 0.8, 0.15), defaultMat: 'STEEL', mass: 0.15,
    behavior: 'rotate',
    simProps: { axis: [0, 1, 0], limitMin: -180, limitMax: 180 },
    ports: [
      port(PORT.HINGE, [-0.15, 0, 0], [-1, 0, 0]),
      port(PORT.HINGE, [0.15, 0, 0], [1, 0, 0]),
    ],
  },
  {
    id: 'ball_joint', label: 'Ball Joint', category: 'Fasteners', layer: 3, icon: '⚙',
    geo: sphere(0.2), defaultMat: 'STEEL', mass: 0.08,
    behavior: 'rotate',
    simProps: { axis: null }, // free rotation
    ports: [
      port(PORT.BALL, [0, 0, 0], [0, 1, 0]),
    ],
  },
  {
    id: 'bearing', label: 'Ball Bearing', category: 'Fasteners', layer: 3, icon: '🔘',
    geo: torus(0.25, 0.1, 16, 8), defaultMat: 'STEEL', mass: 0.12,
    behavior: 'rotate',
    simProps: { friction: 0.02 },
    ports: [
      port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0]),
    ],
  },
  {
    id: 'weld', label: 'Weld Bead', category: 'Fasteners', layer: 3, icon: '🔥',
    geo: cyl(0.08, 0.5, 6), defaultMat: 'STEEL', mass: 0.01,
    behavior: 'rigid',
    ports: [
      port(PORT.SNAP, [0, 0.25, 0], [0, 1, 0]),
      port(PORT.SNAP, [0, -0.25, 0], [0, -1, 0]),
    ],
  },

  // ════════════════════════════════════════════════
  // LAYER 5 — LIFE (moving parts)
  // ════════════════════════════════════════════════
  {
    id: 'gear_small', label: 'Spur Gear (sm)', category: 'Gears', layer: 5, icon: '⚙',
    geo: cyl(0.4, 0.2, 16), defaultMat: 'STEEL', mass: 0.3,
    behavior: 'rotate',
    simProps: { teeth: 12, module: 0.1, rpm: 0 },
    ports: [
      port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0]),
      port(PORT.GEAR, [0.4, 0, 0], [1, 0, 0]),
    ],
  },
  {
    id: 'gear_large', label: 'Spur Gear (lg)', category: 'Gears', layer: 5, icon: '⚙',
    geo: cyl(0.9, 0.2, 28), defaultMat: 'STEEL', mass: 1.2,
    behavior: 'rotate',
    simProps: { teeth: 28, module: 0.1, rpm: 0 },
    ports: [
      port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0]),
      port(PORT.GEAR, [0.9, 0, 0], [1, 0, 0]),
    ],
  },
  {
    id: 'gear_bevel', label: 'Bevel Gear', category: 'Gears', layer: 5, icon: '⚙',
    geo: cylTapered(0.1, 0.55, 0.45, 20), defaultMat: 'STEEL', mass: 0.5,
    behavior: 'rotate',
    simProps: { teeth: 16, module: 0.1, rpm: 0, angle: 45 },
    ports: [
      port(PORT.SHAFT, [0, 0.225, 0], [0, 1, 0], [0, 1, 0]),
      port(PORT.GEAR, [0.3, -0.15, 0], [1, 0, 0]),
    ],
  },
  {
    id: 'shaft_rod', label: 'Drive Shaft', category: 'Gears', layer: 5, icon: '➖',
    geo: cyl(0.08, 3.0, 8), defaultMat: 'STEEL', mass: 0.4,
    behavior: 'rotate',
    simProps: { rpm: 0 },
    ports: [
      port(PORT.SHAFT, [0, 1.5, 0], [0, 1, 0], [0, 1, 0]),
      port(PORT.SHAFT, [0, -1.5, 0], [0, -1, 0], [0, 1, 0]),
    ],
  },
  {
    id: 'pulley', label: 'Pulley', category: 'Gears', layer: 5, icon: '🔄',
    geo: cyl(0.5, 0.25, 20), defaultMat: 'STEEL', mass: 0.4,
    behavior: 'rotate',
    simProps: { rpm: 0, radius: 0.5 },
    ports: [
      port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0]),
      port(PORT.BELT, [0.5, 0, 0], [1, 0, 0]),
    ],
  },
  {
    id: 'belt', label: 'Drive Belt', category: 'Gears', layer: 5, icon: '〰',
    geo: torus(1.0, 0.05, 32, 8), defaultMat: 'RUBBER', mass: 0.1,
    behavior: 'flex',
    ports: [
      port(PORT.BELT, [1.0, 0, 0], [1, 0, 0]),
    ],
  },
  {
    id: 'wheel', label: 'Wheel + Tire', category: 'Motion', layer: 5, icon: '🛞',
    geo: cyl(0.6, 0.35, 24), defaultMat: 'RUBBER', mass: 1.0,
    behavior: 'rotate',
    simProps: { rpm: 0, radius: 0.6 },
    ports: [
      port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0]),
    ],
  },
  {
    id: 'lever', label: 'Lever Arm', category: 'Motion', layer: 5, icon: '↕',
    geo: box(0.15, 2.0, 0.15), defaultMat: 'STEEL', mass: 0.2,
    behavior: 'rotate',
    simProps: { axis: [1, 0, 0], limitMin: -90, limitMax: 90 },
    ports: [
      port(PORT.HINGE, [0, -1.0, 0], [0, -1, 0]),
      port(PORT.SNAP, [0, 1.0, 0], [0, 1, 0]),
    ],
  },
  {
    id: 'piston', label: 'Piston', category: 'Motion', layer: 5, icon: '⬆',
    geo: cyl(0.3, 1.4, 12), defaultMat: 'STEEL', mass: 0.6,
    behavior: 'slide',
    simProps: { axis: [0, 1, 0], stroke: 1.0, rpm: 0 },
    ports: [
      port(PORT.SLIDE, [0, 0.7, 0], [0, 1, 0]),
      port(PORT.SLIDE, [0, -0.7, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'spring', label: 'Coil Spring', category: 'Motion', layer: 5, icon: '🌀',
    geo: cyl(0.22, 1.5, 8), defaultMat: 'STEEL', mass: 0.1,
    behavior: 'flex',
    simProps: { stiffness: 50, damping: 5 },
    ports: [
      port(PORT.SNAP, [0, 0.75, 0], [0, 1, 0]),
      port(PORT.SNAP, [0, -0.75, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'crankshaft', label: 'Crankshaft', category: 'Motion', layer: 5, icon: '⚙',
    geo: cyl(0.12, 3.5, 8), defaultMat: 'STEEL', mass: 1.5,
    behavior: 'rotate',
    simProps: { rpm: 0, stroke: 0.8 },
    ports: [
      port(PORT.SHAFT, [0, 1.75, 0], [0, 1, 0], [0, 1, 0]),
      port(PORT.SHAFT, [0, -1.75, 0], [0, -1, 0], [0, 1, 0]),
    ],
  },
  {
    id: 'cam', label: 'Cam', category: 'Motion', layer: 5, icon: '⚙',
    geo: cylTapered(0.5, 0.5, 0.2, 16), defaultMat: 'STEEL', mass: 0.3,
    behavior: 'rotate',
    simProps: { rpm: 0, lift: 0.3, eccentricity: 0.25 },
    ports: [
      port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0]),
    ],
  },
  {
    id: 'flywheel', label: 'Flywheel', category: 'Motion', layer: 5, icon: '⚙',
    geo: cyl(1.0, 0.35, 32), defaultMat: 'STEEL', mass: 8.0,
    behavior: 'rotate',
    simProps: { rpm: 0, inertia: 2.5 },
    ports: [
      port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0]),
    ],
  },
  {
    id: 'windmill_blade', label: 'Windmill Blade', category: 'Motion', layer: 5, icon: '💨',
    geo: box(0.25, 3.5, 0.08), defaultMat: 'ALUMINUM', mass: 0.8,
    behavior: 'rotate',
    simProps: { rpm: 0, windCoeff: 1.5 },
    ports: [
      port(PORT.SHAFT, [0, -1.75, 0], [0, -1, 0], [0, 1, 0]),
    ],
  },

  // ════════════════════════════════════════════════
  // LAYER 1 — SPARK (power sources)
  // ════════════════════════════════════════════════
  {
    id: 'motor_electric', label: 'Electric Motor', category: 'Power', layer: 1, icon: '⚡',
    geo: cyl(0.6, 1.2, 16), defaultMat: 'STEEL', mass: 3.0,
    behavior: 'motor',
    simProps: { inputType: 'wire', outputType: 'shaft', rpmPerVolt: 100, maxRpm: 3000, requiresRotor: true },
    ports: [
      port(PORT.SHAFT, [0, 0.6, 0], [0, 1, 0], [0, 1, 0]),
      port(PORT.SOCKET, [0.6, 0, 0], [1, 0, 0]),
      port(PORT.SNAP, [0, -0.6, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'engine_4cyl', label: '4-Cylinder Engine', category: 'Power', layer: 1, icon: '🔧',
    geo: box(1.8, 1.4, 1.0), defaultMat: 'IRON', mass: 80.0,
    behavior: 'source',
    simProps: { outputType: 'shaft', fuelType: 'gasoline', rpm: 1500, torque: 90, cylinders: 4 },
    ports: [
      port(PORT.SHAFT, [0.9, 0, 0], [1, 0, 0], [1, 0, 0]),
      port(PORT.PIPE, [0, 0.7, 0], [0, 1, 0]),  // coolant
      port(PORT.PIPE, [0, -0.7, 0], [0, -1, 0]), // oil
    ],
  },
  {
    id: 'battery_12v', label: '12V Battery', category: 'Power', layer: 1, icon: '🔋',
    geo: box(0.7, 0.55, 1.1), defaultMat: 'PLASTIC', mass: 5.5,
    behavior: 'source',
    simProps: { outputType: 'wire', voltage: 12, capacity: 60 },
    ports: [
      port(PORT.WIRE, [0.35, 0.275, 0.3], [1, 0, 0]),  // positive
      port(PORT.WIRE, [-0.35, 0.275, 0.3], [-1, 0, 0]),  // negative
    ],
  },
  {
    id: 'battery_aa', label: 'AA Cell', category: 'Power', layer: 1, icon: '🪫',
    geo: cyl(0.07, 0.50, 12), defaultMat: 'STEEL', mass: 0.024,
    behavior: 'source',
    simProps: { outputType: 'wire', voltage: 1.5, capacity: 2.5 },
    ports: [port(PORT.WIRE, [0, 0.25, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.25, 0], [0, -1, 0])],
  },
  {
    id: 'battery_9v', label: '9V Battery', category: 'Power', layer: 1, icon: '🔋',
    geo: box(0.27, 0.48, 0.17), defaultMat: 'STEEL', mass: 0.045,
    behavior: 'source',
    simProps: { outputType: 'wire', voltage: 9, capacity: 0.6 },
    ports: [port(PORT.WIRE, [0.05, 0.24, 0], [0, 1, 0]), port(PORT.WIRE, [-0.05, 0.24, 0], [0, 1, 0])],
  },
  {
    id: 'battery_carlead', label: 'Car Battery (Lead-Acid)', category: 'Power', layer: 1, icon: '🚗',
    geo: box(0.30, 0.20, 0.18), defaultMat: 'PLASTIC', mass: 18.0,
    behavior: 'source',
    simProps: { outputType: 'wire', voltage: 12.6, capacity: 80, coldCrankAmps: 600 },
    ports: [
      port(PORT.WIRE, [0.10, 0.10, 0.07], [1, 0, 0]),
      port(PORT.WIRE, [-0.10, 0.10, 0.07], [-1, 0, 0]),
    ],
  },
  {
    id: 'solar_panel', label: 'Solar Panel', category: 'Power', layer: 1, icon: '☀',
    geo: box(2.0, 0.08, 1.2), defaultMat: 'GLASS', mass: 3.0,
    behavior: 'source',
    simProps: { outputType: 'wire', voltage: 18, watts: 100 },
    ports: [
      port(PORT.WIRE, [1.0, 0, 0], [1, 0, 0]),
      port(PORT.SNAP, [0, -0.04, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'boiler', label: 'Steam Boiler', category: 'Power', layer: 1, icon: '♨',
    geo: cyl(0.8, 2.0, 20), defaultMat: 'STEEL', mass: 25.0,
    behavior: 'source',
    simProps: { outputType: 'pipe', pressure: 2, temp: 120, fuelType: 'oil' },
    ports: [
      port(PORT.PIPE, [0, 1.0, 0], [0, 1, 0]),   // steam out
      port(PORT.PIPE, [0, -1.0, 0], [0, -1, 0]),  // water in
      port(PORT.SNAP, [0.8, 0, 0], [1, 0, 0]),
    ],
  },
  {
    id: 'generator', label: 'Generator', category: 'Power', layer: 1, icon: '⚡',
    geo: box(1.2, 0.9, 0.8), defaultMat: 'STEEL', mass: 15.0,
    behavior: 'source',
    simProps: { outputType: 'wire', voltage: 120, watts: 2000, inputType: 'shaft' },
    ports: [
      port(PORT.SHAFT, [-0.6, 0, 0], [-1, 0, 0], [1, 0, 0]),  // shaft in
      port(PORT.WIRE, [0.6, 0, 0], [1, 0, 0]),             // AC out
    ],
  },

  // ════════════════════════════════════════════════
  // LAYER 2 — MIRROR (conduits)
  // ════════════════════════════════════════════════
  {
    id: 'wire_copper', label: 'Copper Wire (1m)', category: 'Electric', layer: 2, icon: '🔌',
    geo: cyl(0.04, 2.0, 6), defaultMat: 'COPPER', mass: 0.05,
    behavior: 'flex',
    simProps: { resistance: 0.02 },
    ports: [
      port(PORT.WIRE, [0, 1.0, 0], [0, 1, 0]),
      port(PORT.WIRE, [0, -1.0, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'switch_toggle', label: 'Toggle Switch', category: 'Electric', layer: 2, icon: '🔲',
    geo: box(0.3, 0.5, 0.2), defaultMat: 'PLASTIC', mass: 0.04,
    behavior: 'logic',
    simProps: { state: false, voltage: 12 },
    ports: [
      port(PORT.WIRE, [0.15, 0, 0], [1, 0, 0]),
      port(PORT.WIRE, [-0.15, 0, 0], [-1, 0, 0]),
      port(PORT.SNAP, [0, -0.25, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'relay', label: 'Relay', category: 'Electric', layer: 2, icon: '🔲',
    geo: box(0.35, 0.4, 0.3), defaultMat: 'PLASTIC', mass: 0.06,
    behavior: 'logic',
    simProps: { coilVoltage: 12, switchCapacity: 5 },
    ports: [
      port(PORT.WIRE, [0, 0.2, 0], [0, 1, 0]),
      port(PORT.WIRE, [0, -0.2, 0], [0, -1, 0]),
    ],
  },

  // ════════════════════════════════════════════════
  // LAYER 6 — MIND (sensors, logic)
  // ════════════════════════════════════════════════
  {
    id: 'circuit_board', label: 'Circuit Board', category: 'Electronics', layer: 6, icon: '🖥',
    geo: box(1.2, 0.06, 0.9), defaultMat: 'CIRCUIT', mass: 0.15,
    behavior: 'logic',
    simProps: { programmable: true, pins: 20 },
    ports: [
      port(PORT.SOCKET, [0.4, 0.03, 0.3], [0, 1, 0]),
      port(PORT.SOCKET, [-0.4, 0.03, 0.3], [0, 1, 0]),
      port(PORT.WIRE, [0.6, 0, 0], [1, 0, 0]),
    ],
  },
  {
    id: 'logic_gate_and', label: 'AND Gate', category: 'Electronics', layer: 6, icon: '∧',
    geo: box(0.4, 0.25, 0.3), defaultMat: 'CIRCUIT', mass: 0.01,
    behavior: 'logic',
    simProps: { gateType: 'AND' },
    ports: [
      port(PORT.WIRE, [-0.2, 0.06, 0], [-1, 0, 0]),  // in A
      port(PORT.WIRE, [-0.2, -0.06, 0], [-1, 0, 0]),  // in B
      port(PORT.WIRE, [0.2, 0, 0], [1, 0, 0]),  // out
    ],
  },
  {
    id: 'sensor_pressure', label: 'Pressure Sensor', category: 'Electronics', layer: 6, icon: '📊',
    geo: cyl(0.15, 0.3, 8), defaultMat: 'STEEL', mass: 0.05,
    behavior: 'logic',
    simProps: { range: [0, 300], unit: 'psi' },
    ports: [
      port(PORT.PIPE, [0, -0.15, 0], [0, -1, 0]),
      port(PORT.WIRE, [0.15, 0, 0], [1, 0, 0]),
    ],
  },
  {
    id: 'gauge_pressure', label: 'Pressure Gauge', category: 'Instruments', layer: 6, icon: '🔵',
    geo: cyl(0.3, 0.2, 16), defaultMat: 'STEEL', mass: 0.2,
    behavior: 'load',
    simProps: { range: [0, 300], unit: 'psi' },
    ports: [
      port(PORT.PIPE, [0, -0.1, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'speaker', label: 'Speaker', category: 'Instruments', layer: 6, icon: '🔊',
    geo: cyl(0.6, 0.35, 20), defaultMat: 'PLASTIC', mass: 0.5,
    behavior: 'load',
    simProps: { watts: 10, impedance: 8 },
    ports: [
      port(PORT.WIRE, [-0.25, 0, 0], [-1, 0, 0]),
      port(PORT.SNAP, [0, -0.175, 0], [0, -1, 0]),
    ],
  },

  // ════════════════════════════════════════════════
  // LAYER 6 — MIND (loads / indicators)
  // ════════════════════════════════════════════════
  {
    id: 'light_bulb', label: 'Light Bulb', category: 'Instruments', layer: 6, icon: '💡',
    geo: sphere(0.25), defaultMat: 'GLASS', mass: 0.08,
    behavior: 'load',
    simProps: { watts: 5, maxVoltage: 24 },
    ports: [
      port(PORT.WIRE, [0, -0.25, 0], [0, -1, 0]),
      port(PORT.SNAP, [0, -0.35, 0], [0, -1, 0]),
    ],
  },

  // ════════════════════════════════════════════════
  // LAYER 5 — LIFE (mechanical loads)
  // ════════════════════════════════════════════════
  {
    id: 'fan', label: 'Fan (Blades)', category: 'Motion', layer: 5, icon: '🌀',
    geo: group([
      { geo: cyl(0.10, 0.10, 16), pos: [0, 0, 0] }, // hub
      // 3 blades (asymmetric so spin is visible)
      { geo: box(0.10, 0.02, 0.70), pos: [0, 0, 0.25], rot: [0, 0, 0] },
      { geo: box(0.10, 0.02, 0.70), pos: [0.2165, 0, -0.125], rot: [0, (2 * Math.PI) / 3, 0] },
      { geo: box(0.10, 0.02, 0.70), pos: [-0.2165, 0, -0.125], rot: [0, (4 * Math.PI) / 3, 0] },
    ]),
    defaultMat: 'ALUMINUM', mass: 0.4,
    behavior: 'rotate',
    simProps: { rpm: 0 },
    ports: [
      port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0]),
      port(PORT.SNAP, [0, -0.06, 0], [0, -1, 0]),
    ],
  },

  // ════════════════════════════════════════════════
  // Motor internals (required for electric motor output)
  // ════════════════════════════════════════════════
  {
    id: 'motor_rotor', label: 'Motor Rotor', category: 'Motion', layer: 5, icon: '🧲',
    geo: group([
      { geo: cyl(0.20, 0.70, 16), pos: [0, 0, 0] },
      // Offset magnet block so rotation is visible
      { geo: box(0.10, 0.12, 0.22), pos: [0.18, 0.0, 0], rot: [0, 0, 0] },
    ]),
    defaultMat: 'STEEL', mass: 0.6,
    behavior: 'rotate',
    simProps: { rpm: 0 },
    ports: [
      port(PORT.SHAFT, [0, 0.4, 0], [0, 1, 0], [0, 1, 0]),
      port(PORT.SHAFT, [0, -0.4, 0], [0, -1, 0], [0, 1, 0]),
    ],
  },

  // ════════════════════════════════════════════════
  // LAYER 5 — LIFE (fluid loads)
  // ════════════════════════════════════════════════
  {
    id: 'pump', label: 'Water Pump', category: 'Fluid', layer: 5, icon: '🫧',
    geo: cyl(0.35, 0.6, 16), defaultMat: 'STEEL', mass: 1.8,
    behavior: 'load',
    simProps: { maxPressure: 6 },
    ports: [
      port(PORT.SHAFT, [0, 0.3, 0], [0, 1, 0], [0, 1, 0]),
      port(PORT.PIPE, [0, 0.3, 0.35], [0, 0, 1]),
      port(PORT.PIPE, [0, -0.3, -0.35], [0, 0, -1]),
      port(PORT.SNAP, [0, -0.3, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'water_main', label: 'City Water Main', category: 'Fluid', layer: 1, icon: '🚰',
    geo: cyl(0.18, 0.80, 12), defaultMat: 'BRASS', mass: 4.0,
    behavior: 'source',
    simProps: { outputType: 'pipe', pressure: 4.1, fluid: 'water', flowMax: 60 },
    ports: [port(PORT.PIPE, [0, 0.40, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.40, 0], [0, -1, 0])],
  },
  {
    id: 'spigot', label: 'Hose Bib / Spigot', category: 'Fluid', layer: 1, icon: '🚿',
    geo: box(0.18, 0.16, 0.22), defaultMat: 'BRASS', mass: 0.5,
    behavior: 'source',
    simProps: { outputType: 'pipe', pressure: 3.4, fluid: 'water', flowMax: 20, valveOpen: true },
    ports: [port(PORT.HOSE, [0, 0, 0.11], [0, 0, 1]), port(PORT.SNAP, [0, 0, -0.11], [0, 0, -1])],
  },
  {
    id: 'hydrant', label: 'Fire Hydrant', category: 'Fluid', layer: 1, icon: '🧯',
    geo: cyl(0.18, 0.85, 12), defaultMat: 'STEEL', mass: 80.0,
    behavior: 'source',
    simProps: { outputType: 'pipe', pressure: 6.9, fluid: 'water', flowMax: 1500 },
    ports: [
      port(PORT.HOSE, [0.18, 0.20, 0], [1, 0, 0]),
      port(PORT.HOSE, [-0.18, 0.20, 0], [-1, 0, 0]),
      port(PORT.SNAP, [0, -0.425, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'well_pump', label: 'Well + Submersible Pump', category: 'Fluid', layer: 1, icon: '⛲',
    geo: cyl(0.30, 1.40, 16), defaultMat: 'STEEL', mass: 35.0,
    behavior: 'source',
    simProps: { outputType: 'pipe', pressure: 3.0, fluid: 'water', flowMax: 40, inputType: 'wire', voltsReq: 240 },
    ports: [
      port(PORT.PIPE, [0, 0.70, 0], [0, 1, 0]),
      port(PORT.WIRE, [0.30, 0.50, 0], [1, 0, 0]),
      port(PORT.SNAP, [0, -0.70, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'rain_barrel', label: 'Rain Barrel', category: 'Fluid', layer: 1, icon: '🌧',
    geo: cyl(0.45, 1.10, 16), defaultMat: 'PLASTIC', mass: 8.0,
    behavior: 'source',
    simProps: { outputType: 'pipe', pressure: 0.1, fluid: 'water', flowMax: 5, capacity: 200 },
    ports: [port(PORT.PIPE, [0, -0.55, 0.45], [0, 0, 1]), port(PORT.SNAP, [0, -0.55, 0], [0, -1, 0])],
  },
  {
    id: 'air_compressor', label: 'Air Compressor', category: 'Fluid', layer: 1, icon: '💨',
    geo: box(0.70, 0.80, 0.50), defaultMat: 'STEEL', mass: 30.0,
    behavior: 'source',
    simProps: { outputType: 'pipe', pressure: 8.6, fluid: 'air', flowMax: 4, inputType: 'wire', voltsReq: 120 },
    ports: [
      port(PORT.PIPE, [0.35, 0.30, 0], [1, 0, 0]),
      port(PORT.WIRE, [-0.35, 0.30, 0], [-1, 0, 0]),
      port(PORT.SNAP, [0, -0.40, 0], [0, -1, 0]),
    ],
  },
  {
    id: 'propane_tank', label: 'Propane Tank', category: 'Fluid', layer: 1, icon: '🛢',
    geo: cyl(0.20, 0.55, 16), defaultMat: 'STEEL', mass: 8.5,
    behavior: 'source',
    simProps: { outputType: 'pipe', pressure: 0.7, fluid: 'propane', flowMax: 1, capacity: 9 },
    ports: [port(PORT.PIPE, [0, 0.275, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.275, 0], [0, -1, 0])],
  },

  // ════════════════════════════════════════════════
  // LAYER 7 — WHOLE (containers, skins, decorative)
  // ════════════════════════════════════════════════
  {
    id: 'basin', label: 'Basin / Tank', category: 'Containers', layer: 7, icon: '🪣',
    geo: box(2.0, 1.5, 2.0), defaultMat: 'STEEL', mass: 10.0,
    behavior: 'rigid',
    simProps: { volume: 6, fluid: null },
    ports: [
      port(PORT.PIPE, [0, -0.75, 0], [0, -1, 0]),  // drain
      port(PORT.SNAP, [0, 0.75, 0], [0, 1, 0]),
    ],
  },
  {
    id: 'funnel', label: 'Funnel', category: 'Containers', layer: 7, icon: '▽',
    geo: cylTapered(0.1, 0.8, 1.2, 16), defaultMat: 'STEEL', mass: 0.4,
    behavior: 'rigid',
    ports: [
      port(PORT.PIPE, [0, -0.6, 0], [0, -1, 0]),
      port(PORT.SNAP, [0, 0.6, 0], [0, 1, 0]),
    ],
  },
  {
    id: 'drum', label: 'Drum / Barrel', category: 'Containers', layer: 7, icon: '🛢',
    geo: cyl(0.55, 1.4, 20), defaultMat: 'STEEL', mass: 15.0,
    behavior: 'rigid',
    simProps: { volume: 55, fluid: 'oil' },
    ports: [
      port(PORT.PIPE, [0, 0.7, 0], [0, 1, 0]),
      port(PORT.PIPE, [0, -0.7, 0], [0, -1, 0]),
    ],
  },

  // ════════════════════════════════════════════════
  // PIPES & FITTINGS — extended (Fluid / layer 2)
  // ════════════════════════════════════════════════
  {
    id: 'pipe_short', label: 'Pipe ½m', category: 'Fluid', layer: 2, icon: '─', geo: cyl(0.15, 0.5, 12), defaultMat: 'STEEL', mass: 0.15, behavior: 'rigid', simProps: { hollow: true, wall: 0.03 },
    ports: [port(PORT.PIPE, [0, 0.25, 0], [0, 1, 0]), port(PORT.PIPE, [0, -0.25, 0], [0, -1, 0])]
  },
  {
    id: 'pipe_long', label: 'Pipe 5m', category: 'Fluid', layer: 2, icon: '━', geo: cyl(0.15, 5.0, 12), defaultMat: 'STEEL', mass: 1.4, behavior: 'rigid', simProps: { hollow: true, wall: 0.03 },
    ports: [port(PORT.PIPE, [0, 2.5, 0], [0, 1, 0]), port(PORT.PIPE, [0, -2.5, 0], [0, -1, 0])]
  },
  {
    id: 'pipe_pvc', label: 'PVC Pipe (1m)', category: 'Fluid', layer: 2, icon: '⬜', geo: cyl(0.13, 1.0, 12), defaultMat: 'PLASTIC', mass: 0.18, behavior: 'rigid', simProps: { hollow: true, wall: 0.02 },
    ports: [port(PORT.PIPE, [0, 0.5, 0], [0, 1, 0]), port(PORT.PIPE, [0, -0.5, 0], [0, -1, 0])]
  },
  {
    id: 'pipe_copper', label: 'Copper Pipe (1m)', category: 'Fluid', layer: 2, icon: '🟧', geo: cyl(0.10, 1.0, 12), defaultMat: 'COPPER', mass: 0.45, behavior: 'rigid', simProps: { hollow: true, wall: 0.015 },
    ports: [port(PORT.PIPE, [0, 0.5, 0], [0, 1, 0]), port(PORT.PIPE, [0, -0.5, 0], [0, -1, 0])]
  },
  {
    id: 'pipe_tee', label: 'Pipe Tee', category: 'Fluid', layer: 2, icon: '┬', geo: box(0.4, 0.3, 0.3), defaultMat: 'STEEL', mass: 0.25, behavior: 'rigid', simProps: { hollow: true },
    ports: [port(PORT.PIPE, [-0.2, 0, 0], [-1, 0, 0]), port(PORT.PIPE, [0.2, 0, 0], [1, 0, 0]), port(PORT.PIPE, [0, -0.15, 0], [0, -1, 0])]
  },
  {
    id: 'pipe_cross', label: 'Pipe Cross', category: 'Fluid', layer: 2, icon: '┼', geo: box(0.4, 0.4, 0.3), defaultMat: 'STEEL', mass: 0.32, behavior: 'rigid', simProps: { hollow: true },
    ports: [port(PORT.PIPE, [-0.2, 0, 0], [-1, 0, 0]), port(PORT.PIPE, [0.2, 0, 0], [1, 0, 0]), port(PORT.PIPE, [0, 0.2, 0], [0, 1, 0]), port(PORT.PIPE, [0, -0.2, 0], [0, -1, 0])]
  },
  {
    id: 'pipe_reducer', label: 'Pipe Reducer', category: 'Fluid', layer: 2, icon: '⊃', geo: cylTapered(0.08, 0.18, 0.4, 12), defaultMat: 'STEEL', mass: 0.18, behavior: 'rigid',
    ports: [port(PORT.PIPE, [0, 0.2, 0], [0, 1, 0]), port(PORT.PIPE, [0, -0.2, 0], [0, -1, 0])]
  },
  {
    id: 'pipe_cap', label: 'Pipe Cap', category: 'Fluid', layer: 2, icon: '⏺', geo: cyl(0.16, 0.15, 12), defaultMat: 'STEEL', mass: 0.08, behavior: 'rigid',
    ports: [port(PORT.PIPE, [0, -0.075, 0], [0, -1, 0])]
  },
  {
    id: 'pipe_flange', label: 'Pipe Flange', category: 'Fluid', layer: 2, icon: '◉', geo: cyl(0.32, 0.08, 16), defaultMat: 'STEEL', mass: 0.5, behavior: 'rigid',
    ports: [port(PORT.PIPE, [0, 0.04, 0], [0, 1, 0]), port(PORT.SNAP, [0.28, 0, 0], [1, 0, 0]), port(PORT.SNAP, [-0.28, 0, 0], [-1, 0, 0])]
  },
  {
    id: 'pipe_union', label: 'Pipe Union', category: 'Fluid', layer: 2, icon: '⨂', geo: cyl(0.22, 0.4, 12), defaultMat: 'BRASS', mass: 0.35, behavior: 'rigid',
    ports: [port(PORT.PIPE, [0, 0.2, 0], [0, 1, 0]), port(PORT.PIPE, [0, -0.2, 0], [0, -1, 0])]
  },
  {
    id: 'valve_ball', label: 'Ball Valve', category: 'Fluid', layer: 2, icon: '🛑', geo: box(0.45, 0.45, 0.35), defaultMat: 'BRASS', mass: 0.6, behavior: 'logic', simProps: { state: true },
    ports: [port(PORT.PIPE, [-0.225, 0, 0], [-1, 0, 0]), port(PORT.PIPE, [0.225, 0, 0], [1, 0, 0])]
  },
  {
    id: 'valve_gate', label: 'Gate Valve', category: 'Fluid', layer: 2, icon: '🚪', geo: box(0.4, 0.65, 0.35), defaultMat: 'STEEL', mass: 0.9, behavior: 'logic', simProps: { state: true },
    ports: [port(PORT.PIPE, [-0.2, -0.15, 0], [-1, 0, 0]), port(PORT.PIPE, [0.2, -0.15, 0], [1, 0, 0])]
  },
  {
    id: 'valve_check', label: 'Check Valve', category: 'Fluid', layer: 2, icon: '➤', geo: cyl(0.18, 0.5, 12), defaultMat: 'BRASS', mass: 0.4, behavior: 'logic', simProps: { oneWay: true },
    ports: [port(PORT.PIPE, [0, 0.25, 0], [0, 1, 0]), port(PORT.PIPE, [0, -0.25, 0], [0, -1, 0])]
  },
  {
    id: 'hose_short', label: 'Short Hose ½m', category: 'Fluid', layer: 2, icon: '〰', geo: cyl(0.10, 0.5, 8), defaultMat: 'RUBBER', mass: 0.05, behavior: 'flex',
    ports: [port(PORT.HOSE, [0, 0.25, 0], [0, 1, 0]), port(PORT.HOSE, [0, -0.25, 0], [0, -1, 0])]
  },
  {
    id: 'hose_braided', label: 'Braided Hose 1m', category: 'Fluid', layer: 2, icon: '🪢', geo: cyl(0.09, 1.0, 8), defaultMat: 'STEEL', mass: 0.18, behavior: 'flex', simProps: { maxPressure: 10 },
    ports: [port(PORT.HOSE, [0, 0.5, 0], [0, 1, 0]), port(PORT.HOSE, [0, -0.5, 0], [0, -1, 0])]
  },
  {
    id: 'nozzle', label: 'Spray Nozzle', category: 'Fluid', layer: 2, icon: '🚿', geo: cylTapered(0.05, 0.16, 0.3, 12), defaultMat: 'BRASS', mass: 0.12, behavior: 'rigid',
    ports: [port(PORT.PIPE, [0, -0.15, 0], [0, -1, 0])]
  },
  {
    id: 'manifold_4', label: '4-Port Manifold', category: 'Fluid', layer: 2, icon: '⊞', geo: box(1.0, 0.3, 0.3), defaultMat: 'ALUMINUM', mass: 0.7, behavior: 'rigid',
    ports: [port(PORT.PIPE, [-0.5, 0, 0], [-1, 0, 0]), port(PORT.PIPE, [0.5, 0, 0], [1, 0, 0]), port(PORT.PIPE, [0, -0.15, -0.1], [0, -1, 0]), port(PORT.PIPE, [0, -0.15, 0.1], [0, -1, 0])]
  },

  // ════════════════════════════════════════════════
  // WIRES, CABLES & PLUGS (Electric / layer 2)
  // ════════════════════════════════════════════════
  {
    id: 'wire_thin', label: 'Wire 22 AWG (1m)', category: 'Electric', layer: 2, icon: '🧵', geo: cyl(0.02, 1.0, 6), defaultMat: 'COPPER', mass: 0.02, behavior: 'flex', simProps: { resistance: 0.05, ampacity: 5 },
    ports: [port(PORT.WIRE, [0, 0.5, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.5, 0], [0, -1, 0])]
  },
  {
    id: 'wire_thick', label: 'Wire 8 AWG (1m)', category: 'Electric', layer: 2, icon: '🪢', geo: cyl(0.06, 1.0, 8), defaultMat: 'COPPER', mass: 0.12, behavior: 'flex', simProps: { resistance: 0.005, ampacity: 40 },
    ports: [port(PORT.WIRE, [0, 0.5, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.5, 0], [0, -1, 0])]
  },
  {
    id: 'cable_coax', label: 'Coax Cable (1m)', category: 'Electric', layer: 2, icon: '⌭', geo: cyl(0.08, 1.0, 8), defaultMat: 'PLASTIC', mass: 0.08, behavior: 'flex', simProps: { impedance: 75 },
    ports: [port(PORT.WIRE, [0, 0.5, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.5, 0], [0, -1, 0])]
  },
  {
    id: 'cable_ribbon', label: 'Ribbon Cable', category: 'Electric', layer: 2, icon: '▤', geo: box(0.4, 0.02, 1.0), defaultMat: 'PLASTIC', mass: 0.04, behavior: 'flex',
    ports: [port(PORT.SOCKET, [0, 0, 0.5], [0, 0, 1]), port(PORT.SOCKET, [0, 0, -0.5], [0, 0, -1])]
  },
  {
    id: 'plug_2pin', label: '2-Pin Plug', category: 'Electric', layer: 2, icon: '🔌', geo: box(0.18, 0.18, 0.25), defaultMat: 'PLASTIC', mass: 0.03, behavior: 'rigid',
    ports: [port(PORT.WIRE, [0, 0, 0.125], [0, 0, 1]), port(PORT.SOCKET, [0, 0, -0.125], [0, 0, -1])]
  },
  {
    id: 'jack_audio', label: 'Audio Jack', category: 'Electric', layer: 2, icon: '🎧', geo: cyl(0.04, 0.4, 12), defaultMat: 'CHROME', mass: 0.02, behavior: 'rigid', simProps: { jackSize: '3.5mm' },
    ports: [port(PORT.SOCKET, [0, 0.2, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.2, 0], [0, -1, 0])]
  },
  {
    id: 'socket_outlet', label: 'Wall Outlet (120V)', category: 'Electric', layer: 1, icon: '🔲', geo: box(0.6, 0.6, 0.15), defaultMat: 'PLASTIC', mass: 0.15, behavior: 'source', simProps: { outputType: 'wire', voltage: 120, hz: 60, ampsMax: 15 },
    ports: [port(PORT.SOCKET, [0, 0, 0.075], [0, 0, 1]), port(PORT.WIRE, [0, 0, -0.075], [0, 0, -1])]
  },
  {
    id: 'outlet_240v', label: 'Wall Outlet (240V)', category: 'Electric', layer: 1, icon: '🔳', geo: box(0.7, 0.7, 0.15), defaultMat: 'PLASTIC', mass: 0.18, behavior: 'source', simProps: { outputType: 'wire', voltage: 240, hz: 60, ampsMax: 30 },
    ports: [port(PORT.SOCKET, [0, 0, 0.075], [0, 0, 1]), port(PORT.WIRE, [0, 0, -0.075], [0, 0, -1])]
  },
  {
    id: 'outlet_usb', label: 'USB Power Port', category: 'Electric', layer: 1, icon: '🔌', geo: box(0.20, 0.10, 0.05), defaultMat: 'PLASTIC', mass: 0.02, behavior: 'source', simProps: { outputType: 'wire', voltage: 5, ampsMax: 2.4 },
    ports: [port(PORT.WIRE, [0, 0, 0.025], [0, 0, 1])]
  },
  {
    id: 'switch_push', label: 'Push Button', category: 'Electric', layer: 2, icon: '⏺', geo: cyl(0.18, 0.25, 12), defaultMat: 'PLASTIC', mass: 0.04, behavior: 'logic', simProps: { state: false, momentary: true },
    ports: [port(PORT.WIRE, [0, -0.125, -0.18], [0, 0, -1]), port(PORT.WIRE, [0, -0.125, 0.18], [0, 0, 1])]
  },
  {
    id: 'switch_rocker', label: 'Rocker Switch', category: 'Electric', layer: 2, icon: '🎚', geo: box(0.4, 0.25, 0.3), defaultMat: 'PLASTIC', mass: 0.05, behavior: 'logic', simProps: { state: false },
    ports: [port(PORT.WIRE, [-0.2, -0.125, 0], [0, -1, 0]), port(PORT.WIRE, [0.2, -0.125, 0], [0, -1, 0])]
  },
  {
    id: 'switch_dpdt', label: 'DPDT Switch', category: 'Electric', layer: 2, icon: '⇄', geo: box(0.4, 0.4, 0.25), defaultMat: 'PLASTIC', mass: 0.06, behavior: 'logic', simProps: { state: 0 },
    ports: [port(PORT.WIRE, [-0.18, -0.2, -0.08], [0, -1, 0]), port(PORT.WIRE, [-0.18, -0.2, 0.08], [0, -1, 0]), port(PORT.WIRE, [0.18, -0.2, -0.08], [0, -1, 0]), port(PORT.WIRE, [0.18, -0.2, 0.08], [0, -1, 0])]
  },
  {
    id: 'fuse_inline', label: 'Inline Fuse', category: 'Electric', layer: 2, icon: '🧯', geo: cyl(0.10, 0.5, 12), defaultMat: 'GLASS', mass: 0.02, behavior: 'logic', simProps: { ratingAmps: 5 },
    ports: [port(PORT.WIRE, [0, 0.25, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.25, 0], [0, -1, 0])]
  },
  {
    id: 'circuit_breaker', label: 'Circuit Breaker', category: 'Electric', layer: 2, icon: '⚡', geo: box(0.35, 0.7, 0.4), defaultMat: 'PLASTIC', mass: 0.25, behavior: 'logic', simProps: { ratingAmps: 20, state: true },
    ports: [port(PORT.WIRE, [0, 0.35, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.35, 0], [0, -1, 0])]
  },
  {
    id: 'busbar', label: 'Bus Bar', category: 'Electric', layer: 2, icon: '▬', geo: box(2.0, 0.05, 0.2), defaultMat: 'COPPER', mass: 1.5, behavior: 'rigid',
    ports: [port(PORT.WIRE, [-0.8, 0, 0], [-1, 0, 0]), port(PORT.WIRE, [-0.3, 0, 0], [-1, 0, 0]), port(PORT.WIRE, [0.3, 0, 0], [1, 0, 0]), port(PORT.WIRE, [0.8, 0, 0], [1, 0, 0])]
  },
  {
    id: 'terminal_block', label: 'Terminal Block', category: 'Electric', layer: 2, icon: '☷', geo: box(0.6, 0.2, 0.2), defaultMat: 'PLASTIC', mass: 0.1, behavior: 'rigid',
    ports: [port(PORT.WIRE, [-0.2, 0.1, 0], [0, 1, 0]), port(PORT.WIRE, [0, 0.1, 0], [0, 1, 0]), port(PORT.WIRE, [0.2, 0.1, 0], [0, 1, 0])]
  },
  {
    id: 'ground_stake', label: 'Grounding Stake', category: 'Electric', layer: 2, icon: '⏚', geo: cyl(0.04, 1.5, 8), defaultMat: 'COPPER', mass: 0.6, behavior: 'rigid', simProps: { ground: true },
    ports: [port(PORT.WIRE, [0, 0.75, 0], [0, 1, 0])]
  },

  // ════════════════════════════════════════════════
  // ELECTRONICS — discrete + IC (Electronics / layer 6)
  // ════════════════════════════════════════════════
  {
    id: 'resistor_quarter', label: 'Resistor ¼W', category: 'Electronics', layer: 6, icon: '◫', geo: cyl(0.04, 0.25, 8), defaultMat: 'CIRCUIT', mass: 0.001, behavior: 'logic', simProps: { ohms: 1000 },
    ports: [port(PORT.WIRE, [0, 0.125, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.125, 0], [0, -1, 0])]
  },
  {
    id: 'resistor_power', label: 'Resistor 10W', category: 'Electronics', layer: 6, icon: '▮', geo: box(0.5, 0.18, 0.18), defaultMat: 'CERAMIC', mass: 0.05, behavior: 'logic', simProps: { ohms: 10 },
    ports: [port(PORT.WIRE, [-0.25, 0, 0], [-1, 0, 0]), port(PORT.WIRE, [0.25, 0, 0], [1, 0, 0])]
  },
  {
    id: 'capacitor_elec', label: 'Capacitor 100µF', category: 'Electronics', layer: 6, icon: '⊞', geo: cyl(0.10, 0.30, 12), defaultMat: 'ALUMINUM', mass: 0.01, behavior: 'logic', simProps: { uF: 100, voltage: 25 },
    ports: [port(PORT.WIRE, [0, -0.15, 0.05], [0, -1, 0]), port(PORT.WIRE, [0, -0.15, -0.05], [0, -1, 0])]
  },
  {
    id: 'capacitor_ceramic', label: 'Ceramic Capacitor', category: 'Electronics', layer: 6, icon: '◊', geo: box(0.12, 0.10, 0.04), defaultMat: 'CERAMIC', mass: 0.001, behavior: 'logic', simProps: { uF: 0.01 },
    ports: [port(PORT.WIRE, [-0.06, -0.05, 0], [0, -1, 0]), port(PORT.WIRE, [0.06, -0.05, 0], [0, -1, 0])]
  },
  {
    id: 'inductor', label: 'Inductor 10mH', category: 'Electronics', layer: 6, icon: '◯', geo: torus(0.10, 0.04, 16, 8), defaultMat: 'COPPER', mass: 0.02, behavior: 'logic', simProps: { mH: 10 },
    ports: [port(PORT.WIRE, [-0.10, 0, 0], [-1, 0, 0]), port(PORT.WIRE, [0.10, 0, 0], [1, 0, 0])]
  },
  {
    id: 'diode_signal', label: 'Diode 1N4148', category: 'Electronics', layer: 6, icon: '▷', geo: cyl(0.025, 0.20, 8), defaultMat: 'GLASS', mass: 0.001, behavior: 'logic', simProps: { Vf: 0.7 },
    ports: [port(PORT.WIRE, [0, 0.10, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.10, 0], [0, -1, 0])]
  },
  {
    id: 'diode_zener', label: 'Zener Diode', category: 'Electronics', layer: 6, icon: '⏵', geo: cyl(0.03, 0.22, 8), defaultMat: 'GLASS', mass: 0.001, behavior: 'logic', simProps: { Vz: 5.1 },
    ports: [port(PORT.WIRE, [0, 0.11, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.11, 0], [0, -1, 0])]
  },
  {
    id: 'led_indicator', label: 'LED', category: 'Electronics', layer: 6, icon: '💠', geo: cyl(0.05, 0.15, 12), defaultMat: 'PLASTIC', mass: 0.001, behavior: 'load', simProps: { Vf: 2.0, mA: 20, color: 0xff3333 },
    ports: [port(PORT.WIRE, [0, -0.075, 0.025], [0, -1, 0]), port(PORT.WIRE, [0, -0.075, -0.025], [0, -1, 0])]
  },
  {
    id: 'transistor_npn', label: 'Transistor NPN', category: 'Electronics', layer: 6, icon: '▲', geo: cyl(0.10, 0.18, 8), defaultMat: 'PLASTIC', mass: 0.002, behavior: 'logic', simProps: { type: 'NPN', hFE: 100 },
    ports: [port(PORT.WIRE, [0, -0.09, 0.05], [0, -1, 0]), port(PORT.WIRE, [0, -0.09, 0], [0, -1, 0]), port(PORT.WIRE, [0, -0.09, -0.05], [0, -1, 0])]
  },
  {
    id: 'transistor_pnp', label: 'Transistor PNP', category: 'Electronics', layer: 6, icon: '▽', geo: cyl(0.10, 0.18, 8), defaultMat: 'PLASTIC', mass: 0.002, behavior: 'logic', simProps: { type: 'PNP', hFE: 100 },
    ports: [port(PORT.WIRE, [0, -0.09, 0.05], [0, -1, 0]), port(PORT.WIRE, [0, -0.09, 0], [0, -1, 0]), port(PORT.WIRE, [0, -0.09, -0.05], [0, -1, 0])]
  },
  {
    id: 'mosfet', label: 'MOSFET', category: 'Electronics', layer: 6, icon: '⊠', geo: box(0.18, 0.22, 0.05), defaultMat: 'PLASTIC', mass: 0.003, behavior: 'logic', simProps: { type: 'NMOS' },
    ports: [port(PORT.WIRE, [-0.06, -0.11, 0], [0, -1, 0]), port(PORT.WIRE, [0, -0.11, 0], [0, -1, 0]), port(PORT.WIRE, [0.06, -0.11, 0], [0, -1, 0])]
  },
  {
    id: 'logic_or', label: 'OR Gate', category: 'Electronics', layer: 6, icon: '∨', geo: box(0.4, 0.25, 0.3), defaultMat: 'CIRCUIT', mass: 0.01, behavior: 'logic', simProps: { gateType: 'OR' },
    ports: [port(PORT.WIRE, [-0.2, 0.06, 0], [-1, 0, 0]), port(PORT.WIRE, [-0.2, -0.06, 0], [-1, 0, 0]), port(PORT.WIRE, [0.2, 0, 0], [1, 0, 0])]
  },
  {
    id: 'logic_not', label: 'NOT Gate', category: 'Electronics', layer: 6, icon: '¬', geo: box(0.3, 0.2, 0.25), defaultMat: 'CIRCUIT', mass: 0.008, behavior: 'logic', simProps: { gateType: 'NOT' },
    ports: [port(PORT.WIRE, [-0.15, 0, 0], [-1, 0, 0]), port(PORT.WIRE, [0.15, 0, 0], [1, 0, 0])]
  },
  {
    id: 'logic_xor', label: 'XOR Gate', category: 'Electronics', layer: 6, icon: '⊕', geo: box(0.4, 0.25, 0.3), defaultMat: 'CIRCUIT', mass: 0.01, behavior: 'logic', simProps: { gateType: 'XOR' },
    ports: [port(PORT.WIRE, [-0.2, 0.06, 0], [-1, 0, 0]), port(PORT.WIRE, [-0.2, -0.06, 0], [-1, 0, 0]), port(PORT.WIRE, [0.2, 0, 0], [1, 0, 0])]
  },
  {
    id: 'opamp_741', label: 'Op-Amp', category: 'Electronics', layer: 6, icon: '▷', geo: box(0.4, 0.10, 0.3), defaultMat: 'PLASTIC', mass: 0.005, behavior: 'logic', simProps: { gainOpenLoop: 100000 },
    ports: [port(PORT.WIRE, [-0.2, -0.05, 0.06], [0, -1, 0]), port(PORT.WIRE, [-0.2, -0.05, -0.06], [0, -1, 0]), port(PORT.WIRE, [0.2, -0.05, 0], [0, -1, 0])]
  },
  {
    id: 'mcu_8pin', label: 'Microcontroller (8-pin)', category: 'Electronics', layer: 6, icon: '🧠', geo: box(0.5, 0.10, 0.35), defaultMat: 'PLASTIC', mass: 0.01, behavior: 'logic', simProps: { programmable: true, pins: 8 },
    ports: [port(PORT.WIRE, [-0.25, -0.05, 0.10], [0, -1, 0]), port(PORT.WIRE, [-0.25, -0.05, -0.10], [0, -1, 0]), port(PORT.WIRE, [0.25, -0.05, 0.10], [0, -1, 0]), port(PORT.WIRE, [0.25, -0.05, -0.10], [0, -1, 0])]
  },
  {
    id: 'breadboard', label: 'Breadboard', category: 'Electronics', layer: 6, icon: '☷', geo: box(2.0, 0.10, 0.6), defaultMat: 'PLASTIC', mass: 0.15, behavior: 'rigid', simProps: { holes: 400 },
    ports: [port(PORT.SOCKET, [-0.5, 0.05, 0], [0, 1, 0]), port(PORT.SOCKET, [0.5, 0.05, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.05, 0], [0, -1, 0])]
  },
  {
    id: 'pcb_blank', label: 'Blank PCB', category: 'Electronics', layer: 6, icon: '🟩', geo: box(1.5, 0.04, 1.0), defaultMat: 'CIRCUIT', mass: 0.10, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.02, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.02, 0], [0, -1, 0])]
  },

  // ════════════════════════════════════════════════
  // STRUCTURE — extended (Form / layer 4)
  // ════════════════════════════════════════════════
  {
    id: 'beam_ibeam', label: 'I-Beam (3m)', category: 'Structure', layer: 4, icon: 'I', geo: box(0.6, 3.0, 0.2), defaultMat: 'STEEL', mass: 6.5, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 1.5, 0], [0, 1, 0]), port(PORT.SNAP, [0, -1.5, 0], [0, -1, 0])]
  },
  {
    id: 'beam_channel', label: 'C-Channel (3m)', category: 'Structure', layer: 4, icon: '⊏', geo: box(0.5, 3.0, 0.4), defaultMat: 'STEEL', mass: 4.2, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 1.5, 0], [0, 1, 0]), port(PORT.SNAP, [0, -1.5, 0], [0, -1, 0])]
  },
  {
    id: 'beam_angle', label: 'Angle Iron (2m)', category: 'Structure', layer: 4, icon: '∠', geo: box(0.4, 2.0, 0.4), defaultMat: 'STEEL', mass: 2.4, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 1, 0], [0, 1, 0]), port(PORT.SNAP, [0, -1, 0], [0, -1, 0])]
  },
  {
    id: 'beam_aluminum', label: 'Aluminum Extrusion', category: 'Structure', layer: 4, icon: '▱', geo: box(0.4, 2.5, 0.4), defaultMat: 'ALUMINUM', mass: 1.1, behavior: 'rigid', simProps: { tslot: true },
    ports: [port(PORT.SLIDE, [0.2, 0, 0], [1, 0, 0]), port(PORT.SLIDE, [-0.2, 0, 0], [-1, 0, 0]), port(PORT.SNAP, [0, 1.25, 0], [0, 1, 0]), port(PORT.SNAP, [0, -1.25, 0], [0, -1, 0])]
  },
  {
    id: 'tube_square', label: 'Square Tube (2m)', category: 'Structure', layer: 4, icon: '▢', geo: box(0.5, 2.0, 0.5), defaultMat: 'STEEL', mass: 2.8, behavior: 'rigid', simProps: { hollow: true, wall: 0.05 },
    ports: [port(PORT.SNAP, [0, 1, 0], [0, 1, 0]), port(PORT.SNAP, [0, -1, 0], [0, -1, 0])]
  },
  {
    id: 'tube_round', label: 'Round Tube (2m)', category: 'Structure', layer: 4, icon: '◯', geo: cyl(0.20, 2.0, 12), defaultMat: 'STEEL', mass: 2.5, behavior: 'rigid', simProps: { hollow: true, wall: 0.05 },
    ports: [port(PORT.SNAP, [0, 1, 0], [0, 1, 0]), port(PORT.SNAP, [0, -1, 0], [0, -1, 0])]
  },
  {
    id: 'rod_steel', label: 'Steel Rod (1m)', category: 'Structure', layer: 4, icon: '│', geo: cyl(0.06, 1.0, 8), defaultMat: 'STEEL', mass: 0.4, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.5, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.5, 0], [0, -1, 0])]
  },
  {
    id: 'panel_aluminum', label: 'Aluminum Panel', category: 'Structure', layer: 4, icon: '▣', geo: box(2.0, 0.06, 2.0), defaultMat: 'ALUMINUM', mass: 1.0, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.03, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.03, 0], [0, -1, 0])]
  },
  {
    id: 'panel_plastic', label: 'Plastic Panel', category: 'Structure', layer: 4, icon: '▦', geo: box(2.0, 0.08, 2.0), defaultMat: 'PLASTIC', mass: 0.5, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.04, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.04, 0], [0, -1, 0])]
  },
  {
    id: 'panel_foam', label: 'Foam Panel', category: 'Structure', layer: 4, icon: '▩', geo: box(2.0, 0.20, 2.0), defaultMat: 'FOAM', mass: 0.10, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.10, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.10, 0], [0, -1, 0])]
  },
  {
    id: 'panel_fiber', label: 'Fiberglass Panel', category: 'Structure', layer: 4, icon: '▤', geo: box(2.0, 0.06, 2.0), defaultMat: 'FIBER', mass: 0.7, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.03, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.03, 0], [0, -1, 0])]
  },
  {
    id: 'panel_acrylic', label: 'Acrylic Sheet', category: 'Structure', layer: 4, icon: '◫', geo: box(2.0, 0.06, 2.0), defaultMat: 'GLASS', mass: 0.8, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.03, 0], [0, 1, 0])]
  },
  {
    id: 'panel_perforated', label: 'Pegboard', category: 'Structure', layer: 4, icon: '▦', geo: box(2.0, 0.08, 1.5), defaultMat: 'WOOD_BOARD', mass: 0.6, behavior: 'rigid', simProps: { holePitch: 0.025 },
    ports: [port(PORT.SNAP, [0, 0.04, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.04, 0], [0, -1, 0])]
  },
  {
    id: 'plate_floor', label: 'Diamond Plate', category: 'Structure', layer: 4, icon: '◈', geo: box(2.5, 0.05, 2.5), defaultMat: 'STEEL', mass: 8.0, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.025, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.025, 0], [0, -1, 0])]
  },
  {
    id: 'wall_brick', label: 'Brick Wall (1m²)', category: 'Structure', layer: 4, icon: '🧱', geo: box(2.0, 2.0, 0.4), defaultMat: 'BRICK', mass: 30.0, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 1, 0], [0, 1, 0]), port(PORT.SNAP, [0, -1, 0], [0, -1, 0])]
  },
  {
    id: 'wall_concrete', label: 'Concrete Slab', category: 'Structure', layer: 4, icon: '⬜', geo: box(2.0, 0.20, 2.0), defaultMat: 'CONCRETE', mass: 50.0, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.10, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.10, 0], [0, -1, 0])]
  },
  {
    id: 'frame_corner', label: 'Corner Bracket', category: 'Structure', layer: 4, icon: '⌐', geo: box(0.4, 0.4, 0.05), defaultMat: 'STEEL', mass: 0.15, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.2, 0], [0, 1, 0]), port(PORT.SNAP, [0.2, 0, 0], [1, 0, 0])]
  },
  {
    id: 'frame_t', label: 'T-Bracket', category: 'Structure', layer: 4, icon: '⊥', geo: box(0.6, 0.4, 0.05), defaultMat: 'STEEL', mass: 0.20, behavior: 'rigid',
    ports: [port(PORT.SNAP, [-0.3, 0, 0], [-1, 0, 0]), port(PORT.SNAP, [0.3, 0, 0], [1, 0, 0]), port(PORT.SNAP, [0, -0.2, 0], [0, -1, 0])]
  },
  {
    id: 'gusset', label: 'Gusset Plate', category: 'Structure', layer: 4, icon: '◢', geo: box(0.5, 0.5, 0.04), defaultMat: 'STEEL', mass: 0.18, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.25, 0], [0, 1, 0]), port(PORT.SNAP, [0.25, 0, 0], [1, 0, 0])]
  },
  {
    id: 'leg_telescoping', label: 'Telescoping Leg', category: 'Structure', layer: 4, icon: '⬍', geo: cyl(0.10, 1.0, 12), defaultMat: 'STEEL', mass: 1.2, behavior: 'slide', simProps: { stroke: 0.5 },
    ports: [port(PORT.SNAP, [0, 0.5, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.5, 0], [0, -1, 0])]
  },
  {
    id: 'caster_wheel', label: 'Caster Wheel', category: 'Structure', layer: 4, icon: '⊙', geo: cyl(0.12, 0.20, 16), defaultMat: 'RUBBER', mass: 0.4, behavior: 'rotate', simProps: { swivels: true },
    ports: [port(PORT.SNAP, [0, 0.10, 0], [0, 1, 0])]
  },
  {
    id: 'foot_rubber', label: 'Rubber Foot', category: 'Structure', layer: 4, icon: '⏺', geo: cyl(0.08, 0.05, 12), defaultMat: 'RUBBER', mass: 0.05, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.025, 0], [0, 1, 0])]
  },

  // ════════════════════════════════════════════════
  // FASTENERS — extended (Relation / layer 3)
  // ════════════════════════════════════════════════
  {
    id: 'screw_machine', label: 'Machine Screw', category: 'Fasteners', layer: 3, icon: '⚙', geo: cyl(0.07, 0.5, 8), defaultMat: 'STEEL', mass: 0.02, behavior: 'rigid', simProps: { penetrates: true, holeDiameter: 0.14, threadPitch: 0.8 },
    ports: [port(PORT.THREAD, [0, -0.25, 0], [0, -1, 0]), port(PORT.SNAP, [0, 0.25, 0], [0, 1, 0])]
  },
  {
    id: 'screw_lag', label: 'Lag Screw', category: 'Fasteners', layer: 3, icon: '🔩', geo: cyl(0.10, 1.2, 8), defaultMat: 'STEEL', mass: 0.10, behavior: 'rigid', simProps: { penetrates: true, holeDiameter: 0.20 },
    ports: [port(PORT.THREAD, [0, -0.6, 0], [0, -1, 0]), port(PORT.SNAP, [0, 0.6, 0], [0, 1, 0])]
  },
  {
    id: 'screw_set', label: 'Set Screw', category: 'Fasteners', layer: 3, icon: '·', geo: cyl(0.05, 0.20, 6), defaultMat: 'STEEL', mass: 0.005, behavior: 'rigid',
    ports: [port(PORT.THREAD, [0, -0.10, 0], [0, -1, 0])]
  },
  {
    id: 'bolt_carriage', label: 'Carriage Bolt', category: 'Fasteners', layer: 3, icon: '⊥', geo: cyl(0.10, 1.0, 8), defaultMat: 'STEEL', mass: 0.08, behavior: 'rigid',
    ports: [port(PORT.THREAD, [0, -0.5, 0], [0, -1, 0]), port(PORT.SNAP, [0, 0.5, 0], [0, 1, 0])]
  },
  {
    id: 'bolt_eye', label: 'Eye Bolt', category: 'Fasteners', layer: 3, icon: '◯', geo: cyl(0.08, 0.7, 8), defaultMat: 'STEEL', mass: 0.07, behavior: 'rigid',
    ports: [port(PORT.THREAD, [0, -0.35, 0], [0, -1, 0]), port(PORT.ROPE, [0, 0.35, 0], [0, 1, 0])]
  },
  {
    id: 'bolt_anchor', label: 'Anchor Bolt', category: 'Fasteners', layer: 3, icon: '⚓', geo: cyl(0.12, 1.5, 8), defaultMat: 'STEEL', mass: 0.25, behavior: 'rigid',
    ports: [port(PORT.THREAD, [0, 0.75, 0], [0, 1, 0])]
  },
  {
    id: 'nut_wing', label: 'Wing Nut', category: 'Fasteners', layer: 3, icon: '🦋', geo: box(0.45, 0.20, 0.20), defaultMat: 'STEEL', mass: 0.03, behavior: 'rigid',
    ports: [port(PORT.THREAD, [0, 0, 0], [0, 1, 0])]
  },
  {
    id: 'nut_lock', label: 'Lock Nut', category: 'Fasteners', layer: 3, icon: '⬡', geo: cyl(0.18, 0.15, 6), defaultMat: 'STEEL', mass: 0.025, behavior: 'rigid',
    ports: [port(PORT.THREAD, [0, 0, 0], [0, 1, 0])]
  },
  {
    id: 'washer_flat', label: 'Flat Washer', category: 'Fasteners', layer: 3, icon: '◌', geo: torus(0.15, 0.02, 12, 6), defaultMat: 'STEEL', mass: 0.005, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0, 0], [0, 1, 0])]
  },
  {
    id: 'washer_lock', label: 'Lock Washer', category: 'Fasteners', layer: 3, icon: '◐', geo: torus(0.13, 0.02, 12, 6), defaultMat: 'STEEL', mass: 0.005, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0, 0], [0, 1, 0])]
  },
  {
    id: 'rivet_pop', label: 'Pop Rivet', category: 'Fasteners', layer: 3, icon: '•', geo: cyl(0.06, 0.4, 8), defaultMat: 'ALUMINUM', mass: 0.005, behavior: 'rigid', simProps: { penetrates: true, holeDiameter: 0.12 },
    ports: [port(PORT.SNAP, [0, -0.2, 0], [0, -1, 0])]
  },
  {
    id: 'staple_heavy', label: 'Heavy Staple', category: 'Fasteners', layer: 3, icon: '⊓', geo: box(0.25, 0.15, 0.04), defaultMat: 'STEEL', mass: 0.003, behavior: 'rigid',
    ports: [port(PORT.SNAP, [-0.10, -0.075, 0], [0, -1, 0]), port(PORT.SNAP, [0.10, -0.075, 0], [0, -1, 0])]
  },
  {
    id: 'zip_tie', label: 'Zip Tie', category: 'Fasteners', layer: 3, icon: '🧷', geo: box(0.04, 0.5, 0.01), defaultMat: 'NYLON', mass: 0.002, behavior: 'flex', simProps: { tensile: 200 },
    ports: [port(PORT.ROPE, [0, 0.25, 0], [0, 1, 0]), port(PORT.ROPE, [0, -0.25, 0], [0, -1, 0])]
  },
  {
    id: 'clamp_hose', label: 'Hose Clamp', category: 'Fasteners', layer: 3, icon: '◯', geo: torus(0.18, 0.02, 16, 6), defaultMat: 'STEEL', mass: 0.03, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0, 0], [0, 1, 0])]
  },
  {
    id: 'clamp_c', label: 'C-Clamp', category: 'Fasteners', layer: 3, icon: 'C', geo: box(0.5, 0.6, 0.15), defaultMat: 'STEEL', mass: 0.6, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0.20, 0.25, 0], [1, 0, 0]), port(PORT.SNAP, [0.20, -0.25, 0], [1, 0, 0])]
  },
  {
    id: 'turnbuckle', label: 'Turnbuckle', category: 'Fasteners', layer: 3, icon: '⊝', geo: cyl(0.08, 0.5, 8), defaultMat: 'STEEL', mass: 0.18, behavior: 'rigid', simProps: { adjustable: true },
    ports: [port(PORT.ROPE, [0, 0.25, 0], [0, 1, 0]), port(PORT.ROPE, [0, -0.25, 0], [0, -1, 0])]
  },
  {
    id: 'shackle', label: 'D-Shackle', category: 'Fasteners', layer: 3, icon: 'D', geo: torus(0.12, 0.03, 12, 6), defaultMat: 'STEEL', mass: 0.15, behavior: 'rigid',
    ports: [port(PORT.ROPE, [-0.12, 0, 0], [-1, 0, 0]), port(PORT.ROPE, [0.12, 0, 0], [1, 0, 0])]
  },

  // ════════════════════════════════════════════════
  // JOINTS — extended (Relation / layer 3)
  // ════════════════════════════════════════════════
  {
    id: 'cv_joint', label: 'CV Joint', category: 'Joints', layer: 3, icon: '⚙', geo: sphere(0.30), defaultMat: 'STEEL', mass: 1.2, behavior: 'rotate',
    ports: [port(PORT.SHAFT, [0, 0.30, 0], [0, 1, 0], [0, 1, 0]), port(PORT.SHAFT, [0, -0.30, 0], [0, -1, 0], [0, 1, 0])]
  },
  {
    id: 'pivot_pin', label: 'Pivot Pin', category: 'Joints', layer: 3, icon: '·', geo: cyl(0.05, 0.6, 8), defaultMat: 'STEEL', mass: 0.04, behavior: 'rotate',
    ports: [port(PORT.HINGE, [0, 0.30, 0], [0, 1, 0]), port(PORT.HINGE, [0, -0.30, 0], [0, -1, 0])]
  },
  {
    id: 'rod_end', label: 'Rod End (Heim)', category: 'Joints', layer: 3, icon: '⊕', geo: torus(0.12, 0.04, 12, 6), defaultMat: 'STEEL', mass: 0.10, behavior: 'rotate',
    ports: [port(PORT.BALL, [0, 0, 0], [0, 1, 0]), port(PORT.THREAD, [0, -0.16, 0], [0, -1, 0])]
  },
  {
    id: 'flexible_coupling', label: 'Flex Coupling', category: 'Joints', layer: 3, icon: '⌇', geo: cyl(0.18, 0.40, 12), defaultMat: 'RUBBER', mass: 0.20, behavior: 'flex',
    ports: [port(PORT.SHAFT, [0, 0.20, 0], [0, 1, 0], [0, 1, 0]), port(PORT.SHAFT, [0, -0.20, 0], [0, -1, 0], [0, 1, 0])]
  },
  {
    id: 'rigid_coupling', label: 'Rigid Coupling', category: 'Joints', layer: 3, icon: '⊟', geo: cyl(0.20, 0.30, 12), defaultMat: 'STEEL', mass: 0.50, behavior: 'rigid',
    ports: [port(PORT.SHAFT, [0, 0.15, 0], [0, 1, 0], [0, 1, 0]), port(PORT.SHAFT, [0, -0.15, 0], [0, -1, 0], [0, 1, 0])]
  },
  {
    id: 'piano_hinge', label: 'Piano Hinge', category: 'Joints', layer: 3, icon: '▤', geo: box(0.10, 1.5, 0.30), defaultMat: 'STEEL', mass: 0.40, behavior: 'rotate',
    ports: [port(PORT.HINGE, [0, 0, -0.15], [0, 0, -1]), port(PORT.HINGE, [0, 0, 0.15], [0, 0, 1])]
  },

  // ════════════════════════════════════════════════
  // MOTION — extended (Life / layer 5)
  // ════════════════════════════════════════════════
  {
    id: 'turbine_steam', label: 'Steam Turbine', category: 'Motion', layer: 5, icon: '💨', geo: cyl(0.6, 1.2, 16), defaultMat: 'STEEL', mass: 12.0, behavior: 'rotate', simProps: { rpm: 3600, intake: 'steam' },
    ports: [port(PORT.PIPE, [0, 0.6, 0], [0, 1, 0]), port(PORT.PIPE, [0, -0.6, 0], [0, -1, 0]), port(PORT.SHAFT, [0.6, 0, 0], [1, 0, 0], [1, 0, 0])]
  },
  {
    id: 'turbine_water', label: 'Water Turbine', category: 'Motion', layer: 5, icon: '💧', geo: cyl(0.7, 0.5, 16), defaultMat: 'BRONZE', mass: 8.0, behavior: 'rotate', simProps: { rpm: 600, intake: 'water' },
    ports: [port(PORT.PIPE, [0, 0.25, 0], [0, 1, 0]), port(PORT.SHAFT, [0, -0.25, 0], [0, -1, 0], [0, 1, 0])]
  },
  {
    id: 'turbine_wind', label: 'Wind Turbine Hub', category: 'Motion', layer: 5, icon: '🌬', geo: cyl(0.4, 0.3, 12), defaultMat: 'ALUMINUM', mass: 3.0, behavior: 'rotate', simProps: { rpm: 60, blades: 3 },
    ports: [port(PORT.SHAFT, [0, -0.15, 0], [0, -1, 0], [0, 1, 0]), port(PORT.SNAP, [0.4, 0, 0], [1, 0, 0]), port(PORT.SNAP, [-0.4, 0, 0], [-1, 0, 0])]
  },
  {
    id: 'fan_axial', label: 'Axial Fan', category: 'Motion', layer: 5, icon: '🪭', geo: cyl(0.5, 0.15, 12), defaultMat: 'PLASTIC', mass: 0.5, behavior: 'rotate', simProps: { cfm: 200 },
    ports: [port(PORT.SHAFT, [0, 0, 0], [0, 0, 1], [0, 0, 1]), port(PORT.SNAP, [0.5, 0, 0], [1, 0, 0])]
  },
  {
    id: 'fan_centrifugal', label: 'Centrifugal Fan', category: 'Motion', layer: 5, icon: '🌀', geo: cyl(0.6, 0.4, 16), defaultMat: 'STEEL', mass: 2.0, behavior: 'rotate', simProps: { cfm: 500 },
    ports: [port(PORT.SHAFT, [0, 0, 0], [0, 0, 1], [0, 0, 1]), port(PORT.PIPE, [0.6, 0, 0], [1, 0, 0])]
  },
  {
    id: 'pulley_v', label: 'V-Pulley', category: 'Motion', layer: 5, icon: '◯', geo: cyl(0.30, 0.10, 16), defaultMat: 'STEEL', mass: 0.5, behavior: 'rotate',
    ports: [port(PORT.SHAFT, [0, 0, 0], [0, 0, 1], [0, 0, 1]), port(PORT.BELT, [0.30, 0, 0], [0, 1, 0])]
  },
  {
    id: 'pulley_block', label: 'Block & Tackle', category: 'Motion', layer: 5, icon: '⚓', geo: box(0.4, 0.6, 0.20), defaultMat: 'STEEL', mass: 1.5, behavior: 'rotate', simProps: { mechanicalAdvantage: 4 },
    ports: [port(PORT.ROPE, [0, -0.3, 0], [0, -1, 0]), port(PORT.SNAP, [0, 0.3, 0], [0, 1, 0])]
  },
  {
    id: 'conveyor_belt', label: 'Conveyor (2m)', category: 'Motion', layer: 5, icon: '➡', geo: box(2.0, 0.20, 0.50), defaultMat: 'RUBBER', mass: 4.0, behavior: 'translate', simProps: { speed: 0.5 },
    ports: [port(PORT.SHAFT, [-1.0, 0, 0], [-1, 0, 0], [1, 0, 0]), port(PORT.SHAFT, [1.0, 0, 0], [1, 0, 0], [1, 0, 0]), port(PORT.SNAP, [0, -0.10, 0], [0, -1, 0])]
  },
  {
    id: 'roller', label: 'Roller', category: 'Motion', layer: 5, icon: '⌬', geo: cyl(0.10, 0.5, 12), defaultMat: 'STEEL', mass: 0.3, behavior: 'rotate',
    ports: [port(PORT.SHAFT, [0, 0.25, 0], [0, 1, 0], [0, 1, 0]), port(PORT.SHAFT, [0, -0.25, 0], [0, -1, 0], [0, 1, 0])]
  },
  {
    id: 'generator_dc', label: 'DC Generator', category: 'Motion', layer: 5, icon: '⚡', geo: cyl(0.30, 0.50, 16), defaultMat: 'COPPER', mass: 4.0, behavior: 'rotate', simProps: { voltsPerRpm: 0.05 },
    ports: [port(PORT.SHAFT, [0, 0.25, 0], [0, 1, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.25, 0.10], [0, -1, 0]), port(PORT.WIRE, [0, -0.25, -0.10], [0, -1, 0])]
  },
  {
    id: 'generator_ac', label: 'AC Alternator', category: 'Motion', layer: 5, icon: '〜', geo: cyl(0.32, 0.55, 16), defaultMat: 'COPPER', mass: 5.0, behavior: 'rotate', simProps: { hz: 60 },
    ports: [port(PORT.SHAFT, [0, 0.275, 0], [0, 1, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.275, 0.10], [0, -1, 0]), port(PORT.WIRE, [0, -0.275, -0.10], [0, -1, 0])]
  },
  {
    id: 'motor_servo', label: 'Servo Motor', category: 'Motion', layer: 5, icon: '⚙', geo: box(0.30, 0.40, 0.25), defaultMat: 'PLASTIC', mass: 0.30, behavior: 'rotate', simProps: { stallTorque: 1.5, signal: 'pwm' },
    ports: [port(PORT.SHAFT, [0, 0.20, 0], [0, 1, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.20, 0], [0, -1, 0])]
  },
  {
    id: 'motor_stepper', label: 'Stepper Motor', category: 'Motion', layer: 5, icon: '⏯', geo: cyl(0.22, 0.45, 16), defaultMat: 'STEEL', mass: 0.45, behavior: 'rotate', simProps: { steps: 200 },
    ports: [port(PORT.SHAFT, [0, 0.225, 0], [0, 1, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.225, 0.08], [0, -1, 0]), port(PORT.WIRE, [0, -0.225, -0.08], [0, -1, 0])]
  },
  {
    id: 'motor_dc_small', label: 'DC Motor (small)', category: 'Motion', layer: 5, icon: 'ⓜ', geo: cyl(0.10, 0.30, 12), defaultMat: 'STEEL', mass: 0.10, behavior: 'rotate',
    ports: [port(PORT.SHAFT, [0, 0.15, 0], [0, 1, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.15, 0.04], [0, -1, 0]), port(PORT.WIRE, [0, -0.15, -0.04], [0, -1, 0])]
  },
  {
    id: 'gyroscope', label: 'Gyroscope', category: 'Motion', layer: 5, icon: '⊕', geo: torus(0.30, 0.05, 16, 8), defaultMat: 'BRASS', mass: 0.50, behavior: 'rotate', simProps: { spinRate: 'high' },
    ports: [port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0])]
  },
  {
    id: 'belt_loop', label: 'Drive Belt', category: 'Motion', layer: 5, icon: '⟳', geo: torus(0.50, 0.03, 24, 6), defaultMat: 'RUBBER', mass: 0.20, behavior: 'flex',
    ports: [port(PORT.BELT, [0.50, 0, 0], [1, 0, 0]), port(PORT.BELT, [-0.50, 0, 0], [-1, 0, 0])]
  },
  {
    id: 'chain_drive', label: 'Roller Chain', category: 'Motion', layer: 5, icon: '⛓', geo: cyl(0.04, 1.0, 8), defaultMat: 'STEEL', mass: 0.30, behavior: 'flex',
    ports: [port(PORT.BELT, [0, 0.5, 0], [0, 1, 0]), port(PORT.BELT, [0, -0.5, 0], [0, -1, 0])]
  },
  {
    id: 'jackscrew', label: 'Jackscrew', category: 'Motion', layer: 5, icon: '🔧', geo: cyl(0.08, 0.80, 8), defaultMat: 'STEEL', mass: 1.0, behavior: 'slide', simProps: { lift: 0.6 },
    ports: [port(PORT.SHAFT, [0, 0.4, 0], [0, 1, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.4, 0], [0, -1, 0])]
  },

  // ════════════════════════════════════════════════
  // INSTRUMENTS — extended (Mind / layer 6)
  // ════════════════════════════════════════════════
  {
    id: 'gauge_temp', label: 'Temperature Gauge', category: 'Instruments', layer: 6, icon: '🌡', geo: cyl(0.25, 0.18, 16), defaultMat: 'STEEL', mass: 0.15, behavior: 'load', simProps: { range: '0-200C' },
    ports: [port(PORT.SNAP, [0, -0.09, 0], [0, -1, 0]), port(PORT.WIRE, [0, 0, -0.10], [0, 0, -1])]
  },
  {
    id: 'gauge_voltage', label: 'Voltmeter', category: 'Instruments', layer: 6, icon: '⚡', geo: box(0.30, 0.30, 0.10), defaultMat: 'PLASTIC', mass: 0.12, behavior: 'load', simProps: { range: '0-50V' },
    ports: [port(PORT.WIRE, [-0.10, -0.15, 0], [0, -1, 0]), port(PORT.WIRE, [0.10, -0.15, 0], [0, -1, 0])]
  },
  {
    id: 'gauge_current', label: 'Ammeter', category: 'Instruments', layer: 6, icon: 'A', geo: box(0.30, 0.30, 0.10), defaultMat: 'PLASTIC', mass: 0.12, behavior: 'load', simProps: { range: '0-10A' },
    ports: [port(PORT.WIRE, [-0.10, -0.15, 0], [0, -1, 0]), port(PORT.WIRE, [0.10, -0.15, 0], [0, -1, 0])]
  },
  {
    id: 'dial_rotary', label: 'Rotary Dial', category: 'Instruments', layer: 6, icon: '🎛', geo: cyl(0.20, 0.10, 16), defaultMat: 'PLASTIC', mass: 0.08, behavior: 'rotate', simProps: { positions: 12 },
    ports: [port(PORT.SNAP, [0, -0.05, 0], [0, -1, 0]), port(PORT.WIRE, [0, -0.05, 0.05], [0, -1, 0])]
  },
  {
    id: 'lcd_panel', label: 'LCD Panel', category: 'Instruments', layer: 6, icon: '🖵', geo: box(0.50, 0.30, 0.05), defaultMat: 'GLASS', mass: 0.10, behavior: 'load',
    ports: [port(PORT.WIRE, [0, -0.15, 0], [0, -1, 0]), port(PORT.SNAP, [0, 0, -0.025], [0, 0, -1])]
  },
  {
    id: 'sensor_proximity', label: 'Proximity Sensor', category: 'Instruments', layer: 6, icon: '◉', geo: cyl(0.08, 0.20, 12), defaultMat: 'PLASTIC', mass: 0.05, behavior: 'load', simProps: { range: 0.5 },
    ports: [port(PORT.WIRE, [0, -0.10, 0], [0, -1, 0])]
  },
  {
    id: 'sensor_pir', label: 'PIR Sensor', category: 'Instruments', layer: 6, icon: '👁', geo: cyl(0.12, 0.10, 12), defaultMat: 'PLASTIC', mass: 0.04, behavior: 'load', simProps: { detects: 'motion' },
    ports: [port(PORT.WIRE, [0, -0.05, 0], [0, -1, 0])]
  },
  {
    id: 'sensor_pressure_inline', label: 'Inline Pressure Sensor', category: 'Instruments', layer: 6, icon: '⊙', geo: cyl(0.10, 0.15, 12), defaultMat: 'STEEL', mass: 0.06, behavior: 'load',
    ports: [port(PORT.PIPE, [0, 0.075, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.075, 0], [0, -1, 0])]
  },
  {
    id: 'sensor_strain', label: 'Strain Gauge', category: 'Instruments', layer: 6, icon: '⌇', geo: box(0.10, 0.04, 0.06), defaultMat: 'COPPER', mass: 0.005, behavior: 'load',
    ports: [port(PORT.SNAP, [0, -0.02, 0], [0, -1, 0]), port(PORT.WIRE, [0.05, 0, 0], [1, 0, 0]), port(PORT.WIRE, [-0.05, 0, 0], [-1, 0, 0])]
  },
  {
    id: 'oscilloscope', label: 'Oscilloscope', category: 'Instruments', layer: 6, icon: '📈', geo: box(0.80, 0.50, 0.40), defaultMat: 'STEEL', mass: 4.0, behavior: 'load',
    ports: [port(PORT.WIRE, [-0.30, -0.25, 0], [0, -1, 0]), port(PORT.WIRE, [0.30, -0.25, 0], [0, -1, 0])]
  },
  {
    id: 'tachometer', label: 'Tachometer', category: 'Instruments', layer: 6, icon: '⏱', geo: cyl(0.25, 0.15, 16), defaultMat: 'STEEL', mass: 0.18, behavior: 'load', simProps: { range: '0-10000rpm' },
    ports: [port(PORT.SHAFT, [0, -0.075, 0], [0, -1, 0], [0, 1, 0]), port(PORT.WIRE, [0, 0, -0.075], [0, 0, -1])]
  },
  {
    id: 'compass', label: 'Compass', category: 'Instruments', layer: 6, icon: '🧭', geo: cyl(0.18, 0.06, 16), defaultMat: 'BRASS', mass: 0.10, behavior: 'load',
    ports: [port(PORT.SNAP, [0, -0.03, 0], [0, -1, 0])]
  },
  {
    id: 'flowmeter', label: 'Flow Meter', category: 'Instruments', layer: 6, icon: '∿', geo: cyl(0.15, 0.40, 12), defaultMat: 'BRASS', mass: 0.30, behavior: 'load',
    ports: [port(PORT.PIPE, [0, 0.20, 0], [0, 1, 0]), port(PORT.PIPE, [0, -0.20, 0], [0, -1, 0]), port(PORT.WIRE, [0.075, 0, 0], [1, 0, 0])]
  },

  // ════════════════════════════════════════════════
  // CONTAINERS — extended (Whole / layer 7)
  // ════════════════════════════════════════════════
  {
    id: 'beaker', label: 'Beaker', category: 'Containers', layer: 7, icon: '🧪', geo: cyl(0.15, 0.30, 16), defaultMat: 'GLASS', mass: 0.15, behavior: 'rigid', simProps: { volume: 0.5 },
    ports: [port(PORT.PIPE, [0, 0.15, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.15, 0], [0, -1, 0])]
  },
  {
    id: 'flask_erlen', label: 'Erlenmeyer Flask', category: 'Containers', layer: 7, icon: '⏶', geo: cylTapered(0.06, 0.18, 0.30, 16), defaultMat: 'GLASS', mass: 0.20, behavior: 'rigid', simProps: { volume: 0.5 },
    ports: [port(PORT.PIPE, [0, 0.15, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.15, 0], [0, -1, 0])]
  },
  {
    id: 'jerry_can', label: 'Jerry Can', category: 'Containers', layer: 7, icon: '⛽', geo: box(0.40, 0.50, 0.20), defaultMat: 'STEEL', mass: 5.0, behavior: 'rigid', simProps: { volume: 20 },
    ports: [port(PORT.PIPE, [0.10, 0.25, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.25, 0], [0, -1, 0])]
  },
  {
    id: 'tank_pressure', label: 'Pressure Tank', category: 'Containers', layer: 7, icon: '⊖', geo: cyl(0.50, 1.20, 16), defaultMat: 'STEEL', mass: 25.0, behavior: 'rigid', simProps: { volume: 100, maxPSI: 150 },
    ports: [port(PORT.PIPE, [0, 0.60, 0], [0, 1, 0]), port(PORT.PIPE, [0, -0.60, 0], [0, -1, 0])]
  },
  {
    id: 'reservoir', label: 'Reservoir', category: 'Containers', layer: 7, icon: '🏞', geo: box(3.0, 1.0, 3.0), defaultMat: 'CONCRETE', mass: 200.0, behavior: 'rigid', simProps: { volume: 9000 },
    ports: [port(PORT.PIPE, [-1.5, 0, 0], [-1, 0, 0]), port(PORT.PIPE, [1.5, 0, 0], [1, 0, 0])]
  },
  {
    id: 'jar_canning', label: 'Glass Jar', category: 'Containers', layer: 7, icon: '🫙', geo: cyl(0.10, 0.22, 12), defaultMat: 'GLASS', mass: 0.10, behavior: 'rigid', simProps: { volume: 0.7 },
    ports: [port(PORT.PIPE, [0, 0.11, 0], [0, 1, 0])]
  },
  {
    id: 'crate_wood', label: 'Wood Crate', category: 'Containers', layer: 7, icon: '📦', geo: box(1.0, 0.8, 1.0), defaultMat: 'WOOD_BOARD', mass: 4.0, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.40, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.40, 0], [0, -1, 0])]
  },

  // ════════════════════════════════════════════════
  // CHEMICALS — common mechanical fluids only (Spark/Whole)
  // ════════════════════════════════════════════════
  {
    id: 'fluid_water', label: 'Water (1L)', category: 'Chemicals', layer: 7, icon: '💧', geo: cyl(0.05, 0.10, 12), defaultMat: 'WATER', mass: 1.0, behavior: 'fluid', simProps: { type: 'water', viscosity: 1 },
    ports: [port(PORT.PIPE, [0, 0.05, 0], [0, 1, 0])]
  },
  {
    id: 'fluid_oil', label: 'Hydraulic Oil', category: 'Chemicals', layer: 7, icon: '🛢', geo: cyl(0.05, 0.10, 12), defaultMat: 'OIL', mass: 0.88, behavior: 'fluid', simProps: { type: 'oil', viscosity: 50 },
    ports: [port(PORT.PIPE, [0, 0.05, 0], [0, 1, 0])]
  },
  {
    id: 'fluid_alcohol', label: 'Isopropyl Alcohol', category: 'Chemicals', layer: 7, icon: '🥃', geo: cyl(0.05, 0.10, 12), defaultMat: 'ALCOHOL', mass: 0.79, behavior: 'fluid', simProps: { type: 'alcohol', flammable: true },
    ports: [port(PORT.PIPE, [0, 0.05, 0], [0, 1, 0])]
  },
  {
    id: 'fluid_glycol', label: 'Coolant (Glycol)', category: 'Chemicals', layer: 7, icon: '❄', geo: cyl(0.05, 0.10, 12), defaultMat: 'GLYCOL', mass: 1.11, behavior: 'fluid', simProps: { type: 'glycol' },
    ports: [port(PORT.PIPE, [0, 0.05, 0], [0, 1, 0])]
  },
  {
    id: 'fluid_grease', label: 'Bearing Grease', category: 'Chemicals', layer: 7, icon: '🧈', geo: cyl(0.05, 0.06, 12), defaultMat: 'GREASE', mass: 0.18, behavior: 'rigid', simProps: { type: 'grease' },
    ports: [port(PORT.SNAP, [0, 0.03, 0], [0, 1, 0])]
  },
  {
    id: 'fluid_air', label: 'Compressed Air', category: 'Chemicals', layer: 7, icon: '💨', geo: sphere(0.08), defaultMat: 'GLASS', mass: 0.01, behavior: 'fluid', simProps: { type: 'air', psi: 120 },
    ports: [port(PORT.PIPE, [0, -0.08, 0], [0, -1, 0])]
  },
  {
    id: 'fluid_solder', label: 'Solder (lead-free)', category: 'Chemicals', layer: 7, icon: '⛓', geo: cyl(0.01, 0.5, 8), defaultMat: 'SILVER', mass: 0.05, behavior: 'rigid', simProps: { meltTemp: 220 },
    ports: [port(PORT.SNAP, [0, 0.25, 0], [0, 1, 0])]
  },
  {
    id: 'fluid_paint', label: 'Paint Can', category: 'Chemicals', layer: 7, icon: '🎨', geo: cyl(0.12, 0.20, 16), defaultMat: 'STEEL', mass: 1.5, behavior: 'rigid', simProps: { color: '#ffffff', volume: 1 },
    ports: [port(PORT.SNAP, [0, 0.10, 0], [0, 1, 0])]
  },

  // ════════════════════════════════════════════════
  // SEALS & GASKETS (Relation / layer 3)
  // ════════════════════════════════════════════════
  {
    id: 'oring_small', label: 'O-Ring (small)', category: 'Seals', layer: 3, icon: '○', geo: torus(0.08, 0.012, 16, 6), defaultMat: 'RUBBER', mass: 0.005, behavior: 'flex', simProps: { id: 16, od: 20 },
    ports: [port(PORT.SNAP, [0, 0, 0], [0, 1, 0])]
  },
  {
    id: 'oring_large', label: 'O-Ring (large)', category: 'Seals', layer: 3, icon: '◯', geo: torus(0.20, 0.02, 24, 8), defaultMat: 'RUBBER', mass: 0.02, behavior: 'flex', simProps: { id: 40, od: 48 },
    ports: [port(PORT.SNAP, [0, 0, 0], [0, 1, 0])]
  },
  {
    id: 'gasket_flange', label: 'Flange Gasket', category: 'Seals', layer: 3, icon: '⊜', geo: torus(0.25, 0.015, 24, 6), defaultMat: 'FIBER', mass: 0.04, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0, 0], [0, 1, 0])]
  },
  {
    id: 'gasket_sheet', label: 'Gasket Sheet', category: 'Seals', layer: 3, icon: '▭', geo: box(0.30, 0.005, 0.30), defaultMat: 'SILICONE', mass: 0.03, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.0025, 0], [0, 1, 0])]
  },
  {
    id: 'seal_lip', label: 'Lip Seal', category: 'Seals', layer: 3, icon: '◉', geo: torus(0.18, 0.025, 16, 8), defaultMat: 'RUBBER', mass: 0.03, behavior: 'flex',
    ports: [port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0])]
  },
  {
    id: 'tape_teflon', label: 'PTFE Tape', category: 'Seals', layer: 3, icon: '🧻', geo: cyl(0.04, 0.02, 12), defaultMat: 'PLASTIC', mass: 0.005, behavior: 'flex',
    ports: [port(PORT.THREAD, [0, 0, 0], [0, 1, 0])]
  },

  // ════════════════════════════════════════════════
  // MISC — ropes, bearings, magnets, stakes (Relation/Form)
  // ════════════════════════════════════════════════
  {
    id: 'rope_short', label: 'Rope (1m)', category: 'Misc', layer: 3, icon: '🪢', geo: cyl(0.015, 1.0, 8), defaultMat: 'FIBER', mass: 0.05, behavior: 'flex', simProps: { tensile: 500 },
    ports: [port(PORT.ROPE, [0, 0.5, 0], [0, 1, 0]), port(PORT.ROPE, [0, -0.5, 0], [0, -1, 0])]
  },
  {
    id: 'rope_long', label: 'Rope (5m)', category: 'Misc', layer: 3, icon: '➰', geo: cyl(0.015, 5.0, 8), defaultMat: 'FIBER', mass: 0.25, behavior: 'flex', simProps: { tensile: 500 },
    ports: [port(PORT.ROPE, [0, 2.5, 0], [0, 1, 0]), port(PORT.ROPE, [0, -2.5, 0], [0, -1, 0])]
  },
  {
    id: 'string_thin', label: 'String', category: 'Misc', layer: 3, icon: '〰', geo: cyl(0.005, 1.0, 6), defaultMat: 'FIBER', mass: 0.005, behavior: 'flex', simProps: { tensile: 50 },
    ports: [port(PORT.ROPE, [0, 0.5, 0], [0, 1, 0]), port(PORT.ROPE, [0, -0.5, 0], [0, -1, 0])]
  },
  {
    id: 'cable_steel', label: 'Steel Cable', category: 'Misc', layer: 3, icon: '⛓', geo: cyl(0.012, 2.0, 8), defaultMat: 'STEEL', mass: 0.40, behavior: 'flex', simProps: { tensile: 5000 },
    ports: [port(PORT.ROPE, [0, 1, 0], [0, 1, 0]), port(PORT.ROPE, [0, -1, 0], [0, -1, 0])]
  },
  {
    id: 'bearing_ball', label: 'Ball Bearing', category: 'Misc', layer: 3, icon: '◎', geo: torus(0.12, 0.02, 16, 8), defaultMat: 'STEEL', mass: 0.08, behavior: 'rotate', simProps: { id: 20, od: 28 },
    ports: [port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0])]
  },
  {
    id: 'bearing_roller', label: 'Roller Bearing', category: 'Misc', layer: 3, icon: '⊙', geo: cyl(0.18, 0.10, 16), defaultMat: 'STEEL', mass: 0.20, behavior: 'rotate',
    ports: [port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0])]
  },
  {
    id: 'bearing_thrust', label: 'Thrust Bearing', category: 'Misc', layer: 3, icon: '⊚', geo: cyl(0.20, 0.04, 16), defaultMat: 'STEEL', mass: 0.15, behavior: 'rotate',
    ports: [port(PORT.SHAFT, [0, 0.02, 0], [0, 1, 0], [0, 1, 0]), port(PORT.SHAFT, [0, -0.02, 0], [0, -1, 0], [0, 1, 0])]
  },
  {
    id: 'magnet_neo', label: 'Neodymium Magnet', category: 'Misc', layer: 1, icon: '🧲', geo: cyl(0.04, 0.04, 12), defaultMat: 'STEEL', mass: 0.02, behavior: 'rigid', simProps: { fieldStrength: 'N52' },
    ports: [port(PORT.SNAP, [0, 0.02, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.02, 0], [0, -1, 0])]
  },
  {
    id: 'magnet_bar', label: 'Bar Magnet', category: 'Misc', layer: 1, icon: '🧲', geo: box(0.40, 0.06, 0.06), defaultMat: 'STEEL', mass: 0.15, behavior: 'rigid',
    ports: [port(PORT.SNAP, [-0.20, 0, 0], [-1, 0, 0]), port(PORT.SNAP, [0.20, 0, 0], [1, 0, 0])]
  },
  {
    id: 'stake_ground', label: 'Ground Stake', category: 'Misc', layer: 4, icon: '↓', geo: cyl(0.03, 0.40, 6), defaultMat: 'STEEL', mass: 0.20, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.20, 0], [0, 1, 0])]
  },
  {
    id: 'stake_tent', label: 'Tent Stake', category: 'Misc', layer: 4, icon: '⛺', geo: cyl(0.012, 0.20, 6), defaultMat: 'ALUMINUM', mass: 0.02, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.10, 0], [0, 1, 0]), port(PORT.ROPE, [0, 0.10, 0], [0, 1, 0])]
  },
  {
    id: 'fabric_sheet', label: 'Fabric Sheet', category: 'Misc', layer: 4, icon: '🟫', geo: box(2.0, 0.005, 2.0), defaultMat: 'FABRIC', mass: 0.30, behavior: 'flex',
    ports: [port(PORT.SNAP, [-1, 0, -1], [0, 1, 0]), port(PORT.SNAP, [1, 0, -1], [0, 1, 0]), port(PORT.SNAP, [-1, 0, 1], [0, 1, 0]), port(PORT.SNAP, [1, 0, 1], [0, 1, 0])]
  },
  {
    id: 'leather_strap', label: 'Leather Strap', category: 'Misc', layer: 4, icon: '➖', geo: box(0.04, 0.50, 0.005), defaultMat: 'LEATHER', mass: 0.05, behavior: 'flex',
    ports: [port(PORT.SNAP, [0, 0.25, 0], [0, 1, 0]), port(PORT.SNAP, [0, -0.25, 0], [0, -1, 0])]
  },
  {
    id: 'pet_chain', label: 'Pet Chain', category: 'Misc', layer: 3, icon: '🐕', geo: cyl(0.008, 1.5, 6), defaultMat: 'STEEL', mass: 0.10, behavior: 'flex',
    ports: [port(PORT.ROPE, [0, 0.75, 0], [0, 1, 0]), port(PORT.ROPE, [0, -0.75, 0], [0, -1, 0])]
  },

  // ════════════════════════════════════════════════
  // GEARS — extended (Life / layer 5)
  // ════════════════════════════════════════════════
  {
    id: 'gear_pinion', label: 'Pinion Gear', category: 'Gears', layer: 5, icon: '⚙', geo: cyl(0.15, 0.10, 16), defaultMat: 'STEEL', mass: 0.20, behavior: 'rotate', simProps: { teeth: 12, module: 0.10 },
    ports: [port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0]), port(PORT.GEAR, [0.15, 0, 0], [1, 0, 0])]
  },
  {
    id: 'gear_rack', label: 'Gear Rack', category: 'Gears', layer: 5, icon: '▤', geo: box(2.0, 0.10, 0.10), defaultMat: 'STEEL', mass: 1.5, behavior: 'translate', simProps: { teeth: 40, module: 0.05 },
    ports: [port(PORT.GEAR, [0, 0.05, 0], [0, 1, 0]), port(PORT.SLIDE, [-1.0, 0, 0], [-1, 0, 0]), port(PORT.SLIDE, [1.0, 0, 0], [1, 0, 0])]
  },
  {
    id: 'gear_worm', label: 'Worm Gear', category: 'Gears', layer: 5, icon: '🪱', geo: cyl(0.10, 0.50, 16), defaultMat: 'STEEL', mass: 0.40, behavior: 'rotate', simProps: { ratio: 30, selfLocking: true },
    ports: [port(PORT.SHAFT, [0, 0.25, 0], [0, 1, 0], [0, 1, 0]), port(PORT.SHAFT, [0, -0.25, 0], [0, -1, 0], [0, 1, 0]), port(PORT.GEAR, [0.10, 0, 0], [1, 0, 0])]
  },
  {
    id: 'gear_helical', label: 'Helical Gear', category: 'Gears', layer: 5, icon: '⚙', geo: cyl(0.40, 0.12, 24), defaultMat: 'STEEL', mass: 0.80, behavior: 'rotate', simProps: { teeth: 32, helixAngle: 20 },
    ports: [port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0]), port(PORT.GEAR, [0.40, 0, 0], [1, 0, 0])]
  },
  {
    id: 'gear_herringbone', label: 'Herringbone Gear', category: 'Gears', layer: 5, icon: '⚙', geo: cyl(0.40, 0.20, 24), defaultMat: 'STEEL', mass: 1.20, behavior: 'rotate', simProps: { teeth: 32, doubleHelix: true },
    ports: [port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0]), port(PORT.GEAR, [0.40, 0, 0], [1, 0, 0])]
  },
  {
    id: 'gear_planetary', label: 'Planetary Gearset', category: 'Gears', layer: 5, icon: '☉', geo: cyl(0.50, 0.15, 24), defaultMat: 'STEEL', mass: 2.0, behavior: 'rotate', simProps: { ratio: 5, planets: 3 },
    ports: [port(PORT.SHAFT, [0, 0.075, 0], [0, 1, 0], [0, 1, 0]), port(PORT.SHAFT, [0, -0.075, 0], [0, -1, 0], [0, 1, 0])]
  },
  {
    id: 'gearbox', label: 'Gearbox (3-speed)', category: 'Gears', layer: 5, icon: '🔲', geo: box(0.50, 0.40, 0.40), defaultMat: 'ALUMINUM', mass: 4.0, behavior: 'rotate', simProps: { ratios: [1, 2, 3] },
    ports: [port(PORT.SHAFT, [-0.25, 0, 0], [-1, 0, 0], [1, 0, 0]), port(PORT.SHAFT, [0.25, 0, 0], [1, 0, 0], [1, 0, 0])]
  },
  {
    id: 'sprocket_chain', label: 'Sprocket', category: 'Gears', layer: 5, icon: '✱', geo: cyl(0.25, 0.05, 20), defaultMat: 'STEEL', mass: 0.30, behavior: 'rotate', simProps: { teeth: 20 },
    ports: [port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0]), port(PORT.BELT, [0.25, 0, 0], [0, 1, 0])]
  },
  {
    id: 'ratchet', label: 'Ratchet & Pawl', category: 'Gears', layer: 5, icon: '⟲', geo: cyl(0.25, 0.10, 16), defaultMat: 'STEEL', mass: 0.35, behavior: 'rotate', simProps: { teeth: 16, oneWay: true },
    ports: [port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0])]
  },
  {
    id: 'differential', label: 'Differential', category: 'Gears', layer: 5, icon: '⊕', geo: sphere(0.30), defaultMat: 'STEEL', mass: 5.0, behavior: 'rotate', simProps: { ratio: 3.7 },
    ports: [port(PORT.SHAFT, [0, 0.30, 0], [0, 1, 0], [0, 1, 0]), port(PORT.SHAFT, [-0.30, 0, 0], [-1, 0, 0], [1, 0, 0]), port(PORT.SHAFT, [0.30, 0, 0], [1, 0, 0], [1, 0, 0])]
  },

  // ════════════════════════════════════════════════
  // WEIGHTS & COUNTERWEIGHTS (Form / layer 4)
  // ════════════════════════════════════════════════
  {
    id: 'weight_1kg', label: 'Weight 1 kg', category: 'Weights', layer: 4, icon: '🏋', geo: cyl(0.08, 0.06, 16), defaultMat: 'IRON', mass: 1.0, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.03, 0], [0, 1, 0]), port(PORT.ROPE, [0, 0.03, 0], [0, 1, 0])]
  },
  {
    id: 'weight_5kg', label: 'Weight 5 kg', category: 'Weights', layer: 4, icon: '🏋', geo: cyl(0.14, 0.10, 16), defaultMat: 'IRON', mass: 5.0, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.05, 0], [0, 1, 0]), port(PORT.ROPE, [0, 0.05, 0], [0, 1, 0])]
  },
  {
    id: 'weight_25kg', label: 'Weight 25 kg', category: 'Weights', layer: 4, icon: '🏋', geo: cyl(0.25, 0.15, 16), defaultMat: 'IRON', mass: 25.0, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.075, 0], [0, 1, 0]), port(PORT.ROPE, [0, 0.075, 0], [0, 1, 0])]
  },
  {
    id: 'counterweight_block', label: 'Counterweight Block', category: 'Weights', layer: 4, icon: '⬛', geo: box(0.40, 0.40, 0.40), defaultMat: 'CONCRETE', mass: 150.0, behavior: 'rigid',
    ports: [port(PORT.SNAP, [0, 0.20, 0], [0, 1, 0]), port(PORT.ROPE, [0, 0.20, 0], [0, 1, 0])]
  },
  {
    id: 'ballast_lead', label: 'Lead Ballast', category: 'Weights', layer: 4, icon: '◼', geo: box(0.30, 0.10, 0.20), defaultMat: 'IRON', mass: 60.0, behavior: 'rigid', simProps: { material: 'lead' },
    ports: [port(PORT.SNAP, [0, 0.05, 0], [0, 1, 0])]
  },
  {
    id: 'plumb_bob', label: 'Plumb Bob', category: 'Weights', layer: 4, icon: '⏷', geo: cylTapered(0, 0.06, 0.12, 12), defaultMat: 'BRASS', mass: 0.30, behavior: 'rigid',
    ports: [port(PORT.ROPE, [0, 0.06, 0], [0, 1, 0])]
  },
  {
    id: 'pendulum_bob', label: 'Pendulum Bob', category: 'Weights', layer: 4, icon: '⏱', geo: sphere(0.10), defaultMat: 'BRASS', mass: 1.5, behavior: 'rigid',
    ports: [port(PORT.ROPE, [0, 0.10, 0], [0, 1, 0])]
  },
  {
    id: 'flywheel_mass', label: 'Heavy Flywheel', category: 'Weights', layer: 4, icon: '⊙', geo: cyl(0.60, 0.20, 32), defaultMat: 'IRON', mass: 80.0, behavior: 'rotate', simProps: { momentOfInertia: 14.4 },
    ports: [port(PORT.SHAFT, [0, 0, 0], [0, 1, 0], [0, 1, 0])]
  },

  // ════════════════════════════════════════════════
  // PHALANGES — articulated finger/digit segments (Joints / layer 3)
  // proximal → middle → distal, plus knuckles, grippers, opposable thumb
  // ════════════════════════════════════════════════
  {
    id: 'phalanx_proximal', label: 'Proximal Phalanx', category: 'Phalanges', layer: 3, icon: '🦴', geo: cylTapered(0.045, 0.05, 0.30, 12), defaultMat: 'ALUMINUM', mass: 0.08, behavior: 'rotate', simProps: { segment: 'proximal', flexLimit: 90 },
    ports: [port(PORT.HINGE, [0, 0.15, 0], [0, 1, 0]), port(PORT.HINGE, [0, -0.15, 0], [0, -1, 0])]
  },
  {
    id: 'phalanx_middle', label: 'Middle Phalanx', category: 'Phalanges', layer: 3, icon: '🦴', geo: cylTapered(0.040, 0.045, 0.22, 12), defaultMat: 'ALUMINUM', mass: 0.05, behavior: 'rotate', simProps: { segment: 'middle', flexLimit: 110 },
    ports: [port(PORT.HINGE, [0, 0.11, 0], [0, 1, 0]), port(PORT.HINGE, [0, -0.11, 0], [0, -1, 0])]
  },
  {
    id: 'phalanx_distal', label: 'Distal Phalanx (tip)', category: 'Phalanges', layer: 3, icon: '☝', geo: cylTapered(0.025, 0.040, 0.18, 12), defaultMat: 'ALUMINUM', mass: 0.04, behavior: 'rotate', simProps: { segment: 'distal', flexLimit: 80, padded: true },
    ports: [port(PORT.HINGE, [0, -0.09, 0], [0, -1, 0]), port(PORT.SNAP, [0, 0.09, 0], [0, 1, 0])]
  },
  {
    id: 'knuckle_joint', label: 'Knuckle Joint', category: 'Phalanges', layer: 3, icon: '✊', geo: sphere(0.06), defaultMat: 'STEEL', mass: 0.04, behavior: 'rotate', simProps: { dof: 1, range: 100 },
    ports: [port(PORT.HINGE, [0, 0.06, 0], [0, 1, 0]), port(PORT.HINGE, [0, -0.06, 0], [0, -1, 0])]
  },
  {
    id: 'knuckle_universal', label: 'Universal Knuckle', category: 'Phalanges', layer: 3, icon: '✋', geo: sphere(0.07), defaultMat: 'STEEL', mass: 0.06, behavior: 'rotate', simProps: { dof: 2, pitch: 90, yaw: 60 },
    ports: [port(PORT.HINGE, [0, 0.07, 0], [0, 1, 0]), port(PORT.HINGE, [0, -0.07, 0], [0, -1, 0]), port(PORT.HINGE, [0.07, 0, 0], [1, 0, 0])]
  },
  {
    id: 'metacarpal', label: 'Metacarpal Base', category: 'Phalanges', layer: 3, icon: '✋', geo: box(0.30, 0.10, 0.18), defaultMat: 'ALUMINUM', mass: 0.20, behavior: 'rigid', simProps: { mounts: 4 },
    ports: [port(PORT.SNAP, [0, -0.05, 0], [0, -1, 0]), port(PORT.HINGE, [-0.10, 0.05, 0], [0, 1, 0]), port(PORT.HINGE, [-0.033, 0.05, 0], [0, 1, 0]), port(PORT.HINGE, [0.033, 0.05, 0], [0, 1, 0]), port(PORT.HINGE, [0.10, 0.05, 0], [0, 1, 0])]
  },
  {
    id: 'thumb_opposable', label: 'Opposable Thumb', category: 'Phalanges', layer: 3, icon: '👍', geo: cylTapered(0.030, 0.045, 0.22, 12), defaultMat: 'ALUMINUM', mass: 0.06, behavior: 'rotate', simProps: { rotaxis: 'opposable', range: 120 },
    ports: [port(PORT.BALL, [0, -0.11, 0], [0, -1, 0]), port(PORT.HINGE, [0, 0.11, 0], [0, 1, 0])]
  },
  {
    id: 'fingertip_pad', label: 'Fingertip Pad', category: 'Phalanges', layer: 3, icon: '◉', geo: sphere(0.025), defaultMat: 'SILICONE', mass: 0.005, behavior: 'flex', simProps: { tactile: true, friction: 0.95 },
    ports: [port(PORT.SNAP, [0, -0.025, 0], [0, -1, 0])]
  },
  {
    id: 'tendon_cable', label: 'Tendon Cable', category: 'Phalanges', layer: 3, icon: '⌇', geo: cyl(0.004, 0.40, 6), defaultMat: 'STEEL', mass: 0.01, behavior: 'flex', simProps: { actuates: 'flexion', tensile: 200 },
    ports: [port(PORT.ROPE, [0, 0.20, 0], [0, 1, 0]), port(PORT.ROPE, [0, -0.20, 0], [0, -1, 0])]
  },
  {
    id: 'gripper_2finger', label: 'Parallel Gripper (2-finger)', category: 'Phalanges', layer: 7, icon: '🤏', geo: box(0.20, 0.18, 0.10), defaultMat: 'ALUMINUM', mass: 0.30, behavior: 'slide', simProps: { fingers: 2, stroke: 0.08, force: 50 },
    ports: [port(PORT.SNAP, [0, 0.09, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.09, 0], [0, -1, 0])]
  },
  {
    id: 'gripper_3finger', label: '3-Finger Gripper', category: 'Phalanges', layer: 7, icon: '🖐', geo: cyl(0.12, 0.18, 12), defaultMat: 'ALUMINUM', mass: 0.45, behavior: 'rotate', simProps: { fingers: 3, adaptive: true },
    ports: [port(PORT.SNAP, [0, 0.09, 0], [0, 1, 0]), port(PORT.WIRE, [0, -0.09, 0], [0, -1, 0])]
  },
  {
    id: 'hand_robotic', label: 'Robotic Hand (5-finger)', category: 'Phalanges', layer: 7, icon: '🦾', geo: box(0.22, 0.22, 0.10), defaultMat: 'ALUMINUM', mass: 0.80, behavior: 'rotate', simProps: { fingers: 5, dof: 16 },
    ports: [port(PORT.SNAP, [0, -0.11, 0], [0, -1, 0]), port(PORT.WIRE, [-0.05, -0.11, 0], [0, -1, 0]), port(PORT.WIRE, [0.05, -0.11, 0], [0, -1, 0])]
  },
  {
    id: 'claw_industrial', label: 'Industrial Claw', category: 'Phalanges', layer: 7, icon: '🦞', geo: box(0.40, 0.30, 0.20), defaultMat: 'STEEL', mass: 3.0, behavior: 'rotate', simProps: { tines: 2, openAngle: 90, holdForce: 500 },
    ports: [port(PORT.SNAP, [0, 0.15, 0], [0, 1, 0]), port(PORT.PIPE, [0, 0.15, 0.05], [0, 1, 0])]
  },
];

// Quick lookup
export const PART_MAP = Object.fromEntries(PARTS.map(p => [p.id, p]));

// Category grouping
export const CATEGORIES = [...new Set(PARTS.map(p => p.category))];

// DP layer names
export const LAYER_NAMES = ['', 'Spark', 'Mirror', 'Relation', 'Form', 'Life', 'Mind', 'Whole'];
