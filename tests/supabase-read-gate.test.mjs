import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseReadGate} from '../src/supabase-read-gate.mjs';
const url = 'https://example.supabase.co/rest/v1/customers?select=*';
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

test('caps distinct concurrent REST GET requests', async () => {
  let active = 0, peak = 0;
  const waiting = [];
  const gate = createSupabaseReadGate(() => new Promise(resolve => {
    peak = Math.max(peak, ++active);
    waiting.push(() => { active--; resolve(Response.json({ok:true})); });
  }), {host:'example.supabase.co',maxConcurrent:3,cacheMs:0});
  const reads = Array.from({length:15},(_,i)=>gate(url+'&page='+i));
  await flush(); assert.equal(peak,3); assert.equal(gate.metrics().queued,12);
  for(let i=0;i<15;i++){await flush();waiting[i]();}
  await Promise.all(reads); assert.equal(peak,3);assert.equal(gate.metrics().active,0);
});
test('deduplicates identical in-flight reads and safely clones responses', async () => {
  let calls=0;
  const gate=createSupabaseReadGate(async()=>{calls++;return Response.json({n:4});},{host:'example.supabase.co'});
  const items=await Promise.all(Array.from({length:20},()=>gate(url,{headers:{Authorization:'Bearer A'}})));
  assert.equal(calls,1);assert.equal(gate.metrics().coalesced,19);
  assert.deepEqual(await items[0].json(),{n:4});
  assert.deepEqual(await items[19].json(),{n:4});
});
test('does not combine requests across authentication identities', async()=>{
  let calls=0;
  const gate=createSupabaseReadGate(async()=>Response.json({n:++calls}),{host:'example.supabase.co'});
  const [a,b]=await Promise.all([
    gate(url,{headers:{Authorization:'Bearer A'}}),
    gate(url,{headers:{Authorization:'Bearer B'}}),
  ]);
  assert.equal((await a.json()).n,1);assert.equal((await b.json()).n,2);
});
test('short cache smooths rerenders but expires and invalidates on writes',async()=>{
  let reads=0,writes=0,clock=10;
  const gate=createSupabaseReadGate(async (_url,init={})=>{
    if(init.method==='POST'){writes++;return Response.json({ok:true});}
    return Response.json({n:++reads});
  },{host:'example.supabase.co',cacheMs:1000,now:()=>clock});
  assert.equal((await (await gate(url)).json()).n,1);
  assert.equal((await (await gate(url)).json()).n,1);
  assert.equal(reads,1);
  await gate(url,{method:'POST',body:'{}'});
  assert.equal(writes,1);
  assert.equal((await (await gate(url)).json()).n,2);
  clock+=1001;assert.equal((await (await gate(url)).json()).n,3);
});
test('queued abort cancels a request before it reaches the API',async()=>{
  let finish;
  const gate=createSupabaseReadGate(()=>new Promise(resolve=>{finish=resolve;}),{
    host:'example.supabase.co',maxConcurrent:1,cacheMs:0,
  });
  const first=gate(url+'&first');await flush();
  const ac=new AbortController();
  const second=gate(url+'&second',{signal:ac.signal});
  ac.abort();await assert.rejects(second,{name:'AbortError'});
  assert.equal(gate.metrics().queued,0);
  finish(Response.json({ok:true}));await first;
});
test('opens a circuit on repeated 522; auth and writes remain unblocked',async()=>{
  let calls=0,clock=10;
  const gate=createSupabaseReadGate(async()=>{calls++;return new Response('{}',{status:522});},{
    host:'example.supabase.co',failuresToOpen:2,cacheMs:0,now:()=>clock,
  });
  await gate(url+'1');await gate(url+'2');assert.equal(calls,2);
  assert.equal((await gate(url+'3')).status,503);assert.equal(calls,2);
  await gate('https://example.supabase.co/auth/v1/user');
  await gate(url,{method:'POST',body:'{}'});assert.equal(calls,4);
  clock+=30_001;assert.equal((await gate(url+'3')).status,522);
});
test('late read results cannot repopulate cache after writes',async()=>{
  let resolveOld,reads=0;
  const gate=createSupabaseReadGate(async (_url,init={})=>{
    if(init.method==='POST')return Response.json({ok:true});
    if(++reads===1)return new Promise(resolve=>{resolveOld=resolve});
    return Response.json({version:2});
  },{host:'example.supabase.co',cacheMs:5000});
  const old=gate(url);await flush();
  await gate(url,{method:'POST',body:'{}'});
  assert.equal((await (await gate(url)).json()).version,2);
  resolveOld(Response.json({version:1}));await old;
  assert.equal((await (await gate(url)).json()).version,2);
  assert.equal(reads,2);
});
