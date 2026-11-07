import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app-C2ITSffc.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+';window.QAReact=KCNumbers.React;window.QACreateRoot=ak.createRoot;'});});
 await page.goto('http://127.0.0.1:4173/?demo=1');await page.waitForFunction(()=>window.QAReact);
 await page.evaluate(async()=>{
  const {createSalesOrders}=await import('./src/sales-orders.mjs');const React=window.QAReact;
  const order={id:'qa-so',code:'SO-202611-000038',quotation_id:'qa-quote',quotation_code:'SQ-202611-000292',customer_id:'customer',customer_name:'Coretech Enterprise Co., Ltd.',owner_id:'seller',owner_name:'QA Seller',status:'confirmed',po_number:'PO2600092',po_file_key:'qa-po.pdf',delivery_details:{recipient_name:'K. Supaporn (Peemai)',recipient_phone:'086-3669613',shipping_address:'52/63 ซอยกรุงเทพกรีฑา 15 แขวงทับช้าง เขตสะพานสูง กรุงเทพฯ 10250'},po_date:'2026-11-03',currency:'THB',subtotal:200,discount:0,vat:14,total:214,items:[{name:'Original item\nHidden specifications',qty:2,unit:'Unit',part_number:'PN-QA',price:100,discount:0,total:200}],cost_sheet:{line_financials:[{cost_total:120}]},so_approval:{status:'rejected',review_note:'Please revise the cost'}};
  const records={native_sales_orders:[order],sales_order_events:[],activities:[],so_amendments:[]};
  const C=createSalesOrders({React,client:{},useApp:()=>({demoMode:true,profile:{id:'seller'},navigate:()=>{}}),useAccess:()=>({can:()=>true}),records});
  const host=document.createElement('div');document.body.append(host);window.QACreateRoot(host).render(React.createElement(C,{lang:'en',initialOrderId:'qa-so',onClose:()=>{window.didClose=true},onQuotation:id=>window.openedQuote=id}));
 });
 const root=page.locator('.kc-so-detail-layout');await root.waitFor();await root.locator('.kc-so-amendment-details>summary').click();await root.getByText('Request edit approval',{exact:true}).waitFor();
 const products=root.locator('#so-items');assert.equal(await products.locator('tbody tr').count(),1);assert.equal(await products.locator('.kc-so-first-line').innerText(),'Original item');assert.equal(await products.getByText('Hidden specifications',{exact:true}).count(),0);assert.equal(await products.locator('[data-field=part_number]').innerText(),'PN-QA');
 await products.locator('.kc-so-summary-gp strong').filter({hasText:'80.00'}).waitFor();assert.equal(await products.locator('.kc-so-summary-margin strong').innerText(),'40.00%');assert.match(await products.locator('.kc-so-summary-cost strong').innerText(),/120\.00/);const cards=await products.locator('.kc-so-financial-summary article').evaluateAll(ns=>ns.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));assert.equal(cards.length,4);assert.ok(cards.every(c=>Math.abs(c.w-cards[0].w)<1&&Math.abs(c.h-cards[0].h)<1));
 const support=root.locator('.kc-so-support-grid'),poCard=support.locator('#so-documents-card'),customerCard=support.locator('#so-customer-card');
 assert.equal(await poCard.locator('.kc-so-card-header').getByRole('button',{name:'Open PO attachment',exact:true}).count(),1);
 assert.equal(await customerCard.locator('.kc-so-card-header').getByRole('button',{name:/360/}).count(),1);
 assert.equal(await support.locator('.kc-so-support-body button').count(),0);
 const supportBoxes=await support.locator('.kc-so-support-card').evaluateAll(ns=>ns.map(n=>{const c=n.getBoundingClientRect(),a=n.querySelector('.kc-so-card-actions').getBoundingClientRect();return {x:c.x,y:c.y,w:c.width,h:c.height,right:c.right-a.right,buttonTop:a.top-c.top};}));
 assert.ok(supportBoxes.every(b=>b.right>=14&&b.right<=22),'Actions align to the right card padding');
 if(width>760){assert.ok(Math.abs(supportBoxes[0].h-supportBoxes[1].h)<1);assert.ok(Math.abs(supportBoxes[0].y-supportBoxes[1].y)<1);assert.ok(supportBoxes.every(b=>b.h<240&&b.buttonTop<=18));}
 assert.ok(await support.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Support cards fit viewport');
 await poCard.getByRole('button',{name:'Open PO attachment',exact:true}).click();await page.getByRole('alert').filter({hasText:'Demo mode: no real attachment'}).waitFor();
 assert.equal(await root.getByRole('button',{name:'Print SO / PDF',exact:true}).count(),1);assert.equal(await root.getByRole('button',{name:'Print Cost Sheet',exact:true}).count(),1);
 assert.ok(await root.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No layout overflow');
 if(width>760){const sizes=await root.locator('#so-items,.kc-so-metric-grid').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));assert.ok(Math.abs(sizes[0]-sizes[1])<1,'Items use full content width');}
 await root.getByRole('button',{name:'Open quotation',exact:true}).click();assert.equal(await page.evaluate(()=>window.openedQuote),'qa-quote');
 assert.match(await root.locator('#so-approval-card').innerText(),/Rejected/);assert.match(await root.locator('#so-items').innerText(),/Original item/);
 await root.getByRole('button',{name:'SO edit requests',exact:true}).click();
 await root.locator('.kc-so-amendment-details').evaluate(el=>el.open=false);await root.locator('.kc-so-hero').scrollIntoViewIfNeeded();
 await page.screenshot({path:`test-artifacts/so-detail-cards-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await page.close();console.log('PASS SO cards',width);
}}finally{await browser.close();}
