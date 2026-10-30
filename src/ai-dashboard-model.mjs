// Evidence-based rules; priority is not a model confidence or probability.
export const SOURCES={
 opportunities:'id,code,name,customer_id,customer_name,owner_id,owner_name,status,stage,amount,close_date,next_action,updated_at',
 contracts:'id,code,name,customer_id,customer_name,owner_id,owner_name,status,renewal_status,value,end_date,updated_at',
 tickets:'id,code,subject,customer_id,customer_name,assigned_to_id,assigned_to_name,status,sla_deadline,sla_breached,paused_at,updated_at'
};
export const bangkokDay=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const date=value=>/^\d{4}-\d{2}-\d{2}/.test(value||'')&&Number.isFinite(Date.parse(value))?value.slice(0,10):null;
const money=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
const closed=r=>[r.status,r.stage].some(x=>['won','lost','closed','cancelled','canceled','resolved','completed','renewed','terminated'].includes(String(x||'').toLowerCase()));
export function analyzeSources(data,now=new Date()){
 const today=bangkokDay(now),end=new Date(today+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+30);const until=end.toISOString().slice(0,10),rows=[];
 function add(module,r,reasons,due,priority){if(!reasons.length)return;rows.push({id:module+':'+r.id,recordId:r.id,module,code:r.code||r.id,title:r.name||r.subject||r.code,customer:r.customer_name||'',customerId:r.customer_id,ownerId:r.owner_id||r.assigned_to_id||'',owner:r.owner_name||r.assigned_to_name||'',amount:module==='tickets'?null:money(r.amount??r.value),due,priority,reasons,updated:r.updated_at||null});}
 for(const r of data.opportunities||[]){if(closed(r))continue;const due=date(r.close_date),reasons=[];if(due&&due<today)reasons.push('late_deal');if(!String(r.next_action||'').trim())reasons.push('no_next_step');if(!due)reasons.push('no_close_date');add('opportunities',r,reasons,due,reasons.includes('late_deal')?'high':'medium');}
 for(const r of data.contracts||[]){if(closed(r)||['renewed','cancelled'].includes(String(r.renewal_status||'').toLowerCase()))continue;const due=date(r.end_date);if(due&&due<=until)add('contracts',r,[due<today?'expired_contract':'expiring_contract'],due,due<=today?'high':'medium');}
 for(const r of data.tickets||[]){if(closed(r)||r.paused_at)continue;const deadline=r.sla_deadline?Date.parse(r.sla_deadline):NaN;if(r.sla_breached===true||Number.isFinite(deadline)&&deadline<now.getTime())add('tickets',r,['sla_breach'],date(r.sla_deadline),'high');}
 return rows.sort((a,b)=>(a.priority==='high'?0:1)-(b.priority==='high'?0:1)||(a.due||'9999').localeCompare(b.due||'9999')||(b.amount||0)-(a.amount||0)||a.id.localeCompare(b.id));
}
export function filterInsights(rows,f={},today=bangkokDay()){
 const q=String(f.search||'').trim().toLocaleLowerCase();return rows.filter(r=>(!f.module||r.module===f.module)&&(!f.priority||r.priority===f.priority)&&(!f.owner||r.ownerId===f.owner)&&(f.period!=='overdue'||r.due&&r.due<today)&&(f.period!=='undated'||!r.due)&&(!q||[r.code,r.title,r.customer,r.owner,...r.reasons].join(' ').toLocaleLowerCase().includes(q)));
}
export function summarizeInsights(rows){const deals=rows.filter(r=>r.module==='opportunities'),late=deals.filter(r=>r.reasons.includes('late_deal'));return {total:rows.length,high:rows.filter(r=>r.priority==='high').length,lateDeals:late.length,lateDealValue:late.reduce((n,r)=>n+r.amount,0),renewals:rows.filter(r=>r.module==='contracts').length,sla:rows.filter(r=>r.module==='tickets').length,missingNext:deals.filter(r=>r.reasons.includes('no_next_step')).length};}
export async function loadSources(client,can,signal){
 const entries=await Promise.all(Object.entries(SOURCES).map(async([table,columns])=>{
  if(!can(table,'view'))return [table,{status:'restricted',rows:[]}];
  try{const rows=[];let offset=0;while(true){const {data,error}=await client.from(table).select(columns).order('id').range(offset,offset+499).abortSignal(signal);if(error)throw error;if(signal?.aborted)throw Error('aborted');rows.push(...data||[]);if((data||[]).length<500)break;offset+=500;}return [table,{status:'ready',rows}];}catch{return [table,{status:'error',rows:[]}];}
 }));return Object.fromEntries(entries);
}
