# Deploy runbook — atomic, content-addressed releases

How code becomes a live, reproducible, reversible deploy on the KensGames VPS.
The engine is [scripts/deploy/release.sh](../scripts/deploy/release.sh); the
content-addressed manifest is [scripts/deploy/manifest.mjs](../scripts/deploy/manifest.mjs).

## The model

A deploy never mutates the live web root in place. Each deploy is an immutable
release tree; going live is an atomic symlink flip; going back is the same flip
in reverse.

```
/var/www/kensgames.com/
  releases/
    20260607T120000Z-3a6ed4a/   immutable tree, content-addressed by manifest
    20260607T133000Z-abc1234/
  shared/                        persisted across releases (.env, logs, uploads)
  current  -> releases/20260607T133000Z-abc1234   nginx root points HERE
  previous -> releases/20260607T120000Z-3a6ed4a   one-command rollback target
```

nginx `root` is `/var/www/kensgames.com/current`. Because `current` is a
symlink and the flip is a `rename(2)` on the same filesystem, a request is
always served a complete tree, never a half-synced one.

## Properties

- **Atomic.** Visitors see the old release or the new one, never a partial mix.
- **Reversible.** `release.sh rollback` flips back to the previous good release
  in milliseconds. No rebuild, no re-sync.
- **Reproducible / verifiable.** Every release carries `manifest.json`: a
  sha256 per file folded into one `rootHash`. The same bytes always produce the
  same hash, so you can prove the live tree matches a given commit and detect
  any tampering after deploy. The bash and Node hashers are cross-checked to
  agree byte-for-byte.
- **Health-gated.** After the flip, the engine curls the health URLs. If any is
  not 200, it flips straight back to `previous` and exits non-zero. A bad deploy
  cannot stay live.

## Deploy

CI stages files, rsyncs them to a fresh release dir on the VPS, then runs the
engine. By hand on the VPS it is:

```bash
# staging-dir is a complete copy of what the web root should contain
KG_GIT_SHA=$(git rev-parse --short HEAD) \
  scripts/deploy/release.sh promote /path/to/staging
```

`promote` builds the release (hardlinking unchanged files from `current` for
speed), writes `version.txt` and `manifest.json`, flips `current`, reloads
nginx, health-checks, and auto-rolls-back on failure. On success it prunes
releases beyond `KG_KEEP_RELEASES` (default 5).

## Roll back

```bash
scripts/deploy/release.sh rollback            # to the previous release
scripts/deploy/release.sh rollback 20260607T120000Z-3a6ed4a   # to a specific one
```

## Inspect

```bash
scripts/deploy/release.sh list       # all releases; marks current + previous
scripts/deploy/release.sh current    # the live release id
scripts/deploy/release.sh verify     # re-hash current, compare to its manifest
```

## Configuration (env)

| Variable | Default | Purpose |
|---|---|---|
| `KG_RELEASE_ROOT` | `/var/www/kensgames.com` | release root holding `releases/`, `current`, `previous` |
| `KG_KEEP_RELEASES` | `5` | releases retained by prune |
| `KG_HEALTH_URLS` | `https://kensgames.com/version.txt` | space-separated; all must return 200 |
| `KG_HEALTH_RETRIES` / `KG_HEALTH_DELAY` | `5` / `2` | health retry budget |
| `KG_RELOAD_CMD` | `sudo -n systemctl reload nginx` | web-server reload |
| `KG_GIT_SHA` | `git` of staging | release id suffix |

## One-time server cutover (do this once, deliberately)

The engine is additive — it does not change the live site until nginx's `root`
points at the `current` symlink. Cutover, run as a user with the right perms:

1. Create the layout and seed the first release from whatever is live today:
   ```bash
   ROOT=/var/www/kensgames.com
   sudo mkdir -p "$ROOT/releases" "$ROOT/shared"
   ID="$(date -u +%Y%m%dT%H%M%SZ)-seed"
   sudo rsync -a "$ROOT/public/" "$ROOT/releases/$ID/"
   sudo ln -sfn "$ROOT/releases/$ID" "$ROOT/current"
   ```
2. Point nginx `root` at `$ROOT/current` (instead of `$ROOT/public`), then
   `sudo nginx -t && sudo systemctl reload nginx`.
3. Grant passwordless `systemctl reload nginx` to the deploy user so health-
   gated reloads need no human (`/etc/sudoers.d/kensgames-deploy`).
4. From then on, deploys and rollbacks go through `release.sh`. The old
   in-place `public/` dir can be retired once `current` is serving.

Until step 2 is done, nothing about production changes.

## Troubleshooting

- **Health check fails immediately after deploy** → the engine already rolled
  back; the previous release is live. Check `release.sh current` and the app
  logs in `shared/logs`.
- **`reload command failed`** → passwordless sudo for `systemctl reload nginx`
  is not configured for the deploy user (cutover step 3). Files are still
  swapped; reload by hand.
- **`verify` reports a rootHash mismatch** → the live tree was edited out of
  band (someone changed a file directly on the server). Re-deploy from git to
  restore a known-good, hashed release.
