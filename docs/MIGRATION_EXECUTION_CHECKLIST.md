# KensGames Migration Execution Checklist

Reference plan:
- docs/COMPLIANCE_AND_MIGRATION_PLAN.md

Status legend:
- [ ] Not started
- [~] In progress
- [x] Complete

## Phase 0: Baseline and Freeze
### Baseline capture
- [ ] Capture home/discover/lounge/showcase screenshots and route map.
- [ ] Record current nav items and featured section behavior.
- [ ] Record current canonical vs legacy route usage.
- [ ] Record manifold_compatibility snapshots for FastTrack, BrickBreaker3D, Starfighter.

### Control and rollback
- [ ] Create migration tracking issue with this checklist copied into the issue body.
- [ ] Define rollback trigger conditions.
- [ ] Define rollback command path for each modified surface.

### Exit gate
- [ ] Baseline report committed to docs or issue.
- [ ] Rollback path verified.

## Phase 1: Portal Compliance
### Navigation and IA
- [ ] Add X-Dimensional nav item on home navigation.
- [ ] Ensure X-Dimensional nav target resolves to detail/explainer surface.

### Landing layout
- [ ] Enforce exactly 3 featured cards in first viewport strip.
- [ ] Add full games list directly below featured.
- [ ] Add coming soon list directly below full list.
- [ ] Desktop full list renders 3 cards per row.
- [ ] Desktop coming soon list renders 3 cards per row.
- [ ] Mobile uses controlled horizontal rails.
- [ ] Mobile shows one full-screen panel at a time.
- [ ] Page body does not free-pan horizontally.

### Naming and labels
- [ ] Replace player-facing 4D TicTacToe label with 4D Connect.
- [ ] Replace player-facing Alien Space Attack label with Starfighter.
- [ ] Keep legacy internal compatibility where required.

### Exit gate
- [ ] Desktop visual QA passed.
- [ ] Mobile visual QA passed.
- [ ] Accessibility quick check passed (tap targets, readability, focus states).

## Phase 2: Route and Naming Migration
### Canonical routes
- [ ] Ensure primary CTAs use canonical slugs.
- [ ] Ensure canonical 4D route uses /4dconnect/ in player-facing links.

### Legacy compatibility
- [ ] Keep /4DTicTacToe/* alias active.
- [ ] Confirm alias redirects or compatibility handlers work.
- [ ] Confirm no dead links from home/discover/lounge/showcase.

### Exit gate
- [ ] Route smoke test completed for all 4 canonical games.
- [ ] Legacy alias validated end-to-end.

## Phase 3: Lobby and Bridge Integrity
### Bridge initialization
- [ ] FastTrack entry includes and initializes bridge correctly.
- [ ] BrickBreaker3D entry includes and initializes bridge correctly.
- [ ] 4D Connect entry includes and initializes bridge correctly.
- [ ] Starfighter entry includes and initializes bridge correctly.

### State exposure and events
- [ ] Expose runtime manifold payload from each game.
- [ ] Wire postMessage and bridge emit events for lobby/state transitions.
- [ ] Validate player join/leave/ready/update propagation.

### Metadata closure
- [ ] Update fasttrack/manifold.game.json manifold_compatibility fields after verification.
- [ ] Update brickbreaker3d/manifold.game.json manifold_compatibility fields after verification.
- [ ] Update starfighter/manifold.game.json manifold_compatibility fields after verification.

### Exit gate
- [ ] All in-scope games report bridge_included=true.
- [ ] All in-scope games report state_exposed=true.
- [ ] All manifold_compatibility todo items are closed or explicitly deferred.

## Phase 4: Surface Doctrine Alignment
### Descriptor audit
- [ ] Audit Starfighter manifold descriptors for canonical substrate language.
- [ ] Align wording to Gyroid canonical substrate and Schwarz Diamond auxiliary lens where applicable.
- [ ] Confirm no conflicting route/index/storage behavior implied by descriptor text.

### Exit gate
- [ ] Descriptor audit complete with no doctrinal contradictions.

## Phase 5: Credits and Attribution
### Required credit surfaces
- [ ] Confirm Created by Kenneth Bingham appears on required product-facing surfaces.
- [ ] Confirm Software Engineer credit appears where specified.
- [ ] Confirm games, website, and art paintings attribution appears consistently.
- [ ] Confirm legal/about surfaces reflect attribution requirements.

### Exit gate
- [ ] Attribution QA complete and approved.

## Phase 6: Final Verification and Release
### Cross-surface QA
- [ ] Validate home/discover/lounge/showcase final behavior.
- [ ] Validate each game landing and lobby entry flow.
- [ ] Validate mobile and desktop responsive requirements.

### Multiplayer and launch gates
- [ ] Validate lobby readiness constraints and launch gating behavior.
- [ ] Validate fallback messaging for invalid launch conditions.
- [ ] Validate state synchronization across multiple clients.

### Release closure
- [ ] Publish final compliance matrix pass/fail.
- [ ] Publish release notes summarizing migration completion.
- [ ] Obtain stakeholder sign-off.

### Exit gate
- [ ] All phases complete.
- [ ] Open risks accepted or mitigated.
- [ ] Migration declared complete.

## Smoke Test Matrix
### Canonical game entry
- [ ] /fasttrack/
- [ ] /brickbreaker3d/
- [ ] /4dconnect/
- [ ] /starfighter/

### Legacy compatibility
- [ ] /4DTicTacToe/ redirects or resolves correctly.

### Portal pages
- [ ] /
- [ ] /discover
- [ ] /lounge
- [ ] /showcase

## Notes
- Use small PRs by phase to reduce regression risk.
- Do not remove legacy 4D path support until canonical migration is verified in production telemetry.
- Keep docs and implementation changes synchronized in the same release window.
