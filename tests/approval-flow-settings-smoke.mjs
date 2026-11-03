import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app-C2ITSffc.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+';window.QAReact=KCNumbers.React;window.QACreateRoot=ak.createRoot;'});});
 await page.goto('http://127.0.0.1:4173/?demo=1');await page.waitForFunction(()=>window.QAReact);
 await page.evaluate(async()=>{
  const {createApprovalFlowSettings}=await import('./src/approval-flow-settings.mjs');
  const people=[{id:'a',display_name:'ผู้จัดการฝ่ายขาย',email:'manager@example.test',role_key:'sales_manager'},{id:'b',display_name:'ผู้อำนวยการฝ่ายขาย',email:'director@example.test',role_key:'sales_director'},{id:'c',display_name:'ผู้อนุมัติฝ่ายบริหาร',email:'exec@example.test',role_key:'executive'}];
  let rows=[{id:'policy',name:'Standard',request_type:'quotation',minimum_amount:0,is_active:true,approver_ids:['a','b'],updated_at:'v1'}];
  const client={rpc:()=>{const result={data:people};return {abortSignal:()=>Promise.resolve(result),then:r=>r(result)}},from:()=>{let patch=null;const target={then:r=>{if(patch){const row={...patch,id:'saved',updated_at:'v2'};window.flowSaved=row;r({data:row})}else r({data:rows})}};let q;q=new Proxy(target,{get:(t,k)=>k==='then'?t.then:(v)=>{if(k==='update'||k==='insert')patch=v;return q}});return q;}};
  const C=createApprovalFlowSettings({React:window.QAReact,client,useApp:()=>({profile:{id:'admin',is_super_admin:true},demoMode:false}),demo:{}}),host=document.createElement('div');host.id='qa-flow';host.style.cssText='position:fixed;inset:0;overflow:auto;background:#f3f6f9;z-index:99999;padding:20px';document.body.append(host);window.QACreateRoot(host).render(window.QAReact.createElement(C,{lang:'th'}));
 });
 const root=page.locator('#qa-flow');await root.getByText('ผู้จัดการฝ่ายขาย',{exact:true}).waitFor();
 await root.getByRole('button',{name:'เลื่อนขึ้นขั้นที่ 2',exact:true}).click();assert.match(await root.locator('.kc-flow-step').first().innerText(),/ผู้อำนวยการ/);
 await root.getByLabel('จำนวนขั้นอนุมัติ',{exact:true}).selectOption('3');assert.ok(await root.getByRole('button',{name:'บันทึก Flow Approve',exact:true}).isDisabled());
 await root.getByRole('button',{name:'เลือกผู้อนุมัติ',exact:true}).click();await root.getByRole('searchbox',{name:'ค้นหาผู้อนุมัติ',exact:true}).fill('exec@');assert.equal(await root.locator('.kc-flow-candidate').count(),1);await root.locator('.kc-flow-candidate').click();
 await root.getByRole('button',{name:'บันทึก Flow Approve',exact:true}).click();await page.waitForFunction(()=>window.flowSaved);assert.deepEqual(await page.evaluate(()=>window.flowSaved.approver_ids),['b','a','c']);
 await root.getByLabel('แบบฟอร์ม / ประเภทคำขอ',{exact:true}).selectOption('amendment');await root.getByLabel('ชื่อนโยบาย',{exact:true}).fill('SO amendments');
 await root.getByRole('searchbox',{name:'ค้นหาผู้อนุมัติ',exact:true}).fill('manager@');await root.locator('.kc-flow-candidate').click();await root.getByRole('button',{name:'บันทึก Flow Approve',exact:true}).click();await root.getByText('บันทึก Flow Approve แล้ว',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.flowSaved.request_type),'amendment');
 assert.ok(await root.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'No viewport overflow');await root.screenshot({path:`test-artifacts/approval-flow-${width}.png`});assert.deepEqual(errors,[]);await page.close();console.log('PASS approval flow',width);
}}finally{await browser.close();}
