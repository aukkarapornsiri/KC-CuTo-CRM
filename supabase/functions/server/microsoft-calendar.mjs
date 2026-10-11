// Mailboxes come only from server-verified Auth identities, never request/profile input.
export function microsoftMailbox(user) {
  const email=String(user?.email||'').trim().toLowerCase();
  if(!user?.email_confirmed_at||! /^[^\s@]+@kai-com\.com$/.test(email))throw Error('A verified @kai-com.com account is required for Microsoft Calendar');
  return email;
}
export function microsoftExternalId(mailbox,eventId) {
  if(!mailbox||!eventId)throw Error('Calendar mailbox and event ID required');
  return `${mailbox.toLowerCase()}:${eventId}`;
}
export async function microsoftCredentials(secret,env) {
  const dedicated=await Promise.all(['MS365_TENANT_ID','MS365_CLIENT_ID','MS365_CLIENT_SECRET'].map(secret));
  // Do not mix credentials from different application registrations.
  if(dedicated.some(Boolean))return {tenant:dedicated[0],clientId:dedicated[1],clientSecret:dedicated[2]};
  return {tenant:env('CRM_MAIL_TENANT_ID'),clientId:env('CRM_MAIL_CLIENT_ID'),clientSecret:env('CRM_MAIL_CLIENT_SECRET')};
}
