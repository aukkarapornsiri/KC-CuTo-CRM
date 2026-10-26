import {readQuotationImage,uploadQuotationAsset,downloadQuotationAsset} from './quotation-assets.mjs';
import {demoSignatureDefaults} from './quotation-seller-signature.mjs';
export async function loadProfileSignature(client,owner,demoMode=false){
 if(demoMode)return demoSignatureDefaults.get(owner)||{};
 const {data,error}=await client.from('crm_sales_signature_defaults').select('storage_key').eq('user_id',owner).maybeSingle();
 if(error)throw error;
 return {seller_signature_storage_key:data?.storage_key||'',seller_signature_owner_id:owner};
}
export function createProfileSignature({React,client}){
 const h=React.createElement;
 return function ProfileSignature({profile,demoMode,lang,onBusy}){
  const [url,URL]=React.useState(''),[file,File]=React.useState(null),[busy,Busy]=React.useState(true),[error,ErrorText]=React.useState(''),[message,Message]=React.useState('');
  const lock=React.useRef(false),t=(th,en)=>lang==='th'?th:en;
  React.useEffect(()=>{let alive=true;Busy(true);(async()=>{try{const value=await loadProfileSignature(client,profile.id,demoMode);const src=value.seller_signature_url||(value.seller_signature_storage_key?await downloadQuotationAsset(client,value.seller_signature_storage_key):'');if(alive)URL(src);}catch(e){if(alive)ErrorText(e.message);}finally{if(alive)Busy(false);}})();return()=>{alive=false;};},[profile.id,demoMode]);
  async function choose(e){const next=e.target.files?.[0];e.target.value='';if(!next)return;try{const src=await readQuotationImage(next);File(next);URL(src);ErrorText('');Message('');}catch(e){ErrorText(e.message);}}
  async function save(){if(!file||lock.current)return;lock.current=true;Busy(true);onBusy(true);ErrorText('');try{const key=demoMode?'':await uploadQuotationAsset(client,file,profile.id,'seller-signature');if(demoMode)demoSignatureDefaults.set(profile.id,{seller_signature_url:url,seller_signature_owner_id:profile.id});else{const {error}=await client.from('crm_sales_signature_defaults').upsert({user_id:profile.id,storage_key:key,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)throw error;}File(null);Message(t('บันทึกลายเซ็นแล้ว','Signature saved'));}catch(e){ErrorText(e.message);}finally{lock.current=false;Busy(false);onBusy(false);}}
  return h('section',{style:{border:'1px solid #dbe4e8',borderRadius:12,padding:16,marginBottom:20}},h('h3',null,t('ลายเซ็นของฉัน','My signature')),h('p',null,t('ใช้เมื่อ Approve SO และเป็นลายเซ็นเริ่มต้นในใบเสนอราคา เอกสารที่อนุมัติแล้วจะเก็บลายเซ็นเดิม','Used when approving SOs and as your default quotation signature. Approved documents retain their original signature.')),url&&h('img',{src:url,alt:t('ลายเซ็นของฉัน','My signature'),style:{display:'block',width:180,height:55,objectFit:'contain',objectPosition:'left'}}),h('label',null,t('เลือกลายเซ็น (PNG, JPG, WebP ไม่เกิน 2 MB)','Choose signature (PNG, JPG, WebP up to 2 MB)'),h('input',{type:'file',accept:'image/png,image/jpeg,image/webp',disabled:busy,onChange:choose,'aria-label':t('อัปโหลดลายเซ็น Profile','Upload Profile signature')})),h('button',{type:'button',disabled:busy||!file,onClick:save},t('บันทึกลายเซ็น','Save signature')),message&&h('p',{role:'status'},message),error&&h('p',{role:'alert'},error));
 };
}
