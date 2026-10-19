import test from 'node:test';
import assert from 'node:assert/strict';
import {createRestReadPolicy} from '../src/rest-read-policy.mjs';
const origin='https://example.supabase.co';
const url=(name='items')=>`${origin}/rest/v1/${name}`;
const tick=()=>new Promise(r=>setImmediate(r));
test('five simultaneous reads, identical reads deduplicate, writes bypass queue',async()=>{
 let active=0,peak=0,reads=0,writes=0;const releases=[];
 const p=createRestReadPolicy(async (req,init)=>{
  if((init?.method||req.method)==='POST'){writes++;return new Response('{}');}
  active++;reads++;peak=Math.max(peak,active);
  await new Promise(r=>releases.push(r));active--;return new Response('{}');
 },{origin});
 const requests=Array.from({length:8},(_,i)=>p.fetch(url(`items?id=eq.${i}`)));
 const duplicate=p.fetch(url('items?id=eq.0'));
 await tick();assert.equal(reads,5);assert.equal(peak,5);
 await p.fetch(url(),{method:'POST',body:'{}'});assert.equal(writes,1);
 // Write invalidates queued reads; consumers must refetch after mutation.
 const result=Promise.allSettled([...requests,duplicate]);
 releases.splice(0).forEach(r=>r());await tick();await result;
 assert.equal(peak,5);
});
test('deduplication and cache TTL, auth isolation, permission invalidation',async()=>{
 let time=0,calls=0;const events=new EventTarget();
 const p=createRestReadPolicy(async()=>{calls++;return new Response('{"ok":true}');},{origin,now:()=>time,window:events});
 await Promise.all([p.fetch(url()),p.fetch(url())]);assert.equal(calls,1);
 time=59999;await p.fetch(url());assert.equal(calls,1);
 time=60000;await p.fetch(url());assert.equal(calls,2);
 await p.fetch(url(),{headers:{authorization:'Bearer other'}});assert.equal(calls,3);
 events.dispatchEvent(new Event('crm-access-changed'));await p.fetch(url());assert.equal(calls,4);
 await p.fetch(url('master_data_items'));time+=299999;await p.fetch(url('master_data_items'));assert.equal(calls,5);
 time++;await p.fetch(url('master_data_items'));assert.equal(calls,6);
});
test('522 blocks queued/new reads and permits one probe after backoff',async()=>{
 let time=0,calls=0;let recover=false;
 const p=createRestReadPolicy(async()=>{calls++;return new Response(recover?'{}':'html',{status:recover?200:522});},{origin,now:()=>time,random:()=>0});
 assert.equal((await p.fetch(url())).status,522);
 await p.fetch(url('other'));assert.equal(calls,1);
 time=4999;await p.fetch(url());assert.equal(calls,1);
 time=5000;recover=true;await Promise.all([p.fetch(url()),p.fetch(url('other'))]);assert.equal(calls,2);
 await p.fetch(url('other'));assert.equal(calls,3);
});
test('one cancelled subscriber does not cancel a shared read',async()=>{
 let release;const p=createRestReadPolicy(async()=>{await new Promise(r=>release=r);return new Response('{}');},{origin});
 const controller=new AbortController();const a=p.fetch(url(),{signal:controller.signal});const b=p.fetch(url());
 const rejected=assert.rejects(a,{name:'AbortError'});await tick();controller.abort();release();await rejected;assert.equal((await b).status,200);
});
