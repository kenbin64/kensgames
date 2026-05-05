# HARD RULES — KensGames Product Constraints

> **Precedence:** This document is a hard-rule overlay. Where any other doc
> (including `KENSGAMES_5_GAME_SPEC.md`) softens or contradicts a rule below,
> **this document wins** until explicitly superseded by the user.
>
> Rules are numbered for reference (`HR-1`, `HR-2`, …). Do not renumber.

---

## 0. Product Positioning, Identity, & License

**HR-0.** **Three-tier surface.** The product presents three audiences at three altitudes; every page must clearly belong to one tier:

1. **Resume / Portfolio** — highest-stakes audience. Recruiters, hiring managers, technical reviewers. Demonstrates engineering capability through working software.
2. **Games Portal** — largest-count audience. Players. Reaches the games quickly without theory friction.
3. **Theory / Proof-of-Concept** — opt-in audience. Researchers, mathematicians, curious developers. Lives behind explicit links (e.g. `/x-dimensional`); never ambushes a player.

**HR-0.1.** **Player path is dominant.** A first-time visitor lands and can play within two clicks. Theory and resume content are reachable but never blocking.

**HR-0.2.** **Resume path is recoverable.** A recruiter can locate creator, contact, work samples, and a one-line capability summary within the first viewport of any portal page (via nav / footer).

**HR-0.3.** **Theory path is opt-in.** "X-Dimensional," "manifold," "Schwarz Diamond," and other paradigm vocabulary appear only on theory routes and developer docs — never in onboarding flows, wizards, or active gameplay UI.

**HR-0.4.** **Creator profile (canonical).** The single source of truth for the creator block, used in About, footer, native-app About panes, and store listings:

- Name: **Kenneth Bingham**
- Roles: **Software Engineer · AI Specialist · Imagineer**
- Specializations: distributed systems · AI / ML / agent infrastructure · real-time multiplayer · 3D / WebGL / shaders · multi-platform (web, desktop, mobile, VR) · developer tooling · build pipelines · gameplay systems
- Contact: **kenetics.art@gmail.com**

**HR-0.5.** **Nav structure & branding mark.** The portal nav carries exactly six elements in this order:

1. **ButterflyFx brand mark** — icon-only on viewports `<640px`, icon + wordmark on viewports `≥640px`; links to home `/`.
2. **Play** — links to home (alternate route to (1) for clarity).
3. **About** — `/about`.
4. **Features** — `/features`.
5. **The Paradigm** — `/x-dimensional`.
6. **Sign In** — passkeys-first auth surface (per `HR-17`).

Brand assets live at `lib/brand/butterflyfx-{icon,labeled}.{svg,png}`. The favicon is the icon variant. The `alt` text on both variants is "ButterflyFx".

**HR-0.6.** **Branding & attribution.** "KensGames" is the player-facing property name. "ButterflyFx" is the platform/engine brand and appears as the persistent nav mark per `HR-0.5`. "X-Dimensional" is the paradigm name and appears only in attribution, the `/x-dimensional` showcase route, and developer docs.

Theory and paradigm content never appear inside **gameplay surfaces** (active match UI, wizards, post-match flows). Portal **chrome** (nav, footer, page frame) is exempt from this restriction because it is shared infrastructure.

**HR-0.7.** **Tone.** Player-facing copy is plain, friendly, and concrete. Resume copy is precise and verifiable. Theory copy is rigorous and references the formal directive (`docs/X-DIMENSIONAL-AI-DIRECTIVE.md`). Tone never mixes within a single surface.

**HR-0.8.** **No theory ambush.** Onboarding, wizards, gameplay, and post-match never expose paradigm vocabulary to players. Violation of this rule blocks merge regardless of other compliance.

**HR-0.9.** **License & IP boundary.** A `LICENSE.md` lives at the repo root and a `/legal` page mirrors it on the portal. Standard engine plumbing, common gameplay primitives, and shared utilities are open source under MIT-style terms. Original elements — the **X-Dimensional Paradigm**, the **ButterflyFx** brand and engine identity, and per-game novel mechanics declared in the spec — are reserved as trade secrets and/or candidates for future patent filings; they are not licensed for redistribution. Every native wrapper and store listing carries the attribution stack of `HR-0.4` and the license boundary above.

**HR-0.10.** **Brand stack (three domains, one identity).** Three sibling domains form the public face of the work, each with a distinct purpose and one shared creator identity (`HR-0.4`):

- **kensgames.com** — games portal. Players reach games here.
- **thetwistedsquare.com** — blog. Editorial about the games, the butterflyfx manifold, the Schwarz Diamond, and applications in AI, internet, game and app science, infrastructure, and engineering.
- **butterflyfx.us** — app portal and the public face of the butterflyfx / x-dimensional manifold API for external developers.

Each footer cross-links the other two domains. The ButterflyFx brand mark and Kenneth Bingham attribution carry across all three (`HR-0.5`, `HR-0.6`).

---

## 1. Viewport & Scrolling

**HR-1.** Every view must be tailored to the viewport it renders in.
There is no "design at one size and let it scroll" fallback.

**HR-2.** **Game play surfaces:** zero scrolling — vertical or horizontal.
The entire active game must occupy exactly one screen at every supported
breakpoint (smartphone portrait, smartphone landscape, tablet, desktop).
If the game cannot fit, scale it down; never introduce scroll.

**HR-3.** **Wizards (any wizard, any game):** zero scrolling. Each wizard
**step** occupies exactly one screen. If a step has more content than fits,
split it into additional steps — never add scroll.

**HR-4.** **Portal pages** (home, discover, lounge, showcase, X-Dimensional,
auth pages) MAY scroll **vertically** because the portal is content-heavy.
Portal pages MUST NOT scroll **horizontally** at any breakpoint, ever.

**HR-5.** **Vertical alignment:** All portal sections stack vertically and
each section claims the full viewport width. No horizontal page panning.
Card rails / carousels are the only allowed horizontal motion, and they are
contained inside a single section's bounds.

**HR-6.** Smartphone gameplay must run on a single screen with bottom-anchored
controls that do not occlude the play area. (Reaffirms `KENSGAMES_5_GAME_SPEC.md`
§8.1; tightens it from "should fit" to "must fit, no scroll permitted.")

**HR-6.1.** **Single-viewport rule (relaxed by `HR-6.2`).** Every page on the
site **except the landing page** (`/`) historically had to fit entirely within
the visible viewport at desktop and tablet breakpoints — no vertical scroll,
no horizontal scroll. With `HR-6.2` in force the **vertical** clause is
relaxed: the content plane MAY scroll vertically if necessary, because the
original concern (primary actions getting buried below the fold) is now
solved structurally by the fixed control rail.

What remains in force from `HR-6.1`:
- **Horizontal scroll is still forbidden** at every breakpoint, on every
  non-landing page.
- The "prefer collapse / paginate / tab / split into steps" guidance still
  applies — vertical scroll is permitted, but it is the option of last resort
  after layout-density fixes have been tried.

The landing page (`/`) remains the sole page exempt from `HR-6.1` entirely
and may scroll vertically per `HR-4`.

**HR-6.2.** **Fixed control rail (supersedes the strict no-scroll clause of
`HR-6.1`).** All interactive button-based controls — wizard nav
(Back / Next / Launch / Join / Cancel), in-game controls (move, fire, play
card, end turn, pause), player-roster actions, card pickers, mode toggles,
and any status text that accompanies those controls — live in a
**viewport-fixed footer** ("the control rail") that is rendered **outside**
the game canvas, wizard panel, and 3D / animated rendering layer.

The control rail:
- Uses `position: fixed; left: 0; right: 0; bottom: 0` and stays put as the
  page scrolls.
- Has an opaque background (no see-through onto the content beneath).
- Sits on a z-index above every other layer (game canvas, modals,
  Hollywood backdrop, searchlights, particle effects).
- Reserves a known height exposed as a CSS custom property (`--kg-rail-h`)
  that the content plane MUST subtract from `100dvh` / `100vh` so the rail
  never covers content and content never covers the rail.
- MAY have a fixed-header companion (`position: fixed; top: 0`,
  `--kg-header-h`) for branding / global nav under the same principle.

The content plane (everything between header and rail):
- Hosts game canvases, wizard choice/info panels, and promo content —
  **content only**.
- Contains **zero overlay buttons, zero overlay text strings, zero floating
  player cards, zero in-canvas HUD widgets**. All such elements move into
  the control rail (or, for purely informational items, into the fixed
  header).
- MAY scroll vertically when content density requires it.
- MUST NOT scroll horizontally.

Mobile: the rail remains bottom-anchored across all breakpoints and does
**not** collapse into a hamburger / drawer. Game and wizard content reflows
above it. (Tightens and supersedes `HR-6`'s "bottom-anchored controls"
phrasing — the controls are not merely bottom-anchored, they are in a
separate plane.)

The shared wizard (`HR-7`) and shared game manager (`HR-21`) are responsible
for emitting their button / status output **through the rail mount point**
rather than rendering inline buttons inside the wizard / game container.
Existing pages that currently overlay controls on canvases or panels must
be migrated to the rail.

If content does not fit in the content plane at desktop/tablet:
- collapse, paginate, tab, or accordion it (preferred); or
- scale typography / spacing down within readability limits; or
- split the flow into additional steps (for wizards, see `HR-3`); or
- as a last resort, allow vertical scroll within the content plane — the
  rail keeps controls reachable.
Horizontal scrollbars to "make it fit" remain forbidden.

---

## 2. Wizards (Game Setup)

**HR-7.** There is exactly **one** game-setup wizard implementation, shared
by every game. No game ships its own wizard. No duplication.

**HR-8.** The shared wizard is parameterized **only** by data the game passes
in (e.g., game id, display name, min/max players, supported modes, supported
solo/bot/remote/local flags). Game-specific wizard code is forbidden.

**HR-9.** Wizards are **sequential**, one decision per step. Never present
the entire configuration form at once. Forward/back navigation between steps
is required; skipping is allowed only when a prior choice makes a step moot.

**HR-10.** Game-capability flags the shared wizard must support:
- `supportsSolo` — single human player only.
- `supportsSoloWithBots` — single human + AI bots.
- `supportsRemoteMultiplayer` — multiple humans over Socket.IO.
- `supportsLocalMultiplayer` — multiple humans on the same machine,
  one input device, **no split-screen renders** (`HR-11`).

**HR-11.** **Split-screen rendering is forbidden.** Local multiplayer is
turn-based / shared-input only. (Reason: `HR-2` — one screen per game.)

**HR-12.** Match-creation modes the wizard must offer (when capability allows):
- **Play by invite** — host generates code/URL, sends to specific people.
- **Play by match** — host opens to public matchmaking; any eligible player
  may auto-join.
- **Create game and people join** — host opens a public lobby; players see
  it in a lobby list and choose to join.
- **Private game** — invite-code-gated, never appears in public lobby lists.

---

## 3. Authentication & Landing

**HR-13.** **No sign-in is required to reach `kensgames.com/` or `/join`.**
A visitor or invitee can land, choose a display name + avatar, and play
without ever creating an account.

**HR-14.** Display name + avatar selection is mandatory before joining any
match (guest or registered). The chosen identity persists per device for
the session.

**HR-15.** Registration prompts are deferred to **post-match**. At the end of
the first game a guest plays, the system invites (does not require)
registration to save progress, friends, and stats.

**HR-16.** Authenticated features (persistent profile, friends list,
leaderboards, ranked matches) require a registered account. Guest play
covers solo, bot, invite-join, and casual public matches.

**HR-17.** Persistent-account auth is **passwordless** and uses this stack,
in priority order:

1. **Passkeys (WebAuthn / FIDO2)** — primary. A passkey is a cryptographic
   credential stored on the user's device(s) and synced across them by the
   platform (iCloud Keychain, Google Password Manager, 1Password, Bitwarden,
   etc.). This is the industry-standard realization of the "identity file
   that travels with you" concept and is now backed by Apple, Google, and
   Microsoft as the post-password successor.
2. **OAuth / OIDC social login** — fallback. Providers: Google, Discord,
   Apple. (Existing `server/` scaffolding already references Discord and
   Google env vars — keep those; add Apple.)
3. **Email magic link** — universal fallback. One-time signed link delivered
   by email; clicking it creates a session. No password ever set.

**HR-17.1.** **No passwords are stored anywhere in the system.** No password
fields, no password reset flows, no `bcrypt`/`argon2` columns. If existing
scaffolding has password tables/columns, mark them deprecated and migrate.

**HR-17.2.** Sessions are signed JWTs in `HttpOnly`, `Secure`, `SameSite=Lax`
cookies. JWT signing key lives in `JWT_SECRET` (already referenced in the
VPS AGENTS.md §7).

**HR-17.3.** **Cloudflare Turnstile** gates the passkey-registration and
magic-link-request endpoints (abuse protection only — not an auth provider).
Cloudflare Workers / Pages MAY host the auth API; this is an implementation
choice, not a requirement.

**HR-17.4.** Guest sessions (per HR-13) are persisted as an anonymous
identity in `localStorage` + a signed `guest_id` cookie. At the post-match
upgrade prompt (HR-15), the guest identity is **claimable** — registering
binds the guest's display name, avatar, and match history to the new
account without losing them.

**HR-17.5.** No feature may hard-couple to a specific auth provider. The
auth layer exposes a uniform `getCurrentUser()` / `requireAuth()` interface;
games and portal pages call only that interface.

---

## 4. No-Duplication Restatement

**HR-18.** Per the standing project rule: anything shared between games is a
**service**, not a vendored copy. The shared wizard (`HR-7`) and the shared
game manager (`HR-21`) are instances of this rule. Engine code, auth, asset
pipelines, and UI shells follow the same pattern.

---

## 5. Game Manager (Runtime)

**HR-21.** There is exactly **one** game-manager implementation, shared by
every game. The game manager is the runtime counterpart to the shared wizard
(`HR-7`): it owns session lifecycle, player slots, ready states, host
controls, turn/tick orchestration, score/result reporting, and post-match
flow. No game ships its own manager. No duplication.

**HR-22.** The shared game manager is parameterized **only** by data the game
declares in its manifest (game id, min/max players, supported modes from
`HR-10`, turn model, tick rate, scoring schema, win conditions).
Game-specific manager code is forbidden; gameplay logic lives inside the
game module the manager hosts.

**HR-23.** The game manager is a **service**, not a vendored copy
(per `HR-18`). Client games consume it via a stable URL — script endpoint for
the client half, WebSocket endpoint for the server half — served by the
unified server (`server/lobby-server.js` is the current locus).

**HR-24.** Manager responsibilities (must be uniform across games):
- Lobby state: `open` / `locked` / `in-progress` / `completed`.
- Player roster: join, leave, kick, promote-to-host, ready toggles, bot fill.
- Identity: pulls display name + avatar from the guest/registered identity
  per `HR-14`; never re-prompts.
- Mode enforcement: validates the configured mode matches the game's
  capability flags (`HR-10`).
- Match handoff: hands the validated session to the game module to start;
  receives result events back.
- Post-match: emits the registration-invite hook for guests (`HR-15`) and
  persists results for registered users.

**HR-25.** The wizard (`HR-7`) and the game manager (`HR-21`) share a single
session contract — the wizard's terminal output IS the manager's input.
They must not diverge into separate state shapes.

**HR-26.** The game manager exposes a uniform interface to every game
(e.g. `startMatch(session)`, `reportResult(result)`, `onPlayerEvent(handler)`).
Games never reach into manager internals nor maintain parallel session state.

---

## 6. Decision Substrates

**HR-27.** Every non-trivial game-manager determination is expressed as one of:
- a **determination graph** — manifold-valued, continuous over the
  X-Dimensional field; resolved via `Field.observe(x, y, m)`.
- a **decision tree** — discrete branching over typed inputs; declared as
  data, not code, and lives next to the relevant game's manifest.

Ad-hoc `if/else` chains for non-trivial decisions in manager code are
forbidden. Every branch must be lifted into one of these two structures so
the determination is inspectable, loggable, replayable, and tunable.

**HR-28.** Determination graphs are the default for **continuous** runtime
decisions (matchmaking similarity, scenario novelty score, AI difficulty
adaptation, performance-tier thresholds, fairness balancing).

**HR-29.** Decision trees are required for **discrete** configuration
determinations (capability gating per `HR-10`, scenario selection from a
finite library per `HR-34`, lobby state transitions per `HR-24`,
AI-role assignment per `HR-31`).

**HR-30.** Both substrates emit a structured trace per determination
(`{inputs, path, outputs, ts}`) into the manager's `game-manager.log`
(file already exists at `state/game-manager.log`). No silent decisions.

---

## 7. AI Participation

**HR-31.** AI is a first-class participant in the game manager. Roles
(any combination, set per match by host or by manager defaults):
- **Gamekeeper** — enforces rules, mediates disputes, narrates state.
- **Facilitator** — guides hosts through wizard, suggests modes, answers
  rules questions.
- **Host** — assumes host duties when no human host volunteers.
- **Logger** — produces match transcripts, highlights, post-match summaries.
- **Player** — fills bot slots; ephemeral (anonymous) or persistent persona.
- **Curator** — generates scenario variants per `HR-34`.
- **Performance Tailor** — observes telemetry, adjusts tier per `HR-37`.

The seven roles above are *reactive*: they participate within an existing
manifest. The two *generative* roles — **Game Master** and **Game Maker**
— extend Gamekeeper+Curator with manifold-awareness and are defined in
`HR-47` and `HR-48`.

**HR-32.** AI keys (LLM provider tokens, MCP credentials) live **only on
the server** (game manager). The client never holds AI keys. Clients trigger
AI work only by sending normal player/manager messages; the server fans out
to AI providers as needed.

**HR-33.** AI is **out of the realtime tick loop**. AI players act as peers
over the same WebSocket protocol as humans (`HR-26`). The manager never
blocks on AI for in-match moves. Synchronous AI calls are allowed only
**pre-match** (scenario generation, lobby setup, performance tier negotiation)
and **post-match** (summary, narration, persistent-persona update).

**HR-34.** Scenario boundary: every game declares a finite scenario library
in its `manifold.game.json` (`attributes.scenarios` — already in use for
4DConnect). AI Curators may **recombine declared parameters** to produce
variants, but may not invent rules outside the manifest. The manifest is
the trust boundary. Game Makers (`HR-48`) may **propose** extensions to
this manifest via the proposal-and-approval lane defined there; they
cannot bypass it.

**HR-35.** AI participants are **transparent** to humans. The session
roster shows, per AI peer: role, persona name, provider, and an "AI"
badge. No covert AI players. Persistent AI personas have a public profile.

**HR-36.** The game manager exposes itself as an **MCP server** so any
MCP-compliant AI client (Claude Desktop, IDE agents, custom tools) can
connect with three permission levels, each requiring host approval before
the session activates the connection:
- **observer** — read-only session feed.
- **player** — joins as a peer like any human (subject to `HR-35`).
- **logger / curator** — read manager log + write scenarios/summaries; no
  in-match actions.

The same manager simultaneously acts as an **MCP client** to call out to
provider APIs for Curator and Performance-Tailor work. Both directions go
through one auditable surface.

---

## 8. Performance Tailoring

**HR-37.** Performance tier is detected client-side at session join from:
`navigator.hardwareConcurrency`, `navigator.deviceMemory`,
`devicePixelRatio`, GPU vendor/renderer (via WebGL
`WEBGL_debug_renderer_info`), and a ≤1-second microbenchmark. Resulting
tier ∈ {`low`, `mid`, `high`} is reported to the manager and persisted on
the user/guest identity for next session.

**HR-38.** The manager broadcasts each peer's tier in session state. Games
adapt: shader complexity, particle counts, shadow quality, physics tick
rate, per-frame entity caps. In a shared scene the lowest tier present
caps shared-scene fidelity; per-camera tiering is allowed where it does
not violate `HR-11` (no split-screen).

**HR-39.** Tier never gates **participation**. A low-tier device may
always join any match; only render/physics fidelity scales. Gameplay
rules, scoring, and outcomes are identical across tiers.

---

## 9. Generative AI Roles

These two roles extend the *reactive* AI participation of `HR-31` with
**manifold-awareness**: the broker hands the provider a structured view
of the active manifold (current `(x, y)`, recent `z` trace, declared
parameter ranges, local field gradient) at decision points. Both roles
remain bound by the universal access rule `z = x · y` and by `HR-33`
(no AI in the realtime tick).

**HR-47.** **Game Master (manifold-aware director).** A Game Master
reads `(x, y, z)` continuously and writes adjustments to `y` (modifiers)
at **scenario boundaries only** — never inside the realtime tick
(`HR-33`). All adjustments stay within the declared parameter ranges of
the active scenario (`HR-34`); the manifest remains the trust boundary.
A Game Master never writes `z` directly — `z` is always derived. Every
adjustment emits a structured trace per `HR-30`. The session roster
(`HR-35`) shows a "Game Master" badge alongside the AI badge when the
role is active.

**HR-48.** **Game Maker (manifold-aware author).** A Game Maker may
**propose** new scenario manifests by sampling the manifold field.
Output is a candidate `manifold.game.json` (or an `attributes.scenarios`
extension) written to `proposals/<game-id>/` — **never** directly to
`dist/`, **never** to `js/manifold.registry.json`. Promotion proceeds
in two gated tiers:

- **Per-host promotion (private).** Any registered host may approve a
  proposal for use in **their own sessions only**. The proposal is
  loaded by the manager solely for sessions that host runs. Before
  activation, the manifold compiler (`engine/manifold_compiler.py`)
  must validate `z = x · y` and the existing test suite must pass. The
  session roster discloses "AI-authored scenario" per `HR-35`.
- **Portal-wide promotion (public).** Promotion of a proposal into the
  shared registry — making it available portal-wide and to other hosts
  — requires explicit approval by **Kenneth Bingham** (the creator, per
  `HR-0.4`). Compiler validation and test-suite pass remain prerequisite.

Game Makers never write `z` directly. Proposed manifests must declare
`(x, y, z)` and satisfy `z = x · y`. Failed proposals are retained in
`proposals/<game-id>/rejected/` with the failure reason for transparency
(`HR-30`).

**HR-49.** **Games Promoter (manifold-aware author of public-facing content).**
A Games Promoter generates promotional and editorial content about the
portal, its games, and the butterflyfx / x-dimensional manifold paradigm.
Two output lanes:

- **Content lane.** Blog posts (thetwistedsquare.com per `HR-0.10`),
  landing copy, social posts, "Game of the Week" features. Drafts queue
  in `proposals/promoter/<lane>/`. Every draft requires Kenneth Bingham's
  approval before publication, with the right to edit, extend, or
  rewrite prior to approval. Author byline credits Kenneth Bingham
  (`HR-0.4`); AI assistance is disclosed per `HR-35`.
- **Outreach lane.** Emails to journalists, streamers, critics, and
  conference organizers. Approval is per campaign: Kenneth Bingham
  approves the message template and the recipient list as a batch.
  Specific recipients may be flagged "individual approval required" for
  per-send review. Every send carries an unsubscribe link, retains a
  recipient consent record, and complies with applicable email law
  (CAN-SPAM, GDPR, CASL).

**Topic scope.** Games on the portal, the butterflyfx manifold, the
Schwarz Diamond as engineering marvel, applications in AI / internet /
game and app science / infrastructure / engineering. Off-brand topics
are not auto-rejected; they queue for Kenneth Bingham's call.

**Truthfulness gate.** Factual claims about a game must come from
inspecting that game's `manifold.game.json`, the live build, or sources
Kenneth Bingham has approved. No invention. Failed verifications are
retained in `proposals/promoter/rejected/` per `HR-30`.

**Game of the Week.** Promoter ranks candidates against published
criteria (player count, novelty, community feedback, Kenneth Bingham's
manual nominations) and proposes the top three. Final pick by Kenneth
Bingham.

---

## 10. Platform Distribution

**HR-40.** **Per-game platform declaration.** Each game declares the
platforms it ships to in its `manifold.game.json`. Web (kensgames.com)
is required for every game. Additional platforms are per-game decisions.

**HR-41.** **Marquee games.** A "marquee" game is one substantial enough
to warrant standalone distribution. Marquee games target all of:
- **Web** (kensgames.com) — always
- **Steam** (PC desktop)
- **iOS App Store** + **Google Play** (mobile)
- **VR** via WebXR when the game supports immersive mode
- Additional storefronts (Itch.io, Epic, GOG, Quest Store) as marketing
  strategy dictates

Currently designated marquee games: **FastTrack**, **Starfighter**.

**HR-42.** **No wrapper duplication (extends HR-18).** Platform wrappers
do not duplicate game logic. Wrappers consume the same shared substrate
the web version uses (engine, manifolds, game manager, auth). Native
packaging provides distribution, not reimplementation.

**HR-43.** **Multiplayer reach.** Multiplayer in native wrappers connects
to the shared game manager (`HR-21`) over network. Single-player and
bot-only matches may run fully offline. Each wrapper declares its
offline/online capability in its store listing.

**HR-44.** **Cross-platform attribution.** Every native wrapper carries
the attribution stack of `HR-0.4`/`HR-0.6`:
- Developer: **Kenneth Bingham**
- Publisher: **ButterflyFx**
- Engine credit: **ButterflyFx / X-Dimensional Programming Paradigm**
- Contact: **kenetics.art@gmail.com**
- License & IP: as in `LICENSE.md` / `/legal` (`HR-0.9`)

Store listings, splash screens, and About panes within the apps must
show this attribution. The creator profile (`HR-0.4`) may appear in the
app's About surface.

**HR-45.** **Portable identity.** A player's identity is portable across
web and native platforms. Passkeys (WebAuthn / FIDO2, `HR-17`) are the
canonical mechanism — they work natively on iOS, Android, Windows, and
macOS via OS keychains. Platform-specific auth (Sign in with Apple,
Sign in with Google, Sign in with Steam) is acceptable as additional
sign-in options, but the underlying identity is the cross-platform
passkey or OAuth account.

**HR-46.** **VR conformance.** When a game runs in immersive (VR) mode:
- `HR-2` (zero-scroll) becomes "no chrome scrolling in stationary view".
- Comfort options (vignetting, snap turn, teleport locomotion) must be
  available even when not default.
- Motion-sickness considerations override aesthetic preferences.
- The same game manager and identity stack apply (`HR-21`, `HR-45`).

---

## 12. Federated Content

These rules govern thetwistedsquare.com (`HR-0.10`) and the federation
of content from external authors. The architectural commitment is
**manifold-indexed, host-stored, proxy-served**: the manifold owns the
index and identity; the author's machine owns the content; the portal
server is the public entry point and never the canonical store of the
body text.

**HR-50.** **Federation model.** The manifold stores per-post metadata
only (author handle, slug, title, content hash, signed origin URL,
timestamp, tags). Post body, images, and assets live on the author's
own machine at the signed origin URL. Reader requests to
`thetwistedsquare.com/authors/<handle>/<slug>` flow through portal
nginx, which fetches from the origin, verifies the content hash against
the manifold entry, edge-caches briefly (60 to 300 seconds), and
serves. If the origin is offline, cached content serves while fresh;
otherwise a "currently unavailable" page renders the manifold metadata.
Portal search is metadata-only.

**HR-51.** **Author identity.** Author handles are passkey-bound
(`HR-17`) and not transferable. Each author page carries platform
creator attribution to Kenneth Bingham (`HR-0.4`, `HR-0.6`) in addition
to the author's byline.

**HR-52.** **Editorial workflow.** New authors require Kenneth
Bingham's approval before their first manifold entry is accepted.
Existing authors publish freely on their own subpath
(`/authors/<handle>/`); the content and byline are theirs. Promotion of
a federated post into the main thetwistedsquare.com feed (front page,
RSS, social cross-posts) requires Kenneth Bingham's approval, like the
Game Maker portal-wide promotion gate (`HR-48`). Takedown removes the
manifold entry; the author's local copy on their own machine is theirs
to keep or delete.

---

## 13. Trade-Secret Boundary

**HR-53.** **Math is public; wiring is the trade secret.** The
mathematics this product rests on (multiplication, division, the
saddle `z = x · y`, hyperbolic surfaces, triply-periodic minimal
surfaces such as the Schwarz Diamond / Schwarz Primitive / Gyroid,
Fibonacci sequences, the golden ratio, the general statement
`z = op(x, y)`) is **public-domain prior art**. None of it is owned
by this product and none of it is restricted from public discussion.

What **is** owned, and what every public surface must protect, is the
**system-level wiring** that selects, composes, and assigns roles
to those public-domain pieces in this product. Specifically:

- **Substrate selection.** Which substrate is canonical (the Gyroid),
  which is auxiliary (Schwarz Diamond as a lens), and how they
  compose, is vault material. Per-game substrate filenames, lens
  classes, and renderer wirings (e.g. `schwarz_diamond_renderer.js`,
  per-game `*_manifold_substrate.js`) are vault material.
- **Role assignment.** The mapping `x = identity/seed/observer`,
  `y = modifiers/nutrients`, `z = manifested state`, `m = manifold
  garden` (`docs/X-DIMENSIONAL-AI-DIRECTIVE.md`) is vault material.
  Per-game `(x, y, z)` numerical triples and the `_axiom`
  declaration are vault material.
- **Layer ladder.** The seven-layer dimensional ladder, the
  Fibonacci scaling `[1,1,2,3,5,8,13]`, traversal-resistance rules,
  and the Genesis-walk cosmology are vault material.
- **Game-specific decompositions.** Per-game substrate
  decompositions (e.g. the Winki six-saddle decomposition, FastTrack
  board manifold) are vault material.

This boundary applies to every public surface uniformly:

- Public HTML (`/x-dimensional/*`, portal pages, blog posts on
  `thetwistedsquare.com`, app/store listings on `butterflyfx.us`)
  may speak about the **mathematics in the abstract** and the
  paradigm at the worldview level (identity, dimensions, gather /
  explode, manifolds carry information). Public HTML may **not**
  identify which specific substrate the system uses for which job,
  the per-game `(x, y, z)` triples, the layer ladder, or the
  Fibonacci scaling.
- Browser-served JSON (`/js/manifold.registry.json`,
  `/x-dimensional/manifold.proof.json`, any compiled manifest at
  the web root) is a public surface and is bound by the same line.
  Wiring fields (`dimension`, `_axiom`, `substrates`,
  `dimensions: { x: "player_count", ... }`, etc.) are stripped
  from any artifact compiled to the web root.
- AI-generated output from any role — Game Master (`HR-47`),
  Game Maker (`HR-48`), Games Promoter (`HR-49`), federated
  authors (`HR-50`–`HR-52`) — speaks about the mathematics
  in the abstract and stops at the wiring line. Outputs that
  cross the line are revisions, not publications.
- `docs/`, `engine/`, `server/`, source `manifold.game.json` files,
  source `manifold.portal.json`, and per-game substrate `.js`
  files are vault material. The `docs/` directory is **not**
  served at any public URL; the deploy pipeline excludes it.
- Source citations on public pages refer to the directive in the
  abstract ("internal axiomatic directive", "x-dimensional
  paradigm") and **never** as a fetchable URL such as
  `/docs/X-DIMENSIONAL-AI-DIRECTIVE.md`.

This rule does not restrict private collaboration, peer review,
patent filings, academic publication under Kenneth Bingham's name
on `thetwistedsquare.com`, or paid licensing of the wiring. It
restricts only **uncompensated public broadcast** of the wiring
through the product surface.

---

## 14. Compliance Procedure

**HR-19.** Before merging any UI change, verify against this file at every
required breakpoint:
- smartphone portrait (≤ 414 px)
- smartphone landscape
- tablet
- desktop (1280, 1920)

**HR-20.** If a rule cannot be satisfied, **stop and surface the conflict
to the user**. Do not silently violate a hard rule; do not invent a soft
exception. Hard rules change only by explicit user instruction recorded
here.

---

## Changelog
- 2026-05-03 — Initial hardset rules captured from user directive
  (viewport/scroll, wizard sharing, multiplayer modes, guest landing,
  open auth question).
- 2026-05-03 — HR-17 resolved by user delegation to industry standards:
  passkeys-first (WebAuthn/FIDO2), OAuth fallback (Google/Discord/Apple),
  email magic-link universal fallback. Zero passwords system-wide.
  Cloudflare Turnstile for abuse protection. Added HR-17.1–17.5.
- 2026-05-03 — Added §5 "Game Manager (Runtime)" (`HR-21`–`HR-26`) on user
  reminder. Extends the shared-service rule (`HR-18`) from the wizard to the
  runtime manager. Updated `HR-18` to cite both. Renumbered Compliance
  Procedure section header from §5 to §6 (rule numbers unchanged).
- 2026-05-03 — Added §6 "Decision Substrates" (`HR-27`–`HR-30`),
  §7 "AI Participation" (`HR-31`–`HR-36`), §8 "Performance Tailoring"
  (`HR-37`–`HR-39`) on user directive: determination-graph + decision-tree
  as game-manager substrates; AI as gamekeeper/facilitator/host/logger/
  player/curator/tailor; MCP server + client both directions; client-side
  tier detection with non-gating fidelity scaling. Renumbered Compliance
  Procedure section header from §6 to §9 (rule numbers unchanged).
- 2026-05-03 — Added §0 "Product Positioning, Identity, & License"
  (`HR-0`–`HR-0.9`): three-tier surface (Resume / Games / Theory),
  player-path dominance, opt-in theory, creator profile, nav structure with
  ButterflyFx brand mark, branding & attribution, tone, no-theory-ambush,
  license & IP boundary. Added §10 "Platform Distribution"
  (`HR-40`–`HR-46`): per-game platform declaration, marquee designation
  (FastTrack, Starfighter), no wrapper duplication, multiplayer reach,
  cross-platform attribution, portable identity, VR conformance.
  Renumbered Compliance Procedure section header from §9 to §11
  (rule numbers unchanged).
- 2026-05-04 — Added §9 "Generative AI Roles" (`HR-47`, `HR-48`) on user
  directive: **Game Master** (manifold-aware director that adjusts `y`
  at scenario boundaries within manifest bounds) and **Game Maker**
  (manifold-aware author that proposes new scenario manifests via a
  two-tier gated promotion lane — per-host private use by any registered
  host, portal-wide promotion gated on Kenneth Bingham). Cross-reference
  added in `HR-31` and `HR-34`. The previously-skipped §9 slot is now
  filled; §10 and §11 unchanged.
- 2026-05-04 — Added `HR-0.10` **Brand stack** (kensgames.com /
  thetwistedsquare.com / butterflyfx.us — three sibling domains, one
  creator identity, mutual footer cross-links). Added `HR-49` **Games
  Promoter** in §9 (third generative AI role: content lane queues
  drafts for Kenneth Bingham's approval and editing; outreach lane
  gated per campaign with optional per-recipient flag, full email-law
  compliance). Added §12 "Federated Content" (`HR-50`, `HR-51`, `HR-52`)
  governing thetwistedsquare.com: manifold-indexed, host-stored,
  proxy-served federation; passkey-bound author identity; free
  publication on author subpaths with Kenneth Bingham approval gating
  new authors and main-feed promotion. Renumbered Compliance Procedure
  section header from §11 to §13 (rule numbers unchanged).
- 2026-05-04 — Added §13 "Trade-Secret Boundary" (`HR-53`) on user
  directive: math is public prior art (multiplication, saddles, TPMS
  surfaces, Fibonacci, golden ratio, `z = op(x, y)`); system-level
  **wiring** is the trade secret (substrate selection, `x/y/z` role
  assignment, per-game `(x, y, z)` triples, the seven-layer ladder
  and Fibonacci scaling, per-game substrate decompositions). Public
  surface (HTML, browser-served JSON, AI-role outputs, federated
  authors) speaks at the worldview level only; wiring fields are
  stripped from compiled artifacts at the web root; `docs/` is
  excluded from the deploy pipeline. Renumbered Compliance Procedure
  section header from §13 to §14 (rule numbers unchanged).
- 2026-05-04 — Added `HR-6.1` **Single-viewport rule** on user directive:
  every page on the site **except** the landing page (`/`) must fit
  entirely within the visible viewport at desktop and tablet
  breakpoints — no vertical or horizontal scroll. Applies to all
  lobbies, discover/lounge/showcase/about/features, all auth pages,
  the dev scenario runner, and per-game landing pages. Smartphone
  breakpoints may stack vertically and scroll as expected mobile
  reflow. Tightens `HR-4`'s "portal pages MAY scroll vertically"
  by carving the landing page out as the sole exception.
- 2026-05-04 — Added `HR-6.2` **Fixed control rail** on user directive
  ("if nav buttons are in a fixed footer that always stays I don't mind
  scrolling … all interactive elements that are button based be this way
  … so we never again have to have buttons or text or any kind of overlay
  over the games or wizards"). All button-based controls (wizard nav,
  in-game controls, player roster actions, card pickers, mode toggles,
  associated status text) move into a viewport-fixed footer rendered
  outside the game canvas / wizard panel / 3D rendering layer. The rail
  is opaque, sits above all other layers, reserves a known height
  (`--kg-rail-h`) the content plane subtracts from `100dvh`, and stays
  bottom-anchored on mobile (no hamburger / drawer collapse). Applies to
  every game and every wizard. Concurrently **relaxed `HR-6.1`'s vertical
  no-scroll clause**: with controls now structurally unreachable-proof,
  vertical scroll inside the content plane is permitted (still as a
  last resort after layout-density fixes). Horizontal scroll remains
  forbidden everywhere.
