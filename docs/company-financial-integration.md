# MOC company registry integration

MOC Open Data is configured for manual company-profile lookups in Customer 360 → Company financials. Only the documented fixed HTTPS endpoint `https://dataapi.moc.go.th/juristic?juristic_id=...` is used. This source provides registry information and capital, not annual profit/loss statements. DBD and other licensed annual-statement adapters remain unconfigured. No automatic jobs are enabled.

## Access and flow

The `crm-moc-company` Edge Function requires a valid user JWT, active profile, customer and quotation view permissions, and a customer readable through the caller's RLS. It accepts only `customer_id`; tax ID is derived from that customer on the server. Customer masters, quotations, SOs and annual statements are never overwritten by this integration.

Service-only claim/finish RPCs deduplicate the tax ID, reuse successful MOC results for 24 hours, throttle failed IDs for five minutes, and limit initiating users to ten lookup attempts per minute. Claims expire for retry after 60 seconds. The fixed 15-second timeout, no redirects and JSON/schema/ID/amount validation prevent malformed responses from becoming company data. Failed refreshes preserve previous snapshots. The function uses platform server secrets only and forwards no CRM token or secret to MOC.

MOC does not provide a source as-of field in this contract; `source_as_of` stays null and `fetched_at` is shown separately. Profile/statement numeric columns are read as strings to preserve exact decimals.

## Verification and upstream limitation

On 31 October 2026 the documented MOC endpoint returned a Web Page Blocked HTML page from the execution environment. A separate public-endpoint connectivity probe from the CRM database timed out after 15 seconds. These are failures, not successful imports. No alternative/private endpoint, header disguise, proxy rotation or scraping fallback is used. The installed connector reports MOC_BLOCKED/MOC_TIMEOUT and does not claim a successful source connection. Provider-side access/availability must be resolved before live JSON retrieval can be verified.

## Annual statement extension

The provider-neutral `crm_company_financial_statements` contract remains keyed by `(tax_id, fiscal_year, statement_scope)`: Gregorian year, standalone/consolidated scope, THB baht units, nullable revenue/expenses/profit/assets/liabilities/equity, source reference and source as-of. `normalizeCompanyFinancialPayload` validates future licensed provider payloads. Future annual ingestion must validate provenance and IDs, use transactional writes and reject stale source versions. No annual data or ingestion job is fabricated by the MOC profile integration.
