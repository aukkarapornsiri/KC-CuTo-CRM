export function quotationContact(quotation,customer,contacts=[]){
 const eligible=contacts.filter(c=>c.customer_id===quotation.customer_id&&c.status!=='inactive'&&!c.deleted_at);
 const selected=quotation.contact_id?eligible.find(c=>c.id===quotation.contact_id):eligible.find(c=>c.is_primary);
 return {name:selected?.name||'',phone:selected?.phone||customer?.phone||'',email:selected?.email||customer?.email||''};
}
