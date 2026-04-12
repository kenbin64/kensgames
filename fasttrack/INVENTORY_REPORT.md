# FastTrack Game — Comprehensive Code Inventory Report

> **Generated:** 2026  
> **Scope:** `/web/games/fasttrack/` — all active code, excluding `_archive/`  
> **Total:** ~82,800 lines across ~80 active files (plus ~17,100 lines in 34 archived files)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [File-by-File Inventory](#2-file-by-file-inventory)
   - [Python Server Files](#21-python-server-files-5847-lines)
   - [JavaScript Client Files](#22-javascript-client-files-41423-lines)
   - [TypeScript Kernel Files](#23-typescript-kernel-files-3363-lines)
   - [HTML Pages](#24-html-pages-19291-lines)
   - [CSS Stylesheets](#25-css-stylesheets-9509-lines)
   - [Data Files (JSON)](#26-data-files-json-609-lines)
   - [Documentation (Markdown)](#27-documentation-markdown-2369-lines)
   - [Native Desktop (Electron)](#28-native-desktop-electron-945-lines)
   - [PWA Manifest](#29-pwa-manifest)
3. [Game Engine State](#3-game-engine-state)
4. [Lobby System](#4-lobby-system)
5. [Auth Flow](#5-auth-flow)
6. [AI Behavior](#6-ai-behavior)
7. [Multiplayer Architecture](#7-multiplayer-architecture)
8. [Critical Issues](#8-critical-issues)
9. [Quality Assessment](#9-quality-assessment)

---

## 1. Executive Summary

FastTrack is a hexagonal card-based peg board game built with ButterflyFX "manifold substrate" architecture. It consists of:

- **Python WebSocket servers** for lobbies, matchmaking, and multiplayer sync
- **Vanilla JavaScript** client with Three.js 3D rendering, procedural audio, and AI
- **TypeScript kernel** for deterministic game logic (event-sourced, no I/O)
- **14,118-line monolithic HTML file** (`board_3d.html`) as the primary game view
- Full **PWA** support with service worker, push notifications, and offline play
- **Electron/Steam** native wrapper scaffolding

The codebase shows rapid, feature-rich development with significant **rule inconsistencies** between subsystems, a **critical auth vulnerability**, and **multiple competing implementations** of core game logic.

### Key Metrics

| Metric | Value |
|--------|-------|
| Active code files | ~80 |
| Total lines (active) | ~82,800 |
| Archived files | 34 (~17,100 lines) |
| Languages | Python, JavaScript, TypeScript, HTML, CSS, JSON |
| Largest file | `board_3d.html` (14,118 lines) |
| Critical security issues | 1 (unsalted password hashing) |
| Rule conflicts | 6+ (track size, peg count, card values, entry cards, bullseye exit, Genesis model) |

---

## 2. File-by-File Inventory

### 2.1 Python Server Files (5,847 lines)

#### `server.py` — 584 lines
- **Purpose:** Original dice-based FastTrack WebSocket server. **DEPRECATED** — uses dice (1–6) instead of cards.
- **Genesis model:** Implicit 0–6 (no explicit level references, but integrated with HelixKernel)
- **Key classes:** `PegLocation`, `Peg`, `Player`, `FastTrackRoom`, `FastTrackServer`
- **Auth:** None (room code join only)
- **WebSocket:** `websockets` library, `handle_fasttrack_ws()` handler
- **Issues:**
  - **DEAD CODE** — Entirely superseded by card-based game (`fasttrack_substrate.py`, `fasttrack_exact.py`, `lobby_server.py`). Uses dice, which contradicts every other implementation.
  - 60-hole track conflicts with 84-hole (JS) and 90-hole (substrate) tracks.
  - Still imports `HelixKernel` for integration despite being obsolete.

#### `start_server.py` — 82 lines
- **Purpose:** Launch script. Starts lobby WebSocket (port 8765) + optional HTTP (port 8080).
- **Genesis model:** N/A (launcher)
- **Key functions:** `main()` with argparse
- **Issues:** References `server/lobby_server.py` import path — correct and functional.

#### `fasttrack_substrate.py` — 736 lines
- **Purpose:** Card-based game substrate with ButterflyFX 0–6 level model.
- **Genesis model:** **0–6** (Potential→Point→Length→Width→Plane→Volume→Whole)
- **Key classes:** `GameToken`, `Card`, `Player`, `BoardState`, `FastTrackGame`, `FastTrackUniverse`
- **Key enums:** `TokenLocation`, `GameMode` (SINGLE_CARD, FIVE_CARD), `GamePhase`
- **Auth:** None
- **WebSocket:** None (pure game logic)
- **Issues:**
  - Entry cards are `{A, K, JK}` — **conflicts** with canonical rules (`{A, 6, Joker}`)
  - King can exit holding — contradicts FASTTRACK_RULES.md
  - 90-hole track (`BOARD_SIZE=90`) — conflicts with 84 (JS) and 60 (server.py)
  - 5 pegs per player — conflicts with both 4 (game_spec.json) and 6 (fasttrack_exact.py)
  - Card values: K=13, Q=12, J=11 — conflicts with kernel (K=1, Q=10, J=0)

#### `fasttrack_exact.py` — 830 lines
- **Purpose:** Exact board geometry with precise coordinate generation for 3D renderer.
- **Genesis model:** Not explicitly referenced
- **Key classes:** `BoardGenerator`, `FastTrackGame`, `Hole`, `Peg`, `PlayerZone`
- **Key enums:** `HoleType` (OUTER, SAFE, HOLDING, START, WINNER, FAST_ENTRY, FAST_EXIT, FAST, CENTER), `PegState`
- **Auth:** None
- **WebSocket:** None
- **Issues:**
  - 60-hole outer track (conflicts with 84 in JS, 90 in substrate)
  - 6 pegs per player (4 holding + 1 start + 1 winner) — conflicts with 5 (substrate) and 4 (spec)
  - Has card-specific move methods (`_get_joker_moves`, `_get_ace_moves`, etc.) — card-based, consistent with rules
  - JSON export for 3D renderer is well-structured

#### `server/lobby_server.py` — 2,028 lines
- **Purpose:** **Production lobby server.** Full auth, session management, matchmaking, guilds, tournaments, chat, prestige.
- **Genesis model:** Not explicitly referenced
- **Key classes:** `User`, `Guild`, `GameSession`, `Tournament`, `LobbyDatabase`, `PrestigeCalculator`, `ConnectedClient`, `LobbyServer`
- **Auth:** SHA-256 password hashing (**NO SALT** — critical vulnerability). Username/password login + guest login. Min password 4 chars.
- **WebSocket:** `websockets` library with ping/pong, compression. Session codes: 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
- **Issues:**
  - **CRITICAL SECURITY:** SHA-256 without salt. Vulnerable to rainbow tables. Use bcrypt/argon2.
  - **Password min 4 chars** — conflicts with client-side 8-char minimum (auth_substrate.js)
  - No rate limiting on login attempts
  - No email verification on registration
  - JSON file persistence (`data/lobby/`) — no concurrent write protection
  - Tournament system is fully coded but unclear if tested end-to-end

#### `manifold_runner.py` — 458 lines
- **Purpose:** ButterflyFX manifold bridge. Music-as-math transmission, game state manifold.
- **Genesis model:** **1–7** (Spark→Mirror→Relation→Form→Life→Mind→Completion) — **CONFLICTS with 0–6 used elsewhere**
- **Key classes:** `MusicManifold`, `GameStateManifold`, `ManifoldWebSocketServer`
- **Auth:** None
- **WebSocket:** Port 8767. Transmits music as mathematical waveform descriptors (~30 bytes vs 192KB/s audio).
- **Issues:**
  - Uses 1–7 Genesis model while `fasttrack_substrate.py` and `analytics_substrate.js` use 0–6
  - Music manifold is an interesting concept but unclear integration path with actual game

#### `generate_fasttrack_promo.py` — 958 lines
- **Purpose:** Generates 90-second 1920×1080@30fps promotional video. Pure Python pixel-buffer rendering.
- **Genesis model:** N/A (tooling)
- **Key classes:** `FrameBuffer` (RGB pixel buffer), `FastTrackPromoGenerator`
- **Issues:** Requires FFmpeg and gTTS. Scene system is complete but heavyweight for a build tool.

#### `generate_icons.py` — 153 lines
- **Purpose:** PWA icon generator using Pillow. Creates 72–512px + 1024px icons and iOS splash screens.
- **Genesis model:** N/A (tooling)
- **Issues:** None significant. Clean utility.

#### `__init__.py` — 231 lines
- **Purpose:** Package init with helix substrate integration.
- **Genesis model:** References ButterflyFX substrate pattern
- **Issues:** Large for an `__init__.py` — contains substantive logic rather than just exports.

---

### 2.2 JavaScript Client Files (41,423 lines)

#### `game_engine.js` — 3,934 lines
- **Purpose:** **Core game engine.** Exhaustive hole-naming documentation, single-card-draw rules, move validation, turn management.
- **Genesis model:** Not explicitly referenced (used as pure game logic)
- **Key concepts:** 84-hole perimeter track. 7 hole types with IDs: `hold-{p}-{0-3}`, `home-{p}`, `outer-{p}-{0-3}`, `side-left-{p}-{1-4}`, `side-right-{p}-{4-1}`, `ft-{p}`, `safe-{p}-{1-4}`, `center`.
- **Auth:** None
- **WebSocket:** None (engine only)
- **Issues:**
  - 84-hole track conflicts with 60 (Python exact) and 90 (Python substrate)
  - Massive file — could be decomposed into board, rules, turn manager
  - Contains 500+ lines of hole-naming documentation comments

#### `game_init.js` — 605 lines
- **Purpose:** Game initializer. Player setup, AI config, board instantiation.
- **Genesis model:** N/A
- **Key functions:** Uses `BoardManifold.pickBots()` or `ManifoldAI.ARCHETYPES` for AI bots. `DEFAULT_CONFIG`: 2–4 players, default 3.
- **Issues:** Player count default 3 — GAME_ARCHITECTURE.md says "recommended 3–4" but game_spec.json says preferred 4.

#### `game_session_manager.js` — 544 lines
- **Purpose:** Session lifecycle. Modes: SOLO, RANDOM, PRIVATE, GUILD.
- **Genesis model:** N/A
- **Auth:** Depends on `AuthSubstrate` for session tokens
- **Issues:** Player limits: solo 3–4, random 3–4, private 2–6, guild 2–6. The 3-player minimum for solo contradicts 2-player minimum in spec.

#### `game_ui_minimal.js` — 1,508 lines
- **Purpose:** Clean minimal game interface. Top-left current player panel, right-side retractable settings.
- **Genesis model:** N/A
- **Issues:** Mobile-responsive but duplicates some concerns with `mobile_ui.js`.

#### `game_sfx.js` — 1,533 lines
- **Purpose:** Procedural sound effects via Web Audio API. Theme-aware profiles.
- **Genesis model:** N/A
- **Key themes:** DEFAULT, SPACE_ACE, UNDERSEA, ROMAN_COLISEUM, FIBONACCI, COSMIC, COLOSSEUM
- **Issues:** ROMAN_COLISEUM vs COLOSSEUM — are these the same theme with two names?

#### `game_state_broadcaster.js` — 292 lines
- **Purpose:** State broadcaster with subscriber pattern. Turn phases: draw, move, split_move, complete.
- **Genesis model:** N/A
- **Issues:** Clean, small, well-focused. No problems found.

#### `lobby_client.js` — 2,519 lines
- **Purpose:** WebSocket lobby client. Auth, sessions, matchmaking, chat, reconnection.
- **Genesis model:** N/A
- **Auth:** Auto-detects ws/wss protocol. Session token management. Guest auto-login for private games.
- **WebSocket:** Auto-reconnect (max 10 attempts). Handles auth, session CRUD, matchmaking, chat.
- **Issues:** Well-structured but large. Reconnection logic is thorough.

#### `lobby_substrate.js` — 746 lines
- **Purpose:** P2P lobby system. Game mode rules: SOLO (AI required), RANDOM (no AI), PRIVATE/GUILD (AI allowed).
- **Genesis model:** N/A
- **Issues:** `MIN_PLAYER_TIMEOUT: 30s` — may be too short for casual players.

#### `lobby_ui.js` — 926 lines
- **Purpose:** Lobby interface rendering. 5-second update loop. Depends on `LobbySubstrate`.
- **Genesis model:** N/A
- **Issues:** None significant.

#### `multiplayer_client.js` — 359 lines
- **Purpose:** WebSocket real-time game sync. Action queue for offline resilience.
- **Genesis model:** N/A
- **WebSocket:** Start/stop sync with auto-reconnect.
- **Issues:** Smaller than expected given multiplayer complexity.

#### `card_ui.js` — 631 lines
- **Purpose:** Card display. Player-colored deck backs with crosshatch pattern via CSS gradients.
- **Genesis model:** N/A
- **Issues:** None significant. Well-contained.

#### `card_deck_substrate.js` — 339 lines
- **Purpose:** Card deck logic. Documents SINGLE DRAW rules.
- **Genesis model:** N/A
- **Issues:**
  - Entry cards: `{A, Joker, 6}` — matches canonical rules
  - Play-again card: 6 — correct
  - Royal exit bullseye: `{J, Q, K}` — correct
  - Split: 7 — correct
  - 4 backward — correct
  - This file is **the most rule-consistent** JS file

#### `board_manifold.js` — 979 lines
- **Purpose:** Board as mathematical manifold. Uses z=xy (Layer 3) and z=xy² (Layer 4) surfaces.
- **Genesis model:** Implicit manifold layers 3–4 (mathematical surfaces)
- **Key constants:** PHI=1.618..., Fibonacci weights
- **Issues:** HOLE_KINDS with pre-sealed rules — elegant but adds another rule definition that could diverge.

#### `peg_substrate.js` — 1,161 lines
- **Purpose:** Smart peg system. Self-aware pegs with personalities, hop counting, capture celebrations.
- **Genesis model:** Manifold event logging (substrate pattern)
- **Issues:** Capture cutscene system is feature-complete but heavyweight.

#### `smart_peg.js` — 857 lines
- **Purpose:** Hop-counting movement engine. `BoardAdjacency` with 84-hole perimeter track.
- **Genesis model:** N/A
- **Key classes:** `BoardAdjacency`, `SmartPeg`, `GameManager`
- **Issues:**
  - 84-hole track — consistent with `game_engine.js`, conflicts with Python
  - Validates hop count matches card value — good integrity check

#### `auth_substrate.js` — 771 lines
- **Purpose:** Client-side auth. Registration validation, session management (24hr timeout).
- **Genesis model:** N/A
- **Auth:** Password min **8 chars** — **conflicts with server's 4-char minimum**. Email validation. Username 3–20 chars.
- **Issues:**
  - Password length mismatch with server (8 vs 4)
  - SessionManager with 24hr timeout — good practice
  - No CSRF protection mentioned

#### `auth_ui.js` — 998 lines
- **Purpose:** Auth UI with login/register/profile views. Tab-based interface.
- **Genesis model:** N/A
- **Auth:** Uses `AuthSubstrate` for validation
- **Issues:** Well-structured. Large but complete.

#### `avatar_substrate.js` — 547 lines
- **Purpose:** Avatar definitions. Categories: HUMAN, ANIMAL, PLUSH, ALIEN, SPACE.
- **Genesis model:** N/A
- **Issues:** Good diversity in representation. **Overlaps** with `avatars.js`.

#### `avatars.js` — 710 lines
- **Purpose:** AVATAR_CATALOG with hundreds of emoji avatars organized by category.
- **Genesis model:** N/A
- **Issues:** **DUPLICATION** — Two separate avatar systems (`avatar_substrate.js` + `avatars.js`). Should be consolidated.

#### `analytics_substrate.js` — 294 lines
- **Purpose:** GA4 integration. `GA_MEASUREMENT_ID: 'G-0V65GVQ0P6'`.
- **Genesis model:** **0–6** (POTENTIAL→POINT→LENGTH→WIDTH→PLANE→VOLUME→WHOLE)
- **Issues:** Uses 0–6 model — consistent with `fasttrack_substrate.py`, conflicts with `manifold_runner.py`'s 1–7.

#### `audio_substrate.js` — 739 lines
- **Purpose:** Stadium atmosphere controller. Commentators + music + crowd. Volume controls.
- **Genesis model:** N/A
- **Issues:** Theme definitions with musicStyle — well-structured integration point.

#### `music_substrate.js` — 1,232 lines
- **Purpose:** Chiptune music engine v2.0. Structured songs: Intro→Verse→Chorus→Verse→Bridge→Chorus.
- **Genesis model:** N/A
- **Key data:** Full note frequency table C2–B6. Theme-specific songs. 16th-note tick system.
- **Issues:** Two backup versions exist (`_v1_backup.js` 1,185 lines, `_v2_backup.js` 1,082 lines) — dead code in the project root.

#### `music_substrate_v1_backup.js` — 1,185 lines
- **Purpose:** Backup of music substrate v1.
- **Issues:** **DEAD CODE** — should be in `_archive/`.

#### `music_substrate_v2_backup.js` — 1,082 lines
- **Purpose:** Backup of music substrate v2.
- **Issues:** **DEAD CODE** — should be in `_archive/`.

#### `commentary_substrate.js` — 932 lines
- **Purpose:** Two-commentator system. Default: Rex Thundervoice (play-by-play) + Sandy Insights (color).
- **Genesis model:** N/A
- **Issues:** Uses Web Speech API. Theme variants (SPACE_ACE has Commander Vox). Queue system avoids overlap.

#### `crowd_substrate.js` — 500 lines
- **Purpose:** Reactive crowd sounds via Web Audio API procedural generation. Theme-specific.
- **Genesis model:** N/A
- **Issues:** Clean. Excitement level 0–1 drives intensity.

#### `growth_substrate.js` — 425 lines
- **Purpose:** Viral growth engine. Share templates for win/challenge/spectacle.
- **Genesis model:** N/A
- **Issues:** `GAME_URL: 'https://kensgames.com/fasttrack/'` — hardcoded domain.

#### `rules_substrate.js` — 1,152 lines
- **Purpose:** Complete rules codification. Rule registry with categories: SETUP, TURN_FLOW, MOVEMENT, CARDS, CUTTING, WINNING, SPECIAL.
- **Genesis model:** N/A
- **Issues:** Each rule is composable/queryable — excellent design. Potential single source of truth but must be verified against other rule implementations.

#### `seo_substrate.js` — 359 lines
- **Purpose:** SEO identity system. JSON-LD structured data, meta tag validation.
- **Genesis model:** N/A
- **Issues:** IDENTITY object with canonical URLs at `kensgames.com/fasttrack/`. Clean.

#### `social_substrate.js` — 622 lines
- **Purpose:** Guild system (`GuildSubstrate`). Blocking with durations. Guild creation.
- **Genesis model:** N/A
- **Issues:** Max 50 members default. Blocking durations (day/week/month/permanent).

#### `natural_lens.js` — 414 lines
- **Purpose:** ButterflyFX manifold substrate JS port. ColorLens (azimuth→EM spectrum), Sound (magnitude→frequency).
- **Genesis model:** Manifold mathematical mapping
- **Issues:** Physical constants (speed of light, Planck's constant). Piano range A0–C8. Research/experimental.

#### `manifold_ai.js` — 744 lines
- **Purpose:** Geometric AI. AI players as points on z=xy and z=xy² surfaces.
- **Genesis model:** Manifold Layer 3 (z=xy) and Layer 4 (z=xy²)
- **Key data:** Personality from θ (angle), intensity from r (radius). Fibonacci weight spine. Truth/quadratic tables.
- **Issues:** Interesting mathematical AI model. ARCHETYPES provide varied play styles.

#### `demo_director.js` — 502 lines
- **Purpose:** Spectator demo mode (`?demo=1`). 4-bot cinematic game with theme rotation every 45s.
- **Genesis model:** N/A
- **Issues:** CTA overlay for conversion. Disables manual camera. Well-scoped.

#### `promo_director.js` — 1,020 lines
- **Purpose:** 60-second cinematic promo (`?promo=1`). Scripted gameplay with MediaRecorder WebM capture.
- **Genesis model:** N/A
- **Issues:** Movie-trailer voiceover via Web Speech API. 1920×1080@60fps target. Full production feature.

#### `prestige.js` — 265 lines
- **Purpose:** Client-side prestige tracking via localStorage.
- **Genesis model:** N/A
- **Issues:** Thresholds: bronze(0), silver(500), gold(2000), diamond(5000), platinum(15000). Matches server thresholds.

#### `themes.js` — 4,313 lines
- **Purpose:** **Largest JS file.** Multi-theme system: default, cosmic, colosseum, spaceace, undersea, fibonacci, + more.
- **Genesis model:** N/A
- **Issues:** Each theme defines boardPalette, player colors/names, materials, Three.js scene objects. Massive but well-organized.

#### `stadium_controller.js` — 649 lines
- **Purpose:** Master integration for music + crowd + commentary + SFX.
- **Genesis model:** N/A
- **Issues:** Theme presets. Clean orchestration layer.

#### `mobile_ui.js` — 1,651 lines
- **Purpose:** `MobileUI` class. Light pillar indicators, action bar, auto-move for single legal moves.
- **Genesis model:** N/A
- **Issues:** Forces cinematic camera on mobile. Touch overlay. Card popup system. Smart auto-hide during animations.

#### `sw.js` — 118 lines
- **Purpose:** Service worker. NETWORK-FIRST strategy. Cache v3.0.0.
- **Genesis model:** N/A
- **Issues:** Precaches `board_3d.html` + icons. Background sync for game state. Push notifications ("Your turn!"). Clean.

#### `admin_substrate.js` — 1,037 lines
- **Purpose:** Admin/moderation system. Block users with durations. Appeals system (PENDING→UNDER_REVIEW→APPROVED→DENIED).
- **Genesis model:** N/A
- **Auth:** Requires `AuthSubstrate` admin check
- **Issues:** Full appeals flow is impressive but complex. AdminBlockSubstrate well-designed.

---

### 2.3 TypeScript Kernel Files (3,363 lines)

#### `kernel/index.ts` — 103 lines
- **Purpose:** Main exports. Re-exports all modules.
- **Genesis model:** N/A
- **Issues:** Clean barrel file.

#### `kernel/types.ts` — 581 lines
- **Purpose:** Type definitions.
- **Genesis model:** N/A
- **Key types:** `PositionType` (CENTER, FASTTRACK, OUTER_RIM, HOLDING, SAFE, WINNER). `PegState`, `PegPersonality` (6 types), `PegMood` (6 types). `SmartPeg extends Peg`. `Card`, `CardRank`, `Move`, `MoveType`, `GameState`, `GameConfig`, `GameEvent`, `EventType`, `BoardConfig`, `PlayerZone`.
- **Issues:** Comprehensive and well-typed. Good foundation for a deterministic kernel.

#### `kernel/board.ts` — 540 lines
- **Purpose:** Board configuration. `createBoard()` generates canonical 6-player hex board.
- **Genesis model:** N/A
- **Key data:** CENTER, FASTTRACK_RING (6 holes), per-player: 13 outer rim, 4 holding, 4 safe, 1 winner. OUTER_RADIUS=280, FASTTRACK_RADIUS=100.
- **Issues:** 13 outer rim per player × 6 = 78 outer + 6 FT + 1 center + 24 safe + 24 holding + 6 winners = 139 total. Different count from board_inventory.json (133) and JS (84 perimeter).

#### `kernel/rules.ts` — 748 lines
- **Purpose:** Pure deterministic game logic. Seeded PRNG (LCG). State reducer pattern.
- **Genesis model:** N/A
- **Key function:** `applyEvent(state, event)` — event-sourced state machine.
- **Key data:** Card values: 4=−4, J=0, Q=10, K=1. Play-again cards. canExitHolding: A/6/K/JOKER. canExitCenter: J/Q/K. `hashState()` for sync verification.
- **Issues:**
  - **K can exit holding** — conflicts with canonical rules where K cannot exit holding
  - **K=1** — conflicts with Python substrate (K=13)
  - **J=0** — unusual but maybe intentional (move 0 = exit bullseye only)
  - `hashState()` for sync verification — excellent design

#### `kernel/events.ts` — 350 lines
- **Purpose:** Event schema for manifold ingestion. Factory with sequence counter.
- **Genesis model:** N/A
- **Events:** GAME_CREATED, PLAYER_JOINED/LEFT, GAME_STARTED, CARD_DRAWN/PLAYED, PEG_MOVED/CAPTURED, TURN_ENDED, SYNC_REQUEST/RESPONSE, HEARTBEAT.
- **Issues:** Well-designed event system.

#### `kernel/smart_peg.ts` — 493 lines
- **Purpose:** SmartPeg factory. Personality assignment, mood, hop-counting, capture taunts.
- **Genesis model:** N/A
- **Issues:** Move scoring by personality — creative system.

#### `kernel/sync.ts` — 548 lines
- **Purpose:** `FastTrackSync` class. WebRTC P2P data channels with WebSocket signaling.
- **Genesis model:** N/A
- **WebSocket:** Signaling server for WebRTC. `PeerInfo`, `SyncMessage` types. Event broadcasting. Heartbeat. `LocalFastTrack` for offline play.
- **Issues:** Dual networking (WebRTC for game data, WebSocket for signaling) — modern architecture.

---

### 2.4 HTML Pages (19,291 lines)

#### `board_3d.html` — 14,118 lines
- **Purpose:** **THE GAME.** Monolithic 3D game board page. Contains **ALL** game rendering, Three.js scene, camera, lighting, board/peg/card rendering, move animations, theme switching, and embedded inline JS/CSS.
- **Genesis model:** N/A (consumes substrates)
- **Auth:** Gate script redirects to `lobby.html` if no session params. Accepts: `session`, `code`, `offline`, `multiplayer`, `demo`, `spectate`, `quickplay`, `debug`.
- **Issues:**
  - **14,118 lines in a single HTML file** — extremely difficult to maintain
  - Contains massive inline `<script>` blocks that should be extracted
  - `Cache-Control: no-cache` meta tag — appropriate for active development
  - Loads 20+ external JS substrate files
  - Three.js r128 — several versions behind current (r160+)

#### `index.html` — 1,009 lines
- **Purpose:** Landing page with 3D background canvas (Three.js). Navigation, hero section.
- **Genesis model:** N/A
- **Auth:** None
- **Issues:** Full SEO with OG tags, Google Fonts (Orbitron, Rajdhani). Links to kensgames.com.

#### `lobby.html` — 1,021 lines
- **Purpose:** Lobby with auth screen (login/register tabs). Two-phase: auth → lobby.
- **Auth:** Login/register forms. session check on load.
- **Issues:** PWA meta tags present. Loads lobby.css + lobby-inline.css.

#### `play.html` — 265 lines
- **Purpose:** Play page with hero section. Links to `board_3d.html` for actual gameplay.
- **Issues:** Lightweight gateway page.

#### `join.html` — 778 lines
- **Purpose:** Join game via code. Multi-phase: code entry → pending approval → waiting room.
- **Auth:** Guest auto-login (no account required).
- **Issues:** Cancel join request support. Good UX flow.

#### `ai_setup.html` — 589 lines
- **Purpose:** AI setup page. Choose difficulty, opponents, theme.
- **Issues:** Full SEO. Poppins font. CSS custom properties.

#### `docs.html` — 839 lines
- **Purpose:** How-to-play documentation page. Rules, strategy, themes, controls.
- **Issues:** SEO-optimized documentation page.

#### `presskit.html` — 771 lines
- **Purpose:** Press kit. Screenshots, logos, descriptions, embed codes.
- **Issues:** Full OG/Twitter card tags. Well-structured for media distribution.

#### `mobile.html` — 336 lines
- **Purpose:** Mobile PWA wrapper. Embeds `board_3d.html` via iframe with `?mobile=true`.
- **Issues:**
  - Contains a `<style>` tag wrapping a `<link>` tag — **invalid HTML**
  - iOS splash screen support
  - PWA install banner

#### `embed.html` — 71 lines
- **Purpose:** Embeddable iframe wrapper. Passes URL params through. Fullscreen support.
- **Issues:** Clean, minimal.

#### `test_sounds.html` — 385 lines
- **Purpose:** Sound effects test page. Buttons for all SFX, theme music, and audio tests.
- **Issues:** Development/QA tool. Should probably be excluded from production.

#### `landing/index.html` — 904 lines
- **Purpose:** "Ken's Games" portal landing. Multiple game tiles. ButterflyFX branding.
- **Issues:** Uses Three.js for background canvas. "Coming soon" games listed.

---

### 2.5 CSS Stylesheets (9,509 lines)

| File | Lines | Purpose |
|------|-------|---------|
| `assets/css/board-3d.css` | 2,414 | Main game board styles |
| `assets/css/index.css` | 1,454 | Landing page styles |
| `assets/css/lobby-inline.css` | 1,108 | Lobby inline overrides |
| `assets/css/play.css` | 826 | Play page styles |
| `assets/css/mobile.css` | 802 | Mobile-specific styles |
| `assets/css/entry.css` | 588 | Entry/splash page styles |
| `assets/css/responsive-game.css` | 549 | Responsive breakpoints for game |
| `assets/css/player-panel.css` | 529 | Player panel component |
| `assets/css/lobby.css` | 608 | Lobby page styles |
| `assets/css/ai-setup.css` | 368 | AI setup page styles |
| `assets/css/join.css` | 206 | Join page styles |
| `assets/css/mobile-inline.css` | 57 | Mobile inline overrides |

**Issues:** Well-organized CSS files per page. No CSS preprocessor. Custom properties used for theming. `board-3d.css` at 2,414 lines is large but manageable for a 3D game UI.

---

### 2.6 Data Files (JSON) (609 lines)

#### `fasttrack_game_spec.json` — 320 lines
- **Purpose:** Canonical game specification. Card rules, board zones, turn structure, win conditions.
- **Issues:**
  - Specifies 4 pegs per player — conflicts with Python (5 or 6) and FASTTRACK_RULES.md (5)
  - Outer track: 72 holes (12 per section × 6) — yet another track size
  - Bullseye exit: "ace, king, queen, jack, joker" — **conflicts with canonical rules** (only J, Q, K)
  - Royals include Ace and Joker — conflicts with FASTTRACK_RULES.md
  - `can_exit_holding` for King is `false` — correct per canonical rules, but conflicts with kernel/rules.ts

#### `board_inventory.json` — 194 lines
- **Purpose:** Complete board element inventory. Manifold substrate format. Golden ratio dimensions.
- **Issues:**
  - Total holes: 133 — differs from kernel (139+) and JS (84 perimeter + holding/safe)
  - 5 pegs per player — matches FASTTRACK_RULES.md, conflicts with spec (4) and exact.py (6)
  - 6 player colors: Red, Teal, Violet, Gold, Azure, Pink — different names from spec (Red, Orange, Green, Blue, Purple, Yellow)

#### `manifest.json` — 95 lines
- **Purpose:** PWA Web App Manifest. `id: kensgames-fasttrack`. Display: standalone.
- **Issues:** Icons 72–512px. Shortcuts for Quick Game and Multiplayer. Clean.

---

### 2.7 Documentation (Markdown) (2,369 lines)

#### `FASTTRACK_RULES.md` — 261 lines
- **Purpose:** **CANONICAL RULES** — "Version 2.0 — All documentation, substrates, manifolds, and in-game UI derive from this source of truth."
- **Key rules:**
  - 5 pegs per player, board has 36 outer holes (not 60, 72, 84, or 90)
  - Entry cards: A, 6, Joker — K **cannot** exit holding
  - Bullseye exit: J, Q, K **only** — Ace and Joker **cannot**
  - Card values: all royals/Ace/Joker move 1 space
  - 4 = backward, 7 = split
  - Extra turn: A, 6, Joker, J, Q, K
  - 36 outer track holes — **yet another track size** (the 7th variant!)

#### `FASTTRACK_CARD_RULES.md` — 156 lines
- **Purpose:** Card-specific rules derived from FASTTRACK_RULES.md. Version 2.0.
- **Issues:** Consistent with FASTTRACK_RULES.md. Good standalone reference.

#### `GAME_ARCHITECTURE.md` — 368 lines
- **Purpose:** System architecture overview. Flow: Landing → Lobby → Game → Results.
- **Key data:** 4 pegs per player (conflicts with rules' 5), WebRTC serverless P2P mesh.
- **Issues:** Architecture diagram is clean but pegs-per-player conflicts.

#### `BOARD_BUILDING_SPEC.md` — 538 lines
- **Purpose:** 3D board building specification. Golden ratio foundation. Hex geometry. Hole types and coordinates.
- **Issues:** Comprehensive golden ratio cascade. Flat-top hexagon with -30° start angle. Good 3D implementation guide.

#### `AI_INSTRUCTIONS_MOBILE_SETUP_UX.md` — 523 lines
- **Purpose:** Mobile UX governing document. "One Concern Per View" principle. Maximum 3 taps to game.
- **Issues:** Excellent UX guidelines. Smart defaults. Thumb-friendly targets (48px min).

#### `deploy/README.md` — 209 lines
- **Purpose:** Deployment guide.
- **Issues:** Not reviewed in detail.

---

### 2.8 Native Desktop (Electron) (945 lines)

| File | Lines | Purpose |
|------|-------|---------|
| `native/main.js` | 313 | Electron main process. Window creation, menu, auto-update scaffolding |
| `native/preload.js` | 99 | Context bridge. Exposes IPC methods to renderer |
| `native/steam-manager.js` | 431 | Steamworks integration. Achievements, stats, leaderboards, rich presence |
| `native/package.json` | 102 | Electron app manifest. Dependencies: electron, electron-builder, steamworks.js |

**Issues:** Steam integration is scaffolded but not production-tested. Achievement definitions cover core gameplay events.

---

### 2.9 PWA Manifest

See `manifest.json` in Data Files section. Full PWA with service worker, push notifications, background sync, iOS splash screens, and Electron wrapper.

---

## 3. Game Engine State

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ board_3d.html │  │ game_engine  │  │ TypeScript Kernel        │   │
│  │  (14K lines)  │  │  (3.9K lines)│  │  (3.4K lines, unused?)  │   │
│  │  Three.js 3D  │  │  rules/turns │  │  deterministic/P2P      │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────────┘   │
│         │                  │                                         │
│  ┌──────┴──────────────────┴────────────────────────────────────┐   │
│  │                    Substrate Layer (~20 JS files)              │   │
│  │  auth | avatar | audio | music | crowd | commentary | cards   │   │
│  │  board_manifold | peg | smart_peg | social | analytics | ...  │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                              │ WebSocket                             │
├──────────────────────────────┼───────────────────────────────────────┤
│                          SERVER (Python)                              │
│  ┌──────────────────────────┴───────────────────────────────────┐   │
│  │  lobby_server.py (2K lines) — Auth, Sessions, Matchmaking     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌──────────────┐  ┌──────────────────┐  ┌────────────────────┐    │
│  │ server.py    │  │ fasttrack_sub.py  │  │ fasttrack_exact.py │    │
│  │ (DEPRECATED) │  │ (game substrate)  │  │ (exact geometry)   │    │
│  └──────────────┘  └──────────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Status

- **Primary game logic** lives in `board_3d.html` (inline) + `game_engine.js` — these are the authoritative runtime
- **TypeScript kernel** (`kernel/`) exists as a pure deterministic engine but its integration status with the live game is unclear — it may be aspirational or partially integrated
- **Python server-side game logic** exists in 3 variants (server.py, fasttrack_substrate.py, fasttrack_exact.py) with conflicting rules — unclear which (if any) runs server-side validation

---

## 4. Lobby System

### Flow

```
index.html → lobby.html → [auth screen] → [lobby view] → board_3d.html
                                                ↑
join.html → [enter code] → [pending] → [waiting room] ─┘
```

### Components
- **Server:** `lobby_server.py` (2,028 lines) — Python WebSocket server
- **Client:** `lobby_client.js` (2,519 lines) — WebSocket client with reconnect
- **UI:** `lobby_ui.js` (926 lines) — rendering layer
- **Substrate:** `lobby_substrate.js` (746 lines) — P2P mode rules

### Features
- Public/private game creation with 6-char session codes
- Matchmaking queue with ELO-adjacent matching
- Guild system with admin/officers/members
- Tournament brackets (coded but testing status unclear)
- Late-join with host approval
- Chat system with message history
- Player kick/ready/settings management
- Guest login for quick private games

### Issues
- JSON file persistence has no write locking
- No WebSocket rate limiting
- Chat has no profanity filter referenced in code

---

## 5. Auth Flow

### Components
- **Server:** `lobby_server.py` — register/login handlers
- **Client:** `auth_substrate.js` (771 lines) — validation + session management
- **UI:** `auth_ui.js` (998 lines) — login/register/profile views

### Flow
```
lobby.html loads → auth_ui checks session → if expired/missing → show login/register
  ├─ Register: username + email + password → server → SHA-256(password) stored → session token
  ├─ Login: username + password → server → SHA-256(password) compared → session token
  └─ Guest: auto-generated username → session token (limited features)
```

### Critical Issues

| Issue | Severity | Details |
|-------|----------|---------|
| **No password salt** | 🔴 CRITICAL | `lobby_server.py` uses `hashlib.sha256(password)` without salt. Vulnerable to rainbow tables, precomputed attacks. Must use bcrypt/argon2. |
| **Password length mismatch** | 🟡 MEDIUM | Client enforces 8-char minimum, server accepts 4-char — an attacker bypassing client can register weak passwords. |
| **No rate limiting** | 🟡 MEDIUM | No failed login attempt throttling. Vulnerable to brute-force. |
| **No email verification** | 🟡 MEDIUM | Emails stored but never verified. Users can register with fake emails. |
| **No HTTPS enforcement** | 🟡 MEDIUM | WebSocket auto-detects ws/wss but no forced upgrade to secure connection. |
| **Session tokens in localStorage** | 🟢 LOW | Standard for SPAs but vulnerable to XSS. |

---

## 6. AI Behavior

### Implementation
- **`manifold_ai.js`** (744 lines) — Geometric AI. Players modeled as points on mathematical surfaces (z=xy, z=xy²).
- **`board_manifold.js`** (979 lines) — Board as manifold. `pickBots()` generates AI opponents.
- **`game_init.js`** (605 lines) — AI configuration with `ManifoldAI.ARCHETYPES`.

### AI Archetypes
AI personalities are derived from polar coordinates (θ, r) on the manifold surface:
- **θ (angle)** determines personality type (aggressive, defensive, strategic, chaotic, etc.)
- **r (radius)** determines intensity/skill level
- **Fibonacci weight spine** provides non-linear difficulty scaling

### Decision Making
- AI evaluates legal moves and scores them based on personality weights
- Factors: distance to safe zone, cut opportunities, FastTrack entry potential, defensive positioning
- SmartPeg personality affects move preference (kernel/smart_peg.ts)

### Issues
- No difficulty slider directly maps to manifold coordinates — abstraction gap
- AI doesn't track opponent hand (would be illegal in card games, but deck is shared)
- No Monte Carlo tree search or minimax — purely heuristic

---

## 7. Multiplayer Architecture

### Dual Architecture

The game supports **two** multiplayer modes that coexist:

#### A. WebSocket Server Mode (Primary)
```
Client ←WebSocket→ lobby_server.py (port 8765)
  ├─ Auth, session management, matchmaking
  ├─ Game state synchronized through server
  └─ multiplayer_client.js handles sync
```

#### B. WebRTC P2P Mode (kernel/sync.ts)
```
Client ←WebRTC DataChannel→ Client
  ├─ WebSocket signaling server for ICE negotiation
  ├─ Direct peer-to-peer game state transfer
  ├─ Event-sourced — all peers apply same events for deterministic state
  └─ hashState() verification for sync integrity
```

### Components
| Component | Role |
|-----------|------|
| `lobby_server.py` | WebSocket server, auth, sessions |
| `lobby_client.js` | Client-side WebSocket connection |
| `multiplayer_client.js` | Game-level sync |
| `kernel/sync.ts` | WebRTC P2P architecture |
| `kernel/events.ts` | Event schema |
| `manifold_runner.py` | Music math transmission (port 8767) |

### Issues
- **Two competing sync architectures** — unclear which is primary in production
- WebRTC sync.ts is TypeScript but game engine is JavaScript — integration boundary unclear
- Action queue in `multiplayer_client.js` for offline resilience is a good pattern
- Heartbeat/ping intervals exist but no documentation on expected latency tolerances

---

## 8. Critical Issues

### 🔴 Critical

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | **Unsalted SHA-256 password hashing** | `lobby_server.py` | All stored passwords vulnerable to rainbow table attacks |
| 2 | **6+ conflicting track sizes** | Multiple files | Game rules differ everywhere: 36, 60, 72, 84, 90 holes |
| 3 | **Conflicting peg counts** | Multiple files | 4, 5, or 6 pegs per player depending on file |

### 🟠 High

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 4 | **Conflicting card values** | substrate vs kernel | K=13 (substrate) vs K=1 (kernel/rules.ts) |
| 5 | **Conflicting entry cards** | substrate vs rules | {A,K,JK} vs {A,6,Joker} |
| 6 | **Conflicting bullseye exit cards** | spec vs rules | {A,J,Q,K,Joker} (spec) vs {J,Q,K} (rules) |
| 7 | **Two Genesis models** | substrate vs runner | 0–6 model vs 1–7 model |
| 8 | **Password length mismatch** | server vs client | 4-char (server) vs 8-char (client) |
| 9 | **14,118-line monolithic HTML** | `board_3d.html` | Unmaintainable; mixes concerns |

### 🟡 Medium

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 10 | Dead code: `server.py` (dice-based) | root | Confuses which server is canonical |
| 11 | Dead code: music backup files | root | `_v1_backup.js`, `_v2_backup.js` should be archived |
| 12 | Duplicate avatar systems | `avatar_substrate.js` + `avatars.js` | Two independent avatar catalogs |
| 13 | No write locking on JSON persistence | `lobby_server.py` | Concurrent writes could corrupt data |
| 14 | No login rate limiting | `lobby_server.py` | Brute-force vulnerability |
| 15 | Theme name inconsistency | `game_sfx.js` | ROMAN_COLISEUM vs COLOSSEUM |
| 16 | Player color name inconsistency | inventory vs spec | Red/Teal/Violet/Gold/Azure/Pink vs Red/Orange/Green/Blue/Purple/Yellow |
| 17 | Three.js r128 outdated | `board_3d.html` | Missing security patches and features from r160+ |
| 18 | Invalid HTML in mobile.html | `mobile.html` | `<style>` tag wrapping a `<link>` tag |

### 🟢 Low

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 19 | `__init__.py` contains logic (231 lines) | root | Should be imports only |
| 20 | `test_sounds.html` in production | root | QA tool should be excluded from prod build |
| 21 | Hardcoded `GAME_URL` | `growth_substrate.js` | Should be configurable |

---

## 9. Quality Assessment

### Strengths

1. **Rich feature set** — The game has lobby, auth, guilds, tournaments, prestige, themes, AI, 3D rendering, procedural audio, commentary, PWA, push notifications, service worker, embed support, demo mode, promo video generator, press kit, SEO, analytics, Steam integration scaffolding, and moderation/appeals.

2. **ButterflyFX substrate architecture** — The manifold-based design (boards as mathematical surfaces, AI as geometric points, music as waveform descriptors) is innovative and provides natural extension points.

3. **Procedural audio** — Full chiptune music engine, two-commentator speech system, reactive crowd sounds, and theme-specific SFX — all generated at runtime with no audio file dependencies.

4. **TypeScript kernel design** — Pure deterministic, event-sourced game logic with seeded PRNG and state hashing for sync verification is architecturally excellent.

5. **Mobile UX document** — The UX guidelines (3 taps to game, one concern per view, 48px touch targets) represent best-practice mobile design.

6. **Canonical rules documentation** — `FASTTRACK_RULES.md` is thorough and well-written, covering every edge case.

### Weaknesses

1. **Rule fragmentation** — The canonical rules exist in 7+ locations (FASTTRACK_RULES.md, FASTTRACK_CARD_RULES.md, fasttrack_game_spec.json, rules_substrate.js, game_engine.js, kernel/rules.ts, card_deck_substrate.js, fasttrack_substrate.py, fasttrack_exact.py) that **all disagree** on fundamental parameters (track size, peg count, entry cards, card values, bullseye exit rules).

2. **Monolithic board_3d.html** — At 14,118 lines, this single file is the entire game. It should be decomposed into components.

3. **Security debt** — The auth system has multiple vulnerabilities, most critically unsalted password hashing.

4. **Dead/duplicate code** — Deprecated server.py, music backups, dual avatar systems, and possibly the Python game substrates (if JS is the runtime authority) create confusion.

5. **Unclear TypeScript kernel integration** — The kernel is beautifully designed but its relationship to the actual running game (board_3d.html + game_engine.js) is unclear. It may be aspirational.

6. **No test suite** — No unit tests, integration tests, or end-to-end tests found in the FastTrack directory.

### Recommendations

| Priority | Action |
|----------|--------|
| 🔴 P0 | Replace SHA-256 password hashing with bcrypt/argon2 + per-user salt |
| 🔴 P0 | Designate ONE canonical rule source and reconcile all 7+ implementations |
| 🟠 P1 | Add login rate limiting (e.g., 5 attempts/minute) |
| 🟠 P1 | Enforce consistent password requirements (server ≥ 8 chars) |
| 🟠 P1 | Extract inline scripts from board_3d.html into separate JS files |
| 🟡 P2 | Move server.py, music backups to _archive/ |
| 🟡 P2 | Consolidate avatar systems into one |
| 🟡 P2 | Resolve 0–6 vs 1–7 Genesis model conflict |
| 🟡 P2 | Add file-level write locking to JSON persistence |
| 🟢 P3 | Update Three.js from r128 to current |
| 🟢 P3 | Add unit tests for kernel/ and game_engine.js |
| 🟢 P3 | Fix invalid HTML in mobile.html |
| 🟢 P3 | Remove test_sounds.html from production paths |

---

### Summary Statistics

| Category | Files | Lines |
|----------|-------|-------|
| Python (server + tools) | 9 | 6,078 |
| JavaScript (client) | 38 | 41,423 |
| TypeScript (kernel) | 7 | 3,363 |
| HTML (pages) | 12 | 19,291 |
| CSS (styles) | 12 | 9,509 |
| JSON (data) | 3 | 609 |
| Markdown (docs) | 6 | 2,369 |
| Native (Electron) | 4 | 945 |
| **Active Total** | **91** | **~82,800** |
| Archive (deprecated) | 34 | ~17,100 |
| **Grand Total** | **125** | **~99,900** |

---

*Report generated from exhaustive file-by-file analysis of the FastTrack codebase.*
