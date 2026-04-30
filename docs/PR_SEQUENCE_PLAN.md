# KensGames PR Sequence Plan

Reference docs:
- docs/KENSGAMES_5_GAME_SPEC.md
- docs/COMPLIANCE_AND_MIGRATION_PLAN.md
- docs/MIGRATION_EXECUTION_CHECKLIST.md

## Goal
Deliver migration safely using one focused PR per phase, with clear file scope, verification steps, and rollback guidance.

## Branching and Merge Rules
- Base branch: main
- Branch naming:
  - migration/p0-baseline
  - migration/p1-portal-compliance
  - migration/p2-route-normalization
  - migration/p3-bridge-integrity
  - migration/p4-doctrine-alignment
  - migration/p5-attribution
  - migration/p6-release-closure
- Keep each PR independently testable and reversible.
- Do not combine multiple phases into one PR.

## PR-0: Baseline and Freeze
### Objective
Capture baseline and define rollback controls before behavioral changes.

### Expected file touches
- docs/BASELINE_AUDIT.md (new)
- docs/MIGRATION_EXECUTION_CHECKLIST.md (status updates only)

### Validation
- Baseline screenshots and route inventory attached to PR.
- Rollback notes included for each upcoming surface.

### Merge gate
- Approved baseline report.

## PR-1: Portal Compliance (Navigation + Landing Layout)
### Objective
Make home portal structure comply with current spec requirements.

### Expected file touches
- index.html
- arcade.css (if layout extraction is needed)
- arcade.js (if card rail behavior or CTA mapping is scripted)

### Required changes
- Add X-Dimensional nav item.
- Enforce exactly 3 featured cards in first viewport strip.
- Add full games list and coming soon list directly below featured.
- Ensure desktop 3-per-row behavior for full and coming soon lists.
- Ensure mobile controlled horizontal rails with one panel at a time.
- Prevent body-level horizontal free-panning.

### Validation
- Desktop viewport checks: 1440x900 and 1920x1080.
- Mobile viewport checks: 390x844 and 430x932.
- Confirm no regression in hero CTA behavior.

### Merge gate
- UI checklist section in docs/MIGRATION_EXECUTION_CHECKLIST.md marked complete for Phase 1.

## PR-2: Canonical Route and Naming Normalization
### Objective
Normalize player-facing naming and canonical route usage while preserving legacy compatibility.

### Expected file touches
- index.html
- discover.html
- lounge.html
- showcase.html
- js/substrates/game_launcher.js
- js/substrates/promo_media_substrate.js
- js/substrates/manifold_discovery.js

### Required changes
- Use 4D Connect label in player-facing copy.
- Use Starfighter label in player-facing copy.
- Route primary 4D CTAs to /4dconnect/ where applicable.
- Keep /4DTicTacToe/* compatibility path functional.

### Validation
- Route smoke tests:
  - /fasttrack/
  - /brickbreaker3d/
  - /4dconnect/
  - /starfighter/
  - /4DTicTacToe/
- Validate no dead links from home/discover/lounge/showcase.

### Merge gate
- Routing checklist section complete.

## PR-3: Bridge Integrity and Lobby State Exposure
### Objective
Complete bridge wiring and runtime manifold state exposure for all in-scope games.

### Expected file touches
- fasttrack/index.html
- fasttrack/manifold.game.json
- brickbreaker3d/index.html
- brickbreaker3d/game.js
- brickbreaker3d/manifold.game.json
- 4DTicTacToe/index.html
- starfighter/index.html
- starfighter/manifold.game.json
- js/manifold_bridge.js (if bridge contract updates are required)

### Required changes
- Ensure bridge init and state payload exposure are active and verified.
- Close outstanding manifold_compatibility todo items where implementation is complete.
- Ensure postMessage to bridge emit path is wired consistently.

### Validation
- Multi-client lobby sync smoke test for representative game lobbies.
- Verify launch gate behavior remains strict (min players + ready checks).
- Confirm bridge compatibility flags reflect actual runtime state.

### Merge gate
- Bridge/state checklist section complete.

## PR-4: Doctrine and Surface Descriptor Alignment
### Objective
Align manifold descriptor text and comments with current doctrine.

### Expected file touches
- starfighter/bundle.js (or source that generates it)
- starfighter/enhance.js (if descriptor comments are duplicated)
- docs/SUBSTRATES.md (only if wording must be clarified)

### Required changes
- Ensure descriptor language does not conflict with current substrate rules.
- Keep behavior unchanged unless a bug requires functional fixes.

### Validation
- Static audit for contradictory descriptor text removed.
- No gameplay regression from comment/doc updates.

### Merge gate
- Doctrine checklist section complete.

## PR-5: Credits and Attribution Compliance
### Objective
Apply required creator credits consistently across required surfaces.

### Expected file touches
- index.html
- docs/KENSGAMES_5_GAME_SPEC.md (if credit wording refinement is needed)
- Any legal/about surface files used in production

### Required changes
- Ensure Created by Kenneth Bingham appears where required.
- Ensure Software Engineer credit is present.
- Ensure games, website, and art paintings attribution appears consistently.

### Validation
- Manual pass across home, about, footer, and legal references.

### Merge gate
- Attribution checklist section complete.

## PR-6: Final Verification and Release Closure
### Objective
Finalize compliance evidence, close open checklist items, and prepare release note summary.

### Expected file touches
- docs/MIGRATION_EXECUTION_CHECKLIST.md
- docs/COMPLIANCE_AND_MIGRATION_PLAN.md (status note only)
- docs/FINAL_COMPLIANCE_REPORT.md (new)

### Required changes
- Mark final checklist completion state.
- Publish pass/fail matrix and residual risks.
- Add release closure notes.

### Validation
- End-to-end smoke test across portal and all canonical game routes.
- Verify legacy compatibility still works where required.

### Merge gate
- Stakeholder sign-off recorded in PR.

## Suggested Reviewers by PR
- PR-1 and PR-2: Frontend/UI owner + Product owner
- PR-3: Runtime/Multiplayer owner + QA owner
- PR-4: Doctrine owner + Runtime owner
- PR-5: Product owner + Content owner
- PR-6: QA owner + Release owner

## Rollback Strategy
- Revert by PR to isolate fallout.
- If route regressions occur, restore previous CTA mappings first.
- If bridge regressions occur, disable changed bridge path and restore previous state exposure behavior.
- Keep legacy 4D compatibility active until post-release telemetry confirms stable canonical usage.

## Done Definition
Migration sequence is complete when:
- PR-0 through PR-6 are merged.
- All checklist items in docs/MIGRATION_EXECUTION_CHECKLIST.md are complete.
- Final compliance report is published with no critical open issues.
