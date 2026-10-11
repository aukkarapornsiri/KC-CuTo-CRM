# CuTo shared reads and database tuning — 11 October 2026

## Changes

- Dashboard scene and target summary share one authenticated request per year/report scope. Data is isolated by user, role context, report type and year.
- Sales Map, access statistics and record editors refresh after 60 seconds of foreground use. Access enforcement retains its 30-second cadence.
- Hidden browser windows, offline sessions, signed-out users and inactive Settings panels do not start background reads. Demo data loads once and refreshes on explicit changes.
- One in-flight request per resource, cancellation on unmount/account switch, stale-response rejection, and retry backoff. Returning to a window reuses fresh results and refreshes stale ones. Saves and manual reloads invalidate the relevant data.
- Permission drafts remain mounted when switching Settings panels; inactive record editors unsubscribe without losing drafts.
- Production migration removes 12 exact duplicate indexes, adds 9 missing CuTo foreign-key indexes, wraps auth.uid() in six policies, and combines four equivalent permissive-policy pairs using their original OR semantics. Restrictive policies and business records are unchanged.

## Verification

- 10 coordinator tests cover sharing, freshness, focus, visibility, offline, demo, inactive panels, slow requests, mutation invalidation, account switches, cancellation, denial, quota backoff, and access cadence.
- 8 existing notification-store tests pass.
- Local test run: 267 tests pass; one unrelated marketing-edge suite needs sanitize-html, which is installed by the existing GitHub validation workflow.
- Production permission matrix: 33,075 assertions across 81 roles and 15 modules pass; fixtures rolled back.
- Production blocked-account coverage: 320 assertions over 64 tables and five blocked states pass; fixtures rolled back.
- Production Customer → Contact/Opportunity → approved Quotation → Contract cross-links and record versioning pass; fixtures rolled back. This fixture validates linkage, not interactive approval or SO acceptance.
- Advisor changes across the shared project: duplicate index findings 12 → 0; missing foreign-key indexes 25 → 16; auth initplan warnings 11 → 5; overlapping permissive policies 19 → 15. Remaining findings in these categories belong to other application tables.
- Additional legacy delegated-settings test could not execute: the connector returned Invalid or expired requestState twice. No successful result is claimed for that test.

## Acceptance boundary

The production browser is signed out. Interactive employee login and the complete sales flow through SO still require a securely authenticated browser session. Demo browser tests and SQL fixtures do not substitute for that acceptance. External integrations, AI/email credentials, stock deduction automation and leaked-password protection are separate backlog items, not enabled in this release.

## Operational notes

- Release: 20261011-shared-reads-db-tuning.
- Shared reads are per browser tab, not cross-tab coordination.
- No percentage reduction in production bandwidth is claimed without a comparable post-release measurement window.
- Supabase references: https://supabase.com/docs/guides/database/database-linter and https://supabase.com/docs/guides/database/postgres/row-level-security-performance
