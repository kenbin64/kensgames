  # KensGames Comprehensive 6-Game Product Spec (No-Code)

## 1. Purpose
This document defines the complete product specification for the five canonical KensGames titles and the shared KensGames portal experience.

This specification covers:
- game identity and rules
- themes, look and feel
- core UI elements and page layout
- players, pieces, and match structures
- landing pages and page copy
- game setup wizards
- modes-of-play wizards
- per-game launch button inventory (actual DOM buttons + handlers)
- common game setup structure
- required URL, filepath, and filename formats

Authoritative game seeds are in universe and are reflected here as product requirements.

## 2. Canonical Game Set (All 6 Games)

### 2.1 Canonical IDs, Names, and Slugs
1. fasttrack: FastTrack
2. brickbreaker3d: BrickBreaker 3D
3. 4dconnect: 4D Connect
4. starfighter: Starfighter
5. assemble: Assemble
6. cubic3d: Cubic

### 2.2 Current Path Reality and Canonical Route Rule
- Canonical public slug for the 4D game is 4dconnect.
- Existing implementation paths also include 4DTicTacToe.
- Product requirement: all player-facing links and copy must use 4D Connect / 4dconnect.
- Compatibility requirement: 4DTicTacToe remains an accepted legacy path until migration is complete.
- Cubic implementation lives at cubic3d/index.html; canonical public route is /cubic3d/.

## 3. Shared KensGames Experience

### 3.1 Product Principle
- The portal is public-first and conversion-focused.
- Browsing is open; participating in matches requires authentication.
- Setup complexity is hidden behind guided modal wizards.

### 3.2 Global Navigation and Shell
Global top navigation contains:
- KensGames logo
- Discover
- Lounge
- Game Directory
- Profile/Avatar area
- Login or Logout (state-aware)

Global footer contains:
- Terms of Service
- Privacy
- Support
- Community links
- Build/version string

### 3.3 Portal Information Architecture
Primary portal pages:
1. Home landing
2. Discover
3. Lounge
4. Showcase
5. Auth entry pages (login/register/verify/reset/forgot)

Per-game page family:
1. Game landing
2. Game lobby
3. Game play surface
4. Mode/setup overlays (wizard-driven)

## 4. Page and Layout Specification

### 4.1 Home Landing Page
Purpose:
- explain what KensGames is
- present all 5 games
- convert visitors into authenticated players

Required sections:
1. Hero section
2. Featured games strip (all 6)
3. How it works (Play in 3 steps)
4. Social proof / activity band
5. CTA band

Required hero text:
- Headline: "Six Games. One Arcade Universe."
- Subheadline: "Jump into FastTrack, BrickBreaker 3D, 4D Connect, Starfighter, Assemble, and Cubic with one account."
- Primary CTA: "Play Now"
- Secondary CTA: "Explore Games"

Play button behavior:
- Logged out: disabled visual state or intercept to login wizard
- Logged in: routes directly to selected game lobby

### 4.2 Discover Page
Purpose:
- help players find the right game by style, duration, and player count

Required elements:
- filter chips: pace, players, session length, solo/multiplayer
- game cards with tags and quick stats
- "Why this game" explanation module
- launch CTA per card

### 4.3 Lounge Page
Purpose:
- multiplayer aggregation hub

Required elements:
- active public lobbies by game
- friends/party presence panel
- recent results and leaderboard snapshot
- quick join actions

### 4.4 Game Landing Page (Per Game)
Purpose:
- teach game fantasy and loop before lobby entry

Required blocks:
1. game hero (name, tagline, key visual)
2. core loop in 3 bullets
3. mode cards
4. expected session length
5. player count
6. controls summary
7. "Play" CTA routing to lobby

### 4.5 Game Lobby Page (Per Game)
Purpose:
- single pre-match staging surface for all modes

Required lobby elements:
- game title and mode selector
- party panel (host, players, readiness)
- public queue panel (if applicable)
- invite code panel
- configuration summary card
- start/launch controls (host authority)

## 5. Visual Direction: Theme, Look, and Feel

### 5.1 Global KensGames Art Direction
- Bold arcade clarity, high contrast, immediate readability.
- Motion language: snappy, confidence-building, no sluggish transitions.
- Typography: display-forward headers, legible body text, strong numeric readability.
- UI style: dimensional surfaces, depth cues, clean spacing, low clutter.

### 5.2 Shared UX Tone
- energetic, friendly, competitive but non-toxic
- clear status language: ready, waiting, joined, approved, launching
- short action labels and strong verbs

### 5.3 Accessibility Baseline
- all key controls keyboard reachable
- clear focus state on interactive elements
- text contrast suitable for fast reading
- no game-critical info conveyed by color alone

## 6. Game Specifications (Rules, Themes, Elements, Players, Pieces, Launch Buttons)

### Common Game Setup Structure
All games share this flow. Individual steps may be implicit (inline) or explicit (wizard modal).

```
[Portal card PLAY button]
        ↓
[Game landing / entry page]
        ↓
[Auth gate] — logged out: login modal or guest bypass depending on mode
        ↓
[Mode selection] — solo / public match / private match / vs AI / co-op
        ↓
[Player configuration] — count, type (Human | AI | Bot), seat assignment
        ↓
[Match parameters] — ruleset, duration, board options (game-specific)
        ↓
[Ready / Launch] — host confirms, all seats filled or AI-padded
        ↓
[Play surface]
        ↓
[Post-match] — results, rematch, return to lobby
```

Auth gate rules:
- Solo / offline-vs-bot modes: guest play allowed, no account required.
- Public match / ranked / private invite: account required, gate to login wizard.
- Co-op and multiplayer: account required for host; guest join allowed via invite code on some games.

AI/bot seat behavior:
- FastTrack: host explicitly adds bot seats before launch.
- 4D Connect: all 4 player slots always present; any un-selected slot can be driven by AI (planned) or left for human keyboard player.
- Starfighter: ANPC enemies always present; co-op human seats require auth.
- BrickBreaker 3D, Assemble, Cubic: solo-first; multiplayer variants use lobby when available.

---

## 6.1 FastTrack
Game fantasy:
- A brisk peg race on a shared track with frequent lead changes.

Theme and tone:
- playful social competition, vintage arcade race energy.

Players:
- min 2, max 4
- solo variant allowed (time trial)
- spectating allowed

Pieces/elements:
- board (shared track)
- holes (single-occupancy positions)
- pegs (player-owned)
- turn phases (begin, decide, act, settle)

Core rules:
1. movement is forward toward finish
2. branch decisions are made by active player
3. capture returns opponent peg to start
4. first player to finish all pegs wins (default)
5. finished pegs cannot be captured

Primary modes:
- solo time trial
- private match with invite
- public match with host approval

Launch button inventory (fasttrack/lobby.html):

| Button / Action | Selector / Handler | Auth required | Description |
|---|---|---|---|
| Quick action: Public Game | `onclick="createPublicGame()"` | Yes | Creates public room, auto-fills bots if seats empty |
| Quick action: Private Game | `onclick="showCreatePrivateGame()"` | Yes | Opens create-private modal; generates invite code |
| Quick action: Join by Code | `onclick="showJoinByCode()"` | Yes | Opens join-by-invite-code modal |
| Quick action: vs Bots | `onclick="playOfflineWithAI()"` | No (guest) | Offline solo vs AI, bypasses auth gate |
| Play mode card: Public Game | `onclick="createPublicGame()"` | Yes | Same as quick action, in full mode card |
| Play mode card: Private Game | `onclick="showCreatePrivateGame()"` | Yes | Same as quick action, in full mode card |
| Play mode card: Join by Code | `onclick="showJoinByCode()"` | Yes | Same as quick action, in full mode card |
| Play mode card: Offline vs Bots | `onclick="playOfflineWithAI()"` | No (guest) | Same as quick action, in full mode card |
| Pre-auth: Play Offline vs Bots | `onclick="playOfflineWithAI()"` | No | Shown before login; bypasses auth entirely |
| Pre-auth: Join Private Game | `onclick="showPrivateGameJoin()"` | No | Opens join modal for guest invite-code entry |

Player setup: lobby seat panel — host selects player count (2–4), assigns each seat as Human or Bot before launch.

## 6.2 BrickBreaker 3D
Game fantasy:
- Deflect and destroy in a 3D breakout arena.

Theme and tone:
- polished arcade impact, rhythmic volley flow.

Players:
- min 1, max 4
- solo campaign default
- versus/co-op variants allowed
- spectating allowed

Pieces/elements:
- paddle
- ball(s)
- brick field
- power-ups
- life/ball state

Core rules:
1. paddle deflects ball to keep it in play
2. bricks are cleared through impact
3. power-ups modify trajectory, control, or scoring potential
4. loss state is all balls lost before clear condition
5. victory is field clear or top score in multiplayer variant

Primary modes:
- solo campaign
- score attack
- versus score race
- co-op clear

Launch button inventory (brickbreaker3d/):

| Button / Action | Location | Auth required | Description |
|---|---|---|---|
| PLAY (portal card) | index.html portal card | No | Routes to `/brickbreaker3d/` landing |
| Play Solo | brickbreaker3d/index.html landing CTA | No | Direct to solo play surface |
| Multiplayer Lobby | brickbreaker3d/lobby.html | Yes | Opens seat selection for 2–4 player match |

Player setup: mode selection on landing page or lobby; solo is default.

## 6.3 4D Connect
Game fantasy:
- Place and align pieces across four-dimensional relationships.

Theme and tone:
- abstract geometric strategy, deliberate threat reading.

Players:
- min 2, max 2
- solo vs ANPC allowed
- spectating allowed

Pieces/elements:
- 4D board representation
- player pieces
- axis/face visualization aids
- turn-based placement system

Core rules:
1. players alternate placing one piece per turn
2. victory is required alignment along a valid 4D axis
3. board fill with no alignment is draw
4. full-board visibility is required
5. strategic blocking and threat-building are required gameplay primitives

Primary modes:
- local hot-seat (1–4 human players, keyboard 1–4 to switch)
- ranked duel
- casual duel
- solo vs ANPC
- puzzle/challenge boards (optional extension)

Launch button inventory (4DTicTacToe/index.html):

| Button / Action | Selector / Handler | Auth required | Description |
|---|---|---|---|
| PLAY (portal card) | index.html portal card `goToGame('/4DTicTacToe/')` | No | Routes to 4D game surface |
| Player card click | `card.addEventListener('click', () => selectPlayer(playerId))` | No | Selects active player 1–4 |
| Key 1–4 | keyboard listener → `selectPlayer(n)` | No | Switch active player by keyboard |
| CAM: FOLLOW | `#cam-btn` ctrl-btn | No | Toggles follow-ball vs free camera |
| RESET VIEW | `#reset-view-btn` ctrl-btn | No | Returns camera to default position |
| NEW GAME | `#new-game-btn` ctrl-btn (danger) | No | Resets board, scores, all 4 players |
| REMATCH | `#rematch-btn` (in win overlay) | No | Re-starts with same player config |
| NEW GAME (overlay) | `#overlay-new-game-btn` (in win overlay, danger) | No | Full reset from win overlay |

Player setup: all 4 player slots are always on-board. Click a player card or press key 1–4 to select which player is
currently dropping. Each player has a color (Ruby Red P1, Sapphire Green P2, Royal Purple P3, Gold P4). AI auto-play
per player is a planned extension; current build is hot-seat only.

## 6.4 Starfighter
Game fantasy:
- High-speed dogfights in shared arenas.

Theme and tone:
- loud kinetic arcade combat, twitch skill expression.

Players:
- min 1, max 8
- solo vs ANPC allowed
- spectating allowed

Pieces/elements:
- pilot ship
- arena geometry
- weapon systems
- movement model (thrust, turn, evade)
- match scoreboard/objective tracker

Core rules:
1. pilots score through kills/objective completion
2. match ends when objective threshold is reached or timer expires
3. respawn rules are mode-dependent
4. positioning and momentum are central skill determinants
5. kill feedback must be immediate and readable

Primary modes:
- solo skirmish vs ANPC waves (default, no auth)
- co-op squadron (2–4 human + ANPC enemies, auth required)
- free-for-all
- team battle
- objective control

Launch button inventory (starfighter/index.html):

| Button / Action | Selector / Handler | Auth required | Description |
|---|---|---|---|
| PLAY SOLO ▶ FREE | `#solo-btn` `onclick="KG_LANDING.playSolo(this)"` | No (guest) | Launches solo ANPC skirmish immediately |
| SIGN IN FOR CO-OP | `<a href="/login/index.html">` | — | Routes to auth; after login returns to co-op setup |
| JOIN (invite code) | `onclick="KG_LANDING.openInviteJoin(inviteCodeValue)"` | No (guest join) | Joins private co-op game by 6-char invite code |
| SKIP TRAINING | `onclick="Starfighter._skipTraining()"` (in-game) | — | Skips training mission |
| PAUSE ⏸ | `onclick="Starfighter.togglePause()"` (in-game HUD) | — | Pause/resume |
| ← LEAVE GAME | `onclick="Starfighter.exitGame()"` (in-game HUD) | — | Returns to landing |
| Emergency RTB | `onclick="Starfighter.emergencyRTB()"` (in-game) | — | Warps ship to base |
| Call Tanker | `onclick="Starfighter.callTanker()"` (in-game) | — | Requests fuel resupply |
| Call Medic | `onclick="Starfighter.callMedic()"` (in-game) | — | Requests hull repair |
| RESCUE | `onclick="SFRescue.requestRescue()"` (in-game) | — | Distress beacon |
| Deploy CM | `onclick="SFThreatSys.deployCM()"` (in-game) | — | Countermeasures |
| ▶ CLICK TO RESUME | `#fs-resume` `onclick="SFInput.enterImmersive()"` | — | Re-enters fullscreen pointer lock |

Player setup: solo requires no config; co-op host creates private room and shares 6-char code.

## 6.5 Assemble
Game fantasy:
- Fit parts into complete items under turn or time constraints.

Theme and tone:
- tactile satisfying construction puzzle-play.

Players:
- min 1, max 4
- solo free-build allowed
- spectating allowed

Pieces/elements:
- part pool
- target assemblies
- fit validation system
- completion scoring

Core rules:
1. valid fits advance item completion
2. invalid fits consume opportunity (turn/time)
3. completed items grant score
4. win by highest score or target completion condition
5. tie state is valid when scores match at end

Primary modes:
- solo free-build (default, no auth)
- timed build race
- turn-based build match
- co-op assembly challenge

Launch button inventory (assemble/index.html):

| Button / Action | Selector / Handler | Auth required | Description |
|---|---|---|---|
| PLAY (portal card) | `goToGame('/assemble/')` | No | Routes to Assemble free-build tool |
| 💡 Battery + Bulb | `onclick="loadFeatured('battery_bulb')"` | No | Loads starter electrical build |
| 🌀 Motor + Fan | `onclick="loadFeatured('motor_fan')"` | No | Loads starter mechanical build |
| ♨ Boiler + Gauge | `onclick="loadFeatured('boiler_gauge')"` | No | Loads starter pressure build |
| 📍 SNAP: ON/OFF | `#btn-snap` `onclick="toggleSnap()"` | No | Toggles magnetic part snapping |
| 🧲 AUTO-CONNECT: ON/OFF | `#btn-autoconnect` `onclick="toggleAutoConnect()"` | No | Toggles auto-joint detection |

Player setup: free-build is single-player; multiplayer modes use a lobby (planned) with seat count 1–4.

## 6.6 Cubic
Game fantasy:
- 3D Tetris — polycube pieces descend into a 4×4×20 glass tower. Clear full layers to survive.

Theme and tone:
- dark sci-fi, precise, meditative under pressure. Jewel-tone glass pieces against void.

Players:
- min 1, max 1 (solo)
- no multiplayer in v1.0

Pieces/elements:
- 7 polycube piece types (I, O, T, S, Z, J, L) defined in XZ-plane
- 4×4×20 well (COLS=4, DEPTH=4, ROWS=20)
- ghost piece (semi-transparent hard-drop preview)
- next-piece preview (separate mini Three.js scene, auto-rotates)
- layer-clear animation

Core rules:
1. gravity pulls active piece downward; rate accelerates with level
2. player rotates on two axes (Y and X) and translates on X and Z
3. piece locks after 0.5 s on-surface or hard drop
4. clearing a full 4×4 horizontal layer scores and shifts board down
5. game ends when a new piece cannot spawn (tower full)

Scoring:
- single: 100×level, double: 300×level, triple: 500×level, quad: 800×level
- hard drop: +2×distance, soft drop: +gravity×dt per frame

Primary modes:
- solo survival (single mode in v1.0)

Launch button inventory (cubic3d/index.html):

| Button / Action | Selector / Handler | Auth required | Description |
|---|---|---|---|
| PLAY CUBIC (portal card) | `goToGame('/cubic3d/')` | No | Routes to Cubic game surface |
| START GAME | `#start-btn` `addEventListener('click')` state=menu | No | Starts new game from menu |
| PLAY AGAIN | `#start-btn` (re-labelled) state=gameover | No | Restarts after game over |

Keyboard controls:

| Key | Action |
|---|---|
| ← / → | Move piece on X axis |
| ↑ / ↓ | Move piece on Z axis (depth) |
| A / D | Rotate piece on Y axis |
| W / S | Rotate piece on X axis |
| Space | Hard drop (instant lock) |
| Shift | Soft drop (accelerated descent) |
| P | Pause / resume |
| Drag / scroll | Orbit camera |

Player setup: no configuration — single player, game begins immediately on START.

Manifold registration:
- dimension: x=4 (cols), y=4 (depth), z=16 (cells/layer, z=x×y ✓)
- expression: z = x·y
- substrate: Gyroid (well visual skin)
- lens: Schwartz Diamond (wall geometry, read-only)

---

## 7. Setup Wizard Specification (All Games)

### 7.1 Wizard Entry Points
Wizard opens from:
- Play click on game card (portal home, discover, lounge)
- Create Match quick-action in game lobby
- Join Match from lounge/discover/lobby
- Invite code entry box on game landing page (Starfighter, FastTrack)

Wizard is NOT used for:
- Cubic: single-player only, no config needed; START GAME is the full entry.
- Assemble free-build: no opponent config; just opens the tool.
- Starfighter solo: no config; PLAY SOLO ▶ FREE launches directly.

### 7.2 Wizard Step Model
Standard setup wizard steps:
1. Select mode
2. Select player count and team structure
3. Select privacy (public/private/friends/invite-only)
4. Select ruleset and match options
5. Review and create

### 7.3 Host Controls
Host can define:
- seat count within game bounds
- mode-specific parameters
- whether join approval is required
- invite code generation/expiration behavior

### 7.4 Validation Rules
- cannot exceed game max players
- required fields must be complete before create
- private/invite modes must produce valid invite artifact
- invalid configurations are blocked with clear reason text

## 8. Modes of Play Wizard Specification

### 8.1 Global Mode Taxonomy
Every game supports applicable subsets of these modes. Auth column reflects current implementation.

| Mode | FastTrack | BrickBreaker | 4D Connect | Starfighter | Assemble | Cubic |
|---|---|---|---|---|---|---|
| Solo / Single-player | ✓ (time trial) | ✓ (campaign) | ✓ (hot-seat) | ✓ (vs ANPC) | ✓ (free-build) | ✓ (survival) |
| vs AI / Bot | ✓ no-auth | planned | planned | ✓ ANPC | planned | — |
| Public Match | ✓ auth | ✓ auth | planned | planned | planned | — |
| Private / Invite Code | ✓ auth | planned | planned | ✓ guest join | planned | — |
| Co-op | — | ✓ auth | — | ✓ auth | ✓ auth | — |
| Ranked | planned | planned | ✓ auth | planned | planned | — |
| Casual | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Tournament | optional | optional | optional | optional | optional | — |

### 8.2 Mode Wizard Copy Requirements
Per mode card, include:
- mode name
- one-line promise
- expected duration
- player count range
- whether progression/ranking is affected

### 8.3 Join Flow Outcomes
- approved join: player enters lobby with ready toggle
- pending join: waits in pending state panel
- denied join: receives reason and rejoin options
- invalid invite: clear error and retry path

## 9. Landing and In-Flow Text Specification

### 9.1 Global CTA Text
- Primary: Play Now
- Secondary: Explore Games
- Tertiary: Learn the Rules

### 9.2 Core Status Text
- Waiting for Host
- Pending Approval
- Ready
- Not Ready
- Match Starting
- Invite Code Copied
- Invalid Invite Code

### 9.3 Empty-State Text
- Lounge empty: "No public matches live right now. Start one and set the pace."
- Discover no results: "No games match those filters. Clear filters to see all five games."
- Lobby no players: "You are first in this lobby. Invite players or switch to public."

## 10. URL, Filepath, and Filename Format Standards

## 10.1 URL Format (Canonical)
Portal-level:
- /
- /discover
- /lounge
- /showcase
- /login
- /register
- /forgot-password
- /reset-password
- /verify-email

Per-game canonical:
- /{game-slug}/
- /{game-slug}/lobby
- /{game-slug}/play
- /{game-slug}/modes
- /{game-slug}/rules

Allowed game-slug values:
- fasttrack
- brickbreaker3d
- 4dconnect
- starfighter
- assemble
- cubic3d

Compatibility alias (temporary):
- /4DTicTacToe/* redirects to /4dconnect/*

## 10.2 Filepath Format (Canonical)
Root portal pages:
- kensgames-portal/manifold/index.html
- kensgames-portal/manifold/discover.html
- kensgames-portal/manifold/lounge.html
- kensgames-portal/manifold/showcase.html

Per-game pages:
- kensgames-portal/manifold/{game-slug}/index.html
- kensgames-portal/manifold/{game-slug}/lobby.html  (not required for solo-only games)
- kensgames-portal/manifold/{game-slug}/play.html   (not required when play surface is index.html)

Seed identity files:
- universe/games/{game-slug}/{game-slug}.x.json

Cubic-specific paths:
- cubic3d/index.html          — play surface (menu + game + gameover in one page)
- cubic3d/manifold.game.json  — manifold registration

## 10.3 Filename Format Rules
- lowercase kebab-case for new route-oriented filenames
- keep .x.json naming for universe seed filesyes aatThe
- avoid mixed-case game directory names for new work
- reserve uppercase-only exceptions for legacy compatibility paths

## 10.4 Naming and ID Rules
- One canonical ID per game.
- One canonical slug per game.
- Display names may include spaces/case styling.
- URLs and directories must use canonical slug.

## 11. Game Card and Lobby Element Inventory

### 11.1 Required Game Card Elements
- game title
- one-line description
- player count
- duration
- mode tags
- state badge (solo, multiplayer, ranked, NEW for new games)
- play CTA

### 11.0 Portal Launch Button Summary (All 6 Games)

| Game | Portal Card CTA | Routes to | Guest play? |
|---|---|---|---|
| FastTrack | PLAY FASTTRACK ▶ | /fasttrack/ | Bot mode only |
| BrickBreaker 3D | PLAY BRICKBREAKER ▶ | /brickbreaker3d/ | Yes (solo) |
| 4D Connect | PLAY 4D TICTACTOE ▶ | /4DTicTacToe/ | Yes (hot-seat) |
| Starfighter | PLAY STARFIGHTER ▶ | /starfighter/ | Yes (PLAY SOLO ▶ FREE) |
| Assemble | BUILD CONTRAPTION ▶ | /assemble/ | Yes (free-build) |
| Cubic | PLAY CUBIC ▶ | /cubic3d/ | Yes (solo, START GAME) |

### 11.2 Required Lobby Elements
- host identity
- seat list and readiness
- mode summary
- rule summary snapshot
- invite controls
- start conditions checklist

## 12. Match Lifecycle Requirements
1. Discover/select game
2. Enter game landing
3. Enter lobby
4. Complete setup wizard
5. Fill seats and ready-up
6. Launch match
7. Complete match
8. Return to results and replay options

Post-match requirements:
- show placement and stats
- offer rematch with same settings
- offer return to lounge
- offer mode switch without full re-entry

## 13. Compliance Matrix (What Must Be True)
1. All 6 games are represented in navigation, discovery, and the portal home arcade wall + featured games grid.
2. Each game has at minimum a landing/entry page and a play surface.
3. Multiplayer games have lobby and invite-code join flows.
4. Solo-first games (Cubic, Assemble, BrickBreaker solo) are plaD W      yable without auth.
5. Setup and mode selection are wizard-driven and consistent for multiplayer games.
6. URL and filepath patterns are predictable and canonical.
7. Legacy 4DTicTacToe paths remain compatible during migration.
8. Game-specific rules preserve each game's identity and invariants.
9. Every game satisfies the manifold axiom z = x·y in its manifold.game.json dimension block.
10. All portal card play buttons use goToGame('/{slug}/') pattern.

## 14. Acceptance Criteria
1. A new user can understand each game in under 30 seconds from its landing page.
2. A logged-in user can create a valid multiplayer match in under 20 seconds via wizard.
3. A guest user can start a solo session in under 10 seconds (no auth, no wizard, one button).
4. A friend can join private play using invite flow without ambiguity.
5. Every game route and file path follows canonical naming rules.
6. No page depends on hidden game-specific setup logic outside the wizard model.
7. The portal home arcade wall shows all 6 console cards.
8. The portal home featured games grid shows all 6 game cards with correct CTAs.
9. Cubic START GAME button is present and functional at /cubic3d/.
10. FastTrack lobby shows all 4 quick-action play-mode buttons before and after auth.

## 15. Source Alignment Notes
This spec aligns with existing canonical identity files and portal configuration, including:
- universe game seeds for fasttrack, brickbreaker3d, 4dconnect, starfighter, assemble
- manifold.portal.json game registry (6 games including cubic3d)
- per-game manifold.game.json files
- portal game registry and page inventory
- gameplay onboarding flow principles (public browse, auth-to-play, lobby-first setup)

If implementation and this spec diverge, the product decision process should update this document and the corresponding universe seeds together.

## 16. Human vs AI Player Setup — Per-Game Reference

| Game | Human seats | AI/Bot seats | Config surface | Notes |
|---|---|---|---|---|
| FastTrack | 2–4 | 0–3 (fill to 4) | Lobby wizard | Host explicitly adds bots; `playOfflineWithAI()` = all bots |
| BrickBreaker 3D | 1–4 | 0–3 | Lobby (planned) | Solo default; bots fill empty seats |
| 4D Connect | 1–4 | planned | Inline — player cards | All 4 slots always present; AI planned per slot |
| Starfighter | 1–4 | ANPC enemies always | Landing page | Co-op humans join via invite code; enemies are always AI |
| Assemble | 1–4 | planned | Lobby (planned) | Free-build is solo; competitive modes need lobby |
| Cubic | 1 | 0 | None (single-player only) | No opponent; gravity is the adversary |
