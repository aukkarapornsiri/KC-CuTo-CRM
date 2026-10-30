import {observeRead} from './read-coordinator.mjs';
import {toCSV} from './settings-model.mjs';
import {assignmentTarget} from './assignment-links.mjs';
export const notificationDate=value=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'—';
export const newestNotifications=rows=>[...rows].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||String(b.id).localeCompare(String(a.id)));
export const notificationOutcome=row=>row.event_kind==='approval_resolved'||/^Quotation (approved|rejected|cancelled):/.test(row.title||'');
export function notificationWorkLabel(row,lang='th'){const t=(a,b)=>lang==='th'?a:b;return row.resolved_at?t(row.resolution==='dismissed'?'ปิดการแจ้งเตือนแล้ว':'ดำเนินการแล้ว',row.resolution==='dismissed'?'Dismissed':'Completed'):notificationOutcome(row)?t('แจ้งผลการอนุมัติแล้ว','Approval result'):t('รอดำเนินการ','Pending');}
export function notificationText(row,lang='th'){
 const rules=[['โปรด Assign Lead:','กรุณามอบหมายลีด:','Please assign lead:'],['ได้รับมอบหมาย Lead:','ได้รับมอบหมายลีด:','Lead assigned:'],['ได้รับมอบหมาย:','ได้รับมอบหมาย:','Assigned to you:'],['Quotation approval:','รออนุมัติใบเสนอราคา:','Quotation approval:'],['Quotation approved:','ใบเสนอราคาได้รับอนุมัติ:','Quotation approved:'],['Quotation rejected:','ใบเสนอราคาถูกปฏิเสธ:','Quotation rejected:'],['Quotation cancelled:','ยกเลิกคำขออนุมัติใบเสนอราคา:','Quotation approval cancelled:'],['ถึงเวลาติดตามงาน:','ถึงเวลาติดตามงาน:','Follow-up due:'],['MA / สัญญาใกล้หมดอายุ:','สัญญาบำรุงรักษา / สัญญาใกล้หมดอายุ:','Maintenance / contract expiring:']];
 let title=row.title||'';for(const [prefix,th,en] of rules)if(title.startsWith(prefix)){title=(lang==='th'?th:en)+title.slice(prefix.length);break;}
 const labels={qf_due:['ถึงเวลาติดตามใบเสนอราคา','Quotation follow-up due'],qf_expiry:['ใบเสนอราคาใกล้หมดอายุ','Quotation expiring'],qf_escalation:['ทีมมีงานติดตามเกินกำหนด','Team follow-up overdue'],lead_uncontacted:['ลีดยังไม่ได้รับการติดต่อ','Lead not contacted'],activity_overdue:['งานติดตามเกินกำหนด','Overdue follow-up'],opportunity_due:['ใกล้วันปิดการขาย','Opportunity closing soon'],opportunity_stale:['โอกาสการขายไม่มีความคืบหน้า','Opportunity needs attention'],quotation_expiring:['ใบเสนอราคาใกล้หมดอายุ','Quotation expiring'],renewal_owner_missing:['สัญญายังไม่มีผู้ดูแลต่ออายุ','Renewal owner missing'],delivery_failed:['ส่งอีเมลไม่สำเร็จ','Email delivery failed'],opportunity_result:['ผลการปิดโอกาสการขาย','Opportunity closed'],escalation:['ลีดเกินกำหนดติดต่อ','Lead contact overdue']};
 if(labels[row.event_kind])title=labels[row.event_kind][lang==='th'?0:1]+': '+(row.body||'');
 let body=row.body||'';if(lang!=='th')body=body.replace(/^กรุณาเลือกผู้รับลีด:/,'Please choose a lead recipient:');else body=body.replace(/^Step /,'ขั้นที่ ');
 return {title,body};
}
export function createNotificationCenter({React,client,useApp,useAccess}){
 const h=React.createElement;
 return function NotificationCenter({lang}){
 const {profile,demoMode,navigate,refreshNotifications}=useApp(),access=useAccess(),t=(th,en)=>lang==='th'?th:en;
 const [rows,Rows]=React.useState([]),[view,View]=React.useState('open'),[page,Page]=React.useState(0),[query,Query]=React.useState(''),[busy,Busy]=React.useState(false),[error,ErrorText]=React.useState('');
 const subscription=React.useRef(null),locked=React.useRef(false);const size=25;
 const load=()=>subscription.current?.refresh();
 React.useEffect(()=>{
  Rows([]);ErrorText('');Busy(!demoMode&&!!profile?.id);
  const stop=observeRead(client,{key:'notification-page:'+view+':'+page,userId:profile?.id,demo:demoMode,enabled:demoMode||!!profile?.id,interval:60000,events:['crm-work-changed','crm-records-refresh'],load:async signal=>{
   if(demoMode)return [];
   let q=client.from('notifications').select('id,created_at,title,body,is_read,resolved_at,resolution,priority,event_kind,related_module,related_id').eq('user_id',profile.id).order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*size,(page+1)*size-1);
   if(view==='open')q=q.is('resolved_at',null);if(view==='done')q=q.not('resolved_at','is',null);if(view==='unread')q=q.eq('is_read',false).is('resolved_at',null);
   const {data,error}=await q.abortSignal(AbortSignal.any([signal,AbortSignal.timeout(15000)]));if(error)throw error;return newestNotifications(data||[]);
  }},({data,error,loading})=>{if(data)Rows(data);Busy(loading);ErrorText(error?error.message||String(error):'');});
  subscription.current=stop;return()=>{stop();subscription.current=null;};
 },[profile?.id,demoMode,page,view]);
 const change=async(row,patch)=>{if(locked.current||busy)return;locked.current=true;Busy(true);try{
  const {data,error}=await client.from('notifications').update(patch).eq('id',row.id).eq('user_id',profile.id).select('id').maybeSingle();if(error)throw error;if(!data)throw Error(t('ไม่พบรายการหรือไม่มีสิทธิ์','Record unavailable or access denied'));
  Rows(old=>old.map(n=>n.id===row.id?{...n,...patch}:n).filter(n=>view==='open'?!n.resolved_at:view==='unread'?!n.is_read&&!n.resolved_at:view==='done'?!!n.resolved_at:true));window.dispatchEvent(new Event('crm-records-refresh'));void refreshNotifications?.();
 }catch(e){ErrorText(e.message);}finally{locked.current=false;Busy(false);}};
 const labels={created_at:t('วันที่และเวลา','Date / time'),title:t('เรื่องและรายละเอียด','Subject and details'),is_read:t('การอ่าน','Read status'),resolved_at:t('สถานะงาน','Work status'),actions:t('การดำเนินการ','Actions')};
 const list=rows.filter(row=>{const text=notificationText(row,lang);return (text.title+' '+text.body).toLowerCase().includes(query.toLowerCase());});
 return h('section',{className:'crm-settings crm-notification-center'},h('h1',null,t('การแจ้งเตือน','Notifications')),
 h('p',{className:'crm-notice'},t('รายการใหม่อยู่ด้านบน · งานที่ดำเนินการแล้วจะออกจากกระดิ่งและเก็บไว้ในประวัติ การอ่านไม่ใช่การปิดงาน','Newest first · Completed work leaves the bell and remains in history. Reading a notification does not complete its work.')),
 error&&h('p',{role:'alert',className:'crm-error'},error),
 h('div',{className:'crm-notification-toolbar'},h('input',{type:'search',value:query,onChange:e=>Query(e.target.value),placeholder:t('ค้นหาในหน้านี้','Search this page'),'aria-label':t('ค้นหาในหน้านี้','Search this page')}),h('button',{type:'button',disabled:busy,onClick:()=>{window.dispatchEvent(new Event('crm-records-refresh'));void load();void refreshNotifications?.();}},t('โหลดใหม่','Reload')),h('button',{type:'button',disabled:busy,onClick:()=>{const data=list.map(row=>{const text=notificationText(row,lang);return {[labels.created_at]:notificationDate(row.created_at),[labels.title]:text.title+' '+text.body,[labels.is_read]:t(row.is_read?'อ่านแล้ว':'ยังไม่อ่าน',row.is_read?'Read':'Unread'),[labels.resolved_at]:notificationWorkLabel(row,lang)};});const url=URL.createObjectURL(new Blob([toCSV(data,Object.keys(data[0]||{}))],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='notifications.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}},t('ส่งออกหน้านี้','Export this page'))),
 h('div',{className:'crm-notification-tabs'},[['open','รอดำเนินการ','Pending'],['unread','ยังไม่อ่าน','Unread'],['done','ประวัติที่ปิดแล้ว','Completed history'],['all','ทั้งหมด','All']].map(([key,th,en])=>h('button',{key,type:'button','aria-pressed':view===key,onClick:()=>{View(key);Page(0);}},t(th,en)))),
 h('div',{className:'crm-table-scroll'},h('table',{className:'crm-master-table'},h('thead',null,h('tr',null,Object.entries(labels).map(([key,label])=>h('th',{key},label)))),h('tbody',null,list.map(row=>{const text=notificationText(row,lang),target=assignmentTarget(row.related_module,row.related_id);return h('tr',{key:row.id,'data-read':row.is_read},
 h('td',{'data-label':labels.created_at},notificationDate(row.created_at)),
 h('td',{'data-label':labels.title},h('strong',null,text.title),h('p',null,text.body),row.priority==='high'&&h('span',{className:'crm-notification-urgent'},t('เร่งด่วน','Urgent'))),
 h('td',{'data-label':labels.is_read},t(row.is_read?'อ่านแล้ว':'ยังไม่อ่าน',row.is_read?'Read':'Unread')),
 h('td',{'data-label':labels.resolved_at},notificationWorkLabel(row,lang)),
 h('td',{'data-label':labels.actions},h('div',{className:'crm-notification-actions'},target&&(demoMode||access.can(target.module,'view'))&&h('button',{type:'button',onClick:()=>navigate(target.module,target.page,target.params)},t(target.module==='leads'?'เปิดลีด':'เปิดรายการ',target.module==='leads'?'Open lead':'Open record')),
 h('button',{type:'button',disabled:busy,onClick:()=>change(row,{is_read:!row.is_read})},t(row.is_read?'ทำเป็นยังไม่อ่าน':'ทำเป็นอ่านแล้ว',row.is_read?'Mark unread':'Mark read')),
 !row.resolved_at&&h('button',{type:'button',disabled:busy,onClick:()=>{if(window.confirm(t('ปิดการแจ้งเตือนนี้? สถานะงานต้นทางจะไม่เปลี่ยน','Dismiss this notification? The source record status will not change.')))void change(row,{resolved_at:new Date().toISOString(),resolution:'dismissed'});}},t('ปิดการแจ้งเตือน','Dismiss')))));})))),
 busy&&h('p',{role:'status'},t(rows.length?'กำลังอัปเดตรายการ…':'กำลังโหลดการแจ้งเตือน…',rows.length?'Updating notifications…':'Loading notifications…')),
 !busy&&!list.length&&h('p',{role:'status'},t('ไม่มีรายการในมุมมองนี้','No notifications in this view')),
 h('div',{className:'crm-notification-toolbar'},h('button',{disabled:busy||page===0,onClick:()=>Page(page-1)},t('ก่อนหน้า','Previous')),h('span',null,t('หน้า ','Page ')+(page+1)),h('button',{disabled:busy||rows.length<size,onClick:()=>Page(page+1)},t('ถัดไป','Next'))));
 };
}
