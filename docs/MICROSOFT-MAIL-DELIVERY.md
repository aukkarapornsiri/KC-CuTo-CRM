# CuTo Microsoft 365 email

User scope (2026-10-11): send customer marketing and CRM operational notices from CuToCRM@kai-com.com. Calendar/Intune integration is outside this scope and remains disabled after failed checks.

## Sender and activation

Use existing CRM_MAIL_TENANT_ID, CRM_MAIL_CLIENT_ID and CRM_MAIL_CLIENT_SECRET exclusively server-side. The sender is fixed to CuToCRM@kai-com.com. This requires existing Microsoft Mail.Send application access to that mailbox; Calendar/Intune permissions are irrelevant. No permissions are granted by this change.

Migration prepares the sender and company postal address from existing company settings, but leaves verified_at empty and outbound sending disabled. Saving checks application authentication, not mailbox send access. The explicit **Send test email to my account and activate** control sends one fixed diagnostic to the verified signed-in @kai-com.com user. Only Microsoft 202 acceptance activates delivery; Inbox delivery must be checked separately. No customer campaign is queued by activation.

## Marketing

Existing campaign drafts, previews, recipient deduplication, scheduling, cancellation, opt-out list and unsubscribe links are retained. Each message has exactly one recipient. Queue claims five messages per minute. A Graph request ID records acceptance; it is not presented as an Outlook message ID. Exchange sending limits still apply; this is not an unlimited bulk-mail service.

## Operational notices

New notifications with an identified active recipient enqueue one email per notification after activation. Existing notifications are not backfilled. Approval and service notices use existing database notifications. Lead assignment adds a notice when owner changes. Follow-up uses the activity reminder_at time, checked every 15 minutes. Contract/MA notices are generated at 30, 7, 1 and 0 days, once per contract end date and milestone, using the renewal owner or owner. Completed/cancelled activities and cancelled/renewed contracts are excluded. All contract types are covered, including MA.

The recipient is resolved from verified Auth identity at delivery time, restricted to @kai-com.com. Active state and module view permission are rechecked. No global fan-out for null user_id. Worker claims are service-only; authenticated clients cannot insert/update the delivery queue. The existing permission matrix remains authoritative.

Workers do nothing while unverified/disabled. Cron checks due work before reading its secret or invoking Edge. Claims use SKIP LOCKED. Only explicit 429 responses can be retried, at most four attempts, honoring Retry-After. Timeouts/5xx/expired in-flight leases become failed/unknown for manual Sent Items reconciliation: Graph sendMail does not provide an idempotency key. No automatic resend after ambiguous acceptance.

## Validation and release gate

Six provider unit tests plus marketing worker behavior tests cover sender, one recipient, 202 acceptance, opt-out, 429 backoff, network ambiguity, and credential failure. SQL rollback tests cover disabled/enabled queues, null-recipient exclusion, repeated claim, stale lease, and client privilege rejection.

At preparation time, Supabase mutation calls returned Invalid or expired requestState. Read-only verification confirmed the new queue was absent. Do not deploy this Edge/frontend release until the migration is applied and SQL rollback tests pass. Do not claim mail delivery until the user authorizes the diagnostic and Microsoft accepts it.
