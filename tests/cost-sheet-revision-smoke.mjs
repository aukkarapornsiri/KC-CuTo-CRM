import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app-C2ITSffc.js*',async route=>{const response=await route.fetch();const body=await response.text();await route.fulfill({response,body:body+';window.QAReact=KCNumbers.React;window.QACreateRoot=ak.createRoot;'});});
 await page.goto('http://127.0.0.1:4173/?demo=1');await page.waitForFunction(()=>window.QAReact);
 await page.evaluate(async()=>{
  const React=window.QAReact,createRoot=window.QACreateRoot;
  const {createSOAmendments}=await import('./src/so-amendments.mjs');
  const request={id:'qa-request',status:'approved',requested_by:'seller',reason:'Correct cost and add item'};
  const order={id:'qa-so',code:'SO-QA',owner_id:'seller',created_by:'seller',status:'confirmed',updated_at:'2026-11-03T00:00:00Z',po_number:'PO-QA',po_date:'2026-11-01',currency:'THB',subtotal:200,discount:0,vat:14,withholding_tax:0,items:[{name:'Original',qty:2,price:100,discount:0,total:200}]};
  const catalog=[{id:'new-item',status:'active',code:'NEW',name:'Additional service',price:50,cost:20,unit:'Unit'}];
  const client={rpc:async(name,args)=>{if(name==='crm_save_so_amendment'){window.revisionPayload=args;return {data:{id:order.id}};}return {data:name==='crm_price_catalog'?catalog:[]};},from:table=>{const q=new Proxy({then:resolve=>resolve({data:table==='crm_so_amendments'?[request]:{line_financials:[{cost_total:120}]}})},{get:(t,k)=>k==='then'?t.then:()=>q});return q;}};
  const host=document.createElement('div');host.id='qa-cost-root';host.style.cssText='position:fixed;inset:0;overflow:auto;background:white;z-index:99999;padding:16px';document.body.append(host);
  const C=createSOAmendments({React,client});createRoot(host).render(React.createElement(C,{order,lang:'en',profile:{id:'seller'},can:()=>true,demoMode:false,onSaved:()=>{},records:{}}));
 });
 const root=page.locator('#qa-cost-root');await root.getByRole('button',{name:'Edit SO / Cost Sheet',exact:true}).click();
 const cost=root.getByRole('spinbutton',{name:'Unit cost (excluding VAT) 1',exact:true});await cost.waitFor();assert.equal(await cost.inputValue(),'60');await cost.fill('75');
 await root.getByRole('searchbox',{name:'Search products to add',exact:true}).fill('Additional');await root.getByRole('button',{name:'NEW · Additional service',exact:true}).click();assert.equal(await root.getByRole('spinbutton',{name:'Unit cost (excluding VAT) 2',exact:true}).inputValue(),'20');
 await root.screenshot({path:`test-artifacts/cost-revision-${width}.png`});await root.getByRole('button',{name:'Save revision and request SO approval',exact:true}).click();await page.waitForFunction(()=>window.revisionPayload);
 const payload=await page.evaluate(()=>window.revisionPayload);assert.equal(payload.p_request_id,'qa-request');assert.equal(payload.p_patch.items[0].cost,'75');assert.equal(payload.p_patch.items.length,2);assert.equal(payload.p_patch.items[1].cost,20);assert.deepEqual(errors,[]);await page.close();console.log('PASS Cost Sheet revision',width);
}}finally{await browser.close();}
