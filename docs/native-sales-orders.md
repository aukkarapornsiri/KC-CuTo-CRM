# Native CRM Sales Orders

Entry points: Quotations → Sales Orders, or quotation details → Receive PO / Sales Order. No KC Account 360 request is made.

1. Approve the quotation through the existing workflow.
2. Enter the customer's PO number/date, attach PDF/JPG/PNG (20 MB max), optionally set delivery date and notes.
3. Confirm. The server locks the quotation, creates a numbered SO and freezes the quotation's customer, address, tax, item, price, currency and payment-term snapshot. Repeated or concurrent requests return the existing order. One quotation has at most one SO, including cancelled orders; corrections require a new approved quotation.
4. Record full delivery with a reference/evidence description, then complete the order. Partial delivery is not represented as full delivery; keep the order confirmed until all items have been delivered.
5. An approver can cancel a confirmed order with a reason. Delivered/completed orders cannot be cancelled through this workflow, because a physical return requires a separate process.

Permissions reuse the quotation matrix: view reads SOs and linked PO attachments; create opens SOs; edit records delivery/completion; approve cancels. Active authenticated identity is required inside the private workers. Public RPC wrappers are invokers; tables have RLS and no direct client mutation grant. SOs cannot be deleted or financially edited. Files are private, signed URLs expire after 120 seconds, and attached files cannot be deleted through the unused-upload policy.

`crm_sales_orders` is the native document, `crm_sales_order_events` its immutable activity history. `kc_dw_sales_order_facts` receives a transactionally linked row with source `KC CuTo CRM` so existing CRM dashboards/targets/maps/Customer 360 include the sale exactly once. Net sales exclude VAT; document discounts are allocated across item lines with a final rounding remainder. Cancellation changes the fact status to cancelled. Existing THB-only reporting remains THB-only; other currencies stay in their own SO currency.

Inventory uses the existing SO stock trigger and current settings. This release does not enable stock control. If enabled later, the product codes must be mapped, the default warehouse configured and stock available. Serial-tracked items require one unit per quotation line and a serial supplied at conversion. Stock failure rolls back SO + sales fact atomically. Cancellation reverses an existing automatic issue once.

Validation: `tests/native-sales-orders.sql` (rollback-only database fixtures), `tests/native-sales-orders.test.mjs`, `tests/native-sales-orders-smoke.mjs` (desktop/mobile demo, no production writes). Number sequences can have gaps after rollback; numbers are never reused.
