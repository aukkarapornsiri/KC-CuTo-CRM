import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{for(const width of [1920,1440,1024,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app-C2ITSffc.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+';window.QAReact=KCNumbers.React;window.QACreateRoot=ak.createRoot;'});});
 await page.goto('http://127.0.0.1:4173/?demo=1');await page.waitForFunction(()=>window.QAReact);
 await page.evaluate(async()=>{
 const {createSettingsWorkspace}=await import('./src/settings-workspace.mjs');let rows=[{id:'one',name:'Policy QA',request_type:'quotation',minimum_amount:0,approver_ids:['reviewer'],is_active:true,updated_at:'v1'},{id:'old',name:'Archived QA',request_type:'so',minimum_amount:1,approver_ids:[],is_active:false,deleted_at:'2026-11-01',updated_at:'v0'}];
 const response=data=>({abortSignal:()=>Promise.resolve({data}),then:r=>r({data})});
 const client={auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{user:{id:'admin'}}}})},rpc:(name,args)=>{
 if(name==='crm_template_approvers')return response(['quotation','quotation_edit'].map(request_type=>({id:'reviewer',display_name:'QA Approver',email:'qa@example.test',request_type})));
 if(name==='crm_document_edit_policy')return response({quotation_requires_approval:true,so_requires_approval:true,updated_at:'settings-v1'});
 rows=rows.filter(r=>r.id!==args.p_id);window.archivedPolicy={name,args};return response(args.p_id);
 },from:table=>{let patch=null,id;const target={then:resolve=>{if(patch){const row={...rows.find(r=>r.id===id),id:id||'created-policy',...patch,updated_at:'v2'};rows=id?rows.map(r=>r.id===id?row:r):[...rows,row];window.policyPatch={id,patch};resolve({data:row});}else resolve({data:table==='crm_approval_policies'?rows.filter(r=>!r.deleted_at):[]});}};let q;q=new Proxy(target,{get:(t,k)=>k==='then'?t.then:(...args)=>{if(k==='update'||k==='insert')patch=args[0];if(k==='eq'&&args[0]==='id')id=args[1];return q;}});return q;}};
 const {DataEditor}=createSettingsWorkspace({React:window.QAReact,client,useApp:()=>({profile:{id:'admin',is_super_admin:true}}),useAccess:()=>({can:()=>true})});const host=document.createElement('div');host.id='qa-workflow';host.style.cssText='position:fixed;inset:0;overflow:auto;background:white;z-index:99999;padding:16px';document.body.append(host);window.QACreateRoot(host).render(window.QAReact.createElement(DataEditor,{kind:'workflow',lang:'th'}));
 });
 const root=page.locator('#qa-workflow');await root.getByRole('heading',{name:'นโยบายและขั้นตอนอนุมัติ',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('input[aria-label="ชื่อนโยบาย"]')?.value==='Policy QA');
 assert.equal(await root.locator('.crm-master-table').count(),0,'Legacy route must not mount the duplicate record editor');assert.equal(await root.getByText('Archived QA',{exact:true}).count(),0);
 assert.ok(await root.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Unified page must fit its container');
 await root.getByLabel('ใช้งานนโยบายนี้',{exact:true}).uncheck();await root.getByRole('button',{name:'บันทึก ลำดับอนุมัติ',exact:true}).click();await page.waitForFunction(()=>window.policyPatch?.patch.is_active===false);
 await root.getByLabel('ใช้งานนโยบายนี้',{exact:true}).check();await root.getByRole('button',{name:'บันทึก ลำดับอนุมัติ',exact:true}).click();await page.waitForFunction(()=>window.policyPatch?.patch.is_active===true);
 await root.getByRole('button',{name:'ลบนโยบายนี้',exact:true}).click();const popup=page.getByRole('dialog',{name:'ยืนยันลบ ลำดับงาน อนุมัติ',exact:true});await popup.getByRole('button',{name:'ยกเลิก',exact:true}).click();assert.equal(await page.evaluate(()=>window.archivedPolicy),undefined);
 await root.getByRole('button',{name:'ลบนโยบายนี้',exact:true}).click();await popup.getByRole('button',{name:'ยืนยันลบ',exact:true}).click();await root.getByRole('button',{name:'ลบนโยบายนี้',exact:true}).waitFor({state:'detached'});assert.deepEqual(await page.evaluate(()=>window.archivedPolicy),{name:'crm_archive_approval_flow',args:{p_id:'one',p_expected_updated_at:'v2'}});
 await root.locator('[data-flow-type=quotation_edit]').click();await root.getByLabel('ชื่อนโยบาย',{exact:true}).fill('ชื่อสำหรับทีมขาย');await root.getByRole('searchbox',{name:'ค้นหาผู้อนุมัติ',exact:true}).fill('qa@');await root.locator('.kc-flow-candidate').click();await root.getByRole('button',{name:'บันทึก ลำดับอนุมัติ',exact:true}).click();await page.waitForFunction(()=>window.policyPatch?.patch.request_type==='quotation_edit');assert.equal(await page.evaluate(()=>window.policyPatch.patch.name),'ชื่อสำหรับทีมขาย');
 await root.screenshot({path:`test-artifacts/workflow-policy-actions-${width}.png`});assert.deepEqual(errors,[]);await page.close();console.log('PASS unified workflow entry and policy actions',width);
}}finally{await browser.close();}
