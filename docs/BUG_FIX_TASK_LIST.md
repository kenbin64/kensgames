# KensGames Bug Fix Task List

## Policy
- No task is marked Completed unless all scoped tests pass and behavior runs as intended.
- No deployment occurs unless all required gates are green.
- Bug fixes are mandatory blockers when they affect release-critical paths.
- X-Dimensional directives govern triage, fix design, and validation.

## Status Buckets
- New
- Triaged
- In Fix
- In Retest
- Verified
- Deployed to Prod

## Bug Registry
1. Docs endpoint returns 403 at https://kensgames.com/docs/
- Status: New
- Severity: High (release gate)
- Scope: nginx + edge policy + docs alias visibility
- Required tests:
  - curl -Ik https://kensgames.com/docs/ returns 200/301/302
  - automated-task-execution report has zero failures

2. Nginx warnings for protocol options redefined in unrelated vhost files
- Status: New
- Severity: Medium
- Scope: nginx site config hygiene
- Required tests:
  - sudo nginx -t has zero warnings for target vhosts in release scope

3. Canonical naming drift in portal surfaces (legacy labels still visible)
- Status: New
- Severity: Medium
- Scope: home/discover/showcase/lobby copy and cards
- Required tests:
  - player-facing labels use 4D Connect and Starfighter
  - legacy routes remain compatible

4. Featured strip count drift vs spec requirement
- Status: New
- Severity: Medium
- Scope: home layout and responsive behavior
- Required tests:
  - exactly 3 featured cards in first viewport strip
  - full + coming soon layout rules pass

## Definition of Done for Bug
A bug can move to Verified only when:
1. Reproduction is no longer possible.
2. Regression checks pass.
3. Automated gate report passes impacted checks.
4. Evidence (command output/screenshots) is attached.

A bug can move to Deployed to Prod only when:
1. Verified state is complete.
2. Release gate scripts pass in full.
3. Post-deploy checks pass in production.
