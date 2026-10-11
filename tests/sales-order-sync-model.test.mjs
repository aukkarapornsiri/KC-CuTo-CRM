import {test} from 'node:test';import assert from 'node:assert/strict';
import {enrichmentRequest,normalizeProductLines,staleSO} from '../supabase/functions/kc-dw-sales-sync/so-sync-model.mjs';
test('SO lines require explicit net amounts, valid products and no over-allocation',()=>{assert.deepEqual(normalizeProductLines([{product:'Cloud',netAmount:'30.01'},{productCode:'PC',netAmount:40}],100),[{product:'Cloud',code:'',net_amount:30.01},{product:'PC',code:'PC',net_amount:40}]);for(const lines of [[{product:'Cloud'}],[{product:'Cloud',netAmount:-1}],[{netAmount:1}],[{product:'Cloud',netAmount:101}]])assert.throws(()=>normalizeProductLines(lines,100));});
test('Legacy SO updates preserve existing customer/product links; exact customer references and currencies are validated',()=>{const previous={customer_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',customer_name:'CRM customer',product_lines:[{product:'Cloud',net_amount:30}],currency:'THB'};const v=enrichmentRequest({netAmount:50},previous);assert.equal(v.customer_id,previous.customer_id);assert.equal(v.customerChanged,false);assert.equal(v.product_lines[0].net_amount,30);assert.equal(enrichmentRequest({netAmount:50,customerCode:'C-001'}).customerChanged,true);assert.throws(()=>enrichmentRequest({netAmount:50,customerId:'made-up'}));assert.throws(()=>enrichmentRequest({netAmount:50,currency:'Baht'}));assert.throws(()=>enrichmentRequest({netAmount:20},previous));});
test('Outdated source updates cannot resurrect a cancelled SO',()=>{assert.equal(staleSO({source_updated_at:'2026-10-02T00:00:00Z'},'2026-10-01T00:00:00Z'),true);assert.equal(staleSO({source_updated_at:'2026-10-02T00:00:00Z'},'2026-10-02T00:00:00Z'),false);});
test('SO stock quantities, warehouse and serial survive ingestion and legacy updates',()=>{
 const warehouse='AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';
 const input={netAmount:100,productLines:[{productCode:'PC',netAmount:100,quantity:'2',warehouseId:warehouse,serialNumber:' SN-1 '}]};
 const first=enrichmentRequest(input);
 assert.deepEqual(first.product_lines[0],{product:'PC',code:'PC',net_amount:100,quantity:2,warehouse_id:warehouse.toLowerCase(),serial_number:'SN-1'});
 assert.deepEqual(enrichmentRequest({netAmount:100},first).product_lines,first.product_lines);
});
test('SO stock input rejects invalid explicit quantities and references without inventing quantities for old feeds',()=>{
 for(const quantity of [null,'',false,0,-1,Infinity,1e9,'NaN'])assert.throws(()=>normalizeProductLines([{productCode:'PC',netAmount:1,quantity}],1));
 for(const extra of [{warehouseId:'missing'},{serialNumber:'x'.repeat(201)}])assert.throws(()=>normalizeProductLines([{productCode:'PC',netAmount:1,...extra}],1));
 assert.equal('quantity' in normalizeProductLines([{productCode:'PC',netAmount:1}],1)[0],false);
});
