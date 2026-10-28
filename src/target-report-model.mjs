// Presentation calculations; consume only the already-authorized target response.
export function bangkokMonth(now=new Date()) {
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).formatToParts(now);
 return parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;
}
const sum=rows=>rows.reduce((n,r)=>n+r,0);
const number=value=>value==null||!Number.isFinite(Number(value))?null:Number(value);
function combine(values){return values.length&&values.every(v=>v!==null)?sum(values):null;}
function total(rows){return {target:combine(rows.map(r=>r.target)),actual:combine(rows.map(r=>r.actual))};}
function decorate(row,current,future=false){
 const attainment=row.target>0&&row.actual!==null?row.actual/row.target:null;
 const status=future?'future':row.target===null?'unassigned':row.target===0?'zeroTarget':current?'current':attainment>=1?'met':row.actual===0?'noSales':row.actual===null?'unknown':'below';
 return {...row,attainment:future?null:attainment,delta:future||row.target===null||row.actual===null?null:row.actual-row.target,status};
}
export function targetReportDetails(data,{from='',to='',scope='company',now=new Date()}={}){
 const current=bangkokMonth(now),months=(data?.months||[]).filter(m=>(!from||m.month.slice(0,7)>=from)&&(!to||m.month.slice(0,7)<=to)).slice().sort((a,b)=>a.month.localeCompare(b.month));
 function values(m,id){if(id==='company')return {target:number(m.company_target),actual:number(m.company_actual)};const es=(m.employees||[]).filter(e=>id==='team'||e.profile_id===id);return {target:combine(es.map(e=>number(e.target))),actual:combine(es.map(e=>number(e.actual)))};}
 const rows=months.map(m=>{const month=m.month.slice(0,7),v=values(m,scope);return decorate({month,...v,actual:month>current?null:v.actual},month===current,month>current);});
 const closedRows=rows.filter(r=>r.month<current),closed=decorate(total(closedRows),false);
 const people=(data?.people||[]).filter(p=>['company','team'].includes(scope)||p.id===scope).map(p=>{
 const selected=months.map(m=>values(m,p.id)),started=months.filter(m=>m.month.slice(0,7)<=current).map(m=>values(m,p.id));
 const v={target:total(selected).target,actual:total(started).actual};
 return {...p,...decorate(v,months.some(m=>m.month.slice(0,7)>=current),!started.length)};
 });
 return {rows,closed,closedRows,people,current};
}
export function filterReportPeople(people,{query='',status='',sort='actual'}={}){
 return people.filter(p=>(!query||p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))&&(!status||p.status===status)).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='attainment'?(b.attainment??-Infinity)-(a.attainment??-Infinity)||(a.name.localeCompare(b.name)):(b.actual??-Infinity)-(a.actual??-Infinity)||a.name.localeCompare(b.name));
}
export function targetDetailsCSV(rows){return '\uFEFFmonth,target_thb,actual_so_net_thb,delta_thb,attainment_percent,status\r\n'+rows.map(r=>[r.month,r.target??'',r.actual??'',r.delta??'',r.attainment===null?'':(r.attainment*100).toFixed(1),r.status].join(',')).join('\r\n');}
