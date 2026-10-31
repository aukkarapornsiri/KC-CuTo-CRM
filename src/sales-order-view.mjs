export const bangkokToday=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function filterOrders(rows,{query='',scope='all',owner='',approval='',due='',status='',userId}={},approvals={},now=new Date()){
 const today=bangkokToday(now),needle=query.trim().toLocaleLowerCase();
 return rows.filter(r=>(!status||r.status===status)&&(scope!=='mine'||!!userId&&r.owner_id===userId)&&(!owner||r.owner_id===owner)&&(!approval||(approvals[r.id]?.status||'none')===approval)&&(!needle||[r.code,r.quotation_code,r.po_number,r.customer_name,r.owner_name].join(' ').toLocaleLowerCase().includes(needle))&&(!due||(due==='today'?r.expected_delivery_date===today:due==='month'?String(r.expected_delivery_date||'').slice(0,7)===today.slice(0,7):due==='overdue'?r.status==='confirmed'&&!!r.expected_delivery_date&&r.expected_delivery_date<today:false)));
}
export function orderMetrics(rows,approvals={},now=new Date()){
 return {total:rows.length,pending:rows.filter(r=>approvals[r.id]?.status==='pending').length,delivery:rows.filter(r=>r.status==='confirmed').length,overdue:filterOrders(rows,{due:'overdue'},approvals,now).length};
}
