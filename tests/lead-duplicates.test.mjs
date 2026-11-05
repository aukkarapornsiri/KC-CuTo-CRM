import test from 'node:test';import assert from 'node:assert/strict';import {leadMatch,duplicateCandidates,leadPhone} from '../src/lead-duplicates.mjs';
test('normalized Thai phones, case-folded email, blank fields and fuzzy names',()=>{assert.equal(leadPhone('+66 81-234-5678'),'0812345678');assert.deepEqual(leadMatch({},{}),[]);assert.deepEqual(leadMatch({email:' SALES@Example.com ',phone:'+66 81-234-5678'},{email:'sales@example.com',mobile:'0812345678'}),['email','phone']);assert.deepEqual(leadMatch({company_name:'บริษัท เทค จำกัด',contact_name:'หนึ่ง'},{company_name:'บริษัท เทค จำกัด',contact_name:'สอง'}),['company']);assert.deepEqual(duplicateCandidates({id:'a',email:'a@b.c'},[{id:'a',email:'a@b.c'},{id:'b',email:'a@b.c',duplicate_of:'a'}]),[]);});

import {duplicateIds} from '../src/internal-model.mjs';
test('duplicate list normalizes phone/mobile without counting the same row twice',()=>{assert.deepEqual([...duplicateIds([{id:'a',phone:'0812345678',mobile:'+66812345678'}],'leads')],[]);assert.deepEqual([...duplicateIds([{id:'a',phone:'0812345678'},{id:'b',mobile:'+66812345678'}],'leads')].sort(),['a','b']);});

import {leadCompanyDuplicate,leadMergeMode} from '../src/lead-duplicates.mjs';
test('shared contact across METRO and UNITED is warning-only; company or tax identity blocks separate lead',()=>{
 const a={company_name:'METRO CO., LTD',contact_name:'Same person',email:'contact@example.test',owner_id:'sales-a'},b={company_name:'UNITED FLOUR MILL PUBLIC COMPANY LIMITED',contact_name:'Same person',email:'contact@example.test',owner_id:'sales-a'};
 assert.equal(leadCompanyDuplicate(a,b),false);assert.deepEqual(leadMatch(a,b),['email','name']);
 assert.equal(leadCompanyDuplicate(a,{company_name:' metro co ltd '}),true);
 assert.equal(leadCompanyDuplicate({tax_id:'0-1234-56789-01-2'},{tax_id:'0123456789012'}),true);
 assert.equal(leadCompanyDuplicate({company_name:'KC'},{company_name:'KC'}),true);
 assert.equal(leadCompanyDuplicate({company_name:'Metro'},{company_name:'Metro Holdings'}),false);
 assert.equal(leadMergeMode(a,b),'merge');assert.equal(leadMergeMode(a,{...b,owner_id:'sales-b'}),'review');assert.equal(leadMergeMode({},{}),'review');
});

import {createLeadDuplicates} from '../src/lead-duplicates.mjs';
test('configured cross-owner policy is only announced for an actual cross-owner company duplicate',()=>{const React={createElement:(tag,props,...children)=>({tag,props,children}),useState:v=>[v,()=>{}]},View=createLeadDuplicates({React}),draft={company_name:'METRO CO., LTD',owner_id:'a'};const show=row=>JSON.stringify(View({result:{matches:[row],policy_state:{cross_owner_merge:{enabled:true,configured:true,name:'Configured policy',steps:2}}},draft,lang:'en',can:()=>true}));assert.doesNotMatch(show({company_name:'UNITED FLOUR MILL PUBLIC COMPANY LIMITED',owner_id:'b',hard_duplicate:false,reasons:['email']}),/Approval follows policy/);assert.doesNotMatch(show({company_name:draft.company_name,owner_id:'a',hard_duplicate:true,reasons:['company']}),/Approval follows policy/);assert.match(show({company_name:draft.company_name,owner_id:'b',hard_duplicate:true,reasons:['company']}),/Approval follows policy/);});
