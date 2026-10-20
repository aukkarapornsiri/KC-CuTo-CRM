import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sortLeadsNewest,nextLeadStatus,leadActionSeed,leadLinkPatch,leadStatusLabel} from '../src/lead-workflow.mjs';
test('created date, not UUID or last edit, orders all rows before pagination',()=>{
 const rows=Array.from({length:60},(_,i)=>({id:String(60-i),code:'LD-'+i,created_at:new Date(2026,0,i+1).toISOString(),updated_at:'2099-01-01'}));
 assert.equal(sortLeadsNewest(rows)[0].code,'LD-59');assert.equal(sortLeadsNewest(rows).slice(0,50).at(-1).code,'LD-10');assert.equal(rows[0].code,'LD-0');
 assert.deepEqual(sortLeadsNewest([{code:'LD-9'},{code:'LD-10'}]).map(x=>x.code),['LD-10','LD-9']);
});
test('lead activity navigation preserves its source through saving',()=>{
 const seed=leadActionSeed('activities',{leadId:'a',customerId:'b'});
 assert.deepEqual(leadLinkPatch('activities',seed),{related_module:'leads',related_id:'a'});
 assert.equal(nextLeadStatus('new','activities',seed),'follow');
 assert.equal(nextLeadStatus('new','activities',{...seed,status:'completed'}),'contacted');
 assert.equal(nextLeadStatus('new','activities',{...seed,status:'cancelled'}),'new');
 assert.equal(nextLeadStatus('new','activities',{status:'completed'}),'new');
});
test('opportunity link advances early leads and never reopens closed/manual qualified leads',()=>{
 const seed=leadActionSeed('opportunities',{sourceLeadId:'a',sourceName:'Sale'});
 assert.deepEqual(leadLinkPatch('opportunities',seed),{lead_id:'a'});
 assert.equal(nextLeadStatus('new','opportunities',seed),'qualified');
 for(const status of ['converted','disqualified','qualified'])assert.equal(nextLeadStatus(status,'opportunities',seed),status);
 assert.equal(leadStatusLabel('new','th'),'ใหม่');
});
