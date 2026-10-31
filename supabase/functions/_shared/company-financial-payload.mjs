// Normalized contract for a future licensed provider adapter. Never fetches a URL or accepts credentials.
export function normalizeCompanyFinancialPayload(payload,expectedTaxId){
 const id=String(payload?.tax_id||'');let sum=0;if(!/^0\d{12}$/.test(id)||id==='0000000000000')throw Error('INVALID_TAX_ID');for(let i=0;i<12;i++)sum+=Number(id[i])*(13-i);if((11-sum%11)%10!==Number(id[12])||id!==expectedTaxId)throw Error('TAX_ID_MISMATCH');
 const text=(v,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('INVALID_SOURCE');return v.trim();};
 const date=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v||'')||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw Error('INVALID_DATE');return v;};
 const amount=(v,nonnegative=false)=>{if(v==null)return null;if(typeof v!=='string'||!/^[-]?(0|[1-9]\d{0,21})(\.\d{1,2})?$/.test(v)||nonnegative&&v.startsWith('-'))throw Error('INVALID_AMOUNT');return v;};
 if(payload.currency!=='THB'||payload.amount_unit!=='baht'||payload.year_calendar!=='gregorian')throw Error('EXPLICIT_UNITS_REQUIRED');
 const provider=text(payload.source_provider,100),reference=text(payload.source_reference,500),asOf=date(payload.source_as_of);
 const profile={tax_id:id,company_name:text(payload.company_name,500),registered_capital:amount(payload.registered_capital,true),source_provider:provider,source_reference:reference,source_as_of:asOf,currency:'THB'};
 if(!Array.isArray(payload.statements)||payload.statements.length>20)throw Error('INVALID_STATEMENTS');
 const seen=new Set(),statements=payload.statements.map(s=>{if(!Number.isInteger(s.fiscal_year)||s.fiscal_year<1900||s.fiscal_year>2200||!['standalone','consolidated'].includes(s.statement_scope))throw Error('INVALID_YEAR_OR_SCOPE');const key=s.fiscal_year+':'+s.statement_scope;if(seen.has(key))throw Error('DUPLICATE_YEAR');seen.add(key);const start=date(s.period_start),end=date(s.period_end);if(end<start)throw Error('INVALID_PERIOD');return {tax_id:id,fiscal_year:s.fiscal_year,statement_scope:s.statement_scope,period_start:start,period_end:end,currency:'THB',...Object.fromEntries(['revenue','expenses','net_profit','assets','liabilities','equity'].map(k=>[k,amount(s[k],['assets','liabilities'].includes(k))])),source_provider:provider,source_reference:text(s.source_reference||reference,500),source_as_of:date(s.source_as_of||asOf)};});
 return {profile,statements};
}
