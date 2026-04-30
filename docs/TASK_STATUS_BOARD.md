# KensGames Task Status Board

## Status Buckets
- Checked Out: Task is assigned and ready to execute.
- Working On: Task is actively being implemented.
- Testing: Task implementation is complete and under validation.
- Completed: Task is validated and ready to deploy.
- Deployed to Prod: Task is live in production and post-deploy checks passed.

## Artifact Buckets
- Dev Bucket: Non-production artifacts, drafts, in-progress outputs, and test artifacts.
- Prod Bucket: Production-ready artifacts only.

## Numbered Task Registry
1. Portal baseline capture and rollback notes
2. Home nav add X-Dimensional item
3. Home featured strip enforce exactly 3 cards in viewport
4. Home full list and coming soon list layout compliance
5. Canonical naming updates (4D Connect and Starfighter labels)
6. Canonical route normalization with legacy alias support
7. Bridge and runtime state exposure completion for 4 in-scope games
8. manifold_compatibility metadata closure for FastTrack
9. manifold_compatibility metadata closure for BrickBreaker 3D
10. manifold_compatibility metadata closure for Starfighter
11. Starfighter surface descriptor doctrine alignment
12. Credits and attribution consistency pass
13. Final compliance verification and release closure report
14. Enforce prod-only public visibility lane on VPS
15. Enforce prod lane artifacts-only structure
16. Repoint kensgames.com nginx root and static aliases to prod lane
17. Validate HTTPS and designated endpoint behavior after lane cutover
18. Remove duplicate/conflicting nginx server config warnings
19. Resolve docs endpoint access policy for /docs if blocked upstream

## Checked Out
- 1. Portal baseline capture and rollback notes
- 2. Home nav add X-Dimensional item
- 3. Home featured strip enforce exactly 3 cards in viewport
- 4. Home full list and coming soon list layout compliance
- 5. Canonical naming updates (4D Connect and Starfighter labels)
- 6. Canonical route normalization with legacy alias support
- 7. Bridge and runtime state exposure completion for 4 in-scope games
- 8. manifold_compatibility metadata closure for FastTrack
- 9. manifold_compatibility metadata closure for BrickBreaker 3D
- 10. manifold_compatibility metadata closure for Starfighter
- 11. Starfighter surface descriptor doctrine alignment
- 12. Credits and attribution consistency pass
- 13. Final compliance verification and release closure report
- 17. Validate HTTPS and designated endpoint behavior after lane cutover
- 18. Remove duplicate/conflicting nginx server config warnings
- 19. Resolve docs endpoint access policy for /docs if blocked upstream

## Working On
- None

## Testing
- None

## Completed
- None

## Deployed to Prod
- 14. Enforce prod-only public visibility lane on VPS
- 15. Enforce prod lane artifacts-only structure
- 16. Repoint kensgames.com nginx root and static aliases to prod lane
- Planning artifact: docs/COMPLIANCE_AND_MIGRATION_PLAN.md
- Execution artifact: docs/MIGRATION_EXECUTION_CHECKLIST.md
- Sequencing artifact: docs/PR_SEQUENCE_PLAN.md

## Dev Bucket
- docs/TASK_STATUS_BOARD.md (active board)

## Update Rules
- Move a task from Checked Out to Working On when coding starts.
- Move a task from Working On to Testing when implementation is merged to branch.
- Move a task from Testing to Completed only after validation gate passes.
- Move a task from Completed to Deployed to Prod only after deployment and post-deploy verification pass.
- Keep drafts, test output, and in-progress implementation artifacts in Dev Bucket.
- Promote artifacts from Dev Bucket to Prod Bucket only when production-ready.
- Do not keep one task in multiple buckets at the same time.
