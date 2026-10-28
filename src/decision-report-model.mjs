// All opportunity inputs must already be constrained by database RLS.
export const bangkokDay=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const amount=v=>Number.isFinite(Number(v))?Number(v):0;
const day=v=>/^\d{4}-\d{2}-\d{2}/.test(String(v||''))?String(v).slice(0,10):'';
const days=(a,b)=>Math.floor((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);
export function salesScope(data,owner,month){
 const scope=owner||data?.scope||'self',people=data?.people||[];
 const rows=(data?.months||[]).map(m=>{
  const members=(m.employees||[]).filter(e=>owner?e.profile_id===owner:people.some(p=>p.id===e.profile_id));
  const company=scope==='company';const complete=members.length>0&&members.every(e=>e.target!=null);
  return {month:String(m.month).slice(0,7),target:company?(m.company_target==null?null:amount(m.company_target)):complete?members.reduce((n,e)=>n+amount(e.target),0):null,actual:company?(m.company_actual==null?null:amount(m.company_actual)):members.length?members.reduce((n,e)=>n+amount(e.actual),0):null};
 });
 const selected=rows.find(r=>r.month===month)||{month,target:null,actual:null};
 const remaining=selected.target==null||selected.actual==null?null:Math.max(0,selected.target-selected.actual);
 return {...selected,remaining,attainment:selected.target>0&&selected.actual!=null?selected.actual/selected.target:null,trend:rows.filter(r=>r.month<=month).slice(-6)};
}
export function decisionMetrics(rows,{month,owner='',today=bangkokDay()}={}){
 const scoped=rows.filter(r=>!owner||r.owner_id===owner);
 const period=scoped.filter(r=>day(r.close_date).slice(0,7)===month);
 const open=period.filter(r=>r.status==='open'),closed=period.filter(r=>r.status==='won'||r.status==='lost'),won=closed.filter(r=>r.status==='won');
 const risks=open.map(r=>{
  const late=day(r.close_date)&&day(r.close_date)<today?days(today,day(r.close_date)):0;
  const updated=day(r.updated_at),stale=updated&&updated<=today?days(today,updated):0;
  const reason=late?'overdue':stale>=14?'stale':!String(r.next_action||'').trim()?'no-next':null;
  return reason?{record:r,reason,days:reason==='overdue'?late:reason==='stale'?stale:0}:null;
 }).filter(Boolean).sort((a,b)=>({overdue:0,stale:1,'no-next':2}[a.reason]-{overdue:0,stale:1,'no-next':2}[b.reason])||amount(b.record.amount)-amount(a.record.amount)||String(a.record.id).localeCompare(String(b.record.id)));
 const stageMap=new Map();for(const r of open){const key=r.stage||'';const s=stageMap.get(key)||{key,count:0,value:0};s.count++;s.value+=amount(r.amount);stageMap.set(key,s);}
 return {period,open,won:won.length,closed:closed.length,winRate:closed.length?won.length/closed.length:null,pipeline:open.reduce((n,r)=>n+amount(r.amount),0),weighted:open.reduce((n,r)=>n+amount(r.amount)*Math.min(100,Math.max(0,amount(r.probability)))/100,0),risks,riskValue:risks.reduce((n,r)=>n+amount(r.record.amount),0),stages:[...stageMap.values()].sort((a,b)=>b.value-a.value),missingDates:scoped.filter(r=>!day(r.close_date)).length};
}
export async function readReportOpportunities(client){const rows=[];for(let offset=0;offset<20000;offset+=500){const r=await client.from('opportunities').select('*').order('id').range(offset,offset+499);if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<500)return rows;}throw new Error('Report exceeds 20,000 records');}

// Read-only RPC must not invalidate other queued report reads as a POST would.
export function readReportTargets(client,year){return client.rpc('crm_get_sales_targets',{p_year:year},{get:true});}
