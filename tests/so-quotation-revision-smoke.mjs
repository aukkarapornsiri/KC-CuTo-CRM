import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app-C2ITSffc.js*',async route=>{const response=await route.fetch();const body=await response.text();await route.fulfill({response,body:body+';window.QAReact=KCNumbers.React;window.QACreateRoot=ak.createRoot;'});});
 await page.goto('http://127.0.0.1:4173/?demo=1');await page.waitForFunction(()=>window.QAReact);
 await page.evaluate(async()=>{
  const React=window.QAReact,createRoot=window.QACreateRoot;
  const {createSOAmendments,createSOAmendmentReviewShortcut}=await import('./src/so-amendments.mjs');
  const {createQuotationDocumentComponents,DEFAULT_QUOTATION_TEMPLATE}=await import('./src/quotation-document.mjs');const {demoSharedQuotationTemplate}=await import('./src/quotation-template-save.mjs');demoSharedQuotationTemplate.current={...DEFAULT_QUOTATION_TEMPLATE,id:'template',company_logo_url:'',logo_url:'',logo_storage_key:''};const {QuotationDialog}=createQuotationDocumentComponents({React,client:{},useApp:()=>({demoMode:true,profile:{id:'seller'}})});
  const request={id:'qa-request',status:'approved',requested_by:'seller',reason:'Correct cost and add item'};
  const order={id:'qa-so',code:'SO-QA',quotation_id:'qa-quote',quotation_kind:'standard',owner_id:'seller',created_by:'seller',status:'confirmed',updated_at:'2026-11-03T00:00:00Z',po_number:'PO-QA',po_date:'2026-11-01',currency:'THB',subtotal:200,discount:0,vat:14,withholding_tax:0,items:[{name:'Original',qty:2,price:100,discount:0,total:200}]};
  const quote={id:'qa-quote',code:'SQ-QA',quotation_kind:'standard',issue_date:'2026-11-01',valid_until:'2026-12-01',owner_id:'seller',owner_name:'QA Seller',customer_id:'customer',customer_name:'QA customer',items:order.items};
  const catalog=[{id:'new-item',status:'active',code:'NEW',name:'Additional service',price:50,cost:20,unit:'Unit'}];
  const client={rpc:async(name,args)=>{if(name==='crm_save_so_amendment'){window.revisionPayload=args;return {data:{id:order.id}};}return {data:name==='crm_price_catalog'?catalog:[]};},from:table=>{let columns='*';const q=new Proxy({then:resolve=>resolve({data:table==='crm_so_amendments'?[columns==='*'?request:Object.fromEntries(columns.split(',').map(k=>[k,request[k]]))]:table==='quotations'?quote:{line_financials:[{cost_total:120}]}})},{get:(t,k)=>k==='then'?t.then:(value)=>{if(k==='select')columns=value;return q;}});return q;}};
  const host=document.createElement('div');host.id='qa-cost-root';host.style.cssText='position:fixed;inset:0;overflow:auto;background:white;z-index:99999;padding:16px';document.body.append(host);
  const C=createSOAmendments({React,client,QuotationDialog}),Shortcut=createSOAmendmentReviewShortcut({React,client});function Flow(){const [open,Open]=React.useState(false);return open?React.createElement(C,{order,lang:'en',profile:{id:'seller'},can:()=>true,canFinancial:true,demoMode:false,onSaved:()=>{},records:{}}):React.createElement(Shortcut,{quotationId:'qa-quote',profileId:'seller',lang:'en',canEdit:true,canApprove:false,demoMode:false,onEdit:id=>{if(id!==order.id)throw Error('Wrong SO');Open(true);}});}request.sales_order_id=order.id;createRoot(host).render(React.createElement(Flow));
 });
 const root=page.locator('#qa-cost-root');await root.getByRole('button',{name:'Edit SO / Cost Sheet',exact:true}).click();await root.getByRole('button',{name:'Amend an existing SO',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Quotation form',exact:true});await dialog.waitFor();
 assert.equal(await dialog.getByRole('textbox',{name:'Document no.',exact:true}).inputValue(),'SQ-QA');
 await assert.rejects(()=>dialog.getByRole('textbox',{name:'Tax ID',exact:true}).fill('other',{timeout:500}));
 const cost=dialog.getByRole('spinbutton',{name:'revision cost 1',exact:true});assert.equal(await cost.inputValue(),'60');await cost.fill('75');
 await dialog.getByRole('button',{name:'+ Add line',exact:true}).click();await dialog.getByRole('combobox',{name:'name 2',exact:true}).fill('Additional');await dialog.getByRole('option',{name:/Additional service/}).click();
 assert.equal(await dialog.getByRole('spinbutton',{name:'revision cost 2',exact:true}).inputValue(),'20');
 await dialog.screenshot({path:`test-artifacts/so-quotation-revision-${width}.png`});await dialog.getByRole('button',{name:'Save revision and request SO approval',exact:true}).click();await page.waitForFunction(()=>window.revisionPayload);
 const payload=await page.evaluate(()=>window.revisionPayload);assert.equal(payload.p_request_id,'qa-request');assert.equal(payload.p_patch.items[0].cost,75);assert.equal(payload.p_patch.items[0].original_index,0);assert.equal(payload.p_patch.items.length,2);assert.equal(payload.p_patch.items[1].cost,20);assert.equal(payload.p_patch.id,undefined);assert.deepEqual(errors,[]);await page.close();console.log('PASS SO quotation revision',width);
}}finally{await browser.close();}
