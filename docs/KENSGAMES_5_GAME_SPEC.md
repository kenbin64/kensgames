# KensGames Comprehensive 4-Game Product Spec (No-Code)

> **Hard-rule precedence:** [`HARD_RULES.md`](HARD_RULES.md) is the source
> of truth for product constraints (viewport/scroll, wizard sharing,
> multiplayer modes, auth, no-duplication). This spec has been reconciled
> to align with HARD_RULES; if any future drift is detected, HARD_RULES
> wins. Read HARD_RULES.md first.

## 0. Revision Changelog (Compact)
- Version: 4-game-revision-1
- Date: 2026-04-30
- Changed:
  - Canonical live game set reduced to four games.
  - Added Prime Directive and full lobby integrity/verification model.
  - Added REST and Socket.IO contract guidance for lobby synchronization.
  - Corrected landing behavior: 3 featured cards in viewport, then full and coming soon lists.
- Added:
  - X-Dimensional proof-of-concept statement and dedicated navigation/detail page requirement.
  - Creator and credits section for platform, games, website, and art.
- Removed from live canonical set:
  - Assemble
  - Cubic

## 1. Purpose
This document defines the complete product specification for the four canonical KensGames titles and the shared KensGames portal experience.

This specification covers:
- game identity and rules
- themes, look and feel
- core UI elements and page layout
- players, pieces, and match structures
- landing pages and page copy
- game setup wizards
- multiplayer lobby model and validation rules
- REST + Socket.IO interaction model
- per-game launch button inventory (actual DOM buttons + handlers)
- required URL, filepath, and filename formats

If implementation and this spec diverge, this spec is the product source of truth until superseded.

### 1.1 X-Dimensional Proof-of-Concept Statement
KensGames Portal is a proof of concept for X-Dimensional programming, a unique programming paradigm where mathematical manifolds are treated as the source of truth rather than conventional bit/byte-first persistence models.

### 1.2 Creator and Attribution
- Created by Kenneth Bingham.
- Role credit: Kenneth Bingham, Software Engineer.
- Credit requirement: games, website, and art paintings are credited to Kenneth Bingham in product-facing credits and legal/about surfaces.

## 2. Prime Directive (AI + System)

### 2.1 Prime Directive
Always preserve a valid, fair, fully initialized game state for all players, and never launch a game unless every required player (human or bot) is correctly registered, visible, and ready. When that cannot be guaranteed, gracefully fall back to a clearly explained Play with Bots experience.

### 2.2 Supporting Principles
- Identity first: always resolve game identity, player identity, host identity, bot identity, and session identity.
- State integrity: no launch unless lobby state is coherent and complete.
- Transparency: every lobby change is broadcast to all connected clients.
- Graceful degradation: when launch validation fails or a game cannot be started, offer "Game not available at this time. Play with Bots instead?"
- Autonomy and control:
  - Host controls create game, invite, add/remove bots, remove players, launch.
  - Guest controls display name, avatar, and ready state.

## 3. Canonical Game Set (4 Games)

### 3.1 Canonical IDs, Names, and Slugs
1. fasttrack: FastTrack
2. brickbreaker3d: BrickBreaker 3D
3. 4dconnect: 4D Connect
4. starfighter: Starfighter

### 3.2 Route and Legacy Compatibility Rules
- Canonical public slug for the 4D game is 4dconnect.
- Existing implementation paths include 4DTicTacToe.
- Player-facing labels should use 4D Connect.
- Compatibility rule: /4DTicTacToe/* remains a temporary accepted legacy path until migration to /4dconnect/* is complete.

## 4. Shared KensGames Experience

### 4.1 Product Principle
- Portal is public-first and conversion-focused.
- Browsing is open.
- Landing (`/`) and invite-join (`/join`) are reachable without sign-in (HARD_RULES HR-13).
- Guest play is allowed for: solo, solo-with-bots, invite-join, hosting a private invite-code match, and joining/hosting a casual public match (HR-13, HR-16).
- Account is required only for persistent features: profile, friends, leaderboards, ranked matches (HR-16).
- Display name + avatar are mandatory before joining any match, guest or registered (HR-14).
- Registration is invited (not required) at the post-match prompt (HR-15); guest identity is claimable into the new account (HR-17.4).
- Setup complexity is guided through the **single shared sequential wizard** used by every game (HR-7, HR-9). One decision per step; never present the entire form at once.

### 4.2 Global Navigation and Shell
Global top navigation contains:
- KensGames logo
- Discover
- Lounge
- Game Directory
- X-Dimensional
- Profile/Avatar area
- Login or Logout (state-aware)

Global footer contains:
- Terms of Service
- Privacy
- Support
- Community links
- Build/version string

### 4.3 Portal Information Architecture
Primary portal pages:
1. Home landing
2. Discover
3. Lounge
4. Showcase
5. X-Dimensional detail page (paradigm explainer)
6. Auth entry pages (login/register/verify/reset/forgot)

Per-game page family:
1. Game landing
2. Game lobby
3. Game play surface
4. Mode/setup overlays (wizard-driven)

## 5. Landing, Discover, Lounge Layout Rules

### 5.1 Home Landing Page Purpose
- explain what KensGames is
- present the four live canonical games
- convert visitors into authenticated players

### 5.2 Home Landing Required Sections
1. Hero section
2. Featured games viewport strip
3. Full games list
4. Coming soon games list
5. How it works (Play in 3 steps)
6. Social proof/activity band
7. CTA band

### 5.3 Home Hero Copy
- Headline: "Four Games. One Arcade Universe."
- Subheadline: "Jump into FastTrack, BrickBreaker 3D, 4D Connect, and Starfighter with one account."
- Primary CTA: "Play Now"
- Secondary CTA: "Explore Games"

### 5.4 Featured + Full List Layout Correction (Authoritative)
- First viewport section shows exactly 3 featured game cards in a horizontal strip.
- Immediately below featured, show full list of games and coming soon games.
- On large monitors:
  - full list uses 3 cards per row grid.
  - coming soon uses 3 cards per row grid.
- On smartphones:
  - lists collapse to a horizontal card carousel.
  - one full-screen panel shown at a time.
- Horizontal behavior rule (all breakpoints):
  - no freeform page panning to the right.
  - horizontal movement is only inside controlled card rails/carousels.
  - vertical page scroll remains allowed for section-to-section reading.

### 5.5 Discover Page
Purpose:
- help players find the right game by style, duration, and player count

Required elements:
- filter chips: pace, players, session length, solo/multiplayer
- game cards with tags and quick stats
- Why this game explanation module
- launch CTA per card

### 5.6 Lounge Page
Purpose:
- multiplayer aggregation hub

Required elements:
- active public lobbies by game
- friends/party presence panel
- recent results and leaderboard snapshot
- quick join actions

## 6. Conceptual Lobby Model

### 6.1 Core Objects

GameType:
- id: fasttrack | starfighter | 4dtictactoe | brickbreaker3d
- name: display name
- minPlayers: integer
- maxPlayers: integer
- supportsBots: boolean
- supportsSolo: boolean

GameInstance:
- id: UUID
- gameTypeId: reference to GameType
- hostId: playerId
- code: short join code (for example 6 chars)
- joinUrl: full URL with code
- status: lobby | starting | inProgress | cancelled | completed
- players: array of PlayerSlot
- createdAt, updatedAt

Player:
- id: UUID persisted per device
- displayName: string
- avatarId: string
- isHost: boolean
- isBot: boolean
- deviceId/clientId: verification identity

PlayerSlot:
- slotIndex: 0..3
- playerId: nullable
- readyState: notReady | ready
- isHostSlot: boolean

### 6.2 High-Level Flows

Landing page:
- each game card offers Play Solo with AI and Create Private Game

Create private game (host):
1. Host taps Create Private Game.
2. System creates GameInstance with status=lobby and host in slot 0.
3. System generates code and joinUrl.
4. UI shows:
   - panel A: game name, code, URL, Copy URL, Manage Guests
   - panel B: 4-slot player grid with host crown in slot 0
   - Add Bot button
   - Launch Game button (disabled until valid)

Guest join:
1. Guest opens joinUrl.
2. If local Player identity is missing, prompt for name + avatar and persist.
3. Guest joins lobby and is assigned first free slot.
4. Guest sees own slot plus all other slots in real time.

Ready system:
- host can remove any non-host player or bot.
- guests can toggle only their own ready state.
- Launch Game enables only when:
  - playerCount >= gameType.minPlayers
  - every occupied slot is ready
  - GameInstance status is lobby

## 7. Technical Instructions (REST + Socket.IO)

### 7.1 REST Endpoints

Player identity:
- POST /api/player
  - body: { displayName, avatarId }
  - returns: { playerId }
- GET /api/player/me

Game lifecycle:
- POST /api/games
  - body: { gameTypeId }
  - auth: host playerId
  - returns: GameInstance with host in slot 0
- GET /api/games/:code
- POST /api/games/:id/join
  - body: { playerId }
- POST /api/games/:id/add-bot
- POST /api/games/:id/remove-player
  - body: { slotIndex }
- POST /api/games/:id/set-ready
  - body: { playerId, ready: boolean }
- POST /api/games/:id/launch

Launch verification on POST /api/games/:id/launch:
1. status must be lobby
2. player count must meet minPlayers
3. occupied slots must have non-null player identity
4. occupied slots must all be ready

Validation failure response:
- do not transition to inProgress
- return clear error message:
  - "Game not available at this time. Play with Bots instead?"

Fallback behavior when Play with Bots is accepted:
- create a new GameInstance with host plus bot-filled required slots
- bots auto-ready
- allowed only when GameType.supportsBots = true

### 7.2 Socket.IO Events
Namespace: /games

Server -> Client events:
- lobby_state (full snapshot)
- player_joined
- player_left
- player_ready_changed
- player_removed
- bot_added
- game_status_changed (lobby -> starting -> inProgress)
- error

Client -> Server events:
- join_lobby { gameId, playerId }
- set_ready { gameId, playerId, ready }
- add_bot { gameId }
- remove_player { gameId, slotIndex }
- launch_game { gameId }

Rule:
- every lobby mutation is broadcast so all clients see the same synchronized 4-slot grid.

## 8. Mobile-First UI Rules

### 8.1 Viewport and Stacking
- Main gameplay area must fit smartphone viewport.
- If needed, scale board/canvas to fit width and height.
- Mobile vertical order:
  1. game header
  2. main play area
  3. player controls
- Player controls anchored at bottom and must not obscure the board/arena.

### 8.2 Landing Page Card Behavior
- mobile uses full-width card rails.
- action buttons are full width:
  - Play Solo with AI
  - Create Private Game

### 8.3 Lobby Page Structure
Top section:
- game name
- join code (large)
- join URL and Copy URL button
- Manage Guests button

Middle section:
- 4-slot player grid
- slot 0 host with crown icon
- slot rows show avatar, name, ready indicator (amber/green)
- host sees Remove button for non-host slots
- Add Bot button below grid

Bottom section:
- Launch Game full-width button
- disabled until min players + all occupied ready

### 8.4 Font and Tap Targets
- smartphone base text should target 12pt where possible
- allowed minimum text is 8pt in constrained layouts
- critical text (buttons, join code, status) should remain at least 12pt
- tap targets minimum 44px height

### 8.5 Visual States
- Ready indicator:
  - amber = not ready
  - green = ready
- Launch button disabled labels:
  - Waiting for players to be ready
  - Need at least 2 players
- Error fallback dialog:
  - Game not available at this time. Play with Bots instead?
  - Actions: Play with Bots, Cancel

## 9. Game Specifications (4 Canonical Games)

### 9.1 Common Setup Flow
[Portal card Play] -> [Game landing] -> [Identity step (name + avatar)] -> [Mode selection] -> [Player configuration (human/bot)] -> [Match options] -> [Ready/Launch] -> [Play surface] -> [Post-match (registration invite for guests)]

This flow is implemented by the single shared wizard (HR-7); each bracketed segment is one wizard step (HR-9).

Identity & auth rules (HR-13–17):
- Identity step (name + avatar) is mandatory for all players, guest or registered.
- Solo, solo-with-bots, invite-join, private invite-code hosting, and casual public matches: guest allowed.
- Ranked matches and persistent-profile features: account required (passkey / OAuth / magic link per HR-17).
- Account-required steps prompt sign-in inline; the wizard does not redirect to a separate auth page.

### 9.2 FastTrack
Game fantasy:
- brisk peg race with frequent lead changes

Players:
- min 2, max 4
- solo variant allowed
- spectating allowed

Primary modes:
- solo time trial
- private invite match
- public host-approved match

Launch button inventory (fasttrack/lobby.html):

| Button / Action | Selector / Handler | Auth required | Description |
|---|---|---|---|
| Quick action: Public Game | onclick="createPublicGame()" | Yes | Creates public room |
| Quick action: Private Game | onclick="showCreatePrivateGame()" | Yes | Opens private game modal |
| Quick action: Join by Code | onclick="showJoinByCode()" | Yes | Opens invite code join modal |
| Quick action: vs Bots | onclick="playOfflineWithAI()" | No | Offline solo vs AI |

### 9.3 BrickBreaker 3D
Game fantasy:
- 3D breakout arena with impact-driven rhythm

Players:
- min 1, max 4
- solo default
- versus/co-op variants supported

Primary modes:
- solo campaign
- score attack
- versus score race
- co-op clear

Launch button inventory (brickbreaker3d):

| Button / Action | Location | Auth required | Description |
|---|---|---|---|
| PLAY (portal card) | portal card | No | Routes to /brickbreaker3d/ |
| Play Solo | brickbreaker3d/index.html | No | Direct to solo surface |
| Multiplayer Lobby | brickbreaker3d/lobby.html | Yes | Seat selection for multiplayer |

### 9.4 4D Connect
Game fantasy:
- strategic placement and alignment across 4D relationships

Players:
- min 2, max 2 canonical multiplayer
- local hot-seat support can expose multiple local seats in current build
- spectating allowed

Primary modes:
- local hot-seat
- ranked duel
- casual duel
- solo vs ANPC (planned/optional extension)

Launch button inventory (4DTicTacToe/index.html legacy path):

| Button / Action | Selector / Handler | Auth required | Description |
|---|---|---|---|
| PLAY (portal card) | goToGame('/4DTicTacToe/') | No | Routes to legacy 4D path |
| Player card click | selectPlayer(playerId) | No | Select active player |
| Key 1-4 | selectPlayer(n) | No | Switch active player |
| NEW GAME | #new-game-btn | No | Reset board/scores |

### 9.5 Starfighter
Game fantasy:
- high-speed dogfights in shared arenas

Players:
- min 1, max 8
- solo vs ANPC allowed
- co-op humans + ANPC enemies

Primary modes:
- solo skirmish vs ANPC waves
- co-op squadron
- free-for-all
- team battle
- objective control

Launch button inventory (starfighter/index.html):

| Button / Action | Selector / Handler | Auth required | Description |
|---|---|---|---|
| PLAY SOLO FREE | #solo-btn onclick="KG_LANDING.playSolo(this)" | No | Launches solo skirmish |
| SIGN IN FOR CO-OP | /login/index.html link | Yes for host | Routes to auth for co-op |
| JOIN (invite code) | onclick="KG_LANDING.openInviteJoin(inviteCodeValue)" | Guest join allowed | Join private co-op by code |
| LEAVE GAME | onclick="Starfighter.exitGame()" | No | Returns to landing |

## 10. URL, Filepath, and Naming Standards

### 10.1 Canonical URLs
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
- /fasttrack/
- /brickbreaker3d/
- /4dconnect/
- /starfighter/

Compatibility alias (temporary):
- /4DTicTacToe/* redirects to /4dconnect/*

### 10.2 Filepath Format (Current + Target)
Current implementation roots are repo-root HTML and game folders.
Canonical target convention for new work:
- {repo}/manifold/index.html
- {repo}/manifold/discover.html
- {repo}/manifold/lounge.html
- {repo}/manifold/showcase.html
- {repo}/manifold/{game-slug}/index.html
- {repo}/manifold/{game-slug}/lobby.html (multiplayer)
- {repo}/manifold/{game-slug}/play.html (if separate)

### 10.3 Naming Rules
- lowercase kebab-case for new route-oriented filenames
- one canonical ID and one canonical slug per game
- keep legacy mixed-case paths only for temporary compatibility

## 11. Compliance Matrix
1. Only four canonical games are shown as live games in navigation, discovery, and home featured sections.
2. Each canonical game has a landing/entry and play surface.
3. Multiplayer games expose lobby and invite-code join flows.
4. Solo-first entry remains available where applicable without forced auth.
5. Launch validation enforces readiness and minimum player constraints.
6. On launch validation failure, Play with Bots fallback is offered where supported.
7. Home landing respects the 3-featured-in-viewport rule and corrected list behavior.
8. Canonical URL and naming rules are followed, with temporary 4DTicTacToe compatibility alias retained.

## 12. Acceptance Criteria
1. A new user can understand each live game in under 30 seconds from landing pages.
2. A logged-in host can create a valid private multiplayer lobby in under 20 seconds.
3. A guest can start a solo session in under 10 seconds where solo guest mode is supported.
4. Invite-code joins clearly indicate success/failure and next action.
5. Launch button never enables while lobby validity rules are unmet.
6. All lobby participants receive real-time synchronized slot state updates.
7. Smartphone UI preserves readable controls and fixed bottom control zone.
8. Home page shows exactly 3 featured games in first viewport and separate full + coming soon sections beneath.

## 13. Scope Note
Assemble and Cubic are not canonical live games in this 4-game spec revision. They may appear only in Coming Soon or archival references until reintroduced by a future superseding specification.
