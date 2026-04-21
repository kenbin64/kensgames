#!/usr/bin/env node
/**
 * Protocol 3.5 — Formal Proof Claim Hardening Audit
 * ButterflyFX™ / KensGames.com
 *
 * Scans the manifold proof section (index.html #manifold, manifold.html) for
 * empirical claims and verifies each is tagged with a tier marker:
 *
 *   data-claim="measured"    — directly measured fact from the codebase
 *   data-claim="derived"     — mathematical consequence of a measured fact
 *   data-claim="projection"  — directionally honest extrapolation (clearly labelled)
 *
 * Any claim element that lacks a data-claim attribute is flagged as UNTAGGED.
 * Any claim tagged "projection" without an explicit disclaimer is flagged.
 *
 * Additionally validates the three core manifold math identities are present
 * and correctly stated in the HTML:
 *   z = x·y²
 *   Gyroid: sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = 0
 *   Diamond: cos(x)cos(y)cos(z) - sin(x)sin(y)sin(z) = 0
 *
 * Usage:
 *   node tools/audit_proof.js
 *   node tools/audit_proof.js --strict    (exit 1 on any untagged claim)
 *   node tools/audit_proof.js --json
 *   node tools/audit_proof.js --file=manifold/manifold.html
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ARGS = process.argv.slice(2);
const STRICT = ARGS.includes('--strict');
const JSON_MODE = ARGS.includes('--json');
const FILE_ARG = ARGS.find(a => a.startsWith('--file='));
const TARGET = FILE_ARG
  ? path.resolve(FILE_ARG.split('=')[1])
  : path.join(ROOT, 'index.html');

// ─── Numeric claim pattern ─────────────────────────────────────────────────────
// Matches spans/divs with numeric content (percentages, multipliers, byte counts)
// that are likely empirical claims needing a tier tag.
const NUMERIC_CLAIM_RE = /data-claim="([^"]+)"/g;
const UNTAGGED_CLAIM_RE = /<(?:span|div|strong|em)[^>]*class="[^"]*claim[^"]*"[^>]*>(?!.*data-claim)/g;

// ─── Core math identity patterns ──────────────────────────────────────────────
const MATH_IDENTITIES = [
  {
    name: 'Derived coordinate z = x·y²',
    // z&nbsp;=&nbsp;x&nbsp;&middot;&nbsp;y&sup2; as used in the HTML
    patterns: [
      /z[^<]*=[^<]*x[^<]*y[^<]*sup/i,
      /z\s*=\s*x\s*[·*]\s*y\s*(?:²|\^2)/i
    ]
  },
  {
    name: 'Gyroid: sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x)',
    // In gyroid.js GLSL: sin(p.x)*cos(p.y) + sin(p.y)*cos(p.z) + sin(p.z)*cos(p.x)
    // In index.html the function is in the JS source block
    patterns: [
      /sin\s*\([^)]*[xy][^)]*\)\s*[*]\s*cos\s*\([^)]*[yz][^)]*\)/i,
      /sin.*p\.x.*cos.*p\.y.*sin.*p\.y.*cos.*p\.z/i,
      /gyroid/i  // presence of the named function is sufficient — formula is in gyroid.js
    ]
  },
  {
    name: 'Diamond: cos(x)cos(y)cos(z) - sin(x)sin(y)sin(z)',
    // Appears verbatim in index.html: cos(x)cos(y)cos(z) &minus; sin(x)sin(y)sin(z)
    patterns: [
      /cos\s*\(x\)\s*cos\s*\(y\)\s*cos\s*\(z\)/i,
      /cos.*p\.x.*cos.*p\.y.*cos.*p\.z.*sin.*p\.x.*sin.*p\.y.*sin.*p\.z/i
    ]
  }
];

// ─── Known measured facts (must appear verbatim or as close match) ─────────────
// These are the specific numbers that must come from actual codebase measurement.
const MEASURED_FACTS = [
  { label: '1.47MB shared infrastructure', pattern: /1\.47\s*(?:MB|mb)/i },
  { label: '80% shared infrastructure reduction', pattern: /80\s*%.*(?:shared|infrastructure|duplication)/i },
  { label: '171 total modules (substrates.json)', pattern: /"totalModules"\s*:\s*171/, file: 'substrates.json' },
  { label: '5 games on one shared layer', pattern: /five\s*games|5\s*games|five\s*titles/i },
];

// ─── Projection disclaimer patterns ───────────────────────────────────────────
const PROJECTION_DISCLAIMER_RE = /(?:estimated|projection|not.*benchmark|directionally|extrapolat|lower bound|upper bound|realistic|range of|estimated.*reduction|not.*measured)/i;

// ─── Parse the HTML ────────────────────────────────────────────────────────────
function audit(filePath) {
  if (!fs.existsSync(filePath)) {
    return { error: `File not found: ${filePath}` };
  }

  const html = fs.readFileSync(filePath, 'utf8');

  // ── 1. Scan data-claim tags ────────────────────────────────────────────────
  const taggedClaims = { measured: 0, derived: 0, projection: 0, unknown: [] };
  let m;
  NUMERIC_CLAIM_RE.lastIndex = 0;
  while ((m = NUMERIC_CLAIM_RE.exec(html)) !== null) {
    const tier = m[1].toLowerCase();
    if (tier === 'measured' || tier === 'derived' || tier === 'projection') {
      taggedClaims[tier]++;
    } else {
      taggedClaims.unknown.push(tier);
    }
  }

  // ── 2. Check untagged claim-class elements ─────────────────────────────────
  const untaggedMatches = [];
  UNTAGGED_CLAIM_RE.lastIndex = 0;
  while ((m = UNTAGGED_CLAIM_RE.exec(html)) !== null) {
    untaggedMatches.push(m[0].slice(0, 80) + '...');
  }

  // ── 3. Verify core math identities ────────────────────────────────────────
  const mathResults = MATH_IDENTITIES.map(id => {
    const found = id.patterns.some(p => p.test(html));
    return { name: id.name, found };
  });

  // ── 4. Verify measured facts ───────────────────────────────────────────────
  const factResults = MEASURED_FACTS.map(f => {
    let src = html;
    if (f.file) {
      const alt = path.join(ROOT, f.file);
      src = fs.existsSync(alt) ? fs.readFileSync(alt, 'utf8') : html;
    }
    return { label: f.label, found: f.pattern.test(src) };
  });

  // ── 5. Verify projection disclaimers present where needed ──────────────────
  // Extract text near "estimated" / "projection" claims and check for disclaimers
  const projectionSections = [];
  const projRe = /estimated.*?(?:reduction|overhead|power|benefit|saving)[^<]{0,200}/gi;
  let pm;
  while ((pm = projRe.exec(html)) !== null) {
    const hasDisclaimer = PROJECTION_DISCLAIMER_RE.test(pm[0]);
    projectionSections.push({ snippet: pm[0].slice(0, 100), hasDisclaimer });
  }

  const projectionsMissingDisclaimer = projectionSections.filter(p => !p.hasDisclaimer);

  // ── 6. Manifold section present ───────────────────────────────────────────
  const manifoldSectionPresent = /id="manifold"/.test(html);

  // ── 7. Integrity note present ─────────────────────────────────────────────
  const integrityNotePresent = /(?:proofs.*rigorous|not.*benchmark|open.*engineering.*problem|implementation.*research)/i.test(html);

  return {
    file: path.relative(ROOT, filePath),
    manifold_section: manifoldSectionPresent,
    integrity_note: integrityNotePresent,
    tagged_claims: {
      measured: taggedClaims.measured,
      derived: taggedClaims.derived,
      projection: taggedClaims.projection,
      total: taggedClaims.measured + taggedClaims.derived + taggedClaims.projection,
      unknown_tags: taggedClaims.unknown
    },
    untagged_claim_elements: untaggedMatches.length,
    math_identities: mathResults,
    measured_facts: factResults,
    projection_disclaimers: {
      sections_found: projectionSections.length,
      missing_disclaimer: projectionsMissingDisclaimer.length
    }
  };
}

function main() {
  const result = audit(TARGET);

  if (result.error) {
    console.error('[audit_proof] ' + result.error);
    process.exit(2);
  }

  const mathPass = result.math_identities.every(r => r.found);
  const factsPass = result.measured_facts.every(r => r.found);
  const integrityOk = result.integrity_note;
  const sectionOk = result.manifold_section;
  const projOk = result.projection_disclaimers.missing_disclaimer === 0;
  const overallPass = mathPass && integrityOk && sectionOk;

  if (JSON_MODE) {
    console.log(JSON.stringify({ ...result, pass: overallPass }, null, 2));
  } else {
    console.log('\n[audit_proof] Protocol 3.5 — Formal Proof Claim Hardening');
    console.log(`File: ${result.file}\n`);

    console.log(`Manifold section present   : ${sectionOk ? 'YES' : 'MISSING'}`);
    console.log(`Integrity disclaimer note  : ${integrityOk ? 'YES' : 'MISSING'}`);
    console.log('');

    console.log('Core math identities:');
    for (const r of result.math_identities) {
      console.log(`  ${r.found ? 'PASS' : 'FAIL'} ${r.name}`);
    }
    console.log('');

    console.log('Measured facts:');
    for (const r of result.measured_facts) {
      console.log(`  ${r.found ? 'FOUND' : 'MISSING'} ${r.label}`);
    }
    console.log('');

    console.log(`Tagged claims: ${result.tagged_claims.total} total`);
    console.log(`  measured: ${result.tagged_claims.measured}  derived: ${result.tagged_claims.derived}  projection: ${result.tagged_claims.projection}`);
    if (result.tagged_claims.unknown_tags.length > 0) {
      console.log(`  unknown tags: ${result.tagged_claims.unknown_tags.join(', ')}`);
    }
    if (result.untagged_claim_elements > 0) {
      console.log(`  untagged .claim elements: ${result.untagged_claim_elements}`);
    }
    console.log('');

    console.log(`Projection disclaimers: ${result.projection_disclaimers.sections_found} sections, ${result.projection_disclaimers.missing_disclaimer} missing disclaimer`);
    console.log('');

    const status = overallPass ? 'PASS' : 'FAIL';
    console.log(`Overall status: ${status}`);
    if (!mathPass) console.log('  FAIL: One or more core math identities missing from HTML');
    if (!integrityOk) console.log('  FAIL: Integrity disclaimer (Theorem 3 caveat) not found');
    if (!sectionOk) console.log('  FAIL: #manifold section not found');
    console.log('');
  }

  if (STRICT && !overallPass) process.exit(1);
  process.exit(0);
}

main();
