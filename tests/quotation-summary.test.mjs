import test from 'node:test';import assert from 'node:assert/strict';
import {quotationSummary} from '../src/quotation-summary.mjs';
test('quotation cards count filtered documents, separate currencies and use approval state',()=>{
 const rows=[{total:107,currency:'THB',status:'accepted',approval_status:'approved'},{total:214,status:'approved'},{total:50,currency:'USD',status:'draft'}];
 const s=quotationSummary(rows);assert.equal(s.count,3);assert.deepEqual(s.totals,[['THB',321],['USD',50]]);assert.deepEqual(s.approved,[['THB',321],['USD',0]]);assert.ok(Math.abs(s.acceptanceRate-100/3)<1e-10);
 assert.equal(quotationSummary(rows.filter(r=>r.status==='accepted')).acceptanceRate,100);
});
test('empty and legacy records produce finite values',()=>{
 assert.deepEqual(quotationSummary([]),{count:0,totals:[],approved:[],acceptanceRate:0});
 assert.deepEqual(quotationSummary([{net_total:100,status:'draft'},{total:'invalid'}]).totals,[['THB',100]]);
});
