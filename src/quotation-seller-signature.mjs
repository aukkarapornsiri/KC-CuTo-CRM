export const demoSignatureDefaults=new Map();
const demoDefaults=demoSignatureDefaults;
export function signatureFields(value={}){return {seller_signature_storage_key:value.seller_signature_storage_key||'',seller_signature_url:value.seller_signature_url||'',seller_signature_owner_id:value.seller_signature_owner_id||''};}
export function applySellerSignature(record,value){return {...record,template_snapshot:{...(record.template_snapshot||{}),...signatureFields(value)}};}
export function createSellerSignatureHook({React,client}){
 const h=React.createElement;
 return function useSellerSignature({editing,setEditing,profile,demoMode,ready,lang,busy}){
  const tr=(a,b)=>lang==='th'?a:b,owner=profile?.id,own=!!owner&&editing?.owner_id===owner;
  const [working,Working]=React.useState(false),[message,Message]=React.useState(''),[error,ErrorText]=React.useState('');
  const generation=React.useRef(0),lock=React.useRef(false),current=React.useRef(editing);current.current=editing;
  const retained=React.useRef({});
  const context=String(editing?.id||'new')+':'+String(editing?.owner_id||'');
  React.useEffect(()=>{const token=++generation.current;retained.current={};Message('');ErrorText('');if(!ready||!editing)return;Working(true);
   (async()=>{try{
    if(editing.id)return; // Existing documents always retain their saved signature.
    let value={};
    if(own){if(demoMode)value=demoDefaults.get(owner)||{};else{const {data,error}=await client.from('crm_sales_signature_defaults').select('storage_key').eq('user_id',owner).maybeSingle();if(error)throw error;value={seller_signature_storage_key:data?.storage_key||'',seller_signature_owner_id:owner};}}
    if(token===generation.current)setEditing(old=>old&&!old.id?applySellerSignature(old,value):old);
   }catch(e){if(token===generation.current)ErrorText(e.message||String(e));}finally{if(token===generation.current)Working(false);}})();
   return()=>{generation.current++;};
  },[ready,context,owner,demoMode]);
  async function run(task){if(lock.current)return;lock.current=true;Working(true);Message('');ErrorText('');const token=generation.current;try{await task(token);}catch(e){if(token===generation.current)ErrorText(e.message||String(e));}finally{lock.current=false;if(token===generation.current)Working(false);}}
  const included=!!(editing?.template_snapshot?.seller_signature_storage_key||editing?.template_snapshot?.seller_signature_url);
  const toggleSignature=event=>{const checked=event.target.checked;if(!own||busy||working||!ready)return;if(!checked){retained.current=signatureFields(current.current?.template_snapshot);setEditing(old=>applySellerSignature(old,{seller_signature_owner_id:owner}));return;}run(async token=>{let value=retained.current;if(!value.seller_signature_storage_key&&!value.seller_signature_url){if(demoMode)value=demoDefaults.get(owner)||{};else{const {data,error}=await client.from('crm_sales_signature_defaults').select('storage_key').eq('user_id',owner).maybeSingle();if(error)throw error;value={seller_signature_storage_key:data?.storage_key||'',seller_signature_owner_id:owner};}}if(!value.seller_signature_storage_key&&!value.seller_signature_url)throw Error(tr('กรุณาอัปโหลดและบันทึกลายเซ็นที่หน้าโปรไฟล์ของฉันก่อน','Upload and save your signature in My Profile first'));if(token===generation.current)setEditing(old=>applySellerSignature(old,value));});};
  const disabled=busy||working||!ready;
  const control=h('section',{className:'kc-quote-personal-signature',style:{padding:'16px',border:'1px solid #dbe4e8',borderRadius:12,margin:'16px 0'}},h('h3',null,tr('ลายเซ็นของฉัน','My signature')),h('p',null,tr('ใช้ลายเซ็นจากโปรไฟล์ของฉัน ติ๊กเพื่อแสดงลายเซ็นในใบเสนอราคานี้','Use the signature saved in My Profile. Check to include it in this quotation')),
   own?h('div',null,h('label',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:12}},h('input',{type:'checkbox',checked:included,disabled,onChange:toggleSignature,'aria-label':tr('ใส่ลายเซ็นของฉันในใบเสนอราคานี้','Include my signature in this quotation'),style:{width:16,height:16,minHeight:16,margin:0,padding:0,flex:'0 0 16px'}}),tr('ใส่ลายเซ็นของฉันในใบเสนอราคานี้','Include my signature in this quotation'))):h('p',null,tr('เลือกรายชื่อคุณในช่องพนักงานขายเพื่อจัดการลายเซ็นของคุณ','Select yourself as salesperson to manage your signature')),
   working&&h('p',{role:'status'},tr('กำลังโหลด / บันทึกลายเซ็น…','Loading / saving signature…')),message&&h('p',{role:'status'},message),error&&h('p',{role:'alert'},error));
  return {control,working};
 };
}
