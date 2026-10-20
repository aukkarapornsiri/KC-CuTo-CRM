export const LEAD_STATUS_LABELS={new:['ใหม่','New'],review:['รอตรวจสอบ','Review'],assign:['มอบหมายแล้ว','Assigned'],proposed:['เสนอราคาแล้ว','Proposed'],contacted:['ติดต่อแล้ว','Contacted'],qualified:['ผ่านการคัดกรอง','Qualified'],disqualified:['ไม่ผ่านการคัดกรอง','Disqualified'],'follow':['กำลังติดตาม','Follow-up'],converted:['แปลงเป็นลูกค้าแล้ว','Converted']};
export const leadStatusLabel=(status,lang='th')=>LEAD_STATUS_LABELS[status]?.[lang==='th'?0:1]||status||'—';
export function sortLeadsNewest(rows){
 const time=x=>Number.isFinite(Date.parse(x.created_at))?Date.parse(x.created_at):0;
 return [...rows].sort((a,b)=>time(b)-time(a)||String(b.code||'').localeCompare(String(a.code||''),undefined,{numeric:true})||String(b.id||'').localeCompare(String(a.id||'')));
}
export function nextLeadStatus(current,entity,record){
 if(!['new','review','assign','contacted','follow'].includes(current))return current;
 if(entity==='opportunities'&&record.lead_id)return 'qualified';
 if(entity==='activities'&&record.related_module==='leads'&&record.related_id){
  if(['planned','in-progress'].includes(record.status))return 'follow';
  if(record.status==='completed'&&current==='new')return 'contacted';
 }
 return current;
}
export function leadActionSeed(entity,params={}){
 if(entity==='activities'&&params.leadId)return {related_module:'leads',related_id:params.leadId,customer_id:params.sourceCustomerId||params.customerId||'',subject:params.sourceSubject||'',type:'Call',status:'planned'};
 if(entity==='opportunities'&&params.sourceLeadId)return {lead_id:params.sourceLeadId,customer_id:params.sourceCustomerId||'',contact_id:params.sourceContactId||'',name:params.sourceName||''};
 return null;
}
export function leadLinkPatch(entity,record){
 if(entity==='activities'&&record.related_module==='leads'&&record.related_id)return {related_module:'leads',related_id:record.related_id};
 if(entity==='opportunities'&&record.lead_id)return {lead_id:record.lead_id};
 return {};
}

export function formatLeadDate(value){
 if(!value||!Number.isFinite(Date.parse(value)))return '—';
 return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(value));
}
