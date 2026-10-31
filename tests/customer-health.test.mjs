import test from 'node:test';import assert from 'node:assert/strict';
import {customerHealth,defaultCustomerView} from '../src/customer-health-model.mjs';
import {stakeholderGraph,validateStakeholder} from '../src/customer-stakeholder-model.mjs';
const now=new Date('2026-10-31T05:00:00Z'),customer={created_at:'2026-01-01'},base={activities:[],tickets:[],contracts:[],orders:[],contacts:[{id:'c',status:'active',role:'Decision Maker'}]};
test('health explains overdue tasks, aged cases, renewal gaps and sparse relationship data',()=>{
 const h=customerHealth(customer,{...base,activities:[{id:'a',status:'planned',scheduled_at:'2026-10-01'}],tickets:[{id:'t',status:'open',created_at:'2026-10-01'}],contracts:[{id:'con',status:'active',end_date:'2026-11-10'}],contacts:[]},now);
 assert.equal(h.coverage,100);assert.equal(h.score,30);assert.equal(h.level,'high');assert.equal(h.risks.find(r=>r.key==='followup').penalty,15);assert.equal(h.risks.find(r=>r.key==='service').rows[0].id,'t');
});
test('unavailable modules do not become zero counts or a healthy rating',()=>{
 const h=customerHealth(customer,{...base,activities:null,tickets:null,contracts:null,orders:null},now);assert.equal(h.score,null);assert.equal(h.level,'unknown');assert.equal(h.coverage,10);
 const partial=customerHealth(customer,{...base,tickets:null},now);assert.equal(partial.level,'partial');assert.equal(partial.dimensions.find(d=>d.key==='service').penalty,null);
});
test('completed/cancelled tasks and resolved cases do not count; future contacts are ignored',()=>{
 const h=customerHealth({created_at:'2026-10-30'},{...base,activities:[{status:'completed',type:'Call',scheduled_at:'2026-11-10'},{status:'cancelled',scheduled_at:'2026-01-01'}],tickets:[{status:'resolved',created_at:'2026-01-01'}]},now);assert.equal(h.score,100);assert.equal(h.lastContact,null);assert.equal(h.overdue.length,0);
});
test('purchase decline deduplicates orders and excludes cancelled and other currencies',()=>{
 const old={id:'s',source_system:'crm',source_so_id:'1',status:'converted',currency:'THB',converted_at:'2026-06-01',net_amount:1000};
 const h=customerHealth({created_at:'2026-10-30'},{...base,orders:[old,{...old,id:'dup'},{...old,id:'usd',source_so_id:'2',currency:'USD'},{...old,id:'cancel',source_so_id:'3',status:'cancelled'}]},now);assert.equal(h.purchase.baseline,1000);assert.equal(h.risks.find(r=>r.key==='purchases').penalty,20);
});
test('linked future renewal activity clears only its contract warning',()=>{
 const h=customerHealth({created_at:'2026-10-30'},{...base,contracts:[{id:'con',status:'active',end_date:'2026-11-10'}],activities:[{id:'a',related_module:'contracts',related_id:'con',status:'planned',scheduled_at:'2026-11-01'}]},now);assert.equal(h.renewals.length,0);
});
test('stakeholder lines preserve contacts and reject cycles or cross-company managers',()=>{
 const contacts=[{id:'a',customer_id:'x',name:'Decision',role:'Decision Maker'},{id:'b',customer_id:'x',reports_to_id:'a'},{id:'c',customer_id:'y'}];
 assert.deepEqual(stakeholderGraph(contacts).edges,[{from:'b',to:'a'}]);assert.equal(stakeholderGraph(contacts).decisionMakers.length,1);
 assert.throws(()=>validateStakeholder(contacts[0],{role:'Approver',reports_to_id:'b'},contacts),/REPORTING_CYCLE/);
 assert.throws(()=>validateStakeholder(contacts[1],{reports_to_id:'c'},contacts),/INVALID_MANAGER/);
 assert.equal(validateStakeholder(contacts[1],{role:'Influencer',influence_level:'high',reports_to_id:'a'},contacts).role,'Influencer');
});
test('role defaults are presentation choices, never new permissions',()=>{assert.equal(defaultCustomerView({role:'sales_user'}),'sales');assert.equal(defaultCustomerView({role:'sales_manager'}),'manager');assert.equal(defaultCustomerView({is_super_admin:true}),'executive');assert.equal(defaultCustomerView({role:'custom',custom_role_key:'staff'}),'sales');});
