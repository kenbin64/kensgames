# KensGames Production Deploy Runbook

Repository:
- https://github.com/kenbin64/kensgames.git
- Branch: main

Automation scripts:
- scripts/prod-promote.sh
- scripts/automated-task-execution.sh
- scripts/pre_deploy_test_gate.sh

Strict control documents:
- docs/BUG_FIX_TASK_LIST.md
- docs/DELTA_DRIVEN_RELEASE_TIMES.md

## 1. Deployment Policy (Authoritative)
1. Public traffic is served only from the prod lane.
2. Prod lane contains production-ready compiled artifacts only.
3. Dev and test lanes are non-public promotion stages.
4. Status-quo snapshot lane is immutable historical protection.
5. X-Dimensional programming directives govern every deployment step.

Lane paths:
- status-quo: /var/www/kensgames-lanes/status-quo
- dev: /var/www/kensgames-lanes/dev
- test: /var/www/kensgames-lanes/test
- prod: /var/www/kensgames-lanes/prod

Public domain and SSL:
- https://kensgames.com
- SSL termination is required and must remain active.

## 2. AI Directive Gates
Before, during, and after deploy, enforce these gates:

Ultimate AI directives:
- Search and retrieve complete context before acting.
- Determine from evidence, not assumptions.
- Present status clearly with pass/fail outcomes.

X-Dimensional directives:
- Universal access rule: z = x * y must hold where applicable.
- Do not persist manifested state as independent truth when it must be derived.
- Treat manifold definitions and substrate rules as deployment validation constraints.

Prime deployment gate:
- Do not promote to prod if any required validation fails.
- All tests must pass before any code can be deployed.
- Completion checkoff requires evidence that behavior runs as intended and bugs are fixed.

## 3. Current Serving Contract
Nginx vhost file:
- /etc/nginx/sites-enabled/kensgames.com

Required prod root/paths:
- root: /var/www/kensgames-lanes/prod/public
- docs alias: /var/www/kensgames-lanes/prod/public/docs
- access log: /var/www/kensgames-lanes/prod/logs/access.log
- error log: /var/www/kensgames-lanes/prod/logs/error.log

Designated endpoints:
- / (static portal)
- /api/ (proxied backend)
- /ws (websocket)
- /docs/ (static docs)

## 4. One-Time VPS Setup
1. Ensure lane directories exist.
2. Ensure prod has only artifacts directories:
- /var/www/kensgames-lanes/prod/public
- /var/www/kensgames-lanes/prod/logs
3. Ensure nginx points to prod root and prod docs alias.
4. Validate and reload nginx:
- sudo nginx -t
- sudo systemctl reload nginx

## 5. Standard Deploy Flow (main -> dev -> test -> prod)

Fast path (automated):
- scripts/prod-promote.sh
- scripts/automated-task-execution.sh

Strict behavior:
- scripts/prod-promote.sh runs pre_deploy_test_gate and post-deploy automated task execution.
- Promotion is blocked automatically if any strict gate fails.

## Step A: Fetch latest main
Commands:
- cd /home/butterfly/apps/kensgames-portal
- git fetch origin
- git checkout main
- git pull origin main

## Step B: Build deployment artifact set
For this portal, production artifact set is static/public-focused output.
Minimum artifact set source:
- /home/butterfly/apps/kensgames-portal

Artifacts must include required runtime files for public serving, including:
- portal pages and static assets
- game static assets/pages
- js runtime assets needed by public routes

Artifacts must exclude non-prod content:
- scratch files
- local debug dumps
- unfinished drafts
- temporary backups

## Step C: Promote into dev lane
Recommended sync:
- sudo rsync -a --delete /home/butterfly/apps/kensgames-portal/ /var/www/kensgames-lanes/dev/

Then run validation checks in dev:
- route checks for canonical pages
- static asset existence checks
- manifold and bridge checks where required

## Step D: Promote into test lane
Only after dev validation passes.
- sudo rsync -a --delete /var/www/kensgames-lanes/dev/ /var/www/kensgames-lanes/test/

Run test validation suite:
- UX and route smoke tests
- websocket and api reachability checks
- manifold compliance checks

## Step E: Promote production artifacts into prod lane
Only after test validation passes.
Promote artifact-only subset into prod/public.
Example (static site artifact promotion):
- sudo rsync -a --delete /var/www/kensgames-lanes/test/public/ /var/www/kensgames-lanes/prod/public/

If source tree is not split with a dedicated public folder, construct and verify the artifact subset first before rsync.

## Step F: Service and config checks
- sudo nginx -t
- sudo systemctl reload nginx
- pm2 status

## Step G: HTTPS and endpoint smoke tests
- curl -Ik https://kensgames.com
- curl -Ik https://kensgames.com/api/health (or designated health route)
- curl -Ik https://kensgames.com/docs/

Expected:
- HTTPS responds successfully for public routes
- designated endpoints reachable by policy

## Step H: Automated task execution report
Run:
- scripts/automated-task-execution.sh

Output:
- docs/AUTOMATED_TASK_EXECUTION_REPORT.md

Gate:
- report must have zero failed checks before marking a promotion batch as Deployed to Prod.

## 6. SSL Requirements
1. SSL certificate for kensgames.com must be valid and unexpired.
2. Any designated public endpoint must be served over HTTPS.
3. HSTS should remain enabled in edge/web config where already configured.

Verification example:
- openssl s_client -connect kensgames.com:443 -servername kensgames.com </dev/null | openssl x509 -noout -dates -subject -issuer

## 7. Production Purity Rules
Prod lane must contain only production-ready artifacts.
Disallowed in prod lane:
- development source not required for public serving
- temporary backups
- local debug logs outside designated prod logs directory
- experimental scripts

Required in prod lane:
- public artifact set
- prod logs directory

## 8. Compliance Tasks for Existing Code
If any existing code/path is non-compliant, create and track remediation tasks before next promotion.
Minimum task categories:
1. Route and naming compliance
2. Layout and IA compliance
3. Bridge/state exposure compliance
4. Manifold doctrine alignment
5. Credits and attribution compliance
6. Endpoint and SSL compliance

Task tracking files:
- docs/EXISTING_CODE_COMPLIANCE_TASKS.md
- docs/TASK_STATUS_BOARD.md
- docs/BUG_FIX_TASK_LIST.md
- docs/DELTA_DRIVEN_RELEASE_TIMES.md

## 9. Rollback Procedure
1. Identify latest status-quo snapshot.
2. Restore from snapshot into prod lane artifact path.
3. Validate nginx config and reload.
4. Re-run smoke tests.

Example:
- LATEST=$(ls -t /var/www/kensgames-lanes/status-quo | head -1)
- sudo rsync -a --delete /var/www/kensgames-lanes/status-quo/$LATEST/public/ /var/www/kensgames-lanes/prod/public/
- sudo nginx -t && sudo systemctl reload nginx

## 10. Deploy Completion Criteria
A deploy is complete only when all are true:
1. Promotion path main -> dev -> test -> prod completed.
2. Validation gates passed at each lane.
3. HTTPS checks passed for kensgames.com and designated endpoints.
4. Prod lane contains production-ready artifacts only.
5. Task board updated with Completed (ready to deploy) and Deployed to Prod states.
6. No blocking X-Dimensional or Prime Directive violations remain.
7. Bug list has no release-blocking unresolved items for the promoted delta.
