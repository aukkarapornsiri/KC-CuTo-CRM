import test from 'node:test';import assert from 'node:assert/strict';
import {salesJourney} from '../src/customer360-journey-model.mjs';
import {customerGroup,loadCustomerSources,CORE_SOURCES} from '../src/customer360-loader.mjs';
const q={id:'q',code:'QT-1',customer_id:'c',opportunity_id:'o'},so={id:'s',quotation_id:'q',status:'confirmed',expected_delivery_date:'2026-10-31'};
test('links use explicit IDs, keep source quote and choose approval before delivery',()=>{
 const input={leads:[{id:'l'}],opportunities:[{id:'o',lead_id:'l'}],quotations:[q],orders:[so],approvals:{s:{status:'pending'}},activities:[{id:'a',related_module:'quotations',related_id:'q',status:'planned',scheduled_at:'2026-11-01'},{id:'other',related_module:'leads',related_id:'q',status:'planned'}]};
 const [row]=salesJourney(input,new Date('2026-10-31T20:00:00Z'));
 assert.equal(row.lead.id,'l');assert.equal(row.tasks.length,1);assert.equal(row.next,'approve');assert.equal(row.overdue,true);
 assert.equal(salesJourney({...input,approvals:{s:{status:'approved'}}})[0].next,'deliver');
 assert.equal(salesJourney({...input,orders:[{...so,status:'delivered'}]})[0].next,'complete');
 assert.equal(salesJourney({...input,orders:[{...so,status:'cancelled'}]})[0].next,'cancelled');
});
test('customer match alone never assigns a lead and missing quote does not hide SO',()=>{
 const rows=salesJourney({quotations:[{...q,opportunity_id:null}],leads:[{id:'l',customer_id:'c'}],orders:[so,{id:'unmatched',quotation_id:'hidden',status:'completed'}],opportunities:null,activities:null});
 assert.equal(rows[0].lead,null);assert.equal(rows.length,2);assert.equal(rows[1].quotation,null);assert.equal(rows[1].next,'completed');
});
test('quotes without an SO go to the existing follow-up, closed tasks excluded',()=>{
 const [row]=salesJourney({quotations:[q],activities:[{id:'done',related_module:'quotations',related_id:'q',status:'completed'}],followups:[{quotation_id:'q',activity_id:'existing',next_at:'2026-11-01'}]});
 assert.equal(row.next,'followup');assert.equal(row.tasks.length,0);assert.equal(row.followup.activity_id,'existing');
});
function fakeClient(tables){const calls=[];return {calls,from(table){const filters=[];return {select(columns){calls.push({table,columns,filters});return this;},eq(k,v){filters.push([k,[v]]);return this;},in(k,v){filters.push([k,v]);return this;},order(){return this;},range(from,to){return Promise.resolve({data:(tables[table]||[]).filter(r=>filters.every(([k,v])=>v.includes(r[k]))).slice(from,to+1),error:null});}};}};}
test('initial identity reads are constrained to the selected canonical group',async()=>{
 const client=fakeClient({customers:[{id:'a'},{id:'b'},{id:'unrelated'}],crm_customer_identity_links:[{id:'link',customer_id:'b',canonical_id:'a'},{id:'other',customer_id:'y',canonical_id:'z'}]});
 const r=await customerGroup({client,recordId:'b'});assert.deepEqual(r.group.ids,['a','b']);assert.deepEqual(r.members.map(x=>x.id).sort(),['a','b']);
 assert.ok(client.calls.every(x=>x.filters.length>0),'No whole-customer-directory query on open');
});
test('overview sources exclude deferred documents and honor module permissions',async()=>{
 assert.ok(!CORE_SOURCES.includes('assets')&&!CORE_SOURCES.includes('documents')&&!CORE_SOURCES.includes('branches'));
 const client=fakeClient({contacts:[{id:'contact',customer_id:'c'},{id:'other',customer_id:'x'}]});
 const r=await loadCustomerSources(['contacts','quotations'],{client,ids:['c'],can:m=>m==='contacts'});
 assert.equal(r.data.contacts.length,1);assert.equal(r.data.quotations,null);assert.equal(client.calls.length,1);assert.deepEqual(client.calls[0].filters,[['customer_id',['c']]]);
});
