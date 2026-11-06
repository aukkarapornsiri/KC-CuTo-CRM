import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app-C2ITSffc.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+';window.QAReact=KCNumbers.React;window.QACreateRoot=ak.createRoot;'});});
 await page.goto('http://127.0.0.1:4173/?demo=1');await page.waitForFunction(()=>window.QAReact);
 await page.evaluate(async()=>{
  const {createApprovalFlowSettings}=await import('./src/approval-flow-settings.mjs');
  const demo={crm_approval_policies:[{id:'gp-policy',name:'QA GP policy',request_type:'quotation',minimum_amount:0,approver_ids:['manager'],is_active:true}],profiles:[{id:'manager',display_name:'QA Manager',is_active:true,is_super_admin:true},{id:'director',display_name:'QA Director',is_active:true,is_super_admin:true}]};window.gpDemo=demo;
  const C=createApprovalFlowSettings({React:window.QAReact,client:{auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{user:{id:'admin'}}}})}},useApp:()=>({profile:{id:'admin',is_super_admin:true},demoMode:true}),demo}),host=document.createElement('div');host.id='qa-gp';host.style.cssText='position:fixed;inset:0;overflow:auto;background:white;z-index:99999';document.body.append(host);window.QACreateRoot(host).render(window.QAReact.createElement(C,{lang:'th'}));
 });
 const root=page.locator('#qa-gp'),on=root.getByLabel('เพิ่มผู้อนุมัติเมื่อ GP ต่ำกว่าเกณฑ์',{exact:true});await on.waitFor().catch(async e=>{console.log('GP errors',errors);console.log('GP DOM',await root.evaluate(el=>el.innerHTML.slice(-10000)));await page.screenshot({path:`test-artifacts/gp-failure-${width}.png`});throw e;});assert.equal(await on.isChecked(),false);
 await on.check();await root.getByLabel('GP ต่ำกว่า (%)',{exact:true}).fill('20');await root.getByRole('button',{name:'+ เพิ่มผู้อนุมัติ GP',exact:true}).click();await root.getByLabel('ผู้อนุมัติ GP เพิ่มเติม ขั้นที่ 1',{exact:true}).selectOption('director');
 await root.getByRole('button',{name:'บันทึก Flow Approve',exact:true}).click();await root.getByText('บันทึก Flow Approve แล้ว',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>{const p=window.gpDemo.crm_approval_policies[0];return{base:p.approver_ids,gp:p.low_gp_approver_ids,threshold:p.low_gp_threshold};}),{base:['manager'],gp:['director'],threshold:20});
 await on.scrollIntoViewIfNeeded();await root.screenshot({path:`test-artifacts/quotation-gp-condition-${width}.png`});
 assert.ok(await root.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'GP settings overflow');
 await root.locator('[data-flow-type=so]').click();assert.equal(await root.getByLabel('เงื่อนไขอนุมัติ GP ต่ำ',{exact:true}).count(),0);
 await root.locator('[data-flow-type=quotation]').click();assert.equal(await on.isChecked(),true);assert.equal(await root.getByLabel('GP ต่ำกว่า (%)',{exact:true}).inputValue(),'20');
 await on.uncheck();await root.getByRole('button',{name:'บันทึก Flow Approve',exact:true}).click();await page.waitForFunction(()=>window.gpDemo.crm_approval_policies[0].low_gp_threshold===null);
 assert.deepEqual(await page.evaluate(()=>window.gpDemo.crm_approval_policies[0].low_gp_approver_ids),[]);assert.deepEqual(errors,[]);console.log('PASS low GP condition configuration',width);await page.close();
}}finally{await browser.close();}
