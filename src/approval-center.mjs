import {EXTENDED_APPROVAL_TEMPLATES,templateCanReview,templatePermitted} from './approval-template-catalog.mjs';
import {createTemplateRequestForm,createTemplateRequestDetails} from './template-request-form.mjs';
import {canReviewSO} from './approval-policy.mjs';
import {createRecordPopup} from './record-popup.mjs';
import {assignmentTarget} from './assignment-links.mjs';
import {loadProfileSignature} from './profile-signature.mjs';
export function canReviewQuotation(request,profileId,canApprove){return !!(canApprove&&request?.status==='pending'&&request.approver_ids?.[request.current_step-1]===profileId&&request.submitted_by!==profileId&&request.snapshot?.owner_id!==profileId);}
export const approvalCategory=module=>module==='quotations'?'quotation':['sales_orders','crm_sales_orders'].includes(module)?'so':['tickets','service'].includes(module)?'service':module==='leads'?'lead':'other';
export function createApprovalCenter({React,client,useApp,useAccess,records}){
 const h=React.createElement,Popup=createRecordPopup(React),TemplateForm=createTemplateRequestForm({React,client,useApp,useAccess}),TemplateDetails=createTemplateRequestDetails(React),unwrap=async q=>{const {data,error}=await q;if(error)throw error;return data;};
 async function readAll(query){const rows=[];for(let offset=0;offset<20000;offset+=500){const batch=await unwrap(query().range(offset,offset+499));rows.push(...batch);if(batch.length<500)return rows;}throw Error('Too many approval records. Please contact your administrator.');}
 return function ApprovalCenter({lang='th',onSource,initialRecordId,initialKind}){
  const {profile,demoMode,navigate,refreshNotifications}=useApp(),access=useAccess(),t=(th,en)=>lang==='th'?th:en;
  const [rows,Rows]=React.useState([]),[tab,Tab]=React.useState('pending'),[category,Category]=React.useState('all'),[search,Search]=React.useState(''),[selected,Selected]=React.useState(null),[comment,Comment]=React.useState(''),[busy,Busy]=React.useState(false),[loading,Loading]=React.useState(true),[error,ErrorText]=React.useState(''),[message,Message]=React.useState('');
  const [creatingTemplate,CreatingTemplate]=React.useState(false);
  const generation=React.useRef(0),lock=React.useRef(false);
  const can=action=>access.can('quotations',action),labels={template:t('คำขอตาม Template','Template request'),quotation_edit:t('ขอแก้ไขใบเสนอราคา','Edit Approved Quotation'),quotation:t('ใบเสนอราคา','Quotation'),so:t('เปิด SO','Open SO'),amendment:t('ขอแก้ไข SO','SO amendment'),service:t('งานบริการ','Service'),lead:t('ลีด','Lead'),other:t('งานอื่น','Other work')};
  const amountLabel=r=>r.kind==='template'?({credit_terms:t('วงเงินเครดิต','Credit limit'),contract_amendment:t('มูลค่าสัญญา','Contract value'),contract_renewal:t('มูลค่าต่ออายุสัญญา','Renewal value'),special_purchase:t('วงเงินจัดซื้อก่อนภาษี','Purchase amount before tax')}[r.template_type]||t('ยอดรวม VAT','Total incl. VAT')):t('ยอดรวม VAT','Total incl. VAT');
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
     const visibleSO=soRequests.filter(a=>tab==='pending'?canReviewSO(a,profile.id,can('approve')):tab==='sent'?a.requested_by===profile.id:a.status!=='pending'&&(a.requested_by===profile.id||a.reviewed_by===profile.id));
     if(visibleSO.length){const orders=demoMode?records.native_sales_orders||[]:await unwrap(client.from('crm_sales_orders').select('*').in('id',visibleSO.map(a=>a.sales_order_id)));for(const a of visibleSO){const s=orders.find(s=>s.id===a.sales_order_id);if(s)list.push({...s,kind:'so',key:'so:'+s.id,request:a,status:a.status,orderStatus:s.status,created_at:a.requested_at});}}
    }
    if(can('view')){
     const changes=demoMode?records.so_amendments||[]:await readAll(()=>{let q=client.from('crm_so_amendments').select('*').order('requested_at',{ascending:false}).order('id');return tab==='pending'?q.eq('status','pending'):tab==='sent'?q.eq('requested_by',profile.id):q.in('status',['approved','rejected','cancelled','applied']);});
     for(const a of changes){if(tab==='pending'&&!canReviewSO(a,profile.id,can('approve')))continue;const s=a.after_snapshot||a.before_snapshot;list.push({...s,id:a.sales_order_id,kind:'amendment',key:'amendment:'+a.id,request:a,status:a.status,orderStatus:s.status,created_at:a.requested_at,summary:a.reason});}
    }
    if(can('view')&&!demoMode){
     const edits=await readAll(()=>{let q=client.from('crm_quotation_edit_requests').select('*').order('requested_at',{ascending:false}).order('id');return tab==='pending'?q.eq('status','pending'):tab==='sent'?q.eq('requested_by',profile.id):q.neq('status','pending');});
     for(const a of edits){if(tab==='pending'&&!canReviewSO(a,profile.id,can('approve')))continue;list.push({...a.before_snapshot,id:a.quotation_id,kind:'quotation_edit',key:'quotation-edit:'+a.id,request:a,status:a.status,orderStatus:a.before_snapshot.status,created_at:a.requested_at,summary:a.reason});}
    }
    if(!demoMode){
     const requests=await readAll(()=>{let q=client.from('crm_template_requests').select('*').order('created_at',{ascending:false}).order('id');return tab==='pending'?q.eq('status','pending').contains('approver_ids',[profile.id]):tab==='sent'?q.eq('requested_by',profile.id):q.neq('status','pending');});
     for(const a of requests){const type=EXTENDED_APPROVAL_TEMPLATES.find(t=>t.id===a.request_type);if(!type||!access.can(type.module,'view')||(tab==='pending'&&!(templateCanReview(a,profile.id)&&templatePermitted(a.request_type,(m,a)=>access.can(m,a),true))))continue;list.push({...a.before_snapshot,kind:'template',template_type:a.request_type,key:'template:'+a.id,id:a.target_id,request:a,status:a.status,created_at:a.created_at,total:['lead_merge','lead_reassignment','inventory_adjustment'].includes(a.request_type)?null:a.amount,summary:a.reason,title:t(type.th,type.en)});}
    }
    // Other workflows keep their own permissions and decision handlers at the source.
    if(!demoMode&&tab!=='sent'){
     const notices=await readAll(()=>client.from('notifications').select('*').eq('user_id',profile.id).order('created_at',{ascending:false}).order('id'));
     for(const n of notices){const target=assignmentTarget(n.related_module,n.related_id);if(n.event_key?.startsWith('template:')||n.event_key?.startsWith('template-result:')||!target||['quotations','sales_orders','crm_sales_orders'].includes(n.related_module)||!access.can(target.module,'view')||!(/approv/i.test(n.event_kind||'')||/อนุมัติ|approval/i.test(n.title||''))||((tab==='pending')===!!n.resolved_at))continue;list.push({kind:approvalCategory(n.related_module),key:'n:'+n.id,id:n.related_id,title:n.title,summary:n.body,target,status:n.resolved_at?'completed':'pending',created_at:n.created_at});}
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
    if(initialKind==='template'){
     const a=await unwrap(client.from('crm_template_requests').select('*').eq('id',initialRecordId).maybeSingle()),type=EXTENDED_APPROVAL_TEMPLATES.find(t=>t.id===a?.request_type);
     if(!a||!type||!access.can(type.module,'view'))throw Error(t('ไม่พบคำขอหรือไม่มีสิทธิ์เข้าถึง','Request not found or access denied'));
     if(active){Selected({...a.before_snapshot,id:a.target_id,kind:'template',template_type:a.request_type,key:'template:'+a.id,request:a,status:a.status,summary:a.reason,title:t(type.th,type.en),total:['lead_merge','lead_reassignment','inventory_adjustment'].includes(a.request_type)?null:a.amount,created_at:a.created_at});Comment('');}return;
    }
    if(!can('view')||!can('approve'))throw Error(t('ไม่มีสิทธิ์เข้าถึงงานอนุมัติ','Approval access denied'));
    if(initialKind==='amendment'){
     const a=demoMode?(records.so_amendments||[]).find(r=>r.id===initialRecordId):await unwrap(client.from('crm_so_amendments').select('*').eq('id',initialRecordId).maybeSingle());
     if(!a)throw Error(t('ไม่พบคำขอแก้ไข SO หรือไม่มีสิทธิ์','SO amendment request not found or access denied'));
     if(active){Selected({...a.before_snapshot,id:a.sales_order_id,kind:'amendment',key:'amendment:'+a.id,request:a,status:a.status,summary:a.reason,created_at:a.requested_at});Comment('');}return;
    }
    let selectedTask;
    if(!demoMode&&initialKind!=='so'){const edits=await unwrap(client.from('crm_quotation_edit_requests').select('*').eq('quotation_id',initialRecordId).eq('status','pending').order('requested_at',{ascending:false}).limit(1));const a=edits[0];if(a&&canReviewSO(a,profile.id,can('approve'))){if(active){Selected({...a.before_snapshot,id:a.quotation_id,kind:'quotation_edit',key:'quotation-edit:'+a.id,request:a,status:a.status,summary:a.reason,created_at:a.requested_at});Comment('');}return;}}
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
    if(selected.kind==='template'?!(action==='cancel'?selected.request.requested_by===profile.id&&selected.status==='pending':templateCanReview(selected.request,profile.id)):(!can('approve')||selected.status!=='pending'||(selected.kind==='quotation'?!canReviewQuotation(selected.request,profile.id,true):!canReviewSO(selected.request,profile.id,true))))throw Error(t('ไม่มีสิทธิ์อนุมัติขั้นตอนนี้','You cannot review this step'));
    if(demoMode)throw Error(t('การอนุมัติต้องใช้บัญชีจริง','Approval requires a signed-in account'));
    if(action==='approve'&&!['amendment','quotation_edit','template'].includes(selected.kind)){const signature=await loadProfileSignature(client,profile.id,false);if(!signature.seller_signature_storage_key)throw Error(t('กรุณาบันทึกลายเซ็นใน Profile ก่อนอนุมัติ','Save your signature in Profile before approving'));}
    await unwrap(selected.kind==='template'?client.rpc('crm_template_decide',{p_id:selected.request.id,p_action:action,p_note:comment,p_expected_updated_at:selected.request.updated_at}):selected.kind==='quotation_edit'?client.rpc('crm_quotation_edit_action',{p_quotation_id:selected.id,p_action:action,p_reason:comment,p_request_id:selected.request.id}):selected.kind==='amendment'?client.rpc('crm_so_amendment_action',{p_sales_order_id:selected.id,p_action:action,p_note:comment,p_request_id:selected.request.id}):selected.kind==='quotation'?client.rpc('crm_quotation_transition',{p_quotation:selected.id,p_action:action,p_comment:comment}):client.rpc('crm_so_approval_action',{p_sales_order_id:selected.id,p_action:action,p_note:comment}));
    Selected(null);Comment('');Message(t('บันทึกผลการอนุมัติแล้ว','Decision saved'));window.dispatchEvent(new Event('crm-records-refresh'));void load();void refreshNotifications?.();
   }catch(e){ErrorText(e.message||String(e));}finally{lock.current=false;Busy(false);}
  }
  const open=(r,intent)=>{Selected(r);Comment('');ErrorText('');Message('');if(intent==='reject'&&typeof requestAnimationFrame==='function')requestAnimationFrame(()=>document.querySelector('.kc-approval-detail textarea')?.focus());};
  const source=r=>{Selected(null);onSource?.();if(r.kind==='template'){const type=EXTENDED_APPROVAL_TEMPLATES.find(t=>t.id===r.template_type);navigate(type.module==='inventory'?'settings':type.module,type.module==='inventory'?'set-inventory':type.page,{recordId:type.table==='crm_sales_orders'?r.quotation_id:r.id});return;}if(r.kind==='amendment'){navigate('quotations','quot-list',{recordId:r.quotation_id});return;}if(r.target)navigate(r.target.module,r.target.page,r.target.params);else navigate('quotations','quot-list',{recordId:r.kind==='so'?r.quotation_id:r.id});};
  const title=r=>r.kind==='quotation_edit'?t('ขอแก้ไขใบเสนอราคา','Request to edit approved quotation'):r.kind==='amendment'?t('ขอแก้ไขใบสั่งขาย','Request to amend sales order'):r.title||r.subject||r.name||(r.kind==='so'?t('เปิดคำสั่งขาย ','Open sales order '):'')+(r.items?.[0]?.name||r.code||labels[r.kind]);
  const statusLabel=s=>({pending:t('รออนุมัติ','Pending'),approved:t('อนุมัติแล้ว','Approved'),rejected:t('ไม่อนุมัติ','Rejected'),cancelled:t('ถอนคำขอแล้ว','Withdrawn'),completed:t('ดำเนินการแล้ว','Completed')}[s]||s);
  const visible=rows.filter(r=>(category==='all'||(category==='other'?!['quotation','quotation_edit','so','amendment'].includes(r.kind):category==='so'?['so','amendment'].includes(r.kind):category==='quotation'?['quotation','quotation_edit'].includes(r.kind):r.kind===category))&&[title(r),r.code,r.customer_name,r.summary].join(' ').toLowerCase().includes(search.toLowerCase()));
  const summary=r=>r.kind==='amendment'?r.request.reason:r.summary||r.note||(r.items||[]).slice(0,2).map(x=>(x.name||'')+' × '+(x.qty||x.quantity||1)).join(' · ')||t('เปิดดูรายละเอียดเพื่อพิจารณา','Open details to review');
  const requester=r=>r.request?.requested_by===profile?.id||r.request?.submitted_by===profile?.id?t('คุณ','You'):r.requester_name||((r.request?.requested_by===r.owner_id||r.request?.submitted_by===r.owner_id)?r.owner_name:'')||t('ผู้ใช้ในระบบ','CRM user');
  const requestedDate=r=>r.created_at&&Number.isFinite(Date.parse(r.created_at))?new Intl.DateTimeFormat(lang==='th'?'th-TH':'en-GB',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(r.created_at)):'—';
  const canAct=r=>r?.kind==='template'?templateCanReview(r.request,profile?.id)&&templatePermitted(r.template_type,(m,a)=>access.can(m,a),true):r?.status==='pending'&&can('approve')&&(r.kind==='quotation'?canReviewQuotation(r.request,profile?.id,true):['amendment','so','quotation_edit'].includes(r.kind)&&canReviewSO(r.request,profile?.id,true)&&r.orderStatus!=='cancelled');
  const actionable=canAct(selected);
  const button=(label,fn,props={})=>h('button',{type:'button',onClick:fn,disabled:busy,...props},label);
  return h('section',{className:'kc-approval-app','aria-label':t('ศูนย์อนุมัติ','Approval center')},
   h('header',{className:'kc-approval-top'},h('div',null,h('h1',null,t('ศูนย์อนุมัติ','Approval center')),h('p',null,t('ตรวจสอบ ตัดสินใจ และติดตามงานในที่เดียว','Review, decide and track work in one place'))),button(h('img',{src:'./assets/approval/refresh.svg',width:20,height:20,alt:''}),()=>void load(),{disabled:busy||loading,'aria-label':t('โหลดใหม่','Refresh'),className:'kc-approval-refresh'})),
   !demoMode&&EXTENDED_APPROVAL_TEMPLATES.some(x=>templatePermitted(x.id,(m,a)=>access.can(m,a)))&&button(t('+ สร้างคำขอจาก Template','+ New template request'),()=>CreatingTemplate(true),{className:'kc-approval-new-template'}),
   creatingTemplate&&h(TemplateForm,{lang,onClose:()=>CreatingTemplate(false),onSaved:()=>{CreatingTemplate(false);Tab('sent');Message(t('ส่งคำขออนุมัติแล้ว','Request submitted'));void load();}}),
   message&&h('p',{role:'status'},message),!selected&&error&&h('p',{role:'alert'},error),
   h('section',{className:'kc-approval-metrics','aria-label':t('สรุปรายการในมุมมองที่เลือก','Summary of selected view')},[
    [t('รายการในมุมมองนี้','Requests in this view'),rows.length],
    [t('รออนุมัติ','Pending'),rows.filter(r=>r.status==='pending').length],
    [t('อนุมัติแล้ว','Approved'),rows.filter(r=>r.status==='approved'||r.status==='applied'||r.status==='completed').length],
    [t('ไม่อนุมัติ','Rejected'),rows.filter(r=>r.status==='rejected').length]
   ].map(([label,value])=>h('article',{key:label,className:'kc-approval-metric'},h('strong',null,loading||error?'—':value),h('span',null,label)))),
   h('div',{className:'kc-approval-toolbar'},
   h('nav',{className:'kc-approval-tabs','aria-label':t('มุมมองงานอนุมัติ','Approval views')},[['pending','รอฉัน','Awaiting me'],['sent','ส่งคำขอ','My requests'],['history','ประวัติ','History']].map(([v,th,en])=>button(t(th,en),()=>Tab(v),{key:v,'aria-pressed':tab===v}))),
   h('div',{className:'kc-approval-search'},h('img',{src:'./assets/approval/search.svg',width:20,height:20,alt:''}),h('input',{type:'search',value:search,onChange:e=>Search(e.target.value),placeholder:t('ค้นหาเรื่อง เลขเอกสาร หรือลูกค้า…','Search subject, document or customer…'),'aria-label':t('ค้นหางานอนุมัติ','Search approvals')}))),
   h('nav',{className:'kc-approval-filters','aria-label':t('ประเภทงาน','Work types')},[['all','ทั้งหมด','All'],['quotation','เสนอราคา','Quotation'],['so','SO','SO'],['other','อื่น ๆ','Other']].map(([v,th,en])=>button(t(th,en),()=>Category(v),{key:v,'data-kind':v,'aria-pressed':category===v}))),
   h('div',{className:'kc-approval-list-heading'},h('strong',null,tab==='pending'?t('รอคุณอนุมัติ','Awaiting your approval'):tab==='sent'?t('คำขอของคุณ','Your requests'):t('ประวัติการอนุมัติ','Approval history')),h('span',null,loading?'…':visible.length+t(' รายการ',' requests'))),
   h('div',{className:'kc-approval-results'},loading?h('p',{role:'status'},t('กำลังโหลดงานอนุมัติ…','Loading approvals…')):h('div',{className:'kc-approval-cards'},visible.map(r=>h('article',{className:'kc-approval-card',key:r.key,'data-kind':r.kind},
    button(h(React.Fragment,null,
     h('span',{className:'kc-approval-card-top'},h('span',{className:'kc-approval-badge'},labels[r.kind]),h('span',{className:'kc-approval-state'},statusLabel(r.status))),
     h('strong',{className:'kc-approval-card-title',title:title(r)},title(r)),
     h('span',{className:'kc-approval-card-reference'},r.code||'—'),h('span',{className:'kc-approval-customer',title:r.customer_name||summary(r)},r.customer_name||summary(r)),
     h('span',{className:'kc-approval-value'},h('b',null,r.total!=null?money(r):'—'),h('span',null,amountLabel(r))),
     h('span',{className:'kc-approval-card-meta'},h('span',{title:requester(r)},requester(r)),h('span',null,requestedDate(r)))
    ),()=>open(r),{className:'kc-approval-card-main','aria-label':t('ตรวจสอบ ','Review ')+(r.code||title(r))}),
    h('div',{className:'kc-approval-card-actions'},button(t('รายละเอียด','Details'),()=>open(r),{className:'kc-approval-card-details'}),canAct(r)&&h(React.Fragment,null,button(t('ไม่อนุมัติ','Reject'),()=>open(r,'reject'),{className:'kc-approval-card-reject'}),button(t('อนุมัติ','Approve'),()=>open(r),{className:'kc-approval-card-approve'}))) ))),

   !loading&&!visible.length&&h('section',{className:'kc-approval-empty',role:'status'},h('span',{className:'kc-approval-empty-icon','aria-hidden':true},search||category!=='all'?'⌕':'✓'),h('h2',null,search||category!=='all'?t('ไม่พบรายการที่ค้นหา','No matching requests'):tab==='pending'?t('ไม่มีงานรอคุณอนุมัติ','No requests awaiting your approval'):t('ยังไม่มีรายการ','No requests yet')),h('p',null,search||category!=='all'?t('ลองเปลี่ยนคำค้นหาหรือประเภทงาน','Try another search or work type'):t('เมื่อมีคำขอใหม่ จะแสดงที่หน้านี้','New requests will appear here')),tab==='pending'&&button(t('ดูประวัติ','View history'),()=>{Search('');Category('all');Tab('history');}))),
   selected&&h(Popup,{title:labels[selected.kind],lang,busy,error,onClose:()=>Selected(null)},h('div',{className:'kc-approval-detail','data-kind':selected.kind},h('div',{className:'kc-approval-review-content'},
    h('section',{className:'kc-approval-overview'},button(h(React.Fragment,null,h('img',{src:'./assets/approval/back.svg',width:20,height:20,alt:''}),t('รายการคำขอ','Requests')),()=>Selected(null),{className:'kc-approval-back'}),h('div',{className:'kc-approval-badges'},h('span',{className:'kc-approval-badge'},labels[selected.kind]),h('span',{className:'kc-approval-status-badge'},statusLabel(selected.status))),h('small',{className:'kc-approval-reference'},selected.code||''),h('h2',null,title(selected)),h('p',{className:'kc-approval-customer'},selected.customer_name||'')),
    selected.kind==='template'&&h(TemplateDetails,{request:selected.request,lang}),
    selected.kind==='quotation'&&selected.request?.snapshot?.approval_conditions?.low_gp_applied&&h('section',{className:'kc-flow-summary'},h('strong',null,t('เงื่อนไขอนุมัติ GP ต่ำ','Low GP approval condition')),h('p',null,t('GP ต่ำกว่าเกณฑ์ ','GP below ')+selected.request.snapshot.approval_conditions.low_gp_threshold+'% · '+t('เพิ่มผู้อนุมัติ ','Additional approval steps: ')+selected.request.snapshot.approval_conditions.additional_steps),selected.request.snapshot.approval_conditions.no_margin_base&&h('p',null,t('ยอดขายสุทธิเป็นศูนย์หรือติดลบ ต้องพิจารณา GP เพิ่มเติม','Zero or negative net sales require additional GP review'))),
    selected.total!=null&&h('section',{className:'kc-approval-amount'},h('div',null,h('span',null,selected.kind==='amendment'?t('ยอด SO ปัจจุบัน','Current SO total'):amountLabel(selected)),h('small',null,selected.kind==='amendment'?t('ยอดก่อนการแก้ไข รวม VAT แล้ว','Before revision, including VAT'):selected.kind==='template'?t('ยอดตามประเภทคำขอ','Amount for this request type'):t('รวมภาษีมูลค่าเพิ่มแล้ว','Including VAT'))),h('strong',null,money(selected))),
    ['so','amendment'].includes(selected.kind)&&h('section',{className:'kc-approval-policy'},h('strong',null,selected.request.approval_policy_name||t('ขั้นตอนอนุมัติที่กำหนด','Configured approval policy')),h('p',null,t('ขั้นที่ ','Step ')+selected.request.current_step+'/'+(selected.request.approver_ids?.length||0))),
    selected.kind==='quotation_edit'&&h('section',{className:'kc-approval-policy'},h('strong',null,t('ขออนุมัติก่อนแก้ไขใบเสนอราคา','Approve quotation editing')),h('p',null,selected.request.reason),h('p',null,t('ผู้ขอแก้ไขได้หนึ่งครั้ง หลังบันทึกต้องอนุมัติใบเสนอราคาฉบับใหม่','Authorize one save; the revised quotation requires approval again.'))),
     selected.kind==='quotation'&&h('section',{className:'kc-approval-policy'},h('strong',null,t('ลำดับอนุมัติตาม Policy ที่ส่งคำขอ','Approval sequence from submitted policy')),h('p',null,t('ขั้นที่ ','Step ')+selected.request.current_step+'/'+selected.request.approver_ids.length),h('p',null,selected.request.approver_ids.map((id,i)=>(i+1<selected.request.current_step?'✓ ':i+1===selected.request.current_step?'● ':'○ ')+(i+1)+(id===profile.id?t(' คุณ',' You'):'')).join(' → '))),
    selected.kind==='amendment'&&h('section',{className:'kc-approval-policy'},h('strong',null,t('เหตุผลที่ขอแก้ไข','Reason for amendment')),h('p',null,selected.request.reason),h('p',null,t('อนุมัติให้ฝ่ายขายเจ้าของ SO แก้ไขได้หนึ่งครั้ง หลังบันทึกจะขออนุมัติ SO ฉบับใหม่','Authorize one revision by the responsible salesperson. The revised SO requires approval again.'))),
    selected.kind==='so'&&h('section',{className:'kc-approval-policy'},h('strong',null,t('ขออนุมัติเปิดใบสั่งขาย','Sales order approval')),h('p',null,selected.quotation_code),h('p',null,'PO: '+(selected.po_number||'—')),selected.po_file_key&&button(t('ดูไฟล์ PO ↗','View PO ↗'),async()=>{try{const data=await unwrap(client.storage.from('crm-sales-orders').createSignedUrl(selected.po_file_key,120));const a=document.createElement('a');a.href=data.signedUrl;a.target='_blank';a.rel='noopener';a.click();}catch(e){ErrorText(e.message);}})),
    h('section',{className:'kc-approval-requester'},h('span',{className:'kc-approval-avatar','aria-hidden':true},requester(selected).slice(0,2).toUpperCase()),h('div',null,h('strong',null,requester(selected)),h('small',null,t('ส่งคำขอ ','Requested ')+requestedDate(selected)))),
    h('details',{className:'kc-approval-panel kc-approval-essential'},h('summary',null,t('รายละเอียดเบื้องต้น','Essential details')),selected.items?.map((item,i)=>h('p',{key:i},(item.name||'')+' × '+(item.qty||item.quantity||1),item.part_number&&h('small',null,' · '+item.part_number))),selected.expected_delivery_date&&h('p',null,t('กำหนดส่ง ','Delivery ')+selected.expected_delivery_date),selected.note&&h('p',null,selected.note),button(t('ดูเอกสารต้นทาง ›','View source document ›'),()=>source(selected))),
    actionable&&h('label',{className:'kc-approval-panel'},t('ความเห็น (ต้องระบุเมื่อไม่อนุมัติ)','Comment (required for rejection)'),h('textarea',{value:comment,maxLength:2000,onChange:e=>Comment(e.target.value),rows:2,'aria-label':t('ความเห็นการอนุมัติ','Approval comment')})),
    actionable&&!['amendment','quotation_edit','template'].includes(selected.kind)&&h('p',{className:'kc-approval-signature'},t('ใช้ลายเซ็นจากโปรไฟล์ของคุณ','Uses your Profile signature')),
    ),h('footer',{className:'kc-approval-bottom'},actionable&&h('small',null,selected.kind==='amendment'?t('อนุญาตให้แก้ไข 1 ครั้ง · บันทึกแล้วขออนุมัติ SO ใหม่','Authorize one revision · revised SO requires approval'):selected.kind==='template'?t('ตรวจรายละเอียดก่อนยืนยัน เมื่ออนุมัติครบจะดำเนินการตาม Template','Review the request. Final approval applies its template action.'):t('ตรวจข้อมูลก่อนยืนยัน · ใช้ลายเซ็นจากโปรไฟล์','Review before confirming · uses your Profile signature')),selected.kind==='template'&&selected.status==='pending'&&selected.request.requested_by===profile.id?button(t('ถอนคำขอ','Withdraw request'),()=>void decide('cancel'),{className:'kc-approval-reject'}):actionable?h('div',null,button(t('ไม่อนุมัติ','Reject'),()=>void decide('reject'),{className:'kc-approval-reject'}),button(t(['amendment','quotation_edit'].includes(selected.kind)?'อนุมัติให้แก้ไข':['quotation','template'].includes(selected.kind)?'อนุมัติขั้นนี้':'อนุมัติ SO',['amendment','quotation_edit'].includes(selected.kind)?'Authorize editing':['quotation','template'].includes(selected.kind)?'Approve this step':'Approve SO'),()=>void decide('approve'),{className:'kc-approval-confirm'})):selected.target?button(t('เปิดงานเพื่อดำเนินการ','Open workflow'),()=>source(selected),{className:'kc-approval-confirm'}):h('span',null,statusLabel(selected.status))))));
 };
}

export function createApprovalLauncher(deps){
 const {React}=deps,h=React.createElement,Center=createApprovalCenter(deps),Popup=createRecordPopup(React);
 return function ApprovalLauncher({lang}){const [open,Open]=React.useState(false),[recordId,RecordId]=React.useState(null);React.useEffect(()=>{const show=e=>{if(/^[0-9a-f-]{36}$/i.test(e.detail?.id||'')){RecordId(e.detail.id);Open(true);}};window.addEventListener('crm-template-approval',show);return()=>window.removeEventListener('crm-template-approval',show);},[]);return h(React.Fragment,null,h('button',{type:'button',className:'kc-header-approval','aria-label':lang==='th'?'งานอนุมัติ':'Approvals',onClick:()=>{RecordId(null);Open(true);}},h('span',{'aria-hidden':true},'✓ '),lang==='th'?'งานอนุมัติ':'Approvals'),open&&h(Popup,{title:lang==='th'?'ศูนย์อนุมัติ':'Approval center',lang,onClose:()=>Open(false)},h(Center,{lang,initialKind:recordId?'template':undefined,initialRecordId:recordId,onSource:()=>Open(false)})));};
}
