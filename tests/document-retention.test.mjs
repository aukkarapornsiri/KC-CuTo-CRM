import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRetention,dateBounds} from '../src/document-retention-model.mjs';
import {createHandler} from '../supabase/functions/crm-document-retention/handler.mjs';
import {permitsPage} from '../src/role-access.mjs';
const id='11111111-1111-4111-8111-111111111111';
const request=(body,token='user')=>new Request('https://test',{method:'POST',headers:{'Content-Type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
function fixture({allowed=true,storageError=false,claimError=null,cron=false}={}){
 const calls=[];
 const admin={auth:{getUser:async()=>({data:{user:{id}},error:null})},rpc:async(name,args)=>{calls.push([name,args]);if(name==='crm_actor_can')return {data:allowed};if(name==='crm_document_cron_authorized')return {data:cron};if(name==='crm_document_retention_candidates')return {data:[id]};if(name==='crm_document_delete_claim')return claimError?{error:claimError}:{data:{id,bucket_id:'crm-documents',object_key:'owner/old.pdf',state:'deleting'}};return {data:null};},storage:{from:bucket=>({remove:async keys=>{calls.push(['remove',{bucket,keys}]);return {error:storageError?Error('offline'):null};}})}};
 return {calls,handler:createHandler(admin)};
}
test('retention validation rejects foreign apps and unsafe values',()=>{
 assert.throws(()=>validateRetention({bucket_id:'kc-dw-expense-receipts',retention_days:365,run_hour:2}));
 for(const days of [0,6,3651,7.1])assert.throws(()=>validateRetention({bucket_id:'crm-documents',retention_days:days,run_hour:2}));
 assert.equal(validateRetention({bucket_id:'crm-documents',retention_days:'7',run_hour:'23',enabled:true}).retention_days,7);
});
test('Bangkok inclusive date filter uses exclusive next midnight',()=>{
 assert.deepEqual(dateBounds('2026-11-01','2026-11-01'),{p_from:'2026-11-01T00:00:00+07:00',p_to:'2026-11-01T17:00:00.000Z'});
 assert.throws(()=>dateBounds('2026-11-02','2026-11-01'));
 assert.throws(()=>dateBounds('2026-02-30',''));
});
test('only active Super Admin can navigate directly',()=>{
 const access={profile:{is_active:true,role:'admin',is_super_admin:false},can:()=>true};
 assert.equal(permitsPage(access,'settings','set-document-retention'),false);
 access.profile.is_super_admin=true;assert.equal(permitsPage(access,'settings','set-document-retention'),true);
 access.profile.is_active=false;assert.equal(permitsPage(access,'settings','set-document-retention'),false);
});
test('anonymous and non-admin never touch storage',async()=>{
 const f=fixture({allowed:false});assert.equal((await f.handler(request({action:'delete',object_id:id,confirm:true},''))).status,401);
 assert.equal((await f.handler(request({action:'delete',object_id:id,confirm:true}))).status,403);
 assert.equal(f.calls.some(c=>c[0]==='remove'),false);
});
test('explicit confirmation required',async()=>{
 const f=fixture();assert.equal((await f.handler(request({action:'delete',object_id:id}))).status,400);assert.equal(f.calls.some(c=>c[0]==='remove'),false);
});
test('protected file rejection happens before Storage deletion',async()=>{
 const f=fixture({claimError:{code:'P0001',message:'File is referenced'}});assert.equal((await f.handler(request({action:'delete',object_id:id,confirm:true}))).status,409);assert.equal(f.calls.some(c=>c[0]==='remove'),false);
});
test('storage error records failure and never reports successful deletion',async()=>{
 const f=fixture({storageError:true});assert.equal((await f.handler(request({action:'delete',object_id:id,confirm:true}))).status,503);
 assert.equal(f.calls.find(c=>c[0]==='crm_document_delete_finish')[1].p_error,'Storage deletion failed');
});
test('successful deletion claims, removes via API, then records completion',async()=>{
 const f=fixture();assert.equal((await f.handler(request({action:'delete',object_id:id,confirm:true}))).status,200);
 assert.deepEqual(f.calls.map(c=>c[0]),['crm_actor_can','crm_document_delete_claim','remove','crm_document_delete_finish']);
});
test('cron requires its own secret and processes bounded database candidates',async()=>{
 const rejected=fixture();assert.equal((await rejected.handler(request({action:'scheduled'}))).status,403);
 const f=fixture({cron:true});assert.equal((await f.handler(request({action:'scheduled'}))).status,200);
 assert.equal(f.calls.find(c=>c[0]==='crm_document_delete_claim')[1].p_actor,null);
});
