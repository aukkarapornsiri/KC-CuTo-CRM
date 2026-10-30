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
test('cancelled queued read never reaches the network',async()=>{
 let calls=0;const releases=[];
 const p=createRestReadPolicy(async()=>{calls++;await new Promise(r=>releases.push(r));return new Response('{}');},{origin});
 const busy=Array.from({length:5},(_,i)=>p.fetch(url('busy-'+i)));await tick();
 const c=new AbortController(),abandoned=p.fetch(url('abandoned'),{signal:c.signal});const rejected=assert.rejects(abandoned,{name:'AbortError'});c.abort();await rejected;
 releases.splice(0).forEach(r=>r());await Promise.all(busy);await tick();
 const observed=calls;releases.splice(0).forEach(r=>r());await tick();assert.equal(observed,5);
});
test('429 and gateway errors stop fan-out and honor Retry-After without retrying writes',async()=>{
 for(const status of [429,502,503,504]){
  let calls=0,time=0;const p=createRestReadPolicy(async()=>{calls++;return new Response('{}',{status,headers:{'Retry-After':'20'}});},{origin,now:()=>time,random:()=>0});
  assert.equal((await p.fetch(url())).status,status);await p.fetch(url('other'));assert.equal(calls,1);
  time=19999;await p.fetch(url('other'));assert.equal(calls,1);
  time=20000;await p.fetch(url('other'));assert.equal(calls,2);
  await p.fetch(url(),{method:'POST',body:'{}'});assert.equal(calls,3);
 }
});
test('permission invalidation rejects a late response even when transport ignores abort',async()=>{
 const win=new EventTarget();let release;
 const p=createRestReadPolicy(async()=>{await new Promise(r=>release=r);return new Response('{"private":true}');},{origin,window:win});
 const pending=p.fetch(url());const denied=assert.rejects(pending,{name:'AbortError'});await tick();win.dispatchEvent(new Event('crm-access-changed'));release();await denied;
});
test('SO approval and rejection notify work subscribers exactly once after success',async()=>{
 const win=new EventTarget();let events=0;win.addEventListener('crm-work-changed',()=>events++);
 const p=createRestReadPolicy(async()=>new Response('{}'),{origin,window:win});
 await p.fetch(url('rpc/crm_so_approval_action'),{method:'POST',body:'{}'});assert.equal(events,1);
});
test('all shared subscribers cancelling aborts transport; a later subscriber starts a fresh read',async()=>{
 let calls=0;const signals=[],release=[];
 const p=createRestReadPolicy(async req=>{calls++;signals.push(req.signal);await new Promise(r=>release.push(r));return new Response('{}');},{origin});
 const a=new AbortController(),b=new AbortController();const one=p.fetch(url(),{signal:a.signal}),two=p.fetch(url(),{signal:b.signal});
 const done=Promise.allSettled([one,two]);await tick();a.abort();assert.equal(signals[0].aborted,false);b.abort();await done;assert.equal(signals[0].aborted,true);
 const fresh=p.fetch(url());await tick();assert.equal(calls,2);release.splice(0).forEach(r=>r());assert.equal((await fresh).status,200);
});
test('HTTP-date Retry-After is respected and failed mutations do not announce work changes',async()=>{
 const win=new EventTarget();let time=Date.parse('2026-10-27T00:00:00Z'),calls=0,events=0;win.addEventListener('crm-work-changed',()=>events++);
 const p=createRestReadPolicy(async()=>{calls++;return new Response('{}',{status:503,headers:{'Retry-After':'Tue, 27 Oct 2026 00:01:00 GMT'}});},{origin,window:win,now:()=>time,random:()=>0});
 await p.fetch(url());time+=59999;await p.fetch(url('next'));assert.equal(calls,1);
 await p.fetch(url('rpc/crm_so_approval_action'),{method:'POST'});assert.equal(calls,2);assert.equal(events,0);
});
test('permission boundary still rejects late reads after a write detached deduplication',async()=>{
 const win=new EventTarget();let release;
 const p=createRestReadPolicy(async(req,init)=>{if(init?.method==='POST')return new Response('{}');await new Promise(r=>release=r);return new Response('{}');},{origin,window:win});
 const read=p.fetch(url());const denied=assert.rejects(read,{name:'AbortError'});await tick();await p.fetch(url(),{method:'POST'});win.dispatchEvent(new Event('crm-access-changed'));release();await denied;
});
test('quotation approval RPC refreshes mounted notification subscribers on success',async()=>{const win=new EventTarget();let events=0;win.addEventListener('crm-work-changed',()=>events++);const p=createRestReadPolicy(async()=>new Response('{}'),{origin,window:win});await p.fetch(url('rpc/crm_quotation_transition'),{method:'POST',body:'{}'});assert.equal(events,1);});
