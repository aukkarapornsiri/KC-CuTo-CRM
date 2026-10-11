export const MICROSOFT_SENDER='CuToCRM@kai-com.com';
export async function microsoftMailToken(env,fetcher=fetch){
 const tenant=env('CRM_MAIL_TENANT_ID'),client=env('CRM_MAIL_CLIENT_ID'),secret=env('CRM_MAIL_CLIENT_SECRET');
 if(!tenant||!client||!secret)throw Error('Microsoft mail application credentials are missing');
 if(!/^[a-f\d-]{36}$/i.test(tenant)||!/^[a-f\d-]{36}$/i.test(client))throw Error('Invalid Microsoft mail application IDs');
 const r=await fetcher(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client,client_secret:secret,scope:'https://graph.microsoft.com/.default',grant_type:'client_credentials'}),signal:AbortSignal.timeout(15000)});
 const d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw Error(`Microsoft mail authentication failed (${r.status})`);return d.access_token;
}
export async function sendMicrosoftMail({token,to,subject,html,text,replyTo,reference},fetcher=fetch){
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)||to.length>254)throw Error('Invalid recipient');
 const message={subject:String(subject).replace(/[\r\n]/g,' ').slice(0,255),body:{contentType:html?'HTML':'Text',content:html||text||''},toRecipients:[{emailAddress:{address:to}}],...(replyTo?{replyTo:[{emailAddress:{address:replyTo}}]}:{}),internetMessageHeaders:[{name:'x-cuto-reference',value:reference}]};
 // Graph sendMail has no idempotency key. Never retry an ambiguous timeout/5xx automatically.
 const r=await fetcher(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MICROSOFT_SENDER)}/sendMail`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({message,saveToSentItems:true}),signal:AbortSignal.timeout(15000)});
 let code='';if(r.status!==202){const d=await r.json().catch(()=>({}));code=String(d.error?.code||'').replace(/[^\w.-]/g,'').slice(0,100);}
 return {accepted:r.status===202,status:r.status,requestId:r.headers.get('request-id'),retryAfter:Math.max(60,Number(r.headers.get('retry-after'))||60),error:code};
}
