// Missing kind on historical documents retains the standard quotation default.
export function matchesQuotationType(row,kind='',period=''){
 const actual=row.quotation_kind||'standard';
 return (!kind||actual===kind)&&(kind!=='recurring'||!period||(row.items||[]).some(item=>item.billing_period===period));
}
