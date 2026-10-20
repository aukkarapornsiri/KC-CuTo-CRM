# CRM address ownership

- Customer billing address is the master used by new quotations and Account 360.
- Conversion copies street, city, province, postal code and country separately.
- Editing a converted lead propagates to its linked customer and converted contact only if their address is empty or still matches the previous lead address.
- Editing a customer propagates to converted leads and contacts that still share the previous billing address. Different branch, personal and shipping addresses stay separate.
- A quotation with `address_source=customer` follows billing updates only while status is `draft` and approval is neither pending nor approved. Opening and saving an editable linked draft also refreshes its address.
- Typing a quotation address sets `address_source=custom`. “Use customer address” reconnects it. Submitted and issued documents retain their snapshot.
- All triggers use invoker security and the existing permission matrix. They do not grant cross-module editing rights. Users without customer edit rights must have an authorized customer editor update the master.
- The migration repairs all unambiguous ID-linked converted accounts, normalizes the legacy combined-street format, fills blank converted contacts and classifies editable quotations. Conflicting addresses and non-draft documents are preserved. No fuzzy company-name joins are used.
- Mutation cache invalidation remains in `rest-read-policy.mjs`; there is no new polling.

Regression: `node --test tests/customer-address.test.mjs tests/lead-billing-address.test.mjs`; database tests `tests/connected-addresses-rls.sql` and `tests/record-profile-rls.sql` run with an authenticated admin and roll back fixtures.
