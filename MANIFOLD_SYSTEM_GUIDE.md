# ButterflyFX Manifold System — Complete Guide
**For AI Agents, Developers, and Integrators**
**kensgames.com | Last updated: 2026-04-10**

---

## 0. Read This First — The One Rule

Everything in this system obeys a single primitive:

```
z = x · y
```

- `x` and `y` are **any value or expression** — numbers, property paths, functions, math formulas, composed operations
- `z` is the **output** — what every interpreter, renderer, router, and recommender reads at runtime
- The surface they live on is the **Schwarz Diamond / Gyroid blend**: `sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = 0`
- **Minimal input → maximum output**: define two axes of meaning, get a fully positioned entity the entire portal understands

If you understand `z = x · y`, you understand the whole system.

---

## 1. Architecture Overview

```
ANY DATA (game, theme, content, function, concept)
    │
    ▼
┌─────────────────────────────────┐
│       ManifoldIngestor          │  js/substrates/manifold_ingestor.js
│  resolves x, y → computes z    │  Node + Browser (dual export)
│  places entity on surface       │
└────────────────┬────────────────┘
                 │  Manifold Entity (token = z)
        ┌────────┴────────┐
        ▼                 ▼
┌──────────────┐   ┌───────────────────┐
│  GameRegistry │   │ ManifoldDiscovery  │
│  Manifold     │   │ Substrate          │
│  (catalog)    │   │ (recommendations)  │
└──────┬────────┘   └────────┬──────────┘
       │                     │
       ▼                     ▼
┌─────────────────────────────────────────┐
│           Portal Runtime                │
│  index.html / lounge.html / discover.html│
│  gyroid.js WebGL background             │
│  auth_portal_substrate.js               │
│  leaderboard_substrate.js               │
└─────────────────────────────────────────┘
```

**File locations:**
```
/var/www/kensgames.com/
├── index.html                        Portal homepage
├── lounge.html                       Multiplayer lobby
├── discover.html                     3D manifold discovery
├── gyroid.js                         WebGL gyroid/diamond renderer
├── deploy.sh                         Deployment script
├── MANIFOLD_METRICS.md               Size/performance benchmarks
├── js/substrates/
│   ├── manifold_ingestor.js          ← START HERE (universal ingestor)
│   ├── manifold_discovery.js         Nearest-neighbor recommendations
│   ├── game_registry_manifold.js     Game catalog
│   ├── game_wizard.js                Player/AI config
│   ├── leaderboard_substrate.js      Score tracking
│   ├── game_launcher.js              Iframe lifecycle
│   └── auth_portal_substrate.js      OAuth + session
├── fasttrack/                        FastTrack v2.1.0 game (playable)
│   ├── board_3d.html                 Full game (857KB, self-contained)
│   ├── game_engine_manifold.js       Engine as substrate
│   ├── move_generation_substrate.js
│   ├── card_logic_substrate.js
│   ├── ai_manifold.js
│   └── ui_manifold.js
└── login/
    ├── facebook/callback.html
    ├── google/callback.html
    └── discord/callback.html
```

---

## 2. INGEST — Putting Anything on the Manifold

### The Ingestor API

```javascript
// Browser: script tag loads manifold_ingestor.js → window.ManifoldIngestor
// Node:    const ManifoldIngestor = require('./js/substrates/manifold_ingestor');

ManifoldIngestor.ingest(data, schema)   // → ManifoldEntity
ManifoldIngestor.ingestAll(items, schema) // → ManifoldEntity[]
ManifoldIngestor.validateSchema(schema) // → { valid, errors }
```

### Schema — Defining x and y

The schema tells the ingestor what `x` and `y` mean for your data.
They can be **any of these types**:

```javascript
// 1. Literal number
{ x: 4, y: 45 }

// 2. Property path (dot notation)
{ x: 'playerCount', y: 'duration' }
{ x: 'meta.score',  y: 'session.minutes' }  // nested

// 3. Arrow function
{ x: d => d.players * d.difficulty, y: d => d.duration / 2 }

// 4. Expression string (data bound to 'd')
{ x: 'd.players * d.difficulty', y: 'duration' }

// 5. Array operation tuple [op, ...operands]
{ x: ['multiply', 'players', 'difficulty'], y: ['add', 'duration', 10] }
// Supported ops: add, subtract, multiply, divide, pow, sqrt, log, abs, max, min
```

### What You Get Back — The ManifoldEntity

```javascript
const entity = ManifoldIngestor.ingest(
  { id: 'fasttrack-v2', name: 'FastTrack', playerCount: 2, duration: 45 },
  { x: 'playerCount', y: 'duration' }
);

// entity structure:
{
  source:    { id: 'fasttrack-v2', name: 'FastTrack', ... }, // original untouched

  schema:    { x: 'playerCount', y: 'duration' },            // what was used

  manifold: {
    x: 2,      // resolved x
    y: 45,     // resolved y
    z: 90,     // THE PRIMITIVE — runtime reads this
  },

  surface: {
    gyroid:  -0.312,  // sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x)
    diamond:  0.841,  // cos(x)cos(y)cos(z) - sin(x)sin(y)sin(z)
    blend:   -0.166,  // 70% gyroid + 30% diamond (matches gyroid.js renderer)
  },

  position3d: { x: -19.3, y: 9.0, z: 31.2 },  // 3D coord for visualization

  token:     90,      // ← WHAT ALL INTERPRETERS READ — same as manifold.z

  id:        'fasttrack-v2',
  label:     'FastTrack',
  color:     'hsl(324, 80%, 60%)',   // auto from z
  meta:      {},
  ingestedAt: 1744329600000
}
```

**The `token` (= `z`) is what everything downstream reads.** It is the entity's address on the surface.

### Batch Ingest

```javascript
const games = [
  { id: 'ft', name: 'FastTrack',    playerCount: 2, duration: 45 },
  { id: 'bb', name: 'BrickBreaker', playerCount: 1, duration: 20 },
];
const schema = { x: 'playerCount', y: 'duration' };

const entities = ManifoldIngestor.ingestAll(games, schema);
// Returns ManifoldEntity[] — each fully positioned on the surface

const sorted = ManifoldIngestor.sortByToken(entities);
// Sorted ascending by z (token) — natural manifold ordering
```

---

## 3. DEPLOY — Getting It Onto the Server

### Quick Deploy (files already on server)

The portal is already live at `/var/www/kensgames.com/`. Files served directly by nginx.
No build step. No bundler. Drop files → they're live.

```bash
# Verify nginx is serving
curl -sk -o /dev/null -w "%{http_code}" https://kensgames.com/
# → 200

# Reload nginx after config changes (requires sudo)
sudo nginx -t && sudo systemctl reload nginx
```

### Adding a New Substrate/Game to the Portal

1. **Ingest your entity** (can be done at runtime in the browser or ahead of time):
```javascript
const entity = ManifoldIngestor.ingest(myGameData, { x: 'players', y: 'playtime' });
```

2. **Register it** in `game_registry_manifold.js` — add an entry to `LAUNCH_GAMES`:
```javascript
{
  id: 'my-game',
  title: 'My Game',
  entryPoint: '/my-game/index.html',
  manifold: { x: 3, y: 30, z: 90 },   // z = x * y
  modes: { singlePlayer: { enabled: true }, multiplayer: { enabled: false } },
  requiresLogin: false,
  ...
}
```

3. **Drop your game files** into `/var/www/kensgames.com/my-game/`

4. The portal's `ManifoldDiscoverySubstrate` will automatically include it in recommendations.

### Full Deployment Script

```bash
# From /var/www/kensgames.com/
sudo bash deploy.sh
```

The script: backs up current → copies files → verifies nginx → confirms all required files exist.

### FastTrack-specific deploy (from dev machine to VPS)

```bash
cd /opt/butterflyfx/dimensionsos/web/games/fasttrack
bash deploy/push-to-vps.sh root
# Validates 10 substrates → rsync → installs systemd services → reloads nginx
```

---

## 4. EXTRACT — Reading Data From the Manifold at Runtime

### Reading the Token (z)

Any system that needs to understand an entity reads `entity.token` (= `entity.manifold.z`).

```javascript
// Route by token
if (entity.token < 30)  loadLightweightGame(entity);
if (entity.token > 100) loadHeavyGame(entity);

// Sort games by complexity
const ordered = ManifoldIngestor.sortByToken(entities);

// The portal's game grid renders in token order automatically
```

### Nearest-Neighbor Recommendations

```javascript
const pool   = ManifoldIngestor.ingestAll(allGames, schema);
const target = pool.find(e => e.id === 'fasttrack-v2');

const nearby = ManifoldIngestor.nearest(target, pool, 3);
// Returns: [{ entity: ManifoldEntity, distance: number }, ...]
// Sorted by Euclidean distance in 3D manifold space

nearby.forEach(({ entity, distance }) => {
  console.log(`${entity.label}: ${distance.toFixed(1)} units away`);
});
```

### Surface Geometry — Reading the Gyroid/Diamond Values

The `surface` values tell you where the entity sits on the physical surface.
Use these for visual placement, shader parameters, or audio reactivity:

```javascript
entity.surface.gyroid   // sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x)  range: [-2, 2]
entity.surface.diamond  // cos(x)cos(y)cos(z) - sin(x)sin(y)sin(z)     range: [-1, 1]
entity.surface.blend    // 70/30 blend                                   range: [-2, 2]

// Example: map blend to a glow intensity for the gyroid.js renderer
window.gyroidIntensity = (entity.surface.blend + 2) / 4; // normalize to [0,1]
```

### 3D Position — For Three.js / WebGL Scenes

```javascript
const pos = entity.position3d;
mesh.position.set(pos.x, pos.y, pos.z);

// The ManifoldDiscoverySubstrate.createVisualizationScene() does this automatically
ManifoldDiscoverySubstrate.createVisualizationScene('container-id', 'fasttrack-v2');
```

### Leaderboard Integration

```javascript
// After a game ends, submit score via the substrate
LeaderboardSubstrate.submitScore(
  entity.id,        // game id (= entity.id)
  playerName,
  score,
  { playtime: entity.manifold.y, avatar: '🏎️' }
);

// Read leaderboard for a game
const board = LeaderboardSubstrate.getLeaderboard(entity.id, 'all-time', 10);
```

### Auth — Session Reading

```javascript
// Check login state anywhere on the portal
const user = sessionStorage.getItem('user_session');
if (user) {
  const session = JSON.parse(user);
  // session.id, session.displayName, session.avatar, session.provider, session.isGuest
}

// Auth substrate events
AuthPortalSubstrate.on('login',   ({ user }) => console.log('Logged in:', user));
AuthPortalSubstrate.on('logout',  ()         => console.log('Logged out'));
AuthPortalSubstrate.on('error',   ({ message }) => console.error(message));
```

---

## 5. APPLYING DATA — Wiring It Into the Portal

### Pattern: Ingest → Register → Render

```javascript
// 1. Ingest
const entity = ManifoldIngestor.ingest(rawData, schema);

// 2. Register (optional — only needed for games in the portal grid)
GameRegistryManifold.initializeGames();  // loads LAUNCH_GAMES
const game = GameRegistryManifold.getGame(entity.id);

// 3. Launch a game
GameLauncher.launch(entity.id, {
  playerConfig: { name: 'Ken', avatar: '🎯', isHuman: true },
  aiOpponents:  [{ name: 'Bot1', difficulty: 'medium', skillMultiplier: 0.8 }]
});
// GameLauncher handles iframe creation, PostMessage handshake, and state management

// 4. Receive score back from game
window.addEventListener('message', (e) => {
  if (e.data.type === 'SCORE_UPDATE') {
    LeaderboardSubstrate.submitScore(entity.id, e.data.playerName, e.data.score);
  }
  if (e.data.type === 'GAME_ENDED') {
    AuthPortalSubstrate.submitGameResults(entity.id, e.data.score);
  }
});
```

### PostMessage Protocol (Portal ↔ Game Iframe)

```javascript
// Portal → Game (sent automatically by GameLauncher)
{ type: 'GAME_CONFIG',
  playerConfig: { name, avatar, isHuman },
  aiOpponents:  [{ id, name, avatar, difficulty, skillMultiplier }],
  difficulty:   'medium' }

// Game → Portal
{ type: 'GAME_READY' }
{ type: 'SCORE_UPDATE', playerName, score, gameTime }
{ type: 'GAME_ENDED',   playerName, score, gameTime, winner }
```

### OAuth Configuration (when real credentials are available)

```html
<!-- Add this BEFORE any substrate script tags -->
<script>
  window.KENSGAMES_CONFIG = {
    oauth: {
      facebookAppId:   'YOUR_REAL_FACEBOOK_APP_ID',
      googleClientId:  'YOUR_REAL_GOOGLE_CLIENT_ID',
      discordClientId: 'YOUR_REAL_DISCORD_CLIENT_ID'
    }
  };
</script>
<script src="/js/substrates/auth_portal_substrate.js"></script>
```

Without real IDs, clicking a social login button triggers guest login (name prompt) — **fully functional for testing**.

---

## 6. AI AGENT QUICKSTART

If you are an AI agent picking this system up cold, here is what you need:

**Q: Where is the entry point?**
`/var/www/kensgames.com/index.html` for the portal. `/var/www/kensgames.com/fasttrack/board_3d.html` for the game.

**Q: How do I add a new game to the portal?**
1. Ingest it: `ManifoldIngestor.ingest(gameData, { x: 'playerCount', y: 'playtime' })`
2. Add its entry to `LAUNCH_GAMES` array in `game_registry_manifold.js`
3. Drop game files into a subdirectory of `/var/www/kensgames.com/`

**Q: How does routing/discovery work?**
Everything is positioned by `token = z = x * y`. `ManifoldDiscoverySubstrate.getNearbyGames(id)` finds nearest neighbors by Euclidean distance in 3D manifold space. No database needed.

**Q: How do I read what a game/entity is?**
Read `entity.token`. It is the z-coordinate. All systems are keyed on it.

**Q: How do I run the tests?**
```bash
node /var/www/kensgames.com/js/substrates/test_manifold_ingestor.js
# → 30/30 passing
```
FastTrack game tests (browser): `https://kensgames.com/fasttrack/test_runner_ui.html` (78/78 passing)

**Q: How do I deploy?**
Files in `/var/www/kensgames.com/` are live immediately (nginx serves static files directly). For FastTrack engine changes: `bash deploy/push-to-vps.sh root` from the fasttrack source dir.

**Q: What's broken right now?**
BrickBreaker3D assets (`script.js`, `style.css`) are missing — game shell loads but game is not playable. Source files are on `C:\manifold` on the developer's laptop.

**Q: What does the surface math do?**
It positions entities in 3D space for the WebGL renderer (`gyroid.js`) and for Three.js visualization (`discover.html`). The surface values are not required for routing — only `token` matters for routing. Surface values matter for visualization and audio reactivity.

**Q: What is the manifold_ingestor.js surface normalization?**
Axes are scaled: `sx = (mx / 10) * π`, `sy = (my / 10) * π`, `sz = (mz / 100) * π` before feeding into gyroid/diamond formulas. This keeps surface values in meaningful ranges for typical game parameter values (players 1-6, playtime 10-60 min).

---

## 7. Key Invariants — Never Break These

1. **`z = x * y` is sacred.** Never substitute a different formula for the z primitive.
2. **Substrates are IIFEs.** Each substrate is a self-contained immediately-invoked function expression. No globals except the single exported name. No shared mutable state between substrates.
3. **`token` is always `manifold.z`.** If you cache or serialize an entity, preserve the token.
4. **The ingestor does not mutate source data.** `entity.source` is the original object reference.
5. **No OAuth credentials in source files.** Credentials go in `window.KENSGAMES_CONFIG` only, loaded separately.
6. **Dual export.** All substrate files must export to both `window.X` (browser) and `module.exports` (Node) for testability.

---

*Architecture: ButterflyFX Dimensional Substrate Pattern*
*Surface: Gyroid sin(x)cos(y)+sin(y)cos(z)+sin(z)cos(x) blended with Schwarz Diamond cos(x)cos(y)cos(z)−sin(x)sin(y)sin(z)*
*Primitive: z = x · y*
