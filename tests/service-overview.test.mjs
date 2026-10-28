import {test} from 'node:test';
import assert from 'node:assert/strict';
import {overviewData} from '../src/service-overview.mjs';
const now=Date.parse('2026-10-28T05:00:00Z');
test('overview scopes metrics, repair/parts costs and queue to selected team and period',()=>{
 const rows=[{id:'a',created_at:'2026-10-01',status:'new',team_id:'one',asset_id:'x',sla_deadline:'2026-10-28T04:00:00Z'},{id:'b',created_at:'2026-10-02',status:'new',team_id:'two',asset_id:'x'},{id:'c',created_at:'2026-09-01',status:'closed',team_id:'one'}];
 const d=overviewData(rows,{service_repairs:[{ticket_id:'a',cost:100},{ticket_id:'b',cost:999}],service_parts:[{ticket_id:'a',quantity:2,unit_cost:50}],service_claims:[]},{team_id:'one',month:'2026-10'},now);
 assert.equal(d.summary.repairCost,200);assert.equal(d.count('open'),1);assert.equal(d.count('breached'),1);assert.deepEqual(d.queue.map(x=>x.id),['a']);assert.equal(d.repeated,0);
});
test('empty data preserves zero counts and unknown performance; queue prioritizes SLA risk',()=>{
 const empty=overviewData([],{}, {},now);assert.equal(empty.count('open'),0);assert.equal(empty.summary.compliance,null);
 const rows=[{id:'safe',status:'new',created_at:'2026-10-28T04:00Z',sla_deadline:'2026-10-29T04:00Z'},{id:'late',assigned_to_id:'p',status:'in-progress',created_at:'2026-10-27T04:00Z',sla_deadline:'2026-10-28T04:00Z'}];
 assert.deepEqual(overviewData(rows,{}, {},now).queue.map(x=>x.id),['late','safe']);
});
