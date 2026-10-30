# AI dashboard analytics

Replaces static dashboard values, recommendations and inert controls with read-only analysis of opportunities, contracts and tickets visible through the current session and module permissions. No new elevated RPC, credentials or write-on-mount behavior.

Rules (evaluated when loaded/refreshed, Asia/Bangkok): open opportunities past close date, missing close date or missing next action; contracts expiring within 30 days or already expired, excluding renewed/cancelled/terminated; unresolved tickets whose SLA timestamp passed or breach flag is true, excluding paused tickets. Multiple opportunity findings count once. Priority is a transparent rule label, never AI confidence. Overdue pipeline value is not revenue or expected loss.

Search, owner, module, priority and due-date filters affect the AI summary input and action list. Operational KPI cards and the shared sales map, province rankings and order table are excluded from the AI dashboard. Dates and values remain available in expandable evidence. Other dashboards retain their sales map. Source records open through existing permission-gated navigation. Reads are paginated at 500 rows and report partial failures explicitly. Demo does not query live tables or invoke AI. AI summary is requested explicitly, receives aggregate metrics only and uses the existing configured crm-ai provider; errors and stale filter responses are handled without manufactured output.

Validation: `node --test tests/ai-dashboard.test.mjs`, integration-contract, and dedicated `ai-dashboard-smoke` CI job (desktop/mobile; controlled client and AI adapters; filtering, refresh, summary payload, errors and demo isolation).
