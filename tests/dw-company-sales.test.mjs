import test from 'node:test';
import assert from 'node:assert/strict';
import {targetMetrics} from '../src/sales-target-model.mjs';
const data={company_basis:'kc_digital_workplace_finance',months:[{month:'2026-09-01',company_target:50000000,company_actual:7920450,employees:[]},{month:'2026-10-01',company_target:50000000,company_actual:2667131.25,employees:[]}]};
test('Digital Workplace monthly actual respects the selected period without adding CRM facts',()=>{
 const m=targetMetrics(data,{scope:'company',from:'2026-10',to:'2026-10'});
 assert.equal(m.actual,2667131.25);assert.equal(m.remaining,47332868.75);
 assert.equal(targetMetrics(data).actual,10587581.25);
});
test('unavailable Digital Workplace actual is never treated as zero or 100% remaining',()=>{
 const d=structuredClone(data);d.months[1].company_actual=null;
 const m=targetMetrics(d);assert.equal(m.actual,null);assert.equal(m.remaining,null);assert.equal(m.attainment,null);
 assert.equal(targetMetrics(d,{to:'2026-09'}).actual,7920450);
});
test('an available zero remains a valid sales value',()=>{
 const d=structuredClone(data);d.months[1].company_actual=0;
 const m=targetMetrics(d,{from:'2026-10'});assert.equal(m.actual,0);assert.equal(m.remaining,50000000);
});
