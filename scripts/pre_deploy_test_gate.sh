#!/usr/bin/env bash
set -euo pipefail

LANES_ROOT="${LANES_ROOT:-/var/www/kensgames-lanes}"
TEST_DIR="$LANES_ROOT/test"
ARTIFACT_MODE="${ARTIFACT_MODE:-repo-root}"

say() { printf '[pre-deploy-gate] %s\n' "$*"; }
fail() { printf '[pre-deploy-gate] ERROR: %s\n' "$*" >&2; exit 1; }

[[ -d "$TEST_DIR" ]] || fail "Missing test lane: $TEST_DIR"

if [[ "$ARTIFACT_MODE" == "public-dir" ]]; then
  CANDIDATE_ROOT="$TEST_DIR/public"
else
  CANDIDATE_ROOT="$TEST_DIR"
fi

[[ -d "$CANDIDATE_ROOT" ]] || fail "Candidate root missing: $CANDIDATE_ROOT"

say "Checking required release artifacts"
required=(
  "index.html"
  "discover.html"
  "lounge.html"
  "showcase.html"
  "fasttrack/manifold.game.json"
  "brickbreaker3d/manifold.game.json"
  "4DTicTacToe/manifold.game.json"
  "starfighter/manifold.game.json"
)

for f in "${required[@]}"; do
  [[ -f "$CANDIDATE_ROOT/$f" ]] || fail "Missing required artifact: $f"
done

say "Validating manifold universal access rule z = x * y"
node -e "
const fs = require('fs');
const base = process.argv[1];
const paths = [
  'fasttrack/manifold.game.json',
  'brickbreaker3d/manifold.game.json',
  '4DTicTacToe/manifold.game.json',
  'starfighter/manifold.game.json'
];
let ok = true;
for (const p of paths) {
  const full = base + '/' + p;
  const j = JSON.parse(fs.readFileSync(full, 'utf8'));
  const d = j.dimension || {};
  const expected = Number(d.x) * Number(d.y);
  const got = Number(d.z);
  if (!Number.isFinite(expected) || !Number.isFinite(got) || expected !== got) {
    console.error('AXIOM FAIL', p, 'z=' + got, 'expected=' + expected);
    ok = false;
  } else {
    console.log('AXIOM OK', p, 'z=' + got);
  }
}
process.exit(ok ? 0 : 1);
" "$CANDIDATE_ROOT" || fail "Manifold axiom validation failed"

say "Running optional strict commands from STRICT_TEST_COMMANDS (newline-delimited)"
if [[ -n "${STRICT_TEST_COMMANDS:-}" ]]; then
  while IFS= read -r cmd; do
    [[ -z "$cmd" ]] && continue
    say "Exec: $cmd"
    bash -lc "$cmd" || fail "Strict test command failed: $cmd"
  done <<< "$STRICT_TEST_COMMANDS"
else
  say "No STRICT_TEST_COMMANDS set; skipping optional command set"
fi

say "Pre-deploy gate PASS"
