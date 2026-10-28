import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const id='11111111-2222-4333-8444-555555555555';
try{for(const [module,callback] of [['leads',false],['leads',true],['quotations',true],['sales_orders',true],['legacy-so',true]]){
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:4173/?demo=1&module=${module==='legacy-so'?'quotations':module}&record=${id}`);
 await page.getByRole('button',{name:'เข้าใช้งานโหมดทดลอง',exact:true}).waitFor();
 assert.ok(await page.evaluate(()=>sessionStorage.getItem('kc-crm-pending-email-task')));
 if(callback)await page.goto('http://127.0.0.1:4173/?demo=1');
 await page.evaluate(async({id,module})=>{const source=await(await fetch([...document.scripts].find(s=>s.src.includes('app-C2ITSffc')).src)).text();const uri=source.match(/from ['"]([^'"]*internal-workspace\.mjs[^'"]*)['"]/)[1];const {DEMO_RECORDS:r}=await import(new URL(uri,location.href).href);r.leads=[{id,code:'LD-EMAIL',company_name:'Email Lead',contact_name:'Email Contact',status:'new',created_at:'2026-10-28'}];r.approval_requests=[{id:'request',quotation_id:id,submitted_by:'seller',approver_ids:['reviewer'],current_step:1,status:'approved',created_at:'2026-10-28',snapshot:{id,code:'SQ-EMAIL',customer_name:'Email Customer',total:44940,items:[{name:'Email Notebook',qty:1}]}}];r.native_sales_orders=[{id,quotation_id:module==='legacy-so'?id:'another',code:'SO-EMAIL',status:'confirmed',customer_name:'SO Email Customer',total:44940,items:[],so_approval:{status:'pending',requested_at:'2026-10-28'}}];},{id,module});
 await page.getByRole('button',{name:'เข้าใช้งานโหมดทดลอง',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:module==='leads'?'รายละเอียดลีด':module==='quotations'?'ใบเสนอราคา':'เปิด SO',exact:true});await dialog.waitFor();assert.ok((await dialog.innerText()).includes(module==='leads'?'LD-EMAIL':module==='quotations'?'SQ-EMAIL':'SO-EMAIL'));assert.equal(await page.evaluate(()=>sessionStorage.getItem('kc-crm-pending-email-task')),null);assert.ok(!new URL(page.url()).searchParams.has('record'));assert.deepEqual(errors,[]);await dialog.screenshot({path:`test-artifacts/email-return-${module}-${callback}.png`});await page.close();console.log('PASS email destination',module,callback?'OAuth callback':'direct sign-in');
}}finally{await browser.close();}
