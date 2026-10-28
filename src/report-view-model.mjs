// Report-only filters. The caller supplies records already scoped by database RLS.
export const REPORT_VALUE_KEYS={opportunities:'amount',quotations:'total',contracts:'value'};
export const REPORT_DATE_KEYS={opportunities:'close_date',contracts:'end_date',activities:'scheduled_at'};
export function filterReportRows(rows,{owner='',from='',to='',query='',status='',dateKey='created_at'}={}){
 const needle=query.trim().toLocaleLowerCase();
 return rows.filter(r=>{
  const date=String(r[dateKey]||'').slice(0,10);
  return (!owner||(r.owner_name||r.assigned_to_name)===owner)&&(!from||(date&&date>=from))&&(!to||(date&&date<=to))&&(!status||r.status===status)&&(!needle||[r.code,r.customer_name,r.name,r.subject,r.company_name,r.owner_name,r.assigned_to_name].some(v=>String(v||'').toLocaleLowerCase().includes(needle)));
 });
}
export function groupReportRows(rows,group,valueKey){
 const groups=new Map();
 for(const r of rows){const key=String((group==='owner_name'?r.owner_name||r.assigned_to_name:r[group])||'');const v=groups.get(key)||{count:0,value:0};v.count++;v.value+=Number(r[valueKey]||0);groups.set(key,v);}
 return [...groups].map(([key,value])=>({key,...value})).sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key));
}
export const reportTone=status=>['lost','cancelled','rejected','disqualified'].includes(String(status).toLowerCase())?'negative':['won','completed','active','approved','accepted','resolved'].includes(String(status).toLowerCase())?'positive':'neutral';
