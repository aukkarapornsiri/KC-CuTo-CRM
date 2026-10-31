const DAY=86400000,closed=new Set(['completed','cancelled','closed','resolved']),norm=v=>String(v||'').trim().toLowerCase(),stamp=v=>{const n=Date.parse(v||'');return Number.isFinite(n)?n:null;};
export function customerHealth(customer,data,now=new Date()){
 const at=+now,dimensions=[],risks=[];
 const add=(key,weight,available,penalty,reason,rows=[],source)=>{dimensions.push({key,weight,available,penalty:available?penalty:null,reason,rows,source});if(available&&penalty>0)risks.push({key,penalty,reason,rows,source});};
 const activities=Array.isArray(data.activities)?data.activities:null,contacts=Array.isArray(data.contacts)?data.contacts:null;
 const calls=(activities||[]).filter(r=>norm(r.status)==='completed'&&['Call','Email','Meeting','Online Meeting','Visit','Demo','LINE Contact','Proposal Follow-up','Renewal Follow-up','Service Follow-up'].includes(r.type)&&stamp(r.scheduled_at)!==null&&stamp(r.scheduled_at)<=at).sort((a,b)=>stamp(b.scheduled_at)-stamp(a.scheduled_at));
 const age=(at-(stamp(calls[0]?.scheduled_at)??stamp(customer.created_at)??at))/DAY;
 add('engagement',15,activities!==null,age>60?15:age>30?8:0,calls.length?'last_contact':'no_contact',calls.slice(0,1),'activities');
 const overdue=(activities||[]).filter(r=>!closed.has(norm(r.status))&&stamp(r.scheduled_at)!==null&&stamp(r.scheduled_at)<at);
 add('followup',25,activities!==null,overdue.length?Math.min(25,10+overdue.length*5):0,'overdue_tasks',overdue,'activities');
 const cases=Array.isArray(data.tickets)?data.tickets:null,aged=(cases||[]).filter(r=>!closed.has(norm(r.status))&&stamp(r.created_at)!==null&&at-stamp(r.created_at)>14*DAY);
 add('service',15,cases!==null,aged.length?15:0,'aged_cases',aged,'tickets');
 const contracts=Array.isArray(data.contracts)?data.contracts:null,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),until=new Date(Date.parse(today+'T00:00:00Z')+30*DAY).toISOString().slice(0,10);
 const renewals=(contracts||[]).filter(r=>norm(r.status)==='active'&&r.end_date>=today&&r.end_date<=until&&!activities?.some(a=>a.related_module==='contracts'&&a.related_id===r.id&&!closed.has(norm(a.status))&&stamp(a.scheduled_at)>=at));
 add('renewal',15,contracts!==null&&activities!==null,renewals.length?15:0,'renewals_unplanned',renewals,'contracts');
 const orders=Array.isArray(data.orders)?data.orders:null,unique=new Map();for(const r of orders||[]){const key=[r.source_system,r.source_so_id||r.id].join(':');const old=unique.get(key);if(!old||String(r.source_updated_at||r.synced_at||'')>=String(old.source_updated_at||old.synced_at||''))unique.set(key,r);}
 const valid=[...unique.values()].filter(r=>norm(r.status)==='converted'&&r.currency==='THB'&&Number.isFinite(Number(r.net_amount))&&Number(r.net_amount)>=0&&stamp(r.converted_at)!==null&&stamp(r.converted_at)<=at),recent=valid.filter(r=>at-stamp(r.converted_at)<=90*DAY),prior=valid.filter(r=>at-stamp(r.converted_at)>90*DAY&&at-stamp(r.converted_at)<=180*DAY),total=rows=>rows.reduce((n,r)=>n+Number(r.net_amount),0),baseline=total(prior),current=total(recent);
 const invalid=(orders||[]).some(r=>norm(r.status)==='converted'&&r.currency==='THB'&&(!Number.isFinite(Number(r.net_amount))||r.net_amount==null||r.net_amount===''||Number(r.net_amount)<0||stamp(r.converted_at)===null||stamp(r.converted_at)>at));
 add('purchases',20,orders!==null&&!invalid,baseline>0&&current<baseline*.5?20:0,baseline>0?'purchase_trend':'no_purchase_baseline',valid,'orders');
 const active=(contacts||[]).filter(c=>norm(c.status)!=='inactive'),decision=active.some(c=>['decision maker','approver','executive'].includes(norm(c.role)));
 add('stakeholders',10,contacts!==null,active.length===0?10:!decision?5:0,active.length===0?'no_contacts':'decision_role',active,'contacts');
 const coverage=dimensions.filter(d=>d.available).reduce((n,d)=>n+d.weight,0),score=coverage<50?null:100-risks.reduce((n,r)=>n+r.penalty,0),level=score===null?'unknown':coverage<100?'partial':score<50?'high':score<75?'watch':'healthy';
 return {version:1,score,coverage,level,risks:risks.sort((a,b)=>b.penalty-a.penalty),dimensions,lastContact:calls[0]||null,overdue,agedCases:aged,renewals,purchase:{current,baseline,available:orders!==null&&!invalid},asOf:now.toISOString()};
}
export function defaultCustomerView(profile){if(profile?.is_super_admin)return 'executive';const role=profile?.role==='custom'?profile.custom_role_key:profile?.role;return ['sales_director','executive','ceo','management'].includes(role)?'executive':['sales_manager','manager','department_head'].includes(role)?'manager':'sales';}
