// Read-only sales outcomes: never overwrite the stored lead lifecycle or owner.
export function attachLeadOutcomes(leads,opportunities=[],available=true){
 const byId=new Map(leads.map(l=>[l.id,l])),groups=new Map();
 for(const o of opportunities){const source=byId.get(o.lead_id),lead=source?.duplicate_of?byId.get(source.duplicate_of):source;if(!lead)continue;const docs=groups.get(lead.id)||new Map();docs.set(o.id,{id:o.id,name:o.name,status:o.status});groups.set(lead.id,docs);}
 return leads.map(l=>{const items=[...(groups.get(l.id)?.values()||[])];return {...l,sales_outcome:{available,items,won:items.some(o=>o.status==='won')}};});
}
export function leadOutcomeLabel(row,lang='th'){
 const t=(a,b)=>lang==='th'?a:b,s=row.sales_outcome;
 if(!s?.available)return t('ผลการขาย: ยังตรวจสอบไม่ได้','Sales outcome: unavailable');
 if(s.won)return t('ปิดการขายสำเร็จ (Won)','Closed Won');
 if(!s.items.length)return t('ยังไม่มีโอกาสการขายเชื่อมโยง','No linked opportunity');
 return t('ยังไม่ Won','Not yet Won');
}
