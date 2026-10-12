import assert from 'node:assert/strict';
import {ENTITIES,quoteTotals,quotationStoredTotals,validateRecord} from '../src/internal-model.mjs';
const totals=quoteTotals([{name:'QA',qty:2,price:100,cost:50}],{documentDiscount:10});
const stored=quotationStoredTotals(totals);
for(const key of ['line_discount','net_before_tax','cost_total'])assert.ok(!(key in stored));
assert.equal(stored.total,203.3);assert.equal(stored.gp_amount,90);assert.equal(totals.cost_total,100);
assert.equal(ENTITIES.customers.statuses[0],'Active');assert.equal(validateRecord('customers',{name:'QA',status:ENTITIES.customers.statuses[0]}).status,'Active');
console.log('PASS database payload: stored totals only, canonical customer status');

const draft={customer_id:'customer',owner_id:'seller',issue_date:'2026-10-12',payment_terms:0};
assert.throws(()=>validateRecord('quotations',{...draft,valid_until:'2026-10-11'}),/Valid until must be on or after/);
for(const valid_until of ['2026-10-12','2026-11-12',''])assert.doesNotThrow(()=>validateRecord('quotations',{...draft,valid_until}));
console.log('PASS quotation date order: earlier rejected; same day, later and empty accepted');
