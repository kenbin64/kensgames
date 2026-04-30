# Delta-Driven Release Times

## Release Control Rule
- Release timing is delta-driven, not calendar-only.
- A release window can be used only when all strict gates pass.
- If any blocker remains, release is deferred to next window.

## Fixed Windows (UTC)
- Primary Window A: Tuesday 16:00 UTC
- Primary Window B: Thursday 16:00 UTC
- Emergency Window: Daily 00:30 UTC (critical fixes only)

## Delta Categories
- Delta-0: Docs/config only, no runtime behavior change
- Delta-1: Low-risk UI/static updates
- Delta-2: Route/bridge/runtime non-breaking changes
- Delta-3: High-impact architecture/protocol/runtime changes

## Required Gate Matrix by Delta
### Delta-0
- pre_deploy_test_gate: PASS
- automated_task_execution: PASS

### Delta-1
- pre_deploy_test_gate: PASS
- automated_task_execution: PASS
- route smoke checks: PASS

### Delta-2
- pre_deploy_test_gate: PASS
- automated_task_execution: PASS
- route smoke checks: PASS
- bridge/state checks: PASS

### Delta-3
- pre_deploy_test_gate: PASS
- automated_task_execution: PASS
- full compliance matrix: PASS
- rollback rehearsal: PASS
- stakeholder sign-off: PASS

## Promotion Timing Logic
1. Determine delta level.
2. Execute required gate matrix.
3. If all pass, promote in next fixed window.
4. If any fail, create/continue bug tasks and defer release.

## Mandatory Scripts
- scripts/pre_deploy_test_gate.sh
- scripts/prod-promote.sh
- scripts/automated-task-execution.sh

## Tracking
- docs/BUG_FIX_TASK_LIST.md
- docs/TASK_STATUS_BOARD.md
- docs/AUTOMATED_TASK_EXECUTION_REPORT.md
