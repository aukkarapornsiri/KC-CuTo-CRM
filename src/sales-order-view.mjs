export const bangkokToday=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function filterOrders(rows,{query='',scope='all',owner='',approval='',due='',status='',userId}={},approvals={},now=new Date()){
 const today=bangkokToday(now),needle=query.trim().toLocaleLowerCase();
 return rows.filter(r=>(!status||r.status===status)&&(scope!=='mine'||!!userId&&r.owner_id===userId)&&(!owner||r.owner_id===owner)&&(!approval||(approvals[r.id]?.status||'none')===approval)&&(!needle||[r.code,r.quotation_code,r.po_number,r.customer_name,r.owner_name].join(' ').toLocaleLowerCase().includes(needle))&&(!due||(due==='today'?r.expected_delivery_date===today:due==='month'?String(r.expected_delivery_date||'').slice(0,7)===today.slice(0,7):due==='overdue'?r.status==='confirmed'&&!!r.expected_delivery_date&&r.expected_delivery_date<today:false)));
}
export function orderMetrics(rows,approvals={},now=new Date()){
 return {total:rows.length,pending:rows.filter(r=>approvals[r.id]?.status==='pending').length,delivery:rows.filter(r=>r.status==='confirmed').length,overdue:filterOrders(rows,{due:'overdue'},approvals,now).length};
}

const amount=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
export function orderFinancialSummaries(rows,financials={},canFinancial=false){
 const groups=new Map();
 for(const row of rows){const currency=row.currency||'THB';if(!groups.has(currency))groups.set(currency,[]);groups.get(currency).push(row);}
 if(!groups.size)groups.set('THB',[]);
 return [...groups].map(([currency,orders])=>{
  const sum=read=>{const values=orders.map(read);return values.every(v=>v!==null)?values.reduce((a,b)=>a+b,0):null;};
  const sales=sum(r=>{const subtotal=amount(r.subtotal),discount=amount(r.discount??0);return subtotal===null||discount===null?null:subtotal-discount;});
  const cost=canFinancial?sum(r=>{const f=financials[r.id];if(amount(f?.cost_total)!==null)return amount(f.cost_total);const lines=f?.line_financials;return Array.isArray(lines)&&lines.length>0&&lines.every(l=>amount(l.cost_total)!==null)?lines.reduce((n,l)=>n+Number(l.cost_total),0):null;}):null;
  const gp=sales===null||cost===null?null:sales-cost;
  return {currency,sales,cost,gp,margin:gp===null||!sales?null:gp/sales*100,vat:sum(r=>amount(r.vat)),total:sum(r=>amount(r.total))};
 });
}
