import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app-C2ITSffc.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+';window.QAReact=KCNumbers.React;window.QACreateRoot=ak.createRoot;'});});
 await page.goto('http://127.0.0.1:4173/?demo=1');await page.waitForFunction(()=>window.QAReact);
 await page.evaluate(async()=>{
  const {createApprovalCenter}=await import('./src/approval-center.mjs');
  const stamp='2026-11-05T01:00:00Z',base={updated_at:stamp,owner_id:'seller'};
  const sources={leads:[{...base,id:'lead-a',code:'LD-A',company_name:'QA company'},{...base,id:'lead-b',code:'LD-B',company_name:'QA company'}],customers:[{...base,id:'customer-a',code:'C-A',name:'QA customer',credit_days:30,credit_limit:10000}],contracts:[{...base,id:'contract-a',code:'CON-A',name:'QA contract',product:'Service',start_date:'2026-01-01',end_date:'2026-12-31',value:100,sla_level:'Gold'}],crm_price_items:[{...base,id:'item-a',code:'ITEM-A',name:'QA item'}],crm_warehouses:[{id:'warehouse-a',code:'WH-A',name:'QA warehouse',active:true}],crm_sales_orders:[{...base,id:'so-a',code:'SO-A',quotation_id:'quotation-a',customer_name:'QA customer',status:'confirmed',total:500}]};
  let requests=[];window.templateCalls=[];window.qaProfile='seller';
  const response=data=>({abortSignal:()=>Promise.resolve({data}),then:resolve=>resolve({data})});
  const client={rpc:(name,args)=>{
   if(name==='crm_assignment_people')return response([{id:'new-owner',display_name:'New owner'}]);
   if(name==='crm_template_submit'){const type=args.p_type,s=(sources[Object.keys(sources).find(k=>sources[k].some(x=>x.id===args.p_target))]||[]).find(x=>x.id===args.p_target);requests.push({id:'request-'+type,request_type:type,target_id:args.p_target,requested_by:'seller',approver_ids:['reviewer'],current_step:1,status:'pending',reason:args.p_reason,payload:args.p_payload,before_snapshot:s,approval_policy_name:'QA '+type,amount:500,updated_at:stamp,created_at:stamp});window.templateCalls.push({name,args});return response(requests.at(-1));}
   if(name==='crm_template_decide'){const row=requests.find(r=>r.id===args.p_id);row.status=args.p_action==='approve'?'approved':args.p_action==='reject'?'rejected':'cancelled';window.templateCalls.push({name,args});return response(row);}
   return response([]);
  },from:table=>{let filters=[],lo=0,hi=199;const target={then:resolve=>{let rows=table==='crm_template_requests'?requests:table==='profiles'?[{id:'seller',display_name:'QA Seller'}]:(sources[table]||[]);for(const [op,k,v] of filters){if(op==='eq')rows=rows.filter(r=>r[k]===v);if(op==='neq')rows=rows.filter(r=>r[k]!==v);if(op==='contains')rows=rows.filter(r=>v.every(x=>r[k]?.includes(x)));}resolve({data:rows.slice(lo,hi+1)})}};let q;q=new Proxy(target,{get:(t,k)=>k==='then'?t.then:(...a)=>{if(['eq','neq','contains'].includes(k))filters.push([k,...a]);if(k==='range'){lo=a[0];hi=a[1];}return q;}});return q;}};
  const Center=createApprovalCenter({React:window.QAReact,client,useApp:()=>({profile:{id:window.qaProfile},demoMode:false,navigate:()=>{}}),useAccess:()=>({can:()=>true,loading:false}),records:{}}),host=document.createElement('div');host.id='qa-templates';host.style.cssText='position:fixed;inset:0;overflow:auto;background:white;z-index:99999';document.body.append(host);window.qaRender=()=>window.QACreateRoot(host).render(window.QAReact.createElement(Center,{lang:'th'}));window.qaRender();
 });
 const root=page.locator('#qa-templates'),kinds=['lead_merge','lead_reassignment','so_cancellation','credit_terms','contract_amendment','contract_renewal','inventory_adjustment','special_purchase'];
 for(const kind of kinds){
  await root.getByRole('button',{name:'+ สร้างคำขอจาก Template',exact:true}).click();const form=page.getByRole('dialog',{name:'สร้างคำขอจาก Template',exact:true});
  await form.getByLabel('Template การอนุมัติ',{exact:true}).selectOption(kind);
  const source=form.getByLabel('รายการต้นทาง',{exact:true});await page.waitForFunction(()=>document.querySelector('select[aria-label="รายการต้นทาง"]')?.options.length>1);await source.selectOption({index:1});
  if(kind==='lead_merge')await form.getByLabel('ลีดที่นำมารวม',{exact:true}).selectOption('lead-b');
  if(kind==='lead_reassignment')await form.getByLabel('ผู้รับผิดชอบใหม่',{exact:true}).selectOption('new-owner');
  if(kind==='credit_terms'){await form.getByLabel('เครดิต (วัน)',{exact:true}).fill('45');await form.getByLabel('วงเงินเครดิต (บาท)',{exact:true}).fill('200000');}
  if(kind==='contract_amendment')await form.getByLabel('มูลค่าสัญญา (บาท)',{exact:true}).fill('150');
  if(kind==='contract_renewal')await form.getByLabel('วันสิ้นสุด',{exact:true}).fill('2027-12-31');
  if(kind==='inventory_adjustment'){await form.getByLabel('คลังสินค้า',{exact:true}).selectOption('warehouse-a');await form.getByLabel('จำนวนที่ปรับเพิ่ม (+) / ลด (-)',{exact:true}).fill('5');}
  if(kind==='special_purchase'){await form.getByLabel('ผู้ขาย / Supplier',{exact:true}).fill('QA supplier');await form.getByLabel('รายการ',{exact:true}).fill('QA purchase');await form.getByLabel('ราคาต่อหน่วย',{exact:true}).fill('80');}
  await form.getByLabel('เหตุผล / รายละเอียดที่ขอ',{exact:true}).fill('QA request '+kind);await form.screenshot({path:`test-artifacts/template-${kind}-${width}.png`});
  assert.ok(await form.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'form overflow '+kind);
  await form.getByRole('button',{name:'ส่งขออนุมัติ',exact:true}).click();await form.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.templateCalls.at(-1).args.p_type),kind);
 }
 await root.getByRole('button',{name:'ส่งคำขอ',exact:true}).click();await root.locator('.kc-approval-card').first().waitFor();
 await root.locator('.kc-approval-card').first().getByRole('button',{name:'รายละเอียด',exact:true}).click();const detail=page.getByRole('dialog',{name:'คำขอตาม Template',exact:true});await detail.getByText('รายละเอียดที่ขออนุมัติ',{exact:true}).waitFor();await detail.getByRole('button',{name:'ถอนคำขอ',exact:true}).click();await detail.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.templateCalls.at(-1).args.p_action),'cancel');
 assert.deepEqual(errors,[]);console.log('PASS eight template forms and withdrawal',width);await page.close();
}}finally{await browser.close();}
