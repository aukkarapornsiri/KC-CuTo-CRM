const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const source=fs.readFileSync('src/microsoft-integration-settings.mjs','utf8');
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/module.mjs'?'text/javascript':'text/html');res.end(req.url==='/module.mjs'?source:'<button id="open">Open</button>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(async()=>{const {openMicrosoftSettings}=await import('/module.mjs');window.requests=[];window.refreshes=0;window.reply={data:{ok:true,connected:false,error:'401'}};document.querySelector('#open').onclick=()=>openMicrosoftSettings({client:{functions:{invoke:async(endpoint,options)=>{window.requests.push({endpoint,...options});return window.reply;}}},provider:'microsoft_intune',lang:'th',onSaved:()=>window.refreshes++});});
 await page.click('#open');await page.locator('dialog').waitFor({state:'visible'});assert.equal(await page.getByLabel('Client Secret',{exact:true}).getAttribute('type'),'password');
 await page.getByLabel('Tenant ID',{exact:true}).fill('bad');await page.getByRole('button',{name:'บันทึกและทดสอบ'}).click();await page.getByRole('status').filter({hasText:'Tenant ID'}).waitFor();assert.equal(await page.evaluate(()=>requests.length),0);
 await page.getByLabel('Tenant ID',{exact:true}).fill('');await page.getByLabel('Client Secret',{exact:true}).fill('test-only-secret');await page.getByRole('button',{name:'บันทึกและทดสอบ'}).click();await page.getByRole('status').filter({hasText:'บันทึก Credential แล้ว'}).waitFor();assert.equal(await page.getByLabel('Client Secret',{exact:true}).inputValue(),'');assert.equal(await page.evaluate(()=>refreshes),1);
 await page.evaluate(()=>reply={data:null,error:{message:'Forbidden'}});await page.getByRole('button',{name:'บันทึกและทดสอบ'}).click();await page.getByRole('status').filter({hasText:'บันทึกไม่สำเร็จ'}).waitFor();assert.equal(await page.evaluate(()=>refreshes),1);
 await page.evaluate(()=>reply={data:{ok:true,connected:true}});await page.getByRole('button',{name:'บันทึกและทดสอบ'}).click();await page.getByRole('status').filter({hasText:'เชื่อมต่อสำเร็จ'}).waitFor();assert.equal(await page.evaluate(()=>refreshes),2);assert.deepEqual(await page.evaluate(()=>requests.at(-1).body.secrets),{});
 assert.equal(await page.evaluate(()=>document.querySelector('dialog').scrollWidth>document.querySelector('dialog').clientWidth),false);
 await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').count(),0);assert.equal(await page.locator('#open').evaluate(el=>el===document.activeElement),true);console.log('Microsoft settings browser flow passed: mobile layout, validation, masked secret, persistence payload, provider failure, access rejection, success, close/focus.');
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
