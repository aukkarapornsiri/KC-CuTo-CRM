// Assignment is determined by the recipient, never the person who will assign.
// Closed lead outcomes remain closed even if their owner is later removed.
export function leadSummaryStatus(row){
 const status=String(row.status??'').trim().toLowerCase();
 if(['converted','disqualified'].includes(status))return status;
 if(!String(row.owner_id??'').trim())return 'new';
 return status==='new'?'assign':status;
}
