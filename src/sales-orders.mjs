import {itemPartNumber} from './item-part-number.mjs';
import {loadSharedQuotationTemplate,demoSharedQuotationTemplate} from './quotation-template-save.mjs';
import {loadProfileSignature} from './profile-signature.mjs';
import {downloadQuotationAsset} from './quotation-assets.mjs';
import {downloadSalesOrderExcel} from './sales-order-excel.mjs';
import {shortSalesName} from './sales-name.mjs';
import {printSalesOrder,printCostSheet} from './sales-order-print.mjs';
import {createRecordPopup} from './record-popup.mjs';
export const SO_STATUS={confirmed:['เปิด SO','Confirmed'],delivered:['ส่งมอบแล้ว','Delivered'],completed:['ปิดงาน','Completed'],cancelled:['ยกเลิก','Cancelled']};
export function canConvertQuotation(q){return q?.approval_status!=='rejected'&&['draft','approved','sent','accepted'].includes(q?.status);}
export function validatePO(value){
 if(!String(value.po_number||'').trim())throw Error('PO_REQUIRED');
 if(!value.po_date||value.po_date>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))throw Error('PO_DATE');
 if(value.expected_delivery_date&&value.expected_delivery_date<value.po_date)throw Error('DELIVERY_DATE');
 if(!value.po_file_key)throw Error('PO_FILE');
 return value;
}
export function createSalesOrders({React,client,useApp,useAccess,records}){
 const h=React.createElement,Popup=createRecordPopup(React),unwrap=async p=>{const {data,error}=await p;if(error)throw error;return data;};
 return function SalesOrders({lang,quotation,onClose,onQuotation}){
  const {demoMode,profile}=useApp(),access=useAccess(),t=(th,en)=>lang==='th'?th:en;
  const canFinancial=demoMode||(access.can('quotations','view')&&(access.can('quotations','approve')||['sales_user','sales_coordinator','sales_manager','sales_director'].includes(profile?.role==='custom'?profile.custom_role_key:profile?.role)));
  const can=action=>demoMode||access.can('quotations',action),statusLabel=s=>SO_STATUS[s]?.[lang==='th'?0:1]||s;
  const [rows,Rows]=React.useState([]),[selected,Selected]=React.useState(null),[events,Events]=React.useState([]),[busy,Busy]=React.useState(false),[loading,Loading]=React.useState(true),[error,ErrorText]=React.useState(''),[page,Page]=React.useState(0),[filter,Filter]=React.useState(''),[create,Create]=React.useState(false),[action,Action]=React.useState(''),[reason,Reason]=React.useState(''),[serials,Serials]=React.useState({});
  const [approval,Approval]=React.useState(null),[approvalRows,ApprovalRows]=React.useState({});
  const [po,PO]=React.useState({po_number:'',po_date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),expected_delivery_date:'',delivery_details:{ship_to_name:quotation?.customer_name||'',bill_to_name:quotation?.customer_name||'',billing_location:quotation?.counterparty_address||'',recipient_name:quotation?.contact_name||''},note:'',po_file_key:'',po_file_name:''});
  const lock=React.useRef(false),fileKey=React.useRef(''),committed=React.useRef(false),requestRevision=React.useRef(0);
  const money=(value,currency='THB')=>new Intl.NumberFormat(lang==='th'?'th-TH':'en-US',{style:'currency',currency}).format(Number(value||0));
  const date=value=>value?new Intl.DateTimeFormat(lang==='th'?'th-TH':'en-GB',{timeZone:'Asia/Bangkok',dateStyle:'medium'}).format(new Date(value)):'—';
  const errors={PO_REQUIRED:t('กรุณาระบุเลขที่ PO ลูกค้า','Enter the customer PO number'),PO_DATE:t('วันที่ PO ต้องไม่เป็นวันในอนาคต','PO date cannot be in the future'),DELIVERY_DATE:t('วันส่งมอบต้องไม่ก่อนวันที่ PO','Delivery date cannot precede PO date'),PO_FILE:t('กรุณาแนบ PO เป็น PDF, JPG หรือ PNG ไม่เกิน 20 MB','Attach a PO: PDF, JPG or PNG, up to 20 MB')};
  const serverMessages={'Sales order creation permission required':'ไม่มีสิทธิ์สร้างใบสั่งขาย','Sales order action permission required':'ไม่มีสิทธิ์ดำเนินการกับใบสั่งขาย','Quotation must be approved before opening a sales order':'ใบเสนอราคาต้องผ่านอนุมัติก่อนเปิด SO','Upload the customer PO file first':'กรุณาอัปโหลดไฟล์ PO ก่อน','Sales order changed; reload before continuing':'SO มีการแก้ไขแล้ว กรุณาโหลดใหม่ก่อนดำเนินการ','Invalid sales order transition':'ไม่สามารถเปลี่ยนเป็นสถานะนี้ได้','Active salesperson with email required':'กรุณากำหนดพนักงานขายที่ใช้งานอยู่และมีอีเมล','Delivery reference or cancellation reason required':'กรุณาระบุหลักฐานส่งมอบหรือเหตุผลยกเลิก','Valid customer PO number and date required':'กรุณาระบุเลขที่และวันที่ PO ให้ถูกต้อง'};
  const describe=e=>(lang==='th'&&serverMessages[e.message])||errors[e.message]||(lang==='th'?t('ดำเนินการไม่สำเร็จ: ','Action failed: '):'')+(e.message||String(e));
  async function run(fn){if(lock.current)return;lock.current=true;Busy(true);ErrorText('');try{await fn();}catch(e){ErrorText(describe(e));}finally{lock.current=false;Busy(false);}}
  const button=(label,fn,extra={})=>h('button',{type:'button',disabled:busy,onClick:fn,...extra},label);
  const field=(label,key,type='text',required=false)=>h('label',{className:'crm-field'},h('span',null,label),h('input',{type,required,disabled:busy,maxLength:key==='po_number'?200:undefined,value:po[key]||'',onChange:e=>PO(v=>({...v,[key]:e.target.value}))}));
  async function readList(){
   const revision=++requestRevision.current;Loading(true);
   try{
    let list;if(demoMode)list=(records.native_sales_orders||[]).filter(s=>!filter||s.status===filter).sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(page*50,page*50+50);
    else {let q=client.from('crm_sales_orders').select('id,code,quotation_id,quotation_code,customer_name,po_number,status,total,currency,created_at,expected_delivery_date').order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*50,page*50+49);if(filter)q=q.eq('status',filter);list=await unwrap(q);}
    if(revision===requestRevision.current){Rows(list);if(demoMode){ApprovalRows(Object.fromEntries(list.map(v=>[v.id,v.so_approval||null])));}else if(list.length){const ids=list.map(v=>v.id);const approvals=await unwrap(client.from('crm_so_approvals').select('sales_order_id,status,requested_at,reviewed_at,review_note').in('sales_order_id',ids));if(revision===requestRevision.current)ApprovalRows(Object.fromEntries(approvals.map(v=>[v.sales_order_id,v])));}else ApprovalRows({});}
   }catch(e){if(revision===requestRevision.current)ErrorText(describe(e));}finally{if(revision===requestRevision.current)Loading(false);}
  }
  async function openOrder(id){
   const row=demoMode?(records.native_sales_orders||[]).find(s=>s.id===id):await unwrap(client.from('crm_sales_orders').select('*').eq('id',id).single());
   if(!row)throw Error(t('ไม่พบ SO หรือไม่มีสิทธิ์','Sales order not found or access denied'));
   Selected(row);Create(false);Action('');
   Approval(demoMode?row.so_approval||null:await unwrap(client.from('crm_so_approvals').select('*').eq('sales_order_id',id).maybeSingle()));
   Events(demoMode?(records.sales_order_events||[]).filter(e=>e.sales_order_id===id):await unwrap(client.from('crm_sales_order_events').select('id,action,note,created_at').eq('sales_order_id',id).order('created_at',{ascending:false})));
  }
  React.useEffect(()=>{if(!can('view')){Loading(false);return;}readList();return()=>{requestRevision.current++;};},[page,filter,demoMode]);
  React.useEffect(()=>{if(!quotation||!can('view'))return;run(async()=>{
   const existing=demoMode?(records.native_sales_orders||[]).find(s=>s.quotation_id===quotation.id):await unwrap(client.from('crm_sales_orders').select('id').eq('quotation_id',quotation.id).maybeSingle());
   if(existing)await openOrder(existing.id);else Create(true);
  });},[quotation?.id]);
  React.useEffect(()=>()=>{if(fileKey.current&&!committed.current&&!demoMode)client.storage.from('crm-sales-orders').remove([fileKey.current]).catch(()=>{});},[]);
  async function upload(file){await run(async()=>{
   if(!file||!['application/pdf','image/png','image/jpeg'].includes(file.type)||file.size>20*1024*1024||file.size===0)throw Error('PO_FILE');
   const key=profile.id+'/'+crypto.randomUUID()+'/'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
   if(!demoMode)await unwrap(client.storage.from('crm-sales-orders').upload(key,file,{contentType:file.type,upsert:false}));
   const previous=fileKey.current;fileKey.current=key;PO(v=>({...v,po_file_key:key,po_file_name:file.name}));
   if(previous&&!demoMode)await client.storage.from('crm-sales-orders').remove([previous]);
  });}
  async function confirm(event){event.preventDefault();await run(async()=>{
   if(!can('create')||!canConvertQuotation(quotation))throw Error(t('ต้องมีสิทธิ์สร้างและใบเสนอราคาอยู่ในสถานะที่แปลงได้','Creation permission and eligible quotation required'));
   validatePO(po);let row;
   if(demoMode){
    records.native_sales_orders||=[];row=records.native_sales_orders.find(s=>s.quotation_id===quotation.id);
    if(!row){const now=new Date().toISOString();row={...po,id:crypto.randomUUID(),code:'SO-DEMO-'+String(records.native_sales_orders.length+1).padStart(6,'0'),quotation_id:quotation.id,quotation_code:quotation.code,customer_id:quotation.customer_id,customer_name:quotation.customer_name,owner_id:quotation.owner_id,owner_name:quotation.owner_name,billing_address:quotation.counterparty_address,tax_id:quotation.counterparty_tax_id,quotation_kind:quotation.quotation_kind,recurring:quotation.recurring,items:structuredClone(quotation.items),payment_terms:quotation.payment_terms,cost_sheet:{quotation_note:quotation.note,payment_instructions:quotation.payment_instructions,line_financials:quotation.items.map(x=>({cost_total:x.cost==null?null:Number(x.qty)*Number(x.cost)*(x.cycle_count||1),gp:x.cost==null?null:Number(x.total)-Number(x.qty)*Number(x.cost)*(x.cycle_count||1),margin:x.cost==null?null:(Number(x.total)?(Number(x.total)-Number(x.qty)*Number(x.cost)*(x.cycle_count||1))/Number(x.total)*100:0)}))},subtotal:quotation.subtotal,discount:quotation.discount,vat:quotation.vat,total:quotation.total,net_total:quotation.net_total??quotation.total,currency:quotation.currency||'THB',status:'confirmed',created_at:now,updated_at:now};records.native_sales_orders.unshift(row);records.sales_orders.push({id:row.id,source_system:'KC CuTo CRM',source_so_id:row.id,so_number:row.code,customer_id:row.customer_id,customer_name:row.customer_name,net_amount:Number(row.subtotal)-Number(row.discount),currency:row.currency,status:'converted',converted_at:now});records.sales_order_events||=[];records.sales_order_events.push({id:crypto.randomUUID(),sales_order_id:row.id,action:'confirmed',note:po.po_number,created_at:now});}
   }else row=await unwrap(client.rpc('crm_create_sales_order_with_details',{p_quotation_id:quotation.id,p_po_number:po.po_number,p_po_date:po.po_date,p_file_key:po.po_file_key,p_file_name:po.po_file_name,p_delivery_date:po.expected_delivery_date||null,p_note:po.note,p_serials:serials,p_details:po.delivery_details}));
   committed.current=row.po_file_key===fileKey.current;
   if(demoMode&&!row.so_approval)row.so_approval={sales_order_id:row.id,status:'pending',requested_by:profile.id,requested_at:new Date().toISOString(),revision:1};
   await readList();await openOrder(row.id);
  });}
  async function costSheetContext(){
   const template=demoMode?(demoSharedQuotationTemplate.current||{}):await loadSharedQuotationTemplate(client);
   const currentApproval=demoMode?selected.so_approval:await unwrap(client.from('crm_so_approvals').select('*').eq('sales_order_id',selected.id).maybeSingle());
   let signature='';
   if(currentApproval?.status==='approved')signature=demoMode?(currentApproval.signature_url||''):(currentApproval.signature_storage_key?await downloadQuotationAsset(client,currentApproval.signature_storage_key):'');
   return {template,approval:currentApproval,signature};
  }
  async function changeApproval(kind){
   await run(async()=>{
    if(!selected||selected.status!=='confirmed')throw Error(t('SO นี้ไม่สามารถขออนุมัติได้','SO not eligible for approval'));
    let note='';
    if(kind==='reject'){
      note=window.prompt(t('ระบุเหตุผลที่ไม่อนุมัติ SO','Enter the SO rejection reason'))||'';
      if(note.trim().length<3)throw Error(t('กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร','Rejection reason must be at least 3 characters'));
    }
    if(demoMode){
      const a=selected.so_approval||{sales_order_id:selected.id,requested_by:profile.id,revision:0};
      const signature=kind==='approve'?await loadProfileSignature(client,profile.id,true):{};
      if(kind==='approve'&&!signature.seller_signature_url)throw Error(t('กรุณาบันทึกลายเซ็นใน Profile ก่อนอนุมัติ','Save your signature in Profile before approving'));
      selected.so_approval={...a,reviewer_name:kind==='approve'?([profile.first_name,profile.last_name].filter(Boolean).join(' ')||profile.display_name):null,reviewed_by:kind==='request'?null:profile.id,reviewed_at:kind==='request'?null:new Date().toISOString(),signature_url:signature.seller_signature_url||'',status:kind==='request'?'pending':kind==='approve'?'approved':'rejected',revision:kind==='request'?a.revision+1:a.revision,review_note:note};
    }else await unwrap(client.rpc('crm_so_approval_action',{p_sales_order_id:selected.id,p_action:kind,p_note:note}));
    await openOrder(selected.id);await readList();
   });
  }
  async function transition(event){event.preventDefault();await run(async()=>{
   let row;if(demoMode){row=records.native_sales_orders.find(s=>s.id===selected.id);Object.assign(row,{status:action,updated_at:new Date().toISOString(),...(action==='delivered'?{delivery_reference:reason}:action==='cancelled'?{cancellation_reason:reason}:{})});records.sales_order_events.push({id:crypto.randomUUID(),sales_order_id:row.id,action,note:reason,created_at:row.updated_at});if(action==='cancelled')Object.assign(records.sales_orders.find(s=>s.id===row.id),{status:'cancelled'});}
   else row=await unwrap(client.rpc('crm_transition_sales_order',{p_id:selected.id,p_status:action,p_note:reason,p_expected_updated_at:selected.updated_at}));
   await readList();await openOrder(row.id);Reason('');
  });}
  const itemTable=order=>h('div',{className:'crm-so-table'},h('table',{'aria-label':t('รายการสินค้า SO','SO items')},h('thead',null,h('tr',null,...[t('สินค้า / บริการ','Item'),'Part Number',t('จำนวน','Quantity'),t('ราคา','Price'),t('ยอดรายการ','Line total')].map(x=>h('th',{key:x},x)))),h('tbody',null,(order.items||[]).map((item,i)=>h('tr',{key:i},h('td',null,item.name),h('td',{'data-field':'part_number'},itemPartNumber(item)||'—'),h('td',null,item.qty+' '+(item.unit||'')),h('td',null,money(item.price,order.currency||'THB')),h('td',null,money(item.total,order.currency||'THB')))))));
  const form=create&&quotation&&h('form',{onSubmit:confirm,className:'crm-so-form'},h('h3',null,t('Convert Sales Order จาก ','Convert Sales Order from ')+quotation.code),h('p',null,quotation.customer_name+' · '+money(quotation.total,quotation.currency||'THB')),
   !canConvertQuotation(quotation)?h('p',{role:'status'},t('ใบเสนอราคานี้ยังแปลงไม่ได้ กรุณาตรวจสถานะเอกสาร','This quotation is not eligible for conversion. Check its status.')):!can('create')?h('p',null,t('ไม่มีสิทธิ์สร้าง SO','No permission to create a sales order')):h(React.Fragment,null,
   h('p',null,t('กด Convert Sales Order เพื่อเปิด SO และส่งขออนุมัติครั้งเดียว ไม่ต้องอนุมัติใบเสนอราคาก่อน ระบบบันทึกยอดขายและตัดสต็อกเมื่อเปิดคลังอัตโนมัติ โดยต้องอนุมัติ SO ก่อนส่งมอบ','Convert Sales Order creates the SO and submits one approval request. Prior quotation approval is not required. Sales and automatic stock are recorded on conversion; SO approval is required before delivery.')),
   itemTable(quotation),
   h('div',{className:'crm-so-grid'},field(t('เลขที่ PO ลูกค้า','Customer PO number'),'po_number','text',true),field(t('วันที่ PO','PO date'),'po_date','date',true),field(t('กำหนดส่งมอบ','Expected delivery date'),'expected_delivery_date','date'),
   h('label',{className:'crm-field'},h('span',null,t('แนบ PO (PDF / JPG / PNG ไม่เกิน 20 MB)','PO attachment (PDF / JPG / PNG, up to 20 MB)')),h('input',{type:'file',accept:'.pdf,.jpg,.jpeg,.png',disabled:busy,onChange:e=>upload(e.target.files?.[0])}),h('small',null,po.po_file_name))),
   h('fieldset',null,h('legend',null,t('ข้อมูลส่งของและวางบิล','Delivery and billing details')),h('div',{className:'crm-so-grid'},...[
    ['order_type','ประเภทงาน','Order type'],['ship_to_name','ส่งของให้','Ship to'],['shipping_address','สถานที่ส่งของ','Shipping address'],['bill_to_name','เปิดบิล / วางบิลให้','Bill to'],['billing_location','สถานที่วางบิล','Billing location'],['recipient_name','ชื่อคนรับสินค้า','Recipient name'],['recipient_phone','เบอร์ผู้รับสินค้า','Recipient phone']
   ].map(([key,th,en])=>h('label',{key,className:'crm-field'},h('span',null,t(th,en)),h(key.includes('address')||key==='billing_location'?'textarea':'input',{value:po.delivery_details[key]||'',maxLength:2000,disabled:busy,onChange:e=>PO(v=>({...v,delivery_details:{...v.delivery_details,[key]:e.target.value}}))}))),h('label',{className:'crm-field'},h('span',null,t('มีการติดตั้ง','Installation required')),h('select',{'aria-label':t('มีการติดตั้ง','Installation required'),value:po.delivery_details.installation||'',disabled:busy,onChange:e=>PO(v=>({...v,delivery_details:{...v.delivery_details,installation:e.target.value}}))},h('option',{value:''},t('ไม่ระบุ','Not specified')),h('option',{value:'yes'},t('มี','Yes')),h('option',{value:'no'},t('ไม่มี','No')))))),
   h('label',{className:'crm-field'},h('span',null,t('เงื่อนไขพิเศษ / หมายเหตุ SO','Special conditions / SO notes')),h('textarea',{value:po.note,maxLength:5000,disabled:busy,onChange:e=>PO(v=>({...v,note:e.target.value}))})),
   h('details',null,h('summary',null,t('ระบุ Serial สำหรับสินค้าที่ควบคุมรายเครื่อง','Serial numbers for individually tracked stock')),(quotation.items||[]).map((item,i)=>h('label',{key:i,className:'crm-field'},h('span',null,item.name+' × '+item.qty),h('input',{value:serials[i]||'',maxLength:200,disabled:busy,onChange:e=>Serials(v=>({...v,[i]:e.target.value}))}))),h('small',null,t('ใช้คลังตั้งต้น สินค้าที่ควบคุม Serial ต้องแยกเป็นรายการจำนวน 1 ต่อเครื่อง','Uses the default warehouse. Serial-tracked items require a separate quantity-one line per unit.'))),
   h('div',{className:'crm-actions'},h('button',{type:'submit',className:'crm-save',disabled:busy||!po.po_file_key},t('Convert Sales Order','Convert Sales Order')),button(t('กลับรายการ SO','Back to orders'),()=>Create(false)))));
  const detail=selected&&h('section',{'aria-label':t('รายละเอียด Sales Order','Sales Order details')},h('div',{className:'crm-actions'},button(t('กลับรายการ SO','Back to orders'),()=>{Selected(null);Action('');}),button(t('เปิดใบเสนอราคา','Open quotation'),()=>onQuotation(selected.quotation_id)),button(t('พิมพ์ SO / PDF','Print SO / PDF'),()=>run(()=>printSalesOrder(selected,lang))),can('export')&&button('Convert to Excel',()=>run(async()=>{if(!can('view')||!can('export'))throw Error(t('ไม่มีสิทธิ์ส่งออก','Export permission required'));const context=await costSheetContext();const financial=canFinancial?(demoMode?selected.cost_sheet:await unwrap(client.from('crm_sales_order_cost_sheets').select('*').eq('sales_order_id',selected.id).maybeSingle())):null;await downloadSalesOrderExcel(selected,context.approval,lang,{...context,financial,includeFinancial:canFinancial});})),canFinancial&&button(t('พิมพ์ Cost Sheet','Print Cost Sheet'),()=>run(()=>printCostSheet(selected,()=>demoMode?Promise.resolve(selected.cost_sheet):unwrap(client.from('crm_sales_order_cost_sheets').select('*').eq('sales_order_id',selected.id).maybeSingle()),lang,costSheetContext)))),h('h3',null,selected.code+' · '+statusLabel(selected.status)),
   h('div',{className:'crm-so-approval',role:'group','aria-label':t('อนุมัติ Sales Order','Sales Order approval')},
     h('strong',null,t('อนุมัติ SO: ','SO approval: ')+(approval?.status==='approved'?t('อนุมัติแล้ว','Approved'):approval?.status==='pending'?t('รออนุมัติ','Pending'):approval?.status==='rejected'?t('ไม่อนุมัติ','Rejected'):t('ยังไม่ส่งอนุมัติ','Not submitted'))),
     approval?.review_note&&h('small',null,approval.review_note),
     h('div',{className:'crm-actions'},
       selected.status==='confirmed'&&(!approval||approval.status==='rejected')&&(can('create')||can('approve'))&&button(t('ส่งขออนุมัติ SO','Request SO approval'),()=>changeApproval('request')),
       selected.status==='confirmed'&&approval?.status==='pending'&&can('approve')&&button(t('อนุมัติ SO','Approve SO'),()=>changeApproval('approve')),
       selected.status==='confirmed'&&approval?.status==='pending'&&can('approve')&&button(t('ไม่อนุมัติ','Reject SO'),()=>changeApproval('reject'))
     )
   ),
   h('dl',{className:'crm-so-grid'},...[[t('ลูกค้า','Customer'),selected.customer_name],[t('ใบเสนอราคา','Quotation'),selected.quotation_code],[t('PO ลูกค้า','Customer PO'),selected.po_number],[t('วันที่ PO','PO date'),date(selected.po_date)],[t('กำหนดส่งมอบ','Expected delivery'),date(selected.expected_delivery_date)],[t('ที่อยู่เรียกเก็บเงิน','Billing address'),selected.billing_address],[t('เลขผู้เสียภาษี','Tax ID'),selected.tax_id],[t('ผู้รับผิดชอบ','Salesperson'),shortSalesName(selected.owner_name)]].map(([label,value])=>h('div',{key:label},h('dt',null,label),h('dd',null,value||'—')))),
   button(t('เปิดไฟล์ PO','Open PO attachment'),()=>run(async()=>{if(demoMode){ErrorText(t('โหมดทดลอง ไม่มีไฟล์จริง','Demo mode: no real attachment'));return;}const result=await unwrap(client.storage.from('crm-sales-orders').createSignedUrl(selected.po_file_key,120));const a=document.createElement('a');a.href=result.signedUrl;a.target='_blank';a.rel='noopener';a.click();})),
   itemTable(selected),
   h('p',null,t('ยอดก่อน VAT: ','Net before VAT: ')+money(Number(selected.subtotal)-Number(selected.discount),selected.currency)+' · VAT: '+money(selected.vat,selected.currency)),h('strong',null,t('ยอดรวม: ','Total: ')+money(selected.total,selected.currency)),h('p',null,selected.note),
   selected.delivery_reference&&h('p',null,t('หลักฐานส่งมอบ: ','Delivery reference: ')+selected.delivery_reference),selected.cancellation_reason&&h('p',null,t('เหตุผลยกเลิก: ','Cancellation reason: ')+selected.cancellation_reason),
   !action&&h('div',{className:'crm-actions'},selected.status==='confirmed'&&approval?.status==='approved'&&can('edit')&&button(t('บันทึกส่งมอบครบแล้ว','Record full delivery'),()=>{Action('delivered');Reason('');}),selected.status==='delivered'&&can('edit')&&button(t('ปิดงาน','Complete order'),()=>{Action('completed');Reason('');}),selected.status==='confirmed'&&can('approve')&&button(t('ยกเลิก SO','Cancel SO'),()=>{Action('cancelled');Reason('');})),
   action&&h('form',{onSubmit:transition},h('p',null,action==='cancelled'?t('ยืนยันยกเลิก SO ยอดขายจะถูกนำออก และคืนสต็อกที่เคยตัดอัตโนมัติ','Confirm cancellation: removes this sale and reverses any automatic stock issue'):action==='delivered'?t('ยืนยันว่ารายการทั้งหมดส่งมอบครบแล้ว','Confirm that every item has been delivered in full'):t('ยืนยันปิดงานหลังส่งมอบ','Confirm completion after delivery')),
   h('label',{className:'crm-field'},h('span',null,action==='cancelled'?t('เหตุผลยกเลิก','Cancellation reason'):action==='delivered'?t('เลขอ้างอิง / หลักฐานส่งมอบ','Delivery reference / evidence'):t('หมายเหตุปิดงาน','Completion note')),h('textarea',{value:reason,onChange:e=>Reason(e.target.value),required:action!=='completed',minLength:action!=='completed'?3:undefined,maxLength:2000,disabled:busy})),h('div',{className:'crm-actions'},h('button',{type:'submit',disabled:busy},t('ยืนยัน','Confirm')),button(t('ย้อนกลับ','Back'),()=>Action('')))),
   h('h4',null,t('ประวัติการดำเนินการ','Activity history')),h('ol',null,events.map(e=>h('li',{key:e.id},date(e.created_at)+' · '+statusLabel(e.action)+(e.note?' · '+e.note:'')))));
  return h(Popup,{lang,title:t('ใบสั่งขาย (Sales Orders)','Sales Orders'),busy,error,onClose},h('style',null,styles),h('div',{className:'crm-so'},!can('view')?h('p',{role:'alert'},t('ไม่มีสิทธิ์เข้าถึง','Access denied')):h(React.Fragment,null,
   form||detail||h(React.Fragment,null,h('p',null,t('สร้าง SO จากใบเสนอราคาที่ผ่านอนุมัติ รายการใหม่อยู่ด้านบน','Create an SO from an approved quotation. Newest orders appear first.')),h('div',{className:'crm-actions'},h('label',null,t('สถานะ ','Status '),h('select',{value:filter,onChange:e=>{Filter(e.target.value);Page(0);}},h('option',{value:''},t('ทั้งหมด','All')),...Object.keys(SO_STATUS).map(s=>h('option',{key:s,value:s},statusLabel(s))))),button(t('โหลดใหม่','Refresh'),readList)),
   loading?h('p',{role:'status'},t('กำลังโหลด…','Loading…')):h('div',{className:'crm-so-cards'},rows.map(row=>h('article',{key:row.id},h('div',null,h('strong',null,row.code),h('span',{'data-status':row.status},statusLabel(row.status))),h('p',null,row.customer_name),h('small',null,'PO: '+row.po_number+' · '+date(row.created_at)),h('p',null,money(row.total,row.currency)),h('small',null,t('อนุมัติ SO: ','SO approval: ')+(approvalRows[row.id]?.status||t('ยังไม่ส่งอนุมัติ','Not submitted'))),button(t('เปิด SO','Open SO'),()=>run(()=>openOrder(row.id)))))),!loading&&!rows.length&&h('p',null,t('ยังไม่มี SO ในมุมมองนี้','No orders in this view')),
   h('div',{className:'crm-actions'},button(t('ก่อนหน้า','Previous'),()=>Page(v=>v-1),{disabled:busy||page===0}),h('span',null,page+1),button(t('ถัดไป','Next'),()=>Page(v=>v+1),{disabled:busy||rows.length<50}))))));
 };
}
const styles=`.crm-so-approval{margin:15px 0;padding:14px;border:1px solid #d6b658;background:#fff9e7;border-radius:12px}.crm-so-approval small{display:block;margin-top:6px;color:#64748b}.crm-so{min-width:0}.crm-so-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.crm-so dt{font-size:12px;color:#64748b}.crm-so dd{margin:3px 0;overflow-wrap:anywhere}.crm-so input,.crm-so textarea,.crm-so select{max-width:100%;box-sizing:border-box}.crm-so input[type=file]{width:100%}.crm-so-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.crm-so-cards article{padding:14px;border:1px solid #dbe3ec;border-radius:12px}.crm-so-cards article>div{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.crm-so [data-status]{font-size:12px;border-radius:20px;padding:3px 8px;background:#e0f2fe;color:#075985}.crm-so [data-status=cancelled]{background:#fee2e2;color:#991b1b}.crm-so [data-status=completed]{background:#dcfce7;color:#166534}.crm-so-table{overflow:auto;margin:16px 0}.crm-so table{width:100%;border-collapse:collapse}.crm-so th,.crm-so td{padding:9px;text-align:start;border-bottom:1px solid #e2e8f0}.crm-so .crm-actions{flex-wrap:wrap;margin:14px 0}.crm-so p,.crm-so li{overflow-wrap:anywhere}.crm-so button{min-height:40px}.crm-so-form details{margin:15px 0}@media(max-width:640px){.crm-so-grid,.crm-so-cards{grid-template-columns:1fr}.crm-so .crm-actions button{flex:1 1 auto}.crm-so table{font-size:12px}}`;
