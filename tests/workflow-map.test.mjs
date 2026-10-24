import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readWorkflowCounts,WORKFLOW_LANES} from '../src/workflow-map.mjs';
import {permitsPage} from '../src/role-access.mjs';
test('count queries only requested tables, use HEAD and exact counts, and preserve zero',async()=>{
 const calls=[],signal=new AbortController().signal;
 const client={from(table){calls.push(table);return {select(columns,options){assert.equal(columns,'id');assert.deepEqual(options,{count:'exact',head:true});return {async abortSignal(s){assert.equal(s,signal);return {count:table==='leads'?0:12001,error:null};}};}};}};
 assert.deepEqual(await readWorkflowCounts(client,[['leads'],['contacts']],signal),{leads:0,contacts:12001});assert.deepEqual(calls,['leads','contacts']);
});
test('query errors and missing counts never masquerade as zero',async()=>{
 for(const result of [{count:null,error:{message:'denied'}},{count:null,error:null}])await assert.rejects(()=>readWorkflowCounts({from(){return {select(){return {abortSignal:async()=>result};}};}},[['leads']]));
});
test('demo reads do not touch production',async()=>{assert.deepEqual(await readWorkflowCounts(null,[['leads']],null,{leads:[{id:1}]}),{leads:1});});
test('workflow page retains dashboard access gate',()=>{
 const access={profile:{is_active:true,role:'sales'},can:()=>false,dashboards:[]};assert.equal(permitsPage(access,'dashboard','workflow-map'),false);access.can=m=>m==='dashboard';assert.equal(permitsPage(access,'dashboard','workflow-map'),true);
 assert.equal(WORKFLOW_LANES.flatMap(x=>x.cards).length,9);
});
