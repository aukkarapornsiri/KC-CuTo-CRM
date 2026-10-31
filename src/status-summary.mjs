import {OPTIONS} from './internal-options.mjs';
import {recordOptionLabel} from './record-display.mjs';
const key=value=>String(value??'').trim().toLowerCase();
export function statusSummary(entity,rows){
 const values=new Map((OPTIONS[entity]?.status||[]).map(value=>[key(value),{status:value,count:0}]));
 for(const row of rows){const id=key(row.status);if(!values.has(id))values.set(id,{status:id?String(row.status).trim():'',count:0});values.get(id).count++;}
 return [...values.values()];
}
export function createStatusSummary(React){
 const h=React.createElement;
 return function StatusSummary({entity,rows,lang='th',ready=true,failed=false,updatedAt=null,selectedStatus='',onSelectStatus,visibleCount}){
  const th=lang==='th',names={leads:['ลีด','Leads'],contacts:['ผู้ติดต่อ','Contacts'],customers:['ลูกค้า','Accounts']},name=names[entity]?.[th?0:1]||entity;
  const cards=[{status:null,count:rows.length},...statusSummary(entity,rows).filter(item=>entity!=='customers'||key(item.status)!=='blacklist')];
  const selectable=typeof onSelectStatus==='function',number=n=>ready?new Intl.NumberFormat(th?'th-TH':'en-US').format(n):'—';
  return h(React.Fragment,null,entity==='leads'&&h('div',{className:'crm-summary-caption','aria-live':'polite'},h('span',null,th?'สถานะปัจจุบัน · นับลีดไม่ซ้ำทุกหน้า ตามสิทธิ์และตัวกรองอื่น ไม่ใช่ยอดสะสมแต่ละขั้นตอน':'Current status · Unique leads across all pages, within access and other filters; not cumulative milestones'),h('span',null,!ready?(failed?(th?'โหลดไม่สำเร็จ กรุณากดโหลดใหม่':'Load failed. Please reload.'):(th?'กำลังโหลดข้อมูล…':'Loading data…')):failed?(th?'ข้อมูลล่าสุดโหลดไม่สำเร็จ กำลังแสดงยอดครั้งก่อน':'Refresh failed. Showing the previous counts.'):(th?'โหลดล่าสุด ':'Last loaded ')+new Date(updatedAt).toLocaleTimeString(th?'th-TH':'en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Asia/Bangkok'}))),h('section',{className:'crm-grid crm-sales-metrics crm-status-metrics',style:{'--summary-columns':Math.min(4,cards.length)},'aria-label':th?'สรุปสถานะ'+name:name+' status summary'},cards.map(({status,count})=>h(selectable&&status!==''?'button':'div',{className:'crm-master-form'+(selectable?' crm-status-card':''),key:status??'total','data-summary-status':status??'total',...(selectable&&status!==''?{type:'button',disabled:!ready,'aria-pressed':(status??'')===selectedStatus,onClick:()=>onSelectStatus(status??'')}: {})},h('span',null,status===null?(th?name+'ทั้งหมด':'Total '+name):status?recordOptionLabel(entity,'status',status,lang):(th?'ไม่ระบุสถานะ':'Not specified')),h('p',null,number(count))))),entity==='leads'&&ready&&h('p',{className:'crm-summary-count'},(th?'รายการที่ตรงกับสถานะที่เลือก: ':'Records matching the selected status: ')+number(visibleCount??rows.length)));
 };
}
