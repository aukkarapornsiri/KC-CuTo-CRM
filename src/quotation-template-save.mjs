/** Verify persistence before the UI announces a successful settings save. */
export async function saveQuotationTemplate(client,patch,saved){
 const unwrap=async query=>{const {data,error}=await query;if(error)throw error;return data;};
 const {id,created_at,updated_at:ignored,...fields}=patch;
 const payload={...fields,updated_at:patch.updated_at};
 let row;
 if(id){
  let query=client.from('crm_quotation_templates').update(payload).eq('id',id);
  query=saved?.updated_at?query.eq('updated_at',saved.updated_at):query.is('updated_at',null);
  row=await unwrap(query.select().maybeSingle());
 }else row=await unwrap(client.from('crm_quotation_templates').insert({...payload,is_default:true,status:'active'}).select().single());
 if(!row)throw Error('แม่แบบถูกแก้ไขโดยผู้อื่น หรือไม่มีสิทธิ์บันทึก กรุณาเปิดการตั้งค่าใหม่');
 const persisted=await unwrap(client.from('crm_quotation_templates').select('*').eq('id',row.id).single());
 const stable=value=>JSON.stringify(value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
 if(!persisted||Object.entries(payload).some(([key,value])=>key!=='updated_at'&&stable(persisted[key])!==stable(value)))throw Error('ตรวจสอบค่าหลังบันทึกไม่ตรงกัน กรุณาเปิดการตั้งค่าใหม่');
 return persisted;
}
export const QUOTATION_TEMPLATE_CHANGED='kc-quotation-template-changed';

// Every document uses the current Super Admin template, irrespective of approval stage.
export function followsSharedQuotationTemplate(){return true;}
let templateCache=new WeakMap();
const observedClients=new WeakSet();
const copy=value=>value?structuredClone(value):null;
export function clearSharedQuotationTemplateCache(){templateCache=new WeakMap();}
if(typeof window!=='undefined'){
 for(const event of [QUOTATION_TEMPLATE_CHANGED,'crm-access-changed','storage'])window.addEventListener(event,clearSharedQuotationTemplateCache);
}
function cacheFor(client){
 if(!observedClients.has(client)&&client.auth?.onAuthStateChange){
  observedClients.add(client);
  client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN')clearSharedQuotationTemplateCache();});
 }
 let state=templateCache.get(client);
 if(!state){state={row:null,flight:null};templateCache.set(client,state);}
 return state;
}
export function peekSharedQuotationTemplate(client){return copy(templateCache.get(client)?.row);}
export async function loadSharedQuotationTemplate(client){
 const state=cacheFor(client);
 if(state.flight)return copy(await state.flight);
 state.flight=(async()=>{
  // The small revision read detects changes made by another user/device.
  // Full template data is fetched only on first use or a changed revision.
  if(state.row){
   const {data,error}=await client.from('crm_quotation_templates').select('id,updated_at').eq('is_default',true).eq('status','active').maybeSingle();
   if(error)throw error;
   if(data?.id===state.row.id&&data.updated_at===state.row.updated_at)return state.row;
  }
  const {data,error}=await client.from('crm_quotation_templates').select('*').eq('is_default',true).eq('status','active').maybeSingle();
  if(error)throw error;
  if(!data?.id)throw Error('ไม่พบแม่แบบกลาง กรุณาให้ Super Admin บันทึกแม่แบบใบเสนอราคา / No shared quotation template. Contact Super Admin.');
  state.row=copy(data);return state.row;
 })();
 try{return copy(await state.flight);}catch(error){state.row=null;throw error;}finally{state.flight=null;}
}

export const demoSharedQuotationTemplate={current:null};
