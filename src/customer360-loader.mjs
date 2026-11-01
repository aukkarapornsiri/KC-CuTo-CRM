import {customerOrderReconciliation} from './customer360-reconciliation.mjs';
import {sortRecordsNewest} from './record-order.mjs';
import {SOURCES,identityGroup} from './customer360-model.mjs';
export const CUSTOMER_COLUMNS='id,code,name,tax_id,email,phone,owner_id,owner_name,status,industry,tier,address,billing_city,province,billing_postal_code,billing_country,created_at,updated_at';
const columns={contacts:'id,name,customer_id,position,department,role,influence_level,reports_to_id,status,email,phone,created_at,updated_at',branches:'id,name,customer_id,address,status,created_at,updated_at',leads:'id,code,company_name,customer_id,status,created_at,updated_at,converted_at',opportunities:'id,name,customer_id,lead_id,stage,amount,status,created_at,updated_at',quotations:'id,code,customer_id,opportunity_id,status,approval_status,owner_name,total,currency,valid_until,created_at,updated_at',contracts:'id,code,name,customer_id,status,end_date,created_at,updated_at',assets:'id,name,customer_id,status,serial_number,created_at,updated_at',tickets:'id,code,subject,customer_id,status,created_at,updated_at,resolved_at',activities:'id,subject,type,customer_id,related_module,related_id,status,created_at,updated_at,scheduled_at,description,next_action,owner_name',documents:'id,name,customer_id,status,created_at,updated_at',orders:'id,so_number,customer_id,net_amount,currency,status,converted_at,source_system,source_so_id,customer_source_id,source_updated_at,synced_at,native_order_id,reconciliation,fact_amount'};
export const CORE_SOURCES=['contacts','leads','opportunities','quotations','contracts','tickets','activities','orders'];
export async function readCustomerPages(client,table,cols,configure=q=>q){let rows=[];for(let n=0;n<20000;n+=500){const response=await configure(client.from(table).select(cols)).order('id').range(n,n+499);if(response.error)throw response.error;rows.push(...response.data);if(response.data.length<500)return sortRecordsNewest(rows);}throw Error('More than 20,000 records; narrow the customer query');}
export async function customerGroup({client,demoMode,records,recordId}){
 if(demoMode){const all=records.customer360_links||[],group=identityGroup(recordId,all);return {group,links:all.filter(x=>group.ids.includes(x.customer_id)||x.canonical_id===group.root),members:records.customers.filter(x=>group.ids.includes(x.id))};}
 const own=await readCustomerPages(client,'crm_customer_identity_links','id,customer_id,canonical_id,linked_at',q=>q.eq('customer_id',recordId));
 const root=own[0]?.canonical_id||recordId;
 const links=await readCustomerPages(client,'crm_customer_identity_links','id,customer_id,canonical_id,linked_at',q=>q.eq('canonical_id',root));
 const group={root,ids:[...new Set([root,...links.map(x=>x.customer_id),recordId])]};
 const members=await readCustomerPages(client,'customers',CUSTOMER_COLUMNS,q=>q.in('id',group.ids));
 return {group,links,members};
}
// At most four reads initiated concurrently; shared transport still applies its tab-wide limit/cache.
export async function loadCustomerSources(keys,{client,demoMode,records,ids,can}){
 const data={},issues=[];let index=0;
 await Promise.all(Array.from({length:Math.min(4,keys.length)},async()=>{while(index<keys.length){const key=keys[index++],module=key==='branches'?'customers':key==='orders'?'quotations':key;if(!can(module)){data[key]=null;issues.push(key+': Access denied');continue;}try{data[key]=demoMode?sortRecordsNewest((key==='orders'?customerOrderReconciliation((records.native_sales_orders||[]).filter(r=>ids.includes(r.customer_id)),records.sales_orders||[]):records[key]||[]).filter(r=>ids.includes(r.customer_id))):await readCustomerPages(client,key==='branches'?'crm_branches':key==='orders'?'crm_customer_sales_orders':key,columns[key],q=>q.in('customer_id',ids));}catch(e){data[key]=null;issues.push(key+': '+e.message);}}}));
 return {data,issues};
}
export const emptyCustomerData=()=>Object.fromEntries(Object.keys(SOURCES).map(k=>[k,null]));
