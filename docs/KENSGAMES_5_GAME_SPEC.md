# KensGames Comprehensive 5-Game Product Spec (No-Code)

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
- required URL, filepath, and filename formats

Authoritative game seeds are in universe and are reflected here as product requirements.

## 2. Canonical Game Set (All 5 Games)

### 2.1 Canonical IDs, Names, and Slugs
1. fasttrack: FastTrack
2. brickbreaker3d: BrickBreaker 3D
3. 4dconnect: 4D Connect
4. starfighter: Starfighter
5. assemble: Assemble

### 2.2 Current Path Reality and Canonical Route Rule
- Canonical public slug for the 4D game is 4dconnect.
- Existing implementation paths also include 4DTicTacToe.
- Product requirement: all player-facing links and copy must use 4D Connect / 4dconnect.
- Compatibility requirement: 4DTicTacToe remains an accepted legacy path until migration is complete.

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
2. Featured games strip (all 5)
3. How it works (Play in 3 steps)
4. Social proof / activity band
5. CTA band

Required hero text:
- Headline: "Five Games. One Arcade Universe."
- Subheadline: "Jump into FastTrack, BrickBreaker 3D, 4D Connect, Starfighter, and Assemble with one account."
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

## 6. Game Specifications (Rules, Themes, Elements, Players, Pieces)

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
- ranked duel
- casual duel
- solo vs ANPC
- puzzle/challenge boards (optional extension)

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
- free-for-all
- team battle
- objective control
- solo skirmish vs ANPC

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
- solo free-build
- timed build race
- turn-based build match
- co-op assembly challenge

## 7. Setup Wizard Specification (All Games)

### 7.1 Wizard Entry Points
Wizard opens from:
- Play click on game card
- Create Match in game lobby
- Join Match from lounge/discover/lobby

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
Every game should support applicable subsets of:
1. Solo
2. Public Match
3. Private Match
4. Invite Code Match
5. Ranked
6. Casual
7. Practice/Training
8. Tournament (optional per game)

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
- kensgames-portal/manifold/{game-slug}/lobby.html
- kensgames-portal/manifold/{game-slug}/play.html

Seed identity files:
- universe/games/{game-slug}/{game-slug}.x.json

## 10.3 Filename Format Rules
- lowercase kebab-case for new route-oriented filenames
- keep .x.json naming for universe seed files
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
- state badge (solo, multiplayer, ranked)
- play CTA

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
1. All 5 games are represented in navigation and discovery.
2. Each game has landing, lobby, and play entry points.
3. Setup and mode selection are wizard-driven and consistent.
4. URL and filepath patterns are predictable and canonical.
5. Legacy 4DTicTacToe paths remain compatible during migration.
6. Game-specific rules preserve each game’s identity and invariants.

## 14. Acceptance Criteria
1. A new user can understand each game in under 30 seconds from its landing page.
2. A logged-in user can create a valid match in under 20 seconds via wizard.
3. A friend can join private play using invite flow without ambiguity.
4. Every game route and file path follows canonical naming rules.
5. No page depends on hidden game-specific setup logic outside the wizard model.

## 15. Source Alignment Notes
This spec aligns with existing canonical identity files and portal configuration, including:
- universe game seeds for fasttrack, brickbreaker3d, 4dconnect, starfighter, assemble
- portal game registry and page inventory
- gameplay onboarding flow principles (public browse, auth-to-play, lobby-first setup)

If implementation and this spec diverge, the product decision process should update this document and the corresponding universe seeds together.
