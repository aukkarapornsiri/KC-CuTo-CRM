// Summarize the filtered, authorized list before pagination. Never mix currencies.
export function quotationSummary(rows){
 const totals=new Map(),approved=new Map();let accepted=0;
 const add=(map,currency,value)=>map.set(currency,(map.get(currency)||0)+value);
 for(const row of rows){
  const currency=String(row.currency||'THB').trim().toUpperCase()||'THB';
  const amount=Number(row.total??row.net_total??0),value=Number.isFinite(amount)?amount:0;
  add(totals,currency,value);
  if(row.status==='approved'||row.approval_status==='approved')add(approved,currency,value);
  if(row.status==='accepted')accepted++;
 }
 for(const currency of totals.keys())if(!approved.has(currency))approved.set(currency,0);
 return {count:rows.length,totals:[...totals],approved:[...approved],acceptanceRate:rows.length?accepted/rows.length*100:0};
}
