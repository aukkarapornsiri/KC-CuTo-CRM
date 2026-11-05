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
 for(const lang of ['th','en'])for(const html of [salesOrderHTML(order,lang),costSheetHTML(order,{},lang)]){
 assert.ok(html.includes(lang==='th'?'รหัสสินค้า':'Part Number'));assert.ok(html.includes('PN-&lt;42&gt;'));assert.ok(!html.includes('PN-<42>'));
 }
});

test('missing identifiers hydrate by linked id or unique legacy code without overwriting snapshots',async()=>{
 const {withCatalogPartNumbers}=await import('../src/item-part-number.mjs');
 const catalog=[{id:'a',code:'INTERNAL',part_number:'JL676A'},{id:'b',code:'DUP',part_number:'B'},{id:'c',code:'DUP',part_number:'C'}];
 const items=[{price_item_id:'a',code:'INTERNAL'},{code:'INTERNAL'},{price_item_id:'a',part_number:'SAVED'},{code:'DUP'},{name:'Unlinked'},{price_item_id:'missing',code:'INTERNAL'}];
 const result=withCatalogPartNumbers(items,catalog);
 assert.equal(result[0].part_number,'JL676A');assert.equal(result[1].part_number,'JL676A');assert.equal(result[2].part_number,'SAVED');
 for(const i of [2,3,4,5])assert.equal(result[i],items[i]);assert.equal(items[0].part_number,undefined);
});
