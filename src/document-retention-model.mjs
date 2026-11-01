export const DOCUMENT_BUCKETS=['crm-documents','crm-sales-orders','crm-quotation-assets'];
export function validateRetention(rule){
 if(!DOCUMENT_BUCKETS.includes(rule.bucket_id))throw Error('Invalid document bucket');
 const days=Number(rule.retention_days),hour=Number(rule.run_hour);
 if(!Number.isInteger(days)||days<7||days>3650)throw Error('Retention must be 7–3650 days');
 if(!Number.isInteger(hour)||hour<0||hour>23)throw Error('Hour must be 0–23');
 return {bucket_id:rule.bucket_id,retention_days:days,run_hour:hour,enabled:rule.enabled===true};
}
export function dateBounds(from,to){
 const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 if((from&&!valid(from))||(to&&!valid(to))||(from&&to&&from>to))throw Error('Invalid date range');
 return {p_from:from?from+'T00:00:00+07:00':null,p_to:to?new Date(Date.parse(to+'T00:00:00+07:00')+86400000).toISOString():null};
}
