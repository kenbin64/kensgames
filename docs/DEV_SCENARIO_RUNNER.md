# Dev Scenario Runner

This is a localhost-only, development-only realtime runner for code execution, live rendering, simulation, and capture.

## What It Does

- Runs a live game page inside an iframe and auto-reloads when code files change.
- Lets you execute custom JavaScript directly in the running game frame.
- Streams live watch values (session/manifold/runtime expressions).
- Runs multiplayer simulation scenarios via a backend runner process.
- Records gameplay/cutscenes/promotional captures directly from the iframe.

## Files

- `dev-scenario-runner.html`
- `server/dev-runner-server.js`
- `scripts/dev-scenario-cli.js`

## Dev-Only Safety

- `server/dev-runner-server.js` exits immediately when `NODE_ENV=production`.
- `dev-scenario-runner.html` blocks UI access when not on `localhost` or `127.0.0.1`.
- Server binds to `127.0.0.1` by default.

## Start It

From repository root:

```bash
# Terminal 1: static web host
python3 -m http.server 8000

# Terminal 2: game lobby backend (if not already running)
node server/lobby-server.js

# Terminal 3: dev runner control server
node server/dev-runner-server.js
```

Then open:

- `http://localhost:8000/dev-scenario-runner.html`

## Use It

### 1) Realtime code runner

- Pick target app (FastTrack/Starfighter/BrickBreaker page).
- Edit JavaScript in the Code Runner panel.
- Click **Run In Frame**.
- Keep **Auto run** and **Auto reload** enabled for live behavior on file saves.

### 2) Realtime scenarios (for you and AI workflows)

- Set game, human count, duration, tick, and actions per tick.
- Click **Run Scenario**.
- Runner streams stdout/stderr in live logs.
- Scenario transcript is saved to:
  - `state/simulations/sim-<timestamp>-<game>.json`

### 3) Recording for promotions/simulations

- Click **Start Recording**.
- Optional auto-stop in seconds.
- Click **Stop + Save** to download `.webm`.

## Scenario Notes

`dev-scenario-cli.js` currently drives multiplayer sessions by:

- guest login for simulated humans
- create private session / join by code
- ready up / accept lobby / start game
- send repeated `game_action` payloads during runtime
- save transcript JSON for playback/review workflows

## AI Automation Hooks

AI agents can use this runner by:

- posting websocket commands to `ws://127.0.0.1:8766`
- sending `run_scenario`, `stop_job`, `ping`, and `list_scenarios`
- reading streamed `job_log`, `file_changed`, and `job_exit` events
