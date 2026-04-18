# COMPILE_DEPLOY.md — AI Compile & Deploy Directive
# kensgames.com · Manifold Gaming Portal
# For: GitHub Copilot Agent, local AI agents, automated tooling

> **Read this before any compile or deploy action.**
> This directive governs every compile-and-deploy operation for the kensgames.com portal.
> Follow steps in order. Do not skip validation. Do not push if the compiler fails.

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

**If `z ≠ x*y` for any game, stop. Do not proceed.**

---

## 3. Files You Control

| File | Role |
|------|------|
| `engine/manifold_compiler.py` | The compiler — run this first, always |
| `manifold.portal.json` | Root portal config — source of truth for all games |
| `*/manifold.game.json` | Per-game manifold descriptor (one per game directory) |
| `js/manifold_bridge.js` | Shared browser bridge — included by every game |
| `dist/manifold.registry.json` | Compiler output — portal reads this at runtime |
| `dist/deploy.manifest.json` | Compiler output — Helix AI reads this on VPS |
| `helix.sh` | VPS entry point — deployed to `/opt/butterflyfx/dimensionsos/helix/` |
| `.github/workflows/deploy.yml` | GitHub Actions pipeline |
| `AGENTS.md` | VPS Helix AI instructions |

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
@("4DTicTacToe","brickbreaker3d","starfighter","fasttrack","assemble") | ForEach-Object {
  $f = "$_\index.html"
  $c = Get-Content $f -Raw
  $tag = $c -match "manifold_bridge\.js"
  $init = ($c -match "ManifoldBridge") -or ((Get-Content "$_\game.js" -Raw -ErrorAction SilentlyContinue) -match "ManifoldBridge")
  "$_  tag=$tag  init=$init"
}

# Linux / macOS
for game in 4DTicTacToe brickbreaker3d starfighter fasttrack assemble; do
  tag=$(grep -l "manifold_bridge.js" $game/index.html 2>/dev/null && echo "OK" || echo "MISSING")
  echo "$game  tag=$tag"
done
```

All games must show `tag=True` (or `tag=OK`).

### Step 5 — Syntax Check Modified JS

```bash
# Check any JS files you modified
node --check arcade.js
node --check js/manifold_bridge.js
node --check brickbreaker3d/game.js
node --check server/index.js
```

No output = no syntax errors.

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
`https://github.com/<owner>/manifold/actions`

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
| GitHub Actions compile job fails | Read log — usually a `manifold.game.json` change broke a validation |
| VPS deploy fails | Check `AGENTS.md` for rollback procedure |
| Smoke test returns non-200 | Check nginx config on VPS; may be CDN cache delay |

---

## 8. Game Registry — Current State

| Game ID | Dimension | Entry URL |
|---------|-----------|-----------|
| `fasttrack` | x=3 y=45 z=135 | `/fasttrack/lobby.html` |
| `brickbreaker3d` | x=2 y=22 z=44 | `/brickbreaker3d/lobby.html` |
| `4dtictactoe` | x=2 y=12 z=24 | `/4DTicTacToe/index.html` |
| `starfighter` | x=2 y=30 z=60 | `/starfighter/index.html` |
| `assemble` | x=2 y=20 z=40 | `/assemble/index.html` |

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

---

## 10. Key Paths

| Location | Path |
|----------|------|
| Portal web root (VPS) | `/var/www/kensgames.com/` |
| Helix AI directory (VPS) | `/opt/butterflyfx/dimensionsos/helix/` |
| Manifold registry (VPS) | `/var/www/kensgames.com/js/manifold.registry.json` |
| Deploy log (VPS) | `/opt/butterflyfx/dimensionsos/helix/deploy.log` |
| Backups (VPS) | `/var/www/backups/` |

---

*Axiom: z = xy · Everything is a point in a higher dimension and a whole in a lower.*
*Directive version: 1.0 · kensgames.com*
