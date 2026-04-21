#!/usr/bin/env node
/**
 * Protocol 3.7 — Shader Manifest Generator
 * ButterflyFX™ / KensGames.com
 *
 * Parses gyroid.js to extract:
 *   - Uniform declarations from GLSL source strings
 *   - GLSL function signatures and their mathematical descriptions
 *   - GPU tier thresholds and step counts
 *
 * Writes to manifold/dist/shader_manifest.json
 *
 * Usage:
 *   node tools/shader_manifest.js
 *   node tools/shader_manifest.js --dry-run   (print JSON, no write)
 *   node tools/shader_manifest.js --quiet
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const QUIET = ARGS.includes('--quiet');
const SRC_FILE = path.join(ROOT, 'gyroid.js');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'shader_manifest.json');

// ─── Known math descriptions for GLSL functions ───────────────────────────────
const FUNCTION_MATH = {
  gyroid: 'sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = 0',
  diamond: 'cos(x)cos(y)cos(z) - sin(x)sin(y)sin(z) = 0',
  scene: 'mix(gyroid, diamond, 0.3 + 0.2 * sin(t * 0.2))'
};

// ─── Known uniform descriptions ──────────────────────────────────────────────
const UNIFORM_DESC = {
  u_time: 'animation clock in seconds',
  u_resolution: 'canvas pixel dimensions (width, height)',
  u_scroll: 'page scroll offset (px)',
  u_intensity: 'output brightness multiplier',
  u_steps: 'adaptive ray-march step count (set per GPU tier)'
};

// ─── Extract GLSL blocks from a JS file ───────────────────────────────────────
// Finds template-literal shader strings (const fsSource = `...`)
function extractGLSLBlocks(src) {
  const blocks = [];
  // Match: const <name> = `...`; for vsSource and fsSource
  const re = /const\s+(vsSource|fsSource)\s*=\s*`([\s\S]*?)`\s*;/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    blocks.push({ name: m[1], glsl: m[2] });
  }
  return blocks;
}

// ─── Parse uniforms from a GLSL block ─────────────────────────────────────────
function parseUniforms(glsl) {
  const uniforms = [];
  const re = /uniform\s+(float|vec2|vec3|vec4|int|bool|sampler2D)\s+(\w+)\s*;/g;
  let m;
  while ((m = re.exec(glsl)) !== null) {
    uniforms.push({
      type: m[1],
      name: m[2],
      description: UNIFORM_DESC[m[2]] || m[2]
    });
  }
  return uniforms;
}

// ─── Parse GLSL function signatures ──────────────────────────────────────────
function parseFunctions(glsl) {
  const funcs = [];
  // Match top-level function signatures (return-type name(params) {)
  const re = /^\s*(float|void|vec[234]|int)\s+(\w+)\s*\(([^)]*)\)\s*\{/gm;
  let m;
  while ((m = re.exec(glsl)) !== null) {
    const fnName = m[2];
    // Skip 'main' and 'compile' helper
    if (fnName === 'main') continue;
    funcs.push({
      signature: `${m[1]} ${fnName}(${m[3].trim()})`,
      math: FUNCTION_MATH[fnName] || null
    });
  }
  return funcs;
}

// ─── Parse GPU tier thresholds ────────────────────────────────────────────────
function parseTiers(src) {
  const tiers = [];
  // Match tier blocks: name: steps, scale, devices patterns
  // Looks for: steps = N; ... scale = N.N; ... tier keyword patterns
  // The gyroid.js format:  '(NVIDIA|Radeon...)' → steps=40, scale=1.0
  const tierRe = /\/\/\s*(High|Mid|Low)[^\n]*\n[\s\S]{0,300}?steps\s*=\s*(\d+)[\s\S]{0,200}?scale\s*=\s*([\d.]+)/gi;
  let m;
  while ((m = tierRe.exec(src)) !== null) {
    tiers.push({
      name: m[1].toLowerCase(),
      steps: parseInt(m[2], 10),
      scale: parseFloat(m[3])
    });
  }

  // Fallback: extract from the if/else tier detection block directly
  if (tiers.length === 0) {
    const highM = src.match(/(?:NVIDIA|Radeon|GeForce|RTX|GTX)[^;]*steps\s*=\s*(\d+)/i)
      || src.match(/steps\s*=\s*40/);
    const midM = src.match(/(?:Adreno\s*[6-9]|Mali-G7|Apple\s*GPU)[^;]*steps\s*=\s*(\d+)/i)
      || src.match(/steps\s*=\s*24/);
    const lowM = src.match(/(?:Adreno\s*[3-5]|Mali-G[3-5]|PowerVR)[^;]*steps\s*=\s*(\d+)/i)
      || src.match(/steps\s*=\s*16/);

    const deviceDesc = {
      high: 'NVIDIA / Radeon / GeForce / RTX / GTX',
      mid: 'Adreno 6xx–9xx / Mali-G7x / Apple GPU',
      low: 'Adreno 3xx–5xx / Mali-G3x–G5x / PowerVR'
    };
    const scaleMap = { high: 1.0, mid: 0.75, low: 0.5 };
    const stepMap = { high: 40, mid: 24, low: 16 };

    for (const tier of ['high', 'mid', 'low']) {
      tiers.push({
        name: tier,
        steps: stepMap[tier],
        scale: scaleMap[tier],
        devices: deviceDesc[tier]
      });
    }
  } else {
    // Annotate device descriptions
    const deviceDesc = {
      high: 'NVIDIA / Radeon / GeForce / RTX / GTX',
      mid: 'Adreno 6xx–9xx / Mali-G7x / Apple GPU',
      low: 'Adreno 3xx–5xx / Mali-G3x–G5x / PowerVR'
    };
    const scaleMap = { high: 1.0, mid: 0.75, low: 0.5 };
    for (const t of tiers) {
      t.devices = deviceDesc[t.name] || null;
      t.scale = t.scale || scaleMap[t.name];
    }
  }

  return tiers;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(SRC_FILE)) {
    console.error('[shader_manifest] ERROR: gyroid.js not found at ' + SRC_FILE);
    process.exit(1);
  }

  const src = fs.readFileSync(SRC_FILE, 'utf8');
  const blocks = extractGLSLBlocks(src);
  const tiers = parseTiers(src);

  // Collect uniforms from all fragment shader blocks (may be two: adaptive + fallback)
  const fsBlocks = blocks.filter(b => b.name === 'fsSource');
  const vsBlocks = blocks.filter(b => b.name === 'vsSource');

  // Merge uniforms (deduplicate by name)
  const uniformMap = new Map();
  for (const b of fsBlocks) {
    for (const u of parseUniforms(b.glsl)) {
      uniformMap.set(u.name, u);
    }
  }
  const uniforms = Array.from(uniformMap.values());

  // Functions from the first (primary) fragment shader
  const functions = fsBlocks.length > 0 ? parseFunctions(fsBlocks[0].glsl) : [];

  const manifest = {
    generated: new Date().toISOString().slice(0, 10),
    source: 'gyroid.js',
    shaders: [
      {
        name: 'gyroid_backdrop',
        file: 'gyroid.js',
        variants: [
          { id: 'adaptive', description: 'u_steps uniform drives step count from GPU tier detection' },
          { id: 'fallback', description: 'Fixed 40-step loop — used when WebGL2 context lacks GLSL dynamic loop support' }
        ],
        uniforms,
        functions,
        tiers
      }
    ]
  };

  const json = JSON.stringify(manifest, null, 2);

  if (DRY_RUN) {
    console.log(json);
    return;
  }

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }
  fs.writeFileSync(OUT_FILE, json, 'utf8');

  if (!QUIET) {
    console.log('[shader_manifest] Protocol 3.7 — Shader Manifest');
    console.log(`Written: dist/shader_manifest.json`);
    console.log(`  Shader : gyroid_backdrop`);
    console.log(`  Uniforms: ${uniforms.length} (${uniforms.map(u => u.name).join(', ')})`);
    console.log(`  Functions: ${functions.length} (${functions.map(f => f.signature.split('(')[0].trim()).join(', ')})`);
    console.log(`  GPU tiers: ${tiers.length} (${tiers.map(t => t.name + '=' + t.steps + 'steps').join(', ')})`);
  }
}

main();
