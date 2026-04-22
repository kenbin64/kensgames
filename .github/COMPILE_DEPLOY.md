# COMPILE_DEPLOY.md — AI Compile & Deploy Directive
# kensgames.com · Manifold Gaming Portal
# For: GitHub Copilot Agent, local AI agents, automated tooling

> **Read this before any compile or deploy action.**
> This directive governs every compile-and-deploy operation for the kensgames.com portal.
> Follow steps in order. Do not skip validation. Do not push if the compiler fails.

**Directive version: 2.0** — Updated April 2026 to reflect portal retool:
SQLite player DB, kg-session.js, player profile pages, avatar picker, medallion system.

---

## 1. What You Are Doing

You are compiling the **Manifold Portal** and deploying to `kensgames.com` (VPS `172.81.62.217`).

The pipeline is:
```
Local: compile → validate → commit → push
  ↓
GitHub Actions: compile → test server → rsync to VPS → signal Helix AI
  ↓
VPS (Helix AI): validate z=xy → pm2 restart → nginx reload → smoke test
```

The entry point for VPS post-deploy is `AGENTS.md` (Helix reads it automatically).

---

## 2. Manifold Axioms — Always Enforce

| Axiom | Rule |
|-------|------|
| Manifold identity | `Manifold = Expression + Attributes + Substrate` |
| Universal access | `z = x * y` — every game must satisfy this |
| Recursion scope | Between dimensions only, never within |
| Bridge protocol | Every deployed game must expose `window.__MANIFOLD__` |
| Single substrate | All systems (logic, UI, audio, AI) read from `Manifold.sample()` |
| Derived fields | `f1 = x·y` (density), `f2 = x·y²` (intensity), `G` (Schwarz Diamond field) |

**If `z ≠ x*y` for any game, stop. Do not proceed.**

---

## 3. Files You Control

| File | Role |
|------|------|
| `engine/manifold_compiler.py` | The compiler — run this first, always |
| `manifold.portal.json` | Root portal config — source of truth for all games |
| `*/manifold.game.json` | Per-game manifold descriptor (one per game directory) |
| `js/manifold_bridge.js` | Shared browser bridge — included by every game |
| `js/manifold_sample.js` | Unified `Manifold.sample(ctx)` API — load **before** bridge; all substrates read from this |
| `js/kg-session.js` | Shared auth/session module — included by every authenticated page |
| `dist/manifold.registry.json` | Compiler output — portal reads this at runtime |
| `dist/deploy.manifest.json` | Compiler output — Helix AI reads this on VPS |
| `helix.sh` | VPS entry point — deployed to `/opt/butterflyfx/dimensionsos/helix/` |
| `.github/workflows/deploy.yml` | GitHub Actions pipeline |
| `AGENTS.md` | VPS Helix AI instructions |
| `server/db.js` | SQLite persistent store (players, guilds, friends, medallions, prefs) |
| `server/routes/players.js` | Player profile API — 14 endpoints |
| `server/kensgames.db` | **VPS only** — SQLite database file; never committed to git |
| `player/setup.html` | First-login avatar/playername setup page |
| `player/index.html` | Player profile page (tabs: Profile, Friends, Guilds, Settings) |

---

## 4. Step-by-Step: Full Compile & Deploy

### Step 1 — Pre-flight

Confirm you are on the `main` branch with a clean working tree:

```bash
git status
git branch --show-current
```

If there are uncommitted changes to game files, stage them first.

### Step 2 — Run the Manifold Compiler

```bash
# Windows (py launcher)
py -3.12 engine/manifold_compiler.py

# Linux / macOS / GitHub Actions
python3 engine/manifold_compiler.py
```

**Expected output:**
```
🜂 Manifold Compiler — kensgames.com
============================================
  ✓ portal config: kensgames-portal v1.0.0
  ✓ FastTrack (2.1.0)  z=135
  ✓ BrickBreaker 3D (1.0.0)  z=44
  ✓ 4D Tic-Tac-Toe (1.0.0)  z=24
  ✓ StarFighter (1.0.0)  z=60
  ✓ Assemble (1.0.0)  z=40

  All 5 game manifolds valid.

  Emitting artifacts…
  ✓ wrote dist/manifold.registry.json
  ✓ wrote dist/deploy.manifest.json

  Compilation complete — 5 games registered.
```

**If any game fails:** check its `manifold.game.json` → verify `z == x*y` → fix → recompile.

### Step 3 — Validate the Registry (z = x*y axiom)

```bash
node -e "
  const r = require('./dist/manifold.registry.json');
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

**If exit code ≠ 0: halt. Do not commit. Fix the violation first.**

### Step 4 — Verify Bridge Coverage

All 5 game HTML entry points must include `manifold_bridge.js`:

```bash
# Windows PowerShell
@("4dconnect","brickbreaker3d","starfighter","fasttrack","assemble") | ForEach-Object {
  $f = "$_\index.html"
  $c = Get-Content $f -Raw
  $tag = $c -match "manifold_bridge\.js"
  $init = ($c -match "ManifoldBridge") -or ((Get-Content "$_\game.js" -Raw -ErrorAction SilentlyContinue) -match "ManifoldBridge")
  "$_  tag=$tag  init=$init"
}

# Linux / macOS
for game in 4dconnect brickbreaker3d starfighter fasttrack assemble; do
  tag=$(grep -l "manifold_bridge.js" $game/index.html 2>/dev/null && echo "OK" || echo "MISSING")
  echo "$game  tag=$tag"
done
```

All games must show `tag=True` (or `tag=OK`).

### Step 5 — Syntax Check Modified JS

```bash
# Check any JS files you modified
node --check arcade.js
node --check js/manifold_sample.js
node --check js/manifold_bridge.js
node --check js/kg-session.js
node --check brickbreaker3d/game.js
node --check server/index.js
node --check server/db.js
node --check server/routes/players.js
```

No output = no syntax errors.

### Step 5b — Verify kg-session.js coverage

`/js/kg-session.js` must be present on every authenticated portal/game page that
is **not** a public landing page. Verify it is included where needed:

```powershell
# Windows PowerShell — check portal + player pages
@("portal.html","player/setup.html","player/index.html") | ForEach-Object {
  $c = Get-Content $_ -Raw
  "$_  kg-session=$($c -match 'kg-session\.js')"
}
```

- `portal.html` must have `data-kg-no-init="true"` on `<body>` (portal manages its own auth flow; kg-session.js only provides `window.KG_AVATARS`).
- `player/setup.html` and `player/index.html` rely on kg-session.js for auth gating.
- Game HTML files (`fasttrack/`, `4dconnect/`, etc.) may include kg-session.js for the player chip and `KGSession.musicEnabled` / `KGSession.soundEnabled` controls.

### Step 6 — Commit and Push

```bash
git add dist/manifold.registry.json dist/deploy.manifest.json
git add -u                            # stage all tracked modifications
git status                            # review before committing
git commit -m "feat: <describe what changed>"
git push origin main
```

> **Note:** Pushing to `main` triggers `.github/workflows/deploy.yml` automatically.
> The workflow compiles again on the server to guarantee a clean build.

### Step 7 — Monitor GitHub Actions

Watch the pipeline at:
`https://github.com/kenbin64/manifold/actions`

Expected jobs (in order):
1. **Manifold Compile & Validate** — must exit 0
2. **Test Server** — must exit 0
3. **Deploy to VPS** — rsync + Helix AI signal
4. **Verify Deployment** — smoke test `https://kensgames.com/`

If any job fails, read the log before re-running.

### Step 8 — Post-Deploy Smoke Test

```bash
# Portal home — must return HTTP 200
curl -sI https://kensgames.com/ | head -5

# Registry reachable and valid JSON
curl -sf https://kensgames.com/js/manifold.registry.json | \
  node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); \
    console.log('Games:', d.games.map(g=>g.id).join(', '))"
```

---

## 5. Single-Game Deploy

To deploy only one game (e.g., after editing only FastTrack):

```bash
# Validate only that game
py -3.12 engine/manifold_compiler.py --game fasttrack

# Then push — trigger the workflow with game filter via workflow_dispatch:
# GitHub UI → Actions → "Manifold Compiler — Deploy to kensgames.com"
# → Run workflow → game: fasttrack
```

---

## 6. Validate-Only (No Push)

To check everything locally without deploying:

```bash
py -3.12 engine/manifold_compiler.py --validate-only
```

---

## 7. Error Conditions

| Condition | Action |
|-----------|--------|
| Compiler `z ≠ x*y` | Fix `manifold.game.json` — do NOT push |
| `dist/` missing | Create it: `mkdir dist` then recompile |
| `node --check` fails | Fix syntax before committing |
| Bridge tag missing from a game | Add `<script src="/js/manifold_bridge.js"></script>` to the game's HTML |
| `manifold_sample.js` not loaded before bridge | Move `<script src="/js/manifold_sample.js"></script>` above `manifold_bridge.js` |
| `kg-session.js` missing from authenticated page | Add `<script src="/js/kg-session.js"></script>` to `<head>` |
| `portal.html` shows double player chip | Ensure `<body data-kg-no-init="true">` is set on portal.html |
| `better-sqlite3` build fails on VPS | Ensure Node.js version matches; try `npm rebuild better-sqlite3` |
| DB file missing after deploy | First server start creates `server/kensgames.db` automatically — check PM2 logs |
| GitHub Actions compile job fails | Read log — usually a `manifold.game.json` change broke a validation |
| VPS deploy fails | Check `AGENTS.md` for rollback procedure |
| Smoke test returns non-200 | Check nginx config on VPS; may be CDN cache delay |

---

## 8. Game Registry — Current State

| Game ID | Dimension | Entry URL |
|---------|-----------|------------|
| `fasttrack` | x=3 y=45 z=135 | `/fasttrack/portal.html` |
| `brickbreaker3d` | x=2 y=22 z=44 | `/brickbreaker3d/lobby.html` |
| `4dconnect` | x=2 y=12 z=24 | `/4dconnect/lobby.html` |
| `starfighter` | x=2 y=30 z=60 | `/starfighter/lobby.html` |
| `assemble` | x=2 y=20 z=40 | `/assemble/lobby.html` |

To add a new game:
1. Create `<gameid>/manifold.game.json` (use an existing one as template)
2. Ensure `z == x * y`
3. Add the entry to `manifold.portal.json` → `"games"` array
4. Add `<script src="/js/manifold_bridge.js"></script>` to the game HTML
5. Call `ManifoldBridge.init({...})` from the game engine
6. Recompile and push

---

## 9. Required Secrets (GitHub → Settings → Secrets → Actions)

| Secret | Used For |
|--------|----------|
| `VPS_SSH_KEY` | SSH into `172.81.62.217` for rsync + PM2 |
| `JWT_SECRET_TEST` | Server test suite |
| `TURNSTILE_SECRET` | Cloudflare Turnstile server-side verification (login/register) |

## 10. Environment Variables (VPS — set in `/etc/environment` or PM2 ecosystem)

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | ✅ | JWT signing key — must match between restarts |
| `TURNSTILE_SECRET` | ✅ prod | Cloudflare Turnstile secret key |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | ✅ | Email delivery for password reset / verify |
| `NODE_ENV` | ✅ | Set to `production` on VPS |
| `PORT` | — | Auth server port (default 3000) |
| `DB_PATH` | — | Override SQLite path (default `server/kensgames.db`) |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | — | Discord OAuth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Google OAuth |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | — | Facebook OAuth |

---

## 11. Key Paths

| Location | Path |
|----------|------|
| Portal web root (VPS) | `/var/www/kensgames.com/` |
| Helix AI directory (VPS) | `/opt/butterflyfx/dimensionsos/helix/` |
| Manifold registry (VPS) | `/var/www/kensgames.com/js/manifold.registry.json` |
| Shared session module (VPS) | `/var/www/kensgames.com/js/kg-session.js` |
| Player profile pages (VPS) | `/var/www/kensgames.com/player/` |
| SQLite database (VPS) | `/var/www/kensgames.com/server/kensgames.db` |
| Deploy log (VPS) | `/opt/butterflyfx/dimensionsos/helix/deploy.log` |
| Backups (VPS) | `/var/www/backups/` |

> **Never commit `kensgames.db`** — it is listed in `.gitignore`. It is created automatically on first server start via `server/db.js`.

---

## 12. Manifold.sample() — Unified Substrate API

`js/manifold_sample.js` is the single entry point all systems use instead of separate config trees.

### Load order (in every game HTML)

```html
<script src="/js/manifold_sample.js"></script>   <!-- must be first -->
<script src="/js/manifold_bridge.js"></script>
```

### Wire once at game init

```javascript
// Subscribe all substrates to the shared sample stream
Manifold.subscribe(function(s) {
  // Logic — spawn rates, difficulty, feature flags
  spawnSystem.setRate(s.logic.spawnRate);
  aiTree.setDifficulty(s.logic.difficulty);

  // UI/UX — layout, animation speed, color theme
  uiLayer.setDensity(s.ui.layoutDensity);
  animator.setSpeed(s.ui.animSpeed);
  theme.apply(s.ui.colorScheme);

  // Audio — music mode, SFX density, volume
  musicMixer.setMode(s.audio.musicMode);
  sfxLayer.setDensity(s.audio.sfxDensity);

  // AI routing — pick model size, set temperature, cache hint
  aiRouter.configure(s.ai);
});
```

### Drive from game loop or context change

```javascript
// Each frame (or each turn, screen transition, major action):
Manifold.update({
  x: turnNumber / maxTurns,   // progression 0..1
  y: boardTension,            // intensity 0..1
});
```

### Gyroid lattice — tune without touching substrate code

Add a node to the lattice to create a new behavioral region:

```javascript
// "Boss fight" zone — fires at peak x=0.8, y=0.9
Manifold.lattice.push({
  x: 0.8, y: 0.9,
  region: 'boss', intensity: 0.95, theme: 'danger',
  aiMode: 'aggressive', spawnRate: 0.95, musicMode: 'climax'
});
```

### ManifoldSample fields

| Field | Type | Description |
|-------|------|-------------|
| `x`, `y` | float 0..1 | Input coordinates (progression, intensity) |
| `z` | float | Derived: `x·y²` |
| `f1` | float | `x·y` — interaction density |
| `f2` | float | `x·y²` — non-linear intensity |
| `G` | float [−1,1] | Schwarz Diamond field value |
| `surfaceProximity` | float 0..1 | `1 − |G|` — 1 = on surface (high priority) |
| `region` | string | Nearest lattice region name |
| `intensity` | float 0..1 | IDW-blended intensity |
| `theme` | string | Color/mood theme |
| `aiMode` | string | AI routing mode |
| `logic` | object | `{ spawnRate, difficulty, featureFlags, forkPriority }` |
| `ui` | object | `{ layoutDensity, animSpeed, colorScheme, glowIntensity }` |
| `audio` | object | `{ musicMode, sfxDensity, notifyStyle, masterVolume }` |
| `ai` | object | `{ modelSize, temperature, cacheHint, maxTokens, promptStyle }` |

---

*Axiom: z = xy · Everything is a point in a higher dimension and a whole in a lower.*
*Directive version: 2.1 · kensgames.com · Updated April 2026*
