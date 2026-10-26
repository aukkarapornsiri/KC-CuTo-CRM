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

// Issued and approval-stage documents keep their saved template.
export function followsSharedQuotationTemplate(quotation={}){return !quotation.id||quotation.status==='draft'&&!['pending','approved'].includes(quotation.approval_status);}
