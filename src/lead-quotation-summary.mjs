const sentStatuses=new Set(['sent','accepted']);
export function attachLeadQuotations(leads,quotes=[],opportunities=[],followups=[],available=true){
 const byId=new Map(leads.map(l=>[l.id,l])),byCustomer=new Map(),opps=new Map(opportunities.map(o=>[o.id,o.lead_id])),sent=new Set(followups.filter(f=>f.sent_at).map(f=>f.quotation_id)),docs=new Map();
 for(const l of leads)if(l.customer_id&&!l.duplicate_of){const group=byCustomer.get(l.customer_id)||[];group.push(l);byCustomer.set(l.customer_id,group);}
 for(const q of quotes){let targets=[];const direct=opps.get(q.opportunity_id);if(direct){const l=byId.get(direct);if(l&&(!l.customer_id||l.customer_id===q.customer_id))targets=[l];}else{const group=byCustomer.get(q.customer_id)||[];const contacts=q.contact_id?group.filter(l=>l.converted_contact_id===q.contact_id):[];if(contacts.length===1)targets=contacts;else if(group.length===1)targets=group;}
  for(const l of targets){const primary=l.duplicate_of?byId.get(l.duplicate_of):l;if(!primary)continue;const list=docs.get(primary.id)||new Map();list.set(q.id,{id:q.id,code:q.code,status:q.status,issue_date:q.issue_date,total:q.total,sent:sentStatuses.has(q.status)||sent.has(q.id)});docs.set(primary.id,list);}
 }
 return leads.map(l=>{const items=[...(docs.get(l.id)?.values()||[])];return {...l,quotation_summary:{available,items,count:items.length,sent_count:items.filter(q=>q.sent).length}};});
}
export function leadMatchesStatus(row,status){
 if(status==='proposed')return row.quotation_summary?.available===true&&row.quotation_summary.count>0;
 if(status==='has_quotation')return row.quotation_summary?.available===true&&row.quotation_summary.count>0;
 return null;
}
