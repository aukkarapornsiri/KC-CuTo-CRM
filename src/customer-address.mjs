// Shared by quotation creation, editing and Account 360. Supports legacy rows
// whose street already contains the remaining structured address components.
export function formatCustomerAddress(customer={}) {
 return [...new Set([customer.address,customer.billing_city,customer.province,customer.billing_postal_code,customer.billing_country]
  .flatMap(value=>String(value||'').split(',')).map(value=>value.trim()).filter(Boolean))].join(', ');
}
export function quotationAddressPatch(quotation,customer) {
 if(!customer||quotation.id&&(quotation.status!=='draft'||['pending','approved'].includes(quotation.approval_status)))return {};
 if(quotation.address_source==='custom')return {};
 const address=formatCustomerAddress(customer),current=String(quotation.counterparty_address||'').trim();
 if(quotation.address_source==='customer'||!current||['thailand','ไทย','ประเทศไทย'].includes(current.toLowerCase())||current===address)
  return {counterparty_address:address,address_source:'customer'};
 return {};
}
