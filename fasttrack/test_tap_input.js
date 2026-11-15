#!/usr/bin/env node
/**
 * ============================================================
 * TAP INPUT AUDIT
 *
 * The bug this exists to stop coming back:
 *
 *   OrbitControls is bound to the same canvas as the board handler and
 *   preventDefaults touch gestures. If a finger drifts a couple of pixels
 *   between landing and lifting, the browser decides it was a drag and never
 *   fires 'click' at all. The tap is silently lost. It worked "sometimes"
 *   because it depended on how still the player's finger happened to be.
 *
 *   And the pick was an exact ray against the mesh, with no allowance for a
 *   fingertip covering forty or fifty pixels.
 *
 *   Both failures returned in silence, so a lost tap and a peg with no legal
 *   move looked identical to the player.
 *
 * Nineteen test files covered rules, turns and move generation. None covered
 * input, which is why this survived. This is that file.
 *
 * Run: node fasttrack/test_tap_input.js
 * ============================================================
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
};

const SRC_PATH = path.join(__dirname, 'fasttrack-3d.js');
const src = fs.readFileSync(SRC_PATH, 'utf8');

// ─── Load the rules, and ONLY the rules ──────────────────────
// Sliced out and evaluated with no document, no window and no THREE. If any of
// this ever reaches for the DOM the evaluation throws and this test fails,
// which is the point: these have to stay testable off-browser.
const from = src.indexOf('const TAP_SLOP_FINE');
const to = src.indexOf('// Exposed so the tests can reach them');
if (from < 0 || to < 0 || to <= from) {
  console.log('FAIL  the tap rules could not be found in fasttrack-3d.js');
  process.exit(1);
}
const rules = src.slice(from, to);

// The comments talk ABOUT the camera and the DOM, which is fine and is most of
// their value. It is the CODE that has to be clean, so the comments come out
// before this is checked. Matching them was the first version of this test and
// it failed on its own prose.
const rulesCode = rules.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
check('the tap rules carry no DOM, no window and no THREE, so they can be tested at all',
  !/\bdocument\b|\bwindow\b|\bTHREE\b|renderer|camera/.test(rulesCode),
  'sliced out and run with nothing around it');

// Built as a function rather than eval'd into this scope, which isolates it
// properly: the rules get no reach into anything here, so if they ever grab for
// a browser they throw, and that is exactly the failure worth reporting.
let API;
try {
  API = new Function(rules + `
    return { _isTap, _tapRing, _tapSlopFor, _isCoarsePointer,
             TAP_SLOP_FINE, TAP_SLOP_COARSE, TAP_HOLD_MS, TAP_PICK_SLOP };`)();
} catch (err) {
  console.log('FAIL  the tap rules would not run on their own:', err.message);
  process.exit(1);
}
const { _isTap, _tapRing, _tapSlopFor, _isCoarsePointer,
        TAP_SLOP_FINE, TAP_SLOP_COARSE, TAP_HOLD_MS, TAP_PICK_SLOP } = API;

const at = (x, y, t) => ({ x, y, t });

// ─── A still tap is a tap ────────────────────────────────────
check('a still tap counts, on a mouse and on a finger',
  _isTap(at(100, 100, 0), at(100, 100, 120), 'mouse') &&
  _isTap(at(100, 100, 0), at(100, 100, 120), 'touch'));

// ─── The bug itself ──────────────────────────────────────────
// A finger that drifts eight pixels is the case that used to vanish entirely.
check('a finger that drifts a few pixels still counts, which is the bug this fixes',
  _isTap(at(200, 300, 0), at(206, 305, 140), 'touch'),
  'eight pixels of drift: exactly what used to be thrown away as a camera drag');

check('and the same drift on a mouse does NOT count, because a mouse has no excuse',
  !_isTap(at(200, 300, 0), at(206, 305, 140), 'mouse'),
  'a mouse that moved that far was dragging the camera on purpose');

// ─── Things that are genuinely not taps ──────────────────────
check('a real drag is not a tap, so turning the board never moves a peg',
  !_isTap(at(100, 100, 0), at(180, 140, 300), 'touch') &&
  !_isTap(at(100, 100, 0), at(180, 140, 300), 'mouse'),
  'ninety pixels travelled');

check('a long hold is not a tap however still it was',
  !_isTap(at(100, 100, 0), at(100, 100, 1500), 'touch'),
  'a second and a half is a hold, not a tap');

check('a tap right on the slop boundary is accepted rather than lost',
  _isTap(at(0, 0, 0), at(TAP_SLOP_COARSE, 0, 100), 'touch'),
  `exactly ${TAP_SLOP_COARSE}px on a finger`);

check('and one pixel past it is not',
  !_isTap(at(0, 0, 0), at(TAP_SLOP_COARSE + 1, 0, 100), 'touch'));

check('missing or mismatched events are never a tap, rather than throwing',
  !_isTap(null, at(1, 1, 1), 'touch') && !_isTap(at(1, 1, 1), null, 'touch'));

// ─── A finger is bigger than a pixel ─────────────────────────
check('a finger is given more room than a mouse',
  _tapSlopFor('touch') > _tapSlopFor('mouse') && _tapSlopFor('pen') > _tapSlopFor('mouse'),
  `${_tapSlopFor('touch')}px against ${_tapSlopFor('mouse')}px`);

check('pen counts as coarse and mouse does not',
  _isCoarsePointer('touch') && _isCoarsePointer('pen') && !_isCoarsePointer('mouse'));

// ─── The pick ring ───────────────────────────────────────────
const exact = _tapRing(50, 60, 0);
check('with no allowance the ring is the single exact point, so hovering is unchanged',
  exact.length === 1 && exact[0].x === 50 && exact[0].y === 60,
  'a hover that snapped to nearby pegs would feel possessed');

const ring = _tapRing(50, 60, TAP_PICK_SLOP);
check('the exact point is always tried FIRST, so a precise tap is never overruled by a near miss',
  ring[0].x === 50 && ring[0].y === 60,
  `then ${ring.length - 1} more tried outward`);

check('and nothing in the ring is further away than the allowance',
  ring.every((p) => Math.hypot(p.x - 50, p.y - 60) <= TAP_PICK_SLOP + 1e-9),
  `${ring.length} points, none beyond ${TAP_PICK_SLOP}px`);

check('the ring reaches all the way round rather than favouring one side',
  (() => {
    const quads = new Set();
    for (const p of ring.slice(1)) quads.add(`${p.x >= 50 ? 'r' : 'l'}${p.y >= 60 ? 'd' : 'u'}`);
    return quads.size === 4;
  })(), 'all four quadrants covered');

// ─── The wiring, which is where the bug actually lived ───────
// These read the source. A rule that is right but not wired in is worth nothing.
const boardBlock = src.slice(src.indexOf('function _handleBoardTap') - 2500,
                             src.indexOf('function _handleBoardTap') + 200);

check('the board listens for pointerup, not for click',
  /dom\.addEventListener\('pointerup'/.test(src) &&
  /dom\.addEventListener\('pointerdown'/.test(src),
  'waiting for a click is what lost the taps in the first place');

check('and the old click handler on the board is gone',
  !/dom\.addEventListener\('click',\s*\(e\)\s*=>\s*\{\s*\n\s*if \(artOverlayOpen\(\)\) return;\s*\n\s*const idx = _refreshRouteIndex\(\)/.test(src),
  'the art gallery still uses click, which is correct: it is not on the board');

check('a coarse pointer gets the pick allowance and a mouse does not',
  /_isCoarsePointer\(pointerType\) \? TAP_PICK_SLOP : 0/.test(src));

// ─── Nothing fails in silence any more ───────────────────────
// The whole handler, up to its closing brace. It used to be a fixed 1400 characters, and the
// turn panel block (2026-11-05) pushed the checked lines past that window.
const _handlerStart = src.indexOf('function _handleBoardTap');
const _handlerEnd = src.slice(_handlerStart).search(/\r?\n  \}\r?\n/);
const handler = src.slice(_handlerStart, _handlerStart + _handlerEnd);
const bareReturns = (handler.match(/^\s*(if \([^)]*\) )?\{?\s*return;\s*\}?$/gm) || []);
check('every dead end in the tap handler says something first',
  /_sayBoardHint\(_whyNothingToPick\(\)\)/.test(handler) &&
  /_sayBoardHint\('Nothing there/.test(handler) &&
  /_sayBoardHint\(target\.kind === 'peg'/.test(handler),
  'a tap that does nothing and says nothing is indistinguishable from a broken game');

check('and the reason given depends on WHY, rather than one message for everything',
  /is taking their turn/.test(src) && /No legal move with this card/.test(src) &&
  /Draw a card to begin/.test(src),
  'bot turn, no legal move, and no card are three different problems');

// ─── The choice box ──────────────────────────────────────────
check('more than one move through a target opens a list rather than a blind cycle',
  /_showMoveChoices\(matches, target\)/.test(src) &&
  /if \(!matches \|\| matches\.length < 2\) return;/.test(src));

check('a single move still commits straight away, with nothing to confirm',
  /if \(matches\.length === 1\) \{[\s\S]{0,180}_commitPendingEntry\(\);/.test(src));

check('the choice box previews each move on the board as it is considered',
  /addEventListener\('pointerenter', preview\)/.test(src) &&
  /addEventListener\('focus', preview\)/.test(src));

check('its buttons are big enough for a thumb',
  /min-height:44px/.test(src), 'the forty four pixel target size');

check('and it is dismissed when the game state moves on',
  /_hideMoveChoices\(\);\s*\n\s*_refreshRouteIndex\(\);/.test(src),
  'a stale box would offer moves that no longer exist');

// ─── The browser must not steal the gesture ──────────────────
const css = fs.readFileSync(path.join(__dirname, '3d.css'), 'utf8');
check('the canvas claims its own touch gestures',
  /canvas\s*\{[^}]*touch-action:\s*none/.test(css),
  'without this the browser can read a tap as the start of a scroll and never deliver it');

// ─── Touch first: the phone plays differently ────────────────
// user_directive: on a smartphone the bottom toolbar and the confirm tick go
// away entirely. The board is the whole interface. One move just plays; several
// open a list; tapping nothing backs out. The desktop keeps its toolbar, so this
// is a second way to play rather than a replacement.
{
  check('the toolbar is suppressed entirely when touch is the primary input',
    /const shouldShow = total > 0 && !_touchFirst\(\)( && [^;]+)?;/.test(src),   // the turn panel (2026-11-05) adds its own condition
    'prev, next, cancel and confirm are a mouse idea and a finger does not need them');

  check('touch first is decided by the Play build flag OR a coarse pointer',
    /window\.FT_MOBILE === true \|\| coarse/.test(src) &&
    /matchMedia\('\(pointer: coarse\)'\)/.test(src),
    'so it covers the packaged app and a phone browser alike');

  check('and it is read once and remembered, not queried every frame',
    /_touchFirstCache/.test(src));

  check('a single move still just plays, with nothing to confirm',
    /if \(matches\.length === 1\) \{[\s\S]{0,200}_commitPendingEntry\(\);/.test(src));

  check('several moves open the list, which is the only place a choice gets made',
    /_showMoveChoices\(matches, target\)/.test(src));

  check('tapping the same target twice does NOT quietly commit on touch',
    /isReclick && !_touchFirst\(\)/.test(src),
    'that was a mouse affordance and on a phone it plays a move nobody chose');

  check('tapping empty board backs out, since there is no cancel button left',
    /_touchFirst\(\) && \(_pendingEntry \|\| _getSplitChoice\(\)\)/.test(src) &&
    /Cleared\. Tap a glowing peg/.test(src),
    'and mid split it walks the split back a stage, which is what cancel used to do');

  check('the banner stops telling the player to confirm when there is no confirm button',
    /_pendingEntry && !_touchFirst\(\)/.test(src) &&
    /Touch first has nothing to confirm/.test(src),
    'pointing at a button that is gone is worse than saying nothing');

  // The purity rule again, for the new helper: it reads window, so it must sit
  // OUTSIDE the block this test evaluates bare. It was inside at first and this
  // caught it.
  const pureBlock = src.slice(src.indexOf('const TAP_SLOP_FINE'),
                              src.indexOf('// Exposed so the tests can reach them'));
  check('the touch first check lives OUTSIDE the DOM free block, because it reads window',
    !/_touchFirst/.test(pureBlock) && /_touchFirstCache/.test(src),
    'putting it inside broke the purity check, which is the check working');
}

// ─── One file for both builds ─────────────────────────────────
// 3d.html used to carry `window.FT_MOBILE = true` as a literal, which meant the
// web copy and the packaged copy differed by a source edit somebody had to
// remember not to deploy. These make sure that cannot come back.
{
  const html = fs.readFileSync(path.join(__dirname, '3d.html'), 'utf8');

  check('3d.html does not hard code the build flag any more',
    !/window\.FT_MOBILE\s*=\s*true\s*;/.test(html),
    'a literal there is the whole reason the two trees diverged');

  check('it works the flag out from the native shell instead',
    /window\.Capacitor/.test(html) && /isNativePlatform/.test(html) &&
    /window\.FT_MOBILE = native;/.test(html),
    'so one file serves the web and the store builds');

  check('and either mode can be forced, for testing on the wrong machine',
    /FT_FORCE_DESKTOP/.test(html) && /FT_FORCE_TOUCH/.test(html) &&
    /FT_FORCE_DESKTOP === true/.test(src) && /FT_FORCE_TOUCH === true/.test(src),
    'honoured in both the page and the game');

  check('the detection cannot throw and take the page with it',
    /try \{[\s\S]{0,260}catch \(e\) \{\}/.test(html),
    'window.Capacitor is absent on the web, and reading into it must not be fatal');

  // The stale claim that started this: FT_MOBILE was documented as controlling
  // appearance, and it has not for a long time.
  // This check took three attempts and each failure was the instrument.
  //   1. `FT_BILLIARD_ROOM\s*=` matched the first `=` of `=== true` in the code
  //      that READS the flag.
  //   2. Adding (?!=) still matched a comment documenting the flag, and the local
  //      `const FT_BILLIARD_ROOM = ...` that reads window into it.
  // What is actually being claimed is narrower: nothing assigns to the WINDOW
  // property, so the opt-in never happens and the void room is every build.
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '')
                        .replace(/<!--[\s\S]*?-->/g, '')
                        .replace(/\/\/.*$/gm, '');
  const assignsWindow = /window\.FT_BILLIARD_ROOM\s*=(?!=)/;
  check('nothing assigns window.FT_BILLIARD_ROOM, so the void room is already every build',
    !assignsWindow.test(strip(src)) && !assignsWindow.test(strip(html)),
    'which is why the flag was inert for art, and why the old comment claiming it changed the room was wrong');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
