# Existing Code Compliance Tasks

## Scope
This task list covers existing code already in the VPS lanes and identifies the work required to make it compliant with:
- docs/KENSGAMES_5_GAME_SPEC.md
- docs/COMPLIANCE_AND_MIGRATION_PLAN.md
- docs/MIGRATION_EXECUTION_CHECKLIST.md
- docs/PROD_DEPLOY_RUNBOOK.md
- X-Dimensional governance requirements

## Lane Baseline (Completed)
- VPS lane root created: /var/www/kensgames-lanes
- Lanes present:
  - /var/www/kensgames-lanes/status-quo
  - /var/www/kensgames-lanes/dev
  - /var/www/kensgames-lanes/test
  - /var/www/kensgames-lanes/prod
- Protected snapshot created:
  - /var/www/kensgames-lanes/status-quo/20260430T154751Z
- Existing code was copied into dev, test, and prod from the protected snapshot baseline.

## Deployment and Bucket Rules
1. Completed means ready to deploy.
2. Deployed to Prod means live and post-deploy checks passed.
3. Dev bucket holds draft/in-progress/test artifacts only.
4. Prod bucket holds production-ready artifacts only.
5. X-Dimensional programming governs all implementation, review, validation, and deployment gates.

## Existing-Code Non-Compliance Tasks

### A. Home and Portal IA Compliance
1. Add X-Dimensional nav item on home navigation.
- Status: Checked Out
- Lane target: dev
- Deploy gate: visual QA passed on desktop and mobile

2. Enforce exactly 3 featured cards in first viewport strip.
- Status: Checked Out
- Lane target: dev
- Deploy gate: viewport checks passed

3. Move remaining game cards to full list and coming soon sections per spec.
- Status: Checked Out
- Lane target: dev
- Deploy gate: section ordering and responsive layout verified

4. Ensure mobile behavior is controlled horizontal rails with one panel at a time and no body-level free horizontal panning.
- Status: Checked Out
- Lane target: dev
- Deploy gate: mobile QA passed

### B. Canonical Naming and Route Compliance
5. Replace player-facing legacy labels with canonical names:
- 4D TicTacToe to 4D Connect
- Alien Space Attack to Starfighter
- Status: Checked Out
- Lane target: dev
- Deploy gate: content audit passed

6. Normalize primary 4D route usage to /4dconnect/ while preserving /4DTicTacToe/* compatibility alias.
- Status: Checked Out
- Lane target: dev
- Deploy gate: route smoke tests passed

### C. Bridge and Runtime State Compliance
7. Close FastTrack bridge/state exposure gaps and update manifold compatibility metadata when verified.
- Status: Checked Out
- Lane target: dev
- Deploy gate: bridge integration test passed

8. Close BrickBreaker 3D bridge/state exposure gaps and update manifold compatibility metadata when verified.
- Status: Checked Out
- Lane target: dev
- Deploy gate: bridge integration test passed

9. Close Starfighter bridge/state exposure gaps and update manifold compatibility metadata when verified.
- Status: Checked Out
- Lane target: dev
- Deploy gate: bridge integration test passed

### D. Doctrine and Descriptor Alignment
10. Align Starfighter manifold descriptor language with current substrate doctrine where required.
- Status: Checked Out
- Lane target: dev
- Deploy gate: descriptor audit completed

### E. Credits and Attribution Compliance
11. Verify and normalize attribution for Kenneth Bingham across required product surfaces.
- Status: Checked Out
- Lane target: dev
- Deploy gate: attribution checklist complete

### F. Final Release Readiness
12. Run full compliance matrix and close all checklist gates.
- Status: Checked Out
- Lane target: test
- Deploy gate: zero critical open items

13. Promote production-ready artifacts only from test to prod and mark Deployed to Prod after post-deploy verification.
- Status: Checked Out
- Lane target: prod
- Deploy gate: post-deploy smoke tests complete

14. Resolve HTTPS docs endpoint policy so https://kensgames.com/docs/ is public-ready when required by policy.
- Status: Checked Out
- Lane target: test
- Deploy gate: automated task execution report shows zero failed checks for docs endpoint

## Lane Workflow for These Tasks
1. Implement in dev.
2. Validate in test.
3. Mark task Completed when ready to deploy.
4. Promote to prod only when production-ready.
5. Mark task Deployed to Prod after post-deploy checks pass.

## Immediate Next Actions
1. Start Task 1 to Task 4 on home portal compliance in dev.
2. Run viewport QA and move passed items to test.
3. Prepare first production promotion batch only after test validation.
4. Run scripts/automated-task-execution.sh and resolve any failed checks before prod promotion.
