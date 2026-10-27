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
 assert.equal(WORKFLOW_LANES.flatMap(x=>x.cards).length,10);
});

test('connector endpoints follow source to destination and route lane changes outside cards',async()=>{
 const {workflowPath}=await import('../src/workflow-map.mjs');
 const a={x:24,y:30,width:200,height:126},b={x:272,y:30,width:200,height:126};
 assert.equal(workflowPath(a,b,720),'M 224 93 L 267 93');
 const c={x:24,y:250,width:200,height:126};
 assert.equal(workflowPath(b,c,720,false,200),'M 472 93 L 715 93 L 715 200 L 5 200 L 5 313 L 19 313');
 assert.equal(workflowPath(a,c,300,true),'M 124 156 L 124 245');
 assert.equal(workflowPath(a,c,300,true,0,true),'M 124 156 L 124 170 L 295 170 L 295 235 L 124 235 L 124 245');
});
test('every workflow link has a valid source and destination',async()=>{
 const {WORKFLOW_LINKS}=await import('../src/workflow-map.mjs');const ids=new Set(WORKFLOW_LANES.flatMap(x=>x.cards.map(c=>c[0])));
 assert.equal(WORKFLOW_LINKS.length,9);for(const [a,b] of WORKFLOW_LINKS){assert.ok(ids.has(a)&&ids.has(b));assert.notEqual(a,b);}
});

test('SO counts native orders rather than reporting facts and uses quotation access',async()=>{
 const {workflowSource}=await import('../src/workflow-map.mjs');
 assert.deepEqual(workflowSource('sales_orders'),{module:'quotations',table:'crm_sales_orders',demo:'native_sales_orders'});
 const client={from(table){assert.equal(table,'crm_sales_orders');return {select(){return {abortSignal:async()=>({count:7,error:null})};}};}};
 assert.deepEqual(await readWorkflowCounts(client,[['sales_orders']]),{sales_orders:7});
 assert.deepEqual(await readWorkflowCounts(null,[['sales_orders']],null,{native_sales_orders:[{}],sales_orders:[{},{}]}),{sales_orders:1});
});
