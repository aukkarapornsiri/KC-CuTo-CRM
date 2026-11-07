import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{for(const width of [1440,900,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app-C2ITSffc.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+';window.QAReact=KCNumbers.React;window.QACreateRoot=ak.createRoot;'});});
 await page.goto('http://127.0.0.1:4173/?demo=1');await page.waitForFunction(()=>window.QAReact);
 await page.evaluate(async()=>{
  const {createSalesOrders}=await import('./src/sales-orders.mjs');const React=window.QAReact;
  const order={id:'qa-so',code:'SO-202611-000038',quotation_id:'qa-quote',quotation_code:'SQ-202611-000292',customer_id:'customer',customer_name:'Coretech Enterprise Co., Ltd.',owner_id:'seller',owner_name:'QA Seller',status:'confirmed',po_number:'PO2600092',po_date:'2026-11-03',currency:'THB',subtotal:200,discount:0,vat:14,total:214,items:[{name:'Original item\nHidden specifications',qty:2,unit:'Unit',part_number:'PN-QA',price:100,discount:0,total:200}],cost_sheet:{line_financials:[{cost_total:120}]},so_approval:{status:'rejected',review_note:'Please revise the cost'}};
  const records={native_sales_orders:[order],sales_order_events:[],activities:[],so_amendments:[]};
  const C=createSalesOrders({React,client:{},useApp:()=>({demoMode:true,profile:{id:'seller'},navigate:()=>{}}),useAccess:()=>({can:()=>true}),records});
  const host=document.createElement('div');document.body.append(host);window.QACreateRoot(host).render(React.createElement(C,{lang:'en',onClose:()=>{window.didClose=true},onQuotation:id=>window.openedQuote=id}));
 });

 const header=page.locator('.crm-record-popup:has(.crm-so)>.crm-record-popup-head');await header.waitFor();assert.equal(await header.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(33, 100, 217)');assert.equal(await header.locator('h2').evaluate(n=>getComputedStyle(n).color),'rgb(255, 255, 255)');
 const summary=page.getByRole('region',{name:'Filtered sales and profit summary'});await summary.waitFor();await summary.locator('.crm-so-financial-cost strong').filter({hasText:'120.00'}).waitFor();assert.match(await summary.locator('.crm-so-financial-sales strong').innerText(),/200[.]00/);assert.match(await summary.locator('.crm-so-financial-gp strong').innerText(),/80[.]00/);assert.equal(await summary.locator('.crm-so-financial-margin strong').innerText(),'40.00%');const financialBoxes=await summary.locator('article').evaluateAll(ns=>ns.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));assert.equal(financialBoxes.length,4);assert.ok(financialBoxes.every(b=>Math.abs(b.w-financialBoxes[0].w)<1&&Math.abs(b.h-financialBoxes[0].h)<1));assert.ok(financialBoxes[0].h<=110);
 const panel=page.getByRole('region',{name:'Sales order filters',exact:true});await panel.waitFor();
 const fields=panel.locator('.crm-field');assert.equal(await fields.count(),5);
 const boxes=await fields.evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect(),c=getComputedStyle(n),input=n.querySelector('input,select');return {x:r.x,y:r.y,w:r.width,h:r.height,border:c.borderTopWidth,inner:getComputedStyle(input).borderTopWidth};}));
 assert.ok(boxes.every(b=>Math.abs(b.w-boxes[0].w)<1&&Math.abs(b.h-boxes[0].h)<1));assert.ok(boxes.every(b=>b.border==='1px'&&b.inner==='0px'));
 if(width>760)assert.ok(boxes.every(b=>Math.abs(b.y-boxes[0].y)<1));
 for(const control of await panel.locator('input,select').all()){await control.focus();const focused=await control.evaluate(n=>({inner:getComputedStyle(n).outlineWidth,border:getComputedStyle(n).borderTopWidth,outer:getComputedStyle(n.closest('.crm-field')).outlineWidth,offset:getComputedStyle(n.closest('.crm-field')).outlineOffset}));assert.deepEqual(focused,{inner:'0px',border:'0px',outer:'2px',offset:'-2px'});}
 const reset=panel.getByRole('button',{name:'Reset filters',exact:true});const rb=await reset.boundingBox(),pb=await panel.boundingBox();assert.ok(rb.x+rb.width>pb.x+pb.width-2);assert.ok(rb.y<boxes[0].y);assert.equal(await reset.locator('svg').count(),1);
 await panel.getByRole('textbox').fill('no-matching-order');await panel.getByLabel('SO status',{exact:true}).selectOption('confirmed');await panel.getByLabel('Approval',{exact:true}).selectOption('rejected');await panel.getByLabel('Owner',{exact:true}).selectOption('seller');await panel.getByLabel('Delivery date',{exact:true}).selectOption('overdue');await reset.click();
 assert.equal(await panel.getByRole('textbox').inputValue(),'');await summary.locator('.crm-so-financial-cost strong').filter({hasText:'120.00'}).waitFor();for(const select of await panel.locator('select').all())assert.equal(await select.inputValue(),'');
 assert.ok(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1));await page.screenshot({path:`test-artifacts/so-filters-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await page.close();console.log('PASS SO equal single-frame filters and reset',width);
}}finally{await browser.close();}
