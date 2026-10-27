import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createReadCoordinator} from '../src/read-coordinator.mjs';
function harness({session={user:{id:'alice'}},hidden=false}={}){
 let time=1000,id=0,authCallback,sessionValue=session;
 const doc=new EventTarget(),win=new EventTarget(),timers=new Map(),requests=[];
 doc.visibilityState=hidden?'hidden':'visible';win.navigator={onLine:true};
 const client={auth:{getSession:async()=>({data:{session:sessionValue}}),onAuthStateChange(fn){authCallback=fn;return {data:{subscription:{unsubscribe(){authCallback=null;}}}};}}};
 const store=createReadCoordinator(client,{document:doc,window:win,now:()=>time,setTimeout(fn,ms){const key=++id;timers.set(key,{fn,at:time+ms});return key;},clearTimeout:key=>timers.delete(key)});
 const flush=async()=>{for(let n=0;n<16;n++)await Promise.resolve();};
 const advance=async(ms=0)=>{await flush();const end=time+ms;let guard=0;for(;;){const task=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!task)break;assert.ok(++guard<1000,'scheduler must not spin');time=task[1].at;timers.delete(task[0]);task[1].fn();await flush();}time=end;await flush();};
 const watch=(options={},fn=()=>{})=>store.subscribe({key:'targets:2026',userId:'alice',load:async signal=>{requests.push({signal});return {value:requests.length};},...options},fn);
 return {watch,requests,timers,advance,flush,fire:event=>win.dispatchEvent(new Event(event)),visibility(hidden){doc.visibilityState=hidden?'hidden':'visible';doc.dispatchEvent(new Event('visibilitychange'));},offline(value){win.navigator.onLine=!value;win.dispatchEvent(new Event(value?'offline':'online'));},auth(id){sessionValue=id?{user:{id}}:null;authCallback?.('SIGNED_IN',sessionValue);}};
}
test('dashboard consumers share one fetch and cached remount; focus cannot bypass freshness',async()=>{
 const x=harness(),a=[],b=[];const stop=x.watch({},s=>a.push(s)),stop2=x.watch({},s=>b.push(s));await x.advance();assert.equal(x.requests.length,1);assert.equal(a.at(-1).data,b.at(-1).data);
 x.fire('focus');await x.advance(30000);assert.equal(x.requests.length,1);stop2();const stop3=x.watch();await x.advance();assert.equal(x.requests.length,1);await x.advance(30000);assert.equal(x.requests.length,2);stop();stop3();assert.equal(x.timers.size,0);
});
test('hidden and offline pages stop all periodic reads and resume only once when stale',async()=>{
 const x=harness({hidden:true}),stop=x.watch();await x.advance(180000);assert.equal(x.requests.length,0);x.visibility(false);await x.advance();assert.equal(x.requests.length,1);x.visibility(true);await x.advance(180000);assert.equal(x.requests.length,1);x.visibility(false);x.offline(true);await x.advance();assert.equal(x.requests.length,1);x.offline(false);x.fire('focus');await x.advance();assert.equal(x.requests.length,2);stop();
});
test('inactive panels and signed-out users do not read; demo loads once without polling',async()=>{
 const x=harness({session:null});const stopped=x.watch({enabled:false});await x.advance(60000);assert.equal(x.requests.length,0);stopped();const stop=x.watch();await x.advance(60000);assert.equal(x.requests.length,0);stop();const demo=x.watch({demo:true});await x.advance(600000);assert.equal(x.requests.length,1);x.fire('crm-access-changed');await x.advance();assert.equal(x.requests.length,2);demo();
});
test('slow reads never overlap; mutations during a read cause exactly one follow-up',async()=>{
 const x=harness();let resolve,calls=0;const stop=x.watch({events:['saved'],load:()=>{calls++;return new Promise(r=>resolve=r);}});await x.advance();x.fire('saved');x.fire('saved');await x.advance(180000);assert.equal(calls,1);resolve({n:1});await x.advance();assert.equal(calls,2);resolve({n:2});await x.advance();assert.equal(calls,2);stop();
});
test('sign-out and account switches discard late results and abort requests',async()=>{
 const x=harness(),a=[],b=[];let resolve,signal;const stop=x.watch({load:s=>{signal=s;return new Promise(r=>resolve=r);}},s=>a.push(s));await x.advance();x.auth(null);assert.equal(signal.aborted,true);resolve({secret:'alice'});await x.advance();assert.equal(a.at(-1).data,null);x.auth('bob');const bob=x.watch({userId:'bob'},s=>b.push(s));await x.advance();assert.equal(b.at(-1).data.value,1);assert.equal(a.at(-1).data,null);stop();bob();
});
test('last subscriber unmount aborts, stops timers, and cannot update a replacement subscription',async()=>{
 const x=harness();let resolve,signal;const stop=x.watch({load:s=>{signal=s;return new Promise(r=>resolve=r);}});await x.advance();stop();assert.equal(signal.aborted,true);assert.equal(x.timers.size,0);const values=[],next=x.watch({},s=>values.push(s));await x.advance();resolve({stale:true});await x.advance();assert.deepEqual(values.at(-1).data,{value:1});next();
});
test('402 backs off despite focus, save events and manual refresh; transient errors retain last data',async()=>{
 const x=harness(),values=[];let calls=0;const stop=x.watch({load:async()=>{if(++calls===1)return {value:1};throw Object.assign(Error('quota'),{status:402});}},s=>values.push(s));await x.advance();await x.advance(60000);assert.equal(calls,2);assert.deepEqual(values.at(-1).data,{value:1});x.fire('focus');x.fire('crm-access-changed');await stop.refresh();await x.advance(299999);assert.equal(calls,2);await x.advance(1);assert.equal(calls,3);stop();
});
test('permission-denied errors clear cached results',async()=>{
 const x=harness(),values=[];let calls=0;const stop=x.watch({load:async()=>{if(++calls===1)return {private:true};throw {code:'42501',message:'denied'};}},s=>values.push(s));await x.advance();await stop.refresh();assert.equal(values.at(-1).data,null);stop();
});
test('different year, report scope, and identities never share a cache',async()=>{
 const x=harness(),stops=[x.watch(),x.watch({key:'targets:2027'}),x.watch({key:'full-report:2026'}),x.watch({userId:'bob'})];await x.advance();assert.equal(x.requests.length,3);for(const stop of stops)stop();
});
test('access refresh retains its 30 second cadence; business data uses 60 seconds',async()=>{
 const x=harness(),calls={access:0,data:0};const a=x.watch({key:'access',interval:30000,load:async()=>++calls.access}),b=x.watch({load:async()=>++calls.data});await x.advance(60000);assert.deepEqual(calls,{access:3,data:2});a();b();
});

test('profile-write invalidation retries without publishing an access error',async()=>{
 const x=harness(),states=[];let attempts=0;
 const stop=x.watch({key:'role-access',load:async()=>{
  if(++attempts===1)throw {message:'AbortError: Read invalidated'};
  return {profile:{id:'alice'},rows:[]};
 }},state=>states.push(state));
 await x.advance();assert.equal(attempts,1);assert.equal(states.at(-1).loading,true);
 assert.ok(states.every(state=>!state.error));
 await x.advance(250);assert.equal(attempts,2);assert.equal(states.at(-1).data.profile.id,'alice');
 assert.equal(states.at(-1).loading,false);stop();
});
test('permission changes immediately clear old data and discard late results',async()=>{
 const x=harness(),values=[];let resolve,calls=0;
 const stop=x.watch({load:()=>{calls++;if(calls===1)return {private:true};return new Promise(r=>resolve=r);}},s=>values.push(s));
 await x.advance();const refresh=stop.refresh();await x.flush();const old=resolve;
 x.fire('crm-access-changed');assert.equal(values.at(-1).data,null);
 old({obsolete:true});await refresh;await x.advance();assert.ok(!values.some(s=>s.data?.obsolete));stop();
});
