import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quoteTotals} from '../src/internal-model.mjs';
import {serviceEnd,validateRecurring} from '../src/quotation-recurring.mjs';
const items=[{name:'Daily',qty:1,price:300,cost:100,billing_period:'day',cycle_count:30,service_start:'2026-11-01'},{name:'Monthly',qty:10,price:500,cost:200,billing_period:'month',cycle_count:12,service_start:'2026-11-01'},{name:'Yearly',qty:1,price:12000,cost:6000,billing_period:'year',cycle_count:1,service_start:'2026-11-01'}];
test('Mixed billing cycles use contract values and preserve line metadata',()=>{const t=quoteTotals(items);assert.equal(t.subtotal,81000);assert.equal(t.total,86670);assert.equal(t.cost_total,33000);assert.equal(t.gp_amount,48000);assert.equal(t.items[0].service_end,'2026-11-30');assert.equal(t.items[1].cycle_count,12);assert.equal(quoteTotals(t.items).total,86670);});
test('Standard quotations retain one-time arithmetic',()=>{assert.equal(quoteTotals([{name:'Standard',qty:2,price:100,cost:60}]).total,214);});
test('Calendar boundaries and contract bounds',()=>{assert.equal(serviceEnd('2028-02-28','day',2),'2028-02-29');assert.equal(serviceEnd('2026-01-31','month',1),'2026-02-27');assert.equal(serviceEnd('2026-11-01','year',1),'2027-10-31');const q={quotation_kind:'recurring',recurring:{start_date:'2026-11-01',end_date:'2027-10-31',billing_timing:'advance'},items};assert.doesNotThrow(()=>validateRecurring(q));assert.throws(()=>validateRecurring({...q,recurring:{...q.recurring,end_date:'2027-10-30'}}));assert.throws(()=>quoteTotals([{...items[0],cycle_count:0}]));assert.throws(()=>quoteTotals([{...items[0],cycle_count:1.5}]));assert.throws(()=>validateRecurring({...q,quotation_kind:'standard'}));});
test('Discount is once per service line and document',()=>{const t=quoteTotals([{...items[0],discount:100}],{documentDiscount:200,withholdingRate:3});assert.equal(t.subtotal,9000);assert.equal(t.net_before_tax,8700);assert.equal(t.net_total,9048);assert.equal(t.gp_amount,5700);});

 test('Draft amounts calculate before the product name is entered; save remains strict',()=>{
 const items=[{name:'',qty:1,price:500,billing_period:'month',cycle_count:1,service_start:'2026-10-20'}];
 const draft=quoteTotals(items,{requireName:false});
 assert.equal(draft.items[0].total,500);assert.equal(draft.subtotal,500);assert.equal(draft.vat,35);assert.equal(draft.net_total,535);
 assert.throws(()=>quoteTotals(items),/Invalid quotation item/);
 });

test('Totals sum rounded lines, costs and discounts consistently',()=>{
 const t=quoteTotals([{name:'A',qty:0.33,price:1.01,cost:0.5},{name:'B',qty:0.33,price:1.01,cost:0.5}],{taxRate:7});
 assert.deepEqual(t.items.map(x=>x.total),[0.33,0.33]);assert.equal(t.subtotal,0.66);assert.equal(t.cost_total,0.34);assert.equal(t.gp_amount,0.32);assert.equal(t.total,0.71);
 const d=quoteTotals([{name:'A',qty:0.33,price:1.01,discount:0.005}],{taxRate:0});assert.equal(d.items[0].total,0.32);assert.equal(d.net_total,0.32);
});
