export function attendeeEmails(value){
 const values=Array.isArray(value)?value:String(value||'').split(/[;,\s]+/);const out=[];
 for(const raw of values){const email=String(raw).trim().toLowerCase();if(!email)continue;if(email.length>254||!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email))throw Error('อีเมลผู้เข้าร่วมไม่ถูกต้อง / Invalid attendee email: '+email);if(!out.includes(email))out.push(email);}
 if(out.length>100)throw Error('รองรับผู้เข้าร่วมสูงสุด 100 คน / Maximum 100 attendees');return out;
}
export function bangkokInput(value){if(!value)return '';const d=new Date(value);return Number.isNaN(+d)?'':new Date(+d+7*3600000).toISOString().slice(0,16);}
export function activityISO(value){if(!value)return null;const str=String(value);const d=new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(str)?str:str+'+07:00');if(Number.isNaN(+d))throw Error('วันเวลาไม่ถูกต้อง / Invalid date');return d.toISOString();}
export function activityCalendarPatch(draft){
 const scheduled_at=activityISO(draft.scheduled_at);const ended_at=activityISO(draft.ended_at)||(scheduled_at?new Date(Date.parse(scheduled_at)+3600000).toISOString():null);
 if(scheduled_at&&ended_at&&Date.parse(ended_at)<=Date.parse(scheduled_at))throw Error('เวลาสิ้นสุดต้องหลังเวลาเริ่ม / End must be after start');
 const reminder_minutes=Number(draft.reminder_minutes??15);if(!Number.isInteger(reminder_minutes)||reminder_minutes<0||reminder_minutes>40320)throw Error('Invalid reminder');
 return {...(draft.related_module!==undefined?{related_module:draft.related_module||null,related_id:draft.related_id||null}:{}),scheduled_at,ended_at,attendee_emails:attendeeEmails(draft.attendee_input??draft.attendee_emails),calendar_enabled:draft.calendar_enabled!==false,teams_enabled:draft.teams_enabled??draft.type==='Online Meeting',location:String(draft.location||'').trim().slice(0,1000),reminder_minutes};
}
export function calendarDeliveryError(reason){
 const message=String(reason||'Calendar sync failed');
 if(/Microsoft token request failed \(401\)/i.test(message))return 'เชื่อมต่อ Microsoft 365 ไม่สำเร็จ (401) กรุณาให้ผู้ดูแลตรวจ Tenant ID, Client ID และ Client Secret ที่ตั้งค่าการเชื่อมต่อ Microsoft แล้วทดสอบใหม่ / Microsoft authentication failed (401). Ask an administrator to check the Microsoft connection credentials and test again.';
 if(/Microsoft Calendar.*\(403\)/i.test(message))return 'Microsoft ไม่อนุญาตให้เข้าถึงปฏิทิน (403) กรุณาให้ผู้ดูแลตรวจสิทธิ์ Calendars.ReadWrite (Application), Admin consent และสิทธิ์เข้าถึงกล่องจดหมาย / Microsoft denied calendar access (403). Ask an administrator to check application permissions, admin consent and mailbox access.';
 return message;
}
export async function sendActivityCalendar(client,id){
 const {data,error}=await client.functions.invoke('server/make-server-04da8244/calendar/push',{body:{provider:'microsoft_calendar',activity_id:id,send_invitations:true}});
 if(error||!data?.ok){let reason=data?.error;if(!reason&&error?.context?.json)try{reason=(await error.context.json()).error;}catch{}throw Error(calendarDeliveryError(reason||error?.message));}return data;
}
