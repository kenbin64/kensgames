# 🦋 manifold-deploy

*Part of the [ButterflyFx](https://butterflyfx.us) toolkit.*

**Atomic, content-addressed deploys from your laptop to a server, in one command.** Zero dependencies, no agent on the server, no CI required.

```bash
node deploy.mjs mysite
```

## The problem

Deploying a site by hand means a chain of fragile steps: rsync or scp straight into the live directory, hope nothing fails halfway, and if it does, the site is broken with no clean way back. Setting up a full CI pipeline for a small site is overkill, and most ad-hoc deploys mutate the live directory in place, so a partial upload is a partial outage.

## The solution

One command runs the flow good deploys always use, automated:

```
stage (copy, minus .git)  ->  content-hash  ->  ship over scp  ->
back up the live dir  ->  atomic swap into place  ->  health-check  ->
auto-rollback if unhealthy  ->  prune old backups
```

The live directory is never edited in place. A new release is staged, swapped in by an atomic directory move, and health-checked. If the health check fails, the previous release is swapped straight back. A bad deploy cannot stay live.

## Why you need this

- **One command, every time.** `node deploy.mjs <target>`. No remembering scp flags or paths.
- **Safe by default.** Every deploy backs up the live site first and keeps the last N backups; rollback is automatic on failure and one command by hand.
- **Reproducible.** Each release is identified by the hash of its contents, so the same folder always produces the same release id and you can prove what is live.

## Why trust this

- **Plain Node, zero dependencies.** The whole tool is one readable file, [deploy.mjs](deploy.mjs). It shells out to the `ssh` and `scp` already on your machine. Nothing is installed on the server.
- **Nothing destructive without a backup.** The live directory is tarred to `.mdeploy-backups/` before anything is swapped, and the previous release is kept as `<serveDir>.__prev` for instant rollback.
- **You can read exactly what runs on the server.** The remote steps are a short, visible bash script built in `deploy.mjs`, not a hidden binary.

## Setup

1. Copy the example config and edit it:
   ```bash
   cp deploy.config.example.json deploy.config.json
   ```
2. Define one or more targets (`deploy.config.json` is gitignored, since it holds your host and user):
   ```json
   {
     "mysite": {
       "local": "C:/path/to/site",     // local folder to deploy (repo root or build output)
       "host": "your.server",
       "port": 22,
       "user": "youruser",
       "remoteBase": "/var/www/example.com",  // parent of the served dir
       "serveDir": "public",                  // the dir nginx serves; this is what gets swapped
       "health": ["https://example.com/"],    // all must return 2xx/3xx or the deploy rolls back
       "keepBackups": 5
     }
   }
   ```
3. Make sure key-based SSH to the server already works (`ssh -p <port> user@host` with no password prompt).

## Usage

```bash
node deploy.mjs mysite            # stage, ship, swap, health-check, prune
node deploy.mjs mysite --dry-run  # stage + content-hash only, ship nothing
```

Requirements: Node >= 18 (for the built-in health-check fetch), plus `ssh` and `scp` on your PATH (built into Windows 10/11 and every Unix).

## Rollback by hand

Automatic on a failed health check. To revert the last deploy manually:

```bash
ssh -p <port> user@host "cd <remoteBase> && rm -rf <serveDir> && mv <serveDir>.__prev <serveDir>"
```

## Note

A personal portfolio piece demonstrating reliable, reproducible deployment, not a commercial product or service for sale.
