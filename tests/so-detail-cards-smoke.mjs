import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app-C2ITSffc.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+';window.QAReact=KCNumbers.React;window.QACreateRoot=ak.createRoot;'});});
 await page.goto('http://127.0.0.1:4173/?demo=1');await page.waitForFunction(()=>window.QAReact);
 await page.evaluate(async()=>{
  const {createSalesOrders}=await import('./src/sales-orders.mjs');const React=window.QAReact;
  const order={id:'qa-so',code:'SO-202611-000038',quotation_id:'qa-quote',quotation_code:'SQ-202611-000292',customer_id:'customer',customer_name:'Coretech Enterprise Co., Ltd.',owner_id:'seller',owner_name:'QA Seller',status:'confirmed',po_number:'PO2600092',po_date:'2026-11-03',currency:'THB',subtotal:200,discount:0,vat:14,total:214,items:[{name:'Original item',qty:2,price:100,discount:0,total:200}],so_approval:{status:'rejected',review_note:'Please revise the cost'}};
  const records={native_sales_orders:[order],sales_order_events:[],activities:[],so_amendments:[]};
  const C=createSalesOrders({React,client:{},useApp:()=>({demoMode:true,profile:{id:'seller'},navigate:()=>{}}),useAccess:()=>({can:()=>true}),records});
  const host=document.createElement('div');document.body.append(host);window.QACreateRoot(host).render(React.createElement(C,{lang:'en',initialOrderId:'qa-so',onClose:()=>{window.didClose=true},onQuotation:id=>window.openedQuote=id}));
 });
 const root=page.locator('.kc-so-detail-layout');await root.waitFor();await root.getByText('Request SO amendment',{exact:true}).waitFor();
 assert.equal(await root.locator('.kc-so-card').count(),6);
 const boxes=await root.locator('.kc-so-card').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}));
 if(width>760){assert.ok(Math.abs(boxes[0].width-boxes[1].width)<1);for(let i=0;i<6;i+=2){assert.ok(Math.abs(boxes[i].y-boxes[i+1].y)<1);assert.ok(Math.abs(boxes[i].height-boxes[i+1].height)<1);}}else{assert.ok(boxes.every(b=>Math.abs(b.x-boxes[0].x)<1));assert.ok(await root.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No mobile overflow');}
 await root.getByRole('button',{name:'Open quotation',exact:true}).click();assert.equal(await page.evaluate(()=>window.openedQuote),'qa-quote');
 assert.match(await root.locator('#so-approval-card').innerText(),/Rejected/);assert.match(await root.locator('#so-items').innerText(),/Original item/);
 await root.getByRole('button',{name:'Edit SO / Cost Sheet',exact:true}).click();
 await page.screenshot({path:`test-artifacts/so-detail-cards-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await page.close();console.log('PASS SO cards',width);
}}finally{await browser.close();}
