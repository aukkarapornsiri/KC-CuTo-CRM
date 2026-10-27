import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRestReadPolicy} from '../src/rest-read-policy.mjs';
const origin='https://example.supabase.co';
const sources=['internal-workspace','inventory','quotation-document','role-access','service-desk'];
const names=['crm_price_catalog','crm_quotation_company','crm_access_context','crm_assignment_people','crm_lead_assignees','crm_lead_assignment_contacts'];
function callOptions(name){
 for(const file of sources){const src=fs.readFileSync(new URL(`../src/${file}.mjs`,import.meta.url),'utf8');const match=src.match(new RegExp(`client\\.rpc\\('${name}'([^)]*)\\)`));if(match)return match[1].includes('get:true')?'GET':'POST';}
 throw Error('Missing RPC '+name);
}
test('audited read RPCs preserve warm data and deduplicate repeated calls',async()=>{
 let calls=0;const p=createRestReadPolicy(async()=>{calls++;return new Response('{}')},{origin});
 const company=()=>p.fetch(origin+'/rest/v1/rpc/crm_quotation_company',{method:callOptions('crm_quotation_company')});
 await p.fetch(origin+'/rest/v1/customers');await company();await p.fetch(origin+'/rest/v1/customers');await Promise.all([company(),company()]);
 console.log(JSON.stringify({workload:'customers/company/reopen/duplicate',networkCalls:calls}));
 assert.equal(calls,2,'read RPC must not flush the customers cache');
 for(const name of names)assert.equal(callOptions(name),'GET',name);
});
