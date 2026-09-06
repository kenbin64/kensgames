#!/usr/bin/env node
/**
 * ============================================================
 * PEG NAME TOOLTIPS
 *
 * Asked for as: "label the pegs with their names in a tooltip when hovered
 * over, and have the tooltip always visible on smart phones."
 *
 * Two behaviours from one mechanism. On a pointer device the name appears for
 * the peg under the cursor and nothing else. On a device with no pointer to
 * hover with there is no such thing as "the peg under the cursor", so every peg
 * wears its name all the time.
 *
 * Built on 3D sprites rather than a DOM tooltip. The always-on case needs one
 * label per peg, each following its own peg as it hops; a DOM tooltip can only
 * follow a cursor, which a touch screen does not have.
 *
 * Worth knowing: floating nicknames used to be on every peg and were removed on
 * 2026-06-06 as clutter, because pegs are picked by clicking holes and the
 * names had stopped carrying meaning. This is deliberately narrower on a
 * pointer device: one name, only while hovered.
 *
 * How it LOOKS is checked by eye against a screenshot. What is checked here is
 * the wiring, and the two sharing bugs that this feature can cause.
 *
 * Run: node fasttrack/test_peg_name_tooltips.js
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function section(label) { console.log(NL + '-- ' + label + ' --'); }

console.log('PEG NAME TOOLTIPS');
console.log('='.repeat(62));

const src = fs.readFileSync(path.join(__dirname, 'fasttrack-3d.js'), 'utf8');

// ───────────────────────────────────────────────────────────
section('1. Hovering a peg names it');
{
  ok(/function _pegIdAtClient\(/.test(src),
    'there is a pick that answers "which peg is under this point"');
  ok(/_setHoveredPegName\(_pegIdAtClient\(e\.clientX, e\.clientY\)\)/.test(src),
    'pointer movement feeds that peg to the name layer');
  ok(/dom\.addEventListener\('pointerleave', \(\) => \{ clearHover\(\); \}\)/.test(src)
    && /const clearHover = \(\) => \{\s*[\r\n]+\s*_setHoveredPegName\(null\);/.test(src),
    'leaving the board clears the name');
}

// ───────────────────────────────────────────────────────────
section('2. Naming is not gated on it being your turn');
{
  // The route index is empty when there are no legal moves, and the handler
  // returns early on that. Naming a peg is not a move, so it has to happen
  // before that return or a peg would only name itself on your own turn.
  const at = src.indexOf("dom.addEventListener('pointermove'");
  const handler = src.slice(at, at + 1400);
  const hoverAt = handler.indexOf('_setHoveredPegName(_pegIdAtClient');
  const gateAt = handler.indexOf('if (idx.size === 0)');
  ok(hoverAt > 0 && gateAt > 0, 'both the naming call and the route gate are in the handler');
  ok(hoverAt < gateAt,
    'the name is resolved BEFORE the no-legal-moves gate returns',
    `name at ${hoverAt}, gate at ${gateAt}`);
}

// ───────────────────────────────────────────────────────────
section('3. Every peg has a name, not just the current player\'s');
{
  // _pegIdxForPegId resolves against the active seat only. Correct for
  // routing, wrong for naming: an opponent's peg has a name too.
  ok(/function _pegInfoById\(/.test(src),
    'there is a lookup that searches every player');
  const at = src.indexOf('function _pegInfoById(');
  const body = src.slice(at, at + 900);
  ok(/for \(let pi = 0; pi < players\.length; pi\+\+\)/.test(body),
    'and it really does walk all seats rather than just the current one');
  ok(/\$\{nick\} \(\$\{owner\}\)/.test(body),
    'the label says whose peg it is as well as what it is called');
  ok(/`Peg \$\{k \+ 1\}`/.test(body) && /`Player \$\{pi \+ 1\}`/.test(body),
    'a peg with no nickname still gets a usable label');
}

// ───────────────────────────────────────────────────────────
section('4. Phones show every name, all the time');
{
  ok(/function _pegNamesAlwaysOn\(/.test(src), 'there is a test for "no pointer to hover with"');
  ok(/\(hover: none\), \(pointer: coarse\), \(max-width: 760px\)/.test(src),
    'which covers touch screens and small viewports, not just narrow windows');
  ok(/function refreshAlwaysOnPegNames\(/.test(src),
    'and a path that labels every peg');
  ok(/if \(_pegNamesAlwaysOn\(\)\) refreshAlwaysOnPegNames\(\);/.test(src),
    'called from the render, so pegs created mid-game get labelled too');
  ok(/if \(_pegNamesAlwaysOn\(\)\) return;   \/\/ phones keep every name up/.test(src),
    'and hover never takes a name away on a device that has no hover');
}

// ───────────────────────────────────────────────────────────
section('5. A render must not blank the name being hovered');
{
  // renderBoard3D used to call hidePegNames() unconditionally. It runs while
  // the cursor is sitting still, so it wiped the label while the hover state
  // still believed it was shown, and it never came back until the pointer
  // moved to a DIFFERENT peg.
  ok(/function _hidePegNamesExceptHovered\(/.test(src),
    'the render hides names without touching the hovered one');
  ok(/else _hidePegNamesExceptHovered\(\);/.test(src),
    'and that is what the render actually calls');
  const at = src.indexOf('function _hidePegNamesExceptHovered(');
  const body = src.slice(at, at + 400);
  ok(/_hoveredPegId != null && id === _hoveredPegId/.test(body),
    'keeping exactly the hovered peg visible');
}

// ───────────────────────────────────────────────────────────
section('6. The two sharing bugs this feature can cause');
{
  // The name sprite is a CHILD of the peg mesh, and the Card 7 ghost clones
  // that mesh. A cloned sprite shares its canvas texture with the real one, so
  // disposing the ghost would take the real peg's name with it. Same shape as
  // the shared-geometry bug that wedged the renderer earlier.
  const at = src.indexOf('function _createGhostPeg(');
  const ghost = src.slice(at, at + 1400);
  ok(/ghost\.traverse\(\(o\) => \{ if \(o\.isSprite\) labels\.push\(o\); \}\);/.test(ghost),
    'the split ghost strips any label it inherited from the peg it cloned');
  ok(/for \(const s of labels\) \{ if \(s\.parent\) s\.parent\.remove\(s\); \}/.test(ghost),
    'so no cloned sprite can share a texture with a real one');

  // Creating the sprite on every pointer move would rebuild a canvas and a
  // GPU texture per frame of mouse movement.
  ok(/if \(peg\.nameSprite && peg\._nameSpriteLabel === info\.label\) return peg\.nameSprite;/.test(src),
    'a name sprite is built once per peg and reused, not rebuilt per hover');
}

console.log(NL + '='.repeat(62));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(62));
if (fail) {
  console.log(NL + 'Failures:');
  failures.forEach(f => console.log(`  - ${f.name}${f.detail ? ': ' + f.detail : ''}`));
  process.exit(1);
}
process.exit(0);
