# WORKFLOW.md — KensGames Development Workflow
# kensgames.com · Manifold Gaming Portal

> Practical guide for day-to-day development, feature work, and deployments.
> For compile/deploy specifics see `COMPILE_DEPLOY.md`.
> For VPS post-deploy steps see `AGENTS.md`.

---

## 1. Repository Layout at a Glance

```
/var/www/kensgames.com/   (also c:\projects\manifold\ locally)
│
├── index.html            ← Public promo + Cloudflare Access login
├── portal.html           ← Authenticated portal (game launcher)
├── arcade.css / arcade.js
├── gyroid.js             ← WebGL background
│
├── js/
│   ├── kg-session.js          ← Shared auth/session module (NEW)
│   ├── manifold_bridge.js     ← Game ↔ portal manifold bridge
│   ├── manifold.js            ← Core manifold engine
│   └── require_auth.js        ← Legacy auth redirect helper
│
├── player/
│   ├── setup.html             ← First-login: playername + avatar picker (NEW)
│   └── index.html             ← Player profile page (NEW)
│
├── server/
│   ├── index.js               ← Express auth API (port 3000)
│   ├── db.js                  ← SQLite store via better-sqlite3 (NEW)
│   ├── store.js               ← In-memory manifold data (compat layer)
│   ├── routes/players.js      ← Player profile API — 14 endpoints (NEW)
│   └── kensgames.db           ← SQLite file — VPS only, never committed
│
├── fasttrack/            ← FastTrack multiplayer game
├── 4DTicTacToe/          ← 4D Tic-Tac-Toe
├── brickbreaker3d/       ← BrickBreaker 3D
├── starfighter/          ← StarFighter
├── assemble/             ← Assemble
│
├── login/ register/ forgot-password/ reset-password/ verify-email/
├── invite/ invited/      ← Invite-code flow
├── social/               ← Tournaments, leaderboards
├── admin.html / admin.js ← Admin panel
│
├── engine/               ← Manifold compiler (Python)
├── dist/                 ← Compiler output (committed)
└── .github/
    ├── AGENTS.md          ← VPS Helix AI instructions
    ├── COMPILE_DEPLOY.md  ← Compile & deploy directive
    ├── WORKFLOW.md        ← This file
    └── workflows/deploy.yml
```

---

## 2. Auth & Session Flow

```
User visits kensgames.com
        │
        ▼
index.html  ──── not logged in ────► Cloudflare Access login
        │
        │ CF sets cf-access-authenticated-user-email header
        ▼
GET /api/auth/access-session
        │  reads CF header → upserts manifoldData + SQLite player record
        │  returns kg_token (JWT) + profileSetup flag
        ▼
localStorage: kg_token
        │
        ├── profileSetup=false ──► /player/setup.html
        │       • agree TOS   POST /api/players/tos/agree
        │       • pick name   POST /api/players/setup
        │       • pick avatar       (playername is PERMANENT)
        │
        └── profileSetup=true ──► portal.html (game launcher)
                │
                └── click playername chip ──► /player/index.html
```

### Key rules
- `kg_token` is a JWT signed by `JWT_SECRET`. Validate with `GET /api/auth/validate`.
- Playername is **permanent** — set once via `/api/players/setup`, never changed.
- One playername per email address. Uniqueness enforced in both SQLite and in-memory store.
- Music/sound state flows through `KGSession.musicEnabled` / `KGSession.soundEnabled`.
  Game organizers can silence all players via `KGSession.setMusicOverride(false)`.

---

## 3. Player Profile System

### Database (server/db.js)

Uses `better-sqlite3` (synchronous). Schema auto-initializes on first server start.

**Tables:** `players`, `guilds`, `guild_members`, `guild_actions`, `guild_appeals`,
`friends`, `blocks`, `medallions`, `favorites`, `preferences`, `portal_logs`, `admin_actions`

**Manifold coordinates per player:**
- `manifold_x` = normalized tenure (days_since_join / 730)
- `manifold_y` = normalized activity (sessions / 1000)
- `z = x * y` → composite rank surface (enforced by axiom)

**Privacy:** raw email is never stored — only `SHA-256(email)` is written to `email_hash`.

### Player API Endpoints (server/routes/players.js)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/players/me` | Current player's full profile |
| `GET` | `/api/players/check-playername?name=` | Availability check (unauthenticated) |
| `POST` | `/api/players/tos/agree` | Record TOS agreement |
| `POST` | `/api/players/setup` | First-time: set playername + avatar (locks playername) |
| `POST` | `/api/players/profile` | Update avatar only (playername cannot change) |
| `GET` | `/api/players/preferences` | Get all preferences |
| `POST` | `/api/players/preferences` | Set one or many preferences |
| `GET` | `/api/players/medallions` | Get medallion status per game |
| `GET` | `/api/players/favorites` | Get favorited games |
| `POST` | `/api/players/favorites/toggle` | Toggle game favorite |
| `GET` | `/api/players/friends` | Friends list with online status |
| `POST` | `/api/players/friends/add` | Add mutual friend |
| `POST` | `/api/players/friends/remove` | Remove friend (both directions) |
| `POST` | `/api/players/blocks/add` | Block player (removes friendship, 24h cooldown) |
| `POST` | `/api/players/blocks/remove` | Unblock (enforces 24h wait) |
| `GET` | `/api/players/search?q=` | Search by username or playername |
| `GET` | `/api/players/:userId/profile` | Public profile of any player |

### Medallion System

Awarded only from **public ranked multiplayer** matches (not invited/bot/solo).

| Level | Min XP | Color |
|-------|--------|-------|
| Bronze | 0 | #CD7F32 |
| Silver | 200 | #C0C0C0 |
| Gold | 750 | #FFD700 |
| Platinum | 2000 | #E5E4E2 |
| Diamond | 5000 | #B9F2FF |

Award via: `PlayerDB.recordGameResult(playerId, gameId, xpEarned, won)` — called by lobby server after each ranked match.

### Avatar System

96+ avatars across 8 categories, defined identically in three places (kept in sync):
- `js/kg-session.js` → `AVATAR_CATEGORIES` (canonical source, populates `window.KG_AVATARS`)
- `player/setup.html` → `AVATAR_CATEGORIES` (used during setup flow)
- `player/index.html` → `AVATAR_CATEGORIES` (used in avatar-change modal)

**When adding new avatars:** update all three files and use the same `id` keys.

---

## 4. kg-session.js — Usage Guide

Include on every **authenticated** page:
```html
<head>
  <script src="/js/kg-session.js"></script>
</head>
```

### Public pages (no auth required)
Add `data-kg-public="true"` to `<body>` — kg-session skips the auth redirect:
```html
<body data-kg-public="true">
```

### Pages with their own auth flow (e.g. portal.html)
Add `data-kg-no-init="true"` to `<body>` — kg-session skips auth/chip injection
but still exposes `window.KG_AVATARS` and `window.KGSession`:
```html
<body data-mtheme="gold" data-kg-no-init="true">
```

### Player chip injection
kg-session automatically injects a `<a href="/player/" class="kg-chip">` chip into
the first element matching `#kg-player-slot` or `.header-nav` it finds.

To use a custom slot:
```html
<div id="kg-player-slot"></div>
```

### Waiting for player data
```js
KGSession.onReady(player => {
  console.log('Logged in as', player.playername);
  if (!KGSession.musicEnabled) stopMusic();
});
```

### Music / sound controls
```js
// Read (game should check this before starting audio)
if (KGSession.musicEnabled) bgMusic.play();
if (KGSession.soundEnabled) sfx.play();

// Organizer override (disables for everyone in this browser tab)
KGSession.setMusicOverride(false);
```

---

## 5. Adding a New Game

1. **Create the game directory** and implement the game (HTML + JS).

2. **Create `<gameid>/manifold.game.json`** — use an existing one as template.
   Ensure `z == x * y` (Manifold axiom).

3. **Add entry to `manifold.portal.json`** → `"games"` array.

4. **Add bridge to the game HTML:**
   ```html
   <script src="/js/manifold_bridge.js"></script>
   ```
   Call `ManifoldBridge.init({...})` from the game engine.

5. **Add kg-session.js** to the game HTML if players need the chip / music controls.

6. **Register the game in `server/store.js`** if it uses the lobby system.

7. **Recompile and verify:**
   ```bash
   python3 engine/manifold_compiler.py
   node -e "const r=require('./dist/manifold.registry.json'); r.games.forEach(g=>console.log(g.id, g.dimension.x*g.dimension.y===g.dimension.z?'OK':'AXIOM VIOLATION'))"
   ```

8. **Push** — GitHub Actions handles the rest.

---

## 6. Deployment Pipeline Summary

```
git push origin main
        │
        ▼
GitHub Actions: .github/workflows/deploy.yml
  [1] compile      — python3 engine/manifold_compiler.py
  [2] test-server  — cd server && npm ci && npm test
  [3] deploy       — rsync portal + games + server/ to VPS
                   — scp dist/ → /var/www/kensgames.com/js/
                   — scp helix.sh → /opt/.../helix/
  [4] post-deploy  — npm ci --omit=dev (installs better-sqlite3 on Linux)
                   — pm2 restart kensgames-server
                   — nginx -t && systemctl reload nginx
                   — helix.sh deploy-complete (Helix AI validates z=xy)
  [5] verify       — curl https://kensgames.com/ must return 200
```

> **`better-sqlite3`** is a native Node.js module. It compiles on the VPS during
> `npm ci --omit=dev` (post-deploy step). It will NOT compile locally on Windows
> without Visual Studio Build Tools — this is expected and safe.

### Manual deploy triggers

To deploy a single game without touching the rest of the portal:
1. GitHub → Actions → "Manifold Compiler — Deploy to kensgames.com"
2. Run workflow → `game: fasttrack` (or `brickbreaker3d`, `4dtictactoe`, `starfighter`, `assemble`)

To validate locally without pushing:
```bash
python3 engine/manifold_compiler.py --validate-only
```

---

## 7. Local Development

### Start the auth/player API server
```bash
cd server
npm install          # first time only (better-sqlite3 requires build tools on Windows)
node index.js        # runs on :3000
```

On Windows without build tools, `better-sqlite3` won't install. Use:
```bash
# Workaround: skip native deps and mock the DB layer for local testing
NODE_ENV=development node index.js
```
The server falls open (no DB) on missing native deps — auth still works via in-memory store.

### Start the lobby/WebSocket server
```bash
node server/lobby-server.js   # separate port (configured in lobby-server.js)
```

### Serve static files
```bash
# From repo root
npx serve .              # serves on :3000 by default, pick another port
# OR
python3 -m http.server 8080
```

### Restart PM2 on VPS after a hotfix
```bash
# Via MCP / SSH
npx pm2 restart kensgames-server
```

---

## 8. Consistent Portal Conventions

All authenticated pages must follow these conventions:

| Requirement | Implementation |
|-------------|----------------|
| Auth gate | `<script src="/js/kg-session.js"></script>` in `<head>` |
| Player chip | Either injected by kg-session OR manually linked to `/player/` |
| Music setting | Read `KGSession.musicEnabled` before starting audio |
| Sound setting | Read `KGSession.soundEnabled` before playing SFX |
| Theme class | `<body data-mtheme="cyan">` (or `gold`, `green`) |
| CSS vars | Use `--c1`, `--c2`, `--c3`, `--void`, `--panel-bg`, `--text` |
| Logout | Call `KGSession.logout()` — clears storage + redirects |

### Music override for game organizers
Game organizers (lobby host) can silence music for all players **in their own tab**:
```js
// Disable for this session
KGSession.setMusicOverride(false);
// Re-enable
KGSession.setMusicOverride(true);
```
Stored in `sessionStorage` as `kg_music_override`. Resets on tab close.

---

## 9. Guild System — Current Status

- SQLite tables are **defined** (`guilds`, `guild_members`, `guild_actions`, `guild_appeals`).
- `server/routes/guilds.js` still uses **in-memory** `guildsData`.
- `player/index.html` shows the Guilds tab with placeholder join logic.
- **Phase 2 (pending):** wire `routes/guilds.js` to `PlayerDB.getGuild()`,
  `PlayerDB.listPublicGuilds()`, `PlayerDB.getGuildMembers()`, `PlayerDB.getPlayerGuild()`.

---

## 10. Admin Panel

- `admin.html` + `admin.js` — requires `isSuperuser=true` or `isAdmin=true` in JWT.
- Currently reads from in-memory `manifoldData`.
- Pending: wire to `PlayerDB.search()`, `PlayerDB.setStatus()` for SQLite-backed
  player management and ban/suspend controls.

Superuser emails (auto-promoted at login):
- `kenetics.art@gmail.com`
- `ken.bingham64@gmail.com`

---

## 11. git Conventions

```
feat: <title>       — new feature
fix: <title>        — bug fix
chore: <title>      — tooling, deps, cleanup
game(<id>): <title> — game-specific change, e.g. game(fasttrack): fix win detection
deploy: <title>     — deploy config or pipeline change
```

**Never commit:**
- `server/kensgames.db` (SQLite — listed in .gitignore)
- `server/node_modules/`
- `*.env` files
- `starfighter/electron/` build artifacts
- `dist/` is committed — it's the compiler output consumed by VPS

---

*Axiom: z = xy · Everything is a point in a higher dimension and a whole in a lower.*
*kensgames.com · Workflow version 1.0 · April 2026*
