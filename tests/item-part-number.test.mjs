import test from 'node:test';
import assert from 'node:assert/strict';
import {itemPartNumber} from '../src/item-part-number.mjs';
import {salesOrderHTML,costSheetHTML} from '../src/sales-order-print.mjs';
test('snapshot part number wins; legacy descriptions remain readable; item codes are not part numbers',()=>{
 assert.equal(itemPartNumber({part_number:' PN-1 ',desc:'Part Number: PN-OLD'}),'PN-1');
 for(const label of ['Part Number','Part No.','P/N'])assert.equal(itemPartNumber({desc:label+': PN-OLD\nMore specs'}),'PN-OLD');
 assert.equal(itemPartNumber({code:'INTERNAL-123'}),'');
});
test('SO and cost sheet print actual part number and escape HTML',()=>{
 const order={items:[{name:'Service',part_number:'PN-<42>',qty:1,price:1,total:1}],currency:'THB'};
 for(const html of [salesOrderHTML(order),costSheetHTML(order,{})]){
 assert.ok(html.includes('Part Number'));assert.ok(html.includes('PN-&lt;42&gt;'));assert.ok(!html.includes('PN-<42>'));
 }
});
