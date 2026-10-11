# Microsoft per-user calendar

The user confirmed on 2026-10-11 that each employee uses their own @kai-com.com calendar and Calendar/Intune use the existing Microsoft mail application. Invitation sender remains CuToCRM@kai-com.com.

Server resolves calendar identities from verified Supabase Auth email, never a caller-supplied mailbox or editable profile email. Pull uses the signed-in employee. Push uses the active activity owner's verified identity; writing another owner's calendar additionally requires activities.assign from the permission matrix. Import updates require activities.edit. Imported activities remain subject to the existing CRM activities visibility permissions; importing calendar events makes them CRM records.

Credentials are resolved as one complete MS365_* group, with the existing CRM_MAIL_* Edge secrets reused only when no dedicated MS365 values exist. Partial dedicated configuration fails rather than mixing application credentials. No secrets are returned or copied into source or a browser.

Calendar event IDs include the mailbox to avoid collisions. Graph raw IDs are retained separately. Repeated push updates an existing event; first creation uses a stable transactionId to protect retries. A changed owner of a linked event is rejected instead of silently writing to another mailbox. No pre-existing Microsoft calendar activities were present at rollout inspection.

Connection checks use the current administrator's verified mailbox and Intune's read endpoint. A successful check is required before reporting Connected; credential presence alone is not proof of Microsoft permissions. Calendar uses the application's existing Calendars permissions and Intune its existing device-management permissions. This release grants no Microsoft permissions and sends no emails or calendar invitations during deployment.

Validation: 10 focused tests cover verified identities, domain rejection, per-mailbox IDs, credential source isolation, push retry behavior, mailbox changes, pull identity spoofing, and cross-owner denial. Live Microsoft API verification still requires a signed-in CuTo session. AI and Resend marketing credentials remain separate and unconfigured.
