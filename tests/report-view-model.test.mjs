import test from 'node:test';
import assert from 'node:assert/strict';
import {filterReportRows,groupReportRows,reportTone} from '../src/report-view-model.mjs';
const rows=[{id:1,code:'OPP-1',customer_name:'Alpha Co',owner_name:'Alice',status:'won',amount:1000,close_date:'2026-10-10'},{id:2,code:'OPP-2',customer_name:'Beta Co',assigned_to_name:'Bob',status:'open',amount:2000,close_date:'2026-10-15'},{id:3,name:'No date',status:'lost',amount:500}];
test('report filters intersect and exclude missing dates when a range is selected',()=>{
 assert.deepEqual(filterReportRows(rows,{query:'alpha',owner:'Alice',status:'won',from:'2026-10-10',to:'2026-10-10',dateKey:'close_date'}).map(r=>r.id),[1]);
 assert.deepEqual(filterReportRows(rows,{owner:'Bob'}).map(r=>r.id),[2]);
 assert.equal(filterReportRows(rows,{from:'2026-10-01',dateKey:'close_date'}).length,2);
 assert.equal(filterReportRows(rows,{status:'won',query:'beta'}).length,0);
});
test('group totals reconcile with rows, preserving assigned owner and unspecified group',()=>{
 const groups=groupReportRows(rows,'owner_name','amount');assert.equal(groups.reduce((n,g)=>n+g.count,0),3);assert.equal(groups.reduce((n,g)=>n+g.value,0),3500);assert.ok(groups.some(g=>g.key==='Bob'));assert.ok(groups.some(g=>g.key===''));assert.deepEqual(groupReportRows([],'status','amount'),[]);
 assert.equal(reportTone('won'),'positive');assert.equal(reportTone('lost'),'negative');assert.equal(reportTone('open'),'neutral');
});
