import {createClient} from 'npm:@supabase/supabase-js@2.115.0';
import {microsoftMailToken,MICROSOFT_SENDER} from '../_shared/microsoft-mail.mjs';
import {matchCustomerMail,normalizedEmail,validLineSignature} from './model.mjs';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'},json=(data:unknown,status=200)=>Response.json(data,{status,headers});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 const length=Number(req.headers.get('content-length')||0);if(length>100000)return json({error:'TOO_LARGE'},413);
 const raw=await req.text();if(raw.length>100000)return json({error:'TOO_LARGE'},413);
 // LINE uses a provider HMAC, not a Supabase JWT. Never trust an unsigned event.
 if(req.headers.has('x-line-signature')){
  if(!await validLineSignature(raw,req.headers.get('x-line-signature'),Deno.env.get('CRM_LINE_CHANNEL_SECRET')))return json({error:'INVALID_SIGNATURE'},401);
  let events;try{events=JSON.parse(raw).events;if(!Array.isArray(events)||events.length>100)throw Error();}catch{return json({error:'INVALID_EVENTS'},400);}
  const server=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  for(const e of events){if(e.type!=='message'||e.message?.type!=='text'||e.source?.type!=='user'||!e.webhookEventId||!/^U[0-9a-f]{32}$/.test(e.source.userId)||!Number.isFinite(e.timestamp)||e.timestamp>Date.now()+60000)continue;
   const {data:link,error}=await server.from('crm_customer_channel_links').select('customer_id').eq('provider','line').eq('identifier',e.source.userId).maybeSingle();if(error)return json({error:'LOOKUP_FAILED'},500);if(!link)continue;
   const r=await server.from('crm_customer_communications').upsert({customer_id:link.customer_id,provider:'line',external_id:String(e.webhookEventId).slice(0,500),direction:'inbound',subject:'LINE',body:String(e.message.text||'').slice(0,10000),participant:e.source.userId,occurred_at:new Date(e.timestamp).toISOString()},{onConflict:'provider,external_id,customer_id',ignoreDuplicates:true});if(r.error)return json({error:'SAVE_FAILED'},500);
  }return json({ok:true});
 }
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!token)return json({error:'UNAUTHORIZED'},401);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false}});
 const {data:auth,error:authError}=await db.auth.getUser(token);if(authError||!auth.user)return json({error:'UNAUTHORIZED'},401);
 const {data:p}=await db.from('profiles').select('id,is_active,deleted_at,is_super_admin,role,custom_role_key').eq('id',auth.user.id).single();if(!p?.is_active||p.deleted_at)return json({error:'ACCESS_DENIED'},403);
 let body;try{body=JSON.parse(raw);}catch{return json({error:'INVALID_REQUEST'},400);}
 if(!['status','sync'].includes(body.action)||!(/^[a-f0-9-]{36}$/i.test(body.customer_id||'')))return json({error:'INVALID_REQUEST'},400);
 if(body.action==='sync'&&!p.is_super_admin)return json({error:'ACCESS_DENIED'},403);
 if(!p.is_super_admin){const {data:rights}=await db.from('role_permissions').select('module,can_view,can_create').eq('role_key',p.role==='custom'?p.custom_role_key:p.role);if(!rights?.some(r=>r.module==='customers'&&r.can_view)||!rights.some(r=>r.module==='activities'&&r.can_view&&(body.action!=='sync'||r.can_create)))return json({error:'ACCESS_DENIED'},403);}
 const {data:c,error:ce}=await db.from('customers').select('id,email').eq('id',body.customer_id).single();if(ce||!c)return json({error:'ACCESS_DENIED'},403);
 const configured=['CRM_MAIL_TENANT_ID','CRM_MAIL_CLIENT_ID','CRM_MAIL_CLIENT_SECRET'].every(n=>Deno.env.get(n));
 if(body.action==='status')return json({mail_configured:configured,line_configured:Boolean(Deno.env.get('CRM_LINE_CHANNEL_SECRET'))});
 if(!configured)return json({error:'MAIL_NOT_CONFIGURED'},503);
 // Only the account email is used. Contact mail requires a separate explicit identity mapping.
 const email=normalizedEmail(c.email);if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))return json({error:'NO_CUSTOMER_EMAIL'},400);
 const server=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const {count,error:countError}=await server.from('customers').select('id',{count:'exact',head:true}).ilike('email',email);if(countError||count!==1)return json({error:'MAIL_AMBIGUOUS'},409);
 // Claim once per actor/account/minute before making external calls.
 const {data:claimed,error:claimError}=await server.rpc('crm_claim_communication_sync',{p_customer:c.id,p_actor:p.id});if(claimError||!claimed)return json({error:'RATE_LIMITED'},429);
 try{const mailToken=await microsoftMailToken(n=>Deno.env.get(n)||'');const since=new Date(Date.now()-30*86400000).toISOString();
  const url=new URL('https://graph.microsoft.com/v1.0/users/'+encodeURIComponent(MICROSOFT_SENDER)+'/messages');url.searchParams.set('$top','100');url.searchParams.set('$select','id,subject,bodyPreview,from,toRecipients,ccRecipients,sentDateTime,receivedDateTime');url.searchParams.set('$filter','receivedDateTime ge '+since);url.searchParams.set('$orderby','receivedDateTime desc');
  const r=await fetch(url,{headers:{Authorization:'Bearer '+mailToken,Prefer:'IdType="ImmutableId"'},signal:AbortSignal.timeout(20000)});if([401,403].includes(r.status))return json({error:'MAIL_READ_NOT_AUTHORIZED'},403);if(!r.ok)return json({error:'MAIL_UNAVAILABLE'},502);const payload=await r.json();if(!Array.isArray(payload.value))throw Error();const messages=matchCustomerMail(payload.value,[email],MICROSOFT_SENDER);
  if(messages.length){const saved=await server.from('crm_customer_communications').upsert(messages.map(m=>({...m,customer_id:c.id,created_by:p.id})),{onConflict:'provider,external_id,customer_id',ignoreDuplicates:true});if(saved.error)throw saved.error;}
  return json({processed:messages.length,scanned:payload.value.length,truncated:Boolean(payload['@odata.nextLink']),mailbox:MICROSOFT_SENDER});
 }catch{return json({error:'MAIL_UNAVAILABLE'},502);}
});
