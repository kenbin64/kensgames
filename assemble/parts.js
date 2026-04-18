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
];

// Quick lookup
export const PART_MAP = Object.fromEntries(PARTS.map(p => [p.id, p]));

// Category grouping
export const CATEGORIES = [...new Set(PARTS.map(p => p.category))];

// DP layer names
export const LAYER_NAMES = ['', 'Spark', 'Mirror', 'Relation', 'Form', 'Life', 'Mind', 'Whole'];
