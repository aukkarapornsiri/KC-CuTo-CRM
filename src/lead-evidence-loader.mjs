import {attachLeadOutcomes} from './lead-sales-outcome.mjs';
import {attachLeadQuotations} from './lead-quotation-summary.mjs';
export async function loadLeadEvidence(leads,{read,canOpportunities,canQuotations}){
 const [opps,quotes,followups]=await Promise.allSettled([
  canOpportunities?read('opportunities','id,lead_id,name,status'):Promise.resolve([]),
  canQuotations?read('quotations','id,code,customer_id,contact_id,opportunity_id,status,issue_date,total'):Promise.resolve([]),
  canQuotations?read('crm_quotation_followups','quotation_id,sent_at'):Promise.resolve([])
 ]);
 const salesAvailable=canOpportunities&&opps.status==='fulfilled',quotationAvailable=canQuotations&&quotes.status==='fulfilled'&&followups.status==='fulfilled';
 const opportunities=opps.status==='fulfilled'?opps.value:[];
 const rows=attachLeadOutcomes(leads,opportunities,salesAvailable);
 return {rows:attachLeadQuotations(rows,quotationAvailable?quotes.value:[],opportunities,quotationAvailable?followups.value:[],quotationAvailable),salesFailed:canOpportunities&&!salesAvailable,quotationsFailed:canQuotations&&!quotationAvailable};
}
