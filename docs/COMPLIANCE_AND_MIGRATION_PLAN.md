# KensGames Compliance and Migration Plan

## 1. Purpose
This document defines the implementation plan to bring the portal and game surfaces into full compliance with the current 4-game specification and the X-Dimensional proof-of-concept requirements.

Canonical live games in scope:
- FastTrack
- BrickBreaker 3D
- 4D Connect (with temporary 4DTicTacToe compatibility)
- Starfighter

## 2. Target Compliance Outcomes
1. Home landing and portal pages reflect the 4-game canon.
2. Navigation includes X-Dimensional detail entry point.
3. Featured section follows the 3-in-viewport rule.
4. Full list and Coming Soon list follow responsive layout requirements.
5. Canonical labels and slugs are used player-facing.
6. Legacy paths remain functional until migration completion.
7. Game manifold metadata and runtime bridge states are aligned.
8. Credits and attribution for Kenneth Bingham are present and consistent.

## 3. Current Gap Summary
### 3.1 Portal and UX
- Home currently shows 4 featured cards in the featured section instead of exactly 3 in the first viewport strip.
- Home navigation does not yet include an explicit X-Dimensional nav item.
- Home still uses legacy display names in prominent locations (4D TicTacToe and Alien Space Attack).
- Discover and Showcase still use older substrate-driven catalogs not yet normalized to the 4-game canon language.

### 3.2 Game Metadata and Bridge
- manifold_compatibility blocks in FastTrack, BrickBreaker3D, and Starfighter still indicate bridge_included and state_exposed as false, with todos still open.
- 4D route naming is mixed across canonical and legacy paths and needs full canonical route normalization with alias support.

### 3.3 Surface/Doctrine Consistency
- Some Starfighter manifold descriptors still prioritize Schwarz Diamond wording, while doctrine treats Gyroid as canonical substrate and Schwarz Diamond as lens.

## 4. Migration Principles
- No breaking changes to active player flows.
- Maintain compatibility aliases until all links and references are migrated.
- Prefer additive rollout with feature flags where practical.
- Ship in small, reversible steps with clear validation gates.
- Update docs and implementation in the same release window.
- X-Dimensional programming governs every migration step, implementation decision, and validation gate.

## 4.1 Artifact Bucket Policy
- Dev Bucket:
	- contains drafts, in-progress work, test outputs, and non-production artifacts.
- Prod Bucket:
	- contains production-ready artifacts only.
	- no experimental, incomplete, or unvalidated artifacts are permitted.

Promotion rule:
- an artifact is promoted from Dev Bucket to Prod Bucket only after:
	- implementation complete,
	- validation passed,
	- readiness marked Completed (ready to deploy),
	- deployment and post-deploy checks passed.

## 5. Phased Plan

## Phase 0: Baseline and Freeze (Day 0)
Objective:
- Freeze baseline behavior and define exact migration targets.

Tasks:
- Capture snapshot of existing home/discover/lounge/showcase behavior.
- Capture current game entry routes and redirects.
- Capture current manifold_compatibility fields for all in-scope games.
- Open migration tracking issue with checklist IDs.

Exit criteria:
- Baseline report published.
- Rollback points identified.

## Phase 1: Portal Compliance (Days 1-3)
Objective:
- Make portal IA and landing behavior match spec.

Tasks:
- Add X-Dimensional nav item linking to the paradigm explainer.
- Enforce exactly 3 featured game cards in first viewport strip.
- Implement full games list and coming soon list below featured.
- Ensure large monitors render 3 cards per row in full and coming soon lists.
- Ensure smartphones use controlled horizontal rails with one panel at a time.
- Preserve vertical scrolling between sections.
- Normalize player-facing labels to FastTrack, BrickBreaker 3D, 4D Connect, Starfighter.

Exit criteria:
- UI acceptance checklist passes on desktop and mobile.
- No horizontal free-panning regression.

## Phase 2: Route and Naming Migration (Days 2-5)
Objective:
- Normalize canonical routes and preserve temporary compatibility.

Tasks:
- Ensure canonical links use /4dconnect/ for player-facing navigation.
- Keep /4DTicTacToe/* alias active with redirect or compatibility routing.
- Update portal CTA wiring to canonical slugs.
- Update discover/showcase/lobby references to canonical game identities.

Exit criteria:
- Canonical route smoke tests pass.
- Legacy path continues to resolve to playable flow.

## Phase 3: Lobby and Bridge Integrity (Days 4-8)
Objective:
- Align runtime state exposure with Prime Directive and lobby model.

Tasks:
- Ensure bridge script inclusion and init are consistently active in all in-scope game entries.
- Emit and maintain window manifold state payloads from each game runtime.
- Implement or complete postMessage event wiring to manifold bridge emit pipeline.
- Update manifold_compatibility fields to true when verified.
- Verify readiness and launch gate behavior remains strict and synchronized.

Exit criteria:
- Bridge conformance checklist passes for all 4 games.
- manifold_compatibility todos closed for in-scope games.

## Phase 4: Surface Doctrine Alignment (Days 6-10)
Objective:
- Align manifold wording and substrate declarations with doctrine.

Tasks:
- Audit Starfighter manifold comments and descriptors.
- Reword descriptors so Gyroid is canonical substrate and Schwarz Diamond is lens where required by directive.
- Confirm no route, storage, or indexing behavior contradicts substrate rules.

Exit criteria:
- Documentation and in-code descriptor language aligned.
- No doctrinal conflicts in audited files.

## Phase 5: Credits and Attribution Completion (Days 8-10)
Objective:
- Ensure attribution requirements are visible and consistent.

Tasks:
- Verify creator credit appears in appropriate About and legal/product surfaces.
- Verify games, website, and art paintings attribution to Kenneth Bingham.
- Ensure footer/support pages preserve attribution consistency.

Exit criteria:
- Attribution checklist passes on all required surfaces.

## Phase 6: Final Verification and Release (Days 10-12)
Objective:
- Release with complete compliance evidence.

Tasks:
- Run cross-page QA on home/discover/lounge/showcase and game entries.
- Run route QA for canonical and legacy paths.
- Run multiplayer lobby synchronization smoke tests.
- Publish final compliance matrix with pass/fail per requirement.
- Tag release notes with migration completion markers.

Exit criteria:
- All checklist items marked complete.
- Stakeholder sign-off recorded.

## 6. Work Breakdown by Surface
### 6.1 Home
- Navigation update
- Featured strip update
- Full list and coming soon behavior
- Canonical naming updates

### 6.2 Discover
- Canonical game list and labels
- Filter and card taxonomy alignment
- Launch CTA route normalization

### 6.3 Lounge
- Active multiplayer catalog alignment
- Join flow consistency with canonical IDs
- Presence and leaderboard messaging review

### 6.4 Showcase
- Promo substrate list aligned to 4 canonical games
- Media tabs and play actions route-correct

### 6.5 Game Entries
- FastTrack, BrickBreaker3D, 4D Connect, Starfighter bridge and metadata consistency

## 7. Verification Checklist
### 7.1 UX and Layout
- Exactly 3 featured cards in first viewport strip.
- Full and coming soon lists present directly below featured.
- Desktop: 3-per-row grids for full and coming soon.
- Mobile: controlled horizontal rails, one panel at a time.
- No freeform horizontal panning on page body.

### 7.2 Routing
- Canonical URLs used in primary CTAs.
- 4DTicTacToe legacy alias resolves correctly.
- No dead links from navigation or cards.

### 7.3 Bridge and State
- Bridge initialized in all in-scope games.
- Runtime manifold state exposed and updated.
- Lobby mutations synchronize across clients.
- Launch gating respects min players + ready states.

### 7.4 Credits
- Created by Kenneth Bingham present where required.
- Software Engineer credit present.
- Games, website, and art paintings attribution present.

## 8. Risk Register
1. Route migration breaks legacy entry links.
- Mitigation: preserve alias and test redirects before switching CTAs.

2. UI refactor introduces responsive regressions.
- Mitigation: staged CSS rollout and viewport matrix testing.

3. Bridge wiring changes regress multiplayer sync.
- Mitigation: isolate changes behind integration tests and smoke lobbies.

4. Canonical naming updates cause content inconsistencies.
- Mitigation: centralized content map and global text audit.

## 9. Ownership and Cadence
Recommended owners:
- Portal UX owner: landing/discover/lounge/showcase compliance
- Runtime owner: bridge/state/lobby synchronization
- Doctrine owner: manifold language and substrate compliance
- QA owner: route, responsive, and multiplayer verification

Cadence:
- Daily compliance standup during migration window
- Mid-phase check at each phase exit
- Final release review with signed checklist

## 10. Completion Definition
Migration is complete when:
- All phase exit criteria are satisfied.
- Compliance checklist has zero open items.
- Canonical 4-game experience is visible and consistent across portal and game entry flows.
- Legacy compatibility remains functional where explicitly required.
- Prod Bucket contains only production-ready artifacts.
