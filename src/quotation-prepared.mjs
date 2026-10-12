import {resolvePaymentTerm} from './quotation-payment-terms.mjs';
const clean=value=>String(value??'').trim();
const identity=value=>clean(value).normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase();
export function quotationPreparedRows(editing,template={},lang='th'){
 const tr=(th,en)=>lang==='th'?th:en;
 const prepared=clean(editing.prepared_by),sales=clean(editing.owner_name);
 const samePerson=prepared&&sales&&identity(prepared)===identity(sales);
 const hasTerm=clean(editing.payment_term_code)||editing.payment_terms!=null&&clean(editing.payment_terms)!=='';
 return [
  [tr('เบอร์โทรผู้จัดทำ','Prepared phone'),editing.prepared_by_phone],
  [tr('ผู้จัดทำ','Prepared by'),prepared],
  [tr('พนักงานขาย','Salesperson'),samePerson?'':sales],
  [tr('อีเมลผู้จัดทำ','Prepared email'),editing.prepared_by_email],
  [tr('แผนก / โครงการ','Department / Project'),editing.project_name],
  [tr('อ้างอิงเอกสาร','Reference'),editing.reference_document],
  [tr('เครดิต (วัน)','Credit (days)'),hasTerm?resolvePaymentTerm(editing.payment_term_code,editing.payment_terms)[lang==='th'?'th':'en']:''],
  ['LINE',editing.document_profile?.line_id??template.sales_line]
 ].map(([label,value])=>[label,clean(value)]).filter(([,value])=>value&&value!=='—'&&value!=='-');
}
