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
 return function StatusSummary({entity,rows,lang='th'}){
  const th=lang==='th',names={leads:['ลีด','Leads'],contacts:['ผู้ติดต่อ','Contacts'],customers:['ลูกค้า','Accounts']},name=names[entity]?.[th?0:1]||entity;
  const cards=[{status:null,count:rows.length},...statusSummary(entity,rows).filter(item=>entity!=='customers'||key(item.status)!=='blacklist')];
  return h('section',{className:'crm-grid crm-sales-metrics crm-status-metrics',style:{'--summary-columns':Math.min(4,cards.length)},'aria-label':th?'สรุปสถานะ'+name:name+' status summary'},cards.map(({status,count})=>h('div',{className:'crm-master-form',key:status??'total','data-summary-status':status??'total'},h('span',null,status===null?(th?name+'ทั้งหมด':'Total '+name):status?recordOptionLabel(entity,'status',status,lang):(th?'ไม่ระบุสถานะ':'Not specified')),h('p',null,new Intl.NumberFormat(th?'th-TH':'en-US').format(count)))));
 };
}
