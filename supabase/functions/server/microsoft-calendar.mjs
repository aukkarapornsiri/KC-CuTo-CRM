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

export function microsoftEventBody(a,sendInvitations=false){
 const start=new Date(a.scheduled_at),end=a.ended_at?new Date(a.ended_at):new Date(+start+3600000);
 if(!Number.isFinite(+start)||!Number.isFinite(+end)||+end<=+start)throw Error('Invalid meeting start or end');
 const body={subject:a.subject,body:{contentType:'Text',content:a.description||''},start:{dateTime:start.toISOString().replace('Z',''),timeZone:'UTC'},end:{dateTime:end.toISOString().replace('Z',''),timeZone:'UTC'},isOnlineMeeting:a.teams_enabled??a.type==='Online Meeting'};
 if(body.isOnlineMeeting)body.onlineMeetingProvider='teamsForBusiness';
 if(a.location)body.location={displayName:String(a.location).slice(0,1000)};
 const minutes=Number(a.reminder_minutes??15);if(!Number.isInteger(minutes)||minutes<0||minutes>40320)throw Error('Invalid reminder');body.isReminderOn=true;body.reminderMinutesBeforeStart=minutes;
 if(sendInvitations){
  if(a.calendar_enabled===false)throw Error('Enable Outlook Calendar before sending');
  if(a.status==='cancelled')throw Error('Cannot send a cancelled activity');
  if(!Array.isArray(a.attendee_emails)||a.attendee_emails.length>100)throw Error('Invalid attendee list');
  const emails=[...new Set(a.attendee_emails.map(v=>String(v).trim().toLowerCase()))];
  if(emails.some(v=>v.length>254||!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(v)))throw Error('Invalid attendee email');
  body.attendees=emails.map(address=>({emailAddress:{address},type:'required'}));
 }
 return body;
}
