const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function createHandler(admin){
 const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 const rpc=async(name,args)=>{const {data,error}=await admin.rpc(name,args);if(error)throw error;return data;};
 async function remove(id,actor){
  const job=await rpc('crm_document_delete_claim',{p_object:id,p_actor:actor});
  if(job.state==='deleted')return {id,ok:true};
  const {error}=await admin.storage.from(job.bucket_id).remove([job.object_key]);
  await rpc('crm_document_delete_finish',{p_job:job.id,p_error:error?'Storage deletion failed':null});
  if(error)throw Error('Storage deletion failed; retry available');
  return {id,ok:true};
 }
 return async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return reply(405,{error:'method_not_allowed'});
  try{
   const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
   if(!token)return reply(401,{error:'unauthorized'});
   let body;try{body=await req.json();}catch{return reply(400,{error:'invalid_request'});}
   if(body.action==='scheduled'){
    if(await rpc('crm_document_cron_authorized',{p_token:token})!==true)return reply(403,{error:'forbidden'});
    const ids=await rpc('crm_document_retention_candidates',{}),results=[];
    for(const id of ids){try{results.push(await remove(id,null));}catch{results.push({id,ok:false});}}
    return reply(200,{results});
   }
   const {data,error}=await admin.auth.getUser(token);
   if(error||!data?.user)return reply(401,{error:'unauthorized'});
   if(await rpc('crm_actor_can',{p_actor:data.user.id,p_module:'access',p_action:'delete'})!==true)return reply(403,{error:'forbidden'});
   if(body.action!=='delete'||body.confirm!==true||!uuid.test(body.object_id||''))return reply(400,{error:'invalid_request'});
   return reply(200,await remove(body.object_id,data.user.id));
  }catch(e){return reply(e.code==='42501'?403:e.code==='P0001'?409:503,{error:e.code==='P0001'?e.message:'Deletion failed; reload and retry'});}
 };
}
