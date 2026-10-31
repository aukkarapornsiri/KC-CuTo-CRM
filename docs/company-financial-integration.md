# Company financial data — connection preparation

The production system is prepared, not connected to DBD or another provider. No external HTTP requests, automatic sync, jobs, billing or credentials are enabled. Only Super Admin can select a planned provider in Customer 360 → Company financials. Changing this selection does not activate a connection.

## Data contract

- `crm_company_profiles`: one profile per valid Thai juristic ID (13 digits, leading zero, checksum), registered capital, THB currency, mandatory provider/reference/source date.
- `crm_company_financial_statements`: unique `(tax_id, fiscal_year, statement_scope)`. Gregorian fiscal year; separate standalone and consolidated statements. Period start/end, THB baht base units, revenue, expenses, net profit/loss, assets, liabilities, equity. Null is unknown; zero is a reported zero. Loss/equity may be negative.
- `crm_company_data_sync_logs`: unique provider request key, start/finish timestamps and sanitized error codes. Do not store tokens, raw provider responses or personal documents here.
- `crm_company_data_settings`: planned provider only; connection and automatic sync are constrained off until an actual adapter is reviewed and deployed.

Provider data is separate from CRM receivable references and does not overwrite customer masters, quotations or SOs. Readers need both customer and quotation view permission and visibility of a customer with the matching tax ID. Only the backend service role can write provider profiles, statements or sync logs. Clients have no insert/update/delete privileges for financial snapshots.

## Future provider adapter

1. Obtain the licensed API documentation and access approval. Define expected endpoints and response mapping; do not scrape website sessions or infer private endpoints.
2. Store credentials in server secret management, never in these tables, client code or chat. No secret is needed for the preparation release.
3. Derive the expected tax ID from a permission-checked customer, not arbitrary request input. Reject mismatched entity IDs, ambiguous fiscal calendars, currency/scale and invalid payloads with `normalizeCompanyFinancialPayload` in `supabase/functions/_shared/company-financial-payload.mjs`. Decimal amounts must be canonical strings; convert provider thousand-baht units explicitly before normalization.
4. Implement bounded requests, rate limits and provider-specific retries; deduplicate by tax ID. Validate before writes and store profile/statements transactionally, with request-key idempotency and a guard against replacing newer source versions with older ones. Preserve per-year provenance. These ingestion/queue operations are NOT enabled in this preparation release.
5. Test with the provider sandbox and real-role RLS before an additive migration enables the reviewed adapter. Show source as-of and last fetch date; never label prepared/cached data as live.

Manual snapshots are not editable through the CRM UI. Missing data is displayed as unknown. Company statements use Gregorian year labels on both Thai and English pages to avoid mixing calendars.
