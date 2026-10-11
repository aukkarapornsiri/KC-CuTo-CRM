# Stock at SO opening

CuTo deducts stock when the trusted source opens a converted SO and returns it when that SO is cancelled or voided. The existing `kc-dw-sales-sync` feed authenticates with its existing integration key. The stock trigger is internal-only; no new shared credentials or public write endpoint are introduced.

## Activation

In Products & Inventory → Inventory Settings, first create an active warehouse, configure stock items in the quotation price book, post real opening balances, and select the default warehouse. Enable stock control, then enable “Issue stock on SO opening and reverse on cancellation.” The server checks readiness and records the activation instant.

The feature defaults off. Existing SOs, orders first received while off, and delayed orders opened before activation are permanently excluded. There is no automatic historical backfill. Disabling new issues does not suppress cancellation reversals already owed. Reopening an issued-and-reversed SO requires the feature to be enabled.

## Feed contract

Keep the existing POST body and `sourceBasis: "converted_so"`. Add the following fields to `productLines`:

```json
{
  "productCode": "EXISTING-CRM-ITEM-CODE",
  "product": "Product name",
  "netAmount": 100,
  "quantity": 2,
  "warehouseId": "existing-warehouse-uuid"
}
```

- `productCode` must match an active CuTo price-book item with an inventory detail record. Names alone never match stock.
- `quantity` is explicit, finite, greater than zero and below 1 billion. It is mandatory for stock items; never inferred from revenue or defaulted to one.
- `warehouseId` is optional only when an active default warehouse is configured.
- `serialNumber` is required for serial-tracked items; each serial occupies one line with quantity 1. Serial identifiers are at most 200 characters.
- Service/non-stock lines require a mapped product code but do not alter balances.
- Legacy feeds remain accepted while automatic stock is off. Omitted product lines retain previous metadata, including quantity, warehouse and serial.
- Cancellation/void may omit product lines. Reversals use the originally posted item/warehouse/quantity snapshot.

## Integrity and corrections

SO upsert, balances, movement history and the idempotency record share one database transaction. Insufficient stock, an invalid mapping or a serial conflict rejects the upsert; no partial movement is retained. The feed must surface the error and retry only after the underlying problem is resolved.

Repeated active updates do not deduct again. Repeated cancellations do not return stock again. Source timestamps older than the stored timestamp are ignored by the existing database guard. A reopened SO starts a new issue cycle against its original warehouse snapshot. Changing stock line identity or quantity after issue is rejected: cancel and create a new SO for a corrected order. Revenue-only corrections remain allowed.

Automated movements show “Automatic · SO,” link to the source SO and record issue cycle/line. They do not attribute automated work to a human account. Existing manual movements still require an authenticated authorized operator. No human or service-role client can call the private trigger directly, and normal users cannot edit the idempotency table or stock history.

## Verification

`tests/so-stock-workflow.sql` exercises 23 database checks in a rollback-only transaction: setup gate, activation instant, existing/delayed order exclusion, issue/retry, revenue correction, immutable issued quantities, all-or-nothing failure, unknown products/missing quantities, serials, service lines, cancellation while disabled, duplicate reversal, stale updates, reopen, audit identity, and access controls.

The real environment currently has no active warehouse, stock-controlled items, or opening balances. The feature must stay off until those business records and the upstream quantity/code mapping are supplied. Test fixtures are not production stock.
