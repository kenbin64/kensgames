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
