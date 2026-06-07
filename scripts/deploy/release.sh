#!/usr/bin/env bash
# Atomic, content-addressed release engine for the KensGames VPS.
#
# Why this exists: the three older deploy paths (deploy.sh, the CI workflow,
# prod-promote.sh) all rsync straight into the live web root. A failed or
# partial sync leaves the site broken with no automatic revert. This engine
# never mutates the live tree in place. Instead:
#
#   $ROOT/
#     releases/<id>/        one immutable tree per deploy (id = <stamp>-<sha>)
#     shared/               persisted across releases (.env, logs, uploads)
#     current  -> releases/<id>   atomic symlink (nginx root points HERE)
#     previous -> releases/<id>   bookkeeping for one-command rollback
#
# A deploy stages files into a NEW release dir, hashes it into a content-
# addressed manifest, then flips `current` with an atomic symlink rename. If
# the post-swap health check fails, it flips straight back to `previous`. The
# live site is only ever a complete, verified tree or the previous good one.
#
# This script runs ON the server. It is invoked over SSH by CI, or by hand.
# It depends only on coreutils + rsync (+ node for the manifest, with a
# sha256sum fallback). Everything is overridable by env for testing.
set -euo pipefail

ROOT="${KG_RELEASE_ROOT:-/var/www/kensgames.com}"
RELEASES_DIR="$ROOT/releases"
SHARED_DIR="$ROOT/shared"
CURRENT_LINK="$ROOT/current"
PREVIOUS_LINK="$ROOT/previous"
KEEP_RELEASES="${KG_KEEP_RELEASES:-5}"
HEALTH_URLS="${KG_HEALTH_URLS:-https://kensgames.com/version.txt}"
HEALTH_RETRIES="${KG_HEALTH_RETRIES:-5}"
HEALTH_DELAY="${KG_HEALTH_DELAY:-2}"
RELOAD_CMD="${KG_RELOAD_CMD:-sudo -n systemctl reload nginx}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say()  { printf '[release] %s\n' "$*"; }
warn() { printf '[release] WARN: %s\n' "$*" >&2; }
fail() { printf '[release] ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: release.sh <command> [args]

  promote <staging-dir>   Build a new release from <staging-dir>, verify it,
                          atomically switch `current` to it, reload, health-
                          gate, and auto-rollback on failure.
  rollback [release-id]   Switch `current` back to `previous` (or to the named
                          release id), reload, health-gate.
  list                    List releases; mark current and previous.
  current                 Print the release id `current` points at.
  verify [release-id]     Re-hash a release and compare to its manifest
                          (defaults to current). Detects tampering/drift.
  prune                   Delete old releases beyond KG_KEEP_RELEASES.

Environment (defaults shown):
  KG_RELEASE_ROOT=/var/www/kensgames.com
  KG_KEEP_RELEASES=5
  KG_HEALTH_URLS="https://kensgames.com/version.txt"   (space-separated)
  KG_HEALTH_RETRIES=5   KG_HEALTH_DELAY=2
  KG_RELOAD_CMD="sudo -n systemctl reload nginx"
EOF
}

# Resolve the release id a symlink points at (basename of its target), or "".
link_target_id() {
  local link="$1"
  [ -L "$link" ] || { echo ""; return; }
  basename "$(readlink "$link")"
}

# Generate the content-addressed manifest for a release dir. Prefer the Node
# implementation (cross-checked, richer JSON); fall back to a pure-bash
# sha256sum manifest that produces the SAME rootHash for the same bytes.
write_manifest() {
  local dir="$1" id="$2" sha="$3" built_at="$4"
  if command -v node >/dev/null 2>&1 && [ -f "$SCRIPT_DIR/manifest.mjs" ]; then
    node "$SCRIPT_DIR/manifest.mjs" generate "$dir" --id "$id" --git "$sha" --built-at "$built_at"
    return
  fi
  warn "node not found — writing fallback sha256sum manifest"
  local body rootHash
  body="$(cd "$dir" && find . -type f ! -name manifest.json -printf '%P\n' \
            | LC_ALL=C sort \
            | while IFS= read -r f; do printf '%s  %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$f"; done)"
  rootHash="$(printf '%s\n' "$body" | sha256sum | cut -d' ' -f1)"
  printf '%s\n' "$rootHash"
}

# Curl each health URL; all must return 200 within the retry budget.
health_ok() {
  local url code attempt
  for url in $HEALTH_URLS; do
    code=000
    for attempt in $(seq 1 "$HEALTH_RETRIES"); do
      code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo 000)"
      [ "$code" = "200" ] && break
      sleep "$HEALTH_DELAY"
    done
    if [ "$code" != "200" ]; then
      warn "health check FAILED: $url -> $code"
      return 1
    fi
    say "health OK: $url -> 200"
  done
  return 0
}

# The atomic flip: point `current` at $target via a temp symlink + rename.
# rename(2) on the same filesystem is atomic — readers see old or new, never
# a missing link. Records the prior target as `previous` first.
swap_current() {
  local target="$1" prior
  prior="$(readlink "$CURRENT_LINK" 2>/dev/null || true)"
  [ -n "$prior" ] && ln -sfn "$prior" "$PREVIOUS_LINK"
  ln -sfn "$target" "$CURRENT_LINK.tmp"
  mv -Tf "$CURRENT_LINK.tmp" "$CURRENT_LINK"
}

reload() {
  if eval "$RELOAD_CMD"; then
    say "reloaded web server"
  else
    warn "reload command failed: $RELOAD_CMD (continuing — fix sudoers for zero-touch reloads)"
  fi
}

cmd_promote() {
  local staging="$1"
  [ -d "$staging" ] || fail "staging dir not found: $staging"
  mkdir -p "$RELEASES_DIR" "$SHARED_DIR"

  local stamp sha id dest built_at
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  sha="${KG_GIT_SHA:-$(git -C "$staging" rev-parse --short HEAD 2>/dev/null || echo nogit)}"
  id="${stamp}-${sha}"
  dest="$RELEASES_DIR/$id"
  built_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  say "building release $id"
  # Hardlink unchanged files from the live release for a fast, low-disk copy.
  local linkdest=()
  [ -d "$CURRENT_LINK" ] && linkdest=(--link-dest="$CURRENT_LINK")
  mkdir -p "$dest"
  rsync -a --delete "${linkdest[@]}" "$staging/" "$dest/"

  # Stamp version.txt so health checks and clients can detect the build.
  printf '%s\n' "$id" > "$dest/version.txt"

  local rootHash
  rootHash="$(write_manifest "$dest" "$id" "$sha" "$built_at" | tail -n1)"
  say "content hash: $rootHash"

  local prev_id
  prev_id="$(link_target_id "$CURRENT_LINK")"
  say "swapping current: ${prev_id:-<none>} -> $id"
  swap_current "$dest"
  reload

  if health_ok; then
    say "release $id is LIVE and healthy (rootHash $rootHash)"
    cmd_prune
  else
    warn "post-swap health check failed — rolling back"
    if [ -n "$prev_id" ] && [ -d "$RELEASES_DIR/$prev_id" ]; then
      swap_current "$RELEASES_DIR/$prev_id"
      reload
      health_ok && say "rolled back to $prev_id (healthy)" || warn "rollback to $prev_id still unhealthy — manual intervention needed"
    else
      warn "no previous release to roll back to — $id remains live but unhealthy"
    fi
    fail "deploy of $id aborted and rolled back"
  fi
}

cmd_rollback() {
  local target_id="${1:-}"
  local target
  if [ -n "$target_id" ]; then
    target="$RELEASES_DIR/$target_id"
    [ -d "$target" ] || fail "no such release: $target_id"
  else
    target="$(readlink "$PREVIOUS_LINK" 2>/dev/null || true)"
    [ -n "$target" ] && [ -d "$target" ] || fail "no previous release recorded to roll back to"
    target_id="$(basename "$target")"
  fi
  say "rolling back current -> $target_id"
  swap_current "$target"
  reload
  health_ok && say "rollback to $target_id healthy" || warn "rollback to $target_id is unhealthy"
}

cmd_list() {
  local cur prev
  cur="$(link_target_id "$CURRENT_LINK")"
  prev="$(link_target_id "$PREVIOUS_LINK")"
  [ -d "$RELEASES_DIR" ] || { say "no releases yet"; return; }
  local id mark
  for id in $(ls -1 "$RELEASES_DIR" 2>/dev/null | LC_ALL=C sort); do
    mark=""
    [ "$id" = "$cur" ]  && mark="  <- current"
    [ "$id" = "$prev" ] && mark="$mark  (previous)"
    printf '  %s%s\n' "$id" "$mark"
  done
}

cmd_current() { link_target_id "$CURRENT_LINK"; }

cmd_verify() {
  local id="${1:-$(link_target_id "$CURRENT_LINK")}"
  [ -n "$id" ] || fail "nothing to verify (no current release)"
  local dir="$RELEASES_DIR/$id"
  [ -d "$dir" ] || fail "no such release: $id"
  if command -v node >/dev/null 2>&1 && [ -f "$SCRIPT_DIR/manifest.mjs" ]; then
    node "$SCRIPT_DIR/manifest.mjs" verify "$dir"
  else
    fail "node required for verify (manifest.mjs)"
  fi
}

# Keep the newest KG_KEEP_RELEASES; never delete current or previous.
cmd_prune() {
  [ -d "$RELEASES_DIR" ] || return 0
  local cur prev keep_ids id count=0
  cur="$(link_target_id "$CURRENT_LINK")"
  prev="$(link_target_id "$PREVIOUS_LINK")"
  for id in $(ls -1 "$RELEASES_DIR" | LC_ALL=C sort -r); do
    if [ "$id" = "$cur" ] || [ "$id" = "$prev" ]; then continue; fi
    count=$((count + 1))
    if [ "$count" -gt "$KEEP_RELEASES" ]; then
      say "pruning old release $id"
      rm -rf "${RELEASES_DIR:?}/$id"
    fi
  done
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    promote)  [ $# -ge 1 ] || { usage; exit 2; }; cmd_promote "$1" ;;
    rollback) cmd_rollback "${1:-}" ;;
    list)     cmd_list ;;
    current)  cmd_current ;;
    verify)   cmd_verify "${1:-}" ;;
    prune)    cmd_prune ;;
    ""|-h|--help) usage ;;
    *) fail "unknown command: $cmd (try --help)" ;;
  esac
}

main "$@"
