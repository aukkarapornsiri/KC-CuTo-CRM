import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/cost-print-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><title>Original CRM</title></head><body><button id="print">Print Cost Sheet</button><main>Original CRM screen</main></body></html>'}));
 await page.goto('http://127.0.0.1:4173/cost-print-test');
 await page.evaluate(()=>{
  const descriptor=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'contentWindow');
  Object.defineProperty(HTMLIFrameElement.prototype,'contentWindow',{...descriptor,get(){
   const win=descriptor.get.call(this);
   if(this.classList.contains('kc-cost-sheet-print-frame'))win.print=()=>{
    if(window.failPrint)throw Error('Printer unavailable');
    window.costPrints=(window.costPrints||0)+1;
    const content=win.document.querySelector('.kc-review-content'),stage=win.document.querySelector('.kc-review-stage');
    window.costCapture={text:win.document.body.innerText,rows:win.document.querySelectorAll('tbody tr').length,scale:Number(content.dataset.scale),height:content.getBoundingClientRect().height,stage:stage.getBoundingClientRect().height,controls:win.document.querySelectorAll('.kc-export-review-controls').length};
   };
   return win;
  }});
 });
 for(const count of [2,45]){
  await page.locator('#print').focus();
  await page.evaluate(async count=>{
   const {printCostSheet}=await import('./src/sales-order-print.mjs');
   await printCostSheet({code:'SO-DIRECT',subtotal:count*100,discount:0,vat:count*7,total:count*107,currency:'THB',customer_name:'English customer unchanged',items:Array.from({length:count},(_,i)=>({name:'DIRECT-ITEM-'+(i+1),desc:'Full specifications '.repeat(8),part_number:'PN-'+i,qty:1,price:100,total:100}))},async()=>({cost_total:count*80,gp_amount:count*20,gp_margin:20,line_financials:Array.from({length:count},()=>({cost_total:80}))}),'en');
  },count);
  assert.equal(page.context().pages().length,1,'No extra tab or popup');
  assert.equal(await page.locator('.kc-cost-sheet-print-frame').count(),1);
  const bounds=await page.locator('.kc-cost-sheet-print-frame').boundingBox();assert.ok(bounds.x+bounds.width<0,'Print document stays outside the visible viewport');
  const capture=await page.evaluate(()=>window.costCapture);assert.equal(capture.rows,count);assert.ok(capture.text.includes('DIRECT-ITEM-'+count));assert.ok(capture.text.includes('English customer unchanged'));assert.equal(capture.controls,0);assert.ok(capture.scale>0&&capture.scale<=1);assert.ok(capture.height<=capture.stage+1,'Landscape one-page scale is preserved');
  await page.evaluate(()=>{const f=document.querySelector('.kc-cost-sheet-print-frame');f.contentWindow.dispatchEvent(new f.contentWindow.Event('afterprint'));});
  assert.equal(await page.locator('.kc-cost-sheet-print-frame').count(),0,'Print/cancel removes the temporary document');assert.equal(await page.title(),'Original CRM');assert.equal(await page.locator('#print').evaluate(n=>n===document.activeElement),true);
 }
 await page.evaluate(async()=>{const {printCostSheet}=await import('./src/sales-order-print.mjs');try{await printCostSheet({code:'DENIED'},async()=>null,'en');throw Error('Expected denial');}catch(e){if(!e.message.includes('unavailable'))throw e;}});
 assert.equal(await page.locator('iframe').count(),0);
 await page.evaluate(async()=>{window.failPrint=true;const {printCostSheet}=await import('./src/sales-order-print.mjs');try{await printCostSheet({code:'ERROR',items:[]},async()=>({cost_total:0}),'en');throw Error('Expected print failure');}catch(e){if(e.message!=='Printer unavailable')throw e;}});
 assert.equal(await page.locator('iframe').count(),0);assert.equal(await page.title(),'Original CRM');assert.deepEqual(errors,[]);await page.close();console.log('PASS direct Cost Sheet printing without tabs',width);
}}finally{await browser.close();}
