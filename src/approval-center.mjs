import {isCurrentApprover} from './approval-route.mjs';
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
  const can=action=>access.can('quotations',action),labels={quotation:t('ใบเสนอราคา','Quotation'),so:t('เปิด SO','Open SO'),amendment:t('ขอแก้ไข SO','SO amendment'),service:t('งานบริการ','Service'),lead:t('ลีด','Lead'),other:t('งานอื่น','Other work')};
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
     const visibleSO=soRequests.filter(a=>tab==='pending'?a.status==='pending'&&can('approve')&&isCurrentApprover(a,profile.id):tab==='sent'?a.requested_by===profile.id:a.status!=='pending'&&(a.requested_by===profile.id||a.reviewed_by===profile.id));
     if(visibleSO.length){const orders=demoMode?records.native_sales_orders||[]:await unwrap(client.from('crm_sales_orders').select('*').in('id',visibleSO.map(a=>a.sales_order_id)));for(const a of visibleSO){const s=orders.find(s=>s.id===a.sales_order_id);if(s)list.push({...s,kind:'so',key:'so:'+s.id,request:a,status:a.status,orderStatus:s.status,created_at:a.requested_at});}}
    }
    if(can('view')){
     const changes=demoMode?records.so_amendments||[]:await readAll(()=>{let q=client.from('crm_so_amendments').select('*').order('requested_at',{ascending:false}).order('id');return tab==='pending'?q.eq('status','pending'):tab==='sent'?q.eq('requested_by',profile.id):q.in('status',['approved','rejected','cancelled','applied']);});
     for(const a of changes){if(tab==='pending'&&(!can('approve')||a.requested_by===profile.id||!isCurrentApprover(a,profile.id)))continue;const s=a.after_snapshot||a.before_snapshot;list.push({...s,id:a.sales_order_id,kind:'amendment',key:'amendment:'+a.id,request:a,status:a.status,orderStatus:s.status,created_at:a.requested_at,summary:a.reason});}
    }
    // Other workflows keep their own permissions and decision handlers at the source.
    if(!demoMode&&tab!=='sent'){
     const notices=await readAll(()=>client.from('notifications').select('*').eq('user_id',profile.id).order('created_at',{ascending:false}).order('id'));
     for(const n of notices){const target=assignmentTarget(n.related_module,n.related_id);if(!target||['quotations','sales_orders','crm_sales_orders'].includes(n.related_module)||!access.can(target.module,'view')||!(/approv/i.test(n.event_kind||'')||/อนุมัติ|approval/i.test(n.title||''))||((tab==='pending')===!!n.resolved_at))continue;list.push({kind:approvalCategory(n.related_module),key:'n:'+n.id,id:n.related_id,title:n.title,summary:n.body,target,status:n.resolved_at?'completed':'pending',created_at:n.created_at});}
    }
    if(!demoMode&&list.length){
     const ids=[...new Set(list.map(r=>r.request?.requested_by||r.request?.submitted_by).filter(Boolean))];
     if(ids.length)try{const people=await unwrap(client.from('profiles').select('id,display_name,email').in('id',ids));for(const r of list){const person=people.find(p=>p.id===(r.request?.requested_by||r.request?.submitted_by));if(person)r.requester_name=person.display_name||person.email;}}catch{/* Request details remain available if profile visibility is restricted. */}
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
    if(initialKind==='amendment'){
     const a=demoMode?(records.so_amendments||[]).find(r=>r.id===initialRecordId):await unwrap(client.from('crm_so_amendments').select('*').eq('id',initialRecordId).maybeSingle());
     if(!a)throw Error(t('ไม่พบคำขอแก้ไข SO หรือไม่มีสิทธิ์','SO amendment request not found or access denied'));
     if(active){Selected({...a.before_snapshot,id:a.sales_order_id,kind:'amendment',key:'amendment:'+a.id,request:a,status:a.status,summary:a.reason,created_at:a.requested_at});Comment('');}return;
    }
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
    const amendments=demoMode?(records.so_amendments||[]):await unwrap(client.from('crm_so_amendments').select('*').eq(initialKind==='so'?'sales_order_id':'before_snapshot->>quotation_id',initialRecordId).eq('status','pending').order('requested_at',{ascending:false}).limit(1));
    const amendment=amendments.find(a=>a.requested_by!==profile.id);if(amendment)selectedTask={...amendment.before_snapshot,id:amendment.sales_order_id,kind:'amendment',key:'amendment:'+amendment.id,request:amendment,status:amendment.status,summary:amendment.reason,created_at:amendment.requested_at};
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
    if(action==='approve'&&selected.kind!=='amendment'){const signature=await loadProfileSignature(client,profile.id,false);if(!signature.seller_signature_storage_key)throw Error(t('กรุณาบันทึกลายเซ็นใน Profile ก่อนอนุมัติ','Save your signature in Profile before approving'));}
    await unwrap(selected.kind==='amendment'?client.rpc('crm_so_amendment_action',{p_sales_order_id:selected.id,p_action:action,p_note:comment,p_request_id:selected.request.id}):selected.kind==='quotation'?client.rpc('crm_quotation_transition',{p_quotation:selected.id,p_action:action,p_comment:comment}):client.rpc('crm_so_approval_action',{p_sales_order_id:selected.id,p_action:action,p_note:comment}));
    Selected(null);Comment('');Message(t('บันทึกผลการอนุมัติแล้ว','Decision saved'));window.dispatchEvent(new Event('crm-records-refresh'));void load();void refreshNotifications?.();
   }catch(e){ErrorText(e.message||String(e));}finally{lock.current=false;Busy(false);}
  }
  const open=r=>{Selected(r);Comment('');ErrorText('');Message('');};
  const source=r=>{Selected(null);onSource?.();if(r.kind==='amendment'){navigate('quotations','quot-list',{recordId:r.quotation_id});return;}if(r.target)navigate(r.target.module,r.target.page,r.target.params);else navigate('quotations','quot-list',{recordId:r.kind==='so'?r.quotation_id:r.id});};
  const title=r=>r.kind==='amendment'?t('ขอแก้ไขใบสั่งขาย','Request to amend sales order'):r.title||r.subject||r.name||(r.kind==='so'?t('เปิดคำสั่งขาย ','Open sales order '):'')+(r.items?.[0]?.name||r.code||labels[r.kind]);
  const statusLabel=s=>({pending:t('รออนุมัติ','Pending'),approved:t('อนุมัติแล้ว','Approved'),rejected:t('ไม่อนุมัติ','Rejected'),cancelled:t('ถอนคำขอแล้ว','Withdrawn'),completed:t('ดำเนินการแล้ว','Completed')}[s]||s);
  const visible=rows.filter(r=>(category==='all'||(category==='other'?!['quotation','so','amendment'].includes(r.kind):category==='so'?['so','amendment'].includes(r.kind):r.kind===category))&&[title(r),r.code,r.customer_name,r.summary].join(' ').toLowerCase().includes(search.toLowerCase()));
  const summary=r=>r.kind==='amendment'?r.request.reason:r.summary||r.note||(r.items||[]).slice(0,2).map(x=>(x.name||'')+' × '+(x.qty||x.quantity||1)).join(' · ')||t('เปิดดูรายละเอียดเพื่อพิจารณา','Open details to review');
  const requester=r=>r.request?.requested_by===profile?.id||r.request?.submitted_by===profile?.id?t('คุณ','You'):r.requester_name||((r.request?.requested_by===r.owner_id||r.request?.submitted_by===r.owner_id)?r.owner_name:'')||t('ผู้ใช้ในระบบ','CRM user');
  const requestedDate=r=>r.created_at&&Number.isFinite(Date.parse(r.created_at))?new Intl.DateTimeFormat(lang==='th'?'th-TH':'en-GB',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(r.created_at)):'—';
  const actionable=selected?.status==='pending'&&can('approve')&&isCurrentApprover(selected.request,profile?.id)&&(selected.kind==='quotation'?canReviewQuotation(selected.request,profile?.id,true):selected.kind==='amendment'?selected.request.requested_by!==profile?.id:selected.kind==='so'&&selected.orderStatus!=='cancelled');
  const button=(label,fn,props={})=>h('button',{type:'button',onClick:fn,disabled:busy,...props},label);
  return h('section',{className:'kc-approval-app','aria-label':t('ศูนย์อนุมัติ','Approval center')},
   h('header',{className:'kc-approval-top'},h('div',null,h('h1',null,t('ศูนย์อนุมัติ','Approval center')),h('p',null,t('งานที่ต้องตัดสินใจของคุณวันนี้','Your requests to review today'))),button(h('img',{src:'./assets/approval/refresh.svg',width:20,height:20,alt:''}),()=>void load(),{disabled:busy||loading,'aria-label':t('โหลดใหม่','Refresh'),className:'kc-approval-refresh'})),
   message&&h('p',{role:'status'},message),!selected&&error&&h('p',{role:'alert'},error),
   h('nav',{className:'kc-approval-tabs','aria-label':t('มุมมองงานอนุมัติ','Approval views')},[['pending','รอฉัน','Awaiting me'],['sent','ส่งคำขอ','My requests'],['history','ประวัติ','History']].map(([v,th,en])=>button(t(th,en),()=>Tab(v),{key:v,'aria-pressed':tab===v}))),
   h('div',{className:'kc-approval-search'},h('img',{src:'./assets/approval/search.svg',width:20,height:20,alt:''}),h('input',{type:'search',value:search,onChange:e=>Search(e.target.value),placeholder:t('ค้นหาเรื่อง เลขเอกสาร หรือลูกค้า…','Search subject, document or customer…'),'aria-label':t('ค้นหางานอนุมัติ','Search approvals')})),
   h('nav',{className:'kc-approval-filters','aria-label':t('ประเภทงาน','Work types')},[['all','ทั้งหมด','All'],['quotation','เสนอราคา','Quotation'],['so','SO','SO'],['other','อื่น ๆ','Other']].map(([v,th,en])=>button(t(th,en),()=>Category(v),{key:v,'data-kind':v,'aria-pressed':category===v}))),
   h('div',{className:'kc-approval-list-heading'},h('strong',null,tab==='pending'?t('รอคุณอนุมัติ','Awaiting your approval'):tab==='sent'?t('คำขอของคุณ','Your requests'):t('ประวัติการอนุมัติ','Approval history')),h('span',null,loading?'…':visible.length+t(' รายการ',' requests'))),
   loading?h('p',{role:'status'},t('กำลังโหลดงานอนุมัติ…','Loading approvals…')):h('div',{className:'kc-approval-cards'},visible.map(r=>button(h(React.Fragment,null,
    h('span',{className:'kc-approval-card-top'},h('span',{className:'kc-approval-badge'},labels[r.kind]),h('time',{dateTime:r.created_at},requestedDate(r))),
    h('strong',{className:'kc-approval-card-title'},title(r)),h('span',{className:'kc-approval-reference'},r.code||'—'),h('span',{className:'kc-approval-customer'},r.customer_name||''),
    h('span',{className:'kc-approval-summary'},summary(r)),h('span',{className:'kc-approval-card-meta'},h('span',null,t('ผู้ขอ · ','Requested by · ')+requester(r)),r.total!=null&&h('b',null,money(r))),
    h('small',{className:'kc-approval-state'},r.kind==='quotation'?t('ขั้นที่ ','Step ')+r.request.current_step+'/'+r.request.approver_ids.length+' · '+statusLabel(r.status):statusLabel(r.status)),
    h('span',{className:'kc-approval-link'},t('ตรวจสอบคำขอ →','Review request →'))),()=>open(r),{className:'kc-approval-card',key:r.key,'data-kind':r.kind}))),
   !loading&&!visible.length&&h('p',{className:'kc-approval-empty',role:'status'},t('ไม่มีงานในมุมมองนี้','No requests in this view')),
   selected&&h(Popup,{title:labels[selected.kind],lang,busy,error,onClose:()=>Selected(null)},h('div',{className:'kc-approval-detail','data-kind':selected.kind},h('div',{className:'kc-approval-review-content'},
    h('section',{className:'kc-approval-overview'},button(h(React.Fragment,null,h('img',{src:'./assets/approval/back.svg',width:20,height:20,alt:''}),t('รายการคำขอ','Requests')),()=>Selected(null),{className:'kc-approval-back'}),h('div',{className:'kc-approval-badges'},h('span',{className:'kc-approval-badge'},labels[selected.kind]),h('span',{className:'kc-approval-status-badge'},statusLabel(selected.status))),h('small',{className:'kc-approval-reference'},selected.code||''),h('h2',null,title(selected)),h('p',{className:'kc-approval-customer'},selected.customer_name||'')),
    selected.total!=null&&h('section',{className:'kc-approval-amount'},h('div',null,h('span',null,selected.kind==='amendment'?t('ยอด SO ปัจจุบัน','Current SO total'):t('ยอดรวม VAT','Total including VAT')),h('small',null,selected.kind==='amendment'?t('ยอดก่อนการแก้ไข รวม VAT แล้ว','Before revision, including VAT'):t('รวมภาษีมูลค่าเพิ่มแล้ว','Including VAT'))),h('strong',null,money(selected))),
    selected.kind==='quotation'&&h('section',{className:'kc-approval-policy'},h('strong',null,t('ลำดับอนุมัติตาม Policy ที่ส่งคำขอ','Approval sequence from submitted policy')),h('p',null,t('ขั้นที่ ','Step ')+selected.request.current_step+'/'+selected.request.approver_ids.length),h('p',null,selected.request.approver_ids.map((id,i)=>(i+1<selected.request.current_step?'✓ ':i+1===selected.request.current_step?'● ':'○ ')+(i+1)+(id===profile.id?t(' คุณ',' You'):'')).join(' → '))),
    selected.kind==='amendment'&&h('section',{className:'kc-approval-policy'},h('strong',null,t('เหตุผลที่ขอแก้ไข','Reason for amendment')),h('p',null,selected.request.reason),h('p',null,t('อนุมัติให้ผู้ขอแก้ไขได้หนึ่งครั้ง หลังบันทึกจะขออนุมัติ SO ฉบับใหม่','Authorize one save by the requester. The revised SO will require approval again.'))),
    selected.kind==='so'&&h('section',{className:'kc-approval-policy'},h('strong',null,t('ขออนุมัติเปิดใบสั่งขาย','Sales order approval')),h('p',null,selected.quotation_code),h('p',null,'PO: '+(selected.po_number||'—')),selected.po_file_key&&button(t('ดูไฟล์ PO ↗','View PO ↗'),async()=>{try{const data=await unwrap(client.storage.from('crm-sales-orders').createSignedUrl(selected.po_file_key,120));const a=document.createElement('a');a.href=data.signedUrl;a.target='_blank';a.rel='noopener';a.click();}catch(e){ErrorText(e.message);}})),
    h('section',{className:'kc-approval-requester'},h('span',{className:'kc-approval-avatar','aria-hidden':true},requester(selected).slice(0,2).toUpperCase()),h('div',null,h('strong',null,requester(selected)),h('small',null,t('ส่งคำขอ ','Requested ')+requestedDate(selected)))),
    h('details',{className:'kc-approval-panel kc-approval-essential'},h('summary',null,t('รายละเอียดเบื้องต้น','Essential details')),selected.items?.map((item,i)=>h('p',{key:i},(item.name||'')+' × '+(item.qty||item.quantity||1),item.part_number&&h('small',null,' · '+item.part_number))),selected.expected_delivery_date&&h('p',null,t('กำหนดส่ง ','Delivery ')+selected.expected_delivery_date),selected.note&&h('p',null,selected.note),button(t('ดูเอกสารต้นทาง ›','View source document ›'),()=>source(selected))),
    actionable&&h('label',{className:'kc-approval-panel'},t('ความเห็น (ต้องระบุเมื่อไม่อนุมัติ)','Comment (required for rejection)'),h('textarea',{value:comment,maxLength:2000,onChange:e=>Comment(e.target.value),rows:2,'aria-label':t('ความเห็นการอนุมัติ','Approval comment')})),
    actionable&&selected.kind!=='amendment'&&h('p',{className:'kc-approval-signature'},t('ใช้ลายเซ็นจากโปรไฟล์ของคุณ','Uses your Profile signature')),
    ),h('footer',{className:'kc-approval-bottom'},actionable&&h('small',null,selected.kind==='amendment'?t('อนุญาตให้แก้ไข 1 ครั้ง · บันทึกแล้วขออนุมัติ SO ใหม่','Authorize one revision · revised SO requires approval'):t('ตรวจข้อมูลก่อนยืนยัน · ใช้ลายเซ็นจากโปรไฟล์','Review before confirming · uses your Profile signature')),actionable?h('div',null,button(t('ไม่อนุมัติ','Reject'),()=>void decide('reject'),{className:'kc-approval-reject'}),button(t(selected.kind==='amendment'?'อนุมัติให้แก้ไข':selected.kind==='quotation'?'อนุมัติขั้นนี้':'อนุมัติ SO',selected.kind==='amendment'?'Authorize editing':selected.kind==='quotation'?'Approve this step':'Approve SO'),()=>void decide('approve'),{className:'kc-approval-confirm'})):selected.target?button(t('เปิดงานเพื่อดำเนินการ','Open workflow'),()=>source(selected),{className:'kc-approval-confirm'}):h('span',null,statusLabel(selected.status))))));
 };
}

export function createApprovalLauncher(deps){
 const {React}=deps,h=React.createElement,Center=createApprovalCenter(deps),Popup=createRecordPopup(React);
 return function ApprovalLauncher({lang}){const [open,Open]=React.useState(false);return h(React.Fragment,null,h('button',{type:'button',className:'kc-header-approval','aria-label':lang==='th'?'งานอนุมัติ':'Approvals',onClick:()=>Open(true)},h('span',{'aria-hidden':true},'✓ '),lang==='th'?'งานอนุมัติ':'Approvals'),open&&h(Popup,{title:lang==='th'?'ศูนย์อนุมัติ':'Approval center',lang,onClose:()=>Open(false)},h(Center,{lang,onSource:()=>Open(false)})));};
}
