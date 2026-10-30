import {createRecordPopup} from './record-popup.mjs';
import {assignmentTarget} from './assignment-links.mjs';
import {loadProfileSignature} from './profile-signature.mjs';
export function canReviewQuotation(request,profileId,canApprove){return !!(canApprove&&request?.status==='pending'&&request.approver_ids?.[request.current_step-1]===profileId&&request.submitted_by!==profileId&&request.snapshot?.owner_id!==profileId);}
export const approvalCategory=module=>module==='quotations'?'quotation':['sales_orders','crm_sales_orders'].includes(module)?'so':['tickets','service'].includes(module)?'service':module==='leads'?'lead':'other';
export function createApprovalCenter({React,client,useApp,useAccess,records}){
 const h=React.createElement,Popup=createRecordPopup(React),unwrap=async q=>{const {data,error}=await q;if(error)throw error;return data;};
 async function readAll(query){const rows=[];for(let offset=0;offset<20000;offset+=500){const batch=await unwrap(query().range(offset,offset+499));rows.push(...batch);if(batch.length<500)return rows;}throw Error('Too many approval records. Please contact your administrator.');}
 return function ApprovalCenter({lang='th',onSource,initialRecordId,initialKind}){
  const {profile,demoMode,navigate,refreshNotifications}=useApp(),access=useAccess(),t=(th,en)=>lang==='th'?th:en;
  const [rows,Rows]=React.useState([]),[tab,Tab]=React.useState('pending'),[category,Category]=React.useState('all'),[search,Search]=React.useState(''),[selected,Selected]=React.useState(null),[comment,Comment]=React.useState(''),[busy,Busy]=React.useState(false),[loading,Loading]=React.useState(true),[error,ErrorText]=React.useState(''),[message,Message]=React.useState('');
  const generation=React.useRef(0),lock=React.useRef(false);
  const can=action=>access.can('quotations',action),labels={quotation:t('ใบเสนอราคา','Quotation'),so:t('เปิด SO','Open SO'),service:t('งานบริการ','Service'),lead:t('ลีด','Lead'),other:t('งานอื่น','Other work')};
  const money=r=>new Intl.NumberFormat(lang==='th'?'th-TH':'en-US',{style:'currency',currency:r.currency||'THB'}).format(Number(r.total||0));
  async function load(){
   const token=++generation.current;Loading(true);ErrorText('');
   try{
    if(!profile?.id)return;
    const list=[];
    if(can('view')){
     const [requests,soRequests]=demoMode?[records.approval_requests||[],(records.native_sales_orders||[]).filter(x=>x.so_approval).map(x=>({...x.so_approval,sales_order_id:x.id}))]:await Promise.all([
      readAll(()=>{let q=client.from('crm_approval_requests').select('*').order('created_at',{ascending:false}).order('id');return tab==='pending'?q.eq('status','pending').contains('approver_ids',[profile.id]):tab==='sent'?q.eq('submitted_by',profile.id):q.neq('status','pending');}),
      readAll(()=>{let q=client.from('crm_so_approvals').select('*').order('requested_at',{ascending:false}).order('sales_order_id');return tab==='pending'?q.eq('status','pending'):tab==='sent'?q.eq('requested_by',profile.id):q.neq('status','pending');})]);
     const relevant=requests.filter(r=>tab==='pending'?canReviewQuotation(r,profile.id,can('approve')):tab==='sent'?r.submitted_by===profile.id:r.status!=='pending'&&(r.submitted_by===profile.id||r.approver_ids?.includes(profile.id)));
     for(const a of relevant)list.push({kind:'quotation',key:'q:'+a.id,id:a.quotation_id,request:a,...a.snapshot,created_at:a.created_at,status:a.status});
     const visibleSO=soRequests.filter(a=>tab==='pending'?a.status==='pending'&&can('approve'):tab==='sent'?a.requested_by===profile.id:a.status!=='pending'&&(a.requested_by===profile.id||a.reviewed_by===profile.id));
     if(visibleSO.length){const orders=demoMode?records.native_sales_orders||[]:await unwrap(client.from('crm_sales_orders').select('*').in('id',visibleSO.map(a=>a.sales_order_id)));for(const a of visibleSO){const s=orders.find(s=>s.id===a.sales_order_id);if(s)list.push({...s,kind:'so',key:'so:'+s.id,request:a,status:a.status,orderStatus:s.status,created_at:a.requested_at});}}
    }
    // Other workflows keep their own permissions and decision handlers at the source.
    if(!demoMode&&tab!=='sent'){
     const notices=await readAll(()=>client.from('notifications').select('*').eq('user_id',profile.id).order('created_at',{ascending:false}).order('id'));
     for(const n of notices){const target=assignmentTarget(n.related_module,n.related_id);if(!target||['quotations','sales_orders','crm_sales_orders'].includes(n.related_module)||!access.can(target.module,'view')||!(/approv/i.test(n.event_kind||'')||/อนุมัติ|approval/i.test(n.title||''))||((tab==='pending')===!!n.resolved_at))continue;list.push({kind:approvalCategory(n.related_module),key:'n:'+n.id,id:n.related_id,title:n.title,summary:n.body,target,status:n.resolved_at?'completed':'pending',created_at:n.created_at});}
    }
    if(token===generation.current)Rows(list.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))));
   }catch(e){if(token===generation.current)ErrorText(e.message||String(e));}finally{if(token===generation.current)Loading(false);}
  }
  React.useEffect(()=>{void load();return()=>{generation.current++;};},[profile?.id,demoMode,tab,access.loading]);
  React.useEffect(()=>{
   if(!initialRecordId||!profile?.id||access.loading)return;
   let active=true;
   (async()=>{try{
    if(!can('view')||!can('approve'))throw Error(t('ไม่มีสิทธิ์เข้าถึงงานอนุมัติ','Approval access denied'));
    let selectedTask;
    if(initialKind!=='so'){
     const requests=demoMode?(records.approval_requests||[]).filter(a=>a.quotation_id===initialRecordId):await unwrap(client.from('crm_approval_requests').select('*').eq('quotation_id',initialRecordId).order('created_at',{ascending:false}).limit(1));
     const a=requests[0];if(a)selectedTask={...a.snapshot,kind:'quotation',key:'q:'+a.id,id:a.quotation_id,request:a,created_at:a.created_at,status:a.status};
    }
    // Legacy SO emails link to their source quotation. Resolve the existing SO.
    if(!selectedTask||initialKind==='so'||!canReviewQuotation(selectedTask.request,profile.id,true)){
     const order=demoMode?(records.native_sales_orders||[]).find(s=>initialKind==='so'?s.id===initialRecordId:s.quotation_id===initialRecordId):await unwrap(client.from('crm_sales_orders').select('*').eq(initialKind==='so'?'id':'quotation_id',initialRecordId).maybeSingle());
     if(order){const a=demoMode?order.so_approval:await unwrap(client.from('crm_so_approvals').select('*').eq('sales_order_id',order.id).maybeSingle());if(a&&(!selectedTask||a.status==='pending'))selectedTask={...order,kind:'so',key:'so:'+order.id,request:a,status:a.status,orderStatus:order.status,created_at:a.requested_at};}
    }
    if(!active)return;
    if(selectedTask){Selected(selectedTask);Comment('');}
    else ErrorText(t('ไม่พบคำขออนุมัติของรายการนี้ หรือไม่มีสิทธิ์เข้าถึง','Approval request not found or access denied'));
   }catch(e){if(active)ErrorText(e.message||String(e));}})();
   return()=>{active=false;};
  },[initialRecordId,initialKind,profile?.id,access.loading,demoMode]);
  async function decide(action){
   if(lock.current||!selected)return;
   if(action==='reject'&&!comment.trim()){ErrorText(t('กรุณาระบุเหตุผลที่ไม่อนุมัติ','Enter a rejection reason'));return;}
   lock.current=true;Busy(true);ErrorText('');
   try{
    if(!can('approve')||selected.status!=='pending'||(selected.kind==='quotation'&&!canReviewQuotation(selected.request,profile.id,true)))throw Error(t('ไม่มีสิทธิ์อนุมัติขั้นตอนนี้','You cannot review this step'));
    if(demoMode)throw Error(t('การอนุมัติต้องใช้บัญชีจริง','Approval requires a signed-in account'));
    if(action==='approve'){const signature=await loadProfileSignature(client,profile.id,false);if(!signature.seller_signature_storage_key)throw Error(t('กรุณาบันทึกลายเซ็นใน Profile ก่อนอนุมัติ','Save your signature in Profile before approving'));}
    await unwrap(selected.kind==='quotation'?client.rpc('crm_quotation_transition',{p_quotation:selected.id,p_action:action,p_comment:comment}):client.rpc('crm_so_approval_action',{p_sales_order_id:selected.id,p_action:action,p_note:comment}));
    Selected(null);Comment('');Message(t('บันทึกผลการอนุมัติแล้ว','Decision saved'));window.dispatchEvent(new Event('crm-records-refresh'));void load();void refreshNotifications?.();
   }catch(e){ErrorText(e.message||String(e));}finally{lock.current=false;Busy(false);}
  }
  const open=r=>{Selected(r);Comment('');ErrorText('');Message('');};
  const source=r=>{Selected(null);onSource?.();if(r.target)navigate(r.target.module,r.target.page,r.target.params);else navigate('quotations','quot-list',{recordId:r.kind==='so'?r.quotation_id:r.id});};
  const title=r=>r.title||r.subject||r.name||(r.kind==='so'?t('เปิดคำสั่งขาย ','Open sales order '):'')+(r.items?.[0]?.name||r.code||labels[r.kind]);
  const statusLabel=s=>({pending:t('รออนุมัติ','Pending'),approved:t('อนุมัติแล้ว','Approved'),rejected:t('ไม่อนุมัติ','Rejected'),cancelled:t('ถอนคำขอแล้ว','Withdrawn'),completed:t('ดำเนินการแล้ว','Completed')}[s]||s);
  const visible=rows.filter(r=>(category==='all'||(category==='other'?!['quotation','so'].includes(r.kind):r.kind===category))&&[title(r),r.code,r.customer_name,r.summary].join(' ').toLowerCase().includes(search.toLowerCase()));
  const actionable=selected?.status==='pending'&&can('approve')&&(selected.kind==='quotation'?canReviewQuotation(selected.request,profile?.id,true):selected.kind==='so'&&selected.orderStatus==='confirmed');
  const button=(label,fn,props={})=>h('button',{type:'button',onClick:fn,disabled:busy,...props},label);
  return h('section',{className:'kc-approval-app','aria-label':t('ศูนย์อนุมัติ','Approval center')},
   h('header',{className:'kc-approval-top'},h('h1',null,t('ศูนย์อนุมัติ','Approval center')),button(t('โหลดใหม่','Refresh'),()=>void load(),{disabled:busy||loading})),
   message&&h('p',{role:'status'},message),!selected&&error&&h('p',{role:'alert'},error),
   h('nav',{className:'kc-approval-tabs','aria-label':t('มุมมองงานอนุมัติ','Approval views')},[['pending','รอฉัน','Awaiting me'],['sent','ส่งคำขอ','My requests'],['history','ประวัติ','History']].map(([v,th,en])=>button(t(th,en),()=>Tab(v),{key:v,'aria-pressed':tab===v}))),
   h('input',{type:'search',value:search,onChange:e=>Search(e.target.value),placeholder:t('ค้นหาเรื่อง เลขเอกสาร หรือลูกค้า…','Search subject, document or customer…'),'aria-label':t('ค้นหางานอนุมัติ','Search approvals')}),
   h('nav',{className:'kc-approval-filters','aria-label':t('ประเภทงาน','Work types')},[['all','ทั้งหมด','All'],['quotation','เสนอราคา','Quotation'],['so','เปิด SO','Open SO'],['other','อื่น ๆ','Other']].map(([v,th,en])=>button(t(th,en),()=>Category(v),{key:v,'data-kind':v,'aria-pressed':category===v}))),
   loading?h('p',{role:'status'},t('กำลังโหลดงานอนุมัติ…','Loading approvals…')):h('div',{className:'kc-approval-cards'},visible.map(r=>button(h(React.Fragment,null,h('small',null,labels[r.kind]+' · '+(r.code||statusLabel(r.status))),h('strong',null,title(r)),h('span',null,r.customer_name||r.summary),r.total!=null&&h('b',null,money(r)),h('small',null,r.kind==='quotation'?t('ขั้นที่ ','Step ')+r.request.current_step+'/'+r.request.approver_ids.length+' · '+statusLabel(r.status):statusLabel(r.status)),h('span',{className:'kc-approval-link'},t('ดูรายละเอียด ›','View details ›'))),()=>open(r),{className:'kc-approval-card',key:r.key,'data-kind':r.kind}))),
   !loading&&!visible.length&&h('p',{className:'kc-approval-empty',role:'status'},t('ไม่มีงานในมุมมองนี้','No requests in this view')),
   selected&&h(Popup,{title:labels[selected.kind],lang,busy,error,onClose:()=>Selected(null)},h('div',{className:'kc-approval-detail','data-kind':selected.kind},
    h('section',{className:'kc-approval-panel'},h('small',null,(selected.code||'')+' · '+statusLabel(selected.status)),h('h2',null,title(selected)),h('p',null,selected.customer_name||selected.summary),h('small',null,selected.prepared_by||selected.owner_name||'')),
    selected.total!=null&&h('section',{className:'kc-approval-amount'},h('span',null,t('ยอดรวม VAT','Total including VAT')),h('strong',null,money(selected))),
    selected.kind==='quotation'&&h('section',{className:'kc-approval-policy'},h('strong',null,t('ลำดับอนุมัติตาม Policy ที่ส่งคำขอ','Approval sequence from submitted policy')),h('p',null,t('ขั้นที่ ','Step ')+selected.request.current_step+'/'+selected.request.approver_ids.length),h('p',null,selected.request.approver_ids.map((id,i)=>(i+1<selected.request.current_step?'✓ ':i+1===selected.request.current_step?'● ':'○ ')+(i+1)+(id===profile.id?t(' คุณ',' You'):'')).join(' → '))),
    selected.kind==='so'&&h('section',{className:'kc-approval-policy'},h('strong',null,t('ขออนุมัติเปิดใบสั่งขาย','Sales order approval')),h('p',null,selected.quotation_code),h('p',null,'PO: '+(selected.po_number||'—')),selected.po_file_key&&button(t('ดูไฟล์ PO ↗','View PO ↗'),async()=>{try{const data=await unwrap(client.storage.from('crm-sales-orders').createSignedUrl(selected.po_file_key,120));const a=document.createElement('a');a.href=data.signedUrl;a.target='_blank';a.rel='noopener';a.click();}catch(e){ErrorText(e.message);}})),
    h('section',{className:'kc-approval-panel'},h('strong',null,t('รายละเอียดเบื้องต้น','Essential details')),selected.items?.map((item,i)=>h('p',{key:i},(item.name||'')+' × '+(item.qty||item.quantity||1),item.part_number&&h('small',null,' · '+item.part_number))),selected.expected_delivery_date&&h('p',null,t('กำหนดส่ง ','Delivery ')+selected.expected_delivery_date),selected.note&&h('p',null,selected.note),button(t('ดูเอกสารต้นทาง ›','View source document ›'),()=>source(selected))),
    actionable&&h('label',{className:'kc-approval-panel'},t('ความเห็น (ต้องระบุเมื่อไม่อนุมัติ)','Comment (required for rejection)'),h('textarea',{value:comment,maxLength:2000,onChange:e=>Comment(e.target.value),rows:2,'aria-label':t('ความเห็นการอนุมัติ','Approval comment')})),
    actionable&&h('p',{className:'kc-approval-signature'},t('ใช้ลายเซ็นจากโปรไฟล์ของคุณ','Uses your Profile signature')),
    h('footer',{className:'kc-approval-bottom'},selected.total!=null&&h('strong',null,money(selected)),actionable?h('div',null,button(t('ไม่อนุมัติ','Reject'),()=>void decide('reject'),{className:'kc-approval-reject'}),button(t(selected.kind==='quotation'?'อนุมัติขั้นนี้':'อนุมัติเปิด SO',selected.kind==='quotation'?'Approve this step':'Approve SO'),()=>void decide('approve'),{className:'kc-approval-confirm'})):selected.target?button(t('เปิดงานเพื่อดำเนินการ','Open workflow'),()=>source(selected),{className:'kc-approval-confirm'}):h('span',null,statusLabel(selected.status))))));
 };
}

export function createApprovalLauncher(deps){
 const {React}=deps,h=React.createElement,Center=createApprovalCenter(deps),Popup=createRecordPopup(React);
 return function ApprovalLauncher({lang}){const [open,Open]=React.useState(false);return h(React.Fragment,null,h('button',{type:'button',className:'kc-header-approval','aria-label':lang==='th'?'งานอนุมัติ':'Approvals',onClick:()=>Open(true)},h('span',{'aria-hidden':true},'✓ '),lang==='th'?'งานอนุมัติ':'Approvals'),open&&h(Popup,{title:lang==='th'?'ศูนย์อนุมัติ':'Approval center',lang,onClose:()=>Open(false)},h(Center,{lang,onSource:()=>Open(false)})));};
}
