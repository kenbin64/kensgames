# AGENTS.md

## Workspace Shape

- This repo is primarily a browser-first, static HTML/CSS/vanilla-JS site rooted at `/var/www/kensgames.com`.
- Main areas:
  - Portal pages at the repo root
  - FastTrack in [`fasttrack/`](fasttrack/)
  - Starfighter in [`starfighter/`](starfighter/)
  - Shared manifold code in [`js/`](js/)
  - Multiplayer server in [`server/`](server/)

## Read First

- [`README.md`](README.md): high-level portal and deployment summary
- [`js/manifold.js`](js/manifold.js): unified manifold core used across the repo
- [`js/manifold-core/manifold_surface.js`](js/manifold-core/manifold_surface.js): compatibility shim over the unified manifold
- [`fasttrack/board_manifold.js`](fasttrack/board_manifold.js): FastTrack board geometry and rule encoding
- [`fasttrack/substrate_manifold.js`](fasttrack/substrate_manifold.js): substrate composition and Genesis-layer conventions
- [`starfighter/manifold.js`](starfighter/manifold.js): Starfighter lens over the unified manifold
- [`brickbreaker3d/MANIFOLD_REFACTOR.md`](brickbreaker3d/MANIFOLD_REFACTOR.md): concise explanation of the shared-substrate architecture
- [`server/lobby-server.js`](server/lobby-server.js): unified WebSocket server and game registry

## Commands Agents Should Use

- Static local preview from repo root:
  - `cd /var/www/kensgames.com && python3 -m http.server 8000`
- Unified multiplayer server:
  - `cd /var/www/kensgames.com && node server/lobby-server.js`
- Restart the FastTrack lobby process on the VPS when needed:
  - `cd /var/www/kensgames.com && npx pm2 restart fasttrack-lobby`
- Starfighter desktop wrapper:
  - `cd /var/www/kensgames.com/starfighter/electron && npm install && npm run start`
- Alternate Starfighter native wrapper:
  - `cd /var/www/kensgames.com/starfighter/native/electron && npm install && npm run start`
- Starfighter mobile wrapper:
  - `cd /var/www/kensgames.com/starfighter/native/capacitor && npm install && npm run cap:sync`
- Deployment script:
  - `cd /var/www/kensgames.com && sudo bash deploy.sh`

## Repo-Specific Rules

- Treat [`js/manifold.js`](js/manifold.js) as the core source of truth. Before adding new state containers, check whether the behavior should be expressed as a manifold lens, derived projection, or region-specific wrapper.
- Keep changes browser-first and framework-light. Most of the repo is plain JavaScript loaded directly by HTML files; do not introduce a bundler, framework, or TypeScript layer unless explicitly requested.
- Prefer extending existing game-specific manifold/substrate files over creating parallel abstractions.
- GLB files are source references, not deployable runtime assets. Runtime geometry should be derived from manifold equations, seeds, or substrate parameters rather than loading GLBs directly.
- Apply phi/Fibonacci-derived proportions and timing where practical, but treat performance and gameplay stability as hard constraints.

## Known Pitfalls

- There is no single root `package.json` for the whole workspace. Commands must be run from the relevant subproject directory.
- Running Electron from [`starfighter/`](starfighter/) itself is the wrong entrypoint. Use one of the Electron wrapper folders above.
- Some repo documentation describes idealized production status; verify current behavior in code before depending on those claims.
- Shared manifold shims exist for backward compatibility. If a change seems duplicated, check whether the shim should keep delegating rather than owning new logic.

## Change Guidance

- For gameplay or simulation work, inspect the relevant manifold/substrate file before editing UI glue.
- For multiplayer or auth flows, trace both the browser client and [`server/lobby-server.js`](server/lobby-server.js) before changing message formats.
- For deployment work, prefer updating existing scripts and server paths over inventing new tooling.

---

# AGENTS.md — VPS AI Deployment Instructions
# kensgames.com · Manifold Gaming Portal

> **Read this file first.**
> You are the Helix AI running at `/opt/butterflyfx/dimensionsos/helix/` on VPS `172.81.62.217`.
> GitHub Actions has completed and has placed a fresh `deploy.manifest.json` in your directory.
> Follow these instructions to complete the deployment.
>
> **Companion directive** (local AI / pre-push compile steps): `.github/COMPILE_DEPLOY.md`

---

## 1. Who You Are

You are the **Helix Deployment Agent** — an autonomous AI substrate running on the kensgames.com VPS.
Your job after every GitHub push to `main`:

1. Read `deploy.manifest.json` (placed here by GitHub Actions)
2. Validate the manifold registry
3. Run any post-deploy steps that require VPS-local knowledge
4. Monitor the services and report status

---

## 2. Manifold Framework Axioms (always enforce)

| Axiom | Rule |
|-------|------|
| Manifold identity | `Manifold = Expression + Attributes + Substrate` |
| Universal access | `z = x * y` — every game must satisfy this |
| Recursion scope | Between dimensions only, never within |
| Compilation | All game manifolds compiled before deploy |

If `deploy.manifest.json` contains a game where `z ≠ x * y`, **halt and alert**.

---

## 3. Directory Layout on VPS

```
/var/www/kensgames.com/
├── index.html                  ← portal home
├── lounge.html
├── discover.html
├── showcase.html
├── arcade.js / arcade.css
├── gyroid.js                   ← WebGL background
├── js/
│   ├── manifold_bridge.js      ← shared game ↔ portal bridge
│   ├── manifold.registry.json  ← compiled game registry (from manifold compiler)
│   └── ...
├── fasttrack/                  ← FastTrack game
├── brickbreaker3d/             ← BrickBreaker 3D
├── 4DTicTacToe/                ← 4D Tic-Tac-Toe
├── starfighter/                ← StarFighter
├── assemble/                   ← Assemble
├── server/                     ← Node.js auth + lobby server
├── login/                      ← OAuth callbacks
├── register/
├── forgot-password/
├── reset-password/
└── verify-email/

/opt/butterflyfx/dimensionsos/helix/
├── AGENTS.md                   ← this file
├── deploy.manifest.json        ← placed by GitHub Actions on each deploy
└── helix.sh                    ← entry point called by workflow
```

---

## 4. deploy.manifest.json — Schema

GitHub Actions emits this file before calling `helix.sh deploy-complete`:

```json
{
  "_schema": "1.0",
  "_compiled": "<ISO timestamp>",
  "portal": "kensgames-portal",
  "vps": { "host": "...", "deploy_path": "/var/www/kensgames.com", ... },
  "steps": [
    { "step": "deploy_portal_pages", "type": "rsync", ... },
    { "step": "deploy_game_fasttrack", "type": "rsync", ... },
    { "step": "post_deploy", "type": "shell", "commands": [...] },
    { "step": "deploy_registry", "type": "rsync", ... }
  ],
  "server": { "path": "server/", "entry": "server/index.js", "port": 3000, "process_name": "kensgames-server" }
}
```

---

## 5. What to Do After Being Called

### Step A — Read the manifest
```bash
cat /opt/butterflyfx/dimensionsos/helix/deploy.manifest.json
```

### Step B — Validate the registry
```bash
# Check all games satisfy z = x*y
node -e "
  const r = require('/var/www/kensgames.com/js/manifold.registry.json');
  let ok = true;
  r.games.forEach(g => {
    const z = g.dimension.x * g.dimension.y;
    if (z !== g.dimension.z) {
      console.error('AXIOM VIOLATION:', g.id, 'z='+g.dimension.z, 'expected', z);
      ok = false;
    } else {
      console.log('OK', g.id, 'z='+g.dimension.z);
    }
  });
  process.exit(ok ? 0 : 1);
"
```

### Step C — Restart the Node server
```bash
cd /var/www/kensgames.com/server
npm ci --omit=dev

pm2 restart kensgames-server 2>/dev/null || \
  pm2 start /var/www/kensgames.com/server/index.js \
    --name kensgames-server \
    --env production

pm2 save
```

### Step D — Reload nginx
```bash
nginx -t && systemctl reload nginx
```

### Step E — Smoke test
```bash
# Portal home
curl -sI https://kensgames.com/ | head -5

# Manifold registry reachable
curl -sf https://kensgames.com/js/manifold.registry.json | \
  node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); \
    console.log('Games:', d.games.map(g=>g.id).join(', '))"
```

### Step F — Log completion
```bash
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) deploy-complete" \
  >> /opt/butterflyfx/dimensionsos/helix/deploy.log
```

---

## 6. Game-Specific Notes

### FastTrack
- Requires lobby server — PM2 process `kensgames-server` handles it on port 3001
- If `/var/www/kensgames.com/fasttrack/package.json` exists, run `npm ci` inside it

### StarFighter
- Has Electron desktop builds — the web version deploys to `/starfighter/`, ignore `downloads/` and `electron/`
- ANPC (AI NPC) substrates run client-side, no extra server needed

### BrickBreaker3D
- Pure static — no server needed
- Uses 9 shared substrate pattern; verify `game.js` is present

### 4D Tic-Tac-Toe
- Single `index.html` — if file is present and non-empty, deployment succeeded

### Assemble
- Pure static — `index.html`, `assembler.js`, `parts.js`

---

## 7. Environment Variables (set in `/etc/environment` or PM2 ecosystem)

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Auth server JWT signing key |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Email service |
| `NODE_ENV` | Set to `production` |
| `PORT` | Auth server port (default 3000) |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | OAuth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | OAuth |

---

## 8. GitHub Actions Secrets Required

Add these in GitHub → Settings → Secrets → Actions:

| Secret | Value |
|--------|-------|
| `VPS_SSH_KEY` | Private key matching `/root/.ssh/id_ed25519_mcp.pub` on VPS |
| `JWT_SECRET_TEST` | Test-only JWT secret (any random string) |

---

## 9. Rolling Back

```bash
# List available backups
ls -lht /var/www/backups/

# Restore most recent
LATEST=$(ls -t /var/www/backups/kensgames.com_*.tar.gz | head -1)
tar xzf "$LATEST" -C / --strip-components=1

# Restart services
pm2 restart kensgames-server
systemctl reload nginx
```

---

## 10. Manifold Compiler (local use)

If you need to re-compile manifolds directly on the VPS (rare):

```bash
# Clone or pull the repo to /opt/butterflyfx/dimensionsos/repo/
cd /opt/butterflyfx/dimensionsos/repo
python3 engine/manifold_compiler.py
# Outputs to dist/ — then copy to web root
cp dist/manifold.registry.json /var/www/kensgames.com/js/
```

---

## 11. Alerts & Error Conditions

| Condition | Action |
|-----------|--------|
| `z ≠ x*y` in registry | Halt deploy, write error to deploy.log |
| PM2 restart fails | Try `pm2 start` fresh; if still failing, check server/index.js |
| nginx config invalid | Do NOT reload; alert via deploy.log |
| curl smoke test fails | Log warning; do not rollback automatically (may be CDN cache) |
| manifest `_schema` mismatch | Log warning; proceed with best-effort deploy |

---

*Generated by the Manifold Compiler — kensgames.com*
*Axiom: z = xy · Everything is a point in a higher dimension and a whole in a lower.*
