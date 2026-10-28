# KC CuTo CRM — report correctness audit

Baseline: `main` at `4941454`. Application: https://kc-cuto.kaicomhub.com/.
Skills: attached KAI-COM Code & Flow Tracer and Debug & Fix.
Scope: decision report calculations and regression coverage; not an exhaustive audit of all modules or live database policies.

## Traced flows

| Trigger | Caller / data | Output | Coverage |
| --- | --- | --- | --- |
| Reports / year / reload | `src/decision-reports.mjs` → `readReportTargets` → GET `crm_get_sales_targets` → `salesScope` | SO actual, target, remaining and attainment | Model and queued-read regressions |
| Reports / owner / month | Paginated opportunities under existing RLS → `decisionMetrics` | Pipeline, win rate, risk priority | Owner/month exclusion and risk tests |
| Export | Existing target and opportunity export permission checks → CSV | Authorized report export | Existing permission tests; live export not run |

## Confirmed findings

| ID | Priority | Reproduction and root cause | Correction |
| --- | --- | --- | --- |
| R1 | P2 | `salesScope` used `amount(null) === 0` for employee actuals. A missing member total became zero or a partial team sum, generating misleading attainment. Invalid numeric totals also became zero. | Preserve unavailable actuals/targets as null, propagate incomplete team totals, retain legitimate zero values. |
| R2 | P2 | `decisionMetrics` sliced UTC timestamps as date strings. On 28 October Bangkok time, an update at `2026-10-14T18:00:00Z` is only 13 calendar days old, but was flagged stale at 14 days. | Convert timestamp updates to Bangkok calendar dates; retain date-only inputs and ignore invalid/missing timestamps. |

Evidence: `src/decision-report-model.mjs` (`salesScope`, `updateDay`, `decisionMetrics`); regression cases in `tests/decision-report-model.test.mjs`. Existing report UI renders null as an em dash and avoids unavailable percentages. Expected-close date semantics remain unchanged.

## Verification

- RED: both new regression tests failed against baseline (zero instead of null; early stale flag).
- GREEN: 14 focused reporting/loading/access tests passed.
- Full local Node suite: 437 passed, zero failures, using `node --test tests/*.test.mjs tests/*.test.cjs`.
- `node tests/integration-contract.mjs`: passed.
- JavaScript syntax and `git diff --check`: passed.
- Local report browser suite: BLOCKED before execution because Chromium is not installed. GitHub CI results are recorded on the PR; no local browser pass is claimed.
- Live RLS, authenticated production UI, email delivery, integrations and database mutations: NOT RUN.

## Safety and release

Changes are limited to a report calculation module and regression tests. No database changes, financial record writes, document renumbering, permission changes or notification actions. No behavior-only refactor is needed for these fixes.

Deployment: NOT DEPLOYED by this task. Review branch/PR contains the patch. Before publishing, require relevant CI checks and apply the existing release stamping process. Rollback is an application commit revert; no data rollback required.
