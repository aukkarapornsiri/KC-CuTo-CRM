import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecord} from '../src/internal-model.mjs';
import {convertDemoLead} from '../src/record-profile.mjs';
test('individual saves without company, preserves identifier zeroes, and converts to person account',()=>{
 const row=validateRecord('leads',{lead_type:'Individual',first_name:'Test',last_name:'Person',tax_id:'0123456789012'});
 assert.equal(row.company_name,'');assert.equal(row.tax_id,'0123456789012');
 const records={leads:[{...row,id:'lead'}],customers:[],contacts:[]};let n=0;
 convertDemoLead(records,'lead',()=>String(++n),'2026-10-19');
 assert.equal(records.customers[0].name,'Test Person');assert.equal(records.customers[0].type,'Individual');assert.equal(records.customers[0].tax_id,'0123456789012');
});
test('companies still require company and identifiers reject malformed values',()=>{
 assert.throws(()=>validateRecord('leads',{last_name:'Person'}),/company_name/);
 assert.equal(validateRecord('leads',{last_name:'Person',company_name:'Existing'}).lead_type,'Company');
 assert.throws(()=>validateRecord('leads',{lead_type:'Individual',last_name:'Person',tax_id:'123'}),/13/);
});
test('lead coordinator is saved separately from its owner and can be cleared',()=>{
 const data={lead_type:'Individual',last_name:'Person',owner_id:'creator',lead_assigner_id:'coordinator'};
 const row=validateRecord('leads',data);
 assert.equal(row.owner_id,'creator');assert.equal(row.lead_assigner_id,'coordinator');
 assert.equal(validateRecord('leads',{...data,lead_assigner_id:''}).lead_assigner_id,null);
});
