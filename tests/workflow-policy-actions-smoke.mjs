import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app-C2ITSffc.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+';window.QAReact=KCNumbers.React;window.QACreateRoot=ak.createRoot;'});});
 await page.goto('http://127.0.0.1:4173/?demo=1');await page.waitForFunction(()=>window.QAReact);
 await page.evaluate(async()=>{
 const {createSettingsWorkspace}=await import('./src/settings-workspace.mjs');let rows=[{id:'one',name:'Policy QA',minimum_amount:0,approver_ids:[],is_active:true,updated_at:'v1'},{id:'old',name:'Archived QA',minimum_amount:1,approver_ids:[],is_active:false,deleted_at:'2026-11-01',updated_at:'v0'}];
 const client={auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{user:{id:'admin'}}}})},rpc:async(name,args)=>{rows=rows.map(r=>r.id===args.p_id?{...r,is_active:false,deleted_at:'2026-11-05'}:r);window.archivedPolicy={name,args};return {data:args.p_id};},from:table=>{let patch=null,id;const target={then:resolve=>{if(patch){const row={...rows.find(r=>r.id===id),...patch,updated_at:'v2'};rows=rows.map(r=>r.id===id?row:r);window.policyPatch={id,patch};resolve({data:row});}else resolve({data:table==='crm_approval_policies'?rows:[]});}};let q;q=new Proxy(target,{get:(t,k)=>k==='then'?t.then:(...args)=>{if(k==='update')patch=args[0];if(k==='eq'&&args[0]==='id')id=args[1];return q;}});return q;}};
 const {DataEditor}=createSettingsWorkspace({React:window.QAReact,client,useApp:()=>({profile:{id:'admin',is_super_admin:true}}),useAccess:()=>({can:()=>true})});const host=document.createElement('div');host.id='qa-workflow';host.style.cssText='position:fixed;inset:0;overflow:auto;background:white;z-index:99999;padding:16px';document.body.append(host);window.QACreateRoot(host).render(window.QAReact.createElement(DataEditor,{kind:'workflow',lang:'th'}));
 });
 const root=page.locator('#qa-workflow');await root.getByRole('button',{name:'ปิดใช้งานนโยบาย Policy QA',exact:true}).click();await root.getByRole('button',{name:'เปิดใช้งานนโยบาย Policy QA',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.policyPatch.patch.is_active),false);
 await root.getByRole('button',{name:'เปิดใช้งานนโยบาย Policy QA',exact:true}).click();await root.getByRole('button',{name:'ปิดใช้งานนโยบาย Policy QA',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.policyPatch.patch.is_active),true);
 assert.equal(await root.getByRole('button',{name:'ลบนโยบาย Archived QA',exact:true}).count(),0);
 await root.getByRole('button',{name:'ลบนโยบาย Policy QA',exact:true}).click();const popup=page.getByRole('dialog',{name:'ลบนโยบายอนุมัติ',exact:true});await popup.getByRole('button',{name:'ยกเลิก',exact:true}).click();assert.equal(await page.evaluate(()=>window.archivedPolicy),undefined);
 await root.getByRole('button',{name:'ลบนโยบาย Policy QA',exact:true}).click();await popup.getByRole('button',{name:'ยืนยันลบ',exact:true}).click();await root.getByRole('button',{name:'ลบนโยบาย Policy QA',exact:true}).waitFor({state:'detached'});assert.deepEqual(await page.evaluate(()=>window.archivedPolicy),{name:'crm_archive_approval_flow',args:{p_id:'one',p_expected_updated_at:'v2'}});
 await root.screenshot({path:`test-artifacts/workflow-policy-actions-${width}.png`});assert.deepEqual(errors,[]);await page.close();console.log('PASS workflow row actions',width);
}}finally{await browser.close();}
