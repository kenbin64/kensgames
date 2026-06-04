'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const NAME = 'tools';

// Node-loadable unified manifold core (CommonJS exported at bottom of manifold.js)
const Manifold = require('../../../js/manifold.js');

// Keep deterministic “geometry mapping” stable across restarts.
const GEOM_RANGE = 12; // maps payload-derived value into [-GEOM_RANGE, +GEOM_RANGE]

function b64ToBuf(b64) {
  return Buffer.from(String(b64 || ''), 'base64');
}

function bufToB64(buf) {
  return Buffer.from(buf).toString('base64');
}

function clampInt(n, fallback) {
  const x = parseInt(n, 10);
  return Number.isFinite(x) ? x : fallback;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest();
}

function u8ToSigned(v, range) {
  // Map [0..255] → [-range..+range]
  return ((v / 255) * 2 - 1) * range;
}

// ── Staging + commit semantics ──────────────────────────────────────────────
// Writes are allowed without approval (go to stage). Canonical code updates
// happen only on commit after you approve (commit: true).
const DEFAULT_STAGE_DIR = process.env.TOOLS_STAGE_DIR || '/tmp/ai-tools-stage';
const DEFAULT_CANON_DIR = process.env.TOOLS_CANON_DIR || process.cwd(); // repo root-ish

function getStageRoot(tool) {
  const configured = (tool && tool.stage_root) ? String(tool.stage_root) : DEFAULT_STAGE_DIR;
  return configured;
}

function getCanonRoot(tool) {
  const configured = (tool && tool.canon_root) ? String(tool.canon_root) : DEFAULT_CANON_DIR;
  return configured;
}

function normalizeRelativePath(p) {
  const s = String(p || '').replace(/\\/g, '/').trim();
  if (!s) throw new Error('tools: missing path');
  // Disallow absolute paths and traversal.
  if (path.isAbsolute(s)) throw new Error('tools: absolute paths are not allowed');
  const normalized = path.posix.normalize(s);
  if (normalized.startsWith('../') || normalized === '..' || normalized.includes('/../')) {
    throw new Error('tools: path traversal is not allowed');
  }
  return normalized;
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function hashBuf(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function listStageFiles(stageRoot) {
  const out = [];

  function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else out.push(path.relative(stageRoot, full).split(path.sep).join('/'));
    }
  }

  walk(stageRoot);
  return out.sort();
}

// ── PointDomain-like manifold inner constants ───────────────────────────────
function makeBridgeRegion() {
  const out = [];
  for (let i = 1; i < 100; i++) out.push((100 - i) / 100);
  return out;
}

function makeComplexPlane() {
  const out = [];
  for (let y = -10; y <= 10; y++) out.push({ re: 1, im: y / 10 });
  return out;
}

function describe() {
  return { id: NAME, model: null, transport: 'inproc' };
}

// Define lenses once. Lenses are pure extraction functions over manifold geometry.
// AI should consume *these* outputs, not infer geometry from strings.
const LENSEL_IDS = Object.freeze({
  surface_blend: 'extract.surface.blend',
  surface_m: 'extract.surface.m',
  surface_gyroid: 'extract.surface.gyroid',
  surface_diamond: 'extract.surface.diamond',
  color_hsl: 'extract.color.hsl',
  potential_token: 'extract.potential.token',
  complex_plane_projection: 'extract.complex_plane',
});

let lensesDefined = false;
function ensureLensesDefined() {
  if (lensesDefined) return;
  lensesDefined = true;

  Manifold.lens(LENSEL_IDS.surface_blend, (_x, _y, _z, entity) => entity?.surface?.blend ?? null);
  Manifold.lens(LENSEL_IDS.surface_m, (_x, _y, _z, entity) => entity?.surface?.m ?? null);
  Manifold.lens(LENSEL_IDS.surface_gyroid, (_x, _y, _z, entity) => entity?.surface?.gyroid ?? null);
  Manifold.lens(LENSEL_IDS.surface_diamond, (_x, _y, _z, entity) => entity?.surface?.diamond ?? null);

  Manifold.lens(LENSEL_IDS.color_hsl, (_x, _y, _z, entity) => entity?.color ?? null);
  Manifold.lens(LENSEL_IDS.potential_token, (_x, _y, _z, entity) => entity?.token ?? null);
  Manifold.lens(LENSEL_IDS.complex_plane_projection, (_x, _y, _z, _entity) => makeComplexPlane());
}

/**
 * Tool request:
 *   {
 *     type: 'pointdomain_roundtrip_bytes',
 *     payload_b64: '...',
 *     compression: true|false,
 *     compression_level: 1..9,
 *     commit: boolean (ignored for this read-only tool)
 *   }
 */
function pointdomainRoundtripBytes(tool) {
  const payloadB64 = tool && tool.payload_b64;
  if (!payloadB64) throw new Error('tools: pointdomain_roundtrip_bytes requires payload_b64');

  const payload = b64ToBuf(payloadB64);

  const compression = !!(tool && tool.compression);
  const compressionLevel = clampInt(tool && tool.compression_level, 9);

  const bridge_region = makeBridgeRegion();
  const complex_plane = makeComplexPlane();

  let compressed = null;
  let expanded;

  if (compression) {
    const deflated = zlib.deflateSync(payload, { level: compressionLevel });
    compressed = deflated;
    expanded = zlib.inflateSync(deflated);
  } else {
    expanded = payload;
  }

  const lossless = Buffer.compare(expanded, payload) === 0;

  // Geometry mapping:
  // derive deterministic (x,y) from payload hash so geometry “points to” the bytes.
  const digest = sha256(payload);
  const x = u8ToSigned(digest[0], GEOM_RANGE);
  const y = u8ToSigned(digest[1], GEOM_RANGE);

  ensureLensesDefined();

  const geometry = Manifold.ingest(
    { x, y, id: 'pointdomain-bytes' },
    { x: 'x', y: 'y', id: 'pointdomain-bytes', label: 'pointdomain_bytes_geometry' }
  );

  const lens_outputs = {
    surface_blend: Manifold.project(LENSEL_IDS.surface_blend, geometry),
    surface_m: Manifold.project(LENSEL_IDS.surface_m, geometry),
    surface_gyroid: Manifold.project(LENSEL_IDS.surface_gyroid, geometry),
    surface_diamond: Manifold.project(LENSEL_IDS.surface_diamond, geometry),
    color_hsl: Manifold.project(LENSEL_IDS.color_hsl, geometry),
    potential_token: Manifold.project(LENSEL_IDS.potential_token, geometry),
    complex_plane: Manifold.project(LENSEL_IDS.complex_plane_projection, geometry),
  };

  return {
    tool: 'pointdomain_roundtrip_bytes',
    lossless,

    payload_len: payload.length,
    expanded_len: expanded.length,
    compressed_len: compressed ? compressed.length : null,
    compression: compression,
    compression_level: compression ? compressionLevel : null,

    geometry: {
      id: geometry.id,
      label: geometry.label,
      manifold: geometry.manifold,      // { x, y, z }
      position3d: geometry.position3d, // { x, y, z }
      surface: geometry.surface,        // { gyroid, diamond, blend, m }
      color: geometry.color,            // 'hsl(...)'
      token: geometry.token,            // potential
    },

    lenses: lens_outputs,

    point: {
      real_axis: 1.0,
      imag_axis: { re: 0, im: 1 },
      complex_plane,
      bridge_region,
      inner_dimension: {
        axis_vector: { re: 0, im: 1 },
        orientation_radians: Math.PI / 2,
        unit_normal: [0, 1],
      },
      inner_space_layers_count: bridge_region.length,
    },

    // Read-only tool: no staging/commit.
    approval: {
      requires_approval: false,
      approved: true,
      change_plan: { would_apply: false, reason: 'read-only tool' },
      ui: {
        approve: { label: 'Approve & commit', action: 'not_needed' },
        unapprove: { label: 'Unapprove / reject', action: 'not_needed' },
        hold: { label: 'Hold (no commit)', action: 'not_needed' },
      },
    },

    expanded_payload_b64: bufToB64(expanded),
    compressed_payload_b64: compressed ? bufToB64(compressed) : null,
  };
}

// ── Stage tools (write allowed without approval) ─────────────────────────────
function stageFileWrite(tool) {
  const payloadB64 = tool && tool.content_b64;
  if (!payloadB64) throw new Error('tools: stage_file_write requires content_b64');
  const relativePath = normalizeRelativePath(tool.path);

  const stageRoot = getStageRoot(tool);
  const canonRoot = getCanonRoot(tool);

  const content = b64ToBuf(payloadB64);
  const stageFile = path.join(stageRoot, relativePath);

  ensureDirForFile(stageFile);
  fs.writeFileSync(stageFile, content);

  const info = {
    staged: true,
    stage_root: stageRoot,
    canon_root: canonRoot,
    relative_path: relativePath,
    bytes: content.length,
    sha256_hex: hashBuf(content),
  };

  return {
    tool: 'stage_file_write',
    approval: {
      // You explicitly said: can write without approval, but not commit.
      requires_approval: false,
      approved: true,
      change_plan: {
        // Stage write does not update canonical code.
        would_apply: false,
        reason: 'staged write only (no canonical update until commit tool)',
      },
      ui: {
        approve: { label: 'Approve & commit (use commit_staged_changes)', action: 'next_call:commit_staged_changes' },
        unapprove: { label: 'Unapprove / reject (use discard_staged_changes)', action: 'next_call:discard_staged_changes' },
        hold: { label: 'Hold (keep stage)', action: 'next_call:none' },
      },
    },
    staged_file: info,
  };
}

function discardStagedChanges(tool) {
  const stageRoot = getStageRoot(tool);
  const canonRoot = getCanonRoot(tool);

  // Delete all files under stageRoot (best-effort)
  function rmrf(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) rmrf(full);
      else {
        try { fs.unlinkSync(full); } catch { /* ignore */ }
      }
    }
    try { fs.rmdirSync(dir); } catch { /* ignore */ }
  }

  rmrf(stageRoot);

  return {
    tool: 'discard_staged_changes',
    approval: {
      requires_approval: false,
      approved: true,
      change_plan: { would_apply: false, reason: 'stage discarded; canonical unchanged' },
      ui: {
        approve: { label: 'Approve & commit', action: 'next_call:commit_staged_changes' },
        unapprove: { label: 'Unapprove / reject', action: 'not_needed' },
        hold: { label: 'Hold (no commit)', action: 'not_needed' },
      },
    },
    stage_root: stageRoot,
    canon_root: canonRoot,
  };
}

function commitStagedChanges(tool) {
  const stageRoot = getStageRoot(tool);
  const canonRoot = getCanonRoot(tool);
  const commit = tool && tool.commit === true;

  const stagedFiles = listStageFiles(stageRoot);

  // Hard gate: canonical code update only on approval
  const requiresApproval = !commit;

  if (requiresApproval) {
    return {
      tool: 'commit_staged_changes',
      approval: {
        requires_approval: true,
        approved: false,
        change_plan: {
          would_apply: false,
          reason: 'approval required: set commit=true to apply staged files to canonical code',
        },
        ui: {
          approve: { label: 'Approve & commit', action: 'call_again_with_commit=true' },
          unapprove: { label: 'Unapprove / reject', action: 'next_call:discard_staged_changes' },
          hold: { label: 'Hold (no commit)', action: 'do_not_commit' },
        },
        next_call_payload_template: {
          tool: {
            type: 'commit_staged_changes',
            stage_root: tool.stage_root,
            canon_root: tool.canon_root,
            commit: true,
          },
        },
      },
      stage_root: stageRoot,
      canon_root: canonRoot,
      staged_files_count: stagedFiles.length,
      applied: [],
    };
  }

  // Apply
  const applied = [];
  for (const rel of stagedFiles) {
    const stageFile = path.join(stageRoot, rel);
    const canonFile = path.join(canonRoot, rel);
    const content = fs.readFileSync(stageFile);
    ensureDirForFile(canonFile);
    fs.writeFileSync(canonFile, content);

    applied.push({
      relative_path: rel,
      bytes: content.length,
      sha256_hex: hashBuf(content),
    });
  }

  // Optionally wipe stage after successful commit:
  // (This is safer than leaving staging and accidentally re-committing.)
  discardStagedChanges(tool);

  return {
    tool: 'commit_staged_changes',
    approval: {
      requires_approval: false,
      approved: true,
      change_plan: { would_apply: true, reason: 'staged files applied to canonical code' },
      ui: {
        approve: { label: 'Approved', action: 'done' },
        unapprove: { label: 'Unapprove', action: 'not_supported_after_commit' },
        hold: { label: 'Hold', action: 'done' },
      },
    },
    stage_root: stageRoot,
    canon_root: canonRoot,
    staged_files_count: stagedFiles.length,
    applied,
  };
}

function resolveTool(tool) {
  const type = tool && tool.type;
  if (!type) throw new Error('tools: missing tool.type');
  if (type === 'pointdomain_roundtrip_bytes') return pointdomainRoundtripBytes(tool);
  if (type === 'stage_file_write') return stageFileWrite(tool);
  if (type === 'discard_staged_changes') return discardStagedChanges(tool);
  if (type === 'commit_staged_changes') return commitStagedChanges(tool);
  throw new Error('tools: unsupported tool type ' + type);
}

const handlers = {
  async facilitator(input) {
    const tool = input && input.tool;
    if (!tool) {
      return {
        answer: 'tools: facilitator received no tool request',
        suggestions: ['Provide input.tool.type'],
      };
    }

    const result = resolveTool(tool);
    return {
      answer: 'tools: executed ' + result.tool,
      suggestions: ['Send another tool request'],
      tool_result: result,
    };
  },

  async gamekeeper(input) {
    const tool = input && input.tool;
    if (!tool) {
      return {
        ruling: 'tools: gamekeeper received no tool request',
        citations: [],
      };
    }

    const result = resolveTool(tool);
    return {
      ruling: 'tools: executed ' + result.tool,
      citations: [{ tool: result.tool }],
      tool_result: result,
    };
  },

  // Other roles: safe stub
  async host() {
    return { decisions: { tools_enabled: true } };
  },
  async logger() {
    return { summary: 'tools provider logger stub', highlights: [] };
  },
  async player() {
    return { move: null, reasoning: 'tools provider: player stub' };
  },
  async curator() {
    return { variant: { _tools: true } };
  },
  async performance() {
    return { tier: 'tools', notes: 'tools provider inproc execution (stage + commit)' };
  },
};

async function invoke(roleId, input) {
  const fn = handlers[roleId];
  if (!fn) throw new Error('tools provider: unsupported role ' + roleId);

  const result = await fn(input || {});
  return {
    result,
    usage: { inputTokens: 0, outputTokens: 0 },
    provider: describe(),
  };
}

module.exports = { name: NAME, describe, invoke };
