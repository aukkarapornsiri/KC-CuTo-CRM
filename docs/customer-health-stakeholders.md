# Customer 360: health, stakeholders and role views

## Operational health score v1

This is an explainable CRM relationship score, not a credit/solvency rating. It uses only data returned by the user's existing module/row permissions. Missing/unavailable sources are not assumed to be zero or healthy. Coverage is the total available dimension weight. Below 50% coverage no score is shown; below 100% the score is explicitly provisional. With full coverage, 75–100 is healthy, 50–74 needs attention, under 50 is high risk.

The score is 100 minus these deductions, capped by dimension:

| Dimension | Maximum | Rule |
|---|---:|---|
| Engagement | 15 | Last completed customer contact more than 30 days ago: 8; over 60 days: 15. With no history, use account creation age. Future/invalid contact dates are not counted. |
| Follow-up | 25 | Unfinished, non-cancelled activities past their scheduled time: min(25, 10 + 5 × count). |
| Service | 15 | Any unresolved case older than 14 days. This does not claim an SLA breach. |
| Renewal | 15 | Active contract due within 30 days with no explicit linked future open contract activity. |
| Purchases | 20 | Latest rolling 90-day converted THB net sales under 50% of preceding 90 days, when a positive prior baseline exists. Deduplicate source system/order ID; exclude cancelled/non-THB/future orders. Invalid THB amounts/dates make the dimension unavailable. No prior history is neutral. |
| Stakeholders | 10 | No active contacts: 10; otherwise no Decision Maker/Approver/Executive: 5. |

Each risk shows the deduction, rule and source record links. Calculation time and data coverage are shown. Refresh Customer 360 to read current records; no extra browser polling is introduced.

## Risk bell notifications

An hourly private reminder job at minute 15 sends a normal-priority in-app customer summary only to the active customer owner who can view Customers and Activities, and only for that same owner's customer-linked activities more than one day overdue. No new email sends are enabled. The existing normal-priority notification-email guard skips these summaries.

The stable user/customer event key keeps one notification per risk episode. Continuing risk does not reset read/dismissed state or create duplicates. The next hourly check resolves the summary when the risk is cleared or owner/access changes. A later new risk episode reopens the same notification. Other score dimensions are shown in the permission-scoped Customer 360 risk tab; they do not generate broad cross-module notification disclosures.

## Contact map

Reuse existing contacts.role, influence_level and reports_to_id. Active contacts are displayed as a reporting tree with Decision Maker/Approver/Executive badges. Missing/out-of-scope managers and legacy invalid relationships are flagged, never guessed. Editing requires Contacts edit permission, preserves the customer and contact ID, and uses optimistic updated_at matching. Existing crm_person_profile validation prevents self-links, cycles, cross-account managers and moving contacts before detaching dependants. No duplicate contact or hierarchy table is added.

## Role-focused views

Sales prioritizes actionable quotations/service/renewals and decision contacts. Managers see the accessible account's overdue workload by recorded owner. Executives prioritize overall sales/pipeline and risk/renewal evidence. The default follows the signed-in role; users can change the presentation and the preference is saved per profile in this browser. This switch never grants access, changes data scope, assigns records or overrides existing permissions. It is an account-focused layout, not a new company-wide team dashboard.
