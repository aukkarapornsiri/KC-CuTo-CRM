import test from 'node:test';import assert from 'node:assert/strict';
import {assignmentTarget,RECORD_PAGES} from '../src/assignment-links.mjs';
import {notificationRecordUrl} from '../supabase/functions/_shared/assignment-link.mjs';
const id='11111111-2222-4333-8444-555555555555';
test('every assignment email opens the exact supported record',()=>{for(const module of Object.keys(RECORD_PAGES)){const url=new URL(notificationRecordUrl(module,id));assert.deepEqual(assignmentTarget(url.searchParams.get('module'),url.searchParams.get('record')),{module,page:RECORD_PAGES[module],params:{recordId:id}});}});
test('untrusted modules and identifiers cannot create external links or routes',()=>{for(const [module,record] of [['https://evil.example',id],['leads','javascript:alert(1)'],['settings',id]]){assert.equal(assignmentTarget(module,record),null);assert.equal(notificationRecordUrl(module,record),'https://kc-cuto.kaicomhub.com/');}});

import {rememberEmailTask,pendingEmailTask,emailDestination,PENDING_TASK_KEY,createAssignmentLinkRouter} from '../src/assignment-links.mjs';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test('email task survives a clean OAuth callback and preserves only allowlisted IDs',()=>{
 const storage=memory();rememberEmailTask(`https://crm.test/?module=leads&record=${id}&access_token=secret#refresh_token=secret`,storage,100);
 assert.deepEqual(pendingEmailTask('https://crm.test/?code=auth',storage,200),{module:'leads',record:id});
 assert.ok(!storage.getItem(PENDING_TASK_KEY).includes('secret'));
 assert.equal(pendingEmailTask('https://crm.test/',storage,9*60*60*1000),null);
});
test('new valid email wins, malformed and expired destinations are discarded',()=>{
 const storage=memory();rememberEmailTask(`https://crm.test/?module=leads&record=${id}`,storage,100);
 assert.equal(pendingEmailTask(`https://crm.test/?module=quotations&record=${id}`,storage,200).module,'quotations');
 storage.setItem(PENDING_TASK_KEY,JSON.stringify({module:'https://evil.test',record:id,savedAt:100}));assert.equal(pendingEmailTask('https://crm.test',storage,200),null);
 storage.setItem(PENDING_TASK_KEY,'broken');assert.equal(pendingEmailTask('https://crm.test',storage,200),null);
});
test('approval links open exact requests, assignment links open exact leads, permissions fail closed',()=>{
 assert.deepEqual(emailDestination({module:'quotations',record:id},()=>true),{module:'quotations',page:'quot-approval',params:{approvalRecordId:id,approvalKind:'quotation'}});
 assert.deepEqual(emailDestination({module:'sales_orders',record:id},()=>true),{module:'quotations',page:'quot-approval',params:{approvalRecordId:id,approvalKind:'so'}});
 assert.equal(emailDestination({module:'leads',record:id},()=>false),null);
 assert.equal(emailDestination({module:'leads',record:id},()=>true).params.recordId,id);
 assert.equal(emailDestination({module:'quotations',record:id},(m,a)=>a==='view').page,'quot-list');
});
test('login router waits for identity and access then consumes the destination once',()=>{
 const oldWindow=globalThis.window,oldHistory=globalThis.history,storage=memory(),nav=[];let profile=null,loading=true;const ref={current:false};
 rememberEmailTask(`https://crm.test/?module=leads&record=${id}`,storage);
 globalThis.window={location:{href:'https://crm.test/?code=oauth'},sessionStorage:storage,alert:()=>{throw Error('unexpected denial');}};globalThis.history={state:{test:1},replaceState:()=>{}};
 try{const Router=createAssignmentLinkRouter({React:{useRef:()=>ref,useEffect:fn=>fn()},useApp:()=>({profile,navigate:(...x)=>nav.push(x)}),useAccess:()=>({loading,can:()=>true})});Router();assert.equal(nav.length,0);profile={id:'user'};Router();assert.equal(nav.length,0);loading=false;Router();Router();assert.equal(nav.length,1);assert.deepEqual(nav[0],['leads','lead-inbox',{recordId:id}]);assert.equal(storage.getItem(PENDING_TASK_KEY),null);}finally{globalThis.window=oldWindow;globalThis.history=oldHistory;}
});
