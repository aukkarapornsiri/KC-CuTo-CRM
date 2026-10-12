# Netcube catalog push API

Status: deployed, waiting for the Netcube sender. No scheduler or integration credential has been activated.

POST https://tocsxnprspiogawignib.supabase.co/rest/v1/rpc/crm_netcube_ingest

Headers:
- Content-Type: application/json
- apikey: CRM Supabase publishable/anon key
- Authorization: Bearer <valid CRM user access token>

A publishable key alone grants no access. The caller must be active, complete onboarding, and have inventory import AND edit permissions in the Super Admin matrix; create is additionally required for new products. No service-role key should be distributed to Netcube. Provision the integration identity through the normal Super Admin flow before connecting the sender. Tokens require normal refresh; do not use a browser session cookie as a server credential.

Example body (sample values only):
```json
{
  "p": {
    "batch_id": "netcube-20261013-0830-001",
    "observed_at": "2026-10-13T08:30:00+07:00",
    "items": [{
      "source_id": "stable-netcube-product-id",
      "part_number": "EXAMPLE-PN",
      "name": "Example product",
      "spec": "CPU: Example\nRAM: 16GB",
      "category": "Laptop",
      "cost": 15000
    }]
  }
}
```

Cost is THB excluding VAT, maximum two decimal places, nonnegative. Source must convert to this meaning before sending. `source_id` is immutable across Part Number changes. The initial match uses exact case-insensitive Part Number; ambiguous/colliding matches are rejected. Do not reuse a source_id for a different product. Code remains stable when Part Number changes. Include complete spec text; an empty string intentionally clears specs.

Limits: 1–500 items and 2 MB per transaction. All items commit together or all roll back. Retries must reuse the identical batch_id and payload; they return `replayed: true` without duplicate notifications. Older/equal observed_at for an already mapped product is rejected under a new batch_id. Clock skew up to five minutes is allowed.

Response: batch_id, created, updated, unchanged, notifications, replayed.

Updates change name, spec, Part Number and cost. Selling prices, quote snapshots and stock quantities are preserved. New items start with selling price zero (pending entry), Unit, nonstock and VAT exclusive. Existing inventory tracking configuration stays unchanged. Missing source products are never deleted. Category is used only when creating a product.

A cost increase creates a linked notification for each affected quotation owner with current quotation view permission. Eligible statuses: draft, submitted, pending, approved, sent; expired validity dates are excluded. Matching is by price_item_id. Accepted/converted/rejected/expired quotations are excluded. Notices contain no cost amounts; the user checks costs through existing permissions. Existing notification-email delivery configuration still applies.

Requested sender schedule: 08:30 and 14:00 Asia/Bangkok daily (UTC cron `30 1 * * *` and `0 7 * * *`). These schedules are documented, NOT activated. Configure the sender after Netcube supports an authorized export/API and an integration identity is assigned. Log failures and retry the same batch. Never report a failed run as synced.

Validation: tests/netcube-ingest.sql executes in a rollback transaction. Verified creation, idempotent retries, cost-rise notices, quote snapshot preservation, stale rejection, decreases without alerts, and unauthenticated denial. No production product/quotation test data persists.
