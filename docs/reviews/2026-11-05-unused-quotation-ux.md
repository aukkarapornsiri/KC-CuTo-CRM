# Unused quotation UX removal — 2026-11-05

## Scope and evidence

Applied the supplied Code Flow Tracer → Debug & Fix → Safe Refactor guidance, Supabase performance defaults and Ponytail minimal-change guidance. This is a bounded removal of the demonstrably unused quotation detail variant; it is not a claim that every legacy-looking file is dead.

Call path: application bootstrap → internal-workspace.mjs → createQuotationDetail → QuotationDetailLayout. The sole application renderer is passed as ItemDetail and was always cloned with compact=true. No route, dynamic importer, job, test or configuration selects its compact=false rendering. Repository reference search covered src, tests, tools and workflows. The original full-description/per-item-GP fallback and its periodLabel import and cell helper are removed. The current compact item table is now the sole renderer, and the layout no longer injects a variant prop.

PDF path remains internal-workspace print action → QuotationDocument preview → quotation-print.mjs. The current DOM ID crm-quotation-print is retained. financialSnapshot export, shared totals, currency formatting, VAT, visibility guards, Supabase select and effect cancellation are unchanged. No schema, record, route, permission, template, document number or historical request is deleted.

## Verification

Before removal: 36 existing targeted tests passed. Three current-view characterization tests also passed against the pre-removal compact rendering. After removal: all 39 tests passed, including current first-line item display, net sales/weighted GP, hidden financial data/no unauthorized query, invalid cost fallback, Thai notice, approval callbacks/disabled controls/history, configured reviewer routing and PGlite database guards, deduplication/concurrency/backoff.

Browser regression workflow exercises the unchanged current UI at 1440px and 390px, pending/approved records, equal header cards, six aligned approval buttons, working icons, modal close/reopen, and PDF preview. CI results are available on the linked pull request. Production browser inspection is blocked by Cloudflare; production latency, request counts and load benchmarks are NOT MEASURED. The known separate quotation-delete mobile smoke failure is outside this removal.

## Result and rollback

quotation-detail.mjs shrank from 7,101 to 3,975 UTF-8 bytes (3,126 removed); one obsolete rendering branch removed. This is a source-size result, not a measured speed improvement. Existing import-map aliases and main bootstrap remain because they are active dependencies, not unused UI versions.

Rollback: revert this cleanup commit and stamp a fresh release ID so clients fetch restored modules. No database rollback is needed for this UI removal.

## Separate authorized workflow configuration

The five requested policies were already active with minimum 0 and the configured reviewer. No duplicate policy was created and existing permissions remain in force. The SO edit condition was false, bypassing amendment approval. Updated only so_requires_approval to true through the existing audited, optimistic-concurrency policy RPC; quotation_requires_approval remains false. No pending/approved amendments existed before or after. Configuration rollback, if expressly requested: use the same audited policy RPC with the latest expected_updated_at and restore so_requires_approval=false.
