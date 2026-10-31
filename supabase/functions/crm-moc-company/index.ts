import {createClient} from 'npm:@supabase/supabase-js@2.115.0';
import {fetchMOC,mocTaxId} from './model.mjs';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!token)return json({error:'UNAUTHORIZED'},401);
 const userClient=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await userClient.auth.getUser(token);if(authError||!auth.user)return json({error:'UNAUTHORIZED'},401);
 const {data:profile,error:profileError}=await userClient.from('profiles').select('is_active,deleted_at,is_super_admin,role,custom_role_key').eq('id',auth.user.id).single();if(profileError||!profile?.is_active||profile.deleted_at)return json({error:'ACCESS_DENIED'},403);
 if(!profile.is_super_admin){const role=profile.role==='custom'?profile.custom_role_key:profile.role;const {data:rights,error}=await userClient.from('role_permissions').select('module,can_view').eq('role_key',role).in('module',['customers','quotations']);if(error||!['customers','quotations'].every(m=>rights?.some(r=>r.module===m&&r.can_view)))return json({error:'ACCESS_DENIED'},403);}
 let body;try{const raw=await req.text();if(raw.length>2000)throw Error();body=JSON.parse(raw);}catch{return json({error:'INVALID_REQUEST'},400);}
 if(typeof body.customer_id!=='string'||!(/^[0-9a-f-]{36}$/i.test(body.customer_id)))return json({error:'INVALID_CUSTOMER'},400);
 const {data:customer,error:customerError}=await userClient.from('customers').select('id,tax_id').eq('id',body.customer_id).single();if(customerError||!customer)return json({error:'CUSTOMER_UNAVAILABLE'},403);
 const id=mocTaxId(customer.tax_id);if(!id)return json({error:'INVALID_TAX_ID'},400);
 const server=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}}),key=crypto.randomUUID();
 const {data:claim,error:claimError}=await server.rpc('crm_claim_moc_sync',{p_tax_id:id,p_request_key:key,p_actor_id:auth.user.id});if(claimError)return json({error:'MOC_DISABLED'},503);
 if(claim.status==='rate_limited')return json({error:'MOC_RATE_LIMITED',retry_after:60},429);
 if(claim.status==='cached')return json({status:'cached',tax_id:id});if(claim.status==='busy')return json({error:'MOC_BUSY'},409);if(claim.status==='cooldown')return json({error:claim.error_code||'MOC_COOLDOWN',retry_after:300},429);
 try{const company=await fetchMOC(id);const result=await server.rpc('crm_finish_moc_sync',{p_request_key:key,p_profile:company});if(result.error)throw Error('MOC_UNAVAILABLE');return json({status:'updated',tax_id:id});}
 catch(e){const message=e instanceof Error?e.message:'';const known=['MOC_BLOCKED','MOC_INVALID_RESPONSE','MOC_ID_MISMATCH','MOC_INVALID_AMOUNT','MOC_NOT_FOUND','MOC_UNAVAILABLE'];const code=known.includes(message)?message:e instanceof DOMException&&['TimeoutError','AbortError'].includes(e.name)?'MOC_TIMEOUT':'MOC_UNAVAILABLE';await server.rpc('crm_finish_moc_sync',{p_request_key:key,p_error_code:code});return json({error:code},code==='MOC_NOT_FOUND'?404:502);}
});
