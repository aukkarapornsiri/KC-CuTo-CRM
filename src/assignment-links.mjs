export const RECORD_PAGES={leads:'lead-inbox',activities:'act-my',tickets:'tk-all',customers:'customer-list',contacts:'contact-list',opportunities:'opp-all',quotations:'quot-list',contracts:'con-all',assets:'asset-all',documents:'doc-all'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PENDING_TASK_KEY='kc-crm-pending-email-task';
const MAX_AGE=8*60*60*1000;
export function assignmentTarget(module,id){module=String(module||'').toLowerCase();return RECORD_PAGES[module]&&UUID.test(id||'')?{module,page:RECORD_PAGES[module],params:{recordId:id}}:null;}
export function emailTask(href){
 try{const url=new URL(href),module=String(url.searchParams.get('module')||'').toLowerCase(),id=url.searchParams.get('record');if(['sales_orders','crm_sales_orders'].includes(module)&&UUID.test(id||''))return {module:'sales_orders',record:id};const target=assignmentTarget(module,id);return target?{module:target.module,record:id}:null;}catch{return null;}
}
export function rememberEmailTask(href,storage,now=Date.now()){
 const task=emailTask(href);if(task)try{storage?.setItem(PENDING_TASK_KEY,JSON.stringify({...task,savedAt:now}));}catch{}return task;
}
export function pendingEmailTask(href,storage,now=Date.now()){
 const direct=rememberEmailTask(href,storage,now);if(direct)return direct;
 try{const value=JSON.parse(storage?.getItem(PENDING_TASK_KEY)||'null');if(value&&Number.isFinite(value.savedAt)&&now>=value.savedAt&&now-value.savedAt<MAX_AGE){const task=emailTask('https://crm.invalid/?'+new URLSearchParams({module:value.module,record:value.record}));if(task)return task;}storage?.removeItem(PENDING_TASK_KEY);}catch{try{storage?.removeItem(PENDING_TASK_KEY);}catch{}}return null;
}
export function emailDestination(task,can){
 if(!task)return null;
 if(task.module==='sales_orders')return can('quotations','view')&&can('quotations','approve')?{module:'quotations',page:'quot-approval',params:{approvalRecordId:task.record,approvalKind:'so'}}:null;
 const target=assignmentTarget(task.module,task.record);if(!target||!can(target.module,'view'))return null;
 return target.module==='quotations'&&can('quotations','approve')?{module:'quotations',page:'quot-approval',params:{approvalRecordId:task.record,approvalKind:'quotation'}}:target;
}
// Capture only allowlisted record identifiers, before OAuth can replace the URL.
if(typeof window!=='undefined')try{rememberEmailTask(window.location.href,window.sessionStorage);}catch{}
export function createAssignmentLinkRouter({React,useApp,useAccess}){return function AssignmentLinkRouter(){
 const {profile,navigate}=useApp(),access=useAccess(),done=React.useRef(false);
 React.useEffect(()=>{
  if(done.current||!profile||access.loading)return;
  let storage;try{storage=window.sessionStorage;}catch{}
  const task=pendingEmailTask(window.location.href,storage);if(!task)return;
  const target=emailDestination(task,(module,action)=>access.can(module,action));done.current=true;
  if(!target){window.alert('ไม่มีสิทธิ์เข้าถึงงานนี้ / Access denied');return;}
  navigate(target.module,target.page,target.params);
  try{storage?.removeItem(PENDING_TASK_KEY);}catch{}
  const url=new URL(window.location.href);url.searchParams.delete('module');url.searchParams.delete('record');history.replaceState(history.state,'',url);
 },[profile?.id,access.loading]);return null;
};}
