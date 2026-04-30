# Kens Games Versioning System

## Purpose
Define release identity and promotion state for MVP and post-MVP delivery under strict X-Dimensional governance.

## Source of Truth
- version.json

## Fields
- product: product slug
- track: release track (mvp, stable, hotfix)
- version: semantic version x.y.z
- release_channel: lane/public mode
- delta_level: delta-0..delta-3
- build_utc: ISO UTC build timestamp
- x_dimensional_governance: must be true
- status: current public state

## Bump Rules
- patch: bug fix or non-breaking update
- minor: feature expansion without breaking behavior
- major: breaking or architecture-level changes

## Script
Use:
- scripts/versioning.sh [version_file] [major|minor|patch] [channel] [delta-level]

Example:
- scripts/versioning.sh /home/butterfly/apps/kensgames-portal/version.json patch mvp-hold delta-1

## Promotion Rules
1. Update version.json before promotion to test.
2. Tag release candidate in changelog/reporting.
3. Promote to prod only if strict gates pass.
4. Mark status accordingly:
- coming-soon-public
- mvp-public
- production-public
5. During blackout mode, public routing should serve the coming-soon surface only.
6. Transition to mvp-public or production-public only after strict gate pass and promotion completion.

## Governance
X-Dimensional directives are mandatory gate controls in each release decision.
